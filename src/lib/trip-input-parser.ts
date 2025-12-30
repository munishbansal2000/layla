/**
 * Trip Input Parser
 *
 * Uses LLM (Ollama or OpenAI) to parse unstructured natural language
 * trip requests into structured TripInput format.
 *
 * Features:
 * - Entity extraction (destinations, dates, travelers, flights, hotels, activities)
 * - Spelling correction for place names, airports, etc.
 * - Intent extraction (trip type, style, goals)
 * - Conflict detection (overlapping dates, impossible routes, etc.)
 *
 * Examples of unstructured input:
 * - "2 weeks in Japan with my wife, April 15-30, we love ramen and temples"
 * - "Planning a Tokyo trip March 10-15. Already booked teamLab for March 12 at 2pm"
 * - "Family trip to Kyoto, 4 adults 2 kids (ages 8 and 12), moderate budget"
 */

import OpenAI from "openai";
import type {
  TripInput,
  BudgetTier,
  ActivityAnchorCategory,
} from "@/types/trip-input";
import {
  createEmptyTripInput,
  generateFlightId,
  generateHotelId,
  generateActivityId,
} from "@/types/trip-input";

// ===========================================
// Configuration
// ===========================================

const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b";

const ollama = new OpenAI({
  baseURL: OLLAMA_BASE_URL,
  apiKey: "ollama",
});

// ===========================================
// Types
// ===========================================

export interface ParsedTripInput {
  /** The structured trip input */
  tripInput: TripInput;
  /** Confidence score (0-1) for the parsing */
  confidence: number;
  /** Any ambiguities or missing info that needs clarification */
  clarifications: string[];
  /** Raw extracted entities for debugging */
  extractedEntities: ExtractedEntities;
  /** Detected spelling corrections */
  spellingCorrections: SpellingCorrection[];
  /** Extracted user intent */
  intent: TripIntent;
  /** Detected conflicts in the input */
  conflicts: InputConflict[];
}

export interface SpellingCorrection {
  original: string;
  corrected: string;
  type: "destination" | "airport" | "hotel" | "activity" | "other";
  confidence: number;
}

export interface TripIntent {
  /** Primary trip type */
  tripType: "leisure" | "business" | "honeymoon" | "family" | "adventure" | "cultural" | "relaxation" | "mixed";
  /** Travel style preference */
  travelStyle: "budget-backpacker" | "comfortable" | "luxury" | "ultra-luxury";
  /** Pace preference */
  pace: "relaxed" | "moderate" | "packed";
  /** Primary goals/motivations */
  goals: string[];
  /** Special occasions */
  occasions?: string[];
  /** Accessibility needs */
  accessibilityNeeds?: string[];
  /** Dietary requirements */
  dietaryRequirements?: string[];
}

export interface InputConflict {
  type: "date_overlap" | "date_gap" | "impossible_route" | "time_conflict" | "budget_mismatch" | "logical_error";
  severity: "error" | "warning" | "info";
  message: string;
  suggestion?: string;
  affectedItems?: string[];
}

export interface ExtractedEntities {
  destinations?: string[];
  dates?: {
    start?: string;
    end?: string;
    duration?: string;
    flexibility?: "fixed" | "flexible" | "very_flexible";
  };
  travelers?: {
    adults?: number;
    children?: number;
    childrenAges?: number[];
    infants?: number;
    description?: string;
  };
  flights?: Array<{
    from?: string;
    fromCorrected?: string;
    to?: string;
    toCorrected?: string;
    date?: string;
    time?: string;
    airline?: string;
    flightNumber?: string;
  }>;
  hotels?: Array<{
    name?: string;
    nameCorrected?: string;
    city?: string;
    cityCorrected?: string;
    checkIn?: string;
    checkOut?: string;
    address?: string;
  }>;
  activities?: Array<{
    name?: string;
    nameCorrected?: string;
    city?: string;
    date?: string;
    time?: string;
    duration?: number;
    category?: string;
    confirmationNumber?: string;
    notes?: string;
  }>;
  interests?: string[];
  mustHave?: string[];
  mustAvoid?: string[];
  budget?: string;
  pace?: string;
  travelStyle?: string;
}

// ===========================================
// System Prompt for Enhanced Input Parsing
// ===========================================

