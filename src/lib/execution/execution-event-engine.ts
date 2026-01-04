/**
 * Execution Event Engine
 *
 * Generates proactive agent messages during trip execution based on:
 * - Time progression (slot timers, booking reminders)
 * - Location changes (arrivals, departures, proximity)
 * - External data (weather, closures)
 * - Completion detection (multi-signal scoring)
 *
 * Events are pushed to the client chat panel as agent messages.
 */

// Generate unique IDs without uuid dependency
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
import type { StructuredItineraryData, SlotWithOptions } from "@/types/structured-itinerary";

// Alias for convenience
type DaySchedule = StructuredItineraryData["days"][number];
import {
  ExecutionEvent,
  EventPriority,
  ExecutionSessionState,
  Location,
  VenueGeofence,
  CompletionSignals,
  computeCompletionConfidence,
  isInsideGeofence,
  calculateDistance,
  THROTTLE_RULES,
} from "./execution-events";

// ============================================
// EVENT GENERATORS
// ============================================

// Event generator interface for extensibility
// interface EventGenerator {
//   type: string;
//   check: (state: ExecutionSessionState, itinerary: StructuredItineraryData) => ExecutionEvent[];
// }

/**
 * Generate morning briefing event
 */
function generateMorningBriefing(
  day: DaySchedule,
  dayIndex: number,
  simulatedTime: Date
): ExecutionEvent {
  const slots = day.slots || [];
  const timedBookings = slots.filter((s: SlotWithOptions) => {
    const activity = s.options?.[0]?.activity;
    // Check if activity has timed entry based on category or tags
    const tags = activity?.tags || [];
    return tags.includes("timed_entry") || tags.includes("reservation_required");
  });
  const totalActivities = slots.length;

  // Calculate estimated walking distance (rough estimate)
  const walkingKm = Math.round(totalActivities * 1.5 * 10) / 10;

  let message = `☀️ Good morning! Here's your Day ${day.dayNumber} in ${day.city}:\n\n`;

  // First activity
  const firstSlot = slots[0];
  if (firstSlot?.options?.[0]) {
    const firstActivity = firstSlot.options[0].activity;
    const startTime = firstSlot.timeRange?.start || "8:00 AM";
    message += `First up: ${firstActivity.name} at ${startTime}\n\n`;
  }

  message += `Today's highlights:\n`;
  message += `• ${totalActivities} activities planned\n`;
  if (timedBookings.length > 0) {
    message += `• ${timedBookings.length} timed booking${timedBookings.length > 1 ? "s" : ""}\n`;
  }
  message += `• Total walking: ~${walkingKm} km\n`;

  // Add any warnings
  const warnings: string[] = [];
  // Check for early closures, cash-only restaurants, etc.
  slots.forEach((slot: SlotWithOptions) => {
    const activity = slot.options?.[0]?.activity;
    // Check for cash-only in tags or estimated cost notes
    const tags = activity?.tags || [];
    if (tags.includes("cash_only")) {
      warnings.push(`${activity?.name} is cash-only`);
    }
  });

  if (warnings.length > 0) {
    message += `\n⚠️ Heads up:\n`;
    warnings.forEach(w => {
      message += `• ${w}\n`;
    });
  }

  message += `\nReady to start your day?`;

  return {
    id: generateId(),
    type: "morning_briefing",
    priority: "normal",
    timestamp: simulatedTime,
    dayIndex,
    title: `Day ${day.dayNumber} Briefing`,
    message,
    showInChat: true,
    showAsNotification: false,
    suggestedActions: [
      { id: "start_day", label: "Let's go!", action: "confirm" },
      { id: "show_map", label: "Show on map", action: "navigate" },
    ],
  };
}

/**
 * Generate arrival event when user enters venue geofence
 */
