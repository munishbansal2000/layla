# Real-Time Reshuffling Algorithm Design

---

## EXECUTIVE SUMMARY

Real-time reshuffling is the **#1 differentiator** that transforms Layla from a static trip planner into an intelligent travel companion. While the Activity Suggestion Algorithm handles **planning mode** (before/during trip creation), this document covers **execution mode** — the dynamic adaptation engine that responds to real-world changes as they happen.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  STATIC PLANNER                        INTELLIGENT COMPANION                │
│  ══════════════                        ═════════════════════                │
│                                                                             │
│  "Here's your plan"          vs.       "Your plan just changed —           │
│                                         here's what to do now"              │
│                                                                             │
│  User figures it out                   App adapts automatically            │
│  when things go wrong                  and suggests alternatives            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Core Philosophy

### The Three Pillars of Real-Time Reshuffling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  1. DETECT                    2. DECIDE                  3. DELIVER        │
│  ════════                     ════════                   ════════          │
│                                                                             │
│  Know something               Figure out the             Present options   │
│  changed before               best response              clearly with      │
│  user has to                  strategy                   minimal friction  │
│  tell us                                                                    │
│                                                                             │
│  • Location tracking          • Impact analysis          • Smart defaults  │
│  • Weather monitoring         • Constraint solving       • One-tap actions │
│  • Closure feeds              • Priority preservation    • Undo capability │
│  • Time awareness             • Booking protection       • Explanation     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Trigger Events & Detection