const INPUT_PARSER_SYSTEM_PROMPT = `You are an expert travel planning assistant that extracts structured information from natural language trip requests.

Your tasks:
1. EXTRACT travel-related entities from the input
2. CORRECT spelling mistakes (especially for place names, airports, hotels)
3. DETECT the user's intent and travel style
4. FLAG missing information that would be needed for planning

CRITICAL RULES - READ CAREFULLY:
- ONLY extract information that is EXPLICITLY stated in the input
- DO NOT guess, infer, or make up ANY dates, times, or bookings
- DO NOT create hotel entries unless the user explicitly provides check-in AND check-out dates
- DO NOT create flight entries unless the user explicitly provides flight details
- If the user says "Tokyo and Kyoto" without hotel dates, DO NOT create hotel entries - just add destinations
- For multi-city trips without explicit hotel bookings, leave the hotels array EMPTY and add a clarification

HOTELS - IMPORTANT:
- Only add hotels to the array if the user explicitly says something like "staying at Hotel X from Apr 15-18"
- If the user just mentions cities (e.g., "Tokyo and Kyoto"), those go in destinations ONLY, not hotels
- If no explicit hotel bookings are mentioned, hotels array MUST be empty: []

FLIGHTS - IMPORTANT:
- Only add flights if the user explicitly mentions flight details
- If no flights are mentioned, flights array MUST be empty: []

ACTIVITIES - IMPORTANT:
- Only add activities if the user explicitly mentions a booking with date/time
- "Already booked teamLab for April 17 at 2pm" = add to activities
- "I want to see teamLab" = add to interests, NOT activities

EXTRACTION RULES:
1. Destinations: Extract cities, countries, or regions. Correct common misspellings.
2. Dates: Look for EXPLICITLY stated dates, date ranges, months, or durations
3. Travelers: Count adults, children (with ages), and infants
4. Flights: Extract ONLY explicitly mentioned flights with airports, dates, times
5. Hotels: Extract ONLY explicitly mentioned accommodations with names, cities, AND dates
6. Activities: Extract ONLY pre-booked activities with explicit dates/times
7. Interests: Extract hobbies, preferences like "love ramen", "interested in temples"
8. Must-Have: Specific places they MUST visit
9. Must-Avoid: Things to avoid
10. Budget: budget, moderate, luxury, ultra-luxury
11. Pace: relaxed, moderate, packed

SPELLING CORRECTIONS:
- Correct common destination misspellings (e.g., "Tokio" → "Tokyo", "Kioto" → "Kyoto")
- Normalize airport codes (e.g., "Narita" → "NRT", "San Francisco" → "SFO")
- Fix hotel name typos when recognizable

INTENT DETECTION:
Analyze the overall request to determine:
- Trip type: leisure, honeymoon, family vacation, adventure, cultural exploration, etc.
- Travel style: backpacker, comfortable, luxury
- Goals: what they want to achieve (relaxation, exploration, food, culture, etc.)
- Special occasions: birthday, anniversary, honeymoon, etc.

MISSING INFORMATION - Add to clarifications array:
- If no hotel dates: "Specific hotel check-in/check-out dates not provided - will be suggested during itinerary planning"
- If no flight details: "Flight details not specified"
- If no traveler count: "Number of travelers not mentioned"
- If no budget preference: "Budget preference not indicated"
- For multi-city trips: "Time allocation per city not specified - will be suggested during itinerary planning"

DO NOT create fake conflicts based on guessed data. Only flag conflicts for EXPLICITLY provided information.

IMPORTANT:
- Only extract what is EXPLICITLY mentioned
- Use null/empty for missing values, don't guess
- Add missing info to clarifications
- Conflicts should ONLY be detected for explicit bookings, not inferred ones

Respond with ONLY valid JSON, no markdown or explanation.`;

// ===========================================
// Build Enhanced Parser Prompt
// ===========================================

