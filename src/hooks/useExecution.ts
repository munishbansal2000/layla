// ============================================
// useExecution Hook
// ============================================
// React hook for UI integration with the execution engine.
// Implements the useExecution hook from EXECUTION_PHASE_DESIGN.md

import { useCallback, useMemo, useEffect, useState } from "react";
import {
  ExecutionMode,
  ActivityExecution,
  DayProgress,
  TimeExtensionResult,
  Geofence,
  GeofenceEvent,
} from "@/types/execution";
import { DayWithOptions } from "@/types/structured-itinerary";
import { Coordinates } from "@/types/activity-suggestion";
import {
  ExecutionEngine,
  EngineEvent,
  getExecutionEngine,
} from "@/lib/execution/execution-engine";
import { getTimeRemaining, isActiveState } from "@/lib/execution/activity-lifecycle";

// ============================================
// MAIN HOOK
// ============================================

export interface UseExecutionReturn {
  // State
  mode: ExecutionMode;
  isExecuting: boolean;
  isPaused: boolean;
  currentDay: number | null;

  // Current activity
  currentActivity: ActivityExecution | null;
  timeRemaining: number | null; // minutes
  isRunningOver: boolean;

  // Progress
  progress: DayProgress | null;
  upcomingActivities: ActivityExecution[];

  // Actions
  startTrip: (tripId: string, day: DayWithOptions) => void;
  stopTrip: () => void;
  pauseTrip: (reason?: string) => void;
  resumeTrip: () => void;

  // Activity actions
  checkIn: (slotId: string) => ActivityExecution | null;
  checkOut: (slotId: string, rating?: number, notes?: string) => ActivityExecution | null;
  extend: (slotId: string, minutes: number) => TimeExtensionResult;
  skip: (slotId: string, reason?: string) => ActivityExecution | null;

  // Location
  updateLocation: (location: Coordinates) => { geofenceEvents: GeofenceEvent[] };

  // Utilities
  getActivityBySlotId: (slotId: string) => ActivityExecution | null;
  getGeofences: () => Geofence[];
}

/**
 * Main hook for execution functionality
 */
export function useExecution(): UseExecutionReturn {
  const engine = getExecutionEngine();

  // Local state for reactivity
  const [mode, setMode] = useState<ExecutionMode>(engine.getMode());
  const [updateTrigger, setUpdateTrigger] = useState(0);

  // Subscribe to engine events for reactivity
  useEffect(() => {
    const handleEvent = (_event: EngineEvent) => {
      setMode(engine.getMode());
      setUpdateTrigger((prev) => prev + 1);
    };

    engine.addEventListener(handleEvent);
    return () => engine.removeEventListener(handleEvent);
  }, [engine]);

  // Computed values
  const isExecuting = mode === "active" || mode === "paused";
  const isPaused = mode === "paused";

  const currentActivity = useMemo(() => {
    return engine.getCurrentActivity();
  }, [engine, updateTrigger]);

  const upcomingActivities = useMemo(() => {
    return engine.getUpcomingActivities();
  }, [engine, updateTrigger]);

  const progress = useMemo(() => {
    return engine.getProgress();
  }, [engine, updateTrigger]);

  const currentDay = useMemo(() => {
    const state = engine.getState();
    return state.currentDay;
  }, [engine, updateTrigger]);

  const timeRemaining = useMemo(() => {
    if (!currentActivity) return null;
    return getTimeRemaining(currentActivity, new Date());
  }, [currentActivity]);

  const isRunningOver = useMemo(() => {
    if (!currentActivity) return false;
    if (!isActiveState(currentActivity.state)) return false;
    return new Date() > currentActivity.scheduledEnd;
  }, [currentActivity]);

  // Actions
  const startTrip = useCallback(
    (tripId: string, day: DayWithOptions) => {
      engine.start(tripId, day);
    },
    [engine]
  );

  const stopTrip = useCallback(() => {
    engine.stop();
  }, [engine]);

  const pauseTrip = useCallback(
    (reason?: string) => {
      engine.pause(reason);
    },
    [engine]
  );

  const resumeTrip = useCallback(() => {
    engine.resume();
  }, [engine]);

  const checkIn = useCallback(
    (slotId: string) => {
      return engine.checkInToActivity(slotId);
    },
    [engine]
  );

  const checkOut = useCallback(
    (slotId: string, rating?: number, notes?: string) => {
      return engine.checkOutOfActivity(slotId, rating, notes);
    },
    [engine]
  );

  const extend = useCallback(
    (slotId: string, minutes: number) => {
      return engine.extendActivity(slotId, minutes);
    },
    [engine]
  );

  const skip = useCallback(
    (slotId: string, reason?: string) => {
      return engine.skipActivity(slotId, reason);
    },
    [engine]
  );

  const updateLocation = useCallback(
    (location: Coordinates) => {
      return engine.updateLocation(location);
    },
    [engine]
  );

  const getActivityBySlotId = useCallback(
    (slotId: string) => {
      return engine.getActivityState(slotId);
    },
    [engine]
  );

  const getGeofences = useCallback(() => {
    return engine.getGeofences();
  }, [engine]);

  return {
    mode,
    isExecuting,
    isPaused,
    currentDay,
    currentActivity,
    timeRemaining,
    isRunningOver,
    progress,
    upcomingActivities,
    startTrip,
    stopTrip,
    pauseTrip,
    resumeTrip,
    checkIn,
    checkOut,
    extend,
    skip,
    updateLocation,
    getActivityBySlotId,
    getGeofences,
  };
}

// ============================================
// SPECIALIZED HOOKS
// ============================================

/**
 * Hook for just the current activity state
 */
