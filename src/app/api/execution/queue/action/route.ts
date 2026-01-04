/**
 * Execution Queue Action API
 *
 * Handles REAL actions that modify the itinerary:
 * - POST: Execute an action (skip, complete, extend, dismiss, etc.)
 *
 * These actions are always real - they modify the execution state.
 * The event sources (simulator, GPS, etc.) are what can be swapped.
 */

import { NextRequest, NextResponse } from "next/server";
import { executionQueue } from "@/lib/execution/execution-queue";

// ============================================
// Action Types
// ============================================

type ActionType =
  | "skip"
  | "complete"
  | "extend"
  | "dismiss"
  | "mark_actioned"
  | "add_delay"
  | "start_activity"
  | "pause"
  | "resume"
  | "set_time"
  | "set_speed"
  | "confirm"    // Acknowledge/proceed
  | "navigate"   // Get directions
  | "swap"       // Find alternatives
  | "chat";      // Send a message to the AI

interface ActionRequest {
  tripId: string;
  eventId?: string;
  action: ActionType;
  payload?: {
    slotId?: string;
    minutes?: number;
    time?: string; // ISO date string
    speed?: number; // Time multiplier
    message?: string;
  };
}

// ============================================
// POST /api/execution/queue/action
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body: ActionRequest = await request.json();

    if (!body.tripId) {
      return NextResponse.json(
        { error: "tripId is required" },
        { status: 400 }
      );
    }

    if (!body.action) {
      return NextResponse.json(
        { error: "action is required" },
        { status: 400 }
      );
    }

    // Check if execution is initialized
    const currentState = executionQueue.getState(body.tripId);
    if (!currentState) {
      return NextResponse.json(
        { error: "Execution not initialized for this trip" },
        { status: 400 }
      );
    }

    let result: { success: boolean; state: unknown; message?: string } = {
      success: false,
      state: null,
    };

    switch (body.action) {
      // ========== SLOT ACTIONS (REAL - modify state) ==========

      case "skip": {
        if (!body.payload?.slotId) {
          return NextResponse.json(
            { error: "slotId is required for skip action" },
            { status: 400 }
          );
        }
        const skipResult = executionQueue.skipSlot(body.tripId, body.payload.slotId);
        result = {
          success: skipResult.success,
          state: skipResult.state,
          message: `Skipped slot ${body.payload.slotId}`,
        };
        break;
      }

      case "complete": {
        if (!body.payload?.slotId) {
          return NextResponse.json(
            { error: "slotId is required for complete action" },
            { status: 400 }
          );
        }
        const completeResult = executionQueue.completeSlot(body.tripId, body.payload.slotId);
        result = {
          success: completeResult.success,
          state: completeResult.state,
          message: `Completed slot ${body.payload.slotId}`,
        };
        break;
      }

      case "extend": {
        if (!body.payload?.slotId || !body.payload?.minutes) {
          return NextResponse.json(
            { error: "slotId and minutes are required for extend action" },
            { status: 400 }
          );
        }
        const extendResult = executionQueue.extendActivity(
          body.tripId,
          body.payload.slotId,
          body.payload.minutes
        );
        result = {
          success: extendResult.success,
          state: extendResult.state,
          message: `Extended slot ${body.payload.slotId} by ${body.payload.minutes} minutes`,
        };
        break;
      }

      case "add_delay": {
        if (!body.payload?.minutes) {
          return NextResponse.json(
            { error: "minutes is required for add_delay action" },
            { status: 400 }
          );
        }
        const delayResult = executionQueue.addDelay(body.tripId, body.payload.minutes);
        result = {
          success: delayResult.success,
          state: delayResult.state,
          message: `Added ${body.payload.minutes} minute delay`,
        };
        break;
      }

      case "start_activity": {
        if (!body.payload?.slotId) {
          return NextResponse.json(
            { error: "slotId is required for start_activity action" },
            { status: 400 }
          );
        }
        const state = executionQueue.getState(body.tripId);
        if (state) {
          state.slotStatuses[body.payload.slotId] = "in_progress";
        }
        result = {
          success: true,
          state,
          message: `Started activity ${body.payload.slotId}`,
        };
        break;
      }

      // ========== EVENT ACTIONS ==========

      case "dismiss": {
        if (!body.eventId) {
          return NextResponse.json(
            { error: "eventId is required for dismiss action" },
            { status: 400 }
          );
        }
        executionQueue.dismiss(body.tripId, body.eventId);
        result = {
          success: true,
          state: executionQueue.getState(body.tripId),
          message: `Dismissed event ${body.eventId}`,
        };
        break;
      }

      case "mark_actioned": {
        if (!body.eventId) {
          return NextResponse.json(
            { error: "eventId is required for mark_actioned action" },
            { status: 400 }
          );
        }
        executionQueue.markActioned(body.tripId, body.eventId, body.payload?.message || "actioned");
        result = {
          success: true,
          state: executionQueue.getState(body.tripId),
          message: `Marked event ${body.eventId} as actioned`,
        };
        break;
      }

      // ========== SIMULATION CONTROLS ==========

      case "pause": {
        executionQueue.setPaused(body.tripId, true);
        result = {
          success: true,
          state: executionQueue.getState(body.tripId),
          message: "Execution paused",
        };
        break;
      }

      case "resume": {
        executionQueue.setPaused(body.tripId, false);
        result = {
          success: true,
          state: executionQueue.getState(body.tripId),
          message: "Execution resumed",
        };
        break;
      }

      case "set_time": {
        if (!body.payload?.time) {
          return NextResponse.json(
            { error: "time is required for set_time action" },
            { status: 400 }
          );
        }
        executionQueue.setTime(body.tripId, new Date(body.payload.time));
        result = {
          success: true,
          state: executionQueue.getState(body.tripId),
          message: `Time set to ${body.payload.time}`,
        };
        break;
      }

      case "set_speed": {
        if (body.payload?.speed === undefined) {
          return NextResponse.json(
            { error: "speed is required for set_speed action" },
            { status: 400 }
          );
        }
        executionQueue.setTimeMultiplier(body.tripId, body.payload.speed);
        result = {
          success: true,
          state: executionQueue.getState(body.tripId),
          message: `Time speed set to ${body.payload.speed}x`,
        };
        break;
      }

      // ========== INTERACTIVE EVENT ACTIONS ==========

      case "confirm": {
        // Mark event as actioned with confirmation
        if (body.eventId) {
          executionQueue.markActioned(body.tripId, body.eventId, "confirmed");
        }
        result = {
          success: true,
          state: executionQueue.getState(body.tripId),
          message: "Acknowledged",
        };
        break;
      }

      case "navigate": {
        // Mark event as actioned and provide navigation info
        if (body.eventId) {
          executionQueue.markActioned(body.tripId, body.eventId, "navigating");
        }
        result = {
          success: true,
          state: executionQueue.getState(body.tripId),
          message: "Navigation started",
          // In a real implementation, this would include navigation details
        };
        break;
      }

      case "swap": {
        // Mark event as actioned and trigger alternative search
        if (body.eventId) {
          executionQueue.markActioned(body.tripId, body.eventId, "finding_alternatives");
        }
        result = {
          success: true,
          state: executionQueue.getState(body.tripId),
          message: "Finding alternatives...",
          // The actual search would be triggered by the client
        };
        break;
      }

      case "chat": {
        // Mark event as actioned - the client will handle sending the chat message
        if (body.eventId) {
          executionQueue.markActioned(body.tripId, body.eventId, "chat_initiated");
        }
        result = {
          success: true,
          state: executionQueue.getState(body.tripId),
          message: body.payload?.message || "Message sent",
        };
        break;
      }

      default:
        return NextResponse.json(
          { error: `Unknown action: ${body.action}` },
          { status: 400 }
        );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error("Error executing action:", error);
    return NextResponse.json(
      { error: "Failed to execute action" },
      { status: 500 }
    );
  }
}
