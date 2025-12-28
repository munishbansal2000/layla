// ============================================
// GET/PUT /api/itinerary/[id]/slot/[slotId]
// ============================================
// Get swap options and execute swaps for a specific slot

import { NextRequest, NextResponse } from "next/server";
import { getItineraryOrchestrator } from "@/lib/itinerary-orchestrator";
import { getItineraryStore } from "@/lib/itinerary-store";

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
    const itinerary = store.get(id);

    if (!itinerary) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Itinerary not found" } },
        { status: 404 }
      );
    }

    const orchestrator = getItineraryOrchestrator();
    const slotDetails = orchestrator.getSwapOptions(itinerary, slotId);

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
          dayIndex: slotDetails.dayIndex,
          currentActivity: slotDetails.scheduledActivity.activity,
          scheduledStart: slotDetails.scheduledActivity.scheduledStart,
          scheduledEnd: slotDetails.scheduledActivity.scheduledEnd,
          isLocked: slotDetails.scheduledActivity.isLocked,
        },
        alternatives: slotDetails.alternatives.map((alt) => ({
          activityId: alt.activity.activity.id,
          name: alt.activity.activity.name,
          description: alt.activity.activity.description,
          category: alt.activity.activity.category,
          score: alt.swapScore,
          reason: alt.reason,
          benefits: alt.benefits,
          tradeoffs: alt.tradeoffs,
          commuteFromPrevious: alt.commuteFromPrevious,
          commuteToNext: alt.commuteToNext,
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

    if (!body.newActivityId) {
      return NextResponse.json(
        { success: false, error: { code: "INVALID_REQUEST", message: "newActivityId is required" } },
        { status: 400 }
      );
    }

    const store = getItineraryStore();
    const itinerary = store.get(id);

    if (!itinerary) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Itinerary not found" } },
        { status: 404 }
      );
    }

    const orchestrator = getItineraryOrchestrator();
    const updatedItinerary = orchestrator.swapActivity(itinerary, slotId, body.newActivityId);

    store.save(updatedItinerary);

    return NextResponse.json({
      success: true,
      data: {
        itinerary: updatedItinerary,
        swappedSlot: slotId,
        newActivityId: body.newActivityId,
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
