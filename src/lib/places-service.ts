/**
 * Unified Places Service
 *
 * Orchestrates multiple place data providers with intelligent fallback:
 * 1. Google Places API (Primary - most comprehensive)
 * 2. Foursquare API (Secondary - rich venue data)
 * 3. OpenStreetMap/Nominatim (Fallback - free, open-source)
 *
 * Features:
 * - Automatic fallback when primary provider fails or has no API key
 * - Result deduplication across providers
 * - Unified place format for consistent app experience
 * - Configurable provider priority
 */

import {
  isGooglePlacesConfigured,
  searchAttractions as searchGoogleAttractions,
  searchGoogleRestaurants,
  searchNearbyPlaces as searchGoogleNearby,
  searchPlacesByCategory as searchGoogleByCategory,
  getPlaceDetails as getGooglePlaceDetails,
  googlePlaceToPlace,
  Place as GooglePlace,
  PlaceType as GooglePlaceType,
} from "./google-places";

import {
  isFoursquareConfigured,
  searchFSQAttractions,
  searchFSQRestaurants,
  searchFSQNearby,
  searchFSQByCategory,
  getFoursquarePlaceDetails,
  foursquareToFSQPlace,
  FSQPlace,
  FoursquareCategoryType,
} from "./foursquare";

import {
  isOSMConfigured,
  searchOSMPlaces,
  searchOSMRestaurants,
  searchOSMNearby,
  geocodeAddress,
  reverseGeocode,
  OSMPlace,
  OSMPlaceType,
} from "./openstreetmap";

// ============================================
// TYPES
// ============================================

export type PlaceProvider = "google" | "foursquare" | "openstreetmap";

export interface UnifiedPlace {
  id: string;
  name: string;
  description?: string;
  imageUrl?: string;
  images?: string[];
  rating?: number;
  reviewCount?: number;
  priceLevel?: 1 | 2 | 3 | 4;
  types: string[];
  primaryType?: string;
  address: string;
  city?: string;
  country?: string;
  neighborhood?: string;
  phone?: string;
  website?: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  distance?: number;
  isOpenNow?: boolean;
  openingHours?: string[];
  accessibility?: {
    wheelchairAccessible: boolean;
    wheelchairParking?: boolean;
    wheelchairRestroom?: boolean;
  };
  features?: {
    delivery?: boolean;
    dineIn?: boolean;
    takeout?: boolean;
    reservable?: boolean;
    outdoorSeating?: boolean;
    servesVegetarianFood?: boolean;
    menuForChildren?: boolean;
    goodForChildren?: boolean;
    goodForGroups?: boolean;
    wifi?: boolean;
    liveMusic?: boolean;
    parking?: boolean;
  };
  cuisine?: string[];
  tips?: string[];
  source: PlaceProvider;
  sourceId: string;

  // Entity IDs for cross-reference
  entityIds: {
    googlePlaceId?: string;
    foursquareId?: string;
    osmId?: string;
  };
}

export interface PlaceSearchOptions {
  maxResults?: number;
  minRating?: number;
  priceLevels?: (1 | 2 | 3 | 4)[];
  openNow?: boolean;
  language?: string;
  radius?: number; // meters
}

export interface PlaceServiceConfig {
  providerPriority: PlaceProvider[];
  enableFallback: boolean;
  deduplicateResults: boolean;
  maxResultsPerProvider: number;
}

// Default configuration
const DEFAULT_CONFIG: PlaceServiceConfig = {
  providerPriority: ["google", "foursquare", "openstreetmap"],
  enableFallback: true,
  deduplicateResults: true,
  maxResultsPerProvider: 20,
};

// ============================================
// PROVIDER STATUS
// ============================================

/**
 * Get status of all place providers
 */
export function getProviderStatus(): Record<PlaceProvider, boolean> {
  return {
    google: isGooglePlacesConfigured(),
    foursquare: isFoursquareConfigured(),
    openstreetmap: isOSMConfigured(),
  };
}

/**
 * Get list of available providers based on configuration
 */
export function getAvailableProviders(config?: Partial<PlaceServiceConfig>): PlaceProvider[] {
  const status = getProviderStatus();
  const priority = config?.providerPriority || DEFAULT_CONFIG.providerPriority;

  return priority.filter((provider) => status[provider]);
}

// ============================================
// CONVERSION FUNCTIONS
// ============================================

/**
 * Convert Google Place to UnifiedPlace
 */
