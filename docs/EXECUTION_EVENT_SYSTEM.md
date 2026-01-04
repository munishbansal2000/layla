# Execution Event System Design

## Overview

The execution event system generates **proactive agent messages** during trip execution based on real-time signals: location, time, weather, closures, and user behavior. Events appear in the chat panel as if the agent is actively monitoring and assisting.

---

## Event Sources & Triggers

### 1. Location-Based Events (Geofencing)

| Event | Trigger | Example Message |
|-------|---------|-----------------|
| **Arrival** | Enter geofence (50m radius) | "You've arrived at Senso-ji Temple! 🏯" |
| **Departure** | Exit geofence | "Heading out from Senso-ji. Next up: Lunch at Ichiran (12 min walk)" |
| **Proximity Alert** | Within 10 min walk of next venue | "You're close to your next stop - Ramen Shop is 8 min ahead" |
| **Wrong Direction** | Moving away from next venue | "Heads up: you seem to be heading away from Ichiran. Need directions?" |
| **Dwell Time** | Stayed >70% of planned duration | "You've spent about an hour at the temple. Take your time or ready for lunch?" |

### 2. Time-Based Events

| Event | Trigger | Example Message |
|-------|---------|-----------------|
| **Activity Start** | Slot start time reached | "It's 10:00 AM - Temple Visit time! You're currently 15 min away." |
| **Duration Warning** | 80% of planned time elapsed | "You've been exploring for 50 min (planned 1 hour)" |
| **Booking Reminder** | 30 min before timed entry | "Your TeamLab reservation is in 30 min. Leave in 15 min to arrive on time." |
| **Last Call** | Must leave now to make booking | "⚠️ Last call! Leave now to make your 2 PM reservation." |
| **Day Recap** | End of day (6 PM) | "Great day! You completed 6/7 activities. Dinner at Gonpachi at 7 PM." |

### 3. External Data Events

| Event | Trigger | Example Message |
|-------|---------|-----------------|
| **Weather Change** | Forecast changes | "☔ Rain expected at 2 PM. Your outdoor garden visit is at 1 PM - might want to swap with the indoor museum." |
| **Closure Alert** | Venue closed unexpectedly | "🚫 Senso-ji Temple is currently closed (maintenance). I have alternatives ready." |
| **Crowd Alert** | High crowd levels detected | "Tokyo Tower is very crowded right now. Consider visiting Mori Tower instead?" |
| **Transit Delay** | Public transit disruption | "🚃 Yamanote Line delay detected. Adding 20 min to your commute estimate." |
| **Price Drop** | Ticket price changed | "💰 TeamLab tickets just dropped to ¥2,800 (was ¥3,200). Want to book?" |

### 4. Morning Briefing (Daily)

Generated at 7 AM or first app open:

```
☀️ Good morning! Here's your Day 3 in Kyoto:

Weather: Sunny, 22°C (perfect for temple hopping!)
First up: Fushimi Inari Shrine at 8:00 AM (beat the crowds)

Today's highlights:
• 4 activities planned
• 1 timed booking (Tea Ceremony at 2 PM)
• Total walking: ~8 km

⚠️ Heads up:
• Kiyomizu-dera closes early today (4 PM vs usual 6 PM)
• Your lunch spot is cash-only

Ready to start your day?
```

---

## Smart Slot Completion Detection

### Multi-Signal Scoring System

