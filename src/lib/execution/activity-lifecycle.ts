// ============================================
// ACTIVITY LIFECYCLE STATE MACHINE
// ============================================
// Pure functions for activity state transitions during execution.
// Implements the Activity State Machine from EXECUTION_PHASE_DESIGN.md

import {
  ActivityState,
  ActivityExecution,
  TransitionTrigger,
  ActivityTransition,
} from "@/types/execution";
import { SlotWithOptions } from "@/types/structured-itinerary";

// ============================================
// STATE TRANSITION DEFINITIONS
// ============================================

/**
 * All valid state transitions with their triggers
 */
export const ACTIVITY_TRANSITIONS: ActivityTransition[] = [
  // Normal flow
  { from: "upcoming", to: "pending", trigger: "time_threshold" },
  { from: "pending", to: "en_route", trigger: "user_check_in" },
  { from: "pending", to: "en_route", trigger: "location_detected" },
  { from: "en_route", to: "arrived", trigger: "location_detected" },
  { from: "arrived", to: "in_progress", trigger: "user_check_in" },
  { from: "in_progress", to: "completed", trigger: "user_check_out" },
  { from: "in_progress", to: "completed", trigger: "time_threshold" },

  // Extensions
  { from: "in_progress", to: "extended", trigger: "time_threshold" },
  { from: "in_progress", to: "extended", trigger: "user_extend" },
  { from: "extended", to: "completed", trigger: "user_check_out" },
  { from: "extended", to: "completed", trigger: "time_threshold" },

  // Skip paths
  { from: "upcoming", to: "skipped", trigger: "user_skip" },
  { from: "pending", to: "skipped", trigger: "user_skip" },
  { from: "arrived", to: "skipped", trigger: "user_skip" },

  // Defer paths
  { from: "upcoming", to: "deferred", trigger: "user_defer" },
  { from: "pending", to: "deferred", trigger: "user_defer" },

  // System changes
  { from: "upcoming", to: "replaced", trigger: "system_reshuffle" },
  { from: "pending", to: "replaced", trigger: "external_trigger" },
  { from: "upcoming", to: "replaced", trigger: "external_trigger" },

  // Early checkout
  { from: "in_progress", to: "completed", trigger: "user_shorten" },
  { from: "extended", to: "completed", trigger: "user_shorten" },
];

/**
 * Terminal states that cannot transition further
 */
export const TERMINAL_STATES: ActivityState[] = [
  "completed",
  "skipped",
  "deferred",
  "replaced",
];

/**
 * Active states where the user is engaged with the activity
 */
export const ACTIVE_STATES: ActivityState[] = [
  "in_progress",
  "extended",
];

// ============================================
// TRANSITION VALIDATION
// ============================================

/**
 * Check if a state transition is valid
 */
export function isValidTransition(
  from: ActivityState,
  to: ActivityState
): boolean {
  return ACTIVITY_TRANSITIONS.some(
    (t) => t.from === from && t.to === to
  );
}

/**
 * Get all valid transitions for a given trigger from current state
 */
export function getValidTransitionsForTrigger(
  currentState: ActivityState,
  trigger: TransitionTrigger
): ActivityState[] {
  return ACTIVITY_TRANSITIONS
    .filter((t) => t.from === currentState && t.trigger === trigger)
    .map((t) => t.to);
}

/**
 * Get all available next states from current state
 */
export function getAvailableTransitions(state: ActivityState): ActivityState[] {
  const transitions = ACTIVITY_TRANSITIONS
    .filter((t) => t.from === state)
    .map((t) => t.to);

  // Return unique states
  return [...new Set(transitions)];
}

/**
 * Get all triggers that can transition from current state
 */
export function getAvailableTriggers(state: ActivityState): TransitionTrigger[] {
  const triggers = ACTIVITY_TRANSITIONS
    .filter((t) => t.from === state)
    .map((t) => t.trigger);

  return [...new Set(triggers)];
}

/**
 * Check if a state is terminal (no further transitions possible)
 */
