/**
 * Full Pipeline Test API Route
 *
 * Tests the complete compact → enriched pipeline using production code:
 * 1. itinerary-service-compact - generates token-efficient itinerary from OpenAI
 * 2. itinerary-enrichment-pipeline - enriches with places, restaurants, routing
 *
 * Usage: GET /api/test/full-pipeline
 */

import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { itineraryServiceCompact } from "@/lib/itinerary-service-compact";
import { enrichItinerary } from "@/lib/itinerary-enrichment-pipeline";

const OUTPUT_DIR = path.join(process.cwd(), "output");

// Test request matching the family Japan trip scenario
const TEST_REQUEST = {
  cities: ["Tokyo", "Kyoto"],
  startDate: "2026-03-15",
  totalDays: 5,
  daysPerCity: { Tokyo: 3, Kyoto: 2 },
  pace: "relaxed" as const,
  budget: "moderate" as const,
  travelers: { adults: 2, children: 2, childrenAges: [8, 12] },
  interests: ["ramen", "temples", "anime", "art", "Pokemon", "gaming"],
  userPreferences:
    "Kids are really into Pokemon and gaming. We are vegetarian (no meat, but fish is okay).",
  tripContext: "Family trip with 2 kids ages 8 and 12",
  arrivalFlightTime: "15:00",
  arrivalAirport: "NRT",
  departureFlightTime: "10:00",
  departureAirport: "KIX",
  hotels: [
    {
      name: "Park Hyatt Tokyo",
      city: "Tokyo",
      checkIn: "2026-03-15",
      checkOut: "2026-03-18",
      coordinates: { lat: 35.6855, lng: 139.6907 },
    },
    {
      name: "Ritz-Carlton Kyoto",
      city: "Kyoto",
      checkIn: "2026-03-18",
      checkOut: "2026-03-20",
      coordinates: { lat: 35.0116, lng: 135.7681 },
    },
  ],
  anchors: [
    {
      name: "teamLab Planets",
      city: "Tokyo",
      date: "2026-03-16",
      startTime: "14:00",
      duration: 150,
      category: "museum",
    },
    {
      name: "Tokyo Sushi Academy - Sushi Making Class",
      city: "Tokyo",
      date: "2026-03-17",
      startTime: "11:00",
      duration: 180,
      category: "cultural-experience",
    },
    {
      name: "Fushimi Inari Sunrise Tour",
      city: "Kyoto",
      date: "2026-03-19",
      startTime: "05:30",
      duration: 180,
      category: "shrine",
    },
  ],
  mustHave: [
    "Senso-ji Temple",
    "Arashiyama Bamboo Grove",
    "Nara Deer Park",
    "Nintendo Store",
  ],
  mustAvoid: ["crowded tourist traps", "sushi restaurants", "theme parks"],
  transfers: [
    {
      type: "airport_arrival" as const,
      date: "2026-03-15",
      fromCity: "Narita Airport",
      toCity: "Tokyo",
      mode: "narita-express",
      duration: 90,
    },
    {
      type: "inter_city" as const,
      date: "2026-03-18",
      fromCity: "Tokyo",
      toCity: "Kyoto",
      mode: "shinkansen",
      duration: 140,
    },
    {
      type: "airport_departure" as const,
      date: "2026-03-20",
      fromCity: "Kyoto",
      toCity: "Kansai Airport",
      mode: "haruka-express",
      duration: 75,
    },
  ],
};

