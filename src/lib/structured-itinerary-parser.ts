// ============================================
// STRUCTURED ITINERARY PARSER
// ============================================
// Parses LLM responses into structured itinerary data
// Handles both text + JSON format and fallback parsing

import type {
  StructuredItineraryResponse,
  StructuredItineraryData,
  ItineraryResponseMetadata,
  LLMItineraryResponse,
  DayWithOptions,
  SlotWithOptions,
  ActivityOption,
  PlaceData,
} from "@/types/structured-itinerary";

// ============================================
// MAIN PARSER
// ============================================

/**
 * Parse LLM response that contains both text and structured JSON
 * Expected format:
 * ---TEXT---
 * [conversational message]
 * ---END_TEXT---
 *
 * ---JSON---
 * { structured itinerary data }
 * ---END_JSON---
 */
export function parseStructuredResponse(llmResponse: string): StructuredItineraryResponse {
  const startTime = Date.now();

  // Try to extract text portion
  const textMatch = llmResponse.match(/---TEXT---([\s\S]*?)---END_TEXT---/i);
  const message = textMatch ? textMatch[1].trim() : extractFallbackMessage(llmResponse);

  // Try to extract JSON portion
  const jsonMatch = llmResponse.match(/---JSON---([\s\S]*?)---END_JSON---/i);

  if (!jsonMatch) {
    // Try alternative JSON extraction methods
    const alternativeJson = tryAlternativeJsonExtraction(llmResponse);

    if (alternativeJson) {
      return buildResponse(message, alternativeJson, null);
    }

    // No structured data found
    return {
      message,
      itinerary: null,
      metadata: buildEmptyMetadata(),
      parseError: "No structured JSON found in response. LLM may need prompt adjustment.",
    };
  }

  try {
    const rawJson = jsonMatch[1].trim();
    const parsed = JSON.parse(rawJson) as LLMItineraryResponse;
    const itinerary = transformLLMResponse(parsed);

    console.log(`[Parser] Parsed structured itinerary in ${Date.now() - startTime}ms`);
    return buildResponse(message, itinerary, null);
  } catch (e) {
    const error = e instanceof Error ? e.message : "Unknown parse error";
    console.error("[Parser] JSON parse error:", error);

    return {
      message,
      itinerary: null,
      metadata: buildEmptyMetadata(),
      parseError: `JSON parse error: ${error}`,
    };
  }
}

// ============================================
// ALTERNATIVE EXTRACTION METHODS
// ============================================

/**
 * Try to repair common JSON issues (trailing commas, missing quotes, etc.)
 * This is especially useful for Gemini outputs which can have subtle issues
 */
function tryRepairJson(jsonStr: string): string {
  let repaired = jsonStr;

  // Remove trailing commas before } or ] (very common LLM issue)
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

  // Remove multiple trailing commas
  repaired = repaired.replace(/,+(\s*[}\]])/g, '$1');

  // Fix unescaped newlines in strings
  repaired = repaired.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match) => {
    return match.replace(/\n/g, '\\n').replace(/\r/g, '\\r').replace(/\t/g, '\\t');
  });

  // Remove any control characters that might break parsing
  repaired = repaired.replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');

  // Fix missing commas between array elements (common in long arrays)
  repaired = repaired.replace(/\}(\s*)\{/g, '},$1{');
  repaired = repaired.replace(/\](\s*)\[/g, '],$1[');

  // Fix missing commas after string values followed by keys
  repaired = repaired.replace(/"(\s+)"/g, '",$1"');

  // Remove BOM if present
  repaired = repaired.replace(/^\uFEFF/, '');

  return repaired;
}

/**
 * More aggressive JSON repair for severely malformed JSON
 */
