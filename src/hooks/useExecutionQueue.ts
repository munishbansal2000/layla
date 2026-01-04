/**
 * useExecutionQueue Hook
 *
 * Polls the execution queue for events and provides methods to:
 * - Start/stop execution sessions
 * - Poll for events
 * - Execute actions (skip, complete, extend, etc.)
 * - Manage execution state
 */

import { useState, useCallback, useEffect, useRef } from "react";
import type { QueuedEvent, ExecutionState, QueuedEventAction } from "@/lib/execution/execution-queue";
import type { StructuredItineraryData } from "@/types/structured-itinerary";

interface UseExecutionQueueOptions {
  tripId: string;
  itinerary: StructuredItineraryData | null;
  dayIndex?: number;
  pollIntervalMs?: number;
  onEvent?: (event: QueuedEvent) => void;
  onStateChange?: (state: ExecutionState) => void;
}

interface UseExecutionQueueReturn {
  // State
  isInitialized: boolean;
  isPolling: boolean;
  executionState: ExecutionState | null;
  pendingEvents: QueuedEvent[];
  deliveredEvents: QueuedEvent[];

  // Actions
  startExecution: () => Promise<boolean>;
  stopExecution: () => Promise<void>;
  startPolling: () => void;
  stopPolling: () => void;

  // Event actions
  handleEventAction: (event: QueuedEvent, action: QueuedEventAction) => Promise<void>;
  dismissEvent: (eventId: string) => Promise<void>;

  // Slot actions (real modifications)
  skipSlot: (slotId: string) => Promise<boolean>;
  completeSlot: (slotId: string) => Promise<boolean>;
  extendSlot: (slotId: string, minutes: number) => Promise<boolean>;

  // Simulation controls
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  setSpeed: (speed: number) => Promise<void>;
  setTime: (time: Date) => Promise<void>;

  // Manual event injection (for testing)
  injectEvent: (factoryType: string, args: unknown[]) => Promise<void>;
}

