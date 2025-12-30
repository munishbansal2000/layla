/**
 * Unified Itinerary Service
 *
 * Clean abstraction for itinerary generation.
 * Switches between data-driven (japan-itinerary-generator) and LLM-based generation.
 * Optionally enriches with place resolution and commute calculation.
 *
 * Configuration:
 *   ITINERARY_PROVIDER=llm|data (default: data)
 *   ITINERARY_AI_PROVIDER=openai|ollama|gemini (override for itinerary-specific LLM)
 *   PLACE_RESOLVER_MODE=test|prod (default: follows AI_MODE)
 *
 * Usage:
 *   import { itineraryService } from './itinerary-service';
 *   const result = await itineraryService.generate({ cities: ['tokyo'], startDate: '2025-04-01' });
 */

import { llm, type ChatMessage, type AIProvider } from "./llm";
import { getSystemPrompt } from "./prompts";
import type {
  StructuredItineraryData,
  DayWithOptions,
  SlotWithOptions,
  ActivityOption,
  StructuredCommuteInfo,
  ViatorEnhancement,
  ViatorEnhancementType,
} from "@/types/structured-itinerary";

// ============================================
// TYPES
// ============================================

export type ItineraryProvider = "data" | "llm";

/**
 * Activity anchor - a pre-booked activity that must be included in the itinerary
 */
export interface ActivityAnchor {
  name: string;
  city: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  duration?: number; // minutes
  category?: string;
  isFlexible?: boolean; // If true, time can be adjusted slightly
  notes?: string;
}

export interface ItineraryRequest {
  cities: string[];
  startDate: string;
  daysPerCity?: Record<string, number>;
  totalDays?: number;
  pace?: "relaxed" | "moderate" | "packed";
  interests?: string[];
  includeKlookExperiences?: boolean;
  // LLM-specific options
  userPreferences?: string;
  tripContext?: string;
  travelers?: {
    adults: number;
    children?: number;
    childrenAges?: number[];
  };
  budget?: "budget" | "moderate" | "luxury";

  // Constraints - must-haves and must-avoids
  mustHave?: string[]; // Places/activities that MUST be included
  mustAvoid?: string[]; // Places/activities/types to avoid

  // Activity anchors - pre-booked activities with fixed times
  anchors?: ActivityAnchor[];

  // Clustering preference
  clusterByNeighborhood?: boolean; // Group activities geographically (default: true)

  // Enrichment options
  enrichWithPlaceResolution?: boolean;
  enrichWithCommute?: boolean;
  placeResolutionOptions?: {
    skipExpensiveProviders?: boolean;
    minConfidence?: number;
  };
}

export interface PlaceResolutionStats {
  totalPlaces: number;
  resolved: number;
  failed: number;
  providers: Record<string, number>;
  avgConfidence: number;
  totalDuration: number;
}

export interface CommuteStats {
  totalCommutes: number;
  avgDuration: number;
  methodCounts: Record<string, number>;
}

export interface ItineraryResponse {
  itinerary: StructuredItineraryData;
  message?: string;
  metadata: {
    generatedAt: string;
    provider: ItineraryProvider;
    source: string;
    totalDays: number;
    totalSlots: number;
    totalOptions: number;
    cities: string[];
    placeResolution?: PlaceResolutionStats;
    commuteCalculation?: CommuteStats;
  };
}

// ============================================
// CONFIGURATION
// ============================================

export function getItineraryProvider(): ItineraryProvider {
  const provider = process.env.ITINERARY_PROVIDER?.toLowerCase();
  if (provider === "llm" || provider === "ai") return "llm";
  return "data";
}

/**
 * Get the AI provider specifically for itinerary generation.
 * Can be overridden via ITINERARY_AI_PROVIDER env var.
 */
export function getItineraryAIProvider(): AIProvider {
  const override = process.env.ITINERARY_AI_PROVIDER?.toLowerCase();
  if (override === "openai") return "openai";
  if (override === "gemini" || override === "google") return "gemini";
  if (override === "ollama") return "ollama";
  // Fall back to global AI_PROVIDER
  const global = process.env.AI_PROVIDER?.toLowerCase();
  if (global === "openai") return "openai";
  if (global === "gemini" || global === "google") return "gemini";
  if (global === "ollama") return "ollama";
  return "openai"; // Default for itinerary
}

export function getItineraryConfig() {
  return {
    provider: getItineraryProvider(),
    aiProvider: getItineraryAIProvider(),
  };
}

// ============================================
// CONSTRAINT HELPERS
// ============================================

/**
 * Build the constraints section for the LLM prompt
 */
function buildConstraintsSection(
  mustHave: string[],
  mustAvoid: string[],
  anchors: ActivityAnchor[],
  clusterByNeighborhood: boolean
): string {
  const sections: string[] = [];

  if (mustHave.length > 0) {
    sections.push(`
MUST-HAVE PLACES (These MUST be included in the itinerary):
${mustHave.map((item, i) => `  ${i + 1}. ${item}`).join("\n")}
- Schedule each at appropriate times based on venue type
- Include as the FIRST option (rank: 1) in their slots
- Mark matchReasons with "User requested: must-visit"`);
  }

  if (mustAvoid.length > 0) {
    sections.push(`
MUST-AVOID (NEVER include these):
${mustAvoid.map((item, i) => `  ${i + 1}. ${item}`).join("\n")}
- Do not suggest any of these places, cuisines, or activity types
- Find alternatives if these are typically popular recommendations`);
  }

  if (anchors.length > 0) {
    sections.push(`
PRE-BOOKED ACTIVITIES (FIXED - do NOT change times):
${anchors.map((a, i) => {
  const timeStr = a.startTime ? ` at ${a.startTime}${a.endTime ? `-${a.endTime}` : ""}` : "";
  const durationStr = a.duration ? ` (${a.duration} min)` : "";
  return `  ${i + 1}. ${a.name} - ${a.city} on ${a.date}${timeStr}${durationStr}${a.notes ? ` [${a.notes}]` : ""}`;
}).join("\n")}
- Insert these at their EXACT specified times
- Set behavior: "anchor" for these slots
- Plan surrounding activities to minimize travel time to/from anchors
- Mark matchReasons with "Pre-booked activity"`);
  }

  if (clusterByNeighborhood) {
    sections.push(`
GEOGRAPHIC CLUSTERING:
- Group activities by neighborhood to minimize travel time
- Morning activities should be near each other in the same area
- Lunch should be walking distance from morning or afternoon activity
- Don't schedule activities that require long cross-city travel back-to-back
- Add clusterId to slots in the same area (e.g., "shibuya-area", "asakusa-area")`);
  }

  return sections.length > 0 ? "\n" + sections.join("\n") : "";
}

/**
 * Validate that constraints were honored in the generated itinerary
 * Logs warnings if constraints were not followed
 */
function validateConstraints(
  itinerary: StructuredItineraryData,
  mustHave: string[],
  mustAvoid: string[],
  anchors: ActivityAnchor[]
): void {
  // Collect all activity names in the itinerary
  const allActivities: string[] = [];
  for (const day of itinerary.days) {
    for (const slot of day.slots) {
      for (const option of slot.options) {
        if (option.activity?.name) {
          allActivities.push(option.activity.name.toLowerCase());
        }
      }
    }
  }

  // Check must-haves are included
  for (const mustHaveItem of mustHave) {
    const found = allActivities.some(
      (name) =>
        name.includes(mustHaveItem.toLowerCase()) ||
        mustHaveItem.toLowerCase().includes(name)
    );
    if (!found) {
      console.warn(
        `[itinerary-service] ⚠️ Must-have "${mustHaveItem}" not found in itinerary`
      );
    }
  }

  // Check must-avoids are NOT included
  for (const mustAvoidItem of mustAvoid) {
    const found = allActivities.some(
      (name) =>
        name.includes(mustAvoidItem.toLowerCase()) ||
        mustAvoidItem.toLowerCase().includes(name)
    );
    if (found) {
      console.warn(
        `[itinerary-service] ⚠️ Must-avoid "${mustAvoidItem}" found in itinerary - constraint violated`
      );
    }
  }

  // Check anchors are included at correct times
  for (const anchor of anchors) {
    const anchorDate = anchor.date;
    const anchorName = anchor.name.toLowerCase();

    // Find the day for this anchor
    const day = itinerary.days.find((d) => d.date === anchorDate);
    if (!day) {
      console.warn(
        `[itinerary-service] ⚠️ Anchor "${anchor.name}" on ${anchorDate} - day not found in itinerary`
      );
      continue;
    }

    // Check if anchor is in any slot
    let foundAnchor = false;
    for (const slot of day.slots) {
      for (const option of slot.options) {
        if (option.activity?.name?.toLowerCase().includes(anchorName)) {
          foundAnchor = true;
          // Check if marked as anchor behavior
          if (slot.behavior !== "anchor") {
            console.warn(
              `[itinerary-service] ⚠️ Anchor "${anchor.name}" found but slot behavior is "${slot.behavior}" instead of "anchor"`
            );
          }
          break;
        }
      }
      if (foundAnchor) break;
    }

    if (!foundAnchor) {
      console.warn(
        `[itinerary-service] ⚠️ Anchor "${anchor.name}" not found in day ${day.dayNumber}`
      );
    }
  }
}

