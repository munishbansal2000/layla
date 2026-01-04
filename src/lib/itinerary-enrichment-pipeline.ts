/**
 * Itinerary Enrichment Pipeline
 *
 * Takes compact AI-generated itinerary and enriches it through multiple stages:
 * 1. Place Resolution - Add real coordinates, ratings, photos from OSM/Google/Foursquare
 * 2. Restaurant Fill - Add restaurant options to lunch/dinner slots via Yelp
 * 3. Experience Enhancement - Add bookable experiences from Viator/Klook
 * 4. Routing - Calculate commute times between activities via OSRM
 * 5. Remediation - Validate and fix any issues
 *
 * Uses heavy caching at each stage to minimize API calls.
 */

import {
  resolvePlace,
  type UnresolvedPlace,
  type PlaceResolutionResult,
} from "./place-resolver";
import {
  searchRestaurantsNearby,
  type Restaurant,
} from "./yelp";
import {
  getCommuteOptions,
} from "./routing-service";
import {
  remediateItinerary,
  type FlightConstraints,
} from "./itinerary-remediation";
import {
  getOrFetch,
  cacheKey,
  CACHE_TTL,
} from "./cache";
import type {
  StructuredItineraryData,
  DayWithOptions,
  SlotWithOptions,
  ActivityOption,
} from "@/types/structured-itinerary";

// ============================================
// TYPES
// ============================================

export interface EnrichmentOptions {
  /** Skip place resolution (use AI coordinates as-is) */
  skipPlaceResolution?: boolean;
  /** Skip restaurant filling for meal slots */
  skipRestaurants?: boolean;
  /** Skip Viator/Klook experience matching */
  skipExperiences?: boolean;
  /** Skip routing/commute calculation */
  skipRouting?: boolean;
  /** Skip final remediation pass */
  skipRemediation?: boolean;
  /** Flight constraints for remediation */
  flightConstraints?: FlightConstraints;
  /** Force refresh (bypass cache) */
  forceRefresh?: boolean;
  /** Number of restaurant options per meal slot */
  restaurantsPerSlot?: number;
  /** User preferences for filtering */
  preferences?: {
    dietaryRestrictions?: string[];
    cuisinePreferences?: string[];
    priceLevel?: (1 | 2 | 3 | 4)[];
  };
}

export interface EnrichmentStats {
  placesResolved: number;
  placesFromCache: number;
  restaurantsAdded: number;
  routesCalculated: number;
  routesFromCache: number;
  totalDuration: number;
  stages: {
    placeResolution: number;
    restaurantFill: number;
    routing: number;
    remediation: number;
  };
}

export interface EnrichmentResult {
  itinerary: StructuredItineraryData;
  stats: EnrichmentStats;
  errors: string[];
}

// ============================================
// CACHE CONFIGURATION
// ============================================

const CACHE_NS = {
  PLACE: "enrichment:place",
  RESTAURANT: "enrichment:restaurant",
  ROUTE: "enrichment:route",
};

// ============================================
// MAIN PIPELINE
// ============================================

/**
 * Run the full enrichment pipeline on a compact itinerary
 */
export async function enrichItinerary(
  itinerary: StructuredItineraryData,
  options: EnrichmentOptions = {}
): Promise<EnrichmentResult> {
  const startTime = Date.now();
  const errors: string[] = [];
  const stats: EnrichmentStats = {
    placesResolved: 0,
    placesFromCache: 0,
    restaurantsAdded: 0,
    routesCalculated: 0,
    routesFromCache: 0,
    totalDuration: 0,
    stages: {
      placeResolution: 0,
      restaurantFill: 0,
      routing: 0,
      remediation: 0,
    },
  };

  let enriched = deepClone(itinerary);

  // Stage 1: Place Resolution
  if (!options.skipPlaceResolution) {
    const stageStart = Date.now();
    try {
      const result = await enrichPlaces(enriched, options);
      enriched = result.itinerary;
      stats.placesResolved = result.resolved;
      stats.placesFromCache = result.fromCache;
    } catch (error) {
      errors.push(`Place resolution failed: ${error}`);
    }
    stats.stages.placeResolution = Date.now() - stageStart;
  }

  // Stage 2: Restaurant Fill
  if (!options.skipRestaurants) {
    const stageStart = Date.now();
    try {
      const result = await fillRestaurants(enriched, options);
      enriched = result.itinerary;
      stats.restaurantsAdded = result.added;
    } catch (error) {
      errors.push(`Restaurant fill failed: ${error}`);
    }
    stats.stages.restaurantFill = Date.now() - stageStart;
  }

  // Stage 3: Routing
  if (!options.skipRouting) {
    const stageStart = Date.now();
    try {
      const result = await calculateRoutes(enriched, options);
      enriched = result.itinerary;
      stats.routesCalculated = result.calculated;
      stats.routesFromCache = result.fromCache;
    } catch (error) {
      errors.push(`Routing failed: ${error}`);
    }
    stats.stages.routing = Date.now() - stageStart;
  }

  // Stage 4: Remediation
  if (!options.skipRemediation) {
    const stageStart = Date.now();
    try {
      const result = remediateItinerary(enriched, options.flightConstraints);
      enriched = result.itinerary;
    } catch (error) {
      errors.push(`Remediation failed: ${error}`);
    }
    stats.stages.remediation = Date.now() - stageStart;
  }

  stats.totalDuration = Date.now() - startTime;

  return {
    itinerary: enriched,
    stats,
    errors,
  };
}

