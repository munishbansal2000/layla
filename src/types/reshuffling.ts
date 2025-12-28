// ============================================
// REAL-TIME RESHUFFLING - TYPE DEFINITIONS
// ============================================
// Based on: docs/REALTIME_RESHUFFLING_ALGORITHM.md
// Implements Phase 1: Core Reshuffling Infrastructure

import {
  CoreActivity,
  RestaurantActivity,
  ScoredActivity,
  WeatherForecast,
  Coordinates,
} from "./activity-suggestion";
import { DaySchedule, ScheduledActivity } from "@/lib/schedule-builder";

// ============================================
// TRIGGER TYPES
// ============================================

/**
 * Types of events that can trigger reshuffling
 */
export type TriggerType =
  | "running_late"
  | "weather_change"
  | "closure"
  | "transport_delay"
  | "user_state"
  | "user_request";

/**
 * Severity of the trigger event
 */
export type TriggerSeverity = "low" | "medium" | "high" | "critical";

/**
 * Source of trigger detection
 */
export type TriggerSource =
  | "location"
  | "api"
  | "user_input"
  | "prediction"
  | "weather_service"
  | "places_api";

/**
 * User-reported state
 */
export type UserState =
  | "slight_tired"
  | "very_tired"
  | "need_break"
  | "done_for_day"
  | "sick"
  | "energized"
  | "running_late"
  | "early";

/**
 * Weather condition that triggered a change
 */
export interface WeatherTriggerContext {
  previousCondition: string;
  newCondition: string;
  precipitationProbability: number;
  temperature: number;
  forecast: WeatherForecast;
}

/**
 * Closure context for a venue
 */
export interface ClosureTriggerContext {
  venueName: string;
  venueId: string;
  closureReason?: string;
  closureType: "temporary" | "permanent" | "private_event" | "holiday" | "unknown";
  reopensAt?: string;
}

/**
 * Transport delay context
 */
export interface TransportTriggerContext {
  originalDuration: number;
  newDuration: number;
  delayMinutes: number;
  affectedRoute?: string;
  alternativeRoutes?: string[];
}

/**
 * A trigger event that initiates reshuffling
 */
export interface TriggerEvent {
  id: string;
  type: TriggerType;
  severity: TriggerSeverity;
  detectedAt: Date;
  source: TriggerSource;

  // Specific context based on trigger type
  context: {
    delayMinutes?: number;
    weatherContext?: WeatherTriggerContext;
    closureContext?: ClosureTriggerContext;
    transportContext?: TransportTriggerContext;
    userState?: UserState;
    userMessage?: string;
  };

  // Affected activities
  affectedSlotIds: string[];
}

// ============================================
// IMPACT ANALYSIS TYPES
// ============================================

/**
 * Type of impact on an activity
 */
export type ImpactType =
  | "delayed"
  | "shortened"
  | "impossible"
  | "degraded"
  | "at_risk";

/**
 * Cascade level for impact
 */
export type CascadeLevel =
  | "isolated"
  | "partial_day"
  | "rest_of_day"
  | "multi_day";

/**
 * Urgency level for response
 */
export type UrgencyLevel = "immediate" | "within_hour" | "today" | "future";

/**
 * Risk level for a booking
 */
export type BookingRiskLevel = "safe" | "tight" | "at_risk" | "will_miss";

/**
 * Analysis of impact on a single activity
 */
export interface AffectedActivity {
  slotId: string;
  activity: ScheduledActivity;
  impactType: ImpactType;
  impactSeverity: number; // 0-100
  canRecover: boolean;
  recoveryOptions: RecoveryOption[];
  newStartTime?: string;
  newEndTime?: string;
  shortenedBy?: number; // minutes
}

/**
 * Analysis of risk to a booking
 */
export interface BookingRisk {
  slotId: string;
  bookingType: "reservation" | "ticket" | "tour";
  riskLevel: BookingRiskLevel;
  latestArrivalTime: string;
  currentETA: string;
  bufferMinutes: number;
  cancellationDeadline?: string;
  refundable: boolean;
  cancellationFee?: number;
}

/**
 * Recovery option for an affected activity
 */
export interface RecoveryOption {
  type: "compress" | "skip" | "swap" | "defer" | "shorten";
  description: string;
  timeSaved: number; // minutes
  tradeoff?: string;
}

/**
 * Complete impact analysis result
 */
export interface ImpactAnalysis {
  triggerId: string;
  analyzedAt: Date;
  affectedActivities: AffectedActivity[];
  bookingsAtRisk: BookingRisk[];
  cascadeEffect: CascadeLevel;
  urgency: UrgencyLevel;
  totalDelayMinutes: number;
  canAutoResolve: boolean;
  summary: string;
}

// ============================================
// RESHUFFLING STRATEGY TYPES
// ============================================

/**
 * Available reshuffling strategies
 */
