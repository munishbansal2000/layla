// ============================================
// REAL-TIME RESHUFFLING SERVICE
// ============================================
// Based on: docs/REALTIME_RESHUFFLING_ALGORITHM.md
// Implements Phase 1: Core Reshuffling Infrastructure
//
// This service handles:
// - Trigger detection (user-reported)
// - Impact analysis
// - Strategy selection
// - Schedule modifications (shift, compress, skip, swap)
// - Undo capability

import {
  TriggerEvent,
  TriggerType,
  TriggerSeverity,
  TriggerSource,
  UserState,
  ImpactAnalysis,
  AffectedActivity,
  BookingRisk,
  CascadeLevel,
  UrgencyLevel,
  ReshuffleStrategy,
  ReshuffleResult,
  ScheduleChange,
  ReshuffleEvent,
  ScheduleStatus,
  ReshuffleConfig,
  DEFAULT_RESHUFFLE_CONFIG,
  DEFAULT_FLEXIBILITY,
  ActivityFlexibility,
  CheckTriggersRequest,
  CheckTriggersResponse,
  ApplyReshuffleRequest,
  ApplyReshuffleResponse,
  UndoReshuffleRequest,
  UndoReshuffleResponse,
} from "@/types/reshuffling";

import {
  DaySchedule,
  ScheduledActivity,
  timeToMinutes,
  minutesToTime,
} from "./schedule-builder";

import { CoreActivity } from "@/types/activity-suggestion";

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Get current time in HH:MM format
 */
