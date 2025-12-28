# Activity Suggestion Engine - Integration Plan

## Current Implementation Status

### ✅ Phase 1: Types & Data Structures (COMPLETE)
**File:** `/src/types/activity-suggestion.ts` (~950 lines)

| Component | Status | Description |
|-----------|--------|-------------|
| `CoreActivity` | ✅ | Base activity with all metadata |
| `RestaurantActivity` | ✅ | Yelp-integrated restaurant |
| `ScoredActivity` | ✅ | Activity with 100-point scoring |
| `ScheduledSlot` | ✅ | Slot with commute, conflicts |
| `DaySchedule` | ✅ | Full day with slots |
| `TripContext` | ✅ | User preferences, weather, mode |
| `TripMode` (9 types) | ✅ | family, couples, honeymoon, solo, friends, etc. |

---

### ✅ Phase 2: Scoring Engine (COMPLETE)
**File:** `/src/lib/scoring-engine.ts` (~1200 lines)

| Component | Points | Status |
|-----------|--------|--------|
| Interest Match | 25 | ✅ |
| Time-of-Day Fit | 20 | ✅ |
| Duration Fit | 15 | ✅ |
| Budget Match | 15 | ✅ |
| Weather Appropriate | 10 | ✅ |
| Variety (no repeat) | 10 | ✅ |
| Rating/Reviews | 5 | ✅ |
| **Total** | **100** | ✅ |

**Features:**
- `ScoringEngine` class with full 100-point algorithm
- Trip mode adjustments (family gets +25% for familyFriendly)
- Penalty system for conflicts
- Batch scoring with ranking

---

### ✅ Phase 3: Activity Generation (COMPLETE)
**File:** `/src/lib/activity-generation.ts` (~800 lines)

| Component | Status | Description |
|-----------|--------|-------------|
| OpenAI Integration | ✅ | Structured prompts for AI activities |
| Yelp Integration | ✅ | Restaurant generation |
| Viator Integration | ✅ | Bookable experiences |
| Pool Builder | ✅ | Combines all sources |
| Weather Filtering | ✅ | Filters outdoor activities |

---

### ✅ Phase 4: Schedule Builder (COMPLETE)
**File:** `/src/lib/schedule-builder.ts` (~1400 lines)

| Component | Status | Description |
|-----------|--------|-------------|
| Time Slot Templates | ✅ | DEFAULT, RELAXED, PACKED, etc. |
| `ScheduleBuilder` class | ✅ | Main orchestrator |
| `buildDaySchedule()` | ✅ | Single day scheduling |
| `buildTripSchedule()` | ✅ | Multi-day trip |
| Geographic optimization | ✅ | Greedy nearest-neighbor |
| Commute estimation | ✅ | Uses routing service |

---

### ✅ Phase 5: Swap Service (COMPLETE)
**File:** `/src/lib/swap-service.ts` (~1200 lines)

| Component | Status | Description |
|-----------|--------|-------------|
| Tinder-style Cards | ✅ | Swipe left/right/up |
| `SwapService` class | ✅ | Card stack management |
| `getSwapOptions()` | ✅ | Generate alternatives |
| `executeSwap()` | ✅ | Replace activity |
| Smart placement | ✅ | AI-powered suggestions |
| Weather-based swaps | ✅ | Rain alternatives |

---

### ✅ Phase 6: Entity Resolution (COMPLETE)
**File:** `/src/lib/entity-resolution.ts` (~1100 lines)

| Component | Status | Description |
|-----------|--------|-------------|
| Google Places lookup | ✅ | Canonical place IDs |
| Yelp lookup | ✅ | Business verification |
| Viator lookup | ✅ | Bookable products |
| Conflict resolution | ✅ | Merge multi-source data |
| Grounding status | ✅ | verified/partially-verified/unverified |
| Operating hours | ✅ | Open/close validation |

---

### ✅ Phase 7: API Integration (COMPLETE)

**Files Created:**
- `/src/lib/itinerary-orchestrator.ts` (~550 lines) - Main coordinator service
- `/src/lib/itinerary-store.ts` (~365 lines) - In-memory state management
- `/src/app/api/itinerary/generate/route.ts` (~150 lines) - Generate itinerary
- `/src/app/api/itinerary/[id]/route.ts` (~180 lines) - CRUD operations
- `/src/app/api/itinerary/[id]/slot/[slotId]/route.ts` (~145 lines) - Swap operations

