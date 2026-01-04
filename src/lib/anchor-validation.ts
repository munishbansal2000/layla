/**
 * Anchor Validation Library
 *
 * Hybrid validation for trip anchors (flights, hotels, activities):
 * 1. Client-side instant validation - format checks, required fields
 * 2. LLM-powered semantic validation - logical conflicts, suggestions
 */

import type {
  FlightAnchor,
  HotelAnchor,
  ActivityAnchor,
} from "@/types/trip-input";

// ============================================
// VALIDATION TYPES
// ============================================

export type ValidationSeverity = "error" | "warning" | "info" | "suggestion";

export interface ValidationIssue {
  id: string;
  severity: ValidationSeverity;
  field?: string;
  anchorType: "flight" | "hotel" | "activity" | "cross-anchor";
  anchorId?: string;
  message: string;
  suggestion?: string;
}

export interface AnchorValidationResult {
  isValid: boolean;
  hasWarnings: boolean;
  issues: ValidationIssue[];
  flightIssues: Map<string, ValidationIssue[]>;
  hotelIssues: Map<string, ValidationIssue[]>;
  activityIssues: Map<string, ValidationIssue[]>;
  crossAnchorIssues: ValidationIssue[];
}

export interface SemanticValidationResult {
  errors: Array<{
    message: string;
    affectedAnchors?: string[];
    suggestion?: string;
  }>;
  warnings: Array<{
    message: string;
    affectedAnchors?: string[];
    suggestion?: string;
  }>;
  suggestions: Array<{
    message: string;
    priority: "high" | "medium" | "low";
  }>;
  missingInfo: Array<{
    message: string;
    field?: string;
  }>;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function generateIssueId(): string {
  return `issue-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Parse a date string in "YYYY-MM-DD" format as LOCAL time.
 * Using `new Date("2026-03-15")` interprets as UTC midnight,
 * which causes date shift in timezones behind UTC.
 */
function parseDateLocal(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // month is 0-indexed
    const day = parseInt(parts[2], 10);
    if (!isNaN(year) && !isNaN(month) && !isNaN(day)) {
      return new Date(year, month, day, 0, 0, 0, 0);
    }
  }
  return null;
}

function isValidDate(dateStr: string): boolean {
  if (!dateStr) return false;
  const date = parseDateLocal(dateStr);
  return date !== null && !isNaN(date.getTime());
}

function isDateInPast(dateStr: string): boolean {
  if (!dateStr) return false;
  const date = parseDateLocal(dateStr);
  if (!date) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return date < today;
}

function isValidTimeFormat(timeStr: string): boolean {
  if (!timeStr) return true; // Optional field
  return /^([01]\d|2[0-3]):([0-5]\d)$/.test(timeStr);
}

function isValidAirportCode(code: string): boolean {
  // 3-letter uppercase code
  return /^[A-Z]{3}$/.test(code);
}

function looksLikeAirportCode(input: string): boolean {
  // Check if it looks like user tried to enter an airport code
  return /^[A-Za-z]{2,4}$/.test(input.trim());
}

// ============================================
// CLIENT-SIDE FLIGHT VALIDATION
// ============================================

export function validateFlight(flight: FlightAnchor): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Required fields
  if (!flight.from?.trim()) {
    issues.push({
      id: generateIssueId(),
      severity: "error",
      field: "from",
      anchorType: "flight",
      anchorId: flight.id,
      message: "Departure airport is required",
    });
  } else if (looksLikeAirportCode(flight.from) && !isValidAirportCode(flight.from.toUpperCase())) {
    issues.push({
      id: generateIssueId(),
      severity: "warning",
      field: "from",
      anchorType: "flight",
      anchorId: flight.id,
      message: `"${flight.from}" doesn't look like a valid airport code`,
      suggestion: "Use 3-letter IATA codes like SFO, NRT, LHR",
    });
  }

  if (!flight.to?.trim()) {
    issues.push({
      id: generateIssueId(),
      severity: "error",
      field: "to",
      anchorType: "flight",
      anchorId: flight.id,
      message: "Arrival airport is required",
    });
  } else if (looksLikeAirportCode(flight.to) && !isValidAirportCode(flight.to.toUpperCase())) {
    issues.push({
      id: generateIssueId(),
      severity: "warning",
      field: "to",
      anchorType: "flight",
      anchorId: flight.id,
      message: `"${flight.to}" doesn't look like a valid airport code`,
      suggestion: "Use 3-letter IATA codes like SFO, NRT, LHR",
    });
  }

  // Same origin/destination
  if (flight.from && flight.to && flight.from.toUpperCase() === flight.to.toUpperCase()) {
    issues.push({
      id: generateIssueId(),
      severity: "error",
      field: "to",
      anchorType: "flight",
      anchorId: flight.id,
      message: "Origin and destination cannot be the same",
    });
  }

  // Date validation
  if (!flight.date) {
    issues.push({
      id: generateIssueId(),
      severity: "error",
      field: "date",
      anchorType: "flight",
      anchorId: flight.id,
      message: "Flight date is required",
    });
  } else if (!isValidDate(flight.date)) {
    issues.push({
      id: generateIssueId(),
      severity: "error",
      field: "date",
      anchorType: "flight",
      anchorId: flight.id,
      message: "Invalid date format",
    });
  } else if (isDateInPast(flight.date)) {
    issues.push({
      id: generateIssueId(),
      severity: "warning",
      field: "date",
      anchorType: "flight",
      anchorId: flight.id,
      message: "Flight date is in the past",
    });
  }

  // Time format
  if (flight.time && !isValidTimeFormat(flight.time)) {
    issues.push({
      id: generateIssueId(),
      severity: "error",
      field: "time",
      anchorType: "flight",
      anchorId: flight.id,
      message: "Invalid time format. Use HH:MM (e.g., 14:30)",
    });
  }

  return issues;
}

