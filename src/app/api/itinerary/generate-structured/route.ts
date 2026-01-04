// ============================================
// POST /api/itinerary/generate-structured
// ============================================
// Generate a structured itinerary with OPTIONS per slot
// Now uses the unified itinerary-service for all generation
//
// Supports:
// - ITINERARY_PROVIDER=data|llm
// - ITINERARY_AI_PROVIDER=openai|gemini|ollama
// - Optional place resolution and commute calculation

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import {
  itineraryService,
  enrichWithViatorTours,
  type ItineraryRequest,
  type ViatorEnrichmentStats,
} from "@/lib/itinerary-service";
import { inferTripStructure } from "@/lib/transfer-inference";
import type { HotelAnchor, FlightAnchor } from "@/types/trip-input";
import { validateTripDates } from "@/lib/date-validation";
import {
  remediateItinerary,
  type FlightConstraints,
} from "@/lib/itinerary-remediation";
import { generateTripId } from "@/lib/execution/trip-id";
import {
  createValidationDebugLogger,
  setCurrentValidationDebugLogger,
  clearValidationDebugLogger,
} from "@/lib/validation-debug-logger";
import { getValidationService } from "@/lib/itinerary-validation-service";
import type { TripContext, StructuredItineraryData } from "@/types/structured-itinerary";

// Directory to store trips
const TRIPS_DIR = path.join(process.cwd(), "data", "trips");

// Ensure the directory exists
async function ensureTripsDir() {
  try {
    await fs.mkdir(TRIPS_DIR, { recursive: true });
  } catch (error) {
    console.error("[API generate-structured] Failed to create trips directory:", error);
  }
}

// Save itinerary to disk
async function saveItineraryToDisk(itinerary: StructuredItineraryData): Promise<void> {
  if (!itinerary.tripId) {
    console.warn("[API generate-structured] No tripId on itinerary, skipping disk save");
    return;
  }

  await ensureTripsDir();
  const filePath = path.join(TRIPS_DIR, `${itinerary.tripId}.json`);
  const content = JSON.stringify(itinerary, null, 2);
  await fs.writeFile(filePath, content, "utf-8");
  console.log(`[API generate-structured] Saved itinerary to ${filePath}`);
}

// ============================================
// CONFIGURATION
// ============================================

interface PlaceResolutionConfig {
  enabled: boolean;
  skipExpensiveProviders: boolean;
  minConfidence: number;
}

interface CommuteConfig {
  enabled: boolean;
}

interface ViatorEnrichmentConfig {
  enabled: boolean;
  maxToursPerActivity: number;
  onlyTopRankedActivities: boolean;
}

const PLACE_RESOLUTION_CONFIG: PlaceResolutionConfig = {
  enabled: true,
  skipExpensiveProviders: true, // Skip Google to save cost
  minConfidence: 0.5,
};

const COMMUTE_CONFIG: CommuteConfig = {
  enabled: true,
};

// Viator enrichment is opt-in via environment variable or request parameter
const VIATOR_ENRICHMENT_CONFIG: ViatorEnrichmentConfig = {
  enabled: process.env.VIATOR_ENRICHMENT_ENABLED === "true",
  maxToursPerActivity: 3,
  onlyTopRankedActivities: true, // Only enrich the top-ranked activity option
};

// ============================================
// REQUEST TYPES
// ============================================

interface GenerateStructuredRequest {
  destination: string;
  cities?: string[];
  startDate: string;
  endDate?: string;
  numberOfDays?: number; // Alternative to endDate
  travelers?: {
    adults?: number;
    children?: number;
    childrenAges?: number[];
  };
  budget?: "budget" | "moderate" | "luxury";
  pace?: "relaxed" | "moderate" | "packed";
  interests?: string[];
  dietaryRestrictions?: string[];
  tripMode?: "solo" | "couples" | "friends" | "family" | "business";

