// ============================================
// TIME EXTENSION LOGIC
// ============================================
// Calculate impact of extending an activity on the rest of the schedule.
// Implements time extension flows from EXECUTION_PHASE_DESIGN.md

import {
  TimeExtensionResult,
  TimeExtensionImpact,
  ActivityExecution,
} from "@/types/execution";
import { DayWithOptions, SlotWithOptions } from "@/types/structured-itinerary";
import { getSelectedActivity, getSlotDuration } from "./execution-helpers";

// ============================================
// CONSTANTS
// ============================================

/**
 * Minimum buffer time before a booking (minutes)
 */
export const MIN_BOOKING_BUFFER = 15;

/**
 * Maximum extension allowed at once (minutes)
 */
export const MAX_SINGLE_EXTENSION = 60;

/**
 * Minimum viable activity duration (minutes)
 */
export const MIN_ACTIVITY_DURATION = 15;

// ============================================
// EXTENSION IMPACT CALCULATION
// ============================================

/**
 * Calculate the full impact of extending an activity
 */
export function calculateExtensionImpact(
  day: DayWithOptions,
  slotId: string,
  extensionMinutes: number
): TimeExtensionResult {
  // Find the slot being extended
  const slotIndex = day.slots.findIndex((s) => s.slotId === slotId);

  if (slotIndex === -1) {
    return {
      success: false,
      appliedExtension: 0,
      impact: {
        nextActivityAffected: false,
        activitiesShortened: [],
        activitiesSkipped: [],
        bookingsAtRisk: [],
      },
      message: "Activity not found in schedule",
    };
  }

  const currentSlot = day.slots[slotIndex];
  const remainingSlots = day.slots.slice(slotIndex + 1);

  // Calculate available buffer time
  const bufferAnalysis = analyzeAvailableBuffer(
    day,
    slotIndex,
    extensionMinutes
  );

  // If we have enough buffer, simple extension
  if (bufferAnalysis.totalBuffer >= extensionMinutes) {
    return {
      success: true,
      appliedExtension: extensionMinutes,
      impact: {
        nextActivityAffected: false,
        activitiesShortened: [],
        activitiesSkipped: [],
        bookingsAtRisk: [],
      },
      message: `Extended by ${extensionMinutes} minutes using available buffer time`,
    };
  }

  // Need to find activities to shorten or skip
  const shortening = findActivitiesToShorten(
    day,
    slotId,
    extensionMinutes - bufferAnalysis.totalBuffer
  );

  const skipping = findActivitiesToSkip(
    day,
    slotId,
    extensionMinutes - bufferAnalysis.totalBuffer - shortening.totalSaved
  );

  // Check for bookings at risk
  const bookingsAtRisk = findBookingsAtRisk(
    day,
    slotIndex,
    extensionMinutes
  );

  // Calculate what we can actually apply
  const totalRecoverable = bufferAnalysis.totalBuffer + shortening.totalSaved + skipping.totalSaved;
  const appliedExtension = Math.min(extensionMinutes, totalRecoverable);

  // Determine if next activity is affected
  const nextActivityAffected = remainingSlots.length > 0 &&
    (shortening.activities.length > 0 || skipping.activities.length > 0);

  // Calculate new start time for next activity
  let nextActivityNewStart: string | undefined;
  if (remainingSlots.length > 0 && appliedExtension > 0) {
    const [endHours, endMinutes] = currentSlot.timeRange.end.split(":").map(Number);
    const newEndMinutes = endHours * 60 + endMinutes + appliedExtension;
    const newHours = Math.floor(newEndMinutes / 60);
    const newMins = newEndMinutes % 60;
    nextActivityNewStart = `${String(newHours).padStart(2, "0")}:${String(newMins).padStart(2, "0")}`;
  }

  const success = appliedExtension > 0;

  return {
    success,
    appliedExtension,
    impact: {
      nextActivityAffected,
      nextActivityNewStart,
      activitiesShortened: shortening.activities,
      activitiesSkipped: skipping.activities,
      bookingsAtRisk,
    },
    alternatives: appliedExtension < extensionMinutes
      ? {
          availableExtension: appliedExtension,
          sacrifices: [...shortening.activities, ...skipping.activities],
        }
      : undefined,
    message: success
      ? `Extended by ${appliedExtension} minutes${
          shortening.activities.length > 0
            ? `. Shortened: ${shortening.activities.join(", ")}`
            : ""
        }${
          skipping.activities.length > 0
            ? `. Skipped: ${skipping.activities.join(", ")}`
            : ""
        }`
      : "Cannot extend further without impacting required activities",
  };
}

