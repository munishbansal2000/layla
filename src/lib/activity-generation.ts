// ============================================
// ACTIVITY GENERATION SERVICE
// ============================================
// Uses AI to generate activities for destinations based on user preferences
// Implements the design from docs/ACTIVITY_SUGGESTION_ALGORITHM.md

import OpenAI from "openai";
import {
  CoreActivity,
  RestaurantActivity,
  TripMode,
  TravelerComposition,
  UserExperienceSettings,
  ActivityCategory,
  TimeOfDay,
  MealType,
  DietaryOption,
  DayTemplate,
  GenerateActivitiesRequest,
  GenerateActivitiesResponse,
  ScoredActivity,
  WeatherForecast,
} from "@/types/activity-suggestion";
import { ActivityScoringEngine, createScoringEngine } from "./scoring-engine";

// ============================================
// UTILITIES
// ============================================

/**
 * Generate a unique ID (simple implementation)
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

// ============================================
// OPENAI CLIENT
// ============================================

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// ============================================
// PROMPT TEMPLATES
// ============================================

/**
 * Base system prompt for activity generation
 */
const ACTIVITY_GENERATION_SYSTEM_PROMPT = `You are an expert travel activity curator with deep knowledge of destinations worldwide.

Your job is to generate a list of activities for a destination that match the traveler's preferences.

CRITICAL RULES:
1. Generate REAL, SPECIFIC activities - use actual venue names, addresses, and neighborhoods
2. Do NOT hallucinate - only suggest places that actually exist
3. Include a mix of FREE and PAID activities (prioritize free/low-cost options)
4. Consider the TIME OF YEAR for seasonal appropriateness
5. Include LOCAL TIPS that only residents would know
6. Provide REALISTIC duration estimates based on typical visitor behavior
7. Group activities by NEIGHBORHOOD to minimize transit time

ACTIVITY CATEGORIES TO INCLUDE:
- Landmarks & monuments (free to visit exterior)
- Temples, shrines, churches (often free)
- Parks & gardens (usually free)
- Museums (paid, but often have free days)
- Markets & shopping streets (free to browse)
- Neighborhoods to explore (free)
- Viewpoints & photo spots (often free)
- Cultural experiences
- Local food specialties to try
- Hidden gems off the tourist path

FOR EACH ACTIVITY, YOU MUST PROVIDE:
- name: Exact venue name
- description: 2-3 sentences with specific details
- category: One of the valid categories
- neighborhood: Specific area/district
- bestTimeOfDay: When to visit (morning, afternoon, evening, etc.)
- recommendedDuration: In minutes (be realistic!)
- isFree: true/false
- estimatedCost: If not free, cost per person in local currency
- familyFriendly: true/false
- kidAges: If family-friendly, recommended age range
- romanticRating: 0-1 score for couples
- soloFriendly: true/false
- isOutdoor: true/false
- weatherSensitive: true/false (can it be done in rain?)
- tags: Array of descriptive tags
- localTip: Insider knowledge

RESPOND WITH VALID JSON ONLY.`;

/**
 * Get trip mode-specific instructions
 */