### 🔴 Category 1: Time-Based Triggers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  TRIGGER: USER RUNNING LATE                                                 │
│  ══════════════════════════                                                 │
│                                                                             │
│  DETECTION METHODS:                                                         │
│  ─────────────────                                                          │
│  1. Location-based: User still at Activity A when should be en route       │
│     • Compare: current_location vs expected_location_at_time               │
│     • Threshold: 10+ minutes behind schedule triggers evaluation           │
│                                                                             │
│  2. Activity check-in: User marks activity as "started" late               │
│     • If scheduled_start = 10:00 but checked_in = 10:30 → 30min delay     │
│                                                                             │
│  3. Explicit user input: "I'm running late"                                 │
│     • Chat/voice command → immediate reshuffle prompt                       │
│                                                                             │
│  4. Predictive: Traffic/transit delay detected en route                     │
│     • Google Maps ETA suddenly increases → proactive warning                │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  EXAMPLE SCENARIO                                                    │   │
│  │                                                                      │   │
│  │  Schedule:  Senso-ji Temple 9:00-10:30 → Lunch 11:00-12:00          │   │
│  │  Reality:   User still at temple at 10:45                            │   │
│  │  Detection: GPS shows user at temple, expected departure was 10:30  │   │
│  │  Impact:    15min late → lunch reservation at 11:00 at risk         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 🌧️ Category 2: Weather-Based Triggers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  TRIGGER: WEATHER CHANGE                                                    │
│  ═══════════════════════                                                    │
│                                                                             │
│  DETECTION METHODS:                                                         │
│  ─────────────────                                                          │
│  1. Forecast monitoring: Check weather API every 30 minutes                 │
│     • Compare current forecast vs forecast at trip creation                 │
│     • Flag significant changes (rain, extreme temp, storms)                 │
│                                                                             │
│  2. Real-time conditions: Current weather differs from forecast            │
│     • Precipitation started unexpectedly                                    │
│     • Temperature dropped/spiked significantly                              │
│                                                                             │
│  3. Severe weather alerts: Push notifications from weather services        │
│     • Thunderstorms, typhoons, heat advisories                              │
│                                                                             │
│  IMPACT CLASSIFICATION:                                                     │
│  ─────────────────────                                                      │
│  ┌──────────────────┬────────────────────┬─────────────────────────────┐   │
│  │ Weather Change   │ Affected Activities │ Response                    │   │
│  ├──────────────────┼────────────────────┼─────────────────────────────┤   │
│  │ Light rain       │ Parks, viewpoints  │ Suggest indoor alternatives │   │
│  │ Heavy rain       │ All outdoor        │ Swap order or replace       │   │
│  │ Extreme heat     │ Walking tours      │ Move to morning/evening     │   │
│  │ Cold snap        │ Outdoor dining     │ Find indoor restaurant      │   │
│  │ Storm warning    │ Everything         │ Full day reshuffle          │   │
│  └──────────────────┴────────────────────┴─────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  EXAMPLE SCENARIO                                                    │   │
│  │                                                                      │   │
│  │  Schedule:  Ueno Park (outdoor) 2:00-4:00 PM                         │   │
│  │  Reality:   Rain starting at 1:30 PM, lasting until 5:00 PM          │   │
│  │  Detection: Weather API shows precipitation_probability: 90%        │   │
│  │  Impact:    Outdoor park visit ruined → need indoor alternative     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 🚫 Category 3: Closure-Based Triggers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  TRIGGER: ATTRACTION UNEXPECTEDLY CLOSED                                    │
│  ═══════════════════════════════════════                                    │
│                                                                             │
│  DETECTION METHODS:                                                         │
│  ─────────────────                                                          │
│  1. Google Places API: Real-time opening hours & "temporarily closed"      │
│     • Poll planned venues 2 hours before scheduled visit                    │
│     • Check for special closures, holidays, events                          │
│                                                                             │
│  2. User report: "This place is closed"                                     │
│     • Chat input → immediate replacement suggestions                        │
│                                                                             │
│  3. Social/news feeds: Twitter/X mentions of closures                       │
│     • "Senso-ji temple closed due to event" trending                        │
│                                                                             │
│  4. Partner data feeds: Direct integration with attractions                 │
│     • Real-time capacity, closures, wait times                              │
│                                                                             │
│  CLOSURE TYPES:                                                             │
│  ─────────────                                                              │
│  ┌──────────────────┬────────────────────┬─────────────────────────────┐   │
│  │ Closure Type     │ Advance Warning    │ Response Strategy           │   │
│  ├──────────────────┼────────────────────┼─────────────────────────────┤   │
│  │ Regular day off  │ Known (Mon/Tues)   │ Should be pre-filtered      │   │
│  │ Holiday closure  │ Hours-days ahead   │ Catch in morning check      │   │
│  │ Emergency        │ No warning         │ Real-time replacement       │   │
│  │ Private event    │ Sometimes known    │ Check 2h before             │   │
│  │ Capacity full    │ Real-time          │ Queue/alternative options   │   │
│  └──────────────────┴────────────────────┴─────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 🚇 Category 4: Transportation Disruptions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  TRIGGER: TRANSPORT DELAY OR DISRUPTION                                     │
│  ══════════════════════════════════════                                     │
│                                                                             │
│  DETECTION METHODS:                                                         │
│  ─────────────────                                                          │
│  1. Transit APIs: Real-time delay information                               │
│     • Tokyo Metro API, JR East, local transit feeds                         │
│     • GTFS-RT (General Transit Feed Specification - Realtime)               │
│                                                                             │
│  2. Google Maps Directions: ETA changes during navigation                   │
│     • Route started with 20min ETA, now showing 45min                       │
│                                                                             │
│  3. News/Alert feeds: Strike announcements, accidents                       │
│     • "Train service suspended between X and Y"                             │
│                                                                             │
│  4. User report: "My train is delayed"                                      │
│     • Trigger manual delay input → recalculate                              │
│                                                                             │
│  RESPONSE STRATEGIES:                                                       │
│  ───────────────────                                                        │
│  ┌──────────────────┬────────────────────────────────────────────────┐     │
│  │ Delay Duration   │ Response                                        │     │
│  ├──────────────────┼────────────────────────────────────────────────┤     │
│  │ 5-15 min         │ Absorb in buffer, no notification              │     │
│  │ 15-30 min        │ Notify, suggest compressing next activity      │     │
│  │ 30-60 min        │ Suggest skipping or swapping activities        │     │
│  │ 60+ min          │ Full afternoon/day reshuffle                    │     │
│  │ Service stopped  │ Offer alternate transportation modes           │     │
│  └──────────────────┴────────────────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 😴 Category 5: User State Triggers

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  TRIGGER: USER FATIGUE / STATE CHANGE                                       │
│  ════════════════════════════════════                                       │
│                                                                             │
│  DETECTION METHODS:                                                         │
│  ─────────────────                                                          │
│  1. Explicit input: "I'm tired" / "We need a break"                         │
│     • Natural language → intent detection → downgrade intensity             │
│                                                                             │
│  2. Implicit signals:                                                       │
│     • Frequent app checks (user seems uncertain/stressed)                   │
│     • Skipping activities (pattern of "skip" actions)                       │
│     • Long stationary periods (not moving when should be)                   │
│     • Time of day + step count (if health integration)                      │
│                                                                             │
│  3. Trip pattern: Day 5+ of intense trip → suggest lighter day              │
│     • Proactive: "You've been going hard! Want a relaxed afternoon?"       │
│                                                                             │
│  INTENSITY LEVELS:                                                          │
│  ────────────────                                                           │
│  ┌──────────────────┬────────────────────────────────────────────────┐     │
│  │ User State       │ Activity Adjustment                            │     │
│  ├──────────────────┼────────────────────────────────────────────────┤     │
│  │ "Slight tired"   │ Add longer breaks, reduce walking distance     │     │
│  │ "Very tired"     │ Replace active with passive (museum → café)    │     │
│  │ "Need break"     │ Insert 2-3 hour rest block, reshuffle rest     │     │
│  │ "Done for day"   │ Cancel remaining, keep dinner reservation      │     │
│  │ "Sick/unwell"    │ Clear day, add pharmacy/rest suggestions       │     │
│  └──────────────────┴────────────────────────────────────────────────┘     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## The Reshuffling Algorithm

### Phase 1: Impact Analysis

When a trigger is detected, the first step is understanding the impact:

