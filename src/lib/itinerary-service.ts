/**
 * Unified Itinerary Service
 *
 * Clean abstraction for itinerary generation.
 * Switches between data-driven (japan-itinerary-generator) and LLM-based generation.
 * Optionally enriches with place resolution and commute calculation.
 *
 * Configuration:
 *   ITINERARY_PROVIDER=llm|data (default: data)
 *   ITINERARY_AI_PROVIDER=openai|ollama|gemini (override for itinerary-specific LLM)
 *   PLACE_RESOLVER_MODE=test|prod (default: follows AI_MODE)
 *
 * Usage:
 *   import { itineraryService } from './itinerary-service';
 *   const result = await itineraryService.generate({ cities: ['tokyo'], startDate: '2025-04-01' });
 */

import { llm, type ChatMessage, type AIProvider } from "./llm";
import { getSystemPrompt } from "./prompts";
import { getValidationDebugLogger } from "./validation-debug-logger";
import type {
  StructuredItineraryData,
  DayWithOptions,
  SlotWithOptions,
  ActivityOption,
  StructuredCommuteInfo,
  ViatorEnhancement,
  ViatorEnhancementType,
} from "@/types/structured-itinerary";

// ============================================
// TYPES
// ============================================

export type ItineraryProvider = "data" | "llm";

/**
 * Activity anchor - a pre-booked activity that must be included in the itinerary
 */
export interface ActivityAnchor {
  name: string;
  city: string;
  date: string; // YYYY-MM-DD
  startTime?: string; // HH:mm
  endTime?: string; // HH:mm
  duration?: number; // minutes
  category?: string;
  isFlexible?: boolean; // If true, time can be adjusted slightly
  notes?: string;
}

export interface ItineraryRequest {
  cities: string[];
  startDate: string;
  daysPerCity?: Record<string, number>;
  totalDays?: number;
  pace?: "relaxed" | "moderate" | "packed";
  interests?: string[];
  includeKlookExperiences?: boolean;
  // LLM-specific options
  userPreferences?: string;
  tripContext?: string;
  travelers?: {
    adults: number;
    children?: number;
    childrenAges?: number[];
  };
  budget?: "budget" | "moderate" | "luxury";

  // Constraints - must-haves and must-avoids
  mustHave?: string[]; // Places/activities that MUST be included
  mustAvoid?: string[]; // Places/activities/types to avoid

  // Activity anchors - pre-booked activities with fixed times
  anchors?: ActivityAnchor[];

  // Flight time constraints - for adjusting first/last day activities
  arrivalFlightTime?: string; // HH:mm - when arriving on first day (e.g., "14:30")
  departureFlightTime?: string; // HH:mm - when departing on last day (e.g., "16:00")
  arrivalAirport?: string; // Airport code (e.g., "NRT")
  departureAirport?: string; // Airport code (e.g., "KIX")

  // Inter-city transfer info (derived from transfer-inference)
  transfers?: Array<{
    type: "airport_arrival" | "airport_departure" | "inter_city" | "same_city";
    date: string;
    fromCity: string;
    toCity: string;
    mode?: string; // "shinkansen", "train", "bus", etc.
    duration?: number; // minutes
  }>;

  // Clustering preference
  clusterByNeighborhood?: boolean; // Group activities geographically (default: true)

  // Hotels/accommodations - for hotel↔activity commute calculation
  hotels?: Array<{
    name: string;
    city: string;
    checkIn: string;  // YYYY-MM-DD
    checkOut: string; // YYYY-MM-DD
    coordinates?: {
      lat: number;
      lng: number;
    };
    address?: string;
  }>;

  // Enrichment options
  enrichWithPlaceResolution?: boolean;
  enrichWithCommute?: boolean;
  placeResolutionOptions?: {
    skipExpensiveProviders?: boolean;
    minConfidence?: number;
  };
}

export interface PlaceResolutionStats {
  totalPlaces: number;
  resolved: number;
  failed: number;
  providers: Record<string, number>;
  avgConfidence: number;
  totalDuration: number;
}

export interface CommuteStats {
  totalCommutes: number;
  avgDuration: number;
  methodCounts: Record<string, number>;
}

export interface ItineraryResponse {
  itinerary: StructuredItineraryData;
  message?: string;
  metadata: {
    generatedAt: string;
    provider: ItineraryProvider;
    source: string;
    totalDays: number;
    totalSlots: number;
    totalOptions: number;
    cities: string[];
    placeResolution?: PlaceResolutionStats;
    commuteCalculation?: CommuteStats;
  };
}

// ============================================
// CONFIGURATION
// ============================================

export function getItineraryProvider(): ItineraryProvider {
  const provider = process.env.ITINERARY_PROVIDER?.toLowerCase();
  if (provider === "llm" || provider === "ai") return "llm";
  return "data";
}

/**
 * Get the AI provider specifically for itinerary generation.
 * Can be overridden via ITINERARY_AI_PROVIDER env var.
 */
export function getItineraryAIProvider(): AIProvider {
  const override = process.env.ITINERARY_AI_PROVIDER?.toLowerCase();
  if (override === "openai") return "openai";
  if (override === "gemini" || override === "google") return "gemini";
  if (override === "ollama") return "ollama";
  // Fall back to global AI_PROVIDER
  const global = process.env.AI_PROVIDER?.toLowerCase();
  if (global === "openai") return "openai";
  if (global === "gemini" || global === "google") return "gemini";
  if (global === "ollama") return "ollama";
  return "openai"; // Default for itinerary
}

export function getItineraryConfig() {
  return {
    provider: getItineraryProvider(),
    aiProvider: getItineraryAIProvider(),
  };
}

// ============================================
// CONSTRAINT HELPERS
// ============================================

/**
 * Build the constraints section for the LLM prompt
 */
function buildConstraintsSection(
  mustHave: string[],
  mustAvoid: string[],
  anchors: ActivityAnchor[],
  clusterByNeighborhood: boolean
): string {
  const sections: string[] = [];

  if (mustHave.length > 0) {
    sections.push(`
MUST-HAVE PLACES (These MUST be included in the itinerary):
${mustHave.map((item, i) => `  ${i + 1}. ${item}`).join("\n")}
- Schedule each at appropriate times based on venue type
- Include as the FIRST option (rank: 1) in their slots
- Mark matchReasons with "User requested: must-visit"`);
  }

  if (mustAvoid.length > 0) {
    sections.push(`
MUST-AVOID (NEVER include these):
${mustAvoid.map((item, i) => `  ${i + 1}. ${item}`).join("\n")}
- Do not suggest any of these places, cuisines, or activity types
- Find alternatives if these are typically popular recommendations`);
  }

  if (anchors.length > 0) {
    sections.push(`
PRE-BOOKED ACTIVITIES (FIXED - do NOT change times):
${anchors.map((a, i) => {
  const timeStr = a.startTime ? ` at ${a.startTime}${a.endTime ? `-${a.endTime}` : ""}` : "";
  const durationStr = a.duration ? ` (${a.duration} min)` : "";
  return `  ${i + 1}. ${a.name} - ${a.city} on ${a.date}${timeStr}${durationStr}${a.notes ? ` [${a.notes}]` : ""}`;
}).join("\n")}
- Insert these at their EXACT specified times
- Set behavior: "anchor" for these slots
- Plan surrounding activities to minimize travel time to/from anchors
- Mark matchReasons with "Pre-booked activity"`);
  }

  if (clusterByNeighborhood) {
    sections.push(`
GEOGRAPHIC CLUSTERING:
- Group activities by neighborhood to minimize travel time
- Morning activities should be near each other in the same area
- Lunch should be walking distance from morning or afternoon activity
- Don't schedule activities that require long cross-city travel back-to-back
- Add clusterId to slots in the same area (e.g., "shibuya-area", "asakusa-area")`);
  }

  return sections.length > 0 ? "\n" + sections.join("\n") : "";
}

/**
 * Validate that constraints were honored in the generated itinerary
 * Logs warnings if constraints were not followed
 */
function validateConstraints(
  itinerary: StructuredItineraryData,
  mustHave: string[],
  mustAvoid: string[],
  anchors: ActivityAnchor[]
): void {
  // Collect all activity names in the itinerary
  const allActivities: string[] = [];
  for (const day of itinerary.days) {
    for (const slot of day.slots) {
      for (const option of slot.options) {
        if (option.activity?.name) {
          allActivities.push(option.activity.name.toLowerCase());
        }
      }
    }
  }

  // Check must-haves are included
  for (const mustHaveItem of mustHave) {
    const found = allActivities.some(
      (name) =>
        name.includes(mustHaveItem.toLowerCase()) ||
        mustHaveItem.toLowerCase().includes(name)
    );
    if (!found) {
      console.warn(
        `[itinerary-service] ⚠️ Must-have "${mustHaveItem}" not found in itinerary`
      );
    }
  }

  // Check must-avoids are NOT included
  for (const mustAvoidItem of mustAvoid) {
    const found = allActivities.some(
      (name) =>
        name.includes(mustAvoidItem.toLowerCase()) ||
        mustAvoidItem.toLowerCase().includes(name)
    );
    if (found) {
      console.warn(
        `[itinerary-service] ⚠️ Must-avoid "${mustAvoidItem}" found in itinerary - constraint violated`
      );
    }
  }

  // Check anchors are included at correct times
  for (const anchor of anchors) {
    const anchorDate = anchor.date;
    const anchorName = anchor.name.toLowerCase();

    // Find the day for this anchor
    const day = itinerary.days.find((d) => d.date === anchorDate);
    if (!day) {
      console.warn(
        `[itinerary-service] ⚠️ Anchor "${anchor.name}" on ${anchorDate} - day not found in itinerary`
      );
      continue;
    }

    // Check if anchor is in any slot
    let foundAnchor = false;
    for (const slot of day.slots) {
      for (const option of slot.options) {
        if (option.activity?.name?.toLowerCase().includes(anchorName)) {
          foundAnchor = true;
          // Check if marked as anchor behavior
          if (slot.behavior !== "anchor") {
            console.warn(
              `[itinerary-service] ⚠️ Anchor "${anchor.name}" found but slot behavior is "${slot.behavior}" instead of "anchor"`
            );
          }
          break;
        }
      }
      if (foundAnchor) break;
    }

    if (!foundAnchor) {
      console.warn(
        `[itinerary-service] ⚠️ Anchor "${anchor.name}" not found in day ${day.dayNumber}`
      );
    }
  }
}

/**
 * Extract significant keywords from a name for matching
 * Filters out common words, short words, and venue type suffixes
 */
function extractSignificantKeywords(name: string): string[] {
  const stopWords = new Set([
    "the", "a", "an", "at", "in", "on", "to", "for", "of", "and", "or", "with",
    "tour", "trip", "visit", "experience", "class", "making", "sunrise", "sunset",
    "morning", "afternoon", "evening", "night", "day", "private", "guided",
    "temple", "shrine", "museum", "park", "castle", "palace", "garden", "market",
    "station", "airport", "hotel", "restaurant", "from", "via"
  ]);

  return name
    .toLowerCase()
    .replace(/[^\w\s-]/g, " ") // Remove punctuation except hyphens
    .split(/[\s-]+/)
    .filter(word =>
      word.length >= 3 && // Must be 3+ chars
      !stopWords.has(word) && // Not a stop word
      !/^\d+$/.test(word) // Not purely numeric
    );
}

/**
 * Calculate how well an activity name matches an anchor name
 * Returns a score from 0 to 100
 */
function calculateAnchorMatchScore(activityName: string, anchorName: string): number {
  const activityLower = activityName.toLowerCase();
  const anchorLower = anchorName.toLowerCase();

  // Direct containment is best match
  if (activityLower.includes(anchorLower) || anchorLower.includes(activityLower)) {
    return 100;
  }

  // Extract significant keywords
  const anchorKeywords = extractSignificantKeywords(anchorName);
  const activityKeywords = extractSignificantKeywords(activityName);

  if (anchorKeywords.length === 0) return 0;

  // Count matching keywords
  let matchedKeywords = 0;
  let significantMatches = 0; // Keywords 5+ chars

  for (const anchorWord of anchorKeywords) {
    const isSignificant = anchorWord.length >= 5;

    // Check for exact match or very close match (start/end)
    const hasMatch = activityKeywords.some(actWord =>
      actWord === anchorWord ||
      (anchorWord.length >= 4 && actWord.includes(anchorWord)) ||
      (actWord.length >= 4 && anchorWord.includes(actWord))
    );

    if (hasMatch) {
      matchedKeywords++;
      if (isSignificant) significantMatches++;
    }
  }

  // Need at least one significant match or multiple small matches
  if (significantMatches === 0 && matchedKeywords < 2) {
    return 0;
  }

  // Calculate score based on keyword overlap
  const keywordRatio = matchedKeywords / anchorKeywords.length;
  return Math.round(keywordRatio * 80) + (significantMatches > 0 ? 20 : 0);
}

/**
 * Inject missing anchors into the generated itinerary
 * If the LLM didn't include an anchor, we add it as a new slot
 */
