/**
 * Day Reordering Service
 *
 * Provides functionality for reordering days and moving activities
 * across days in an itinerary.
 */

import type { DaySchedule, ScheduledActivity } from "./schedule-builder";
import type { GeneratedItinerary } from "./itinerary-orchestrator";
import { getItineraryStore } from "./itinerary-store";

// ============================================
// TYPES
// ============================================

export interface ReorderDaysRequest {
  tripId: string;
  fromIndex: number;
  toIndex: number;
}

export interface SwapDaysRequest {
  tripId: string;
  dayIndex1: number;
  dayIndex2: number;
}

export interface MoveActivityRequest {
  tripId: string;
  activityId: string;
  sourceDayIndex: number;
  sourceSlotIndex: number;
  targetDayIndex: number;
  targetSlotIndex: number;
}

export interface ReorderActivitiesRequest {
  tripId: string;
  dayIndex: number;
  fromSlotIndex: number;
  toSlotIndex: number;
}

export interface ReorderResult {
  success: boolean;
  updatedItinerary?: GeneratedItinerary;
  affectedDays: number[];
  warnings: string[];
  error?: string;
}

export interface MoveActivityResult {
  success: boolean;
  updatedItinerary?: GeneratedItinerary;
  affectedDays: number[];
  commuteRecalculationNeeded: boolean;
  warnings: string[];
  error?: string;
}

// ============================================
// DAY REORDERING SERVICE
// ============================================

export class DayReorderingService {
  /**
   * Move a day from one position to another
   */
  reorderDays(request: ReorderDaysRequest): ReorderResult {
    const { tripId, fromIndex, toIndex } = request;
    const warnings: string[] = [];

    // Get itinerary
    const itinerary = getItineraryStore().get(tripId);
    if (!itinerary) {
      return {
        success: false,
        affectedDays: [],
        warnings: [],
        error: "Itinerary not found",
      };
    }

    // Validate indices
    if (
      fromIndex < 0 ||
      fromIndex >= itinerary.days.length ||
      toIndex < 0 ||
      toIndex >= itinerary.days.length
    ) {
      return {
        success: false,
        affectedDays: [],
        warnings: [],
        error: "Invalid day indices",
      };
    }

    if (fromIndex === toIndex) {
      return {
        success: true,
        updatedItinerary: itinerary,
        affectedDays: [],
        warnings: [],
      };
    }

    // Check for booking constraints
    const dayToMove = itinerary.days[fromIndex];
    const hasBookings = this.dayHasBookings(dayToMove);
    if (hasBookings) {
      warnings.push(
        `Day ${fromIndex + 1} has booked activities. Please check booking dates.`
      );
    }

    // Perform reorder
    const updatedDays = [...itinerary.days];
    const [movedDay] = updatedDays.splice(fromIndex, 1);
    updatedDays.splice(toIndex, 0, movedDay);

    // Recalculate day numbers and dates
    const startDate = new Date(itinerary.days[0].date);
    updatedDays.forEach((day, index) => {
      day.dayNumber = index + 1;
      const newDate = new Date(startDate);
      newDate.setDate(startDate.getDate() + index);
      day.date = newDate.toISOString().split("T")[0];
    });

    // Calculate affected days
    const affectedDays = this.getAffectedDayIndices(fromIndex, toIndex);

    // Update itinerary
    const updatedItinerary: GeneratedItinerary = {
      ...itinerary,
      days: updatedDays,
      lastModifiedAt: new Date().toISOString(),
    };

    // Save to store
    getItineraryStore().save(updatedItinerary);

    return {
      success: true,
      updatedItinerary,
      affectedDays,
      warnings,
    };
  }

