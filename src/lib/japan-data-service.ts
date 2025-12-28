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

export interface MustSeePOI extends JapanPOI {
  rank: number;
  mustSeeScore: number;
  nearbyAttractions: JapanPOI[];
  nearbyRestaurants: JapanPOI[];
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

// ============================================
// Data Loading
// ============================================

const DATA_DIR = path.join(process.cwd(), "data");

/**
 * Get the list of available Japan cities
 */
export async function getAvailableCities(): Promise<string[]> {
  const index = await loadCityIndex();
  return Object.keys(index);
}

/**
 * Load the city index for quick lookups
 */
export async function loadCityIndex(): Promise<CityDataIndex> {
  if (indexCache) return indexCache;

  const indexPath = path.join(DATA_DIR, "japan-pois-enhanced", "index.json");
  try {
    const content = await fs.readFile(indexPath, "utf-8");
    indexCache = JSON.parse(content);
    return indexCache!;
  } catch {
    console.warn("[japan-data-service] Could not load city index, building from files...");
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
        coordinates: { lat: 0, lng: 0 }, // Klook doesn't provide coordinates
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
      description: `Visit ${poi.name} (${poi.nameJa})`,
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
