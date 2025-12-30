# Ticket Availability & Reservation System Design

## Problem Statement

When creating itineraries for places that require tickets (museums, observation decks, theme parks), we need to:
1. **Know which POIs need reservations** - Not all attractions require advance booking
2. **Check real-time availability** - Some popular places sell out days/weeks ahead
3. **Know where to book** - Direct link to official site or partner (Klook/Viator)
4. **Match itinerary slots with available tickets** - Ensure the time slot in itinerary aligns with actual ticket availability

---

## Current Data Sources

### 1. POI Ticket Requirement Data (Static)

| Source | Data Available | Confidence |
|--------|---------------|------------|
| **Curated** | Manual entries for famous places | 1.0 |
| **OSM fee tag** | `osmTags.fee: "yes"/"no"` | 0.85 |
| **Klook inference** | Has ticket/admission experiences | 0.7 |
| **Category** | Museums, theme parks = required | 0.5 |

**Current `TicketInfo` structure:**
```typescript
interface TicketInfo {
  requirement: "required" | "optional" | "free";
  fee: string;  // "2200 JPY"
  source: "curated" | "osm" | "klook" | "category";
  confidence: number;
  bookingAdvice?: {
    advanceBookingRequired: boolean;
    recommendedBookingDays?: number;  // Book X days ahead
    walkUpAvailable?: boolean;
    peakTimes?: string[];
    tips?: string;
  };
}
```

### 2. Booking Providers

| Provider | Data Type | Availability API | Booking Link |
|----------|-----------|------------------|--------------|
| **Klook** | Static JSON | ❌ No | ✅ URL in data |
| **Viator** | Live API | ✅ `/availability/check` | ✅ productUrl |
| **Official Sites** | None | ❌ No | Manual curation |

---

## Proposed Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        ITINERARY GENERATOR                          │
│  ┌─────────────┐     ┌──────────────┐     ┌───────────────────┐    │
│  │  POI Data   │────▶│ Ticket Check │────▶│ Availability Check│    │
│  │  (Static)   │     │  (Required?) │     │   (Real-time)     │    │
│  └─────────────┘     └──────────────┘     └───────────────────┘    │
│                                                     │               │
│                                                     ▼               │
│                              ┌────────────────────────────────────┐ │
│                              │     Booking Time Slot Matcher      │ │
│                              │  (Match itinerary with available   │ │
│                              │   ticket time slots)               │ │
│                              └────────────────────────────────────┘ │
│                                                     │               │
│                                                     ▼               │
│                              ┌────────────────────────────────────┐ │
│                              │      Itinerary with Bookings       │ │
│                              │  - Confirmed time slots            │ │
│                              │  - Booking links                   │ │
│                              │  - Warnings for sold-out dates     │ │
│                              └────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Detailed Design

### 1. POI Reservation Requirement Classification

#### Data Model Extension

```typescript
interface ReservationInfo {
  // Basic requirement
  requirement: "required" | "recommended" | "optional" | "not-needed";

  // Timing
  advanceBookingDays: number | null;  // null = walk-up OK
  timedEntry: boolean;                 // true = specific time slot required

  // Booking
  bookingChannels: BookingChannel[];
  preferredChannel?: string;           // "klook" | "viator" | "official"

  // Peak patterns
  peakPeriods: PeakPeriod[];
  sellOutRisk: "high" | "medium" | "low";

  // Last updated
  dataSource: "curated" | "inferred";
  lastVerified?: string;  // ISO date
}

interface BookingChannel {
  provider: "klook" | "viator" | "official" | "other";
  productId?: string;      // klook-25300 or viator product code
  url: string;
  price?: {
    amount: number;
    currency: string;
  };
  hasAvailabilityAPI: boolean;
}

interface PeakPeriod {
  type: "weekends" | "holidays" | "season" | "time-of-day";
  description: string;
  sellOutLikelihood: "certain" | "likely" | "possible";
}
```

#### Curated Data Example