function getTripModeInstructions(mode: TripMode, travelers: TravelerComposition): string {
  switch (mode) {
    case "family":
      const ages = travelers.childrenAges?.join(", ") || "various";
      return `
FAMILY TRIP FOCUS (${travelers.adults} adults, ${travelers.children} children ages ${ages}):
- Prioritize KID-FRIENDLY activities with interactive elements
- Include playgrounds, zoos, aquariums, hands-on museums
- Consider stroller accessibility
- Avoid activities that require long periods of standing/waiting
- Include snack/rest spots near activities
- Plan for shorter attention spans (60-90 min max per activity)
- Include at least 2-3 FREE outdoor activities per day
- Avoid adult-only venues entirely`;

    case "couples":
      return `
COUPLES TRIP FOCUS:
- Include ROMANTIC spots with scenic views
- Suggest intimate restaurants and cafes
- Include sunset/sunrise viewpoints
- Mix cultural experiences with relaxing activities
- Include photo-worthy locations
- Suggest experiences that can be shared (cooking classes, wine tasting)
- Avoid overly crowded tourist traps
- Include some "splurge-worthy" special experiences`;

    case "honeymoon":
      return `
HONEYMOON FOCUS:
- Prioritize LUXURY and ROMANTIC experiences
- Include private/exclusive options where possible
- Sunset views are essential
- Suggest the most romantic restaurants
- Include spa/wellness options
- Avoid crowded, hectic activities
- Quality over quantity - fewer activities, more special
- Include "once in a lifetime" experiences
- Consider late morning starts (10am+)`;

    case "solo":
      return `
SOLO TRAVELER FOCUS:
- Prioritize SAFE neighborhoods, especially for evening activities
- Include social activities (walking tours, cooking classes) to meet people
- Suggest restaurants with counter seating
- Include cafes good for working/reading
- Self-guided walking routes
- Activities that don't require a partner
- Budget-friendly options
- Local experiences where solo travelers are welcome`;

    case "friends":
      return `
FRIENDS GROUP FOCUS:
- Include group-friendly activities (karaoke, arcades, escape rooms)
- Suggest restaurants with shareable dishes
- Include nightlife options
- Photo opportunities for group shots
- Adventure activities
- Food tours and bar hopping routes
- Lively atmospheres preferred
- Activities that encourage interaction`;

    case "multi-generational":
      return `
MULTI-GENERATIONAL FOCUS (kids to grandparents):
- All activities must be ACCESSIBLE (elevators, minimal stairs)
- Include frequent rest spots and seating
- Avoid strenuous activities
- Activities interesting for ALL ages
- Consider senior mobility limitations
- Kid-friendly but also engaging for adults
- Slower pace with longer breaks
- Include cultural/historical activities (grandparents often appreciate)`;

    case "girls-trip":
      return `
GIRLS TRIP FOCUS:
- Include trendy, Instagram-worthy spots
- Spa and wellness activities
- Brunch spots
- Shopping districts
- Photo-worthy cafes and restaurants
- Rooftop bars
- Afternoon tea experiences
- Night markets and evening activities`;

    case "guys-trip":
      return `
GUYS TRIP FOCUS:
- Include sports-related activities if relevant
- Local craft beer and izakaya spots
- Adventure activities
- Arcade/gaming options
- Local food challenges
- Nightlife recommendations
- Relaxed, low-key spots`;

    case "babymoon":
      return `
BABYMOON FOCUS:
- Prioritize RELAXING, low-exertion activities
- Spa with pregnancy-safe treatments
- Scenic, leisurely walks
- Comfortable restaurant seating
- Avoid extreme temperatures
- No adventure/strenuous activities
- Romantic but accessible
- Consider food safety for pregnancy`;

    default:
      return "";
  }
}

/**
 * Get seasonal/weather instructions
 */
function getSeasonalInstructions(destination: string, month: number): string {
  const monthName = new Date(2024, month - 1, 1).toLocaleString("en", { month: "long" });

  return `
SEASONAL CONTEXT:
- Month of travel: ${monthName}
- Consider typical weather for ${destination} in ${monthName}
- Suggest seasonal events/festivals if applicable
- Balance indoor/outdoor activities based on expected weather
- Note any seasonal closures or reduced hours
- Mention if any activities are especially beautiful in this season`;
}

/**
 * Get dietary restriction instructions
 */
function getDietaryInstructions(dietary: DietaryOption[]): string {
  if (dietary.length === 0) return "";

  return `
DIETARY REQUIREMENTS:
The travelers have these dietary restrictions: ${dietary.join(", ")}
- When suggesting food-related activities, ensure options exist for these diets
- Note restaurants known to accommodate these requirements
- For cooking classes, mention if they can accommodate restrictions`;
}

// ============================================
// ACTIVITY GENERATION PROMPTS
// ============================================

interface ActivityGenerationPrompt {
  destination: string;
  dates: { start: string; end: string };
  travelers: TravelerComposition;
  settings: Partial<UserExperienceSettings>;
  existingActivities?: string[];
}

