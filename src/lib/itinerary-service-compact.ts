/**
 * Compact Itinerary Service (Token-Efficient)
 *
 * Parallel implementation of itinerary-service.ts that uses a compact JSON format
 * to reduce token usage by 50-60%. Hot-swappable via environment variable.
 *
 * Configuration:
 *   ITINERARY_FORMAT=compact|standard (default: standard)
 *   ITINERARY_PROVIDER=llm|data (default: data)
 *   ITINERARY_AI_PROVIDER=openai|ollama|gemini (override for itinerary-specific LLM)
 *
 * Token Savings:
 *   - Standard format: ~3500 tokens per day
 *   - Compact format:  ~1200 tokens per day (65% reduction)
 *
 * Usage:
 *   import { itineraryServiceCompact } from './itinerary-service-compact';
 *   const result = await itineraryServiceCompact.generate({ cities: ['tokyo'], startDate: '2025-04-01' });
 */

import { llm, type ChatMessage, type AIProvider } from "./llm";
import { getSystemPrompt } from "./prompts";
import { getValidationDebugLogger } from "./validation-debug-logger";
import type {
  StructuredItineraryData,
  DayWithOptions,
  SlotWithOptions,
  ActivityOption,
} from "@/types/structured-itinerary";
import type { ItineraryRequest, ItineraryResponse, ActivityAnchor } from "./itinerary-service";

// ============================================
// COMPACT FORMAT TYPES
// ============================================

/**
 * Compact activity tuple format:
 * [name, category, duration_mins, lat, lng, neighborhood]
 */
type CompactActivity = [string, string, number, number, number, string];

/**
 * Compact anchor tuple format (activity with fixed time):
 * [name, category, duration_mins, lat, lng, neighborhood, startTime]
 */
type CompactAnchor = [string, string, number, number, number, string, string];

/**
 * Compact transfer tuple format:
 * [type, from, to, mode, duration_mins]
 * type: "airport_arrival" | "inter_city" | "airport_departure"
 */
type CompactTransfer = [string, string, string, string, number];

/**
 * Compact day format
 */
interface CompactDay {
  c: string; // city
  t: string; // title
  m?: CompactActivity[]; // morning activities
  a?: CompactActivity[]; // afternoon activities
  e?: CompactActivity[]; // evening activities
  x?: CompactAnchor[]; // anchors (fixed-time activities)
  tr?: CompactTransfer; // transfer (airport/inter-city)
}

/**
 * Compact itinerary format from LLM
 */
interface CompactItinerary {
  dest: string; // destination
  days: CompactDay[];
  tips?: string[];
}

// ============================================
// CONFIGURATION
// ============================================

export type ItineraryFormat = "compact" | "standard";

export function getItineraryFormat(): ItineraryFormat {
  const format = process.env.ITINERARY_FORMAT?.toLowerCase();
  if (format === "compact") return "compact";
  return "standard";
}

export function getItineraryAIProvider(): AIProvider {
  const override = process.env.ITINERARY_AI_PROVIDER?.toLowerCase();
  if (override === "openai") return "openai";
  if (override === "gemini" || override === "google") return "gemini";
  if (override === "ollama") return "ollama";
  const global = process.env.AI_PROVIDER?.toLowerCase();
  if (global === "openai") return "openai";
  if (global === "gemini" || global === "google") return "gemini";
  if (global === "ollama") return "ollama";
  return "openai";
}

// ============================================
// COMPACT FORMAT GENERATION
// ============================================

/**
 * Build constraints section for compact prompt
 */