```typescript
const RESERVATION_DATABASE: Record<string, ReservationInfo> = {
  "teamlab-planets": {
    requirement: "required",
    advanceBookingDays: 7,
    timedEntry: true,
    bookingChannels: [
      {
        provider: "klook",
        productId: "klook-25300",
        url: "https://www.klook.com/activity/25300",
        price: { amount: 3800, currency: "JPY" },
        hasAvailabilityAPI: false,
      },
      {
        provider: "viator",
        productId: "12345P1",
        url: "https://viator.com/...",
        hasAvailabilityAPI: true,
      },
      {
        provider: "official",
        url: "https://planets.teamlab.art/tokyo/",
        hasAvailabilityAPI: false,
      }
    ],
    preferredChannel: "official",
    peakPeriods: [
      { type: "weekends", description: "Weekends", sellOutLikelihood: "certain" },
      { type: "holidays", description: "Japanese holidays", sellOutLikelihood: "certain" },
      { type: "time-of-day", description: "Sunset slots", sellOutLikelihood: "likely" },
    ],
    sellOutRisk: "high",
    dataSource: "curated",
    lastVerified: "2024-12-01",
  },

  "senso-ji": {
    requirement: "not-needed",
    advanceBookingDays: null,
    timedEntry: false,
    bookingChannels: [],  // Free temple
    sellOutRisk: "low",
    dataSource: "curated",
  },

  "ghibli-museum": {
    requirement: "required",
    advanceBookingDays: 30,  // Must book 1 month ahead via Lawson
    timedEntry: true,
    bookingChannels: [
      {
        provider: "official",
        url: "https://l-tike.com/ghibli/",
        hasAvailabilityAPI: false,
      }
    ],
    preferredChannel: "official",
    peakPeriods: [
      { type: "season", description: "Always busy", sellOutLikelihood: "certain" },
    ],
    sellOutRisk: "high",
    dataSource: "curated",
  },
};
```

---

### 2. Availability Check System

#### API Design

```typescript
// Request
interface AvailabilityRequest {
  poi: {
    id: string;
    name: string;
  };
  date: string;           // "2025-01-15"
  timeSlot?: string;      // "14:00" - optional, for timed entry
  travelers: number;
}

// Response
interface AvailabilityResponse {
  poiId: string;
  date: string;
  status: "available" | "limited" | "sold-out" | "unknown";

  // If timed entry
  availableSlots?: TimeSlotAvailability[];

  // Booking options ranked by preference
  bookingOptions: BookingOption[];

  // Warnings
  warnings?: string[];
}

interface TimeSlotAvailability {
  time: string;           // "14:00"
  status: "available" | "limited" | "sold-out";
  remainingCapacity?: number;  // If provider exposes this
}

interface BookingOption {
  provider: "klook" | "viator" | "official";
  productId: string;
  url: string;
  price: { amount: number; currency: string };
  status: "available" | "limited" | "sold-out" | "check-manually";
  availableSlots?: string[];  // ["10:00", "14:00", "16:00"]
}
```

#### Availability Check Flow

```
┌────────────────┐
│ Check Request  │
│ (POI + Date)   │
└───────┬────────┘
        │
        ▼
┌────────────────────────────────────┐
│ 1. Get POI Reservation Info        │
│    - Is reservation required?      │
│    - What booking channels exist?  │
└───────┬────────────────────────────┘
        │
        ▼
┌────────────────────────────────────┐
│ 2. For each booking channel:       │
│    ┌─────────────────────────────┐ │
│    │ Viator? → Call /availability│ │
│    │ Klook?  → Return "unknown"  │ │
│    │ Official? → Return "check   │ │
│    │             manually"       │ │
│    └─────────────────────────────┘ │
└───────┬────────────────────────────┘
        │
        ▼
┌────────────────────────────────────┐
│ 3. Aggregate & Rank Results        │
│    - Best price                    │
│    - Most reliable availability    │
│    - Preferred channel             │
└───────┬────────────────────────────┘
        │
        ▼
┌────────────────────────────────────┐
│ 4. Return Availability Response    │
│    - Status                        │
│    - Available time slots          │
│    - Booking links                 │
└────────────────────────────────────┘
```

---

### 3. Itinerary Slot ↔ Ticket Matching

#### Problem

When we generate an itinerary slot like:
```
Day 1, 14:00-16:30: teamLab Planets
```

We need to ensure:
1. Tickets are available for Jan 15, 2025
2. There's a 14:00 entry slot (if timed entry)
3. We have a booking link to show

#### Solution: Availability-Aware Itinerary Generation

