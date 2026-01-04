// ============================================
// EXECUTION PHASE - TYPE DEFINITIONS
// ============================================
// Based on: docs/EXECUTION_PHASE_DESIGN.md
// Types for real-time trip execution, activity lifecycle,
// location tracking, notifications, and user interactions

import { Coordinates } from "./activity-suggestion";
import { DayWithOptions, SlotWithOptions, StructuredCommuteInfo } from "./structured-itinerary";

// ============================================
// EXECUTION MODE TYPES
// ============================================

/**
 * The current mode of the execution engine
 */
export type ExecutionMode =
  | "idle"           // No active trip
  | "briefing"       // Morning briefing mode
  | "active"         // Full execution mode
  | "paused"         // User paused (break, rest)
  | "emergency"      // Emergency mode (illness, major disruption)
  | "winding_down";  // End of day

// ============================================
// ACTIVITY STATE TYPES
// ============================================

/**
 * State of an activity during execution
 */
export type ActivityState =
  | "upcoming"     // Scheduled for later
  | "pending"      // Time to prepare (30 min before)
  | "en_route"     // Traveling to location
  | "arrived"      // At location, not started
  | "in_progress"  // Actively doing activity
  | "extended"     // Running over scheduled time
  | "completed"    // Finished
  | "skipped"      // User skipped
  | "deferred"     // Moved to later
  | "replaced";    // Swapped for alternative

/**
 * Trigger for activity state transitions
 */
export type TransitionTrigger =
  | "time_threshold"      // Automatic time-based
  | "location_detected"   // GPS detected arrival/departure
  | "user_check_in"       // User explicitly checked in
  | "user_check_out"      // User explicitly checked out
  | "user_skip"           // User chose to skip
  | "user_defer"          // User deferred to later
  | "user_extend"         // User extended time
  | "user_shorten"        // User cut activity short
  | "system_reshuffle"    // System-initiated change
  | "external_trigger";   // Weather, closure, etc.

/**
 * Activity state transition definition
 */
export interface ActivityTransition {
  from: ActivityState;
  to: ActivityState;
  trigger: TransitionTrigger;
  guards?: string[];
  actions?: string[];
}

// ============================================
// ACTIVITY EXECUTION TYPES
// ============================================

/**
 * Execution state of a single activity
 * Works directly with SlotWithOptions from structured itinerary
 */
export interface ActivityExecution {
  slotId: string;
  slot: SlotWithOptions;
  state: ActivityState;

  // Timing
  scheduledStart: Date;
  scheduledEnd: Date;
  actualStart?: Date;
  actualEnd?: Date;

  // Location
  arrivedAt?: Date;
  departedAt?: Date;

  // Extensions & modifications
  extendedBy?: number; // minutes
  shortenedBy?: number; // minutes

  // User feedback
  rating?: number; // 1-5
  notes?: string;
  photos?: string[];

  // Completion metadata
  completionType?: "natural" | "forced" | "early";
  skipReason?: string;
  deferredTo?: { dayNumber: number; slotId?: string };
  replacedWith?: string; // activityId
}

// ============================================
// DAY PROGRESS TYPES
// ============================================

/**
 * Commute information for progress tracking (simplified)
 * Use StructuredCommuteInfo for full commute details
 */
export interface CommuteInfo {
  durationMinutes: number;
  distanceMeters?: number;
  mode: string;
}

/**
 * Progress through the current day's schedule
 */
export interface DayProgress {
  completedActivities: number;
  totalActivities: number;
  completedDuration: number; // minutes
  remainingDuration: number; // minutes
  currentDelay: number; // minutes behind schedule (negative = ahead)
  percentComplete: number; // 0-100
}

/**
 * Preview of an upcoming activity
 */
export interface ActivityPreview {
  slotId: string;
  name: string;
  scheduledStart: string;
  scheduledEnd: string;
  commuteInfo?: CommuteInfo;
  departureTime?: string;
  eta?: string;
}

// ============================================
// EXECUTION ENGINE STATE
// ============================================

/**
 * Complete state of the execution engine
 */
export interface ExecutionEngineState {
  mode: ExecutionMode;
  tripId: string;
  currentDay: number;
  currentTime: Date;

  // Current activity tracking
  currentActivity: {
    slotId: string;
    state: ActivityState;
    startedAt?: Date;
    expectedEnd?: Date;
    actualEnd?: Date;
    extendedBy?: number; // minutes
  } | null;

