/**
 * API Route: Undo a reshuffling action
 * POST /api/reshuffle/undo
 */

import { NextRequest, NextResponse } from "next/server";
import { ReshufflingService } from "@/lib/reshuffling-service";
import { getItineraryStore } from "@/lib/itinerary-store";
import type { UndoReshuffleRequest } from "@/types/reshuffling";

// Create a singleton service to maintain undo history across requests
// In production, this would be stored in Redis or a database
const reshufflingService = new ReshufflingService();

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as UndoReshuffleRequest & { dayIndex?: number };

    // Validate required fields
    if (!body.tripId) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_REQUEST", message: "tripId is required" } },
        { status: 400 }
      );
    }

    if (!body.undoToken) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_REQUEST", message: "undoToken is required" } },
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

    // Attempt to undo
    const result = reshufflingService.undoReshuffle(body);

    if (result.success && result.restoredSchedule) {
      // Update the itinerary in store
      const dayIndex = body.dayIndex || 0;
      const updatedDays = [...itinerary.days];
      updatedDays[dayIndex] = result.restoredSchedule;

      getItineraryStore().save({
        ...itinerary,
        days: updatedDays,
      });
    }

    return NextResponse.json({
      success: result.success,
      data: {
        restoredSchedule: result.restoredSchedule,
        message: result.message,
        tripId: body.tripId,
      },
    });
  } catch (error) {
    console.error("[Reshuffle Undo] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Failed to undo reshuffle",
        },
      },
      { status: 500 }
    );
  }
}
