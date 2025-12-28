# Gap Analysis: Semantic Model Plan vs Current Implementation

## Executive Summary

This document provides a detailed analysis of gaps between the **semantic model plan** (`data-schema for UI manipulation.md`) and the **current implementation** (`UnifiedItineraryView.tsx` and supporting files). It includes a prioritized implementation plan to address each gap.

---

## 1. Architecture Overview

### Current Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        UI LAYER                                  │
├─────────────────────────────────────────────────────────────────┤
│  UnifiedItineraryView.tsx  ←→  SlotOptions.tsx                  │
│  DraggableActivityList.tsx ←→  ItineraryMap.tsx                 │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                      DATA TYPES                                  │
├─────────────────────────────────────────────────────────────────┤
│  structured-itinerary.ts                                        │
│  - SlotWithOptions, DayWithOptions, ActivityOption              │
│  - SlotBehavior, SlotDependency, ActivityCluster                │
│  - ActivityFragility, ReplacementOption                         │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                    SERVICE LAYER                                 │
├─────────────────────────────────────────────────────────────────┤
│  structured-itinerary-parser.ts  - Parse/transform              │
│  day-reordering-service.ts       - Reorder operations           │
│  inter-city-transport.ts         - Transport calculations       │
│  reshuffling-service.ts          - Trigger-based reshuffling    │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────▼─────────────────────────────────────┐
│                      API LAYER                                   │
├─────────────────────────────────────────────────────────────────┤
│  /api/reshuffle/check   - Check triggers                        │
│  /api/reshuffle/apply   - Apply reshuffle                       │
│  /api/reshuffle/undo    - Undo reshuffle                        │
│  /api/weather/*         - Weather monitoring                    │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Detailed Gap Analysis

### 2.1 Data Model Gaps

| Feature | Plan Definition | Type Definition | Implementation | Status |
|---------|----------------|-----------------|----------------|--------|
| **Slot.rigidityScore** | 0-1 scale for flexibility | ✅ `rigidityScore?: number` | ✅ `calculateRigidityScore()` | ✅ Complete |
| **Slot.behavior** | anchor/flex/optional/meal/travel | ✅ `SlotBehavior` type | ✅ `inferSlotBehavior()` | ✅ Complete |
| **Slot.dependencies** | must-before/after constraints | ✅ `SlotDependency[]` | ⚠️ `checkDependencyViolations()` defined but not used in UI | 🟡 Partial |
| **Slot.clusterId** | Geographic grouping | ✅ `clusterId?: string` | ✅ `calculateClusters()` | ✅ Complete |
| **Slot.replacementPool** | Fallback activities | ✅ `ReplacementOption[]` | ❌ Not populated or used | 🔴 Missing |
| **Slot.fragility** | Weather/crowd/booking sensitivity | ✅ `ActivityFragility` | ⚠️ `FragilityBadge` displays but no action | 🟡 Partial |
| **Slot.isLocked** | User-locked status | ✅ `isLocked?: boolean` | ⚠️ UI shows lock but handler disconnected | 🟡 Partial |
| **Activity.duration min/max** | Flexible duration range | ❌ Only `duration: number` | ❌ Not implemented | 🔴 Missing |
| **Activity.timeWindow** | Earliest/latest constraints | ❌ Not in types | ❌ Not implemented | 🔴 Missing |

### 2.2 Semantic Actions Gaps

| Action | Plan Definition | Implementation | Gap Details |
|--------|----------------|----------------|-------------|
| **Move activity** | Drag to different slot/time | ⚠️ `handleMoveSlotToDay()` | Works for cross-day, but within-day is option-swapping not true move |
| **Swap activities** | Exchange two activities | ❌ Not implemented | No explicit swap action |
| **Resize duration** | Extend/shorten activity | ❌ Not implemented | No UI control to adjust duration |
| **Delete activity** | Remove from slot | ⚠️ `handleClearSlot()` defined | Handler exists but not wired to UI buttons |
| **Add activity** | Insert into slot/flex window | ⚠️ `FreeTimeSlotCard` | Shows suggestions but doesn't actually add (just calls onSelectOption with fake ID) |
| **Prioritize** | Increase rigidityScore | ⚠️ `handleToggleLock()` | Only toggles lock, doesn't adjust score granularly |
| **Deprioritize** | Lower rigidityScore | ❌ Not implemented | No UI to mark as optional |
| **Block time** | Reserve for rest/travel | ❌ Not implemented | No explicit block time action |
| **Replace activity** | Swap with alternative | ❌ Not implemented | No replacement pool logic |
| **Undo/Redo** | History tracking | ✅ `history[]`, `handleUndo()` | ✅ Complete (undo works, redo not implemented) |

### 2.3 Constraint Validation Gaps

| Constraint Layer | Plan Definition | Implementation | Gap Details |
|-----------------|-----------------|----------------|-------------|
| **Temporal constraints** | start/end, duration validation | ✅ `validateItinerary()` | Detects overlaps, commute conflicts |
| **Travel/Transit constraints** | Feasibility check before moves | ❌ Not implemented | No pre-move validation |
| **Clustering constraints** | Avoid splitting clusters | ⚠️ `calculateClusters()` exists | Not used to warn/prevent breaking clusters |
| **Dependency constraints** | must-before/after enforcement | ⚠️ `checkDependencyViolations()` | Defined but not called from UI |
| **Energy/Pacing constraints** | Walking distance, fatigue | ❌ Not implemented | No fatigue tracking |
| **Fragility/Risk constraints** | Weather/crowd adaptation | ⚠️ Weather hook exists | Not integrated with reshuffling UI |
| **Multi-day constraints** | Intercity travel blocking | ⚠️ `inter-city-transport.ts` | Services exist but not integrated |

### 2.4 UI/UX Gaps

| Feature | Plan Definition | Implementation | Gap Details |
|---------|----------------|----------------|-------------|
| **Visual drop zones** | Green outline for feasible drops | ❌ Not implemented | Framer-motion Reorder has no visual feedback |
| **Conflict highlighting** | Red highlight on overlap | ⚠️ Impact panel shows issues | Not real-time during drag |
| **Anchor lock icons** | Locked/highlighted for anchors | ✅ `SlotBehaviorBadge` | Shows icon but interaction limited |
| **Snap-to-cluster** | Auto-snap nearby activities | ❌ Not implemented | No spatial awareness during drag |
| **Travel time visualization** | Auto-shift with visual indication | ⚠️ `CommuteBlock` shows times | No animation when times change |
| **Chat directives** | Natural language commands | ❌ Not implemented | No NLP → action mapping |
| **Guided suggestions** | LLM suggests alternatives | ⚠️ Static `ACTIVITY_SUGGESTIONS` | Not context-aware or API-backed |

### 2.5 Disconnected Handlers

These handlers are **defined but not wired** to any UI elements:

| Handler | Location | Issue |
|---------|----------|-------|
| `handleClearSlot` | Line 1045 | Trash button in `ReorderableSlots` doesn't call it |
| `handleToggleLock` | Line 1082 | Lock button doesn't call it |
| `handleSplitSlot` | Line 1115 | Never called from any UI |
| `onDeleteOption` | ReorderableSlots props | Optional prop never provided |
| `onClearSlot` | ListDayView props | Optional prop never provided |
| `onToggleLock` | ListDayView props | Optional prop never provided |

---

## 3. Implementation Plan

### Phase 1: Wire Disconnected Handlers (1-2 days)

**Priority: Critical** - These are quick wins that enable existing functionality.

#### Task 1.1: Wire `handleClearSlot` to Trash button
```typescript
// In UnifiedItineraryView.tsx, pass handler to ListDayView
<ListDayView
  ...
  onClearSlot={handleClearSlot}  // ADD THIS
/>

// In ReorderableSlots, update Trash button onClick
<button
  onClick={() => onClearSlot?.(dayIndex, slot.slotId)}  // WIRE THIS
  ...
>
```

#### Task 1.2: Wire `handleToggleLock` to Lock button
```typescript
// Similar pattern - pass through component hierarchy
<ListDayView
  ...
  onToggleLock={handleToggleLock}  // ADD THIS
/>
```

#### Task 1.3: Wire `onDeleteOption` for removing individual options
```typescript
// Create handler in UnifiedItineraryView
const handleDeleteOption = useCallback((slotId: string, optionId: string) => {
  // Remove option from slot, recalculate times
}, []);

// Pass to ReorderableSlots
```

---

### Phase 2: Travel Time Feasibility (2-3 days)

**Priority: High** - Core semantic model requirement.

#### Task 2.1: Create `useTravelFeasibility` hook
```typescript
// src/hooks/useTravelFeasibility.ts
export function useTravelFeasibility() {
  const checkMoveFeasibility = async (
    activity: ActivityOption,
    targetSlot: SlotWithOptions,
    precedingSlot?: SlotWithOptions,
    followingSlot?: SlotWithOptions
  ): Promise<{
    feasible: boolean;
    travelToTarget: number;  // minutes
    travelFromTarget: number;
    warnings: string[];
    suggestedBuffer?: number;
  }> => {
    // Use haversineDistance + estimated travel modes
    // Return feasibility and required buffer
  };

  return { checkMoveFeasibility };
}
```

#### Task 2.2: Integrate feasibility check before moves
```typescript
// In handleMoveSlotToDay, add pre-check
const handleMoveSlotToDay = useCallback(async (
  sourceDayIndex: number,
  slotId: string,
  targetDayIndex: number
) => {
  const feasibility = await checkMoveFeasibility(...);

  if (!feasibility.feasible) {
    // Show warning modal with option to proceed or cancel
    if (!confirm(`Travel time exceeds gap. Proceed anyway?`)) {
      return;
    }
  }

  // ... existing logic
}, [...]);
```

#### Task 2.3: Add real-time travel time updates
```typescript
// When slots change, recalculate commute times using actual coordinates
const recalculateCommuteTimes = async (slots: SlotWithOptions[]) => {
  // Call Google Maps / Mapbox API for accurate times
  // Update commuteFromPrevious for each slot
};
```

---

### Phase 3: Drag & Drop Enhancements (3-4 days)

**Priority: High** - Critical for intuitive UX.

#### Task 3.1: Add visual drop zones
```typescript
// Create DragDropContext wrapper with visual feedback
function DragDropZone({
  isOver,
  canDrop,
  children
}: {
  isOver: boolean;
  canDrop: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn(
      "transition-all rounded-lg",
      isOver && canDrop && "ring-2 ring-green-500 bg-green-50",
      isOver && !canDrop && "ring-2 ring-red-500 bg-red-50"
    )}>
      {children}
    </div>
  );
}
```

#### Task 3.2: Implement true drag-drop (not just reorder)
```typescript
// Replace Reorder.Group with react-beautiful-dnd or custom DnD
// Allow dragging activities between any slots, not just reordering
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';

// Provide onDragEnd handler that:
// 1. Validates the move
// 2. Shows conflict if any
// 3. Applies the change
// 4. Recalculates times
```

#### Task 3.3: Add cluster awareness
```typescript
// When dragging, highlight other activities in same cluster
const [highlightedCluster, setHighlightedCluster] = useState<string | null>(null);

// On drag start, find activity's cluster and highlight siblings
const onDragStart = (activity: ActivityOption) => {
  const cluster = clusters.find(c => c.activityIds.includes(activity.id));
  setHighlightedCluster(cluster?.clusterId || null);
};
```

---

### Phase 4: Dependency Enforcement (2 days)

**Priority: Medium** - Important for logical itineraries.

#### Task 4.1: Validate dependencies on every change
```typescript
// After any slot modification, check dependencies
const validateAndWarn = useCallback((updatedItinerary: StructuredItineraryData) => {
  const allDependencies = updatedItinerary.days.flatMap(day =>
    day.slots.flatMap(slot => slot.dependencies || [])
  );

  const violations = checkDependencyViolations(
    updatedItinerary.days.flatMap(d => d.slots),
    allDependencies
  );

  if (violations.length > 0) {
    // Show toast or modal with violations
    showToast({
      type: 'warning',
      message: `Ordering constraint violated: ${violations[0].message}`
    });
  }

  return violations.length === 0;
}, []);
```

#### Task 4.2: Block moves that violate hard dependencies
```typescript
// In drag handlers, prevent drop if it violates must-before/after
const canDrop = (sourceSlot: SlotWithOptions, targetSlot: SlotWithOptions): boolean => {
  // Check if moving source after target would violate dependencies
  return !wouldViolateDependencies(sourceSlot, targetSlot);
};
```

---

### Phase 5: Energy/Pacing Constraints (2-3 days)

**Priority: Medium** - Improves trip quality.

#### Task 5.1: Track daily walking distance
```typescript
// Add to structured-itinerary.ts
export interface DayMetrics {
  totalWalkingDistance: number;  // meters
  totalCommuteTime: number;      // minutes
  activityCount: number;
  intensityScore: number;        // 0-1 (high = packed day)
}

// Calculate for each day
const calculateDayMetrics = (day: DayWithOptions): DayMetrics => {
  let walkingDistance = 0;
  let commuteTime = 0;

  for (const slot of day.slots) {
    if (slot.commuteFromPrevious?.method === 'walk') {
      walkingDistance += slot.commuteFromPrevious.distance;
    }
    commuteTime += slot.commuteFromPrevious?.duration || 0;
  }

  return {
    totalWalkingDistance: walkingDistance,
    totalCommuteTime: commuteTime,
    activityCount: day.slots.filter(s => s.options.length > 0).length,
    intensityScore: calculateIntensity(walkingDistance, commuteTime, day.slots.length)
  };
};
```

#### Task 5.2: Show pacing warnings
```typescript
// In validateItinerary, add pacing checks
if (dayMetrics.totalWalkingDistance > 10000) {  // > 10km
  issues.push({
    type: 'warning',
    dayNumber: day.dayNumber,
    message: 'Heavy walking day',
    details: `${(dayMetrics.totalWalkingDistance / 1000).toFixed(1)}km walking. Consider transit.`
  });
}

if (dayMetrics.activityCount > 6) {
  issues.push({
    type: 'info',
    dayNumber: day.dayNumber,
    message: 'Packed schedule',
    details: 'Consider moving some activities to lighter days.'
  });
}
```

#### Task 5.3: Suggest rest slots
```typescript
// When consecutive walking activities detected, suggest break
const suggestRestSlots = (slots: SlotWithOptions[]): { afterSlotId: string; reason: string }[] => {
  const suggestions = [];
  let consecutiveWalkingSlots = 0;

  for (let i = 0; i < slots.length; i++) {
    const slot = slots[i];
    const activity = slot.options.find(o => o.id === slot.selectedOptionId);

    if (activity?.activity.tags.includes('outdoor') || activity?.activity.tags.includes('walking')) {
      consecutiveWalkingSlots++;
      if (consecutiveWalkingSlots >= 3) {
        suggestions.push({
          afterSlotId: slot.slotId,
          reason: 'Consider a café break after 3 walking activities'
        });
      }
    } else {
      consecutiveWalkingSlots = 0;
    }
  }

  return suggestions;
};
```

---

### Phase 6: Weather Integration (3-4 days)

**Priority: Medium** - Critical for real-time adjustments.

#### Task 6.1: Connect useWeatherMonitor to UnifiedItineraryView
```typescript
// In parent component that renders UnifiedItineraryView
const weatherMonitor = useWeatherMonitor({
  tripId,
  city: itinerary.days[activeDayIndex]?.city || '',
  onWeatherChange: (trigger) => {
    // Show reshuffle suggestion modal
    setShowReshuffleModal(true);
    setReshuffleTrigger(trigger);
  },
  onWeatherAlert: (alert) => {
    // Show toast notification
    showToast({
      type: alert.severity === 'severe' ? 'error' : 'warning',
      message: alert.message
    });
  }
});
```

#### Task 6.2: Show weather impact on activities
```typescript
// Enhance SlotBehaviorBadge or create WeatherImpactBadge
function WeatherImpactBadge({
  slot,
  weatherViability
}: {
  slot: SlotWithOptions;
  weatherViability: OutdoorViability | null;
}) {
  if (!weatherViability || !slot.fragility) return null;

  const impact = getActivityImpact(slot.fragility.weatherSensitivity, weatherViability);

  if (impact === 'good') return null;

  return (
    <span className={cn(
      "px-2 py-0.5 rounded text-xs",
      impact === 'poor' && "bg-red-100 text-red-700",
      impact === 'fair' && "bg-amber-100 text-amber-700"
    )}>
      {impact === 'poor' ? '⚠️ Weather risk' : '🌤️ Check weather'}
    </span>
  );
}
```

#### Task 6.3: Suggest indoor alternatives when weather is bad
```typescript
// When weather turns bad, suggest replacements from replacementPool
const suggestWeatherAlternatives = (
  slot: SlotWithOptions,
  weatherViability: OutdoorViability
): ReplacementOption[] => {
  if (weatherViability.viability !== 'poor' && weatherViability.viability !== 'impossible') {
    return [];
  }

  if (!slot.fragility?.weatherSensitivity || slot.fragility.weatherSensitivity === 'none') {
    return [];
  }

  // Return indoor alternatives from replacement pool
  return (slot.replacementPool || []).filter(r =>
    r.reason.includes('indoor') || r.reason.includes('rainy')
  );
};
```

---

### Phase 7: Chat Directive Integration (5-7 days)

**Priority: Low** - Nice-to-have for power users.

#### Task 7.1: Create directive parser
```typescript
// src/lib/chat-directive-parser.ts
export interface ParsedDirective {
  action: 'move' | 'swap' | 'add' | 'delete' | 'prioritize' | 'deprioritize' | 'suggest';
  activityName?: string;
  activityId?: string;
  targetTime?: string;  // "morning", "afternoon", etc.
  targetDay?: number;
  priority?: 'must-do' | 'optional';
  location?: string;    // "near Shinjuku"
}

export function parseDirective(input: string): ParsedDirective | null {
  // Use regex patterns + keyword matching
  // Examples:
  // "Move TeamLab to morning" → { action: 'move', activityName: 'TeamLab', targetTime: 'morning' }
  // "Add sushi lunch near Shinjuku" → { action: 'add', targetTime: 'lunch', location: 'near Shinjuku' }
}
```

#### Task 7.2: Create directive executor
```typescript
// src/lib/chat-directive-executor.ts
export async function executeDirective(
  directive: ParsedDirective,
  itinerary: StructuredItineraryData
): Promise<{
  success: boolean;
  updatedItinerary?: StructuredItineraryData;
  message: string;
  clarificationNeeded?: string;
}> {
  switch (directive.action) {
    case 'move':
      return handleMoveDirective(directive, itinerary);
    case 'swap':
      return handleSwapDirective(directive, itinerary);
    // ... etc
  }
}
```

#### Task 7.3: Add chat input UI
```typescript
// ChatDirectiveInput component
function ChatDirectiveInput({
  onExecute
}: {
  onExecute: (directive: ParsedDirective) => void
}) {
  const [input, setInput] = useState('');

  const handleSubmit = () => {
    const directive = parseDirective(input);
    if (directive) {
      onExecute(directive);
      setInput('');
    } else {
      // Show "I didn't understand" message
    }
  };

  return (
    <div className="flex gap-2">
      <input
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Try: Move TeamLab to morning"
        className="flex-1 px-4 py-2 border rounded-lg"
      />
      <button onClick={handleSubmit}>Send</button>
    </div>
  );
}
```

---

### Phase 8: Replacement Pool & Smart Suggestions (4-5 days)

**Priority: Low** - Enhances flexibility.

#### Task 8.1: Populate replacement pools during generation
```typescript
// In generate-structured API, LLM should return alternatives
// Update prompt to include:
// "For each activity, provide 2-3 alternatives with reasons"

// Transform into replacementPool
slot.replacementPool = alternatives.map((alt, i) => ({
  id: `${slot.slotId}-alt-${i}`,
  activity: alt.activity,
  reason: alt.reason,  // "rainy day alternative", "similar but closer"
  priority: i + 1
}));
```

#### Task 8.2: Show replacement suggestions on activity delete
```typescript
// When clearing a slot, offer to fill with suggestion
const handleClearSlotWithSuggestion = (dayIndex: number, slotId: string) => {
  const slot = findSlot(slotId);
  const replacements = slot?.replacementPool || [];

  if (replacements.length > 0) {
    setShowReplacementModal({
      slotId,
      dayIndex,
      options: replacements
    });
  } else {
    handleClearSlot(dayIndex, slotId);
  }
};
```

#### Task 8.3: Integrate with Place Resolver for real suggestions
```typescript
// Use place-resolver.ts to fetch real nearby places
const fetchNearbySuggestions = async (
  coordinates: { lat: number; lng: number },
  category: string,
  duration: number
): Promise<ReplacementOption[]> => {
  // Call Google Places API with location bias
  // Filter by category
  // Return as ReplacementOption[]
};
```

---

## 4. Priority Summary

| Phase | Priority | Effort | Impact | Dependencies |
|-------|----------|--------|--------|--------------|
| Phase 1: Wire Handlers | 🔴 Critical | 1-2 days | High | None |
| Phase 2: Travel Feasibility | 🟠 High | 2-3 days | High | Phase 1 |
| Phase 3: Drag & Drop | 🟠 High | 3-4 days | High | Phase 1 |
| Phase 4: Dependencies | 🟡 Medium | 2 days | Medium | Phase 1 |
| Phase 5: Energy/Pacing | 🟡 Medium | 2-3 days | Medium | None |
| Phase 6: Weather | 🟡 Medium | 3-4 days | Medium | Phase 2 |
| Phase 7: Chat Directives | 🟢 Low | 5-7 days | Low | Phase 1-4 |
| Phase 8: Replacements | 🟢 Low | 4-5 days | Medium | Phase 6 |

---

## 5. Quick Wins (< 1 day each)

1. **Wire `handleClearSlot` to Trash button** - 30 min
2. **Wire `handleToggleLock` to Lock button** - 30 min
3. **Add redo functionality** - 1 hour (reverse undo logic)
4. **Show dependency violations in Impact Panel** - 1 hour
5. **Add pacing warnings to validateItinerary** - 2 hours
6. **Show cluster membership in slot cards** - 1 hour

---

## 6. Testing Strategy

### Unit Tests
- `calculateRigidityScore()` - verify scoring logic
- `checkDependencyViolations()` - test ordering constraints
- `recalculateTimeSlots()` - test gap insertion/removal
- `calculateClusters()` - test spatial grouping

### Integration Tests
- Move activity within day → verify time recalculation
- Move activity across days → verify both days updated
- Clear slot → verify free time inserted
- Lock/unlock → verify rigidity changes

### E2E Tests
- Full drag-drop workflow
- Weather-triggered reshuffle flow
- Chat directive → action execution

---

## 7. Metrics to Track

1. **User engagement**: Time spent in reorder mode
2. **Feasibility warnings**: % of moves that trigger warnings
3. **Undo usage**: How often users undo changes
4. **Chat directive success rate**: % parsed correctly
5. **Weather adaptation**: % of suggestions accepted

---

## Appendix: File Reference

| File | Purpose |
|------|---------|
| `src/types/structured-itinerary.ts` | All type definitions |
| `src/lib/structured-itinerary-parser.ts` | Parse/transform functions |
| `src/lib/day-reordering-service.ts` | Backend reordering logic |
| `src/lib/inter-city-transport.ts` | Transport calculations |
| `src/hooks/useWeatherMonitor.ts` | Weather integration hook |
| `src/components/itinerary/UnifiedItineraryView.tsx` | Main UI component |
| `src/components/itinerary/SlotOptions.tsx` | Slot rendering |
| `src/components/itinerary/DraggableActivityList.tsx` | Drag-drop components |
| `src/app/api/reshuffle/*` | Reshuffle API routes |
