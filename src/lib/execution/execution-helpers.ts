// ============================================
// EXECUTION HELPERS
// ============================================
// Utility functions for working with structured itinerary types
// during execution

import { SlotWithOptions, ActivityOption, DayWithOptions } from "@/types/structured-itinerary";

/**
 * Get the selected activity from a slot
 * Returns the first option if no selection is made
 */
export function getSelectedActivity(slot: SlotWithOptions): ActivityOption | null {
  if (!slot.options || slot.options.length === 0) {
    return null;
  }

  // If a selection has been made, find it
  if (slot.selectedOptionId) {
    const selected = slot.options.find(opt => opt.id === slot.selectedOptionId);
    if (selected) {
      return selected;
    }
  }

  // Default to first option (highest ranked)
  return slot.options[0];
}

/**
 * Get activity name from a slot (using selected or first option)
 */
export function getSlotActivityName(slot: SlotWithOptions): string {
  const activity = getSelectedActivity(slot);
  return activity?.activity.name ?? "Unknown Activity";
}

/**
 * Get coordinates from a slot's selected activity
 */
export function getSlotCoordinates(slot: SlotWithOptions): { lat: number; lng: number } | null {
  const activity = getSelectedActivity(slot);
  return activity?.activity.place?.coordinates ?? null;
}

/**
 * Get the scheduled duration for a slot in minutes
 */
export function getSlotDuration(slot: SlotWithOptions): number {
  const [startHours, startMinutes] = slot.timeRange.start.split(":").map(Number);
  const [endHours, endMinutes] = slot.timeRange.end.split(":").map(Number);
  
  const startTotalMinutes = startHours * 60 + startMinutes;
  const endTotalMinutes = endHours * 60 + endMinutes;
  
  return endTotalMinutes - startTotalMinutes;
}

/**
 * Get all slot IDs from a day
 */
export function getDaySlotIds(day: DayWithOptions): string[] {
  return day.slots.map(slot => slot.slotId);
}

/**
 * Find a slot by ID in a day
 */
export function findSlotById(day: DayWithOptions, slotId: string): SlotWithOptions | null {
  return day.slots.find(slot => slot.slotId === slotId) ?? null;
}

/**
 * Check if a slot is a meal slot
 */
export function isMealSlot(slot: SlotWithOptions): boolean {
  return slot.slotType === "breakfast" || slot.slotType === "lunch" || slot.slotType === "dinner";
}

/**
 * Check if a slot is outdoor (weather-sensitive)
 */
export function isOutdoorSlot(slot: SlotWithOptions): boolean {
  const activity = getSelectedActivity(slot);
  if (!activity) return false;
  
  // Check fragility metadata if available
  if (slot.fragility?.weatherSensitivity === "high") {
    return true;
  }
  
  // Check tags for outdoor indicators
  const outdoorTags = ["outdoor", "park", "garden", "nature", "walking", "hiking", "beach"];
  return activity.activity.tags.some(tag => 
    outdoorTags.some(outdoor => tag.toLowerCase().includes(outdoor))
  );
}

/**
 * Parse time string to Date object for a given date
 */
export function parseTimeToDate(timeStr: string, baseDate: Date): Date {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const result = new Date(baseDate);
  result.setHours(hours, minutes, 0, 0);
  return result;
}

/**
 * Format minutes to time string (HH:MM)
 */
export function minutesToTimeString(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60) % 24;
  const minutes = totalMinutes % 60;
  return `${hours.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
}

/**
 * Parse time string to total minutes since midnight
 */
export function timeStringToMinutes(timeStr: string): number {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}
