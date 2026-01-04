/**
 * Trip Save/Load API
 *
 * Saves itineraries to disk and loads them by tripId.
 * Storage: ./data/trips/{tripId}.json
 */

import { NextRequest, NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import type { StructuredItineraryData } from "@/types/structured-itinerary";

// Directory to store trips
const TRIPS_DIR = path.join(process.cwd(), "data", "trips");

// Ensure the directory exists
async function ensureTripsDir() {
  try {
    await fs.mkdir(TRIPS_DIR, { recursive: true });
  } catch (error) {
    console.error("[API trips/save] Failed to create trips directory:", error);
  }
}

// ============================================
// POST /api/trips/save - Save itinerary to disk
// ============================================

interface SaveRequest {
  itinerary: StructuredItineraryData;
}

export async function POST(request: NextRequest) {
  try {
    const body: SaveRequest = await request.json();

    if (!body.itinerary) {
      return NextResponse.json(
        { error: "itinerary is required" },
        { status: 400 }
      );
    }

    const tripId = body.itinerary.tripId;
    if (!tripId) {
      return NextResponse.json(
        { error: "itinerary.tripId is required" },
        { status: 400 }
      );
    }

    await ensureTripsDir();

    const filePath = path.join(TRIPS_DIR, `${tripId}.json`);
    const content = JSON.stringify(body.itinerary, null, 2);

    await fs.writeFile(filePath, content, "utf-8");

    console.log("[API trips/save] Saved trip:", tripId, "to", filePath);

    return NextResponse.json({
      success: true,
      tripId,
      message: `Trip saved to ${filePath}`,
    });
  } catch (error) {
    console.error("[API trips/save] Error:", error);
    return NextResponse.json(
      { error: "Failed to save trip" },
      { status: 500 }
    );
  }
}

// ============================================
// GET /api/trips/save?tripId=xxx - Load itinerary from disk
// ============================================

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tripId = searchParams.get("tripId");

    // If no tripId provided, list all saved trips
    if (!tripId) {
      await ensureTripsDir();

      try {
        const files = await fs.readdir(TRIPS_DIR);
        const trips = files
          .filter((f) => f.endsWith(".json"))
          .map((f) => f.replace(".json", ""));

        return NextResponse.json({
          success: true,
          trips,
          count: trips.length,
        });
      } catch {
        return NextResponse.json({
          success: true,
          trips: [],
          count: 0,
        });
      }
    }

    // Load specific trip
    const filePath = path.join(TRIPS_DIR, `${tripId}.json`);

    try {
      const content = await fs.readFile(filePath, "utf-8");
      const itinerary = JSON.parse(content) as StructuredItineraryData;

      return NextResponse.json({
        success: true,
        tripId,
        itinerary,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return NextResponse.json(
          { error: `Trip not found: ${tripId}` },
          { status: 404 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("[API trips/save] Error:", error);
    return NextResponse.json(
      { error: "Failed to load trip" },
      { status: 500 }
    );
  }
}

// ============================================
// DELETE /api/trips/save?tripId=xxx - Delete itinerary
// ============================================

export async function DELETE(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tripId = searchParams.get("tripId");

    if (!tripId) {
      return NextResponse.json(
        { error: "tripId is required" },
        { status: 400 }
      );
    }

    const filePath = path.join(TRIPS_DIR, `${tripId}.json`);

    try {
      await fs.unlink(filePath);
      return NextResponse.json({
        success: true,
        message: `Deleted trip: ${tripId}`,
      });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return NextResponse.json(
          { error: `Trip not found: ${tripId}` },
          { status: 404 }
        );
      }
      throw error;
    }
  } catch (error) {
    console.error("[API trips/save] Error:", error);
    return NextResponse.json(
      { error: "Failed to delete trip" },
      { status: 500 }
    );
  }
}