| Component | Status | Description |
|-----------|--------|-------------|
| `ItineraryOrchestrator` | ✅ | Coordinates all services |
| `ItineraryStore` | ✅ | In-memory store with TTL, LRU eviction |
| `/api/itinerary/generate` | ✅ | Generate new itinerary |
| `/api/itinerary/[id]` GET/PUT/DELETE | ✅ | CRUD operations |
| `/api/itinerary/[id]/slot/[slotId]` GET/PUT | ✅ | Swap options & execution |

---

### ✅ Phase 8: Testing Infrastructure (COMPLETE)

**Files Created:**
- `/vitest.config.ts` - Vitest configuration
- `/vitest.setup.ts` - Test setup file
- `/src/lib/__tests__/mock-factories.ts` (~430 lines) - Comprehensive mock data factories
- `/src/lib/__tests__/itinerary-store.test.ts` (19 tests) - Store tests
- `/src/lib/__tests__/itinerary-orchestrator.test.ts` (27 tests) - Orchestrator tests
- `/src/lib/__tests__/api-endpoints.test.ts` (29 tests) - API integration tests

| Test Suite | Tests | Status |
|------------|-------|--------|
| ItineraryStore | 19 | ✅ All passing |
| ItineraryOrchestrator | 27 | ✅ All passing |
| API Endpoints | 29 | ✅ All passing |
| **Total** | **75** | ✅ **All passing** |

**Test Coverage:**
- CRUD operations (save, get, update, delete)
- Query operations (getAll, getByStatus, getRecent)
- TTL expiration & LRU eviction
- Event subscription system
- Swap options & swap execution
- Swipe processing (keep, reject, save-for-later)
- Lock/unlock activities
- Confirm itinerary
- Legacy Trip conversion
- API request validation
- Error handling (400, 404, 500 responses)

---

### ✅ Phase 9: UI Component Integration (COMPLETE)

**Files Created:**
- `/src/hooks/useItinerary.ts` (~200 lines) - React Query hooks for API integration
- `/src/hooks/useActivitySelection.ts` (~360 lines) - Swipe selection with scoring
- `/src/components/planner/SwapOptionsModal.tsx` (~495 lines) - Modal for swapping activities
- `/src/components/planner/ActivityScoreCard.tsx` (~740 lines) - Card with score breakdown display
- `/src/store/itinerary-store.ts` (~300 lines) - Zustand store for itinerary state
- `/src/hooks/index.ts` - Central exports for hooks
- `/src/components/planner/index.ts` - Central exports for planner components

| Component | Status | Description |
|-----------|--------|-------------|
| `useItinerary` hook | ✅ | React Query for itinerary CRUD |
| `useCreateItinerary` mutation | ✅ | Create new itinerary |
| `useSwapActivity` mutation | ✅ | Execute activity swap |
| `useActivitySelection` hook | ✅ | Swipe selection with scoring helpers |
| `getScoreColor/Label/BgColor/Gradient` | ✅ | Score display utilities |
| `buildSelectionSlots` | ✅ | Slot builder from activities |
| `SwapOptionsModal` | ✅ | Modal with alternatives list |
| `ActivityScoreCard` | ✅ | Three variants: default, compact, detailed |
| `ScoreBadge` | ✅ | Circular score indicator |
| `ScoreBreakdown` | ✅ | Animated breakdown bars |
| `useItineraryStore` (Zustand) | ✅ | State management with undo/redo |

**Test Results:** All 96 tests passing (27 orchestrator + 29 API + 21 e2e + 19 store)

---

### 🔶 Phase 10: Full Integration Testing (IN PROGRESS)

**Completed:**
- ✅ Type bridge (`/src/lib/type-bridge.ts`) - Convert between old/new type systems
  - `viatorToCoreActivity()` - Viator → CoreActivity
  - `viatorToScoredActivity()` - Viator → ScoredActivity with score breakdown
  - `scoredActivityToViator()` - ScoredActivity → Viator (backward compatibility)
  - Type guards: `isScoredActivity()`, `isViatorActivity()`, `isCoreActivity()`
  - Normalizers: `normalizeToScoredActivity()`, `normalizeToViator()`
