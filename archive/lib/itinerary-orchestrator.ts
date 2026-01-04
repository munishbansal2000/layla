// ============================================
// ITINERARY ORCHESTRATOR SERVICE
// ============================================
//
// @deprecated This module is deprecated. Use itinerary-service.ts instead.
//
// Migration guide:
// - For full itinerary generation: use itinerary-service.generate()
// - For swap operations: use itinerary-service.getSwapOptions() and swapActivity()
// - For slot filling: use itinerary-service.fillSlot()
// - For reordering: use itinerary-service.reorderDays() and reorderSlots()
//
// This file is kept for backward compatibility but will be removed in a future release.

import type {
  TripMode,
  PaceMode,
  BudgetLevel,
} from "@/types/activity-suggestion";
import type { StructuredItineraryData, DayWithOptions } from "@/types/structured-itinerary";
import { generate as generateItinerary, getSwapOptions as getSwapOptionsImpl } from "./itinerary-service";

// ============================================
// DEPRECATED TYPES (use types from itinerary-service.ts)
// ============================================

/**
 * @deprecated Use ItineraryRequest from itinerary-service.ts
 */
export interface GenerateItineraryRequest {
  destination: {
    name: string;
    coordinates: { lat: number; lng: number };
    country: string;
  };
  startDate: string;
  endDate: string;
  travelers: {
    adults: number;
    children: number;
    infants: number;
  };
  tripMode: TripMode;
  pace: PaceMode;
  budget: BudgetLevel;
  interests: string[];
  dietaryRestrictions?: string[];
  mobilityNeeds?: string[];
  excludedCategories?: string[];
  mustSeeActivities?: string[];
  weatherForecasts?: unknown[];
  groundEntities?: boolean;
}

/**
 * @deprecated Use StructuredItineraryData from structured-itinerary.ts
 */
export interface GeneratedItinerary {
  id: string;
  status: "draft" | "reviewing" | "confirmed" | "in-progress";
  destination: GenerateItineraryRequest["destination"];
  dateRange: {
    start: string;
    end: string;
    totalDays: number;
  };
  tripMode: TripMode;
  pace: PaceMode;
  budget: BudgetLevel;
  days: DayWithOptions[];
  activityPool: unknown[];
  scoredActivities: unknown[];
  swipeQueue: unknown[];
  keptActivities: string[];
  rejectedActivities: string[];
  savedForLater: string[];
  stats: ItineraryStats;
  generatedAt: string;
  lastModifiedAt: string;
}

/**
 * @deprecated
 */
export interface ItineraryStats {
  totalActivities: number;
  totalMeals: number;
  estimatedCost: { min: number; max: number; currency: string };
  freeActivities: number;
  averageScore: number;
  neighborhoods: string[];
  categories: Record<string, number>;
}

/**
 * @deprecated Use SlotSwapOptions from itinerary-service.ts
 */
export interface SlotDetails {
  slotId: string;
  dayIndex: number;
  scheduledActivity: unknown;
  alternatives: unknown[];
}

// ============================================
// DEPRECATED ORCHESTRATOR CLASS
// ============================================

