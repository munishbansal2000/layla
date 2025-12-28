// ============================================
// Japan Itinerary API Route
// Generates itineraries from locally curated Japan POI data
// In production, this can be swapped to call real APIs
// ============================================

import { NextResponse } from "next/server";
import {
  generateJapanItinerary,
  type JapanItineraryRequest,
} from "@/lib/japan-itinerary-generator";
import { getAvailableCities } from "@/lib/japan-data-service";

// ============================================
// POST - Generate Japan Itinerary
// ============================================

export async function POST(request: Request) {
  try {
    const body = await request.json();

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
    const invalidCities = cities.filter(
      (c: string) => !availableCities.includes(c.toLowerCase())
    );

    if (invalidCities.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `Cities not available: ${invalidCities.join(", ")}`,
          availableCities,
        },
        { status: 400 }
      );
    }

    // Build request
    const itineraryRequest: JapanItineraryRequest = {
      cities,
      startDate,
      daysPerCity: body.daysPerCity,
      totalDays: body.totalDays,
      pace: body.pace || "moderate",
      interests: body.interests || [],
      includeKlookExperiences: body.includeKlookExperiences !== false,
    };

    // Generate itinerary
    const itinerary = await generateJapanItinerary(itineraryRequest);

    // Calculate metadata
    const totalSlots = itinerary.days.reduce((sum, d) => sum + d.slots.length, 0);
    const totalOptions = itinerary.days.reduce(
      (sum, d) => sum + d.slots.reduce((s, slot) => s + slot.options.length, 0),
      0
    );

    return NextResponse.json({
      success: true,
      data: {
        itinerary,
        metadata: {
          generatedAt: new Date().toISOString(),
          source: "local-japan-data",
          totalDays: itinerary.days.length,
          totalSlots,
          totalOptions,
          cities: itinerary.days.reduce((acc, d) => {
            if (!acc.includes(d.city)) acc.push(d.city);
            return acc;
          }, [] as string[]),
        },
      },
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
