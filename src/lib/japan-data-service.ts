// ============================================
// Japan Local Data Service
// Loads and serves locally curated Japan POI data
// This is a development service that can be replaced with real APIs in production
// ============================================

import { promises as fs } from "fs";
import path from "path";

// ============================================
// Types
// ============================================

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface JapanPOI {
  id: string;
  name: string;
  nameJa: string;
  category: string;
  subcategory?: string;
  coordinates: Coordinates;
  rating: number;
  reviewCount: number;
  photos: string[];
  address?: string;
  neighborhood?: string;
  website?: string;
  openingHours?: string;
  distance?: number;
  walkTime?: number;
}

// Ticket requirement types
export type TicketRequirement = "required" | "optional" | "free";

// Linked Klook experience for a POI
export interface LinkedExperience {
  id: string;
  provider: "klook";
  name: string;
  category: string;
  description?: string;
  price?: {
    amount: number;
    currency: string;
    display: string;
  };
  rating?: number;
  bookingCount?: number;
  url?: string;
  image?: string;
  // Whether this is for entry ticket or enhancement
  experienceType: "entry-ticket" | "skip-line" | "guided-tour" | "audio-guide" | "experience" | "day-trip";
}

// Ticket info from enhanced data
export interface TicketInfo {
  requirement: TicketRequirement;
  fee: string;
  source: "curated" | "wikidata" | "osm" | "klook" | "klook-inferred" | "category" | "default";
  confidence: number;
  wikidataId?: string;
  // Booking requirement info
  bookingAdvice?: {
    advanceBookingRequired: boolean;
    recommendedBookingDays?: number; // Days in advance to book
    walkUpAvailable?: boolean;
    peakTimes?: string[]; // e.g., ["weekends", "holidays", "cherry blossom season"]
    tips?: string;
  };
}

export interface MustSeePOI extends JapanPOI {
  rank: number;
  mustSeeScore: number;
  nearbyAttractions: JapanPOI[];
  nearbyRestaurants: JapanPOI[];
  // Linked paid experiences from Klook
  paidExperiences?: LinkedExperience[];
  // Ticket info from enhanced data
  ticketInfo?: TicketInfo;
}

export interface EnhancedCityData {
  city: string;
  cityJa: string;
  country: string;
  lastEnhanced: string;
  stats: {
    totalPOIs: number;
    mustSeeCount: number;
    clusterCount: number;
    attractionCount: number;
    restaurantCount: number;
    paidExperienceCount: number;
  };
  mustSee: {
    overall: MustSeePOI[];
  };
}

export interface KlookActivity {
  id: string;
  klookId: string;
  name: string;
  description: string;
  category: string;
  categoryOriginal: string;
  location: string;
  city: string;
  url: string;
  image: string;
  rating: number;
  reviewCount: number | null;
  bookingCount: number;
  price: {
    amount: number;
    currency: string;
    display: string;
  };
  provider: string;
  sku: number;
}

export interface KlookCityData {
  source: string;
  city: string;
  extractedAt: string;
  count: number;
  activities: KlookActivity[];
}

export interface CityDataIndex {
  [cityKey: string]: {
    file: string;
    city: string;
    stats: EnhancedCityData["stats"];
    topMustSee: Array<{ name: string; category: string; rating: number }>;
    clusterCount: number;
  };
}

// ============================================
// Cache
// ============================================

const cityDataCache = new Map<string, EnhancedCityData>();
const klookDataCache = new Map<string, KlookCityData>();
let indexCache: CityDataIndex | null = null;

/**
 * Clear all caches - useful for development when data files change
 */
export function clearAllCaches(): void {
  console.log("[japan-data-service] Clearing all caches");
  cityDataCache.clear();
  klookDataCache.clear();
  indexCache = null;
}

// ============================================
// Geocoding - Known Location Coordinates
// ============================================

/**
 * Known location coordinates for geocoding Klook activities
 * These are well-known areas/landmarks that Klook uses in their location field
 */
