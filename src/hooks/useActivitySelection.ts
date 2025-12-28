"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import type {
  ScoredActivity,
  SwipeAction,
  TripMode,
  PaceMode,
} from "@/types/activity-suggestion";

// ============================================
// TYPES
// ============================================

export interface SelectionSlot {
  id: string;
  dayNumber: number;
  date: string;
  timeSlot: {
    label: string;
    startTime: string;
    endTime: string;
  };
  options: ScoredActivityOption[];
  selectedOption: ScoredActivityOption | null;
  status: "pending" | "in-progress" | "selected" | "skipped";
}

export interface ScoredActivityOption {
  activity: ScoredActivity;
  score: number;
  scoreBreakdown: {
    interestMatch: number;
    timeOfDayFit: number;
    durationFit: number;
    budgetMatch: number;
    locationProximity: number;
    varietyBonus: number;
  };
  explanation: string;
  commuteFromPrevious?: {
    durationMinutes: number;
    method: "walk" | "transit" | "taxi";
    distanceMeters: number;
  };
  warnings?: string[];
  tags: string[];
}

export interface SwipeHistoryItem {
  slotId: string;
  optionId: string;
  action: SwipeAction;
  timestamp: Date;
}

export interface SelectionSession {
  id: string;
  tripId: string;
  slots: SelectionSlot[];
  currentSlotIndex: number;
  currentOptionIndex: number;
  swipeHistory: SwipeHistoryItem[];
  isComplete: boolean;
  stats: {
    totalSlots: number;
    slotsCompleted: number;
    activitiesAccepted: number;
    activitiesSaved: number;
    activitiesRejected: number;
  };
}

export interface UseActivitySelectionOptions {
  tripId: string;
  slots: SelectionSlot[];
  tripMode: TripMode;
  paceMode?: PaceMode;
  onSlotComplete?: (slotId: string, selectedOption: ScoredActivityOption | null) => void;
  onSessionComplete?: (session: SelectionSession) => void;
  onSwipe?: (slotId: string, activityId: string, action: SwipeAction) => Promise<void>;
}

export interface UseActivitySelectionReturn {
  session: SelectionSession;
  currentSlot: SelectionSlot | null;
  currentOption: ScoredActivityOption | null;
  remainingOptions: number;
  progress: number;
  isProcessing: boolean;

  // Actions
  handleSwipe: (action: SwipeAction) => Promise<void>;
  handleUndo: () => void;
  handleSkipSlot: () => void;
  handleGoToSlot: (index: number) => void;