function generateArrivalEvent(
  slot: SlotWithOptions,
  venue: VenueGeofence,
  simulatedTime: Date
): ExecutionEvent {
  const activity = slot.options?.[0]?.activity;
  if (!activity) {
    return {
      id: generateId(),
      type: "arrival",
      priority: "normal",
      timestamp: simulatedTime,
      slotId: slot.slotId,
      venueId: venue.venueId,
      title: "Arrived",
      message: `You've arrived at ${venue.venueName}!`,
      showInChat: true,
      showAsNotification: true,
      autoDismissSeconds: 10,
      slotUpdates: [{ slotId: slot.slotId, status: "in_progress" }],
    };
  }

  // Add a contextual tip based on activity type
  let tip = "";
  const category = activity.category?.toLowerCase() || "";
  if (category.includes("temple") || category.includes("shrine")) {
    tip = "Remember to remove shoes before entering the main hall.";
  } else if (category.includes("museum")) {
    tip = "Photography may be restricted in some areas.";
  } else if (category.includes("restaurant")) {
    tip = "Check if there's a queue system or ticket machine.";
  }

  return {
    id: generateId(),
    type: "arrival",
    priority: "normal",
    timestamp: simulatedTime,
    slotId: slot.slotId,
    venueId: venue.venueId,
    title: `Arrived at ${activity.name}`,
    message: `You've arrived at ${activity.name}! 🎉`,
    tip,
    showInChat: true,
    showAsNotification: true,
    autoDismissSeconds: 15,
    slotUpdates: [{ slotId: slot.slotId, status: "in_progress" }],
  };
}

/**
 * Generate departure event when user leaves venue geofence
 */
function generateDepartureEvent(
  slot: SlotWithOptions,
  nextSlot: SlotWithOptions | null,
  venue: VenueGeofence,
  simulatedTime: Date,
  completionConfidence: number
): ExecutionEvent {
  const activity = slot.options?.[0]?.activity;
  const nextActivity = nextSlot?.options?.[0]?.activity;

  let message = `Heading out from ${activity?.name || venue.venueName}.`;

  if (nextActivity) {
    const walkTime = 15; // Could calculate based on distance
    message += ` Next up: ${nextActivity.name} (${walkTime} min away)`;
  }

  const shouldAutoComplete = completionConfidence >= 70;

  return {
    id: generateId(),
    type: "departure",
    priority: "normal",
    timestamp: simulatedTime,
    slotId: slot.slotId,
    venueId: venue.venueId,
    title: "On the move",
    message,
    showInChat: true,
    showAsNotification: false,
    slotUpdates: shouldAutoComplete
      ? [{ slotId: slot.slotId, status: "completed", completedAt: simulatedTime }]
      : undefined,
    suggestedActions: !shouldAutoComplete ? [
      { id: "mark_complete", label: "Mark as done", action: "confirm" },
      { id: "still_there", label: "Still here", action: "dismiss" },
    ] : undefined,
  };
}

/**
 * Generate duration warning when approaching planned end time
 */
function generateDurationWarning(
  slot: SlotWithOptions,
  elapsedMinutes: number,
  plannedMinutes: number,
  nextSlot: SlotWithOptions | null,
  simulatedTime: Date
): ExecutionEvent {
  const activity = slot.options?.[0]?.activity;
  const nextActivity = nextSlot?.options?.[0]?.activity;

  let message = `You've been at ${activity?.name || "this location"} for about ${elapsedMinutes} minutes`;
  if (plannedMinutes > 0) {
    message += ` (planned ${plannedMinutes} min).`;
  }

  if (nextActivity && nextSlot?.timeRange?.start) {
    const nextTime = nextSlot.timeRange.start;
    message += ` Your next activity (${nextActivity.name}) is scheduled for ${nextTime}.`;
  }

  return {
    id: generateId(),
    type: "duration_warning",
    priority: "low",
    timestamp: simulatedTime,
    slotId: slot.slotId,
    title: "Time check",
    message,
    showInChat: true,
    showAsNotification: false,
    suggestedActions: [
      { id: "extend_15", label: "Stay 15 min longer", action: "extend", payload: { minutes: 15 } },
      { id: "ready_to_go", label: "Ready to leave", action: "confirm" },
    ],
  };
}

/**
 * Generate booking reminder for timed entries
 */