function googleToUnified(place: GooglePlace): UnifiedPlace {
  return {
    id: place.id,
    name: place.name,
    description: place.description,
    imageUrl: place.imageUrl,
    images: place.images,
    rating: place.rating,
    reviewCount: place.reviewCount,
    priceLevel: place.priceLevel,
    types: place.types,
    primaryType: place.primaryType,
    address: place.address,
    city: place.city,
    country: place.country,
    neighborhood: place.neighborhood,
    phone: place.phone,
    website: place.website,
    coordinates: place.coordinates,
    isOpenNow: place.isOpenNow,
    openingHours: place.openingHours,
    accessibility: place.accessibility,
    features: place.features,
    source: "google",
    sourceId: place.googlePlaceId,
    entityIds: {
      googlePlaceId: place.googlePlaceId,
    },
  };
}

/**
 * Convert Foursquare Place to UnifiedPlace
 */
function foursquareToUnified(place: FSQPlace): UnifiedPlace {
  return {
    id: place.id,
    name: place.name,
    description: place.description,
    imageUrl: place.imageUrl,
    images: place.images,
    rating: place.rating ? place.rating / 2 : undefined, // Foursquare uses 10-point scale
    reviewCount: place.reviewCount,
    priceLevel: place.priceLevel,
    types: place.types,
    primaryType: place.primaryType,
    address: place.address,
    city: place.city,
    country: place.country,
    neighborhood: place.neighborhood,
    phone: place.phone,
    website: place.website,
    coordinates: place.coordinates,
    distance: place.distance,
    isOpenNow: place.isOpenNow,
    openingHours: place.openingHours ? [place.openingHours] : undefined,
    features: place.features,
    tips: place.tips,
    source: "foursquare",
    sourceId: place.foursquareId,
    entityIds: {
      foursquareId: place.foursquareId,
    },
  };
}

/**
 * Convert OSM Place to UnifiedPlace
 */
function osmToUnified(place: OSMPlace): UnifiedPlace {
  return {
    id: place.id,
    name: place.name,
    description: place.description,
    types: place.types,
    primaryType: place.primaryType,
    address: place.address,
    city: place.city,
    country: place.country,
    neighborhood: place.neighborhood,
    phone: place.phone,
    website: place.website,
    coordinates: place.coordinates,
    openingHours: place.openingHours ? [place.openingHours] : undefined,
    accessibility: place.accessibility,
    cuisine: place.cuisine,
    source: "openstreetmap",
    sourceId: place.osmId,
    entityIds: {
      osmId: place.osmId,
    },
  };
}

// ============================================
// DEDUPLICATION
// ============================================

/**
 * Calculate similarity between two places based on name and location
 */
function calculatePlaceSimilarity(place1: UnifiedPlace, place2: UnifiedPlace): number {
  // Name similarity (simple Levenshtein-like comparison)
  const name1 = place1.name.toLowerCase().replace(/[^a-z0-9]/g, "");
  const name2 = place2.name.toLowerCase().replace(/[^a-z0-9]/g, "");

  let nameSimilarity = 0;
  if (name1 === name2) {
    nameSimilarity = 1;
  } else if (name1.includes(name2) || name2.includes(name1)) {
    nameSimilarity = 0.8;
  } else {
    // Check for word overlap
    const words1 = name1.split(/\s+/);
    const words2 = new Set(name2.split(/\s+/));
    const overlap = words1.filter((w) => words2.has(w)).length;
    nameSimilarity = overlap / Math.max(words1.length, words2.size);
  }

  // Location similarity (within ~100m is considered same location)
  const distance = calculateDistance(
    place1.coordinates.lat,
    place1.coordinates.lng,
    place2.coordinates.lat,
    place2.coordinates.lng
  );
  const locationSimilarity = distance < 100 ? 1 : distance < 500 ? 0.5 : 0;

  // Combined similarity
  return nameSimilarity * 0.6 + locationSimilarity * 0.4;
}

/**
 * Deduplicate places from multiple providers
 */
