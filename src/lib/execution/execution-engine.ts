// ============================================
// EXECUTION ENGINE
// ============================================
// Main orchestrator for trip execution that ties all components together.
// Implements the Execution Engine from EXECUTION_PHASE_DESIGN.md

import {
  ExecutionMode,
  ExecutionEngineState,
  ActivityExecution,
  TransitionTrigger,
  DayProgress,
  UserLocation,
  Geofence,
  GeofenceEvent,
  ScheduledNotification,
  PendingDecision,
  TimeExtensionResult,
} from "@/types/execution";
import { DayWithOptions, SlotWithOptions } from "@/types/structured-itinerary";
import { Coordinates } from "@/types/activity-suggestion";
import {
  createActivityExecution,
  transitionActivity,
  shouldAutoTransition,
  isActiveState,
  isTerminalState,
  PENDING_THRESHOLD_MINUTES,
} from "./activity-lifecycle";
import {
  calculateDayProgress,
  getCurrentActivity,
  getUpcomingActivities,
  calculateDelayMinutes,
} from "./day-progress";
import { calculateExtensionImpact } from "./time-extension";
import {
  createGeofencesForDay,
  detectGeofenceEvents,
  isInsideGeofence,
  GeofenceDwellTracker,
} from "./geofence-manager";
import { scheduleNotificationsForDay } from "./notification-scheduler";
import { generateMorningBriefing } from "./morning-briefing";
import { getSelectedActivity } from "./execution-helpers";

// ============================================
// EXECUTION ENGINE CLASS
// ============================================

export class ExecutionEngine {
  private tripId: string | null = null;
  private mode: ExecutionMode = "idle";
  private currentDay: number = 0;
  private day: DayWithOptions | null = null;
  private activities: Map<string, ActivityExecution> = new Map();
  private geofences: Geofence[] = [];
  private dwellTracker: GeofenceDwellTracker;
  private lastLocation: Coordinates | null = null;
  private scheduledChecks: Map<string, NodeJS.Timeout> = new Map();
  private eventListeners: Set<(event: EngineEvent) => void> = new Set();

  constructor() {
    this.dwellTracker = new GeofenceDwellTracker();
  }

  // ============================================
  // LIFECYCLE METHODS
  // ============================================

  /**
   * Start trip execution with a DayWithOptions
   */
  start(tripId: string, day: DayWithOptions): ExecutionEngineState {
    this.tripId = tripId;
    this.mode = "active";
    this.currentDay = day.dayNumber;
    this.day = day;

    // Initialize activities from slots
    this.activities.clear();
    const baseDate = new Date(day.date);

    for (const slot of day.slots) {
      const execution = createActivityExecution(slot.slotId, slot, baseDate);
      this.activities.set(slot.slotId, execution);
    }

    // Create geofences
    this.geofences = createGeofencesForDay(day);

    // Reset trackers
    this.dwellTracker.reset();
    this.lastLocation = null;

    // Schedule time checks
    this.scheduleTimeChecks();

    // Emit event
    this.emit({ type: "TRIP_STARTED", tripId, dayNumber: this.currentDay });

    return this.getState();
  }

  /**
   * Pause execution
   */
  pause(reason?: string): void {
    if (this.mode === "active") {
      this.mode = "paused";
      this.clearScheduledChecks();
      this.emit({ type: "EXECUTION_PAUSED", reason });
    }
  }

  /**
   * Resume execution
   */
  resume(): void {
    if (this.mode === "paused") {
      this.mode = "active";
      this.scheduleTimeChecks();
      this.emit({ type: "EXECUTION_RESUMED" });
    }
  }

  /**
   * Stop execution
   */
  stop(): void {
    this.clearScheduledChecks();
    this.tripId = null;
    this.mode = "idle";
    this.day = null;
    this.activities.clear();
    this.geofences = [];
    this.dwellTracker.reset();
    this.lastLocation = null;
    this.emit({ type: "EXECUTION_STOPPED" });
  }

  // ============================================
  // ACTIVITY METHODS
  // ============================================

  /**
   * Check in to an activity
   */
  checkInToActivity(slotId: string): ActivityExecution | null {
    const execution = this.activities.get(slotId);
    if (!execution) return null;

    const updated = transitionActivity(execution, "user_check_in");
    if (updated) {
      this.activities.set(slotId, updated);
      this.emit({
        type: "ACTIVITY_STATE_CHANGED",
        slotId,
        from: execution.state,
        to: updated.state,
        trigger: "user_check_in",
      });
    }

    return updated;
  }

  /**
   * Check out of an activity
   */
  checkOutOfActivity(
    slotId: string,
    rating?: number,
    notes?: string
  ): ActivityExecution | null {
    const execution = this.activities.get(slotId);
    if (!execution) return null;

    const updated = transitionActivity(execution, "user_check_out", { rating, notes });
    if (updated) {
      this.activities.set(slotId, updated);
      this.emit({
        type: "ACTIVITY_STATE_CHANGED",
        slotId,
        from: execution.state,
        to: updated.state,
        trigger: "user_check_out",
      });
    }

    return updated;
  }

