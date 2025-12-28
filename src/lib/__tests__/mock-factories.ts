// ============================================
// MOCK DATA FACTORIES
// ============================================
// Factory functions to create realistic test data for integration tests

import {
  CoreActivity,
  RestaurantActivity,
  ScoredActivity,
  TripMode,
  ActivityCategory,
  MealType,
  TimeOfDay,
  TravelerComposition,
  WeatherForecast,
  WeatherCondition,
  EntityIds,
  LocalizedAddress,
  Coordinates,
} from "@/types/activity-suggestion";

// ============================================
// ID GENERATORS
// ============================================

let idCounter = 0;

export function resetIdCounter(): void {
  idCounter = 0;
}

export function generateMockId(prefix: string = "mock"): string {
  idCounter++;
  return `${prefix}-${idCounter}-${Date.now()}`;
}

// ============================================
// COORDINATE FACTORIES
// ============================================

export const MOCK_DESTINATIONS = {
  tokyo: { lat: 35.6762, lng: 139.6503, city: "Tokyo", country: "Japan" },
  paris: { lat: 48.8566, lng: 2.3522, city: "Paris", country: "France" },
  nyc: { lat: 40.7128, lng: -74.006, city: "New York", country: "USA" },
  london: { lat: 51.5074, lng: -0.1278, city: "London", country: "UK" },
  barcelona: { lat: 41.3851, lng: 2.1734, city: "Barcelona", country: "Spain" },
};

export function createMockCoordinates(
  base: Coordinates = MOCK_DESTINATIONS.tokyo,
  jitter: number = 0.01
): Coordinates {
  return {
    lat: base.lat + (Math.random() - 0.5) * jitter,
    lng: base.lng + (Math.random() - 0.5) * jitter,
  };
}

// ============================================
// ADDRESS FACTORY
// ============================================

export function createMockAddress(
  city: string = "Tokyo",
  country: string = "Japan"
): LocalizedAddress {
  return {
    formatted: `${Math.floor(Math.random() * 100) + 1} Mock Street, ${city}`,
    city,
    country,
    neighborhood: `${city} District ${Math.floor(Math.random() * 10) + 1}`,
    postalCode: `${Math.floor(Math.random() * 90000) + 10000}`,
  };
}

// ============================================
// ENTITY IDS FACTORY
// ============================================

export function createMockEntityIds(): EntityIds {
  return {
    internalId: generateMockId("internal"),
    googlePlaceId: `ChIJ${Math.random().toString(36).substring(2, 15)}`,
    yelpId: `yelp-${Math.random().toString(36).substring(2, 10)}`,
  };
}

// ============================================
// CORE ACTIVITY FACTORY
// ============================================

const ACTIVITY_NAMES: Record<ActivityCategory, string[]> = {
  temple: ["Senso-ji Temple", "Meiji Shrine", "Golden Pavilion", "Fushimi Inari"],
  shrine: ["Meiji Jingu", "Yasukuni Shrine", "Ise Grand Shrine"],
  museum: ["Tokyo National Museum", "teamLab Borderless", "Mori Art Museum"],
  park: ["Ueno Park", "Yoyogi Park", "Shinjuku Gyoen"],
  garden: ["Rikugien Garden", "Koishikawa Korakuen", "Hamarikyu Gardens"],
  landmark: ["Tokyo Tower", "Shibuya Crossing", "Imperial Palace"],
  neighborhood: ["Shinjuku", "Shibuya", "Ginza", "Harajuku"],
  market: ["Tsukiji Outer Market", "Ameyoko Market", "Nishiki Market"],
  shopping: ["Takeshita Street", "Ginza Shopping District", "Akihabara"],
  entertainment: ["Robot Restaurant", "Kabuki Theater", "Sumo Tournament"],
  nature: ["Mount Fuji View", "Arashiyama Bamboo Grove", "Lake Kawaguchi"],
  viewpoint: ["Tokyo Skytree", "Mori Tower Observatory", "Tokyo Metropolitan Building"],
  "cultural-experience": ["Tea Ceremony", "Kimono Rental", "Sushi Making Class"],
  "food-tour": ["Tsukiji Food Tour", "Ramen Walking Tour", "Izakaya Hopping"],
  "walking-tour": ["Asakusa Walking Tour", "Old Tokyo Tour", "Night Tour"],
  "day-trip": ["Nikko Day Trip", "Hakone Trip", "Kamakura Excursion"],
  nightlife: ["Shinjuku Golden Gai", "Roppongi", "Shibuya Night"],
  relaxation: ["Onsen Visit", "Spa Day", "Zen Garden Meditation"],
  adventure: ["Go-Kart Tour", "Hiking Trail", "Cycling Tour"],
  "family-activity": ["Disney Tokyo", "Ghibli Museum", "Pokemon Center"],
  "photo-spot": ["Rainbow Bridge", "Senso-ji at Night", "Cherry Blossom Spot"],
};