  // Next activity preview
  nextActivity: {
    slotId: string;
    slot: SlotWithOptions;
    commuteInfo: StructuredCommuteInfo | undefined;
    departureTime: Date; // When to leave current location
    eta: Date;
  } | null;

  // Day progress
  progress: DayProgress;

  // Active monitors
  monitors: {
    location: boolean;
    weather: boolean;
    closures: boolean;
    transit: boolean;
  };

  // Pending user decisions
  pendingDecisions: PendingDecision[];

  // Notification queue
  notificationQueue: ScheduledNotification[];
}

// ============================================
// DECISION TYPES
// ============================================

/**
 * Type of user decision required
 */
export type DecisionType =
  | "reshuffle_confirmation"
  | "extension_approval"
  | "skip_confirmation"
  | "weather_swap"
  | "closure_alternative"
  | "booking_modification";

/**
 * An option for a pending decision
 */
export interface DecisionOption {
  id: string;
  label: string;
  description?: string;
  impact?: string; // "Saves 30 min"
  recommended?: boolean;
}

/**
 * A pending decision requiring user input
 */
export interface PendingDecision {
  id: string;
  type: DecisionType;
  priority: "low" | "normal" | "high" | "urgent";
  createdAt: Date;
  expiresAt?: Date;

  // Context
  title: string;
  description: string;
  relatedSlotId?: string;

  // Options
  options: DecisionOption[];
  defaultOption?: string;

  // Auto-action
  autoSelectAfter?: number; // seconds
  autoSelectOption?: string;
}

// ============================================
// GEOFENCE TYPES
// ============================================

/**
 * Type of geofence
 */
export type GeofenceType = "activity" | "hotel" | "transit_station" | "custom";

/**
 * A geographic boundary for activity detection
 */
export interface Geofence {
  id: string;
  type: GeofenceType;
  center: Coordinates;
  radius: number; // meters
  activitySlotId?: string;
  activityName?: string;
}

/**
 * Events triggered by geofence interactions
 */
export interface GeofenceEvent {
  type: "enter" | "exit" | "dwell";
  geofenceId: string;
  geofence: Geofence;
  timestamp: Date;
  dwellDuration?: number; // seconds, for dwell events
}

// ============================================
// NOTIFICATION TYPES
// ============================================

/**
 * Types of notifications during execution
 */
export type NotificationType =
  // Time-based
  | "morning_briefing"           // Daily overview
  | "departure_reminder"         // Time to leave for next activity
  | "activity_starting"          // Activity about to start
  | "running_late"               // Detected delay
  | "activity_ending"            // Activity scheduled to end soon
  | "day_summary"                // End of day recap

  // Location-based
  | "arrived_at_activity"        // Geofence entry detected
  | "left_activity"              // Geofence exit detected
  | "wrong_direction"            // User heading away from next activity

  // External triggers
  | "weather_change"             // Weather impacting plans
  | "closure_detected"           // Venue closed
  | "transit_delay"              // Transport disruption

  // Suggestions
  | "nearby_suggestion"          // Interesting place nearby
  | "photo_opportunity"          // Good lighting/view for photos
  | "less_crowded_now"           // Activity has low crowds now
  | "booking_reminder"           // Reminder about reservation

  // User well-being
  | "take_a_break"               // Suggest rest
  | "hydration_reminder"         // Hot weather
  | "meal_time"                  // Haven't eaten

  // System
  | "battery_warning"            // Low phone battery
  | "offline_mode"               // Lost connectivity
  | "sync_complete";             // Changes synced

/**
 * Action button for a notification
 */
export interface NotificationAction {
  id: string;
  label: string;
  type: "primary" | "secondary" | "destructive";
}

/**
 * A scheduled notification
 */
export interface ScheduledNotification {
  id: string;
  type: NotificationType;
  scheduledTime: Date;
  title: string;
  body: string;
  priority: "low" | "normal" | "high" | "urgent";

  // Context
  relatedSlotId?: string;
  relatedActivityName?: string;
  actionRequired: boolean;

  // Actions
  actions?: NotificationAction[];

  // Auto-dismiss
  autoExpireAt?: Date;
  dismissed?: boolean;
}

// ============================================
// MORNING BRIEFING TYPES
// ============================================

/**
 * Weather summary for briefing
 */
export interface BriefingWeather {
  summary: string; // "Sunny, 24°C, perfect for outdoor activities!"
  icon: string;
  recommendation?: string; // "Bring sunscreen"
}

/**
 * First activity info for briefing
 */
export interface BriefingFirstActivity {
  name: string;
  time: string;
  travelTime: number; // minutes from hotel
}