// ============================================
// CLIENT-SIDE HOTEL VALIDATION
// ============================================

export function validateHotel(hotel: HotelAnchor): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Required fields
  if (!hotel.city?.trim()) {
    issues.push({
      id: generateIssueId(),
      severity: "error",
      field: "city",
      anchorType: "hotel",
      anchorId: hotel.id,
      message: "City is required",
    });
  }

  if (!hotel.checkIn) {
    issues.push({
      id: generateIssueId(),
      severity: "error",
      field: "checkIn",
      anchorType: "hotel",
      anchorId: hotel.id,
      message: "Check-in date is required",
    });
  } else if (!isValidDate(hotel.checkIn)) {
    issues.push({
      id: generateIssueId(),
      severity: "error",
      field: "checkIn",
      anchorType: "hotel",
      anchorId: hotel.id,
      message: "Invalid check-in date",
    });
  } else if (isDateInPast(hotel.checkIn)) {
    issues.push({
      id: generateIssueId(),
      severity: "warning",
      field: "checkIn",
      anchorType: "hotel",
      anchorId: hotel.id,
      message: "Check-in date is in the past",
    });
  }

  if (!hotel.checkOut) {
    issues.push({
      id: generateIssueId(),
      severity: "error",
      field: "checkOut",
      anchorType: "hotel",
      anchorId: hotel.id,
      message: "Check-out date is required",
    });
  } else if (!isValidDate(hotel.checkOut)) {
    issues.push({
      id: generateIssueId(),
      severity: "error",
      field: "checkOut",
      anchorType: "hotel",
      anchorId: hotel.id,
      message: "Invalid check-out date",
    });
  }

  // Check-out must be after check-in
  if (hotel.checkIn && hotel.checkOut && isValidDate(hotel.checkIn) && isValidDate(hotel.checkOut)) {
    const checkIn = new Date(hotel.checkIn);
    const checkOut = new Date(hotel.checkOut);

    if (checkOut <= checkIn) {
      issues.push({
        id: generateIssueId(),
        severity: "error",
        field: "checkOut",
        anchorType: "hotel",
        anchorId: hotel.id,
        message: "Check-out must be after check-in",
      });
    } else if (checkOut.getTime() === checkIn.getTime()) {
      issues.push({
        id: generateIssueId(),
        severity: "warning",
        field: "checkOut",
        anchorType: "hotel",
        anchorId: hotel.id,
        message: "Same-day check-in and check-out (0 nights)",
      });
    }
  }

  return issues;
}

// ============================================
// CLIENT-SIDE ACTIVITY VALIDATION
// ============================================