function injectMissingAnchors(
  itinerary: StructuredItineraryData,
  anchors: ActivityAnchor[]
): StructuredItineraryData {
  if (anchors.length === 0) return itinerary;

  // Create a mutable copy
  const result = JSON.parse(JSON.stringify(itinerary)) as StructuredItineraryData;

  // Minimum score needed to consider it a match
  const MATCH_THRESHOLD = 50;

  for (const anchor of anchors) {
    const anchorDate = anchor.date;

    // Find the day for this anchor
    const dayIndex = result.days.findIndex((d) => d.date === anchorDate);
    if (dayIndex === -1) {
      console.log(
        `[itinerary-service] Anchor "${anchor.name}" on ${anchorDate} - day not found, skipping injection`
      );
      continue;
    }

    const day = result.days[dayIndex];

    // Check if anchor already exists in any slot
    let anchorFound = false;
    let bestMatch: { slot: typeof day.slots[0]; option: typeof day.slots[0]["options"][0]; score: number } | null = null;

    for (const slot of day.slots) {
      for (const option of slot.options) {
        const activityName = option.activity?.name || "";
        const score = calculateAnchorMatchScore(activityName, anchor.name);

        if (score >= MATCH_THRESHOLD) {
          if (!bestMatch || score > bestMatch.score) {
            bestMatch = { slot, option, score };
          }
        }
      }
    }

    if (bestMatch) {
      anchorFound = true;
      // Ensure slot is marked as anchor behavior
      if (bestMatch.slot.behavior !== "anchor") {
        bestMatch.slot.behavior = "anchor";
        console.log(
          `[itinerary-service] ✓ Matched anchor "${anchor.name}" to "${bestMatch.option.activity?.name}" (score: ${bestMatch.score})`
        );
      }
    }

    if (!anchorFound) {
      console.log(
        `[itinerary-service] 📌 Injecting missing anchor "${anchor.name}" into day ${day.dayNumber}`
      );

      // Determine the slot type based on the anchor's start time
      let slotType: SlotWithOptions["slotType"] = "morning";
      if (anchor.startTime) {
        const hour = parseInt(anchor.startTime.split(":")[0], 10);
        if (hour >= 18) slotType = "evening";
        else if (hour >= 14) slotType = "afternoon";
        else if (hour >= 12) slotType = "lunch";
        else if (hour >= 9) slotType = "morning";
        else slotType = "breakfast";
      }

      // Create a new slot for this anchor
      const newSlot = {
        slotId: `day${day.dayNumber}-anchor-${anchor.name.toLowerCase().replace(/\s+/g, "-")}`,
        slotType,
        timeRange: {
          start: anchor.startTime || "09:00",
          end: anchor.endTime || (anchor.duration ? calculateEndTime(anchor.startTime || "09:00", anchor.duration) : "11:00"),
        },
        behavior: "anchor" as const,
        options: [
          {
            id: `opt-anchor-${anchor.name.toLowerCase().replace(/\s+/g, "-")}`,
            rank: 1,
            score: 100,
            activity: {
              name: anchor.name,
              description: anchor.notes || `Pre-booked activity: ${anchor.name}`,
              category: anchor.category || "experience",
              duration: anchor.duration || 120,
              place: {
                name: anchor.name,
                address: "",
                neighborhood: anchor.city || day.city,
                coordinates: { lat: 0, lng: 0 }, // Will be resolved later if place resolution is enabled
                photos: [],
              },
              isFree: false,
              tags: ["pre-booked", "anchor"],
              source: "ai" as const,
            },
            matchReasons: ["Pre-booked activity - fixed time"],
            tradeoffs: [],
          },
        ],
      };

      // Insert the slot at the appropriate position based on time
      let insertIndex = day.slots.length;
      if (anchor.startTime) {
        const anchorHour = parseInt(anchor.startTime.split(":")[0], 10);
        for (let i = 0; i < day.slots.length; i++) {
          const slotStart = day.slots[i].timeRange?.start || "00:00";
          const slotHour = parseInt(slotStart.split(":")[0], 10);
          if (anchorHour < slotHour) {
            insertIndex = i;
            break;
          }
        }
      }

      day.slots.splice(insertIndex, 0, newSlot);
      console.log(
        `[itinerary-service] ✓ Injected anchor "${anchor.name}" at position ${insertIndex} (${slotType} slot)`
      );
    }
  }

  return result;
}

/**
 * Calculate end time given start time and duration in minutes
 */
function calculateEndTime(startTime: string, durationMinutes: number): string {
  const [hours, minutes] = startTime.split(":").map(Number);
  const totalMinutes = hours * 60 + minutes + durationMinutes;
  const endHours = Math.floor(totalMinutes / 60) % 24;
  const endMinutes = totalMinutes % 60;
  return `${endHours.toString().padStart(2, "0")}:${endMinutes.toString().padStart(2, "0")}`;
}

// ============================================
// REMOVE IMPOSSIBLE SLOTS
// ============================================

/**
 * Remove slots that occur before arrival (Day 1) or after departure (last day)
 * These are impossible to do given the flight times.
 */
function removeImpossibleSlots(
  itinerary: StructuredItineraryData,
  arrivalFlightTime?: string,
  departureFlightTime?: string
): StructuredItineraryData {
  if (!arrivalFlightTime && !departureFlightTime) {
    return itinerary;
  }

  console.log(`[itinerary-service] Removing impossible slots (arrival: ${arrivalFlightTime}, departure: ${departureFlightTime})`);

  const result = JSON.parse(JSON.stringify(itinerary)) as StructuredItineraryData;

  // Process Day 1 - remove slots that END before arrival + transfer time
  if (arrivalFlightTime && result.days.length > 0) {
    const day1 = result.days[0];
    const arrivalHour = parseInt(arrivalFlightTime.split(":")[0], 10);
    const arrivalMin = parseInt(arrivalFlightTime.split(":")[1] || "0", 10);

    // Add ~2 hours for immigration, baggage, and airport transfer
    const earliestActivityMins = (arrivalHour * 60 + arrivalMin) + 120;

    const originalSlotCount = day1.slots.length;
    day1.slots = day1.slots.filter(slot => {
      // Always keep travel slots (airport transfer)
      if (slot.behavior === "travel") {
        return true;
      }

      // Check if slot ENDS before earliest possible activity time
      // This removes slots that are completely before arrival
      const slotEnd = slot.timeRange?.end || "23:59";
      const [endHour, endMin] = slotEnd.split(":").map(Number);
      const slotEndMins = endHour * 60 + endMin;

      if (slotEndMins <= earliestActivityMins) {
        console.log(`[itinerary-service] Removing Day 1 slot "${slot.slotType}" (${slot.timeRange?.start}-${slot.timeRange?.end}) - ends before arrival`);
        return false;
      }

      return true;
    });

    const removedCount = originalSlotCount - day1.slots.length;
    if (removedCount > 0) {
      console.log(`[itinerary-service] Removed ${removedCount} impossible slots from Day 1`);
    }
  }

  // Process last day - remove slots that START after latest possible activity time
  if (departureFlightTime && result.days.length > 0) {
    const lastDay = result.days[result.days.length - 1];
    const departureHour = parseInt(departureFlightTime.split(":")[0], 10);
    const departureMin = parseInt(departureFlightTime.split(":")[1] || "0", 10);

    // Need to leave for airport 3 hours before flight
    const latestActivityMins = (departureHour * 60 + departureMin) - 180;

    const originalSlotCount = lastDay.slots.length;
    lastDay.slots = lastDay.slots.filter(slot => {
      // Always keep travel slots (airport transfer)
      if (slot.behavior === "travel") {
        return true;
      }

      // Check if slot STARTS after latest possible activity time
      const slotStart = slot.timeRange?.start || "00:00";
      const [startHour, startMin] = slotStart.split(":").map(Number);
      const slotStartMins = startHour * 60 + startMin;

      if (slotStartMins >= latestActivityMins) {
        console.log(`[itinerary-service] Removing last day slot "${slot.slotType}" (${slot.timeRange?.start}-${slot.timeRange?.end}) - starts after departure prep`);
        return false;
      }

      return true;
    });

    const removedCount = originalSlotCount - lastDay.slots.length;
    if (removedCount > 0) {
      console.log(`[itinerary-service] Removed ${removedCount} impossible slots from last day`);
    }
  }

  return result;
}

// ============================================
// TRANSFER SLOT INJECTION (POST-PROCESSING)
// ============================================

/**
 * Transfer info passed from TripApp (derived from transfer-inference)
 */
interface TransferInfo {
  type: "airport_arrival" | "airport_departure" | "inter_city" | "same_city";
  date: string;
  fromCity: string;
  toCity: string;
  mode?: string;
  duration?: number; // minutes
}

/**
 * Inject transfer slots into the generated itinerary
 * This adds:
 * - Airport → Hotel slot on arrival day (Day 1)
 * - Hotel → Airport slot on departure day (Last day)
 * - Shinkansen/train slots on inter-city transfer days
 *
 * Also considers anchor bookings on transfer days to:
 * - Schedule transfers around fixed anchor times
 * - Warn if anchor timing conflicts with transfer feasibility
 */
function injectTransferSlots(
  itinerary: StructuredItineraryData,
  transfers: TransferInfo[],
  arrivalFlightTime?: string,
  departureFlightTime?: string,
  arrivalAirport?: string,
  departureAirport?: string,
  anchors?: ActivityAnchor[]
): StructuredItineraryData {
  if (!transfers || transfers.length === 0) {
    return itinerary;
  }

  console.log(`[itinerary-service] Injecting ${transfers.length} transfer slots...`);

  // Deep copy
  const result = JSON.parse(JSON.stringify(itinerary)) as StructuredItineraryData;

  for (const transfer of transfers) {
    // Find the day matching this transfer date
    const dayIndex = result.days.findIndex((d) => d.date === transfer.date);
    if (dayIndex === -1) {
      console.log(`[itinerary-service] Transfer date ${transfer.date} not found in itinerary, skipping`);
      continue;
    }

    const day = result.days[dayIndex];
    const durationMins = transfer.duration || 90; // Default 90 mins if not specified

    // Check for anchor bookings on this transfer day
    const dayAnchors = anchors?.filter(a => a.date === transfer.date) || [];
    const originCityAnchors = dayAnchors.filter(a =>
      a.city?.toLowerCase() === transfer.fromCity.toLowerCase()
    );
    const destCityAnchors = dayAnchors.filter(a =>
      a.city?.toLowerCase() === transfer.toCity.toLowerCase()
    );

    if (dayAnchors.length > 0) {
      console.log(`[itinerary-service] Found ${dayAnchors.length} anchors on transfer day ${transfer.date}:`,
        dayAnchors.map(a => `${a.name} (${a.city} @ ${a.startTime || "no time"})`).join(", ")
      );
    }

    if (transfer.type === "airport_arrival") {
      // Airport → Hotel: Insert at beginning of day
      const arrivalTime = arrivalFlightTime || "14:00";
      // Add ~30 mins for immigration/baggage, then transfer duration
      const transferStartTime = calculateEndTime(arrivalTime, 30);
      const transferEndTime = calculateEndTime(transferStartTime, durationMins);

      const arrivalSlot: SlotWithOptions = {
        slotId: `day${day.dayNumber}-arrival-transfer`,
        slotType: "morning", // Will be first slot
        timeRange: {
          start: transferStartTime,
          end: transferEndTime,
        },
        behavior: "travel" as const,
        options: [{
          id: `opt-arrival-transfer`,
          rank: 1,
          score: 100,
          activity: {
            name: `Airport → Hotel Transfer`,
            description: `Transfer from ${arrivalAirport || "airport"} to hotel in ${transfer.toCity}. ${transfer.mode ? `Via ${transfer.mode}` : ""}`,
            category: "transport",
            duration: durationMins,
            place: {
              name: arrivalAirport || "Airport",
              address: "",
              neighborhood: transfer.toCity,
              coordinates: { lat: 0, lng: 0 },
              photos: [],
            },
            isFree: false,
            tags: ["transfer", "airport", "arrival"],
            source: "ai" as const,
          },
          matchReasons: ["Airport arrival transfer"],
          tradeoffs: [],
        }],
      };

      // Insert at the beginning
      day.slots.unshift(arrivalSlot);
      console.log(`[itinerary-service] ✓ Injected airport arrival transfer on day ${day.dayNumber}`);

    } else if (transfer.type === "airport_departure") {
      // Hotel → Airport: Insert at end of day
      const departureTime = departureFlightTime || "16:00";
      // Need to arrive 2-3 hours before flight
      const latestArrivalTime = calculateEndTime(departureTime, -180);
      // Transfer starts based on duration
      const transferStartTime = calculateEndTime(latestArrivalTime, -durationMins);

      const departureSlot: SlotWithOptions = {
        slotId: `day${day.dayNumber}-departure-transfer`,
        slotType: "afternoon",
        timeRange: {
          start: transferStartTime,
          end: latestArrivalTime,
        },
        behavior: "travel" as const,
        options: [{
          id: `opt-departure-transfer`,
          rank: 1,
          score: 100,
          activity: {
            name: `Hotel → Airport Transfer`,
            description: `Transfer from hotel to ${departureAirport || "airport"}. Flight departs at ${departureFlightTime || "TBD"}. ${transfer.mode ? `Via ${transfer.mode}` : ""}`,
            category: "transport",
            duration: durationMins,
            place: {
              name: departureAirport || "Airport",
              address: "",
              neighborhood: transfer.fromCity,
              coordinates: { lat: 0, lng: 0 },
              photos: [],
            },
            isFree: false,
            tags: ["transfer", "airport", "departure"],
            source: "ai" as const,
          },
          matchReasons: ["Airport departure transfer"],
          tradeoffs: [],
        }],
      };

      // Insert at the end
      day.slots.push(departureSlot);
      console.log(`[itinerary-service] ✓ Injected airport departure transfer on day ${day.dayNumber}`);

    } else if (transfer.type === "inter_city") {
      // Inter-city Shinkansen: Need to consider anchors
      const modeDisplay = transfer.mode === "shinkansen" ? "Shinkansen" : (transfer.mode || "Train");

      // Default timing: leave at 10:00 after hotel checkout
      let transferStartTime = "10:00";
      let transferEndTime = calculateEndTime(transferStartTime, durationMins);

      // Check for anchors in DESTINATION city - we need to arrive before these
      if (destCityAnchors.length > 0) {
        const earliestDestAnchor = destCityAnchors
          .filter(a => a.startTime)
          .sort((a, b) => (a.startTime || "23:59").localeCompare(b.startTime || "23:59"))[0];

        if (earliestDestAnchor?.startTime) {
          // Need to arrive before anchor, with buffer for check-in and transit
          const anchorHour = parseInt(earliestDestAnchor.startTime.split(":")[0], 10);
          const anchorMin = parseInt(earliestDestAnchor.startTime.split(":")[1] || "0", 10);

          // Calculate latest arrival: anchor time - 60 mins buffer (for hotel check-in, local transit)
          const latestArrivalMins = (anchorHour * 60 + anchorMin) - 60;

          // Calculate required departure time: arrival - transfer duration
          const requiredDepartureMins = latestArrivalMins - durationMins;

          if (requiredDepartureMins < 7 * 60) { // Before 7:00 AM
            console.warn(`[itinerary-service] ⚠️ Anchor "${earliestDestAnchor.name}" at ${earliestDestAnchor.startTime} in ${transfer.toCity} may conflict with transfer - would need to leave before 7:00 AM`);
            // Still schedule early transfer, but warn
            transferStartTime = "07:00";
          } else {
            const depHours = Math.floor(requiredDepartureMins / 60);
            const depMins = requiredDepartureMins % 60;
            transferStartTime = `${depHours.toString().padStart(2, "0")}:${depMins.toString().padStart(2, "0")}`;
            console.log(`[itinerary-service] Adjusted transfer to ${transferStartTime} to arrive before "${earliestDestAnchor.name}" at ${earliestDestAnchor.startTime}`);
          }

          transferEndTime = calculateEndTime(transferStartTime, durationMins);
        }
      }

      // Check for anchors in ORIGIN city - we need to leave after these
      if (originCityAnchors.length > 0) {
        const latestOriginAnchor = originCityAnchors
          .filter(a => a.startTime)
          .sort((a, b) => (b.startTime || "00:00").localeCompare(a.startTime || "00:00"))[0];

        if (latestOriginAnchor?.startTime) {
          const anchorEndTime = latestOriginAnchor.endTime ||
            calculateEndTime(latestOriginAnchor.startTime, latestOriginAnchor.duration || 120);

          // Departure should be after anchor ends + 30 min buffer
          const anchorEndHour = parseInt(anchorEndTime.split(":")[0], 10);
          const anchorEndMin = parseInt(anchorEndTime.split(":")[1] || "0", 10);
          const earliestDepartureMins = (anchorEndHour * 60 + anchorEndMin) + 30;

          const currentDepartureMins = parseInt(transferStartTime.split(":")[0], 10) * 60 +
            parseInt(transferStartTime.split(":")[1] || "0", 10);

          if (earliestDepartureMins > currentDepartureMins) {
            const depHours = Math.floor(earliestDepartureMins / 60);
            const depMins = earliestDepartureMins % 60;
            transferStartTime = `${depHours.toString().padStart(2, "0")}:${depMins.toString().padStart(2, "0")}`;
            transferEndTime = calculateEndTime(transferStartTime, durationMins);
            console.log(`[itinerary-service] Delayed transfer to ${transferStartTime} to accommodate "${latestOriginAnchor.name}" in ${transfer.fromCity}`);
          }

          // Check if this conflicts with destination anchors
          if (destCityAnchors.length > 0) {
            const earliestDestAnchor = destCityAnchors
              .filter(a => a.startTime)
              .sort((a, b) => (a.startTime || "23:59").localeCompare(b.startTime || "23:59"))[0];

            if (earliestDestAnchor?.startTime) {
              const arrivalMins = parseInt(transferEndTime.split(":")[0], 10) * 60 +
                parseInt(transferEndTime.split(":")[1] || "0", 10);
              const destAnchorMins = parseInt(earliestDestAnchor.startTime.split(":")[0], 10) * 60 +
                parseInt(earliestDestAnchor.startTime.split(":")[1] || "0", 10);

              if (arrivalMins + 60 > destAnchorMins) { // Adding 60 min buffer
                console.warn(`[itinerary-service] ⚠️ CONFLICT: Anchor "${latestOriginAnchor.name}" in ${transfer.fromCity} and "${earliestDestAnchor.name}" in ${transfer.toCity} - impossible to do both with ${durationMins} min transfer`);
              }
            }
          }
        }
      }

      const transferSlot: SlotWithOptions = {
        slotId: `day${day.dayNumber}-intercity-transfer`,
        slotType: "morning",
        timeRange: {
          start: transferStartTime,
          end: transferEndTime,
        },
        behavior: "travel" as const,
        options: [{
          id: `opt-intercity-transfer-${transfer.fromCity}-${transfer.toCity}`,
          rank: 1,
          score: 100,
          activity: {
            name: `${modeDisplay}: ${transfer.fromCity} → ${transfer.toCity}`,
            description: `${modeDisplay} from ${transfer.fromCity} to ${transfer.toCity}. Approximate travel time: ${Math.round(durationMins / 60)}h ${durationMins % 60}m. Check out of hotel before departure.`,
            category: "transport",
            duration: durationMins,
            place: {
              name: `${transfer.fromCity} Station`,
              address: "",
              neighborhood: transfer.fromCity,
              coordinates: { lat: 0, lng: 0 },
              photos: [],
            },
            isFree: false,
            estimatedCost: transfer.mode === "shinkansen" ? { amount: 14000, currency: "JPY" } : undefined,
            tags: ["transfer", "shinkansen", "intercity", modeDisplay.toLowerCase()],
            source: "ai" as const,
          },
          matchReasons: [`Inter-city transfer to ${transfer.toCity}`],
          tradeoffs: [],
        }],
      };

      // Insert at the appropriate position based on transfer start time
      let insertIndex = 0;
      const transferStartHour = parseInt(transferStartTime.split(":")[0], 10);

      for (let i = 0; i < day.slots.length; i++) {
        const slotStart = day.slots[i].timeRange?.start || "00:00";
        const slotHour = parseInt(slotStart.split(":")[0], 10);
        if (transferStartHour <= slotHour) {
          insertIndex = i;
          break;
        }
        insertIndex = i + 1;
      }

      day.slots.splice(insertIndex, 0, transferSlot);
      console.log(`[itinerary-service] ✓ Injected ${modeDisplay} transfer ${transfer.fromCity}→${transfer.toCity} at ${transferStartTime} on day ${day.dayNumber}`);
    }
  }

  return result;
}

