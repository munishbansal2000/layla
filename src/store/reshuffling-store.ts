// ============================================
// RESHUFFLING STATE STORE
// ============================================
// Zustand store for managing real-time reshuffling state
// Based on: docs/REALTIME_RESHUFFLING_ALGORITHM.md

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type { DaySchedule, ScheduledActivity } from "@/lib/schedule-builder";
import type {
  TriggerEvent,
  ImpactAnalysis,
  ReshuffleResult,
  ReshuffleEvent,
  ScheduleStatus,
  ScheduleChange,
  UserState,
  ReshuffleConfig,
  CheckTriggersResponse,
  CompletedActivity,
  SkippedActivity,
  InProgressActivity,
  UserLocation,
} from "@/types/reshuffling";

// ============================================
// STATE INTERFACE
// ============================================

interface ReshufflingState {
  // Current trip context
  tripId: string | null;
  currentDay: number;
  currentTime: string;

  // Schedule state
  originalSchedule: DaySchedule | null;
  currentSchedule: DaySchedule | null;
  scheduleStatus: ScheduleStatus;

  // Trigger management
  activeTriggers: TriggerEvent[];
  pendingTrigger: TriggerEvent | null;
  lastTriggerCheck: Date | null;

  // Impact analysis
  currentImpact: ImpactAnalysis | null;

  // Reshuffle suggestions
  suggestedReshuffle: ReshuffleResult | null;
  alternativeReshuffles: ReshuffleResult[];
  isProcessing: boolean;

  // History & Undo
  reshuffleHistory: ReshuffleEvent[];
  undoStack: ReshuffleEvent[];
  canUndo: boolean;

  // Activity tracking
  completedActivities: CompletedActivity[];
  skippedActivities: SkippedActivity[];
  inProgressActivity: InProgressActivity | null;

  // User state
  userLocation: UserLocation | null;
  userState: UserState | null;
  delayMinutes: number;

  // UI state
  showReshuffleModal: boolean;
  showUndoToast: boolean;
  undoToastMessage: string;
  autoApplyCountdown: number | null;

  // Configuration
  config: ReshuffleConfig | null;
}

interface ReshufflingActions {
  // Initialization
  initializeForTrip: (tripId: string, schedule: DaySchedule, day?: number) => void;
  setConfig: (config: ReshuffleConfig) => void;
  reset: () => void;

  // Schedule management
  setSchedule: (schedule: DaySchedule) => void;
  setOriginalSchedule: (schedule: DaySchedule) => void;
  updateScheduleStatus: (status: ScheduleStatus) => void;

  // Trigger management
  addTrigger: (trigger: TriggerEvent) => void;
  removeTrigger: (triggerId: string) => void;
  clearTriggers: () => void;
  setPendingTrigger: (trigger: TriggerEvent | null) => void;
  setLastTriggerCheck: (date: Date) => void;

  // Impact & Suggestions
  setImpact: (impact: ImpactAnalysis | null) => void;
  setSuggestedReshuffle: (result: ReshuffleResult | null) => void;
  setAlternatives: (alternatives: ReshuffleResult[]) => void;
  setIsProcessing: (processing: boolean) => void;

  // Apply reshuffles
  applyReshuffle: (result: ReshuffleResult, newSchedule: DaySchedule) => void;
  rejectReshuffle: () => void;

  // Undo
  undo: () => DaySchedule | null;
  addToUndoStack: (event: ReshuffleEvent) => void;
  clearUndoStack: () => void;

  // Activity tracking
  startActivity: (slotId: string) => void;
  completeActivity: (slotId: string, rating?: number, notes?: string) => void;
  skipActivity: (slotId: string, reason: string, deferToDay?: number) => void;
  extendCurrentActivity: (minutes: number) => void;

  // User state
  setUserLocation: (location: UserLocation | null) => void;
  setUserState: (state: UserState | null) => void;
  setDelayMinutes: (minutes: number) => void;
  reportDelay: (minutes: number) => void;

  // Time management
  setCurrentTime: (time: string) => void;
  setCurrentDay: (day: number) => void;

  // UI state
  openReshuffleModal: () => void;
  closeReshuffleModal: () => void;
  showUndoToastMessage: (message: string) => void;
  hideUndoToast: () => void;
  setAutoApplyCountdown: (seconds: number | null) => void;

  // API integration helpers
  handleCheckTriggersResponse: (response: CheckTriggersResponse) => void;
  applyChangesToSchedule: (changes: ScheduleChange[]) => DaySchedule | null;
}

type ReshufflingStore = ReshufflingState & ReshufflingActions;

// ============================================
// INITIAL STATE
// ============================================

