/**
 * Context Aggregator
 *
 * Gathers all context needed for the LLM to make smart decisions about
 * what actions to recommend for an execution event.
 *
 * Context includes:
 * - User state (location, current activity, dwell time)
 * - Schedule context (upcoming activities, bookings, delays)
 * - External factors (weather, closures, crowds)
 */

import type {
  StructuredItineraryData,
  SlotWithOptions,
  ActivityOption,
} from "@/types/structured-itinerary";
import type {
  QueuedEvent,
  ExecutionState,
  ActivityStatus,
} from "./execution-queue";

// ============================================
// TYPES
// ============================================

/**
 * User's current physical and activity state
 */
export interface UserState {
  /** Current GPS coordinates (if available) */
  location: { lat: number; lng: number } | null;

  /** Current activity slot ID (if at an activity) */
  currentSlotId: string | null;

  /** Name of current activity (for display) */
  currentActivityName: string | null;

  /** How long user has been at current location/activity (minutes) */
  dwellTimeMinutes: number;

  /** Whether user appears to be moving (based on location changes) */
  isMoving: boolean;

  /** User's current activity status */
  currentStatus: ActivityStatus | null;

  /** Percentage of planned time elapsed at current activity */
  timeElapsedPercent: number;

  /** Minutes remaining in current activity (negative if overtime) */
  minutesRemaining: number;
}

/**
 * Information about an upcoming scheduled activity
 */
export interface UpcomingActivity {
  slotId: string;
  slotType: string;
  activityName: string;
  category: string;

  /** Scheduled start time */
  startTime: string;

  /** Scheduled end time */
  endTime: string;

  /** Minutes until this activity starts (from current time) */
  minutesUntilStart: number;

  /** Estimated travel time to reach this activity (minutes) */
  travelTimeMinutes: number;

  /** Whether this activity has a booking/reservation */
  hasBooking: boolean;

  /** Type of booking constraint */
  bookingType: "timed" | "flexible" | "none";

  /** Whether we need to leave soon to make this */
  isAtRisk: boolean;

  /** Minutes of buffer before this becomes at risk */
  bufferMinutes: number;

  /** Activity rigidity/priority (0-1) */
  rigidity: number;

  /** Location coordinates */
  location: { lat: number; lng: number } | null;

  /** Whether this is indoor (for weather considerations) */
  isIndoor: boolean;
}

/**
 * Overall schedule context for the day
 */
export interface ScheduleContext {
  /** Current simulation/real time */
  currentTime: Date;

  /** Current day index */
  dayIndex: number;

  /** City for today */
  city: string;

  /** Total activities planned for today */
  totalActivities: number;

  /** Activities completed so far */
  completedCount: number;

  /** Activities skipped */
  skippedCount: number;

  /** Accumulated delay in minutes */
  accumulatedDelayMinutes: number;

  /** Whether schedule is running behind */
  isRunningBehind: boolean;

  /** The slot currently in progress (if any) */
  currentSlot: SlotWithOptions | null;

  /** Next 3 upcoming activities with full context */
  upcomingActivities: UpcomingActivity[];

  /** IDs of slots that are locked (completed/skipped) */
  lockedSlotIds: string[];

  /** Whether there are any bookings at risk */
  hasBookingsAtRisk: boolean;

  /** Minutes until the next booking (null if no bookings) */
  minutesUntilNextBooking: number | null;

  /** Available replacement options for current slot */
  replacementOptions: ActivityOption[];

  /** Overall day progress (0-1) */
  dayProgress: number;
}

/**
 * External factors that may affect the trip
 */
export interface ExternalFactors {
  /** Weather forecast */
  weather: {
    current: {
      condition: "sunny" | "cloudy" | "rainy" | "stormy" | "snowy" | "unknown";
      temperature: number; // Celsius
      humidity: number; // Percentage
    };
    forecast: {
      condition: "sunny" | "cloudy" | "rainy" | "stormy" | "snowy" | "unknown";
      expectedTime: string; // When the condition is expected
      probability: number; // 0-1
    } | null;
    alerts: string[];
  };

  /** Known closures affecting the itinerary */
  closures: Array<{
    slotId: string;
    venueName: string;
    reason: string;
  }>;

  /** Crowd levels at upcoming venues */
  crowdLevels: Record<
    string,
    {
      level: "low" | "moderate" | "high" | "very_high";
      waitTimeMinutes: number;
    }
  >;

  /** Transit delays */
  transitDelays: Array<{
    line: string;
    delayMinutes: number;
    affectsSlotIds: string[];
  }>;
}

/**
 * Complete aggregated context for action recommendation
 */