  // Constraints - must-haves and must-avoids
  mustHave?: string[]; // Places/activities that MUST be included
  mustAvoid?: string[]; // Places/activities/types to avoid

  // Activity anchors - pre-booked activities with fixed times
  anchors?: Array<{
    name: string;
    city: string;
    date: string; // YYYY-MM-DD
    startTime?: string; // HH:mm
    endTime?: string; // HH:mm
    duration?: number; // minutes
    category?: string;
    isFlexible?: boolean;
    notes?: string;
  }>;

  // Clustering preference
  clusterByNeighborhood?: boolean; // Group activities geographically (default: true)

  // Flight constraints - for adjusting first/last day and adding transfer slots
  arrivalFlightTime?: string; // HH:mm - when arriving on first day
  departureFlightTime?: string; // HH:mm - when departing on last day
  arrivalAirport?: string; // Airport code (e.g., "NRT")
  departureAirport?: string; // Airport code (e.g., "KIX")

  // Inter-city transfer info (can be inferred from cities if not provided)
  transfers?: Array<{
    type: "airport_arrival" | "airport_departure" | "inter_city" | "same_city";
    date: string;
    fromCity: string;
    toCity: string;
    mode?: string;
    duration?: number;
  }>;

  // Hotels/accommodations - used for hotel↔activity commute calculation
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
  includeViatorTours?: boolean; // Add optional Viator tour enhancements
}

// Extended TripContext to include cities array and constraint fields
interface ExtendedTripContext extends TripContext {
  cities?: string[];
  // Constraints
  mustHave?: string[];
  mustAvoid?: string[];
  anchors?: Array<{
    name: string;
    city: string;
    date: string;
    startTime?: string;
    endTime?: string;
    duration?: number;
    category?: string;
    isFlexible?: boolean;
    notes?: string;
  }>;
  clusterByNeighborhood?: boolean;
}

// ============================================
// REQUEST VALIDATION
// ============================================

function validateRequest(
  body: unknown
): { valid: true; data: ExtendedTripContext } | { valid: false; error: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body is required" };
  }

  const req = body as GenerateStructuredRequest;

  if (!req.destination || typeof req.destination !== "string") {
    return { valid: false, error: "Destination is required" };
  }

  if (!req.startDate) {
    return { valid: false, error: "Start date is required" };
  }

  // Calculate endDate from numberOfDays if not provided
  let endDate = req.endDate;
  if (!endDate && req.numberOfDays && req.numberOfDays > 0) {
    const start = new Date(req.startDate);
    const end = new Date(start);
    end.setDate(end.getDate() + req.numberOfDays - 1);
    endDate = end.toISOString().split("T")[0];
  }

  if (!endDate) {
    return { valid: false, error: "Either endDate or numberOfDays is required" };
  }

  // Validate dates using centralized validation
  const dateValidation = validateTripDates(req.startDate, endDate);
  if (!dateValidation.valid) {
    return { valid: false, error: dateValidation.error!.message };
  }

  // Build validated request - include cities array and constraints
  const data: ExtendedTripContext = {
    destination: req.destination,
    startDate: req.startDate,
    endDate: endDate,
    travelers: {
      adults: req.travelers?.adults ?? 2,
      children: req.travelers?.children ?? 0,
      childrenAges: req.travelers?.childrenAges,
    },
    budget: req.budget || "moderate",
    pace: req.pace || "moderate",
    interests: req.interests || [],
    dietaryRestrictions: req.dietaryRestrictions,
    tripMode: req.tripMode,
    cities: req.cities, // Pass through cities array
    // Constraints
    mustHave: req.mustHave,
    mustAvoid: req.mustAvoid,
    anchors: req.anchors,
    clusterByNeighborhood: req.clusterByNeighborhood,
  };

  return { valid: true, data };
}

// ============================================
// CONVERT TripContext to ItineraryRequest
// ============================================