```typescript
interface ItinerarySlotWithBooking {
  // Existing slot info
  time: { start: string; end: string };
  activity: ActivityInfo;

  // NEW: Booking status
  booking?: {
    required: boolean;
    status: "confirmed" | "pending" | "action-needed" | "not-available";

    // If reservation required
    reservation?: {
      provider: string;
      productId: string;
      bookingUrl: string;
      timeSlot?: string;        // "14:00" if timed entry
      price?: { amount: number; currency: string };
      confirmationNeeded: boolean;
    };

    // Warnings
    warnings?: string[];
    // e.g., "This date may sell out - book 7+ days ahead"
    // e.g., "14:00 slot not available, 15:00 available"
  };
}
```

#### Matching Algorithm

```typescript
async function matchItineraryWithAvailability(
  itinerary: Itinerary,
  tripDates: { start: string; end: string }
): Promise<ItineraryWithBookings> {

  const result = { ...itinerary };

  for (const day of itinerary.days) {
    const date = calculateDate(tripDates.start, day.dayNumber);

    for (const slot of day.slots) {
      // Skip if doesn't need reservation
      const reservationInfo = getReservationInfo(slot.activity.poiId);
      if (reservationInfo.requirement === "not-needed") {
        slot.booking = { required: false, status: "confirmed" };
        continue;
      }

      // Check availability
      const availability = await checkAvailability({
        poi: slot.activity,
        date,
        timeSlot: slot.time.start,
        travelers: itinerary.travelers,
      });

      // Match time slot
      if (reservationInfo.timedEntry) {
        const desiredTime = slot.time.start;  // "14:00"
        const matchingSlot = availability.availableSlots?.find(
          s => s.time === desiredTime && s.status === "available"
        );

        if (matchingSlot) {
          slot.booking = {
            required: true,
            status: "pending",  // User needs to book
            reservation: {
              provider: availability.bookingOptions[0].provider,
              bookingUrl: availability.bookingOptions[0].url,
              timeSlot: desiredTime,
              price: availability.bookingOptions[0].price,
              confirmationNeeded: true,
            },
          };
        } else {
          // Desired time not available - find alternative
          const alternative = availability.availableSlots?.find(
            s => s.status === "available"
          );

          if (alternative) {
            slot.booking = {
              required: true,
              status: "action-needed",
              reservation: {
                provider: availability.bookingOptions[0].provider,
                bookingUrl: availability.bookingOptions[0].url,
                timeSlot: alternative.time,
                price: availability.bookingOptions[0].price,
                confirmationNeeded: true,
              },
              warnings: [
                `${desiredTime} not available. ${alternative.time} is available - adjust itinerary?`
              ],
            };
          } else {
            slot.booking = {
              required: true,
              status: "not-available",
              warnings: [
                `No tickets available for ${date}. Consider changing date or removing from itinerary.`
              ],
            };
          }
        }
      } else {
        // No timed entry - just check date availability
        if (availability.status === "available" || availability.status === "limited") {
          slot.booking = {
            required: true,
            status: "pending",
            reservation: {
              provider: availability.bookingOptions[0].provider,
              bookingUrl: availability.bookingOptions[0].url,
              price: availability.bookingOptions[0].price,
              confirmationNeeded: true,
            },
            warnings: availability.status === "limited"
              ? ["Limited availability - book soon!"]
              : undefined,
          };
        } else {
          slot.booking = {
            required: true,
            status: availability.status === "unknown" ? "action-needed" : "not-available",
            warnings: [
              availability.status === "unknown"
                ? "Availability unknown - check provider website"
                : `Sold out for ${date}`
            ],
          };
        }
      }
    }
  }

  return result;
}
```

---

### 4. UI Booking Flow

#### Itinerary Card States

```
┌────────────────────────────────────────────────────┐
│ 🎫 14:00 - 16:30  teamLab Planets                  │
│ ─────────────────────────────────────────────────  │
│ ✅ CONFIRMED                                       │
│ No reservation needed                              │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ 🎫 14:00 - 16:30  teamLab Planets                  │
│ ─────────────────────────────────────────────────  │
│ 🟡 BOOKING NEEDED                                  │
│ 14:00 slot available • ¥3,800                      │
│ ┌──────────────────────────────────────────────┐   │
│ │  🔗 Book on Klook  │  🔗 Official Site       │   │
│ └──────────────────────────────────────────────┘   │
│ ⚠️ Sells out on weekends - book 7+ days ahead     │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ 🎫 14:00 - 16:30  teamLab Planets                  │
│ ─────────────────────────────────────────────────  │
│ ⚠️ TIME SLOT UNAVAILABLE                           │
│ 14:00 sold out. Available: 10:00, 16:00            │
│ ┌──────────────────────────────────────────────┐   │
│ │  📅 Adjust to 16:00  │  ❌ Remove activity   │   │
│ └──────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────┐
│ 🎫 14:00 - 16:30  teamLab Planets                  │
│ ─────────────────────────────────────────────────  │
│ ❌ SOLD OUT                                        │
│ No tickets available for Jan 15                    │
│ ┌──────────────────────────────────────────────┐   │
│ │  📅 Try different date  │  ❌ Remove         │   │
│ └──────────────────────────────────────────────┘   │
└────────────────────────────────────────────────────┘
```