// ============================================
// DATA PROVIDER (japan-itinerary-generator)
// ============================================

async function generateFromData(
  request: ItineraryRequest
): Promise<ItineraryResponse> {
  // Dynamic import to avoid circular dependencies
  const { generateJapanItinerary } = await import("./japan-itinerary-generator");

  const itinerary = await generateJapanItinerary({
    cities: request.cities,
    startDate: request.startDate,
    daysPerCity: request.daysPerCity,
    totalDays: request.totalDays,
    pace: request.pace,
    interests: request.interests,
    includeKlookExperiences: request.includeKlookExperiences,
  });

  const totalSlots = itinerary.days.reduce((sum, d) => sum + d.slots.length, 0);
  const totalOptions = itinerary.days.reduce(
    (sum, d) => sum + d.slots.reduce((s, slot) => s + slot.options.length, 0),
    0
  );

  return {
    itinerary,
    metadata: {
      generatedAt: new Date().toISOString(),
      provider: "data",
      source: "japan-data-service",
      totalDays: itinerary.days.length,
      totalSlots,
      totalOptions,
      cities: itinerary.days.reduce((acc, d) => {
        if (!acc.includes(d.city)) acc.push(d.city);
        return acc;
      }, [] as string[]),
    },
  };
}

// ============================================
// LLM PROVIDER
// ============================================

async function generateFromLLM(
  request: ItineraryRequest
): Promise<ItineraryResponse> {
  const aiProvider = getItineraryAIProvider();

  const {
    cities,
    startDate,
    totalDays,
    daysPerCity,
    pace = "moderate",
    interests = [],
    travelers,
    budget = "moderate",
    userPreferences,
    tripContext,
    mustHave = [],
    mustAvoid = [],
    anchors = [],
    clusterByNeighborhood = true,
  } = request;

  // Calculate number of days
  let numDays = totalDays || 0;
  if (!numDays && daysPerCity) {
    numDays = Object.values(daysPerCity).reduce((sum, d) => sum + d, 0);
  }
  if (!numDays) {
    numDays = cities.length * 2; // Default 2 days per city
  }

  // Build traveler info
  const travelerInfo = travelers
    ? `${travelers.adults} adult${travelers.adults > 1 ? "s" : ""}${travelers.children ? `, ${travelers.children} child${travelers.children > 1 ? "ren" : ""}` : ""}`
    : "2 adults";

  // Build constraints section
  const constraintsSection = buildConstraintsSection(mustHave, mustAvoid, anchors, clusterByNeighborhood);

  // Get the system prompt
  const systemPrompt = getSystemPrompt("itineraryGeneration");

  const userPrompt = `Generate a ${numDays}-day travel itinerary for Japan.

TRIP DETAILS:
- Cities: ${cities.join(", ")}
- Start Date: ${startDate}
- Days per city: ${daysPerCity ? JSON.stringify(daysPerCity) : `${Math.floor(numDays / cities.length)} days each`}
- Pace: ${pace}
- Travelers: ${travelerInfo}
- Budget: ${budget}
- Interests: ${interests.length > 0 ? interests.join(", ") : "general sightseeing, local food, culture"}
${userPreferences ? `- Preferences: ${userPreferences}` : ""}
${tripContext ? `- Context: ${tripContext}` : ""}
${constraintsSection}

REQUIREMENTS:
1. Generate exactly ${numDays} days
2. Each day needs: morning, lunch, afternoon, dinner slots (evening optional for moderate/packed pace)
3. Provide 2-3 ranked OPTIONS for each slot
4. Use REAL venue names with approximate coordinates for Japan locations
5. Include city transitions (Shinkansen) when changing cities
6. Match the ${pace} pace appropriately
${mustHave.length > 0 ? `7. MUST include these as rank 1 options: ${mustHave.join(", ")}` : ""}
${mustAvoid.length > 0 ? `8. NEVER include: ${mustAvoid.join(", ")}` : ""}
${anchors.length > 0 ? `9. Insert pre-booked activities at their exact times with behavior: "anchor"` : ""}
${clusterByNeighborhood ? `10. Group activities by neighborhood to minimize travel time` : ""}

Return valid JSON matching the StructuredItineraryData format.`;

  try {
    console.log(`[itinerary-service] Generating ${numDays}-day itinerary via ${aiProvider} for ${cities.join(", ")}`);
    if (mustHave.length > 0) console.log(`[itinerary-service] Must-have: ${mustHave.join(", ")}`);
    if (mustAvoid.length > 0) console.log(`[itinerary-service] Must-avoid: ${mustAvoid.join(", ")}`);
    if (anchors.length > 0) console.log(`[itinerary-service] Anchors: ${anchors.map(a => a.name).join(", ")}`);

    // Use the unified llm.chat() with provider override
    const messages: ChatMessage[] = [{ role: "user", content: userPrompt }];
    const response = await llm.chat(messages, {
      systemPrompt,
      temperature: 0.7,
      maxTokens: 8000,
      jsonMode: true,
      providerOverride: aiProvider,
    });

    // Parse the response
    const parsed = JSON.parse(response) as Partial<StructuredItineraryData>;

    // Normalize and validate the response
    const itinerary = normalizeItinerary(parsed, cities, startDate, numDays, anchors);

    // Validate constraints were honored
    validateConstraints(itinerary, mustHave, mustAvoid, anchors);

    const totalSlots = itinerary.days.reduce((sum, d) => sum + d.slots.length, 0);
    const totalOptions = itinerary.days.reduce(
      (sum, d) => sum + d.slots.reduce((s, slot) => s + slot.options.length, 0),
      0
    );

    return {
      itinerary,
      metadata: {
        generatedAt: new Date().toISOString(),
        provider: "llm",
        source: `llm-${aiProvider}`,
        totalDays: itinerary.days.length,
        totalSlots,
        totalOptions,
        cities: itinerary.days.reduce((acc, d) => {
          if (!acc.includes(d.city)) acc.push(d.city);
          return acc;
        }, [] as string[]),
      },
    };
  } catch (error) {
    console.error("[itinerary-service] LLM error:", error);
    console.log("[itinerary-service] Falling back to data provider");
    return generateFromData(request);
  }
}

// ============================================
// NORMALIZATION HELPERS
// ============================================

