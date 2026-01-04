/**
 * Execution Start API
 *
 * Initialize execution for a trip:
 * - POST: Start execution (creates queue, initializes state)
 * - GET: Get execution status
 * - DELETE: End execution session
 */

import { NextRequest, NextResponse } from "next/server";
import { executionQueue, EventFactory } from "@/lib/execution/execution-queue";
import type { StructuredItineraryData } from "@/types/structured-itinerary";

// ============================================
// POST /api/execution/start - Initialize execution
// ============================================

interface StartRequest {
  tripId: string;
  itinerary: StructuredItineraryData;
  dayIndex?: number;
  startTime?: string; // ISO date string
}

export async function POST(request: NextRequest) {
  try {
    const body: StartRequest = await request.json();

    console.log("[API Start POST] Received request:", {
      tripId: body.tripId,
      hasItinerary: !!body.itinerary,
      dayIndex: body.dayIndex,
      startTime: body.startTime,
    });

    if (!body.tripId) {
      console.log("[API Start POST] Error: tripId is required");
      return NextResponse.json(
        { error: "tripId is required" },
        { status: 400 }
      );
    }

    if (!body.itinerary) {
      console.log("[API Start POST] Error: itinerary is required");
      return NextResponse.json(
        { error: "itinerary is required" },
        { status: 400 }
      );
    }

    const dayIndex = body.dayIndex ?? 0;
    const day = body.itinerary.days[dayIndex];

    if (!day) {
      console.log("[API Start POST] Error: Day not found:", dayIndex);
      return NextResponse.json(
        { error: `Day ${dayIndex} not found in itinerary` },
        { status: 400 }
      );
    }

    // Initialize the queue and state
    console.log("[API Start POST] Initializing queue for tripId:", body.tripId);
    const state = executionQueue.initQueue(body.tripId, body.itinerary, dayIndex);
    console.log("[API Start POST] Queue initialized, state:", {
      dayIndex: state.dayIndex,
      slotCount: Object.keys(state.slotStatuses).length,
    });

    // Set custom start time if provided
    if (body.startTime) {
      executionQueue.setTime(body.tripId, new Date(body.startTime));
    }

    // Auto-enqueue morning briefing
    const activities = day.slots
      .filter(s => s.slotType !== "breakfast" && s.slotType !== "lunch" && s.slotType !== "dinner" && s.options.length > 0)
      .map(s => {
        const selectedOption = s.options.find(o => o.id === s.selectedOptionId) || s.options[0];
        return selectedOption?.activity?.name || "Activity";
      });

    const city = day.city || body.itinerary.destination;

    const morningBriefing = EventFactory.morningBriefing(dayIndex, city, activities);
    executionQueue.enqueue(body.tripId, morningBriefing);
    console.log("[API Start POST] Enqueued morning briefing:", morningBriefing.title);

    console.log("[API Start POST] Success for tripId:", body.tripId);
    return NextResponse.json({
      success: true,
      tripId: body.tripId,
      dayIndex,
      state,
      message: `Execution started for day ${dayIndex + 1}`,
    });
  } catch (error) {
    console.error("[API Start POST] Error:", error);
    return NextResponse.json(
      { error: "Failed to start execution" },
      { status: 500 }
    );
  }
}

// ============================================
// GET /api/execution/start - Get execution status
// ============================================

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tripId = searchParams.get("tripId");

    if (!tripId) {
      // Return all active sessions
      const sessions = executionQueue.getActiveSessions();
      return NextResponse.json({
        success: true,
        activeSessions: sessions,
      });
    }

    const state = executionQueue.getState(tripId);
    const itinerary = executionQueue.getItinerary(tripId);
    const pendingEvents = executionQueue.peek(tripId);

    if (!state) {
      return NextResponse.json({
        success: false,
        isActive: false,
        message: "No active execution for this trip",
      });
    }

    return NextResponse.json({
      success: true,
      isActive: true,
      state,
      itinerary,
      pendingEventCount: pendingEvents.length,
    });
  } catch (error) {
    console.error("Error getting execution status:", error);
    return NextResponse.json(
      { error: "Failed to get execution status" },
      { status: 500 }
    );
  }
}

// ============================================
// DELETE /api/execution/start - End execution
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

    const state = executionQueue.getState(tripId);

    if (!state) {
      return NextResponse.json({
        success: false,
        message: "No active execution for this trip",
      });
    }

    // End the session
    executionQueue.endSession(tripId);

    return NextResponse.json({
      success: true,
      message: `Execution ended for trip ${tripId}`,
      finalStats: {
        completedCount: state.completedCount,
        skippedCount: state.skippedCount,
        accumulatedDelayMinutes: state.accumulatedDelayMinutes,
      },
    });
  } catch (error) {
    console.error("Error ending execution:", error);
    return NextResponse.json(
      { error: "Failed to end execution" },
      { status: 500 }
    );
  }
}
