// ============================================
// EXECUTION STORE (Zustand)
// ============================================
// State management for trip execution phase.
// Implements the Execution Store from EXECUTION_PHASE_DESIGN.md

import { create } from "zustand";
import { immer } from "zustand/middleware/immer";
import {
  ExecutionMode,
  ActivityExecution,
  ActivityState,
  TransitionTrigger,
  DayProgress,
  CompletedActivity,
  SkippedActivity,
  UserLocation,
  Geofence,
  ScheduledNotification,
  PendingDecision,
  ReshufflingPolicy,
  TimeExtensionResult,
  DEFAULT_RESHUFFLING_POLICY,
} from "@/types/execution";
import { DayWithOptions, SlotWithOptions } from "@/types/structured-itinerary";
import {
  createActivityExecution,
  transitionActivity,
  isTerminalState,
  isActiveState,
} from "./activity-lifecycle";
import {
  calculateDayProgress,
  getCurrentActivity as getProgressCurrentActivity,
  getUpcomingActivities,
  toCompletedActivity,
  toSkippedActivity,
} from "./day-progress";
import { calculateExtensionImpact } from "./time-extension";

// ============================================
// STORE INTERFACE
// ============================================

interface ExecutionState {
  // Core state
  tripId: string | null;
  mode: ExecutionMode;

  // Current day
  currentDay: {
    dayNumber: number;
    date: string;
    day: DayWithOptions;
  } | null;

  // Activities map
  activities: Map<string, ActivityExecution>;

  // Tracking
  location: UserLocation | null;
  geofences: Geofence[];

  // Notifications
  scheduledNotifications: ScheduledNotification[];
  activeNotifications: ScheduledNotification[];
  dismissedNotificationIds: string[];

  // Decisions
  pendingDecisions: PendingDecision[];

  // Reshuffling
  reshufflingEnabled: boolean;
  reshufflingPolicy: ReshufflingPolicy;

  // Settings
  settings: {
    locationTracking: boolean;
    notifications: boolean;
    autoReshuffle: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
  };
}

interface ExecutionActions {
  // Lifecycle
  startExecution: (tripId: string, dayNumber: number, day: DayWithOptions) => void;
  stopExecution: () => void;
  pauseExecution: (reason?: string) => void;
  resumeExecution: () => void;

  // Activity management
  checkInActivity: (slotId: string) => ActivityExecution | null;
  checkOutActivity: (slotId: string, rating?: number, notes?: string) => ActivityExecution | null;
  skipActivity: (slotId: string, reason?: string) => ActivityExecution | null;
  deferActivity: (slotId: string, toDayNumber: number) => ActivityExecution | null;
  extendActivity: (slotId: string, minutes: number) => TimeExtensionResult;
  transitionActivityState: (slotId: string, trigger: TransitionTrigger) => ActivityExecution | null;

  // Location
  updateLocation: (location: UserLocation) => void;
  setGeofences: (geofences: Geofence[]) => void;

  // Notifications
  scheduleNotification: (notification: ScheduledNotification) => void;
  dismissNotification: (notificationId: string) => void;
  clearNotifications: () => void;

  // Decisions
  addDecision: (decision: PendingDecision) => void;
  resolveDecision: (decisionId: string, selectedOption: string) => void;
  dismissDecision: (decisionId: string) => void;

  // Settings
  updateSettings: (settings: Partial<ExecutionState["settings"]>) => void;
  setReshufflingPolicy: (policy: ReshufflingPolicy) => void;

  // Getters (computed)
  getProgress: () => DayProgress | null;
  getCurrentActivity: () => ActivityExecution | null;
  getUpcomingActivities: () => ActivityExecution[];
  getActivityBySlotId: (slotId: string) => ActivityExecution | null;
}

export type ExecutionStore = ExecutionState & ExecutionActions;

// ============================================
// INITIAL STATE
// ============================================

const initialState: ExecutionState = {
  tripId: null,
  mode: "idle",
  currentDay: null,
  activities: new Map(),
  location: null,
  geofences: [],
  scheduledNotifications: [],
  activeNotifications: [],
  dismissedNotificationIds: [],
  pendingDecisions: [],
  reshufflingEnabled: true,
  reshufflingPolicy: DEFAULT_RESHUFFLING_POLICY,
  settings: {
    locationTracking: true,
    notifications: true,
    autoReshuffle: false,
    quietHoursStart: "22:00",
    quietHoursEnd: "08:00",
  },
};