function buildCompactConstraintsSection(
  mustHave: string[],
  mustAvoid: string[],
  anchors: ActivityAnchor[],
  clusterByNeighborhood: boolean
): string {
  const sections: string[] = [];

  if (mustHave.length > 0) {
    sections.push(`MUST-HAVE (include as first activity): ${mustHave.join(", ")}`);
  }

  if (mustAvoid.length > 0) {
    sections.push(`MUST-AVOID (never include): ${mustAvoid.join(", ")}`);
  }

  if (anchors.length > 0) {
    const anchorList = anchors.map(a => {
      const timeStr = a.startTime ? ` @ ${a.startTime}` : "";
      return `${a.name} (${a.city}, ${a.date}${timeStr})`;
    }).join("; ");
    sections.push(`PRE-BOOKED (fixed times): ${anchorList}`);
  }

  if (clusterByNeighborhood) {
    sections.push(`CLUSTERING: Group by neighborhood, minimize travel`);
  }

  return sections.length > 0 ? "\n" + sections.join("\n") : "";
}

/**
 * Generate itinerary using compact JSON format
 */
export async function generateCompact(
  request: ItineraryRequest
): Promise<ItineraryResponse> {
  const aiProvider = getItineraryAIProvider();

  const {
    cities,
    startDate,
    totalDays,
    daysPerCity,
    pace = "moderate",
    interests = [],
    travelers,
    budget = "moderate",
    userPreferences,
    tripContext,
    mustHave = [],
    mustAvoid = [],
    anchors = [],
    clusterByNeighborhood = true,
    arrivalFlightTime,
    departureFlightTime,
    transfers = [],
    hotels = [],
  } = request;

  // Calculate number of days
  let numDays = totalDays || 0;
  if (!numDays && daysPerCity) {
    numDays = Object.values(daysPerCity).reduce((sum, d) => sum + d, 0);
  }
  if (!numDays) {
    numDays = cities.length * 2;
  }

  // Build traveler info
  const travelerInfo = travelers
    ? `${travelers.adults}A${travelers.children ? `+${travelers.children}C` : ""}`
    : "2A";

  // Build constraints section
  const constraintsSection = buildCompactConstraintsSection(
    mustHave,
    mustAvoid,
    anchors,
    clusterByNeighborhood
  );

  // Build flight constraints
  let flightInfo = "";
  if (arrivalFlightTime) {
    flightInfo += `Arrival: ${arrivalFlightTime} (Day 1 adjust accordingly). `;
  }
  if (departureFlightTime) {
    flightInfo += `Departure: ${departureFlightTime} (Last day adjust accordingly). `;
  }

  // Build transfer info
  const interCityTransfers = transfers.filter(t => t.type === "inter_city");
  const transferInfo = interCityTransfers.length > 0
    ? `Transfers: ${interCityTransfers.map(t => `${t.fromCity}→${t.toCity} on ${t.date}`).join("; ")}`
    : "";

  // Get the COMPACT system prompt
  const systemPrompt = getSystemPrompt("itineraryGenerationCompact");

  // Build compact user prompt
  const userPrompt = `Generate ${numDays}-day Japan itinerary.

CITIES: ${cities.join(", ")}
START: ${startDate}
${daysPerCity ? `DAYS/CITY: ${JSON.stringify(daysPerCity)}` : ""}
PACE: ${pace} | TRAVELERS: ${travelerInfo} | BUDGET: ${budget}
INTERESTS: ${interests.length > 0 ? interests.join(", ") : "general sightseeing, food, culture"}
${userPreferences ? `PREFS: ${userPreferences}` : ""}
${tripContext ? `CONTEXT: ${tripContext}` : ""}
${flightInfo}
${transferInfo}
${constraintsSection}

Return COMPACT JSON only. No markdown, no explanation.`;

  try {
    // Calculate token limit - MUCH smaller for compact format
    // Compact format: ~200 tokens per day (vs ~3500 standard)
    const tokensPerDay = 1200;
    const baseTokens = 500;
    const calculatedMaxTokens = Math.min(16000, baseTokens + (numDays * tokensPerDay));

    console.log(`[compact-service] Generating ${numDays}-day itinerary via ${aiProvider} (maxTokens: ${calculatedMaxTokens} - ${Math.round((1 - calculatedMaxTokens / (3000 + numDays * 3500)) * 100)}% reduction)`);

    // DRY RUN MODE
    const isDryRun = process.env.LLM_DRY_RUN === "true";
    if (isDryRun) {
      console.log("\n" + "=".repeat(80));
      console.log("[DRY RUN] COMPACT LLM call disabled - showing request details only");
      console.log("=".repeat(80));
      console.log("\n[DRY RUN] SYSTEM PROMPT:");
      console.log("-".repeat(40));
      console.log(systemPrompt.substring(0, 500) + "...");
      console.log("\n[DRY RUN] USER PROMPT:");
      console.log("-".repeat(40));
      console.log(userPrompt);
      console.log("\n[DRY RUN] TOKEN SAVINGS:");
      console.log("-".repeat(40));
      const standardTokens = 3000 + numDays * 3500;
      const compactTokens = calculatedMaxTokens;
      console.log(`Standard format would use: ~${standardTokens} tokens`);
      console.log(`Compact format will use:   ~${compactTokens} tokens`);
      console.log(`Savings: ${Math.round((1 - compactTokens / standardTokens) * 100)}%`);
      console.log("=".repeat(80) + "\n");

      return createMockResponse(cities, startDate, numDays);
    }

    // Make LLM call
    const messages: ChatMessage[] = [{ role: "user", content: userPrompt }];

    // Capture for debugging
    const debugLogger = getValidationDebugLogger();
    debugLogger.captureLLMRequest(aiProvider, systemPrompt, userPrompt, {
      model: "gpt-4o-mini",
      temperature: 0.7,
      maxTokens: calculatedMaxTokens,
      jsonMode: true,
    });

    const startTime = Date.now();
    const response = await llm.chat(messages, {
      systemPrompt,
      temperature: 0.7,
      maxTokens: calculatedMaxTokens,
      jsonMode: true,
      providerOverride: aiProvider,
    });
    const processingTimeMs = Date.now() - startTime;

    // Parse compact response
    let parseErrors: string[] = [];
    let compactData: CompactItinerary;
    try {
      compactData = parseCompactResponse(response);
    } catch (parseError) {
      parseErrors.push(parseError instanceof Error ? parseError.message : String(parseError));
      throw parseError;
    }

    // Log token comparison
    const responseTokens = Math.ceil(response.length / 4); // Approximate
    console.log(`[compact-service] Response: ${responseTokens} tokens (${response.length} chars) in ${processingTimeMs}ms`);

    // Capture response for debugging
    debugLogger.captureLLMResponse(
      response,
      compactData,
      parseErrors.length > 0 ? parseErrors : undefined,
      processingTimeMs
    );

// Expand compact format to full StructuredItineraryData
    const itinerary = expandCompactItinerary(compactData, cities, startDate, numDays, hotels);

    // Calculate stats
    const totalSlots = itinerary.days.reduce((sum, d) => sum + d.slots.length, 0);
    const totalOptions = itinerary.days.reduce(
      (sum, d) => sum + d.slots.reduce((s, slot) => s + slot.options.length, 0),
      0
    );

    return {
      itinerary,
      message: `Generated using compact format (${responseTokens} tokens)`,
      metadata: {
        generatedAt: new Date().toISOString(),
        provider: "llm",
        source: `compact-${aiProvider}`,
        totalDays: itinerary.days.length,
        totalSlots,
        totalOptions,
        cities: itinerary.days.reduce((acc, d) => {
          if (!acc.includes(d.city)) acc.push(d.city);
          return acc;
        }, [] as string[]),
      },
    };
  } catch (error) {
    console.error("[compact-service] Generation error:", error);
    throw error;
  }
}

