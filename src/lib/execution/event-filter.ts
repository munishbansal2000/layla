/**
 * Event Filter
 *
 * Decides whether an execution event should interrupt the user or be suppressed.
 * The goal is to NOT overwhelm the user with notifications.
 *
 * Philosophy:
 * - Only show events that require a decision
 * - Suppress "everything is fine" notifications
 * - Let urgent/high priority events through
 * - Batch related events when possible
 */

import type { QueuedEvent } from "./execution-queue";
import type { AggregatedContext } from "./context-aggregator";

// ============================================
// TYPES
// ============================================

export type FilterResult = 
  | { action: "show"; reason: string }
  | { action: "suppress"; reason: string; alternativeAction?: SuppressedAction }
  | { action: "delay"; reason: string; delaySeconds: number }
  | { action: "batch"; reason: string; batchKey: string };

export type SuppressedAction = 
  | "silent_update"      // Update timeline/state silently
  | "timeline_note"      // Add a small note to timeline, not chat
  | "status_badge"       // Update a status badge on current activity
  | "none";              // Completely ignore

export interface EventFilterConfig {
  /** Minimum buffer time before we consider an event worth showing (minutes) */
  minBufferForSuppression: number;
  
  /** Maximum messages per hour to prevent spam */
  maxMessagesPerHour: number;
  
  /** Minimum seconds between any two messages */
  minSecondsBetweenMessages: number;
  
  /** Whether to enable batching of related events */
  enableBatching: boolean;
  
  /** Batch window in seconds */
  batchWindowSeconds: number;
  
  /** Quiet hours (don't disturb unless urgent) */
  quietHours?: {
    start: string; // "22:00"
    end: string;   // "07:00"
  };
}

// ============================================
// DEFAULT CONFIG
// ============================================

const DEFAULT_CONFIG: EventFilterConfig = {
  minBufferForSuppression: 30,      // If >30 min buffer, suppress duration warnings
  maxMessagesPerHour: 10,           // Max 10 notifications per hour
  minSecondsBetweenMessages: 60,    // At least 1 min between messages
  enableBatching: true,
  batchWindowSeconds: 10,
  quietHours: {
    start: "22:00",
    end: "07:00",
  },
};

// ============================================
// EVENT FILTER CLASS
// ============================================

export class EventFilter {
  private config: EventFilterConfig;
  private messageHistory: Date[] = [];
  private lastMessageTime: Date | null = null;
  private pendingBatches: Map<string, { events: QueuedEvent[]; timeout: NodeJS.Timeout }> = new Map();

