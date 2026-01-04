/**
 * Execution Queue Store
 *
 * Queue-based architecture for execution events.
 * Each executing itinerary has its own queue that receives events from:
 * - Simulator (manual testing)
 * - Real endpoints (GPS, weather, etc.) in future
 *
 * Events flow: Source → Queue → Client → Action Handler (REAL)
 *
 * In-memory implementation, can be swapped for Redis in production.
 */

import type { StructuredItineraryData, SlotWithOptions } from "@/types/structured-itinerary";

// ============================================
// TYPES
// ============================================

export type EventSource = "simulator" | "gps" | "weather" | "timer" | "api" | "user";

export type ExecutionEventType =
  | "arrival"
  | "departure"
  | "proximity_alert"
  | "activity_starting"
  | "duration_warning"
  | "booking_reminder"
  | "last_call"
  | "morning_briefing"
  | "day_recap"
  | "weather_alert"
  | "closure_alert"
  | "crowd_alert"
  | "transit_delay"
  | "completion_prompt"
  | "agent_message";

export interface QueuedEvent {
  id: string;
  tripId: string;
  type: ExecutionEventType;
  source: EventSource;
  priority: "low" | "normal" | "high" | "urgent";

  // Timing
  createdAt: Date;
  expiresAt?: Date;

  // Context
  dayIndex?: number;
  slotId?: string;

  // Content (shows in chat as agent message)
  title: string;
  message: string;
  tip?: string;

  // Suggested actions (buttons in chat)
  actions?: QueuedEventAction[];

  // Processing state
  status: "pending" | "delivered" | "actioned" | "expired" | "dismissed";
  deliveredAt?: Date;
  actionedAt?: Date;
  actionTaken?: string;
}

export interface QueuedEventAction {
  id: string;
  label: string;
  type: "skip" | "extend" | "swap" | "confirm" | "dismiss" | "navigate" | "chat";

  // For real actions (modifies itinerary)
  payload?: {
    slotId?: string;
    minutes?: number;
    alternativeId?: string;
    message?: string;
  };

  // Visual
  variant?: "primary" | "secondary" | "danger";
}

export type ActivityStatus =
  | "upcoming"
  | "pending"
  | "in_progress"
  | "completed"
  | "skipped"
  | "extended";

export interface ExecutionState {
  tripId: string;
  dayIndex: number;
  startedAt: Date;

  // Simulated or real time
  currentTime: Date;
  timeMultiplier: number;
  isPaused: boolean;

  // Slot states
  slotStatuses: Record<string, ActivityStatus>;
  lockedSlotIds: string[]; // Completed/skipped - agent can't modify

  // Location (simulated or real)
  currentLocation?: { lat: number; lng: number };
  currentVenueId?: string;

  // Tracking
  accumulatedDelayMinutes: number;
  completedCount: number;
  skippedCount: number;
}

// ============================================
// IN-MEMORY STORE (swap for Redis in production)
// ============================================

class ExecutionQueueStore {
  private queues: Map<string, QueuedEvent[]> = new Map();
  private states: Map<string, ExecutionState> = new Map();
  private itineraries: Map<string, StructuredItineraryData> = new Map();

  // ========== DEBUG ==========

  getActiveSessions(): string[] {
    const sessions = Array.from(this.states.keys());
    console.log("[ExecutionQueueStore] Active sessions:", sessions);
    return sessions;
  }

  // ========== QUEUE OPERATIONS ==========

  /**
   * Initialize queue for a trip
   */
  initQueue(tripId: string, itinerary: StructuredItineraryData, dayIndex: number = 0): ExecutionState {
    console.log("[ExecutionQueueStore] initQueue called for tripId:", tripId);
    this.queues.set(tripId, []);
    this.itineraries.set(tripId, itinerary);

    const day = itinerary.days[dayIndex];
    const initialStatuses: Record<string, ActivityStatus> = {};

    (day?.slots || []).forEach((slot, idx) => {
      initialStatuses[slot.slotId] = idx === 0 ? "pending" : "upcoming";
    });

    const state: ExecutionState = {
      tripId,
      dayIndex,
      startedAt: new Date(),
      currentTime: new Date(),
      timeMultiplier: 1,
      isPaused: false,
      slotStatuses: initialStatuses,
      lockedSlotIds: [],
      accumulatedDelayMinutes: 0,
      completedCount: 0,
      skippedCount: 0,
    };

    this.states.set(tripId, state);
    console.log("[ExecutionQueueStore] State created for tripId:", tripId, "Total sessions:", this.states.size);
    return state;
  }