  /**
   * Swap two days
   */
  swapDays(request: SwapDaysRequest): ReorderResult {
    const { tripId, dayIndex1, dayIndex2 } = request;
    const warnings: string[] = [];

    const itinerary = getItineraryStore().get(tripId);
    if (!itinerary) {
      return {
        success: false,
        affectedDays: [],
        warnings: [],
        error: "Itinerary not found",
      };
    }

    // Validate indices
    if (
      dayIndex1 < 0 ||
      dayIndex1 >= itinerary.days.length ||
      dayIndex2 < 0 ||
      dayIndex2 >= itinerary.days.length
    ) {
      return {
        success: false,
        affectedDays: [],
        warnings: [],
        error: "Invalid day indices",
      };
    }

    if (dayIndex1 === dayIndex2) {
      return {
        success: true,
        updatedItinerary: itinerary,
        affectedDays: [],
        warnings: [],
      };
    }

    // Check for bookings
    const day1 = itinerary.days[dayIndex1];
    const day2 = itinerary.days[dayIndex2];

    if (this.dayHasBookings(day1) || this.dayHasBookings(day2)) {
      warnings.push("Swapped days contain booked activities. Please verify booking dates.");
    }

    // Swap the days
    const updatedDays = [...itinerary.days];
    [updatedDays[dayIndex1], updatedDays[dayIndex2]] = [
      updatedDays[dayIndex2],
      updatedDays[dayIndex1],
    ];

    // Swap dates and day numbers back (keep original schedule)
    const date1 = updatedDays[dayIndex1].date;
    const date2 = updatedDays[dayIndex2].date;
    updatedDays[dayIndex1].date = date2;
    updatedDays[dayIndex2].date = date1;

    const dayNum1 = updatedDays[dayIndex1].dayNumber;
    const dayNum2 = updatedDays[dayIndex2].dayNumber;
    updatedDays[dayIndex1].dayNumber = dayNum2;
    updatedDays[dayIndex2].dayNumber = dayNum1;

    const updatedItinerary: GeneratedItinerary = {
      ...itinerary,
      days: updatedDays,
      lastModifiedAt: new Date().toISOString(),
    };

    getItineraryStore().save(updatedItinerary);

    return {
      success: true,
      updatedItinerary,
      affectedDays: [dayIndex1, dayIndex2],
      warnings,
    };
  }

  /**
   * Move an activity from one day/slot to another
   */
  moveActivityAcrossDays(request: MoveActivityRequest): MoveActivityResult {
    const {
      tripId,
      activityId,
      sourceDayIndex,
      sourceSlotIndex,
      targetDayIndex,
      targetSlotIndex,
    } = request;
    const warnings: string[] = [];

    const itinerary = getItineraryStore().get(tripId);
    if (!itinerary) {
      return {
        success: false,
        affectedDays: [],
        commuteRecalculationNeeded: false,
        warnings: [],
        error: "Itinerary not found",
      };
    }

    // Validate day indices
    if (
      sourceDayIndex < 0 ||
      sourceDayIndex >= itinerary.days.length ||
      targetDayIndex < 0 ||
      targetDayIndex >= itinerary.days.length
    ) {
      return {
        success: false,
        affectedDays: [],
        commuteRecalculationNeeded: false,
        warnings: [],
        error: "Invalid day indices",
      };
    }

    const sourceDay = itinerary.days[sourceDayIndex];
    const _targetDay = itinerary.days[targetDayIndex];

    // Validate slot indices
    if (!sourceDay.slots || sourceSlotIndex >= sourceDay.slots.length) {
      return {
        success: false,
        affectedDays: [],
        commuteRecalculationNeeded: false,
        warnings: [],
        error: "Invalid source slot index",
      };
    }

    // Find the activity
    const sourceSlot = sourceDay.slots[sourceSlotIndex];
    if (!sourceSlot.activity || sourceSlot.activity.activity?.id !== activityId) {
      return {
        success: false,
        affectedDays: [],
        commuteRecalculationNeeded: false,
        warnings: [],
        error: "Activity not found in source slot",
      };
    }

    // Check if activity has bookings
    const activity = sourceSlot.activity;
    if (sourceSlot.isLocked) {
      warnings.push(
        `Activity "${activity?.activity?.name}" has a booking. Moving may affect reservation.`
      );
    }

    // Create updated days
    const updatedDays = itinerary.days.map((day, idx) => {
      if (idx === sourceDayIndex) {
        // Remove activity from source by filtering out the slot
        const updatedSlots = day.slots ? day.slots.filter((_, i) => i !== sourceSlotIndex) : [];
        return { ...day, slots: updatedSlots };
      }
      if (idx === targetDayIndex) {
        // Add activity to target
        const updatedSlots = day.slots ? [...day.slots] : [];

        // Create a new slot with the activity
        const newSlot: ScheduledActivity = {
          slotId: `slot_${Date.now()}_${targetSlotIndex}`,
          activity,
          scheduledStart: "12:00",
          scheduledEnd: "14:00",
          actualDuration: sourceSlot.actualDuration || 120,
          isLocked: sourceSlot.isLocked,
          alternatives: sourceSlot.alternatives || [],
        };

        // Insert at target position
        updatedSlots.splice(targetSlotIndex, 0, newSlot);
        return { ...day, slots: updatedSlots };
      }
      return day;
    });

    const updatedItinerary: GeneratedItinerary = {
      ...itinerary,
      days: updatedDays,
      lastModifiedAt: new Date().toISOString(),
    };

    getItineraryStore().save(updatedItinerary);

    return {
      success: true,
      updatedItinerary,
      affectedDays: [sourceDayIndex, targetDayIndex],
      commuteRecalculationNeeded: true,
      warnings,
    };
  }

