// ============================================
// GET/PUT /api/itinerary/[id]/slot/[slotId]
// ============================================
// Get swap options and execute swaps for a specific slot
// Uses itinerary-service for slot operations

import { NextRequest, NextResponse } from "next/server";
import { getSwapOptions, swapActivity } from "@/lib/itinerary-service";
import { getItineraryStore } from "@/lib/itinerary-store";
import type { ActivityOption } from "@/types/structured-itinerary";

// ============================================
// GET - Get swap options for a slot
// ============================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; slotId: string }> }
) {
  try {
    const { id, slotId } = await params;
    const store = getItineraryStore();
    const storedItinerary = store.get(id);

    if (!storedItinerary) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Itinerary not found" } },
        { status: 404 }
      );
    }

    // Convert stored GeneratedItinerary to StructuredItineraryData format
    // For now, we need to find the day number from the slot ID
    const slotIdParts = slotId.match(/day(\d+)/);
    const dayNumber = slotIdParts ? parseInt(slotIdParts[1], 10) : 1;

    // Get the structured itinerary from the store's raw data
    // The store may have either format, so handle both
    const itinerary = (storedItinerary as { days?: Array<{ dayNumber: number; city: string; slots: unknown[] }> }).days
      ? storedItinerary as unknown as import("@/types/structured-itinerary").StructuredItineraryData
      : null;

    if (!itinerary) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_FORMAT", message: "Itinerary format not supported for swap operations" } },
        { status: 400 }
      );
    }

    const slotDetails = await getSwapOptions(itinerary, dayNumber, slotId);

    if (!slotDetails) {
      return NextResponse.json(
        { success: false, error: { code: "SLOT_NOT_FOUND", message: "Slot not found in itinerary" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        slot: {
          id: slotDetails.slotId,
          dayNumber: slotDetails.dayNumber,
          currentActivity: slotDetails.currentActivity,
        },
        alternatives: slotDetails.alternatives.map((alt) => ({
          activityId: alt.id,
          name: alt.activity.activity.name,
          description: alt.activity.activity.description,
          category: alt.activity.activity.category,
          score: alt.score,
          reason: alt.reason,
          benefits: alt.benefits,
          tradeoffs: alt.tradeoffs,
          distance: alt.distance,
        })),
      },
    });
  } catch (error) {
    console.error("[API] Error getting swap options:", error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to get swap options",
        },
      },
      { status: 500 }
    );
  }
}

// ============================================
// PUT - Execute a swap
// ============================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; slotId: string }> }
) {
  try {
    const { id, slotId } = await params;
    const body = await request.json();

    if (!body.newActivity) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_REQUEST", message: "newActivity is required" } },
        { status: 400 }
      );
    }

    const store = getItineraryStore();
    const storedItinerary = store.get(id);

    if (!storedItinerary) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Itinerary not found" } },
        { status: 404 }
      );
    }

    // Parse day number from slot ID
    const slotIdParts = slotId.match(/day(\d+)/);
    const dayNumber = slotIdParts ? parseInt(slotIdParts[1], 10) : 1;

    // Get the structured itinerary
    const itinerary = (storedItinerary as { days?: Array<{ dayNumber: number }> }).days
      ? storedItinerary as unknown as import("@/types/structured-itinerary").StructuredItineraryData
      : null;

    if (!itinerary) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_FORMAT", message: "Itinerary format not supported for swap operations" } },
        { status: 400 }
      );
    }

    const newActivity = body.newActivity as ActivityOption;
    const updatedItinerary = swapActivity(itinerary, dayNumber, slotId, newActivity);

    // Save the updated itinerary
    store.save(updatedItinerary as unknown as import("@/lib/itinerary-store").StoredItinerary);

    return NextResponse.json({
      success: true,
      data: {
        itinerary: updatedItinerary,
        swappedSlot: slotId,
        newActivity: newActivity,
      },
    });
  } catch (error) {
    console.error("[API] Error swapping activity:", error);

    const message = error instanceof Error ? error.message : "Failed to swap activity";

    // Handle specific errors
    if (message.includes("not found")) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message } },
        { status: 404 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: { code: "SWAP_ERROR", message },
      },
      { status: 500 }
    );
  }
}