export function isTerminalState(state: ActivityState): boolean {
  return TERMINAL_STATES.includes(state);
}

/**
 * Check if a state is active (user is engaged with activity)
 */
export function isActiveState(state: ActivityState): boolean {
  return ACTIVE_STATES.includes(state);
}

// ============================================
// ACTIVITY EXECUTION FUNCTIONS
// ============================================

/**
 * Create an initial ActivityExecution from a SlotWithOptions
 */
export function createActivityExecution(
  slotId: string,
  slot: SlotWithOptions,
  scheduledDate: Date
): ActivityExecution {
  const [startHours, startMinutes] = slot.timeRange.start.split(":").map(Number);
  const [endHours, endMinutes] = slot.timeRange.end.split(":").map(Number);

  const scheduledStart = new Date(scheduledDate);
  scheduledStart.setHours(startHours, startMinutes, 0, 0);

  const scheduledEnd = new Date(scheduledDate);
  scheduledEnd.setHours(endHours, endMinutes, 0, 0);

  return {
    slotId,
    slot,
    state: "upcoming",
    scheduledStart,
    scheduledEnd,
  };
}

/**
 * Transition an activity to a new state based on trigger
 * Returns the updated execution or null if transition is invalid
 */
export function transitionActivity(
  execution: ActivityExecution,
  trigger: TransitionTrigger,
  options?: {
    skipReason?: string;
    deferredTo?: { dayNumber: number; slotId?: string };
    replacedWith?: string;
    extendedBy?: number;
    shortenedBy?: number;
    rating?: number;
    notes?: string;
  }
): ActivityExecution | null {
  const validNextStates = getValidTransitionsForTrigger(execution.state, trigger);

  if (validNextStates.length === 0) {
    return null; // Invalid transition
  }

  // Determine the next state (first valid one)
  const nextState = validNextStates[0];
  const now = new Date();

  // Create updated execution
  const updated: ActivityExecution = {
    ...execution,
    state: nextState,
  };

  // Handle state-specific updates
  switch (nextState) {
    case "pending":
      // No additional changes needed
      break;

    case "en_route":
      updated.departedAt = now;
      break;

    case "arrived":
      updated.arrivedAt = now;
      break;

    case "in_progress":
      updated.actualStart = now;
      break;

    case "extended":
      updated.extendedBy = options?.extendedBy ?? 15; // Default 15 min extension
      break;

    case "completed":
      updated.actualEnd = now;
      updated.rating = options?.rating;
      updated.notes = options?.notes;
      if (options?.shortenedBy) {
        updated.shortenedBy = options.shortenedBy;
        updated.completionType = "early";
      } else if (execution.state === "extended") {
        updated.completionType = "forced";
      } else {
        updated.completionType = "natural";
      }
      break;

    case "skipped":
      updated.skipReason = options?.skipReason;
      break;

    case "deferred":
      updated.deferredTo = options?.deferredTo;
      break;

    case "replaced":
      updated.replacedWith = options?.replacedWith;
      break;
  }

  return updated;
}

// ============================================
// TIME-BASED TRANSITION LOGIC
// ============================================

/**
 * Time threshold in minutes before activity becomes "pending"
 */
export const PENDING_THRESHOLD_MINUTES = 30;

/**
 * Get time until activity should become "pending"
 * Returns negative number if already past pending threshold
 */
export function getTimeUntilPending(
  execution: ActivityExecution,
  currentTime: Date
): number {
  const pendingTime = new Date(execution.scheduledStart);
  pendingTime.setMinutes(pendingTime.getMinutes() - PENDING_THRESHOLD_MINUTES);

  const diffMs = pendingTime.getTime() - currentTime.getTime();
  return Math.floor(diffMs / (1000 * 60)); // minutes
}

/**
 * Get time remaining in current activity
 * Returns negative if past scheduled end
 */