const KNOWN_LOCATION_COORDS: Record<string, Coordinates> = {
  // Tokyo areas
  "tokyo": { lat: 35.6762, lng: 139.6503 },
  "shibuya": { lat: 35.6580, lng: 139.7016 },
  "shinjuku": { lat: 35.6938, lng: 139.7034 },
  "harajuku": { lat: 35.6702, lng: 139.7027 },
  "akihabara": { lat: 35.7023, lng: 139.7745 },
  "ginza": { lat: 35.6717, lng: 139.7649 },
  "asakusa": { lat: 35.7148, lng: 139.7967 },
  "ueno": { lat: 35.7141, lng: 139.7774 },
  "roppongi": { lat: 35.6628, lng: 139.7315 },
  "odaiba": { lat: 35.6295, lng: 139.7753 },
  "ikebukuro": { lat: 35.7295, lng: 139.7109 },
  "tokyo station": { lat: 35.6812, lng: 139.7671 },
  "skytree": { lat: 35.7101, lng: 139.8107 },
  "urayasu": { lat: 35.6539, lng: 139.8985 }, // Tokyo Disney area
  "tokyo disney": { lat: 35.6329, lng: 139.8804 },
  "maihama": { lat: 35.6329, lng: 139.8804 },
  "toyosu": { lat: 35.6569, lng: 139.7874 },
  "tsukiji": { lat: 35.6654, lng: 139.7707 },
  "meguro": { lat: 35.6340, lng: 139.7160 },
  "nakano": { lat: 35.7074, lng: 139.6659 },
  "shimokitazawa": { lat: 35.6614, lng: 139.6680 },
  "ebisu": { lat: 35.6469, lng: 139.7100 },
  "daikanyama": { lat: 35.6484, lng: 139.7030 },
  "azabu": { lat: 35.6548, lng: 139.7368 },

  // Kyoto areas
  "kyoto": { lat: 35.0116, lng: 135.7681 },
  "gion": { lat: 35.0037, lng: 135.7759 },
  "arashiyama": { lat: 35.0094, lng: 135.6667 },
  "fushimi": { lat: 34.9671, lng: 135.7727 },
  "higashiyama": { lat: 35.0000, lng: 135.7800 },
  "kiyomizu": { lat: 34.9949, lng: 135.7850 },
  "nijo": { lat: 35.0142, lng: 135.7479 },
  "kawaramachi": { lat: 35.0050, lng: 135.7680 },

  // Osaka areas
  "osaka": { lat: 34.6937, lng: 135.5023 },
  "dotonbori": { lat: 34.6687, lng: 135.5031 },
  "namba": { lat: 34.6659, lng: 135.5009 },
  "umeda": { lat: 34.7024, lng: 135.4959 },
  "shinsekai": { lat: 34.6523, lng: 135.5062 },
  "tennoji": { lat: 34.6470, lng: 135.5132 },
  "universal city": { lat: 34.6654, lng: 135.4321 },
  "usj": { lat: 34.6654, lng: 135.4321 },

  // Other Japan cities
  "nara": { lat: 34.6851, lng: 135.8048 },
  "hiroshima": { lat: 34.3853, lng: 132.4553 },
  "hakone": { lat: 35.2326, lng: 139.1069 },
  "nikko": { lat: 36.7580, lng: 139.5986 },
  "kamakura": { lat: 35.3192, lng: 139.5467 },
  "yokohama": { lat: 35.4437, lng: 139.6380 },
  "kobe": { lat: 34.6901, lng: 135.1956 },
  "miyajima": { lat: 34.2961, lng: 132.3198 },
  "mt fuji": { lat: 35.3606, lng: 138.7274 },
  "fuji": { lat: 35.3606, lng: 138.7274 },
  "kawaguchiko": { lat: 35.5158, lng: 138.7550 },
  "narita": { lat: 35.7720, lng: 140.3929 },
  "haneda": { lat: 35.5494, lng: 139.7798 },
};

/**
 * Activity name keywords that help identify specific locations
 */
const ACTIVITY_LOCATION_KEYWORDS: Record<string, Coordinates> = {
  "shibuya sky": { lat: 35.6580, lng: 139.7016 },
  "tokyo skytree": { lat: 35.7101, lng: 139.8107 },
  "teamlab borderless": { lat: 35.6295, lng: 139.7753 },
  "teamlab planets": { lat: 35.6500, lng: 139.7860 },
  "tokyo tower": { lat: 35.6586, lng: 139.7454 },
  "meiji shrine": { lat: 35.6764, lng: 139.6993 },
  "senso-ji": { lat: 35.7148, lng: 139.7967 },
  "sensoji": { lat: 35.7148, lng: 139.7967 },
  "imperial palace": { lat: 35.6852, lng: 139.7528 },
  "tsukiji": { lat: 35.6654, lng: 139.7707 },
  "toyosu market": { lat: 35.6569, lng: 139.7874 },
  "disney": { lat: 35.6329, lng: 139.8804 },
  "disneyland": { lat: 35.6329, lng: 139.8804 },
  "disneysea": { lat: 35.6267, lng: 139.8850 },
  "harry potter": { lat: 35.7604, lng: 139.3384 }, // Warner Bros Studio Tokyo
  "ghibli": { lat: 35.6962, lng: 139.5704 },
  "fushimi inari": { lat: 34.9671, lng: 135.7727 },
  "kinkaku-ji": { lat: 35.0394, lng: 135.7292 },
  "kinkakuji": { lat: 35.0394, lng: 135.7292 },
  "golden pavilion": { lat: 35.0394, lng: 135.7292 },
  "arashiyama": { lat: 35.0094, lng: 135.6667 },
  "bamboo": { lat: 35.0170, lng: 135.6713 },
  "universal studios": { lat: 34.6654, lng: 135.4321 },
  "osaka castle": { lat: 34.6873, lng: 135.5262 },
  "nara park": { lat: 34.6851, lng: 135.8430 },
  "todai-ji": { lat: 34.6890, lng: 135.8400 },
  "itsukushima": { lat: 34.2961, lng: 132.3198 },
  "peace memorial": { lat: 34.3955, lng: 132.4536 },
  "atomic bomb dome": { lat: 34.3955, lng: 132.4536 },
  "hakone": { lat: 35.2326, lng: 139.1069 },
  "mt fuji": { lat: 35.3606, lng: 138.7274 },
  "mount fuji": { lat: 35.3606, lng: 138.7274 },
  "nikko": { lat: 36.7580, lng: 139.5986 },
  "kamakura": { lat: 35.3192, lng: 139.5467 },
  "great buddha": { lat: 35.3167, lng: 139.5356 },
  "robot restaurant": { lat: 35.6946, lng: 139.7030 },
  "sumo": { lat: 35.6966, lng: 139.7931 },
  "kabuki": { lat: 35.6695, lng: 139.7656 },
  "geisha": { lat: 35.0037, lng: 135.7759 },
  "kimono": { lat: 35.0037, lng: 135.7759 },
  "tea ceremony": { lat: 35.0116, lng: 135.7681 },
  "sake": { lat: 34.9671, lng: 135.7727 },
  "ramen": { lat: 35.6938, lng: 139.7034 },
  "sushi": { lat: 35.6654, lng: 139.7707 },
  "cooking class": { lat: 35.6762, lng: 139.6503 },
  "go-kart": { lat: 35.6580, lng: 139.7016 },
  "mario kart": { lat: 35.6580, lng: 139.7016 },
};

