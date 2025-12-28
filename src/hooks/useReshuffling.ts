"use client";

/**
 * useReshuffling Hook
 *
 * Provides real-time reshuffling functionality for trip schedules.
 * Handles trigger detection, impact analysis, and schedule modifications.
 */

import { useState, useCallback, useRef, useEffect } from "react";
import type {
  TriggerEvent,
  ImpactAnalysis,
  ReshuffleResult,
  ReshuffleStrategy,
  ScheduleChange,
  ScheduleStatus,
  UserState,
} from "@/types/reshuffling";

// ============================================
// TYPES
// ============================================

interface ReshuffleState {
  isChecking: boolean;
  isApplying: boolean;
  status: ScheduleStatus;
  currentTrigger: TriggerEvent | null;
  impact: ImpactAnalysis | null;
  suggestedResult: ReshuffleResult | null;
  alternatives: ReshuffleResult[];
  lastChange: ScheduleChange[] | null;
  undoToken: string | null;
  error: string | null;
}

interface UseReshufflingOptions {
  tripId: string;
  dayIndex: number;
  autoCheckInterval?: number; // milliseconds, 0 to disable
  onScheduleUpdate?: (changes: ScheduleChange[]) => void;
  onUndoExpired?: () => void;
}

interface UseReshufflingReturn {
  state: ReshuffleState;
  showModal: boolean;
  autoApplyCountdown: number | null;

  // Actions
  checkTriggers: (message?: string, userState?: UserState) => Promise<void>;
  applyReshuffle: (result: ReshuffleResult) => Promise<void>;
  applyStrategy: (strategy: ReshuffleStrategy) => Promise<void>;
  rejectReshuffle: () => void;
  undoReshuffle: () => Promise<void>;
  dismissModal: () => void;