function normalizeItinerary(
  parsed: Partial<StructuredItineraryData>,
  cities: string[],
  startDate: string,
  numDays: number,
  anchors: ActivityAnchor[] = []
): StructuredItineraryData {
  const days: DayWithOptions[] = [];
  let currentDate = new Date(startDate);

  // Handle days array
  const parsedDays = parsed.days || [];

  for (let i = 0; i < numDays; i++) {
    const parsedDay = parsedDays[i];
    const dateStr = currentDate.toISOString().split("T")[0];

    // Determine city for this day
    let cityForDay = cities[0];
    if (parsedDay?.city) {
      cityForDay = parsedDay.city;
    } else {
      // Distribute days across cities
      const daysPerCity = Math.ceil(numDays / cities.length);
      const cityIndex = Math.floor(i / daysPerCity);
      cityForDay = cities[Math.min(cityIndex, cities.length - 1)];
    }

    const day: DayWithOptions = {
      dayNumber: i + 1,
      date: dateStr,
      city: cityForDay,
      title: parsedDay?.title || `Day ${i + 1} in ${cityForDay}`,
      slots: normalizeSlots(parsedDay?.slots || [], i + 1),
    };

    days.push(day);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return {
    destination: cities.length > 1 ? "Japan" : cities[0],
    country: "Japan",
    days,
    generalTips: parsed.generalTips || getDefaultTips(),
    estimatedBudget: parsed.estimatedBudget || {
      total: { min: 50000, max: 100000 },
      currency: "JPY",
    },
  };
}

function normalizeSlots(
  parsedSlots: Partial<SlotWithOptions>[],
  dayNumber: number
): SlotWithOptions[] {
  const slotTypes: SlotWithOptions["slotType"][] = [
    "morning",
    "lunch",
    "afternoon",
    "dinner",
  ];

  const slots: SlotWithOptions[] = [];

  for (const slotType of slotTypes) {
    const existingSlot = parsedSlots.find((s) => s.slotType === slotType);

    if (existingSlot) {
      slots.push({
        slotId: existingSlot.slotId || `day${dayNumber}-${slotType}`,
        slotType,
        timeRange: existingSlot.timeRange || getDefaultTimeRange(slotType),
        options: normalizeOptions(existingSlot.options || [], dayNumber, slotType),
        selectedOptionId: existingSlot.selectedOptionId,
        behavior: existingSlot.behavior || (slotType === "lunch" || slotType === "dinner" ? "meal" : "flex"),
      });
    } else {
      // Create empty slot
      slots.push({
        slotId: `day${dayNumber}-${slotType}`,
        slotType,
        timeRange: getDefaultTimeRange(slotType),
        options: [],
        behavior: slotType === "lunch" || slotType === "dinner" ? "meal" : "flex",
      });
    }
  }

  return slots;
}

function normalizeOptions(
  parsedOptions: Partial<ActivityOption>[],
  dayNumber: number,
  slotType: string
): ActivityOption[] {
  return parsedOptions.map((opt, index) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activity = (opt.activity || {}) as any;

    return {
      id: opt.id || `llm-day${dayNumber}-${slotType}-${index}`,
      rank: opt.rank || index + 1,
      score: opt.score || 80 - index * 10,
      activity: {
        name: activity.name || "Unknown Activity",
        description: activity.description || "",
        category: activity.category || "attraction",
        duration: activity.duration || 90,
        place: {
          name: activity.place?.name || activity.name || "Unknown",
          address: activity.place?.address || "",
          neighborhood: activity.place?.neighborhood || "",
          coordinates: activity.place?.coordinates || { lat: 0, lng: 0 },
          rating: activity.place?.rating,
          reviewCount: activity.place?.reviewCount,
          photos: activity.place?.photos || [],
        },
        isFree: activity.isFree ?? false,
        estimatedCost: activity.estimatedCost,
        tags: activity.tags || [],
        source: "ai",
      },
      matchReasons: opt.matchReasons || ["AI-recommended"],
      tradeoffs: opt.tradeoffs || [],
    };
  });
}

function getDefaultTimeRange(
  slotType: SlotWithOptions["slotType"]
): { start: string; end: string } {
  const ranges: Record<string, { start: string; end: string }> = {
    morning: { start: "09:00", end: "12:00" },
    lunch: { start: "12:00", end: "14:00" },
    afternoon: { start: "14:00", end: "18:00" },
    dinner: { start: "18:00", end: "20:00" },
    evening: { start: "20:00", end: "22:00" },
    breakfast: { start: "08:00", end: "09:30" },
  };
  return ranges[slotType] || { start: "09:00", end: "12:00" };
}

function getDefaultTips(): string[] {
  return [
    "Get a JR Pass for Shinkansen and JR trains",
    "Get a Suica or ICOCA card for easy transit payments",
    "Download Google Maps offline for each city",
    "Most shops accept credit cards, but keep some cash for small vendors",
    "Temple visits are best in early morning to avoid crowds",
  ];
}

// ============================================
// UNIFIED API
// ============================================

/**
 * Generate a complete itinerary with optional enrichment
 */
export async function generate(
  request: ItineraryRequest
): Promise<ItineraryResponse> {
  const provider = getItineraryProvider();

  console.log(`[itinerary-service] Using ${provider} provider for ${request.cities.join(", ")}`);

  // Step 1: Generate base itinerary
  let result: ItineraryResponse;
  switch (provider) {
    case "llm":
      result = await generateFromLLM(request);
      break;
    default:
      result = await generateFromData(request);
  }

  // Step 2: Optional Place Resolution (only for LLM-generated itineraries)
  // Data provider already has verified places
  if (request.enrichWithPlaceResolution && provider === "llm") {
    try {
      const enriched = await enrichWithPlaceResolution(
        result.itinerary,
        request.placeResolutionOptions
      );
      result.itinerary = enriched.itinerary;
      result.metadata.placeResolution = enriched.stats;
    } catch (error) {
      console.error("[itinerary-service] Place resolution failed:", error);
      // Continue with unenriched itinerary
    }
  }

  // Step 3: Optional Commute Calculation
  if (request.enrichWithCommute) {
    try {
      const enriched = await enrichWithCommute(result.itinerary);
      result.itinerary = enriched.itinerary;
      result.metadata.commuteCalculation = enriched.stats;
    } catch (error) {
      console.error("[itinerary-service] Commute calculation failed:", error);
      // Continue without commute data
    }
  }

  // Step 4: Fill empty restaurant slots (for LLM provider)
  // LLM generates activities only, restaurants are filled based on proximity
  if (provider === "llm") {
    try {
      const enriched = await fillRestaurantSlots(result.itinerary);
      result.itinerary = enriched.itinerary;
      console.log(`[itinerary-service] Filled ${enriched.stats.filledSlots} restaurant slots`);

      // Step 5: Recalculate commutes after restaurant filling
      // (since restaurants may have moved to new locations)
      if (enriched.stats.filledSlots > 0) {
        console.log("[itinerary-service] Recalculating commutes after restaurant filling...");
        const commuteResult = await enrichWithCommute(result.itinerary);
        result.itinerary = commuteResult.itinerary;
        result.metadata.commuteCalculation = commuteResult.stats;
      }
    } catch (error) {
      console.error("[itinerary-service] Restaurant filling failed:", error);
      // Continue with empty slots
    }
  }

  return result;
}

// ============================================
// ENRICHMENT: PLACE RESOLUTION
// ============================================

async function enrichWithPlaceResolution(
  itinerary: StructuredItineraryData,
  options?: {
    skipExpensiveProviders?: boolean;
    minConfidence?: number;
  }
): Promise<{
  itinerary: StructuredItineraryData;
  stats: PlaceResolutionStats;
}> {
  // Dynamic import to avoid circular dependencies
  const placeResolver = await import("./place-resolver");

  console.log("[itinerary-service] Enriching with place resolution...");
  const startTime = Date.now();

  const resolutions = await placeResolver.resolveItineraryPlaces(itinerary, {
    skipExpensiveProviders: options?.skipExpensiveProviders ?? true,
    minConfidence: options?.minConfidence ?? 0.5,
  });

  // Build resolution map
  type ResolvedPlaceType = NonNullable<typeof resolutions[number]["resolution"]["resolved"]>;
  const resolutionMap = new Map<string, ResolvedPlaceType>();
  const providers: Record<string, number> = {};
  let totalConfidence = 0;
  let resolvedCount = 0;

  for (const res of resolutions) {
    const key = `${res.dayNumber}-${res.slotId}-${res.optionId}`;
    if (res.resolution.resolved) {
      resolutionMap.set(key, res.resolution.resolved);
      resolvedCount++;
      totalConfidence += res.resolution.resolved.confidence;
      const provider = res.resolution.provider;
      providers[provider] = (providers[provider] || 0) + 1;
    }
  }

  // Apply resolutions to itinerary
  const enrichedDays: DayWithOptions[] = itinerary.days.map((day) => ({
    ...day,
    slots: day.slots.map((slot) => ({
      ...slot,
      options: slot.options.map((option) => {
        const key = `${day.dayNumber}-${slot.slotId}-${option.id}`;
        const resolved = resolutionMap.get(key);

        if (resolved) {
          return {
            ...option,
            activity: {
              ...option.activity,
              place: {
                ...option.activity.place,
                name: resolved.name,
                address: resolved.address,
                neighborhood: resolved.neighborhood,
                coordinates: resolved.coordinates,
                rating: resolved.rating,
                reviewCount: resolved.reviewCount,
                photos: resolved.photos,
                openingHours: resolved.openingHours,
                googlePlaceId: resolved.googlePlaceId,
              },
              source: resolved.source as ActivityOption["activity"]["source"],
            },
          } as ActivityOption;
        }
        return option;
      }),
    })),
  }));

  const totalDuration = Date.now() - startTime;
  console.log(`[itinerary-service] Place resolution: ${resolvedCount}/${resolutions.length} resolved in ${totalDuration}ms`);

  return {
    itinerary: {
      ...itinerary,
      days: enrichedDays,
    },
    stats: {
      totalPlaces: resolutions.length,
      resolved: resolvedCount,
      failed: resolutions.length - resolvedCount,
      providers,
      avgConfidence: resolvedCount > 0 ? totalConfidence / resolvedCount : 0,
      totalDuration,
    },
  };
}