  /**
   * Skip an activity
   */
  skipActivity(slotId: string, reason?: string): ActivityExecution | null {
    const execution = this.activities.get(slotId);
    if (!execution) return null;

    const updated = transitionActivity(execution, "user_skip", { skipReason: reason });
    if (updated) {
      this.activities.set(slotId, updated);
      this.emit({
        type: "ACTIVITY_SKIPPED",
        slotId,
        reason,
      });
    }

    return updated;
  }

  /**
   * Extend an activity
   */
  extendActivity(slotId: string, minutes: number): TimeExtensionResult {
    if (!this.day) {
      return {
        success: false,
        appliedExtension: 0,
        impact: {
          nextActivityAffected: false,
          activitiesShortened: [],
          activitiesSkipped: [],
          bookingsAtRisk: [],
        },
        message: "No active day",
      };
    }

    const result = calculateExtensionImpact(this.day, slotId, minutes);

    if (result.success) {
      const execution = this.activities.get(slotId);
      if (execution) {
        const updated = transitionActivity(execution, "user_extend", {
          extendedBy: result.appliedExtension,
        });
        if (updated) {
          this.activities.set(slotId, updated);
          this.emit({
            type: "ACTIVITY_EXTENDED",
            slotId,
            minutes: result.appliedExtension,
          });
        }
      }
    }

    return result;
  }

  /**
   * Get activity execution by slot ID
   */
  getActivityState(slotId: string): ActivityExecution | null {
    return this.activities.get(slotId) || null;
  }

  // ============================================
  // LOCATION HANDLING
  // ============================================

  /**
   * Update user location and process geofence events
   */
  updateLocation(location: Coordinates): { geofenceEvents: GeofenceEvent[] } {
    const previousLocation = this.lastLocation;
    this.lastLocation = location;

    // Detect geofence events
    const { entered, exited } = detectGeofenceEvents(
      previousLocation,
      location,
      this.geofences
    );

    const events: GeofenceEvent[] = [];

    // Process enter events
    for (const geofence of entered) {
      const event: GeofenceEvent = {
        type: "enter",
        geofenceId: geofence.id,
        geofence,
        timestamp: new Date(),
      };
      events.push(event);

      // Auto-transition activity to "arrived" if applicable
      if (geofence.activitySlotId) {
        const execution = this.activities.get(geofence.activitySlotId);
        if (execution && (execution.state === "en_route" || execution.state === "pending")) {
          const updated = transitionActivity(execution, "location_detected");
          if (updated) {
            this.activities.set(geofence.activitySlotId, updated);
            this.emit({
              type: "ACTIVITY_STATE_CHANGED",
              slotId: geofence.activitySlotId,
              from: execution.state,
              to: updated.state,
              trigger: "location_detected",
            });
          }
        }
      }

      this.emit({ type: "GEOFENCE_ENTERED", geofenceId: geofence.id, slotId: geofence.activitySlotId });
    }

    // Process exit events
    for (const geofence of exited) {
      const event: GeofenceEvent = {
        type: "exit",
        geofenceId: geofence.id,
        geofence,
        timestamp: new Date(),
      };
      events.push(event);

      this.emit({ type: "GEOFENCE_EXITED", geofenceId: geofence.id, slotId: geofence.activitySlotId });
    }

    // Check for dwell events
    const dwellEvents = this.dwellTracker.updateLocation(location, this.geofences);
    for (const event of dwellEvents) {
      events.push(event);
      this.emit({
        type: "GEOFENCE_DWELL",
        geofenceId: event.geofenceId,
        slotId: event.geofence.activitySlotId,
        duration: event.dwellDuration,
      });
    }

    return { geofenceEvents: events };
  }

  // ============================================
  // TIME-BASED CHECKS
  // ============================================

  /**
   * Schedule periodic time checks
   */
  private scheduleTimeChecks(): void {
    this.clearScheduledChecks();

    // Check every minute
    const intervalId = setInterval(() => {
      this.performTimeCheck();
    }, 60000);

    this.scheduledChecks.set("main", intervalId);

    // Perform initial check
    this.performTimeCheck();
  }

  /**
   * Perform a time-based check on all activities
   */
  private performTimeCheck(): void {
    if (this.mode !== "active") return;

    const now = new Date();

    for (const [slotId, execution] of this.activities) {
      // Skip terminal states
      if (isTerminalState(execution.state)) continue;

      // Check for auto-transitions
      const autoTransition = shouldAutoTransition(execution, now);
      if (autoTransition) {
        const updated = transitionActivity(execution, autoTransition.trigger);
        if (updated) {
          this.activities.set(slotId, updated);
          this.emit({
            type: "ACTIVITY_STATE_CHANGED",
            slotId,
            from: execution.state,
            to: updated.state,
            trigger: autoTransition.trigger,
          });
        }
      }
    }

    // Check for delays
    if (this.day) {
      const delay = calculateDelayMinutes(this.day, this.activities, now);
      if (delay > 15) {
        this.emit({ type: "DELAY_DETECTED", delayMinutes: delay });
      }
    }
  }

