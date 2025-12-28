// ============================================
// GET/PUT/DELETE /api/itinerary/[id]
// ============================================
// Manage individual itineraries

import { NextRequest, NextResponse } from "next/server";
import { getItineraryOrchestrator } from "@/lib/itinerary-orchestrator";
import { getItineraryStore } from "@/lib/itinerary-store";

// ============================================
// GET - Retrieve an itinerary
// ============================================

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const store = getItineraryStore();
    const itinerary = store.get(id);

    if (!itinerary) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Itinerary not found" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { itinerary },
    });
  } catch (error) {
    console.error("[API] Error getting itinerary:", error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to get itinerary",
        },
      },
      { status: 500 }
    );
  }
}

// ============================================
// PUT - Update an itinerary
// ============================================

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await request.json();
    const store = getItineraryStore();

    // Check if itinerary exists
    if (!store.has(id)) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Itinerary not found" } },
        { status: 404 }
      );
    }

    // Handle specific actions
    if (body.action) {
      const orchestrator = getItineraryOrchestrator();
      let itinerary = store.get(id)!;

      switch (body.action) {
        case "confirm":
          itinerary = orchestrator.confirmItinerary(itinerary);
          break;

        case "lock":
          if (!body.slotId) {
            return NextResponse.json(
              { success: false, error: { code: "INVALID_REQUEST", message: "slotId is required for lock action" } },
              { status: 400 }
            );
          }
          itinerary = orchestrator.lockActivity(itinerary, body.slotId, body.locked ?? true);
          break;

        case "swipe":
          if (!body.activityId || !body.swipeAction) {
            return NextResponse.json(
              { success: false, error: { code: "INVALID_REQUEST", message: "activityId and swipeAction are required" } },
              { status: 400 }
            );
          }
          itinerary = orchestrator.processSwipe(itinerary, body.activityId, body.swipeAction);
          break;

        default:
          return NextResponse.json(
            { success: false, error: { code: "INVALID_ACTION", message: `Unknown action: ${body.action}` } },
            { status: 400 }
          );
      }

      store.save(itinerary);
      return NextResponse.json({ success: true, data: { itinerary } });
    }

    // Generic update (partial)
    const updated = store.update(id, body);

    if (!updated) {
      return NextResponse.json(
        { success: false, error: { code: "UPDATE_FAILED", message: "Failed to update itinerary" } },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { itinerary: updated },
    });
  } catch (error) {
    console.error("[API] Error updating itinerary:", error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to update itinerary",
        },
      },
      { status: 500 }
    );
  }
}

// ============================================
// DELETE - Remove an itinerary
// ============================================

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const store = getItineraryStore();
    const deleted = store.delete(id);

    if (!deleted) {
      return NextResponse.json(
        { success: false, error: { code: "NOT_FOUND", message: "Itinerary not found" } },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: { deleted: true },
    });
  } catch (error) {
    console.error("[API] Error deleting itinerary:", error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "SERVER_ERROR",
          message: error instanceof Error ? error.message : "Failed to delete itinerary",
        },
      },
      { status: 500 }
    );
  }
}
