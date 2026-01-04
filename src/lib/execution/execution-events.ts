/**
 * Execution Event System Types
 *
 * Server-generated events that appear in the chat as proactive agent messages.
 * Events are triggered by location, time, weather, closures, and user behavior.
 */

// ============================================
// EVENT TYPES
// ============================================

export type ExecutionEventType =
  // Location events
  | "arrival"
  | "departure"
  | "proximity_alert"
  | "wrong_direction"
  | "dwell_time_reached"

  // Time events
  | "activity_starting"
  | "duration_warning"
  | "booking_reminder"
  | "last_call"
  | "day_recap"
  | "morning_briefing"

  // External events
  | "weather_alert"
  | "closure_alert"
  | "crowd_alert"
  | "transit_delay"
  | "price_alert"

  // Completion events
  | "auto_completed"
  | "completion_prompt"
  | "slot_skipped"
  | "slot_extended";

export type EventPriority = "low" | "normal" | "high" | "urgent";

export interface ExecutionEvent {
  id: string;
  type: ExecutionEventType;
  priority: EventPriority;
  timestamp: Date;

  // Context
  slotId?: string;
  dayIndex?: number;
  venueId?: string;

  // Content
  title: string;
  message: string;

  // Optional venue tip or contextual info
  tip?: string;

  // Actions user can take
  suggestedActions?: Array<{
    id: string;
    label: string;
    action: "skip" | "extend" | "swap" | "navigate" | "confirm" | "dismiss" | "custom";
    payload?: Record<string, unknown>;
  }>;

  // Display options
  showInChat: boolean;
  showAsNotification: boolean;
  autoDismissSeconds?: number;

  // State updates to apply
  slotUpdates?: Array<{
    slotId: string;
    status: ActivityExecutionStatus;
    completedAt?: Date;
  }>;
}

// ============================================
// COMPLETION SIGNALS
// ============================================

export interface CompletionSignals {
  // Time-based
  currentTime: Date;
  slotStartTime: Date;
  slotEndTime: Date;
  plannedDurationMinutes: number;

  // Location-based
  isAtVenue: boolean;
  leftGeofence: boolean;
  arrivedAtNextVenue: boolean;
  timeAtLocationMinutes: number;

  // User actions
  userConfirmed: boolean;
  userSkipped: boolean;
  userSaidLeaving: boolean;

  // Optional signals
  photoWithLocationMetadata?: boolean;
  paymentDetected?: boolean;
}

export interface CompletionConfidence {
  score: number;           // 0-100
  signals: string[];       // Which signals contributed
  recommendation: "auto_complete" | "ask_user" | "wait";
}

export function computeCompletionConfidence(signals: CompletionSignals): CompletionConfidence {
  let score = 0;
  const activeSignals: string[] = [];

  // User explicit actions (highest weight)
  if (signals.userConfirmed) {
    score += 100;
    activeSignals.push("user_confirmed");
  }
  if (signals.userSkipped) {
    score += 100;
    activeSignals.push("user_skipped");
  }

  // Location signals (high weight)
  if (signals.arrivedAtNextVenue) {
    score += 40;
    activeSignals.push("arrived_at_next");
  }
  if (signals.leftGeofence && !signals.isAtVenue) {
    score += 35;
    activeSignals.push("left_geofence");
  }

  // Time signals (medium weight)
  const timeElapsedMinutes = (signals.currentTime.getTime() - signals.slotStartTime.getTime()) / 60000;
  const dwellPercentage = signals.timeAtLocationMinutes / signals.plannedDurationMinutes;

  if (signals.currentTime > signals.slotEndTime) {
    score += 15;
    activeSignals.push("time_elapsed");
  }
  if (dwellPercentage >= 0.7) {
    score += 20;
    activeSignals.push("dwell_time_70pct");
  }

  // NLP signal
  if (signals.userSaidLeaving) {
    score += 45;
    activeSignals.push("user_said_leaving");
  }

  // Optional passive signals
  if (signals.photoWithLocationMetadata) {
    score += 10;
    activeSignals.push("photo_metadata");
  }
  if (signals.paymentDetected) {
    score += 25;
    activeSignals.push("payment_detected");
  }

  // Cap at 100
  score = Math.min(score, 100);

  // Determine recommendation
  let recommendation: "auto_complete" | "ask_user" | "wait";
  if (score >= 70) {
    recommendation = "auto_complete";
  } else if (score >= 50) {
    recommendation = "ask_user";
  } else {
    recommendation = "wait";
  }

  return { score, signals: activeSignals, recommendation };
}

// ============================================
// LOCATION TRACKING
// ============================================