// ============================================
// ENRICHMENT: COMMUTE CALCULATION
// ============================================

interface CommuteResult {
  duration: number;
  distance: number;
  method: string;
  instructions?: string;
}

async function enrichWithCommute(
  itinerary: StructuredItineraryData
): Promise<{
  itinerary: StructuredItineraryData;
  stats: CommuteStats;
}> {
  // Dynamic import to avoid circular dependencies
  const routingService = await import("./routing-service");

  if (!routingService.isRoutingConfigured()) {
    console.log("[itinerary-service] Routing not configured, using distance-based estimation");
  }

  console.log("[itinerary-service] Calculating commute times...");
  const startTime = Date.now();

  let totalCommutes = 0;
  let totalDuration = 0;
  const methodCounts: Record<string, number> = {};

  const enrichedDays: DayWithOptions[] = await Promise.all(
    itinerary.days.map(async (day) => {
      const enrichedSlots: SlotWithOptions[] = [];
      let previousCoords: { lat: number; lng: number } | null = null;

      for (const slot of day.slots) {
        const selectedOption = slot.options.find(o => o.id === slot.selectedOptionId) || slot.options[0];
        const currentCoords = selectedOption?.activity?.place?.coordinates;

        let commuteFromPrevious: StructuredCommuteInfo | undefined;

        if (previousCoords && currentCoords && currentCoords.lat !== 0 && currentCoords.lng !== 0) {
          try {
            // Get commute duration and estimate other details
            const duration = await routingService.getCommuteDuration(previousCoords, currentCoords);

            if (duration !== null) {
              // Estimate distance using Haversine formula
              const distance = calculateHaversineDistance(previousCoords, currentCoords);
              // Determine method based on distance
              const method = distance > 2000 ? "transit" : "walk";

              // Convert duration from seconds to minutes and round to whole number
              const durationMinutes = Math.round(duration / 60);

              commuteFromPrevious = {
                duration: durationMinutes,
                distance: Math.round(distance),
                method: method as StructuredCommuteInfo["method"],
                instructions: method === "walk"
                  ? `Walk ${Math.round(distance / 100) / 10} km`
                  : `Take transit (${Math.round(distance / 1000)} km)`,
              };
              totalCommutes++;
              totalDuration += durationMinutes;
              methodCounts[method] = (methodCounts[method] || 0) + 1;
            }
          } catch (error) {
            console.warn(`[itinerary-service] Commute calc failed for slot ${slot.slotId}:`, error);
          }
        }

        enrichedSlots.push({
          ...slot,
          commuteFromPrevious,
        });

        if (currentCoords && currentCoords.lat !== 0 && currentCoords.lng !== 0) {
          previousCoords = currentCoords;
        }
      }

      return {
        ...day,
        slots: enrichedSlots,
      };
    })
  );

  const calcDuration = Date.now() - startTime;
  console.log(`[itinerary-service] Commute calculation: ${totalCommutes} routes in ${calcDuration}ms`);

  return {
    itinerary: {
      ...itinerary,
      days: enrichedDays,
    },
    stats: {
      totalCommutes,
      avgDuration: totalCommutes > 0 ? totalDuration / totalCommutes : 0,
      methodCounts,
    },
  };
}

/**
 * Calculate distance between two points using Haversine formula
 */