export interface AggregatedContext {
  /** The event that triggered this context gathering */
  event: QueuedEvent;

  /** User's current state */
  userState: UserState;

  /** Schedule context */
  schedule: ScheduleContext;

  /** External factors */
  external: ExternalFactors;

  /** Summary for quick LLM reference */
  summary: {
    urgencyLevel: "low" | "normal" | "high" | "critical";
    primaryConcern: string | null;
    decisionRequired: boolean;
    suggestedTone: "relaxed" | "informative" | "urgent" | "empathetic";
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Parse time string (HH:MM) to minutes since midnight
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Get minutes between current time and a time string
 */
function minutesUntil(currentTime: Date, targetTime: string): number {
  const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
  const targetMinutes = timeToMinutes(targetTime);
  return targetMinutes - currentMinutes;
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(
  coord1: { lat: number; lng: number },
  coord2: { lat: number; lng: number }
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (coord1.lat * Math.PI) / 180;
  const φ2 = (coord2.lat * Math.PI) / 180;
  const Δφ = ((coord2.lat - coord1.lat) * Math.PI) / 180;
  const Δλ = ((coord2.lng - coord1.lng) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Estimate travel time based on distance (rough walking estimate)
 */
function estimateTravelTime(distanceMeters: number): number {
  // Assume 5 km/h walking speed = 83.33 m/min
  const walkingSpeedMpm = 83.33;
  return Math.ceil(distanceMeters / walkingSpeedMpm);
}

/**
 * Check if an activity is indoor based on category/tags
 */
function isActivityIndoor(activity: ActivityOption["activity"]): boolean {
  const indoorCategories = [
    "museum",
    "restaurant",
    "cafe",
    "shopping",
    "mall",
    "gallery",
    "theater",
    "cinema",
    "spa",
    "hotel",
    "station",
    "airport",
  ];
  const outdoorTags = ["outdoor", "park", "garden", "beach", "hiking", "shrine", "temple"];

  const categoryLower = activity.category.toLowerCase();
  const tagsLower = activity.tags.map((t) => t.toLowerCase());

  // Check if explicitly outdoor
  if (tagsLower.some((t) => outdoorTags.includes(t))) {
    return false;
  }

  // Check if indoor category
  if (indoorCategories.some((c) => categoryLower.includes(c))) {
    return true;
  }

  // Default to outdoor for unknown
  return false;
}

/**
 * Get the selected activity from a slot
 */
function getSelectedActivity(slot: SlotWithOptions): ActivityOption | null {
  if (slot.selectedOptionId) {
    return slot.options.find((o) => o.id === slot.selectedOptionId) || slot.options[0] || null;
  }
  return slot.options[0] || null;
}

// ============================================
// MAIN AGGREGATOR CLASS
// ============================================

export class ContextAggregator {
  private itinerary: StructuredItineraryData;
  private executionState: ExecutionState;
  private dwellTracker: Map<string, Date> = new Map(); // slotId -> entryTime

  constructor(itinerary: StructuredItineraryData, executionState: ExecutionState) {
    this.itinerary = itinerary;
    this.executionState = executionState;
  }

  /**
   * Update execution state (call when state changes)
   */
  updateState(state: ExecutionState): void {
    this.executionState = state;
  }

  /**
   * Track when user enters a slot (for dwell time calculation)
   */
  enterSlot(slotId: string): void {
    this.dwellTracker.set(slotId, new Date());
  }

  /**
   * Clear dwell tracking for a slot
   */
  exitSlot(slotId: string): void {
    this.dwellTracker.delete(slotId);
  }

  /**
   * Get dwell time for a slot in minutes
   */
  getDwellTime(slotId: string): number {
    const entryTime = this.dwellTracker.get(slotId);
    if (!entryTime) return 0;

    const now = this.executionState.currentTime;
    return Math.floor((now.getTime() - entryTime.getTime()) / 60000);
  }

  /**
   * Aggregate all context for a given event
   */
  aggregate(event: QueuedEvent): AggregatedContext {
    const userState = this.aggregateUserState(event);
    const schedule = this.aggregateScheduleContext(event);
    const external = this.aggregateExternalFactors(event);
    const summary = this.computeSummary(event, userState, schedule, external);

    return {
      event,
      userState,
      schedule,
      external,
      summary,
    };
  }

  /**
   * Aggregate user's current state
   */
  private aggregateUserState(event: QueuedEvent): UserState {
    const state = this.executionState;
    const day = this.itinerary.days[state.dayIndex];

    // Find current slot (in_progress or pending)
    let currentSlot: SlotWithOptions | null = null;
    let currentActivity: ActivityOption | null = null;

    for (const slot of day?.slots || []) {
      const status = state.slotStatuses[slot.slotId];
      if (status === "in_progress" || status === "pending") {
        currentSlot = slot;
        currentActivity = getSelectedActivity(slot);
        break;
      }
    }

    // Calculate time elapsed/remaining
    let timeElapsedPercent = 0;
    let minutesRemaining = 0;

    if (currentSlot) {
      const plannedDuration =
        timeToMinutes(currentSlot.timeRange.end) - timeToMinutes(currentSlot.timeRange.start);
      const dwellTime = this.getDwellTime(currentSlot.slotId);

      timeElapsedPercent = plannedDuration > 0 ? (dwellTime / plannedDuration) * 100 : 0;
      minutesRemaining = plannedDuration - dwellTime;
    }

    return {
      location: state.currentLocation || null,
      currentSlotId: currentSlot?.slotId || null,
      currentActivityName: currentActivity?.activity.name || null,
      dwellTimeMinutes: currentSlot ? this.getDwellTime(currentSlot.slotId) : 0,
      isMoving: false, // Would need location history to determine
      currentStatus: currentSlot ? state.slotStatuses[currentSlot.slotId] : null,
      timeElapsedPercent,
      minutesRemaining,
    };
  }

  /**
   * Aggregate schedule context
   */
  private aggregateScheduleContext(event: QueuedEvent): ScheduleContext {
    const state = this.executionState;
    const day = this.itinerary.days[state.dayIndex];
    const slots = day?.slots || [];

    // Find current slot
    let currentSlot: SlotWithOptions | null = null;
    let currentSlotIndex = -1;

    for (let i = 0; i < slots.length; i++) {
      const status = state.slotStatuses[slots[i].slotId];
      if (status === "in_progress") {
        currentSlot = slots[i];
        currentSlotIndex = i;
        break;
      }
      if (status === "pending" && !currentSlot) {
        currentSlot = slots[i];
        currentSlotIndex = i;
      }
    }

    // Build upcoming activities list (next 3 after current)
    const upcomingActivities: UpcomingActivity[] = [];
    const startIndex = currentSlotIndex >= 0 ? currentSlotIndex + 1 : 0;

    for (let i = startIndex; i < Math.min(startIndex + 3, slots.length); i++) {
      const slot = slots[i];
      const status = state.slotStatuses[slot.slotId];

      // Skip completed/skipped slots
      if (status === "completed" || status === "skipped") continue;

      const activity = getSelectedActivity(slot);
      if (!activity) continue;

      const minutesUntilStart = minutesUntil(state.currentTime, slot.timeRange.start);
      const travelTime = slot.commuteFromPrevious?.duration || 15; // Default 15 min if unknown

      // Determine booking status
      const hasBooking = slot.fragility?.bookingRequired || false;
      const bookingType = slot.fragility?.ticketType || "none";

      // Calculate if at risk (need to leave within buffer time)
      const bufferNeeded = travelTime + 10; // Travel time + 10 min buffer
      const bufferMinutes = minutesUntilStart - travelTime;
      const isAtRisk = hasBooking && bufferMinutes < 15;

      upcomingActivities.push({
        slotId: slot.slotId,
        slotType: slot.slotType,
        activityName: activity.activity.name,
        category: activity.activity.category,
        startTime: slot.timeRange.start,
        endTime: slot.timeRange.end,
        minutesUntilStart,
        travelTimeMinutes: travelTime,
        hasBooking,
        bookingType,
        isAtRisk,
        bufferMinutes,
        rigidity: slot.rigidityScore || 0.5,
        location: activity.activity.place?.coordinates || null,
        isIndoor: isActivityIndoor(activity.activity),
      });
    }

    // Check for bookings at risk
    const hasBookingsAtRisk = upcomingActivities.some((a) => a.isAtRisk);
    const nextBooking = upcomingActivities.find((a) => a.hasBooking);

    // Get replacement options for current slot
    const replacementOptions: ActivityOption[] =
      currentSlot?.replacementPool?.map((r) => ({
        id: r.id,
        rank: r.priority,
        score: 0.7,
        activity: r.activity,
        matchReasons: [r.reason],
        tradeoffs: [],
      })) || [];

    // Calculate day progress
    const totalSlots = slots.length;
    const completedSlots = Object.values(state.slotStatuses).filter(
      (s) => s === "completed" || s === "skipped"
    ).length;
    const dayProgress = totalSlots > 0 ? completedSlots / totalSlots : 0;

    return {
      currentTime: state.currentTime,
      dayIndex: state.dayIndex,
      city: day?.city || this.itinerary.destination,
      totalActivities: slots.length,
      completedCount: state.completedCount,
      skippedCount: state.skippedCount,
      accumulatedDelayMinutes: state.accumulatedDelayMinutes,
      isRunningBehind: state.accumulatedDelayMinutes > 15,
      currentSlot,
      upcomingActivities,
      lockedSlotIds: state.lockedSlotIds,
      hasBookingsAtRisk,
      minutesUntilNextBooking: nextBooking?.minutesUntilStart || null,
      replacementOptions,
      dayProgress,
    };
  }

  /**
   * Aggregate external factors
   * NOTE: In production, this would call real APIs (weather, etc.)
   * For now, we return sensible defaults
   */
  private aggregateExternalFactors(_event: QueuedEvent): ExternalFactors {
    // TODO: Integrate with real weather API
    // TODO: Integrate with venue closure detection
    // TODO: Integrate with crowd/wait time APIs
    // TODO: Integrate with transit delay APIs

    return {
      weather: {
        current: {
          condition: "sunny",
          temperature: 22,
          humidity: 50,
        },
        forecast: null,
        alerts: [],
      },
      closures: [],
      crowdLevels: {},
      transitDelays: [],
    };
  }

  /**
   * Compute summary for quick LLM reference
   */
  private computeSummary(
    event: QueuedEvent,
    userState: UserState,
    schedule: ScheduleContext,
    external: ExternalFactors
  ): AggregatedContext["summary"] {
    let urgencyLevel: AggregatedContext["summary"]["urgencyLevel"] = "low";
    let primaryConcern: string | null = null;
    let decisionRequired = false;
    let suggestedTone: AggregatedContext["summary"]["suggestedTone"] = "relaxed";

    // Check for critical conditions
    if (event.priority === "urgent") {
      urgencyLevel = "critical";
      decisionRequired = true;
      suggestedTone = "urgent";
    }

    // Check for bookings at risk
    if (schedule.hasBookingsAtRisk) {
      urgencyLevel = urgencyLevel === "critical" ? "critical" : "high";
      const atRiskActivity = schedule.upcomingActivities.find((a) => a.isAtRisk);
      primaryConcern = `Booking at ${atRiskActivity?.activityName} may be missed`;
      decisionRequired = true;
      suggestedTone = "urgent";
    }

    // Check for closures
    if (external.closures.length > 0) {
      urgencyLevel = "high";
      primaryConcern = `${external.closures[0].venueName} is closed`;
      decisionRequired = true;
      suggestedTone = "empathetic";
    }

    // Check for weather alerts
    if (external.weather.alerts.length > 0) {
      if (urgencyLevel === "low") urgencyLevel = "normal";
      if (!primaryConcern) primaryConcern = external.weather.alerts[0];
      decisionRequired = true;
      suggestedTone = "informative";
    }

    // Check for significant delays
    if (schedule.accumulatedDelayMinutes > 30) {
      if (urgencyLevel === "low") urgencyLevel = "normal";
      if (!primaryConcern) primaryConcern = `Running ${schedule.accumulatedDelayMinutes} minutes behind`;
      decisionRequired = true;
      suggestedTone = "informative";
    }

    // Check for duration warnings with no urgency
    if (event.type === "duration_warning" && !schedule.hasBookingsAtRisk) {
      // If there's plenty of buffer, no decision needed
      const nextActivity = schedule.upcomingActivities[0];
      if (nextActivity && nextActivity.bufferMinutes > 30) {
        urgencyLevel = "low";
        decisionRequired = false;
        suggestedTone = "relaxed";
      }
    }

    // Check for simple arrivals/departures
    if (event.type === "arrival" || event.type === "departure") {
      if (!schedule.hasBookingsAtRisk) {
        urgencyLevel = "low";
        decisionRequired = false;
        suggestedTone = "relaxed";
      }
    }

    return {
      urgencyLevel,
      primaryConcern,
      decisionRequired,
      suggestedTone,
    };
  }
}

// ============================================
// CONTEXT FORMATTER FOR LLM
// ============================================

/**
 * Format aggregated context into a prompt-friendly string for the LLM
 */
export function formatContextForLLM(context: AggregatedContext): string {
  const { event, userState, schedule, external, summary } = context;

  const lines: string[] = [];

  // Event info
  lines.push(`EVENT: ${event.type}`);
  lines.push(`TITLE: ${event.title}`);
  lines.push(`MESSAGE: ${event.message}`);
  lines.push(`PRIORITY: ${event.priority}`);
  lines.push("");

  // User state
  lines.push("USER STATE:");
  if (userState.currentActivityName) {
    lines.push(`  Currently at: ${userState.currentActivityName}`);
    lines.push(`  Time here: ${userState.dwellTimeMinutes} minutes`);
    lines.push(`  Time elapsed: ${Math.round(userState.timeElapsedPercent)}%`);
    if (userState.minutesRemaining > 0) {
      lines.push(`  Planned time remaining: ${userState.minutesRemaining} minutes`);
    } else {
      lines.push(`  Over planned time by: ${Math.abs(userState.minutesRemaining)} minutes`);
    }
  }
  lines.push("");

  // Schedule context
  lines.push("SCHEDULE:");
  lines.push(`  Current time: ${schedule.currentTime.toLocaleTimeString()}`);
  lines.push(`  Day ${schedule.dayIndex + 1} in ${schedule.city}`);
  lines.push(`  Progress: ${schedule.completedCount}/${schedule.totalActivities} activities`);
  if (schedule.accumulatedDelayMinutes > 0) {
    lines.push(`  Running ${schedule.accumulatedDelayMinutes} min behind schedule`);
  }
  lines.push("");

  // Upcoming activities
  if (schedule.upcomingActivities.length > 0) {
    lines.push("UPCOMING:");
    for (const activity of schedule.upcomingActivities) {
      const riskIndicator = activity.isAtRisk ? " ⚠️ AT RISK" : "";
      const bookingIndicator = activity.hasBooking ? " [BOOKED]" : "";
      lines.push(
        `  • ${activity.activityName} at ${activity.startTime}${bookingIndicator}${riskIndicator}`
      );
      lines.push(
        `    ${activity.minutesUntilStart} min away, ${activity.travelTimeMinutes} min travel`
      );
      if (activity.hasBooking) {
        lines.push(`    Buffer: ${activity.bufferMinutes} min before must-leave`);
      }
    }
    lines.push("");
  }

  // External factors (if relevant)
  if (external.closures.length > 0) {
    lines.push("CLOSURES:");
    for (const closure of external.closures) {
      lines.push(`  • ${closure.venueName}: ${closure.reason}`);
    }
    lines.push("");
  }

  if (external.weather.alerts.length > 0) {
    lines.push("WEATHER ALERTS:");
    for (const alert of external.weather.alerts) {
      lines.push(`  • ${alert}`);
    }
    lines.push("");
  }

  // Summary
  lines.push("SUMMARY:");
  lines.push(`  Urgency: ${summary.urgencyLevel}`);
  if (summary.primaryConcern) {
    lines.push(`  Primary concern: ${summary.primaryConcern}`);
  }
  lines.push(`  Decision required: ${summary.decisionRequired ? "YES" : "NO"}`);
  lines.push(`  Suggested tone: ${summary.suggestedTone}`);

  return lines.join("\n");
}

/**
 * Format context as JSON for structured LLM input
 */
export function formatContextAsJSON(context: AggregatedContext): object {
  return {
    event: {
      type: context.event.type,
      title: context.event.title,
      message: context.event.message,
      priority: context.event.priority,
      slotId: context.event.slotId,
    },
    userState: {
      currentActivity: context.userState.currentActivityName,
      dwellTimeMinutes: context.userState.dwellTimeMinutes,
      timeElapsedPercent: Math.round(context.userState.timeElapsedPercent),
      minutesRemaining: context.userState.minutesRemaining,
    },
    schedule: {
      currentTime: context.schedule.currentTime.toISOString(),
      city: context.schedule.city,
      dayIndex: context.schedule.dayIndex,
      progress: {
        completed: context.schedule.completedCount,
        total: context.schedule.totalActivities,
        skipped: context.schedule.skippedCount,
      },
      delayMinutes: context.schedule.accumulatedDelayMinutes,
      upcoming: context.schedule.upcomingActivities.map((a) => ({
        name: a.activityName,
        startsIn: a.minutesUntilStart,
        travelTime: a.travelTimeMinutes,
        hasBooking: a.hasBooking,
        isAtRisk: a.isAtRisk,
        buffer: a.bufferMinutes,
        isIndoor: a.isIndoor,
      })),
      hasBookingsAtRisk: context.schedule.hasBookingsAtRisk,
    },
    external: {
      weather: context.external.weather.current,
      weatherAlerts: context.external.weather.alerts,
      closures: context.external.closures,
    },
    summary: context.summary,
  };
}

// ============================================
// FACTORY FUNCTION
// ============================================

/**
 * Create a new context aggregator for a trip
 */
export function createContextAggregator(
  itinerary: StructuredItineraryData,
  executionState: ExecutionState
): ContextAggregator {
  return new ContextAggregator(itinerary, executionState);
}