```
┌─────────────────────────────────────────────────────────────────────┐
│                  COMPLETION CONFIDENCE SCORING                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Signal                        │ Weight │ Description               │
│  ─────────────────────────────────────────────────────────────────  │
│  Time Elapsed                  │  15    │ current > slot.endTime    │
│  Left Geofence                 │  35    │ Exited venue radius       │
│  Arrived at Next Venue         │  40    │ Entered next geofence     │
│  Dwell Time >= 70% Duration    │  20    │ Spent enough time         │
│  User Confirmed "Done"         │  100   │ Explicit confirmation     │
│  User Said "Leaving"           │  45    │ NLP detection in chat     │
│  Photo with Location Metadata  │  10    │ Optional passive signal   │
│  Payment Detected (if linked)  │  25    │ Transaction completed     │
│  ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│  AUTO-COMPLETE THRESHOLD: 70 points                                  │
│  ASK-USER THRESHOLD: 50-69 points                                    │
│  UNCERTAIN: <50 points                                               │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

### Completion State Machine

```
                    ┌──────────────┐
                    │   UPCOMING   │
                    └──────┬───────┘
                           │ (time reached OR arrived at venue)
                           ▼
                    ┌──────────────┐
                    │   PENDING    │ "Activity should start soon"
                    └──────┬───────┘
                           │ (user at venue + time >= start)
                           ▼
                    ┌──────────────┐
                    │  IN_PROGRESS │ "Currently at venue"
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
       ┌───────────┐ ┌───────────┐ ┌───────────┐
       │ COMPLETED │ │  SKIPPED  │ │ EXTENDED  │
       └───────────┘ └───────────┘ └───────────┘
```

---

## Location Tracking Strategy

### When to Poll GPS

| Scenario | Poll Frequency | Rationale |
|----------|----------------|-----------|
| **User stationary** | Every 5 min | Battery saving |
| **User moving** | Every 30 sec | Track commute |
| **Near venue boundary** | Every 10 sec | Precise arrival detection |
| **Background (app closed)** | Significant location changes only | iOS/Android geofence triggers |

### Geofence Configuration

```typescript
interface VenueGeofence {
  venueId: string;
  center: { lat: number; lng: number };
  radiusMeters: number; // Typically 50-100m
  
  // Trigger settings
  notifyOnEntry: boolean;
  notifyOnExit: boolean;
  loiteringDelay?: number; // Only trigger after N seconds inside
  
  // Smart sizing based on venue type
  // - Large park: 200m radius
  // - Restaurant: 30m radius  
  // - Train station: 100m radius
}
```

### Venue-Type Radius Presets

```typescript
const GEOFENCE_RADIUS = {
  temple_shrine: 100,      // Large grounds
  park_garden: 150,        // Very large
  museum: 50,              // Compact
  restaurant: 30,          // Small
  shopping_area: 200,      // District
  train_station: 100,      // Platforms spread out
  hotel: 40,               // Building
  observation_deck: 50,    // Single building
  default: 50,
};
```

---

## External API Integration

### Weather Monitoring

```typescript
interface WeatherCheck {
  frequency: "morning" | "2_hours_before_outdoor";
  provider: "openweather" | "weatherapi";
  
  // Thresholds for alerts
  alerts: {
    rainProbability: 0.5,     // Alert if >50% chance
    temperatureHigh: 35,       // Alert if >35°C
    temperatureLow: 5,         // Alert if <5°C
    windSpeed: 40,             // Alert if >40 km/h
  };
}
```

### Closure/Hours Checking

```typescript
interface ClosureCheck {
  // When to check
  timing: {
    morningBriefing: true,         // 7 AM daily
    beforeDeparture: true,         // 30 min before leaving for venue
    onDemand: true,                // User asks
  };
  
  // Data sources (priority order)
  sources: [
    "google_places",               // Primary (but expensive)
    "cached_hours",                // 24-hour cache
    "user_reports",                // Crowdsourced
    "official_website_scrape",     // Backup
  ];
  