  // Utilities
  getScoreColor: (score: number) => string;
  getScoreLabel: (score: number) => string;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

export function getScoreColor(score: number): string {
  if (score >= 85) return "text-green-600 dark:text-green-400";
  if (score >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 55) return "text-yellow-600 dark:text-yellow-400";
  if (score >= 40) return "text-orange-600 dark:text-orange-400";
  return "text-red-600 dark:text-red-400";
}

export function getScoreLabel(score: number): string {
  if (score >= 85) return "Excellent match";
  if (score >= 70) return "Great match";
  if (score >= 55) return "Good match";
  if (score >= 40) return "Fair match";
  return "Poor match";
}

export function getScoreBgColor(score: number): string {
  if (score >= 85) return "bg-green-100 dark:bg-green-900/30";
  if (score >= 70) return "bg-emerald-100 dark:bg-emerald-900/30";
  if (score >= 55) return "bg-yellow-100 dark:bg-yellow-900/30";
  if (score >= 40) return "bg-orange-100 dark:bg-orange-900/30";
  return "bg-red-100 dark:bg-red-900/30";
}

export function getScoreGradient(score: number): string {
  if (score >= 85) return "from-green-500 to-emerald-500";
  if (score >= 70) return "from-emerald-500 to-teal-500";
  if (score >= 55) return "from-yellow-500 to-amber-500";
  if (score >= 40) return "from-orange-500 to-red-500";
  return "from-red-500 to-rose-500";
}

// ============================================
// MAIN HOOK
// ============================================

export function useActivitySelection({
  tripId,
  slots,
  onSlotComplete,
  onSessionComplete,
  onSwipe,
}: UseActivitySelectionOptions): UseActivitySelectionReturn {
  const [isProcessing, setIsProcessing] = useState(false);
  const [session, setSession] = useState<SelectionSession>(() => ({
    id: `session-${Date.now()}`,
    tripId,
    slots,
    currentSlotIndex: 0,
    currentOptionIndex: 0,
    swipeHistory: [],
    isComplete: false,
    stats: {
      totalSlots: slots.length,
      slotsCompleted: 0,
      activitiesAccepted: 0,
      activitiesSaved: 0,
      activitiesRejected: 0,
    },
  }));

  // Reset session when slots change
  useEffect(() => {
    if (slots.length > 0) {
      setSession({
        id: `session-${Date.now()}`,
        tripId,
        slots,
        currentSlotIndex: 0,
        currentOptionIndex: 0,
        swipeHistory: [],
        isComplete: false,
        stats: {
          totalSlots: slots.length,
          slotsCompleted: 0,
          activitiesAccepted: 0,
          activitiesSaved: 0,
          activitiesRejected: 0,
        },
      });
    }
  }, [slots, tripId]);

  // Derived state
  const currentSlot = session.slots[session.currentSlotIndex] || null;
  const currentOption = currentSlot?.options[session.currentOptionIndex] || null;
  const remainingOptions = currentSlot
    ? currentSlot.options.length - session.currentOptionIndex
    : 0;

  // Progress calculation
  const progress = useMemo(() => {
    const completedSlots = session.slots.filter(
      (s) => s.status === "selected" || s.status === "skipped"
    ).length;
    return session.slots.length > 0
      ? (completedSlots / session.slots.length) * 100
      : 0;
  }, [session.slots]);

  // Handle swipe action
  const handleSwipe = useCallback(
    async (action: SwipeAction) => {
      if (!currentSlot || !currentOption || isProcessing) return;

      setIsProcessing(true);

      try {
        // Call external handler if provided
        if (onSwipe) {
          await onSwipe(currentSlot.id, currentOption.activity.activity.id, action);
        }

        setSession((prev) => {
          const slot = prev.slots[prev.currentSlotIndex];
          const option = slot?.options[prev.currentOptionIndex];

          if (!slot || !option) return prev;

          // Add to history
          const historyItem: SwipeHistoryItem = {
            slotId: slot.id,
            optionId: option.activity.activity.id,
            action,
            timestamp: new Date(),
          };

          const newHistory = [...prev.swipeHistory, historyItem];

          // Update stats
          const newStats = { ...prev.stats };
          switch (action) {
            case "keep":
            case "must-do":
              newStats.activitiesAccepted++;
              break;
            case "save-for-later":
              newStats.activitiesSaved++;
              break;
            case "reject":
              newStats.activitiesRejected++;
              break;
          }

          // Determine next state
          let newSlotIndex = prev.currentSlotIndex;
          let newOptionIndex = prev.currentOptionIndex;
          let newSlots = [...prev.slots];
          let isComplete = false;

          if (action === "keep" || action === "must-do") {
            // Activity selected - move to next slot
            newSlots[prev.currentSlotIndex] = {
              ...slot,
              selectedOption: option,
              status: "selected",
            };
            newStats.slotsCompleted++;
            newSlotIndex++;
            newOptionIndex = 0;

            // Notify slot complete
            setTimeout(() => onSlotComplete?.(slot.id, option), 0);
          } else if (action === "save-for-later" || action === "reject") {
            // Move to next option
            newOptionIndex++;
            if (newOptionIndex >= slot.options.length) {
              // No more options for this slot
              newSlots[prev.currentSlotIndex] = {
                ...slot,
                status: "skipped",
              };
              newStats.slotsCompleted++;
              newSlotIndex++;
              newOptionIndex = 0;

              // Notify slot complete
              setTimeout(() => onSlotComplete?.(slot.id, null), 0);
            }
          }

          // Check if session is complete
          if (newSlotIndex >= prev.slots.length) {
            isComplete = true;
          }

          const newSession = {
            ...prev,
            slots: newSlots,
            currentSlotIndex: newSlotIndex,
            currentOptionIndex: newOptionIndex,
            swipeHistory: newHistory,
            isComplete,
            stats: newStats,
          };

          // Notify session complete
          if (isComplete) {
            setTimeout(() => onSessionComplete?.(newSession), 0);
          }

          return newSession;
        });
      } finally {
        setIsProcessing(false);
      }
    },
    [currentSlot, currentOption, isProcessing, onSwipe, onSlotComplete, onSessionComplete]
  );

  // Handle undo
  const handleUndo = useCallback(() => {
    setSession((prev) => {
      if (prev.swipeHistory.length === 0) return prev;

      const lastAction = prev.swipeHistory[prev.swipeHistory.length - 1];
      const newHistory = prev.swipeHistory.slice(0, -1);

      // Find the slot that was affected
      const affectedSlotIndex = prev.slots.findIndex(
        (s) => s.id === lastAction.slotId
      );

      if (affectedSlotIndex === -1) return prev;

      // Revert the slot
      const newSlots = [...prev.slots];
      newSlots[affectedSlotIndex] = {
        ...newSlots[affectedSlotIndex],
        selectedOption: null,
        status: "in-progress",
      };

      // Revert stats
      const newStats = { ...prev.stats };
      switch (lastAction.action) {
        case "keep":
        case "must-do":
          newStats.activitiesAccepted--;
          newStats.slotsCompleted--;
          break;
        case "save-for-later":
          newStats.activitiesSaved--;
          if (prev.slots[affectedSlotIndex].status === "skipped") {
            newStats.slotsCompleted--;
          }
          break;
        case "reject":
          newStats.activitiesRejected--;
          if (prev.slots[affectedSlotIndex].status === "skipped") {
            newStats.slotsCompleted--;
          }
          break;
      }

      // Find the option index for the affected option
      const optionIndex = newSlots[affectedSlotIndex].options.findIndex(
        (o) => o.activity.activity.id === lastAction.optionId
      );

      return {
        ...prev,
        slots: newSlots,
        currentSlotIndex: affectedSlotIndex,
        currentOptionIndex: optionIndex >= 0 ? optionIndex : 0,
        swipeHistory: newHistory,
        isComplete: false,
        stats: newStats,
      };
    });
  }, []);

  // Handle skip slot
  const handleSkipSlot = useCallback(() => {
    setSession((prev) => {
      if (prev.currentSlotIndex >= prev.slots.length) return prev;

      const newSlots = [...prev.slots];
      newSlots[prev.currentSlotIndex] = {
        ...newSlots[prev.currentSlotIndex],
        status: "skipped",
      };

      const newStats = { ...prev.stats };
      newStats.slotsCompleted++;

      const newSlotIndex = prev.currentSlotIndex + 1;
      const isComplete = newSlotIndex >= prev.slots.length;

      // Notify slot complete
      setTimeout(() => onSlotComplete?.(newSlots[prev.currentSlotIndex].id, null), 0);

      const newSession = {
        ...prev,
        slots: newSlots,
        currentSlotIndex: newSlotIndex,
        currentOptionIndex: 0,
        isComplete,
        stats: newStats,
      };

      if (isComplete) {
        setTimeout(() => onSessionComplete?.(newSession), 0);
      }

      return newSession;
    });
  }, [onSlotComplete, onSessionComplete]);

  // Handle go to specific slot
  const handleGoToSlot = useCallback((index: number) => {
    setSession((prev) => {
      if (index < 0 || index >= prev.slots.length) return prev;
      return {
        ...prev,
        currentSlotIndex: index,
        currentOptionIndex: 0,
      };
    });
  }, []);

  return {
    session,
    currentSlot,
    currentOption,
    remainingOptions,
    progress,
    isProcessing,

    handleSwipe,
    handleUndo,
    handleSkipSlot,
    handleGoToSlot,

    getScoreColor,
    getScoreLabel,
  };
}

// ============================================
// SLOT BUILDER UTILITY
// ============================================

export interface BuildSlotsOptions {
  activities: ScoredActivity[];
  startDate: Date;
  numDays: number;
  slotsPerDay?: number;
}

export function buildSelectionSlots({
  activities,
  startDate,
  numDays,
  slotsPerDay = 4,
}: BuildSlotsOptions): SelectionSlot[] {
  const slots: SelectionSlot[] = [];
  const timeSlotTemplates = [
    { label: "Morning", startTime: "09:00", endTime: "12:00" },
    { label: "Lunch", startTime: "12:00", endTime: "14:00" },
    { label: "Afternoon", startTime: "14:00", endTime: "18:00" },
    { label: "Evening", startTime: "18:00", endTime: "21:00" },
  ];

  let activityIndex = 0;

  for (let day = 0; day < numDays; day++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + day);
    const dateStr = date.toISOString().split("T")[0];

    for (let slotIdx = 0; slotIdx < slotsPerDay && slotIdx < timeSlotTemplates.length; slotIdx++) {
      const template = timeSlotTemplates[slotIdx];

      // Get activities for this slot (up to 5 options)
      const slotActivities: ScoredActivityOption[] = [];
      for (let i = 0; i < 5 && activityIndex < activities.length; i++) {
        const activity = activities[activityIndex];
        slotActivities.push({
          activity,
          score: activity.totalScore || 70,
          scoreBreakdown: {
            interestMatch: activity.scoreBreakdown?.interestMatch || 0,
            timeOfDayFit: activity.scoreBreakdown?.timeOfDayFit || 0,
            durationFit: activity.scoreBreakdown?.durationFit || 0,
            budgetMatch: activity.scoreBreakdown?.budgetMatch || 0,
            locationProximity: 0,
            varietyBonus: activity.scoreBreakdown?.varietyBonus || 0,
          },
          explanation: activity.explanation || "Good match for your preferences",
          tags: activity.activity.tags || [],
        });
        activityIndex++;
      }

      if (slotActivities.length > 0) {
        slots.push({
          id: `slot-${day + 1}-${slotIdx}`,
          dayNumber: day + 1,
          date: dateStr,
          timeSlot: template,
          options: slotActivities,
          selectedOption: null,
          status: "pending",
        });
      }
    }
  }

  return slots;
}

// ============================================
// EXPORTS
// ============================================