function deduplicatePlaces(places: UnifiedPlace[]): UnifiedPlace[] {
  const deduplicated: UnifiedPlace[] = [];

  for (const place of places) {
    const isDuplicate = deduplicated.some(
      (existing) => calculatePlaceSimilarity(existing, place) > 0.7
    );

    if (!isDuplicate) {
      deduplicated.push(place);
    } else {
      // Merge entity IDs from duplicate
      const existingIndex = deduplicated.findIndex(
        (existing) => calculatePlaceSimilarity(existing, place) > 0.7
      );
      if (existingIndex >= 0) {
        deduplicated[existingIndex].entityIds = {
          ...deduplicated[existingIndex].entityIds,
          ...place.entityIds,
        };
      }
    }
  }

  return deduplicated;
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ============================================
// CATEGORY MAPPING
// ============================================

type UnifiedCategory =
  | "attraction"
  | "museum"
  | "park"
  | "restaurant"
  | "cafe"
  | "bar"
  | "temple"
  | "church"
  | "monument"
  | "shopping"
  | "nightlife"
  | "spa"
  | "beach"
  | "viewpoint";

const CATEGORY_MAPPING: Record<
  UnifiedCategory,
  { google?: GooglePlaceType; foursquare?: FoursquareCategoryType; osm?: OSMPlaceType[] }
> = {
  attraction: {
    google: "tourist_attraction",
    foursquare: "tourist_attraction",
    osm: ["attraction", "viewpoint"],
  },
  museum: { google: "museum", foursquare: "museum", osm: ["museum", "gallery"] },
  park: { google: "park", foursquare: "park", osm: ["park", "garden"] },
  restaurant: { google: "restaurant", foursquare: "restaurant", osm: ["restaurant"] },
  cafe: { google: "cafe", foursquare: "cafe", osm: ["cafe"] },
  bar: { google: "bar", foursquare: "bar", osm: ["bar", "pub"] },
  temple: { google: "hindu_temple", foursquare: "temple", osm: ["temple"] },
  church: { google: "church", foursquare: "church", osm: ["church"] },
  monument: { google: undefined, foursquare: "monument", osm: ["monument", "memorial"] },
  shopping: { google: "shopping_mall", foursquare: "shopping_mall", osm: ["mall", "marketplace"] },
  nightlife: { google: "night_club", foursquare: "nightclub", osm: ["nightclub"] },
  spa: { google: "spa", foursquare: "spa", osm: ["spa"] },
  beach: { google: undefined, foursquare: "beach", osm: [] },
  viewpoint: { google: undefined, foursquare: "scenic_lookout", osm: ["viewpoint"] },
};

// ============================================
// UNIFIED SEARCH FUNCTIONS
// ============================================

/**
 * Search for attractions in a destination
 */
export async function searchAttractions(
  destination: string,
  options?: PlaceSearchOptions,
  config?: Partial<PlaceServiceConfig>
): Promise<UnifiedPlace[]> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const providers = getAvailableProviders(mergedConfig);

  let results: UnifiedPlace[] = [];

  for (const provider of providers) {
    try {
      switch (provider) {
        case "google": {
          const places = await searchGoogleAttractions(destination, {
            maxResults: mergedConfig.maxResultsPerProvider,
            language: options?.language,
            minRating: options?.minRating,
          });
          results.push(...places.map(googleToUnified));
          break;
        }
        case "foursquare": {
          const places = await searchFSQAttractions(destination, {
            maxResults: mergedConfig.maxResultsPerProvider,
            minRating: options?.minRating ? options.minRating * 2 : undefined, // Convert to 10-point scale
          });
          results.push(...places.map(foursquareToUnified));
          break;
        }
        case "openstreetmap": {
          const places = await searchOSMPlaces(destination, {
            types: ["attraction", "museum", "park", "monument", "viewpoint"],
            limit: mergedConfig.maxResultsPerProvider,
          });
          results.push(...places.map(osmToUnified));
          break;
        }
      }

      // If we got enough results and fallback is disabled, stop
      if (!mergedConfig.enableFallback && results.length >= (options?.maxResults || 20)) {
        break;
      }
    } catch (error) {
      console.error(`[PlaceService] ${provider} attractions search failed:`, error);
      // Continue to next provider if fallback is enabled
      if (!mergedConfig.enableFallback) {
        throw error;
      }
    }
  }

  // Deduplicate if enabled
  if (mergedConfig.deduplicateResults) {
    results = deduplicatePlaces(results);
  }

  // Apply rating filter if specified
  if (options?.minRating) {
    results = results.filter((p) => (p.rating ?? 0) >= options.minRating!);
  }

  // Limit results
  return results.slice(0, options?.maxResults || 20);
}

/**
 * Search for restaurants in a destination
 */