function generateBookingReminder(
  slot: SlotWithOptions,
  minutesUntilBooking: number,
  currentLocation: Location | null,
  venue: VenueGeofence,
  simulatedTime: Date
): ExecutionEvent {
  const activity = slot.options?.[0]?.activity;

  // Calculate travel time if we have current location
  let travelTimeMinutes = 15; // default
  if (currentLocation && venue.center) {
    const distanceMeters = calculateDistance(currentLocation, venue.center);
    // Assume 80m/min walking speed
    travelTimeMinutes = Math.ceil(distanceMeters / 80);
  }

  const leaveInMinutes = Math.max(0, minutesUntilBooking - travelTimeMinutes);

  let priority: EventPriority = "normal";
  let message = "";

  if (leaveInMinutes <= 5) {
    priority = "urgent";
    message = `⚠️ Last call! Leave now to make your ${activity?.name || "booking"} reservation.`;
  } else if (leaveInMinutes <= 15) {
    priority = "high";
    message = `Your ${activity?.name || "booking"} is in ${minutesUntilBooking} minutes. Leave in ${leaveInMinutes} min to arrive on time.`;
  } else {
    message = `Reminder: ${activity?.name || "Your booking"} is in ${minutesUntilBooking} minutes (${travelTimeMinutes} min travel time).`;
  }

  return {
    id: generateId(),
    type: leaveInMinutes <= 5 ? "last_call" : "booking_reminder",
    priority,
    timestamp: simulatedTime,
    slotId: slot.slotId,
    venueId: venue.venueId,
    title: leaveInMinutes <= 5 ? "Last Call!" : "Booking Reminder",
    message,
    showInChat: true,
    showAsNotification: priority !== "normal",
    autoDismissSeconds: priority === "urgent" ? undefined : 30,
    suggestedActions: [
      { id: "navigate", label: "Get directions", action: "navigate" },
      { id: "need_more_time", label: "I need more time", action: "custom", payload: { intent: "reschedule" } },
    ],
  };
}

/**
 * Generate activity starting event
 */
function generateActivityStarting(
  slot: SlotWithOptions,
  isUserAtVenue: boolean,
  distanceToVenue: number | null,
  simulatedTime: Date
): ExecutionEvent {
  const activity = slot.options?.[0]?.activity;
  const startTime = slot.timeRange?.start || "now";

  let message = `It's ${startTime} - time for ${activity?.name || "your activity"}!`;

  if (!isUserAtVenue && distanceToVenue !== null) {
    const walkMinutes = Math.ceil(distanceToVenue / 80);
    message += ` You're currently ${walkMinutes} min away.`;
  } else if (isUserAtVenue) {
    message += ` You're already here - enjoy!`;
  }

  return {
    id: generateId(),
    type: "activity_starting",
    priority: "normal",
    timestamp: simulatedTime,
    slotId: slot.slotId,
    title: `Time for ${activity?.name || "activity"}`,
    message,
    showInChat: true,
    showAsNotification: true,
    autoDismissSeconds: 20,
    slotUpdates: isUserAtVenue ? [{ slotId: slot.slotId, status: "in_progress" }] : undefined,
  };
}

/**
 * Generate weather alert
 */
function generateWeatherAlert(
  affectedSlots: SlotWithOptions[],
  weatherType: "rain" | "heat" | "cold" | "wind",
  expectedTime: string,
  simulatedTime: Date
): ExecutionEvent {
  const outdoorActivities = affectedSlots
    .filter(s => {
      const category = s.options?.[0]?.activity?.category?.toLowerCase() || "";
      return category.includes("park") || category.includes("garden") || category.includes("outdoor");
    })
    .map(s => s.options?.[0]?.activity?.name)
    .filter(Boolean);

  let message = "";
  switch (weatherType) {
    case "rain":
      message = `☔ Rain expected at ${expectedTime}.`;
      break;
    case "heat":
      message = `🌡️ High temperatures expected (35°C+).`;
      break;
    case "cold":
      message = `❄️ Cold weather expected (below 5°C).`;
      break;
    case "wind":
      message = `💨 Strong winds expected.`;
      break;
  }

  if (outdoorActivities.length > 0) {
    message += ` Your outdoor activities: ${outdoorActivities.join(", ")}.`;
    message += ` Want me to suggest indoor alternatives?`;
  }

  return {
    id: generateId(),
    type: "weather_alert",
    priority: "high",
    timestamp: simulatedTime,
    title: "Weather Alert",
    message,
    showInChat: true,
    showAsNotification: true,
    suggestedActions: [
      { id: "swap_indoor", label: "Find indoor alternatives", action: "swap" },
      { id: "keep_plan", label: "Keep my plan", action: "dismiss" },
    ],
  };
}

/**
 * Generate closure alert
 */