const ACTIVITY_DESCRIPTIONS: Record<ActivityCategory, string> = {
  temple: "A historic Buddhist temple with beautiful architecture and serene atmosphere.",
  shrine: "A sacred Shinto shrine offering traditional Japanese spiritual experience.",
  museum: "World-class museum featuring fascinating exhibitions and interactive displays.",
  park: "Beautiful urban park perfect for relaxation and people-watching.",
  garden: "Traditional Japanese garden with meticulously maintained landscapes.",
  landmark: "Iconic landmark that defines the city skyline.",
  neighborhood: "Vibrant neighborhood with unique character and atmosphere.",
  market: "Bustling market with fresh produce, street food, and local specialties.",
  shopping: "Premier shopping destination with diverse retail options.",
  entertainment: "Unique entertainment experience you won't find anywhere else.",
  nature: "Stunning natural scenery and outdoor adventure.",
  viewpoint: "Breathtaking panoramic views of the cityscape.",
  "cultural-experience": "Immersive cultural activity to experience local traditions.",
  "food-tour": "Culinary adventure exploring local flavors and hidden gems.",
  "walking-tour": "Guided walking tour through historic streets and sites.",
  "day-trip": "Full-day excursion to nearby attractions.",
  nightlife: "Exciting nightlife scene with bars, clubs, and entertainment.",
  relaxation: "Peaceful retreat for rest and rejuvenation.",
  adventure: "Thrilling outdoor activity for adventure seekers.",
  "family-activity": "Fun-filled activity perfect for families with children.",
  "photo-spot": "Instagram-worthy location for memorable photos.",
};

export function createMockCoreActivity(
  overrides: Partial<CoreActivity> = {}
): CoreActivity {
  const category: ActivityCategory = overrides.category ||
    (Object.keys(ACTIVITY_NAMES) as ActivityCategory[])[
      Math.floor(Math.random() * Object.keys(ACTIVITY_NAMES).length)
    ];

  const names = ACTIVITY_NAMES[category];
  const name = overrides.name || names[Math.floor(Math.random() * names.length)];

  const baseLocation = MOCK_DESTINATIONS.tokyo;

  return {
    id: generateMockId("activity"),
    entityIds: createMockEntityIds(),
    source: "ai-generated",
    name,
    description: overrides.description || ACTIVITY_DESCRIPTIONS[category],
    category,
    localTip: "Arrive early to avoid crowds. Locals recommend visiting on weekday mornings.",
    location: createMockCoordinates(baseLocation),
    address: createMockAddress(baseLocation.city, baseLocation.country),
    neighborhood: `${baseLocation.city} Area ${Math.floor(Math.random() * 5) + 1}`,
    bestTimeOfDay: ["morning", "afternoon"] as TimeOfDay[],
    recommendedDuration: Math.floor(Math.random() * 120) + 60, // 60-180 mins
    requiresBooking: Math.random() > 0.7,
    isFree: Math.random() > 0.6,
    estimatedCost: Math.random() > 0.6 ? undefined : {
      amount: Math.floor(Math.random() * 50) + 10,
      currency: "USD",
    },
    familyFriendly: Math.random() > 0.3,
    soloFriendly: true,
    groupFriendly: true,
    isOutdoor: category === "park" || category === "nature" || category === "garden",
    weatherSensitive: category === "park" || category === "nature",
    rating: 4 + Math.random(),
    reviewCount: Math.floor(Math.random() * 5000) + 100,
    imageUrl: `https://example.com/images/${name.toLowerCase().replace(/\s+/g, "-")}.jpg`,
    tags: [category, "popular", "must-see"],
    confidence: 0.85 + Math.random() * 0.15,
    ...overrides,
  };
}