function calculateHaversineDistance(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((from.lat * Math.PI) / 180) *
      Math.cos((to.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get provider info
 */
export function getProviderInfo() {
  const config = getItineraryConfig();
  const descriptions: Record<ItineraryProvider, string> = {
    data: "Pre-curated POI data (fast, deterministic, no API costs)",
    llm: "AI-generated itineraries (flexible, personalized)",
  };

  return {
    provider: config.provider,
    description: descriptions[config.provider],
  };
}

// ============================================
// ENRICHMENT: GEOGRAPHIC CLUSTERING VALIDATION
// ============================================

/**
 * Max walking distance in meters for food to be considered "nearby"
 */
const MAX_WALKING_DISTANCE_METERS = 1500; // ~15-20 min walk

export interface ClusteringStats {
  totalMealSlots: number;
  fixedMealSlots: number;
  violations: ClusteringViolation[];
}

export interface ClusteringViolation {
  dayNumber: number;
  slotType: string;
  activityName: string;
  previousActivityName: string;
  distanceMeters: number;
  fixed: boolean;
  fixedWith?: string;
}

/**
 * Validate and fix geographic clustering issues
 * Focuses on meal slots that are too far from preceding activities
 */
async function validateAndFixClustering(
  itinerary: StructuredItineraryData,
  options?: { autoFix?: boolean }
): Promise<{
  itinerary: StructuredItineraryData;
  stats: ClusteringStats;
}> {
  const autoFix = options?.autoFix ?? true;
  const violations: ClusteringViolation[] = [];
  let fixedCount = 0;
  let totalMealSlots = 0;

  console.log("[itinerary-service] Validating geographic clustering...");

  const fixedDays: DayWithOptions[] = [];

  for (const day of itinerary.days) {
    const fixedSlots: SlotWithOptions[] = [];
    let previousActivityCoords: { lat: number; lng: number } | null = null;
    let previousActivityName = "";

    for (let slotIndex = 0; slotIndex < day.slots.length; slotIndex++) {
      const slot = day.slots[slotIndex];
      const isMealSlot = slot.slotType === "lunch" || slot.slotType === "dinner";

      if (isMealSlot) {
        totalMealSlots++;
      }

      // Get the first option's coordinates (or selected option)
      const selectedOption = slot.options.find(o => o.id === slot.selectedOptionId) || slot.options[0];
      const currentCoords = selectedOption?.activity?.place?.coordinates;

      // Check if this is a meal slot and if it's too far from previous activity
      if (isMealSlot && previousActivityCoords && currentCoords && currentCoords.lat !== 0) {
        const distance = calculateHaversineDistance(previousActivityCoords, currentCoords);

        if (distance > MAX_WALKING_DISTANCE_METERS) {
          const violation: ClusteringViolation = {
            dayNumber: day.dayNumber,
            slotType: slot.slotType,
            activityName: selectedOption?.activity?.name || "Unknown",
            previousActivityName,
            distanceMeters: Math.round(distance),
            fixed: false,
          };

          console.log(
            `[clustering] Violation: Day ${day.dayNumber} ${slot.slotType} "${violation.activityName}" is ${Math.round(distance)}m from "${previousActivityName}"`
          );

          // Try to fix by finding nearby restaurants
          if (autoFix) {
            const fixedSlot = await tryFixMealSlotClustering(
              slot,
              day.city,
              previousActivityCoords,
              previousActivityName
            );

            if (fixedSlot) {
              fixedSlots.push(fixedSlot.slot);
              violation.fixed = true;
              violation.fixedWith = fixedSlot.newRestaurantName;
              fixedCount++;
              console.log(`[clustering] Fixed: Replaced with "${fixedSlot.newRestaurantName}"`);

              // Update previousCoords to the fixed restaurant
              const newCoords = fixedSlot.slot.options[0]?.activity?.place?.coordinates;
              if (newCoords && newCoords.lat !== 0) {
                previousActivityCoords = newCoords;
                previousActivityName = fixedSlot.slot.options[0]?.activity?.name || "";
              }
              violations.push(violation);
              continue;
            }
          }

          violations.push(violation);
        }
      }

      fixedSlots.push(slot);

      // Update previous coordinates for non-meal slots
      if (!isMealSlot && currentCoords && currentCoords.lat !== 0) {
        previousActivityCoords = currentCoords;
        previousActivityName = selectedOption?.activity?.name || "";
      }
    }

    fixedDays.push({
      ...day,
      slots: fixedSlots,
    });
  }

  console.log(
    `[itinerary-service] Clustering validation: ${violations.length} violations, ${fixedCount} fixed`
  );

  return {
    itinerary: {
      ...itinerary,
      days: fixedDays,
    },
    stats: {
      totalMealSlots,
      fixedMealSlots: fixedCount,
      violations,
    },
  };
}

/**
 * Try to fix a meal slot by finding nearby restaurants
 */
async function tryFixMealSlotClustering(
  slot: SlotWithOptions,
  city: string,
  nearCoords: { lat: number; lng: number },
  nearActivityName: string
): Promise<{ slot: SlotWithOptions; newRestaurantName: string } | null> {
  try {
    // Dynamic import to avoid circular dependencies
    const yelpModule = await import("./yelp");

    // Search for restaurants near the previous activity using coordinates
    const nearbyRestaurants = await yelpModule.searchRestaurantsNearby(
      nearCoords.lat,
      nearCoords.lng,
      {
        radius: MAX_WALKING_DISTANCE_METERS,
        limit: 5,
        sortBy: "rating",
      }
    );

    if (!nearbyRestaurants || nearbyRestaurants.length === 0) {
      console.log(`[clustering] No nearby restaurants found for ${city} near ${nearActivityName}`);
      return null;
    }

    // Convert Restaurant results to activity options
    const newOptions: ActivityOption[] = nearbyRestaurants.slice(0, 3).map((restaurant, index) => ({
      id: `yelp-fix-${restaurant.id}`,
      rank: index + 1,
      score: 85 - index * 5,
      activity: {
        name: restaurant.name,
        description: `${restaurant.cuisine?.[0] || "Restaurant"} - ${yelpModule.getPriceDisplay(restaurant.priceLevel)}`,
        category: "restaurant" as const,
        duration: 60,
        place: {
          name: restaurant.name,
          address: restaurant.address || "",
          neighborhood: restaurant.city || city,
          coordinates: {
            lat: restaurant.coordinates?.lat || 0,
            lng: restaurant.coordinates?.lng || 0,
          },
          rating: restaurant.rating,
          reviewCount: restaurant.reviewCount,
          photos: restaurant.imageUrl ? [restaurant.imageUrl] : [],
        },
        isFree: false,
        estimatedCost: {
          amount: restaurant.priceLevel === 1 ? 1000 : restaurant.priceLevel === 2 ? 2000 : restaurant.priceLevel === 3 ? 3500 : 5000,
          currency: "JPY",
        },
        tags: ["restaurant", "nearby-fix"],
        source: "yelp" as const,
      },
      matchReasons: [
        `Near ${nearActivityName}`,
        `${restaurant.rating} rating (${restaurant.reviewCount} reviews)`,
      ],
      tradeoffs: ["Auto-selected for proximity"],
    }));

    if (newOptions.length === 0) {
      return null;
    }

    return {
      slot: {
        ...slot,
        options: newOptions,
        selectedOptionId: null, // Reset selection
      },
      newRestaurantName: newOptions[0].activity.name,
    };
  } catch (error) {
    console.error(`[clustering] Error finding nearby restaurants:`, error);
    return null;
  }
}

// ============================================
// ENRICHMENT: FILL RESTAURANT SLOTS
// ============================================

export interface RestaurantFillingStats {
  totalMealSlots: number;
  filledSlots: number;
  emptySlots: number;
}

/**
 * Fill empty restaurant slots (lunch/dinner) with nearby restaurants
 * Uses Yelp API to find restaurants near the preceding activity
 */
async function fillRestaurantSlots(
  itinerary: StructuredItineraryData
): Promise<{
  itinerary: StructuredItineraryData;
  stats: RestaurantFillingStats;
}> {
  console.log("[itinerary-service] Filling empty restaurant slots...");

  let totalMealSlots = 0;
  let filledSlots = 0;

  const enrichedDays: DayWithOptions[] = [];

  for (const day of itinerary.days) {
    const enrichedSlots: SlotWithOptions[] = [];
    let previousActivityCoords: { lat: number; lng: number } | null = null;
    let previousActivityName = "";

    for (let slotIndex = 0; slotIndex < day.slots.length; slotIndex++) {
      const slot = day.slots[slotIndex];
      const isMealSlot = slot.slotType === "lunch" || slot.slotType === "dinner";

      // For meal slots, get coordinates from the NEXT non-meal slot
      // This way: transit to restaurant area → eat → short walk to next activity
      let nextActivityCoords: { lat: number; lng: number } | null = null;
      let nextActivityName = "";

      if (isMealSlot) {
        // Look forward at next slots to find coordinates
        for (let i = slotIndex + 1; i < day.slots.length; i++) {
          const nextSlot = day.slots[i];
          if (nextSlot.slotType !== "lunch" && nextSlot.slotType !== "dinner") {
            const selectedOption = nextSlot.options.find(o => o.id === nextSlot.selectedOptionId) || nextSlot.options[0];
            const coords = selectedOption?.activity?.place?.coordinates;
            if (coords && coords.lat !== 0) {
              nextActivityCoords = coords;
              nextActivityName = selectedOption?.activity?.name || "";
              break;
            }
          }
        }

        // If no next activity found (e.g., dinner with no evening), fall back to previous
        if (!nextActivityCoords) {
          for (let i = slotIndex - 1; i >= 0; i--) {
            const prevSlot = day.slots[i];
            if (prevSlot.slotType !== "lunch" && prevSlot.slotType !== "dinner") {
              const selectedOption = prevSlot.options.find(o => o.id === prevSlot.selectedOptionId) || prevSlot.options[0];
              const coords = selectedOption?.activity?.place?.coordinates;
              if (coords && coords.lat !== 0) {
                nextActivityCoords = coords;
                nextActivityName = selectedOption?.activity?.name || "" + " (fallback)";
                break;
              }
            }
          }
        }
      }

      if (isMealSlot) {
        totalMealSlots++;

        // Check if slot needs restaurant filling:
        // - Empty slots (no options)
        // - Slots where restaurants are too far from next activity (>1.5km)
        const hasNoOptions = !slot.options || slot.options.length === 0;

        // Check if first restaurant option is far from next activity
        let restaurantIsFarFromActivity = false;
        if (!hasNoOptions && nextActivityCoords) {
          const firstOption = slot.options[0];
          const restaurantCoords = firstOption?.activity?.place?.coordinates;
          if (restaurantCoords && restaurantCoords.lat !== 0) {
            const distanceToRestaurant = calculateHaversineDistance(
              nextActivityCoords,
              restaurantCoords
            );
            restaurantIsFarFromActivity = distanceToRestaurant > MAX_WALKING_DISTANCE_METERS;
            if (restaurantIsFarFromActivity) {
              console.log(
                `[restaurant-fill] Day ${day.dayNumber} ${slot.slotType}: "${firstOption.activity.name}" is ${Math.round(distanceToRestaurant)}m from next activity "${nextActivityName}" - TOO FAR`
              );
            }
          }
        }

        const needsFilling = hasNoOptions || restaurantIsFarFromActivity;

        console.log(
          `[restaurant-fill] Day ${day.dayNumber} ${slot.slotType}: hasOptions=${!hasNoOptions}, tooFar=${restaurantIsFarFromActivity}, needsFilling=${needsFilling}, next="${nextActivityName}"`
        );

        if (needsFilling && nextActivityCoords) {
          const filledSlot = await fillMealSlotWithNearbyRestaurants(
            slot,
            day.city,
            nextActivityCoords,
            nextActivityName,
            slot.slotType as "lunch" | "dinner"
          );

          if (filledSlot) {
            enrichedSlots.push(filledSlot);
            filledSlots++;
            console.log(
              `[restaurant-fill] Day ${day.dayNumber} ${slot.slotType}: Filled with ${filledSlot.options.length} Yelp options near next activity "${nextActivityName}"`
            );
            continue;
          } else {
            console.log(
              `[restaurant-fill] Day ${day.dayNumber} ${slot.slotType}: Failed to fill, keeping original`
            );
          }
        }
      }

      // Update coordinates tracker for ALL non-meal slots (for fallback)
      if (!isMealSlot) {
        const selectedOption = slot.options.find(o => o.id === slot.selectedOptionId) || slot.options[0];
        const coords = selectedOption?.activity?.place?.coordinates;
        if (coords && coords.lat !== 0) {
          previousActivityCoords = coords;
          previousActivityName = selectedOption?.activity?.name || "";
        }
      }

      enrichedSlots.push(slot);
    }

    enrichedDays.push({
      ...day,
      slots: enrichedSlots,
    });
  }

  console.log(
    `[itinerary-service] Restaurant filling: ${filledSlots}/${totalMealSlots} meal slots filled`
  );

  return {
    itinerary: {
      ...itinerary,
      days: enrichedDays,
    },
    stats: {
      totalMealSlots,
      filledSlots,
      emptySlots: totalMealSlots - filledSlots,
    },
  };
}

/**
 * Fill a meal slot with nearby restaurants from Yelp
 */
async function fillMealSlotWithNearbyRestaurants(
  slot: SlotWithOptions,
  city: string,
  nearCoords: { lat: number; lng: number },
  nearActivityName: string,
  mealType: "lunch" | "dinner"
): Promise<SlotWithOptions | null> {
  try {
    // Dynamic import to avoid circular dependencies
    const yelpModule = await import("./yelp");

    // Search for restaurants near the previous activity using coordinates
    const nearbyRestaurants = await yelpModule.searchRestaurantsNearby(
      nearCoords.lat,
      nearCoords.lng,
      {
        radius: MAX_WALKING_DISTANCE_METERS,
        limit: 10,
        sortBy: "rating",
      }
    );

    if (!nearbyRestaurants || nearbyRestaurants.length === 0) {
      console.log(`[restaurant-fill] No restaurants found near ${nearActivityName} in ${city}`);
      return null;
    }

    // Filter for appropriate meal type (lunch vs dinner)
    // For now, just take top-rated restaurants
    const topRestaurants = nearbyRestaurants.slice(0, 3);

    // Convert Restaurant results to activity options
    const options: ActivityOption[] = topRestaurants.map((restaurant, index) => ({
      id: `yelp-${mealType}-${restaurant.id}`,
      rank: index + 1,
      score: 85 - index * 5,
      activity: {
        name: restaurant.name,
        description: `${restaurant.cuisine?.[0] || "Restaurant"} - ${yelpModule.getPriceDisplay(restaurant.priceLevel)}`,
        category: "restaurant" as const,
        duration: mealType === "lunch" ? 60 : 90,
        place: {
          name: restaurant.name,
          address: restaurant.address || "",
          neighborhood: restaurant.city || city,
          coordinates: {
            lat: restaurant.coordinates?.lat || 0,
            lng: restaurant.coordinates?.lng || 0,
          },
          rating: restaurant.rating,
          reviewCount: restaurant.reviewCount,
          photos: restaurant.imageUrl ? [restaurant.imageUrl] : [],
        },
        isFree: false,
        estimatedCost: {
          amount: restaurant.priceLevel === 1 ? 1000 : restaurant.priceLevel === 2 ? 2000 : restaurant.priceLevel === 3 ? 3500 : 5000,
          currency: "JPY",
        },
        tags: ["restaurant", mealType],
        source: "yelp" as const,
      },
      matchReasons: [
        `${Math.round(calculateHaversineDistance(nearCoords, { lat: restaurant.coordinates?.lat || 0, lng: restaurant.coordinates?.lng || 0 }) / 100) / 10} km from ${nearActivityName}`,
        `${restaurant.rating} rating (${restaurant.reviewCount} reviews)`,
      ],
      tradeoffs: [],
    }));

    if (options.length === 0) {
      return null;
    }

    return {
      ...slot,
      options,
      selectedOptionId: null,
      behavior: "meal",
    };
  } catch (error) {
    console.error(`[restaurant-fill] Error finding restaurants for ${mealType}:`, error);
    return null;
  }
}

// ============================================
// ENRICHMENT: VIATOR TOUR ENHANCEMENTS
// ============================================

/**
 * Categories that benefit from Viator tour enhancements
 */
const VIATOR_ENHANCEABLE_CATEGORIES = [
  "temple",
  "shrine",
  "museum",
  "landmark",
  "attraction",
  "park",
  "castle",
  "palace",
  "market",
  "neighborhood",
  "district",
  "observation",
];

/**
 * Map activity keywords to Viator enhancement types
 */
function inferEnhancementType(
  title: string,
  tags: string[],
  activityCategory: string
): ViatorEnhancementType {
  const titleLower = title.toLowerCase();
  const tagsLower = tags.map((t) => t.toLowerCase()).join(" ");
  const combined = `${titleLower} ${tagsLower}`;

  if (combined.includes("skip") || combined.includes("line") || combined.includes("queue")) {
    return "skip-the-line";
  }
  if (combined.includes("private")) {
    return "private-tour";
  }
  if (combined.includes("audio") || combined.includes("self-guided")) {
    return "audio-guide";
  }
  if (combined.includes("food") || combined.includes("culinary") || combined.includes("tasting")) {
    return "food-tour";
  }
  if (combined.includes("night") || combined.includes("evening") || combined.includes("sunset")) {
    return "night-tour";
  }
  if (combined.includes("day trip") || combined.includes("full day") || combined.includes("half day")) {
    return "day-trip";
  }
  if (combined.includes("cooking") || combined.includes("class") || combined.includes("workshop")) {
    return "workshop";
  }
  if (combined.includes("combo") || combined.includes("bundle") || combined.includes("pass")) {
    return "combo-ticket";
  }
  if (combined.includes("guided") || combined.includes("tour")) {
    return "guided-tour";
  }

  // Default based on activity category
  if (activityCategory === "temple" || activityCategory === "shrine") {
    return "guided-tour";
  }
  if (activityCategory === "museum") {
    return "skip-the-line";
  }

  return "experience";
}

/**
 * Generate a match reason explaining why this tour is relevant
 */
function generateMatchReason(
  tourTitle: string,
  activityName: string,
  enhancementType: ViatorEnhancementType
): string {
  const reasons: Record<ViatorEnhancementType, string> = {
    "skip-the-line": `Skip the queues at ${activityName} with this priority access tour`,
    "guided-tour": `Get expert insights about ${activityName} with a professional guide`,
    "audio-guide": `Explore ${activityName} at your own pace with audio commentary`,
    "private-tour": `Enjoy an exclusive private experience at ${activityName}`,
    "food-tour": `Combine ${activityName} with local culinary experiences`,
    "day-trip": `Full experience including ${activityName} and nearby attractions`,
    "experience": `Enhance your visit to ${activityName} with this unique experience`,
    "combo-ticket": `Save money with bundled access to ${activityName} and more`,
    "night-tour": `Experience ${activityName} in a magical evening setting`,
    "workshop": `Hands-on learning experience near ${activityName}`,
  };

  return reasons[enhancementType] || `Enhance your visit to ${activityName}`;
}

/**
 * Determine best time of day for a Viator tour
 */
function determineTourTimeOfDay(
  title: string,
  tags: string[]
): "morning" | "afternoon" | "evening" | "flexible" {
  const combined = `${title} ${tags.join(" ")}`.toLowerCase();

  if (combined.includes("night") || combined.includes("evening") || combined.includes("sunset")) {
    return "evening";
  }
  if (combined.includes("sunrise") || combined.includes("morning") || combined.includes("early")) {
    return "morning";
  }
  if (combined.includes("afternoon")) {
    return "afternoon";
  }
  return "flexible";
}

/**
 * Extract meaningful keywords from an activity name for relevance filtering
 */
function extractKeywords(name: string): string[] {
  const stopWords = [
    "the", "a", "an", "at", "in", "on", "to", "for", "of", "and", "or",
    "visit", "tour", "trip", "area", "district", "gate", "station", "street"
  ];

  return name
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stopWords.includes(word));
}

/**
 * Use LLM (Ollama) to score Viator tour relevance for an activity
 * This provides semantic matching beyond simple keyword matching
 */
async function scoreToursWithLLM(
  activityName: string,
  activityCategory: string,
  city: string,
  tours: Array<{ title: string; description: string; productCode: string }>
): Promise<Array<{ productCode: string; score: number; reason: string }>> {
  // Only use LLM scoring if enabled and Ollama is available
  const useLLMScoring = process.env.VIATOR_LLM_SCORING === "true";
  if (!useLLMScoring || tours.length === 0) {
    return [];
  }

  try {
    const tourList = tours.slice(0, 10).map((t, i) =>
      `${i + 1}. "${t.title}" - ${t.description.slice(0, 100)}...`
    ).join("\n");

    const prompt = `You are a travel expert matching tours to activities.

Activity: "${activityName}" (${activityCategory}) in ${city}

Available tours:
${tourList}

Score each tour's relevance to the activity (0-100):
- 100: Tour specifically about this exact place/activity
- 80-99: Tour includes this place as a main stop
- 50-79: Tour is in the same area/theme
- 20-49: Loosely related
- 0-19: Not relevant

Return JSON array with format: [{"index": 1, "score": 85, "reason": "brief reason"}]
Only include tours scoring 50+. Return [] if none are relevant.`;

    // Dynamic import to avoid circular dependencies
    const { llm } = await import("./llm");

    const response = await llm.chat(
      [{ role: "user", content: prompt }],
      {
        temperature: 0.3,
        maxTokens: 500,
        providerOverride: "ollama"
      }
    );

    // Parse the response - try to extract JSON from the response
    let jsonStr = response;
    // Try to find JSON array in the response
    const jsonMatch = response.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      jsonStr = jsonMatch[0];
    }

    const scores = JSON.parse(jsonStr) as Array<{ index: number; score: number; reason: string }>;

    // Map back to product codes
    return scores
      .filter(s => s.score >= 50)
      .map(s => ({
        productCode: tours[s.index - 1]?.productCode || "",
        score: s.score,
        reason: s.reason
      }))
      .filter(s => s.productCode);

  } catch (error) {
    console.warn(`[itinerary-service] LLM tour scoring failed:`, error);
    return [];
  }
}

/**
 * Search Viator for tours related to an activity using freetext search
 * This uses the POI-specific freetext search which returns more relevant results
 */
async function searchViatorForActivity(
  activityName: string,
  activityCategory: string,
  city: string
): Promise<ViatorEnhancement[]> {
  // Dynamic import to avoid circular dependencies
  const viator = await import("./viator");

  try {
    // Normalize activity name for search (remove macrons, add "Temple"/"Shrine" suffix if applicable)
    const normalizedName = activityName
      .replace(/ō/g, "o")
      .replace(/ū/g, "u")
      .replace(/ā/g, "a")
      .replace(/ē/g, "e")
      .replace(/ī/g, "i");

    // Add category suffix for better search results (e.g., "Senso-ji" → "Senso-ji Temple")
    let searchName = normalizedName;
    if (activityCategory === "temple" && !normalizedName.toLowerCase().includes("temple")) {
      searchName = `${normalizedName} Temple`;
    } else if (activityCategory === "shrine" && !normalizedName.toLowerCase().includes("shrine")) {
      searchName = `${normalizedName} Shrine`;
    }

    // DON'T add city to search term - Viator freetext works better with just the activity name
    // Adding city dilutes results (e.g., "Senso-ji Temple" finds better tours than "Senso-ji Temple Tokyo")
    const searchTerm = searchName;

    console.log(`[itinerary-service] Searching Viator freetext for: "${searchTerm}" (original: "${activityName}", city: ${city})`);

    // Use freetext search for POI-specific results
    const results = await viator.searchProductsFreetext({
      searchTerm,
      count: 15, // Request more so we can filter
      currency: "USD",
    });

    // Check if we have products
    const products = results.products?.results || [];

    if (products.length === 0) {
      console.log(`[itinerary-service] No Viator products found for "${activityName}"`);
      return [];
    }

    console.log(`[itinerary-service] Found ${products.length} Viator products for "${activityName}", filtering for relevance...`);

    // Filter and score products for relevance to the activity AND city
    const activityKeywords = extractKeywords(activityName);
    const cityLower = city.toLowerCase();

    // Define major Japan cities for cross-city filtering
    const japanCities = ["tokyo", "kyoto", "osaka", "nara", "hiroshima", "yokohama", "kobe", "nagoya", "fukuoka", "sapporo", "sendai", "kanazawa"];
    const otherCities = japanCities.filter(c => c !== cityLower);

    // Exclude patterns for day trips / different destinations
    const excludePatterns = [
      /mt\.?\s*fuji/i,
      /hakone/i,
      /nikko/i,
      /kamakura/i,
      /day\s*trip/i,
    ];
    const activityMentionsExcluded = excludePatterns.some(pattern => pattern.test(activityName));

    // First pass: hard filter (exclude wrong cities and unrelated destinations)
    const cityFilteredProducts = products.filter((product) => {
      const titleLower = product.title.toLowerCase();

      // HARD FILTER 1: Check if tour is for a DIFFERENT city
      const mentionsOtherCity = otherCities.some(otherCity => titleLower.includes(otherCity));
      const mentionsOurCity = titleLower.includes(cityLower);

      if (mentionsOtherCity && !mentionsOurCity) {
        console.log(`[itinerary-service] Excluding tour "${product.title}" - different city (looking for ${city})`);
        return false;
      }

      // HARD FILTER 2: Exclude tours for unrelated destinations (unless activity mentions them)
      const tourMentionsExcluded = excludePatterns.some(pattern => pattern.test(product.title));
      if (tourMentionsExcluded && !activityMentionsExcluded) {
        console.log(`[itinerary-service] Excluding tour "${product.title}" - unrelated destination`);
        return false;
      }

      return true;
    });

    console.log(`[itinerary-service] ${cityFilteredProducts.length} products after city/destination filtering`);

    if (cityFilteredProducts.length === 0) {
      console.log(`[itinerary-service] No Viator tours in ${city} for "${activityName}"`);
      return [];
    }

    // Second pass: score products by relevance (higher score = more relevant)
    const scoredProducts = cityFilteredProducts.map((product) => {
      const titleLower = product.title.toLowerCase();
      const descLower = (product.shortDescription || product.description || "").toLowerCase();
      const combinedText = `${titleLower} ${descLower}`;
      let score = 0;

      // Normalize activity name for matching (handle special characters like ō)
      const activityNameLower = activityName.toLowerCase();
      const activityNameNormalized = activityNameLower
        .replace(/ō/g, "o")
        .replace(/ū/g, "u")
        .replace(/ā/g, "a")
        .replace(/ē/g, "e")
        .replace(/ī/g, "i");

      const titleNormalized = titleLower
        .replace(/ō/g, "o")
        .replace(/ū/g, "u")
        .replace(/ā/g, "a")
        .replace(/ē/g, "e")
        .replace(/ī/g, "i");

      const descNormalized = descLower
        .replace(/ō/g, "o")
        .replace(/ū/g, "u")
        .replace(/ā/g, "a")
        .replace(/ē/g, "e")
        .replace(/ī/g, "i");

      // HIGHEST PRIORITY: Check if the activity name appears in tour title (exact or normalized)
      if (titleLower.includes(activityNameLower) || titleNormalized.includes(activityNameNormalized)) {
        score += 100; // Very strong match - tour specifically mentions this place
        console.log(`[itinerary-service] Strong match: "${product.title}" contains "${activityName}"`);
      }

      // HIGH PRIORITY: Check if activity name appears in description
      if (descLower.includes(activityNameLower) || descNormalized.includes(activityNameNormalized)) {
        score += 50; // Tour description mentions this place
      }

      // Check word matches from activity name (e.g., "Sensō" from "Sensō-ji")
      const activityWords = activityNameLower
        .split(/[\s\-]+/)
        .filter(word => word.length >= 3)
        .map(w => w.replace(/ō/g, "o").replace(/ū/g, "u").replace(/ā/g, "a"));

      for (const word of activityWords) {
        if (titleNormalized.includes(word)) {
          score += 30; // Significant word match in title
        } else if (descNormalized.includes(word)) {
          score += 15; // Word match in description
        }
      }

      // Check if tour title/description contains any activity keywords
      const keywordMatches = activityKeywords.filter(
        (keyword) => {
          const keywordNorm = keyword.replace(/ō/g, "o").replace(/ū/g, "u").replace(/ā/g, "a");
          return titleNormalized.includes(keywordNorm) || descNormalized.includes(keywordNorm);
        }
      );
      score += keywordMatches.length * 10;

      // Boost if tour mentions our city explicitly
      if (titleLower.includes(cityLower)) {
        score += 5;
      }

      // Boost highly rated tours
      if (product.reviews?.combinedAverageRating && product.reviews.combinedAverageRating >= 4.5) {
        score += 3;
      }

      // Boost if tour has high review count (popular tour)
      if (product.reviews?.totalReviews && product.reviews.totalReviews >= 100) {
        score += 2;
      }

      return { product, score };
    });

    // Sort by score (highest first)
    scoredProducts.sort((a, b) => b.score - a.score);

    // Take top products - prefer high scorers but include some if none score well
    let topProducts: Array<{ product: typeof scoredProducts[0]["product"]; score: number; llmScore?: number; llmReason?: string }> =
      scoredProducts.slice(0, 5);

    console.log(`[itinerary-service] Top scored products (keyword): ${topProducts.map(p => `"${p.product.title}" (${p.score})`).join(", ")}`);

    // Optionally use LLM for better relevance scoring
    const llmScores = await scoreToursWithLLM(
      activityName,
      activityCategory,
      city,
      topProducts.map(p => ({
        title: p.product.title,
        description: p.product.shortDescription || p.product.description || "",
        productCode: p.product.productCode,
      }))
    );

    // If LLM scoring returned results, re-rank based on LLM scores
    if (llmScores.length > 0) {
      console.log(`[itinerary-service] LLM re-scored: ${llmScores.map(s => `"${s.productCode}" (${s.score})`).join(", ")}`);

      // Create a map of LLM scores
      const llmScoreMap = new Map(llmScores.map(s => [s.productCode, s]));

      // Re-sort based on LLM scores (higher is better)
      topProducts = topProducts
        .map(p => ({
          ...p,
          llmScore: llmScoreMap.get(p.product.productCode)?.score || 0,
          llmReason: llmScoreMap.get(p.product.productCode)?.reason,
        }))
        .sort((a, b) => (b.llmScore || 0) - (a.llmScore || 0));

      console.log(`[itinerary-service] After LLM re-ranking: ${topProducts.map(p => `"${p.product.title}" (llm:${p.llmScore})`).join(", ")}`);
    }

    // Take top 3 for final results
    const relevantProducts = topProducts.slice(0, 3).map(p => p.product);

    // Convert to ViatorEnhancement format (take top 3 relevant)
    const enhancements: ViatorEnhancement[] = relevantProducts.slice(0, 3).map((product) => {
      const tags = viator.getTagNames(
        Array.isArray(product.tags)
          ? product.tags.map((t) => (typeof t === "number" ? t : t.tagId)).filter((id) => id > 0)
          : []
      );

      const enhancementType = inferEnhancementType(product.title, tags, activityCategory);
      const duration = viator.getProductDuration(product) || 120;

      return {
        productCode: product.productCode,
        title: product.title,
        description: product.shortDescription || product.description || "",
        enhancementType,
        price: {
          amount: product.pricing?.summary?.fromPrice || 0,
          currency: product.pricing?.currency || "USD",
          originalAmount: product.pricing?.summary?.fromPriceBeforeDiscount,
        },
        duration,
        rating: product.reviews?.combinedAverageRating,
        reviewCount: product.reviews?.totalReviews,
        bookingUrl: viator.getBookingUrl(product),
        confirmationType: product.confirmationType === "INSTANT" ? "instant" : "manual",
        imageUrl: viator.getProductImageUrl(product),
        matchReason: generateMatchReason(product.title, activityName, enhancementType),
        flags: {
          skipTheLine: product.flags?.includes("SKIP_THE_LINE"),
          freeCancellation: product.flags?.includes("FREE_CANCELLATION"),
          likelyToSellOut: product.flags?.includes("LIKELY_TO_SELL_OUT"),
          newOnViator: product.flags?.includes("NEW_ON_VIATOR"),
          privateOption: product.title.toLowerCase().includes("private"),
        },
        bestTimeOfDay: determineTourTimeOfDay(product.title, tags),
        tags,
      };
    });

    return enhancements;
  } catch (error) {
    console.warn(`[itinerary-service] Viator freetext search failed for "${activityName}" in ${city}:`, error);
    return [];
  }
}

export interface ViatorEnrichmentStats {
  totalActivities: number;
  enhancedActivities: number;
  totalTours: number;
  searchDuration: number;
}

/**
 * Enrich itinerary activities with optional Viator tour enhancements
 *
 * For activities like temples, museums, and landmarks, this finds relevant
 * Viator tours that can enhance the experience (guided tours, skip-the-line, etc.)
 */
export async function enrichWithViatorTours(
  itinerary: StructuredItineraryData,
  options?: {
    maxToursPerActivity?: number;
    onlyTopRankedActivities?: boolean;
  }
): Promise<{
  itinerary: StructuredItineraryData;
  stats: ViatorEnrichmentStats;
}> {
  const startTime = Date.now();
  const maxTours = options?.maxToursPerActivity ?? 3;
  const onlyTopRanked = options?.onlyTopRankedActivities ?? true;

  console.log("[itinerary-service] Enriching with Viator tour enhancements...");

  let totalActivities = 0;
  let enhancedActivities = 0;
  let totalTours = 0;

  // Collect activities that could benefit from tour enhancements
  const activitiesToEnrich: Array<{
    dayIndex: number;
    slotIndex: number;
    optionIndex: number;
    activity: ActivityOption;
    city: string;
  }> = [];

  for (let dayIndex = 0; dayIndex < itinerary.days.length; dayIndex++) {
    const day = itinerary.days[dayIndex];

    for (let slotIndex = 0; slotIndex < day.slots.length; slotIndex++) {
      const slot = day.slots[slotIndex];

      for (let optionIndex = 0; optionIndex < slot.options.length; optionIndex++) {
        const option = slot.options[optionIndex];
        totalActivities++;

        // Skip if only enhancing top-ranked and this isn't rank 1
        if (onlyTopRanked && option.rank !== 1) {
          continue;
        }

        // Check if this activity category could benefit from tours
        const category = option.activity.category.toLowerCase();
        if (VIATOR_ENHANCEABLE_CATEGORIES.some((c) => category.includes(c))) {
          activitiesToEnrich.push({
            dayIndex,
            slotIndex,
            optionIndex,
            activity: option,
            city: day.city,
          });
        }
      }
    }
  }

  console.log(`[itinerary-service] Found ${activitiesToEnrich.length} activities to enrich with Viator tours`);

  // Create a deep copy of the itinerary for enrichment
  const enrichedItinerary: StructuredItineraryData = JSON.parse(JSON.stringify(itinerary));

  // Process in batches to avoid rate limiting
  const BATCH_SIZE = 5;
  for (let i = 0; i < activitiesToEnrich.length; i += BATCH_SIZE) {
    const batch = activitiesToEnrich.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async ({ dayIndex, slotIndex, optionIndex, activity, city }) => {
        const enhancements = await searchViatorForActivity(
          activity.activity.name,
          activity.activity.category,
          city
        );

        return {
          dayIndex,
          slotIndex,
          optionIndex,
          enhancements: enhancements.slice(0, maxTours),
        };
      })
    );

    // Apply results to enriched itinerary
    for (const result of batchResults) {
      if (result.enhancements.length > 0) {
        const day = enrichedItinerary.days[result.dayIndex];
        const slot = day.slots[result.slotIndex];
        const option = slot.options[result.optionIndex];

        option.viatorEnhancements = result.enhancements;
        enhancedActivities++;
        totalTours += result.enhancements.length;

        console.log(
          `[itinerary-service] Added ${result.enhancements.length} Viator tours to "${option.activity.name}"`
        );
      }
    }

    // Small delay between batches to respect rate limits
    if (i + BATCH_SIZE < activitiesToEnrich.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  const searchDuration = Date.now() - startTime;
  console.log(
    `[itinerary-service] Viator enrichment complete: ${enhancedActivities}/${activitiesToEnrich.length} activities enhanced with ${totalTours} tours in ${searchDuration}ms`
  );

  return {
    itinerary: enrichedItinerary,
    stats: {
      totalActivities,
      enhancedActivities,
      totalTours,
      searchDuration,
    },
  };
}

// ============================================
// EXPORTS
// ============================================

export const itineraryService = {
  generate,
  getProvider: getItineraryProvider,
  getConfig: getItineraryConfig,
  getProviderInfo,
};

export default itineraryService;