  /**
   * Reorder activities within a day
   */
  reorderActivitiesWithinDay(request: ReorderActivitiesRequest): MoveActivityResult {
    const { tripId, dayIndex, fromSlotIndex, toSlotIndex } = request;
    const warnings: string[] = [];

    const itinerary = getItineraryStore().get(tripId);
    if (!itinerary) {
      return {
        success: false,
        affectedDays: [],
        commuteRecalculationNeeded: false,
        warnings: [],
        error: "Itinerary not found",
      };
    }

    if (dayIndex < 0 || dayIndex >= itinerary.days.length) {
      return {
        success: false,
        affectedDays: [],
        commuteRecalculationNeeded: false,
        warnings: [],
        error: "Invalid day index",
      };
    }

    const day = itinerary.days[dayIndex];
    if (!day.slots || fromSlotIndex >= day.slots.length || toSlotIndex >= day.slots.length) {
      return {
        success: false,
        affectedDays: [],
        commuteRecalculationNeeded: false,
        warnings: [],
        error: "Invalid slot indices",
      };
    }

    if (fromSlotIndex === toSlotIndex) {
      return {
        success: true,
        updatedItinerary: itinerary,
        affectedDays: [],
        commuteRecalculationNeeded: false,
        warnings: [],
      };
    }

    // Reorder slots
    const updatedSlots = [...day.slots];
    const [movedSlot] = updatedSlots.splice(fromSlotIndex, 1);
    updatedSlots.splice(toSlotIndex, 0, movedSlot);

    // Recalculate times based on new order
    let currentTime = this.parseTime(updatedSlots[0]?.scheduledStart || "09:00");
    updatedSlots.forEach((slot, idx) => {
      const duration = this.getSlotDuration(slot);
      slot.scheduledStart = this.formatTime(currentTime);
      currentTime += duration;
      slot.scheduledEnd = this.formatTime(currentTime);

      // Add buffer between activities
      if (idx < updatedSlots.length - 1) {
        currentTime += 15; // 15 min buffer
      }
    });

    const updatedDays = itinerary.days.map((d, idx) =>
      idx === dayIndex ? { ...d, slots: updatedSlots } : d
    );

    const updatedItinerary: GeneratedItinerary = {
      ...itinerary,
      days: updatedDays,
      lastModifiedAt: new Date().toISOString(),
    };

    getItineraryStore().save(updatedItinerary);

    return {
      success: true,
      updatedItinerary,
      affectedDays: [dayIndex],
      commuteRecalculationNeeded: true,
      warnings,
    };
  }

  // ============================================
  // HELPER METHODS
  // ============================================

  private dayHasBookings(day: DaySchedule): boolean {
    if (!day.slots) return false;
    return day.slots.some((slot) => slot.isLocked);
  }

  private getAffectedDayIndices(from: number, to: number): number[] {
    const min = Math.min(from, to);
    const max = Math.max(from, to);
    return Array.from({ length: max - min + 1 }, (_, i) => min + i);
  }

  private getSlotDuration(slot: ScheduledActivity): number {
    if (!slot.scheduledStart || !slot.scheduledEnd) return 60;
    const start = this.parseTime(slot.scheduledStart);
    const end = this.parseTime(slot.scheduledEnd);
    return end - start;
  }

  private parseTime(time: string): number {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }

  private formatTime(minutes: number): string {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let serviceInstance: DayReorderingService | null = null;

export function getDayReorderingService(): DayReorderingService {
  if (!serviceInstance) {
    serviceInstance = new DayReorderingService();
  }
  return serviceInstance;
}

// ============================================
// EXPORTS
// ============================================

// Types are already exported inline above