// ============================================
// RESTAURANT FACTORY
// ============================================

const CUISINE_TYPES = [
  "Japanese", "Sushi", "Ramen", "Izakaya", "Tempura",
  "Italian", "French", "Chinese", "Korean", "Thai",
];

const RESTAURANT_NAMES = [
  "Sakura Sushi", "Golden Dragon", "Le Petit Bistro",
  "Ramen Master", "Tokyo Grill", "Bamboo Garden",
  "Sunset Terrace", "The Local Kitchen", "Noodle House",
];

export function createMockRestaurant(
  overrides: Partial<RestaurantActivity> = {}
): RestaurantActivity {
  const mealTypes: MealType[] = ["lunch", "dinner"];
  const baseLocation = MOCK_DESTINATIONS.tokyo;

  return {
    id: generateMockId("restaurant"),
    entityIds: createMockEntityIds(),
    source: "yelp",
    name: overrides.name || RESTAURANT_NAMES[Math.floor(Math.random() * RESTAURANT_NAMES.length)],
    description: "Authentic local cuisine with fresh ingredients and excellent service.",
    category: "restaurant",
    mealType: overrides.mealType || [mealTypes[Math.floor(Math.random() * mealTypes.length)]],
    cuisineTypes: [CUISINE_TYPES[Math.floor(Math.random() * CUISINE_TYPES.length)]],
    dietaryOptions: ["vegetarian"],
    priceLevel: (Math.floor(Math.random() * 4) + 1) as 1 | 2 | 3 | 4,
    reservationRequired: Math.random() > 0.5,
    hasKidsMenu: Math.random() > 0.5,
    noiseLevel: "moderate",
    location: createMockCoordinates(baseLocation),
    address: createMockAddress(baseLocation.city, baseLocation.country),
    neighborhood: `${baseLocation.city} Area ${Math.floor(Math.random() * 5) + 1}`,
    bestTimeOfDay: ["afternoon", "evening"] as TimeOfDay[],
    recommendedDuration: 60 + Math.floor(Math.random() * 30),
    requiresBooking: Math.random() > 0.6,
    isFree: false,
    estimatedCost: {
      amount: Math.floor(Math.random() * 80) + 20,
      currency: "USD",
    },
    familyFriendly: true,
    soloFriendly: true,
    groupFriendly: true,
    isOutdoor: false,
    weatherSensitive: false,
    rating: 4 + Math.random(),
    reviewCount: Math.floor(Math.random() * 2000) + 50,
    tags: ["food", "dining", "local"],
    confidence: 0.9,
    ...overrides,
  };
}

// ============================================
// SCORED ACTIVITY FACTORY
// ============================================

export function createMockScoredActivity(
  activity?: CoreActivity | RestaurantActivity,
  overrides: Partial<ScoredActivity> = {}
): ScoredActivity {
  const actualActivity = activity || createMockCoreActivity();
  const totalScore = overrides.totalScore ?? Math.floor(Math.random() * 30) + 70;

  return {
    activity: actualActivity,
    totalScore,
    scoreBreakdown: {
      interestMatch: Math.floor(totalScore * 0.25),
      timeOfDayFit: Math.floor(totalScore * 0.20),
      durationFit: Math.floor(totalScore * 0.15),
      budgetMatch: Math.floor(totalScore * 0.15),
      weatherFit: Math.floor(totalScore * 0.10),
      varietyBonus: Math.floor(totalScore * 0.10),
      ratingBonus: Math.floor(totalScore * 0.05),
      modeAdjustment: 0,
    },
    explanation: `Selected for its high rating and fit with your ${actualActivity.category} interests.`,
    confidence: 0.85 + Math.random() * 0.15,
    ...overrides,
  };
}

// ============================================
// TRAVELER COMPOSITION FACTORY
// ============================================

