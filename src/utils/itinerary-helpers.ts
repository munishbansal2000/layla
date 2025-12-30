/**
 * Itinerary Helper Utilities
 *
 * Pure utility functions for time manipulation, slot operations,
 * and itinerary data transformations.
 */

import type {
  SlotWithOptions,
  ItinerarySlotType,
} from "@/types/structured-itinerary";

// ============================================
// SLOT ID UTILITIES
// ============================================

/**
 * Generate a consistent slot ID for regular activity slots.
 * Format: day{N}-{slotType}
 * Examples: day1-morning, day2-lunch, day3-evening
 */
export function generateSlotId(dayNumber: number, slotType: ItinerarySlotType): string {
  return `day${dayNumber}-${slotType}`;
}

/**
 * Generate a consistent slot ID for transit slots.
 * Format: day{N}-transit
 */
export function generateTransitSlotId(dayNumber: number): string {
  return `day${dayNumber}-transit`;
}

/**
 * Generate a consistent slot ID for free time slots.
 * Format: free-day{N}-{slotType}-{index}
 * Examples: free-day1-morning-1, free-day2-afternoon-2
 *
 * The index is the position among free slots of this type on this day,
 * which is deterministic and doesn't change with activity modifications.
 */
export function generateFreeSlotId(
  dayNumber: number,
  slotType: ItinerarySlotType,
  indexOnDay: number
): string {
  return `free-day${dayNumber}-${slotType}-${indexOnDay}`;
}

/**
 * Parse a slot ID to extract its components.
 * Returns null if the ID doesn't match expected patterns.
 */
export function parseSlotId(slotId: string): {
  type: 'regular' | 'transit' | 'free';
  dayNumber: number;
  slotType?: ItinerarySlotType;
  index?: number;
} | null {
  // Free slot pattern: free-day{N}-{slotType}-{index}
  const freeMatch = slotId.match(/^free-day(\d+)-(\w+)-(\d+)$/);
  if (freeMatch) {
    return {
      type: 'free',
      dayNumber: parseInt(freeMatch[1], 10),
      slotType: freeMatch[2] as ItinerarySlotType,
      index: parseInt(freeMatch[3], 10),
    };
  }

  // Transit slot pattern: day{N}-transit
  const transitMatch = slotId.match(/^day(\d+)-transit$/);
  if (transitMatch) {
    return {
      type: 'transit',
      dayNumber: parseInt(transitMatch[1], 10),
    };
  }

  // Regular slot pattern: day{N}-{slotType}
  const regularMatch = slotId.match(/^day(\d+)-(\w+)$/);
  if (regularMatch) {
    return {
      type: 'regular',
      dayNumber: parseInt(regularMatch[1], 10),
      slotType: regularMatch[2] as ItinerarySlotType,
    };
  }

  return null;
}

// ============================================
// CONSTANTS
// ============================================

/** Slot types in chronological order (morning to evening) */
export const SLOT_TYPE_ORDER: Record<string, number> = {
  morning: 0,
  breakfast: 1,
  lunch: 2,
  afternoon: 3,
  dinner: 4,
  evening: 5,
};

/** Default start times for each slot type (in minutes since midnight) */
export const SLOT_DEFAULT_START_TIMES: Record<string, number> = {
  morning: 9 * 60, // 09:00
  breakfast: 8 * 60, // 08:00
  lunch: 12 * 60, // 12:00
  afternoon: 14 * 60, // 14:00
  dinner: 19 * 60, // 19:00
  evening: 20 * 60, // 20:00
};

// ============================================
// TIME UTILITIES
// ============================================

/**
 * Parse time string "HH:MM" to minutes since midnight
 */
export function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Format minutes since midnight to "HH:MM"
 * Handles floating point values by rounding to nearest minute
 */
