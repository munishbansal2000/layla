/**
 * Unified Suggestions Service
 *
 * Clean abstraction for activity/POI suggestions.
 * Switches between data-driven (japan-data-service) and LLM-based suggestions.
 *
 * Usage:
 *   import { suggestions } from './suggestions-service';
 *   const results = await suggestions.getSuggestions({ city: 'tokyo', slotType: 'afternoon' });
 */

import { llm, type ChatMessage } from "./llm";
import { getSystemPrompt } from "./prompts";

// ============================================
// TYPES
// ============================================

export type SuggestionsProvider = "data" | "llm";

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface SuggestionPlace {
  name: string;
  neighborhood?: string;
  rating?: number;
  coordinates?: Coordinates;
  photos?: string[];
}

export interface SuggestionActivity {
  name: string;
  category: string;
  duration: number;
  description?: string;
  place?: SuggestionPlace;
}

export interface BookingInfo {
  hasTickets: boolean;
  ticketType: "required" | "optional" | "free";
  experienceCount: number;
  fee?: string;
  bookingAdvice?: {
    advanceBookingRequired: boolean;
    recommendedBookingDays?: number;
    walkUpAvailable?: boolean;
    peakTimes?: string[];
    tips?: string;
  };
}

export interface Availability {
  isOpen: boolean;
  openTime?: string;
  closeTime?: string;
  confidence: number;
  reason?: string;
}

export interface TimeConflict {
  hasConflict: boolean;
  slotDuration: number;
  activityDuration: number;
  overflowMinutes: number;
  severity: "minor" | "moderate" | "major";
  suggestion?: string;
}

export interface Suggestion {
  id: string;
  type: "attraction" | "restaurant" | "experience" | "must-see";
  activity: SuggestionActivity;
  distance?: number | null;
  ticketRequirement?: "required" | "optional" | "free";
  bookingInfo?: BookingInfo;
  availability?: Availability;
  timeConflict?: TimeConflict;
  source: SuggestionsProvider;
}

export interface SuggestionsRequest {
  city: string;
  slotType: "morning" | "lunch" | "afternoon" | "dinner" | "evening";
  coordinates?: Coordinates;
  maxDistance?: number;
  limit?: number;
  excludeIds?: string[];
  excludeNames?: string[];
  dayOfWeek?: number;
  filterClosed?: boolean;
  existingMealSlots?: ("breakfast" | "lunch" | "dinner")[];
  slotDuration?: number;
  // Context for LLM provider
  userPreferences?: string;
  tripContext?: string;
}

export interface SuggestionsResponse {
  suggestions: Suggestion[];
  metadata: {
    city: string;
    slotType: string;
    provider: SuggestionsProvider;
    totalSuggestions: number;
    hasLocationFilter: boolean;
    maxDistance?: number;
    ticketSummary: {
      required: number;
      optional: number;
      free: number;
    };
  };
}

// ============================================
// CONFIGURATION
// ============================================

export function getSuggestionsProvider(): SuggestionsProvider {
  const provider = process.env.SUGGESTIONS_PROVIDER?.toLowerCase();
  if (provider === "llm" || provider === "ai") return "llm";
  return "data";
}

export function getSuggestionsConfig() {
  return {
    provider: getSuggestionsProvider(),
    defaultLimit: 10,
    defaultMaxDistance: 2000,
  };
}

// ============================================
// DATA PROVIDER (japan-data-service)
// ============================================