function aggressiveJsonRepair(jsonStr: string): string {
  let repaired = tryRepairJson(jsonStr);

  // Try to balance braces/brackets
  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;

  // Add missing closing braces/brackets
  for (let i = 0; i < openBraces - closeBraces; i++) {
    repaired += '}';
  }
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    repaired += ']';
  }

  // Truncate at last valid closing brace if there are too many
  if (closeBraces > openBraces) {
    const lastValidPos = findLastValidPosition(repaired);
    if (lastValidPos > 0) {
      repaired = repaired.substring(0, lastValidPos + 1);
    }
  }

  return repaired;
}

/**
 * Find the last position where the JSON could be valid
 */
function findLastValidPosition(jsonStr: string): number {
  let braceCount = 0;
  let bracketCount = 0;
  let lastValidPos = -1;
  let inString = false;
  let escaped = false;

  for (let i = 0; i < jsonStr.length; i++) {
    const char = jsonStr[i];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) continue;

    if (char === '{') braceCount++;
    else if (char === '}') {
      braceCount--;
      if (braceCount === 0 && bracketCount === 0) {
        lastValidPos = i;
      }
    }
    else if (char === '[') bracketCount++;
    else if (char === ']') bracketCount--;
  }

  return lastValidPos;
}

/**
 * Try multiple JSON parsing strategies
 */
function tryParseJson(jsonStr: string): unknown | null {
  // Strategy 1: Direct parse
  try {
    return JSON.parse(jsonStr);
  } catch {
    // Continue to next strategy
  }

  // Strategy 2: Basic repair
  try {
    const repaired = tryRepairJson(jsonStr);
    return JSON.parse(repaired);
  } catch {
    // Continue to next strategy
  }

  // Strategy 3: Aggressive repair
  try {
    const repaired = aggressiveJsonRepair(jsonStr);
    return JSON.parse(repaired);
  } catch {
    // Continue to next strategy
  }

  // Strategy 4: Extract just the itinerary portion if truncated
  try {
    // Find the last complete day object
    const daysMatch = jsonStr.match(/"days"\s*:\s*\[([\s\S]*)/);
    if (daysMatch) {
      const daysContent = daysMatch[1];
      // Find complete day objects
      const dayObjects: string[] = [];
      let depth = 0;
      let start = -1;

      for (let i = 0; i < daysContent.length; i++) {
        const char = daysContent[i];
        if (char === '{') {
          if (depth === 0) start = i;
          depth++;
        } else if (char === '}') {
          depth--;
          if (depth === 0 && start >= 0) {
            dayObjects.push(daysContent.substring(start, i + 1));
            start = -1;
          }
        }
      }

      if (dayObjects.length > 0) {
        // Reconstruct with complete days only
        const destMatch = jsonStr.match(/"destination"\s*:\s*"([^"]+)"/);
        const destination = destMatch ? destMatch[1] : "Unknown";

        const reconstructed = {
          destination,
          days: dayObjects.map(d => {
            try { return JSON.parse(d); } catch { return null; }
          }).filter(d => d !== null),
        };

        if (reconstructed.days.length > 0) {
          return reconstructed;
        }
      }
    }
  } catch {
    // Final fallback failed
  }

  return null;
}

/**
 * Try to extract JSON from code blocks or raw JSON
 */
function tryAlternativeJsonExtraction(response: string): StructuredItineraryData | null {
  // Try markdown code block
  const codeBlockMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    try {
      const repaired = tryRepairJson(codeBlockMatch[1].trim());
      const parsed = JSON.parse(repaired);
      if (isValidItineraryResponse(parsed)) {
        return transformLLMResponse(parsed);
      }
    } catch {
      // Try without repair
      try {
        const parsed = JSON.parse(codeBlockMatch[1].trim());
        if (isValidItineraryResponse(parsed)) {
          return transformLLMResponse(parsed);
        }
      } catch {
        // Continue to next method
      }
    }
  }

  // Try to find raw JSON object
  const jsonObjectMatch = response.match(/\{[\s\S]*"days"\s*:\s*\[[\s\S]*\][\s\S]*\}/);
  if (jsonObjectMatch) {
    try {
      const repaired = tryRepairJson(jsonObjectMatch[0]);
      const parsed = JSON.parse(repaired);
      if (isValidItineraryResponse(parsed)) {
        return transformLLMResponse(parsed);
      }
    } catch {
      // Try without repair
      try {
        const parsed = JSON.parse(jsonObjectMatch[0]);
        if (isValidItineraryResponse(parsed)) {
          return transformLLMResponse(parsed);
        }
      } catch {
        // Failed to parse
      }
    }
  }

  return null;
}