export function useCurrentActivity(): {
  activity: ActivityExecution | null;
  timeRemaining: number | null;
  isRunningOver: boolean;
} {
  const engine = getExecutionEngine();
  const [updateTrigger, setUpdateTrigger] = useState(0);

  useEffect(() => {
    const handleEvent = (_event: EngineEvent) => {
      setUpdateTrigger((prev) => prev + 1);
    };

    engine.addEventListener(handleEvent);
    return () => engine.removeEventListener(handleEvent);
  }, [engine]);

  const activity = useMemo(() => {
    return engine.getCurrentActivity();
  }, [engine, updateTrigger]);

  const timeRemaining = useMemo(() => {
    if (!activity) return null;
    return getTimeRemaining(activity, new Date());
  }, [activity]);

  const isRunningOver = useMemo(() => {
    if (!activity) return false;
    if (!isActiveState(activity.state)) return false;
    return new Date() > activity.scheduledEnd;
  }, [activity]);

  return { activity, timeRemaining, isRunningOver };
}

/**
 * Hook for progress tracking
 */
export function useExecutionProgress(): DayProgress | null {
  const engine = getExecutionEngine();
  const [updateTrigger, setUpdateTrigger] = useState(0);

  useEffect(() => {
    const handleEvent = (_event: EngineEvent) => {
      setUpdateTrigger((prev) => prev + 1);
    };

    engine.addEventListener(handleEvent);
    return () => engine.removeEventListener(handleEvent);
  }, [engine]);

  return useMemo(() => {
    return engine.getProgress();
  }, [engine, updateTrigger]);
}

/**
 * Hook for a specific activity
 */
export function useActivityExecution(slotId: string): ActivityExecution | null {
  const engine = getExecutionEngine();
  const [updateTrigger, setUpdateTrigger] = useState(0);

  useEffect(() => {
    const handleEvent = (event: EngineEvent) => {
      if (
        event.type === "ACTIVITY_STATE_CHANGED" ||
        event.type === "ACTIVITY_EXTENDED" ||
        event.type === "ACTIVITY_SKIPPED"
      ) {
        if ("slotId" in event && event.slotId === slotId) {
          setUpdateTrigger((prev) => prev + 1);
        }
      }
    };

    engine.addEventListener(handleEvent);
    return () => engine.removeEventListener(handleEvent);
  }, [engine, slotId]);

  return useMemo(() => {
    return engine.getActivityState(slotId);
  }, [engine, slotId, updateTrigger]);
}

/**
 * Hook for execution mode
 */
export function useExecutionMode(): ExecutionMode {
  const engine = getExecutionEngine();
  const [mode, setMode] = useState<ExecutionMode>(engine.getMode());

  useEffect(() => {
    const handleEvent = (_event: EngineEvent) => {
      setMode(engine.getMode());
    };

    engine.addEventListener(handleEvent);
    return () => engine.removeEventListener(handleEvent);
  }, [engine]);

  return mode;
}

/**
 * Hook for geofence events
 */
export function useGeofenceEvents(
  onEnter?: (geofence: Geofence) => void,
  onExit?: (geofence: Geofence) => void
): void {
  const engine = getExecutionEngine();

  useEffect(() => {
    const handleEvent = (event: EngineEvent) => {
      if (event.type === "GEOFENCE_ENTERED" && onEnter) {
        const geofence = engine.getGeofences().find((g) => g.id === event.geofenceId);
        if (geofence) onEnter(geofence);
      }
      if (event.type === "GEOFENCE_EXITED" && onExit) {
        const geofence = engine.getGeofences().find((g) => g.id === event.geofenceId);
        if (geofence) onExit(geofence);
      }
    };

    engine.addEventListener(handleEvent);
    return () => engine.removeEventListener(handleEvent);
  }, [engine, onEnter, onExit]);
}

/**
 * Hook for subscribing to engine events
 */
export function useEngineEvents(onEvent: (event: EngineEvent) => void): void {
  const engine = getExecutionEngine();

  useEffect(() => {
    engine.addEventListener(onEvent);
    return () => engine.removeEventListener(onEvent);
  }, [engine, onEvent]);
}

// ============================================
// UTILITY HOOKS
// ============================================

/**
 * Hook for countdown timer on current activity
 */
export function useActivityTimer(): {
  minutes: number;
  seconds: number;
  isOvertime: boolean;
  formatted: string;
} {
  const { activity } = useCurrentActivity();
  const [now, setNow] = useState(new Date());

  // Update every second when there's an active activity
  useEffect(() => {
    if (!activity || !isActiveState(activity.state)) return;

    const interval = setInterval(() => {
      setNow(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, [activity]);

  return useMemo(() => {
    if (!activity || !isActiveState(activity.state)) {
      return { minutes: 0, seconds: 0, isOvertime: false, formatted: "--:--" };
    }

    let endTime = activity.scheduledEnd;
    if (activity.extendedBy) {
      endTime = new Date(activity.scheduledEnd);
      endTime.setMinutes(endTime.getMinutes() + activity.extendedBy);
    }

    const diffMs = endTime.getTime() - now.getTime();
    const isOvertime = diffMs < 0;
    const absDiffMs = Math.abs(diffMs);

    const totalSeconds = Math.floor(absDiffMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    const sign = isOvertime ? "-" : "";
    const formatted = `${sign}${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;

    return { minutes, seconds, isOvertime, formatted };
  }, [activity, now]);
}

/**
 * Hook for determining if user is at an activity location
 */
export function useIsAtActivity(slotId: string): boolean {
  const engine = getExecutionEngine();
  const activity = useActivityExecution(slotId);

  return useMemo(() => {
    if (!activity) return false;
    return activity.state === "arrived" || activity.state === "in_progress" || activity.state === "extended";
  }, [activity]);
}