// ============================================
// COMPACT FORMAT PARSING
// ============================================

/**
 * Parse compact JSON response from LLM
 */
function parseCompactResponse(response: string): CompactItinerary {
  let content = response;

  // Extract JSON from markdown code blocks if present
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    content = codeBlockMatch[1].trim();
  } else {
    // Find JSON object
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      content = content.substring(firstBrace, lastBrace + 1);
    }
  }

  // Fix trailing commas
  content = content.replace(/,(\s*[}\]])/g, "$1");

  try {
    const parsed = JSON.parse(content) as CompactItinerary;

    // Validate structure
    if (!parsed.days || !Array.isArray(parsed.days)) {
      throw new Error("Missing or invalid 'days' array");
    }

    // Validate each day has required fields
    for (let i = 0; i < parsed.days.length; i++) {
      const day = parsed.days[i];
      if (!day.c) {
        console.warn(`[compact-service] Day ${i + 1} missing city, will use default`);
      }
    }

    return parsed;
  } catch (error) {
    console.error("[compact-service] Parse error:", error);
    console.error("[compact-service] Raw response:", content.substring(0, 500));
    throw error;
  }
}

// ============================================
// COMPACT TO FULL FORMAT EXPANSION
// ============================================

/**
 * Hotel info for assigning to days
 */