// ============================================
// STORE CREATION
// ============================================

export const useExecutionStore = create<ExecutionStore>()(
  immer((set, get) => ({
    ...initialState,

    // ============================================
    // LIFECYCLE ACTIONS
    // ============================================

    startExecution: (tripId: string, dayNumber: number, day: DayWithOptions) => {
      set((state) => {
        state.tripId = tripId;
        state.mode = "active";
        state.currentDay = {
          dayNumber,
          date: day.date,
          day,
        };

        // Initialize activity executions
        const activities = new Map<string, ActivityExecution>();
        const baseDate = new Date(day.date);

        for (const slot of day.slots) {
          const execution = createActivityExecution(slot.slotId, slot, baseDate);
          activities.set(slot.slotId, execution);
        }

        state.activities = activities;
        state.pendingDecisions = [];
        state.scheduledNotifications = [];
        state.activeNotifications = [];
      });
    },

    stopExecution: () => {
      set((state) => {
        state.tripId = null;
        state.mode = "idle";
        state.currentDay = null;
        state.activities = new Map();
        state.location = null;
        state.geofences = [];
        state.scheduledNotifications = [];
        state.activeNotifications = [];
        state.pendingDecisions = [];
      });
    },

    pauseExecution: (_reason?: string) => {
      set((state) => {
        if (state.mode === "active") {
          state.mode = "paused";
        }
      });
    },

    resumeExecution: () => {
      set((state) => {
        if (state.mode === "paused") {
          state.mode = "active";
        }
      });
    },

    // ============================================
    // ACTIVITY MANAGEMENT
    // ============================================

    checkInActivity: (slotId: string): ActivityExecution | null => {
      let result: ActivityExecution | null = null;

      set((state) => {
        const execution = state.activities.get(slotId);
        if (!execution) return;

        // Transition based on current state
        let trigger: TransitionTrigger = "user_check_in";
        const updated = transitionActivity(execution, trigger);

        if (updated) {
          state.activities.set(slotId, updated);
          result = updated;
        }
      });

      return result;
    },

    checkOutActivity: (slotId: string, rating?: number, notes?: string): ActivityExecution | null => {
      let result: ActivityExecution | null = null;

      set((state) => {
        const execution = state.activities.get(slotId);
        if (!execution) return;

        const updated = transitionActivity(execution, "user_check_out", { rating, notes });

        if (updated) {
          state.activities.set(slotId, updated);
          result = updated;
        }
      });

      return result;
    },

    skipActivity: (slotId: string, reason?: string): ActivityExecution | null => {
      let result: ActivityExecution | null = null;

      set((state) => {
        const execution = state.activities.get(slotId);
        if (!execution) return;

        const updated = transitionActivity(execution, "user_skip", { skipReason: reason });

        if (updated) {
          state.activities.set(slotId, updated);
          result = updated;
        }
      });

      return result;
    },

    deferActivity: (slotId: string, toDayNumber: number): ActivityExecution | null => {
      let result: ActivityExecution | null = null;

      set((state) => {
        const execution = state.activities.get(slotId);
        if (!execution) return;

        const updated = transitionActivity(execution, "user_defer", {
          deferredTo: { dayNumber: toDayNumber },
        });

        if (updated) {
          state.activities.set(slotId, updated);
          result = updated;
        }
      });

      return result;
    },

    extendActivity: (slotId: string, minutes: number): TimeExtensionResult => {
      const state = get();

      if (!state.currentDay) {
        return {
          success: false,
          appliedExtension: 0,
          impact: {
            nextActivityAffected: false,
            activitiesShortened: [],
            activitiesSkipped: [],
            bookingsAtRisk: [],
          },
          message: "No active day schedule",
        };
      }

      const result = calculateExtensionImpact(state.currentDay.day, slotId, minutes);

      if (result.success) {
        set((state) => {
          const execution = state.activities.get(slotId);
          if (execution) {
            const updated = transitionActivity(execution, "user_extend", {
              extendedBy: result.appliedExtension,
            });
            if (updated) {
              state.activities.set(slotId, updated);
            }
          }
        });
      }

      return result;
    },

    transitionActivityState: (slotId: string, trigger: TransitionTrigger): ActivityExecution | null => {
      let result: ActivityExecution | null = null;

      set((state) => {
        const execution = state.activities.get(slotId);
        if (!execution) return;

        const updated = transitionActivity(execution, trigger);

        if (updated) {
          state.activities.set(slotId, updated);
          result = updated;
        }
      });

      return result;
    },

    // ============================================
    // LOCATION
    // ============================================

    updateLocation: (location: UserLocation) => {
      set((state) => {
        state.location = location;
      });
    },

    setGeofences: (geofences: Geofence[]) => {
      set((state) => {
        state.geofences = geofences;
      });
    },

    // ============================================
    // NOTIFICATIONS
    // ============================================

    scheduleNotification: (notification: ScheduledNotification) => {
      set((state) => {
        state.scheduledNotifications.push(notification);
      });
    },

    dismissNotification: (notificationId: string) => {
      set((state) => {
        state.dismissedNotificationIds.push(notificationId);
        state.activeNotifications = state.activeNotifications.filter(
          (n: ScheduledNotification) => n.id !== notificationId
        );
      });
    },

    clearNotifications: () => {
      set((state) => {
        state.scheduledNotifications = [];
        state.activeNotifications = [];
      });
    },

    // ============================================
    // DECISIONS
    // ============================================

    addDecision: (decision: PendingDecision) => {
      set((state) => {
        state.pendingDecisions.push(decision);
      });
    },

    resolveDecision: (decisionId: string, _selectedOption: string) => {
      set((state) => {
        state.pendingDecisions = state.pendingDecisions.filter(
          (d: PendingDecision) => d.id !== decisionId
        );
      });
    },

    dismissDecision: (decisionId: string) => {
      set((state) => {
        state.pendingDecisions = state.pendingDecisions.filter(
          (d: PendingDecision) => d.id !== decisionId
        );
      });
    },

    // ============================================
    // SETTINGS
    // ============================================

    updateSettings: (newSettings: Partial<ExecutionState["settings"]>) => {
      set((state) => {
        state.settings = { ...state.settings, ...newSettings };
      });
    },

    setReshufflingPolicy: (policy: ReshufflingPolicy) => {
      set((state) => {
        state.reshufflingPolicy = policy;
      });
    },

    // ============================================
    // GETTERS (computed values)
    // ============================================

    getProgress: (): DayProgress | null => {
      const state = get();
      if (!state.currentDay) return null;

      return calculateDayProgress(state.currentDay.day, state.activities);
    },

    getCurrentActivity: (): ActivityExecution | null => {
      const state = get();
      return getProgressCurrentActivity(state.activities);
    },

    getUpcomingActivities: (): ActivityExecution[] => {
      const state = get();
      return getUpcomingActivities(state.activities);
    },

    getActivityBySlotId: (slotId: string): ActivityExecution | null => {
      const state = get();
      return state.activities.get(slotId) || null;
    },
  }))
);