  constructor(config: Partial<EventFilterConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Main filter method - decides if event should be shown
   */
  filter(event: QueuedEvent, context: AggregatedContext): FilterResult {
    const { summary, schedule, userState } = context;

    // 1. Always show urgent events
    if (event.priority === "urgent") {
      return { action: "show", reason: "Urgent priority - always show" };
    }

    // 2. Check quiet hours (only urgent allowed)
    if (this.isQuietHours(context.schedule.currentTime)) {
      return {
        action: "suppress",
        reason: "Quiet hours - non-urgent event suppressed",
        alternativeAction: "silent_update",
      };
    }

    // 3. Check rate limiting
    const rateLimitResult = this.checkRateLimit();
    if (rateLimitResult) {
      return rateLimitResult;
    }

    // 4. Apply event-type-specific rules
    const typeResult = this.filterByEventType(event, context);
    if (typeResult) {
      return typeResult;
    }

    // 5. Check if decision is actually required (from context summary)
    if (!summary.decisionRequired) {
      // No decision needed - determine best suppression action
      return this.determineSuppressionAction(event, context);
    }

    // 6. Default: show the event
    this.recordMessage();
    return { action: "show", reason: "Decision required" };
  }

  /**
   * Filter by specific event type
   */
  private filterByEventType(event: QueuedEvent, context: AggregatedContext): FilterResult | null {
    const { schedule, userState } = context;

    switch (event.type) {
      case "duration_warning":
        return this.filterDurationWarning(event, context);

      case "arrival":
        return this.filterArrival(event, context);

      case "departure":
        return this.filterDeparture(event, context);

      case "booking_reminder":
      case "last_call":
        // Always show booking-related events
        this.recordMessage();
        return { action: "show", reason: "Booking-related - always show" };

      case "weather_alert":
      case "closure_alert":
      case "transit_delay":
        // External events that affect the plan - always show
        this.recordMessage();
        return { action: "show", reason: "External factor affecting plan" };

      case "morning_briefing":
      case "day_recap":
        // Daily summaries - always show
        this.recordMessage();
        return { action: "show", reason: "Daily summary" };

      case "completion_prompt":
        return this.filterCompletionPrompt(event, context);

      case "agent_message":
        // Generic messages - check if important enough
        if (event.priority === "high") {
          this.recordMessage();
          return { action: "show", reason: "High priority agent message" };
        }
        return null; // Let default logic handle

      default:
        return null; // Let default logic handle
    }
  }

  /**
   * Filter duration warnings - the most common "noise" event
   */
  private filterDurationWarning(event: QueuedEvent, context: AggregatedContext): FilterResult {
    const { schedule, userState } = context;
    const nextActivity = schedule.upcomingActivities[0];

    // If no upcoming activity, suppress
    if (!nextActivity) {
      return {
        action: "suppress",
        reason: "No upcoming activity - no time pressure",
        alternativeAction: "status_badge",
      };
    }

    // If next activity is flexible (no booking) and has plenty of buffer
    if (!nextActivity.hasBooking && nextActivity.bufferMinutes > this.config.minBufferForSuppression) {
      return {
        action: "suppress",
        reason: `${nextActivity.bufferMinutes} min buffer, no booking - no rush`,
        alternativeAction: "status_badge",
      };
    }

    // If buffer is getting tight (< 15 min) or booking involved
    if (nextActivity.isAtRisk || nextActivity.bufferMinutes < 15) {
      this.recordMessage();
      return { action: "show", reason: "Buffer tight or booking at risk" };
    }

    // If there's a booking coming up but still some buffer
    if (nextActivity.hasBooking && nextActivity.bufferMinutes < 45) {
      this.recordMessage();
      return { action: "show", reason: "Booking approaching - heads up needed" };
    }

    // Default: suppress with status update
    return {
      action: "suppress",
      reason: "Comfortable buffer, no urgency",
      alternativeAction: "status_badge",
    };
  }

  /**
   * Filter arrival events
   */
  private filterArrival(event: QueuedEvent, context: AggregatedContext): FilterResult {
    const { userState, schedule } = context;

    // If user has been there for more than 5 min, they know they arrived
    if (userState.dwellTimeMinutes > 5) {
      return {
        action: "suppress",
        reason: "User already at location for 5+ min",
        alternativeAction: "silent_update",
      };
    }

    // If there's a booking at this location, show arrival with tips
    if (schedule.currentSlot?.fragility?.bookingRequired) {
      this.recordMessage();
      return { action: "show", reason: "Arrival at booked venue" };
    }

    // For most arrivals, just update silently - user knows they arrived
    return {
      action: "suppress",
      reason: "User aware of arrival",
      alternativeAction: "timeline_note",
    };
  }

  /**
   * Filter departure events
   */
  private filterDeparture(event: QueuedEvent, context: AggregatedContext): FilterResult {
    const nextActivity = context.schedule.upcomingActivities[0];

    // If next activity has a booking, show departure with travel info
    if (nextActivity?.hasBooking) {
      this.recordMessage();
      return { action: "show", reason: "Departure with booking ahead" };
    }

    // Otherwise, silent update
    return {
      action: "suppress",
      reason: "No booking pressure",
      alternativeAction: "timeline_note",
    };
  }

  /**
   * Filter completion prompts
   */
  private filterCompletionPrompt(event: QueuedEvent, context: AggregatedContext): FilterResult {
    const { userState, schedule } = context;
    const nextActivity = schedule.upcomingActivities[0];

    // If user is significantly overtime (> 20 min) and there's pressure
    if (userState.minutesRemaining < -20 && nextActivity?.hasBooking) {
      this.recordMessage();
      return { action: "show", reason: "Overtime with booking pressure" };
    }

    // If user just got there (< 50% of time), don't ask
    if (userState.timeElapsedPercent < 50) {
      return {
        action: "suppress",
        reason: "User just started - too early to ask",
        alternativeAction: "none",
      };
    }

    // If plenty of buffer, let them be
    if (nextActivity && nextActivity.bufferMinutes > 45) {
      return {
        action: "suppress",
        reason: "Plenty of buffer - no need to prompt",
        alternativeAction: "none",
      };
    }

    // Show prompt if they've been there a while and schedule is getting tight
    if (userState.timeElapsedPercent > 90 && nextActivity) {
      this.recordMessage();
      return { action: "show", reason: "Near end of planned time" };
    }

    return {
      action: "suppress",
      reason: "Not enough pressure to prompt",
      alternativeAction: "none",
    };
  }

  /**
   * Determine best suppression action based on event type
   */
  private determineSuppressionAction(event: QueuedEvent, context: AggregatedContext): FilterResult {
    // Map event types to appropriate suppression actions
    const suppressionMap: Record<string, SuppressedAction> = {
      arrival: "timeline_note",
      departure: "timeline_note",
      duration_warning: "status_badge",
      completion_prompt: "none",
      proximity_alert: "silent_update",
      activity_starting: "status_badge",
    };

    const alternativeAction = suppressionMap[event.type] || "silent_update";

    return {
      action: "suppress",
      reason: "No decision required - suppressing",
      alternativeAction,
    };
  }

  /**
   * Check if we're in quiet hours
   */
  private isQuietHours(currentTime: Date): boolean {
    if (!this.config.quietHours) return false;

    const currentMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    const startMinutes = this.parseTime(this.config.quietHours.start);
    const endMinutes = this.parseTime(this.config.quietHours.end);

    // Handle overnight quiet hours (e.g., 22:00 - 07:00)
    if (startMinutes > endMinutes) {
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  /**
   * Parse time string to minutes
   */
  private parseTime(time: string): number {
    const [hours, minutes] = time.split(":").map(Number);
    return hours * 60 + minutes;
  }

  /**
   * Check rate limiting
   */
  private checkRateLimit(): FilterResult | null {
    const now = new Date();

    // Check minimum time between messages
    if (this.lastMessageTime) {
      const secondsSinceLastMessage = (now.getTime() - this.lastMessageTime.getTime()) / 1000;
      if (secondsSinceLastMessage < this.config.minSecondsBetweenMessages) {
        return {
          action: "delay",
          reason: "Rate limit - too soon after last message",
          delaySeconds: this.config.minSecondsBetweenMessages - secondsSinceLastMessage,
        };
      }
    }

    // Check hourly limit
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    this.messageHistory = this.messageHistory.filter((t) => t > oneHourAgo);

    if (this.messageHistory.length >= this.config.maxMessagesPerHour) {
      return {
        action: "suppress",
        reason: `Rate limit - ${this.config.maxMessagesPerHour} messages per hour exceeded`,
        alternativeAction: "silent_update",
      };
    }

    return null;
  }

  /**
   * Record that a message was sent (for rate limiting)
   */
  private recordMessage(): void {
    const now = new Date();
    this.messageHistory.push(now);
    this.lastMessageTime = now;
  }

  /**
   * Reset rate limiting (e.g., for testing)
   */
  reset(): void {
    this.messageHistory = [];
    this.lastMessageTime = null;
    this.pendingBatches.clear();
  }

  /**
   * Get current rate limit status
   */
  getRateLimitStatus(): {
    messagesThisHour: number;
    maxPerHour: number;
    secondsUntilNextAllowed: number;
  } {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    this.messageHistory = this.messageHistory.filter((t) => t > oneHourAgo);

    let secondsUntilNextAllowed = 0;
    if (this.lastMessageTime) {
      const elapsed = (now.getTime() - this.lastMessageTime.getTime()) / 1000;
      secondsUntilNextAllowed = Math.max(0, this.config.minSecondsBetweenMessages - elapsed);
    }

    return {
      messagesThisHour: this.messageHistory.length,
      maxPerHour: this.config.maxMessagesPerHour,
      secondsUntilNextAllowed,
    };
  }
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Quick check if an event should be shown (without full context)
 * Use this for simple pre-filtering before gathering full context
 */
export function quickShouldShow(event: QueuedEvent): boolean {
  // Always show urgent
  if (event.priority === "urgent") return true;

  // Always show these types
  const alwaysShowTypes = [
    "closure_alert",
    "weather_alert",
    "transit_delay",
    "last_call",
    "morning_briefing",
    "day_recap",
  ];

  if (alwaysShowTypes.includes(event.type)) return true;

  // High priority gets through
  if (event.priority === "high") return true;

  // Otherwise, need full context to decide
  return false; // Default to "maybe not" - need context
}

/**
 * Create a new event filter with optional config
 */
export function createEventFilter(config?: Partial<EventFilterConfig>): EventFilter {
  return new EventFilter(config);
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let defaultFilter: EventFilter | null = null;

/**
 * Get the default event filter instance
 */
export function getEventFilter(): EventFilter {
  if (!defaultFilter) {
    defaultFilter = new EventFilter();
  }
  return defaultFilter;
}

/**
 * Reset the default filter (for testing)
 */
export function resetEventFilter(): void {
  defaultFilter = null;
}