// ============================================
// STAGE 1: PLACE RESOLUTION
// ============================================

interface PlaceEnrichmentResult {
  itinerary: StructuredItineraryData;
  resolved: number;
  fromCache: number;
}

async function enrichPlaces(
  itinerary: StructuredItineraryData,
  options: EnrichmentOptions
): Promise<PlaceEnrichmentResult> {
  let resolved = 0;
  let fromCache = 0;

  // Collect all places that need resolution
  const placesToResolve: Array<{
    dayIndex: number;
    slotIndex: number;
    optionIndex: number;
    place: UnresolvedPlace;
  }> = [];

  for (let d = 0; d < itinerary.days.length; d++) {
    const day = itinerary.days[d];
    for (let s = 0; s < day.slots.length; s++) {
      const slot = day.slots[s];
      for (let o = 0; o < slot.options.length; o++) {
        const option = slot.options[o];
        const activity = option.activity;

        // Skip if already has good data
        if (activity.source === "klook" || activity.source === "viator") {
          continue;
        }

        // Skip meal slots (handled by restaurant fill)
        if (slot.slotType === "lunch" || slot.slotType === "dinner") {
          continue;
        }

        placesToResolve.push({
          dayIndex: d,
          slotIndex: s,
          optionIndex: o,
          place: {
            name: activity.name,
            category: activity.category,
            neighborhood: activity.place?.neighborhood,
            city: day.city,
            country: itinerary.country || "Japan",
            coordinates: activity.place?.coordinates,
          },
        });
      }
    }
  }

  // Resolve places in parallel batches
  const BATCH_SIZE = 10;
  for (let i = 0; i < placesToResolve.length; i += BATCH_SIZE) {
    const batch = placesToResolve.slice(i, i + BATCH_SIZE);

    const results = await Promise.all(
      batch.map(async (item) => {
        const key = cacheKey(
          CACHE_NS.PLACE,
          item.place.name,
          item.place.city,
          item.place.category || ""
        );

        // Try cache first
        const cached = await getOrFetch<PlaceResolutionResult | null>(
          key,
          async () => {
            const result = await resolvePlace(item.place, {
              forceRefresh: options.forceRefresh,
            });
            return result.resolved ? result : null;
          },
          { ttlMs: CACHE_TTL.PLACE_DETAILS }
        );

        if (cached?.resolved) {
          return { ...item, resolved: cached.resolved, fromCache: cached.cached };
        }
        return { ...item, resolved: null, fromCache: false };
      })
    );

    // Apply results
    for (const result of results) {
      if (result.resolved) {
        const day = itinerary.days[result.dayIndex];
        const slot = day.slots[result.slotIndex];
        const option = slot.options[result.optionIndex];

        // Update activity with resolved place data
        option.activity.place = {
          name: result.resolved.name,
          address: result.resolved.address,
          neighborhood: result.resolved.neighborhood,
          coordinates: result.resolved.coordinates,
          rating: result.resolved.rating,
          reviewCount: result.resolved.reviewCount,
          photos: result.resolved.photos || [],
        };

        if (result.resolved.source !== "ai") {
          // Map source types to match the activity source type
          const sourceMap: Record<string, "ai" | "yelp" | "viator" | "google-places" | "local-data" | "klook" | "osm"> = {
            "foursquare": "local-data",
            "google": "google-places",
            "osm": "osm",
            "yelp": "yelp",
            "viator": "viator",
          };
          option.activity.source = sourceMap[result.resolved.source] || "ai";
        }

        option.id = result.resolved.sourceId || option.id;

        resolved++;
        if (result.fromCache) fromCache++;
      }
    }
  }

  return { itinerary, resolved, fromCache };
}

// ============================================
// STAGE 2: RESTAURANT FILL
// ============================================

interface RestaurantFillResult {
  itinerary: StructuredItineraryData;
  added: number;
}

