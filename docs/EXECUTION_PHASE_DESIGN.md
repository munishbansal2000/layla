# Itinerary Execution Phase Design

---

## EXECUTIVE SUMMARY

The **Execution Phase** is when the user is actively on their trip, following the itinerary in real-time. This transforms Layla from a planning tool into an **active travel companion**. The execution phase bridges the gap between the static itinerary created during planning and the dynamic reality of travel.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  PLANNING PHASE                         EXECUTION PHASE                     │
│  ══════════════                         ═══════════════                     │
│                                                                             │
│  "What should I do?"                    "You're at [X], do [Y] next"        │
│  "Build my itinerary"                   "You're running late, here's        │
│  "Add this activity"                     what to adjust"                    │
│                                         "The weather changed, swap          │
│                                          outdoor activities"                │
│                                                                             │
│  ┌─────────────┐                        ┌─────────────┐                     │
│  │  ITINERARY  │ ─── Trip Starts ────▶ │  EXECUTION  │                     │
│  │   CREATED   │                        │   ENGINE    │                     │
│  └─────────────┘                        └─────────────┘                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Table of Contents

1. [Core Concepts](#core-concepts)
2. [Execution State Machine](#execution-state-machine)
3. [Activity Lifecycle](#activity-lifecycle)
4. [Real-Time Tracking](#real-time-tracking)
5. [Proactive Notifications](#proactive-notifications)
6. [User Interactions](#user-interactions)
7. [Integration with Reshuffling](#integration-with-reshuffling)
8. [Data Structures](#data-structures)
9. [API Design](#api-design)
10. [UI/UX Considerations](#uiux-considerations)
11. [Implementation Plan](#implementation-plan)

---

## Core Concepts

### 1. Trip Lifecycle States

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                          TRIP LIFECYCLE                                     │
│                          ══════════════                                     │
│                                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │ PLANNING │───▶│  READY   │───▶│ EXECUTING│───▶│ COMPLETED│              │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘              │
│       │               │               │               │                     │
│       ▼               ▼               ▼               ▼                     │
│  • Creating       • Finalized     • On trip       • Trip ended             │
│    itinerary      • Bookings      • Real-time     • Memories               │
│  • Adding           confirmed       tracking        saved                  │
│    activities     • Ready to      • Reshuffling   • Reviews                │
│  • Adjusting        start           active          prompted               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2. Day Execution States

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                          DAY STATES                                         │
│                          ══════════                                         │
│                                                                             │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐              │
│  │  FUTURE  │───▶│  TODAY   │───▶│ COMPLETED│───▶│ ARCHIVED │              │
│  └──────────┘    └──────────┘    └──────────┘    └──────────┘              │
│                       │                                                     │
│                       ▼                                                     │
│              ┌─────────────────┐                                            │
│              │   ACTIVE DAY    │                                            │
│              │   SUBSTATES     │                                            │
│              └────────┬────────┘                                            │
│                       │                                                     │
│    ┌─────────────────┬┴┬─────────────────┬─────────────────┐               │
│    ▼                 ▼ ▼                 ▼                 ▼               │
│ ┌──────┐         ┌──────┐          ┌──────────┐      ┌──────────┐          │
│ │ WAKE │         │ACTIVE│          │ WINDING  │      │  ENDED   │          │
│ │  UP  │────────▶│      │─────────▶│   DOWN   │─────▶│          │          │
│ └──────┘         └──────┘          └──────────┘      └──────────┘          │
│                                                                             │
│ 06:00-09:00      09:00-21:00        21:00-23:00       23:00+               │
│ Pre-trip         Full execution     Wrapping up       Day closed           │
│ briefing         mode               notifications                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 3. Activity Execution States

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                    ACTIVITY LIFECYCLE                                       │
│                    ══════════════════                                       │
│                                                                             │
│   ┌──────────┐                                                              │
│   │ UPCOMING │  Activity is in the future, not yet actionable              │
│   └────┬─────┘                                                              │
│        │                                                                    │
│        │ Time approaches (30 min before)                                    │
│        ▼                                                                    │
│   ┌──────────┐                                                              │
│   │  PENDING │  Time to prepare, commute notification sent                 │
│   └────┬─────┘                                                              │
│        │                                                                    │
│        │ User starts commute or activity                                    │
│        ▼                                                                    │
│   ┌──────────┐                                                              │
│   │ EN ROUTE │  User is traveling to the activity                          │
│   └────┬─────┘                                                              │
│        │                                                                    │
│        │ User arrives at location                                           │
│        ▼                                                                    │
│   ┌──────────┐                                                              │
│   │ ARRIVED  │  At venue, ready to start or waiting                        │
│   └────┬─────┘                                                              │
│        │                                                                    │
│        │ User checks in / starts activity                                   │
│        ▼                                                                    │
│   ┌────────────┐                                                            │
│   │ IN PROGRESS│  Actively doing the activity                              │
│   └────┬───────┘                                                            │
│        │                                                                    │
│        ├───────────────────┐                                                │
│        │                   │ Extended time                                  │
│        │                   ▼                                                │
│        │              ┌──────────┐                                          │
│        │              │ EXTENDED │                                          │
│        │              └────┬─────┘                                          │
│        │                   │                                                │
│        ▼                   ▼                                                │
│   ┌──────────┐                                                              │
│   │ COMPLETED│  Activity finished, moving to next                          │
│   └──────────┘                                                              │
│        │                                                                    │
│        └───────▶ Alternative paths:                                         │
│                  ┌──────────┐                                               │
│                  │ SKIPPED  │  User chose to skip                           │
│                  └──────────┘                                               │
│                  ┌──────────┐                                               │
│                  │ DEFERRED │  Moved to another day                         │
│                  └──────────┘                                               │
│                  ┌──────────┐                                               │
│                  │ REPLACED │  Swapped with alternative                     │
│                  └──────────┘                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Execution State Machine

### ExecutionEngine State Machine

```typescript
/**
 * The Execution Engine is the central coordinator during trip execution.
 * It manages state transitions, triggers events, and coordinates services.
 */

type ExecutionMode =
  | "idle"           // No active trip
  | "briefing"       // Morning briefing mode
  | "active"         // Full execution mode
  | "paused"         // User paused (break, rest)
  | "emergency"      // Emergency mode (illness, major disruption)
  | "winding_down";  // End of day

interface ExecutionEngineState {
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
    activity: ScheduledActivity;
    commuteInfo: CommuteInfo;
    departureTime: Date; // When to leave current location
    eta: Date;
  } | null;

  // Day progress
  progress: {
    completedActivities: number;
    totalActivities: number;
    completedDuration: number; // minutes
    remainingDuration: number; // minutes
    currentDelay: number; // minutes behind schedule
  };

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
```

### State Transitions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                    EXECUTION MODE TRANSITIONS                               │
│                    ══════════════════════════                               │
│                                                                             │
│                           ┌─────────┐                                       │
│                           │  IDLE   │                                       │
│                           └────┬────┘                                       │
│                                │                                            │
│            ┌───────────────────┼───────────────────┐                        │
│            │   Trip Day Starts │   Trip Ends       │                        │
│            ▼                   │                   │                        │
│       ┌──────────┐             │              ┌────┴─────┐                  │
│       │ BRIEFING │─────────────┼─────────────▶│   IDLE   │                  │
│       └────┬─────┘             │              └──────────┘                  │
│            │                   │                   ▲                        │
│            │ Day activities    │                   │                        │
│            │ start             │                   │                        │
│            ▼                   │                   │                        │
│       ┌──────────┐             │                   │                        │
│       │  ACTIVE  │◄────────────┤                   │                        │
│       └────┬─────┘             │                   │                        │
│            │                   │                   │                        │
│   ┌────────┼────────┬──────────┼───────┐           │                        │
│   │        │        │          │       │           │                        │
│   │        │        │          │       │           │                        │
│   │   User │  User  │    End   │ Major │           │                        │
│   │  Break │ Resumes│  of Day  │ Issue │           │                        │
│   ▼        │        ▼          │       ▼           │                        │
│ ┌──────┐   │   ┌──────────┐    │  ┌──────────┐     │                        │
│ │PAUSED│───┘   │ WINDING  │────┼─▶│   IDLE   │     │                        │
│ └──────┘       │   DOWN   │    │  └──────────┘     │                        │
│                └──────────┘    │                   │                        │
│                                │                   │                        │
│                                ▼                   │                        │
│                           ┌──────────┐             │                        │
│                           │EMERGENCY │─────────────┘                        │
│                           └──────────┘                                      │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Activity Lifecycle

### Activity State Machine

```typescript
type ActivityState =
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

interface ActivityExecution {
  slotId: string;
  activity: ScheduledActivity;
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
```

### Activity State Transitions

```typescript
interface ActivityTransition {
  from: ActivityState;
  to: ActivityState;
  trigger: TransitionTrigger;
  guards?: TransitionGuard[];
  actions?: TransitionAction[];
}

type TransitionTrigger =
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

const ACTIVITY_TRANSITIONS: ActivityTransition[] = [
  // Normal flow
  { from: "upcoming", to: "pending", trigger: "time_threshold" },
  { from: "pending", to: "en_route", trigger: "user_check_in" },
  { from: "pending", to: "en_route", trigger: "location_detected" },
  { from: "en_route", to: "arrived", trigger: "location_detected" },
  { from: "arrived", to: "in_progress", trigger: "user_check_in" },
  { from: "in_progress", to: "completed", trigger: "user_check_out" },
  { from: "in_progress", to: "completed", trigger: "time_threshold" },

  // Extensions
  { from: "in_progress", to: "extended", trigger: "time_threshold" },
  { from: "extended", to: "completed", trigger: "user_check_out" },

  // Skip paths
  { from: "upcoming", to: "skipped", trigger: "user_skip" },
  { from: "pending", to: "skipped", trigger: "user_skip" },
  { from: "arrived", to: "skipped", trigger: "user_skip" },

  // Defer paths
  { from: "upcoming", to: "deferred", trigger: "user_defer" },
  { from: "pending", to: "deferred", trigger: "user_defer" },

  // System changes
  { from: "upcoming", to: "replaced", trigger: "system_reshuffle" },
  { from: "pending", to: "replaced", trigger: "external_trigger" },
];
```

---

## Real-Time Tracking

### Location Tracking System

```typescript
interface LocationTracker {
  // Configuration
  config: {
    highAccuracyMode: boolean;
    updateInterval: number; // milliseconds
    significantChangeThreshold: number; // meters
    batteryOptimization: boolean;
  };

  // Current state
  currentLocation: {
    coordinates: Coordinates;
    accuracy: number;
    timestamp: Date;
    speed?: number; // m/s
    heading?: number; // degrees
  } | null;

  // Geofences
  activeGeofences: Geofence[];

  // Methods
  startTracking(): void;
  stopTracking(): void;
  addGeofence(geofence: Geofence): void;
  removeGeofence(id: string): void;
}

interface Geofence {
  id: string;
  type: "activity" | "hotel" | "transit_station" | "custom";
  center: Coordinates;
  radius: number; // meters
  activitySlotId?: string;
  onEnter?: () => void;
  onExit?: () => void;
  onDwell?: (duration: number) => void;
}
```

### Geofence-Based Activity Detection

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                    GEOFENCE ACTIVITY DETECTION                              │
│                    ═══════════════════════════                              │
│                                                                             │
│                                                                             │
│      Hotel Geofence              Activity Geofence         Next Activity    │
│      (250m radius)               (150m radius)             Geofence         │
│                                                                             │
│         ┌─────┐                     ┌─────┐                  ┌─────┐       │
│        ╱       ╲                   ╱       ╲                ╱       ╲      │
│       │    🏨   │                 │    🏯   │              │    🍜   │     │
│       │ Hotel   │                 │ Temple  │              │ Lunch   │     │
│        ╲       ╱                   ╲       ╱                ╲       ╱      │
│         └──┬──┘                     └──┬──┘                  └─────┘       │
│            │                           │                                    │
│            │  EXIT                     │  ENTER                             │
│            │  ────▶                    │  ────▶                             │
│            │                           │                                    │
│            ▼                           ▼                                    │
│     ┌──────────────┐            ┌──────────────┐                            │
│     │ Trigger:     │            │ Trigger:     │                            │
│     │ "en_route"   │            │ "arrived"    │                            │
│     │ state change │            │ state change │                            │
│     └──────────────┘            └──────────────┘                            │
│                                                                             │
│                                                                             │
│     DWELL DETECTION (stayed in geofence > 10 min without check-in)         │
│     ═════════════════════════════════════════════════════════════          │
│                                                                             │
│     If user dwells at activity location > 10 min:                          │
│       → Prompt: "Looks like you're at [Temple]. Start activity?"           │
│       → Auto-detect if user doesn't respond                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Time-Based Progress Tracking

```typescript
interface TimeTracker {
  // Current state
  tripStartDate: Date;
  tripEndDate: Date;
  currentDayNumber: number;
  currentTime: Date;

  // Day tracking
  dayProgress: {
    dayStart: Date;
    dayEnd: Date;
    firstActivityStart: Date;
    lastActivityEnd: Date;
    currentSlotIndex: number;
    totalSlots: number;
  };

  // Timing calculations
  getTimeUntilNextActivity(): number; // minutes
  getTimeRemainingInCurrentActivity(): number; // minutes
  isOnSchedule(): boolean;
  getDelayAmount(): number; // minutes (positive = late, negative = early)

  // Scheduled checks
  scheduledChecks: ScheduledCheck[];
}

interface ScheduledCheck {
  id: string;
  type: "activity_start" | "activity_end" | "departure_reminder" | "day_summary";
  scheduledTime: Date;
  relatedSlotId?: string;
  callback: () => void;
}
```

---

## Proactive Notifications

### Notification Types

```typescript
type NotificationType =
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

interface ScheduledNotification {
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

interface NotificationAction {
  id: string;
  label: string;
  type: "primary" | "secondary" | "destructive";
  action: () => void;
}
```

### Notification Timing Strategy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                    NOTIFICATION TIMING                                      │
│                    ═══════════════════                                      │
│                                                                             │
│  ACTIVITY TIMELINE:                                                         │
│  ════════════════                                                           │
│                                                                             │
│    -60 min    -30 min    -15 min     START        +10 min    END            │
│       │          │          │          │             │         │            │
│       ▼          ▼          ▼          ▼             ▼         ▼            │
│  ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌─────────┐   │
│  │ Weather │ │Departure│ │ "Leave  │ │Activity │ │"Enjoying│ │Activity │   │
│  │ check   │ │reminder │ │ now to  │ │starting │ │ it?"    │ │ ending  │   │
│  │ for     │ │ "Start  │ │  arrive │ │ prompt  │ │ check-in│ │ prompt  │   │
│  │activity │ │preparing│ │  on time│ │         │ │         │ │         │   │
│  └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘ └─────────┘   │
│                                                                             │
│                                                                             │
│  NOTIFICATION BATCHING:                                                     │
│  ═════════════════════                                                      │
│                                                                             │
│  Don't spam! Batch nearby notifications:                                    │
│  • Weather + Departure → Single "Time to go! ☀️ It's sunny out"            │
│  • Multiple tips → Single summary notification                              │
│                                                                             │
│                                                                             │
│  QUIET HOURS:                                                               │
│  ════════════                                                               │
│                                                                             │
│  Reduce notifications:                                                      │
│  • During activities (user is engaged)                                      │
│  • Late evening (21:00+)                                                    │
│  • Early morning (before 08:00)                                             │
│  • When user is resting (detected inactivity)                               │
│                                                                             │
│                                                                             │
│  PRIORITY OVERRIDE:                                                         │
│  ═════════════════                                                          │
│                                                                             │
│  Always send immediately:                                                   │
│  • Booking at risk                                                          │
│  • Severe weather warning                                                   │
│  • Emergency closure                                                        │
│  • Significant delay detected                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Morning Briefing

```typescript
interface MorningBriefing {
  tripId: string;
  dayNumber: number;
  date: string;

  // Overview
  greeting: string; // "Good morning! Day 3 in Tokyo"
  dayTitle: string; // "Culture & Food Tour"

  // Weather
  weather: {
    summary: string; // "Sunny, 24°C, perfect for outdoor activities!"
    icon: string;
    recommendation?: string; // "Bring sunscreen"
  };

  // Today's plan
  highlights: string[]; // Top 3 activities
  totalActivities: number;
  firstActivity: {
    name: string;
    time: string;
    travelTime: number;
  };

  // Bookings
  bookingsToday: {
    name: string;
    time: string;
    confirmationNeeded: boolean;
  }[];

  // Tips
  tips: string[];

  // Quick actions
  actions: {
    viewFullSchedule: () => void;
    adjustPace: () => void;
    skipFirstActivity: () => void;
  };
}
```

---

## User Interactions

### Check-In Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                    ACTIVITY CHECK-IN FLOW                                   │
│                    ═════════════════════                                    │
│                                                                             │
│  1. ARRIVAL DETECTION                                                       │
│  ═══════════════════                                                        │
│                                                                             │
│     ┌─────────────────────────────────┐                                     │
│     │ 📍 Geofence: Arrived at Temple  │                                     │
│     │                                  │                                     │
│     │   "You've arrived at           │                                     │
│     │    Senso-ji Temple"            │                                     │
│     │                                  │                                     │
│     │   [✓ Start Activity]            │                                     │
│     │   [⏰ Starting in 10 min]       │                                     │
│     │   [✕ Skip this]                 │                                     │
│     └─────────────────────────────────┘                                     │
│                                                                             │
│                                                                             │
│  2. QUICK TIPS ON START                                                     │
│  ══════════════════════                                                     │
│                                                                             │
│     ┌─────────────────────────────────┐                                     │
│     │ 🏯 Senso-ji Temple              │                                     │
│     │                                  │                                     │
│     │   ⏱️ Recommended: 90 min        │                                     │
│     │                                  │                                     │
│     │   💡 Tips:                       │                                     │
│     │   • Enter through Kaminari-mon  │                                     │
│     │   • Try the fortune sticks      │                                     │
│     │   • Best photos from the pagoda │                                     │
│     │                                  │                                     │
│     │   📸 Photo spots marked on map  │                                     │
│     │                                  │                                     │
│     │   [Show on Map] [Audio Guide]   │                                     │
│     └─────────────────────────────────┘                                     │
│                                                                             │
│                                                                             │
│  3. DURING ACTIVITY                                                         │
│  ══════════════════                                                         │
│                                                                             │
│     • Timer showing elapsed/remaining                                       │
│     • Quick access to tips & map                                            │
│     • Easy "extend time" button                                             │
│     • Nearby recommendations                                                │
│     • "I'm done early" option                                               │
│                                                                             │
│                                                                             │
│  4. CHECK-OUT PROMPT                                                        │
│  ═══════════════════                                                        │
│                                                                             │
│     ┌─────────────────────────────────┐                                     │
│     │ ⏰ Time's up!                   │                                     │
│     │                                  │                                     │
│     │   How was Senso-ji Temple?      │                                     │
│     │                                  │                                     │
│     │   ⭐⭐⭐⭐⭐ (optional rating)    │                                     │
│     │                                  │                                     │
│     │   [✓ Done, what's next?]        │                                     │
│     │   [+15 min more]                │                                     │
│     │   [+30 min more]                │                                     │
│     └─────────────────────────────────┘                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Time Extension Flow

```typescript
interface TimeExtensionRequest {
  slotId: string;
  requestedExtension: number; // minutes
  reason?: string;
}

interface TimeExtensionResult {
  success: boolean;
  appliedExtension: number;

  // Impact
  impact: {
    nextActivityAffected: boolean;
    nextActivityNewStart?: string;
    activitiesShortened: string[];
    activitiesSkipped: string[];
    bookingsAtRisk: string[];
  };

  // Options if full extension not possible
  alternatives?: {
    availableExtension: number;
    sacrifices: string[]; // What we'd have to skip
  };

  message: string;
}
```

### User Decision Flow

```typescript
interface PendingDecision {
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

type DecisionType =
  | "reshuffle_confirmation"
  | "extension_approval"
  | "skip_confirmation"
  | "weather_swap"
  | "closure_alternative"
  | "booking_modification";

interface DecisionOption {
  id: string;
  label: string;
  description?: string;
  impact?: string; // "Saves 30 min"
  recommended?: boolean;
  action: () => void;
}
```

---

## Integration with Reshuffling

### Trigger Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                    RESHUFFLING INTEGRATION                                  │
│                    ═══════════════════════                                  │
│                                                                             │
│                                                                             │
│  EXECUTION ENGINE                          RESHUFFLING SERVICE              │
│  ════════════════                          ════════════════════             │
│                                                                             │
│  ┌──────────────────┐                     ┌──────────────────┐              │
│  │ Delay Detected   │─────────────────────▶│ Create Trigger   │              │
│  │ (User 15 min     │                     │ Event            │              │
│  │  behind)         │                     └────────┬─────────┘              │
│  └──────────────────┘                              │                        │
│                                                    ▼                        │
│                                            ┌──────────────────┐             │
│                                            │ Analyze Impact   │             │
│                                            │ - Bookings       │             │
│                                            │ - Cascade        │             │
│                                            │ - Urgency        │             │
│                                            └────────┬─────────┘             │
│                                                     │                       │
│                                                     ▼                       │
│                                            ┌──────────────────┐             │
│                                            │ Select Strategy  │             │
│                                            │ - Compress       │             │
│                                            │ - Shorten        │             │
│                                            │ - Skip           │             │
│                                            └────────┬─────────┘             │
│                                                     │                       │
│                                                     ▼                       │
│  ┌──────────────────┐                     ┌──────────────────┐              │
│  │ Present Decision │◀────────────────────│ Generate Options │              │
│  │ to User          │                     │                  │              │
│  └────────┬─────────┘                     └──────────────────┘              │
│           │                                                                  │
│           │ User selects                                                     │
│           ▼                                                                  │
│  ┌──────────────────┐                     ┌──────────────────┐              │
│  │ Update Schedule  │◀────────────────────│ Apply Changes    │              │
│  │ Update Geofences │                     │ Store Undo       │              │
│  │ Update Notifs    │                     │ History          │              │
│  └──────────────────┘                     └──────────────────┘              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Automatic vs Manual Reshuffling

```typescript
interface ReshufflingPolicy {
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

const DEFAULT_RESHUFFLING_POLICY: ReshufflingPolicy = {
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
```

---

## Data Structures

### Execution Store State

```typescript
interface ExecutionStoreState {
  // Core state
  tripId: string | null;
  mode: ExecutionMode;

  // Current day
  currentDay: {
    dayNumber: number;
    date: string;
    schedule: DaySchedule;
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
    history: ReshuffleEvent[];
    undoStack: ReshuffleEvent[];
  };

  // Settings
  settings: {
    locationTracking: boolean;
    notifications: boolean;
    autoReshuffle: boolean;
    quietHoursStart: string;
    quietHoursEnd: string;
  };
}
```

### Execution Events

```typescript
type ExecutionEvent =
  | { type: "TRIP_STARTED"; tripId: string; startDate: string }
  | { type: "DAY_STARTED"; dayNumber: number }
  | { type: "ACTIVITY_STATE_CHANGED"; slotId: string; from: ActivityState; to: ActivityState }
  | { type: "LOCATION_UPDATED"; location: UserLocation }
  | { type: "GEOFENCE_ENTERED"; geofenceId: string; slotId?: string }
  | { type: "GEOFENCE_EXITED"; geofenceId: string; slotId?: string }
  | { type: "DELAY_DETECTED"; delayMinutes: number }
  | { type: "RESHUFFLE_APPLIED"; result: ReshuffleResult }
  | { type: "RESHUFFLE_UNDONE"; undoToken: string }
  | { type: "NOTIFICATION_SENT"; notificationId: string }
  | { type: "DECISION_REQUIRED"; decision: PendingDecision }
  | { type: "DECISION_MADE"; decisionId: string; choice: string }
  | { type: "DAY_ENDED"; summary: DaySummary }
  | { type: "TRIP_ENDED"; summary: TripSummary };

interface ExecutionEventHandler {
  handle(event: ExecutionEvent): void;
}
```

---

## API Design

### Execution API Endpoints

```typescript
// ============================================
// TRIP EXECUTION CONTROL
// ============================================

/**
 * Start trip execution mode
 */
POST /api/trip/:tripId/execute/start
Request: {
  startFromDay?: number; // Default: 1
  currentLocation?: Coordinates;
}
Response: {
  success: boolean;
  executionState: ExecutionEngineState;
  firstDayBriefing: MorningBriefing;
}

/**
 * Pause execution (break, rest)
 */
POST /api/trip/:tripId/execute/pause
Request: {
  reason: "break" | "rest" | "emergency" | "custom";
  estimatedResumeTime?: string;
}
Response: {
  success: boolean;
  pausedAt: string;
  scheduledResumeReminder?: string;
}

/**
 * Resume execution
 */
POST /api/trip/:tripId/execute/resume
Request: {
  currentLocation?: Coordinates;
  skipToActivity?: string; // slotId to skip to
}
Response: {
  success: boolean;
  currentState: ExecutionEngineState;
  adjustmentsMade?: ScheduleChange[];
}

/**
 * End day execution
 */
POST /api/trip/:tripId/execute/end-day
Request: {
  notes?: string;
  tomorrowAdjustments?: {
    startLater?: boolean;
    skipActivities?: string[];
  };
}
Response: {
  success: boolean;
  daySummary: DaySummary;
  tomorrowPreview?: DayPreview;
}

// ============================================
// ACTIVITY EXECUTION
// ============================================

/**
 * Check in to activity
 */
POST /api/trip/:tripId/activity/:slotId/check-in
Request: {
  location?: Coordinates;
  notes?: string;
}
Response: {
  success: boolean;
  tips: string[];
  estimatedEnd: string;
  nextActivityPreview?: ActivityPreview;
}

/**
 * Check out from activity
 */
POST /api/trip/:tripId/activity/:slotId/check-out
Request: {
  rating?: number;
  notes?: string;
  photos?: string[];
  actualDuration?: number;
}
Response: {
  success: boolean;
  nextActivity?: {
    slotId: string;
    name: string;
    departureTime: string;
    commuteInfo: CommuteInfo;
  };
  scheduleStatus: ScheduleStatus;
}

/**
 * Extend activity time
 */
POST /api/trip/:tripId/activity/:slotId/extend
Request: {
  extensionMinutes: number;
}
Response: TimeExtensionResult;

/**
 * Skip activity
 */
POST /api/trip/:tripId/activity/:slotId/skip
Request: {
  reason?: string;
  deferTo?: { dayNumber: number; preferredTime?: string };
}
Response: {
  success: boolean;
  deferredTo?: { dayNumber: number; slotId: string };
  scheduleUpdated: boolean;
  timeSaved: number;
  nextActivity?: ActivityPreview;
}

// ============================================
// TRACKING
// ============================================

/**
 * Update location
 */
POST /api/trip/:tripId/location
Request: {
  coordinates: Coordinates;
  accuracy: number;
  timestamp: string;
  speed?: number;
  heading?: number;
}
Response: {
  received: boolean;
  geofenceEvents?: GeofenceEvent[];
  nearbyRecommendations?: NearbyRecommendation[];
}

/**
 * Get current status
 */
GET /api/trip/:tripId/execute/status
Response: {
  mode: ExecutionMode;
  currentActivity: ActivityExecution | null;
  nextActivity: ActivityPreview | null;
  progress: DayProgress;
  pendingDecisions: PendingDecision[];
  scheduleStatus: ScheduleStatus;
}

// ============================================
// DECISIONS
// ============================================

/**
 * Respond to a pending decision
 */
POST /api/trip/:tripId/decision/:decisionId
Request: {
  selectedOption: string;
  customInput?: Record<string, unknown>;
}
Response: {
  success: boolean;
  changesApplied: ScheduleChange[];
  updatedSchedule?: DaySchedule;
  message: string;
}

/**
 * Dismiss a decision (if optional)
 */
DELETE /api/trip/:tripId/decision/:decisionId
Response: {
  success: boolean;
  defaultApplied: boolean;
}
```

---

## UI/UX Considerations

### Execution Mode UI States

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                    EXECUTION MODE UI                                        │
│                    ════════════════                                         │
│                                                                             │
│                                                                             │
│  1. MAIN EXECUTION VIEW                                                     │
│  ══════════════════════                                                     │
│                                                                             │
│  ┌───────────────────────────────────────┐                                  │
│  │ Day 3 in Tokyo              ☀️ 24°C  │  ← Header with weather           │
│  ├───────────────────────────────────────┤                                  │
│  │                                       │                                  │
│  │  CURRENT: Senso-ji Temple            │  ← Current activity card         │
│  │  ━━━━━━━━━━━━━━━━━━━━━━━━            │                                  │
│  │  ⏱️ 45 min remaining                 │                                  │
│  │                                       │                                  │
│  │  [Extend +15] [Done] [Tips]          │                                  │
│  │                                       │                                  │
│  ├───────────────────────────────────────┤                                  │
│  │                                       │                                  │
│  │  NEXT: Lunch at Ramen Shop           │  ← Next activity preview        │
│  │  12:30 • 15 min walk                 │                                  │
│  │  [View Directions]                   │                                  │
│  │                                       │                                  │
│  ├───────────────────────────────────────┤                                  │
│  │                                       │                                  │
│  │  ○ 3:00 PM  Tokyo Tower              │  ← Upcoming timeline            │
│  │  ○ 5:30 PM  Shibuya Crossing         │                                  │
│  │  ○ 7:00 PM  Dinner                   │                                  │
│  │                                       │                                  │
│  └───────────────────────────────────────┘                                  │
│                                                                             │
│                                                                             │
│  2. TRANSITION STATES                                                       │
│  ════════════════════                                                       │
│                                                                             │
│  ┌───────────────────────────────────────┐                                  │
│  │       "Time to head to Lunch!"       │  ← Departure prompt              │
│  │                                       │                                  │
│  │           🚶 15 min walk              │                                  │
│  │                                       │                                  │
│  │  [Start Navigation]  [Need 5 min]    │                                  │
│  └───────────────────────────────────────┘                                  │
│                                                                             │
│                                                                             │
│  3. DELAY/RESHUFFLE OVERLAY                                                 │
│  ══════════════════════════                                                 │
│                                                                             │
│  ┌───────────────────────────────────────┐                                  │
│  │ ⚠️ Running 20 min behind              │  ← Delay warning                 │
│  │                                       │                                  │
│  │ I've adjusted your schedule:          │                                  │
│  │ • Shortened museum visit (2h→1.5h)   │                                  │
│  │ • Dinner still at 7:00 PM ✓          │                                  │
│  │                                       │                                  │
│  │ [Looks Good]  [Other Options]  [Undo]│                                  │
│  └───────────────────────────────────────┘                                  │
│                                                                             │
│                                                                             │
│  4. COMPACT MODE (in navigation app)                                        │
│  ═══════════════════════════════════                                        │
│                                                                             │
│  Minimal floating widget:                                                   │
│  ┌─────────────────┐                                                        │
│  │ 🏯 Temple       │                                                        │
│  │ 32 min left     │                                                        │
│  └─────────────────┘                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Quick Actions

```typescript
interface QuickAction {
  id: string;
  icon: string;
  label: string;
  available: boolean;
  action: () => void;
}

const EXECUTION_QUICK_ACTIONS: QuickAction[] = [
  { id: "extend", icon: "⏱️", label: "Extend Time", available: true, action: () => {} },
  { id: "done", icon: "✓", label: "Done", available: true, action: () => {} },
  { id: "skip", icon: "⏭️", label: "Skip", available: true, action: () => {} },
  { id: "navigate", icon: "🗺️", label: "Navigate", available: true, action: () => {} },
  { id: "tips", icon: "💡", label: "Tips", available: true, action: () => {} },
  { id: "photos", icon: "📸", label: "Photo Spots", available: true, action: () => {} },
  { id: "help", icon: "🆘", label: "Need Help", available: true, action: () => {} },
  { id: "pause", icon: "⏸️", label: "Take Break", available: true, action: () => {} },
];
```

---

## Implementation Plan

### Phase 1: Core Execution Engine (Week 1-2)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  PHASE 1: CORE EXECUTION ENGINE                                             │
│  ══════════════════════════════                                             │
│                                                                             │
│  ✅ ExecutionEngine class with state machine                                │
│  ✅ Activity lifecycle management                                           │
│  ✅ Time-based transitions (scheduled checks)                               │
│  ✅ Basic check-in/check-out flows                                          │
│  ✅ Time extension handling                                                  │
│  ✅ Skip/defer activity flows                                                │
│  ✅ Integration with existing ReshufflingService                            │
│  ✅ Execution store (Zustand)                                                │
│                                                                             │
│  DELIVERABLE: User can start trip execution, check in/out of activities,   │
│  extend time, and skip activities with schedule updates.                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 2: Location Tracking (Week 3)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  PHASE 2: LOCATION TRACKING                                                 │
│  ══════════════════════════                                                 │
│                                                                             │
│  ✅ LocationTracker service                                                  │
│  ✅ Geofence management                                                      │
│  ✅ Automatic activity arrival/departure detection                          │
│  ✅ Delay detection based on location                                        │
│  ✅ "En route" state detection                                               │
│  ✅ Battery-efficient tracking                                               │
│  ✅ Offline location buffering                                               │
│                                                                             │
│  DELIVERABLE: App automatically detects when user arrives at/leaves        │
│  activities and updates state accordingly.                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 3: Notifications System (Week 4)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  PHASE 3: NOTIFICATIONS                                                     │
│  ══════════════════════                                                     │
│                                                                             │
│  ✅ Notification scheduling system                                           │
│  ✅ Morning briefing generation                                              │
│  ✅ Departure reminders                                                      │
│  ✅ Activity timing notifications                                            │
│  ✅ Notification batching & quiet hours                                      │
│  ✅ Push notification integration (expo-notifications)                       │
│  ✅ In-app notification center                                               │
│                                                                             │
│  DELIVERABLE: User receives timely, helpful notifications during trip      │
│  execution without being overwhelmed.                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 4: Smart Suggestions (Week 5)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  PHASE 4: SMART SUGGESTIONS                                                 │
│  ══════════════════════════                                                 │
│                                                                             │
│  ✅ Nearby activity suggestions                                              │
│  ✅ Weather-based swap suggestions                                           │
│  ✅ Crowd avoidance suggestions                                              │
│  ✅ Photo opportunity alerts                                                 │
│  ✅ Break/rest suggestions                                                   │
│  ✅ Meal time reminders                                                      │
│  ✅ "You might also like" contextual suggestions                             │
│                                                                             │
│  DELIVERABLE: App proactively suggests improvements to the user's          │
│  experience based on context.                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 5: Decision Flow & Polish (Week 6)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  PHASE 5: DECISION FLOW & POLISH                                            │
│  ═══════════════════════════════                                            │
│                                                                             │
│  ✅ Pending decision management                                              │
│  ✅ Auto-apply with notification                                             │
│  ✅ Undo capability for all changes                                          │
│  ✅ Day summary generation                                                   │
│  ✅ Trip completion flow                                                     │
│  ✅ UI polish for execution mode                                             │
│  ✅ Offline support                                                          │
│  ✅ Sync on reconnect                                                        │
│                                                                             │
│  DELIVERABLE: Complete, polished execution experience that handles          │
│  all edge cases gracefully.                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## File Structure

```
src/
├── lib/
│   ├── execution/
│   │   ├── execution-engine.ts        # Main execution engine
│   │   ├── activity-lifecycle.ts      # Activity state machine
│   │   ├── location-tracker.ts        # Location & geofencing
│   │   ├── notification-scheduler.ts  # Notification management
│   │   ├── morning-briefing.ts        # Daily briefing generation
│   │   ├── day-summary.ts             # End of day summary
│   │   ├── suggestions-engine.ts      # Proactive suggestions
│   │   └── offline-sync.ts            # Offline support
│   │
│   └── reshuffling-service.ts         # (existing) Enhanced with execution
│
├── types/
│   ├── execution.ts                   # Execution phase types
│   └── reshuffling.ts                 # (existing) Enhanced types
│
├── store/
│   └── execution-store.ts             # Zustand store for execution
│
├── hooks/
│   ├── useExecution.ts                # Main execution hook
│   ├── useLocationTracking.ts         # Location tracking hook
│   ├── useNotifications.ts            # Notification hook
│   └── useActivityTimer.ts            # Activity timing hook
│
├── components/
│   └── execution/
│       ├── ExecutionView.tsx          # Main execution UI
│       ├── CurrentActivityCard.tsx    # Current activity display
│       ├── NextActivityPreview.tsx    # Next up preview
│       ├── ActivityTimeline.tsx       # Day timeline
│       ├── CheckInPrompt.tsx          # Check-in modal
│       ├── CheckOutPrompt.tsx         # Check-out modal
│       ├── TimeExtensionModal.tsx     # Extend time modal
│       ├── DecisionModal.tsx          # Pending decision modal
│       ├── MorningBriefing.tsx        # Daily briefing view
│       ├── DaySummary.tsx             # End of day summary
│       ├── NotificationCenter.tsx     # In-app notifications
│       └── QuickActions.tsx           # Quick action buttons
│
└── app/
    └── api/
        └── trip/
            └── [tripId]/
                └── execute/
                    ├── start/route.ts
                    ├── pause/route.ts
                    ├── resume/route.ts
                    ├── end-day/route.ts
                    ├── status/route.ts
                    ├── activity/
                    │   └── [slotId]/
                    │       ├── check-in/route.ts
                    │       ├── check-out/route.ts
                    │       ├── extend/route.ts
                    │       └── skip/route.ts
                    ├── location/route.ts
                    └── decision/
                        └── [decisionId]/route.ts
```

---

## Success Metrics

### Quantitative

| Metric | Target | Measurement |
|--------|--------|-------------|
| Activities completed on time | >70% | Actual end time vs scheduled |
| Check-in rate | >80% | Users checking in to activities |
| Notification interaction rate | >50% | Taps on departure reminders |
| Reshuffle acceptance rate | >75% | Accepted vs dismissed suggestions |
| Day completion rate | >90% | Planned activities completed |
| Extension requests | <30% | Activities extended vs on-time |

### Qualitative

- User feels "guided" through their trip
- Reduced stress when things change
- Confidence that bookings won't be missed
- Seamless transitions between activities
- "Magic" moments from proactive suggestions

---

## Conclusion

The Execution Phase transforms the itinerary from a static plan into a living, adaptive guide. Key principles:

1. **Proactive, not reactive** - Anticipate issues before they happen
2. **Minimal friction** - One-tap actions, smart defaults
3. **Context-aware** - Right notification at the right time
4. **Graceful degradation** - Works offline, syncs when connected
5. **User in control** - Always allow override and undo

This is what makes Layla a **travel companion** rather than just a trip planner.

---

## Verifiable Implementation Steps

Each step below is designed to be:
- **Small**: Max ~200 lines of code
- **Verifiable**: Clear test criteria to detect hallucinations
- **Incremental**: Each builds on the previous

### Step-by-Step Implementation Checklist

---

### STEP 1: Execution Types (src/types/execution.ts)
**Goal**: Define all TypeScript types for the execution phase

**Files to create**:
- `src/types/execution.ts`

**What to implement**:
```typescript
// Types only - no logic
- ExecutionMode (type)
- ActivityState (type)
- TransitionTrigger (type)
- ActivityExecution (interface)
- ExecutionEngineState (interface)
- DayProgress (interface)
- PendingDecision (interface)
- DecisionOption (interface)
- Geofence (interface)
- ScheduledNotification (interface)
- NotificationType (type)
- MorningBriefing (interface)
- DaySummary (interface)
- TimeExtensionRequest (interface)
- TimeExtensionResult (interface)
```

**Verification**:
```bash
# 1. File exists and compiles
npx tsc --noEmit src/types/execution.ts

# 2. Import works in another file
# Create test file that imports all types
```

**Estimated lines**: ~150

---

### STEP 2: Activity State Machine (src/lib/execution/activity-lifecycle.ts)
**Goal**: Pure functions for activity state transitions

**Files to create**:
- `src/lib/execution/activity-lifecycle.ts`

**What to implement**:
```typescript
// Functions
- isValidTransition(from: ActivityState, to: ActivityState): boolean
- getAvailableTransitions(state: ActivityState): ActivityState[]
- transitionActivity(execution: ActivityExecution, trigger: TransitionTrigger): ActivityExecution
- getTimeUntilPending(execution: ActivityExecution, currentTime: Date): number
- shouldAutoTransition(execution: ActivityExecution, currentTime: Date): ActivityState | null
```

**Verification**:
```typescript
// Test file: src/lib/execution/__tests__/activity-lifecycle.test.ts
describe('activity-lifecycle', () => {
  test('upcoming -> pending is valid', () => {
    expect(isValidTransition('upcoming', 'pending')).toBe(true);
  });

  test('completed -> upcoming is invalid', () => {
    expect(isValidTransition('completed', 'upcoming')).toBe(false);
  });

  test('getAvailableTransitions for in_progress', () => {
    const transitions = getAvailableTransitions('in_progress');
    expect(transitions).toContain('completed');
    expect(transitions).toContain('extended');
    expect(transitions).not.toContain('upcoming');
  });
});
```

**Estimated lines**: ~120

---

### STEP 3: Day Progress Calculator (src/lib/execution/day-progress.ts)
**Goal**: Pure functions to calculate day/activity progress

**Files to create**:
- `src/lib/execution/day-progress.ts`

**What to implement**:
```typescript
// Functions
- calculateDayProgress(schedule: DaySchedule, activities: Map<string, ActivityExecution>): DayProgress
- getCompletedActivities(activities: Map<string, ActivityExecution>): ActivityExecution[]
- getUpcomingActivities(activities: Map<string, ActivityExecution>): ActivityExecution[]
- getCurrentActivity(activities: Map<string, ActivityExecution>): ActivityExecution | null
- calculateDelayMinutes(schedule: DaySchedule, activities: Map<string, ActivityExecution>, currentTime: Date): number
- isOnSchedule(delayMinutes: number, threshold: number): boolean
```

**Verification**:
```typescript
// Test file: src/lib/execution/__tests__/day-progress.test.ts
describe('day-progress', () => {
  const mockSchedule = createMockDaySchedule(); // 3 activities

  test('calculates progress with 0 completed', () => {
    const activities = new Map(); // empty
    const progress = calculateDayProgress(mockSchedule, activities);
    expect(progress.completedActivities).toBe(0);
    expect(progress.totalActivities).toBe(3);
  });

  test('calculates delay correctly', () => {
    // Activity scheduled for 10:00, current time 10:30, still not started
    const delay = calculateDelayMinutes(mockSchedule, activities, new Date('2025-01-01T10:30:00'));
    expect(delay).toBe(30);
  });
});
```

**Estimated lines**: ~100

---

### STEP 4: Time Extension Logic (src/lib/execution/time-extension.ts)
**Goal**: Calculate impact of extending an activity

**Files to create**:
- `src/lib/execution/time-extension.ts`

**What to implement**:
```typescript
// Functions
- calculateExtensionImpact(
    schedule: DaySchedule,
    slotId: string,
    extensionMinutes: number
  ): TimeExtensionResult

- getMaxExtension(schedule: DaySchedule, slotId: string): number

- findActivitiesToShorten(
    schedule: DaySchedule,
    slotId: string,
    extensionMinutes: number
  ): { slotId: string; shortenBy: number }[]

- findActivitiesToSkip(
    schedule: DaySchedule,
    slotId: string,
    extensionMinutes: number
  ): string[]
```

**Verification**:
```typescript
// Test file: src/lib/execution/__tests__/time-extension.test.ts
describe('time-extension', () => {
  test('15 min extension with 30 min buffer succeeds', () => {
    const schedule = createScheduleWithBuffer(30); // 30 min gap between activities
    const result = calculateExtensionImpact(schedule, 'slot-1', 15);
    expect(result.success).toBe(true);
    expect(result.appliedExtension).toBe(15);
    expect(result.impact.activitiesSkipped).toHaveLength(0);
  });

  test('60 min extension requires skipping activity', () => {
    const schedule = createScheduleWithBuffer(15);
    const result = calculateExtensionImpact(schedule, 'slot-1', 60);
    expect(result.impact.activitiesSkipped.length).toBeGreaterThan(0);
  });

  test('cannot extend past booking', () => {
    const schedule = createScheduleWithBooking();
    const result = calculateExtensionImpact(schedule, 'slot-1', 120);
    expect(result.impact.bookingsAtRisk).toContain('slot-booking');
  });
});
```

**Estimated lines**: ~150

---

### STEP 5: Execution Store (src/store/execution-store.ts)
**Goal**: Zustand store for execution state

**Files to create**:
- `src/store/execution-store.ts`

**What to implement**:
```typescript
// Zustand store with:
interface ExecutionStore {
  // State
  tripId: string | null;
  mode: ExecutionMode;
  currentDay: { ... } | null;
  activities: Map<string, ActivityExecution>;

  // Actions
  startExecution(tripId: string, schedule: DaySchedule): void;
  stopExecution(): void;
  checkInActivity(slotId: string): void;
  checkOutActivity(slotId: string, rating?: number): void;
  skipActivity(slotId: string, reason?: string): void;
  extendActivity(slotId: string, minutes: number): TimeExtensionResult;
  transitionActivity(slotId: string, trigger: TransitionTrigger): void;
}
```

**Verification**:
```typescript
// Test file: src/store/__tests__/execution-store.test.ts
describe('execution-store', () => {
  beforeEach(() => {
    useExecutionStore.getState().stopExecution();
  });

  test('startExecution sets mode to active', () => {
    const store = useExecutionStore.getState();
    store.startExecution('trip-123', mockSchedule);
    expect(store.mode).toBe('active');
    expect(store.tripId).toBe('trip-123');
  });

  test('checkInActivity transitions to in_progress', () => {
    const store = useExecutionStore.getState();
    store.startExecution('trip-123', mockSchedule);
    store.checkInActivity('slot-1');
    const activity = store.activities.get('slot-1');
    expect(activity?.state).toBe('in_progress');
  });

  test('skipActivity marks as skipped', () => {
    const store = useExecutionStore.getState();
    store.startExecution('trip-123', mockSchedule);
    store.skipActivity('slot-1', 'Not interested');
    const activity = store.activities.get('slot-1');
    expect(activity?.state).toBe('skipped');
    expect(activity?.skipReason).toBe('Not interested');
  });
});
```

**Estimated lines**: ~180

---

### STEP 6: Morning Briefing Generator (src/lib/execution/morning-briefing.ts)
**Goal**: Generate morning briefing from schedule

**Files to create**:
- `src/lib/execution/morning-briefing.ts`

**What to implement**:
```typescript
// Functions
- generateMorningBriefing(
    tripId: string,
    dayNumber: number,
    schedule: DaySchedule,
    weather?: WeatherForecast
  ): MorningBriefing

- generateGreeting(dayNumber: number, city: string): string
- extractHighlights(schedule: DaySchedule, count: number): string[]
- getBookingsForDay(schedule: DaySchedule): { name: string; time: string }[]
- generateTips(schedule: DaySchedule, weather?: WeatherForecast): string[]
```

**Verification**:
```typescript
// Test file: src/lib/execution/__tests__/morning-briefing.test.ts
describe('morning-briefing', () => {
  test('generates greeting with day number and city', () => {
    const briefing = generateMorningBriefing('trip-1', 3, tokyoSchedule);
    expect(briefing.greeting).toContain('Day 3');
    expect(briefing.greeting).toContain('Tokyo');
  });

  test('extracts top 3 highlights', () => {
    const briefing = generateMorningBriefing('trip-1', 1, scheduleWith5Activities);
    expect(briefing.highlights).toHaveLength(3);
  });

  test('includes weather tip when rainy', () => {
    const rainyWeather = { condition: 'rainy', ... };
    const briefing = generateMorningBriefing('trip-1', 1, schedule, rainyWeather);
    expect(briefing.tips.some(t => t.includes('umbrella') || t.includes('rain'))).toBe(true);
  });

  test('identifies first activity correctly', () => {
    const briefing = generateMorningBriefing('trip-1', 1, schedule);
    expect(briefing.firstActivity.name).toBe(schedule.slots[0].activity.activity.name);
  });
});
```

**Estimated lines**: ~120

---

### STEP 7: Notification Scheduler (src/lib/execution/notification-scheduler.ts)
**Goal**: Schedule and manage notifications

**Files to create**:
- `src/lib/execution/notification-scheduler.ts`

**What to implement**:
```typescript
// Functions
- scheduleNotificationsForDay(schedule: DaySchedule): ScheduledNotification[]
- createDepartureReminder(activity: ScheduledActivity, commuteMinutes: number): ScheduledNotification
- createActivityEndingNotification(activity: ScheduledActivity): ScheduledNotification
- filterByQuietHours(notifications: ScheduledNotification[], quietStart: string, quietEnd: string): ScheduledNotification[]
- batchNearbyNotifications(notifications: ScheduledNotification[], windowMinutes: number): ScheduledNotification[]
- getUpcomingNotifications(notifications: ScheduledNotification[], currentTime: Date, windowMinutes: number): ScheduledNotification[]
```

**Verification**:
```typescript
// Test file: src/lib/execution/__tests__/notification-scheduler.test.ts
describe('notification-scheduler', () => {
  test('schedules departure reminder 15 min before commute', () => {
    const activity = createMockActivity({ startTime: '10:00', commuteFromPrevious: { durationMinutes: 15 } });
    const reminder = createDepartureReminder(activity, 15);
    // Should notify at 09:30 (10:00 - 15min commute - 15min buffer)
    expect(reminder.scheduledTime).toEqual(new Date('2025-01-01T09:30:00'));
  });

  test('filters out quiet hours notifications', () => {
    const notifications = [
      { scheduledTime: new Date('2025-01-01T07:00:00'), ... }, // Before quiet ends
      { scheduledTime: new Date('2025-01-01T10:00:00'), ... }, // OK
      { scheduledTime: new Date('2025-01-01T22:30:00'), ... }, // After quiet starts
    ];
    const filtered = filterByQuietHours(notifications, '22:00', '08:00');
    expect(filtered).toHaveLength(1);
  });

  test('batches notifications within 5 min window', () => {
    const notifications = [
      { scheduledTime: new Date('2025-01-01T10:00:00'), ... },
      { scheduledTime: new Date('2025-01-01T10:02:00'), ... },
      { scheduledTime: new Date('2025-01-01T10:30:00'), ... },
    ];
    const batched = batchNearbyNotifications(notifications, 5);
    expect(batched).toHaveLength(2); // First two batched, third separate
  });
});
```

**Estimated lines**: ~140

---

### STEP 8: Geofence Manager (src/lib/execution/geofence-manager.ts)
**Goal**: Create and manage geofences for activities

**Files to create**:
- `src/lib/execution/geofence-manager.ts`

**What to implement**:
```typescript
// Functions
- createGeofencesForSchedule(schedule: DaySchedule): Geofence[]
- createActivityGeofence(activity: ScheduledActivity): Geofence
- isInsideGeofence(location: Coordinates, geofence: Geofence): boolean
- findNearestGeofence(location: Coordinates, geofences: Geofence[]): Geofence | null
- detectGeofenceEvents(
    previousLocation: Coordinates | null,
    currentLocation: Coordinates,
    geofences: Geofence[]
  ): { entered: Geofence[]; exited: Geofence[] }
- calculateDistanceToGeofence(location: Coordinates, geofence: Geofence): number
```

**Verification**:
```typescript
// Test file: src/lib/execution/__tests__/geofence-manager.test.ts
describe('geofence-manager', () => {
  const templeGeofence = {
    id: 'temple',
    center: { lat: 35.7148, lng: 139.7967 }, // Senso-ji
    radius: 150, // meters
  };

  test('detects when inside geofence', () => {
    const location = { lat: 35.7148, lng: 139.7967 }; // Same as center
    expect(isInsideGeofence(location, templeGeofence)).toBe(true);
  });

  test('detects when outside geofence', () => {
    const location = { lat: 35.7200, lng: 139.8000 }; // ~500m away
    expect(isInsideGeofence(location, templeGeofence)).toBe(false);
  });

  test('detects enter event', () => {
    const outside = { lat: 35.7200, lng: 139.8000 };
    const inside = { lat: 35.7148, lng: 139.7967 };
    const events = detectGeofenceEvents(outside, inside, [templeGeofence]);
    expect(events.entered).toContain(templeGeofence);
    expect(events.exited).toHaveLength(0);
  });

  test('creates geofence for each activity', () => {
    const schedule = createScheduleWith3Activities();
    const geofences = createGeofencesForSchedule(schedule);
    expect(geofences).toHaveLength(3);
    expect(geofences[0].activitySlotId).toBe(schedule.slots[0].slotId);
  });
});
```

**Estimated lines**: ~120

---

### STEP 9: Execution Engine (src/lib/execution/execution-engine.ts)
**Goal**: Main orchestrator that ties everything together

**Files to create**:
- `src/lib/execution/execution-engine.ts`

**What to implement**:
```typescript
class ExecutionEngine {
  private store: ExecutionStore;
  private reshufflingService: ReshufflingService;
  private scheduledChecks: Map<string, NodeJS.Timeout>;

  // Core methods
  start(tripId: string, schedule: DaySchedule): ExecutionEngineState;
  pause(reason: string): void;
  resume(): void;
  stop(): void;

  // Activity methods
  checkInToActivity(slotId: string): void;
  checkOutOfActivity(slotId: string, rating?: number): void;
  extendActivity(slotId: string, minutes: number): TimeExtensionResult;
  skipActivity(slotId: string, reason?: string): void;

  // Location handling
  updateLocation(location: Coordinates): { geofenceEvents: GeofenceEvent[] };

  // Time-based checks
  private scheduleTimeChecks(): void;
  private handleTimeCheck(slotId: string, checkType: string): void;
}
```

**Verification**:
```typescript
// Test file: src/lib/execution/__tests__/execution-engine.test.ts
describe('ExecutionEngine', () => {
  let engine: ExecutionEngine;

  beforeEach(() => {
    engine = new ExecutionEngine();
  });

  afterEach(() => {
    engine.stop();
  });

  test('start() initializes with active mode', () => {
    const state = engine.start('trip-1', mockSchedule);
    expect(state.mode).toBe('active');
    expect(state.currentDay).not.toBeNull();
  });

  test('checkInToActivity updates state', () => {
    engine.start('trip-1', mockSchedule);
    engine.checkInToActivity('slot-1');
    const activity = engine.getActivityState('slot-1');
    expect(activity.state).toBe('in_progress');
    expect(activity.actualStart).toBeDefined();
  });

  test('extendActivity integrates with reshuffling', () => {
    engine.start('trip-1', mockSchedule);
    engine.checkInToActivity('slot-1');
    const result = engine.extendActivity('slot-1', 30);
    expect(result.success).toBe(true);
    // Verify schedule was updated
  });

  test('updateLocation triggers geofence events', () => {
    engine.start('trip-1', mockSchedule);
    const result = engine.updateLocation({ lat: 35.7148, lng: 139.7967 });
    expect(result.geofenceEvents.length).toBeGreaterThan(0);
  });
});
```

**Estimated lines**: ~200

---

### STEP 10: useExecution Hook (src/hooks/useExecution.ts)
**Goal**: React hook for UI integration

**Files to create**:
- `src/hooks/useExecution.ts`

**What to implement**:
```typescript
export function useExecution() {
  // From store
  const mode = useExecutionStore(s => s.mode);
  const currentActivity = useExecutionStore(s => s.getCurrentActivity());
  const progress = useExecutionStore(s => s.getProgress());

  // Actions
  const startTrip = useCallback((tripId: string, schedule: DaySchedule) => { ... }, []);
  const checkIn = useCallback((slotId: string) => { ... }, []);
  const checkOut = useCallback((slotId: string, rating?: number) => { ... }, []);
  const extend = useCallback((slotId: string, minutes: number) => { ... }, []);
  const skip = useCallback((slotId: string, reason?: string) => { ... }, []);

  // Computed
  const isExecuting = mode === 'active';
  const timeRemaining = useMemo(() => calculateTimeRemaining(currentActivity), [currentActivity]);

  return {
    mode,
    isExecuting,
    currentActivity,
    progress,
    timeRemaining,
    startTrip,
    checkIn,
    checkOut,
    extend,
    skip,
  };
}
```

**Verification**:
```typescript
// Test file: src/hooks/__tests__/useExecution.test.tsx
import { renderHook, act } from '@testing-library/react';

describe('useExecution', () => {
  test('initial state is idle', () => {
    const { result } = renderHook(() => useExecution());
    expect(result.current.mode).toBe('idle');
    expect(result.current.isExecuting).toBe(false);
  });

  test('startTrip changes mode to active', () => {
    const { result } = renderHook(() => useExecution());
    act(() => {
      result.current.startTrip('trip-1', mockSchedule);
    });
    expect(result.current.mode).toBe('active');
    expect(result.current.isExecuting).toBe(true);
  });

  test('checkIn updates currentActivity', () => {
    const { result } = renderHook(() => useExecution());
    act(() => {
      result.current.startTrip('trip-1', mockSchedule);
      result.current.checkIn('slot-1');
    });
    expect(result.current.currentActivity?.slotId).toBe('slot-1');
    expect(result.current.currentActivity?.state).toBe('in_progress');
  });
});
```

**Estimated lines**: ~100

---

## Verification Checklist Summary

| Step | File | Lines | Key Test |
|------|------|-------|----------|
| 1 | `types/execution.ts` | ~150 | TypeScript compiles |
| 2 | `lib/execution/activity-lifecycle.ts` | ~120 | State transitions work |
| 3 | `lib/execution/day-progress.ts` | ~100 | Progress calculation |
| 4 | `lib/execution/time-extension.ts` | ~150 | Extension impact |
| 5 | `store/execution-store.ts` | ~180 | Store actions |
| 6 | `lib/execution/morning-briefing.ts` | ~120 | Briefing generation |
| 7 | `lib/execution/notification-scheduler.ts` | ~140 | Notification scheduling |
| 8 | `lib/execution/geofence-manager.ts` | ~120 | Geofence detection |
| 9 | `lib/execution/execution-engine.ts` | ~200 | Engine orchestration |
| 10 | `hooks/useExecution.ts` | ~100 | React integration |

**Total**: ~1,480 lines across 10 steps

---

## Execution Order

```
Step 1 (Types)
    │
    ▼
Step 2 (Activity Lifecycle) ◄─────────────────┐
    │                                          │
    ▼                                          │
Step 3 (Day Progress) ────────────────────────┤
    │                                          │
    ▼                                          │
Step 4 (Time Extension) ──────────────────────┤
    │                                          │
    ▼                                          │
Step 5 (Store) ◄──────────────────────────────┤
    │                                          │
    ├──────────────┐                           │
    │              │                           │
    ▼              ▼                           │
Step 6         Step 7         Step 8           │
(Briefing)     (Notifs)       (Geofence)       │
    │              │              │            │
    └──────────────┴──────────────┘            │
                   │                           │
                   ▼                           │
              Step 9 (Engine) ─────────────────┘
                   │
                   ▼
              Step 10 (Hook)
```

---

## How to Verify Each Step

After completing each step:

1. **Run the test file**:
   ```bash
   npx vitest run src/lib/execution/__tests__/[step-name].test.ts
   ```

2. **Check TypeScript**:
   ```bash
   npx tsc --noEmit
   ```

3. **Verify imports work**:
   ```typescript
   // In a test file
   import { functionName } from '../path/to/module';
   console.log(typeof functionName); // Should not be undefined
   ```

4. **Manual smoke test** (for later steps):
   ```typescript
   // Quick console test
   const result = functionName(testInput);
   console.log(result);
   ```

---

## Red Flags (Hallucination Detection)

Watch for these signs that implementation might be fake:

1. **Missing imports**: Functions reference types/functions that don't exist
2. **Circular dependencies**: Module A imports B which imports A
3. **Magic values**: Hardcoded results that don't come from actual logic
4. **Missing edge cases**: Only handles happy path
5. **Type mismatches**: Return types don't match declared types
6. **Unused parameters**: Function takes params but doesn't use them
7. **Empty catch blocks**: Error handling that swallows errors
8. **TODO comments**: Placeholder code not actually implemented

---

## Ready to Start?

When ready, say **"Start Step 1"** and I will implement just that step with full tests.