function convertToItineraryRequest(
  context: ExtendedTripContext,
  rawRequest: GenerateStructuredRequest
): ItineraryRequest {
  // Use cities array if provided, otherwise extract from destination
  let cities: string[];
  if (context.cities && context.cities.length > 0) {
    cities = context.cities;
  } else {
    // Parse destination to extract city
    const cityMatch = context.destination.match(/^([^,]+)/);
    const city = cityMatch ? cityMatch[1].trim() : context.destination;
    cities = [city];
  }

  // Calculate number of days
  const startDate = new Date(context.startDate);
  const endDate = new Date(context.endDate);
  const totalDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  // Transfers will be set by the route handler (async call to inferTransfersFromAnchors)
  // This is just the synchronous part - transfers are added later
  const transfers = rawRequest.transfers || [];

  return {
    cities,
    startDate: context.startDate,
    totalDays,
    pace: context.pace,
    interests: context.interests,
    travelers: context.travelers,
    budget: context.budget,
    userPreferences: context.dietaryRestrictions?.join(", "),
    tripContext: context.tripMode ? `Trip mode: ${context.tripMode}` : undefined,
    // Flight constraints
    arrivalFlightTime: rawRequest.arrivalFlightTime,
    departureFlightTime: rawRequest.departureFlightTime,
    arrivalAirport: rawRequest.arrivalAirport,
    departureAirport: rawRequest.departureAirport,
    // Transfers - will be populated by route handler
    transfers,
    // Constraints
    mustHave: context.mustHave,
    mustAvoid: context.mustAvoid,
    anchors: context.anchors,
    clusterByNeighborhood: context.clusterByNeighborhood ?? true, // Default to true
    // Hotels for commute calculation
    hotels: rawRequest.hotels,
    // Enrichment options
    enrichWithPlaceResolution: PLACE_RESOLUTION_CONFIG.enabled,
    enrichWithCommute: COMMUTE_CONFIG.enabled,
    placeResolutionOptions: {
      skipExpensiveProviders: PLACE_RESOLUTION_CONFIG.skipExpensiveProviders,
      minConfidence: PLACE_RESOLUTION_CONFIG.minConfidence,
    },
  };
}

// ============================================
// INFER TRANSFERS FROM HOTELS/FLIGHTS (Using transfer-inference.ts)
// ============================================

/**
 * Use the production transfer-inference engine to get transfers
 * This uses OpenStreetMap for dynamic station/airport lookups
 */
async function inferTransfersFromAnchors(
  hotels: Array<{
    name: string;
    city: string;
    checkIn: string;
    checkOut: string;
    coordinates?: { lat: number; lng: number };
    address?: string;
  }>,
  flights?: Array<{
    from: string;
    to: string;
    date: string;
    time?: string;
  }>
): Promise<Array<{
  type: "airport_arrival" | "airport_departure" | "inter_city" | "same_city";
  date: string;
  fromCity: string;
  toCity: string;
  mode?: string;
  duration?: number;
}>> {
  // Convert hotels to HotelAnchor format
  const hotelAnchors: HotelAnchor[] = hotels.map((h, i) => ({
    id: `hotel-${i}`,
    type: 'hotel' as const,
    name: h.name,
    city: h.city,
    checkIn: h.checkIn,
    checkOut: h.checkOut,
    coordinates: h.coordinates,
    address: h.address,
  }));

  // Convert flights to FlightAnchor format
  const flightAnchors: FlightAnchor[] = (flights || []).map((f, i) => ({
    id: `flight-${i}`,
    type: 'flight' as const,
    from: f.from,
    to: f.to,
    date: f.date,
    time: f.time,
  }));

  console.log(`[API] Inferring transfers from ${hotelAnchors.length} hotels and ${flightAnchors.length} flights`);

  // Call the production transfer inference engine
  const structure = await inferTripStructure(flightAnchors, hotelAnchors, []);

  // Convert to the format expected by itinerary-service
  const transfers: Array<{
    type: "airport_arrival" | "airport_departure" | "inter_city" | "same_city";
    date: string;
    fromCity: string;
    toCity: string;
    mode?: string;
    duration?: number;
  }> = [];

  for (const transfer of structure.transfers) {
    transfers.push({
      type: transfer.type as "airport_arrival" | "airport_departure" | "inter_city" | "same_city",
      date: transfer.date,
      fromCity: transfer.from.city || '',
      toCity: transfer.to.city || '',
      mode: transfer.via?.mode || transfer.options?.[0]?.mode,
      duration: transfer.options?.[0]?.duration,
    });
  }

  console.log(`[API] Inferred ${transfers.length} transfers:`, transfers.map(t => `${t.type}: ${t.fromCity} → ${t.toCity}`).join(', '));

  return transfers;
}