/**
 * Booking reminder for briefing
 */
export interface BriefingBooking {
  name: string;
  time: string;
  confirmationNeeded: boolean;
}

/**
 * Complete morning briefing data
 */
export interface MorningBriefing {
  tripId: string;
  dayNumber: number;
  date: string;

  // Overview
  greeting: string; // "Good morning! Day 3 in Tokyo"
  dayTitle: string; // "Culture & Food Tour"

  // Weather
  weather?: BriefingWeather;

  // Today's plan
  highlights: string[]; // Top 3 activities
  totalActivities: number;
  firstActivity: BriefingFirstActivity;

  // Bookings
  bookingsToday: BriefingBooking[];

  // Tips
  tips: string[];
}

// ============================================
// DAY SUMMARY TYPES
// ============================================

/**
 * Summary of an activity for end-of-day recap
 */
export interface ActivitySummary {
  slotId: string;
  name: string;
  status: "completed" | "skipped" | "extended" | "shortened";
  scheduledDuration: number;
  actualDuration?: number;
  rating?: number;
}

/**
 * End of day summary
 */
export interface DaySummary {
  tripId: string;
  dayNumber: number;
  date: string;

  // Stats
  activitiesCompleted: number;
  activitiesSkipped: number;
  totalTimeSpent: number; // minutes
  totalDistanceWalked?: number; // meters

  // Activity breakdown
  activities: ActivitySummary[];

  // Tomorrow preview
  tomorrowHighlight?: string;
  tomorrowFirstActivity?: BriefingFirstActivity;
}

// ============================================
// TIME EXTENSION TYPES
// ============================================

/**
 * Request to extend an activity
 */
export interface TimeExtensionRequest {
  slotId: string;
  requestedExtension: number; // minutes
  reason?: string;
}

/**
 * Impact of extending an activity
 */
export interface TimeExtensionImpact {
  nextActivityAffected: boolean;
  nextActivityNewStart?: string;
  activitiesShortened: string[];
  activitiesSkipped: string[];
  bookingsAtRisk: string[];
}

/**
 * Result of extension calculation
 */
export interface TimeExtensionResult {
  success: boolean;
  appliedExtension: number;

  // Impact
  impact: TimeExtensionImpact;

  // Options if full extension not possible
  alternatives?: {
    availableExtension: number;
    sacrifices: string[]; // What we'd have to skip
  };

  message: string;
}

// ============================================
// LOCATION TRACKING TYPES
// ============================================

/**
 * Current user location
 */
export interface UserLocation {
  coordinates: Coordinates;
  accuracy: number; // meters
  timestamp: Date;
  speed?: number; // m/s
  heading?: number; // degrees
}

/**
 * Location tracker configuration
 */
export interface LocationTrackerConfig {
  highAccuracyMode: boolean;
  updateInterval: number; // milliseconds
  significantChangeThreshold: number; // meters
  batteryOptimization: boolean;
}

// ============================================
// COMPLETED/SKIPPED ACTIVITY TYPES
// ============================================

/**
 * A completed activity record
 */
export interface CompletedActivity {
  slotId: string;
  slot: SlotWithOptions;
  startedAt: Date;
  completedAt: Date;
  actualDuration: number;
  rating?: number;
  notes?: string;
  photos?: string[];
}

/**
 * A skipped activity record
 */
export interface SkippedActivity {
  slotId: string;
  slot: SlotWithOptions;
  skippedAt: Date;
  reason?: string;
  deferredTo?: { dayNumber: number; slotId?: string };
}

// ============================================
// RESHUFFLING POLICY TYPES
// ============================================

/**
 * Policy for automatic reshuffling
 */
export interface ReshufflingPolicy {
  // Auto-apply rules
  autoApply: {
    enabled: boolean;
    maxDelayMinutes: number; // Auto-apply for delays up to this
    onlyBufferCompression: boolean; // Only auto-apply non-destructive changes
    notifyUser: boolean; // Notify even if auto-applied
    allowUndo: boolean;
  };

  // Manual confirmation required
  requireConfirmation: {
    skipActivity: boolean;
    bookingModification: boolean;
    dayRescheduling: boolean;
    emergencyReroute: boolean;
  };

  // Smart suggestions
  suggestions: {
    proactiveWeatherSwap: boolean;
    crowdAvoidance: boolean;
    photoOpportunities: boolean;
  };
}

/**
 * Default reshuffling policy
 */