  // Cache strategy
  cache: {
    regularHours: "24_hours",      // Cache normal hours
    specialClosures: "1_hour",     // Check more frequently
    holidays: "7_days",            // Fetch holiday schedules weekly
  };
}
```

---

## Server-Side Event Engine Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                          ExecutionEventEngine                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────────┐  │
│  │  LocationMonitor │  │   TimeMonitor    │  │   ExternalDataMonitor    │  │
│  │                  │  │                  │  │                          │  │
│  │ • GPS polling    │  │ • Slot timers    │  │ • Weather API            │  │
│  │ • Geofence mgmt  │  │ • Booking alerts │  │ • Closure checks         │  │
│  │ • Arrival detect │  │ • Day boundaries │  │ • Transit status         │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────────┬─────────────┘  │
│           │                     │                          │                │
│           └─────────────────────┼──────────────────────────┘                │
│                                 ▼                                           │
│                    ┌─────────────────────────┐                              │
│                    │    Event Aggregator     │                              │
│                    │                         │                              │
│                    │ • Deduplicate           │                              │
│                    │ • Merge related events  │                              │
│                    │ • Priority queue        │                              │
│                    │ • Rate limiting         │                              │
│                    └────────────┬────────────┘                              │
│                                 │                                           │
│                                 ▼                                           │
│                    ┌─────────────────────────┐                              │
│                    │  Completion Analyzer    │                              │
│                    │                         │                              │
│                    │ • Multi-signal scoring  │                              │
│                    │ • State transitions     │                              │
│                    │ • Lock slot on complete │                              │
│                    └────────────┬────────────┘                              │
│                                 │                                           │
│                                 ▼                                           │
│                    ┌─────────────────────────┐                              │
│                    │   Agent Formatter       │                              │
│                    │                         │                              │
│                    │ • Natural language      │                              │
│                    │ • Personality/tone      │                              │
│                    │ • Context awareness     │                              │
│                    └────────────┬────────────┘                              │
│                                 │                                           │
└─────────────────────────────────┼───────────────────────────────────────────┘
                                  │
                                  ▼ (SSE / WebSocket / Push Notification)
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Client                                          │
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                         Chat Panel                                   │   │
│  │                                                                      │   │
│  │  🤖 Agent: "You've arrived at Senso-ji! 🏯                          │   │
│  │            Tip: The famous Thunder Gate is straight ahead."         │   │
│  │                                                                      │   │
│  │  🤖 Agent: "You've been here about an hour. Your lunch at           │   │
│  │            Ichiran is in 40 min (15 min walk). No rush!"            │   │
│  │                                                                      │   │
│  │  You: "Actually I want to stay longer"                              │   │
│  │                                                                      │   │
│  │  🤖 Agent: "No problem! I'll push lunch to 1 PM. The ramen         │   │
│  │            shop has flexible seating."                              │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Event Types & Priority

```typescript
type ExecutionEventType =
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

type EventPriority = "low" | "normal" | "high" | "urgent";

interface ExecutionEvent {
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
  
  // Actions
  suggestedActions?: Array<{
    label: string;
    action: string;
    payload?: Record<string, unknown>;
  }>;
  
  // Display
  showInChat: boolean;
  showAsNotification: boolean;
  autoDismissSeconds?: number;
}
```

---

## Implementation Phases

### Phase 1: Core Infrastructure
- [ ] Event type definitions
- [ ] Event aggregator with deduplication
- [ ] SSE endpoint for client
- [ ] Basic agent message formatting

### Phase 2: Time-Based Events
- [ ] Slot timer system
- [ ] Morning briefing generator
- [ ] Booking reminders
- [ ] Duration warnings

### Phase 3: Location Events (Simulation First)
- [ ] Simulated GPS for demo
- [ ] Geofence management
- [ ] Arrival/departure detection
- [ ] Dwell time tracking

### Phase 4: Smart Completion
- [ ] Multi-signal scoring
- [ ] State machine
- [ ] Auto-complete logic
- [ ] Slot locking on complete

### Phase 5: External Data
- [ ] Weather integration
- [ ] Closure checking (cached)
- [ ] Transit status
- [ ] Crowd estimation

### Phase 6: Real GPS
- [ ] Browser Geolocation API
- [ ] Background location (PWA)
- [ ] Battery optimization

---

## Example Event Flow

```
8:00 AM - Morning Briefing
  └─▶ Agent posts day summary to chat

