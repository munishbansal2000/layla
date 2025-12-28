// ============================================
// POST /api/trips/generate
// ============================================
// Thin wrapper around /api/itinerary/generate for backward compatibility.
// All trip generation now goes through the ItineraryOrchestrator.

import { NextRequest, NextResponse } from "next/server";
import {
  getItineraryOrchestrator,
  GenerateItineraryRequest,
} from "@/lib/itinerary-orchestrator";
import { getItineraryStore } from "@/lib/itinerary-store";
import { validateTripDates } from "@/lib/date-validation";
import type { TripMode, PaceMode, BudgetLevel } from "@/types/activity-suggestion";

// ============================================
// REQUEST TYPES
// ============================================

interface TripGenerateRequest {
  destination: string;
  startDate: string;
  endDate: string;
  travelers?: {
    adults?: number;
    children?: number;
    infants?: number;
    childrenAges?: number[];
  };
  preferences?: {
    budget?: string;
    pace?: string;
    interests?: string[];
    travelStyle?: string;
    dietaryRestrictions?: string[];
    accessibilityNeeds?: string[];
  };
  additionalNotes?: string;
}

// ============================================
// HELPERS
// ============================================

function mapPace(pace?: string): PaceMode {
  switch (pace?.toLowerCase()) {
    case "relaxed": return "relaxed";
    case "packed":
    case "ambitious": return "ambitious";
    default: return "normal";
  }
}

function mapBudget(budget?: string): BudgetLevel {
  switch (budget?.toLowerCase()) {
    case "budget":
    case "cheap": return "budget";
    case "luxury":
    case "splurge": return "luxury";
    default: return "moderate";
  }
}

function inferTripMode(request: TripGenerateRequest): TripMode {
  const notes = (request.additionalNotes || "").toLowerCase();
  const style = request.preferences?.travelStyle?.toLowerCase();
  const travelers = request.travelers;

  if (notes.includes("honeymoon") || notes.includes("romantic")) return "honeymoon";
  if (notes.includes("family") || (travelers?.children && travelers.children > 0)) return "family";
  if (travelers?.adults === 1 && !travelers?.children) return "solo";
  if (notes.includes("friends") || notes.includes("group")) return "friends";
  if (notes.includes("girls")) return "girls-trip";
  if (notes.includes("guys") || notes.includes("bachelor")) return "guys-trip";

  return "couples";
}

// ============================================
// ROUTE HANDLER
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body: TripGenerateRequest = await request.json();

    // Validate required fields
    if (!body.destination || !body.startDate || !body.endDate) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "Missing required fields: destination, startDate, endDate",
          },
        },
        { status: 400 }
      );
    }

    // Validate that dates are in the future
    const dateValidation = validateTripDates(body.startDate, body.endDate);
    if (!dateValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: dateValidation.error!.code,
            message: dateValidation.error!.message,
          },
        },
        { status: 400 }
      );
    }

    // Parse destination
    const destParts = body.destination.split(",");
    const cityName = destParts[0]?.trim() || body.destination;
    const countryName = destParts[1]?.trim() || "";

    // Build orchestrator request
    const orchestratorRequest: GenerateItineraryRequest = {
      destination: {
        name: cityName,
        coordinates: { lat: 0, lng: 0 }, // Would need geocoding
        country: countryName,
      },
      startDate: body.startDate,
      endDate: body.endDate,
      travelers: {
        adults: body.travelers?.adults || 2,
        children: body.travelers?.children || 0,
        infants: body.travelers?.infants || 0,
      },
      tripMode: inferTripMode(body),
      pace: mapPace(body.preferences?.pace),
      budget: mapBudget(body.preferences?.budget),
      interests: body.preferences?.interests || [],
      dietaryRestrictions: body.preferences?.dietaryRestrictions,
      mobilityNeeds: body.preferences?.accessibilityNeeds,
      groundEntities: true,
    };

    // Generate using orchestrator
    console.log("[trips/generate] Delegating to ItineraryOrchestrator");
    const orchestrator = getItineraryOrchestrator();
    const itinerary = await orchestrator.generateItinerary(orchestratorRequest);

    // Store for subsequent operations
    const store = getItineraryStore();
    store.save(itinerary);

    // Return the generated itinerary
    return NextResponse.json({
      success: true,
      data: {
        itinerary,
        meta: {
          generatedAt: itinerary.generatedAt,
          totalDays: itinerary.dateRange.totalDays,
          totalActivities: itinerary.stats.totalActivities,
          totalMeals: itinerary.stats.totalMeals,
          averageScore: itinerary.stats.averageScore,
        },
      },
    });
  } catch (error) {
    console.error("[trips/generate] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "GENERATION_ERROR",
          message: error instanceof Error ? error.message : "Failed to generate trip",
        },
      },
      { status: 500 }
    );
  }
}