async function fillRestaurants(
  itinerary: StructuredItineraryData,
  options: EnrichmentOptions
): Promise<RestaurantFillResult> {
  let added = 0;
  const restaurantsPerSlot = options.restaurantsPerSlot || 3;

  for (const day of itinerary.days) {
    for (const slot of day.slots) {
      // Only fill empty meal slots
      if (
        (slot.slotType !== "lunch" && slot.slotType !== "dinner") ||
        slot.options.length > 0
      ) {
        continue;
      }

      // Find nearby coordinates from adjacent activities
      const nearbyCoords = findNearbyCoordinates(day, slot);
      if (!nearbyCoords) continue;

      const key = cacheKey(
        CACHE_NS.RESTAURANT,
        `${nearbyCoords.lat.toFixed(3)},${nearbyCoords.lng.toFixed(3)}`,
        slot.slotType,
        options.preferences?.cuisinePreferences?.join(",") || ""
      );

      try {
        const restaurants = await getOrFetch<Restaurant[]>(
          key,
          async () => {
            return searchRestaurantsNearby(nearbyCoords.lat, nearbyCoords.lng, {
              cuisine: options.preferences?.cuisinePreferences?.[0],
              priceLevel: options.preferences?.priceLevel,
              limit: restaurantsPerSlot + 2, // Get extras in case of filtering
              radius: 2000, // 2km radius
            });
          },
          { ttlMs: CACHE_TTL.SEARCH_RESULTS }
        );

        // Convert restaurants to activity options
        const mealOptions: ActivityOption[] = restaurants
          .slice(0, restaurantsPerSlot)
          .map((r, index) => ({
            id: `yelp-${slot.slotType}-${r.id}`,
            rank: index + 1,
            score: Math.round(r.rating * 20), // Convert 5-star to 100-point
            activity: {
              name: r.name,
              description: `${r.cuisine.join(", ")} - ${"$".repeat(r.priceLevel)}`,
              category: "restaurant",
              duration: slot.slotType === "lunch" ? 60 : 90,
              place: {
                name: r.name,
                address: r.address,
                neighborhood: r.city,
                coordinates: r.coordinates,
                rating: r.rating,
                reviewCount: r.reviewCount,
                photos: r.imageUrl ? [r.imageUrl] : [],
              },
              isFree: false,
              estimatedCost: {
                amount: r.priceLevel * 1500, // Rough JPY estimate
                currency: "JPY",
              },
              tags: ["restaurant", slot.slotType],
              source: "yelp" as const,
            },
            matchReasons: [
              `${r.rating} rating (${r.reviewCount} reviews)`,
              r.cuisine[0] || "Local cuisine",
            ],
            tradeoffs: [],
          }));

        if (mealOptions.length > 0) {
          slot.options = mealOptions;
          slot.behavior = "meal";
          added += mealOptions.length;
        }
      } catch (error) {
        console.warn(`Failed to fetch restaurants for ${slot.slotId}:`, error);
      }
    }
  }

  return { itinerary, added };
}

/**
 * Find coordinates from nearby slots for restaurant search
 */
function findNearbyCoordinates(
  day: DayWithOptions,
  targetSlot: SlotWithOptions
): { lat: number; lng: number } | null {
  const targetIndex = day.slots.indexOf(targetSlot);

  // Check previous slot
  if (targetIndex > 0) {
    const prevSlot = day.slots[targetIndex - 1];
    const coords = getSlotCoordinates(prevSlot);
    if (coords) return coords;
  }

  // Check next slot
  if (targetIndex < day.slots.length - 1) {
    const nextSlot = day.slots[targetIndex + 1];
    const coords = getSlotCoordinates(nextSlot);
    if (coords) return coords;
  }

  // Check any slot in the day
  for (const slot of day.slots) {
    const coords = getSlotCoordinates(slot);
    if (coords) return coords;
  }

  return null;
}

function getSlotCoordinates(
  slot: SlotWithOptions
): { lat: number; lng: number } | null {
  if (slot.options.length === 0) return null;
  const coords = slot.options[0]?.activity?.place?.coordinates;
  if (coords && coords.lat !== 0 && coords.lng !== 0) {
    return coords;
  }
  return null;
}

// ============================================
// STAGE 3: ROUTING
// ============================================

interface RoutingResult {
  itinerary: StructuredItineraryData;
  calculated: number;
  fromCache: number;
}

interface CommuteResult {
  duration: number;
  distance: number;
  method: string;
  instructions?: string;
}