export async function searchRestaurants(
  destination: string,
  options?: PlaceSearchOptions & { cuisine?: string },
  config?: Partial<PlaceServiceConfig>
): Promise<UnifiedPlace[]> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const providers = getAvailableProviders(mergedConfig);

  let results: UnifiedPlace[] = [];

  for (const provider of providers) {
    try {
      switch (provider) {
        case "google": {
          const places = await searchGoogleRestaurants(destination, {
            cuisine: options?.cuisine,
            priceLevels: options?.priceLevels,
            openNow: options?.openNow,
            maxResults: mergedConfig.maxResultsPerProvider,
            language: options?.language,
            minRating: options?.minRating,
          });
          results.push(...places.map(googleToUnified));
          break;
        }
        case "foursquare": {
          const places = await searchFSQRestaurants(destination, {
            priceLevels: options?.priceLevels,
            openNow: options?.openNow,
            maxResults: mergedConfig.maxResultsPerProvider,
          });
          results.push(...places.map(foursquareToUnified));
          break;
        }
        case "openstreetmap": {
          const places = await searchOSMRestaurants(destination, {
            cuisine: options?.cuisine,
            limit: mergedConfig.maxResultsPerProvider,
          });
          results.push(...places.map(osmToUnified));
          break;
        }
      }

      if (!mergedConfig.enableFallback && results.length >= (options?.maxResults || 20)) {
        break;
      }
    } catch (error) {
      console.error(`[PlaceService] ${provider} restaurants search failed:`, error);
      if (!mergedConfig.enableFallback) {
        throw error;
      }
    }
  }

  if (mergedConfig.deduplicateResults) {
    results = deduplicatePlaces(results);
  }

  // Filter by price level if specified
  if (options?.priceLevels && options.priceLevels.length > 0) {
    results = results.filter((p) => p.priceLevel && options.priceLevels!.includes(p.priceLevel));
  }

  if (options?.minRating) {
    results = results.filter((p) => (p.rating ?? 0) >= options.minRating!);
  }

  return results.slice(0, options?.maxResults || 20);
}

/**
 * Search for places near coordinates
 */
export async function searchNearby(
  lat: number,
  lng: number,
  options?: PlaceSearchOptions & { types?: UnifiedCategory[] },
  config?: Partial<PlaceServiceConfig>
): Promise<UnifiedPlace[]> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const providers = getAvailableProviders(mergedConfig);

  let results: UnifiedPlace[] = [];

  for (const provider of providers) {
    try {
      switch (provider) {
        case "google": {
          const googleTypes = options?.types
            ?.map((t) => CATEGORY_MAPPING[t]?.google)
            .filter(Boolean) as string[];
          const places = await searchGoogleNearby(lat, lng, {
            types: googleTypes?.length ? googleTypes : undefined,
            radius: options?.radius,
            maxResults: mergedConfig.maxResultsPerProvider,
            language: options?.language,
          });
          results.push(...places.map(googleToUnified));
          break;
        }
        case "foursquare": {
          const fsqTypes = options?.types
            ?.map((t) => CATEGORY_MAPPING[t]?.foursquare)
            .filter(Boolean) as FoursquareCategoryType[];
          const places = await searchFSQNearby(lat, lng, {
            categories: fsqTypes?.length ? fsqTypes : undefined,
            radius: options?.radius,
            maxResults: mergedConfig.maxResultsPerProvider,
          });
          results.push(...places.map(foursquareToUnified));
          break;
        }
        case "openstreetmap": {
          const osmTypes = options?.types?.flatMap(
            (t) => CATEGORY_MAPPING[t]?.osm || []
          ) as OSMPlaceType[];
          const places = await searchOSMNearby(lat, lng, {
            types: osmTypes?.length ? osmTypes : undefined,
            radius: options?.radius,
            limit: mergedConfig.maxResultsPerProvider,
          });
          results.push(...places.map(osmToUnified));
          break;
        }
      }

      if (!mergedConfig.enableFallback && results.length >= (options?.maxResults || 20)) {
        break;
      }
    } catch (error) {
      console.error(`[PlaceService] ${provider} nearby search failed:`, error);
      if (!mergedConfig.enableFallback) {
        throw error;
      }
    }
  }

  if (mergedConfig.deduplicateResults) {
    results = deduplicatePlaces(results);
  }

  // Calculate distance from search point
  results = results.map((place) => ({
    ...place,
    distance: calculateDistance(lat, lng, place.coordinates.lat, place.coordinates.lng),
  }));

  // Sort by distance
  results.sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity));

  if (options?.minRating) {
    results = results.filter((p) => (p.rating ?? 0) >= options.minRating!);
  }

  return results.slice(0, options?.maxResults || 20);
}