```typescript
interface TriggerEvent {
  type: "running_late" | "weather_change" | "closure" | "transport_delay" | "user_state";
  severity: "low" | "medium" | "high" | "critical";
  detectedAt: Date;
  source: "location" | "api" | "user_input" | "prediction";

  // Specific context
  context: {
    delayMinutes?: number;           // For running_late, transport_delay
    weatherCondition?: WeatherData;  // For weather_change
    closedVenue?: string;            // For closure
    userState?: UserState;           // For user_state
  };
}

interface ImpactAnalysis {
  affectedActivities: AffectedActivity[];
  bookingsAtRisk: BookingRisk[];
  cascadeEffect: CascadeLevel;
  urgency: "immediate" | "within_hour" | "today" | "future";
}

interface AffectedActivity {
  activity: ScheduledActivity;
  impactType: "delayed" | "shortened" | "impossible" | "degraded";
  impactSeverity: number; // 0-100
  canRecover: boolean;
  recoveryOptions: RecoveryOption[];
}

interface BookingRisk {
  booking: Booking;
  riskLevel: "safe" | "tight" | "at_risk" | "will_miss";
  latestArrivalTime: Date;
  cancellationPolicy: CancellationPolicy;
  refundable: boolean;
}

type CascadeLevel =
  | "isolated"      // Only affects one activity
  | "partial_day"   // Affects 2-3 activities
  | "rest_of_day"   // Everything after this point
  | "multi_day";    // Spills into tomorrow
```

### Phase 2: Strategy Selection

Based on impact analysis, select the optimal reshuffling strategy:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  RESHUFFLING STRATEGY DECISION TREE                                         │
│  ═══════════════════════════════════                                        │
│                                                                             │
│                         ┌─────────────┐                                     │
│                         │   TRIGGER   │                                     │
│                         │   DETECTED  │                                     │
│                         └──────┬──────┘                                     │
│                                │                                            │
│                                ▼                                            │
│                    ┌───────────────────────┐                                │
│                    │  Has booking at risk? │                                │
│                    └───────────┬───────────┘                                │
│                          │           │                                      │
│                         YES          NO                                     │
│                          │           │                                      │
│                          ▼           ▼                                      │
│            ┌─────────────────┐  ┌─────────────────┐                         │
│            │ PROTECT BOOKING │  │ STANDARD FLOW   │                         │
│            │ FIRST PRIORITY  │  │                 │                         │
│            └────────┬────────┘  └────────┬────────┘                         │
│                     │                    │                                  │
│                     ▼                    ▼                                  │
│           ┌──────────────────┐  ┌────────────────────────┐                  │
│           │ Can we still     │  │ Delay ≤ 15 min?        │                  │
│           │ make it?         │  └────────────┬───────────┘                  │
│           └────────┬─────────┘         │           │                        │
│              │           │            YES          NO                       │
│             YES          NO            │           │                        │
│              │           │             ▼           ▼                        │
│              ▼           ▼       ┌──────────┐ ┌──────────────┐              │
│        ┌──────────┐ ┌──────────┐ │ COMPRESS │ │ Delay ≤ 45?  │              │
│        │ COMPRESS │ │ PROTECT  │ │ BUFFER   │ └──────┬───────┘              │
│        │ PREVIOUS │ │ BOOKING, │ │ (silent) │   │         │                 │
│        │ ACTIVITY │ │ SKIP/SWAP│ └──────────┘  YES        NO                │
│        └──────────┘ │ OTHERS   │               │         │                  │
│                     └──────────┘               ▼         ▼                  │
│                                          ┌──────────┐ ┌──────────┐          │
│                                          │ SHORTEN  │ │ SKIP OR  │          │
│                                          │ NEXT     │ │ SWAP     │          │
│                                          │ ACTIVITY │ │ ACTIVITY │          │
│                                          └──────────┘ └──────────┘          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Strategy Definitions

```typescript
type ReshuffleStrategy =
  | "compress_buffer"      // Use travel buffer time
  | "shorten_activity"     // Reduce duration of next activity
  | "skip_activity"        // Remove an activity entirely
  | "swap_order"           // Reorder activities
  | "replace_activity"     // Substitute with alternative
  | "split_group"          // Some do X, others do Y (group travel)
  | "defer_to_tomorrow"    // Move activity to next day
  | "cancel_gracefully"    // Cancel with refund if possible
  | "emergency_reroute";   // Complete day reconstruction

interface ReshuffleResult {
  strategy: ReshuffleStrategy;
  changes: ScheduleChange[];
  explanation: string;        // Human-readable explanation
  confidence: number;         // How confident we are this is optimal
  alternatives: ReshuffleResult[]; // Other options user can choose

  // User action required?
  requiresConfirmation: boolean;
  autoApplyIn?: number;       // Seconds before auto-applying (if low-impact)
}
```

---

## Reshuffling Strategies in Detail