function buildEnhancedParserPrompt(
  userInput: string,
  referenceDate?: string
): string {
  const today = referenceDate || new Date().toISOString().split("T")[0];

return `Parse the following trip request with full analysis.

TODAY'S DATE (for reference): ${today}

USER INPUT:
"${userInput}"

Return a JSON object with this structure:
{
  "destinations": ["Tokyo", "Kyoto"],
  "destinationCorrections": [
    {"original": "Tokio", "corrected": "Tokyo", "confidence": 0.95}
  ],
  "dates": {
    "start": "2025-04-15",
    "end": "2025-04-30",
    "duration": "2 weeks",
    "flexibility": "flexible"
  },
  "travelers": {
    "adults": 2,
    "children": 0,
    "childrenAges": [],
    "infants": 0,
    "description": "couple"
  },
  "flights": [],
  "hotels": [],
  "activities": [],
  "interests": ["ramen", "temples", "art"],
  "mustHave": [],
  "mustAvoid": [],
  "budget": "moderate",
  "pace": "moderate",

  "intent": {
    "tripType": "leisure",
    "travelStyle": "comfortable",
    "pace": "moderate",
    "goals": ["cultural exploration", "food experiences"],
    "occasions": [],
    "accessibilityNeeds": [],
    "dietaryRequirements": []
  },

  "spellingCorrections": [],

  "conflicts": [],

  "confidence": 0.85,
  "clarifications": ["Specific hotel dates not provided", "Flight details not specified"]
}

CRITICAL RULES:
- flights array: ONLY add entries if user EXPLICITLY mentions flight details (airline, date, airports). Otherwise, use empty array: []
- hotels array: ONLY add entries if user EXPLICITLY mentions hotel bookings with check-in AND check-out dates. Otherwise, use empty array: []
- activities array: ONLY add entries if user EXPLICITLY mentions bookings with date AND time. "Already booked X for DATE at TIME" = add. "Want to see X" = add to interests, NOT activities.
- conflicts array: ONLY detect conflicts between EXPLICITLY provided bookings. Never create conflicts based on guessed/inferred data.

Rules:
- activity categories: "tour", "experience", "show", "restaurant", "attraction", "transport", "other"
- budget values: "budget", "moderate", "luxury", "ultra"
- pace values: "relaxed", "moderate", "packed"
- tripType values: "leisure", "business", "honeymoon", "family", "adventure", "cultural", "relaxation", "mixed"
- travelStyle values: "budget-backpacker", "comfortable", "luxury", "ultra-luxury"
- conflict types: "date_overlap", "date_gap", "impossible_route", "time_conflict", "budget_mismatch", "logical_error"
- conflict severity: "error", "warning", "info"

Return ONLY the JSON object.`;
}

// ===========================================
// Parse Trip Input
// ===========================================

export async function parseTripInput(
  userInput: string,
  referenceDate?: string
): Promise<ParsedTripInput> {
  const prompt = buildEnhancedParserPrompt(userInput, referenceDate);

  try {
    const response = await ollama.chat.completions.create({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: INPUT_PARSER_SYSTEM_PROMPT },
        { role: "user", content: prompt },
      ],
      temperature: 0.3, // Lower temperature for more consistent extraction
      max_tokens: 3000,
    });

    const choice = response.choices[0];
    const content = choice && choice.message && choice.message.content;

    if (!content) {
      throw new Error("No response from LLM");
    }

    // Extract JSON from response
    const jsonContent = extractJsonFromResponse(content);
    const parsed = JSON.parse(jsonContent);

    // Convert to TripInput
    const tripInput = convertToTripInput(parsed);

    return {
      tripInput,
      confidence: parsed.confidence || 0.7,
      clarifications: parsed.clarifications || [],
      extractedEntities: parsed,
      spellingCorrections: parsed.spellingCorrections || [],
      intent: parsed.intent || {
        tripType: "leisure",
        travelStyle: "comfortable",
        pace: "moderate",
        goals: [],
      },
      conflicts: parsed.conflicts || [],
    };
  } catch (error) {
    console.error("[TripInputParser] Error parsing input:", error);

    // Return empty input with error clarification
    return {
      tripInput: {
        ...createEmptyTripInput(),
        prompt: userInput,
      },
      confidence: 0,
      clarifications: [
        `Failed to parse input: ${error instanceof Error ? error.message : "Unknown error"}`,
      ],
      extractedEntities: {},
      spellingCorrections: [],
      intent: {
        tripType: "leisure",
        travelStyle: "comfortable",
        pace: "moderate",
        goals: [],
      },
      conflicts: [],
    };
  }
}

// ===========================================
// Convert Extracted Entities to TripInput
// ===========================================

interface ParsedData extends ExtractedEntities {
  confidence?: number;
  clarifications?: string[];
  intent?: TripIntent;
  spellingCorrections?: SpellingCorrection[];
  conflicts?: InputConflict[];
}