8:15 AM - User opens app  
  └─▶ Agent: "Ready for breakfast at hotel? Kitchen closes at 9 AM."

8:45 AM - User leaves hotel (geofence exit)
  └─▶ Mark breakfast as COMPLETED
  └─▶ Agent: "Heading to Senso-ji! It's a 20 min walk. Here's the route."

9:10 AM - User enters Senso-ji geofence
  └─▶ Mark Senso-ji as IN_PROGRESS
  └─▶ Agent: "You've arrived at Senso-ji! 🏯 Thunder Gate is ahead."

9:50 AM - 80% of planned time elapsed
  └─▶ Agent: "You've been exploring for 40 min. Lunch at 11 AM (30 min away)."

10:15 AM - User leaves Senso-ji (geofence exit)
  └─▶ Mark Senso-ji as COMPLETED (confidence: 85)
  └─▶ Agent: "Done at Senso-ji! Heading to Nakamise Street (5 min walk)."

10:20 AM - User at Nakamise (adjacent to Senso-ji)
  └─▶ This was "free time" slot, auto-started
  └─▶ Agent: "Enjoy the shops! Look for the melon pan bakery on the left."
```

---

## Rate Limiting & UX

### Message Throttling Rules

```typescript
const THROTTLE_RULES = {
  // Don't spam the user
  minSecondsBetweenMessages: 120,  // 2 min minimum gap
  maxMessagesPerHour: 10,
  
  // Priority overrides
  urgentBypassThrottle: true,      // Urgent events always go through
  
  // Batching
  batchRelatedEvents: true,        // Combine "arrived" + "tips" into one
  batchWindowSeconds: 10,          // Wait 10s to collect related events
  
  // Quiet hours
  quietHours: {
    start: "22:00",
    end: "07:00",
    allowUrgentOnly: true,
  },
};
```

### When NOT to Message

- User is actively typing in chat
- User just sent a message (wait for response window)
- Same event type sent in last 30 min
- User has muted notifications for this activity
- Low-priority event during high activity period

---

## Data Requirements

### Client → Server (Location Updates)

```typescript
interface LocationUpdate {
  tripId: string;
  userId: string;
  timestamp: Date;
  location: {
    lat: number;
    lng: number;
    accuracy: number;
    heading?: number;
    speed?: number;
  };
  batteryLevel?: number;  // Adjust polling frequency
}
```

### Server → Client (Event Push)

```typescript
interface EventPush {
  type: "execution_event";
  event: ExecutionEvent;
  
  // State updates
  slotUpdates?: Array<{
    slotId: string;
    status: ActivityExecutionStatus;
    completedAt?: Date;
  }>;
  
  // UI hints
  scrollToSlot?: string;
  highlightSlot?: string;
  showDecisionModal?: boolean;
}
```

---

## Testing Strategy

### Simulation Mode

For development/demo, simulate:
- GPS coordinates moving along planned route
- Time acceleration (1 min = 1 sec)
- Random events (delays, closures)
- User behavior patterns

### Scenario Presets

```typescript
const DEMO_SCENARIOS = {
  perfectDay: {
    description: "Everything goes smoothly",
    events: ["arrivals", "completions"],
  },
  
  lateStart: {
    description: "User oversleeps by 45 min",
    events: ["late_wakeup", "reschedule_suggestions"],
  },
  
  unexpectedClosure: {
    description: "Main attraction is closed",
    events: ["closure_alert", "alternative_suggestions"],
  },
  
  weatherChange: {
    description: "Rain starts at 2 PM",
    events: ["weather_warning", "indoor_swap_suggestions"],
  },
  
  runningBehind: {
    description: "User lingers at each stop",
    events: ["duration_warnings", "booking_at_risk", "skip_suggestions"],
  },
};
```