function buildActivityGenerationPrompt(params: ActivityGenerationPrompt): string {
  const { destination, dates, travelers, settings, existingActivities } = params;

  const startDate = new Date(dates.start);
  const endDate = new Date(dates.end);
  const numDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;
  const month = startDate.getMonth() + 1;

  const tripMode = settings.tripMode || travelers.mode || "couples";
  const dietary = settings.dietary || [];
  const budget = settings.budgetMode || "moderate";
  const pace = settings.pace?.mode || "normal";

  // Calculate how many activities we need
  const activitiesPerDay = pace === "relaxed" ? 3 : pace === "normal" ? 4 : 6;
  const totalActivities = Math.min(numDays * activitiesPerDay + 5, 25); // Extra for variety

  let prompt = `Generate ${totalActivities} activities for ${destination}.

TRIP DETAILS:
- Duration: ${numDays} days (${dates.start} to ${dates.end})
- Travelers: ${travelers.adults} adults${travelers.children ? `, ${travelers.children} children (ages ${travelers.childrenAges?.join(", ") || "not specified"})` : ""}
- Trip mode: ${tripMode}
- Budget: ${budget}
- Pace: ${pace}

${getTripModeInstructions(tripMode, travelers)}
${getSeasonalInstructions(destination, month)}
${getDietaryInstructions(dietary)}

BUDGET GUIDANCE:
- ${budget === "free-first" ? "PRIORITIZE FREE activities. Only include paid options if truly exceptional." : ""}
- ${budget === "moderate" ? "Balance free and paid activities. Average $20-50 per paid activity." : ""}
- ${budget === "splurge-once-a-day" ? "Include premium experiences but also free options for balance." : ""}

${existingActivities?.length ? `ALREADY SELECTED (do not duplicate): ${existingActivities.join(", ")}` : ""}

RESPONSE FORMAT:
{
  "activities": [
    {
      "name": "string",
      "description": "string (2-3 sentences with specific details)",
      "category": "temple|shrine|museum|park|garden|landmark|neighborhood|market|shopping|entertainment|nature|viewpoint|cultural-experience|food-tour|walking-tour|day-trip|nightlife|relaxation|adventure|family-activity|photo-spot",
      "neighborhood": "string",
      "address": "string (approximate street address)",
      "bestTimeOfDay": ["morning"|"afternoon"|"evening"|"night"|"early-morning"],
      "recommendedDuration": number (minutes),
      "isFree": boolean,
      "estimatedCost": { "amount": number, "currency": "string" } | null,
      "familyFriendly": boolean,
      "kidAges": { "min": number, "max": number } | null,
      "romanticRating": number (0-1),
      "soloFriendly": boolean,
      "groupFriendly": boolean,
      "isOutdoor": boolean,
      "weatherSensitive": boolean,
      "rating": number (1-5),
      "tags": ["string"],
      "localTip": "string",
      "requiresBooking": boolean,
      "bookingLeadTime": number | null (hours in advance)
    }
  ]
}`;

  return prompt;
}

// ============================================
// RESTAURANT GENERATION PROMPTS
// ============================================

function buildRestaurantGenerationPrompt(params: ActivityGenerationPrompt): string {
  const { destination, dates, travelers, settings } = params;

  const startDate = new Date(dates.start);
  const endDate = new Date(dates.end);
  const numDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const tripMode = settings.tripMode || travelers.mode || "couples";
  const dietary = settings.dietary || [];
  const budget = settings.budgetMode || "moderate";

  // Need restaurants for each meal slot
  const restaurantsNeeded = numDays * 3 + 5; // breakfast, lunch, dinner + extras

  let prompt = `Generate ${restaurantsNeeded} restaurant recommendations for ${destination}.

TRIP DETAILS:
- Duration: ${numDays} days
- Travelers: ${travelers.adults} adults${travelers.children ? `, ${travelers.children} children` : ""}
- Trip mode: ${tripMode}
- Budget: ${budget}

DIETARY REQUIREMENTS:
${dietary.length > 0 ? dietary.join(", ") : "No specific restrictions"}

INCLUDE A MIX OF:
- Breakfast spots (quick and sit-down)
- Lunch options (casual to mid-range)
- Dinner restaurants (range of price levels)
- Cafes for snacks/coffee
- Late-night options if relevant

${tripMode === "family" ? `
FAMILY REQUIREMENTS:
- Must have kids' menu or kid-friendly options
- High chairs available
- Not too noisy/chaotic
- Quick service options for fussy kids` : ""}

${tripMode === "couples" || tripMode === "honeymoon" ? `
ROMANTIC DINING:
- Include intimate, romantic restaurants
- Sunset dinner spots
- Fine dining options
- Cozy wine bars/cocktail spots` : ""}

RESPONSE FORMAT:
{
  "restaurants": [
    {
      "name": "string",
      "description": "string",
      "cuisineTypes": ["string"],
      "neighborhood": "string",
      "address": "string",
      "mealType": ["breakfast"|"brunch"|"lunch"|"dinner"|"snack"|"cafe"],
      "priceLevel": 1|2|3|4,
      "estimatedCost": { "amount": number, "currency": "string" },
      "dietaryOptions": ["vegetarian"|"vegan"|"gluten-free"|"halal"|"kosher"|"no-pork"|"no-beef"],
      "reservationRequired": boolean,
      "reservationUrl": "string" | null,
      "hasKidsMenu": boolean,
      "noiseLevel": "quiet"|"moderate"|"loud",
      "romanticRating": number (0-1),
      "bestTimeOfDay": ["morning"|"afternoon"|"evening"|"night"],
      "rating": number (1-5),
      "tags": ["string"],
      "localTip": "string"
    }
  ]
}`;

  return prompt;
}