interface HotelInfo {
  name: string;
  city: string;
  checkIn: string;  // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  coordinates?: {
    lat: number;
    lng: number;
  };
  address?: string;
}

/**
 * Find which hotel applies to a specific date
 */
function findHotelForDate(
  dateStr: string,
  hotels: HotelInfo[]
): HotelInfo | null {
  const date = new Date(dateStr);

  for (const hotel of hotels) {
    const checkIn = new Date(hotel.checkIn);
    const checkOut = new Date(hotel.checkOut);

    // Hotel applies from check-in day through the night before check-out
    // e.g., checkIn=March 15, checkOut=March 18 → applies to March 15, 16, 17
    if (date >= checkIn && date < checkOut) {
      return hotel;
    }
  }

  return null;
}

/**
 * Expand compact itinerary to full StructuredItineraryData format
 */
function expandCompactItinerary(
  compact: CompactItinerary,
  cities: string[],
  startDate: string,
  numDays: number,
  hotels: HotelInfo[] = []
): StructuredItineraryData {
  const days: DayWithOptions[] = [];
  let currentDate = new Date(startDate);

  for (let i = 0; i < numDays; i++) {
    const compactDay = compact.days[i];
    const dateStr = currentDate.toISOString().split("T")[0];

    // Determine city
    let cityForDay = cities[0];
    if (compactDay?.c) {
      cityForDay = compactDay.c;
    } else {
      const daysPerCity = Math.ceil(numDays / cities.length);
      const cityIndex = Math.floor(i / daysPerCity);
      cityForDay = cities[Math.min(cityIndex, cities.length - 1)];
    }

    // Build slots from compact format
    const slots: SlotWithOptions[] = [];

    // Check for transfer at start of day (arrival or inter-city)
    if (compactDay?.tr) {
      const [type, from, to, mode, duration] = compactDay.tr;
      if (type === "airport_arrival" || type === "inter_city") {
        slots.push(createTransferSlot(type, from, to, mode, duration, i + 1, "start"));
      }
    }

    // Check for early morning anchor (e.g., 05:30 sunrise tour)
    const earlyAnchors = compactDay?.x?.filter(a => {
      const time = a[6]; // startTime
      const hour = parseInt(time?.split(":")[0] || "12");
      return hour < 9;
    }) || [];

    // Add early anchors before morning slot
    for (const anchor of earlyAnchors) {
      slots.push(expandAnchorSlot(anchor, i + 1));
    }

    // Morning slot (skip if early anchor exists)
    if (earlyAnchors.length === 0 && compactDay?.m && compactDay.m.length > 0) {
      slots.push(expandSlot("morning", compactDay.m, i + 1));
    } else if (earlyAnchors.length === 0) {
      // Only add empty morning if no arrival transfer and no early anchor
      const hasArrivalTransfer = compactDay?.tr && (compactDay.tr[0] === "airport_arrival");
      if (!hasArrivalTransfer) {
        slots.push(createEmptySlot("morning", i + 1));
      }
    }

    // Check for mid-morning/late-morning anchors (09:00-12:00)
    const morningAnchors = compactDay?.x?.filter(a => {
      const time = a[6];
      const hour = parseInt(time?.split(":")[0] || "12");
      return hour >= 9 && hour < 12;
    }) || [];

    for (const anchor of morningAnchors) {
      slots.push(expandAnchorSlot(anchor, i + 1));
    }

    // Lunch slot (empty - will be filled by restaurant service)
    slots.push(createEmptySlot("lunch", i + 1, true));

    // Check for early afternoon anchors (12:00-14:00)
    const earlyAfternoonAnchors = compactDay?.x?.filter(a => {
      const time = a[6];
      const hour = parseInt(time?.split(":")[0] || "12");
      return hour >= 12 && hour < 14;
    }) || [];

    for (const anchor of earlyAfternoonAnchors) {
      slots.push(expandAnchorSlot(anchor, i + 1));
    }

    // Check for afternoon anchors (14:00-18:00)
    const afternoonAnchors = compactDay?.x?.filter(a => {
      const time = a[6];
      const hour = parseInt(time?.split(":")[0] || "12");
      return hour >= 14 && hour < 18;
    }) || [];

    // Afternoon slot
    if (compactDay?.a && compactDay.a.length > 0) {
      slots.push(expandSlot("afternoon", compactDay.a, i + 1));
    } else if (afternoonAnchors.length === 0) {
      slots.push(createEmptySlot("afternoon", i + 1));
    }

    // Add afternoon anchors
    for (const anchor of afternoonAnchors) {
      slots.push(expandAnchorSlot(anchor, i + 1));
    }

    // Dinner slot (empty - will be filled by restaurant service)
    slots.push(createEmptySlot("dinner", i + 1, true));

    // Evening slot (optional)
    if (compactDay?.e && compactDay.e.length > 0) {
      slots.push(expandSlot("evening", compactDay.e, i + 1));
    }

    // Check for transfer at end of day (departure)
    if (compactDay?.tr) {
      const [type, from, to, mode, duration] = compactDay.tr;
      if (type === "airport_departure") {
        slots.push(createTransferSlot(type, from, to, mode, duration, i + 1, "end"));
      }
    }

    const day: DayWithOptions = {
      dayNumber: i + 1,
      date: dateStr,
      city: cityForDay,
      title: compactDay?.t || `Day ${i + 1} in ${cityForDay}`,
      slots,
    };

    // Assign hotel/accommodation for this day if available
    const hotelForDay = findHotelForDate(dateStr, hotels);
    if (hotelForDay) {
      day.accommodation = {
        name: hotelForDay.name,
        address: hotelForDay.address || "",
        neighborhood: hotelForDay.city,
        coordinates: hotelForDay.coordinates || { lat: 0, lng: 0 },
        type: "hotel",
      };
    }

    days.push(day);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return {
    destination: compact.dest || cities.join(", "),
    country: "Japan",
    days,
    generalTips: compact.tips || getDefaultTips(),
    estimatedBudget: {
      total: { min: 50000, max: 100000 },
      currency: "JPY",
    },
  };
}

/**
 * Expand an anchor to a full slot with fixed time
 */
function expandAnchorSlot(
  anchor: CompactAnchor,
  dayNumber: number
): SlotWithOptions {
  const [name, category, duration, lat, lng, neighborhood, startTime] = anchor;

  // Calculate end time
  const [startHour, startMin] = startTime.split(":").map(Number);
  const endDate = new Date(2000, 0, 1, startHour, startMin);
  endDate.setMinutes(endDate.getMinutes() + duration);
  const endTime = `${String(endDate.getHours()).padStart(2, "0")}:${String(endDate.getMinutes()).padStart(2, "0")}`;

  const option: ActivityOption = {
    id: `anchor-day${dayNumber}-${startTime.replace(":", "")}`,
    rank: 1,
    score: 100,
    activity: {
      name,
      description: generateDescription(name, category),
      category: category as ActivityOption["activity"]["category"],
      duration,
      place: {
        name,
        address: "",
        neighborhood,
        coordinates: { lat, lng },
        photos: [],
      },
      isFree: isFreeCategory(category),
      tags: generateTags(category),
      source: "ai",
    },
    matchReasons: ["Pre-booked activity with fixed time"],
    tradeoffs: [],
  };

  return {
    slotId: `day${dayNumber}-anchor-${startTime.replace(":", "")}`,
    slotType: "morning", // Will be overridden by timeRange
    timeRange: { start: startTime, end: endTime },
    options: [option],
    behavior: "anchor",
  };
}

/**
 * Create a transfer slot (airport arrival/departure or inter-city)
 */
function createTransferSlot(
  type: string,
  from: string,
  to: string,
  mode: string,
  duration: number,
  dayNumber: number,
  position: "start" | "end"
): SlotWithOptions {
  // Determine display name for transfer
  const transferNames: Record<string, string> = {
    "narita-express": "Narita Express",
    "shinkansen": "Shinkansen",
    "haruka-express": "Haruka Express",
    "train": "Train",
    "bus": "Bus",
  };
  const modeName = transferNames[mode] || mode;

  // Create a descriptive title
  let title: string;
  let description: string;
  if (type === "airport_arrival") {
    title = `Arrival: ${from} → ${to}`;
    description = `Take the ${modeName} from ${from} to ${to}. Journey takes approximately ${duration} minutes.`;
  } else if (type === "airport_departure") {
    title = `Departure: ${from} → ${to}`;
    description = `Take the ${modeName} from ${from} to ${to} airport. Journey takes approximately ${duration} minutes.`;
  } else {
    title = `Transfer: ${from} → ${to}`;
    description = `Take the ${modeName} from ${from} to ${to}. Journey takes approximately ${duration} minutes.`;
  }

  // Estimate time range based on position and type
  let startTime: string;
  let endTime: string;
  if (position === "start") {
    if (type === "airport_arrival") {
      // Afternoon arrival
      startTime = "15:00";
      const endHour = 15 + Math.floor(duration / 60);
      const endMin = duration % 60;
      endTime = `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`;
    } else {
      // Inter-city morning departure
      startTime = "08:00";
      const endHour = 8 + Math.floor(duration / 60);
      const endMin = duration % 60;
      endTime = `${String(endHour).padStart(2, "0")}:${String(endMin).padStart(2, "0")}`;
    }
  } else {
    // Departure at end of day
    const departureHour = 10 - Math.ceil(duration / 60);
    startTime = `${String(Math.max(6, departureHour)).padStart(2, "0")}:00`;
    endTime = "10:00";
  }

  const option: ActivityOption = {
    id: `transfer-day${dayNumber}-${type}`,
    rank: 1,
    score: 100,
    activity: {
      name: title,
      description,
      category: "transfer" as ActivityOption["activity"]["category"],
      duration,
      place: {
        name: position === "start" ? from : to,
        address: "",
        neighborhood: "",
        coordinates: { lat: 0, lng: 0 }, // Will be resolved by enrichment
        photos: [],
      },
      isFree: false,
      tags: ["transfer", mode],
      source: "ai",
    },
    matchReasons: [type === "airport_arrival" ? "Arriving at destination" : type === "airport_departure" ? "Departing for airport" : "Inter-city transfer"],
    tradeoffs: [],
  };

  return {
    slotId: `day${dayNumber}-transfer-${position}`,
    slotType: "morning", // placeholder, overridden by timeRange
    timeRange: { start: startTime, end: endTime },
    options: [option],
    behavior: "anchor", // Transfers are fixed
  };
}

/**
 * Expand a compact slot to full SlotWithOptions format
 */
function expandSlot(
  slotType: SlotWithOptions["slotType"],
  activities: CompactActivity[],
  dayNumber: number
): SlotWithOptions {
  const options: ActivityOption[] = activities.map((act, index) => {
    const [name, category, duration, lat, lng, neighborhood] = act;

    return {
      id: `opt-day${dayNumber}-${slotType}-${index + 1}`,
      rank: index + 1,
      score: 85 - index * 5,
      activity: {
        name,
        description: generateDescription(name, category),
        category: category as ActivityOption["activity"]["category"],
        duration,
        place: {
          name,
          address: "",
          neighborhood,
          coordinates: { lat, lng },
          photos: [],
        },
        isFree: isFreeCategory(category),
        tags: generateTags(category),
        source: "ai",
      },
      matchReasons: [generateMatchReason(category, slotType)],
      tradeoffs: [],
    };
  });

  return {
    slotId: `day${dayNumber}-${slotType}`,
    slotType,
    timeRange: getDefaultTimeRange(slotType),
    options,
    behavior: "flex",
  };
}

/**
 * Create an empty slot placeholder
 */
function createEmptySlot(
  slotType: SlotWithOptions["slotType"],
  dayNumber: number,
  isMeal: boolean = false
): SlotWithOptions {
  return {
    slotId: `day${dayNumber}-${slotType}`,
    slotType,
    timeRange: getDefaultTimeRange(slotType),
    options: [],
    behavior: isMeal ? "meal" : "flex",
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate a description from name and category
 */
function generateDescription(_name: string, category: string): string {
  const descriptions: Record<string, string> = {
    temple: `Historic Buddhist temple known for its beautiful architecture and serene atmosphere.`,
    shrine: `Traditional Shinto shrine offering a peaceful escape and cultural experience.`,
    museum: `Fascinating museum with exhibits showcasing art, history, and culture.`,
    park: `Beautiful park perfect for a relaxing stroll or picnic.`,
    landmark: `Iconic landmark that's a must-see for any visitor.`,
    market: `Vibrant market offering local goods, street food, and authentic atmosphere.`,
    viewpoint: `Stunning viewpoint offering panoramic views of the city.`,
    neighborhood: `Charming neighborhood known for its unique character and local shops.`,
    "cultural-experience": `Immersive cultural experience offering hands-on activities.`,
  };

  return descriptions[category] || `Popular ${category} worth visiting.`;
}

/**
 * Generate tags from category
 */
function generateTags(category: string): string[] {
  const tagMap: Record<string, string[]> = {
    temple: ["cultural", "historic", "peaceful"],
    shrine: ["cultural", "spiritual", "traditional"],
    museum: ["indoor", "educational", "cultural"],
    park: ["outdoor", "nature", "relaxing"],
    landmark: ["iconic", "photography", "popular"],
    market: ["food", "shopping", "local"],
    viewpoint: ["scenic", "photography", "popular"],
    neighborhood: ["walking", "local", "exploration"],
    "cultural-experience": ["hands-on", "unique", "cultural"],
  };

  return tagMap[category] || [category];
}

/**
 * Generate match reason from category and slot type
 */
function generateMatchReason(category: string, slotType: string): string {
  const reasons: Record<string, Record<string, string>> = {
    morning: {
      temple: "Temples are best visited in the peaceful morning hours",
      shrine: "Beat the crowds with an early shrine visit",
      park: "Perfect for a refreshing morning walk",
      market: "Morning markets offer the freshest goods",
      default: "Great way to start the day",
    },
    afternoon: {
      museum: "Ideal for indoor exploration during afternoon heat",
      landmark: "Good lighting for photography",
      neighborhood: "Perfect time for neighborhood exploration",
      default: "Well-suited for afternoon activities",
    },
    evening: {
      viewpoint: "Stunning sunset and night views",
      neighborhood: "Vibrant evening atmosphere",
      default: "Great evening activity",
    },
  };

  const slotReasons = reasons[slotType] || reasons.afternoon;
  return slotReasons[category] || slotReasons.default;
}

/**
 * Check if category is typically free
 */
function isFreeCategory(category: string): boolean {
  const freeCategories = ["park", "neighborhood", "market", "landmark"];
  return freeCategories.includes(category);
}

/**
 * Get default time range for slot type
 */
function getDefaultTimeRange(slotType: SlotWithOptions["slotType"]): { start: string; end: string } {
  const ranges: Record<string, { start: string; end: string }> = {
    breakfast: { start: "08:00", end: "09:30" },
    morning: { start: "09:00", end: "12:00" },
    lunch: { start: "12:00", end: "14:00" },
    afternoon: { start: "14:00", end: "18:00" },
    dinner: { start: "18:00", end: "20:00" },
    evening: { start: "20:00", end: "22:00" },
  };
  return ranges[slotType] || { start: "09:00", end: "12:00" };
}

/**
 * Default travel tips
 */
function getDefaultTips(): string[] {
  return [
    "Get a JR Pass for Shinkansen and JR trains",
    "Get a Suica or ICOCA card for easy transit payments",
    "Download Google Maps offline for each city",
    "Most shops accept credit cards, but keep some cash for small vendors",
    "Temple visits are best in early morning to avoid crowds",
  ];
}

/**
 * Create mock response for dry run
 */
function createMockResponse(
  cities: string[],
  startDate: string,
  numDays: number
): ItineraryResponse {
  const mockItinerary: StructuredItineraryData = {
    destination: cities.join(", ") + ", Japan",
    country: "Japan",
    days: Array.from({ length: numDays }, (_, i) => ({
      dayNumber: i + 1,
      date: new Date(new Date(startDate).getTime() + i * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
      city: cities[Math.floor(i / Math.ceil(numDays / cities.length))] || cities[0],
      title: `[DRY RUN] Day ${i + 1}`,
      slots: [
        {
          slotId: `day${i + 1}-morning`,
          slotType: "morning" as const,
          timeRange: { start: "09:00", end: "12:00" },
          options: [{
            id: `opt-${i}-1`,
            rank: 1,
            score: 80,
            activity: {
              name: "[DRY RUN] Mock Activity",
              description: "This is a mock activity - LLM calls are disabled",
              category: "attraction" as const,
              duration: 120,
              place: { name: "Mock Place", address: "", neighborhood: "Mock Area", coordinates: { lat: 35.68, lng: 139.75 }, photos: [] },
              isFree: true,
              tags: [],
              source: "ai" as const,
            },
            matchReasons: ["DRY RUN MODE - COMPACT FORMAT"],
            tradeoffs: [],
          }],
          behavior: "flex" as const,
        },
      ],
    })),
    generalTips: ["[DRY RUN] LLM calls are disabled. Set LLM_DRY_RUN=false to enable."],
    estimatedBudget: { total: { min: 0, max: 0 }, currency: "JPY" },
  };

  return {
    itinerary: mockItinerary,
    message: "[DRY RUN] Compact format - check console for request details and token savings estimate.",
    metadata: {
      generatedAt: new Date().toISOString(),
      provider: "llm",
      source: "dry-run-compact",
      totalDays: numDays,
      totalSlots: numDays,
      totalOptions: numDays,
      cities,
    },
  };
}

// ============================================
// TOKEN COMPARISON UTILITY
// ============================================

/**
 * Estimate token count for a string (rough approximation)
 */
export function estimateTokens(text: string): number {
  // GPT-4 averages ~4 chars per token for English
  return Math.ceil(text.length / 4);
}

/**
 * Compare token usage between compact and standard formats
 */
export function compareTokenUsage(numDays: number): {
  standardEstimate: number;
  compactEstimate: number;
  savingsPercent: number;
} {
  const standardTokensPerDay = 3500;
  const compactTokensPerDay = 1200;
  const standardBase = 3000;
  const compactBase = 500;

  const standardEstimate = standardBase + numDays * standardTokensPerDay;
  const compactEstimate = compactBase + numDays * compactTokensPerDay;
  const savingsPercent = Math.round((1 - compactEstimate / standardEstimate) * 100);

  return {
    standardEstimate,
    compactEstimate,
    savingsPercent,
  };
}

// ============================================
// EXPORTS
// ============================================

export const itineraryServiceCompact = {
  generate: generateCompact,
  getFormat: getItineraryFormat,
  estimateTokens,
  compareTokenUsage,
};

export default itineraryServiceCompact;