function generateClosureAlert(
  slot: SlotWithOptions,
  reason: string,
  simulatedTime: Date
): ExecutionEvent {
  const activity = slot.options?.[0]?.activity;

  return {
    id: generateId(),
    type: "closure_alert",
    priority: "urgent",
    timestamp: simulatedTime,
    slotId: slot.slotId,
    title: "Venue Closed",
    message: `🚫 ${activity?.name || "The venue"} is currently closed${reason ? ` (${reason})` : ""}. I have alternatives ready.`,
    showInChat: true,
    showAsNotification: true,
    suggestedActions: [
      { id: "show_alternatives", label: "Show alternatives", action: "swap" },
      { id: "skip", label: "Skip this one", action: "skip" },
    ],
  };
}

/**
 * Generate completion prompt when confidence is medium
 */
function generateCompletionPrompt(
  slot: SlotWithOptions,
  _confidenceScore: number,
  _signals: string[],
  simulatedTime: Date
): ExecutionEvent {
  const activity = slot.options?.[0]?.activity;

  return {
    id: generateId(),
    type: "completion_prompt",
    priority: "normal",
    timestamp: simulatedTime,
    slotId: slot.slotId,
    title: "Activity Done?",
    message: `Are you done with ${activity?.name || "this activity"}? It looks like you might be finished.`,
    showInChat: true,
    showAsNotification: false,
    suggestedActions: [
      { id: "yes_done", label: "Yes, I'm done", action: "confirm" },
      { id: "still_here", label: "Still enjoying it", action: "dismiss" },
      { id: "extend", label: "Extend 30 min", action: "extend", payload: { minutes: 30 } },
    ],
  };
}

/**
 * Generate day recap at end of day
 */
function generateDayRecap(
  day: DaySchedule,
  dayIndex: number,
  completedCount: number,
  skippedCount: number,
  nextDayFirstActivity: string | null,
  simulatedTime: Date
): ExecutionEvent {
  const totalCount = day.slots?.length || 0;

  let message = `Great day! You completed ${completedCount}/${totalCount} activities`;
  if (skippedCount > 0) {
    message += ` (${skippedCount} skipped)`;
  }
  message += ` in ${day.city}.`;

  if (nextDayFirstActivity) {
    message += `\n\nTomorrow starts with ${nextDayFirstActivity}.`;
  }

  message += `\n\nGet some rest! 🌙`;

  return {
    id: generateId(),
    type: "day_recap",
    priority: "normal",
    timestamp: simulatedTime,
    dayIndex,
    title: "Day Complete",
    message,
    showInChat: true,
    showAsNotification: true,
    suggestedActions: [
      { id: "view_photos", label: "Add trip notes", action: "custom", payload: { intent: "notes" } },
      { id: "preview_tomorrow", label: "Preview tomorrow", action: "custom", payload: { intent: "preview_next_day" } },
    ],
  };
}

// ============================================
// EXECUTION EVENT ENGINE
// ============================================

export class ExecutionEventEngine {
  private state: ExecutionSessionState;
  private itinerary: StructuredItineraryData;
  private onEvent: (event: ExecutionEvent) => void;
  private eventCheckInterval: ReturnType<typeof setInterval> | null = null;

  // Track which events we've sent to avoid duplicates
  private sentEventTypes: Map<string, Date> = new Map(); // slotId:eventType -> lastSentTime

  constructor(
    itinerary: StructuredItineraryData,
    initialState: ExecutionSessionState,
    onEvent: (event: ExecutionEvent) => void
  ) {
    this.itinerary = itinerary;
    this.state = initialState;
    this.onEvent = onEvent;
  }

  /**
   * Start the event engine
   */
  start(): void {
    // Generate morning briefing immediately
    const currentDay = this.itinerary.days[this.state.currentDayIndex];
    if (currentDay) {
      const briefing = generateMorningBriefing(
        currentDay,
        this.state.currentDayIndex,
        this.state.currentSimulatedTime
      );
      this.emitEvent(briefing);
    }

    // Start periodic checks
    this.eventCheckInterval = setInterval(() => {
      this.checkForEvents();
    }, 1000); // Check every second (will be scaled by time multiplier)
  }

  /**
   * Stop the event engine
   */
  stop(): void {
    if (this.eventCheckInterval) {
      clearInterval(this.eventCheckInterval);
      this.eventCheckInterval = null;
    }
  }