  // Helpers
  reportRunningLate: (delayMinutes: number) => Promise<void>;
  reportTired: (level: "slight" | "very" | "exhausted") => Promise<void>;
  reportNeedBreak: () => Promise<void>;
  reportDoneForDay: () => Promise<void>;
  reportClosure: (venueName: string) => Promise<void>;
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

export function useReshuffling({
  tripId,
  dayIndex,
  autoCheckInterval = 0,
  onScheduleUpdate,
  onUndoExpired,
}: UseReshufflingOptions): UseReshufflingReturn {
  // State
  const [state, setState] = useState<ReshuffleState>({
    isChecking: false,
    isApplying: false,
    status: "on_track",
    currentTrigger: null,
    impact: null,
    suggestedResult: null,
    alternatives: [],
    lastChange: null,
    undoToken: null,
    error: null,
  });

  const [showModal, setShowModal] = useState(false);
  const [autoApplyCountdown, setAutoApplyCountdown] = useState<number | null>(null);

  // Refs
  const autoCheckIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const autoApplyTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const undoExpiryTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ============================================
  // API CALLS
  // ============================================

  /**
   * Check for triggers based on user input or state
   */
  const checkTriggers = useCallback(async (
    message?: string,
    userState?: UserState
  ) => {
    if (!tripId) return;

    setState(prev => ({ ...prev, isChecking: true, error: null }));

    try {
      const response = await fetch("/api/reshuffle/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          currentTime: new Date().toISOString(),
          userReportedIssue: message,
          userState,
        }),
      });

      const data = await response.json();

      if (data.success && data.data) {
        const { triggersDetected, suggestedActions, scheduleStatus } = data.data;

        setState(prev => ({
          ...prev,
          isChecking: false,
          status: scheduleStatus,
          currentTrigger: triggersDetected[0] || null,
          suggestedResult: suggestedActions[0] || null,
          alternatives: suggestedActions.slice(1),
        }));

        // Show modal if there are triggers
        if (triggersDetected.length > 0 && suggestedActions.length > 0) {
          setShowModal(true);

          // Start auto-apply countdown if configured
          const suggestedResult = suggestedActions[0];
          if (suggestedResult?.autoApplyIn && !suggestedResult.requiresConfirmation) {
            startAutoApplyCountdown(suggestedResult.autoApplyIn);
          }
        }
      } else {
        setState(prev => ({
          ...prev,
          isChecking: false,
          error: data.error?.message || "Failed to check triggers",
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isChecking: false,
        error: error instanceof Error ? error.message : "Network error",
      }));
    }
  }, [tripId]);

  /**
   * Apply a reshuffling result
   */
  const applyReshuffle = useCallback(async (result: ReshuffleResult) => {
    if (!tripId) return;

    // Clear auto-apply countdown
    if (autoApplyTimeoutRef.current) {
      clearTimeout(autoApplyTimeoutRef.current);
      autoApplyTimeoutRef.current = null;
    }
    setAutoApplyCountdown(null);

    setState(prev => ({ ...prev, isApplying: true, error: null }));

    try {
      const response = await fetch("/api/reshuffle/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          triggerId: result.triggerId,
          selectedStrategy: result.strategy,
        }),
      });

      const data = await response.json();

      if (data.success && data.data) {
        setState(prev => ({
          ...prev,
          isApplying: false,
          lastChange: data.data.changes,
          undoToken: data.data.undoToken,
          currentTrigger: null,
          suggestedResult: null,
          alternatives: [],
        }));

        // Notify parent of schedule update
        onScheduleUpdate?.(data.data.changes);

        // Set undo expiry (2 hours)
        if (data.data.undoToken) {
          scheduleUndoExpiry(data.data.undoToken, 2 * 60 * 60 * 1000);
        }

        setShowModal(false);
      } else {
        setState(prev => ({
          ...prev,
          isApplying: false,
          error: data.error?.message || "Failed to apply reshuffle",
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isApplying: false,
        error: error instanceof Error ? error.message : "Network error",
      }));
    }
  }, [tripId, onScheduleUpdate]);

  /**
   * Apply a specific strategy
   */
  const applyStrategy = useCallback(async (strategy: ReshuffleStrategy) => {
    if (!state.suggestedResult) return;

    // Find matching result or create new request
    const matchingResult = state.alternatives.find(r => r.strategy === strategy);

    if (matchingResult) {
      await applyReshuffle(matchingResult);
    } else if (state.suggestedResult.strategy === strategy) {
      await applyReshuffle(state.suggestedResult);
    } else {
      // Apply strategy directly
      setState(prev => ({ ...prev, isApplying: true, error: null }));

      try {
        const response = await fetch("/api/reshuffle/apply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tripId,
            triggerId: state.currentTrigger?.id || "manual",
            selectedStrategy: strategy,
          }),
        });

        const data = await response.json();

        if (data.success) {
          setState(prev => ({
            ...prev,
            isApplying: false,
            lastChange: data.data.changes,
            undoToken: data.data.undoToken,
            currentTrigger: null,
            suggestedResult: null,
            alternatives: [],
          }));

          onScheduleUpdate?.(data.data.changes);
          setShowModal(false);
        } else {
          setState(prev => ({
            ...prev,
            isApplying: false,
            error: data.error?.message || "Failed to apply strategy",
          }));
        }
      } catch (error) {
        setState(prev => ({
          ...prev,
          isApplying: false,
          error: error instanceof Error ? error.message : "Network error",
        }));
      }
    }
  }, [tripId, state.suggestedResult, state.alternatives, state.currentTrigger, applyReshuffle, onScheduleUpdate]);

  /**
   * Reject the suggested reshuffle
   */
  const rejectReshuffle = useCallback(() => {
    // Clear auto-apply countdown
    if (autoApplyTimeoutRef.current) {
      clearTimeout(autoApplyTimeoutRef.current);
      autoApplyTimeoutRef.current = null;
    }
    setAutoApplyCountdown(null);

    setState(prev => ({
      ...prev,
      currentTrigger: null,
      suggestedResult: null,
      alternatives: [],
    }));

    setShowModal(false);
  }, []);

  /**
   * Undo the last reshuffle
   */
  const undoReshuffle = useCallback(async () => {
    if (!tripId || !state.undoToken) return;

    setState(prev => ({ ...prev, isApplying: true, error: null }));

    try {
      const response = await fetch("/api/reshuffle/undo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          undoToken: state.undoToken,
          dayIndex,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setState(prev => ({
          ...prev,
          isApplying: false,
          lastChange: null,
          undoToken: null,
        }));

        // Clear undo expiry
        if (undoExpiryTimeoutRef.current) {
          clearTimeout(undoExpiryTimeoutRef.current);
          undoExpiryTimeoutRef.current = null;
        }
      } else {
        setState(prev => ({
          ...prev,
          isApplying: false,
          error: data.error?.message || "Failed to undo",
        }));
      }
    } catch (error) {
      setState(prev => ({
        ...prev,
        isApplying: false,
        error: error instanceof Error ? error.message : "Network error",
      }));
    }
  }, [tripId, dayIndex, state.undoToken]);

  /**
   * Dismiss the modal without action
   */
  const dismissModal = useCallback(() => {
    setShowModal(false);

    // Clear auto-apply countdown
    if (autoApplyTimeoutRef.current) {
      clearTimeout(autoApplyTimeoutRef.current);
      autoApplyTimeoutRef.current = null;
    }
    setAutoApplyCountdown(null);
  }, []);

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  const startAutoApplyCountdown = useCallback((seconds: number) => {
    setAutoApplyCountdown(seconds);

    const tick = () => {
      setAutoApplyCountdown(prev => {
        if (prev === null || prev <= 1) {
          // Auto-apply when countdown reaches 0
          if (state.suggestedResult) {
            applyReshuffle(state.suggestedResult);
          }
          return null;
        }
        return prev - 1;
      });
    };

    // Tick every second
    autoApplyTimeoutRef.current = setInterval(tick, 1000) as unknown as NodeJS.Timeout;
  }, [state.suggestedResult, applyReshuffle]);

  const scheduleUndoExpiry = useCallback((_undoToken: string, expiryMs: number) => {
    if (undoExpiryTimeoutRef.current) {
      clearTimeout(undoExpiryTimeoutRef.current);
    }

    undoExpiryTimeoutRef.current = setTimeout(() => {
      setState(prev => ({ ...prev, undoToken: null }));
      onUndoExpired?.();
    }, expiryMs);
  }, [onUndoExpired]);

  // ============================================
  // CONVENIENCE METHODS
  // ============================================

  const reportRunningLate = useCallback(async (delayMinutes: number) => {
    await checkTriggers(`I'm running ${delayMinutes} minutes late`);
  }, [checkTriggers]);

  const reportTired = useCallback(async (level: "slight" | "very" | "exhausted") => {
    const stateMap: Record<string, UserState> = {
      slight: "slight_tired",
      very: "very_tired",
      exhausted: "very_tired",
    };
    await checkTriggers(undefined, stateMap[level]);
  }, [checkTriggers]);

  const reportNeedBreak = useCallback(async () => {
    await checkTriggers(undefined, "need_break");
  }, [checkTriggers]);

  const reportDoneForDay = useCallback(async () => {
    await checkTriggers(undefined, "done_for_day");
  }, [checkTriggers]);

  const reportClosure = useCallback(async (venueName: string) => {
    await checkTriggers(`${venueName} is closed`);
  }, [checkTriggers]);

  // ============================================
  // AUTO-CHECK INTERVAL
  // ============================================

  useEffect(() => {
    if (autoCheckInterval > 0) {
      autoCheckIntervalRef.current = setInterval(() => {
        checkTriggers();
      }, autoCheckInterval);

      return () => {
        if (autoCheckIntervalRef.current) {
          clearInterval(autoCheckIntervalRef.current);
        }
      };
    }
  }, [autoCheckInterval, checkTriggers]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (autoCheckIntervalRef.current) {
        clearInterval(autoCheckIntervalRef.current);
      }
      if (autoApplyTimeoutRef.current) {
        clearTimeout(autoApplyTimeoutRef.current);
      }
      if (undoExpiryTimeoutRef.current) {
        clearTimeout(undoExpiryTimeoutRef.current);
      }
    };
  }, []);

  // ============================================
  // RETURN
  // ============================================

  return {
    state,
    showModal,
    autoApplyCountdown,

    // Actions
    checkTriggers,
    applyReshuffle,
    applyStrategy,
    rejectReshuffle,
    undoReshuffle,
    dismissModal,

    // Helpers
    reportRunningLate,
    reportTired,
    reportNeedBreak,
    reportDoneForDay,
    reportClosure,
  };
}

// ============================================
// EXPORTS
// ============================================

export type { ReshuffleState, UseReshufflingOptions, UseReshufflingReturn };