// ============================================
// BUFFER ANALYSIS
// ============================================

interface BufferAnalysis {
  totalBuffer: number;
  segments: { afterSlotId: string; minutes: number }[];
}

/**
 * Analyze available buffer time between activities
 */
function analyzeAvailableBuffer(
  day: DayWithOptions,
  startIndex: number,
  needed: number
): BufferAnalysis {
  const segments: { afterSlotId: string; minutes: number }[] = [];
  let totalBuffer = 0;

  for (let i = startIndex; i < day.slots.length - 1; i++) {
    const current = day.slots[i];
    const next = day.slots[i + 1];

    const currentEnd = timeToMinutes(current.timeRange.end);
    const nextStart = timeToMinutes(next.timeRange.start);

    const gap = nextStart - currentEnd;
    if (gap > 0) {
      segments.push({ afterSlotId: current.slotId, minutes: gap });
      totalBuffer += gap;

      if (totalBuffer >= needed) {
        break;
      }
    }
  }

  return { totalBuffer, segments };
}

// ============================================
// SHORTENING ACTIVITIES
// ============================================

interface ShorteningResult {
  activities: string[];
  totalSaved: number;
  details: { slotId: string; name: string; shortenBy: number }[];
}

/**
 * Find activities that can be shortened to accommodate extension
 */
export function findActivitiesToShorten(
  day: DayWithOptions,
  afterSlotId: string,
  neededMinutes: number
): ShorteningResult {
  const result: ShorteningResult = {
    activities: [],
    totalSaved: 0,
    details: [],
  };

  if (neededMinutes <= 0) {
    return result;
  }

  const slotIndex = day.slots.findIndex((s) => s.slotId === afterSlotId);
  if (slotIndex === -1) {
    return result;
  }

  // Look at subsequent activities
  for (let i = slotIndex + 1; i < day.slots.length && result.totalSaved < neededMinutes; i++) {
    const slot = day.slots[i];
    const activity = getSelectedActivity(slot);

    // Skip activities that can't be shortened
    if (slot.isLocked) {
      continue;
    }

    // Check if activity has a booking (can't shorten booked activities)
    if (isBookedSlot(slot)) {
      continue;
    }

    // Calculate how much we can shorten
    const slotDuration = getSlotDuration(slot);
    const maxShorten = Math.max(0, slotDuration - MIN_ACTIVITY_DURATION);
    if (maxShorten <= 0) {
      continue;
    }

    // Calculate how much we need to shorten this activity
    const stillNeeded = neededMinutes - result.totalSaved;
    const shortenBy = Math.min(maxShorten, stillNeeded);

    if (shortenBy > 0) {
      const activityName = activity?.activity.name ?? "Unknown Activity";
      result.activities.push(activityName);
      result.totalSaved += shortenBy;
      result.details.push({
        slotId: slot.slotId,
        name: activityName,
        shortenBy,
      });
    }
  }

  return result;
}

// ============================================
// SKIPPING ACTIVITIES
// ============================================

interface SkipResult {
  activities: string[];
  totalSaved: number;
  details: { slotId: string; name: string; duration: number }[];
}

/**
 * Find activities that could be skipped if shortening isn't enough
 */
export function findActivitiesToSkip(
  day: DayWithOptions,
  afterSlotId: string,
  neededMinutes: number
): SkipResult {
  const result: SkipResult = {
    activities: [],
    totalSaved: 0,
    details: [],
  };

  if (neededMinutes <= 0) {
    return result;
  }

  const slotIndex = day.slots.findIndex((s) => s.slotId === afterSlotId);
  if (slotIndex === -1) {
    return result;
  }

  // Look at subsequent activities, prefer optional ones
  const candidates: { slot: SlotWithOptions; priority: number }[] = [];

  for (let i = slotIndex + 1; i < day.slots.length; i++) {
    const slot = day.slots[i];

    // Cannot skip locked activities
    if (slot.isLocked) {
      continue;
    }

    // Cannot skip booked activities
    if (isBookedSlot(slot)) {
      continue;
    }

    // Calculate skip priority (lower = more likely to skip)
    const priority = calculateSkipPriority(slot);
    candidates.push({ slot, priority });
  }

  // Sort by priority (lowest first = skip first)
  candidates.sort((a, b) => a.priority - b.priority);

  // Skip until we have enough time
  for (const { slot } of candidates) {
    if (result.totalSaved >= neededMinutes) {
      break;
    }

    const activity = getSelectedActivity(slot);
    const activityName = activity?.activity.name ?? "Unknown Activity";
    const slotDuration = getSlotDuration(slot);

    result.activities.push(activityName);
    result.totalSaved += slotDuration;
    result.details.push({
      slotId: slot.slotId,
      name: activityName,
      duration: slotDuration,
    });
  }

  return result;
}