const initialState: ReshufflingState = {
  tripId: null,
  currentDay: 1,
  currentTime: "",

  originalSchedule: null,
  currentSchedule: null,
  scheduleStatus: "on_track",

  activeTriggers: [],
  pendingTrigger: null,
  lastTriggerCheck: null,

  currentImpact: null,

  suggestedReshuffle: null,
  alternativeReshuffles: [],
  isProcessing: false,

  reshuffleHistory: [],
  undoStack: [],
  canUndo: false,

  completedActivities: [],
  skippedActivities: [],
  inProgressActivity: null,

  userLocation: null,
  userState: null,
  delayMinutes: 0,

  showReshuffleModal: false,
  showUndoToast: false,
  undoToastMessage: "",
  autoApplyCountdown: null,

  config: null,
};

// ============================================
// STORE CREATION
// ============================================

export const useReshufflingStore = create<ReshufflingStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // ========================================
    // Initialization
    // ========================================

    initializeForTrip: (tripId, schedule, day = 1) => {
      set({
        tripId,
        currentDay: day,
        originalSchedule: JSON.parse(JSON.stringify(schedule)),
        currentSchedule: schedule,
        scheduleStatus: "on_track",
        activeTriggers: [],
        pendingTrigger: null,
        currentImpact: null,
        suggestedReshuffle: null,
        alternativeReshuffles: [],
        reshuffleHistory: [],
        undoStack: [],
        canUndo: false,
        completedActivities: [],
        skippedActivities: [],
        inProgressActivity: null,
        delayMinutes: 0,
        showReshuffleModal: false,
      });
    },

    setConfig: (config) => set({ config }),

    reset: () => set(initialState),

    // ========================================
    // Schedule management
    // ========================================

    setSchedule: (schedule) => set({ currentSchedule: schedule }),

    setOriginalSchedule: (schedule) =>
      set({ originalSchedule: JSON.parse(JSON.stringify(schedule)) }),

    updateScheduleStatus: (status) => set({ scheduleStatus: status }),

    // ========================================
    // Trigger management
    // ========================================

    addTrigger: (trigger) =>
      set((state) => ({
        activeTriggers: [...state.activeTriggers, trigger],
      })),

    removeTrigger: (triggerId) =>
      set((state) => ({
        activeTriggers: state.activeTriggers.filter((t) => t.id !== triggerId),
      })),

    clearTriggers: () => set({ activeTriggers: [], pendingTrigger: null }),

    setPendingTrigger: (trigger) => set({ pendingTrigger: trigger }),

    setLastTriggerCheck: (date) => set({ lastTriggerCheck: date }),

    // ========================================
    // Impact & Suggestions
    // ========================================

    setImpact: (impact) => set({ currentImpact: impact }),

    setSuggestedReshuffle: (result) => set({ suggestedReshuffle: result }),

    setAlternatives: (alternatives) => set({ alternativeReshuffles: alternatives }),

    setIsProcessing: (processing) => set({ isProcessing: processing }),

    // ========================================
    // Apply reshuffles
    // ========================================

    applyReshuffle: (result, newSchedule) => {
      const state = get();
      const previousSchedule = state.currentSchedule;

      if (!previousSchedule) return;

      // Create reshuffle event for history
      const event: ReshuffleEvent = {
        id: result.id,
        triggeredAt: new Date(),
        trigger: state.pendingTrigger || {
          id: result.triggerId,
          type: "user_request",
          severity: "medium",
          detectedAt: new Date(),
          source: "user_input",
          context: {},
          affectedSlotIds: [],
        },
        strategyUsed: result.strategy,
        changesMade: result.changes,
        previousSchedule: previousSchedule,
        newSchedule: newSchedule,
        userConfirmed: true,
        undoAvailable: result.canUndo,
      };

      set({
        currentSchedule: newSchedule,
        reshuffleHistory: [...state.reshuffleHistory, event],
        undoStack: result.canUndo ? [...state.undoStack, event] : state.undoStack,
        canUndo: result.canUndo,
        suggestedReshuffle: null,
        alternativeReshuffles: [],
        pendingTrigger: null,
        currentImpact: null,
        showReshuffleModal: false,
        autoApplyCountdown: null,
      });

      // Remove applied trigger
      if (state.pendingTrigger) {
        set((s) => ({
          activeTriggers: s.activeTriggers.filter(
            (t) => t.id !== state.pendingTrigger?.id
          ),
        }));
      }
    },

    rejectReshuffle: () =>
      set({
        suggestedReshuffle: null,
        alternativeReshuffles: [],
        pendingTrigger: null,
        currentImpact: null,
        showReshuffleModal: false,
        autoApplyCountdown: null,
      }),

    // ========================================
    // Undo
    // ========================================

    undo: () => {
      const state = get();
      const lastEvent = state.undoStack[state.undoStack.length - 1];

      if (!lastEvent || !lastEvent.undoAvailable) {
        return null;
      }

      const newUndoStack = state.undoStack.slice(0, -1);

      // Mark as undone in history
      const updatedHistory = state.reshuffleHistory.map((e) =>
        e.id === lastEvent.id
          ? { ...e, undoneAt: new Date(), undoAvailable: false }
          : e
      );

      set({
        currentSchedule: lastEvent.previousSchedule,
        undoStack: newUndoStack,
        canUndo: newUndoStack.length > 0,
        reshuffleHistory: updatedHistory,
        showUndoToast: true,
        undoToastMessage: "Changes undone successfully",
      });

      return lastEvent.previousSchedule;
    },

    addToUndoStack: (event) =>
      set((state) => ({
        undoStack: [...state.undoStack, event],
        canUndo: true,
      })),

    clearUndoStack: () => set({ undoStack: [], canUndo: false }),

    // ========================================
    // Activity tracking
    // ========================================

    startActivity: (slotId) => {
      const state = get();
      const slot = state.currentSchedule?.slots.find((s) => s.slotId === slotId);

      if (!slot) return;

      set({
        inProgressActivity: {
          slotId,
          activity: slot,
          startedAt: new Date(),
          expectedEnd: new Date(Date.now() + slot.actualDuration * 60 * 1000),
        },
      });
    },

    completeActivity: (slotId, rating, notes) => {
      const state = get();
      const inProgress = state.inProgressActivity;

      if (!inProgress || inProgress.slotId !== slotId) {
        // Find the slot directly
        const slot = state.currentSchedule?.slots.find((s) => s.slotId === slotId);
        if (!slot) return;

        const completed: CompletedActivity = {
          slotId,
          activity: slot,
          startedAt: new Date(),
          completedAt: new Date(),
          actualDuration: slot.actualDuration,
          rating,
          notes,
        };

        set({
          completedActivities: [...state.completedActivities, completed],
        });
        return;
      }

      const completed: CompletedActivity = {
        slotId,
        activity: inProgress.activity,
        startedAt: inProgress.startedAt,
        completedAt: new Date(),
        actualDuration: Math.round(
          (Date.now() - inProgress.startedAt.getTime()) / 60000
        ),
        rating,
        notes,
      };

      set({
        completedActivities: [...state.completedActivities, completed],
        inProgressActivity: null,
      });
    },

    skipActivity: (slotId, reason, deferToDay) => {
      const state = get();
      const slot = state.currentSchedule?.slots.find((s) => s.slotId === slotId);

      if (!slot) return;

      const skipped: SkippedActivity = {
        slotId,
        activity: slot,
        skippedAt: new Date(),
        reason,
        deferredTo: deferToDay ? { dayNumber: deferToDay } : undefined,
      };

      // Remove from current schedule
      const newSlots = state.currentSchedule?.slots.filter(
        (s) => s.slotId !== slotId
      );

      set({
        skippedActivities: [...state.skippedActivities, skipped],
        currentSchedule: state.currentSchedule
          ? { ...state.currentSchedule, slots: newSlots || [] }
          : null,
        inProgressActivity:
          state.inProgressActivity?.slotId === slotId
            ? null
            : state.inProgressActivity,
      });
    },

    extendCurrentActivity: (minutes) => {
      const state = get();
      if (!state.inProgressActivity) return;

      set({
        inProgressActivity: {
          ...state.inProgressActivity,
          expectedEnd: new Date(
            state.inProgressActivity.expectedEnd.getTime() + minutes * 60 * 1000
          ),
          extendedBy: (state.inProgressActivity.extendedBy || 0) + minutes,
        },
      });
    },

    // ========================================
    // User state
    // ========================================

    setUserLocation: (location) => set({ userLocation: location }),

    setUserState: (state) => set({ userState: state }),

    setDelayMinutes: (minutes) => set({ delayMinutes: minutes }),

    reportDelay: (minutes) => {
      set({
        delayMinutes: minutes,
        scheduleStatus:
          minutes <= 10
            ? "on_track"
            : minutes <= 30
              ? "minor_delay"
              : minutes <= 60
                ? "needs_attention"
                : "critical",
      });
    },

    // ========================================
    // Time management
    // ========================================

    setCurrentTime: (time) => set({ currentTime: time }),

    setCurrentDay: (day) => set({ currentDay: day }),

    // ========================================
    // UI state
    // ========================================

    openReshuffleModal: () => set({ showReshuffleModal: true }),

    closeReshuffleModal: () =>
      set({
        showReshuffleModal: false,
        autoApplyCountdown: null,
      }),

    showUndoToastMessage: (message) =>
      set({
        showUndoToast: true,
        undoToastMessage: message,
      }),

    hideUndoToast: () =>
      set({
        showUndoToast: false,
        undoToastMessage: "",
      }),

    setAutoApplyCountdown: (seconds) => set({ autoApplyCountdown: seconds }),

    // ========================================
    // API integration helpers
    // ========================================

    handleCheckTriggersResponse: (response) => {
      set({
        activeTriggers: response.triggersDetected,
        scheduleStatus: response.scheduleStatus,
        lastTriggerCheck: new Date(),
      });

      // If there are suggested actions, set the first one
      if (response.suggestedActions.length > 0) {
        const [primary, ...alternatives] = response.suggestedActions;
        set({
          suggestedReshuffle: primary,
          alternativeReshuffles: alternatives,
          pendingTrigger: response.triggersDetected[0] || null,
          showReshuffleModal: primary.requiresConfirmation,
        });

        // Start auto-apply countdown if applicable
        if (!primary.requiresConfirmation && primary.autoApplyIn) {
          set({ autoApplyCountdown: primary.autoApplyIn });
        }
      }
    },

    applyChangesToSchedule: (changes) => {
      const state = get();
      if (!state.currentSchedule) return null;

      let schedule = JSON.parse(JSON.stringify(state.currentSchedule)) as DaySchedule;

      for (const change of changes) {
        switch (change.type) {
          case "time_shift": {
            const slot = schedule.slots.find((s) => s.slotId === change.slotId);
            if (slot && change.after.startTime && change.after.endTime) {
              slot.scheduledStart = change.after.startTime;
              slot.scheduledEnd = change.after.endTime;
            }
            break;
          }
          case "duration_change": {
            const slot = schedule.slots.find((s) => s.slotId === change.slotId);
            if (slot && change.after.duration !== undefined) {
              slot.actualDuration = change.after.duration;
              if (change.after.endTime) {
                slot.scheduledEnd = change.after.endTime;
              }
            }
            break;
          }
          case "activity_removed": {
            schedule = {
              ...schedule,
              slots: schedule.slots.filter((s) => s.slotId !== change.slotId),
            };
            break;
          }
          case "order_swap": {
            // Already handled by full schedule replacement
            break;
          }
        }
      }

      set({ currentSchedule: schedule });
      return schedule;
    },
  }))
);

