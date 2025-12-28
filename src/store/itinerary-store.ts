// ============================================
// ITINERARY STATE STORE
// ============================================
// Zustand store for managing itinerary state
// Integrates with Activity Suggestion Algorithm

import { create } from "zustand";
import { subscribeWithSelector } from "zustand/middleware";
import type {
  ScoredActivity,
  SwipeAction,
  TripMode,
  PaceMode,
  TravelerComposition,
} from "@/types/activity-suggestion";

// ============================================
// TYPES
// ============================================

export interface DayScheduleSlot {
  slotId: string;
  activity: ScoredActivity;
  scheduledStart: string;
  scheduledEnd: string;
  isLocked: boolean;
}

export interface DaySchedule {
  date: string;
  dayNumber: number;
  slots: DayScheduleSlot[];
  meals: {
    breakfast?: DayScheduleSlot;
    lunch?: DayScheduleSlot;
    dinner?: DayScheduleSlot;
  };
}

export interface Itinerary {
  id: string;
  destination: string;
  startDate: string;
  endDate: string;
  travelers: TravelerComposition;
  tripMode: TripMode;
  paceMode?: PaceMode;
  days: DaySchedule[];
  activityPool: ScoredActivity[];
  savedForLater: ScoredActivity[];
  rejectedActivities: string[];
  status: "draft" | "confirmed" | "in-progress" | "completed";
  createdAt: string;
  updatedAt: string;
}

export interface SwipeHistoryItem {
  activityId: string;
  slotId?: string;
  action: SwipeAction;
  timestamp: Date;
}

// ============================================
// STATE INTERFACE
// ============================================

interface ItineraryState {
  // Current itinerary
  itinerary: Itinerary | null;
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;

  // Selection state
  currentDayIndex: number;
  currentSlotId: string | null;
  selectedActivityId: string | null;

  // Swap state
  showSwapModal: boolean;
  swapSlotId: string | null;
  swapOptions: ScoredActivity[];
  isLoadingSwapOptions: boolean;

  // History
  swipeHistory: SwipeHistoryItem[];
  undoStack: { itinerary: Itinerary; action: string }[];

  // UI state
  viewMode: "calendar" | "list" | "swipe";
  showScoreBreakdown: boolean;
}

interface ItineraryActions {
  // Itinerary management
  setItinerary: (itinerary: Itinerary | null) => void;
  setLoading: (loading: boolean) => void;
  setGenerating: (generating: boolean) => void;
  setError: (error: string | null) => void;
  clearItinerary: () => void;

  // Navigation
  setCurrentDay: (index: number) => void;
  setCurrentSlot: (slotId: string | null) => void;
  selectActivity: (activityId: string | null) => void;
  nextDay: () => void;
  prevDay: () => void;

  // Slot operations
  updateSlot: (
    dayIndex: number,
    slotId: string,
    updates: Partial<DayScheduleSlot>
  ) => void;
  lockSlot: (slotId: string, locked: boolean) => void;
  removeSlot: (dayIndex: number, slotId: string) => void;

  // Swap operations
  openSwapModal: (slotId: string) => void;
  closeSwapModal: () => void;
  setSwapOptions: (options: ScoredActivity[]) => void;
  setLoadingSwapOptions: (loading: boolean) => void;
  executeSwap: (newActivity: ScoredActivity) => void;

  // Swipe operations
  recordSwipe: (activityId: string, action: SwipeAction, slotId?: string) => void;
  undoLastSwipe: () => Itinerary | null;

  // Activity pool operations
  addToSavedForLater: (activity: ScoredActivity) => void;
  removeFromSavedForLater: (activityId: string) => void;
  moveFromSavedToSchedule: (activityId: string, dayIndex: number, slotId: string) => void;

  // View operations
  setViewMode: (mode: "calendar" | "list" | "swipe") => void;
  toggleScoreBreakdown: () => void;

  // Computed
  getCurrentDay: () => DaySchedule | null;
  getCurrentSlot: () => DayScheduleSlot | null;
  getLockedSlots: () => DayScheduleSlot[];
  getProgress: () => { filled: number; total: number; percentage: number };
}

type ItineraryStore = ItineraryState & ItineraryActions;

// ============================================
// INITIAL STATE
// ============================================

const initialState: ItineraryState = {
  itinerary: null,
  isLoading: false,
  isGenerating: false,
  error: null,

  currentDayIndex: 0,
  currentSlotId: null,
  selectedActivityId: null,

  showSwapModal: false,
  swapSlotId: null,
  swapOptions: [],
  isLoadingSwapOptions: false,

  swipeHistory: [],
  undoStack: [],

  viewMode: "calendar",
  showScoreBreakdown: false,
};