### Strategy 1: Compress Buffer

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  STRATEGY: COMPRESS BUFFER                                                  │
│  ═════════════════════════                                                  │
│                                                                             │
│  USE WHEN:                                                                  │
│  • Delay is small (≤15 minutes)                                             │
│  • Sufficient buffer exists between activities                              │
│  • No bookings at immediate risk                                            │
│                                                                             │
│  BEFORE:                                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 9:00    Temple (90 min)    10:30 ─ 30 min travel ─ 11:00  Museum   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  AFTER (15 min delay):                                                      │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 9:15    Temple (90 min)    10:45 ─ 15 min hustle ─ 11:00  Museum   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ACTION: Silent adjustment, no notification (or subtle "running tight")    │
│                                                                             │
│  IMPLEMENTATION:                                                            │
│  ```typescript                                                              │
│  function compressBuffer(schedule: Schedule, delayMinutes: number) {       │
│    const bufferAvailable = schedule.getNextBufferTime();                   │
│    if (bufferAvailable >= delayMinutes) {                                  │
│      schedule.shiftActivities(delayMinutes);                               │
│      schedule.reduceBuffer(delayMinutes);                                  │
│      return { success: true, notifyUser: false };                          │
│    }                                                                        │
│    return { success: false, shortfall: delayMinutes - bufferAvailable };   │
│  }                                                                          │
│  ```                                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Strategy 2: Shorten Activity

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  STRATEGY: SHORTEN NEXT ACTIVITY                                            │
│  ═══════════════════════════════                                            │
│                                                                             │
│  USE WHEN:                                                                  │
│  • Delay is moderate (15-45 minutes)                                        │
│  • Buffer compression insufficient                                          │
│  • Next activity can be meaningfully done in less time                      │
│  • Activity is not time-bound (like a show with set start time)            │
│                                                                             │
│  SHORTENABILITY SCORES:                                                     │
│  ┌──────────────────┬────────────────┬─────────────────────────────────┐   │
│  │ Activity Type    │ Can Shorten?   │ Notes                           │   │
│  ├──────────────────┼────────────────┼─────────────────────────────────┤   │
│  │ Museum           │ ✅ Yes (30%)   │ See highlights, skip deep dive  │   │
│  │ Park/Garden      │ ✅ Yes (40%)   │ Quick walk vs full exploration  │   │
│  │ Neighborhood     │ ✅ Yes (50%)   │ Main street only                │   │
│  │ Restaurant       │ ⚠️  Limited    │ Can't rush eating much          │   │
│  │ Show/Performance │ ❌ No          │ Fixed duration                  │   │
│  │ Guided Tour      │ ❌ No          │ Fixed schedule                  │   │
│  │ Viewpoint        │ ✅ Yes (60%)   │ Quick photo vs linger           │   │
│  └──────────────────┴────────────────┴─────────────────────────────────┘   │
│                                                                             │
│  USER MESSAGE:                                                              │
│  "Running 25 min late. I've shortened your museum visit to 90 min         │
│   (was 120 min) so you won't miss your lunch reservation.                  │
│   Tip: Head straight to the Impressionist wing on floor 3."               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Strategy 3: Skip Activity

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  STRATEGY: SKIP ACTIVITY                                                    │
│  ═══════════════════════                                                    │
│                                                                             │
│  USE WHEN:                                                                  │
│  • Delay is significant (45+ minutes)                                       │
│  • Shortening won't save the schedule                                       │
│  • One activity is clearly lower priority                                   │
│  • Booking exists that MUST be protected                                    │
│                                                                             │
│  SKIP PRIORITY SCORING:                                                     │
│  ─────────────────────                                                      │
│  Lower score = more skippable                                               │
│                                                                             │
│  ┌──────────────────┬────────────────────────────────────────────────┐     │
│  │ Factor           │ Score Impact                                   │     │
│  ├──────────────────┼────────────────────────────────────────────────┤     │
│  │ Has booking      │ +50 (protect bookings)                         │     │
│  │ User marked      │ +40 (user said "must do")                      │     │
│  │ "must do"        │                                                │     │
│  │ Unique to city   │ +30 (can only do here)                         │     │
│  │ Free activity    │ -10 (easier to skip/redo)                      │     │
│  │ Seen similar     │ -15 (already did a museum today)               │     │
│  │ Weather impacted │ -20 (park in rain = not enjoyable)             │     │
│  │ Can do tomorrow  │ -25 (flexibility exists)                       │     │
│  └──────────────────┴────────────────────────────────────────────────┘     │
│                                                                             │
│  USER MESSAGE:                                                              │
│  "To protect your 7pm dinner reservation, I suggest skipping               │
│   Ueno Park this afternoon. Rain is expected anyway!                        │
│   Options:                                                                  │
│   [✅ Skip Ueno Park] [Move to Tomorrow] [Keep & Risk Dinner]"             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Strategy 4: Swap Order

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  STRATEGY: SWAP ACTIVITY ORDER                                              │
│  ═════════════════════════════                                              │
│                                                                             │
│  USE WHEN:                                                                  │
│  • Weather changes make outdoor activity bad NOW but OK later               │
│  • Crowd patterns suggest better timing                                     │
│  • Neither activity has time constraints                                    │
│  • Geographic efficiency can be maintained or improved                      │
│                                                                             │
│  EXAMPLE - WEATHER SWAP:                                                    │
│  ───────────────────────                                                    │
│                                                                             │
│  ORIGINAL:                                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 2:00 PM   Ueno Park (outdoor) ───► 4:30 PM   Tokyo National Museum │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  TRIGGER: Rain 2:00-4:00 PM, clearing by 4:30 PM                           │
│                                                                             │
│  SWAPPED:                                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 2:00 PM   Tokyo National Museum ───► 4:30 PM   Ueno Park (outdoor)  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  BONUS: Both are in Ueno area, so no extra travel time!                    │
│                                                                             │
│  USER MESSAGE:                                                              │
│  "Rain expected 2-4pm. I've swapped your afternoon:                        │
│   Museum first (stay dry), then park when it clears up.                    │
│   Same neighborhood, no extra travel time! ☔→☀️"                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Strategy 5: Replace Activity

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  STRATEGY: REPLACE WITH ALTERNATIVE                                         │
│  ═══════════════════════════════════                                        │
│                                                                             │
│  USE WHEN:                                                                  │
│  • Venue is unexpectedly closed                                             │
│  • Weather makes activity impossible (not just inconvenient)                │
│  • User explicitly rejects current activity                                 │
│  • Activity was cancelled (tour, show, etc.)                                │
│                                                                             │
│  ALTERNATIVE SELECTION CRITERIA:                                            │
│  ───────────────────────────────                                            │
│                                                                             │
│  ┌──────────────────┬────────────────────────────────────────────────┐     │
│  │ Criteria         │ Weight │ Reasoning                             │     │
│  ├──────────────────┼────────┼───────────────────────────────────────┤     │
│  │ Same category    │ 30%    │ Temple closed → another temple        │     │
│  │ Same neighborhood│ 25%    │ Minimize travel disruption            │     │
│  │ Same duration    │ 20%    │ Maintain schedule integrity           │     │
│  │ Similar interests│ 15%    │ Match user preferences                │     │
│  │ Weather-proof    │ 10%    │ If weather is the trigger             │     │
│  └──────────────────┴────────┴───────────────────────────────────────┘     │
│                                                                             │
│  REPLACEMENT PROMPT TO AI:                                                  │
│  ─────────────────────────                                                  │
│  """                                                                        │
│  The user's planned activity [Senso-ji Temple] is unexpectedly closed.    │
│  Find 3 alternatives that:                                                  │
│  - Are in or near [Asakusa] neighborhood                                   │
│  - Take approximately [90] minutes                                          │
│  - Match interests: [temples, culture, photography]                        │
│  - Are currently OPEN (it's 2:30 PM on Tuesday)                            │
│  """                                                                        │
│                                                                             │
│  USER MESSAGE:                                                              │
│  "Senso-ji Temple is closed for a private ceremony today 😔               │
│   Here are 3 nearby alternatives:                                           │
│                                                                             │
│   🏯 Asakusa Shrine (5 min walk, similar vibe)                             │
│   🎭 Edo-Tokyo Museum (15 min, rainy day perfect)                          │
│   🍵 Traditional Tea Ceremony (bookable, 10 min walk)                      │
│                                                                             │
│   [Pick for me] [See options] [Skip & continue]"                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Integration with Activity Suggestion Algorithm

