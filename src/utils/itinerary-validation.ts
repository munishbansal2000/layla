/**
 * Itinerary Validation Utilities
 *
 * Functions for validating itinerary structure, detecting conflicts,
 * and calculating the impact of changes.
 */

import type { StructuredItineraryData } from "@/types/structured-itinerary";
import { parseTimeToMinutes } from "./itinerary-helpers";
import { VALIDATION_LIMITS } from "@/lib/itinerary-validation-service";

// ============================================
// TYPES
// ============================================

export interface ValidationIssue {
  type: "error" | "warning" | "info";
  dayNumber?: number;
  slotId?: string;
  message: string;
  details?: string;
}

export interface ItineraryImpact {
  totalCommuteChange: number; // in minutes (positive = longer, negative = shorter)
  affectedDays: number[];
  cityTransitionChanges: { from: string; to: string; impact: string }[];
  warnings: ValidationIssue[];
  timeConflicts: ValidationIssue[];
}

export interface HistoryEntry {
  timestamp: number;
  itinerary: StructuredItineraryData;
  description: string;
}

// ============================================
// VALIDATION
// ============================================

/**
 * Validate itinerary for structural issues.
 * For comprehensive constraint-based validation, use ItineraryValidationService.
 */
export function validateItinerary(
  itinerary: StructuredItineraryData
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  itinerary.days.forEach((day, dayIndex) => {
    // Check for empty slots
    day.slots.forEach((slot) => {
      if (slot.options.length === 0) {
        issues.push({
          type: "warning",
          dayNumber: day.dayNumber,
          slotId: slot.slotId,
          message: `Empty ${slot.slotType} slot`,
          details: `Day ${day.dayNumber} has no activity scheduled for ${slot.slotType}`,
        });
      }
    });

    // Check for time conflicts within a day
    for (let i = 0; i < day.slots.length - 1; i++) {
      const currentSlot = day.slots[i];
      const nextSlot = day.slots[i + 1];

      const currentEnd = parseTimeToMinutes(currentSlot.timeRange.end);
      const nextStart = parseTimeToMinutes(nextSlot.timeRange.start);

      if (currentEnd > nextStart) {
        issues.push({
          type: "error",
          dayNumber: day.dayNumber,
          slotId: currentSlot.slotId,
          message: `Time overlap detected`,
          details: `${currentSlot.slotType} (ends ${currentSlot.timeRange.end}) overlaps with ${nextSlot.slotType} (starts ${nextSlot.timeRange.start})`,
        });
      }

      // Check if commute time exceeds gap
      if (nextSlot.commuteFromPrevious) {
        const gapMinutes = nextStart - currentEnd;
        if (nextSlot.commuteFromPrevious.duration > gapMinutes) {
          issues.push({
            type: "warning",
            dayNumber: day.dayNumber,
            slotId: nextSlot.slotId,
            message: `Tight schedule`,
            details: `Only ${gapMinutes} min gap but ${nextSlot.commuteFromPrevious.duration} min commute needed`,
          });
        }
      }
    }

    // Check for city transitions
    if (dayIndex > 0) {
      const prevDay = itinerary.days[dayIndex - 1];
      if (prevDay.city !== day.city && !day.cityTransition) {
        issues.push({
          type: "info",
          dayNumber: day.dayNumber,
          message: `City transition`,
          details: `Moving from ${prevDay.city} to ${day.city} - ensure transport is planned`,
        });
      }
    }

    // Check total commute time per day (using shared constant)
    const totalCommuteMinutes = day.slots.reduce((sum, slot) => {
      return sum + (slot.commuteFromPrevious?.duration || 0);
    }, 0);

    if (totalCommuteMinutes > VALIDATION_LIMITS.MAX_TRAVEL_TIME_MINUTES) {
      issues.push({
        type: "warning",
        dayNumber: day.dayNumber,
        message: `High commute time`,
        details: `Total commute time is ${totalCommuteMinutes} min (${(
          totalCommuteMinutes / 60
        ).toFixed(1)} hours)`,
      });
    }
  });

  return issues;
}

/**
 * Calculate impact of changes between two itinerary states
 */
export function calculateImpact(
  oldItinerary: StructuredItineraryData,
  newItinerary: StructuredItineraryData
): ItineraryImpact {
  let totalCommuteChange = 0;
  const affectedDays: number[] = [];
  const cityTransitionChanges: { from: string; to: string; impact: string }[] =
    [];
  const warnings = validateItinerary(newItinerary);
  const timeConflicts = warnings.filter((w) => w.type === "error");

  // Calculate commute time differences
  newItinerary.days.forEach((newDay, dayIndex) => {
    const oldDay = oldItinerary.days[dayIndex];
    if (!oldDay) return;

    let oldDayCommute = 0;
    let newDayCommute = 0;

    oldDay.slots.forEach((slot) => {
      oldDayCommute += slot.commuteFromPrevious?.duration || 0;
    });

    newDay.slots.forEach((slot) => {
      newDayCommute += slot.commuteFromPrevious?.duration || 0;
    });

    const dayChange = newDayCommute - oldDayCommute;
    if (dayChange !== 0) {
      totalCommuteChange += dayChange;
      affectedDays.push(newDay.dayNumber);
    }

    // Check for city changes
    if (oldDay.city !== newDay.city) {
      cityTransitionChanges.push({
        from: oldDay.city,
        to: newDay.city,
        impact: `Day ${newDay.dayNumber} city changed`,
      });
    }
  });

  return {
    totalCommuteChange,
    affectedDays,
    cityTransitionChanges,
    warnings,
    timeConflicts,
  };
}