// ============================================
// DAY TEMPLATE GENERATION
// ============================================

function buildDayTemplatePrompt(
  destination: string,
  tripMode: TripMode
): string {
  return `Generate 5 day template options for ${destination} suitable for ${tripMode} travelers.

Each template should be a themed full-day itinerary that users can select as a starting point.

TEMPLATE TYPES TO INCLUDE:
1. Classic must-sees (popular attractions)
2. Local hidden gems (off the beaten path)
3. Food-focused day (culinary experiences)
4. Nature/outdoors day (parks, gardens, nature)
5. Cultural immersion (temples, traditions, local life)

RESPONSE FORMAT:
{
  "templates": [
    {
      "name": "string (e.g., 'Classic Kyoto Temples')",
      "description": "string",
      "duration": "full-day"|"half-day",
      "slots": [
        {
          "time": "09:00",
          "activityType": "activity"|"meal"|"commute",
          "activityName": "string",
          "activityCategory": "string",
          "duration": number (minutes),
          "notes": "string"
        }
      ],
      "features": ["string"],
      "tags": ["string"],
      "bestFor": ["family"|"couples"|"solo"|"friends"]
    }
  ]
}`;
}

// ============================================
// AI GENERATION FUNCTIONS
// ============================================

interface AIGeneratedActivity {
  name: string;
  description: string;
  category: string;
  neighborhood: string;
  address?: string;
  bestTimeOfDay: string[];
  recommendedDuration: number;
  isFree: boolean;
  estimatedCost?: { amount: number; currency: string };
  familyFriendly: boolean;
  kidAges?: { min: number; max: number };
  romanticRating: number;
  soloFriendly: boolean;
  groupFriendly: boolean;
  isOutdoor: boolean;
  weatherSensitive: boolean;
  rating?: number;
  tags: string[];
  localTip?: string;
  requiresBooking: boolean;
  bookingLeadTime?: number;
}

interface AIGeneratedRestaurant {
  name: string;
  description: string;
  cuisineTypes: string[];
  neighborhood: string;
  address?: string;
  mealType: string[];
  priceLevel: 1 | 2 | 3 | 4;
  estimatedCost?: { amount: number; currency: string };
  dietaryOptions: string[];
  reservationRequired: boolean;
  reservationUrl?: string;
  hasKidsMenu: boolean;
  noiseLevel?: "quiet" | "moderate" | "loud";
  romanticRating: number;
  bestTimeOfDay: string[];
  rating?: number;
  tags: string[];
  localTip?: string;
}

/**
 * Generate activities using OpenAI
 */
async function generateActivitiesWithAI(
  prompt: string
): Promise<AIGeneratedActivity[]> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: ACTIVITY_GENERATION_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 4000,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Failed to generate activities");
  }

  try {
    const parsed = JSON.parse(content);
    return parsed.activities || [];
  } catch {
    console.error("Failed to parse AI response:", content);
    throw new Error("Failed to parse activity response");
  }
}

/**
 * Generate restaurants using OpenAI
 */