function getCurrentTimeString(): string {
  const now = new Date();
  return `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;
}

/**
 * Calculate delay between expected and actual time
 */
function calculateDelayMinutes(expectedTime: string, actualTime: string): number {
  const expected = timeToMinutes(expectedTime);
  const actual = timeToMinutes(actualTime);
  return actual - expected;
}

/**
 * Get activity flexibility based on category
 */
function getActivityFlexibility(
  activity: ScheduledActivity
): ActivityFlexibility {
  const category = (activity.activity.activity as CoreActivity).category || "landmark";
  const defaults = DEFAULT_FLEXIBILITY[category] || {};

  return {
    canShorten: defaults.canShorten ?? true,
    minDuration: activity.actualDuration * 0.5,
    maxShortenPercent: defaults.maxShortenPercent ?? 30,
    canSkip: defaults.canSkip ?? true,
    skipPriority: defaults.skipPriority ?? 50,
    canSwapWith: [],
    canDefer: true,
    deferDays: 2,
    hasBooking: activity.isLocked || false,
    bookingFlexibility: activity.isLocked
      ? {
          canReschedule: false,
          refundable: false,
        }
      : undefined,
  };
}

/**
 * Deep clone a schedule for undo
 */
function cloneSchedule(schedule: DaySchedule): DaySchedule {
  return JSON.parse(JSON.stringify(schedule));
}

// ============================================
// TRIGGER DETECTION
// ============================================

/**
 * Detect severity based on delay
 */
function detectDelaySeverity(delayMinutes: number): TriggerSeverity {
  if (delayMinutes <= 10) return "low";
  if (delayMinutes <= 30) return "medium";
  if (delayMinutes <= 60) return "high";
  return "critical";
}

/**
 * Detect severity based on user state
 */
function detectUserStateSeverity(state: UserState): TriggerSeverity {
  switch (state) {
    case "energized":
    case "early":
      return "low";
    case "slight_tired":
    case "running_late":
      return "medium";
    case "very_tired":
    case "need_break":
      return "high";
    case "done_for_day":
    case "sick":
      return "critical";
    default:
      return "medium";
  }
}

/**
 * Parse user message to detect trigger type
 */
function parseUserMessage(message: string): {
  type: TriggerType;
  state?: UserState;
  delayMinutes?: number;
} {
  const lowerMessage = message.toLowerCase();

  // Check for running late
  if (
    lowerMessage.includes("late") ||
    lowerMessage.includes("behind") ||
    lowerMessage.includes("delayed")
  ) {
    // Try to extract minutes
    const minuteMatch = lowerMessage.match(/(\d+)\s*(min|minute)/);
    const delayMinutes = minuteMatch ? parseInt(minuteMatch[1]) : 15;
    return { type: "running_late", state: "running_late", delayMinutes };
  }

  // Check for tiredness
  if (
    lowerMessage.includes("tired") ||
    lowerMessage.includes("exhausted") ||
    lowerMessage.includes("need rest")
  ) {
    const state = lowerMessage.includes("very") || lowerMessage.includes("exhausted")
      ? "very_tired"
      : "slight_tired";
    return { type: "user_state", state };
  }

  // Check for break request
  if (
    lowerMessage.includes("break") ||
    lowerMessage.includes("rest") ||
    lowerMessage.includes("slow down")
  ) {
    return { type: "user_state", state: "need_break" };
  }

  // Check for closure
  if (
    lowerMessage.includes("closed") ||
    lowerMessage.includes("shut") ||
    lowerMessage.includes("not open")
  ) {
    return { type: "closure" };
  }

  // Check for ending day
  if (
    lowerMessage.includes("done for today") ||
    lowerMessage.includes("call it a day") ||
    lowerMessage.includes("go back to hotel")
  ) {
    return { type: "user_state", state: "done_for_day" };
  }

  // Check for feeling unwell
  if (
    lowerMessage.includes("sick") ||
    lowerMessage.includes("unwell") ||
    lowerMessage.includes("not feeling good")
  ) {
    return { type: "user_state", state: "sick" };
  }

  // Default to user request
  return { type: "user_request" };
}

/**
 * Create a trigger event from user input
 */
export function createTriggerFromUserInput(
  message: string,
  schedule: DaySchedule,
  currentTime?: string
): TriggerEvent {
  const parsed = parseUserMessage(message);
  const now = currentTime || getCurrentTimeString();

  // Find affected slots (activities after current time)
  const affectedSlotIds = schedule.slots
    .filter((slot) => timeToMinutes(slot.scheduledStart) >= timeToMinutes(now))
    .map((slot) => slot.slotId);

  return {
    id: generateId(),
    type: parsed.type,
    severity: parsed.state
      ? detectUserStateSeverity(parsed.state)
      : parsed.delayMinutes
        ? detectDelaySeverity(parsed.delayMinutes)
        : "medium",
    detectedAt: new Date(),
    source: "user_input" as TriggerSource,
    context: {
      delayMinutes: parsed.delayMinutes,
      userState: parsed.state,
      userMessage: message,
    },
    affectedSlotIds,
  };
}

/**
 * Create a trigger event for running late with specific delay
 */
export function createDelayTrigger(
  delayMinutes: number,
  schedule: DaySchedule,
  currentTime?: string,
  source: TriggerSource = "user_input"
): TriggerEvent {
  const now = currentTime || getCurrentTimeString();

  const affectedSlotIds = schedule.slots
    .filter((slot) => timeToMinutes(slot.scheduledStart) >= timeToMinutes(now))
    .map((slot) => slot.slotId);

  return {
    id: generateId(),
    type: "running_late",
    severity: detectDelaySeverity(delayMinutes),
    detectedAt: new Date(),
    source,
    context: {
      delayMinutes,
    },
    affectedSlotIds,
  };
}

// ============================================
// IMPACT ANALYSIS
// ============================================

/**
 * Analyze the impact of a trigger on the schedule
 */
export function analyzeImpact(
  trigger: TriggerEvent,
  schedule: DaySchedule,
  config: ReshuffleConfig = DEFAULT_RESHUFFLE_CONFIG
): ImpactAnalysis {
  const affectedActivities: AffectedActivity[] = [];
  const bookingsAtRisk: BookingRisk[] = [];
  let totalDelayMinutes = trigger.context.delayMinutes || 0;

  // For user state triggers, estimate delay impact
  if (trigger.type === "user_state") {
    switch (trigger.context.userState) {
      case "need_break":
        totalDelayMinutes = 30; // Assume 30 min break
        break;
      case "done_for_day":
        totalDelayMinutes = 999; // Cancel rest of day
        break;
      case "sick":
        totalDelayMinutes = 999;
        break;
      case "very_tired":
        totalDelayMinutes = 45;
        break;
      case "slight_tired":
        totalDelayMinutes = 15;
        break;
      default:
        totalDelayMinutes = 0;
    }
  }

  // Analyze each affected slot
  let cumulativeDelay = totalDelayMinutes;

  for (const slotId of trigger.affectedSlotIds) {
    const slot = schedule.slots.find((s) => s.slotId === slotId);
    if (!slot) continue;

    const flexibility = getActivityFlexibility(slot);
    const slotDuration = slot.actualDuration;

    // Calculate impact
    let impactType: AffectedActivity["impactType"] = "delayed";
    let impactSeverity = Math.min(100, (cumulativeDelay / 60) * 100);
    let canRecover = true;
    const recoveryOptions: AffectedActivity["recoveryOptions"] = [];

    // Check if activity can be shortened
    if (flexibility.canShorten && cumulativeDelay > 0) {
      const maxShorten = Math.floor(slotDuration * (flexibility.maxShortenPercent / 100));
      if (cumulativeDelay <= maxShorten) {
        recoveryOptions.push({
          type: "shorten",
          description: `Shorten to ${slotDuration - cumulativeDelay} min`,
          timeSaved: cumulativeDelay,
          tradeoff: "Less time at this activity",
        });
      }
    }

    // Check if activity can be skipped
    if (flexibility.canSkip) {
      recoveryOptions.push({
        type: "skip",
        description: `Skip ${slot.activity.activity.name}`,
        timeSaved: slotDuration + (slot.commuteFromPrevious?.durationMinutes || 0),
        tradeoff: `Miss ${slot.activity.activity.name}`,
      });
    }

    // Check if activity is impossible due to closure or done_for_day
    if (
      trigger.type === "closure" &&
      trigger.context.closureContext?.venueId === slot.activity.activity.id
    ) {
      impactType = "impossible";
      impactSeverity = 100;
      canRecover = false;
    }

    if (trigger.context.userState === "done_for_day") {
      impactType = "impossible";
      impactSeverity = 100;
    }

    // Check if booking is at risk
    if (slot.isLocked) {
      const startMinutes = timeToMinutes(slot.scheduledStart);
      const delayedStart = startMinutes + cumulativeDelay;
      const buffer = startMinutes - delayedStart;

      let riskLevel: BookingRisk["riskLevel"] = "safe";
      if (buffer < 0) {
        riskLevel = "will_miss";
      } else if (buffer < config.bookingProtection.minimumBuffer) {
        riskLevel = "at_risk";
      } else if (buffer < config.bookingProtection.minimumBuffer * 2) {
        riskLevel = "tight";
      }

      if (riskLevel !== "safe") {
        bookingsAtRisk.push({
          slotId,
          bookingType: "reservation",
          riskLevel,
          latestArrivalTime: slot.scheduledStart,
          currentETA: minutesToTime(delayedStart),
          bufferMinutes: Math.max(0, buffer),
          refundable: false,
        });
      }
    }

    affectedActivities.push({
      slotId,
      activity: slot,
      impactType,
      impactSeverity,
      canRecover,
      recoveryOptions,
      shortenedBy: cumulativeDelay > 0 ? Math.min(cumulativeDelay, slotDuration * 0.3) : undefined,
    });

    // Reduce cumulative delay if we can compress buffer
    const bufferTime = slot.commuteFromPrevious?.durationMinutes || 0;
    if (bufferTime > 10) {
      cumulativeDelay = Math.max(0, cumulativeDelay - (bufferTime - 10));
    }
  }

  // Determine cascade level
  let cascadeEffect: CascadeLevel = "isolated";
  if (affectedActivities.length > 3) {
    cascadeEffect = "rest_of_day";
  } else if (affectedActivities.length > 1) {
    cascadeEffect = "partial_day";
  }

  // Determine urgency
  let urgency: UrgencyLevel = "today";
  if (bookingsAtRisk.some((b) => b.riskLevel === "will_miss" || b.riskLevel === "at_risk")) {
    urgency = "immediate";
  } else if (totalDelayMinutes > 30) {
    urgency = "within_hour";
  }

  // Check if we can auto-resolve
  const canAutoResolve =
    totalDelayMinutes <= config.thresholds.silentBuffer &&
    bookingsAtRisk.length === 0;

  return {
    triggerId: trigger.id,
    analyzedAt: new Date(),
    affectedActivities,
    bookingsAtRisk,
    cascadeEffect,
    urgency,
    totalDelayMinutes,
    canAutoResolve,
    summary: generateImpactSummary(
      totalDelayMinutes,
      affectedActivities.length,
      bookingsAtRisk.length
    ),
  };
}

/**
 * Generate human-readable impact summary
 */
function generateImpactSummary(
  delayMinutes: number,
  activitiesAffected: number,
  bookingsAtRisk: number
): string {
  const parts: string[] = [];

  if (delayMinutes > 0) {
    parts.push(`${delayMinutes} min delay`);
  }

  if (activitiesAffected > 0) {
    parts.push(`${activitiesAffected} activities affected`);
  }

  if (bookingsAtRisk > 0) {
    parts.push(`${bookingsAtRisk} booking${bookingsAtRisk > 1 ? "s" : ""} at risk`);
  }

  return parts.length > 0 ? parts.join(", ") : "No significant impact";
}

// ============================================
// STRATEGY SELECTION
// ============================================

/**
 * Select the best reshuffling strategy based on impact analysis
 */
export function selectStrategy(
  trigger: TriggerEvent,
  impact: ImpactAnalysis,
  config: ReshuffleConfig = DEFAULT_RESHUFFLE_CONFIG
): ReshuffleStrategy {
  const { totalDelayMinutes, bookingsAtRisk, cascadeEffect } = impact;

  // Handle user state triggers
  if (trigger.type === "user_state") {
    switch (trigger.context.userState) {
      case "done_for_day":
      case "sick":
        return "emergency_reroute";
      case "need_break":
        return "skip_activity";
      case "very_tired":
        return "shorten_activity";
      case "slight_tired":
        return "compress_buffer";
    }
  }

  // Handle closure trigger
  if (trigger.type === "closure") {
    return "replace_activity";
  }

  // Handle delay-based triggers
  if (totalDelayMinutes <= config.thresholds.silentBuffer) {
    return "compress_buffer";
  }

  // Protect bookings first
  if (bookingsAtRisk.length > 0) {
    const criticalBooking = bookingsAtRisk.find(
      (b) => b.riskLevel === "will_miss" || b.riskLevel === "at_risk"
    );

    if (criticalBooking) {
      // Need aggressive action to save booking
      if (totalDelayMinutes > 45) {
        return "skip_activity";
      }
      return "shorten_activity";
    }
  }

  // Based on delay severity
  if (totalDelayMinutes <= 15) {
    return "compress_buffer";
  }

  if (totalDelayMinutes <= 30) {
    return "shorten_activity";
  }

  if (totalDelayMinutes <= 60) {
    return "skip_activity";
  }

  // Major disruption
  if (cascadeEffect === "rest_of_day" || cascadeEffect === "multi_day") {
    return "emergency_reroute";
  }

  return "skip_activity";
}

// ============================================
// SCHEDULE MODIFICATION FUNCTIONS
// ============================================

/**
 * Shift all activities by a given number of minutes
 */
export function shiftSchedule(
  schedule: DaySchedule,
  startFromSlotId: string,
  shiftMinutes: number
): { schedule: DaySchedule; changes: ScheduleChange[] } {
  const changes: ScheduleChange[] = [];
  const newSlots = [...schedule.slots];

  let startShifting = false;

  for (let i = 0; i < newSlots.length; i++) {
    if (newSlots[i].slotId === startFromSlotId) {
      startShifting = true;
    }

    if (startShifting) {
      const slot = newSlots[i];
      const oldStart = slot.scheduledStart;
      const oldEnd = slot.scheduledEnd;

      const newStart = minutesToTime(timeToMinutes(oldStart) + shiftMinutes);
      const newEnd = minutesToTime(timeToMinutes(oldEnd) + shiftMinutes);

      newSlots[i] = {
        ...slot,
        scheduledStart: newStart,
        scheduledEnd: newEnd,
      };

      changes.push({
        id: generateId(),
        type: "time_shift",
        slotId: slot.slotId,
        activityName: slot.activity.activity.name,
        description: `Shifted ${shiftMinutes > 0 ? "later" : "earlier"} by ${Math.abs(shiftMinutes)} min`,
        before: { startTime: oldStart, endTime: oldEnd },
        after: { startTime: newStart, endTime: newEnd },
      });
    }
  }

  return {
    schedule: { ...schedule, slots: newSlots },
    changes,
  };
}

/**
 * Compress buffer time between activities
 */
export function compressBuffer(
  schedule: DaySchedule,
  delayMinutes: number
): { schedule: DaySchedule; changes: ScheduleChange[]; remainingDelay: number } {
  const changes: ScheduleChange[] = [];
  const newSlots = [...schedule.slots];
  let remainingDelay = delayMinutes;

  // Find buffer time that can be compressed
  for (let i = 1; i < newSlots.length && remainingDelay > 0; i++) {
    const slot = newSlots[i];
    const prevSlot = newSlots[i - 1];

    const prevEnd = timeToMinutes(prevSlot.scheduledEnd);
    const currentStart = timeToMinutes(slot.scheduledStart);
    const bufferTime = currentStart - prevEnd;

    // Keep minimum 5 min buffer
    const compressibleBuffer = Math.max(0, bufferTime - 5);

    if (compressibleBuffer > 0) {
      const compressAmount = Math.min(compressibleBuffer, remainingDelay);
      remainingDelay -= compressAmount;

      // Shift this activity earlier
      const newStart = minutesToTime(currentStart - compressAmount);
      const newEnd = minutesToTime(timeToMinutes(slot.scheduledEnd) - compressAmount);

      newSlots[i] = {
        ...slot,
        scheduledStart: newStart,
        scheduledEnd: newEnd,
      };

      changes.push({
        id: generateId(),
        type: "time_shift",
        slotId: slot.slotId,
        activityName: slot.activity.activity.name,
        description: `Reduced buffer by ${compressAmount} min`,
        before: { startTime: slot.scheduledStart, endTime: slot.scheduledEnd },
        after: { startTime: newStart, endTime: newEnd },
      });
    }
  }

  return {
    schedule: { ...schedule, slots: newSlots },
    changes,
    remainingDelay,
  };
}

/**
 * Shorten an activity's duration
 */
export function shortenActivity(
  schedule: DaySchedule,
  slotId: string,
  shortenByMinutes: number
): { schedule: DaySchedule; changes: ScheduleChange[] } {
  const changes: ScheduleChange[] = [];
  const newSlots = [...schedule.slots];

  const slotIndex = newSlots.findIndex((s) => s.slotId === slotId);
  if (slotIndex === -1) {
    return { schedule, changes };
  }

  const slot = newSlots[slotIndex];
  const flexibility = getActivityFlexibility(slot);

  // Check if we can shorten
  if (!flexibility.canShorten) {
    return { schedule, changes };
  }

  // Calculate new duration
  const maxShorten = Math.floor(slot.actualDuration * (flexibility.maxShortenPercent / 100));
  const actualShorten = Math.min(shortenByMinutes, maxShorten);

  if (actualShorten <= 0) {
    return { schedule, changes };
  }

  const newEnd = minutesToTime(timeToMinutes(slot.scheduledEnd) - actualShorten);
  const newDuration = slot.actualDuration - actualShorten;

  newSlots[slotIndex] = {
    ...slot,
    scheduledEnd: newEnd,
    actualDuration: newDuration,
  };

  changes.push({
    id: generateId(),
    type: "duration_change",
    slotId: slot.slotId,
    activityName: slot.activity.activity.name,
    description: `Shortened by ${actualShorten} min`,
    before: { duration: slot.actualDuration, endTime: slot.scheduledEnd },
    after: { duration: newDuration, endTime: newEnd },
  });

  // Shift subsequent activities earlier
  for (let i = slotIndex + 1; i < newSlots.length; i++) {
    const nextSlot = newSlots[i];
    const newStart = minutesToTime(timeToMinutes(nextSlot.scheduledStart) - actualShorten);
    const newEnd = minutesToTime(timeToMinutes(nextSlot.scheduledEnd) - actualShorten);

    newSlots[i] = {
      ...nextSlot,
      scheduledStart: newStart,
      scheduledEnd: newEnd,
    };

    changes.push({
      id: generateId(),
      type: "time_shift",
      slotId: nextSlot.slotId,
      activityName: nextSlot.activity.activity.name,
      description: `Moved earlier by ${actualShorten} min`,
      before: { startTime: nextSlot.scheduledStart, endTime: nextSlot.scheduledEnd },
      after: { startTime: newStart, endTime: newEnd },
    });
  }

  return {
    schedule: { ...schedule, slots: newSlots },
    changes,
  };
}

/**
 * Skip an activity entirely
 */
export function skipActivity(
  schedule: DaySchedule,
  slotId: string,
  reason: string
): { schedule: DaySchedule; changes: ScheduleChange[]; skippedActivity: ScheduledActivity | null } {
  const changes: ScheduleChange[] = [];

  const slotIndex = schedule.slots.findIndex((s) => s.slotId === slotId);
  if (slotIndex === -1) {
    return { schedule, changes, skippedActivity: null };
  }

  const slot = schedule.slots[slotIndex];
  const timeSaved = slot.actualDuration + (slot.commuteFromPrevious?.durationMinutes || 0);

  // Remove the slot
  const newSlots = schedule.slots.filter((s) => s.slotId !== slotId);

  changes.push({
    id: generateId(),
    type: "activity_removed",
    slotId: slot.slotId,
    activityName: slot.activity.activity.name,
    description: `Skipped: ${reason}`,
    before: {
      startTime: slot.scheduledStart,
      endTime: slot.scheduledEnd,
      duration: slot.actualDuration,
    },
    after: {},
  });

  // Shift subsequent activities earlier
  for (let i = slotIndex; i < newSlots.length; i++) {
    const nextSlot = newSlots[i];
    const newStart = minutesToTime(timeToMinutes(nextSlot.scheduledStart) - timeSaved);
    const newEnd = minutesToTime(timeToMinutes(nextSlot.scheduledEnd) - timeSaved);

    newSlots[i] = {
      ...nextSlot,
      scheduledStart: newStart,
      scheduledEnd: newEnd,
    };

    changes.push({
      id: generateId(),
      type: "time_shift",
      slotId: nextSlot.slotId,
      activityName: nextSlot.activity.activity.name,
      description: `Moved earlier by ${timeSaved} min`,
      before: { startTime: nextSlot.scheduledStart, endTime: nextSlot.scheduledEnd },
      after: { startTime: newStart, endTime: newEnd },
    });
  }

  return {
    schedule: { ...schedule, slots: newSlots },
    changes,
    skippedActivity: slot,
  };
}

/**
 * Find the best activity to skip based on priority
 */
export function findBestActivityToSkip(
  schedule: DaySchedule,
  afterTime: string
): string | null {
  const candidates = schedule.slots
    .filter((slot) => {
      // Only consider activities after the given time
      if (timeToMinutes(slot.scheduledStart) < timeToMinutes(afterTime)) {
        return false;
      }
      // Don't skip locked/booked activities
      if (slot.isLocked) {
        return false;
      }
      return true;
    })
    .map((slot) => ({
      slotId: slot.slotId,
      priority: getActivityFlexibility(slot).skipPriority,
      timeSaved: slot.actualDuration + (slot.commuteFromPrevious?.durationMinutes || 0),
    }));

  if (candidates.length === 0) {
    return null;
  }

  // Sort by priority (lower = more skippable) then by time saved (higher = better)
  candidates.sort((a, b) => {
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }
    return b.timeSaved - a.timeSaved;
  });

  return candidates[0].slotId;
}

/**
 * Swap the order of two activities
 */
export function swapActivityOrder(
  schedule: DaySchedule,
  slotId1: string,
  slotId2: string
): { schedule: DaySchedule; changes: ScheduleChange[] } {
  const changes: ScheduleChange[] = [];
  const newSlots = [...schedule.slots];

  const index1 = newSlots.findIndex((s) => s.slotId === slotId1);
  const index2 = newSlots.findIndex((s) => s.slotId === slotId2);

  if (index1 === -1 || index2 === -1) {
    return { schedule, changes };
  }

  const slot1 = newSlots[index1];
  const slot2 = newSlots[index2];

  // Swap the activities but keep the time slots
  newSlots[index1] = {
    ...slot1,
    activity: slot2.activity,
    actualDuration: slot2.actualDuration,
  };

  newSlots[index2] = {
    ...slot2,
    activity: slot1.activity,
    actualDuration: slot1.actualDuration,
  };

  changes.push({
    id: generateId(),
    type: "order_swap",
    slotId: slot1.slotId,
    activityName: slot1.activity.activity.name,
    description: `Swapped with ${slot2.activity.activity.name}`,
    before: { startTime: slot1.scheduledStart },
    after: { startTime: slot2.scheduledStart },
  });

  changes.push({
    id: generateId(),
    type: "order_swap",
    slotId: slot2.slotId,
    activityName: slot2.activity.activity.name,
    description: `Swapped with ${slot1.activity.activity.name}`,
    before: { startTime: slot2.scheduledStart },
    after: { startTime: slot1.scheduledStart },
  });

  return {
    schedule: { ...schedule, slots: newSlots },
    changes,
  };
}

// ============================================
// APPLY RESHUFFLING STRATEGY
// ============================================

/**
 * Apply the selected reshuffling strategy
 */
export function applyStrategy(
  strategy: ReshuffleStrategy,
  trigger: TriggerEvent,
  impact: ImpactAnalysis,
  schedule: DaySchedule,
  _config: ReshuffleConfig = DEFAULT_RESHUFFLE_CONFIG
): ReshuffleResult {
  // Clone for potential future rollback support (currently unused)
  let _newSchedule = schedule;
  let changes: ScheduleChange[] = [];
  let explanation = "";

  const delayMinutes = impact.totalDelayMinutes;

  switch (strategy) {
    case "compress_buffer": {
      const result = compressBuffer(schedule, delayMinutes);
      _newSchedule = result.schedule;
      changes = result.changes;

      if (result.remainingDelay > 0) {
        explanation = `Compressed buffers to absorb ${delayMinutes - result.remainingDelay} min. ${result.remainingDelay} min delay remains.`;
      } else {
        explanation = `Absorbed ${delayMinutes} min delay by compressing buffers.`;
      }
      break;
    }

    case "shorten_activity": {
      // Find activities to shorten
      let remainingDelay = delayMinutes;
      let tempSchedule = schedule;

      for (const affected of impact.affectedActivities) {
        if (remainingDelay <= 0) break;

        const shortenOption = affected.recoveryOptions.find((o) => o.type === "shorten");
        if (shortenOption) {
          const shortenAmount = Math.min(remainingDelay, shortenOption.timeSaved);
          const result = shortenActivity(tempSchedule, affected.slotId, shortenAmount);
          tempSchedule = result.schedule;
          changes.push(...result.changes);
          remainingDelay -= shortenAmount;
        }
      }

      _newSchedule = tempSchedule;
      explanation = `Shortened activities to recover ${delayMinutes - remainingDelay} min.`;
      break;
    }

    case "skip_activity": {
      // Find best activity to skip
      const currentTime = getCurrentTimeString();
      const skipSlotId = findBestActivityToSkip(schedule, currentTime);

      if (skipSlotId) {
        const result = skipActivity(schedule, skipSlotId, "Time constraint");
        _newSchedule = result.schedule;
        changes = result.changes;
        explanation = `Skipped ${result.skippedActivity?.activity.activity.name || "activity"} to save time.`;
      } else {
        explanation = "No suitable activity found to skip.";
      }
      break;
    }

    case "emergency_reroute": {
      // Remove all remaining activities
      const currentTime = getCurrentTimeString();
      const currentMinutes = timeToMinutes(currentTime);

      const keptSlots = schedule.slots.filter(
        (slot) => timeToMinutes(slot.scheduledEnd) <= currentMinutes || slot.isLocked
      );

      const removedSlots = schedule.slots.filter(
        (slot) => timeToMinutes(slot.scheduledStart) > currentMinutes && !slot.isLocked
      );

      for (const slot of removedSlots) {
        changes.push({
          id: generateId(),
          type: "activity_removed",
          slotId: slot.slotId,
          activityName: slot.activity.activity.name,
          description: "Cleared for rest of day",
          before: { startTime: slot.scheduledStart, endTime: slot.scheduledEnd },
          after: {},
        });
      }

      _newSchedule = { ...schedule, slots: keptSlots };
      explanation = `Cleared ${removedSlots.length} remaining activities. Rest and recover!`;
      break;
    }

    case "no_action":
    default: {
      explanation = "No changes needed.";
      break;
    }
  }

  // Generate undo token
  const undoToken = generateId();

  return {
    id: generateId(),
    triggerId: trigger.id,
    strategy,
    changes,
    explanation,
    confidence: 0.8,
    alternatives: [],
    requiresConfirmation: strategy !== "compress_buffer",
    timeSavedMinutes: changes.reduce((sum, c) => {
      if (c.type === "activity_removed" && c.before.duration) {
        return sum + c.before.duration;
      }
      return sum;
    }, 0),
    bookingsProtected: impact.bookingsAtRisk.filter((b) => b.riskLevel === "safe").length,
    activitiesAffected: changes.length,
    undoToken,
    canUndo: true,
  };
}

// ============================================
// RESHUFFLING SERVICE CLASS
// ============================================

export class ReshufflingService {
  private config: ReshuffleConfig;
  private undoHistory: Map<string, ReshuffleEvent>;

  constructor(config: ReshuffleConfig = DEFAULT_RESHUFFLE_CONFIG) {
    this.config = config;
    this.undoHistory = new Map();
  }

  /**
   * Check for triggers based on user input
   */
  checkTriggers(request: CheckTriggersRequest, schedule: DaySchedule): CheckTriggersResponse {
    const triggers: TriggerEvent[] = [];
    const suggestedActions: ReshuffleResult[] = [];

    // Parse user input for triggers
    if (request.userReportedIssue) {
      const trigger = createTriggerFromUserInput(
        request.userReportedIssue,
        schedule,
        request.currentTime
      );
      triggers.push(trigger);

      // Analyze impact and suggest action
      const impact = analyzeImpact(trigger, schedule, this.config);
      const strategy = selectStrategy(trigger, impact, this.config);
      const result = applyStrategy(strategy, trigger, impact, schedule, this.config);
      suggestedActions.push(result);
    }

    // Check user state
    if (request.userState) {
      const trigger: TriggerEvent = {
        id: generateId(),
        type: "user_state",
        severity: detectUserStateSeverity(request.userState),
        detectedAt: new Date(),
        source: "user_input",
        context: { userState: request.userState },
        affectedSlotIds: schedule.slots.map((s) => s.slotId),
      };
      triggers.push(trigger);

      const impact = analyzeImpact(trigger, schedule, this.config);
      const strategy = selectStrategy(trigger, impact, this.config);
      const result = applyStrategy(strategy, trigger, impact, schedule, this.config);
      suggestedActions.push(result);
    }

    // Determine schedule status
    let status: ScheduleStatus = "on_track";
    if (triggers.some((t) => t.severity === "critical")) {
      status = "critical";
    } else if (triggers.some((t) => t.severity === "high")) {
      status = "needs_attention";
    } else if (triggers.some((t) => t.severity === "medium")) {
      status = "minor_delay";
    }

    return {
      triggersDetected: triggers,
      suggestedActions,
      scheduleStatus: status,
      nextCheckIn: 5 * 60 * 1000, // 5 minutes
      summary: triggers.length > 0
        ? `Detected ${triggers.length} issue${triggers.length > 1 ? "s" : ""}`
        : undefined,
    };
  }

  /**
   * Apply a reshuffling action
   */
  applyReshuffle(
    request: ApplyReshuffleRequest,
    schedule: DaySchedule
  ): ApplyReshuffleResponse {
    // Find the trigger
    const trigger: TriggerEvent = {
      id: request.triggerId,
      type: "user_request",
      severity: "medium",
      detectedAt: new Date(),
      source: "user_input",
      context: {},
      affectedSlotIds: schedule.slots.map((s) => s.slotId),
    };

    const impact = analyzeImpact(trigger, schedule, this.config);
    const result = applyStrategy(request.selectedStrategy, trigger, impact, schedule, this.config);

    // Store in undo history
    const reshuffleEvent: ReshuffleEvent = {
      id: generateId(),
      triggeredAt: new Date(),
      trigger,
      strategyUsed: request.selectedStrategy,
      changesMade: result.changes,
      previousSchedule: schedule,
      newSchedule: schedule, // Will be updated
      userConfirmed: true,
      undoAvailable: true,
    };

    this.undoHistory.set(result.undoToken, reshuffleEvent);

    // Limit history size
    if (this.undoHistory.size > this.config.undo.maxHistorySize) {
      const oldestKey = this.undoHistory.keys().next().value;
      if (oldestKey) {
        this.undoHistory.delete(oldestKey);
      }
    }

    // Apply changes to get new schedule
    let newSchedule = schedule;
    switch (request.selectedStrategy) {
      case "compress_buffer":
        newSchedule = compressBuffer(schedule, impact.totalDelayMinutes).schedule;
        break;
      case "skip_activity":
        if (request.customInput?.skipActivityId) {
          newSchedule = skipActivity(schedule, request.customInput.skipActivityId, "User request").schedule;
        }
        break;
      // Add other cases as needed
    }

    reshuffleEvent.newSchedule = newSchedule;

    return {
      success: true,
      updatedSchedule: newSchedule,
      changes: result.changes,
      undoToken: result.undoToken,
      message: result.explanation,
    };
  }

  /**
   * Undo a previous reshuffle
   */
  undoReshuffle(request: UndoReshuffleRequest): UndoReshuffleResponse {
    const event = this.undoHistory.get(request.undoToken);

    if (!event) {
      return {
        success: false,
        restoredSchedule: null as unknown as DaySchedule,
        message: "Undo token not found or expired",
      };
    }

    // Mark as undone
    event.undoneAt = new Date();
    event.undoAvailable = false;

    // Remove from history
    this.undoHistory.delete(request.undoToken);

    return {
      success: true,
      restoredSchedule: event.previousSchedule,
      message: "Changes have been undone",
    };
  }

  /**
   * Create a delay trigger manually
   */
  createDelayTrigger(delayMinutes: number, schedule: DaySchedule): TriggerEvent {
    return createDelayTrigger(delayMinutes, schedule);
  }

  /**
   * Analyze impact of a trigger
   */
  analyzeImpact(trigger: TriggerEvent, schedule: DaySchedule): ImpactAnalysis {
    return analyzeImpact(trigger, schedule, this.config);
  }

  /**
   * Select best strategy for a trigger
   */
  selectStrategy(trigger: TriggerEvent, impact: ImpactAnalysis): ReshuffleStrategy {
    return selectStrategy(trigger, impact, this.config);
  }

  /**
   * Get suggested reshuffle for a user message
   */
  getSuggestedReshuffle(message: string, schedule: DaySchedule): ReshuffleResult {
    const trigger = createTriggerFromUserInput(message, schedule);
    const impact = analyzeImpact(trigger, schedule, this.config);
    const strategy = selectStrategy(trigger, impact, this.config);
    return applyStrategy(strategy, trigger, impact, schedule, this.config);
  }
}

// ============================================
// MULTI-DAY RESHUFFLING SUPPORT
// ============================================

/**
 * Multi-day schedule container
 */
export interface MultiDaySchedule {
  days: DaySchedule[];
  tripId: string;
}

/**
 * Multi-day reshuffle result
 */
export interface MultiDayReshuffleResult extends ReshuffleResult {
  affectedDayIndices: number[];
  deferredActivities?: Array<{
    activity: ScheduledActivity;
    fromDay: number;
    toDay: number;
  }>;
}

/**
 * Defer an activity to a later day
 */
export function deferActivityToDay(
  multiDaySchedule: MultiDaySchedule,
  slotId: string,
  fromDayIndex: number,
  toDayIndex: number
): { schedule: MultiDaySchedule; changes: ScheduleChange[]; success: boolean } {
  const changes: ScheduleChange[] = [];

  if (fromDayIndex >= multiDaySchedule.days.length || toDayIndex >= multiDaySchedule.days.length) {
    return { schedule: multiDaySchedule, changes, success: false };
  }

  const fromDay = multiDaySchedule.days[fromDayIndex];
  const toDay = multiDaySchedule.days[toDayIndex];

  const slotIndex = fromDay.slots.findIndex((s) => s.slotId === slotId);
  if (slotIndex === -1) {
    return { schedule: multiDaySchedule, changes, success: false };
  }

  const slot = fromDay.slots[slotIndex];
  const timeSaved = slot.actualDuration + (slot.commuteFromPrevious?.durationMinutes || 0);

  // Remove from source day
  const newFromSlots = fromDay.slots.filter((s) => s.slotId !== slotId);

  // Shift subsequent activities in source day
  for (let i = slotIndex; i < newFromSlots.length; i++) {
    const nextSlot = newFromSlots[i];
    const newStart = minutesToTime(timeToMinutes(nextSlot.scheduledStart) - timeSaved);
    const newEnd = minutesToTime(timeToMinutes(nextSlot.scheduledEnd) - timeSaved);
    newFromSlots[i] = { ...nextSlot, scheduledStart: newStart, scheduledEnd: newEnd };
  }

  // Add to target day at the end
  const targetLastSlot = toDay.slots[toDay.slots.length - 1];
  const newSlotStart = targetLastSlot
    ? minutesToTime(timeToMinutes(targetLastSlot.scheduledEnd) + 15)
    : "10:00";
  const newSlotEnd = minutesToTime(timeToMinutes(newSlotStart) + slot.actualDuration);

  const deferredSlot: ScheduledActivity = {
    ...slot,
    slotId: `${slot.slotId}_deferred`,
    scheduledStart: newSlotStart,
    scheduledEnd: newSlotEnd,
  };

  const newToSlots = [...toDay.slots, deferredSlot];

  changes.push({
    id: generateId(),
    type: "activity_removed",
    slotId: slot.slotId,
    activityName: slot.activity.activity.name,
    description: `Deferred to Day ${toDayIndex + 1}`,
    before: { startTime: slot.scheduledStart, endTime: slot.scheduledEnd },
    after: {},
  });

  changes.push({
    id: generateId(),
    type: "time_shift",
    slotId: deferredSlot.slotId,
    activityName: deferredSlot.activity.activity.name,
    description: `Added to Day ${toDayIndex + 1}`,
    before: {},
    after: { startTime: newSlotStart, endTime: newSlotEnd },
  });

  const newDays = [...multiDaySchedule.days];
  newDays[fromDayIndex] = { ...fromDay, slots: newFromSlots };
  newDays[toDayIndex] = { ...toDay, slots: newToSlots };

  return {
    schedule: { ...multiDaySchedule, days: newDays },
    changes,
    success: true,
  };
}

/**
 * Move activities between days to balance workload
 */
export function balanceDayWorkload(
  multiDaySchedule: MultiDaySchedule,
  maxActivitiesPerDay: number = 5
): { schedule: MultiDaySchedule; changes: ScheduleChange[] } {
  let changes: ScheduleChange[] = [];
  let currentSchedule = multiDaySchedule;

  for (let dayIndex = 0; dayIndex < currentSchedule.days.length - 1; dayIndex++) {
    const day = currentSchedule.days[dayIndex];
    const skippableActivities = day.slots.filter((slot) => {
      const flexibility = getActivityFlexibility(slot);
      return flexibility.canDefer && !slot.isLocked;
    });

    const excess = day.slots.length - maxActivitiesPerDay;

    if (excess > 0 && skippableActivities.length > 0) {
      // Find activities to defer
      const toDefer = skippableActivities
        .sort((a, b) => {
          const flexA = getActivityFlexibility(a);
          const flexB = getActivityFlexibility(b);
          return flexA.skipPriority - flexB.skipPriority;
        })
        .slice(0, Math.min(excess, skippableActivities.length));

      for (const activity of toDefer) {
        // Find next day with capacity
        for (let targetDay = dayIndex + 1; targetDay < currentSchedule.days.length; targetDay++) {
          if (currentSchedule.days[targetDay].slots.length < maxActivitiesPerDay) {
            const result = deferActivityToDay(
              currentSchedule,
              activity.slotId,
              dayIndex,
              targetDay
            );
            if (result.success) {
              currentSchedule = result.schedule;
              changes.push(...result.changes);
              break;
            }
          }
        }
      }
    }
  }

  return { schedule: currentSchedule, changes };
}

/**
 * Handle multi-day trip emergency (illness, etc.)
 */
export function emergencyMultiDayReshuffle(
  multiDaySchedule: MultiDaySchedule,
  startDayIndex: number,
  daysToCancel: number,
  reason: string
): { schedule: MultiDaySchedule; changes: ScheduleChange[]; deferredCount: number } {
  const changes: ScheduleChange[] = [];
  let deferredCount = 0;
  let currentSchedule = multiDaySchedule;

  const endDayIndex = Math.min(startDayIndex + daysToCancel, multiDaySchedule.days.length);

  // Collect activities to potentially defer
  const activitiesToDefer: Array<{ slot: ScheduledActivity; dayIndex: number }> = [];

  for (let i = startDayIndex; i < endDayIndex; i++) {
    const day = currentSchedule.days[i];
    for (const slot of day.slots) {
      if (!slot.isLocked) {
        activitiesToDefer.push({ slot, dayIndex: i });
        changes.push({
          id: generateId(),
          type: "activity_removed",
          slotId: slot.slotId,
          activityName: slot.activity.activity.name,
          description: `Cancelled: ${reason}`,
          before: { startTime: slot.scheduledStart, endTime: slot.scheduledEnd },
          after: {},
        });
      }
    }
  }

  // Clear cancelled days
  const newDays = currentSchedule.days.map((day, index) => {
    if (index >= startDayIndex && index < endDayIndex) {
      return {
        ...day,
        slots: day.slots.filter((s) => s.isLocked),
      };
    }
    return day;
  });

  currentSchedule = { ...currentSchedule, days: newDays };

  // Try to defer some activities to remaining days
  const remainingDays = currentSchedule.days.slice(endDayIndex);
  let targetDayOffset = 0;

  for (const { slot } of activitiesToDefer) {
    const flexibility = getActivityFlexibility(slot);
    if (!flexibility.canDefer) continue;

    // Find a day with capacity
    for (let i = 0; i < remainingDays.length && i <= (flexibility.deferDays || 2); i++) {
      const targetIndex = endDayIndex + i;
      if (targetIndex < currentSchedule.days.length) {
        const targetDay = currentSchedule.days[targetIndex];
        if (targetDay.slots.length < 5) {
          // Simple capacity check
          const lastSlot = targetDay.slots[targetDay.slots.length - 1];
          const newStart = lastSlot
            ? minutesToTime(timeToMinutes(lastSlot.scheduledEnd) + 15)
            : "10:00";
          const newEnd = minutesToTime(timeToMinutes(newStart) + slot.actualDuration);

          const deferredSlot: ScheduledActivity = {
            ...slot,
            slotId: `${slot.slotId}_rescheduled`,
            scheduledStart: newStart,
            scheduledEnd: newEnd,
          };

          const updatedDays = [...currentSchedule.days];
          updatedDays[targetIndex] = {
            ...targetDay,
            slots: [...targetDay.slots, deferredSlot],
          };
          currentSchedule = { ...currentSchedule, days: updatedDays };
          deferredCount++;

          changes.push({
            id: generateId(),
            type: "time_shift",
            slotId: deferredSlot.slotId,
            activityName: deferredSlot.activity.activity.name,
            description: `Rescheduled to Day ${targetIndex + 1}`,
            before: {},
            after: { startTime: newStart, endTime: newEnd },
          });
          break;
        }
      }
    }
  }

  return { schedule: currentSchedule, changes, deferredCount };
}

/**
 * Extended ReshufflingService with multi-day support
 */
export class MultiDayReshufflingService extends ReshufflingService {
  /**
   * Defer activity to another day
   */
  deferActivity(
    multiDaySchedule: MultiDaySchedule,
    slotId: string,
    fromDayIndex: number,
    toDayIndex: number
  ): { success: boolean; schedule?: MultiDaySchedule; changes: ScheduleChange[] } {
    const result = deferActivityToDay(multiDaySchedule, slotId, fromDayIndex, toDayIndex);
    return {
      success: result.success,
      schedule: result.success ? result.schedule : undefined,
      changes: result.changes,
    };
  }

  /**
   * Balance workload across days
   */
  balanceWorkload(
    multiDaySchedule: MultiDaySchedule,
    maxActivitiesPerDay?: number
  ): { schedule: MultiDaySchedule; changes: ScheduleChange[] } {
    return balanceDayWorkload(multiDaySchedule, maxActivitiesPerDay);
  }

  /**
   * Handle multi-day emergency
   */
  handleEmergency(
    multiDaySchedule: MultiDaySchedule,
    startDayIndex: number,
    daysAffected: number,
    reason: string
  ): { schedule: MultiDaySchedule; changes: ScheduleChange[]; deferredCount: number } {
    return emergencyMultiDayReshuffle(multiDaySchedule, startDayIndex, daysAffected, reason);
  }

  /**
   * Analyze impact across multiple days
   */
  analyzeMultiDayImpact(
    trigger: TriggerEvent,
    multiDaySchedule: MultiDaySchedule,
    currentDayIndex: number
  ): ImpactAnalysis & { affectedDayIndices: number[] } {
    const currentDay = multiDaySchedule.days[currentDayIndex];
    const baseImpact = this.analyzeImpact(trigger, currentDay);

    // Determine if impact cascades to other days
    const affectedDayIndices = [currentDayIndex];

    if (
      trigger.context.userState === "sick" ||
      trigger.context.userState === "done_for_day"
    ) {
      // Check if we need to defer activities to future days
      const remainingActivities = currentDay.slots.filter((slot) => {
        const slotStart = timeToMinutes(slot.scheduledStart);
        const currentTime = timeToMinutes(getCurrentTimeString());
        return slotStart > currentTime && !slot.isLocked;
      });

      if (remainingActivities.length > 0) {
        // Mark subsequent days as potentially affected
        for (
          let i = currentDayIndex + 1;
          i < Math.min(currentDayIndex + 3, multiDaySchedule.days.length);
          i++
        ) {
          affectedDayIndices.push(i);
        }
      }
    }

    return {
      ...baseImpact,
      affectedDayIndices,
      cascadeEffect:
        affectedDayIndices.length > 1 ? "multi_day" : baseImpact.cascadeEffect,
    };
  }
}

// ============================================
// FACTORY FUNCTIONS
// ============================================

/**
 * Create a reshuffling service
 */
export function createReshufflingService(
  config: ReshuffleConfig = DEFAULT_RESHUFFLE_CONFIG
): ReshufflingService {
  return new ReshufflingService(config);
}

/**
 * Create a multi-day reshuffling service
 */
export function createMultiDayReshufflingService(
  config: ReshuffleConfig = DEFAULT_RESHUFFLE_CONFIG
): MultiDayReshufflingService {
  return new MultiDayReshufflingService(config);
}

// ============================================
// EXPORTS
// ============================================

export {
  generateId,
  getCurrentTimeString,
  calculateDelayMinutes,
  getActivityFlexibility,
  cloneSchedule,
  detectDelaySeverity,
  parseUserMessage,
  generateImpactSummary,
};

export default ReshufflingService;