/**
 * Geocode a Klook activity based on its location and name
 * Uses known location coordinates and activity name keywords
 */
export function geocodeKlookActivity(activity: KlookActivity): Coordinates | null {
  // First, try to match activity name keywords (more specific)
  const activityNameLower = activity.name.toLowerCase();
  for (const [keyword, coords] of Object.entries(ACTIVITY_LOCATION_KEYWORDS)) {
    if (activityNameLower.includes(keyword)) {
      return coords;
    }
  }

  // Then, try to match the location field
  const locationLower = activity.location.toLowerCase().trim();

  // Direct match
  if (KNOWN_LOCATION_COORDS[locationLower]) {
    return KNOWN_LOCATION_COORDS[locationLower];
  }

  // Partial match - check if location contains a known area
  for (const [area, coords] of Object.entries(KNOWN_LOCATION_COORDS)) {
    if (locationLower.includes(area) || area.includes(locationLower)) {
      return coords;
    }
  }

  // Fall back to city center coordinates
  const cityLower = activity.city.toLowerCase();
  if (KNOWN_LOCATION_COORDS[cityLower]) {
    return KNOWN_LOCATION_COORDS[cityLower];
  }

  // No match found
  return null;
}

// ============================================
// Data Loading
// ============================================

const DATA_DIR = path.join(process.cwd(), "data");

/**
 * Get the list of available Japan cities
 */
export async function getAvailableCities(): Promise<string[]> {
  console.log("[japan-data-service] getAvailableCities called");
  console.log("[japan-data-service] indexCache exists:", !!indexCache);
  const index = await loadCityIndex();
  const cities = Object.keys(index);
  console.log("[japan-data-service] Available cities:", cities);
  return cities;
}

/**
 * Load the city index for quick lookups
 */
export async function loadCityIndex(): Promise<CityDataIndex> {
  if (indexCache) {
    console.log("[japan-data-service] Using cached index with cities:", Object.keys(indexCache));
    return indexCache;
  }

  const indexPath = path.join(DATA_DIR, "japan-pois-enhanced", "index.json");
  console.log("[japan-data-service] Loading index from:", indexPath);
  try {
    const content = await fs.readFile(indexPath, "utf-8");
    indexCache = JSON.parse(content);
    console.log("[japan-data-service] Index loaded successfully, cities:", Object.keys(indexCache!));
    return indexCache!;
  } catch (err) {
    console.warn("[japan-data-service] Could not load city index:", err);
    console.warn("[japan-data-service] Building from files...");
    // Fallback: build index from individual files
    const cities = ["tokyo", "kyoto", "osaka", "nara", "hiroshima", "hakone"];
    const index: CityDataIndex = {};

    for (const city of cities) {
      try {
        const data = await loadCityData(city);
        index[city] = {
          file: `${city}.enhanced.json`,
          city: data.city,
          stats: data.stats,
          topMustSee: data.mustSee.overall.slice(0, 5).map((p) => ({
            name: p.name,
            category: p.category,
            rating: p.rating,
          })),
          clusterCount: data.stats.clusterCount,
        };
      } catch {
        console.warn(`[japan-data-service] Could not load ${city} data`);
      }
    }

    indexCache = index;
    console.log("[japan-data-service] Built index from files, cities:", Object.keys(index));
    return index;
  }
}

/**
 * Load enhanced city data with must-see POIs
 */
export async function loadCityData(city: string): Promise<EnhancedCityData> {
  const cityKey = city.toLowerCase();

  if (cityDataCache.has(cityKey)) {
    return cityDataCache.get(cityKey)!;
  }

  const filePath = path.join(DATA_DIR, "japan-pois-enhanced", `${cityKey}.enhanced.json`);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(content) as EnhancedCityData;
    cityDataCache.set(cityKey, data);
    return data;
  } catch (error) {
    throw new Error(`Could not load city data for ${city}: ${error}`);
  }
}

/**
 * Load Klook activities for a city
 */
export async function loadKlookActivities(city: string): Promise<KlookCityData | null> {
  const cityKey = city.toLowerCase();

  if (klookDataCache.has(cityKey)) {
    return klookDataCache.get(cityKey)!;
  }

  const filePath = path.join(DATA_DIR, "klook", `${cityKey}-activities.json`);
  try {
    const content = await fs.readFile(filePath, "utf-8");
    const data = JSON.parse(content) as KlookCityData;
    klookDataCache.set(cityKey, data);
    return data;
  } catch {
    console.warn(`[japan-data-service] No Klook data for ${city}`);
    return null;
  }
}

// ============================================
// Query Functions
// ============================================

/**
 * Get must-see POIs for a city, optionally filtered by category
 */
export async function getMustSeePOIs(
  city: string,
  options?: {
    limit?: number;
    categories?: string[];
  }
): Promise<MustSeePOI[]> {
  const data = await loadCityData(city);
  let pois = [...data.mustSee.overall];

  if (options?.categories?.length) {
    pois = pois.filter((p) => options.categories!.includes(p.category));
  }

  if (options?.limit) {
    pois = pois.slice(0, options.limit);
  }

  return pois;
}