async function calculateRoutes(
  itinerary: StructuredItineraryData,
  options: EnrichmentOptions
): Promise<RoutingResult> {
  let calculated = 0;
  let fromCache = 0;

  /**
   * Helper to calculate a single route between two coordinate pairs
   */
  async function calculateSingleRoute(
    origin: { lat: number; lng: number },
    destination: { lat: number; lng: number },
    commuteType?: import("@/types/structured-itinerary").CommuteType,
    fromName?: string,
    toName?: string
  ): Promise<import("@/types/structured-itinerary").StructuredCommuteInfo | null> {
    const key = cacheKey(
      CACHE_NS.ROUTE,
      `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}`,
      `${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`
    );

    try {
      const commute = await getOrFetch<CommuteResult | null>(
        key,
        async () => {
          const commuteOptions = await getCommuteOptions({
            origin: { lat: origin.lat, lng: origin.lng },
            destination: { lat: destination.lat, lng: destination.lng },
          });
          const selected = commuteOptions.find((o) => o.recommended) || commuteOptions[0];
          if (selected) {
            const instructions = selected.steps?.length
              ? selected.steps.map(s => s.instruction).join(". ")
              : `${selected.method === "walk" ? "Walk" : "Travel"} ${selected.distanceText}`;
            return {
              duration: Math.round(selected.duration / 60),
              distance: selected.distance,
              method: selected.method,
              instructions,
            };
          }
          return null;
        },
        { ttlMs: CACHE_TTL.STATIC }
      );

      if (commute) {
        calculated++;
        return {
          duration: commute.duration,
          distance: commute.distance,
          method: commute.method as "walk" | "transit" | "taxi" | "drive" | "shinkansen" | "flight" | "bus" | "ferry",
          instructions: commute.instructions || `Walk ${Math.round(commute.distance / 1000 * 10) / 10} km`,
          commuteType,
          fromName,
          toName,
        };
      }
    } catch (error) {
      console.warn(`Failed to calculate route:`, error);
    }
    return null;
  }

  for (const day of itinerary.days) {
    const hotelCoords = day.accommodation?.coordinates;
    const hotelName = day.accommodation?.name;

    // Find first and last activity slots with valid coordinates
    let firstSlotWithCoords: SlotWithOptions | null = null;
    let lastSlotWithCoords: SlotWithOptions | null = null;

    for (const slot of day.slots) {
      const coords = getSlotCoordinates(slot);
      if (coords) {
        if (!firstSlotWithCoords) {
          firstSlotWithCoords = slot;
        }
        lastSlotWithCoords = slot;
      }
    }

    // Calculate hotel → first activity commute
    if (hotelCoords && firstSlotWithCoords && (!day.commuteFromHotel || options.forceRefresh)) {
      const firstCoords = getSlotCoordinates(firstSlotWithCoords);
      if (firstCoords) {
        const firstName = firstSlotWithCoords.options[0]?.activity?.name || "First activity";
        const commute = await calculateSingleRoute(
          hotelCoords,
          firstCoords,
          "hotel-to-activity",
          hotelName,
          firstName
        );
        if (commute) {
          day.commuteFromHotel = commute;
        }
      }
    }

    // Calculate between-activities commutes
    let prevCoords: { lat: number; lng: number } | null = null;
    let prevName: string | null = null;

    for (let i = 0; i < day.slots.length; i++) {
      const slot = day.slots[i];
      const coords = getSlotCoordinates(slot);
      const activityName = slot.options[0]?.activity?.name || `Slot ${i + 1}`;

      if (!coords || !prevCoords) {
        prevCoords = coords;
        prevName = activityName;
        continue;
      }

      // Skip if commute already exists
      if (slot.commuteFromPrevious && !options.forceRefresh) {
        prevCoords = coords;
        prevName = activityName;
        continue;
      }

      const commute = await calculateSingleRoute(
        prevCoords,
        coords,
        "between-activities",
        prevName || undefined,
        activityName
      );

      if (commute) {
        slot.commuteFromPrevious = commute;
      }

      prevCoords = coords;
      prevName = activityName;
    }

    // Calculate last activity → hotel commute
    if (hotelCoords && lastSlotWithCoords && (!day.commuteToHotel || options.forceRefresh)) {
      const lastCoords = getSlotCoordinates(lastSlotWithCoords);
      if (lastCoords) {
        const lastName = lastSlotWithCoords.options[0]?.activity?.name || "Last activity";
        const commute = await calculateSingleRoute(
          lastCoords,
          hotelCoords,
          "activity-to-hotel",
          lastName,
          hotelName
        );
        if (commute) {
          day.commuteToHotel = commute;
        }
      }
    }
  }

  return { itinerary, calculated, fromCache };
}

// ============================================
// UTILITIES
// ============================================

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ============================================
// EXPORTS
// ============================================

export {
  enrichPlaces,
  fillRestaurants,
  calculateRoutes,
};

export default {
  enrichItinerary,
  enrichPlaces,
  fillRestaurants,
  calculateRoutes,
};