// ============================================
// DATA PROVIDER (japan-itinerary-generator)
// ============================================

async function generateFromData(
  request: ItineraryRequest
): Promise<ItineraryResponse> {
  // Dynamic import to avoid circular dependencies
  const { generateJapanItinerary } = await import("./japan-itinerary-generator");

  const itinerary = await generateJapanItinerary({
    cities: request.cities,
    startDate: request.startDate,
    daysPerCity: request.daysPerCity,
    totalDays: request.totalDays,
    pace: request.pace,
    interests: request.interests,
    includeKlookExperiences: request.includeKlookExperiences,
  });

  const totalSlots = itinerary.days.reduce((sum, d) => sum + d.slots.length, 0);
  const totalOptions = itinerary.days.reduce(
    (sum, d) => sum + d.slots.reduce((s, slot) => s + slot.options.length, 0),
    0
  );

  return {
    itinerary,
    metadata: {
      generatedAt: new Date().toISOString(),
      provider: "data",
      source: "japan-data-service",
      totalDays: itinerary.days.length,
      totalSlots,
      totalOptions,
      cities: itinerary.days.reduce((acc, d) => {
        if (!acc.includes(d.city)) acc.push(d.city);
        return acc;
      }, [] as string[]),
    },
  };
}

// ============================================
// LLM PROVIDER
// ============================================