export const DEFAULT_RESHUFFLING_POLICY: ReshufflingPolicy = {
  autoApply: {
    enabled: true,
    maxDelayMinutes: 15,
    onlyBufferCompression: true,
    notifyUser: true,
    allowUndo: true,
  },
  requireConfirmation: {
    skipActivity: true,
    bookingModification: true,
    dayRescheduling: true,
    emergencyReroute: true,
  },
  suggestions: {
    proactiveWeatherSwap: true,
    crowdAvoidance: true,
    photoOpportunities: true,
  },
};

// ============================================
// EXECUTION EVENTS
// ============================================

/**
 * Events emitted during execution
 */
export type ExecutionEvent =
  | { type: "TRIP_STARTED"; tripId: string; startDate: string }
  | { type: "DAY_STARTED"; dayNumber: number }
  | { type: "ACTIVITY_STATE_CHANGED"; slotId: string; from: ActivityState; to: ActivityState; trigger: TransitionTrigger }
  | { type: "LOCATION_UPDATED"; location: UserLocation }
  | { type: "GEOFENCE_ENTERED"; geofenceId: string; slotId?: string }
  | { type: "GEOFENCE_EXITED"; geofenceId: string; slotId?: string }
  | { type: "DELAY_DETECTED"; delayMinutes: number }
  | { type: "RESHUFFLE_APPLIED"; changes: string[] }
  | { type: "RESHUFFLE_UNDONE"; undoToken: string }
  | { type: "NOTIFICATION_SENT"; notificationId: string }
  | { type: "DECISION_REQUIRED"; decision: PendingDecision }
  | { type: "DECISION_MADE"; decisionId: string; choice: string }
  | { type: "DAY_ENDED"; summary: DaySummary }
  | { type: "TRIP_ENDED"; tripId: string };

// ============================================
// EXECUTION STORE STATE
// ============================================

/**
 * Complete execution store state (for Zustand)
 */
export interface ExecutionStoreState {
  // Core state
  tripId: string | null;
  mode: ExecutionMode;

  // Current day
  currentDay: {
    dayNumber: number;
    date: string;
    day: DayWithOptions;
    activities: Map<string, ActivityExecution>;
  } | null;

  // Progress
  progress: {
    completed: CompletedActivity[];
    skipped: SkippedActivity[];
    currentActivity: ActivityExecution | null;
    upcomingActivities: ActivityExecution[];
  };

  // Tracking
  tracking: {
    location: UserLocation | null;
    lastLocationUpdate: Date | null;
    geofences: Geofence[];
    activeGeofenceId: string | null;
  };

  // Notifications
  notifications: {
    scheduled: ScheduledNotification[];
    active: ScheduledNotification[];
    dismissed: string[];
  };

  // Decisions
  decisions: {
    pending: PendingDecision[];
    history: { decision: PendingDecision; choice: string; timestamp: Date }[];
  };

  // Reshuffling
  reshuffling: {
    enabled: boolean;
    policy: ReshufflingPolicy;
  };

  // Settings
  settings: {
    locationTracking: boolean;
    notifications: boolean;
    autoReshuffle: boolean;
    quietHoursStart: string; // "22:00"
    quietHoursEnd: string; // "08:00"
  };
}

// ============================================
// QUICK ACTIONS
// ============================================

/**
 * Quick action available during execution
 */
export interface QuickAction {
  id: string;
  icon: string;
  label: string;
  available: boolean;
}

/**
 * Standard quick actions for execution mode
 */
export const EXECUTION_QUICK_ACTIONS: QuickAction[] = [
  { id: "extend", icon: "⏱️", label: "Extend Time", available: true },
  { id: "done", icon: "✓", label: "Done", available: true },
  { id: "skip", icon: "⏭️", label: "Skip", available: true },
  { id: "navigate", icon: "🗺️", label: "Navigate", available: true },
  { id: "tips", icon: "💡", label: "Tips", available: true },
  { id: "photos", icon: "📸", label: "Photo Spots", available: true },
  { id: "help", icon: "🆘", label: "Need Help", available: true },
  { id: "pause", icon: "⏸️", label: "Take Break", available: true },
];

// ============================================
// SCHEDULE STATUS
// ============================================

/**
 * Overall schedule status
 */
export type ScheduleStatus = "on_track" | "minor_delay" | "needs_attention" | "critical";

/**
 * Calculate schedule status from delay
 */
export function getScheduleStatus(delayMinutes: number): ScheduleStatus {
  if (delayMinutes <= 5) return "on_track";
  if (delayMinutes <= 15) return "minor_delay";
  if (delayMinutes <= 30) return "needs_attention";
  return "critical";
}
