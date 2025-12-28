// ============================================
// ITINERARY ORCHESTRATOR SERVICE
// ============================================
// Coordinates all the services to generate, manage, and modify travel itineraries.
// This is the main entry point that wires together:
// - Activity Generation Service
// - Scoring Engine
// - Schedule Builder
// - Swap Service
// - Entity Resolution Service

import {
  CoreActivity,
  RestaurantActivity,
  ScoredActivity,
  TripMode,
  TravelerComposition,
  PaceMode,
  BudgetLevel,
  WeatherForecast,
} from "@/types/activity-suggestion";
import { Trip } from "@/types";
import { ActivityGenerationService } from "./activity-generation";
import { createScoringEngine } from "./scoring-engine";
import {
  ScheduleBuilder,
  DaySchedule,
  ScheduledActivity,
} from "./schedule-builder";
import { SwapService, SwapOption, SwapReason } from "./swap-service";
import { EntityResolutionService } from "./entity-resolution";

// ============================================
// TYPES
// ============================================

/**
 * Simplified request to generate a full itinerary
 */
export interface GenerateItineraryRequest {
  destination: {
    name: string;
    coordinates: { lat: number; lng: number };
    country: string;
  };
  startDate: string; // ISO date string
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
  weatherForecasts?: WeatherForecast[];
  groundEntities?: boolean;
}

/**
 * Generated itinerary result
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
  days: DaySchedule[];
  activityPool: (CoreActivity | RestaurantActivity)[];
  scoredActivities: ScoredActivity[];
  swipeQueue: ScoredActivity[];
  keptActivities: string[];
  rejectedActivities: string[];
  savedForLater: string[];
  stats: ItineraryStats;
  generatedAt: string;
  lastModifiedAt: string;
}

/**
 * Stats about the itinerary
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
 * Slot details for swap operations
 */