/**
 * Search for places by category
 */
export async function searchByCategory(
  destination: string,
  category: UnifiedCategory,
  options?: PlaceSearchOptions,
  config?: Partial<PlaceServiceConfig>
): Promise<UnifiedPlace[]> {
  const mergedConfig = { ...DEFAULT_CONFIG, ...config };
  const providers = getAvailableProviders(mergedConfig);
  const categoryMap = CATEGORY_MAPPING[category];

  let results: UnifiedPlace[] = [];

  for (const provider of providers) {
    try {
      switch (provider) {
        case "google": {
          if (categoryMap.google) {
            const places = await searchGoogleByCategory(destination, categoryMap.google, {
              maxResults: mergedConfig.maxResultsPerProvider,
              language: options?.language,
              minRating: options?.minRating,
            });
            results.push(...places.map(googleToUnified));
          }
          break;
        }
        case "foursquare": {
          if (categoryMap.foursquare) {
            const places = await searchFSQByCategory(destination, categoryMap.foursquare, {
              maxResults: mergedConfig.maxResultsPerProvider,
            });
            results.push(...places.map(foursquareToUnified));
          }
          break;
        }
        case "openstreetmap": {
          if (categoryMap.osm && categoryMap.osm.length > 0) {
            const places = await searchOSMPlaces(destination, {
              types: categoryMap.osm,
              limit: mergedConfig.maxResultsPerProvider,
            });
            results.push(...places.map(osmToUnified));
          }
          break;
        }
      }

      if (!mergedConfig.enableFallback && results.length >= (options?.maxResults || 20)) {
        break;
      }
    } catch (error) {
      console.error(`[PlaceService] ${provider} category search failed:`, error);
      if (!mergedConfig.enableFallback) {
        throw error;
      }
    }
  }

  if (mergedConfig.deduplicateResults) {
    results = deduplicatePlaces(results);
  }

  if (options?.minRating) {
    results = results.filter((p) => (p.rating ?? 0) >= options.minRating!);
  }

  return results.slice(0, options?.maxResults || 20);
}

/**
 * Get detailed information about a place
 */
export async function getPlaceDetails(
  placeId: string,
  provider?: PlaceProvider
): Promise<UnifiedPlace | null> {
  // Determine provider from ID prefix if not specified
  if (!provider) {
    if (placeId.startsWith("gp_")) {
      provider = "google";
    } else if (placeId.startsWith("fsq_")) {
      provider = "foursquare";
    } else if (placeId.startsWith("osm_")) {
      provider = "openstreetmap";
    } else {
      // Try Google first if configured
      provider = isGooglePlacesConfigured()
        ? "google"
        : isFoursquareConfigured()
          ? "foursquare"
          : "openstreetmap";
    }
  }

  try {
    switch (provider) {
      case "google": {
        const sourceId = placeId.replace(/^gp_/, "");
        const place = await getGooglePlaceDetails(sourceId);
        if (place) {
          return googleToUnified(googlePlaceToPlace(place));
        }
        break;
      }
      case "foursquare": {
        const sourceId = placeId.replace(/^fsq_/, "");
        const place = await getFoursquarePlaceDetails(sourceId);
        if (place) {
          return foursquareToUnified(foursquareToFSQPlace(place));
        }
        break;
      }
      case "openstreetmap": {
        // OSM doesn't have a direct details endpoint, return null
        console.warn("[PlaceService] OSM place details not supported");
        return null;
      }
    }
  } catch (error) {
    console.error(`[PlaceService] Failed to get place details from ${provider}:`, error);
  }

  return null;
}

/**
 * Geocode an address to coordinates
 */
export async function geocode(
  address: string,
  country?: string
): Promise<{ lat: number; lng: number } | null> {
  // Always use OSM for geocoding as it's free
  return geocodeAddress(address, country);
}

/**
 * Reverse geocode coordinates to address
 */
export async function reverseGeocode_unified(
  lat: number,
  lng: number
): Promise<{ address: string; city?: string; country?: string } | null> {
  const result = await reverseGeocode(lat, lng);
  if (result) {
    return {
      address: result.display_name,
      city: result.address?.city || result.address?.town || result.address?.village,
      country: result.address?.country,
    };
  }
  return null;
}

export type { UnifiedCategory };