---

### 5. Data Flow Summary

```
                    ┌─────────────────────────────────────────┐
                    │           CURATED DATABASE              │
                    │  (Famous places with reservation info)  │
                    └────────────────────┬────────────────────┘
                                         │
                    ┌────────────────────▼────────────────────┐
                    │          POI ENHANCEMENT SCRIPT         │
                    │  1. Match POI names to curated data     │
                    │  2. Add reservation info to POIs        │
                    │  3. Link booking channels               │
                    └────────────────────┬────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                        ENHANCED POI DATA                            │
│  tokyo.enhanced.json                                                │
│  ├── mustSee[]                                                      │
│  │   ├── ticketInfo                                                 │
│  │   ├── reservationInfo  ◀── NEW                                  │
│  │   │   ├── requirement: "required"                                │
│  │   │   ├── advanceBookingDays: 7                                  │
│  │   │   ├── timedEntry: true                                       │
│  │   │   ├── bookingChannels[]                                      │
│  │   │   └── sellOutRisk: "high"                                    │
│  │   └── linkedExperiences[]  (Klook/Viator products)               │
│  └── ...                                                            │
└────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      ITINERARY GENERATOR                            │
│  1. User inputs trip dates + preferences                            │
│  2. Select POIs for itinerary                                       │
│  3. For each POI needing reservation:                               │
│     └── Check availability (Viator API if available)                │
│  4. Match itinerary time slots with available tickets               │
│  5. Return itinerary with booking status                            │
└────────────────────────────────────────────────────────────────────┘
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      ITINERARY RESPONSE                             │
│  {                                                                  │
│    days: [{                                                         │
│      slots: [{                                                      │
│        time: { start: "14:00", end: "16:30" },                     │
│        activity: { name: "teamLab Planets", ... },                 │
│        booking: {                                                   │
│          required: true,                                            │
│          status: "pending",                                         │
│          reservation: {                                             │
│            provider: "klook",                                       │
│            bookingUrl: "https://klook.com/...",                    │
│            timeSlot: "14:00",                                       │
│            price: { amount: 3800, currency: "JPY" }                │
│          },                                                         │
│          warnings: ["Sells out on weekends"]                        │
│        }                                                            │
│      }]                                                             │
│    }]                                                               │
│  }                                                                  │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Implementation Phases

### Phase 1: Curated Reservation Database (1-2 days)
- [ ] Create `RESERVATION_DATABASE` for top 50 Japan attractions
- [ ] Add `reservationInfo` to enhanced POI data
- [ ] Update enhancement script to merge reservation info

### Phase 2: Availability Check API (2-3 days)
- [ ] Create `/api/availability/check` endpoint
- [ ] Implement Viator availability check
- [ ] Handle Klook (return "unknown" with booking URL)
- [ ] Add caching to avoid excessive API calls

### Phase 3: Itinerary-Booking Matching (2-3 days)
- [ ] Extend itinerary slot type with booking info
- [ ] Implement matching algorithm
- [ ] Handle time slot conflicts & alternatives
- [ ] Add warnings for sold-out risk

### Phase 4: UI Integration (2-3 days)
- [ ] Add booking status badges to itinerary cards
- [ ] Show booking links and prices
- [ ] Add "Adjust time" / "Remove" actions
- [ ] Show availability warnings during planning

---

## Open Questions

1. **Viator vs Klook priority?**
   - Viator has availability API but may not have all products
   - Klook has more Japan coverage but no availability API

2. **Fallback when no availability API?**
   - Show "Check availability" link with warning
   - Use historical patterns (weekends = likely sold out)

3. **Caching strategy?**
   - Availability changes fast - cache for how long?
   - 15 min for "sold out"? 1 hour for "available"?

4. **Booking confirmation tracking?**
   - Let users mark slots as "booked"?
   - Save confirmation numbers?
