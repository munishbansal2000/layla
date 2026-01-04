// ============================================
// DAY PROGRESS CALCULATOR
// ============================================
// Pure functions to calculate day/activity progress during execution.
// Implements progress tracking from EXECUTION_PHASE_DESIGN.md

import {
  ActivityExecution,
  DayProgress,
  CompletedActivity,
  SkippedActivity,
} from "@/types/execution";
import { DayWithOptions } from "@/types/structured-itinerary";
import {
  isTerminalState,
  isActiveState,
  getScheduledDuration,
} from "./activity-lifecycle";
import { getSlotDuration } from "./execution-helpers";

// ============================================
// PROGRESS CALCULATION
// ============================================

/**
 * Calculate overall progress for the current day
 */
export function calculateDayProgress(
  day: DayWithOptions,
  activities: Map<string, ActivityExecution>
): DayProgress {
  const totalActivities = day.slots.length;

  // Count completed activities
  let completedActivities = 0;
  let completedDuration = 0;
  let remainingDuration = 0;

  for (const slot of day.slots) {
    const execution = activities.get(slot.slotId);
    const slotDuration = getSlotDuration(slot);

    if (execution) {
      if (execution.state === "completed") {
        completedActivities++;
        // Use actual duration if available, otherwise scheduled
        const actualDuration = execution.actualEnd && execution.actualStart
          ? Math.floor((execution.actualEnd.getTime() - execution.actualStart.getTime()) / 60000)
          : getScheduledDuration(execution);
        completedDuration += actualDuration;
      } else if (execution.state === "skipped") {
        completedActivities++; // Count skipped as "done" for progress
      } else if (!isTerminalState(execution.state)) {
        remainingDuration += slotDuration;
      }
    } else {
      remainingDuration += slotDuration;
    }
  }

  // Calculate current delay
  const currentDelay = calculateDelayMinutes(day, activities, new Date());

  // Calculate percentage
  const percentComplete = totalActivities > 0
    ? Math.round((completedActivities / totalActivities) * 100)
    : 0;

  return {
    completedActivities,
    totalActivities,
    completedDuration,
    remainingDuration,
    currentDelay,
    percentComplete,
  };
}

/**
 * Get all completed activities from the execution map
 */
export function getCompletedActivities(
  activities: Map<string, ActivityExecution>
): ActivityExecution[] {
  return Array.from(activities.values()).filter(
    (a) => a.state === "completed"
  );
}

/**
 * Get all skipped activities from the execution map
 */
export function getSkippedActivities(
  activities: Map<string, ActivityExecution>
): ActivityExecution[] {
  return Array.from(activities.values()).filter(
    (a) => a.state === "skipped"
  );
}

/**
 * Get all upcoming activities (not yet started or completed)
 */
