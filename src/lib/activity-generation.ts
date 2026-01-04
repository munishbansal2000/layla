// ============================================
// ACTIVITY GENERATION SERVICE (Simplified)
// ============================================
// Thin wrapper around suggestions-service for slot-level activity generation
//
// DEPRECATED: Most functionality has moved to:
// - itinerary-service.ts → Full itinerary generation, swap, fill operations
// - suggestions-service.ts → Slot-level POI/restaurant suggestions
//
// This file is kept for backward compatibility but delegates to suggestions-service

import { suggestions, type SuggestionsRequest, type Suggestion } from "./suggestions-service";
import type { ActivityOption } from "@/types/structured-itinerary";

// ============================================
// TYPES
// ============================================

export interface SlotSuggestionRequest {
  city: string;
  slotType: "morning" | "lunch" | "afternoon" | "dinner" | "evening";
  coordinates?: { lat: number; lng: number };
  maxDistance?: number;
  limit?: number;
  excludeNames?: string[];
  preferences?: string;
}

export interface SlotSuggestionResult {
  suggestions: ActivityOption[];
  metadata: {
    city: string;
    slotType: string;
    provider: string;
    totalSuggestions: number;
  };
}

// ============================================
// CONVERSION HELPERS
// ============================================

/**
 * Convert a Suggestion from suggestions-service to an ActivityOption
 */
function suggestionToActivityOption(sugg: Suggestion, index: number): ActivityOption {
  return {
    id: sugg.id,
    rank: index + 1,
    score: 85 - index * 5,
    activity: {
      name: sugg.activity.name,
      description: sugg.activity.description || "",
      category: sugg.activity.category as ActivityOption["activity"]["category"],
      duration: sugg.activity.duration,
      place: {
        name: sugg.activity.place?.name || sugg.activity.name,
        address: "",
        neighborhood: sugg.activity.place?.neighborhood || "",
        coordinates: sugg.activity.place?.coordinates || { lat: 0, lng: 0 },
        rating: sugg.activity.place?.rating,
        photos: sugg.activity.place?.photos || [],
      },
      isFree: sugg.ticketRequirement === "free",
      tags: [],
      source: sugg.source === "data" ? "local-data" : "ai",
    },
    matchReasons: [
      sugg.type === "restaurant" ? "Nearby restaurant" : "Suggested activity",
    ],
    tradeoffs:
      sugg.ticketRequirement === "required" ? ["Requires advance booking"] : [],
  };
}

// ============================================
// MAIN API
// ============================================

/**
 * Generate activity suggestions for a specific slot
 * Delegates to suggestions-service
 */
export async function generateSlotSuggestions(
  request: SlotSuggestionRequest
): Promise<SlotSuggestionResult> {
  const suggestionsRequest: SuggestionsRequest = {
    city: request.city,
    slotType: request.slotType,
    coordinates: request.coordinates,
    maxDistance: request.maxDistance,
    limit: request.limit || 5,
    excludeNames: request.excludeNames,
    userPreferences: request.preferences,
  };

  const response = await suggestions.getSuggestions(suggestionsRequest);

  return {
    suggestions: response.suggestions.map((s, i) => suggestionToActivityOption(s, i)),
    metadata: {
      city: request.city,
      slotType: request.slotType,
      provider: response.metadata.provider,
      totalSuggestions: response.suggestions.length,
    },
  };
}

/**
 * Generate restaurant suggestions for a meal slot
 */
export async function generateRestaurantSuggestions(
  city: string,
  mealType: "lunch" | "dinner",
  coordinates?: { lat: number; lng: number },
  limit?: number
): Promise<ActivityOption[]> {
  const response = await suggestions.getSuggestions({
    city,
    slotType: mealType,
    coordinates,
    limit: limit || 3,
  });

  return response.suggestions
    .filter((s) => s.type === "restaurant")
    .map((s, i) => suggestionToActivityOption(s, i));
}

// ============================================
// DEPRECATED - Use itinerary-service.ts instead
// ============================================

/**
 * @deprecated Use itinerary-service.generate() instead
 */
export class ActivityGenerationService {
  constructor() {
    console.warn(
      "[ActivityGenerationService] DEPRECATED: Use itinerary-service.ts for full itinerary generation"
    );
  }

  /**
   * @deprecated Use itinerary-service.generate() instead
   */
  async generateActivities(request: {
    destination: string;
    dates: { start: string; end: string };
    travelers: { mode: string; adults: number; children: number };
    settings: Record<string, unknown>;
  }) {
    console.warn(
      "[ActivityGenerationService.generateActivities] DEPRECATED: Use itinerary-service.generate()"
    );

    // Return empty result - callers should migrate to itinerary-service
    return {
      activities: [],
      restaurants: [],
      templates: [],
      warnings: ["This method is deprecated. Use itinerary-service.generate() instead."],
    };
  }
}

// ============================================
// EXPORTS
// ============================================

export const activityGeneration = {
  generateSlotSuggestions,
  generateRestaurantSuggestions,
};

export default activityGeneration;