export function formatMinutesToTime(minutes: number): string {
  const roundedMinutes = Math.round(minutes);
  const hours = Math.floor(roundedMinutes / 60) % 24;
  const mins = roundedMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins
    .toString()
    .padStart(2, "0")}`;
}

/**
 * Format a timestamp to relative time ago string
 */
export function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

// ============================================
// SLOT UTILITIES
// ============================================

/**
 * Calculate activity duration from options
 */
export function getActivityDuration(slot: SlotWithOptions): number {
  const selectedOption =
    slot.options.find((o) => o.id === slot.selectedOptionId) || slot.options[0];
  if (selectedOption?.activity?.duration) {
    return selectedOption.activity.duration;
  }
  // Default duration based on slot type
  const defaultDurations: Record<string, number> = {
    morning: 180, // 3 hours
    brunch: 90, // 1.5 hours
    lunch: 90, // 1.5 hours
    afternoon: 240, // 4 hours
    dinner: 120, // 2 hours
    evening: 120, // 2 hours
    night: 120, // 2 hours
  };
  return defaultDurations[slot.slotType] || 120;
}

/**
 * Check if a slot is a "free time" slot (empty, no activities)
 */
export function isFreeTimeSlot(slot: SlotWithOptions): boolean {
  return slot.options.length === 0 || slot.slotId.startsWith("free-");
}

// ============================================
// SLOT RECALCULATION
// ============================================

/**
 * Recalculate time slots after activity changes.
 *
 * IMPORTANT: This respects natural slot type times!
 * - Lunch stays around 12:00, not 10:25
 * - Dinner stays around 19:00, not 15:00
 *
 * SMART SLOT MANAGEMENT:
 * - When an activity is SHORTER: A FREE TIME slot is inserted if gap > 30 min
 * - When an activity is LONGER: Adjacent FREE TIME slots are consumed/shrunk
 * - Free time slots that become < 15 min are removed entirely
 * - Commute times are adjusted based on new positions
 *
 * @param slots - The slots to recalculate
 * @param startTime - The day's start time (default "09:00")
 * @param dayNumber - The day number for generating consistent free slot IDs
 */
export function recalculateTimeSlots(
  slots: SlotWithOptions[],
  startTime: string = "09:00",
  dayNumber: number = 1
): SlotWithOptions[] {
  if (slots.length === 0) return slots;

  // PHASE 1: Filter out existing free-time slots that will be recalculated
  const nonFreeSlots = slots.filter((slot) => !isFreeTimeSlot(slot));

  if (nonFreeSlots.length === 0) return slots;

  const result: SlotWithOptions[] = [];
  let previousEndTime = parseTimeToMinutes(startTime);
  let freeSlotIndex = 1; // Counter for generating unique free slot IDs

  for (let i = 0; i < nonFreeSlots.length; i++) {
    const slot = nonFreeSlots[i];
    const duration = getActivityDuration(slot);
    const defaultStart =
      SLOT_DEFAULT_START_TIMES[slot.slotType] || previousEndTime;

    let actualStartTime: number;

    if (i === 0) {
      actualStartTime = parseTimeToMinutes(slot.timeRange.start);
    } else {
      const commuteTime = slot.commuteFromPrevious?.duration || 15;
      const earliestPossibleStart = previousEndTime + commuteTime;
      actualStartTime = Math.max(earliestPossibleStart, defaultStart);

      const gapMinutes = actualStartTime - previousEndTime - commuteTime;

      if (gapMinutes >= 30) {
        const freeSlotMidpoint = previousEndTime + gapMinutes / 2;
        let freeSlotType: ItinerarySlotType = "morning";
        if (freeSlotMidpoint >= 12 * 60 && freeSlotMidpoint < 14 * 60) {
          freeSlotType = "lunch";
        } else if (freeSlotMidpoint >= 14 * 60 && freeSlotMidpoint < 18 * 60) {
          freeSlotType = "afternoon";
        } else if (freeSlotMidpoint >= 18 * 60 && freeSlotMidpoint < 20 * 60) {
          freeSlotType = "dinner";
        } else if (freeSlotMidpoint >= 20 * 60) {
          freeSlotType = "evening";
        }

        // Use consistent ID pattern: free-day{N}-{slotType}-{index}
        const freeSlotId = generateFreeSlotId(dayNumber, freeSlotType, freeSlotIndex);
        freeSlotIndex++;

        const freeTimeSlot: SlotWithOptions = {
          slotId: freeSlotId,
          slotType: freeSlotType,
          timeRange: {
            start: formatMinutesToTime(previousEndTime),
            end: formatMinutesToTime(actualStartTime - commuteTime),
          },
          options: [],
          selectedOptionId: undefined,
          commuteFromPrevious: undefined,
        };
        result.push(freeTimeSlot);
      }
    }

    const actualEndTime = actualStartTime + duration;

    const updatedSlot: SlotWithOptions = {
      ...slot,
      timeRange: {
        start: formatMinutesToTime(actualStartTime),
        end: formatMinutesToTime(actualEndTime),
      },
      commuteFromPrevious:
        i === 0
          ? slot.commuteFromPrevious
          : {
              ...(slot.commuteFromPrevious || {
                duration: 15,
                distance: 1000,
                method: "walk" as const,
                instructions: "Walk to next location",
              }),
              duration: slot.commuteFromPrevious?.duration || 15,
            },
    };

    result.push(updatedSlot);
    previousEndTime = actualEndTime;
  }

  return result;
}

/**
 * Merge consecutive free time slots into a single larger slot
 * This prevents fragmentation when activities are removed or shortened
 *
 * @param slots - The slots to process
 * @param dayNumber - Optional day number for generating consistent merged slot IDs
 */
export function mergeConsecutiveFreeSlots(
  slots: SlotWithOptions[],
  dayNumber?: number
): SlotWithOptions[] {
  if (slots.length <= 1) return slots;

  const result: SlotWithOptions[] = [];
  let i = 0;
  let mergedSlotIndex = 1; // Counter for generating unique merged slot IDs

  while (i < slots.length) {
    const currentSlot = slots[i];

    if (!isFreeTimeSlot(currentSlot)) {
      result.push(currentSlot);
      i++;
      continue;
    }

    let mergedEndTime = parseTimeToMinutes(currentSlot.timeRange.end);
    let lastMergedSlotType = currentSlot.slotType;
    let mergeCount = 0;

    while (
      i + 1 + mergeCount < slots.length &&
      isFreeTimeSlot(slots[i + 1 + mergeCount])
    ) {
      const nextFreeSlot = slots[i + 1 + mergeCount];
      mergedEndTime = parseTimeToMinutes(nextFreeSlot.timeRange.end);
      lastMergedSlotType = nextFreeSlot.slotType;
      mergeCount++;
    }

    if (mergeCount > 0) {
      // Generate consistent merged slot ID using day number and index
      const mergedSlotId = dayNumber
        ? `free-day${dayNumber}-merged-${mergedSlotIndex}`
        : currentSlot.slotId; // Keep original ID if no day number provided
      mergedSlotIndex++;

      const mergedSlot: SlotWithOptions = {
        ...currentSlot,
        slotId: mergedSlotId,
        slotType: lastMergedSlotType,
        timeRange: {
          start: currentSlot.timeRange.start,
          end: formatMinutesToTime(mergedEndTime),
        },
      };
      result.push(mergedSlot);
      i += 1 + mergeCount;
    } else {
      result.push(currentSlot);
      i++;
    }
  }

  return result;
}

// ============================================
// GOOGLE MAPS UTILITIES
// ============================================

/** Map commute method to Google Maps travel mode */
export const GOOGLE_MAPS_TRAVEL_MODE: Record<string, string> = {
  walk: "walking",
  transit: "transit",
  taxi: "driving",
  drive: "driving",
};

/**
 * Generate a Google Maps directions URL
 */
export function generateGoogleMapsDirectionsUrl(
  origin: { lat: number; lng: number } | string,
  destination: { lat: number; lng: number } | string,
  travelMode: string = "transit"
): string {
  const originStr =
    typeof origin === "string"
      ? encodeURIComponent(origin)
      : `${origin.lat},${origin.lng}`;
  const destStr =
    typeof destination === "string"
      ? encodeURIComponent(destination)
      : `${destination.lat},${destination.lng}`;
  const mode = GOOGLE_MAPS_TRAVEL_MODE[travelMode] || "transit";

  return `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}&travelmode=${mode}`;
}

/** Commute mode icons */
export const COMMUTE_ICONS: Record<string, string> = {
  walk: "🚶",
  transit: "🚇",
  taxi: "🚕",
  drive: "🚗",
};

/** Slot type colors matching the map legend */
export const SLOT_TYPE_COLORS: Record<string, string> = {
  morning: "#f59e0b", // amber-500
  breakfast: "#f97316", // orange-500
  lunch: "#22c55e", // green-500
  afternoon: "#3b82f6", // blue-500
  dinner: "#8b5cf6", // purple-500
  evening: "#ec4899", // pink-500
};