async function generateFromLLM(
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
    // Flight time constraints
    arrivalFlightTime,
    departureFlightTime,
    arrivalAirport,
    departureAirport,
    // Inter-city transfers
    transfers = [],
    // Hotels/accommodations
    hotels = [],
  } = request;

  // Calculate number of days
  let numDays = totalDays || 0;
  if (!numDays && daysPerCity) {
    numDays = Object.values(daysPerCity).reduce((sum, d) => sum + d, 0);
  }
  if (!numDays) {
    numDays = cities.length * 2; // Default 2 days per city
  }

  // Build traveler info
  const travelerInfo = travelers
    ? `${travelers.adults} adult${travelers.adults > 1 ? "s" : ""}${travelers.children ? `, ${travelers.children} child${travelers.children > 1 ? "ren" : ""}` : ""}`
    : "2 adults";

  // Build constraints section
  const constraintsSection = buildConstraintsSection(mustHave, mustAvoid, anchors, clusterByNeighborhood);

  // Build flight and transfer day constraints for LLM
  // This tells LLM to adjust day structure - we'll inject actual transfer slots in post-processing
  let flightAndTransferSection = "";
  const flightTransferNotes: string[] = [];

  if (arrivalFlightTime) {
    const arrivalHour = parseInt(arrivalFlightTime.split(":")[0], 10);
    let guidance = "";
    if (arrivalHour >= 18) {
      guidance = "Day 1: ARRIVAL ONLY - Skip all activities except optional dinner near hotel";
    } else if (arrivalHour >= 14) {
      guidance = "Day 1: Skip morning/lunch - Start with late afternoon activity near hotel";
    } else if (arrivalHour >= 11) {
      guidance = "Day 1: Skip morning - Start with lunch, then afternoon activities";
    } else {
      guidance = "Day 1: Early arrival - Full day possible but keep activities light (jet lag)";
    }
    flightTransferNotes.push(`ARRIVAL: Flight lands at ${arrivalFlightTime}${arrivalAirport ? ` at ${arrivalAirport}` : ""}\n  → ${guidance}`);
  }

  if (departureFlightTime) {
    const departureHour = parseInt(departureFlightTime.split(":")[0], 10);
    let guidance = "";
    if (departureHour <= 10) {
      guidance = `Day ${numDays}: NO activities - Early morning airport transfer only`;
    } else if (departureHour <= 13) {
      guidance = `Day ${numDays}: Skip all activities - Hotel checkout and head to airport`;
    } else if (departureHour <= 16) {
      guidance = `Day ${numDays}: Light morning only (near hotel) - Head to airport by noon`;
    } else {
      guidance = `Day ${numDays}: Morning + early lunch okay - Head to airport by 2pm`;
    }
    flightTransferNotes.push(`DEPARTURE: Flight departs at ${departureFlightTime}${departureAirport ? ` from ${departureAirport}` : ""}\n  → ${guidance}`);
  }

  // Add inter-city transfer day guidance
  const interCityTransfers = transfers.filter(t => t.type === "inter_city");
  for (const transfer of interCityTransfers) {
    const modeStr = transfer.mode || "Shinkansen";
    const durationHours = transfer.duration ? Math.round(transfer.duration / 60) : 2;
    flightTransferNotes.push(`TRANSFER DAY (${transfer.date}): ${transfer.fromCity} → ${transfer.toCity} via ${modeStr} (~${durationHours}h)
  → Morning: Hotel checkout in ${transfer.fromCity}, light activity or straight to station
  → Afternoon/Evening: Activities in ${transfer.toCity} after arrival`);
  }

  if (flightTransferNotes.length > 0) {
    flightAndTransferSection = `
FLIGHT & TRANSFER DAY ADJUSTMENTS:
${flightTransferNotes.map(note => `• ${note}`).join("\n")}

NOTE: Transfer slots (airport↔hotel, Shinkansen) will be added automatically - just plan activities around them.`;
  }

  // Get the system prompt
  const systemPrompt = getSystemPrompt("itineraryGeneration");

  // Build hotels section for prompt
  let hotelsSection = "";
  if (hotels && hotels.length > 0) {
    const hotelsList = hotels.map(h =>
      `  - ${h.name} in ${h.city} (${h.checkIn} to ${h.checkOut})`
    ).join("\n");
    hotelsSection = `
HOTELS/ACCOMMODATIONS (User's pre-booked hotels):
${hotelsList}
- Use these hotels for hotel↔activity commute planning
- First activity each day should consider proximity to that night's hotel
- Last activity each day should allow reasonable time to return to hotel`;
  }

  const userPrompt = `Generate a ${numDays}-day travel itinerary for Japan.

TRIP DETAILS:
- Cities: ${cities.join(", ")}
- Start Date: ${startDate}
- Days per city: ${daysPerCity ? JSON.stringify(daysPerCity) : `${Math.floor(numDays / cities.length)} days each`}
- Pace: ${pace}
- Travelers: ${travelerInfo}
- Budget: ${budget}
- Interests: ${interests.length > 0 ? interests.join(", ") : "general sightseeing, local food, culture"}
${userPreferences ? `- Preferences: ${userPreferences}` : ""}
${tripContext ? `- Context: ${tripContext}` : ""}
${constraintsSection}
${flightAndTransferSection}
${hotelsSection}

REQUIREMENTS:
1. Generate exactly ${numDays} days
2. Each day needs: morning, lunch, afternoon, dinner slots (evening optional for moderate/packed pace)
3. Provide 2-3 ranked OPTIONS for each slot
4. Use REAL venue names with approximate coordinates for Japan locations
5. Include city transitions (Shinkansen) when changing cities
6. Match the ${pace} pace appropriately
${mustHave.length > 0 ? `7. MUST include these as rank 1 options: ${mustHave.join(", ")}` : ""}
${mustAvoid.length > 0 ? `8. NEVER include: ${mustAvoid.join(", ")}` : ""}
${anchors.length > 0 ? `9. Insert pre-booked activities at their exact times with behavior: "anchor"` : ""}
${clusterByNeighborhood ? `10. Group activities by neighborhood to minimize travel time` : ""}

Return valid JSON matching the StructuredItineraryData format.`;

  try {
    // Calculate appropriate token limit based on itinerary size
    // A full day with 5 slots × 3 options each = ~15 activities per day
    // Each activity with full details ≈ 200 tokens
    // Plus day structure, slot structure = ~3500 tokens per day
    const tokensPerDay = 3500;
    const baseTokens = 3000; // For destination, tips, budget, etc.
    const calculatedMaxTokens = Math.min(32000, baseTokens + (numDays * tokensPerDay));

    console.log(`[itinerary-service] Generating ${numDays}-day itinerary via ${aiProvider} for ${cities.join(", ")} (maxTokens: ${calculatedMaxTokens})`);
    if (mustHave.length > 0) console.log(`[itinerary-service] Must-have: ${mustHave.join(", ")}`);
    if (mustAvoid.length > 0) console.log(`[itinerary-service] Must-avoid: ${mustAvoid.join(", ")}`);
    if (anchors.length > 0) console.log(`[itinerary-service] Anchors: ${anchors.map(a => a.name).join(", ")}`);

    // DRY RUN MODE - Log the full request without making the API call
    const isDryRun = process.env.LLM_DRY_RUN === 'true';
    if (isDryRun) {
      console.log('\n' + '='.repeat(80));
      console.log('[DRY RUN] LLM call disabled - showing request details only');
      console.log('='.repeat(80));
      console.log('\n[DRY RUN] SYSTEM PROMPT:');
      console.log('-'.repeat(40));
      console.log(systemPrompt);
      console.log('\n[DRY RUN] USER PROMPT:');
      console.log('-'.repeat(40));
      console.log(userPrompt);
      console.log('\n[DRY RUN] REQUEST CONFIG:');
      console.log('-'.repeat(40));
      console.log(JSON.stringify({
        provider: aiProvider,
        model: 'gpt-4o-mini',
        temperature: 0.7,
        maxTokens: calculatedMaxTokens,
        jsonMode: true,
        numDays,
        cities,
        startDate,
        travelers: travelerInfo,
        budget,
        pace,
        interests,
        mustHave,
        mustAvoid,
        anchors: anchors.map(a => ({
          name: a.name,
          city: a.city,
          date: a.date,
          startTime: a.startTime,
          endTime: a.endTime,
        })),
      }, null, 2));
      console.log('='.repeat(80) + '\n');

      // Return a mock response
      const mockItinerary: StructuredItineraryData = {
        destination: cities.join(", ") + ", Japan",
        country: "Japan",
        days: Array.from({ length: numDays }, (_, i) => ({
          dayNumber: i + 1,
          date: new Date(new Date(startDate).getTime() + i * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          city: cities[Math.floor(i / Math.ceil(numDays / cities.length))] || cities[0],
          title: `[DRY RUN] Day ${i + 1}`,
          slots: [
            {
              slotId: `day${i + 1}-morning`,
              slotType: 'morning',
              timeRange: { start: '09:00', end: '12:00' },
              options: [{
                id: `opt-${i}-1`,
                rank: 1,
                score: 80,
                activity: {
                  name: '[DRY RUN] Mock Activity',
                  description: 'This is a mock activity - LLM calls are disabled',
                  category: 'attraction',
                  duration: 120,
                  place: { name: 'Mock Place', address: '', neighborhood: 'Mock Area', coordinates: { lat: 35.68, lng: 139.75 }, photos: [] },
                  isFree: true,
                  tags: [],
                  source: 'ai' as const,
                },
                matchReasons: ['DRY RUN MODE'],
                tradeoffs: [],
              }],
              behavior: 'flex',
            },
          ],
        })),
        generalTips: ['[DRY RUN] LLM calls are disabled. Set LLM_DRY_RUN=false to enable.'],
        estimatedBudget: { total: { min: 0, max: 0 }, currency: 'JPY' },
      };

      return {
        itinerary: mockItinerary,
        message: '[DRY RUN] LLM calls disabled - this is a mock itinerary. Check console for full request details.',
        metadata: {
          generatedAt: new Date().toISOString(),
          provider: 'llm',
          source: `dry-run-${aiProvider}`,
          totalDays: numDays,
          totalSlots: numDays,
          totalOptions: numDays,
          cities,
        },
      };
    }

    // Use the unified llm.chat() with provider override
    const messages: ChatMessage[] = [{ role: "user", content: userPrompt }];

    // Capture LLM request for debugging
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

    // Parse the response with robust JSON extraction
    let parseErrors: string[] = [];
    let parsed: Partial<StructuredItineraryData>;
    try {
      parsed = parseJsonResponse(response) as Partial<StructuredItineraryData>;
    } catch (parseError) {
      parseErrors.push(parseError instanceof Error ? parseError.message : String(parseError));
      parsed = {};
    }

    // Capture LLM response for debugging
    debugLogger.captureLLMResponse(
      response,
      parsed,
      parseErrors.length > 0 ? parseErrors : undefined,
      processingTimeMs
    );

    // Normalize and validate the response
    let itinerary = normalizeItinerary(parsed, cities, startDate, numDays, anchors, request.hotels);

    // Inject any missing anchors that the LLM didn't include
    if (anchors.length > 0) {
      itinerary = injectMissingAnchors(itinerary, anchors);
    }

    // Inject transfer slots (airport→hotel, hotel→airport, Shinkansen)
    if (transfers.length > 0) {
      itinerary = injectTransferSlots(
        itinerary,
        transfers,
        arrivalFlightTime,
        departureFlightTime,
        arrivalAirport,
        departureAirport,
        anchors // Pass anchors for transfer day conflict detection
      );
    }

    // Remove impossible slots on arrival/departure days (before arrival, after departure prep)
    itinerary = removeImpossibleSlots(itinerary, arrivalFlightTime, departureFlightTime);

    // Validate constraints were honored
    validateConstraints(itinerary, mustHave, mustAvoid, anchors);

    const totalSlots = itinerary.days.reduce((sum, d) => sum + d.slots.length, 0);
    const totalOptions = itinerary.days.reduce(
      (sum, d) => sum + d.slots.reduce((s, slot) => s + slot.options.length, 0),
      0
    );

    return {
      itinerary,
      metadata: {
        generatedAt: new Date().toISOString(),
        provider: "llm",
        source: `llm-${aiProvider}`,
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
    console.error("[itinerary-service] LLM error:", error);
    console.log("[itinerary-service] Falling back to data provider");
    return generateFromData(request);
  }
}

// ============================================
// JSON PARSING HELPERS
// ============================================

/**
 * Robustly parse JSON response from LLM
 * Handles common issues like:
 * - Markdown code blocks around JSON
 * - Single quotes instead of double quotes
 * - Trailing commas
 * - Unescaped special characters
 */
function parseJsonResponse(response: string): unknown {
  // Step 1: Extract JSON from markdown code blocks if present
  let content = response;

  // Try to find JSON in code blocks: ```json ... ``` or ``` ... ```
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    content = codeBlockMatch[1].trim();
  } else {
    // Try to find JSON between braces (find the outermost { ... })
    const firstBrace = content.indexOf("{");
    const lastBrace = content.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      content = content.substring(firstBrace, lastBrace + 1);
    }
  }

  // Step 2: Try parsing directly first
  try {
    return JSON.parse(content);
  } catch (firstError) {
    console.log("[itinerary-service] Direct JSON parse failed, attempting repair...");

    // Step 3: Attempt to repair common JSON issues
    let repaired = content;

    // Remove any leading/trailing whitespace or newlines
    repaired = repaired.trim();

    // Fix trailing commas before } or ]
    repaired = repaired.replace(/,(\s*[}\]])/g, "$1");

    // Fix single quotes used instead of double quotes (careful with apostrophes in text)
    // Only replace single quotes that appear to be JSON delimiters
    // This regex matches: 'key': or : 'value' or ['item']
    repaired = repaired.replace(/:\s*'([^']*?)'/g, ': "$1"');
    repaired = repaired.replace(/'(\w+)':/g, '"$1":');

    // Fix unescaped newlines in strings (replace with \n)
    repaired = repaired.replace(/\n/g, "\\n");
    repaired = repaired.replace(/\\n\\n/g, "\\n"); // Clean up double newlines
    repaired = repaired.replace(/\\n\s*\\n/g, "\\n");

    // Restore actual newlines between JSON properties (not inside strings)
    repaired = repaired.replace(/\\n(\s*["\]}])/g, "\n$1");
    repaired = repaired.replace(/([{\[,])\\n(\s*")/g, "$1\n$2");

    // Try parsing the repaired JSON
    try {
      return JSON.parse(repaired);
    } catch (secondError) {
      // Step 4: More aggressive repair - try to find valid JSON structure
      console.log("[itinerary-service] Repair attempt failed, trying more aggressive extraction...");

      // Try to extract just the "days" array which is the critical part
      const daysMatch = content.match(/"days"\s*:\s*\[([\s\S]*?)\](?=\s*[,}])/);
      if (daysMatch) {
        try {
          const daysArray = JSON.parse(`[${daysMatch[1]}]`);
          console.log("[itinerary-service] Extracted days array successfully");
          return { days: daysArray };
        } catch {
          // Continue to throw original error
        }
      }

      // If all repair attempts fail, throw with helpful error info
      const errorMsg = firstError instanceof Error ? firstError.message : "Unknown error";
      const position = errorMsg.match(/position (\d+)/);
      if (position) {
        const pos = parseInt(position[1], 10);
        const context = content.substring(Math.max(0, pos - 50), Math.min(content.length, pos + 50));
        console.error(`[itinerary-service] JSON error near position ${pos}: ...${context}...`);
      }

      throw firstError;
    }
  }
}

// ============================================
// NORMALIZATION HELPERS
// ============================================

function normalizeItinerary(
  parsed: Partial<StructuredItineraryData>,
  cities: string[],
  startDate: string,
  numDays: number,
  anchors: ActivityAnchor[] = [],
  hotels?: ItineraryRequest["hotels"]
): StructuredItineraryData {
  const days: DayWithOptions[] = [];
  let currentDate = new Date(startDate);

  // Handle days array
  const parsedDays = parsed.days || [];

  for (let i = 0; i < numDays; i++) {
    const parsedDay = parsedDays[i];
    const dateStr = currentDate.toISOString().split("T")[0];

    // Determine city for this day
    let cityForDay = cities[0];
    if (parsedDay?.city) {
      cityForDay = parsedDay.city;
    } else {
      // Distribute days across cities
      const daysPerCity = Math.ceil(numDays / cities.length);
      const cityIndex = Math.floor(i / daysPerCity);
      cityForDay = cities[Math.min(cityIndex, cities.length - 1)];
    }

    // Find hotel for this day based on check-in/check-out dates
    let accommodation: DayWithOptions["accommodation"] = undefined;
    if (hotels && hotels.length > 0) {
      const hotelForDay = hotels.find(hotel => {
        const checkIn = new Date(hotel.checkIn);
        const checkOut = new Date(hotel.checkOut);
        const dayDate = new Date(dateStr);
        // Day is covered if: checkIn <= dayDate < checkOut
        return dayDate >= checkIn && dayDate < checkOut;
      });

      if (hotelForDay) {
        accommodation = {
          name: hotelForDay.name,
          address: hotelForDay.address || "",
          neighborhood: hotelForDay.city,
          coordinates: hotelForDay.coordinates || { lat: 0, lng: 0 },
        };
      }
    }

    const day: DayWithOptions = {
      dayNumber: i + 1,
      date: dateStr,
      city: cityForDay,
      title: parsedDay?.title || `Day ${i + 1} in ${cityForDay}`,
      slots: normalizeSlots(parsedDay?.slots || [], i + 1),
      accommodation,
    };

    days.push(day);
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return {
    destination: cities.length > 1 ? "Japan" : cities[0],
    country: "Japan",
    days,
    generalTips: parsed.generalTips || getDefaultTips(),
    estimatedBudget: parsed.estimatedBudget || {
      total: { min: 50000, max: 100000 },
      currency: "JPY",
    },
  };
}

function normalizeSlots(
  parsedSlots: Partial<SlotWithOptions>[],
  dayNumber: number
): SlotWithOptions[] {
  const slotTypes: SlotWithOptions["slotType"][] = [
    "morning",
    "lunch",
    "afternoon",
    "dinner",
  ];

  const slots: SlotWithOptions[] = [];

  for (const slotType of slotTypes) {
    const existingSlot = parsedSlots.find((s) => s.slotType === slotType);

    if (existingSlot) {
      slots.push({
        slotId: existingSlot.slotId || `day${dayNumber}-${slotType}`,
        slotType,
        timeRange: existingSlot.timeRange || getDefaultTimeRange(slotType),
        options: normalizeOptions(existingSlot.options || [], dayNumber, slotType),
        selectedOptionId: existingSlot.selectedOptionId,
        behavior: existingSlot.behavior || (slotType === "lunch" || slotType === "dinner" ? "meal" : "flex"),
      });
    } else {
      // Create empty slot
      slots.push({
        slotId: `day${dayNumber}-${slotType}`,
        slotType,
        timeRange: getDefaultTimeRange(slotType),
        options: [],
        behavior: slotType === "lunch" || slotType === "dinner" ? "meal" : "flex",
      });
    }
  }

  return slots;
}

function normalizeOptions(
  parsedOptions: Partial<ActivityOption>[],
  dayNumber: number,
  slotType: string
): ActivityOption[] {
  return parsedOptions.map((opt, index) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const activity = (opt.activity || {}) as any;

    return {
      id: opt.id || `llm-day${dayNumber}-${slotType}-${index}`,
      rank: opt.rank || index + 1,
      score: opt.score || 80 - index * 10,
      activity: {
        name: activity.name || "Unknown Activity",
        description: activity.description || "",
        category: activity.category || "attraction",
        duration: activity.duration || 90,
        place: {
          name: activity.place?.name || activity.name || "Unknown",
          address: activity.place?.address || "",
          neighborhood: activity.place?.neighborhood || "",
          coordinates: activity.place?.coordinates || { lat: 0, lng: 0 },
          rating: activity.place?.rating,
          reviewCount: activity.place?.reviewCount,
          photos: activity.place?.photos || [],
        },
        isFree: activity.isFree ?? false,
        estimatedCost: activity.estimatedCost,
        tags: activity.tags || [],
        source: "ai",
      },
      matchReasons: opt.matchReasons || ["AI-recommended"],
      tradeoffs: opt.tradeoffs || [],
    };
  });
}

function getDefaultTimeRange(
  slotType: SlotWithOptions["slotType"]
): { start: string; end: string } {
  const ranges: Record<string, { start: string; end: string }> = {
    morning: { start: "09:00", end: "12:00" },
    lunch: { start: "12:00", end: "14:00" },
    afternoon: { start: "14:00", end: "18:00" },
    dinner: { start: "18:00", end: "20:00" },
    evening: { start: "20:00", end: "22:00" },
    breakfast: { start: "08:00", end: "09:30" },
  };
  return ranges[slotType] || { start: "09:00", end: "12:00" };
}

function getDefaultTips(): string[] {
  return [
    "Get a JR Pass for Shinkansen and JR trains",
    "Get a Suica or ICOCA card for easy transit payments",
    "Download Google Maps offline for each city",
    "Most shops accept credit cards, but keep some cash for small vendors",
    "Temple visits are best in early morning to avoid crowds",
  ];
}

// ============================================
// UNIFIED API
// ============================================

/**
 * Generate a complete itinerary with optional enrichment
 */
export async function generate(
  request: ItineraryRequest
): Promise<ItineraryResponse> {
  const provider = getItineraryProvider();

  console.log(`[itinerary-service] Using ${provider} provider for ${request.cities.join(", ")}`);

  // Step 1: Generate base itinerary
  let result: ItineraryResponse;
  switch (provider) {
    case "llm":
      result = await generateFromLLM(request);
      break;
    default:
      result = await generateFromData(request);
  }

  // Step 2: Optional Place Resolution (only for LLM-generated itineraries)
  // Data provider already has verified places
  if (request.enrichWithPlaceResolution && provider === "llm") {
    try {
      const enriched = await enrichWithPlaceResolution(
        result.itinerary,
        request.placeResolutionOptions
      );
      result.itinerary = enriched.itinerary;
      result.metadata.placeResolution = enriched.stats;
    } catch (error) {
      console.error("[itinerary-service] Place resolution failed:", error);
      // Continue with unenriched itinerary
    }
  }

  // Step 3: Optional Commute Calculation
  if (request.enrichWithCommute) {
    try {
      const enriched = await enrichWithCommute(result.itinerary);
      result.itinerary = enriched.itinerary;
      result.metadata.commuteCalculation = enriched.stats;
    } catch (error) {
      console.error("[itinerary-service] Commute calculation failed:", error);
      // Continue without commute data
    }
  }

  // Step 4: Fill empty restaurant slots (for LLM provider)
  // LLM generates activities only, restaurants are filled based on proximity
  if (provider === "llm") {
    try {
      const enriched = await fillRestaurantSlots(result.itinerary);
      result.itinerary = enriched.itinerary;
      console.log(`[itinerary-service] Filled ${enriched.stats.filledSlots} restaurant slots`);

      // Step 5: Recalculate commutes after restaurant filling
      // (since restaurants may have moved to new locations)
      if (enriched.stats.filledSlots > 0) {
        console.log("[itinerary-service] Recalculating commutes after restaurant filling...");
        const commuteResult = await enrichWithCommute(result.itinerary);
        result.itinerary = commuteResult.itinerary;
        result.metadata.commuteCalculation = commuteResult.stats;
      }
    } catch (error) {
      console.error("[itinerary-service] Restaurant filling failed:", error);
      // Continue with empty slots
    }
  }

  return result;
}

// ============================================
// ENRICHMENT: PLACE RESOLUTION
// ============================================

async function enrichWithPlaceResolution(
  itinerary: StructuredItineraryData,
  options?: {
    skipExpensiveProviders?: boolean;
    minConfidence?: number;
  }
): Promise<{
  itinerary: StructuredItineraryData;
  stats: PlaceResolutionStats;
}> {
  // Dynamic import to avoid circular dependencies
  const placeResolver = await import("./place-resolver");

  console.log("[itinerary-service] Enriching with place resolution...");
  const startTime = Date.now();

  const resolutions = await placeResolver.resolveItineraryPlaces(itinerary, {
    skipExpensiveProviders: options?.skipExpensiveProviders ?? true,
    minConfidence: options?.minConfidence ?? 0.5,
  });

  // Build resolution map
  type ResolvedPlaceType = NonNullable<typeof resolutions[number]["resolution"]["resolved"]>;
  const resolutionMap = new Map<string, ResolvedPlaceType>();
  const providers: Record<string, number> = {};
  let totalConfidence = 0;
  let resolvedCount = 0;

  for (const res of resolutions) {
    const key = `${res.dayNumber}-${res.slotId}-${res.optionId}`;
    if (res.resolution.resolved) {
      resolutionMap.set(key, res.resolution.resolved);
      resolvedCount++;
      totalConfidence += res.resolution.resolved.confidence;
      const provider = res.resolution.provider;
      providers[provider] = (providers[provider] || 0) + 1;
    }
  }

  // Apply resolutions to itinerary
  const enrichedDays: DayWithOptions[] = itinerary.days.map((day) => ({
    ...day,
    slots: day.slots.map((slot) => ({
      ...slot,
      options: slot.options.map((option) => {
        const key = `${day.dayNumber}-${slot.slotId}-${option.id}`;
        const resolved = resolutionMap.get(key);

        if (resolved) {
          return {
            ...option,
            activity: {
              ...option.activity,
              place: {
                ...option.activity.place,
                name: resolved.name,
                address: resolved.address,
                neighborhood: resolved.neighborhood,
                coordinates: resolved.coordinates,
                rating: resolved.rating,
                reviewCount: resolved.reviewCount,
                photos: resolved.photos,
                openingHours: resolved.openingHours,
                googlePlaceId: resolved.googlePlaceId,
              },
              source: resolved.source as ActivityOption["activity"]["source"],
            },
          } as ActivityOption;
        }
        return option;
      }),
    })),
  }));

  const totalDuration = Date.now() - startTime;
  console.log(`[itinerary-service] Place resolution: ${resolvedCount}/${resolutions.length} resolved in ${totalDuration}ms`);

  return {
    itinerary: {
      ...itinerary,
      days: enrichedDays,
    },
    stats: {
      totalPlaces: resolutions.length,
      resolved: resolvedCount,
      failed: resolutions.length - resolvedCount,
      providers,
      avgConfidence: resolvedCount > 0 ? totalConfidence / resolvedCount : 0,
      totalDuration,
    },
  };
}

// ============================================
// ENRICHMENT: COMMUTE CALCULATION
// ============================================

interface CommuteResult {
  duration: number;
  distance: number;
  method: string;
  instructions?: string;
}

async function enrichWithCommute(
  itinerary: StructuredItineraryData
): Promise<{
  itinerary: StructuredItineraryData;
  stats: CommuteStats;
}> {
  // Dynamic import to avoid circular dependencies
  const routingService = await import("./routing-service");

  if (!routingService.isRoutingConfigured()) {
    console.log("[itinerary-service] Routing not configured, using distance-based estimation");
  }

  console.log("[itinerary-service] Calculating commute times...");
  const startTime = Date.now();

  let totalCommutes = 0;
  let totalDuration = 0;
  const methodCounts: Record<string, number> = {};

  const enrichedDays: DayWithOptions[] = await Promise.all(
    itinerary.days.map(async (day) => {
      const enrichedSlots: SlotWithOptions[] = [];
      let previousCoords: { lat: number; lng: number } | null = null;

      // Get hotel/accommodation coordinates for this day
      const hotelCoords = day.accommodation?.coordinates;

      // Find first and last activity with valid coordinates
      let firstActivityCoords: { lat: number; lng: number } | null = null;
      let lastActivityCoords: { lat: number; lng: number } | null = null;

      for (const slot of day.slots) {
        const selectedOption = slot.options.find(o => o.id === slot.selectedOptionId) || slot.options[0];
        const coords = selectedOption?.activity?.place?.coordinates;
        if (coords && coords.lat !== 0 && coords.lng !== 0) {
          if (!firstActivityCoords) {
            firstActivityCoords = coords;
          }
          lastActivityCoords = coords;
        }
      }

      // Calculate hotel → first activity commute
      let commuteFromHotel: StructuredCommuteInfo | undefined;
      if (hotelCoords && firstActivityCoords) {
        commuteFromHotel = await calculateCommuteWithFallback(
          routingService,
          hotelCoords,
          firstActivityCoords,
          day.accommodation?.name || "Hotel"
        );
        if (commuteFromHotel) {
          totalCommutes++;
          totalDuration += commuteFromHotel.duration;
          methodCounts[commuteFromHotel.method] = (methodCounts[commuteFromHotel.method] || 0) + 1;
        }
      }

      // Calculate slot-to-slot commutes
      for (const slot of day.slots) {
        const selectedOption = slot.options.find(o => o.id === slot.selectedOptionId) || slot.options[0];
        const currentCoords = selectedOption?.activity?.place?.coordinates;

        let commuteFromPrevious: StructuredCommuteInfo | undefined;

        if (previousCoords && currentCoords && currentCoords.lat !== 0 && currentCoords.lng !== 0) {
          commuteFromPrevious = await calculateCommuteWithFallback(
            routingService,
            previousCoords,
            currentCoords
          );
          if (commuteFromPrevious) {
            totalCommutes++;
            totalDuration += commuteFromPrevious.duration;
            methodCounts[commuteFromPrevious.method] = (methodCounts[commuteFromPrevious.method] || 0) + 1;
          }
        }

        enrichedSlots.push({
          ...slot,
          commuteFromPrevious,
        });

        if (currentCoords && currentCoords.lat !== 0 && currentCoords.lng !== 0) {
          previousCoords = currentCoords;
        }
      }

      // Calculate last activity → hotel commute
      let commuteToHotel: StructuredCommuteInfo | undefined;
      if (hotelCoords && lastActivityCoords) {
        commuteToHotel = await calculateCommuteWithFallback(
          routingService,
          lastActivityCoords,
          hotelCoords,
          undefined,
          day.accommodation?.name || "Hotel"
        );
        if (commuteToHotel) {
          totalCommutes++;
          totalDuration += commuteToHotel.duration;
          methodCounts[commuteToHotel.method] = (methodCounts[commuteToHotel.method] || 0) + 1;
        }
      }

      return {
        ...day,
        slots: enrichedSlots,
        commuteFromHotel,
        commuteToHotel,
      };
    })
  );

  const calcDuration = Date.now() - startTime;
  console.log(`[itinerary-service] Commute calculation: ${totalCommutes} routes in ${calcDuration}ms`);

  return {
    itinerary: {
      ...itinerary,
      days: enrichedDays,
    },
    stats: {
      totalCommutes,
      avgDuration: totalCommutes > 0 ? totalDuration / totalCommutes : 0,
      methodCounts,
    },
  };
}

/**
 * Calculate commute between two points using routing service with fallback
 */
async function calculateCommuteWithFallback(
  routingService: typeof import("./routing-service"),
  from: { lat: number; lng: number },
  to: { lat: number; lng: number },
  fromLabel?: string,
  toLabel?: string
): Promise<StructuredCommuteInfo | undefined> {
  try {
    // Try to get commute duration from routing service (uses Google Maps if available)
    const duration = await routingService.getCommuteDuration(from, to);

    if (duration !== null) {
      // Estimate distance using Haversine formula
      const distance = calculateHaversineDistance(from, to);
      // Determine method based on distance
      const method = distance > 2000 ? "transit" : "walk";

      // Convert duration from seconds to minutes and round to whole number
      const durationMinutes = Math.round(duration / 60);

      // Build instruction text
      let instructions: string;
      if (fromLabel && toLabel) {
        instructions = method === "walk"
          ? `Walk from ${fromLabel} to ${toLabel}`
          : `Take transit from ${fromLabel} to ${toLabel}`;
      } else if (fromLabel) {
        instructions = method === "walk"
          ? `Walk from ${fromLabel}`
          : `Take transit from ${fromLabel}`;
      } else if (toLabel) {
        instructions = method === "walk"
          ? `Walk to ${toLabel}`
          : `Take transit to ${toLabel}`;
      } else {
        instructions = method === "walk"
          ? `Walk ${Math.round(distance / 100) / 10} km`
          : `Take transit (${Math.round(distance / 1000)} km)`;
      }

      return {
        duration: durationMinutes,
        distance: Math.round(distance),
        method: method as StructuredCommuteInfo["method"],
        instructions,
      };
    }
  } catch (error) {
    console.warn(`[itinerary-service] Commute calc failed:`, error);
  }

  // Fallback: use distance-based estimation
  const distance = calculateHaversineDistance(from, to);
  const method = distance > 2000 ? "transit" : "walk";
  const durationMinutes = method === "walk"
    ? Math.round(distance / 80) // ~80m per minute walking
    : Math.round(distance / 500) + 5; // ~500m per minute transit + 5min wait

  return {
    duration: durationMinutes,
    distance: Math.round(distance),
    method: method as StructuredCommuteInfo["method"],
    instructions: method === "walk"
      ? `Walk ${Math.round(distance / 100) / 10} km`
      : `Take transit (${Math.round(distance / 1000)} km)`,
  };
}

/**
 * Calculate distance between two points using Haversine formula
 */
function calculateHaversineDistance(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((from.lat * Math.PI) / 180) *
      Math.cos((to.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get provider info
 */
export function getProviderInfo() {
  const config = getItineraryConfig();
  const descriptions: Record<ItineraryProvider, string> = {
    data: "Pre-curated POI data (fast, deterministic, no API costs)",
    llm: "AI-generated itineraries (flexible, personalized)",
  };

  return {
    provider: config.provider,
    description: descriptions[config.provider],
  };
}

// ============================================
// ENRICHMENT: GEOGRAPHIC CLUSTERING VALIDATION
// ============================================

/**
 * Max walking distance in meters for food to be considered "nearby"
 */
const MAX_WALKING_DISTANCE_METERS = 1500; // ~15-20 min walk

export interface ClusteringStats {
  totalMealSlots: number;
  fixedMealSlots: number;
  violations: ClusteringViolation[];
}

export interface ClusteringViolation {
  dayNumber: number;
  slotType: string;
  activityName: string;
  previousActivityName: string;
  distanceMeters: number;
  fixed: boolean;
  fixedWith?: string;
}

/**
 * Validate and fix geographic clustering issues
 * Focuses on meal slots that are too far from preceding activities
 */
async function validateAndFixClustering(
  itinerary: StructuredItineraryData,
  options?: { autoFix?: boolean }
): Promise<{
  itinerary: StructuredItineraryData;
  stats: ClusteringStats;
}> {
  const autoFix = options?.autoFix ?? true;
  const violations: ClusteringViolation[] = [];
  let fixedCount = 0;
  let totalMealSlots = 0;

  console.log("[itinerary-service] Validating geographic clustering...");

  const fixedDays: DayWithOptions[] = [];

  for (const day of itinerary.days) {
    const fixedSlots: SlotWithOptions[] = [];
    let previousActivityCoords: { lat: number; lng: number } | null = null;
    let previousActivityName = "";

    for (let slotIndex = 0; slotIndex < day.slots.length; slotIndex++) {
      const slot = day.slots[slotIndex];
      const isMealSlot = slot.slotType === "lunch" || slot.slotType === "dinner";

      if (isMealSlot) {
        totalMealSlots++;
      }

      // Get the first option's coordinates (or selected option)
      const selectedOption = slot.options.find(o => o.id === slot.selectedOptionId) || slot.options[0];
      const currentCoords = selectedOption?.activity?.place?.coordinates;

      // Check if this is a meal slot and if it's too far from previous activity
      if (isMealSlot && previousActivityCoords && currentCoords && currentCoords.lat !== 0) {
        const distance = calculateHaversineDistance(previousActivityCoords, currentCoords);

        if (distance > MAX_WALKING_DISTANCE_METERS) {
          const violation: ClusteringViolation = {
            dayNumber: day.dayNumber,
            slotType: slot.slotType,
            activityName: selectedOption?.activity?.name || "Unknown",
            previousActivityName,
            distanceMeters: Math.round(distance),
            fixed: false,
          };

          console.log(
            `[clustering] Violation: Day ${day.dayNumber} ${slot.slotType} "${violation.activityName}" is ${Math.round(distance)}m from "${previousActivityName}"`
          );

          // Try to fix by finding nearby restaurants
          if (autoFix) {
            const fixedSlot = await tryFixMealSlotClustering(
              slot,
              day.city,
              previousActivityCoords,
              previousActivityName
            );

            if (fixedSlot) {
              fixedSlots.push(fixedSlot.slot);
              violation.fixed = true;
              violation.fixedWith = fixedSlot.newRestaurantName;
              fixedCount++;
              console.log(`[clustering] Fixed: Replaced with "${fixedSlot.newRestaurantName}"`);

              // Update previousCoords to the fixed restaurant
              const newCoords = fixedSlot.slot.options[0]?.activity?.place?.coordinates;
              if (newCoords && newCoords.lat !== 0) {
                previousActivityCoords = newCoords;
                previousActivityName = fixedSlot.slot.options[0]?.activity?.name || "";
              }
              violations.push(violation);
              continue;
            }
          }

          violations.push(violation);
        }
      }

      fixedSlots.push(slot);

      // Update previous coordinates for non-meal slots
      if (!isMealSlot && currentCoords && currentCoords.lat !== 0) {
        previousActivityCoords = currentCoords;
        previousActivityName = selectedOption?.activity?.name || "";
      }
    }

    fixedDays.push({
      ...day,
      slots: fixedSlots,
    });
  }

  console.log(
    `[itinerary-service] Clustering validation: ${violations.length} violations, ${fixedCount} fixed`
  );

  return {
    itinerary: {
      ...itinerary,
      days: fixedDays,
    },
    stats: {
      totalMealSlots,
      fixedMealSlots: fixedCount,
      violations,
    },
  };
}

/**
 * Try to fix a meal slot by finding nearby restaurants
 */
async function tryFixMealSlotClustering(
  slot: SlotWithOptions,
  city: string,
  nearCoords: { lat: number; lng: number },
  nearActivityName: string
): Promise<{ slot: SlotWithOptions; newRestaurantName: string } | null> {
  try {
    // Dynamic import to avoid circular dependencies
    const yelpModule = await import("./yelp");

    // Search for restaurants near the previous activity using coordinates
    const nearbyRestaurants = await yelpModule.searchRestaurantsNearby(
      nearCoords.lat,
      nearCoords.lng,
      {
        radius: MAX_WALKING_DISTANCE_METERS,
        limit: 5,
        sortBy: "rating",
      }
    );

    if (!nearbyRestaurants || nearbyRestaurants.length === 0) {
      console.log(`[clustering] No nearby restaurants found for ${city} near ${nearActivityName}`);
      return null;
    }

    // Convert Restaurant results to activity options
    const newOptions: ActivityOption[] = nearbyRestaurants.slice(0, 3).map((restaurant, index) => ({
      id: `yelp-fix-${restaurant.id}`,
      rank: index + 1,
      score: 85 - index * 5,
      activity: {
        name: restaurant.name,
        description: `${restaurant.cuisine?.[0] || "Restaurant"} - ${yelpModule.getPriceDisplay(restaurant.priceLevel)}`,
        category: "restaurant" as const,
        duration: 60,
        place: {
          name: restaurant.name,
          address: restaurant.address || "",
          neighborhood: restaurant.city || city,
          coordinates: {
            lat: restaurant.coordinates?.lat || 0,
            lng: restaurant.coordinates?.lng || 0,
          },
          rating: restaurant.rating,
          reviewCount: restaurant.reviewCount,
          photos: restaurant.imageUrl ? [restaurant.imageUrl] : [],
        },
        isFree: false,
        estimatedCost: {
          amount: restaurant.priceLevel === 1 ? 1000 : restaurant.priceLevel === 2 ? 2000 : restaurant.priceLevel === 3 ? 3500 : 5000,
          currency: "JPY",
        },
        tags: ["restaurant", "nearby-fix"],
        source: "yelp" as const,
      },
      matchReasons: [
        `Near ${nearActivityName}`,
        `${restaurant.rating} rating (${restaurant.reviewCount} reviews)`,
      ],
      tradeoffs: ["Auto-selected for proximity"],
    }));

    if (newOptions.length === 0) {
      return null;
    }

    return {
      slot: {
        ...slot,
        options: newOptions,
        selectedOptionId: null, // Reset selection
      },
      newRestaurantName: newOptions[0].activity.name,
    };
  } catch (error) {
    console.error(`[clustering] Error finding nearby restaurants:`, error);
    return null;
  }
}

// ============================================
// ENRICHMENT: FILL RESTAURANT SLOTS
// ============================================

export interface RestaurantFillingStats {
  totalMealSlots: number;
  filledSlots: number;
  emptySlots: number;
}

/**
 * Fill empty restaurant slots (lunch/dinner) with nearby restaurants
 * Uses Yelp API to find restaurants near the preceding activity
 */
async function fillRestaurantSlots(
  itinerary: StructuredItineraryData
): Promise<{
  itinerary: StructuredItineraryData;
  stats: RestaurantFillingStats;
}> {
  console.log("[itinerary-service] Filling empty restaurant slots...");

  let totalMealSlots = 0;
  let filledSlots = 0;

  const enrichedDays: DayWithOptions[] = [];

  for (const day of itinerary.days) {
    const enrichedSlots: SlotWithOptions[] = [];
    let previousActivityCoords: { lat: number; lng: number } | null = null;
    let previousActivityName = "";

    for (let slotIndex = 0; slotIndex < day.slots.length; slotIndex++) {
      const slot = day.slots[slotIndex];
      const isMealSlot = slot.slotType === "lunch" || slot.slotType === "dinner";

      // For meal slots, get coordinates from the NEXT non-meal slot
      // This way: transit to restaurant area → eat → short walk to next activity
      let nextActivityCoords: { lat: number; lng: number } | null = null;
      let nextActivityName = "";

      if (isMealSlot) {
        // Look forward at next slots to find coordinates
        for (let i = slotIndex + 1; i < day.slots.length; i++) {
          const nextSlot = day.slots[i];
          if (nextSlot.slotType !== "lunch" && nextSlot.slotType !== "dinner") {
            const selectedOption = nextSlot.options.find(o => o.id === nextSlot.selectedOptionId) || nextSlot.options[0];
            const coords = selectedOption?.activity?.place?.coordinates;
            if (coords && coords.lat !== 0) {
              nextActivityCoords = coords;
              nextActivityName = selectedOption?.activity?.name || "";
              break;
            }
          }
        }

        // If no next activity found (e.g., dinner with no evening), fall back to previous
        if (!nextActivityCoords) {
          for (let i = slotIndex - 1; i >= 0; i--) {
            const prevSlot = day.slots[i];
            if (prevSlot.slotType !== "lunch" && prevSlot.slotType !== "dinner") {
              const selectedOption = prevSlot.options.find(o => o.id === prevSlot.selectedOptionId) || prevSlot.options[0];
              const coords = selectedOption?.activity?.place?.coordinates;
              if (coords && coords.lat !== 0) {
                nextActivityCoords = coords;
                nextActivityName = selectedOption?.activity?.name || "" + " (fallback)";
                break;
              }
            }
          }
        }
      }

      if (isMealSlot) {
        totalMealSlots++;

        // Check if slot needs restaurant filling:
        // - Empty slots (no options)
        // - Slots where restaurants are too far from next activity (>1.5km)
        const hasNoOptions = !slot.options || slot.options.length === 0;

        // Check if first restaurant option is far from next activity
        let restaurantIsFarFromActivity = false;
        if (!hasNoOptions && nextActivityCoords) {
          const firstOption = slot.options[0];
          const restaurantCoords = firstOption?.activity?.place?.coordinates;
          if (restaurantCoords && restaurantCoords.lat !== 0) {
            const distanceToRestaurant = calculateHaversineDistance(
              nextActivityCoords,
              restaurantCoords
            );
            restaurantIsFarFromActivity = distanceToRestaurant > MAX_WALKING_DISTANCE_METERS;
            if (restaurantIsFarFromActivity) {
              console.log(
                `[restaurant-fill] Day ${day.dayNumber} ${slot.slotType}: "${firstOption.activity.name}" is ${Math.round(distanceToRestaurant)}m from next activity "${nextActivityName}" - TOO FAR`
              );
            }
          }
        }

        const needsFilling = hasNoOptions || restaurantIsFarFromActivity;

        console.log(
          `[restaurant-fill] Day ${day.dayNumber} ${slot.slotType}: hasOptions=${!hasNoOptions}, tooFar=${restaurantIsFarFromActivity}, needsFilling=${needsFilling}, next="${nextActivityName}"`
        );

        if (needsFilling && nextActivityCoords) {
          const filledSlot = await fillMealSlotWithNearbyRestaurants(
            slot,
            day.city,
            nextActivityCoords,
            nextActivityName,
            slot.slotType as "lunch" | "dinner"
          );

          if (filledSlot) {
            enrichedSlots.push(filledSlot);
            filledSlots++;
            console.log(
              `[restaurant-fill] Day ${day.dayNumber} ${slot.slotType}: Filled with ${filledSlot.options.length} Yelp options near next activity "${nextActivityName}"`
            );
            continue;
          } else {
            console.log(
              `[restaurant-fill] Day ${day.dayNumber} ${slot.slotType}: Failed to fill, keeping original`
            );
          }
        }
      }

      // Update coordinates tracker for ALL non-meal slots (for fallback)
      if (!isMealSlot) {
        const selectedOption = slot.options.find(o => o.id === slot.selectedOptionId) || slot.options[0];
        const coords = selectedOption?.activity?.place?.coordinates;
        if (coords && coords.lat !== 0) {
          previousActivityCoords = coords;
          previousActivityName = selectedOption?.activity?.name || "";
        }
      }

      enrichedSlots.push(slot);
    }

    enrichedDays.push({
      ...day,
      slots: enrichedSlots,
    });
  }

  console.log(
    `[itinerary-service] Restaurant filling: ${filledSlots}/${totalMealSlots} meal slots filled`
  );

  return {
    itinerary: {
      ...itinerary,
      days: enrichedDays,
    },
    stats: {
      totalMealSlots,
      filledSlots,
      emptySlots: totalMealSlots - filledSlots,
    },
  };
}

/**
 * Fill a meal slot with nearby restaurants from Yelp
 */
async function fillMealSlotWithNearbyRestaurants(
  slot: SlotWithOptions,
  city: string,
  nearCoords: { lat: number; lng: number },
  nearActivityName: string,
  mealType: "lunch" | "dinner"
): Promise<SlotWithOptions | null> {
  try {
    // Dynamic import to avoid circular dependencies
    const yelpModule = await import("./yelp");

    // Search for restaurants near the previous activity using coordinates
    const nearbyRestaurants = await yelpModule.searchRestaurantsNearby(
      nearCoords.lat,
      nearCoords.lng,
      {
        radius: MAX_WALKING_DISTANCE_METERS,
        limit: 10,
        sortBy: "rating",
      }
    );

    if (!nearbyRestaurants || nearbyRestaurants.length === 0) {
      console.log(`[restaurant-fill] No restaurants found near ${nearActivityName} in ${city}`);
      return null;
    }

    // Filter for appropriate meal type (lunch vs dinner)
    // For now, just take top-rated restaurants
    const topRestaurants = nearbyRestaurants.slice(0, 3);

    // Convert Restaurant results to activity options
    const options: ActivityOption[] = topRestaurants.map((restaurant, index) => ({
      id: `yelp-${mealType}-${restaurant.id}`,
      rank: index + 1,
      score: 85 - index * 5,
      activity: {
        name: restaurant.name,
        description: `${restaurant.cuisine?.[0] || "Restaurant"} - ${yelpModule.getPriceDisplay(restaurant.priceLevel)}`,
        category: "restaurant" as const,
        duration: mealType === "lunch" ? 60 : 90,
        place: {
          name: restaurant.name,
          address: restaurant.address || "",
          neighborhood: restaurant.city || city,
          coordinates: {
            lat: restaurant.coordinates?.lat || 0,
            lng: restaurant.coordinates?.lng || 0,
          },
          rating: restaurant.rating,
          reviewCount: restaurant.reviewCount,
          photos: restaurant.imageUrl ? [restaurant.imageUrl] : [],
        },
        isFree: false,
        estimatedCost: {
          amount: restaurant.priceLevel === 1 ? 1000 : restaurant.priceLevel === 2 ? 2000 : restaurant.priceLevel === 3 ? 3500 : 5000,
          currency: "JPY",
        },
        tags: ["restaurant", mealType],
        source: "yelp" as const,
      },
      matchReasons: [
        `${Math.round(calculateHaversineDistance(nearCoords, { lat: restaurant.coordinates?.lat || 0, lng: restaurant.coordinates?.lng || 0 }) / 100) / 10} km from ${nearActivityName}`,
        `${restaurant.rating} rating (${restaurant.reviewCount} reviews)`,
      ],
      tradeoffs: [],
    }));

    if (options.length === 0) {
      return null;
    }

    return {
      ...slot,
      options,
      selectedOptionId: null,
      behavior: "meal",
    };
  } catch (error) {
    console.error(`[restaurant-fill] Error finding restaurants for ${mealType}:`, error);
    return null;
  }
}

// ============================================
// ENRICHMENT: VIATOR TOUR ENHANCEMENTS
// ============================================

/**
 * Categories that benefit from Viator tour enhancements
 */
const VIATOR_ENHANCEABLE_CATEGORIES = [
  "temple",
  "shrine",
  "museum",
  "landmark",
  "attraction",
  "park",
  "castle",
  "palace",
  "market",
  "neighborhood",
  "district",
  "observation",
];

/**
 * Map activity keywords to Viator enhancement types
 */
function inferEnhancementType(
  title: string,
  tags: string[],
  activityCategory: string
): ViatorEnhancementType {
  const titleLower = title.toLowerCase();
  const tagsLower = tags.map((t) => t.toLowerCase()).join(" ");
  const combined = `${titleLower} ${tagsLower}`;

  if (combined.includes("skip") || combined.includes("line") || combined.includes("queue")) {
    return "skip-the-line";
  }
  if (combined.includes("private")) {
    return "private-tour";
  }
  if (combined.includes("audio") || combined.includes("self-guided")) {
    return "audio-guide";
  }
  if (combined.includes("food") || combined.includes("culinary") || combined.includes("tasting")) {
    return "food-tour";
  }
  if (combined.includes("night") || combined.includes("evening") || combined.includes("sunset")) {
    return "night-tour";
  }
  if (combined.includes("day trip") || combined.includes("full day") || combined.includes("half day")) {
    return "day-trip";
  }
  if (combined.includes("cooking") || combined.includes("class") || combined.includes("workshop")) {
    return "workshop";
  }
  if (combined.includes("combo") || combined.includes("bundle") || combined.includes("pass")) {
    return "combo-ticket";
  }
  if (combined.includes("guided") || combined.includes("tour")) {
    return "guided-tour";
  }

  // Default based on activity category
  if (activityCategory === "temple" || activityCategory === "shrine") {
    return "guided-tour";
  }
  if (activityCategory === "museum") {
    return "skip-the-line";
  }

  return "experience";
}

/**
 * Generate a match reason explaining why this tour is relevant
 */
function generateMatchReason(
  tourTitle: string,
  activityName: string,
  enhancementType: ViatorEnhancementType
): string {
  const reasons: Record<ViatorEnhancementType, string> = {
    "skip-the-line": `Skip the queues at ${activityName} with this priority access tour`,
    "guided-tour": `Get expert insights about ${activityName} with a professional guide`,
    "audio-guide": `Explore ${activityName} at your own pace with audio commentary`,
    "private-tour": `Enjoy an exclusive private experience at ${activityName}`,
    "food-tour": `Combine ${activityName} with local culinary experiences`,
    "day-trip": `Full experience including ${activityName} and nearby attractions`,
    "experience": `Enhance your visit to ${activityName} with this unique experience`,
    "combo-ticket": `Save money with bundled access to ${activityName} and more`,
    "night-tour": `Experience ${activityName} in a magical evening setting`,
    "workshop": `Hands-on learning experience near ${activityName}`,
  };

  return reasons[enhancementType] || `Enhance your visit to ${activityName}`;
}

/**
 * Determine best time of day for a Viator tour
 */
function determineTourTimeOfDay(
  title: string,
  tags: string[]
): "morning" | "afternoon" | "evening" | "flexible" {
  const combined = `${title} ${tags.join(" ")}`.toLowerCase();

  if (combined.includes("night") || combined.includes("evening") || combined.includes("sunset")) {
    return "evening";
  }
  if (combined.includes("sunrise") || combined.includes("morning") || combined.includes("early")) {
    return "morning";
  }
  if (combined.includes("afternoon")) {
    return "afternoon";
  }
  return "flexible";
}

/**
 * Extract meaningful keywords from an activity name for relevance filtering
 */
function extractKeywords(name: string): string[] {
  const stopWords = [
    "the", "a", "an", "at", "in", "on", "to", "for", "of", "and", "or",
    "visit", "tour", "trip", "area", "district", "gate", "station", "street"
  ];

  return name
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stopWords.includes(word));
}

/**
 * Use LLM (Ollama) to score Viator tour relevance for an activity
 * This provides semantic matching beyond simple keyword matching
 */
async function scoreToursWithLLM(
  activityName: string,
  activityCategory: string,
  city: string,
  tours: Array<{ title: string; description: string; productCode: string }>
): Promise<Array<{ productCode: string; score: number; reason: string }>> {
  // Only use LLM scoring if enabled and Ollama is available
  const useLLMScoring = process.env.VIATOR_LLM_SCORING === "true";
  if (!useLLMScoring || tours.length === 0) {
    return [];
  }

  try {
    const tourList = tours.slice(0, 10).map((t, i) =>
      `${i + 1}. "${t.title}" - ${t.description.slice(0, 100)}...`
    ).join("\n");

const prompt = `Score tour relevance for an activity. Return ONLY a JSON array, no other text.

Activity: "${activityName}" (${activityCategory}) in ${city}

Tours:
${tourList}

Scoring guide:
- 100: Tour specifically about this exact place
- 80-99: Tour includes this place as main stop
- 50-79: Tour in same area/theme
- 0-49: Not relevant (exclude from output)

Output format: [{"index": 1, "score": 85, "reason": "short reason"}]
Return [] if no tours score 50+.
IMPORTANT: Output ONLY the JSON array, nothing else.`;

    console.log(`[itinerary-service] Calling Ollama LLM for tour scoring...`);

    // Dynamic import to avoid circular dependencies
    const { llm } = await import("./llm");

    const response = await llm.chat(
      [{ role: "user", content: prompt }],
      {
        temperature: 0.3,
        maxTokens: 500,
        providerOverride: "ollama"
      }
    );

    console.log(`[itinerary-service] Ollama raw response: ${response.substring(0, 200)}...`);

    // Parse the response - extract JSON from various formats
    // Ollama often returns: "Here's the result:\n```\n[...]\n```" or just text + JSON
    let jsonStr = response;

    // First, try to extract from markdown code blocks: ```json [...] ``` or ``` [...] ```
    const codeBlockMatch = response.match(/```(?:json)?\s*(\[[\s\S]*?\])\s*```/);
    if (codeBlockMatch) {
      jsonStr = codeBlockMatch[1];
      console.log(`[itinerary-service] Extracted JSON from code block`);
    } else {
      // Try to find bare JSON array in the response
      const jsonMatch = response.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        jsonStr = jsonMatch[0];
        console.log(`[itinerary-service] Extracted bare JSON array`);
      } else {
        // If no array found, return empty (no relevant tours)
        console.log(`[itinerary-service] No JSON array found in LLM response, returning empty`);
        return [];
      }
    }

    // Clean up the JSON string (remove any trailing text after the array)
    // Find the matching closing bracket for the opening bracket
    let depth = 0;
    let endIndex = 0;
    for (let i = 0; i < jsonStr.length; i++) {
      if (jsonStr[i] === '[') depth++;
      if (jsonStr[i] === ']') depth--;
      if (depth === 0 && jsonStr[i] === ']') {
        endIndex = i + 1;
        break;
      }
    }
    if (endIndex > 0) {
      jsonStr = jsonStr.substring(0, endIndex);
    }

    const scores = JSON.parse(jsonStr) as Array<{ index: number; score: number; reason: string }>;
    console.log(`[itinerary-service] Parsed ${scores.length} scores from LLM`);

    // Map back to product codes
    const result = scores
      .filter(s => s.score >= 50)
      .map(s => ({
        productCode: tours[s.index - 1]?.productCode || "",
        score: s.score,
        reason: s.reason
      }))
      .filter(s => s.productCode);

    console.log(`[itinerary-service] LLM scoring returned ${result.length} relevant tours (score >= 50)`);
    return result;

  } catch (error) {
    console.error(`[itinerary-service] LLM tour scoring failed:`, error);
    return [];
  }
}

/**
 * Search Viator for tours related to an activity using freetext search
 * This uses the POI-specific freetext search which returns more relevant results
 */
async function searchViatorForActivity(
  activityName: string,
  activityCategory: string,
  city: string,
  slotType?: string,
  timeRange?: { start: string; end: string }
): Promise<ViatorEnhancement[]> {
  // Dynamic import to avoid circular dependencies
  const viator = await import("./viator");

  try {
    // Normalize activity name for search (remove macrons, add "Temple"/"Shrine" suffix if applicable)
    const normalizedName = activityName
      .replace(/ō/g, "o")
      .replace(/ū/g, "u")
      .replace(/ā/g, "a")
      .replace(/ē/g, "e")
      .replace(/ī/g, "i");

    // Add category suffix for better search results (e.g., "Senso-ji" → "Senso-ji Temple")
    let searchName = normalizedName;
    if (activityCategory === "temple" && !normalizedName.toLowerCase().includes("temple")) {
      searchName = `${normalizedName} Temple`;
    } else if (activityCategory === "shrine" && !normalizedName.toLowerCase().includes("shrine")) {
      searchName = `${normalizedName} Shrine`;
    }

    // DON'T add city to search term - Viator freetext works better with just the activity name
    // Adding city dilutes results (e.g., "Senso-ji Temple" finds better tours than "Senso-ji Temple Tokyo")
    const searchTerm = searchName;

    console.log(`[itinerary-service] Searching Viator freetext for: "${searchTerm}" (original: "${activityName}", city: ${city})`);

    // Use freetext search for POI-specific results
    const results = await viator.searchProductsFreetext({
      searchTerm,
      count: 15, // Request more so we can filter
      currency: "USD",
    });

    // Check if we have products
    const products = results.products?.results || [];

    if (products.length === 0) {
      console.log(`[itinerary-service] No Viator products found for "${activityName}"`);
      return [];
    }

    console.log(`[itinerary-service] Found ${products.length} Viator products for "${activityName}", filtering for relevance...`);

    // Filter and score products for relevance to the activity AND city
    const activityKeywords = extractKeywords(activityName);
    const cityLower = city.toLowerCase();

    // Define major Japan cities for cross-city filtering
    const japanCities = ["tokyo", "kyoto", "osaka", "nara", "hiroshima", "yokohama", "kobe", "nagoya", "fukuoka", "sapporo", "sendai", "kanazawa"];
    const otherCities = japanCities.filter(c => c !== cityLower);

    // Exclude patterns for day trips / different destinations
    const excludePatterns = [
      /mt\.?\s*fuji/i,
      /hakone/i,
      /nikko/i,
      /kamakura/i,
      /day\s*trip/i,
    ];
    const activityMentionsExcluded = excludePatterns.some(pattern => pattern.test(activityName));

    // First pass: hard filter (exclude wrong cities and unrelated destinations)
    const cityFilteredProducts = products.filter((product) => {
      const titleLower = product.title.toLowerCase();

      // HARD FILTER 1: Check if tour is for a DIFFERENT city
      const mentionsOtherCity = otherCities.some(otherCity => titleLower.includes(otherCity));
      const mentionsOurCity = titleLower.includes(cityLower);

      if (mentionsOtherCity && !mentionsOurCity) {
        console.log(`[itinerary-service] Excluding tour "${product.title}" - different city (looking for ${city})`);
        return false;
      }

      // HARD FILTER 2: Exclude tours for unrelated destinations (unless activity mentions them)
      const tourMentionsExcluded = excludePatterns.some(pattern => pattern.test(product.title));
      if (tourMentionsExcluded && !activityMentionsExcluded) {
        console.log(`[itinerary-service] Excluding tour "${product.title}" - unrelated destination`);
        return false;
      }

      return true;
    });

    console.log(`[itinerary-service] ${cityFilteredProducts.length} products after city/destination filtering`);

    if (cityFilteredProducts.length === 0) {
      console.log(`[itinerary-service] No Viator tours in ${city} for "${activityName}"`);
      return [];
    }

    // Second pass: score products by relevance (higher score = more relevant)
    const scoredProducts = cityFilteredProducts.map((product) => {
      const titleLower = product.title.toLowerCase();
      const descLower = (product.shortDescription || product.description || "").toLowerCase();
      const combinedText = `${titleLower} ${descLower}`;
      let score = 0;

      // Normalize activity name for matching (handle special characters like ō)
      const activityNameLower = activityName.toLowerCase();
      const activityNameNormalized = activityNameLower
        .replace(/ō/g, "o")
        .replace(/ū/g, "u")
        .replace(/ā/g, "a")
        .replace(/ē/g, "e")
        .replace(/ī/g, "i");

      const titleNormalized = titleLower
        .replace(/ō/g, "o")
        .replace(/ū/g, "u")
        .replace(/ā/g, "a")
        .replace(/ē/g, "e")
        .replace(/ī/g, "i");

      const descNormalized = descLower
        .replace(/ō/g, "o")
        .replace(/ū/g, "u")
        .replace(/ā/g, "a")
        .replace(/ē/g, "e")
        .replace(/ī/g, "i");

      // HIGHEST PRIORITY: Check if the activity name appears in tour title (exact or normalized)
      if (titleLower.includes(activityNameLower) || titleNormalized.includes(activityNameNormalized)) {
        score += 100; // Very strong match - tour specifically mentions this place
        console.log(`[itinerary-service] Strong match: "${product.title}" contains "${activityName}"`);
      }

      // HIGH PRIORITY: Check if activity name appears in description
      if (descLower.includes(activityNameLower) || descNormalized.includes(activityNameNormalized)) {
        score += 50; // Tour description mentions this place
      }

      // Check word matches from activity name (e.g., "Sensō" from "Sensō-ji")
      const activityWords = activityNameLower
        .split(/[\s\-]+/)
        .filter(word => word.length >= 3)
        .map(w => w.replace(/ō/g, "o").replace(/ū/g, "u").replace(/ā/g, "a"));

      for (const word of activityWords) {
        if (titleNormalized.includes(word)) {
          score += 30; // Significant word match in title
        } else if (descNormalized.includes(word)) {
          score += 15; // Word match in description
        }
      }

      // Check if tour title/description contains any activity keywords
      const keywordMatches = activityKeywords.filter(
        (keyword) => {
          const keywordNorm = keyword.replace(/ō/g, "o").replace(/ū/g, "u").replace(/ā/g, "a");
          return titleNormalized.includes(keywordNorm) || descNormalized.includes(keywordNorm);
        }
      );
      score += keywordMatches.length * 10;

      // Boost if tour mentions our city explicitly
      if (titleLower.includes(cityLower)) {
        score += 5;
      }

      // Boost highly rated tours
      if (product.reviews?.combinedAverageRating && product.reviews.combinedAverageRating >= 4.5) {
        score += 3;
      }

      // Boost if tour has high review count (popular tour)
      if (product.reviews?.totalReviews && product.reviews.totalReviews >= 100) {
        score += 2;
      }

      return { product, score };
    });

    // Sort by score (highest first)
    scoredProducts.sort((a, b) => b.score - a.score);

    // CRITICAL: Filter out low-scoring products before LLM
    // Tours with score < 30 have no real connection to the activity
    // (just matching city name or having good reviews isn't enough)
    const MIN_KEYWORD_SCORE = 30;
    const relevantProducts = scoredProducts.filter(p => p.score >= MIN_KEYWORD_SCORE);

    if (relevantProducts.length === 0) {
      console.log(`[itinerary-service] No tours scored >= ${MIN_KEYWORD_SCORE} for "${activityName}" - skipping`);
      return [];
    }

    // Take top products for LLM scoring
    let topProducts: Array<{ product: typeof scoredProducts[0]["product"]; score: number; llmScore?: number; llmReason?: string }> =
      relevantProducts.slice(0, 5);

    console.log(`[itinerary-service] Top scored products (keyword): ${topProducts.map(p => `"${p.product.title}" (${p.score})`).join(", ")}`);

    // Optionally use LLM for better relevance scoring
    const llmScores = await scoreToursWithLLM(
      activityName,
      activityCategory,
      city,
      topProducts.map(p => ({
        title: p.product.title,
        description: p.product.shortDescription || p.product.description || "",
        productCode: p.product.productCode,
      }))
    );

    // If LLM scoring returned results, re-rank based on LLM scores
    if (llmScores.length > 0) {
      console.log(`[itinerary-service] LLM re-scored: ${llmScores.map(s => `"${s.productCode}" (${s.score})`).join(", ")}`);

      // Create a map of LLM scores
      const llmScoreMap = new Map(llmScores.map(s => [s.productCode, s]));

      // Re-sort based on LLM scores (higher is better)
      topProducts = topProducts
        .map(p => ({
          ...p,
          llmScore: llmScoreMap.get(p.product.productCode)?.score || 0,
          llmReason: llmScoreMap.get(p.product.productCode)?.reason,
        }))
        .sort((a, b) => (b.llmScore || 0) - (a.llmScore || 0));

      console.log(`[itinerary-service] After LLM re-ranking: ${topProducts.map(p => `"${p.product.title}" (llm:${p.llmScore})`).join(", ")}`);
    }

    // Take top 3 for final results - filter out LLM score 0 (irrelevant)
    const finalProducts = topProducts
      .filter(p => !p.llmScore || p.llmScore > 0) // Keep if no LLM scoring OR if LLM score > 0
      .slice(0, 3)
      .map(p => p.product);

    if (finalProducts.length === 0) {
      console.log(`[itinerary-service] No relevant tours after LLM filtering for "${activityName}"`);
      return [];
    }

    // Convert to ViatorEnhancement format
    const enhancements: ViatorEnhancement[] = finalProducts.map((product) => {
      const tags = viator.getTagNames(
        Array.isArray(product.tags)
          ? product.tags.map((t: number | { tagId: number }) => (typeof t === "number" ? t : t.tagId)).filter((id: number) => id > 0)
          : []
      );

      const enhancementType = inferEnhancementType(product.title, tags, activityCategory);
      const duration = viator.getProductDuration(product) || 120;

      return {
        productCode: product.productCode,
        title: product.title,
        description: product.shortDescription || product.description || "",
        enhancementType,
        price: {
          amount: product.pricing?.summary?.fromPrice || 0,
          currency: product.pricing?.currency || "USD",
          originalAmount: product.pricing?.summary?.fromPriceBeforeDiscount,
        },
        duration,
        rating: product.reviews?.combinedAverageRating,
        reviewCount: product.reviews?.totalReviews,
        bookingUrl: viator.getBookingUrl(product),
        confirmationType: product.confirmationType === "INSTANT" ? "instant" : "manual",
        imageUrl: viator.getProductImageUrl(product),
        matchReason: generateMatchReason(product.title, activityName, enhancementType),
        flags: {
          skipTheLine: product.flags?.includes("SKIP_THE_LINE"),
          freeCancellation: product.flags?.includes("FREE_CANCELLATION"),
          likelyToSellOut: product.flags?.includes("LIKELY_TO_SELL_OUT"),
          newOnViator: product.flags?.includes("NEW_ON_VIATOR"),
          privateOption: product.title.toLowerCase().includes("private"),
        },
        bestTimeOfDay: determineTourTimeOfDay(product.title, tags),
        tags,
      };
    });

    return enhancements;
  } catch (error) {
    console.warn(`[itinerary-service] Viator freetext search failed for "${activityName}" in ${city}:`, error);
    return [];
  }
}

export interface ViatorEnrichmentStats {
  totalActivities: number;
  enhancedActivities: number;
  totalTours: number;
  searchDuration: number;
}

/**
 * Enrich itinerary activities with optional Viator tour enhancements
 *
 * For activities like temples, museums, and landmarks, this finds relevant
 * Viator tours that can enhance the experience (guided tours, skip-the-line, etc.)
 */
export async function enrichWithViatorTours(
  itinerary: StructuredItineraryData,
  options?: {
    maxToursPerActivity?: number;
    onlyTopRankedActivities?: boolean;
  }
): Promise<{
  itinerary: StructuredItineraryData;
  stats: ViatorEnrichmentStats;
}> {
  const startTime = Date.now();
  const maxTours = options?.maxToursPerActivity ?? 3;
  const onlyTopRanked = options?.onlyTopRankedActivities ?? true;

  console.log("[itinerary-service] Enriching with Viator tour enhancements...");

  let totalActivities = 0;
  let enhancedActivities = 0;
  let totalTours = 0;

  // Collect activities that could benefit from tour enhancements
  const activitiesToEnrich: Array<{
    dayIndex: number;
    slotIndex: number;
    optionIndex: number;
    activity: ActivityOption;
    city: string;
    slotType: string;
    timeRange?: { start: string; end: string };
  }> = [];

  for (let dayIndex = 0; dayIndex < itinerary.days.length; dayIndex++) {
    const day = itinerary.days[dayIndex];

    for (let slotIndex = 0; slotIndex < day.slots.length; slotIndex++) {
      const slot = day.slots[slotIndex];

      for (let optionIndex = 0; optionIndex < slot.options.length; optionIndex++) {
        const option = slot.options[optionIndex];
        totalActivities++;

        // Skip if only enhancing top-ranked and this isn't rank 1
        if (onlyTopRanked && option.rank !== 1) {
          continue;
        }

        // Check if this activity category could benefit from tours
        const category = option.activity.category.toLowerCase();
        if (VIATOR_ENHANCEABLE_CATEGORIES.some((c) => category.includes(c))) {
          activitiesToEnrich.push({
            dayIndex,
            slotIndex,
            optionIndex,
            activity: option,
            city: day.city,
            slotType: slot.slotType,
            timeRange: slot.timeRange,
          });
        }
      }
    }
  }

  console.log(`[itinerary-service] Found ${activitiesToEnrich.length} activities to enrich with Viator tours`);

  // Create a deep copy of the itinerary for enrichment
  const enrichedItinerary: StructuredItineraryData = JSON.parse(JSON.stringify(itinerary));

  // Process in batches to avoid rate limiting
  const BATCH_SIZE = 5;
  for (let i = 0; i < activitiesToEnrich.length; i += BATCH_SIZE) {
    const batch = activitiesToEnrich.slice(i, i + BATCH_SIZE);

    const batchResults = await Promise.all(
      batch.map(async ({ dayIndex, slotIndex, optionIndex, activity, city, slotType, timeRange }) => {
        const enhancements = await searchViatorForActivity(
          activity.activity.name,
          activity.activity.category,
          city,
          slotType,
          timeRange
        );

        return {
          dayIndex,
          slotIndex,
          optionIndex,
          enhancements: enhancements.slice(0, maxTours),
        };
      })
    );

    // Apply results to enriched itinerary
    for (const result of batchResults) {
      if (result.enhancements.length > 0) {
        const day = enrichedItinerary.days[result.dayIndex];
        const slot = day.slots[result.slotIndex];
        const option = slot.options[result.optionIndex];

        option.viatorEnhancements = result.enhancements;
        enhancedActivities++;
        totalTours += result.enhancements.length;

        console.log(
          `[itinerary-service] Added ${result.enhancements.length} Viator tours to "${option.activity.name}"`
        );
      }
    }

    // Small delay between batches to respect rate limits
    if (i + BATCH_SIZE < activitiesToEnrich.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  const searchDuration = Date.now() - startTime;
  console.log(
    `[itinerary-service] Viator enrichment complete: ${enhancedActivities}/${activitiesToEnrich.length} activities enhanced with ${totalTours} tours in ${searchDuration}ms`
  );

  return {
    itinerary: enrichedItinerary,
    stats: {
      totalActivities,
      enhancedActivities,
      totalTours,
      searchDuration,
    },
  };
}

// ============================================
// SLOT OPERATIONS: SWAP & FILL
// ============================================

import { suggestions as suggestionsService } from "./suggestions-service";

/**
 * Options for a swap operation
 */
export interface SwapOption {
  id: string;
  activity: ActivityOption;
  score: number;
  reason: string;
  benefits: string[];
  tradeoffs: string[];
  distance?: number;
  commuteFromPrevious?: number;
  commuteToNext?: number;
}

/**
 * Result of getting swap options for a slot
 */
export interface SlotSwapOptions {
  slotId: string;
  dayNumber: number;
  currentActivity: ActivityOption | null;
  alternatives: SwapOption[];
}

/**
 * Get swap options for a specific slot in an itinerary
 */
export async function getSwapOptions(
  itinerary: StructuredItineraryData,
  dayNumber: number,
  slotId: string
): Promise<SlotSwapOptions | null> {
  // Find the day and slot
  const day = itinerary.days.find((d) => d.dayNumber === dayNumber);
  if (!day) {
    console.warn(`[itinerary-service] Day ${dayNumber} not found`);
    return null;
  }

  const slot = day.slots.find((s) => s.slotId === slotId);
  if (!slot) {
    console.warn(`[itinerary-service] Slot ${slotId} not found in day ${dayNumber}`);
    return null;
  }

  // Get current activity (selected or first option)
  const currentActivity =
    slot.options.find((o) => o.id === slot.selectedOptionId) || slot.options[0] || null;

  // Collect existing activity names to exclude from suggestions
  const existingNames: string[] = [];
  for (const d of itinerary.days) {
    for (const s of d.slots) {
      for (const opt of s.options) {
        if (opt.activity?.name) {
          existingNames.push(opt.activity.name.toLowerCase());
        }
      }
    }
  }

  // Get previous activity coordinates for proximity-based suggestions
  let previousCoords: { lat: number; lng: number } | null = null;
  const slotIndex = day.slots.findIndex((s) => s.slotId === slotId);
  if (slotIndex > 0) {
    const prevSlot = day.slots[slotIndex - 1];
    const prevOption =
      prevSlot.options.find((o) => o.id === prevSlot.selectedOptionId) ||
      prevSlot.options[0];
    if (prevOption?.activity?.place?.coordinates) {
      previousCoords = prevOption.activity.place.coordinates;
    }
  }

  // Use suggestions service to get alternatives
  const suggestionsResponse = await suggestionsService.getSuggestions({
    city: day.city,
    slotType: slot.slotType as "morning" | "lunch" | "afternoon" | "dinner" | "evening",
    coordinates: previousCoords || undefined,
    limit: 5,
    excludeNames: existingNames,
  });

  // Convert suggestions to SwapOptions
  const alternatives: SwapOption[] = suggestionsResponse.suggestions.map((sugg, index) => ({
    id: sugg.id,
    activity: {
      id: sugg.id,
      rank: index + 1,
      score: 80 - index * 5,
      activity: {
        name: sugg.activity.name,
        description: sugg.activity.description || "",
        category: sugg.activity.category as ActivityOption["activity"]["category"],
        duration: sugg.activity.duration,
        place: {
          name: sugg.activity.place?.name || sugg.activity.name,
          address: "",
          neighborhood: sugg.activity.place?.neighborhood || "",
          coordinates: sugg.activity.place?.coordinates || { lat: 0, lng: 0 },
          rating: sugg.activity.place?.rating,
          photos: sugg.activity.place?.photos || [],
        },
        isFree: sugg.ticketRequirement === "free",
        tags: [],
        source: sugg.source === "data" ? "local-data" : "ai",
      },
      matchReasons: [sugg.type === "restaurant" ? "Nearby restaurant" : "Alternative activity"],
      tradeoffs: [],
    },
    score: 80 - index * 5,
    reason:
      sugg.type === "restaurant"
        ? "Nearby dining option"
        : sugg.type === "experience"
          ? "Bookable experience"
          : "Alternative attraction",
    benefits: [
      sugg.activity.place?.rating ? `${sugg.activity.place.rating} rating` : "Well-reviewed",
      sugg.distance ? `${Math.round(sugg.distance / 100) / 10} km away` : "Nearby",
    ],
    tradeoffs:
      sugg.ticketRequirement === "required" ? ["Requires advance booking"] : [],
    distance: sugg.distance || undefined,
  }));

  return {
    slotId,
    dayNumber,
    currentActivity,
    alternatives,
  };
}

/**
 * Swap an activity in a slot with a new one
 */
export function swapActivity(
  itinerary: StructuredItineraryData,
  dayNumber: number,
  slotId: string,
  newActivity: ActivityOption
): StructuredItineraryData {
  // Create a deep copy to avoid mutating the original
  const updated: StructuredItineraryData = JSON.parse(JSON.stringify(itinerary));

  const day = updated.days.find((d) => d.dayNumber === dayNumber);
  if (!day) {
    throw new Error(`Day ${dayNumber} not found in itinerary`);
  }

  const slot = day.slots.find((s) => s.slotId === slotId);
  if (!slot) {
    throw new Error(`Slot ${slotId} not found in day ${dayNumber}`);
  }

  // Add the new activity as the first option and select it
  slot.options = [newActivity, ...slot.options.filter((o) => o.id !== newActivity.id)];
  slot.selectedOptionId = newActivity.id;

  return updated;
}

/**
 * Fill an empty slot with suggestions
 */
export async function fillSlot(
  itinerary: StructuredItineraryData,
  dayNumber: number,
  slotId: string,
  options?: {
    coordinates?: { lat: number; lng: number };
    preferences?: string;
  }
): Promise<StructuredItineraryData> {
  // Create a deep copy
  const updated: StructuredItineraryData = JSON.parse(JSON.stringify(itinerary));

  const day = updated.days.find((d) => d.dayNumber === dayNumber);
  if (!day) {
    throw new Error(`Day ${dayNumber} not found in itinerary`);
  }

  const slot = day.slots.find((s) => s.slotId === slotId);
  if (!slot) {
    throw new Error(`Slot ${slotId} not found in day ${dayNumber}`);
  }

  // Collect existing activity names
  const existingNames: string[] = [];
  for (const d of updated.days) {
    for (const s of d.slots) {
      for (const opt of s.options) {
        if (opt.activity?.name) {
          existingNames.push(opt.activity.name.toLowerCase());
        }
      }
    }
  }

  // Get suggestions
  const suggestionsResponse = await suggestionsService.getSuggestions({
    city: day.city,
    slotType: slot.slotType as "morning" | "lunch" | "afternoon" | "dinner" | "evening",
    coordinates: options?.coordinates,
    limit: 3,
    excludeNames: existingNames,
    userPreferences: options?.preferences,
  });

  // Convert suggestions to ActivityOptions
  const newOptions: ActivityOption[] = suggestionsResponse.suggestions.map(
    (sugg, index) => ({
      id: sugg.id,
      rank: index + 1,
      score: 85 - index * 5,
      activity: {
        name: sugg.activity.name,
        description: sugg.activity.description || "",
        category: sugg.activity.category as ActivityOption["activity"]["category"],
        duration: sugg.activity.duration,
        place: {
          name: sugg.activity.place?.name || sugg.activity.name,
          address: "",
          neighborhood: sugg.activity.place?.neighborhood || "",
          coordinates: sugg.activity.place?.coordinates || { lat: 0, lng: 0 },
          rating: sugg.activity.place?.rating,
          photos: sugg.activity.place?.photos || [],
        },
        isFree: sugg.ticketRequirement === "free",
        tags: [],
        source: sugg.source === "data" ? "local-data" : "ai",
      },
      matchReasons: ["Auto-suggested for empty slot"],
      tradeoffs: [],
    })
  );

  slot.options = newOptions;
  slot.selectedOptionId = newOptions[0]?.id || null;

  return updated;
}

/**
 * Reorder days in an itinerary
 */
export function reorderDays(
  itinerary: StructuredItineraryData,
  fromIndex: number,
  toIndex: number
): StructuredItineraryData {
  if (fromIndex === toIndex) return itinerary;

  const updated: StructuredItineraryData = JSON.parse(JSON.stringify(itinerary));

  // Remove the day from its current position
  const [movedDay] = updated.days.splice(fromIndex, 1);

  // Insert at new position
  updated.days.splice(toIndex, 0, movedDay);

  // Recalculate day numbers and dates
  const startDate = new Date(updated.days[0]?.date || new Date());
  for (let i = 0; i < updated.days.length; i++) {
    updated.days[i].dayNumber = i + 1;
    const newDate = new Date(startDate);
    newDate.setDate(startDate.getDate() + i);
    updated.days[i].date = newDate.toISOString().split("T")[0];
  }

  return updated;
}

/**
 * Reorder slots within a day
 */
export function reorderSlots(
  itinerary: StructuredItineraryData,
  dayNumber: number,
  fromIndex: number,
  toIndex: number
): StructuredItineraryData {
  if (fromIndex === toIndex) return itinerary;

  const updated: StructuredItineraryData = JSON.parse(JSON.stringify(itinerary));

  const day = updated.days.find((d) => d.dayNumber === dayNumber);
  if (!day) {
    throw new Error(`Day ${dayNumber} not found in itinerary`);
  }

  // Remove the slot from its current position
  const [movedSlot] = day.slots.splice(fromIndex, 1);

  // Insert at new position
  day.slots.splice(toIndex, 0, movedSlot);

  return updated;
}

/**
 * Remove a slot from a day
 */
export function removeSlot(
  itinerary: StructuredItineraryData,
  dayNumber: number,
  slotId: string
): StructuredItineraryData {
  const updated: StructuredItineraryData = JSON.parse(JSON.stringify(itinerary));

  const day = updated.days.find((d) => d.dayNumber === dayNumber);
  if (!day) {
    throw new Error(`Day ${dayNumber} not found in itinerary`);
  }

  day.slots = day.slots.filter((s) => s.slotId !== slotId);

  return updated;
}

/**
 * Add a new empty slot to a day
 */
export function addSlot(
  itinerary: StructuredItineraryData,
  dayNumber: number,
  slotType: SlotWithOptions["slotType"],
  position?: number
): StructuredItineraryData {
  const updated: StructuredItineraryData = JSON.parse(JSON.stringify(itinerary));

  const day = updated.days.find((d) => d.dayNumber === dayNumber);
  if (!day) {
    throw new Error(`Day ${dayNumber} not found in itinerary`);
  }

  const newSlot: SlotWithOptions = {
    slotId: `day${dayNumber}-${slotType}-${Date.now()}`,
    slotType,
    timeRange: getDefaultTimeRange(slotType),
    options: [],
    behavior: slotType === "lunch" || slotType === "dinner" ? "meal" : "flex",
  };

  if (position !== undefined && position >= 0 && position <= day.slots.length) {
    day.slots.splice(position, 0, newSlot);
  } else {
    day.slots.push(newSlot);
  }

  return updated;
}

// ============================================
// EXPORTS
// ============================================

export const itineraryService = {
  // Generation
  generate,
  getProvider: getItineraryProvider,
  getConfig: getItineraryConfig,
  getProviderInfo,
  enrichWithViatorTours,

  // Slot operations
  getSwapOptions,
  swapActivity,
  fillSlot,

  // Reordering
  reorderDays,
  reorderSlots,

  // Slot management
  addSlot,
  removeSlot,
};

export default itineraryService;