export type ReshuffleStrategy =
  | "compress_buffer"
  | "shorten_activity"
  | "skip_activity"
  | "swap_order"
  | "replace_activity"
  | "split_group"
  | "defer_to_tomorrow"
  | "cancel_gracefully"
  | "emergency_reroute"
  | "no_action";

/**
 * A change made to the schedule
 */
export interface ScheduleChange {
  id: string;
  type:
    | "time_shift"
    | "duration_change"
    | "activity_removed"
    | "activity_added"
    | "activity_replaced"
    | "order_swap"
    | "day_moved";
  slotId: string;
  activityName: string;
  description: string;
  before: {
    startTime?: string;
    endTime?: string;
    duration?: number;
    activityId?: string;
    dayNumber?: number;
  };
  after: {
    startTime?: string;
    endTime?: string;
    duration?: number;
    activityId?: string;
    dayNumber?: number;
  };
}

/**
 * Result of applying a reshuffling strategy
 */
export interface ReshuffleResult {
  id: string;
  triggerId: string;
  strategy: ReshuffleStrategy;
  changes: ScheduleChange[];
  explanation: string;
  confidence: number; // 0-1
  alternatives: ReshuffleResult[];

  // User action
  requiresConfirmation: boolean;
  autoApplyIn?: number; // seconds before auto-applying

  // Metrics
  timeSavedMinutes: number;
  bookingsProtected: number;
  activitiesAffected: number;

  // Undo support
  undoToken: string;
  canUndo: boolean;
}

// ============================================
// TRIP EXECUTION STATE
// ============================================

/**
 * Current location of the user
 */
export interface UserLocation {
  coordinates: Coordinates;
  accuracy: number; // meters
  lastUpdated: Date;
  heading?: number;
  speed?: number; // m/s
}

/**
 * Activity completion status
 */
export interface CompletedActivity {
  slotId: string;
  activity: ScheduledActivity;
  startedAt: Date;
  completedAt: Date;
  actualDuration: number;
  rating?: number;
  notes?: string;
}

/**
 * Activity that was skipped
 */
export interface SkippedActivity {
  slotId: string;
  activity: ScheduledActivity;
  skippedAt: Date;
  reason: string;
  deferredTo?: {
    dayNumber: number;
    slotId?: string;
  };
}

/**
 * Activity currently in progress
 */
export interface InProgressActivity {
  slotId: string;
  activity: ScheduledActivity;
  startedAt: Date;
  expectedEnd: Date;
  extendedBy?: number; // minutes
}

/**
 * A reshuffle event in history (for undo)
 */
export interface ReshuffleEvent {
  id: string;
  triggeredAt: Date;
  trigger: TriggerEvent;
  strategyUsed: ReshuffleStrategy;
  changesMade: ScheduleChange[];
  previousSchedule: DaySchedule;
  newSchedule: DaySchedule;
  userConfirmed: boolean;
  undoAvailable: boolean;
  undoneAt?: Date;
}

/**
 * Schedule status
 */
export type ScheduleStatus =
  | "on_track"
  | "minor_delay"
  | "needs_attention"
  | "critical";

/**
 * Complete trip execution state
 */
export interface TripExecutionState {
  tripId: string;
  currentDay: number;
  currentTime: Date;

  // Location tracking
  userLocation?: UserLocation;

  // Schedule state
  schedule: {
    planned: DaySchedule[];
    currentDaySchedule: DaySchedule;
  };

  // Activity tracking
  activities: {
    completed: CompletedActivity[];
    skipped: SkippedActivity[];
    inProgress?: InProgressActivity;
  };

  // Status
  status: ScheduleStatus;
  delayMinutes: number;

  // Reshuffle history (for undo)
  reshuffleHistory: ReshuffleEvent[];