/**
 * Extract a fallback message when no TEXT markers found
 */
function extractFallbackMessage(response: string): string {
  // If the response contains JSON, extract text before it
  const jsonStart = response.indexOf("{");
  if (jsonStart > 50) {
    return response.substring(0, jsonStart).trim();
  }

  // If response is mostly JSON, generate a default message
  if (response.trim().startsWith("{")) {
    return "Here's your personalized itinerary! I've created options for each time slot so you can choose what works best for you.";
  }

  // Return the whole thing if it's short enough
  if (response.length < 500) {
    return response;
  }

  // Return first 500 chars
  return response.substring(0, 500) + "...";
}

// ============================================
// VALIDATION
// ============================================

/**
 * Check if parsed JSON has the expected itinerary structure
 */
function isValidItineraryResponse(data: unknown): data is LLMItineraryResponse {
  if (!data || typeof data !== "object") return false;

  const obj = data as Record<string, unknown>;

  // Must have destination and days array
  if (typeof obj.destination !== "string") return false;
  if (!Array.isArray(obj.days)) return false;
  if (obj.days.length === 0) return false;

  // Check first day structure
  const firstDay = obj.days[0] as Record<string, unknown>;
  if (typeof firstDay.dayNumber !== "number") return false;
  if (!Array.isArray(firstDay.slots)) return false;

  return true;
}

// ============================================
// TRANSFORM LLM RESPONSE TO STRUCTURED DATA
// ============================================

/**
 * Transform raw LLM response to our internal structured format
 */
function transformLLMResponse(raw: LLMItineraryResponse): StructuredItineraryData {
  return {
    destination: raw.destination,
    country: raw.country,
    days: raw.days.map(transformDay),
    generalTips: raw.generalTips,
    estimatedBudget: raw.estimatedBudget
      ? {
          total: raw.estimatedBudget.total,
          currency: raw.estimatedBudget.currency,
        }
      : undefined,
  };
}

function transformDay(day: LLMItineraryResponse["days"][0]): DayWithOptions {
  return {
    dayNumber: day.dayNumber,
    date: day.date,
    city: day.city,
    title: day.title,
    slots: day.slots.map(transformSlot),
  };
}

function transformSlot(slot: LLMItineraryResponse["days"][0]["slots"][0]): SlotWithOptions {
  return {
    slotId: slot.slotId || generateSlotId(),
    slotType: slot.slotType,
    timeRange: slot.timeRange,
    options: slot.options.map(transformOption),
    selectedOptionId: null, // Nothing selected by default
    commuteFromPrevious: undefined, // Will be calculated later
  };
}

function transformOption(option: LLMItineraryResponse["days"][0]["slots"][0]["options"][0]): ActivityOption {
  const place: PlaceData | null = option.activity.place
    ? {
        name: option.activity.place.name,
        address: option.activity.place.address,
        neighborhood: option.activity.place.neighborhood,
        coordinates: option.activity.place.coordinates || { lat: 0, lng: 0 },
      }
    : null;

  return {
    id: option.id || generateOptionId(),
    rank: option.rank,
    score: option.score,
    activity: {
      name: option.activity.name,
      description: option.activity.description,
      category: option.activity.category,
      duration: option.activity.duration,
      place,
      isFree: option.activity.isFree,
      estimatedCost: option.activity.estimatedCost,
      tags: option.activity.tags || [],
      source: option.activity.source || "ai",
    },
    matchReasons: option.matchReasons || [],
    tradeoffs: option.tradeoffs || [],
  };
}