// ============================================
// SELECTOR HOOKS
// ============================================

export const useExecutionMode = () => useExecutionStore((state) => state.mode);
export const useCurrentDay = () => useExecutionStore((state) => state.currentDay);
export const useExecutionProgress = () => useExecutionStore((state) => state.getProgress());
export const usePendingDecisions = () => useExecutionStore((state) => state.pendingDecisions);
export const useActiveNotifications = () => useExecutionStore((state) => state.activeNotifications);
export const useExecutionSettings = () => useExecutionStore((state) => state.settings);

/**
 * Get activity execution by slot ID
 */
export function useActivityExecution(slotId: string): ActivityExecution | null {
  return useExecutionStore((state) => state.activities.get(slotId) || null);
}

/**
 * Check if we're in execution mode
 */
export function useIsExecuting(): boolean {
  return useExecutionStore((state) => state.mode === "active" || state.mode === "paused");
}

/**
 * Get the list of completed activities
 */
export function useCompletedActivities(): CompletedActivity[] {
  return useExecutionStore((state) => {
    const completed: CompletedActivity[] = [];
    for (const execution of state.activities.values()) {
      const activity = toCompletedActivity(execution);
      if (activity) {
        completed.push(activity);
      }
    }
    return completed;
  });
}

/**
 * Get the list of skipped activities
 */
export function useSkippedActivities(): SkippedActivity[] {
  return useExecutionStore((state) => {
    const skipped: SkippedActivity[] = [];
    for (const execution of state.activities.values()) {
      const activity = toSkippedActivity(execution);
      if (activity) {
        skipped.push(activity);
      }
    }
    return skipped;
  });
}