// ============================================
// LEGACY: INFER TRANSFERS FROM CITIES (Fallback)
// ============================================

/**
 * Infer transfer slots from multi-city itineraries (legacy fallback)
 * Used when no hotels/flights are provided
 * Creates airport arrival/departure and inter-city transfers
 */
function inferTransfersFromCities(
  cities: string[],
  startDate: string,
  totalDays: number,
  arrivalAirport?: string,
  departureAirport?: string
): Array<{
  type: "airport_arrival" | "airport_departure" | "inter_city" | "same_city";
  date: string;
  fromCity: string;
  toCity: string;
  mode?: string;
  duration?: number;
}> {
  const transfers: Array<{
    type: "airport_arrival" | "airport_departure" | "inter_city" | "same_city";
    date: string;
    fromCity: string;
    toCity: string;
    mode?: string;
    duration?: number;
  }> = [];

  const start = new Date(startDate);
  const getDateString = (dayOffset: number) => {
    const d = new Date(start);
    d.setDate(d.getDate() + dayOffset);
    return d.toISOString().split("T")[0];
  };

  // Airport arrival on first day
  if (arrivalAirport && cities.length > 0) {
    transfers.push({
      type: "airport_arrival",
      date: startDate,
      fromCity: getAirportCity(arrivalAirport),
      toCity: cities[0],
      mode: "train",
      duration: getAirportTransferDuration(arrivalAirport),
    });
  }

  // Inter-city transfers for multi-city trips
  if (cities.length > 1) {
    // Distribute days evenly across cities
    const daysPerCity = Math.floor(totalDays / cities.length);
    let currentDay = 0;

    for (let i = 0; i < cities.length - 1; i++) {
      currentDay += daysPerCity;
      const transferDate = getDateString(currentDay);

      transfers.push({
        type: "inter_city",
        date: transferDate,
        fromCity: cities[i],
        toCity: cities[i + 1],
        mode: "shinkansen",
        duration: getShinkansenDuration(cities[i], cities[i + 1]),
      });
    }
  }

  // Airport departure on last day
  if (departureAirport && cities.length > 0) {
    const lastCity = cities[cities.length - 1];
    transfers.push({
      type: "airport_departure",
      date: getDateString(totalDays - 1),
      fromCity: lastCity,
      toCity: getAirportCity(departureAirport),
      mode: "train",
      duration: getAirportTransferDuration(departureAirport),
    });
  }

  return transfers;
}

// Airport code to city mapping
function getAirportCity(code: string): string {
  const AIRPORT_CITIES: Record<string, string> = {
    NRT: "Tokyo",
    HND: "Tokyo",
    KIX: "Osaka",
    ITM: "Osaka",
    NGO: "Nagoya",
    FUK: "Fukuoka",
    CTS: "Sapporo",
    UKB: "Kobe",
  };
  return AIRPORT_CITIES[code] || code;
}