### Shared Components

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ACTIVITY SUGGESTION ALGORITHM          REALTIME RESHUFFLING                │
│  ═══════════════════════════════        ════════════════════                │
│                                                                             │
│  ┌─────────────────────────┐            ┌─────────────────────────┐        │
│  │ Activity Pool Generator │◄──────────►│ Replacement Pool       │        │
│  │ (OpenAI + Yelp + APIs)  │            │ (Contextual Filtering)  │        │
│  └─────────────────────────┘            └─────────────────────────┘        │
│                                                                             │
│  ┌─────────────────────────┐            ┌─────────────────────────┐        │
│  │ Scoring Engine          │◄──────────►│ Priority Scoring        │        │
│  │ (Interest, Budget, etc) │            │ (Skip Priority, etc)    │        │
│  └─────────────────────────┘            └─────────────────────────┘        │
│                                                                             │
│  ┌─────────────────────────┐            ┌─────────────────────────┐        │
│  │ Schedule Builder        │◄──────────►│ Schedule Modifier       │        │
│  │ (Time slots, commute)   │            │ (Shift, compress, swap) │        │
│  └─────────────────────────┘            └─────────────────────────┘        │
│                                                                             │
│  ┌─────────────────────────┐            ┌─────────────────────────┐        │
│  │ Weather Service         │◄──────────►│ Weather Monitor         │        │
│  │ (Forecast at planning)  │            │ (Real-time changes)     │        │
│  └─────────────────────────┘            └─────────────────────────┘        │
│                                                                             │
│  SHARED DATA STORES:                                                        │
│  • Activity Pool (cached per city per trip)                                 │
│  • User Preferences (learned & explicit)                                    │
│  • Venue Data (hours, location, closures)                                   │
│  • Booking Records (reservations, tickets)                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Data Structures

### Trip Execution State