export function useExecutionQueue({
  tripId,
  itinerary,
  dayIndex = 0,
  pollIntervalMs = 3000,
  onEvent,
  onStateChange,
}: UseExecutionQueueOptions): UseExecutionQueueReturn {
  const [isInitialized, setIsInitialized] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [executionState, setExecutionState] = useState<ExecutionState | null>(null);
  const [pendingEvents, setPendingEvents] = useState<QueuedEvent[]>([]);
  const [deliveredEvents, setDeliveredEvents] = useState<QueuedEvent[]>([]);

  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const onEventRef = useRef(onEvent);
  const onStateChangeRef = useRef(onStateChange);

  // Keep refs updated
  useEffect(() => {
    onEventRef.current = onEvent;
    onStateChangeRef.current = onStateChange;
  }, [onEvent, onStateChange]);

  // Stop polling - defined early so it can be used by stopExecution
  const stopPolling = useCallback(() => {
    console.log("[useExecutionQueue] Stopping polling");
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  // Start execution session
  const startExecution = useCallback(async (): Promise<boolean> => {
    if (!itinerary) return false;

    try {
      const res = await fetch("/api/execution/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          itinerary,
          dayIndex,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setIsInitialized(true);
        setExecutionState(data.state);
        onStateChangeRef.current?.(data.state);
        return true;
      }

      console.error("Failed to start execution:", data.error);
      return false;
    } catch (err) {
      console.error("Failed to start execution:", err);
      return false;
    }
  }, [tripId, itinerary, dayIndex]);

  // Stop execution session
  const stopExecution = useCallback(async () => {
    console.log("[useExecutionQueue] stopExecution called - SKIPPING DELETE to prevent conflicts");
    stopPolling();

    // DON'T delete the session - let the simulation page manage it
    // This prevents the /trip page from accidentally ending sessions created elsewhere
    // try {
    //   await fetch(`/api/execution/start?tripId=${tripId}`, {
    //     method: "DELETE",
    //   });
    // } catch (err) {
    //   console.error("Failed to stop execution:", err);
    // }

    setIsInitialized(false);
    setExecutionState(null);
    setPendingEvents([]);
  }, [tripId, stopPolling]);

  // Poll for events (consumes them from queue)
  const pollEvents = useCallback(async () => {
    try {
      console.log("[useExecutionQueue] Polling events for tripId:", tripId);
      const res = await fetch(`/api/execution/queue?tripId=${tripId}&limit=5`);
      const data = await res.json();

      console.log("[useExecutionQueue] Poll response:", {
        success: data.success,
        eventCount: data.events?.length || 0,
        hasState: !!data.state
      });

      if (data.success) {
        // Update state
        if (data.state) {
          setExecutionState(data.state);
          onStateChangeRef.current?.(data.state);
        }

        // Process new events
        if (data.events && data.events.length > 0) {
          console.log("[useExecutionQueue] Received events:", data.events.map((e: QueuedEvent) => e.title));
          setDeliveredEvents(prev => [...prev, ...data.events]);

          // Trigger callback for each event
          data.events.forEach((event: QueuedEvent) => {
            console.log("[useExecutionQueue] Triggering onEvent callback for:", event.title);
            onEventRef.current?.(event);
          });
        }
      }
    } catch (err) {
      console.error("Failed to poll events:", err);
    }
  }, [tripId]);

  // Peek at pending events (without consuming)
  const peekEvents = useCallback(async () => {
    if (!isInitialized) return;

    try {
      const res = await fetch(`/api/execution/queue?tripId=${tripId}&peek=true`);
      const data = await res.json();

      if (data.success) {
        setPendingEvents(data.events || []);
        if (data.state) {
          setExecutionState(data.state);
        }
      }
    } catch (err) {
      console.error("Failed to peek events:", err);
    }
  }, [tripId, isInitialized]);

  // Start polling
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      console.log("[useExecutionQueue] Already polling, skipping");
      return;
    }

    console.log("[useExecutionQueue] Starting polling with interval:", pollIntervalMs, "ms");
    setIsPolling(true);

    // Initial poll
    pollEvents();

    // Set up interval
    pollIntervalRef.current = setInterval(pollEvents, pollIntervalMs);
  }, [pollEvents, pollIntervalMs]);


  // Execute action from API
  const executeAction = useCallback(async (
    action: string,
    payload?: Record<string, unknown>,
    eventId?: string
  ): Promise<boolean> => {
    try {
      const res = await fetch("/api/execution/queue/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          action,
          payload,
          eventId,
        }),
      });

      const data = await res.json();

      if (data.success && data.state) {
        setExecutionState(data.state);
        onStateChangeRef.current?.(data.state);
      }

      return data.success;
    } catch (err) {
      console.error(`Failed to execute action ${action}:`, err);
      return false;
    }
  }, [tripId]);

  // Handle event action button click
  const handleEventAction = useCallback(async (
    event: QueuedEvent,
    action: QueuedEventAction
  ) => {
    switch (action.type) {
      case "skip":
        if (action.payload?.slotId) {
          await executeAction("skip", { slotId: action.payload.slotId }, event.id);
        }
        break;

      case "extend":
        if (action.payload?.slotId && action.payload?.minutes) {
          await executeAction("extend", {
            slotId: action.payload.slotId,
            minutes: action.payload.minutes,
          }, event.id);
        }
        break;

      case "confirm":
        await executeAction("mark_actioned", { message: action.id }, event.id);
        break;

      case "dismiss":
        await executeAction("dismiss", undefined, event.id);
        break;

      case "navigate":
        // Could open maps or directions
        await executeAction("mark_actioned", { message: "navigated" }, event.id);
        break;

      case "chat":
        // The parent component should handle this by sending a message to chat
        await executeAction("mark_actioned", { message: action.payload?.message || "chat" }, event.id);
        break;

      case "swap":
        // The parent component should handle this by showing alternatives
        await executeAction("mark_actioned", { message: "swap_requested" }, event.id);
        break;
    }
  }, [executeAction]);

  // Dismiss event
  const dismissEvent = useCallback(async (eventId: string) => {
    await executeAction("dismiss", undefined, eventId);
  }, [executeAction]);

  // Slot actions
  const skipSlot = useCallback(async (slotId: string): Promise<boolean> => {
    return executeAction("skip", { slotId });
  }, [executeAction]);

  const completeSlot = useCallback(async (slotId: string): Promise<boolean> => {
    return executeAction("complete", { slotId });
  }, [executeAction]);

  const extendSlot = useCallback(async (slotId: string, minutes: number): Promise<boolean> => {
    return executeAction("extend", { slotId, minutes });
  }, [executeAction]);

  // Simulation controls
  const pause = useCallback(async () => {
    await executeAction("pause");
  }, [executeAction]);

  const resume = useCallback(async () => {
    await executeAction("resume");
  }, [executeAction]);

  const setSpeed = useCallback(async (speed: number) => {
    await executeAction("set_speed", { speed });
  }, [executeAction]);

  const setTime = useCallback(async (time: Date) => {
    await executeAction("set_time", { time: time.toISOString() });
  }, [executeAction]);

  // Inject event (for testing/simulation)
  const injectEvent = useCallback(async (factoryType: string, args: unknown[]) => {
    try {
      await fetch("/api/execution/queue", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          factory: { type: factoryType, args },
        }),
      });

      // Refresh pending events
      await peekEvents();
    } catch (err) {
      console.error("Failed to inject event:", err);
    }
  }, [tripId, peekEvents]);

  // Check initial status on mount - if session is already active, auto-start polling
  useEffect(() => {
    const checkStatus = async () => {
      try {
        console.log("[useExecutionQueue] Checking if execution is already active for tripId:", tripId);
        const res = await fetch(`/api/execution/start?tripId=${tripId}`);
        const data = await res.json();

        if (data.isActive) {
          console.log("[useExecutionQueue] Found active session, auto-starting polling");
          setIsInitialized(true);
          setExecutionState(data.state);
          // Auto-start polling if there's an active session
          // This allows the /trip page to pick up events from /test/execution-sim
          startPolling();
        } else {
          console.log("[useExecutionQueue] No active session found");
        }
      } catch (err) {
        console.error("Failed to check execution status:", err);
      }
    };

    checkStatus();
  }, [tripId, startPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  return {
    isInitialized,
    isPolling,
    executionState,
    pendingEvents,
    deliveredEvents,

    startExecution,
    stopExecution,
    startPolling,
    stopPolling,

    handleEventAction,
    dismissEvent,

    skipSlot,
    completeSlot,
    extendSlot,

    pause,
    resume,
    setSpeed,
    setTime,

    injectEvent,
  };
}