  /**
   * Enqueue an event
   */
  enqueue(tripId: string, event: Omit<QueuedEvent, "id" | "tripId" | "createdAt" | "status">): QueuedEvent {
    if (!this.queues.has(tripId)) {
      this.queues.set(tripId, []);
    }

    const queuedEvent: QueuedEvent = {
      ...event,
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      tripId,
      createdAt: new Date(),
      status: "pending",
    };

    this.queues.get(tripId)!.push(queuedEvent);

    // Sort by priority (urgent first)
    this.queues.get(tripId)!.sort((a, b) => {
      const priorityOrder = { urgent: 0, high: 1, normal: 2, low: 3 };
      return priorityOrder[a.priority] - priorityOrder[b.priority];
    });

    return queuedEvent;
  }

  /**
   * Poll for pending events
   */
  poll(tripId: string, limit: number = 10): QueuedEvent[] {
    const queue = this.queues.get(tripId) || [];
    const pending = queue
      .filter(e => e.status === "pending")
      .slice(0, limit);

    // Mark as delivered
    pending.forEach(e => {
      e.status = "delivered";
      e.deliveredAt = new Date();
    });

    return pending;
  }

  /**
   * Peek at pending events (without marking delivered)
   */
  peek(tripId: string): QueuedEvent[] {
    const queue = this.queues.get(tripId) || [];
    return queue.filter(e => e.status === "pending");
  }

  /**
   * Get all events (for debugging)
   */
  getAll(tripId: string): QueuedEvent[] {
    return this.queues.get(tripId) || [];
  }

  /**
   * Mark event as actioned
   */
  markActioned(tripId: string, eventId: string, actionTaken: string): void {
    const queue = this.queues.get(tripId) || [];
    const event = queue.find(e => e.id === eventId);
    if (event) {
      event.status = "actioned";
      event.actionedAt = new Date();
      event.actionTaken = actionTaken;
    }
  }

  /**
   * Dismiss event
   */
  dismiss(tripId: string, eventId: string): void {
    const queue = this.queues.get(tripId) || [];
    const event = queue.find(e => e.id === eventId);
    if (event) {
      event.status = "dismissed";
    }
  }

  /**
   * Clear queue
   */
  clear(tripId: string): void {
    this.queues.set(tripId, []);
  }

  // ========== STATE OPERATIONS ==========

  /**
   * Get execution state
   */
  getState(tripId: string): ExecutionState | null {
    return this.states.get(tripId) || null;
  }

  /**
   * Update execution state
   */
  updateState(tripId: string, updates: Partial<ExecutionState>): ExecutionState | null {
    const state = this.states.get(tripId);
    if (!state) return null;

    Object.assign(state, updates);
    return state;
  }

  /**
   * Get itinerary
   */
  getItinerary(tripId: string): StructuredItineraryData | null {
    return this.itineraries.get(tripId) || null;
  }

  /**
   * Update itinerary (for real actions like skip, swap)
   */
  updateItinerary(tripId: string, itinerary: StructuredItineraryData): void {
    this.itineraries.set(tripId, itinerary);
  }

  // ========== SLOT OPERATIONS (REAL ACTIONS) ==========

  /**
   * Skip a slot (REAL - modifies itinerary state)
   */
  skipSlot(tripId: string, slotId: string): { success: boolean; state: ExecutionState | null } {
    const state = this.states.get(tripId);
    if (!state) return { success: false, state: null };

    state.slotStatuses[slotId] = "skipped";
    state.lockedSlotIds.push(slotId);
    state.skippedCount++;

    // Move to next slot
    const itinerary = this.itineraries.get(tripId);
    if (itinerary) {
      const day = itinerary.days[state.dayIndex];
      const slots = day?.slots || [];
      const currentIndex = slots.findIndex(s => s.slotId === slotId);
      const nextSlot = slots[currentIndex + 1];
      if (nextSlot) {
        state.slotStatuses[nextSlot.slotId] = "pending";
      }
    }

    return { success: true, state };
  }

  /**
   * Complete a slot (REAL)
   */
  completeSlot(tripId: string, slotId: string): { success: boolean; state: ExecutionState | null } {
    const state = this.states.get(tripId);
    if (!state) return { success: false, state: null };

    state.slotStatuses[slotId] = "completed";
    state.lockedSlotIds.push(slotId);
    state.completedCount++;

    // Move to next slot
    const itinerary = this.itineraries.get(tripId);
    if (itinerary) {
      const day = itinerary.days[state.dayIndex];
      const slots = day?.slots || [];
      const currentIndex = slots.findIndex(s => s.slotId === slotId);
      const nextSlot = slots[currentIndex + 1];
      if (nextSlot) {
        state.slotStatuses[nextSlot.slotId] = "pending";
      }
    }

    return { success: true, state };
  }