/**
 * Get nearby restaurants for a POI
 */
export async function getNearbyRestaurants(
  city: string,
  poiId: string,
  limit = 5
): Promise<JapanPOI[]> {
  const data = await loadCityData(city);
  const poi = data.mustSee.overall.find((p) => p.id === poiId);

  if (!poi) return [];
  return poi.nearbyRestaurants.slice(0, limit);
}

/**
 * Get nearby attractions for a POI
 */
export async function getNearbyAttractions(
  city: string,
  poiId: string,
  limit = 5
): Promise<JapanPOI[]> {
  const data = await loadCityData(city);
  const poi = data.mustSee.overall.find((p) => p.id === poiId);

  if (!poi) return [];
  return poi.nearbyAttractions.slice(0, limit);
}

/**
 * Get paid experiences from Klook for a city
 */
export async function getPaidExperiences(
  city: string,
  options?: {
    limit?: number;
    categories?: string[];
    minRating?: number;
    maxPrice?: number;
    sortBy?: "rating" | "bookingCount" | "price";
  }
): Promise<KlookActivity[]> {
  const data = await loadKlookActivities(city);
  if (!data) return [];

  let activities = [...data.activities];

  // Filter by categories
  if (options?.categories?.length) {
    activities = activities.filter((a) =>
      options.categories!.some(
        (c) => a.category.toLowerCase().includes(c.toLowerCase()) || a.categoryOriginal.toLowerCase().includes(c.toLowerCase())
      )
    );
  }

  // Filter by minimum rating
  if (options?.minRating) {
    activities = activities.filter((a) => a.rating >= options.minRating!);
  }

  // Filter by max price
  if (options?.maxPrice) {
    activities = activities.filter((a) => a.price.amount <= options.maxPrice!);
  }

  // Sort
  if (options?.sortBy) {
    switch (options.sortBy) {
      case "rating":
        activities.sort((a, b) => b.rating - a.rating);
        break;
      case "bookingCount":
        activities.sort((a, b) => b.bookingCount - a.bookingCount);
        break;
      case "price":
        activities.sort((a, b) => a.price.amount - b.price.amount);
        break;
    }
  }

  if (options?.limit) {
    activities = activities.slice(0, options.limit);
  }

  return activities;
}

/**
 * Search POIs by name across all must-see attractions
 */
export async function searchPOIsByName(
  city: string,
  query: string
): Promise<MustSeePOI[]> {
  const data = await loadCityData(city);
  const queryLower = query.toLowerCase();

  return data.mustSee.overall.filter(
    (p) =>
      p.name.toLowerCase().includes(queryLower) ||
      p.nameJa.includes(query)
  );
}

/**
 * Get POIs suitable for a time slot
 */
export async function getPOIsForTimeSlot(
  city: string,
  slotType: "morning" | "breakfast" | "lunch" | "afternoon" | "dinner" | "evening"
): Promise<{ attractions: MustSeePOI[]; restaurants: JapanPOI[] }> {
  const data = await loadCityData(city);

  // Different categories suit different time slots
  const slotCategories: Record<string, string[]> = {
    morning: ["temple", "shrine", "park", "nature", "market"],
    breakfast: ["restaurant", "cafe"],
    lunch: ["restaurant", "cafe", "market"],
    afternoon: ["museum", "landmark", "shopping", "activity", "attraction"],
    dinner: ["restaurant", "bar"],
    evening: ["landmark", "nightlife", "bar", "activity"],
  };

  const categories = slotCategories[slotType] || [];
  const isFood = slotType === "lunch" || slotType === "dinner";

  const attractions = data.mustSee.overall.filter((p) =>
    categories.some((c) => p.category.includes(c))
  );

  // For food slots, also get restaurants from nearby POIs
  const restaurants: JapanPOI[] = [];
  if (isFood) {
    // Get unique restaurants from all must-see nearby lists
    const seenIds = new Set<string>();
    for (const poi of data.mustSee.overall.slice(0, 10)) {
      for (const r of poi.nearbyRestaurants) {
        if (!seenIds.has(r.id)) {
          seenIds.add(r.id);
          restaurants.push(r);
        }
      }
    }
    // Sort by rating
    restaurants.sort((a, b) => b.rating - a.rating);
  }

  return { attractions, restaurants: restaurants.slice(0, 20) };
}

/**
 * Calculate haversine distance between two coordinates
 */