- ✅ Type bridge tests (32 tests passing)

**Remaining Work:**
- Wire UI components to live TripPlannerPane
- End-to-end user flow testing with real API calls
- Performance optimization for swap animations

---

## Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           API LAYER (New)                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  /api/itinerary/generate    ──────────────────────────────────────────────┐ │
│       │                                                                   │ │
│       ├─► Activity Generation Service                                    │ │
│       │     ├─► OpenAI (CoreActivity pool)                              │ │
│       │     ├─► Yelp (RestaurantActivity pool)                          │ │
│       │     └─► Viator (Bookable enhancements)                          │ │
│       │                                                                   │ │
│       ├─► Entity Resolution Service                                      │ │
│       │     └─► Link to Google/Yelp/Viator IDs                          │ │
│       │                                                                   │ │
│       ├─► Scoring Engine                                                 │ │
│       │     └─► Score all activities for each slot                      │ │
│       │                                                                   │ │
│       └─► Schedule Builder                                               │ │
│             └─► Build optimized daily schedules                          │ │
│                                                                           │ │
│  /api/itinerary/[id]/slot/[slotId]/swap  ─────────────────────────────┐  │ │
│       │                                                                │  │ │
│       └─► Swap Service                                                 │  │ │
│             ├─► Get alternatives for slot                             │  │ │
│             ├─► Tinder card stack                                     │  │ │
│             └─► Execute swap                                          │  │ │
│                                                                        │  │ │
│  /api/itinerary/[id]/slot/[slotId]/options  ──────────────────────────┘  │ │
│       │                                                                   │ │
│       └─► Returns ranked alternatives (top 5)                            │ │
│                                                                           │ │
│  /api/itinerary/[id]/validate  ──────────────────────────────────────────┘ │
│       │                                                                     │
│       └─► Entity Resolution Service                                         │
│             └─► Check operating hours, verify places exist                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Gap Analysis

### Missing Components

| Component | Priority | Effort | Description |
|-----------|----------|--------|-------------|
| **Itinerary API** | 🔴 HIGH | 3-4 hrs | New `/api/itinerary/*` endpoints |
| **Type Bridge** | 🔴 HIGH | 1-2 hrs | Convert old `Trip` ↔ new `DaySchedule` |
| **UI Integration** | 🟡 MEDIUM | 4-6 hrs | Connect new APIs to frontend |
| **Swap UI** | 🟡 MEDIUM | 3-4 hrs | Tinder-style card component |
| **Entity Cache** | 🟢 LOW | 2 hrs | Redis/memory cache for resolved entities |

### Type Incompatibilities

**Old System (`src/types/index.ts`):**
```typescript
interface Trip {
  days: DayPlan[];
  preferences: TripPreferences;  // budget: 'budget'|'moderate'|'luxury'
}

interface ItineraryItem {
  activity: Activity;  // Old Activity type
  timeSlot: TimeSlot;
}
```

**New System (`src/types/activity-suggestion.ts`):**
```typescript
interface TripSchedule {
  days: DaySchedule[];
  tripContext: TripContext;  // Much richer context
}

interface ScheduledSlot {
  activity: ScoredActivity;  // Has scoring breakdown
  commuteFromPrevious?: CommuteInfo;
  conflicts: SlotConflict[];
}
```

**Solution:** Create adapter functions to convert between systems.

---

## Implementation Plan

### Step 1: Type Bridge & Converters (1-2 hours)

Create `/src/lib/type-converters.ts`:

```typescript
// Convert old Trip to new TripContext + activities
export function tripToTripContext(trip: Trip): TripContext { ... }

// Convert new DaySchedule[] back to old DayPlan[]
export function scheduleToDayPlans(schedules: DaySchedule[]): DayPlan[] { ... }

// Convert new ScoredActivity to old Activity
export function scoredActivityToActivity(scored: ScoredActivity): Activity { ... }

// Convert old Activity to CoreActivity
export function activityToCoreActivity(activity: Activity): CoreActivity { ... }
```

### Step 2: Itinerary Orchestrator Service (2-3 hours)