async function getSuggestionsFromData(
  request: SuggestionsRequest
): Promise<SuggestionsResponse> {
  // Dynamic import to avoid circular dependencies
  const {
    getPOISuggestionsWithBooking,
    getPOIsForTimeSlot,
    getPaidExperiences,
    poiToActivityOption,
    restaurantToActivityOption,
    klookToActivityOption,
    calculateDistance,
    checkOpenDuringSlot,
  } = await import("./japan-data-service");

  const {
    city,
    slotType,
    coordinates,
    maxDistance = 2000,
    limit = 10,
    excludeIds = [],
    excludeNames = [],
    dayOfWeek = new Date().getDay(),
    filterClosed = false,
    existingMealSlots = [],
    slotDuration,
  } = request;

  const suggestions: Suggestion[] = [];

  // Helper to normalize names for comparison
  const normalizeName = (name: string): string => {
    return name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[-\s]+/g, "")
      .replace(/temple|shrine|museum|park|garden|station/gi, "")
      .trim();
  };

  const shouldExcludeByName = (name: string): boolean => {
    if (excludeNames.length === 0) return false;
    const normalizedName = normalizeName(name);
    const lowercaseName = name.toLowerCase();
    return excludeNames.some(
      (excluded) =>
        excluded === lowercaseName ||
        excluded === normalizedName ||
        normalizeName(excluded) === normalizedName
    );
  };

  // Calculate time conflict
  const calculateTimeConflict = (
    activityDuration: number
  ): TimeConflict | undefined => {
    if (!slotDuration) return undefined;

    const overflowMinutes = activityDuration - slotDuration;
    if (overflowMinutes <= 0) {
      return {
        hasConflict: false,
        slotDuration,
        activityDuration,
        overflowMinutes: 0,
        severity: "minor",
      };
    }

    const severity: "minor" | "moderate" | "major" =
      overflowMinutes <= 15
        ? "minor"
        : overflowMinutes <= 30
          ? "moderate"
          : "major";

    const suggestion =
      severity === "minor"
        ? "Slightly exceeds slot time, but usually manageable"
        : severity === "moderate"
          ? "Consider extending the time slot or shortening the visit"
          : "Best suited for a longer time block";

    return {
      hasConflict: true,
      slotDuration,
      activityDuration,
      overflowMinutes,
      severity,
      suggestion,
    };
  };

  const isMealSlot = slotType === "lunch" || slotType === "dinner";
  const mealAlreadyExists =
    isMealSlot &&
    existingMealSlots.includes(slotType as "breakfast" | "lunch" | "dinner");

  if (isMealSlot && !mealAlreadyExists) {
    // For meal slots, get restaurants
    const { restaurants } = await getPOIsForTimeSlot(city, slotType);

    let filteredRestaurants = restaurants
      .filter((r) => !excludeIds.includes(r.id))
      .filter((r) => !shouldExcludeByName(r.name));

    if (coordinates && coordinates.lat !== 0 && coordinates.lng !== 0) {
      filteredRestaurants = filteredRestaurants
        .map((r) => ({
          ...r,
          distance: calculateDistance(coordinates, r.coordinates),
        }))
        .filter((r) => r.distance <= maxDistance)
        .sort((a, b) => a.distance - b.distance);
    }

    for (let i = 0; i < Math.min(limit, filteredRestaurants.length); i++) {
      const restaurant = filteredRestaurants[i];
      const activityOption = restaurantToActivityOption(restaurant, i + 1);

      suggestions.push({
        id: restaurant.id,
        type: "restaurant",
        activity: {
          name: activityOption.activity.name,
          category: activityOption.activity.category,
          duration: activityOption.activity.duration,
          description: activityOption.activity.description,
          place: {
            name: activityOption.activity.place.name,
            neighborhood: activityOption.activity.place.neighborhood,
            rating: activityOption.activity.place.rating,
            coordinates: activityOption.activity.place.coordinates,
            photos: activityOption.activity.place.photos,
          },
        },
        distance: (restaurant as typeof restaurant & { distance?: number })
          .distance,
        ticketRequirement: "free",
        bookingInfo: {
          hasTickets: false,
          ticketType: "free",
          experienceCount: 0,
        },
        timeConflict: calculateTimeConflict(activityOption.activity.duration),
        source: "data",
      });
    }
  } else {
    // For activity slots, get POIs with booking info
    const enrichedPOIs = await getPOISuggestionsWithBooking(city, {
      slotType,
      coordinates,
      maxDistance,
      limit: (limit - 2) * 2,
      excludeIds,
    });

    const filteredPOIs = enrichedPOIs.filter(
      (poi) => !shouldExcludeByName(poi.name)
    );

    for (const poi of filteredPOIs.slice(0, limit - 2)) {
      const activityOption = poiToActivityOption(poi, poi.rank);
      const availability = checkOpenDuringSlot(
        poi.openingHours,
        slotType,
        dayOfWeek
      );

      if (filterClosed && !availability.isOpen) {
        continue;
      }

      suggestions.push({
        id: poi.id,
        type: "attraction",
        activity: {
          name: activityOption.activity.name,
          category: activityOption.activity.category,
          duration: activityOption.activity.duration,
          description: activityOption.activity.description,
          place: {
            name: activityOption.activity.place.name,
            neighborhood: activityOption.activity.place.neighborhood,
            rating: activityOption.activity.place.rating,
            coordinates: activityOption.activity.place.coordinates,
            photos: activityOption.activity.place.photos,
          },
        },
        distance: poi.distance,
        ticketRequirement: poi.ticketRequirement,
        bookingInfo: {
          hasTickets: poi.ticketRequirement !== "free",
          ticketType: poi.ticketRequirement,
          experienceCount: poi.linkedExperiences?.length || 0,
          fee: poi.ticketInfo?.fee,
          bookingAdvice: poi.ticketInfo?.bookingAdvice,
        },
        availability: {
          isOpen: availability.isOpen,
          openTime: availability.openTime,
          closeTime: availability.closeTime,
          confidence: availability.confidence,
          reason: availability.reason,
        },
        timeConflict: calculateTimeConflict(activityOption.activity.duration),
        source: "data",
      });
    }

    // Add Klook experiences
    try {
      const klookActivities = await getPaidExperiences(city, {
        limit: 5,
        minRating: 4.0,
        sortBy: "bookingCount",
      });

      const filteredKlook = klookActivities
        .filter((k) => !excludeIds.includes(k.id))
        .filter((k) => !suggestions.some((s) => s.id === k.id))
        .slice(0, 2);

      for (const klook of filteredKlook) {
        const activityOption = klookToActivityOption(
          klook,
          suggestions.length + 1
        );

        suggestions.push({
          id: klook.id,
          type: "experience",
          activity: {
            name: activityOption.activity.name,
            category: activityOption.activity.category,
            duration: activityOption.activity.duration,
            description: activityOption.activity.description,
            place: {
              name: activityOption.activity.place.name,
              neighborhood: activityOption.activity.place.neighborhood,
              rating: activityOption.activity.place.rating,
              coordinates: activityOption.activity.place.coordinates,
              photos: activityOption.activity.place.photos,
            },
          },
          distance: null,
          ticketRequirement: "required",
          bookingInfo: {
            hasTickets: true,
            ticketType: "required",
            experienceCount: 1,
          },
          source: "data",
        });
      }
    } catch {
      // Klook data not available
    }
  }

  return {
    suggestions,
    metadata: {
      city,
      slotType,
      provider: "data",
      totalSuggestions: suggestions.length,
      hasLocationFilter: !!coordinates,
      maxDistance,
      ticketSummary: {
        required: suggestions.filter((s) => s.ticketRequirement === "required")
          .length,
        optional: suggestions.filter((s) => s.ticketRequirement === "optional")
          .length,
        free: suggestions.filter((s) => s.ticketRequirement === "free").length,
      },
    },
  };
}

