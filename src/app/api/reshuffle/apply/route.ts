/**
 * API Route: Apply a reshuffling action
 * POST /api/reshuffle/apply
 */

import { NextRequest, NextResponse } from "next/server";
import { ReshufflingService } from "@/lib/reshuffling-service";
import { getItineraryStore } from "@/lib/itinerary-store";
import type { ApplyReshuffleRequest } from "@/types/reshuffling";

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as ApplyReshuffleRequest;

    // Validate required fields
    if (!body.tripId) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_REQUEST", message: "tripId is required" } },
        { status: 400 }
      );
    }

    if (!body.selectedStrategy) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_REQUEST", message: "selectedStrategy is required" } },
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

    // Get the current day's schedule (default to day 0)
    const dayIndex = 0; // Could be derived from trigger or request
    const currentSchedule = itinerary.days[dayIndex];

    if (!currentSchedule) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_STATE", message: "No schedule for current day" } },
        { status: 400 }
      );
    }

    // Create reshuffling service and apply the strategy
    const service = new ReshufflingService();
    const result = service.applyReshuffle(body, currentSchedule);

    if (result.success) {
      // Update the itinerary in store
      const updatedDays = [...itinerary.days];
      updatedDays[dayIndex] = result.updatedSchedule;

      getItineraryStore().save({
        ...itinerary,
        days: updatedDays,
      });
    }

    return NextResponse.json({
      success: result.success,
      data: {
        updatedSchedule: result.updatedSchedule,
        changes: result.changes,
        undoToken: result.undoToken,
        message: result.message,
        tripId: body.tripId,
        dayIndex,
      },
    });
  } catch (error) {
    console.error("[Reshuffle Apply] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Failed to apply reshuffle",
        },
      },
      { status: 500 }
    );
  }
}