export async function GET(request: Request) {
  const startTime = Date.now();
  const results: Record<string, unknown> = {
    request: TEST_REQUEST,
    stages: {},
  };

  // Check for cache bypass via query param
  const url = new URL(request.url);
  const bypassCache = url.searchParams.get("nocache") === "true";

  // Temporarily set AI_MODE=prod to bypass cache if requested
  const originalMode = process.env.AI_MODE;
  if (bypassCache) {
    process.env.AI_MODE = "prod";
    console.log("[Pipeline] Cache bypass enabled - AI_MODE set to prod");
  }

  try {
    // Ensure output directory exists
    await fs.mkdir(OUTPUT_DIR, { recursive: true });

    // ========================================
    // STAGE 1: Generate Compact Itinerary
    // ========================================
    console.log("\n[Pipeline] Stage 1: Generating compact itinerary...");
    const stage1Start = Date.now();

    const compactResult = await itineraryServiceCompact.generate(TEST_REQUEST);

    results.stages = {
      ...(results.stages as object),
      compact: {
        duration: Date.now() - stage1Start,
        success: !!compactResult.itinerary,
      },
    };

    if (!compactResult.itinerary) {
      throw new Error("Compact generation failed");
    }

    // Save compact output
    await fs.writeFile(
      path.join(OUTPUT_DIR, "pipeline-1-compact.json"),
      JSON.stringify(compactResult.itinerary, null, 2)
    );
    console.log(`[Pipeline] Stage 1 complete: ${Date.now() - stage1Start}ms`);

    // ========================================
    // STAGE 2: Enrich with Places, Restaurants, Routing
    // ========================================
    console.log("\n[Pipeline] Stage 2: Enriching itinerary...");
    const stage2Start = Date.now();

    const enrichedResult = await enrichItinerary(compactResult.itinerary, {
      flightConstraints: {
        arrivalFlightTime: TEST_REQUEST.arrivalFlightTime,
        departureFlightTime: TEST_REQUEST.departureFlightTime,
      },
      preferences: {
        dietaryRestrictions: ["vegetarian"],
        cuisinePreferences: ["ramen", "japanese"],
      },
    });

    results.stages = {
      ...(results.stages as object),
      enrichment: {
        duration: Date.now() - stage2Start,
        stats: enrichedResult.stats,
        errors: enrichedResult.errors,
      },
    };

    // Save enriched output
    await fs.writeFile(
      path.join(OUTPUT_DIR, "pipeline-2-enriched.json"),
      JSON.stringify(enrichedResult.itinerary, null, 2)
    );
    console.log(`[Pipeline] Stage 2 complete: ${Date.now() - stage2Start}ms`);

    // ========================================
    // SUMMARY
    // ========================================
    const totalDuration = Date.now() - startTime;
    const itinerary = enrichedResult.itinerary;

    // Count activities
    let totalActivities = 0;
    let totalRestaurants = 0;
    let totalRoutes = 0;

    for (const day of itinerary.days) {
      for (const slot of day.slots) {
        if (slot.slotType === "lunch" || slot.slotType === "dinner") {
          totalRestaurants += slot.options.length;
        } else {
          totalActivities += slot.options.length;
        }
        if (slot.commuteFromPrevious) {
          totalRoutes++;
        }
      }
    }

    results.summary = {
      totalDuration,
      days: itinerary.days.length,
      activities: totalActivities,
      restaurants: totalRestaurants,
      routes: totalRoutes,
      enrichmentStats: enrichedResult.stats,
      outputFiles: [
        "output/pipeline-1-compact.json",
        "output/pipeline-2-enriched.json",
      ],
    };

    // Save summary
    await fs.writeFile(
      path.join(OUTPUT_DIR, "pipeline-summary.json"),
      JSON.stringify(results, null, 2)
    );

    console.log("\n========================================");
    console.log("PIPELINE COMPLETE");
    console.log("========================================");
    console.log(`Total duration: ${totalDuration}ms`);
    console.log(`Days: ${itinerary.days.length}`);
    console.log(`Activities: ${totalActivities}`);
    console.log(`Restaurants: ${totalRestaurants}`);
    console.log(`Routes: ${totalRoutes}`);
    console.log("========================================\n");

    return NextResponse.json(results);
  } catch (error) {
    console.error("[Pipeline] Error:", error);

    results.error = error instanceof Error ? error.message : String(error);
    results.duration = Date.now() - startTime;

    // Save error output
    await fs.writeFile(
      path.join(OUTPUT_DIR, "pipeline-error.json"),
      JSON.stringify(results, null, 2)
    );

    return NextResponse.json(results, { status: 500 });
  } finally {
    // Restore original AI_MODE
    if (bypassCache && originalMode !== undefined) {
      process.env.AI_MODE = originalMode;
    }
  }
}