export function validateActivity(activity: ActivityAnchor): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Required fields
  if (!activity.name?.trim()) {
    issues.push({
      id: generateIssueId(),
      severity: "error",
      field: "name",
      anchorType: "activity",
      anchorId: activity.id,
      message: "Activity name is required",
    });
  }

  if (!activity.city?.trim()) {
    issues.push({
      id: generateIssueId(),
      severity: "error",
      field: "city",
      anchorType: "activity",
      anchorId: activity.id,
      message: "City is required",
    });
  }

  if (!activity.date) {
    issues.push({
      id: generateIssueId(),
      severity: "error",
      field: "date",
      anchorType: "activity",
      anchorId: activity.id,
      message: "Activity date is required",
    });
  } else if (!isValidDate(activity.date)) {
    issues.push({
      id: generateIssueId(),
      severity: "error",
      field: "date",
      anchorType: "activity",
      anchorId: activity.id,
      message: "Invalid date format",
    });
  } else if (isDateInPast(activity.date)) {
    issues.push({
      id: generateIssueId(),
      severity: "warning",
      field: "date",
      anchorType: "activity",
      anchorId: activity.id,
      message: "Activity date is in the past",
    });
  }

  // Time format
  if (activity.startTime && !isValidTimeFormat(activity.startTime)) {
    issues.push({
      id: generateIssueId(),
      severity: "error",
      field: "startTime",
      anchorType: "activity",
      anchorId: activity.id,
      message: "Invalid time format. Use HH:MM (e.g., 14:30)",
    });
  }

  // Duration validation
  if (activity.duration !== undefined && activity.duration <= 0) {
    issues.push({
      id: generateIssueId(),
      severity: "error",
      field: "duration",
      anchorType: "activity",
      anchorId: activity.id,
      message: "Duration must be a positive number",
    });
  }

  return issues;
}

// ============================================
// CROSS-ANCHOR VALIDATION (Client-side)
// ============================================