export function createMockTravelers(
  mode: TripMode = "couples",
  overrides: Partial<TravelerComposition> = {}
): TravelerComposition {
  const defaults: Record<TripMode, Partial<TravelerComposition>> = {
    couples: { adults: 2, children: 0, infants: 0, needsRomantic: true },
    family: { adults: 2, children: 2, infants: 0, needsKidFriendly: true },
    solo: { adults: 1, children: 0, infants: 0 },
    friends: { adults: 4, children: 0, infants: 0, prefersSocialSpots: true },
    honeymoon: { adults: 2, children: 0, infants: 0, needsRomantic: true },
    babymoon: { adults: 2, children: 0, infants: 0, needsRomantic: true },
    "multi-generational": { adults: 4, children: 2, seniors: 2, needsAccessible: true },
    "girls-trip": { adults: 4, children: 0, infants: 0, prefersSocialSpots: true },
    "guys-trip": { adults: 4, children: 0, infants: 0, prefersSocialSpots: true },
  };

  return {
    mode,
    adults: 2,
    children: 0,
    infants: 0,
    needsKidFriendly: false,
    needsRomantic: false,
    needsAccessible: false,
    allowsAdultVenues: true,
    prefersSocialSpots: false,
    ...defaults[mode],
    ...overrides,
  };
}

// ============================================
// WEATHER FORECAST FACTORY
// ============================================

const WEATHER_CONDITIONS: WeatherCondition[] = [
  "sunny", "partly-cloudy", "cloudy", "rainy", "snowy", "stormy", "foggy"
];

export function createMockWeatherForecast(
  date: string,
  overrides: Partial<WeatherForecast> = {}
): WeatherForecast {
  return {
    date,
    temperature: {
      min: 15 + Math.floor(Math.random() * 10),
      max: 25 + Math.floor(Math.random() * 10),
    },
    condition: WEATHER_CONDITIONS[Math.floor(Math.random() * WEATHER_CONDITIONS.length)],
    precipitationProbability: Math.floor(Math.random() * 100),
    humidity: 50 + Math.floor(Math.random() * 30),
    windSpeed: 5 + Math.floor(Math.random() * 20),
    sunrise: "06:00",
    sunset: "18:30",
    ...overrides,
  };
}

// ============================================
// BATCH GENERATORS
// ============================================

export function createMockActivityPool(
  count: number = 20,
  options: {
    destination?: keyof typeof MOCK_DESTINATIONS;
    includeRestaurants?: boolean;
    restaurantRatio?: number;
  } = {}
): (CoreActivity | RestaurantActivity)[] {
  const { includeRestaurants = true, restaurantRatio = 0.3 } = options;
  const activities: (CoreActivity | RestaurantActivity)[] = [];

  for (let i = 0; i < count; i++) {
    if (includeRestaurants && Math.random() < restaurantRatio) {
      activities.push(createMockRestaurant());
    } else {
      activities.push(createMockCoreActivity());
    }
  }

  return activities;
}

export function createMockScoredActivities(
  count: number = 20,
  options: {
    minScore?: number;
    maxScore?: number;
  } = {}
): ScoredActivity[] {
  const { minScore = 60, maxScore = 100 } = options;
  const activities = createMockActivityPool(count);

  return activities.map((activity) =>
    createMockScoredActivity(activity, {
      totalScore: minScore + Math.floor(Math.random() * (maxScore - minScore)),
    })
  ).sort((a, b) => b.totalScore - a.totalScore);
}

export function createMockWeatherForecasts(
  startDate: string,
  days: number
): WeatherForecast[] {
  const forecasts: WeatherForecast[] = [];
  const start = new Date(startDate);

  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    forecasts.push(createMockWeatherForecast(date.toISOString().split("T")[0]));
  }

  return forecasts;
}

// ============================================
// ITINERARY REQUEST FACTORY
// ============================================

export function createMockGenerateRequest(
  overrides: Record<string, any> = {}
): Record<string, any> {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 7); // 1 week from now
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 4); // 5 day trip

  return {
    destination: {
      name: "Tokyo",
      coordinates: MOCK_DESTINATIONS.tokyo,
      country: "Japan",
    },
    startDate: startDate.toISOString().split("T")[0],
    endDate: endDate.toISOString().split("T")[0],
    travelers: {
      adults: 2,
      children: 0,
      infants: 0,
    },
    tripMode: "couples",
    pace: "normal",
    budget: "moderate",
    interests: ["culture", "food", "nature"],
    ...overrides,
  };
}