/**
 * Calculate skip priority for a slot (lower = more likely to skip)
 */
function calculateSkipPriority(slot: SlotWithOptions): number {
  let priority = 50; // Base priority
  const activity = getSelectedActivity(slot);

  // Meals are harder to skip
  if (slot.slotType === "lunch" || slot.slotType === "dinner" || slot.slotType === "breakfast") {
    priority += 30;
  }

  // Higher-ranked activities are harder to skip (use rank instead of score)
  const rank = activity?.rank ?? 1;
  priority += Math.max(0, 50 - rank * 10); // Lower rank = higher priority

  // Activities later in the day are easier to skip
  const [hours] = slot.timeRange.start.split(":").map(Number);
  if (hours >= 17) {
    priority -= 10;
  }

  // Optional behavior activities are easier to skip
  if (slot.behavior === "optional") {
    priority -= 20;
  }

  // Anchor activities are harder to skip
  if (slot.behavior === "anchor") {
    priority += 40;
  }

  return priority;
}

// ============================================
// BOOKING DETECTION
// ============================================

/**
 * Check if a slot has a booking that can't be moved
 */
function isBookedSlot(slot: SlotWithOptions): boolean {
  // Check fragility metadata for booking requirement
  if (slot.fragility?.bookingRequired) {
    return true;
  }

  // Check if ticket type is "timed" (non-flexible)
  if (slot.fragility?.ticketType === "timed") {
    return true;
  }

  // Check activity tags for booking indicators
  const activity = getSelectedActivity(slot);
  if (activity) {
    const tags = activity.activity.tags || [];
    const hasBookingTag = tags.some((tag: string) =>
      ["reservation", "booking", "ticket", "tour", "timed-entry"].includes(tag.toLowerCase())
    );
    if (hasBookingTag) {
      return true;
    }
  }

  return false;
}

/**
 * Find bookings that are at risk due to extension
 */
function findBookingsAtRisk(
  day: DayWithOptions,
  fromIndex: number,
  extensionMinutes: number
): string[] {
  const atRisk: string[] = [];
  let cumulativeDelay = extensionMinutes;

  for (let i = fromIndex + 1; i < day.slots.length && cumulativeDelay > 0; i++) {
    const slot = day.slots[i];

    if (isBookedSlot(slot)) {
      // Check if the delay would push us past a safe buffer
      const [startHours, startMinutes] = slot.timeRange.start.split(":").map(Number);
      const currentStartMinutes = startHours * 60 + startMinutes;
      const newStartMinutes = currentStartMinutes + cumulativeDelay;

      // If we have less than minimum buffer, booking is at risk
      if (cumulativeDelay >= MIN_BOOKING_BUFFER) {
        const activity = getSelectedActivity(slot);
        const activityName = activity?.activity.name ?? "Unknown Activity";
        atRisk.push(activityName);
      }
    }

    // Reduce delay by any buffer after this slot
    if (i < day.slots.length - 1) {
      const currentEnd = timeToMinutes(slot.timeRange.end);
      const nextStart = timeToMinutes(day.slots[i + 1].timeRange.start);
      const buffer = nextStart - currentEnd;
      cumulativeDelay = Math.max(0, cumulativeDelay - buffer);
    }
  }

  return atRisk;
}

// ============================================
// MAXIMUM EXTENSION CALCULATION
// ============================================

/**
 * Calculate the maximum extension possible for an activity
 */