Create `/src/lib/itinerary-orchestrator.ts`:

```typescript
export class ItineraryOrchestrator {
  private activityGenerator: ActivityGenerationService;
  private entityResolver: EntityResolutionService;
  private scoringEngine: ScoringEngine;
  private scheduleBuilder: ScheduleBuilder;
  private swapService: SwapService;

  // Main entry point - generates complete itinerary
  async generateItinerary(request: ItineraryRequest): Promise<ItineraryResult> {
    // 1. Generate activity pool
    const pool = await this.activityGenerator.generateActivityPool(...);

    // 2. Resolve entities (verify real places)
    const resolved = await this.entityResolver.resolveBatch(pool);

    // 3. Build schedule with scoring
    const schedule = await this.scheduleBuilder.buildTripSchedule(...);

    // 4. Return with alternatives
    return { schedule, alternatives: ... };
  }

  // Get swap options for a slot
  async getSlotOptions(
    itineraryId: string,
    slotId: string
  ): Promise<SwapOption[]> { ... }

  // Execute swap
  async swapActivity(
    itineraryId: string,
    slotId: string,
    newActivityId: string
  ): Promise<DaySchedule> { ... }
}
```

### Step 3: New API Endpoints (2-3 hours)

#### `/api/itinerary/generate/route.ts`
```typescript
POST /api/itinerary/generate
Body: {
  destination: string;
  startDate: string;
  endDate: string;
  travelers: TravelersInfo;
  tripMode: TripMode;
  preferences: { interests, budget, pace, dietaryRestrictions };
}
Response: {
  itinerary: TripSchedule;
  stats: { activitiesGenerated, verified, avgScore };
}
```

#### `/api/itinerary/[id]/route.ts`
```typescript
GET /api/itinerary/:id
Response: { itinerary: TripSchedule }

PATCH /api/itinerary/:id
Body: { days?: DaySchedule[] }
Response: { itinerary: TripSchedule }
```

#### `/api/itinerary/[id]/day/[dayIndex]/slot/[slotId]/options/route.ts`
```typescript
GET /api/itinerary/:id/day/:dayIndex/slot/:slotId/options
Query: { count?: number, reason?: SwapReason }
Response: {
  options: SwapOption[];
  currentActivity: ScoredActivity;
}
```

#### `/api/itinerary/[id]/day/[dayIndex]/slot/[slotId]/swap/route.ts`
```typescript
POST /api/itinerary/:id/day/:dayIndex/slot/:slotId/swap
Body: {
  action: 'keep' | 'reject' | 'save-for-later';
  newActivityId?: string;
}
Response: {
  updatedDay: DaySchedule;
  nextCard?: ActivityCard;
}
```

#### `/api/itinerary/[id]/validate/route.ts`
```typescript
POST /api/itinerary/:id/validate
Response: {
  valid: boolean;
  issues: ValidationIssue[];
  resolvedActivities: number;
}
```

### Step 4: Session/State Management (1-2 hours)

Options:
1. **In-Memory Store** (simplest for MVP)
2. **Redis** (production-ready)
3. **Database** (persistent)

Create `/src/lib/itinerary-store.ts`:
```typescript
// Temporary in-memory store for itineraries
const itineraryStore = new Map<string, TripSchedule>();
const swipeSessionStore = new Map<string, SwipeSession>();

export function saveItinerary(id: string, schedule: TripSchedule): void;
export function getItinerary(id: string): TripSchedule | null;
export function saveSwipeSession(sessionId: string, session: SwipeSession): void;
```

### Step 5: Backward Compatibility (1 hour)

Update `/api/trips/generate/route.ts` to:
1. Use new orchestrator internally
2. Convert output to old `Trip` format
3. Maintain existing API contract

```typescript
// In /api/trips/generate/route.ts
import { ItineraryOrchestrator } from "@/lib/itinerary-orchestrator";
import { scheduleToDayPlans, scoredActivityToActivity } from "@/lib/type-converters";

export async function POST(request: NextRequest) {
  // ... parse request ...

  // Use new system
  const orchestrator = new ItineraryOrchestrator();
  const result = await orchestrator.generateItinerary({
    destination: body.destination,
    // ... convert old format to new ...
  });

  // Convert back to old format for backward compatibility
  const trip: Trip = {
    // ... use type converters ...
    days: scheduleToDayPlans(result.schedule.days),
  };

  return NextResponse.json({ success: true, data: { trip } });
}
```