async function generateRestaurantsWithAI(
  prompt: string
): Promise<AIGeneratedRestaurant[]> {
  const response = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: ACTIVITY_GENERATION_SYSTEM_PROMPT },
      { role: "user", content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 4000,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Failed to generate restaurants");
  }

  try {
    const parsed = JSON.parse(content);
    return parsed.restaurants || [];
  } catch {
    console.error("Failed to parse AI response:", content);
    throw new Error("Failed to parse restaurant response");
  }
}

// ============================================
// RESPONSE PARSING & VALIDATION
// ============================================

/**
 * Convert AI-generated activity to CoreActivity type
 */
function parseAIActivity(
  aiActivity: AIGeneratedActivity,
  destination: string
): CoreActivity {
  const id = generateId();

  // Map category string to ActivityCategory
  const categoryMap: Record<string, ActivityCategory> = {
    temple: "temple",
    shrine: "shrine",
    museum: "museum",
    park: "park",
    garden: "garden",
    landmark: "landmark",
    neighborhood: "neighborhood",
    market: "market",
    shopping: "shopping",
    entertainment: "entertainment",
    nature: "nature",
    viewpoint: "viewpoint",
    "cultural-experience": "cultural-experience",
    "food-tour": "food-tour",
    "walking-tour": "walking-tour",
    "day-trip": "day-trip",
    nightlife: "nightlife",
    relaxation: "relaxation",
    adventure: "adventure",
    "family-activity": "family-activity",
    "photo-spot": "photo-spot",
  };

  const category = categoryMap[aiActivity.category] || "landmark";

  // Map time of day strings
  const timeOfDayMap: Record<string, TimeOfDay> = {
    "early-morning": "early-morning",
    morning: "morning",
    afternoon: "afternoon",
    evening: "evening",
    night: "night",
  };

  const bestTimeOfDay = aiActivity.bestTimeOfDay
    .map((t) => timeOfDayMap[t.toLowerCase()])
    .filter(Boolean) as TimeOfDay[];

  return {
    id,
    entityIds: {
      internalId: id,
      // In production, we'd look up Google Place ID here
    },
    source: "ai-generated",
    name: aiActivity.name,
    description: aiActivity.description,
    category,
    localTip: aiActivity.localTip,
    location: {
      lat: 0, // Would be geocoded in production
      lng: 0,
    },
    address: {
      formatted: aiActivity.address || aiActivity.neighborhood,
      city: destination.split(",")[0].trim(),
      country: destination.split(",")[1]?.trim() || "",
      neighborhood: aiActivity.neighborhood,
    },
    neighborhood: aiActivity.neighborhood,
    bestTimeOfDay: bestTimeOfDay.length > 0 ? bestTimeOfDay : ["morning", "afternoon"],
    recommendedDuration: aiActivity.recommendedDuration,
    isFree: aiActivity.isFree,
    estimatedCost: aiActivity.estimatedCost
      ? { amount: aiActivity.estimatedCost.amount, currency: aiActivity.estimatedCost.currency }
      : undefined,
    familyFriendly: aiActivity.familyFriendly,
    kidAges: aiActivity.kidAges,
    romanticRating: aiActivity.romanticRating,
    soloFriendly: aiActivity.soloFriendly,
    groupFriendly: aiActivity.groupFriendly,
    isOutdoor: aiActivity.isOutdoor,
    weatherSensitive: aiActivity.weatherSensitive,
    rating: aiActivity.rating,
    tags: aiActivity.tags,
    requiresBooking: aiActivity.requiresBooking,
    bookingLeadTime: aiActivity.bookingLeadTime,
    confidence: 0.8, // AI-generated activities have moderate confidence
  };
}

/**
 * Convert AI-generated restaurant to RestaurantActivity type
 */