export function getUpcomingActivities(
  activities: Map<string, ActivityExecution>
): ActivityExecution[] {
  return Array.from(activities.values())
    .filter((a) => !isTerminalState(a.state) && !isActiveState(a.state))
    .sort((a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime());
}

/**
 * Get the currently active activity (in_progress or extended)
 */
export function getCurrentActivity(
  activities: Map<string, ActivityExecution>
): ActivityExecution | null {
  for (const activity of activities.values()) {
    if (isActiveState(activity.state)) {
      return activity;
    }
  }
  return null;
}

/**
 * Get the next upcoming activity after the current one
 */
export function getNextActivity(
  activities: Map<string, ActivityExecution>,
  currentTime: Date
): ActivityExecution | null {
  const upcoming = getUpcomingActivities(activities);

  if (upcoming.length === 0) {
    return null;
  }

  // Return the first activity that hasn't started yet
  for (const activity of upcoming) {
    if (activity.scheduledStart > currentTime) {
      return activity;
    }
  }

  // If no future activities, return the first upcoming one
  return upcoming[0];
}

// ============================================
// DELAY CALCULATION
// ============================================

/**
 * Calculate how many minutes behind schedule we are
 * Positive = behind, Negative = ahead
 */
export function calculateDelayMinutes(
  day: DayWithOptions,
  activities: Map<string, ActivityExecution>,
  currentTime: Date
): number {
  // Find the current or next activity that should be happening
  interface ExpectedSlot {
    slotId: string;
    scheduledStart: string;
    scheduledEnd: string;
  }
  let expectedCurrentSlot: ExpectedSlot | null = null;

  for (const slot of day.slots) {
    const [startHours, startMinutes] = slot.timeRange.start.split(":").map(Number);
    const [endHours, endMinutes] = slot.timeRange.end.split(":").map(Number);

    const slotStart = new Date(currentTime);
    slotStart.setHours(startHours, startMinutes, 0, 0);

    const slotEnd = new Date(currentTime);
    slotEnd.setHours(endHours, endMinutes, 0, 0);

    // Find the activity that should be happening now
    if (currentTime >= slotStart && currentTime <= slotEnd) {
      expectedCurrentSlot = {
        slotId: slot.slotId,
        scheduledStart: slot.timeRange.start,
        scheduledEnd: slot.timeRange.end,
      };
      break;
    }

    // Or the next upcoming activity
    if (currentTime < slotStart) {
      expectedCurrentSlot = {
        slotId: slot.slotId,
        scheduledStart: slot.timeRange.start,
        scheduledEnd: slot.timeRange.end,
      };
      break;
    }
  }

  if (!expectedCurrentSlot) {
    return 0; // No activities to track
  }

  const execution = activities.get(expectedCurrentSlot.slotId);

  if (!execution) {
    return 0; // No execution data yet
  }

  // If we should be doing an activity but haven't started
  const [startHours, startMinutes] = expectedCurrentSlot.scheduledStart.split(":").map(Number);
  const scheduledStart = new Date(currentTime);
  scheduledStart.setHours(startHours, startMinutes, 0, 0);

  if (currentTime > scheduledStart && execution.state === "upcoming") {
    // We should have started but haven't
    return Math.floor((currentTime.getTime() - scheduledStart.getTime()) / 60000);
  }

  if (execution.state === "in_progress" || execution.state === "extended") {
    // Check if we're running over
    const [endHours, endMinutes] = expectedCurrentSlot.scheduledEnd.split(":").map(Number);
    const scheduledEnd = new Date(currentTime);
    scheduledEnd.setHours(endHours, endMinutes, 0, 0);

    if (currentTime > scheduledEnd) {
      return Math.floor((currentTime.getTime() - scheduledEnd.getTime()) / 60000);
    }
  }

  // Check if we started late
  if (execution.actualStart && execution.actualStart > execution.scheduledStart) {
    return Math.floor(
      (execution.actualStart.getTime() - execution.scheduledStart.getTime()) / 60000
    );
  }

  return 0;
}

/**
 * Check if we're on schedule
 */
export function isOnSchedule(delayMinutes: number, threshold: number = 10): boolean {
  return Math.abs(delayMinutes) <= threshold;
}

/**
 * Get schedule status based on delay
 */
export function getScheduleStatusFromDelay(delayMinutes: number): "on_track" | "minor_delay" | "needs_attention" | "critical" {
  if (delayMinutes <= 5) return "on_track";
  if (delayMinutes <= 15) return "minor_delay";
  if (delayMinutes <= 30) return "needs_attention";
  return "critical";
}

// ============================================
// ACTIVITY SORTING & FILTERING
// ============================================

/**
 * Sort activities by their scheduled start time
 */
export function sortActivitiesByTime(
  activities: ActivityExecution[]
): ActivityExecution[] {
  return [...activities].sort(
    (a, b) => a.scheduledStart.getTime() - b.scheduledStart.getTime()
  );
}

/**
 * Get activities in a specific state
 */
export function getActivitiesByState(
  activities: Map<string, ActivityExecution>,
  state: ActivityExecution["state"]
): ActivityExecution[] {
  return Array.from(activities.values()).filter((a) => a.state === state);
}

/**
 * Get activities that are pending (about to start)
 */
export function getPendingActivities(
  activities: Map<string, ActivityExecution>
): ActivityExecution[] {
  return getActivitiesByState(activities, "pending");
}

/**
 * Get activities that are in transit
 */
export function getEnRouteActivities(
  activities: Map<string, ActivityExecution>
): ActivityExecution[] {
  return getActivitiesByState(activities, "en_route");
}

// ============================================
// DURATION CALCULATIONS
// ============================================

/**
 * Get total scheduled duration for all activities
 */
export function getTotalScheduledDuration(day: DayWithOptions): number {
  return day.slots.reduce((total, slot) => total + getSlotDuration(slot), 0);
}

/**
 * Get total actual duration spent on completed activities
 */
export function getTotalActualDuration(
  activities: Map<string, ActivityExecution>
): number {
  let total = 0;

  for (const activity of activities.values()) {
    if (activity.state === "completed" && activity.actualStart && activity.actualEnd) {
      total += Math.floor(
        (activity.actualEnd.getTime() - activity.actualStart.getTime()) / 60000
      );
    }
  }

  return total;
}

/**
 * Get time until the next activity starts
 */
export function getTimeUntilNextActivity(
  activities: Map<string, ActivityExecution>,
  currentTime: Date
): number | null {
  const next = getNextActivity(activities, currentTime);

  if (!next) {
    return null;
  }

  const diffMs = next.scheduledStart.getTime() - currentTime.getTime();
  return Math.max(0, Math.floor(diffMs / 60000));
}

/**
 * Get time remaining in the current activity
 */
export function getTimeRemainingInCurrentActivity(
  activities: Map<string, ActivityExecution>,
  currentTime: Date
): number | null {
  const current = getCurrentActivity(activities);

  if (!current) {
    return null;
  }

  let endTime = current.scheduledEnd;
  if (current.extendedBy) {
    endTime = new Date(current.scheduledEnd);
    endTime.setMinutes(endTime.getMinutes() + current.extendedBy);
  }

  const diffMs = endTime.getTime() - currentTime.getTime();
  return Math.floor(diffMs / 60000);
}

// ============================================
// CONVERSION UTILITIES
// ============================================

/**
 * Convert ActivityExecution to CompletedActivity
 */
export function toCompletedActivity(
  execution: ActivityExecution
): CompletedActivity | null {
  if (execution.state !== "completed" || !execution.actualStart || !execution.actualEnd) {
    return null;
  }

  return {
    slotId: execution.slotId,
    slot: execution.slot,
    startedAt: execution.actualStart,
    completedAt: execution.actualEnd,
    actualDuration: Math.floor(
      (execution.actualEnd.getTime() - execution.actualStart.getTime()) / 60000
    ),
    rating: execution.rating,
    notes: execution.notes,
    photos: execution.photos,
  };
}

/**
 * Convert ActivityExecution to SkippedActivity
 */
export function toSkippedActivity(
  execution: ActivityExecution
): SkippedActivity | null {
  if (execution.state !== "skipped") {
    return null;
  }

  return {
    slotId: execution.slotId,
    slot: execution.slot,
    skippedAt: new Date(),
    reason: execution.skipReason,
    deferredTo: execution.deferredTo,
  };
}

// ============================================
// SUMMARY GENERATION
// ============================================

/**
 * Get a text summary of the current progress
 */
export function getProgressSummary(progress: DayProgress): string {
  const { completedActivities, totalActivities, percentComplete, currentDelay } = progress;

  let summary = `${completedActivities}/${totalActivities} activities completed (${percentComplete}%)`;

  if (currentDelay > 0) {
    summary += ` • ${currentDelay} min behind schedule`;
  } else if (currentDelay < -5) {
    summary += ` • ${Math.abs(currentDelay)} min ahead of schedule`;
  } else {
    summary += " • On track";
  }

  return summary;
}

/**
 * Get activities that need attention (pending or running late)
 */
export function getActivitiesNeedingAttention(
  activities: Map<string, ActivityExecution>,
  currentTime: Date
): ActivityExecution[] {
  const needsAttention: ActivityExecution[] = [];

  for (const activity of activities.values()) {
    // Activity should have started but hasn't
    if (
      activity.state === "upcoming" &&
      currentTime > activity.scheduledStart
    ) {
      needsAttention.push(activity);
    }

    // Activity is running over time
    if (
      activity.state === "extended" ||
      (isActiveState(activity.state) && currentTime > activity.scheduledEnd)
    ) {
      needsAttention.push(activity);
    }
  }

  return needsAttention;
}