export function getTimeRemaining(
  execution: ActivityExecution,
  currentTime: Date
): number {
  let endTime = execution.scheduledEnd;

  // Account for extensions
  if (execution.extendedBy) {
    endTime = new Date(execution.scheduledEnd);
    endTime.setMinutes(endTime.getMinutes() + execution.extendedBy);
  }

  const diffMs = endTime.getTime() - currentTime.getTime();
  return Math.floor(diffMs / (1000 * 60)); // minutes
}

/**
 * Check if activity should auto-transition based on time
 * Returns the new state if transition should happen, null otherwise
 */
export function shouldAutoTransition(
  execution: ActivityExecution,
  currentTime: Date
): { state: ActivityState; trigger: TransitionTrigger } | null {
  const { state, scheduledStart, scheduledEnd, extendedBy } = execution;

  // Calculate times
  const pendingTime = new Date(scheduledStart);
  pendingTime.setMinutes(pendingTime.getMinutes() - PENDING_THRESHOLD_MINUTES);

  let effectiveEndTime = scheduledEnd;
  if (extendedBy) {
    effectiveEndTime = new Date(scheduledEnd);
    effectiveEndTime.setMinutes(effectiveEndTime.getMinutes() + extendedBy);
  }

  switch (state) {
    case "upcoming":
      // Should become pending 30 min before
      if (currentTime >= pendingTime) {
        return { state: "pending", trigger: "time_threshold" };
      }
      break;

    case "in_progress":
      // Should become extended or completed at end time
      if (currentTime >= scheduledEnd) {
        // If already extended, don't transition again
        if (!extendedBy) {
          return { state: "extended", trigger: "time_threshold" };
        }
      }
      if (extendedBy && currentTime >= effectiveEndTime) {
        return { state: "completed", trigger: "time_threshold" };
      }
      break;

    case "extended":
      // Should complete at extended end time
      if (currentTime >= effectiveEndTime) {
        return { state: "completed", trigger: "time_threshold" };
      }
      break;
  }

  return null;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get elapsed time since activity started
 */
export function getElapsedTime(
  execution: ActivityExecution,
  currentTime: Date
): number {
  if (!execution.actualStart) {
    return 0;
  }
  const diffMs = currentTime.getTime() - execution.actualStart.getTime();
  return Math.floor(diffMs / (1000 * 60)); // minutes
}

/**
 * Get the actual duration of a completed activity
 */
export function getActualDuration(execution: ActivityExecution): number | null {
  if (execution.state !== "completed" || !execution.actualStart || !execution.actualEnd) {
    return null;
  }
  const diffMs = execution.actualEnd.getTime() - execution.actualStart.getTime();
  return Math.floor(diffMs / (1000 * 60)); // minutes
}

/**
 * Get scheduled duration in minutes
 */
export function getScheduledDuration(execution: ActivityExecution): number {
  const diffMs = execution.scheduledEnd.getTime() - execution.scheduledStart.getTime();
  return Math.floor(diffMs / (1000 * 60)); // minutes
}

/**
 * Check if activity is running over scheduled time
 */
export function isRunningOver(
  execution: ActivityExecution,
  currentTime: Date
): boolean {
  if (!isActiveState(execution.state)) {
    return false;
  }
  return currentTime > execution.scheduledEnd;
}

/**
 * Get display state label for UI
 */
export function getStateLabel(state: ActivityState): string {
  const labels: Record<ActivityState, string> = {
    upcoming: "Upcoming",
    pending: "Starting Soon",
    en_route: "On the way",
    arrived: "Arrived",
    in_progress: "In Progress",
    extended: "Extended",
    completed: "Completed",
    skipped: "Skipped",
    deferred: "Deferred",
    replaced: "Replaced",
  };
  return labels[state];
}

/**
 * Get state color for UI
 */
export function getStateColor(state: ActivityState): string {
  const colors: Record<ActivityState, string> = {
    upcoming: "gray",
    pending: "yellow",
    en_route: "blue",
    arrived: "cyan",
    in_progress: "green",
    extended: "orange",
    completed: "emerald",
    skipped: "red",
    deferred: "purple",
    replaced: "pink",
  };
  return colors[state];
}