export function getMaxExtension(
  day: DayWithOptions,
  slotId: string
): number {
  const slotIndex = day.slots.findIndex((s) => s.slotId === slotId);

  if (slotIndex === -1) {
    return 0;
  }

  // Start with available buffer
  const buffer = analyzeAvailableBuffer(day, slotIndex, MAX_SINGLE_EXTENSION);
  let maxExtension = buffer.totalBuffer;

  // Add what we can get from shortening
  const shortening = findActivitiesToShorten(
    day,
    slotId,
    MAX_SINGLE_EXTENSION - maxExtension
  );
  maxExtension += shortening.totalSaved;

  // Add what we can get from skipping
  const skipping = findActivitiesToSkip(
    day,
    slotId,
    MAX_SINGLE_EXTENSION - maxExtension
  );
  maxExtension += skipping.totalSaved;

  // Cap at maximum single extension
  return Math.min(maxExtension, MAX_SINGLE_EXTENSION);
}

/**
 * Get suggested extension increments
 */
export function getSuggestedExtensions(
  day: DayWithOptions,
  slotId: string
): number[] {
  const max = getMaxExtension(day, slotId);
  const suggestions: number[] = [];

  if (max >= 15) suggestions.push(15);
  if (max >= 30) suggestions.push(30);
  if (max >= 45) suggestions.push(45);
  if (max >= 60) suggestions.push(60);

  // If max is less than 15, offer what we have
  if (suggestions.length === 0 && max > 0) {
    suggestions.push(max);
  }

  return suggestions;
}

// ============================================
// APPLY EXTENSION
// ============================================

/**
 * Apply an extension to the schedule and return updated slots
 * Note: This creates new slot references, does not modify in place
 */
export function applyExtension(
  day: DayWithOptions,
  slotId: string,
  extensionMinutes: number
): {
  success: boolean;
  updatedSlots: SlotWithOptions[];
  message: string;
} {
  const result = calculateExtensionImpact(day, slotId, extensionMinutes);

  if (!result.success) {
    return {
      success: false,
      updatedSlots: [],
      message: result.message,
    };
  }

  const slotIndex = day.slots.findIndex((s) => s.slotId === slotId);
  if (slotIndex === -1) {
    return {
      success: false,
      updatedSlots: [],
      message: "Activity not found",
    };
  }

  const updatedSlots: SlotWithOptions[] = [];

  // Extend the current slot
  const currentSlot = { ...day.slots[slotIndex] };
  const newEnd = addMinutesToTime(currentSlot.timeRange.end, result.appliedExtension);
  currentSlot.timeRange = { ...currentSlot.timeRange, end: newEnd };
  updatedSlots.push(currentSlot);

  // Shift subsequent activities
  let shiftAmount = result.appliedExtension;

  for (let i = slotIndex + 1; i < day.slots.length; i++) {
    const slot = { ...day.slots[i] };
    const activity = getSelectedActivity(slot);
    const activityName = activity?.activity.name ?? "Unknown Activity";

    // Check if this activity was skipped
    if (result.impact.activitiesSkipped.includes(activityName)) {
      continue; // Will be handled separately
    }

    // Check if this activity was shortened
    const shortenInfo = findActivitiesToShorten(day, slotId, result.appliedExtension)
      .details.find((d) => d.slotId === slot.slotId);

    // Shift start time
    const newStart = addMinutesToTime(slot.timeRange.start, shiftAmount);
    let newEnd = addMinutesToTime(slot.timeRange.end, shiftAmount);

    // If shortened, adjust end time accordingly
    if (shortenInfo) {
      newEnd = addMinutesToTime(newEnd, -shortenInfo.shortenBy);
      shiftAmount -= shortenInfo.shortenBy;
    }

    slot.timeRange = { start: newStart, end: newEnd };
    updatedSlots.push(slot);

    // Reduce shift by any buffer consumed
    if (i < day.slots.length - 1) {
      const currentEnd = timeToMinutes(slot.timeRange.end);
      const nextStart = timeToMinutes(day.slots[i + 1].timeRange.start);
      const buffer = Math.max(0, nextStart - currentEnd);
      shiftAmount = Math.max(0, shiftAmount - buffer);
    }
  }

  return {
    success: true,
    updatedSlots,
    message: result.message,
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Convert "HH:MM" time to minutes since midnight
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Add minutes to a "HH:MM" time string
 */
function addMinutesToTime(time: string, minutes: number): string {
  const totalMinutes = timeToMinutes(time) + minutes;
  const hours = Math.floor(totalMinutes / 60) % 24;
  const mins = totalMinutes % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}