  /**
   * Extend current activity (REAL - adds delay)
   */
  extendActivity(tripId: string, slotId: string, minutes: number): { success: boolean; state: ExecutionState | null } {
    const state = this.states.get(tripId);
    if (!state) return { success: false, state: null };

    state.slotStatuses[slotId] = "extended";
    state.accumulatedDelayMinutes += minutes;

    return { success: true, state };
  }

  /**
   * Add delay (REAL)
   */
  addDelay(tripId: string, minutes: number): { success: boolean; state: ExecutionState | null } {
    const state = this.states.get(tripId);
    if (!state) return { success: false, state: null };

    state.accumulatedDelayMinutes += minutes;

    return { success: true, state };
  }

  /**
   * Update time (for simulation)
   */
  setTime(tripId: string, time: Date): void {
    const state = this.states.get(tripId);
    if (state) {
      state.currentTime = time;
    }
  }

  /**
   * Pause/resume
   */
  setPaused(tripId: string, paused: boolean): void {
    const state = this.states.get(tripId);
    if (state) {
      state.isPaused = paused;
    }
  }

  /**
   * Set time multiplier
   */
  setTimeMultiplier(tripId: string, multiplier: number): void {
    const state = this.states.get(tripId);
    if (state) {
      state.timeMultiplier = multiplier;
    }
  }

  // ========== CLEANUP ==========

  /**
   * End execution session
   */
  endSession(tripId: string): void {
    this.queues.delete(tripId);
    this.states.delete(tripId);
    // Keep itinerary for reference
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): string[] {
    return Array.from(this.states.keys());
  }
}

// Singleton instance
export const executionQueue = new ExecutionQueueStore();

// ============================================
// EVENT FACTORY (for creating common events)
// ============================================