  /**
   * Update location
   */
  updateLocation(location: Location): void {
    const previousLocation = this.state.currentLocation;
    const previousGeofence = this.state.currentGeofence;

    this.state.currentLocation = location;
    this.state.locationHistory.push(location);

    // Check geofence transitions
    this.checkGeofenceTransitions(previousGeofence, location);
  }

  /**
   * Update simulated time
   */
  updateTime(time: Date): void {
    this.state.currentSimulatedTime = time;
  }

  /**
   * User confirmed activity completion
   */
  confirmActivityComplete(slotId: string): void {
    this.state.slotStatuses.set(slotId, "completed");
    this.state.lockedSlotIds.add(slotId);
  }

  /**
   * User skipped activity
   */
  skipActivity(slotId: string): void {
    this.state.slotStatuses.set(slotId, "skipped");
    this.state.lockedSlotIds.add(slotId);
  }

  /**
   * Check for events to emit based on current state
   */
  private checkForEvents(): void {
    if (this.state.isPaused) return;

    const currentDay = this.itinerary.days[this.state.currentDayIndex];
    if (!currentDay?.slots) return;

    const events: ExecutionEvent[] = [];

    // Check each slot for time-based events
    currentDay.slots.forEach((slot, index) => {
      const status = this.state.slotStatuses.get(slot.slotId) || "upcoming";

      // Skip locked slots
      if (this.state.lockedSlotIds.has(slot.slotId)) return;

      // Check for activity starting
      if (status === "upcoming" || status === "pending") {
        const startEvent = this.checkActivityStartTime(slot, index);
        if (startEvent) events.push(startEvent);
      }

      // Check for duration warnings
      if (status === "in_progress") {
        const durationEvent = this.checkDurationWarning(slot, index, currentDay.slots!);
        if (durationEvent) events.push(durationEvent);
      }

      // Check for booking reminders
      // Check for booking reminders based on tags
      const activityTags = slot.options?.[0]?.activity?.tags || [];
      if (activityTags.includes("timed_entry") || activityTags.includes("reservation_required")) {
        const bookingEvent = this.checkBookingReminder(slot);
        if (bookingEvent) events.push(bookingEvent);
      }
    });

    // Check for day recap (end of day)
    const dayRecapEvent = this.checkDayRecap(currentDay);
    if (dayRecapEvent) events.push(dayRecapEvent);

    // Emit events with throttling
    events.forEach(event => {
      if (this.shouldEmitEvent(event)) {
        this.emitEvent(event);
      }
    });
  }

  /**
   * Check geofence transitions
   */
  private checkGeofenceTransitions(previousGeofence: string | null, location: Location): void {
    const currentDay = this.itinerary.days[this.state.currentDayIndex];
    if (!currentDay?.slots) return;

    let newGeofence: string | null = null;

    // Check each geofence
    for (const geofence of this.state.activeGeofences) {
      if (isInsideGeofence(location, geofence)) {
        newGeofence = geofence.venueId;
        break;
      }
    }

    // Handle arrival
    if (newGeofence && newGeofence !== previousGeofence) {
      const geofence = this.state.activeGeofences.find(g => g.venueId === newGeofence);
      const slot = currentDay.slots.find(s => s.slotId === geofence?.slotId);

      if (geofence && slot) {
        // Record arrival time
        this.state.slotArrivalTimes.set(slot.slotId, this.state.currentSimulatedTime);

        const arrivalEvent = generateArrivalEvent(slot, geofence, this.state.currentSimulatedTime);
        this.emitEvent(arrivalEvent);

        // Update status
        this.state.slotStatuses.set(slot.slotId, "in_progress");
      }
    }

    // Handle departure
    if (previousGeofence && previousGeofence !== newGeofence) {
      const geofence = this.state.activeGeofences.find(g => g.venueId === previousGeofence);
      const slot = currentDay.slots.find(s => s.slotId === geofence?.slotId);
      const slotIndex = currentDay.slots.findIndex(s => s.slotId === geofence?.slotId);
      const nextSlot = slotIndex >= 0 ? currentDay.slots[slotIndex + 1] : null;

      if (geofence && slot) {
        // Record departure time
        this.state.slotDepartureTimes.set(slot.slotId, this.state.currentSimulatedTime);

        // Calculate completion confidence
        const arrivalTime = this.state.slotArrivalTimes.get(slot.slotId);
        const timeAtLocation = arrivalTime
          ? (this.state.currentSimulatedTime.getTime() - arrivalTime.getTime()) / 60000
          : 0;

        const signals: CompletionSignals = {
          currentTime: this.state.currentSimulatedTime,
          slotStartTime: new Date(), // Would parse from slot.timeRange.start
          slotEndTime: new Date(),   // Would parse from slot.timeRange.end
          plannedDurationMinutes: slot.options?.[0]?.activity?.duration || 60,
          isAtVenue: false,
          leftGeofence: true,
          arrivedAtNextVenue: newGeofence !== null,
          timeAtLocationMinutes: timeAtLocation,
          userConfirmed: false,
          userSkipped: false,
          userSaidLeaving: false,
        };

        const confidence = computeCompletionConfidence(signals);

        const departureEvent = generateDepartureEvent(
          slot,
          nextSlot || null,
          geofence,
          this.state.currentSimulatedTime,
          confidence.score
        );

        this.emitEvent(departureEvent);

        // Auto-complete if high confidence
        if (confidence.recommendation === "auto_complete") {
          this.state.slotStatuses.set(slot.slotId, "completed");
          this.state.lockedSlotIds.add(slot.slotId);
        } else if (confidence.recommendation === "ask_user") {
          // Send completion prompt
          const promptEvent = generateCompletionPrompt(
            slot,
            confidence.score,
            confidence.signals,
            this.state.currentSimulatedTime
          );
          this.emitEvent(promptEvent);
        }
      }
    }

    this.state.currentGeofence = newGeofence;
  }

