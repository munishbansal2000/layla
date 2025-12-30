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
import {
  itineraryService,
  enrichWithViatorTours,
  type ItineraryRequest,
  type ViatorEnrichmentStats,
} from "@/lib/itinerary-service";
import { validateTripDates } from "@/lib/date-validation";
import type { TripContext } from "@/types/structured-itinerary";

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

function convertToItineraryRequest(context: ExtendedTripContext): ItineraryRequest {
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
    // Constraints
    mustHave: context.mustHave,
    mustAvoid: context.mustAvoid,
    anchors: context.anchors,
    clusterByNeighborhood: context.clusterByNeighborhood ?? true, // Default to true
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
  try {
    const body = await request.json();

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

    // Convert to ItineraryRequest
    const itineraryRequest = convertToItineraryRequest(validation.data);

    // Generate using unified itinerary service
    let result = await itineraryService.generate(itineraryRequest);

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
