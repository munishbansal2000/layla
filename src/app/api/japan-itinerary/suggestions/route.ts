// ============================================
// Japan Itinerary Suggestions API
// Returns POI suggestions for filling empty slots
// Uses unified suggestions-service for provider abstraction
// ============================================

import { NextRequest, NextResponse } from "next/server";
import {
  suggestions,
  type SuggestionsRequest,
  type Suggestion,
} from "@/lib/suggestions-service";

export async function POST(request: NextRequest) {
  try {
    // Defensive body validation - read as text first to handle empty body gracefully
    const text = await request.text();

    if (!text || text.trim() === "") {
      // This can happen with React Strict Mode double-rendering or browser prefetch
      // Log at debug level to reduce noise
      console.debug("[suggestions API] Empty request body received (ignoring)");
      return NextResponse.json(
        { success: false, error: "Request body is empty" },
        { status: 400 }
      );
    }

    let body: Record<string, unknown>;
    try {
      body = JSON.parse(text);
    } catch (parseError) {
      console.error("[suggestions API] Invalid JSON in request body:", text.substring(0, 200));
      return NextResponse.json(
        { success: false, error: "Invalid JSON in request body" },
        { status: 400 }
      );
    }

    console.log("[suggestions API] POST request body:", JSON.stringify(body, null, 2));

    const suggestionsRequest: SuggestionsRequest = {
      city: String(body.city ?? ""),
      slotType: body.slotType as SuggestionsRequest["slotType"],
      coordinates: body.coordinates as SuggestionsRequest["coordinates"],
      maxDistance: Number(body.maxDistance ?? 2000),
      limit: Number(body.limit ?? 10),
      excludeIds: (body.excludeIds as string[]) ?? [],
      excludeNames: (body.excludeNames as string[]) ?? [],
      dayOfWeek: Number(body.dayOfWeek ?? new Date().getDay()),
      filterClosed: Boolean(body.filterClosed ?? false),
      existingMealSlots: (body.existingMealSlots as SuggestionsRequest["existingMealSlots"]) ?? [],
      slotDuration: body.slotDuration as number | undefined,
      userPreferences: body.userPreferences as string | undefined,
      tripContext: body.tripContext as string | undefined,
    };

    console.log("[suggestions API] Parsed params:", {
      city: suggestionsRequest.city,
      slotType: suggestionsRequest.slotType,
      coordinates: suggestionsRequest.coordinates,
      maxDistance: suggestionsRequest.maxDistance,
      limit: suggestionsRequest.limit,
      excludeIdsCount: suggestionsRequest.excludeIds?.length ?? 0,
      excludeNamesCount: suggestionsRequest.excludeNames?.length ?? 0,
      existingMealSlots: suggestionsRequest.existingMealSlots,
    });

    if (!suggestionsRequest.city) {
      console.log("[suggestions API] Error: City is required");
      return NextResponse.json(
        { success: false, error: "City is required" },
        { status: 400 }
      );
    }

    // Use the unified suggestions service
    const result = await suggestions.getSuggestions(suggestionsRequest);

    console.log("[suggestions API] Generated response:", {
      success: true,
      provider: result.metadata.provider,
      totalSuggestions: result.metadata.totalSuggestions,
      ticketSummary: result.metadata.ticketSummary,
      firstFewNames: result.suggestions.slice(0, 3).map((s: Suggestion) => s.activity.name),
    });

    return NextResponse.json({
      success: true,
      data: {
        suggestions: result.suggestions,
        metadata: result.metadata,
      },
    });
  } catch (error) {
    console.error("[suggestions API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}

// GET endpoint for API documentation
export async function GET() {
  const providerInfo = suggestions.getProviderInfo();

  return NextResponse.json({
    success: true,
    data: {
      endpoint: "/api/japan-itinerary/suggestions",
      method: "POST",
      description: "Get activity suggestions for filling empty time slots, with ticket/booking information",
      currentProvider: providerInfo,
      parameters: {
        city: "string (required) - City name (tokyo, kyoto, osaka, etc.)",
        slotType: "string (required) - morning, lunch, afternoon, dinner, evening",
        coordinates: "object (optional) - { lat: number, lng: number } for location-based suggestions",
        maxDistance: "number (optional) - Max distance in meters, default 2000",
        limit: "number (optional) - Max suggestions to return, default 10",
        excludeIds: "string[] (optional) - POI IDs to exclude",
        excludeNames: "string[] (optional) - Activity names to exclude",
        dayOfWeek: "number (optional) - Day of week (0=Sunday), for availability filtering",
        filterClosed: "boolean (optional) - Exclude closed places, default false",
        existingMealSlots: "string[] (optional) - Already-filled meal types to avoid duplicates",
        slotDuration: "number (optional) - Available minutes for time conflict detection",
        userPreferences: "string (optional) - User preferences (for LLM provider)",
        tripContext: "string (optional) - Trip context (for LLM provider)",
      },
      response: {
        suggestions: [
          {
            id: "string",
            type: "attraction | restaurant | experience | must-see",
            activity: { name: "string", category: "string", duration: "number", "...": "..." },
            distance: "number | null",
            ticketRequirement: "required | optional | free",
            bookingInfo: {
              hasTickets: "boolean",
              ticketType: "required | optional | free",
              experienceCount: "number",
            },
            availability: {
              isOpen: "boolean",
              openTime: "string",
              closeTime: "string",
              confidence: "number",
            },
            timeConflict: {
              hasConflict: "boolean",
              severity: "minor | moderate | major",
            },
            source: "data | llm",
          },
        ],
        metadata: {
          provider: "data | llm",
          totalSuggestions: "number",
          ticketSummary: { required: "number", optional: "number", free: "number" },
        },
      },
      example: {
        city: "tokyo",
        slotType: "afternoon",
        coordinates: { lat: 35.6762, lng: 139.6503 },
        maxDistance: 1500,
        limit: 5,
      },
    },
  });
}