function parseAIRestaurant(
  aiRestaurant: AIGeneratedRestaurant,
  destination: string
): RestaurantActivity {
  const id = generateId();

  // Map meal types
  const mealTypeMap: Record<string, MealType> = {
    breakfast: "breakfast",
    brunch: "brunch",
    lunch: "lunch",
    dinner: "dinner",
    snack: "snack",
    cafe: "cafe",
  };

  const mealType = aiRestaurant.mealType
    .map((m) => mealTypeMap[m.toLowerCase()])
    .filter(Boolean) as MealType[];

  // Map dietary options
  const dietaryMap: Record<string, DietaryOption> = {
    vegetarian: "vegetarian",
    vegan: "vegan",
    "gluten-free": "gluten-free",
    halal: "halal",
    kosher: "kosher",
    "no-pork": "no-pork",
    "no-beef": "no-beef",
  };

  const dietaryOptions = aiRestaurant.dietaryOptions
    .map((d) => dietaryMap[d.toLowerCase()])
    .filter(Boolean) as DietaryOption[];

  // Map time of day
  const timeOfDayMap: Record<string, TimeOfDay> = {
    morning: "morning",
    afternoon: "afternoon",
    evening: "evening",
    night: "night",
  };

  const bestTimeOfDay = aiRestaurant.bestTimeOfDay
    .map((t) => timeOfDayMap[t.toLowerCase()])
    .filter(Boolean) as TimeOfDay[];

  return {
    id,
    entityIds: {
      internalId: id,
    },
    source: "ai-generated",
    name: aiRestaurant.name,
    description: aiRestaurant.description,
    category: "restaurant",
    localTip: aiRestaurant.localTip,
    location: {
      lat: 0,
      lng: 0,
    },
    address: {
      formatted: aiRestaurant.address || aiRestaurant.neighborhood,
      city: destination.split(",")[0].trim(),
      country: destination.split(",")[1]?.trim() || "",
      neighborhood: aiRestaurant.neighborhood,
    },
    neighborhood: aiRestaurant.neighborhood,
    bestTimeOfDay: bestTimeOfDay.length > 0 ? bestTimeOfDay : ["afternoon", "evening"],
    recommendedDuration: mealType.includes("dinner") ? 90 : mealType.includes("lunch") ? 60 : 45,
    isFree: false,
    estimatedCost: aiRestaurant.estimatedCost,
    familyFriendly: aiRestaurant.hasKidsMenu,
    romanticRating: aiRestaurant.romanticRating,
    soloFriendly: true,
    groupFriendly: true,
    isOutdoor: false,
    weatherSensitive: false,
    rating: aiRestaurant.rating,
    tags: aiRestaurant.tags,
    requiresBooking: aiRestaurant.reservationRequired,
    confidence: 0.75,

    // Restaurant-specific fields
    mealType,
    cuisineTypes: aiRestaurant.cuisineTypes,
    dietaryOptions,
    priceLevel: aiRestaurant.priceLevel,
    reservationRequired: aiRestaurant.reservationRequired,
    reservationUrl: aiRestaurant.reservationUrl,
    hasKidsMenu: aiRestaurant.hasKidsMenu,
    noiseLevel: aiRestaurant.noiseLevel,
  };
}

// ============================================
// MAIN SERVICE CLASS
// ============================================

export class ActivityGenerationService {
  private scoringEngine: ActivityScoringEngine;

  constructor(settings?: Partial<UserExperienceSettings>) {
    this.scoringEngine = createScoringEngine(settings);
  }

  /**
   * Generate activities for a destination
   */
  async generateActivities(
    request: GenerateActivitiesRequest
  ): Promise<GenerateActivitiesResponse> {
    const { destination, dates, travelers, settings, existingActivities } = request;

    // Build prompts
    const activityPrompt = buildActivityGenerationPrompt({
      destination,
      dates,
      travelers,
      settings,
      existingActivities,
    });

    const restaurantPrompt = buildRestaurantGenerationPrompt({
      destination,
      dates,
      travelers,
      settings,
    });

    // Generate activities and restaurants in parallel
    const [aiActivities, aiRestaurants] = await Promise.all([
      generateActivitiesWithAI(activityPrompt),
      generateRestaurantsWithAI(restaurantPrompt),
    ]);

    // Parse AI responses into typed activities
    const activities = aiActivities.map((a) => parseAIActivity(a, destination));
    const restaurants = aiRestaurants.map((r) => parseAIRestaurant(r, destination));

    // Build full settings for scoring
    const fullSettings: UserExperienceSettings = this.buildFullSettings(settings, travelers);

    // Score all activities
    const scoredActivities = this.scoringEngine.scoreActivities(activities, {
      settings: fullSettings,
    });

    const scoredRestaurants = this.scoringEngine.scoreActivities(restaurants, {
      settings: fullSettings,
    });

    // Generate day templates
    const templates = await this.generateDayTemplates(
      destination,
      settings.tripMode || travelers.mode
    );

    return {
      activities: scoredActivities,
      restaurants: scoredRestaurants,
      templates,
      warnings: this.generateWarnings(scoredActivities, scoredRestaurants),
    };
  }