export function calculateDistance(coord1: Coordinates, coord2: Coordinates): number {
  const R = 6371000; // Earth's radius in meters
  const lat1Rad = (coord1.lat * Math.PI) / 180;
  const lat2Rad = (coord2.lat * Math.PI) / 180;
  const deltaLat = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const deltaLng = ((coord2.lng - coord1.lng) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLng / 2) * Math.sin(deltaLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Estimate travel time between two points
 */
export function estimateTravelTime(
  distance: number,
  method: "walk" | "transit" | "taxi" = "walk"
): number {
  const speeds = {
    walk: 4.5, // km/h
    transit: 25, // km/h (average including wait times)
    taxi: 20, // km/h (urban traffic)
  };

  const speedKmH = speeds[method];
  const distanceKm = distance / 1000;
  const timeHours = distanceKm / speedKmH;

  // Add base overhead for transit (waiting, transfers)
  const overhead = method === "transit" ? 10 : method === "taxi" ? 5 : 0;

  return Math.ceil(timeHours * 60) + overhead;
}

/**
 * Get city statistics summary
 */
export async function getCityStats(city: string): Promise<EnhancedCityData["stats"]> {
  const data = await loadCityData(city);
  return data.stats;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Convert a Klook activity to an activity option format
 */
export function klookToActivityOption(klook: KlookActivity, rank: number) {
  // Geocode the Klook activity to get real coordinates
  const coordinates = geocodeKlookActivity(klook) || { lat: 0, lng: 0 };

  return {
    id: klook.id,
    rank,
    score: Math.round(klook.rating * 20), // Convert 0-5 to 0-100
    activity: {
      name: klook.name,
      description: klook.description,
      category: klook.category,
      duration: 120, // Default 2 hours for experiences
      place: {
        name: klook.name,
        address: klook.location,
        neighborhood: klook.location,
        coordinates,
        rating: klook.rating,
        reviewCount: klook.reviewCount || 0,
        photos: [klook.image],
      },
      isFree: false,
      estimatedCost: {
        amount: Math.round(klook.price.amount * 150), // Convert USD to JPY roughly
        currency: "JPY",
      },
      tags: [klook.category, "bookable", "experience"],
      source: "klook" as const,
      bookingUrl: klook.url,
    },
    matchReasons: [`${klook.bookingCount.toLocaleString()} bookings`, `${klook.rating} rating`],
    tradeoffs: ["Advance booking required"],
  };
}

/**
 * Convert a must-see POI to an activity option format
 */
export function poiToActivityOption(poi: MustSeePOI, rank: number) {
  const isFree = ["temple", "shrine", "park", "nature"].includes(poi.category);

  return {
    id: poi.id,
    rank,
    score: Math.round(poi.mustSeeScore * 10 + poi.rating * 10), // Combined score
    activity: {
      name: poi.name,
      description: poi.nameJa ? `Visit ${poi.name} (${poi.nameJa})` : `Visit ${poi.name}`,
      category: poi.category,
      duration: poi.category === "museum" ? 120 : poi.category === "park" ? 60 : 90,
      place: {
        name: poi.name,
        address: poi.address || "",
        neighborhood: poi.neighborhood || "",
        coordinates: poi.coordinates,
        rating: poi.rating,
        reviewCount: poi.reviewCount,
        photos: poi.photos,
        openingHours: poi.openingHours ? [poi.openingHours] : undefined,
      },
      isFree,
      estimatedCost: isFree ? undefined : { amount: 500, currency: "JPY" },
      tags: [poi.category, "must-see", `rank-${poi.rank}`],
      source: "local-data" as const,
      website: poi.website,
    },
    matchReasons: [
      `#${poi.rank} must-see in the city`,
      `${poi.rating} rating (${poi.reviewCount.toLocaleString()} reviews)`,
    ],
    tradeoffs: [],
  };
}

/**
 * Convert a restaurant POI to an activity option format
 */
export function restaurantToActivityOption(restaurant: JapanPOI, rank: number) {
  return {
    id: restaurant.id,
    rank,
    score: Math.round(restaurant.rating * 20),
    activity: {
      name: restaurant.name,
      description: restaurant.nameJa !== restaurant.name ? `${restaurant.nameJa}` : "Local restaurant",
      category: "restaurant",
      duration: 60,
      place: {
        name: restaurant.name,
        address: restaurant.address || "",
        neighborhood: restaurant.neighborhood || "",
        coordinates: restaurant.coordinates,
        rating: restaurant.rating,
        reviewCount: restaurant.reviewCount,
        photos: restaurant.photos || [],
      },
      isFree: false,
      estimatedCost: { amount: 1500, currency: "JPY" },
      tags: [restaurant.category || "restaurant", "local"],
      source: "local-data" as const,
    },
    matchReasons: [
      `${restaurant.rating} rating`,
      restaurant.walkTime ? `${restaurant.walkTime} min walk from attraction` : "Nearby location",
    ],
    tradeoffs: [],
  };
}

// ============================================
// Opening Hours Parsing & Availability
// ============================================

/**
 * Day name mappings for OSM opening_hours format
 */
const DAY_MAP: Record<string, number> = {
  "mo": 1, "tu": 2, "we": 3, "th": 4, "fr": 5, "sa": 6, "su": 0,
  "monday": 1, "tuesday": 2, "wednesday": 3, "thursday": 4, "friday": 5, "saturday": 6, "sunday": 0,
};

/**
 * Slot type to approximate time mapping
 */
const SLOT_TIME_RANGES: Record<string, { start: number; end: number }> = {
  morning: { start: 8, end: 12 },
  breakfast: { start: 7, end: 10 },
  lunch: { start: 11, end: 14 },
  afternoon: { start: 13, end: 18 },
  dinner: { start: 18, end: 21 },
  evening: { start: 18, end: 23 },
};

/**
 * Parse time string like "10:00" to hour number (10)
 */
function parseTimeToHour(timeStr: string): number | null {
  const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  return parseInt(match[1], 10);
}

/**
 * Parse OSM opening_hours format and check if open during a slot
 * Handles formats like:
 * - "Mo-Su 06:00-17:00"
 * - "Tu-Sa 10:00-20:00; Su 10:00-18:00"
 * - "Mo-Fr 07:00-21:00; Sa 08:00-20:00; Su,PH 08:00-19:00"
 * - "24/7"
 *
 * Returns: { isOpen: boolean, openTime?: string, closeTime?: string, confidence: number }
 */
export function checkOpenDuringSlot(
  openingHours: string | null | undefined,
  slotType: keyof typeof SLOT_TIME_RANGES,
  dayOfWeek: number = new Date().getDay() // 0=Sunday, 1=Monday, etc.
): { isOpen: boolean; openTime?: string; closeTime?: string; confidence: number; reason?: string } {
  // No opening hours data - assume open with low confidence
  if (!openingHours) {
    return { isOpen: true, confidence: 0.3, reason: "No hours data" };
  }

  const hoursLower = openingHours.toLowerCase().trim();
  const slotRange = SLOT_TIME_RANGES[slotType];

  // Handle 24/7
  if (hoursLower === "24/7" || hoursLower.includes("24 hours")) {
    return { isOpen: true, openTime: "00:00", closeTime: "24:00", confidence: 1.0 };
  }

  // Parse the opening hours - split by semicolon for multiple rules
  const rules = openingHours.split(";").map(r => r.trim());

  for (const rule of rules) {
    // Match pattern like "Mo-Su 06:00-17:00" or "Tu,Th 10:00-20:00"
    const match = rule.match(/^([A-Za-z,\-\s]+)\s+(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);

    if (match) {
      const daysPart = match[1].toLowerCase();
      const openTime = match[2];
      const closeTime = match[3];

      // Check if this rule applies to the current day
      const appliesToDay = checkDayMatch(daysPart, dayOfWeek);

      if (appliesToDay) {
        const openHour = parseTimeToHour(openTime);
        const closeHour = parseTimeToHour(closeTime);

        if (openHour !== null && closeHour !== null) {
          // Handle overnight hours (e.g., 10:00-05:00)
          const effectiveCloseHour = closeHour < openHour ? closeHour + 24 : closeHour;

          // Check if slot overlaps with opening hours
          const slotOverlaps = slotRange.start < effectiveCloseHour && slotRange.end > openHour;

          return {
            isOpen: slotOverlaps,
            openTime,
            closeTime,
            confidence: 0.9,
            reason: slotOverlaps ? undefined : `Closes at ${closeTime}`,
          };
        }
      }
    }
  }

  // Simple time-only pattern like "07:00-24:00"
  const simpleMatch = openingHours.match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
  if (simpleMatch) {
    const openHour = parseTimeToHour(simpleMatch[1]);
    const closeHour = parseTimeToHour(simpleMatch[2]);

    if (openHour !== null && closeHour !== null) {
      const effectiveCloseHour = closeHour < openHour ? closeHour + 24 : closeHour;
      const slotOverlaps = slotRange.start < effectiveCloseHour && slotRange.end > openHour;

      return {
        isOpen: slotOverlaps,
        openTime: simpleMatch[1],
        closeTime: simpleMatch[2],
        confidence: 0.8,
        reason: slotOverlaps ? undefined : `Hours: ${simpleMatch[1]}-${simpleMatch[2]}`,
      };
    }
  }

  // Couldn't parse - assume open with low confidence
  return { isOpen: true, confidence: 0.4, reason: "Could not parse hours" };
}

/**
 * Check if a day specification matches the given day of week
 */
function checkDayMatch(daysPart: string, dayOfWeek: number): boolean {
  // Remove "ph" (public holiday) for now
  const cleanDays = daysPart.replace(/,?\s*ph\s*/g, "").trim();

  // Handle ranges like "mo-su" or "tu-sa"
  const rangeMatch = cleanDays.match(/^([a-z]{2})-([a-z]{2})$/);
  if (rangeMatch) {
    const startDay = DAY_MAP[rangeMatch[1]];
    const endDay = DAY_MAP[rangeMatch[2]];

    if (startDay !== undefined && endDay !== undefined) {
      if (startDay <= endDay) {
        return dayOfWeek >= startDay && dayOfWeek <= endDay;
      } else {
        // Wrapping range like "Fr-Mo"
        return dayOfWeek >= startDay || dayOfWeek <= endDay;
      }
    }
  }

  // Handle comma-separated days like "tu,th,sa"
  const days = cleanDays.split(/[,\s]+/);
  for (const day of days) {
    // Check for range within comma list
    const subRange = day.match(/^([a-z]{2})-([a-z]{2})$/);
    if (subRange) {
      const startDay = DAY_MAP[subRange[1]];
      const endDay = DAY_MAP[subRange[2]];
      if (startDay !== undefined && endDay !== undefined) {
        if (startDay <= endDay) {
          if (dayOfWeek >= startDay && dayOfWeek <= endDay) return true;
        } else {
          if (dayOfWeek >= startDay || dayOfWeek <= endDay) return true;
        }
      }
    } else {
      const dayNum = DAY_MAP[day];
      if (dayNum === dayOfWeek) return true;
    }
  }

  return false;
}

/**
 * Get availability info for a POI
 */
export interface AvailabilityInfo {
  isOpen: boolean;
  openTime?: string;
  closeTime?: string;
  confidence: number;
  reason?: string;
}

/**
 * Filter POIs by availability during a slot
 */
export function filterByAvailability<T extends { openingHours?: string | null }>(
  pois: T[],
  slotType: keyof typeof SLOT_TIME_RANGES,
  options?: {
    dayOfWeek?: number;
    includeUnknown?: boolean; // Include POIs without opening hours (default: true)
    minConfidence?: number;
  }
): Array<T & { availability: AvailabilityInfo }> {
  const dayOfWeek = options?.dayOfWeek ?? new Date().getDay();
  const includeUnknown = options?.includeUnknown ?? true;
  const minConfidence = options?.minConfidence ?? 0;

  return pois
    .map(poi => {
      const availability = checkOpenDuringSlot(poi.openingHours, slotType, dayOfWeek);
      return { ...poi, availability };
    })
    .filter(poi => {
      // Filter by open status
      if (!poi.availability.isOpen) return false;

      // Filter by confidence
      if (poi.availability.confidence < minConfidence) return false;

      // Optionally exclude unknown hours
      if (!includeUnknown && !poi.openingHours) return false;

      return true;
    });
}

// ============================================
// Ticket Requirement & Booking Logic
// ============================================

/**
 * Categories that typically require paid tickets
 */
const TICKET_REQUIRED_CATEGORIES = [
  "museum",
  "aquarium",
  "zoo",
  "theme_park",
  "observation_deck",
  "tower",
  "castle_museum",
  "amusement_park",
];

/**
 * Categories where tickets are optional enhancements (free entry but paid tours/guides available)
 */
const TICKET_OPTIONAL_CATEGORIES = [
  "temple",
  "shrine",
  "castle_grounds",
  "market",
  "shopping",
];

/**
 * Categories that are generally free
 */
const FREE_ENTRY_CATEGORIES = [
  "park",
  "nature",
  "landmark",
  "street",
  "neighborhood",
  "beach",
  "garden", // some gardens are free
];

/**
 * Specific places with known ticket requirements (override by name)
 */
const KNOWN_TICKET_REQUIREMENTS: Record<string, TicketRequirement> = {
  // Required tickets
  "tokyo skytree": "required",
  "tokyo tower": "required",
  "teamlab borderless": "required",
  "teamlab planets": "required",
  "shibuya sky": "required",
  "tokyo disneyland": "required",
  "tokyo disneysea": "required",
  "universal studios japan": "required",
  "legoland": "required",
  "ghibli museum": "required",
  "edo-tokyo museum": "required",
  "mori art museum": "required",
  "national museum": "required",
  "peace memorial museum": "required",
  "hiroshima castle": "required",
  "osaka castle museum": "required",
  "nijo castle": "required",
  "kinkaku-ji": "required", // Has entry fee
  "ginkaku-ji": "required", // Has entry fee
  "ryoan-ji": "required", // Has entry fee
  "kiyomizu-dera": "required", // Has entry fee
  "todai-ji": "required", // Has entry fee

  // Optional enhancements
  "senso-ji": "optional",
  "sensoji": "optional",
  "meiji shrine": "optional",
  "fushimi inari": "optional",
  "arashiyama bamboo": "optional",
  "nara park": "optional",
  "imperial palace": "optional",
  "tsukiji market": "optional",
  "toyosu market": "optional",
  "dotonbori": "optional",
  "gion": "optional",
  "shibuya crossing": "free",

  // Free entry
  "yoyogi park": "free",
  "ueno park": "free",
  "shinjuku gyoen": "required", // Actually has small fee
  "hamarikyu gardens": "required",
};

/**
 * Keywords in Klook activity names that indicate experience type
 */
const EXPERIENCE_TYPE_KEYWORDS: Record<string, LinkedExperience["experienceType"]> = {
  "ticket": "entry-ticket",
  "admission": "entry-ticket",
  "entry": "entry-ticket",
  "skip the line": "skip-line",
  "skip-the-line": "skip-line",
  "fast pass": "skip-line",
  "express pass": "skip-line",
  "priority": "skip-line",
  "guided tour": "guided-tour",
  "walking tour": "guided-tour",
  "private tour": "guided-tour",
  "tour guide": "guided-tour",
  "audio guide": "audio-guide",
  "audio tour": "audio-guide",
  "day trip": "day-trip",
  "day tour": "day-trip",
  "full day": "day-trip",
  "experience": "experience",
  "workshop": "experience",
  "class": "experience",
  "cooking": "experience",
  "tea ceremony": "experience",
  "kimono": "experience",
  "rental": "experience",
};

/**
 * Determine ticket requirement for a POI
 */
export function getTicketRequirement(poi: MustSeePOI | JapanPOI): TicketRequirement {
  const nameLower = poi.name.toLowerCase();

  // Check known places first (most accurate)
  for (const [place, requirement] of Object.entries(KNOWN_TICKET_REQUIREMENTS)) {
    if (nameLower.includes(place) || place.includes(nameLower.replace(/-/g, ""))) {
      return requirement;
    }
  }

  // Check by category
  const category = poi.category.toLowerCase();
  const subcategory = (poi.subcategory || "").toLowerCase();

  if (TICKET_REQUIRED_CATEGORIES.some((c) => category.includes(c) || subcategory.includes(c))) {
    return "required";
  }

  if (FREE_ENTRY_CATEGORIES.some((c) => category.includes(c) || subcategory.includes(c))) {
    return "free";
  }

  if (TICKET_OPTIONAL_CATEGORIES.some((c) => category.includes(c) || subcategory.includes(c))) {
    return "optional";
  }

  // Default to optional for unknown
  return "optional";
}

/**
 * Classify a Klook activity's experience type
 */
export function classifyExperienceType(activity: KlookActivity): LinkedExperience["experienceType"] {
  const nameLower = activity.name.toLowerCase();

  for (const [keyword, type] of Object.entries(EXPERIENCE_TYPE_KEYWORDS)) {
    if (nameLower.includes(keyword)) {
      return type;
    }
  }

  // Default based on category
  if (activity.category.includes("ticket") || activity.category.includes("admission")) {
    return "entry-ticket";
  }

  return "experience";
}

/**
 * Convert Klook activity to LinkedExperience format
 */
export function klookToLinkedExperience(activity: KlookActivity): LinkedExperience {
  return {
    id: activity.id,
    provider: "klook",
    name: activity.name,
    category: activity.category,
    description: activity.description,
    price: {
      amount: activity.price.amount,
      currency: activity.price.currency,
      display: activity.price.display,
    },
    rating: activity.rating,
    bookingCount: activity.bookingCount,
    url: activity.url,
    image: activity.image,
    experienceType: classifyExperienceType(activity),
  };
}

/**
 * Find Klook experiences that match a POI
 */
export async function getLinkedExperiences(
  city: string,
  poi: MustSeePOI | JapanPOI,
  options?: {
    limit?: number;
    types?: LinkedExperience["experienceType"][];
  }
): Promise<LinkedExperience[]> {
  const klookData = await loadKlookActivities(city);
  if (!klookData) return [];

  const poiNameLower = poi.name.toLowerCase().replace(/[-\s]/g, "");
  const poiNameJaLower = (poi.nameJa || "").toLowerCase();

  // Find matching activities
  let matches = klookData.activities.filter((activity) => {
    const activityNameLower = activity.name.toLowerCase().replace(/[-\s]/g, "");

    // Direct name match
    if (activityNameLower.includes(poiNameLower) || poiNameLower.includes(activityNameLower)) {
      return true;
    }

    // Japanese name match
    if (poiNameJaLower && activity.name.includes(poiNameJaLower)) {
      return true;
    }

    // Check for common keywords
    const poiWords = poi.name.toLowerCase().split(/[\s-]+/).filter((w) => w.length > 3);
    const matchingWords = poiWords.filter((word) => activityNameLower.includes(word));
    return matchingWords.length >= 2;
  });

  // Convert to LinkedExperience
  let experiences = matches.map(klookToLinkedExperience);

  // Filter by experience types if specified
  if (options?.types?.length) {
    experiences = experiences.filter((e) => options.types!.includes(e.experienceType));
  }

  // Sort by relevance (booking count * rating)
  experiences.sort((a, b) => {
    const scoreA = (a.bookingCount || 0) * (a.rating || 0);
    const scoreB = (b.bookingCount || 0) * (b.rating || 0);
    return scoreB - scoreA;
  });

  // Limit results
  if (options?.limit) {
    experiences = experiences.slice(0, options.limit);
  }

  return experiences;
}

/**
 * Enrich a POI with ticket info and linked experiences
 * Uses the real ticketInfo from the enhanced data if available
 */
export async function enrichPOIWithBookingInfo(
  city: string,
  poi: MustSeePOI
): Promise<MustSeePOI & { ticketRequirement: TicketRequirement; linkedExperiences: LinkedExperience[] }> {
  // Use the real ticketInfo from the enhanced data if available
  let ticketRequirement: TicketRequirement;

  if (poi.ticketInfo) {
    // Use the data from the enhanced POI file
    ticketRequirement = poi.ticketInfo.requirement;
  } else {
    // Fallback to heuristic inference
    ticketRequirement = getTicketRequirement(poi);
  }

  // Get existing paidExperiences from the data or fetch new ones
  let linkedExperiences: LinkedExperience[] = [];

  if (poi.paidExperiences && poi.paidExperiences.length > 0) {
    // Use existing linked experiences
    linkedExperiences = poi.paidExperiences;
  } else {
    // Fetch matching Klook experiences
    linkedExperiences = await getLinkedExperiences(city, poi, { limit: 5 });
  }

  return {
    ...poi,
    ticketRequirement,
    linkedExperiences,
  };
}

/**
 * Get POI suggestions with booking info for fill-the-slot
 */
export async function getPOISuggestionsWithBooking(
  city: string,
  options?: {
    slotType?: "morning" | "lunch" | "afternoon" | "dinner" | "evening";
    coordinates?: Coordinates;
    maxDistance?: number;
    limit?: number;
    excludeIds?: string[];
  }
): Promise<Array<MustSeePOI & { ticketRequirement: TicketRequirement; linkedExperiences: LinkedExperience[]; distance?: number }>> {
  const data = await loadCityData(city);

  // Start with must-see POIs
  let pois = [...data.mustSee.overall];

  // Exclude specific IDs
  if (options?.excludeIds?.length) {
    pois = pois.filter((p) => !options.excludeIds!.includes(p.id));
  }

  // Calculate distances if coordinates provided
  if (options?.coordinates) {
    pois = pois.map((p) => ({
      ...p,
      distance: calculateDistance(options.coordinates!, p.coordinates),
    }));

    // Filter by max distance
    if (options?.maxDistance) {
      pois = pois.filter((p) => (p.distance || 0) <= options.maxDistance!);
    }

    // Sort by distance
    pois.sort((a, b) => (a.distance || 0) - (b.distance || 0));
  }

  // Limit results
  if (options?.limit) {
    pois = pois.slice(0, options.limit);
  }

  // Enrich with booking info
  const enrichedPois = await Promise.all(
    pois.map(async (poi) => {
      const enriched = await enrichPOIWithBookingInfo(city, poi);
      return {
        ...enriched,
        distance: poi.distance,
      };
    })
  );

  return enrichedPois;
}