export const EventFactory = {
  morningBriefing(dayIndex: number, city: string, activities: string[]): Omit<QueuedEvent, "id" | "tripId" | "createdAt" | "status"> {
    return {
      type: "morning_briefing",
      source: "timer",
      priority: "normal",
      dayIndex,
      title: `Good Morning! ☀️`,
      message: `Ready for Day ${dayIndex + 1} in ${city}?\n\n` +
        `Today's plan:\n${activities.map((a, i) => `${i + 1}. ${a}`).join("\n")}\n\n` +
        `Let's make it a great day!`,
      actions: [
        { id: "start", label: "Let's go!", type: "confirm", variant: "primary" },
        { id: "show", label: "Show schedule", type: "navigate" },
      ],
    };
  },

  arrival(slotId: string, venueName: string, tip?: string): Omit<QueuedEvent, "id" | "tripId" | "createdAt" | "status"> {
    return {
      type: "arrival",
      source: "gps",
      priority: "normal",
      slotId,
      title: `You've Arrived! 🎉`,
      message: `Welcome to ${venueName}!`,
      tip,
      actions: [
        { id: "start_activity", label: "Start exploring", type: "confirm", variant: "primary" },
      ],
    };
  },

  departure(slotId: string, venueName: string, nextVenue?: string, walkTime?: number): Omit<QueuedEvent, "id" | "tripId" | "createdAt" | "status"> {
    let message = `Leaving ${venueName}.`;
    if (nextVenue) {
      message += ` Next: ${nextVenue}`;
      if (walkTime) {
        message += ` (${walkTime} min)`;
      }
    }

    return {
      type: "departure",
      source: "gps",
      priority: "normal",
      slotId,
      title: "On the Move",
      message,
      actions: [
        { id: "mark_done", label: "Mark as done", type: "confirm" },
        { id: "navigate", label: "Get directions", type: "navigate" },
      ],
    };
  },

  durationWarning(slotId: string, activityName: string, elapsedMin: number, nextActivity?: string): Omit<QueuedEvent, "id" | "tripId" | "createdAt" | "status"> {
    let message = `You've been at ${activityName} for ${elapsedMin} minutes.`;
    if (nextActivity) {
      message += ` ${nextActivity} is coming up next.`;
    }

    return {
      type: "duration_warning",
      source: "timer",
      priority: "normal",
      slotId,
      title: "Time Check ⏱️",
      message,
      actions: [
        { id: "extend", label: "Stay 15 more min", type: "extend", payload: { slotId, minutes: 15 } },
        { id: "leaving", label: "Heading out", type: "confirm" },
      ],
    };
  },

  bookingReminder(slotId: string, activityName: string, minutesUntil: number): Omit<QueuedEvent, "id" | "tripId" | "createdAt" | "status"> {
    const isUrgent = minutesUntil <= 10;

    return {
      type: isUrgent ? "last_call" : "booking_reminder",
      source: "timer",
      priority: isUrgent ? "urgent" : "high",
      slotId,
      title: isUrgent ? "Last Call! ⚠️" : "Booking Reminder",
      message: isUrgent
        ? `Leave NOW to make your ${activityName} reservation!`
        : `Your ${activityName} booking is in ${minutesUntil} minutes.`,
      actions: [
        { id: "navigate", label: "Get directions", type: "navigate", variant: "primary" },
        { id: "skip", label: "Skip this one", type: "skip", payload: { slotId }, variant: "danger" },
      ],
    };
  },

  weatherAlert(weatherType: "rain" | "heat" | "cold", expectedTime: string): Omit<QueuedEvent, "id" | "tripId" | "createdAt" | "status"> {
    const icons = { rain: "☔", heat: "🌡️", cold: "❄️" };
    const messages = {
      rain: `Rain expected at ${expectedTime}. Your outdoor activities may be affected.`,
      heat: `High temperatures (35°C+) expected. Stay hydrated!`,
      cold: `Cold weather expected. Dress warmly!`,
    };

    return {
      type: "weather_alert",
      source: "weather",
      priority: "high",
      title: `Weather Alert ${icons[weatherType]}`,
      message: messages[weatherType],
      actions: [
        { id: "swap", label: "Find indoor alternatives", type: "swap", variant: "primary" },
        { id: "dismiss", label: "Keep my plan", type: "dismiss" },
      ],
    };
  },

  closureAlert(slotId: string, venueName: string, reason?: string): Omit<QueuedEvent, "id" | "tripId" | "createdAt" | "status"> {
    return {
      type: "closure_alert",
      source: "api",
      priority: "urgent",
      slotId,
      title: "Venue Closed 🚫",
      message: `${venueName} is currently closed${reason ? ` (${reason})` : ""}. Let me find an alternative.`,
      actions: [
        { id: "alternatives", label: "Show alternatives", type: "swap", variant: "primary" },
        { id: "skip", label: "Skip this one", type: "skip", payload: { slotId } },
      ],
    };
  },

  completionPrompt(slotId: string, activityName: string): Omit<QueuedEvent, "id" | "tripId" | "createdAt" | "status"> {
    return {
      type: "completion_prompt",
      source: "timer",
      priority: "normal",
      slotId,
      title: "All done?",
      message: `Finished with ${activityName}?`,
      actions: [
        { id: "done", label: "Yes, I'm done", type: "confirm", variant: "primary" },
        { id: "extend", label: "Stay longer", type: "extend", payload: { slotId, minutes: 30 } },
        { id: "dismiss", label: "Still here", type: "dismiss" },
      ],
    };
  },

  lateWakeup(delayMinutes: number, firstActivity: string): Omit<QueuedEvent, "id" | "tripId" | "createdAt" | "status"> {
    return {
      type: "duration_warning",
      source: "simulator",
      priority: "high",
      title: "Running Behind ⏰",
      message: `You're ${delayMinutes} minutes behind schedule. ${firstActivity} may be affected.\n\nWhat would you like to do?`,
      actions: [
        { id: "skip_first", label: `Skip ${firstActivity}`, type: "skip", variant: "danger" },
        { id: "compress", label: "Compress schedule", type: "chat", payload: { message: "Please compress my schedule to make up time" } },
        { id: "hurry", label: "I'll hurry!", type: "dismiss" },
      ],
    };
  },

  transitDelay(delayMinutes: number, line: string): Omit<QueuedEvent, "id" | "tripId" | "createdAt" | "status"> {
    return {
      type: "transit_delay",
      source: "api",
      priority: "high",
      title: "Transit Delay 🚃",
      message: `${line} is delayed by ${delayMinutes} minutes. This may affect your schedule.`,
      actions: [
        { id: "alternative", label: "Find alternative route", type: "navigate" },
        { id: "adjust", label: "Adjust my schedule", type: "chat", payload: { message: "Please adjust my schedule for the transit delay" } },
        { id: "wait", label: "I'll wait", type: "dismiss" },
      ],
    };
  },

  dayRecap(dayIndex: number, city: string, completed: number, total: number, skipped: number): Omit<QueuedEvent, "id" | "tripId" | "createdAt" | "status"> {
    let message = `Great day in ${city}! You completed ${completed}/${total} activities.`;
    if (skipped > 0) {
      message += ` (${skipped} skipped)`;
    }
    message += `\n\nGet some rest! 🌙`;

    return {
      type: "day_recap",
      source: "timer",
      priority: "normal",
      dayIndex,
      title: "Day Complete 🎉",
      message,
      actions: [
        { id: "notes", label: "Add trip notes", type: "chat", payload: { message: "I'd like to add some notes about today" } },
        { id: "tomorrow", label: "Preview tomorrow", type: "navigate" },
      ],
    };
  },
};
