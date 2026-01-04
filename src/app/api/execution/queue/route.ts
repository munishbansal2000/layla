/**
 * Execution Queue API
 *
 * Handles queue operations for execution events:
 * - GET: Poll for pending events (with filtering + action recommendations)
 * - POST: Enqueue new events (from simulator or real endpoints)
 */

import { NextRequest, NextResponse } from "next/server";
import { executionQueue, EventFactory } from "@/lib/execution/execution-queue";
import type { ExecutionEventType, EventSource, QueuedEventAction } from "@/lib/execution/execution-queue";
import { getEventPipeline, type PipelineContext } from "@/lib/execution/event-pipeline";

// ============================================
// GET /api/execution/queue - Poll for events
// ============================================

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const tripId = searchParams.get("tripId");
    const limit = parseInt(searchParams.get("limit") || "10", 10);
    const peek = searchParams.get("peek") === "true";
    const enablePipeline = searchParams.get("pipeline") !== "false"; // Enabled by default

    console.log("[API Queue GET]", { tripId, limit, peek, enablePipeline });

    if (!tripId) {
      return NextResponse.json(
        { error: "tripId is required" },
        { status: 400 }
      );
    }

    // Get events (either poll or peek)
    let events = peek
      ? executionQueue.peek(tripId)
      : executionQueue.poll(tripId, limit);

    // Get current state and itinerary
    const state = executionQueue.getState(tripId);
    const itinerary = executionQueue.getItinerary(tripId);

    // Process through pipeline if enabled and we have context
    let pipelineStats = { processed: 0, shown: 0, filtered: 0 };
    if (enablePipeline && events.length > 0 && state && itinerary) {
      try {
        const pipeline = getEventPipeline();
        const pipelineContext: PipelineContext = {
          itinerary,
          dayIndex: state.dayIndex,
          currentTime: state.currentTime,
          userLocation: state.currentLocation,
          currentSlotId: state.currentVenueId,
          slotStatuses: state.slotStatuses,
          delayMinutes: state.accumulatedDelayMinutes,
        };

        const results = await pipeline.processMany(events, pipelineContext);

        // Filter to only show events that passed the pipeline
        const shownResults = results.filter(r => r.show);
        events = shownResults.map(r => r.event);

        pipelineStats = {
          processed: results.length,
          shown: shownResults.length,
          filtered: results.length - shownResults.length,
        };

        console.log("[API Queue GET] Pipeline results:", pipelineStats);
      } catch (pipelineError) {
        console.error("[API Queue GET] Pipeline error (continuing with raw events):", pipelineError);
        // Continue with raw events if pipeline fails
      }
    }

    console.log("[API Queue GET] Response:", {
      tripId,
      peek,
      eventCount: events.length,
      eventTitles: events.map(e => e.title),
      hasState: !!state,
      pipelineStats,
    });

    return NextResponse.json({
      success: true,
      events,
      eventCount: events.length,
      state,
      pipeline: pipelineStats,
    });
  } catch (error) {
    console.error("Error polling execution queue:", error);
    return NextResponse.json(
      { error: "Failed to poll execution queue" },
      { status: 500 }
    );
  }
}

// ============================================
// POST /api/execution/queue - Enqueue event
// ============================================

interface EnqueueRequest {
  tripId: string;

  // Option 1: Use a factory event
  factory?: {
    type: keyof typeof EventFactory;
    args: unknown[];
  };

  // Option 2: Custom event
  custom?: {
    type: ExecutionEventType;
    source: EventSource;
    priority: "low" | "normal" | "high" | "urgent";
    dayIndex?: number;
    slotId?: string;
    title: string;
    message: string;
    tip?: string;
    actions?: QueuedEventAction[];
    expiresAt?: string; // ISO date string
  };
}

export async function POST(request: NextRequest) {
  try {
    const body: EnqueueRequest = await request.json();

    console.log("[API Queue POST] Received request:", {
      tripId: body.tripId,
      hasFactory: !!body.factory,
      factoryType: body.factory?.type,
      hasCustom: !!body.custom,
    });

    if (!body.tripId) {
      console.log("[API Queue POST] Error: tripId is required");
      return NextResponse.json(
        { error: "tripId is required" },
        { status: 400 }
      );
    }

    // Check if execution is initialized
    const state = executionQueue.getState(body.tripId);
    console.log("[API Queue POST] State check:", {
      tripId: body.tripId,
      hasState: !!state,
      stateDetails: state ? { dayIndex: state.dayIndex, isPaused: state.isPaused } : null
    });

    if (!state) {
      console.log("[API Queue POST] Error: Execution not initialized for tripId:", body.tripId);
      return NextResponse.json(
        { error: "Execution not initialized for this trip. Call /api/execution/start first." },
        { status: 400 }
      );
    }

    let event;

    if (body.factory) {
      // Use EventFactory to create event
      const factoryMethod = EventFactory[body.factory.type as keyof typeof EventFactory];
      console.log("[API Queue POST] Factory method lookup:", {
        type: body.factory.type,
        found: !!factoryMethod,
        availableMethods: Object.keys(EventFactory),
      });

      if (!factoryMethod) {
        return NextResponse.json(
          { error: `Unknown factory type: ${body.factory.type}` },
          { status: 400 }
        );
      }

      // Call factory method with args
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const eventData = (factoryMethod as (...args: any[]) => any)(...body.factory.args);
      console.log("[API Queue POST] Created event from factory:", {
        type: eventData.type,
        title: eventData.title,
      });
      event = executionQueue.enqueue(body.tripId, eventData);
    } else if (body.custom) {
      // Custom event
      event = executionQueue.enqueue(body.tripId, {
        type: body.custom.type,
        source: body.custom.source,
        priority: body.custom.priority,
        dayIndex: body.custom.dayIndex,
        slotId: body.custom.slotId,
        title: body.custom.title,
        message: body.custom.message,
        tip: body.custom.tip,
        actions: body.custom.actions,
        expiresAt: body.custom.expiresAt ? new Date(body.custom.expiresAt) : undefined,
      });
      console.log("[API Queue POST] Created custom event:", {
        type: body.custom.type,
        title: body.custom.title,
      });
    } else {
      console.log("[API Queue POST] Error: No factory or custom event data");
      return NextResponse.json(
        { error: "Either 'factory' or 'custom' event data is required" },
        { status: 400 }
      );
    }

    const queueLength = executionQueue.getAll(body.tripId).length;
    console.log("[API Queue POST] Success:", {
      eventId: event.id,
      eventTitle: event.title,
      queueLength,
    });

    return NextResponse.json({
      success: true,
      event,
      queueLength,
    });
  } catch (error) {
    console.error("[API Queue POST] Error:", error);
    return NextResponse.json(
      { error: "Failed to enqueue event" },
      { status: 500 }
    );
  }
}