// Approximate airport transfer durations (minutes)
function getAirportTransferDuration(code: string): number {
  const DURATIONS: Record<string, number> = {
    NRT: 60, // Narita Express ~1h
    HND: 25, // Monorail ~25min
    KIX: 75, // Haruka ~75min to Kyoto
    ITM: 30, // Osaka Itami ~30min
    NGO: 40, // Centrair ~40min
  };
  return DURATIONS[code] || 60;
}

// Approximate Shinkansen durations (minutes)
function getShinkansenDuration(from: string, to: string): number {
  const DURATIONS: Record<string, number> = {
    "Tokyo-Kyoto": 135,
    "Kyoto-Tokyo": 135,
    "Tokyo-Osaka": 150,
    "Osaka-Tokyo": 150,
    "Kyoto-Osaka": 15,
    "Osaka-Kyoto": 15,
    "Tokyo-Hiroshima": 240,
    "Hiroshima-Tokyo": 240,
    "Kyoto-Nara": 45,
    "Nara-Kyoto": 45,
  };
  return DURATIONS[`${from}-${to}`] || 120;
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

  // Process Day 1 - remove slots before arrival + transfer time
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

      // Check if slot ends before earliest possible activity time
      const slotEnd = slot.timeRange?.end || "23:59";
      const [endHour, endMin] = slotEnd.split(":").map(Number);
      const slotEndMins = endHour * 60 + endMin;

      if (slotEndMins <= earliestActivityMins) {
        console.log(`[itinerary-service] Removing Day 1 slot "${slot.slotType}" (${slot.timeRange?.start}-${slot.timeRange?.end}) - before arrival`);
        return false;
      }

      return true;
    });

    const removedCount = originalSlotCount - day1.slots.length;
    if (removedCount > 0) {
      console.log(`[itinerary-service] Removed ${removedCount} impossible slots from Day 1`);
    }
  }

  // Process last day - remove slots after departure time
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

      // Check if slot starts after latest possible time
      const slotStart = slot.timeRange?.start || "00:00";
      const [startHour, startMin] = slotStart.split(":").map(Number);
      const slotStartMins = startHour * 60 + startMin;

      if (slotStartMins >= latestActivityMins) {
        console.log(`[itinerary-service] Removing last day slot "${slot.slotType}" (${slot.timeRange?.start}-${slot.timeRange?.end}) - after departure prep`);
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
// GENERATE WELCOME MESSAGE
// ============================================

function generateWelcomeMessage(context: TripContext, totalDays: number): string {
  const travelerType = context.tripMode || "couples";
  const pace = context.pace || "moderate";
  const interests = context.interests?.slice(0, 3).join(", ") || "culture and food";

  const paceDescriptions: Record<string, string> = {
    relaxed: "taking it easy with plenty of downtime",
    moderate: "balancing activities with relaxation",
    packed: "maximizing every moment",
  };

  return `Welcome to your ${totalDays}-day adventure in ${context.destination}! This itinerary is designed for ${travelerType} who want to explore ${interests}, all while ${paceDescriptions[pace]}. From iconic landmarks to hidden gems, every day brings new highlights. Let's dive in! 🌸`;
}

// ============================================
// ROUTE HANDLER
// ============================================

export async function POST(request: NextRequest) {
  // Create debug logger early - we'll set tripId once generated
  const debugLogger = createValidationDebugLogger();
  // Set as current logger so itinerary-service.ts uses the same instance
  setCurrentValidationDebugLogger(debugLogger);

  try {
    const body = await request.json();

    // Capture user request for debugging
    debugLogger.captureUserRequest(body as Record<string, unknown>);

    // Validate request
    const validation = validateRequest(body);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_REQUEST", message: validation.error },
        },
        { status: 400 }
      );
    }

    // Check if Viator enrichment is requested
    const reqBody = body as GenerateStructuredRequest;
    const includeViatorTours = reqBody.includeViatorTours || VIATOR_ENRICHMENT_CONFIG.enabled;

    console.log("[API] Generating structured itinerary for:", validation.data.destination);
    if (includeViatorTours) {
      console.log("[API] Viator tour enrichment enabled");
    }

    // Capture validated context for debugging
    debugLogger.captureUserRequest(
      body as Record<string, unknown>,
      reqBody as unknown as Record<string, unknown>,
      validation.data as unknown as Record<string, unknown>
    );

    // Convert to ItineraryRequest - pass raw request for flight/transfer info
    const itineraryRequest = convertToItineraryRequest(validation.data, body as GenerateStructuredRequest);

    // If hotels are provided but transfers are not, infer transfers from hotels/flights
    if (reqBody.hotels && reqBody.hotels.length > 0 && (!reqBody.transfers || reqBody.transfers.length === 0)) {
      console.log("[API] Hotels provided without transfers - inferring from transfer-inference engine");

      // Convert any flights in the request format
      const flights = reqBody.arrivalAirport || reqBody.departureAirport ? undefined : undefined; // TODO: extract flights from other params if available

      const inferredTransfers = await inferTransfersFromAnchors(reqBody.hotels, flights);
      itineraryRequest.transfers = inferredTransfers;
    } else if (!reqBody.transfers || reqBody.transfers.length === 0) {
      // Legacy fallback: infer from cities array
      const cities = itineraryRequest.cities || [];
      if (cities.length > 0) {
        console.log("[API] No hotels/transfers provided - using legacy city-based inference");
        itineraryRequest.transfers = inferTransfersFromCities(
          cities,
          itineraryRequest.startDate || validation.data.startDate,
          itineraryRequest.totalDays || 7,
          reqBody.arrivalAirport,
          reqBody.departureAirport
        );
      }
    }

    // Capture request structures for debugging
    debugLogger.captureRequestStructures({
      itineraryRequest: itineraryRequest as unknown as Record<string, unknown>,
      flightConstraints: {
        arrivalFlightTime: reqBody.arrivalFlightTime,
        departureFlightTime: reqBody.departureFlightTime,
      },
      transfers: reqBody.transfers as Array<Record<string, unknown>> | undefined,
      anchors: reqBody.anchors as Array<Record<string, unknown>> | undefined,
      hotels: reqBody.hotels as Array<Record<string, unknown>> | undefined,
    });

    // Generate using unified itinerary service
    let result = await itineraryService.generate(itineraryRequest);

    // Apply remediation to fix common issues
    const flightConstraints: FlightConstraints = {
      arrivalFlightTime: reqBody.arrivalFlightTime,
      departureFlightTime: reqBody.departureFlightTime,
    };

    const remediationResult = remediateItinerary(result.itinerary, flightConstraints);
    result.itinerary = remediationResult.itinerary;

    // Log remediation changes for debugging
    if (remediationResult.changes.length > 0) {
      console.log(`[API] Applied ${remediationResult.changes.length} remediation fixes`);
    }

    // Capture remediation results for debugging
    debugLogger.captureRemediation(
      remediationResult.changes,
      [], // No LLM changes in basic remediation
      0,
      0
    );

    // Run validation and capture results
    const validationService = getValidationService();
    const validationState = validationService.validateItinerary(result.itinerary);
    debugLogger.captureValidation(validationState, validationState.healthScore);

    // Optional: Enrich with Viator tours if requested
    let viatorStats: ViatorEnrichmentStats | undefined;
    if (includeViatorTours) {
      try {
        const viatorResult = await enrichWithViatorTours(result.itinerary, {
          maxToursPerActivity: VIATOR_ENRICHMENT_CONFIG.maxToursPerActivity,
          onlyTopRankedActivities: VIATOR_ENRICHMENT_CONFIG.onlyTopRankedActivities,
        });
        result.itinerary = viatorResult.itinerary;
        viatorStats = viatorResult.stats;
        console.log(`[API] Viator enrichment: ${viatorStats.enhancedActivities} activities enhanced with ${viatorStats.totalTours} tours`);
      } catch (error) {
        console.warn("[API] Viator enrichment failed, continuing without tours:", error);
        // Continue without Viator enrichment
      }
    }

    // Generate unique tripId and attach to itinerary
    const tripId = generateTripId({
      destination: result.itinerary.destination || validation.data.destination,
      startDate: validation.data.startDate,
      partySize: (validation.data.travelers?.adults || 2) + (validation.data.travelers?.children || 0),
      tripDays: result.metadata.totalDays,
    });
    result.itinerary.tripId = tripId;
    console.log(`[API] Generated tripId: ${tripId}`);

    // Set tripId and capture itinerary summary for debugging
    debugLogger.setTripId(tripId);
    debugLogger.captureItinerarySummary(result.itinerary);

    // Save itinerary to disk for persistence
    try {
      await saveItineraryToDisk(result.itinerary);
    } catch (saveError) {
      console.warn("[API] Failed to save itinerary to disk:", saveError);
      // Continue anyway - frontend can still use the itinerary
    }

    // Save debug data to disk
    try {
      await debugLogger.save();
      // Clear the shared logger so next request gets a fresh instance
      clearValidationDebugLogger();
    } catch (debugSaveError) {
      console.warn("[API] Failed to save debug data:", debugSaveError);
    }

    // Generate welcome message
    const welcomeMessage = generateWelcomeMessage(
      validation.data,
      result.metadata.totalDays
    );

    // Return success response
    return NextResponse.json({
      success: true,
      data: {
        message: result.message || welcomeMessage,
        itinerary: result.itinerary,
        metadata: {
          generatedAt: result.metadata.generatedAt,
          provider: result.metadata.provider,
          source: result.metadata.source,
          totalDays: result.metadata.totalDays,
          totalSlots: result.metadata.totalSlots,
          totalOptions: result.metadata.totalOptions,
          hasPlaces: true,
          hasCommute: !!result.metadata.commuteCalculation?.totalCommutes,
          hasFoodPreferences: !!validation.data.dietaryRestrictions?.length,
          hasViatorEnhancements: viatorStats ? viatorStats.enhancedActivities > 0 : false,
          placeResolution: result.metadata.placeResolution,
          commuteCalculation: result.metadata.commuteCalculation,
          viatorEnrichment: viatorStats,
        },
      },
    });
  } catch (error) {
    console.error("[API] Error generating structured itinerary:", error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "GENERATION_ERROR",
          message: error instanceof Error ? error.message : "Failed to generate itinerary",
        },
      },
      { status: 500 }
    );
  }
}