// ============================================
// SELECTORS
// ============================================

/**
 * Select activities that are upcoming (not completed or skipped)
 */
export const selectUpcomingActivities = (state: ReshufflingStore): ScheduledActivity[] => {
  if (!state.currentSchedule) return [];

  const completedIds = new Set(state.completedActivities.map((c) => c.slotId));
  const skippedIds = new Set(state.skippedActivities.map((s) => s.slotId));

  return state.currentSchedule.slots.filter(
    (slot) => !completedIds.has(slot.slotId) && !skippedIds.has(slot.slotId)
  );
};

/**
 * Select if we have pending changes that need attention
 */
export const selectHasPendingChanges = (state: ReshufflingStore): boolean => {
  return state.suggestedReshuffle !== null || state.activeTriggers.length > 0;
};

/**
 * Select current progress through the day
 */
export const selectDayProgress = (
  state: ReshufflingStore
): { completed: number; total: number; percentage: number } => {
  const total = state.currentSchedule?.slots.length || 0;
  const completed = state.completedActivities.length;
  const percentage = total > 0 ? Math.round((completed / total) * 100) : 0;

  return { completed, total, percentage };
};

/**
 * Select if we're running behind schedule
 */
export const selectIsRunningLate = (state: ReshufflingStore): boolean => {
  return (
    state.delayMinutes > 10 ||
    state.scheduleStatus === "needs_attention" ||
    state.scheduleStatus === "critical"
  );
};

/**
 * Select the next upcoming activity
 */
export const selectNextActivity = (
  state: ReshufflingStore
): ScheduledActivity | null => {
  if (state.inProgressActivity) {
    return state.inProgressActivity.activity;
  }

  const upcoming = selectUpcomingActivities(state);
  return upcoming.length > 0 ? upcoming[0] : null;
};

// ============================================
// HOOKS
// ============================================

/**
 * Hook to get current schedule status with color
 */
export function useScheduleStatusColor(): {
  status: ScheduleStatus;
  color: string;
  bgColor: string;
} {
  const status = useReshufflingStore((state) => state.scheduleStatus);

  const colors: Record<ScheduleStatus, { color: string; bgColor: string }> = {
    on_track: { color: "text-green-600", bgColor: "bg-green-100" },
    minor_delay: { color: "text-yellow-600", bgColor: "bg-yellow-100" },
    needs_attention: { color: "text-orange-600", bgColor: "bg-orange-100" },
    critical: { color: "text-red-600", bgColor: "bg-red-100" },
  };

  return { status, ...colors[status] };
}

// ============================================
// EXPORTS
// ============================================

export default useReshufflingStore;