// ============================================
// STORE CREATION
// ============================================

export const useItineraryStore = create<ItineraryStore>()(
  subscribeWithSelector((set, get) => ({
    ...initialState,

    // ========================================
    // Itinerary Management
    // ========================================

    setItinerary: (itinerary) => {
      set({
        itinerary,
        error: null,
        currentDayIndex: 0,
        currentSlotId: null,
        selectedActivityId: null,
      });
    },

    setLoading: (loading) => set({ isLoading: loading }),

    setGenerating: (generating) => set({ isGenerating: generating }),

    setError: (error) => set({ error }),

    clearItinerary: () => set(initialState),

    // ========================================
    // Navigation
    // ========================================

    setCurrentDay: (index) => {
      const state = get();
      if (state.itinerary && index >= 0 && index < state.itinerary.days.length) {
        set({ currentDayIndex: index, currentSlotId: null });
      }
    },

    setCurrentSlot: (slotId) => set({ currentSlotId: slotId }),

    selectActivity: (activityId) => set({ selectedActivityId: activityId }),

    nextDay: () => {
      const state = get();
      if (state.itinerary && state.currentDayIndex < state.itinerary.days.length - 1) {
        set({ currentDayIndex: state.currentDayIndex + 1, currentSlotId: null });
      }
    },

    prevDay: () => {
      const state = get();
      if (state.currentDayIndex > 0) {
        set({ currentDayIndex: state.currentDayIndex - 1, currentSlotId: null });
      }
    },

    // ========================================
    // Slot Operations
    // ========================================

    updateSlot: (dayIndex, slotId, updates) => {
      const state = get();
      if (!state.itinerary) return;

      const newDays = [...state.itinerary.days];
      const day = newDays[dayIndex];
      if (!day) return;

      const slotIndex = day.slots.findIndex((s) => s.slotId === slotId);
      if (slotIndex === -1) return;

      day.slots[slotIndex] = { ...day.slots[slotIndex], ...updates };

      set({
        itinerary: {
          ...state.itinerary,
          days: newDays,
          updatedAt: new Date().toISOString(),
        },
      });
    },

    lockSlot: (slotId, locked) => {
      const state = get();
      if (!state.itinerary) return;

      const newDays = state.itinerary.days.map((day) => ({
        ...day,
        slots: day.slots.map((slot) =>
          slot.slotId === slotId ? { ...slot, isLocked: locked } : slot
        ),
      }));

      set({
        itinerary: {
          ...state.itinerary,
          days: newDays,
          updatedAt: new Date().toISOString(),
        },
      });
    },

    removeSlot: (dayIndex, slotId) => {
      const state = get();
      if (!state.itinerary) return;

      const newDays = [...state.itinerary.days];
      const day = newDays[dayIndex];
      if (!day) return;

      day.slots = day.slots.filter((s) => s.slotId !== slotId);

      set({
        itinerary: {
          ...state.itinerary,
          days: newDays,
          updatedAt: new Date().toISOString(),
        },
      });
    },

    // ========================================
    // Swap Operations
    // ========================================

    openSwapModal: (slotId) => {
      set({
        showSwapModal: true,
        swapSlotId: slotId,
        swapOptions: [],
        isLoadingSwapOptions: true,
      });
    },

    closeSwapModal: () => {
      set({
        showSwapModal: false,
        swapSlotId: null,
        swapOptions: [],
        isLoadingSwapOptions: false,
      });
    },

    setSwapOptions: (options) => {
      set({ swapOptions: options, isLoadingSwapOptions: false });
    },

    setLoadingSwapOptions: (loading) => set({ isLoadingSwapOptions: loading }),

    executeSwap: (newActivity) => {
      const state = get();
      if (!state.itinerary || !state.swapSlotId) return;

      // Save current state for undo
      const undoEntry = {
        itinerary: JSON.parse(JSON.stringify(state.itinerary)),
        action: `Swap activity in slot ${state.swapSlotId}`,
      };

      // Find and update the slot
      const newDays = state.itinerary.days.map((day) => ({
        ...day,
        slots: day.slots.map((slot) =>
          slot.slotId === state.swapSlotId
            ? { ...slot, activity: newActivity }
            : slot
        ),
      }));

      set({
        itinerary: {
          ...state.itinerary,
          days: newDays,
          updatedAt: new Date().toISOString(),
        },
        undoStack: [...state.undoStack, undoEntry],
        showSwapModal: false,
        swapSlotId: null,
        swapOptions: [],
      });
    },

    // ========================================
    // Swipe Operations
    // ========================================

    recordSwipe: (activityId, action, slotId) => {
      const state = get();

      const historyItem: SwipeHistoryItem = {
        activityId,
        slotId,
        action,
        timestamp: new Date(),
      };

      // Handle action
      if (action === "reject" && state.itinerary) {
        set({
          itinerary: {
            ...state.itinerary,
            rejectedActivities: [...state.itinerary.rejectedActivities, activityId],
          },
          swipeHistory: [...state.swipeHistory, historyItem],
        });
      } else if (action === "save-for-later" && state.itinerary) {
        const activity = state.itinerary.activityPool.find((a) => a.activity.id === activityId);
        if (activity) {
          set({
            itinerary: {
              ...state.itinerary,
              savedForLater: [...state.itinerary.savedForLater, activity],
            },
            swipeHistory: [...state.swipeHistory, historyItem],
          });
        }
      } else {
        set({
          swipeHistory: [...state.swipeHistory, historyItem],
        });
      }
    },

    undoLastSwipe: () => {
      const state = get();
      if (state.undoStack.length === 0) return null;

      const lastEntry = state.undoStack[state.undoStack.length - 1];
      const newUndoStack = state.undoStack.slice(0, -1);

      set({
        itinerary: lastEntry.itinerary,
        undoStack: newUndoStack,
      });

      return lastEntry.itinerary;
    },

    // ========================================
    // Activity Pool Operations
    // ========================================

    addToSavedForLater: (activity) => {
      const state = get();
      if (!state.itinerary) return;

      set({
        itinerary: {
          ...state.itinerary,
          savedForLater: [...state.itinerary.savedForLater, activity],
        },
      });
    },

    removeFromSavedForLater: (activityId) => {
      const state = get();
      if (!state.itinerary) return;

      set({
        itinerary: {
          ...state.itinerary,
          savedForLater: state.itinerary.savedForLater.filter(
            (a) => a.activity.id !== activityId
          ),
        },
      });
    },

    moveFromSavedToSchedule: (activityId, dayIndex, slotId) => {
      const state = get();
      if (!state.itinerary) return;

      const activity = state.itinerary.savedForLater.find(
        (a) => a.activity.id === activityId
      );
      if (!activity) return;

      const newDays = [...state.itinerary.days];
      const day = newDays[dayIndex];
      if (!day) return;

      const slot = day.slots.find((s) => s.slotId === slotId);
      if (!slot) return;

      slot.activity = activity;

      set({
        itinerary: {
          ...state.itinerary,
          days: newDays,
          savedForLater: state.itinerary.savedForLater.filter(
            (a) => a.activity.id !== activityId
          ),
          updatedAt: new Date().toISOString(),
        },
      });
    },

    // ========================================
    // View Operations
    // ========================================

    setViewMode: (mode) => set({ viewMode: mode }),

    toggleScoreBreakdown: () =>
      set((state) => ({ showScoreBreakdown: !state.showScoreBreakdown })),

    // ========================================
    // Computed
    // ========================================

    getCurrentDay: () => {
      const state = get();
      if (!state.itinerary) return null;
      return state.itinerary.days[state.currentDayIndex] || null;
    },

    getCurrentSlot: () => {
      const state = get();
      const day = state.getCurrentDay();
      if (!day || !state.currentSlotId) return null;
      return day.slots.find((s) => s.slotId === state.currentSlotId) || null;
    },

    getLockedSlots: () => {
      const state = get();
      if (!state.itinerary) return [];
      return state.itinerary.days.flatMap((day) =>
        day.slots.filter((slot) => slot.isLocked)
      );
    },

    getProgress: () => {
      const state = get();
      if (!state.itinerary) return { filled: 0, total: 0, percentage: 0 };

      const total = state.itinerary.days.reduce(
        (acc, day) => acc + day.slots.length,
        0
      );
      const filled = state.itinerary.days.reduce(
        (acc, day) => acc + day.slots.filter((s) => s.activity).length,
        0
      );
      const percentage = total > 0 ? Math.round((filled / total) * 100) : 0;

      return { filled, total, percentage };
    },
  }))
);

// ============================================
// SELECTORS
// ============================================

export const selectItinerary = (state: ItineraryStore) => state.itinerary;
export const selectCurrentDay = (state: ItineraryStore) => state.getCurrentDay();
export const selectIsLoading = (state: ItineraryStore) => state.isLoading;
export const selectError = (state: ItineraryStore) => state.error;
export const selectProgress = (state: ItineraryStore) => state.getProgress();
export const selectViewMode = (state: ItineraryStore) => state.viewMode;
export const selectSwipeHistory = (state: ItineraryStore) => state.swipeHistory;

// ============================================
// EXPORTS
// ============================================

export default useItineraryStore;
