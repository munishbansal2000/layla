/**
 * Date Validation Utilities
 *
 * Ensures trip dates are valid and in the future.
 * This project only supports planning for future trips.
 */

export interface DateValidationResult {
  valid: boolean;
  error?: {
    code: "INVALID_START_DATE" | "INVALID_END_DATE" | "INVALID_DATE_FORMAT" | "DATE_RANGE_TOO_LONG";
    message: string;
  };
}

/**
 * Maximum trip duration in days
 */
const MAX_TRIP_DURATION_DAYS = 30;

/**
 * Get today's date normalized to start of day (midnight)
 */
export function getToday(): Date {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today;
}

/**
 * Parse a date string and return a Date object normalized to start of day
 */
export function parseDate(dateString: string): Date | null {
  const date = new Date(dateString);
  if (isNaN(date.getTime())) {
    return null;
  }
  date.setHours(0, 0, 0, 0);
  return date;
}

/**
 * Check if a date is today or in the future
 */
export function isFutureOrToday(date: Date): boolean {
  const today = getToday();
  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);
  return normalizedDate >= today;
}

/**
 * Check if a date is strictly in the future (not today)
 */
export function isStrictlyFuture(date: Date): boolean {
  const today = getToday();
  const normalizedDate = new Date(date);
  normalizedDate.setHours(0, 0, 0, 0);
  return normalizedDate > today;
}

/**
 * Validate trip dates
 *
 * Rules:
 * - Start date must be today or in the future
 * - End date must be on or after start date
 * - Trip duration must not exceed MAX_TRIP_DURATION_DAYS
 *
 * @param startDate - Trip start date (ISO string or Date)
 * @param endDate - Trip end date (ISO string or Date)
 * @returns Validation result with error details if invalid
 */
export function validateTripDates(
  startDate: string | Date,
  endDate: string | Date
): DateValidationResult {
  // Parse dates
  const start = typeof startDate === "string" ? parseDate(startDate) : startDate;
  const end = typeof endDate === "string" ? parseDate(endDate) : endDate;

  // Check for valid date format
  if (!start) {
    return {
      valid: false,
      error: {
        code: "INVALID_DATE_FORMAT",
        message: "Invalid start date format. Please use ISO format (YYYY-MM-DD).",
      },
    };
  }

  if (!end) {
    return {
      valid: false,
      error: {
        code: "INVALID_DATE_FORMAT",
        message: "Invalid end date format. Please use ISO format (YYYY-MM-DD).",
      },
    };
  }

  // Check that start date is not in the past
  if (!isFutureOrToday(start)) {
    return {
      valid: false,
      error: {
        code: "INVALID_START_DATE",
        message: "Trip start date must be today or in the future. Past date planning is not supported.",
      },
    };
  }

  // Check that end date is on or after start date
  const normalizedStart = new Date(start);
  normalizedStart.setHours(0, 0, 0, 0);
  const normalizedEnd = new Date(end);
  normalizedEnd.setHours(0, 0, 0, 0);

  if (normalizedEnd < normalizedStart) {
    return {
      valid: false,
      error: {
        code: "INVALID_END_DATE",
        message: "Trip end date must be on or after the start date.",
      },
    };
  }

  // Check trip duration
  const durationMs = normalizedEnd.getTime() - normalizedStart.getTime();
  const durationDays = Math.ceil(durationMs / (1000 * 60 * 60 * 24)) + 1; // +1 because both start and end are inclusive

  if (durationDays > MAX_TRIP_DURATION_DAYS) {
    return {
      valid: false,
      error: {
        code: "DATE_RANGE_TOO_LONG",
        message: `Trip duration cannot exceed ${MAX_TRIP_DURATION_DAYS} days. Your trip is ${durationDays} days.`,
      },
    };
  }

  return { valid: true };
}

/**
 * Get the minimum allowed start date (today) as an ISO string
 */
export function getMinStartDate(): string {
  return getToday().toISOString().split("T")[0];
}

/**
 * Generate future dates for a trip of given duration starting from today
 */
export function generateFutureTripDates(durationDays: number = 5): {
  startDate: string;
  endDate: string;
} {
  const start = getToday();
  const end = new Date(start);
  end.setDate(end.getDate() + durationDays - 1);

  return {
    startDate: start.toISOString().split("T")[0],
    endDate: end.toISOString().split("T")[0],
  };
}

/**
 * Adjust past dates to future dates (for migration/fixing invalid data)
 * Shifts the date range to start from today while preserving the duration
 */
export function adjustToFutureDates(
  startDate: string | Date,
  endDate: string | Date
): { startDate: string; endDate: string } {
  const start = typeof startDate === "string" ? parseDate(startDate) : new Date(startDate);
  const end = typeof endDate === "string" ? parseDate(endDate) : new Date(endDate);

  if (!start || !end) {
    // Return today + 4 days as default
    return generateFutureTripDates(5);
  }

  // If already in future, return as-is
  if (isFutureOrToday(start)) {
    return {
      startDate: start.toISOString().split("T")[0],
      endDate: end.toISOString().split("T")[0],
    };
  }

  // Calculate duration
  const durationMs = end.getTime() - start.getTime();
  const durationDays = Math.max(1, Math.ceil(durationMs / (1000 * 60 * 60 * 24)) + 1);

  // Shift to start from today
  return generateFutureTripDates(durationDays);
}