  /**
   * Check if activity should start
   */
  private checkActivityStartTime(slot: SlotWithOptions, slotIndex: number): ExecutionEvent | null {
    const startTimeStr = slot.timeRange?.start;
    if (!startTimeStr) return null;

    // Parse time (simplified - assumes "HH:MM AM/PM" format)
    const slotStartTime = this.parseTime(startTimeStr);
    if (!slotStartTime) return null;

    const currentTime = this.state.currentSimulatedTime;
    const timeDiff = currentTime.getTime() - slotStartTime.getTime();
    const minutesDiff = timeDiff / 60000;

    // Trigger if within 5 minutes of start time
    if (minutesDiff >= -5 && minutesDiff <= 5) {
      const eventKey = `${slot.slotId}:activity_starting`;
      if (this.sentEventTypes.has(eventKey)) return null;

      const geofence = this.state.activeGeofences.find(g => g.slotId === slot.slotId);
      const isAtVenue = this.state.currentGeofence === geofence?.venueId;
      const distance = this.state.currentLocation && geofence
        ? calculateDistance(this.state.currentLocation, geofence.center)
        : null;

      return generateActivityStarting(slot, isAtVenue, distance, currentTime);
    }

    return null;
  }

  /**
   * Check for duration warning
   */
  private checkDurationWarning(
    slot: SlotWithOptions,
    _slotIndex: number,
    slots: SlotWithOptions[]
  ): ExecutionEvent | null {
    const arrivalTime = this.state.slotArrivalTimes.get(slot.slotId);
    if (!arrivalTime) return null;

    const plannedDuration = slot.options?.[0]?.activity?.duration || 60;
    const elapsedMinutes = (this.state.currentSimulatedTime.getTime() - arrivalTime.getTime()) / 60000;

    // Trigger at 80% of planned duration
    if (elapsedMinutes >= plannedDuration * 0.8) {
      const eventKey = `${slot.slotId}:duration_warning`;
      if (this.sentEventTypes.has(eventKey)) return null;

      const currentIndex = slots.findIndex(s => s.slotId === slot.slotId);
      const nextSlot = currentIndex >= 0 ? slots[currentIndex + 1] || null : null;
      return generateDurationWarning(
        slot,
        Math.round(elapsedMinutes),
        plannedDuration,
        nextSlot,
        this.state.currentSimulatedTime
      );
    }

    return null;
  }