  // Pending triggers
  pendingTriggers: TriggerEvent[];
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

/**
 * Request to check for triggers
 */
export interface CheckTriggersRequest {
  tripId: string;
  currentLocation?: Coordinates;
  currentTime: string;
  userReportedIssue?: string;
  userState?: UserState;
}

/**
 * Response from trigger check
 */
export interface CheckTriggersResponse {
  triggersDetected: TriggerEvent[];
  suggestedActions: ReshuffleResult[];
  scheduleStatus: ScheduleStatus;
  nextCheckIn: number; // milliseconds
  summary?: string;
}

/**
 * Request to apply a reshuffle
 */
export interface ApplyReshuffleRequest {
  tripId: string;
  triggerId: string;
  selectedStrategy: ReshuffleStrategy;
  selectedOption?: string;
  customInput?: {
    skipActivityId?: string;
    replacementActivityId?: string;
    newTime?: string;
    deferToDay?: number;
  };
}

/**
 * Response from applying a reshuffle
 */
export interface ApplyReshuffleResponse {
  success: boolean;
  updatedSchedule: DaySchedule;
  changes: ScheduleChange[];
  undoToken: string;
  message: string;
  bookingsProtected?: string[];
}

/**
 * Request to undo a reshuffle
 */
export interface UndoReshuffleRequest {
  tripId: string;
  undoToken: string;
}

/**
 * Response from undoing a reshuffle
 */
export interface UndoReshuffleResponse {
  success: boolean;
  restoredSchedule: DaySchedule;
  message: string;
}

/**
 * Request for alternative activities
 */
export interface GetAlternativesRequest {
  tripId: string;
  forActivityId: string;
  slotId: string;
  reason: "closed" | "weather" | "user_preference" | "time_constraint";
  maxResults?: number;
}

/**
 * Alternative activity suggestion
 */
export interface AlternativeActivity {
  activity: ScoredActivity;
  matchScore: number;
  distance: number; // meters
  travelTime: number; // minutes
  whyRecommended: string;
  canBookNow: boolean;
  scheduleFit: "perfect" | "good" | "tight" | "overflow";
}

/**
 * Response with alternative activities
 */
export interface GetAlternativesResponse {
  originalActivity: CoreActivity | RestaurantActivity;
  alternatives: AlternativeActivity[];
  reason: string;
}

// ============================================
// RESHUFFLE CONFIGURATION
// ============================================

/**
 * Configuration for reshuffling behavior
 */
export interface ReshuffleConfig {
  // Delay thresholds (minutes)
  thresholds: {
    silentBuffer: number; // Absorb without notification
    notifyUser: number; // Notify but don't force action
    suggestReshuffle: number; // Suggest changes
    autoReshuffle: number; // Automatically apply changes
  };

  // Booking protection
  bookingProtection: {
    enabled: boolean;
    minimumBuffer: number; // minutes before booking
    prioritizeRefundable: boolean;
  };

  // Weather sensitivity
  weather: {
    rainProbabilityThreshold: number; // 0-100
    temperatureChangeThreshold: number; // degrees
    checkIntervalMinutes: number;
  };

  // Auto-apply settings
  autoApply: {
    enabled: boolean;
    maxWaitSeconds: number;
    onlyForLowImpact: boolean;
  };

  // Undo settings
  undo: {
    maxHistorySize: number;
    expiryMinutes: number;
  };
}

/**
 * Default reshuffling configuration
 */
export const DEFAULT_RESHUFFLE_CONFIG: ReshuffleConfig = {
  thresholds: {
    silentBuffer: 10,
    notifyUser: 15,
    suggestReshuffle: 30,
    autoReshuffle: 60,
  },
  bookingProtection: {
    enabled: true,
    minimumBuffer: 15,
    prioritizeRefundable: true,
  },
  weather: {
    rainProbabilityThreshold: 70,
    temperatureChangeThreshold: 10,
    checkIntervalMinutes: 30,
  },
  autoApply: {
    enabled: false,
    maxWaitSeconds: 30,
    onlyForLowImpact: true,
  },
  undo: {
    maxHistorySize: 10,
    expiryMinutes: 120,
  },
};

// ============================================
// ACTIVITY FLEXIBILITY METADATA
// ============================================

/**
 * How flexible an activity is for reshuffling
 */
export interface ActivityFlexibility {
  canShorten: boolean;
  minDuration: number; // minimum viable duration in minutes
  maxShortenPercent: number; // max percentage reduction
  canSkip: boolean;
  skipPriority: number; // higher = harder to skip (0-100)
  canSwapWith: string[]; // IDs of activities that can swap
  canDefer: boolean;
  deferDays: number; // max days to defer
  hasBooking: boolean;
  bookingFlexibility?: {
    canReschedule: boolean;
    cancellationDeadline?: string;
    refundable: boolean;
  };
}

/**
 * Default flexibility by activity category
 */
export const DEFAULT_FLEXIBILITY: Record<string, Partial<ActivityFlexibility>> = {
  museum: { canShorten: true, maxShortenPercent: 30, canSkip: true, skipPriority: 40 },
  park: { canShorten: true, maxShortenPercent: 50, canSkip: true, skipPriority: 30 },
  restaurant: { canShorten: false, maxShortenPercent: 10, canSkip: false, skipPriority: 70 },
  temple: { canShorten: true, maxShortenPercent: 30, canSkip: true, skipPriority: 35 },
  show: { canShorten: false, maxShortenPercent: 0, canSkip: false, skipPriority: 90 },
  tour: { canShorten: false, maxShortenPercent: 0, canSkip: false, skipPriority: 85 },
  viewpoint: { canShorten: true, maxShortenPercent: 60, canSkip: true, skipPriority: 25 },
  neighborhood: { canShorten: true, maxShortenPercent: 50, canSkip: true, skipPriority: 35 },
  landmark: { canShorten: true, maxShortenPercent: 40, canSkip: true, skipPriority: 45 },
};
