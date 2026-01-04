/**
 * Utility functions for TripInputPanel
 */

import type { ParsedTripInput } from "@/lib/trip-input-parser";
import type {
  UserClarifications,
  JapanItineraryRequest,
  PreBookedActivity,
} from "./types";

/**
 * Format a date string to a short display format (e.g., "Mar 15")
 */
export function formatDateShort(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

/**
 * Convert parsed TripInput to JapanItineraryRequest format
 */
export function convertToItineraryRequest(
  parsed: ParsedTripInput,
  userClarifications: UserClarifications
): JapanItineraryRequest | null {
  const destinations = parsed.extractedEntities.destinations || [];
  const dates = parsed.extractedEntities.dates;

  if (destinations.length === 0) {
    return null;
  }

  const startDate = userClarifications.startDate || dates?.start || "";
  if (!startDate) {
    return null;
  }

  let totalDays = userClarifications.totalDays;
  if (!totalDays && dates?.duration) {
    const durationMatch = dates.duration.match(/(\d+)\s*(week|day)/i);
    if (durationMatch) {
      const num = parseInt(durationMatch[1]);
      const unit = durationMatch[2].toLowerCase();
      totalDays = unit.startsWith("week") ? num * 7 : num;
    }
  }
  if (!totalDays && dates?.start && dates?.end) {
    const start = new Date(dates.start);
    const end = new Date(dates.end);
    totalDays = Math.ceil(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  const pace = userClarifications.pace || parsed.intent?.pace || "moderate";
  const interests = parsed.extractedEntities.interests || [];

  let daysPerCity = userClarifications.daysPerCity;
  if (
    Object.keys(daysPerCity).length === 0 &&
    totalDays &&
    destinations.length > 0
  ) {
    const daysEach = Math.floor(totalDays / destinations.length);
    const remainder = totalDays % destinations.length;
    daysPerCity = {};
    destinations.forEach((city, i) => {
      daysPerCity[city] = daysEach + (i < remainder ? 1 : 0);
    });
  }

  const preBookedActivities: PreBookedActivity[] = [];

  if (parsed.tripInput.activities && parsed.tripInput.activities.length > 0) {
    for (const activity of parsed.tripInput.activities) {
      if (activity.name && activity.date) {
        preBookedActivities.push({
          name: activity.name,
          date: activity.date,
          time: activity.startTime,
          city: activity.city,
          duration: activity.duration,
          category: activity.category,
          confirmationNumber: activity.confirmationNumber,
          notes: activity.notes,
        });
      }
    }
  }

  if (
    parsed.extractedEntities.activities &&
    parsed.extractedEntities.activities.length > 0
  ) {
    for (const activity of parsed.extractedEntities.activities) {
      const activityName = activity.name ?? "";
      const alreadyAdded = preBookedActivities.some(
        (pa) =>
          pa.name.toLowerCase() === activityName.toLowerCase() &&
          pa.date === activity.date
      );
      if (!alreadyAdded && activity.name && activity.date) {
        preBookedActivities.push({
          name: activity.name,
          date: activity.date,
          time: activity.time,
          category: activity.category,
        });
      }
    }
  }

  return {
    cities: destinations,
    startDate,
    daysPerCity: Object.keys(daysPerCity).length > 0 ? daysPerCity : undefined,
    totalDays,
    pace: pace as "relaxed" | "moderate" | "packed",
    interests,
    includeKlookExperiences: true,
    preBookedActivities:
      preBookedActivities.length > 0 ? preBookedActivities : undefined,
    mustHave:
      parsed.tripInput.mustHave && parsed.tripInput.mustHave.length > 0
        ? parsed.tripInput.mustHave
        : undefined,
    mustAvoid:
      parsed.tripInput.mustAvoid && parsed.tripInput.mustAvoid.length > 0
        ? parsed.tripInput.mustAvoid
        : undefined,
  };
}

/**
 * Check if parsed data needs user clarifications
 */
export function getMissingClarifications(parsed: ParsedTripInput): string[] {
  const missing: string[] = [];

  const destinations = parsed.extractedEntities.destinations || [];
  const dates = parsed.extractedEntities.dates;

  if (destinations.length === 0) {
    missing.push("destination");
  }

  if (!dates?.start) {
    missing.push("start_date");
  }

  const hasDuration = dates?.duration || (dates?.start && dates?.end);
  if (!hasDuration) {
    missing.push("duration");
  }

  if (destinations.length > 1) {
    const hasCityAllocation = parsed.clarifications.some(
      (c) =>
        c.toLowerCase().includes("time allocation") ||
        c.toLowerCase().includes("days per city") ||
        c.toLowerCase().includes("how many days")
    );
    if (hasCityAllocation || !hasDuration) {
      missing.push("days_per_city");
    }
  }

  return missing;
}

/**
 * Check if we can generate an itinerary based on parsed data and clarifications
 */
export function canGenerateItineraryCheck(
  parsed: ParsedTripInput | null,
  userClarifications: UserClarifications
): boolean {
  if (!parsed) return false;

  const destinations = parsed.extractedEntities.destinations || [];
  const dates = parsed.extractedEntities.dates;

  if (destinations.length === 0) return false;

  const startDate = dates?.start || userClarifications.startDate;
  if (!startDate) return false;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tripStartDate = new Date(startDate);
  if (tripStartDate < today) {
    return false;
  }

  const hasDuration =
    Boolean(dates?.duration) ||
    Boolean(dates?.start && dates?.end) ||
    userClarifications.totalDays > 0 ||
    Object.values(userClarifications.daysPerCity).some((d) => d > 0);

  return hasDuration;
}

/**
 * Get start date error if date is in the past
 */
export function getStartDateError(
  parsed: ParsedTripInput | null,
  userClarifications: UserClarifications
): string | null {
  if (!parsed) return null;

  const dates = parsed.extractedEntities.dates;
  const startDate = dates?.start || userClarifications.startDate;
  if (!startDate) return null;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tripStartDate = new Date(startDate);

  if (tripStartDate < today) {
    return "Trip start date must be today or in the future";
  }

  return null;
}

/**
 * Default user clarifications state
 */
export function createDefaultUserClarifications(): UserClarifications {
  return {
    daysPerCity: {},
    startDate: "",
    endDate: "",
    totalDays: 0,
    pace: "moderate",
    confirmedFields: new Set<string>(),
  };
}