export interface Location {
  lat: number;
  lng: number;
  accuracy?: number;
  heading?: number;
  speed?: number; // m/s
  timestamp: Date;
}

export interface VenueGeofence {
  venueId: string;
  venueName: string;
  slotId: string;
  center: { lat: number; lng: number };
  radiusMeters: number;

  // Trigger settings
  notifyOnEntry: boolean;
  notifyOnExit: boolean;
  loiteringDelaySeconds?: number; // Only trigger after N seconds inside
}

export type VenueType =
  | "temple_shrine"
  | "park_garden"
  | "museum"
  | "restaurant"
  | "cafe"
  | "shopping_area"
  | "train_station"
  | "hotel"
  | "observation_deck"
  | "entertainment"
  | "default";

export const GEOFENCE_RADIUS: Record<VenueType, number> = {
  temple_shrine: 100,      // Large grounds
  park_garden: 150,        // Very large
  museum: 50,              // Compact building
  restaurant: 30,          // Small
  cafe: 25,                // Very small
  shopping_area: 200,      // District
  train_station: 100,      // Platforms spread out
  hotel: 40,               // Building
  observation_deck: 50,    // Single building
  entertainment: 75,       // Theme parks, etc.
  default: 50,
};

export function getVenueTypeRadius(venueType: string): number {
  return GEOFENCE_RADIUS[venueType as VenueType] || GEOFENCE_RADIUS.default;
}

// Calculate distance between two coordinates in meters (Haversine formula)
export function calculateDistance(loc1: { lat: number; lng: number }, loc2: { lat: number; lng: number }): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = toRad(loc2.lat - loc1.lat);
  const dLng = toRad(loc2.lng - loc1.lng);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(loc1.lat)) * Math.cos(toRad(loc2.lat)) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(deg: number): number {
  return deg * (Math.PI / 180);
}

export function isInsideGeofence(location: Location, geofence: VenueGeofence): boolean {
  const distance = calculateDistance(location, geofence.center);
  return distance <= geofence.radiusMeters;
}

// ============================================
// ACTIVITY STATUS
// ============================================

export type ActivityExecutionStatus =
  | "upcoming"      // Not yet time
  | "pending"       // Time reached, waiting for user to start
  | "en_route"      // User heading to venue
  | "arrived"       // User at venue, not started
  | "in_progress"   // Actively doing activity
  | "completed"     // Done
  | "skipped"       // User skipped
  | "extended";     // Running longer than planned

// ============================================
// EXECUTION SESSION STATE
// ============================================

export interface ExecutionSessionState {
  tripId: string;
  userId: string;
  currentDayIndex: number;

  // Time tracking
  sessionStartTime: Date;
  currentSimulatedTime: Date;
  timeMultiplier: number;
  isPaused: boolean;

  // Location tracking
  currentLocation: Location | null;
  locationHistory: Location[];

  // Slot tracking
  slotStatuses: Map<string, ActivityExecutionStatus>;
  slotArrivalTimes: Map<string, Date>;
  slotDepartureTimes: Map<string, Date>;

  // Geofences for current day
  activeGeofences: VenueGeofence[];
  currentGeofence: string | null; // venueId of current geofence user is in

  // Delays
  accumulatedDelayMinutes: number;

  // Completion tracking
  lockedSlotIds: Set<string>; // Can't be modified by agent

  // Events
  pendingEvents: ExecutionEvent[];
  sentEventIds: Set<string>;
  lastMessageTime: Date | null;
}

// ============================================
// EVENT PUSH (Server → Client)
// ============================================

export interface EventPush {
  type: "execution_event";
  event: ExecutionEvent;

  // State updates
  stateUpdates?: {
    currentTime?: Date;
    currentLocation?: Location;
    slotStatuses?: Array<{ slotId: string; status: ActivityExecutionStatus }>;
    lockedSlotIds?: string[];
    accumulatedDelayMinutes?: number;
  };

  // UI hints
  scrollToSlot?: string;
  highlightSlot?: string;
  showDecisionModal?: boolean;
}

// ============================================
// LOCATION UPDATE (Client → Server)
// ============================================

export interface LocationUpdate {
  tripId: string;
  timestamp: Date;
  location: Location;
  batteryLevel?: number;
}

// ============================================
// THROTTLE RULES
// ============================================

export const THROTTLE_RULES = {
  minSecondsBetweenMessages: 120,  // 2 min minimum gap
  maxMessagesPerHour: 10,
  urgentBypassThrottle: true,
  batchRelatedEvents: true,
  batchWindowSeconds: 10,
  quietHours: {
    start: "22:00",
    end: "07:00",
    allowUrgentOnly: true,
  },
};