// ============================================
// BUILD RESPONSE
// ============================================

function buildResponse(
  message: string,
  itinerary: StructuredItineraryData | null,
  parseError: string | null
): StructuredItineraryResponse {
  const metadata = itinerary ? buildMetadata(itinerary) : buildEmptyMetadata();

  return {
    message,
    itinerary,
    metadata,
    parseError: parseError || undefined,
  };
}

function buildMetadata(itinerary: StructuredItineraryData): ItineraryResponseMetadata {
  let totalSlots = 0;
  let totalOptions = 0;
  let hasPlaces = false;
  let hasCommute = false;
  let hasFoodPreferences = false;

  for (const day of itinerary.days) {
    for (const slot of day.slots) {
      totalSlots++;
      totalOptions += slot.options.length;

      // Check for places
      for (const option of slot.options) {
        if (option.activity.place?.coordinates?.lat) {
          hasPlaces = true;
        }
        if (option.dietaryMatch) {
          hasFoodPreferences = true;
        }
      }

      // Check for commute
      if (slot.commuteFromPrevious) {
        hasCommute = true;
      }
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    hasPlaces,
    hasCommute,
    hasFoodPreferences,
    totalDays: itinerary.days.length,
    totalSlots,
    totalOptions,
  };
}

function buildEmptyMetadata(): ItineraryResponseMetadata {
  return {
    generatedAt: new Date().toISOString(),
    hasPlaces: false,
    hasCommute: false,
    hasFoodPreferences: false,
    totalDays: 0,
    totalSlots: 0,
    totalOptions: 0,
  };
}

// ============================================
// ID GENERATORS
// ============================================

function generateSlotId(): string {
  return `slot-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function generateOptionId(): string {
  return `opt-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Check if a response contains structured itinerary data
 */
export function hasStructuredItinerary(response: StructuredItineraryResponse): boolean {
  return response.itinerary !== null && response.itinerary.days.length > 0;
}

/**
 * Get total activity count across all options
 */
export function getTotalActivityCount(itinerary: StructuredItineraryData): number {
  return itinerary.days.reduce((total, day) => {
    return total + day.slots.reduce((slotTotal, slot) => {
      return slotTotal + slot.options.length;
    }, 0);
  }, 0);
}

/**
 * Get all unique categories from the itinerary
 */
export function getCategories(itinerary: StructuredItineraryData): string[] {
  const categories = new Set<string>();

  for (const day of itinerary.days) {
    for (const slot of day.slots) {
      for (const option of slot.options) {
        categories.add(option.activity.category);
      }
    }
  }

  return Array.from(categories);
}

/**
 * Get selected options or top-ranked options for each slot
 */
export function getSelectedOrTopOptions(itinerary: StructuredItineraryData): ActivityOption[] {
  const options: ActivityOption[] = [];

  for (const day of itinerary.days) {
    for (const slot of day.slots) {
      if (slot.selectedOptionId) {
        const selected = slot.options.find((o) => o.id === slot.selectedOptionId);
        if (selected) {
          options.push(selected);
          continue;
        }
      }
      // Fall back to top-ranked option
      const topRanked = slot.options.find((o) => o.rank === 1) || slot.options[0];
      if (topRanked) {
        options.push(topRanked);
      }
    }
  }

  return options;
}

/**
 * Update a slot's selected option
 */
export function selectOption(
  itinerary: StructuredItineraryData,
  slotId: string,
  optionId: string
): StructuredItineraryData {
  return {
    ...itinerary,
    days: itinerary.days.map((day) => ({
      ...day,
      slots: day.slots.map((slot) => {
        if (slot.slotId === slotId) {
          return { ...slot, selectedOptionId: optionId };
        }
        return slot;
      }),
    })),
  };
}