  /**
   * Clear all scheduled checks
   */
  private clearScheduledChecks(): void {
    for (const [_key, timeoutId] of this.scheduledChecks) {
      clearInterval(timeoutId);
    }
    this.scheduledChecks.clear();
  }

  // ============================================
  // STATE GETTERS
  // ============================================

  /**
   * Get current engine state
   */
  getState(): ExecutionEngineState {
    const currentActivity = getCurrentActivity(this.activities);
    const upcomingActivities = getUpcomingActivities(this.activities);

    const progress: DayProgress = this.day
      ? calculateDayProgress(this.day, this.activities)
      : {
          completedActivities: 0,
          totalActivities: 0,
          completedDuration: 0,
          remainingDuration: 0,
          currentDelay: 0,
          percentComplete: 0,
        };

    // Get next activity slot for preview
    const nextActivityExec = upcomingActivities[0] || null;
    const nextSlot = nextActivityExec?.slot || null;

    return {
      mode: this.mode,
      tripId: this.tripId || "",
      currentDay: this.currentDay,
      currentTime: new Date(),
      currentActivity: currentActivity
        ? {
            slotId: currentActivity.slotId,
            state: currentActivity.state,
            startedAt: currentActivity.actualStart,
            expectedEnd: currentActivity.scheduledEnd,
            extendedBy: currentActivity.extendedBy,
          }
        : null,
      nextActivity: nextActivityExec && nextSlot
        ? {
            slotId: nextActivityExec.slotId,
            slot: nextSlot,
            commuteInfo: nextSlot.commuteFromPrevious,
            departureTime: new Date(nextActivityExec.scheduledStart),
            eta: new Date(nextActivityExec.scheduledStart),
          }
        : null,
      progress,
      monitors: {
        location: true,
        weather: true,
        closures: true,
        transit: true,
      },
      pendingDecisions: [],
      notificationQueue: [],
    };
  }

  /**
   * Get current progress
   */
  getProgress(): DayProgress | null {
    if (!this.day) return null;
    return calculateDayProgress(this.day, this.activities);
  }

  /**
   * Get current activity
   */
  getCurrentActivity(): ActivityExecution | null {
    return getCurrentActivity(this.activities);
  }

  /**
   * Get upcoming activities
   */
  getUpcomingActivities(): ActivityExecution[] {
    return getUpcomingActivities(this.activities);
  }

  /**
   * Get all activities
   */
  getAllActivities(): Map<string, ActivityExecution> {
    return new Map(this.activities);
  }

  /**
   * Get geofences
   */
  getGeofences(): Geofence[] {
    return [...this.geofences];
  }

  /**
   * Get current mode
   */
  getMode(): ExecutionMode {
    return this.mode;
  }

  /**
   * Check if executing
   */
  isExecuting(): boolean {
    return this.mode === "active" || this.mode === "paused";
  }

  // ============================================
  // EVENT HANDLING
  // ============================================

  /**
   * Add event listener
   */
  addEventListener(listener: (event: EngineEvent) => void): void {
    this.eventListeners.add(listener);
  }

  /**
   * Remove event listener
   */
  removeEventListener(listener: (event: EngineEvent) => void): void {
    this.eventListeners.delete(listener);
  }

  /**
   * Emit event to all listeners
   */
  private emit(event: EngineEvent): void {
    for (const listener of this.eventListeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("Error in event listener:", error);
      }
    }
  }
}

// ============================================
// ENGINE EVENT TYPES
// ============================================

export type EngineEvent =
  | { type: "TRIP_STARTED"; tripId: string; dayNumber: number }
  | { type: "EXECUTION_PAUSED"; reason?: string }
  | { type: "EXECUTION_RESUMED" }
  | { type: "EXECUTION_STOPPED" }
  | { type: "ACTIVITY_STATE_CHANGED"; slotId: string; from: string; to: string; trigger: TransitionTrigger }
  | { type: "ACTIVITY_SKIPPED"; slotId: string; reason?: string }
  | { type: "ACTIVITY_EXTENDED"; slotId: string; minutes: number }
  | { type: "GEOFENCE_ENTERED"; geofenceId: string; slotId?: string }
  | { type: "GEOFENCE_EXITED"; geofenceId: string; slotId?: string }
  | { type: "GEOFENCE_DWELL"; geofenceId: string; slotId?: string; duration?: number }
  | { type: "DELAY_DETECTED"; delayMinutes: number };

// ============================================
// SINGLETON INSTANCE
// ============================================

let engineInstance: ExecutionEngine | null = null;

/**
 * Get the singleton execution engine instance
 */
export function getExecutionEngine(): ExecutionEngine {
  if (!engineInstance) {
    engineInstance = new ExecutionEngine();
  }
  return engineInstance;
}

/**
 * Reset the engine instance (for testing)
 */
export function resetExecutionEngine(): void {
  if (engineInstance) {
    engineInstance.stop();
    engineInstance = null;
  }
}
