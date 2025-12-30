// ============================================
// Japan Itinerary API Route
// Generates itineraries using unified itinerary-service
// Supports both data-driven and LLM-based generation
// ============================================

import { NextResponse } from "next/server";
import {
  itineraryService,
  type ItineraryRequest,
} from "@/lib/itinerary-service";
import { getAvailableCities } from "@/lib/japan-data-service";

// ============================================
// POST - Generate Japan Itinerary
// ============================================

export async function POST(request: Request) {
  try {
    const body = await request.json();
    console.log("[japan-itinerary] POST request body:", JSON.stringify(body, null, 2));

    // Validate required fields
    const { cities, startDate } = body;

    if (!cities || !Array.isArray(cities) || cities.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "cities array is required",
          example: {
            cities: ["Tokyo", "Kyoto", "Osaka"],
            startDate: "2025-04-15",
          },
        },
        { status: 400 }
      );
    }

    if (!startDate) {
      return NextResponse.json(
        {
          success: false,
          error: "startDate is required (YYYY-MM-DD format)",
        },
        { status: 400 }
      );
    }

    // Validate cities are available
    const availableCities = await getAvailableCities();
    console.log("[japan-itinerary] Available cities from index:", availableCities);
    console.log("[japan-itinerary] Requested cities:", cities);

    const invalidCities = cities.filter(
      (c: string) => !availableCities.includes(c.toLowerCase())
    );
    console.log("[japan-itinerary] Invalid cities:", invalidCities);

    if (invalidCities.length > 0) {
      const errorResponse = {
        success: false,
        error: `Cities not available: ${invalidCities.join(", ")}`,
        availableCities,
      };
      console.log("[japan-itinerary] Returning 400 error:", errorResponse);
      return NextResponse.json(errorResponse, { status: 400 });
    }

    // Build request using unified itinerary service
    const itineraryRequest: ItineraryRequest = {
      cities,
      startDate,
      daysPerCity: body.daysPerCity,
      totalDays: body.totalDays,
      pace: body.pace || "moderate",
      interests: body.interests || [],
      includeKlookExperiences: body.includeKlookExperiences !== false,
      // LLM-specific options
      userPreferences: body.userPreferences,
      tripContext: body.tripContext,
      travelers: body.travelers,
      budget: body.budget,
    };

    console.log("[japan-itinerary] Itinerary request:", JSON.stringify(itineraryRequest, null, 2));

    // Generate itinerary using unified service
    const result = await itineraryService.generate(itineraryRequest);

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error("[japan-itinerary] Error generating itinerary:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to generate itinerary",
      },
      { status: 500 }
    );
  }
}

// ============================================
// GET - API Documentation & Available Cities
// ============================================

export async function GET() {
  try {
    const availableCities = await getAvailableCities();

    return NextResponse.json({
      success: true,
      data: {
        endpoint: "/api/japan-itinerary",
        description:
          "Generate structured Japan travel itineraries from locally curated POI data. " +
          "This uses real data from OpenStreetMap, Wikidata, and Klook to build multi-city itineraries. " +
          "In production, this can be swapped with real-time API calls.",
        availableCities,
        parameters: {
          cities: {
            type: "string[]",
            required: true,
            description: "Array of city names to visit in order",
            example: ["Tokyo", "Kyoto", "Osaka"],
          },
          startDate: {
            type: "string",
            required: true,
            description: "Trip start date in YYYY-MM-DD format",
            example: "2025-04-15",
          },
          daysPerCity: {
            type: "object",
            required: false,
            description: "Optional: days to spend in each city",
            example: { tokyo: 3, kyoto: 2, osaka: 2 },
          },
          totalDays: {
            type: "number",
            required: false,
            description: "Optional: total trip days (auto-distributes across cities)",
            example: 7,
          },
          pace: {
            type: "string",
            required: false,
            description: "Trip pace",
            options: ["relaxed", "moderate", "packed"],
            default: "moderate",
          },
          interests: {
            type: "string[]",
            required: false,
            description: "User interests for activity prioritization",
            example: ["temples", "food", "nature"],
          },
          includeKlookExperiences: {
            type: "boolean",
            required: false,
            description: "Include bookable Klook experiences as options",
            default: true,
          },
        },
        exampleRequest: {
          cities: ["Tokyo", "Kyoto", "Osaka"],
          startDate: "2025-04-15",
          totalDays: 7,
          pace: "moderate",
          interests: ["temples", "food"],
          includeKlookExperiences: true,
        },
        responseStructure: {
          itinerary: {
            destination: "Japan",
            country: "Japan",
            days: [
              {
                dayNumber: 1,
                date: "2025-04-15",
                city: "Tokyo",
                title: "Exploring Shibuya & Harajuku",
                slots: [
                  {
                    slotId: "day1-morning",
                    slotType: "morning",
                    timeRange: { start: "09:00", end: "12:00" },
                    options: ["... ranked activity options ..."],
                    commuteFromPrevious: "{ duration, distance, method }",
                  },
                ],
                accommodation: "{ hotel info }",
                cityTransition: "{ shinkansen info if travel day }",
              },
            ],
            generalTips: ["..."],
            estimatedBudget: { total: { min: 0, max: 0 }, currency: "JPY" },
          },
        },
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to load API info",
      },
      { status: 500 }
    );
  }
}