```typescript
interface TripExecutionState {
  tripId: string;
  currentDay: number;
  currentTime: Date;

  // Location tracking
  userLocation?: {
    coordinates: { lat: number; lng: number };
    accuracy: number;
    lastUpdated: Date;
  };

  // Schedule state
  schedule: {
    planned: ScheduledActivity[];
    completed: CompletedActivity[];
    skipped: SkippedActivity[];
    inProgress?: {
      activity: ScheduledActivity;
      startedAt: Date;
      expectedEnd: Date;
    };
  };

  // Trigger monitoring
  monitors: {
    weather: WeatherMonitor;
    closures: ClosureMonitor;
    transport: TransportMonitor;
  };

  // Reshuffle history (for undo)
  reshuffleHistory: ReshuffleEvent[];
}

interface ScheduledActivity {
  id: string;
  activity: Activity;
  scheduledStart: Date;
  scheduledEnd: Date;
  actualStart?: Date;
  actualEnd?: Date;

  // Flexibility metadata
  flexibility: {
    canShorten: boolean;
    minDuration: number;
    canSkip: boolean;
    canSwapWith: string[];  // IDs of swappable activities
    canDefer: boolean;
  };

  // Booking linkage
  booking?: {
    id: string;
    type: "reservation" | "ticket" | "tour";
    mustArriveBy: Date;
    cancellationDeadline?: Date;
    refundable: boolean;
  };

  // Priority (higher = harder to skip)
  priority: number;
  userMarkedMustDo: boolean;
}

interface ReshuffleEvent {
  id: string;
  triggeredAt: Date;
  trigger: TriggerEvent;
  strategyUsed: ReshuffleStrategy;
  changesMade: ScheduleChange[];
  userConfirmed: boolean;
  undoAvailable: boolean;
  undoneAt?: Date;
}
```

### Weather Monitor

```typescript
interface WeatherMonitor {
  lastCheck: Date;
  checkInterval: number; // milliseconds

  currentConditions: {
    temperature: number;
    conditions: WeatherCondition;
    precipitation: number;
    humidity: number;
    windSpeed: number;
  };

  forecast: HourlyForecast[];

  alerts: WeatherAlert[];

  // Thresholds for triggering reshuffle
  thresholds: {
    rainProbabilityTrigger: number;      // e.g., 70%
    temperatureChangeTrigger: number;    // e.g., 10°C swing
    severeWeatherAlertLevel: string[];   // e.g., ["storm", "typhoon"]
  };
}

interface HourlyForecast {
  time: Date;
  temperature: number;
  conditions: WeatherCondition;
  precipitationProbability: number;
  outdoorViability: "good" | "fair" | "poor" | "impossible";
}

type WeatherCondition =
  | "clear" | "partly_cloudy" | "cloudy" | "overcast"
  | "light_rain" | "rain" | "heavy_rain" | "thunderstorm"
  | "snow" | "sleet" | "fog" | "extreme_heat" | "extreme_cold";
```

---

## API Design

### Trigger Detection Endpoint

```typescript
// Called periodically by the mobile app or server-side monitor
POST /api/trip/:tripId/check-triggers

Request: {
  currentLocation?: { lat: number; lng: number };
  currentTime: string;  // ISO 8601
  userReportedIssue?: string;  // "I'm tired", "Place is closed", etc.
}

Response: {
  triggersDetected: TriggerEvent[];
  suggestedActions: ReshuffleResult[];
  scheduleStatus: "on_track" | "minor_delay" | "needs_attention" | "critical";
  nextCheckIn: number;  // milliseconds until next check
}
```

### Apply Reshuffle Endpoint

```typescript
POST /api/trip/:tripId/reshuffle

Request: {
  triggerId: string;
  selectedStrategy: ReshuffleStrategy;
  selectedOption?: string;  // If user chose from alternatives
  customInput?: {
    skipActivityId?: string;
    replacementActivityId?: string;
    newTime?: string;
  };
}

Response: {
  success: boolean;
  updatedSchedule: ScheduledActivity[];
  changes: ScheduleChange[];
  undoToken: string;  // Can use to revert
  message: string;    // Confirmation message
}
```

### Undo Reshuffle Endpoint

```typescript
POST /api/trip/:tripId/reshuffle/undo

Request: {
  undoToken: string;
}

Response: {
  success: boolean;
  restoredSchedule: ScheduledActivity[];
  message: string;
}
```

### Get Alternatives Endpoint

```typescript
GET /api/trip/:tripId/alternatives

Query: {
  forActivityId: string;  // The activity being replaced
  reason: "closed" | "weather" | "user_preference" | "time_constraint";
}

Response: {
  originalActivity: Activity;
  alternatives: {
    activity: Activity;
    matchScore: number;
    distance: number;
    travelTime: number;
    whyRecommended: string;
    canBookNow: boolean;
  }[];
}
```

---

## User Experience Flows