  /**
   * Generate activities for a specific time slot
   */
  async generateActivitiesForSlot(
    destination: string,
    timeSlot: { startTime: string; endTime: string },
    settings: UserExperienceSettings,
    context?: {
      weather?: WeatherForecast;
      previousActivities?: CoreActivity[];
      isNightSlot?: boolean;
    }
  ): Promise<ScoredActivity[]> {
    // Generate fresh activities
    const prompt = buildActivityGenerationPrompt({
      destination,
      dates: { start: new Date().toISOString(), end: new Date().toISOString() },
      travelers: settings.travelers,
      settings,
    });

    const aiActivities = await generateActivitiesWithAI(prompt);
    const activities = aiActivities.map((a) => parseAIActivity(a, destination));

    // Score with time slot context
    return this.scoringEngine.getTopActivities(
      activities,
      {
        settings,
        timeSlot,
        ...context,
      },
      5
    );
  }

  /**
   * Generate restaurant options for a meal slot
   */
  async generateRestaurantsForMeal(
    destination: string,
    mealType: MealType,
    settings: UserExperienceSettings,
    neighborhood?: string
  ): Promise<ScoredActivity[]> {
    const prompt = buildRestaurantGenerationPrompt({
      destination,
      dates: { start: new Date().toISOString(), end: new Date().toISOString() },
      travelers: settings.travelers,
      settings,
    });

    const aiRestaurants = await generateRestaurantsWithAI(prompt);
    let restaurants = aiRestaurants.map((r) => parseAIRestaurant(r, destination));

    // Filter by meal type
    restaurants = restaurants.filter((r) => r.mealType.includes(mealType));

    // Filter by neighborhood if specified
    if (neighborhood) {
      const nearbyRestaurants = restaurants.filter(
        (r) => r.neighborhood.toLowerCase().includes(neighborhood.toLowerCase())
      );
      if (nearbyRestaurants.length >= 3) {
        restaurants = nearbyRestaurants;
      }
    }

    return this.scoringEngine.scoreActivities(restaurants, { settings });
  }