function convertToTripInput(extracted: ParsedData): TripInput {
  const tripInput = createEmptyTripInput();

  // Build prompt from destinations and interests
  const promptParts: string[] = [];
  if (extracted.destinations && extracted.destinations.length > 0) {
    promptParts.push(`Trip to ${extracted.destinations.join(", ")}`);
  }
  if (extracted.dates && extracted.dates.duration) {
    promptParts.push(extracted.dates.duration);
  }
  if (extracted.interests && extracted.interests.length > 0) {
    promptParts.push(`interested in ${extracted.interests.join(", ")}`);
  }
  tripInput.prompt = promptParts.join(". ") || "";

  // Budget tier
  if (extracted.budget) {
    const budgetMap: Record<string, BudgetTier> = {
      budget: "budget",
      cheap: "budget",
      affordable: "budget",
      moderate: "moderate",
      mid: "moderate",
      "mid-range": "moderate",
      luxury: "luxury",
      upscale: "luxury",
      expensive: "luxury",
      ultra: "ultra",
      "ultra-luxury": "ultra",
      premium: "ultra",
    };
    tripInput.budgetTier =
      budgetMap[extracted.budget.toLowerCase()] || "moderate";
  }

  // Travelers - note: children is an array of {age} objects in TravelerInfo
  if (extracted.travelers) {
    const childrenArray = extracted.travelers.childrenAges
      ? extracted.travelers.childrenAges.map((age) => ({ age }))
      : [];

    tripInput.travelers = {
      adults: extracted.travelers.adults || 2,
      children: childrenArray,
      infants: extracted.travelers.infants || 0,
    };
  }

  // Flights
  if (extracted.flights && extracted.flights.length > 0) {
    tripInput.flights = extracted.flights.map((f) => ({
      id: generateFlightId(),
      from: f.fromCorrected || f.from || "",
      to: f.toCorrected || f.to || "",
      date: f.date || "",
      time: f.time,
      flightNumber: f.flightNumber,
      airline: f.airline,
    }));
  }

  // Hotels
  if (extracted.hotels && extracted.hotels.length > 0) {
    tripInput.hotels = extracted.hotels.map((h) => ({
      id: generateHotelId(),
      city: h.cityCorrected || h.city || "",
      name: h.nameCorrected || h.name,
      checkIn: h.checkIn || "",
      checkOut: h.checkOut || "",
      address: h.address,
    }));
  }

  // Activities
  if (extracted.activities && extracted.activities.length > 0) {
    tripInput.activities = extracted.activities.map((a) => ({
      id: generateActivityId(),
      name: a.nameCorrected || a.name || "",
      category: (a.category as ActivityAnchorCategory) || "other",
      city: a.city || "",
      date: a.date || "",
      startTime: a.time,
      duration: a.duration,
      confirmationNumber: a.confirmationNumber,
      notes: a.notes,
    }));
  }

  // Interests, must-have, must-avoid
  tripInput.interests = extracted.interests || [];
  tripInput.mustHave = extracted.mustHave || [];
  tripInput.mustAvoid = extracted.mustAvoid || [];

  return tripInput;
}

// ===========================================
// Helper: Extract JSON from Response
// ===========================================

function extractJsonFromResponse(content: string): string {
  // Try to find JSON in code blocks
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find JSON between braces
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return content.trim();
}

// ===========================================
// Convenience: Parse and Validate
// ===========================================

export interface ParseValidationResult {
  isValid: boolean;
  tripInput: TripInput;
  missingFields: string[];
  suggestions: string[];
  conflicts: InputConflict[];
  spellingCorrections: SpellingCorrection[];
}