---

## Recommended Implementation Order

```
Week 1: Core Integration
├── Day 1-2: Type converters + Orchestrator service
├── Day 3: /api/itinerary/generate endpoint
├── Day 4: Backward compatibility with /api/trips/generate
└── Day 5: Testing & bug fixes

Week 2: Swap & Options
├── Day 1-2: /api/itinerary/[id]/slot/options endpoint
├── Day 3-4: /api/itinerary/[id]/slot/swap endpoint
└── Day 5: Testing & refinement

Week 3: UI Integration
├── Day 1-2: Slot options dropdown/modal
├── Day 3-4: Tinder-style swap cards
└── Day 5: Polish & edge cases
```

---

## Quick Start: Minimal Integration (2-3 hours)

If you want to test the new system quickly:

1. Create a simple test endpoint `/api/itinerary/test/route.ts`
2. Wire up: Activity Generation → Scoring → Schedule Building
3. Return the new `TripSchedule` format
4. Test with Postman/curl

```typescript
// /api/itinerary/test/route.ts
import { ActivityGenerationService } from "@/lib/activity-generation";
import { ScoringEngine } from "@/lib/scoring-engine";
import { ScheduleBuilder } from "@/lib/schedule-builder";

export async function POST(request: NextRequest) {
  const body = await request.json();

  // 1. Generate activities
  const generator = new ActivityGenerationService();
  const pool = await generator.generateActivityPool({
    destination: body.destination,
    tripDates: { start: new Date(body.startDate), end: new Date(body.endDate) },
    travelers: body.travelers,
    tripMode: body.tripMode || 'couples',
    preferences: body.preferences,
  });

  // 2. Build schedule
  const builder = new ScheduleBuilder();
  const schedule = await builder.buildTripSchedule(
    pool.activities,
    pool.restaurants,
    // ... context
  );

  return NextResponse.json({
    success: true,
    data: { schedule, stats: pool.stats }
  });
}
```

---

## Files to Create

| File | Purpose |
|------|---------|
| `/src/lib/type-converters.ts` | Convert between old/new type systems |
| `/src/lib/itinerary-orchestrator.ts` | Main integration service |
| `/src/lib/itinerary-store.ts` | In-memory state management |
| `/src/app/api/itinerary/generate/route.ts` | Generate itinerary endpoint |
| `/src/app/api/itinerary/[id]/route.ts` | Get/update itinerary |
| `/src/app/api/itinerary/[id]/day/[dayIndex]/slot/[slotId]/options/route.ts` | Get alternatives |
| `/src/app/api/itinerary/[id]/day/[dayIndex]/slot/[slotId]/swap/route.ts` | Execute swap |
| `/src/app/api/itinerary/[id]/validate/route.ts` | Validate with entity resolution |

---

## Summary

**What's Done:**
- ✅ Complete type system for activity suggestions (Phase 1)
- ✅ 100-point scoring algorithm (Phase 2)
- ✅ Activity generation from AI/Yelp/Viator (Phase 3)
- ✅ Schedule building with geographic optimization (Phase 4)
- ✅ Tinder-style swap service (Phase 5)
- ✅ Entity resolution with multi-source verification (Phase 6)
- ✅ API integration with orchestrator & store (Phase 7)
- ✅ Testing infrastructure - 96 tests passing (Phase 8)
- ✅ UI component integration - hooks, modals, cards (Phase 9)

**What's Needed:**
- 🟡 Wire UI components to TripPlannerPane (Phase 10)
- 🟡 End-to-end user flow testing with real API calls
- 🟡 Performance optimization for swap animations

**Test Results:**
- 128 total tests passing
  - 27 orchestrator tests
  - 29 API endpoint tests
  - 21 e2e realistic tests
  - 19 store tests
  - 32 type bridge tests

**Recommended Next Step:**
Start **Phase 10** by wiring the new UI components (`SwapOptionsModal`, `ActivityScoreCard`) to the existing `TripPlannerPane` component and testing the complete user flow.