export function validateCrossAnchor(
  flights: FlightAnchor[],
  hotels: HotelAnchor[],
  activities: ActivityAnchor[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  // Check if return flight is before departure
  if (flights.length >= 2) {
    const sortedFlights = [...flights].filter(f => f.date).sort((a, b) =>
      new Date(a.date).getTime() - new Date(b.date).getTime()
    );

    if (sortedFlights.length >= 2) {
      const firstFlight = sortedFlights[0];
      const lastFlight = sortedFlights[sortedFlights.length - 1];

      // Check if it looks like outbound/return (same airports reversed)
      if (firstFlight.from === lastFlight.to && firstFlight.to === lastFlight.from) {
        // This is expected - outbound and return
      }
    }
  }

  // Check for hotel date gaps
  if (hotels.length >= 2) {
    const sortedHotels = [...hotels]
      .filter(h => h.checkIn && h.checkOut)
      .sort((a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime());

    for (let i = 0; i < sortedHotels.length - 1; i++) {
      const current = sortedHotels[i];
      const next = sortedHotels[i + 1];

      const currentCheckOut = new Date(current.checkOut);
      const nextCheckIn = new Date(next.checkIn);

      // Gap between hotels
      const gapDays = Math.floor((nextCheckIn.getTime() - currentCheckOut.getTime()) / (1000 * 60 * 60 * 24));
      if (gapDays > 0) {
        issues.push({
          id: generateIssueId(),
          severity: "warning",
          anchorType: "cross-anchor",
          message: `${gapDays} night${gapDays > 1 ? 's' : ''} unaccounted between ${current.city || 'hotel'} and ${next.city || 'hotel'}`,
          suggestion: "Add a hotel for the gap or adjust dates",
        });
      }

      // Overlap between hotels
      if (gapDays < 0) {
        issues.push({
          id: generateIssueId(),
          severity: "warning",
          anchorType: "cross-anchor",
          message: `Hotel stays overlap: ${current.city || 'hotel'} check-out after ${next.city || 'hotel'} check-in`,
          suggestion: "Adjust dates to avoid double-booking",
        });
      }
    }
  }

  // Check if activities are within trip dates
  if (flights.length > 0 && activities.length > 0) {
    const flightDates = flights.filter(f => f.date).map(f => new Date(f.date).getTime());
    if (flightDates.length > 0) {
      const tripStart = Math.min(...flightDates);
      const tripEnd = Math.max(...flightDates);

      for (const activity of activities) {
        if (activity.date) {
          const activityDate = new Date(activity.date).getTime();
          if (activityDate < tripStart || activityDate > tripEnd) {
            issues.push({
              id: generateIssueId(),
              severity: "warning",
              anchorType: "cross-anchor",
              anchorId: activity.id,
              message: `Activity "${activity.name}" is outside trip dates`,
              suggestion: "Check if the activity date is correct",
            });
          }
        }
      }
    }
  }

  // Check for overlapping activities on same day
  const activitiesByDate = new Map<string, ActivityAnchor[]>();
  for (const activity of activities) {
    if (activity.date && activity.startTime) {
      const key = activity.date;
      if (!activitiesByDate.has(key)) {
        activitiesByDate.set(key, []);
      }
      activitiesByDate.get(key)!.push(activity);
    }
  }

  for (const [date, dayActivities] of activitiesByDate) {
    if (dayActivities.length >= 2) {
      // Sort by start time
      const sorted = dayActivities.sort((a, b) => {
        const timeA = a.startTime || "00:00";
        const timeB = b.startTime || "00:00";
        return timeA.localeCompare(timeB);
      });

      for (let i = 0; i < sorted.length - 1; i++) {
        const current = sorted[i];
        const next = sorted[i + 1];

        if (current.startTime && next.startTime) {
          const currentStart = current.startTime.split(":").map(Number);
          const nextStart = next.startTime.split(":").map(Number);

          const currentMinutes = currentStart[0] * 60 + currentStart[1];
          const nextMinutes = nextStart[0] * 60 + nextStart[1];
          const duration = current.duration || 60; // Default 1 hour

          if (currentMinutes + duration > nextMinutes) {
            issues.push({
              id: generateIssueId(),
              severity: "warning",
              anchorType: "cross-anchor",
              message: `"${current.name}" may overlap with "${next.name}" on ${date}`,
              suggestion: "Adjust times or durations",
            });
          }
        }
      }
    }
  }

  return issues;
}

// ============================================
// FULL CLIENT-SIDE VALIDATION
// ============================================

export function validateAnchorsClient(
  flights: FlightAnchor[],
  hotels: HotelAnchor[],
  activities: ActivityAnchor[]
): AnchorValidationResult {
  const flightIssues = new Map<string, ValidationIssue[]>();
  const hotelIssues = new Map<string, ValidationIssue[]>();
  const activityIssues = new Map<string, ValidationIssue[]>();
  const allIssues: ValidationIssue[] = [];

  // Validate each flight
  for (const flight of flights) {
    const issues = validateFlight(flight);
    if (issues.length > 0) {
      flightIssues.set(flight.id, issues);
      allIssues.push(...issues);
    }
  }

  // Validate each hotel
  for (const hotel of hotels) {
    const issues = validateHotel(hotel);
    if (issues.length > 0) {
      hotelIssues.set(hotel.id, issues);
      allIssues.push(...issues);
    }
  }

  // Validate each activity
  for (const activity of activities) {
    const issues = validateActivity(activity);
    if (issues.length > 0) {
      activityIssues.set(activity.id, issues);
      allIssues.push(...issues);
    }
  }

  // Cross-anchor validation
  const crossAnchorIssues = validateCrossAnchor(flights, hotels, activities);
  allIssues.push(...crossAnchorIssues);

  const hasErrors = allIssues.some(i => i.severity === "error");
  const hasWarnings = allIssues.some(i => i.severity === "warning");

  return {
    isValid: !hasErrors,
    hasWarnings,
    issues: allIssues,
    flightIssues,
    hotelIssues,
    activityIssues,
    crossAnchorIssues,
  };
}

// ============================================
// LLM SEMANTIC VALIDATION PROMPT
// ============================================

export const ANCHOR_VALIDATION_SYSTEM_PROMPT = `You are a travel planning assistant that validates trip bookings for logical consistency and potential issues.

Analyze the provided trip anchors (flights, hotels, activities) and identify:

1. ERRORS - Blocking issues that must be fixed:
   - Impossible logistics (activity in city with no hotel/flight access)
   - Date/time conflicts that can't be resolved
   - Missing critical information

2. WARNINGS - Problems to consider:
   - Tight connections (flight landing close to activity time)
   - City mismatches (flying to Tokyo but hotel in Osaka without transport)
   - Unaccounted gaps (nights without hotel)
   - Geographic impossibilities (Fushimi Inari listed in Tokyo - it's in Kyoto)

3. SUGGESTIONS - Improvements:
   - Better timing recommendations
   - Missing bookings to consider
   - Travel tips based on itinerary

4. MISSING_INFO - What's unaccounted:
   - Nights without accommodation
   - Days with no planned activities
   - Transport between cities

Respond ONLY with valid JSON in this exact format:
{
  "errors": [
    { "message": "string", "affectedAnchors": ["anchorId1"], "suggestion": "how to fix" }
  ],
  "warnings": [
    { "message": "string", "affectedAnchors": ["anchorId1"], "suggestion": "what to consider" }
  ],
  "suggestions": [
    { "message": "string", "priority": "high|medium|low" }
  ],
  "missingInfo": [
    { "message": "string", "field": "optional field name" }
  ]
}`;

export function buildAnchorValidationPrompt(
  flights: FlightAnchor[],
  hotels: HotelAnchor[],
  activities: ActivityAnchor[],
  tripPrompt?: string
): string {
  const parts: string[] = [];

  if (tripPrompt) {
    parts.push(`TRIP DESCRIPTION: ${tripPrompt}`);
  }

  if (flights.length > 0) {
    parts.push("\nFLIGHTS:");
    for (const f of flights) {
      parts.push(`- [${f.id}] ${f.from} → ${f.to} on ${f.date}${f.time ? ` at ${f.time}` : ""}${f.flightNumber ? ` (${f.flightNumber})` : ""}`);
    }
  }

  if (hotels.length > 0) {
    parts.push("\nHOTELS:");
    for (const h of hotels) {
      parts.push(`- [${h.id}] ${h.city}: ${h.checkIn} to ${h.checkOut}${h.name ? ` (${h.name})` : ""}`);
    }
  }

  if (activities.length > 0) {
    parts.push("\nACTIVITIES:");
    for (const a of activities) {
      parts.push(`- [${a.id}] "${a.name}" in ${a.city} on ${a.date}${a.startTime ? ` at ${a.startTime}` : ""}${a.duration ? ` (${a.duration}min)` : ""}`);
    }
  }

  parts.push("\nAnalyze these bookings for logical issues, conflicts, and missing information. Consider geography (which cities are attractions actually in), timing (can they make it?), and completeness (any gaps?).");

  return parts.join("\n");
}

// ============================================
// LLM VALIDATION (to be called from API route)
// ============================================

export async function validateAnchorsWithLLM(
  flights: FlightAnchor[],
  hotels: HotelAnchor[],
  activities: ActivityAnchor[],
  tripPrompt?: string
): Promise<SemanticValidationResult> {
  // Dynamic import to avoid circular dependencies
  const { llm } = await import("./llm");

  const prompt = buildAnchorValidationPrompt(flights, hotels, activities, tripPrompt);

  // DEBUG: Log the input being sent to LLM for validation
  console.log("\n" + "=".repeat(80));
  console.log("[AnchorValidation] LLM VALIDATION INPUT");
  console.log("=".repeat(80));
  console.log("Flights:", JSON.stringify(flights, null, 2));
  console.log("Hotels:", JSON.stringify(hotels, null, 2));
  console.log("Activities:", JSON.stringify(activities, null, 2));
  console.log("Trip Prompt:", tripPrompt);
  console.log("\n--- PROMPT SENT TO LLM ---");
  console.log(prompt);
  console.log("=".repeat(80) + "\n");

  try {
    const result = await llm.generateJSON<SemanticValidationResult>(
      prompt,
      ANCHOR_VALIDATION_SYSTEM_PROMPT
    );

    // DEBUG: Log the LLM response
    console.log("\n" + "=".repeat(80));
    console.log("[AnchorValidation] LLM VALIDATION OUTPUT");
    console.log("=".repeat(80));
    console.log(JSON.stringify(result, null, 2));
    console.log("=".repeat(80) + "\n");

    return {
      errors: result.errors || [],
      warnings: result.warnings || [],
      suggestions: result.suggestions || [],
      missingInfo: result.missingInfo || [],
    };
  } catch (error) {
    console.error("[AnchorValidation] LLM validation failed:", error);
    return {
      errors: [],
      warnings: [],
      suggestions: [],
      missingInfo: [],
    };
  }
}