// ============================================
// LLM PROVIDER
// ============================================

async function getSuggestionsFromLLM(
  request: SuggestionsRequest
): Promise<SuggestionsResponse> {
  const {
    city,
    slotType,
    coordinates,
    limit = 5,
    excludeNames = [],
    excludeIds = [],
    userPreferences,
    tripContext,
    slotDuration,
  } = request;

  // Get the base system prompt from global prompts
  const baseSystemPrompt = getSystemPrompt("slotSuggestions");

  // Add context-specific instructions - ask for more fields
  const systemPrompt = `${baseSystemPrompt}

CONTEXT:
- City: ${city}
- Time slot: ${slotType}
- Return exactly ${limit} suggestions
- Do NOT include: ${excludeNames.length > 0 ? excludeNames.join(", ") : "nothing to exclude"}

IMPORTANT: For each suggestion, include these fields in the activity:
- name: Real venue name
- category: temple, museum, park, restaurant, landmark, market, viewpoint, shopping, nightlife
- duration: Minutes (60-180)
- description: 1-2 sentences
- neighborhood: Area of ${city} where this is located
- coordinates: { lat: number, lng: number } (approximate is fine)`;

  const userPrompt = `Generate ${limit} ${slotType} activity suggestions for ${city}.
${coordinates ? `Near coordinates: ${coordinates.lat}, ${coordinates.lng}` : ""}
${userPreferences ? `User preferences: ${userPreferences}` : ""}
${tripContext ? `Trip context: ${tripContext}` : ""}

Return only valid JSON.`;

  const messages: ChatMessage[] = [{ role: "user", content: userPrompt }];

  // Helper to normalize names for comparison (same as data provider)
  const normalizeName = (name: string): string => {
    return name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[-\s]+/g, "")
      .replace(/temple|shrine|museum|park|garden|station/gi, "")
      .trim();
  };

  const shouldExcludeByName = (name: string): boolean => {
    if (excludeNames.length === 0) return false;
    const normalizedName = normalizeName(name);
    const lowercaseName = name.toLowerCase();
    return excludeNames.some(
      (excluded) =>
        excluded.toLowerCase() === lowercaseName ||
        normalizeName(excluded) === normalizedName ||
        lowercaseName.includes(excluded.toLowerCase()) ||
        excluded.toLowerCase().includes(lowercaseName)
    );
  };

  // Calculate time conflict (same as data provider)
  const calculateTimeConflict = (
    activityDuration: number
  ): TimeConflict | undefined => {
    if (!slotDuration) return undefined;

    const overflowMinutes = activityDuration - slotDuration;
    if (overflowMinutes <= 0) {
      return {
        hasConflict: false,
        slotDuration,
        activityDuration,
        overflowMinutes: 0,
        severity: "minor",
      };
    }

    const severity: "minor" | "moderate" | "major" =
      overflowMinutes <= 15
        ? "minor"
        : overflowMinutes <= 30
          ? "moderate"
          : "major";

    const suggestion =
      severity === "minor"
        ? "Slightly exceeds slot time, but usually manageable"
        : severity === "moderate"
          ? "Consider extending the time slot or shortening the visit"
          : "Best suited for a longer time block";

    return {
      hasConflict: true,
      slotDuration,
      activityDuration,
      overflowMinutes,
      severity,
      suggestion,
    };
  };

  // Generate stable ID from name
  const generateStableId = (name: string, index: number): string => {
    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .substring(0, 30);
    return `llm-${city}-${slotType}-${slug}-${index}`;
  };

  try {
    const response = await llm.chat(messages, {
      systemPrompt,
      temperature: 0.7,
      maxTokens: 2000,
      jsonMode: true,
    });

    // Parse the response
    let parsed: { suggestions: Array<{
      id?: string;
      type?: "attraction" | "restaurant" | "experience";
      activity: {
        name: string;
        category: string;
        duration?: number;
        description?: string;
        neighborhood?: string;
        coordinates?: { lat: number; lng: number };
      };
      ticketRequirement?: string;
    }> };

    try {
      parsed = JSON.parse(response);
    } catch {
      // Try to extract JSON from response
      const jsonMatch =
        response.match(/```(?:json)?\s*([\s\S]*?)```/) ||
        response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        parsed = JSON.parse(jsonStr.trim());
      } else {
        throw new Error("Failed to parse LLM response as JSON");
      }
    }

    // Process suggestions with post-filtering and enrichment
    const suggestions: Suggestion[] = [];

    for (const [index, s] of (parsed.suggestions || []).entries()) {
      // POST-FILTER: Skip if name matches excludeNames (LLM might have ignored instruction)
      if (shouldExcludeByName(s.activity.name)) {
        console.log(`[suggestions-service] Filtering out excluded name: ${s.activity.name}`);
        continue;
      }

      // Generate stable ID
      const id = generateStableId(s.activity.name, index);

      // Skip if ID is in excludeIds
      if (excludeIds.includes(id)) {
        continue;
      }

      // Normalize ticketRequirement to valid enum values
      let ticketReq: "required" | "optional" | "free" = "free";
      const rawTicket = (s.ticketRequirement || "free").toLowerCase();
      if (rawTicket.includes("required") || rawTicket.includes("paid") || rawTicket.includes("reservation") || rawTicket.includes("ticket") || rawTicket.includes("fee")) {
        ticketReq = "required";
      } else if (rawTicket.includes("optional") || rawTicket.includes("donation") || rawTicket.includes("suggested")) {
        ticketReq = "optional";
      }

      // Normalize type
      let type: "attraction" | "restaurant" | "experience" | "must-see" = "attraction";
      const category = s.activity.category?.toLowerCase() || "";
      if (category.includes("restaurant") || category.includes("food") || category.includes("cafe") || category.includes("dining")) {
        type = "restaurant";
      } else if (category.includes("experience") || category.includes("tour") || category.includes("class")) {
        type = "experience";
      }

      const duration = s.activity.duration || 90;

      suggestions.push({
        id,
        type,
        activity: {
          name: s.activity.name,
          category: s.activity.category || "attraction",
          duration,
          description: s.activity.description,
          // Include place object if coordinates/neighborhood available
          place: (s.activity.neighborhood || s.activity.coordinates) ? {
            name: s.activity.name,
            neighborhood: s.activity.neighborhood,
            coordinates: s.activity.coordinates,
          } : undefined,
        },
        ticketRequirement: ticketReq,
        bookingInfo: {
          hasTickets: ticketReq !== "free",
          ticketType: ticketReq,
          experienceCount: 0,
        },
        timeConflict: calculateTimeConflict(duration),
        source: "llm" as const,
      });
    }

    // If we filtered too many, request more wasn't enough - log it
    if (suggestions.length < limit) {
      console.log(`[suggestions-service] LLM returned ${suggestions.length}/${limit} after filtering`);
    }

    return {
      suggestions,
      metadata: {
        city,
        slotType,
        provider: "llm",
        totalSuggestions: suggestions.length,
        hasLocationFilter: !!coordinates,
        ticketSummary: {
          required: suggestions.filter(
            (s) => s.ticketRequirement === "required"
          ).length,
          optional: suggestions.filter(
            (s) => s.ticketRequirement === "optional"
          ).length,
          free: suggestions.filter((s) => s.ticketRequirement === "free")
            .length,
        },
      },
    };
  } catch (error) {
    console.error("[suggestions-service] LLM error:", error);
    // Fallback to data provider
    console.log("[suggestions-service] Falling back to data provider");
    return getSuggestionsFromData(request);
  }
}

// ============================================
// UNIFIED API
// ============================================

/**
 * Get activity suggestions for a time slot
 */
export async function getSuggestions(
  request: SuggestionsRequest
): Promise<SuggestionsResponse> {
  const provider = getSuggestionsProvider();

  console.log(`[suggestions-service] Using ${provider} provider for ${request.city}/${request.slotType}`);

  switch (provider) {
    case "llm":
      return getSuggestionsFromLLM(request);
    default:
      return getSuggestionsFromData(request);
  }
}

/**
 * Get provider info
 */
export function getProviderInfo() {
  const config = getSuggestionsConfig();
  const descriptions: Record<SuggestionsProvider, string> = {
    data: "Pre-curated POI data (fast, deterministic, no API costs)",
    llm: "AI-generated suggestions (flexible, conversational)",
  };

  return {
    provider: config.provider,
    description: descriptions[config.provider],
  };
}

// ============================================
// EXPORTS
// ============================================

export const suggestions = {
  getSuggestions,
  getProvider: getSuggestionsProvider,
  getConfig: getSuggestionsConfig,
  getProviderInfo,
};

export default suggestions;