### Flow 1: Running Late - Automatic Handling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  USER'S PHONE                              SERVER                           │
│  ════════════                              ══════                           │
│                                                                             │
│  📍 Location: Still at temple              🔍 Detect: 15 min behind         │
│     at 10:45 (should be en route)              schedule                     │
│                                                                             │
│                    ◄────────────────────────────                            │
│                                                                             │
│  ┌─────────────────────────────────┐                                        │
│  │ 📱 PUSH NOTIFICATION            │                                        │
│  │ ────────────────────────        │                                        │
│  │ Running a bit late? I've        │                                        │
│  │ adjusted your schedule.         │                                        │
│  │                                  │                                        │
│  │ [View Changes] [Dismiss]        │                                        │
│  └─────────────────────────────────┘                                        │
│                                                                             │
│  User taps [View Changes]                                                   │
│                                                                             │
│  ┌─────────────────────────────────┐                                        │
│  │ 📱 APP - SCHEDULE UPDATED       │                                        │
│  │ ────────────────────────        │                                        │
│  │                                  │                                        │
│  │ ⚡ Auto-adjusted for 15 min     │                                        │
│  │    delay                         │                                        │
│  │                                  │                                        │
│  │ CHANGES:                         │                                        │
│  │ • Museum: 11:00→11:15 start     │                                        │
│  │ • Reduced buffer 30→15 min      │                                        │
│  │ • Lunch still at 1:00 ✓         │                                        │
│  │                                  │                                        │
│  │ [Looks good] [Undo changes]     │                                        │
│  └─────────────────────────────────┘                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Flow 2: Weather Change - User Choice Required

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ┌─────────────────────────────────┐                                        │
│  │ 📱 PUSH NOTIFICATION            │                                        │
│  │ ────────────────────────        │                                        │
│  │ ☔ Rain starting in 30 min!     │                                        │
│  │ Your park visit might get       │                                        │
│  │ wet. Tap for options.           │                                        │
│  └─────────────────────────────────┘                                        │
│                                                                             │
│  User opens app                                                             │
│                                                                             │
│  ┌─────────────────────────────────┐                                        │
│  │ 📱 WEATHER ALERT                │                                        │
│  │ ────────────────────────        │                                        │
│  │                                  │                                        │
│  │ ☔ Rain 2:00-4:30 PM (80%)      │                                        │
│  │                                  │                                        │
│  │ Your 2 PM activity:             │                                        │
│  │ 🌳 Ueno Park (OUTDOOR)          │                                        │
│  │                                  │                                        │
│  │ OPTIONS:                         │                                        │
│  │                                  │                                        │
│  │ ┌────────────────────────────┐  │                                        │
│  │ │ 🔄 SWAP ORDER              │  │                                        │
│  │ │ Do museum first, park at  │  │                                        │
│  │ │ 4:30 when rain stops      │  │                                        │
│  │ │ ⭐ Recommended             │  │                                        │
│  │ └────────────────────────────┘  │                                        │
│  │                                  │                                        │
│  │ ┌────────────────────────────┐  │                                        │
│  │ │ 🏠 GO INDOOR               │  │                                        │
│  │ │ Replace with indoor       │  │                                        │
│  │ │ alternative: Ueno Zoo     │  │                                        │
│  │ │ (covered areas)           │  │                                        │
│  │ └────────────────────────────┘  │                                        │
│  │                                  │                                        │
│  │ ┌────────────────────────────┐  │                                        │
│  │ │ ☔ KEEP & BRING UMBRELLA   │  │                                        │
│  │ │ Stick with the plan,      │  │                                        │
│  │ │ it's just rain!           │  │                                        │
│  │ └────────────────────────────┘  │                                        │
│  │                                  │                                        │
│  └─────────────────────────────────┘                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Flow 3: Closure - Immediate Replacement

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  USER ARRIVES AT VENUE                                                      │
│  ═════════════════════                                                      │
│                                                                             │
│  User types in chat: "The temple is closed!"                                │
│                                                                             │
│  ┌─────────────────────────────────┐                                        │
│  │ 🤖 AI RESPONSE                  │                                        │
│  │ ────────────────────────        │                                        │
│  │                                  │                                        │
│  │ Oh no! Let me find you a        │                                        │
│  │ great alternative nearby...     │                                        │
│  │                                  │                                        │
│  │ ⏳ Finding options...           │                                        │
│  └─────────────────────────────────┘                                        │
│                                                                             │
│  2 seconds later...                                                         │
│                                                                             │
│  ┌─────────────────────────────────┐                                        │
│  │ 🤖 AI RESPONSE                  │                                        │
│  │ ────────────────────────        │                                        │
│  │                                  │                                        │
│  │ Found 3 alternatives within     │                                        │
│  │ 10 minutes of you:              │                                        │
│  │                                  │                                        │
│  │ ┌────────────────────────────┐  │                                        │
│  │ │ 🏯 Asakusa Shrine          │  │                                        │
│  │ │ 5 min walk • FREE          │  │                                        │
│  │ │ Same spiritual vibe,       │  │                                        │
│  │ │ less crowded!              │  │                                        │
│  │ │                            │  │                                        │
│  │ │ [🗺️ Navigate] [➕ Add]    │  │                                        │
│  │ └────────────────────────────┘  │                                        │
│  │                                  │                                        │
│  │ ┌────────────────────────────┐  │                                        │
│  │ │ 🍵 Nakamise Shopping St    │  │                                        │
│  │ │ Right here • FREE          │  │                                        │
│  │ │ Traditional shops &        │  │                                        │
│  │ │ snacks                     │  │                                        │
│  │ │                            │  │                                        │
│  │ │ [🗺️ Navigate] [➕ Add]    │  │                                        │
│  │ └────────────────────────────┘  │                                        │
│  │                                  │                                        │
│  │ ┌────────────────────────────┐  │                                        │
│  │ │ 🎭 Edo-Tokyo Museum        │  │                                        │
│  │ │ 15 min • ¥600              │  │                                        │
│  │ │ If you want to go indoor   │  │                                        │
│  │ │                            │  │                                        │
│  │ │ [🗺️ Navigate] [➕ Add]    │  │                                        │
│  │ └────────────────────────────┘  │                                        │
│  │                                  │                                        │
│  │ Want me to update your          │                                        │
│  │ schedule with one of these?     │                                        │
│  │                                  │                                        │
│  └─────────────────────────────────┘                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Priority