  /**
   * Check for booking reminder
   */
  private checkBookingReminder(slot: SlotWithOptions): ExecutionEvent | null {
    const startTimeStr = slot.timeRange?.start;
    if (!startTimeStr) return null;

    const slotStartTime = this.parseTime(startTimeStr);
    if (!slotStartTime) return null;

    const currentTime = this.state.currentSimulatedTime;
    const minutesUntil = (slotStartTime.getTime() - currentTime.getTime()) / 60000;

    // Trigger at 30 min, 15 min, and 5 min
    const reminderThresholds = [30, 15, 5];

    for (const threshold of reminderThresholds) {
      if (minutesUntil <= threshold && minutesUntil > threshold - 5) {
        const eventKey = `${slot.slotId}:booking_reminder:${threshold}`;
        if (this.sentEventTypes.has(eventKey)) continue;

        const geofence = this.state.activeGeofences.find(g => g.slotId === slot.slotId);
        if (!geofence) continue;

        return generateBookingReminder(
          slot,
          Math.round(minutesUntil),
          this.state.currentLocation,
          geofence,
          currentTime
        );
      }
    }

    return null;
  }

  /**
   * Check for day recap
   */
  private checkDayRecap(day: DaySchedule): ExecutionEvent | null {
    const currentHour = this.state.currentSimulatedTime.getHours();

    // Trigger at 6 PM
    if (currentHour >= 18) {
      const eventKey = `day_${this.state.currentDayIndex}:day_recap`;
      if (this.sentEventTypes.has(eventKey)) return null;

      let completedCount = 0;
      let skippedCount = 0;

      (day.slots || []).forEach((slot: SlotWithOptions) => {
        const status = this.state.slotStatuses.get(slot.slotId);
        if (status === "completed") completedCount++;
        if (status === "skipped") skippedCount++;
      });

      // Get next day's first activity
      const nextDay = this.itinerary.days[this.state.currentDayIndex + 1];
      const nextDayFirstActivity = nextDay?.slots?.[0]?.options?.[0]?.activity?.name || null;

      return generateDayRecap(
        day,
        this.state.currentDayIndex,
        completedCount,
        skippedCount,
        nextDayFirstActivity,
        this.state.currentSimulatedTime
      );
    }

    return null;
  }

  /**
   * Check if we should emit an event (throttling)
   */
  private shouldEmitEvent(event: ExecutionEvent): boolean {
    // Urgent events bypass throttle
    if (THROTTLE_RULES.urgentBypassThrottle && event.priority === "urgent") {
      return true;
    }

    // Check minimum time between messages
    if (this.state.lastMessageTime) {
      const secondsSinceLastMessage =
        (this.state.currentSimulatedTime.getTime() - this.state.lastMessageTime.getTime()) / 1000;

      if (secondsSinceLastMessage < THROTTLE_RULES.minSecondsBetweenMessages) {
        // Queue for later instead of dropping
        this.state.pendingEvents.push(event);
        return false;
      }
    }

    return true;
  }

  /**
   * Emit an event
   */
  private emitEvent(event: ExecutionEvent): void {
    // Track sent events
    const eventKey = event.slotId
      ? `${event.slotId}:${event.type}`
      : `${event.dayIndex}:${event.type}`;
    this.sentEventTypes.set(eventKey, this.state.currentSimulatedTime);
    this.state.sentEventIds.add(event.id);
    this.state.lastMessageTime = this.state.currentSimulatedTime;

    // Emit to callback
    this.onEvent(event);
  }

  /**
   * Parse time string to Date
   */
  private parseTime(timeStr: string): Date | null {
    try {
      const today = new Date(this.state.currentSimulatedTime);
      const [time, period] = timeStr.split(" ");
      let [hours, minutes] = time.split(":").map(Number);

      if (period?.toLowerCase() === "pm" && hours !== 12) {
        hours += 12;
      } else if (period?.toLowerCase() === "am" && hours === 12) {
        hours = 0;
      }

      today.setHours(hours, minutes, 0, 0);
      return today;
    } catch {
      return null;
    }
  }

  /**
   * Get current state
   */
  getState(): ExecutionSessionState {
    return this.state;
  }
}

// ============================================
// EXPORTS
// ============================================

export {
  generateMorningBriefing,
  generateArrivalEvent,
  generateDepartureEvent,
  generateDurationWarning,
  generateBookingReminder,
  generateActivityStarting,
  generateWeatherAlert,
  generateClosureAlert,
  generateCompletionPrompt,
  generateDayRecap,
};
