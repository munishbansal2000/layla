// ============================================
// POST /api/itinerary/generate
// ============================================
// Generate a new itinerary using the orchestrator service

import { NextRequest, NextResponse } from "next/server";
import {
  getItineraryOrchestrator,
  GenerateItineraryRequest,
} from "@/lib/itinerary-orchestrator";
import { getItineraryStore } from "@/lib/itinerary-store";
import { TripMode, PaceMode, BudgetLevel } from "@/types/activity-suggestion";

// ============================================
// REQUEST VALIDATION
// ============================================

interface GenerateRequest {
  destination: {
    name: string;
    coordinates: { lat: number; lng: number };
    country: string;
  };
  startDate: string;
  endDate: string;
  travelers: {
    adults: number;
    children?: number;
    infants?: number;
  };
  tripMode?: TripMode;
  pace?: PaceMode;
  budget?: BudgetLevel;
  interests?: string[];
  dietaryRestrictions?: string[];
  mobilityNeeds?: string[];
  excludedCategories?: string[];
  mustSeeActivities?: string[];
  groundEntities?: boolean;
}

function validateRequest(body: any): { valid: true; data: GenerateItineraryRequest } | { valid: false; error: string } {
  if (!body.destination?.name) {
    return { valid: false, error: "Destination name is required" };
  }

  if (!body.destination?.coordinates?.lat || !body.destination?.coordinates?.lng) {
    return { valid: false, error: "Destination coordinates are required" };
  }

  if (!body.startDate || !body.endDate) {
    return { valid: false, error: "Start and end dates are required" };
  }

  // Validate dates
  const startDate = new Date(body.startDate);
  const endDate = new Date(body.endDate);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    return { valid: false, error: "Invalid date format. Use ISO date strings." };
  }

  if (endDate < startDate) {
    return { valid: false, error: "End date must be after start date" };
  }

  // Build validated request
  const data: GenerateItineraryRequest = {
    destination: {
      name: body.destination.name,
      coordinates: {
        lat: body.destination.coordinates.lat,
        lng: body.destination.coordinates.lng,
      },
      country: body.destination.country || "",
    },
    startDate: body.startDate,
    endDate: body.endDate,
    travelers: {
      adults: body.travelers?.adults ?? 2,
      children: body.travelers?.children ?? 0,
      infants: body.travelers?.infants ?? 0,
    },
    tripMode: body.tripMode || "couples",
    pace: body.pace || "normal",
    budget: body.budget || "moderate",
    interests: body.interests || [],
    dietaryRestrictions: body.dietaryRestrictions,
    mobilityNeeds: body.mobilityNeeds,
    excludedCategories: body.excludedCategories,
    mustSeeActivities: body.mustSeeActivities,
    groundEntities: body.groundEntities ?? false,
  };

  return { valid: true, data };
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
        { success: false, error: { code: "INVALID_REQUEST", message: validation.error } },
        { status: 400 }
      );
    }

    // Generate itinerary
    const orchestrator = getItineraryOrchestrator();
    const itinerary = await orchestrator.generateItinerary(validation.data);

    // Store the itinerary
    const store = getItineraryStore();
    store.save(itinerary);

    // Return response
    return NextResponse.json({
      success: true,
      data: {
        itinerary,
        meta: {
          generatedAt: itinerary.generatedAt,
          totalDays: itinerary.dateRange.totalDays,
          totalActivities: itinerary.stats.totalActivities,
          totalMeals: itinerary.stats.totalMeals,
        },
      },
    });
  } catch (error) {
    console.error("[API] Error generating itinerary:", error);

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