export function validateParsedInput(
  parsed: ParsedTripInput
): ParseValidationResult {
  const missingFields: string[] = [];
  const suggestions: string[] = [];

  const { tripInput, conflicts, spellingCorrections } = parsed;

  // Check for essential info
  if (
    !tripInput.prompt &&
    tripInput.flights.length === 0 &&
    tripInput.hotels.length === 0
  ) {
    missingFields.push("destination");
    suggestions.push("Please specify where you want to go.");
  }

  // Check for dates
  const hasFlightDates = tripInput.flights.some((f) => f.date);
  const hasHotelDates = tripInput.hotels.some((h) => h.checkIn && h.checkOut);
  if (!hasFlightDates && !hasHotelDates) {
    missingFields.push("dates");
    suggestions.push("When are you planning to travel?");
  }

  // Check for travelers if it's still default
  if (tripInput.travelers.adults === 2 && parsed.confidence < 0.5) {
    suggestions.push("How many people are traveling?");
  }

  // Add clarifications from parsing
  suggestions.push(...parsed.clarifications);

  // Add suggestions for conflicts
  conflicts
    .filter((c) => c.severity === "error")
    .forEach((c) => {
      suggestions.push(`⚠️ ${c.message}`);
      if (c.suggestion) {
        suggestions.push(`   → ${c.suggestion}`);
      }
    });

  // Notify about spelling corrections
  if (spellingCorrections.length > 0) {
    const correctionMessages = spellingCorrections
      .filter((c) => c.confidence > 0.7)
      .map((c) => `"${c.original}" → "${c.corrected}"`);
    if (correctionMessages.length > 0) {
      suggestions.push(
        `📝 Made spelling corrections: ${correctionMessages.join(", ")}`
      );
    }
  }

  const hasErrors = conflicts.some((c) => c.severity === "error");

  return {
    isValid: missingFields.length === 0 && !hasErrors,
    tripInput,
    missingFields,
    suggestions,
    conflicts,
    spellingCorrections,
  };
}

// ===========================================
// Quick Validation (without LLM)
// ===========================================

export function quickValidateInput(tripInput: TripInput): InputConflict[] {
  const conflicts: InputConflict[] = [];

  // Check for date overlaps in hotels
  const sortedHotels = [...tripInput.hotels].sort(
    (a, b) => new Date(a.checkIn).getTime() - new Date(b.checkIn).getTime()
  );

  for (let i = 0; i < sortedHotels.length - 1; i++) {
    const current = sortedHotels[i];
    const next = sortedHotels[i + 1];

    const checkoutDate = new Date(current.checkOut);
    const checkinDate = new Date(next.checkIn);

    if (checkoutDate > checkinDate) {
      conflicts.push({
        type: "date_overlap",
        severity: "error",
        message: `Hotel "${current.name || current.city}" checkout (${current.checkOut}) is after "${next.name || next.city}" checkin (${next.checkIn})`,
        suggestion: "Adjust the checkout or checkin dates to avoid overlap",
        affectedItems: [current.id, next.id],
      });
    } else if (checkoutDate < checkinDate) {
      const gapDays = Math.ceil(
        (checkinDate.getTime() - checkoutDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (gapDays > 0) {
        conflicts.push({
          type: "date_gap",
          severity: "warning",
          message: `${gapDays}-day gap between "${current.name || current.city}" checkout and "${next.name || next.city}" checkin`,
          suggestion: `Book accommodation for ${current.checkOut} to ${next.checkIn}`,
          affectedItems: [current.id, next.id],
        });
      }
    }
  }

  // Check for flight/activity time conflicts
  for (const flight of tripInput.flights) {
    if (!flight.date || !flight.time) continue;

    for (const activity of tripInput.activities) {
      if (activity.date !== flight.date) continue;
      if (!activity.startTime) continue;

      // Simple overlap check (within 2 hours)
      const flightHour = parseInt(flight.time.split(":")[0]);
      const activityHour = parseInt(activity.startTime.split(":")[0]);

      if (Math.abs(flightHour - activityHour) < 2) {
        conflicts.push({
          type: "time_conflict",
          severity: "error",
          message: `Flight at ${flight.time} conflicts with "${activity.name}" at ${activity.startTime} on ${flight.date}`,
          suggestion: "Reschedule one of these or allow more buffer time",
          affectedItems: [flight.id, activity.id],
        });
      }
    }
  }

  // Check for logical errors (return before departure)
  if (tripInput.flights.length >= 2) {
    const outbound = tripInput.flights[0];
    const returnFlight = tripInput.flights[tripInput.flights.length - 1];

    if (outbound.date && returnFlight.date) {
      if (new Date(returnFlight.date) < new Date(outbound.date)) {
        conflicts.push({
          type: "logical_error",
          severity: "error",
          message: `Return flight (${returnFlight.date}) is before outbound flight (${outbound.date})`,
          suggestion: "Check your flight dates",
          affectedItems: [outbound.id, returnFlight.id],
        });
      }
    }
  }

  return conflicts;
}

// ===========================================
// Export for API routes
// ===========================================

export { OLLAMA_MODEL, OLLAMA_BASE_URL };