export interface SlotDetails {
  slotId: string;
  dayIndex: number;
  scheduledActivity: ScheduledActivity;
  alternatives: SwapOption[];
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function generateId(): string {
  return `itin-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

function buildTravelerComposition(
  travelers: GenerateItineraryRequest["travelers"],
  tripMode: TripMode
): TravelerComposition {
  return {
    mode: tripMode,
    adults: travelers.adults,
    children: travelers.children,
    infants: travelers.infants,
    needsKidFriendly: travelers.children > 0 || travelers.infants > 0,
    needsRomantic: tripMode === "honeymoon" || tripMode === "couples",
    needsAccessible: false,
    allowsAdultVenues: travelers.children === 0 && travelers.infants === 0,
    prefersSocialSpots: tripMode === "friends" || tripMode === "girls-trip" || tripMode === "guys-trip",
  };
}

// ============================================
// ORCHESTRATOR SERVICE
// ============================================

/**
 * Itinerary Orchestrator - coordinates all services for itinerary management
 */
export class ItineraryOrchestrator {
  private activityService: ActivityGenerationService;
  private entityResolver: EntityResolutionService;

  constructor() {
    this.activityService = new ActivityGenerationService();
    this.entityResolver = new EntityResolutionService();
  }

  /**
   * Generate a complete itinerary from scratch
   */
  async generateItinerary(request: GenerateItineraryRequest): Promise<GeneratedItinerary> {
    const startTime = Date.now();
    const itineraryId = generateId();

    // Step 1: Calculate trip duration
    const startDate = new Date(request.startDate);
    const endDate = new Date(request.endDate);
    const totalDays =
      Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    // Step 2: Build traveler composition
    const travelers = buildTravelerComposition(request.travelers, request.tripMode);

    // Step 3: Generate activities via AI
    const generationResult = await this.activityService.generateActivities({
      destination: request.destination.name,
      dates: { start: request.startDate, end: request.endDate },
      travelers,
      settings: {
        tripMode: request.tripMode,
        dietary: [],
        allergies: [],
      },
    } as any);

    // Extract activities from scored results
    const activityPool: (CoreActivity | RestaurantActivity)[] = [];
    const scoredActivities: ScoredActivity[] = [];

    for (const scored of generationResult.activities) {
      scoredActivities.push(scored);
      activityPool.push(scored.activity);
    }
    for (const scored of generationResult.restaurants) {
      scoredActivities.push(scored);
      activityPool.push(scored.activity);
    }

    // Step 4: Build day-by-day schedule
    // For now, create simple placeholder schedules
    const days = this.createPlaceholderSchedule(
      scoredActivities,
      totalDays,
      startDate,
      request.destination.name
    );

    // Step 5: Calculate stats
    const stats = this.calculateStats(days);

    // Step 6: Build swipe queue
    const swipeQueue = this.buildSwipeQueue(scoredActivities, days);

    const itinerary: GeneratedItinerary = {
      id: itineraryId,
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
      days,
      activityPool,
      scoredActivities,
      swipeQueue,
      keptActivities: [],
      rejectedActivities: [],
      savedForLater: [],
      stats,
      generatedAt: new Date().toISOString(),
      lastModifiedAt: new Date().toISOString(),
    };

    console.log(`[Orchestrator] Generated itinerary in ${Date.now() - startTime}ms`);
    return itinerary;
  }

  /**
   * Get swap options for a specific slot
   */
  getSwapOptions(itinerary: GeneratedItinerary, slotId: string): SlotDetails | null {
    for (let dayIndex = 0; dayIndex < itinerary.days.length; dayIndex++) {
      const day = itinerary.days[dayIndex];
      const slot = day.slots?.find((s) => s.slotId === slotId);

      if (slot) {
        // Return alternatives from the slot itself
        return {
          slotId,
          dayIndex,
          scheduledActivity: slot,
          alternatives: slot.alternatives?.map((alt) => ({
            activity: alt,
            commuteFromPrevious: 10,
            commuteToNext: 10,
            categoryMatch: true,
            budgetMatch: true,
            durationDelta: 0,
            distanceFromCurrent: 500,
            swapScore: alt.totalScore,
            reason: "Similar activity nearby",
            benefits: ["Similar rating", "Close by"],
            tradeoffs: [],
          })) || [],
        };
      }
    }
    return null;
  }

  /**
   * Execute a swap - replace activity in a slot
   */
  swapActivity(
    itinerary: GeneratedItinerary,
    slotId: string,
    newActivityId: string
  ): GeneratedItinerary {
    const newActivity = itinerary.scoredActivities.find(
      (sa) => sa.activity.id === newActivityId
    );

    if (!newActivity) {
      throw new Error(`Activity ${newActivityId} not found in activity pool`);
    }

    for (const day of itinerary.days) {
      const slotIndex = day.slots?.findIndex((s) => s.slotId === slotId) ?? -1;

      if (slotIndex !== -1 && day.slots) {
        const oldSlot = day.slots[slotIndex];
        day.slots[slotIndex] = {
          ...oldSlot,
          activity: newActivity,
          notes: `Swapped from ${oldSlot.activity.activity.name}`,
        };

        itinerary.lastModifiedAt = new Date().toISOString();
        itinerary.stats = this.calculateStats(itinerary.days);
        return itinerary;
      }
    }

    throw new Error(`Slot ${slotId} not found in itinerary`);
  }

  /**
   * Process a swipe action
   */
  processSwipe(
    itinerary: GeneratedItinerary,
    activityId: string,
    action: "keep" | "reject" | "save-for-later"
  ): GeneratedItinerary {
    switch (action) {
      case "keep":
        itinerary.keptActivities.push(activityId);
        break;
      case "reject":
        itinerary.rejectedActivities.push(activityId);
        break;
      case "save-for-later":
        itinerary.savedForLater.push(activityId);
        break;
    }

    itinerary.swipeQueue = itinerary.swipeQueue.filter(
      (sa) => sa.activity.id !== activityId
    );
    itinerary.lastModifiedAt = new Date().toISOString();

    return itinerary;
  }

  /**
   * Lock/unlock an activity
   */
  lockActivity(
    itinerary: GeneratedItinerary,
    slotId: string,
    locked: boolean
  ): GeneratedItinerary {
    for (const day of itinerary.days) {
      const slot = day.slots?.find((s) => s.slotId === slotId);
      if (slot) {
        slot.isLocked = locked;
        itinerary.lastModifiedAt = new Date().toISOString();
        return itinerary;
      }
    }
    throw new Error(`Slot ${slotId} not found`);
  }

  /**
   * Confirm the itinerary
   */
  confirmItinerary(itinerary: GeneratedItinerary): GeneratedItinerary {
    itinerary.status = "confirmed";
    itinerary.lastModifiedAt = new Date().toISOString();
    return itinerary;
  }

  /**
   * Convert to legacy Trip format
   */
  toLegacyTrip(itinerary: GeneratedItinerary, userId: string): Partial<Trip> {
    return {
      id: itinerary.id,
      userId,
      title: `Trip to ${itinerary.destination.name}`,
      destination: {
        lat: itinerary.destination.coordinates.lat,
        lng: itinerary.destination.coordinates.lng,
        city: itinerary.destination.name,
        country: itinerary.destination.country,
      },
      startDate: new Date(itinerary.dateRange.start),
      endDate: new Date(itinerary.dateRange.end),
      preferences: {
        budget: itinerary.budget === "luxury" ? "luxury" : itinerary.budget === "budget" ? "budget" : "moderate",
        pace: itinerary.pace === "relaxed" ? "relaxed" : itinerary.pace === "ambitious" ? "packed" : "moderate",
        interests: [],
        travelStyle: "mixed",
        tripMode: itinerary.tripMode,
      },
      status: itinerary.status === "confirmed" ? "confirmed" : "planning",
      currency: "USD",
      travelers: itinerary.dateRange.totalDays, // Placeholder
      createdAt: new Date(itinerary.generatedAt),
      updatedAt: new Date(itinerary.lastModifiedAt),
      tripMode: itinerary.tripMode,
      activityPool: itinerary.activityPool,
      scoredActivities: itinerary.scoredActivities,
    };
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private createPlaceholderSchedule(
    scoredActivities: ScoredActivity[],
    totalDays: number,
    startDate: Date,
    destination: string
  ): DaySchedule[] {
    const days: DaySchedule[] = [];
    let activityIndex = 0;
    const activitiesPerDay = 4;

    for (let i = 0; i < totalDays; i++) {
      const dayDate = new Date(startDate);
      dayDate.setDate(dayDate.getDate() + i);
      const dateStr = dayDate.toISOString().split("T")[0];

      const dayActivities: ScheduledActivity[] = [];
      const times = ["09:00", "12:00", "15:00", "18:00"];

      for (let j = 0; j < activitiesPerDay && activityIndex < scoredActivities.length; j++) {
        const scored = scoredActivities[activityIndex];
        activityIndex++;

        dayActivities.push({
          slotId: `${dateStr}-slot-${j}`,
          activity: scored,
          scheduledStart: times[j],
          scheduledEnd: this.addMinutes(times[j], scored.activity.recommendedDuration || 90),
          actualDuration: scored.activity.recommendedDuration || 90,
          isLocked: false,
          alternatives: scoredActivities.slice(activityIndex, activityIndex + 3),
        });
      }

      days.push({
        date: dateStr,
        dayNumber: i + 1,
        city: destination,
        dayType: i === 0 ? "arrival" : i === totalDays - 1 ? "departure" : "full",
        slots: dayActivities,
        totalActivityTime: dayActivities.reduce((sum, a) => sum + a.actualDuration, 0),
        totalCommuteTime: dayActivities.length * 15,
        totalCost: { amount: 0, currency: "USD" },
        neighborhoodsVisited: [...new Set(dayActivities.map((a) => a.activity.activity.neighborhood).filter(Boolean))],
        categoriesCovered: [...new Set(dayActivities.map((a) => a.activity.activity.category))],
        warnings: [],
        paceScore: 70,
      });
    }

    return days;
  }

  private addMinutes(time: string, minutes: number): string {
    const [h, m] = time.split(":").map(Number);
    const totalMinutes = h * 60 + m + minutes;
    const newH = Math.floor(totalMinutes / 60) % 24;
    const newM = totalMinutes % 60;
    return `${newH.toString().padStart(2, "0")}:${newM.toString().padStart(2, "0")}`;
  }

  private buildSwipeQueue(
    scoredActivities: ScoredActivity[],
    days: DaySchedule[]
  ): ScoredActivity[] {
    const scheduledIds = new Set<string>();
    days.forEach((day) => {
      day.slots?.forEach((slot) => {
        scheduledIds.add(slot.activity.activity.id);
      });
    });

    return scoredActivities
      .filter((sa) => !scheduledIds.has(sa.activity.id) && sa.totalScore >= 60)
      .slice(0, 20);
  }

  private calculateStats(days: DaySchedule[]): ItineraryStats {
    const neighborhoods = new Set<string>();
    const categories: Record<string, number> = {};
    let totalActivities = 0;
    let totalMeals = 0;
    let freeActivities = 0;
    let totalScore = 0;
    let estimatedMinCost = 0;
    let estimatedMaxCost = 0;

    for (const day of days) {
      for (const slot of day.slots || []) {
        const activity = slot.activity.activity;

        if (activity.neighborhood) {
          neighborhoods.add(activity.neighborhood);
        }

        const category = activity.category || "activity";
        categories[category] = (categories[category] || 0) + 1;

        if (category === "restaurant" || "mealType" in activity) {
          totalMeals++;
        } else {
          totalActivities++;
        }

        if (activity.isFree) {
          freeActivities++;
        } else if (activity.estimatedCost) {
          estimatedMinCost += activity.estimatedCost.amount;
          estimatedMaxCost += activity.estimatedCost.amount * 1.5;
        }

        totalScore += slot.activity.totalScore;
      }
    }

    const totalItems = totalActivities + totalMeals;

    return {
      totalActivities,
      totalMeals,
      estimatedCost: {
        min: Math.round(estimatedMinCost),
        max: Math.round(estimatedMaxCost),
        currency: "USD",
      },
      freeActivities,
      averageScore: totalItems > 0 ? Math.round(totalScore / totalItems) : 0,
      neighborhoods: Array.from(neighborhoods),
      categories,
    };
  }
}

// ============================================
// FACTORY FUNCTIONS
// ============================================

let orchestratorInstance: ItineraryOrchestrator | null = null;

export function getItineraryOrchestrator(): ItineraryOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new ItineraryOrchestrator();
  }
  return orchestratorInstance;
}

export function createItineraryOrchestrator(): ItineraryOrchestrator {
  return new ItineraryOrchestrator();
}
