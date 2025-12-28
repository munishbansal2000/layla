/**
 * API Route: Check for triggers and get reshuffling suggestions
 * POST /api/reshuffle/check
 */

import { NextRequest, NextResponse } from "next/server";
import { ReshufflingService } from "@/lib/reshuffling-service";
import { getItineraryStore } from "@/lib/itinerary-store";
import type { CheckTriggersRequest } from "@/types/reshuffling";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CheckTriggersRequest;

    // Validate required fields
    if (!body.tripId) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_REQUEST", message: "tripId is required" } },
        { status: 400 }
      );
    }

    // Get the itinerary from store
    const itinerary = getItineraryStore().get(body.tripId);
    if (!itinerary) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Itinerary not found" } },
        { status: 404 }
      );
    }

    // Get current day's schedule
    const currentDayIndex = Math.min(
      parseInt(body.currentTime?.split("T")[0] || "0") || 0,
      itinerary.days.length - 1
    );
    const currentSchedule = itinerary.days[currentDayIndex];

    if (!currentSchedule) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_STATE", message: "No schedule for current day" } },
        { status: 400 }
      );
    }

    // Create reshuffling service and check triggers
    const service = new ReshufflingService();
    const result = service.checkTriggers(body, currentSchedule);

    return NextResponse.json({
      success: true,
      data: {
        ...result,
        tripId: body.tripId,
        dayIndex: currentDayIndex,
      },
    });
  } catch (error) {
    console.error("[Reshuffle Check] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Failed to check triggers",
        },
      },
      { status: 500 }
    );
  }
}