// ============================================
// GET - Check API status
// ============================================

export async function GET() {
  const providerInfo = itineraryService.getProviderInfo();
  const config = itineraryService.getConfig();

  return NextResponse.json({
    success: true,
    data: {
      endpoint: "/api/itinerary/generate-structured",
      description: "Generate structured itineraries with multiple options per time slot",
      version: "2.0.0",
      provider: {
        type: providerInfo.provider,
        description: providerInfo.description,
        aiProvider: config.aiProvider,
      },
      features: [
        "Multiple ranked options per slot",
        "Place resolution (Foursquare/Yelp/Google)",
        "Commute calculation between activities",
        "Dietary restriction filtering",
        "Match reasons and tradeoffs",
        `Provider: ${providerInfo.provider} (${providerInfo.description})`,
      ],
      configuration: {
        placeResolution: PLACE_RESOLUTION_CONFIG,
        commute: COMMUTE_CONFIG,
      },
      exampleRequest: {
        destination: "Tokyo, Japan",
        startDate: "2025-03-15",
        endDate: "2025-03-20",
        travelers: { adults: 2, children: 1, childrenAges: [8] },
        budget: "moderate",
        pace: "moderate",
        interests: ["food", "culture", "anime"],
        dietaryRestrictions: ["vegetarian"],
        tripMode: "family",
      },
    },
  });
}