  /**
   * Generate day templates for the destination
   */
  private async generateDayTemplates(
    destination: string,
    tripMode: TripMode
  ): Promise<DayTemplate[]> {
    const prompt = buildDayTemplatePrompt(destination, tripMode);

    try {
      const response = await openai.chat.completions.create({
        model: "gpt-4o-mini",
        messages: [
          { role: "system", content: ACTIVITY_GENERATION_SYSTEM_PROMPT },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
        response_format: { type: "json_object" },
      });

      const content = response.choices[0]?.message?.content;
      if (!content) return [];

      const parsed = JSON.parse(content);
      return (parsed.templates || []).map((t: Record<string, unknown>) => ({
        id: generateId(),
        name: t.name as string,
        description: t.description as string,
        city: destination,
        tripModes: [tripMode],
        duration: t.duration as "half-day" | "full-day",
        slots: t.slots as DayTemplate["slots"],
        features: t.features as string[],
        tags: t.tags as string[],
      }));
    } catch (error) {
      console.error("Failed to generate day templates:", error);
      return [];
    }
  }

  /**
   * Build full settings from partial settings and travelers
   */
  private buildFullSettings(
    settings: Partial<UserExperienceSettings>,
    travelers: TravelerComposition
  ): UserExperienceSettings {
    return {
      pace: settings.pace || {
        mode: "normal",
        dayStart: "09:00",
        dayEnd: "21:00",
        walkingTolerance: "medium",
        maxWalkMinutes: 20,
        breakFrequency: 120,
        minActivitiesPerDay: 3,
        maxActivitiesPerDay: 5,
      },
      commutePreference: settings.commutePreference || "balanced",
      avoidStairs: settings.avoidStairs || false,
      preferElevators: settings.preferElevators || false,
      budgetMode: settings.budgetMode || "moderate",
      dailyBudgetLimit: settings.dailyBudgetLimit,
      showPricesIn: settings.showPricesIn || "USD",
      dietary: settings.dietary || [],
      allergies: settings.allergies || [],
      accessibility: settings.accessibility || {
        wheelchairAccessible: false,
        strollerFriendly: travelers.children > 0,
        hasElevator: false,
        avoidStairs: false,
        hasAccessibleRestroom: false,
        serviceAnimalsAllowed: false,
      },
      tripMode: settings.tripMode || travelers.mode,
      travelers,
      anchors: settings.anchors || {
        mustDo: [],
        niceToHave: [],
        noGo: [],
      },
      hardConstraints: settings.hardConstraints || {},
      rainPlanEnabled: settings.rainPlanEnabled ?? true,
      weatherSensitivity: settings.weatherSensitivity || "medium",
      energyCheckInsEnabled: settings.energyCheckInsEnabled ?? false,
      checkInFrequency: settings.checkInFrequency || "twice-daily",
      nudgeSettings: settings.nudgeSettings || {
        departureReminders: true,
        lastTrainAlerts: true,
        weatherAlerts: true,
        crowdAlerts: false,
        graceWindowNotifications: true,
      },
      viewSettings: settings.viewSettings || {
        defaultView: "timeline-first",
        mapSettings: {
          showWalkingRoutes: true,
          showTransitLines: true,
          clusterNearbyPins: true,
          showNeighborhoodBoundaries: false,
        },
        timelineSettings: {
          showCommuteBlocks: true,
          showWeatherIcons: true,
          expandedByDefault: true,
          colorCodeByCategory: true,
        },
      },
      showLocalScripts: settings.showLocalScripts ?? true,
      language: settings.language || "en",
      notifications: settings.notifications || {
        enabled: true,
        criticalOnly: false,
        channels: ["push"],
      },
      offlineMode: settings.offlineMode || {
        autoDownload: true,
        downloadDaysAhead: 2,
        includeAlternatives: true,
        maxStorageMB: 100,
      },
      scoringWeights: settings.scoringWeights,
      vibePreferences: settings.vibePreferences,
      whatIfSimulation: settings.whatIfSimulation ?? false,
    };
  }

  /**
   * Generate warnings based on scored activities
   */
  private generateWarnings(
    activities: ScoredActivity[],
    restaurants: ScoredActivity[]
  ): string[] {
    const warnings: string[] = [];

    // Check if we have enough high-scoring options
    const highScoringActivities = activities.filter((a) => a.totalScore >= 70);
    if (highScoringActivities.length < 5) {
      warnings.push(
        "Limited high-scoring activities found. Consider adjusting your preferences."
      );
    }

    // Check dietary coverage for restaurants
    const lowConfidenceRestaurants = restaurants.filter((r) => r.confidence < 0.6);
    if (lowConfidenceRestaurants.length > restaurants.length * 0.5) {
      warnings.push(
        "Many restaurant recommendations have limited information. Verify dietary accommodations."
      );
    }

    // Check for booking requirements
    const needsBooking = activities.filter((a) => a.activity.requiresBooking);
    if (needsBooking.length > 0) {
      warnings.push(
        `${needsBooking.length} activities require advance booking.`
      );
    }

    return warnings;
  }
}

// ============================================
// FACTORY FUNCTIONS
// ============================================

/**
 * Create an activity generation service
 */
export function createActivityGenerationService(
  settings?: Partial<UserExperienceSettings>
): ActivityGenerationService {
  return new ActivityGenerationService(settings);
}

/**
 * Quick generation function for simple use cases
 */
export async function generateActivitiesForTrip(
  destination: string,
  dates: { start: string; end: string },
  travelers: TravelerComposition,
  settings?: Partial<UserExperienceSettings>
): Promise<GenerateActivitiesResponse> {
  const service = createActivityGenerationService(settings);
  return service.generateActivities({
    destination,
    dates,
    travelers,
    settings: settings || {},
  });
}

// ============================================
// EXPORTS
// ============================================

export {
  buildActivityGenerationPrompt,
  buildRestaurantGenerationPrompt,
  buildDayTemplatePrompt,
  ACTIVITY_GENERATION_SYSTEM_PROMPT,
};

export default ActivityGenerationService;