### Phase 1: Foundation (Week 1-2)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  PHASE 1: CORE RESHUFFLING INFRASTRUCTURE                                   │
│  ════════════════════════════════════════                                   │
│                                                                             │
│  ✅ Trip Execution State schema                                             │
│  ✅ Schedule modification functions (shift, compress, skip, swap)           │
│  ✅ Basic trigger detection (user-reported only)                            │
│  ✅ Simple strategy selection (compress → skip → replace)                   │
│  ✅ API endpoints for manual reshuffle                                      │
│  ✅ Undo capability                                                         │
│                                                                             │
│  DELIVERABLE: User can say "I'm late" and get schedule adjusted            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 2: Weather Integration (Week 3)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  PHASE 2: WEATHER-AWARE RESHUFFLING                                         │
│  ══════════════════════════════════                                         │
│                                                                             │
│  ✅ Weather monitoring service (poll every 30 min)                          │
│  ✅ Indoor/outdoor activity tagging                                         │
│  ✅ Weather change detection logic                                          │
│  ✅ Swap strategy for weather scenarios                                     │
│  ✅ Push notifications for weather alerts                                   │
│                                                                             │
│  DELIVERABLE: App proactively suggests indoor alternatives when rain        │
│               is detected                                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 3: Closure Handling (Week 4)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  PHASE 3: CLOSURE DETECTION & REPLACEMENT                                   │
│  ════════════════════════════════════════                                   │
│                                                                             │
│  ✅ Google Places hours checking (2h before visit)                          │
│  ✅ User-reported closure handling                                          │
│  ✅ Alternative suggestion engine                                           │
│  ✅ Contextual replacement (same area, similar type)                        │
│  ✅ AI-powered replacement recommendations                                  │
│                                                                             │
│  DELIVERABLE: When venue is closed, instantly show nearby alternatives     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 4: Location & Time Awareness (Week 5-6)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  PHASE 4: LOCATION-BASED INTELLIGENCE                                       │
│  ════════════════════════════════════                                       │
│                                                                             │
│  ✅ Background location tracking (with permission)                          │
│  ✅ Automatic delay detection (user still at venue)                         │
│  ✅ Smart buffer compression                                                │
│  ✅ Predictive delay warnings (traffic, transit)                            │
│  ✅ Booking protection logic                                                │
│                                                                             │
│  DELIVERABLE: App automatically adjusts when it detects user running       │
│               behind schedule                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Phase 5: Advanced Features (Week 7-8)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  PHASE 5: POLISH & ADVANCED SCENARIOS                                       │
│  ════════════════════════════════════                                       │
│                                                                             │
│  ✅ User fatigue detection                                                  │
│  ✅ Multi-day impact (defer to tomorrow)                                    │
│  ✅ Group travel handling (split suggestions)                               │
│  ✅ Learning from user patterns                                             │
│  ✅ Undo/redo stack                                                         │
│  ✅ Explanation engine ("why this suggestion")                              │
│                                                                             │
│  DELIVERABLE: Fully intelligent travel companion that anticipates needs    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Success Metrics

### Quantitative

| Metric | Target | Measurement |
|--------|--------|-------------|
| Reshuffle acceptance rate | >70% | User accepts suggested changes |
| Time to resolution | <30 sec | From trigger to user seeing options |
| Booking protection rate | >95% | Reservations not missed after reshuffle |
| False positive rate | <10% | Unnecessary reshuffle suggestions |
| User-initiated vs auto | 60/40 | Most issues caught proactively |

### Qualitative

- User feels "the app has my back"
- Stress reduced when things go wrong
- Users trust the app to handle changes
- "Magic" moments when app catches issues first

---

## Appendix: Edge Cases

### Edge Case 1: Cascading Delays

```
Problem: 20 min delay at Activity A causes 10 min delay at B,
         which causes missing booking at C.

Solution: Calculate full cascade impact BEFORE suggesting strategy.
          Protect bookings first, work backwards.
```

### Edge Case 2: Conflicting Constraints

```
Problem: User is late, but ALL remaining activities are bookings.

Solution: Priority ranking of bookings.
          Suggest cancelling lowest-value booking if refundable.
          Or: compress visit times at each booking.
```

### Edge Case 3: User Disagrees with Suggestion

```
Problem: User doesn't want to skip the museum, even though
         they'll miss dinner reservation.

Solution: "I understand! Here's what happens if we keep the museum:
          • Dinner at 8pm instead of 7pm (I'll try to change reservation)
          • Evening show moved to tomorrow
          Is that OK?"
```

### Edge Case 4: Multiple Triggers at Once

```
Problem: User is late AND it's raining AND a venue just closed.

Solution: Prioritize by urgency:
          1. Closure (immediate action needed)
          2. Weather (affects current plan)
          3. Delay (cascading impact)

          Combine into single coherent reshuffle.
```

---

## Conclusion

Real-time reshuffling transforms Layla from a trip planner into a **travel companion**. It's the feature that justifies having the app open during the trip, not just before. The key is:

1. **Detect issues before the user notices**
2. **Decide on the best response strategy**
3. **Deliver clear options with minimal friction**

This is the #1 differentiator that separates a smart travel app from a static itinerary generator.