function generateId(): string {
  return `itin-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * @deprecated Use itinerary-service.ts functions directly instead
 */
export class ItineraryOrchestrator {
  constructor() {
    console.warn(
      "[ItineraryOrchestrator] DEPRECATED: Use itinerary-service.ts instead.\n" +
      "  - generate() → itinerary-service.generate()\n" +
      "  - getSwapOptions() → itinerary-service.getSwapOptions()\n" +
      "  - swapActivity() → itinerary-service.swapActivity()"
    );
  }

  /**
   * @deprecated Use itinerary-service.generate() instead
   */
  async generateItinerary(request: GenerateItineraryRequest): Promise<GeneratedItinerary> {
    console.warn("[ItineraryOrchestrator.generateItinerary] DEPRECATED: Use itinerary-service.generate()");

    const startDate = new Date(request.startDate);
    const endDate = new Date(request.endDate);
    const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // Delegate to itinerary-service
    const result = await generateItinerary({
      cities: [request.destination.name],
      startDate: request.startDate,
      totalDays,
      pace: request.pace === "ambitious" ? "packed" : request.pace === "normal" ? "moderate" : request.pace,
      interests: request.interests,
      budget: request.budget,
    });

    // Convert to legacy format
    return {
      id: generateId(),
      status: "draft",
      destination: request.destination,
      dateRange: {
        start: request.startDate,
        end: request.endDate,
        totalDays,
      },
      tripMode: request.tripMode,
      pace: request.pace,
      budget: request.budget,
      days: result.itinerary.days,
      activityPool: [],
      scoredActivities: [],
      swipeQueue: [],
      keptActivities: [],
      rejectedActivities: [],
      savedForLater: [],
      stats: this.calculateStats(result.itinerary.days),
      generatedAt: new Date().toISOString(),
      lastModifiedAt: new Date().toISOString(),
    };
  }

  /**
   * @deprecated Use itinerary-service.getSwapOptions() instead
   */
  async getSwapOptions(itinerary: GeneratedItinerary, slotId: string): Promise<SlotDetails | null> {
    console.warn("[ItineraryOrchestrator.getSwapOptions] DEPRECATED: Use itinerary-service.getSwapOptions()");

    // Find the day number from the slotId
    const slotMatch = slotId.match(/day(\d+)/);
    const dayNumber = slotMatch ? parseInt(slotMatch[1], 10) : 1;

    // Convert to StructuredItineraryData format
    const structuredItinerary: StructuredItineraryData = {
      destination: itinerary.destination.name,
      country: itinerary.destination.country,
      days: itinerary.days,
      generalTips: [],
      estimatedBudget: { total: { min: 0, max: 0 }, currency: "JPY" },
    };

    const result = await getSwapOptionsImpl(structuredItinerary, dayNumber, slotId);
    if (!result) return null;

    return {
      slotId: result.slotId,
      dayIndex: result.dayNumber - 1,
      scheduledActivity: result.currentActivity,
      alternatives: result.alternatives,
    };
  }

  /**
   * @deprecated Use itinerary-service.swapActivity() instead
   */
  swapActivity(
    _itinerary: GeneratedItinerary,
    _slotId: string,
    _newActivityId: string
  ): GeneratedItinerary {
    console.warn("[ItineraryOrchestrator.swapActivity] DEPRECATED: Use itinerary-service.swapActivity()");

    // Find the new activity in alternatives
    // This is a simplified implementation - the new API expects ActivityOption directly
    throw new Error(
      "This method is deprecated. Use itinerary-service.swapActivity() with the ActivityOption object instead."
    );
  }

  /**
   * @deprecated
   */
  processSwipe(
    itinerary: GeneratedItinerary,
    _activityId: string,
    _action: "keep" | "reject" | "save-for-later"
  ): GeneratedItinerary {
    console.warn("[ItineraryOrchestrator.processSwipe] DEPRECATED: Swipe functionality is no longer supported");
    return itinerary;
  }

  /**
   * @deprecated
   */
  lockActivity(
    itinerary: GeneratedItinerary,
    _slotId: string,
    _locked: boolean
  ): GeneratedItinerary {
    console.warn("[ItineraryOrchestrator.lockActivity] DEPRECATED");
    return itinerary;
  }

  /**
   * @deprecated
   */
  confirmItinerary(itinerary: GeneratedItinerary): GeneratedItinerary {
    console.warn("[ItineraryOrchestrator.confirmItinerary] DEPRECATED");
    itinerary.status = "confirmed";
    itinerary.lastModifiedAt = new Date().toISOString();
    return itinerary;
  }

  private calculateStats(days: DayWithOptions[]): ItineraryStats {
    const neighborhoods = new Set<string>();
    const categories: Record<string, number> = {};
    let totalActivities = 0;
    let totalMeals = 0;
    let freeActivities = 0;
    let totalScore = 0;

    for (const day of days) {
      for (const slot of day.slots || []) {
        const activity = slot.options?.[0]?.activity;
        if (!activity) continue;

        if (activity.place?.neighborhood) {
          neighborhoods.add(activity.place.neighborhood);
        }

        const category = activity.category || "activity";
        categories[category] = (categories[category] || 0) + 1;

        if (category === "restaurant") {
          totalMeals++;
        } else {
          totalActivities++;
        }

        if (activity.isFree) {
          freeActivities++;
        }

        totalScore += slot.options?.[0]?.score || 70;
      }
    }

    const totalItems = totalActivities + totalMeals;

    return {
      totalActivities,
      totalMeals,
      estimatedCost: { min: 0, max: 0, currency: "JPY" },
      freeActivities,
      averageScore: totalItems > 0 ? Math.round(totalScore / totalItems) : 0,
      neighborhoods: Array.from(neighborhoods),
      categories,
    };
  }
}

// ============================================
// DEPRECATED FACTORY FUNCTIONS
// ============================================

let orchestratorInstance: ItineraryOrchestrator | null = null;

/**
 * @deprecated Use itinerary-service.ts functions directly
 */
export function getItineraryOrchestrator(): ItineraryOrchestrator {
  console.warn("[getItineraryOrchestrator] DEPRECATED: Use itinerary-service.ts functions directly");
  if (!orchestratorInstance) {
    orchestratorInstance = new ItineraryOrchestrator();
  }
  return orchestratorInstance;
}

/**
 * @deprecated Use itinerary-service.ts functions directly
 */
export function createItineraryOrchestrator(): ItineraryOrchestrator {
  console.warn("[createItineraryOrchestrator] DEPRECATED: Use itinerary-service.ts functions directly");
  return new ItineraryOrchestrator();
}
