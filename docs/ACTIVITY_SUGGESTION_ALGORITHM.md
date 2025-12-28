# Activity Suggestion Algorithm Design

---

## 🚀 IMPLEMENTATION STATUS & CHECKLIST

> **Current State:** LLM response renders in UI, but missing key features.
> **Target:** Full itinerary with options, places, commute, and food preferences.

### Missing Features Checklist

| Feature | Status | Implementation Location |
|---------|--------|------------------------|
| ✅ LLM Response | Working | `/api/chat/route.ts` |
| ⬜ Activity Options | Not Started | Need UI + API |
| ⬜ Place/Location Data | Not Started | Need entity resolution |
| ⬜ Commute Times | Not Started | Need Google Maps integration |
| ⬜ Choose from Options | Not Started | Need selection UI |
| ⬜ Food Preferences | Partial | Need Yelp filtering in response |

---

## 📋 IMPLEMENTATION PLAN

### PHASE 1: Structured LLM Response → UI Components

**Problem:** LLM returns text, but UI needs structured data for:
- Activity cards with options
- Restaurant cards with dietary filters
- Commute blocks between activities
- Selection interface

**Solution:** Modify LLM response to return structured JSON alongside text.

#### 1.1 Enhanced API Response Type

```typescript
// File: src/types/index.ts - ADD this interface

interface ItineraryResponse {
  // Text response for chat display
  message: string;

  // Structured data for UI components
  itinerary: {
    destination: string;
    days: DayWithOptions[];
  };

  // Metadata for the response
  metadata: {
    generatedAt: string;
    hasPlaces: boolean;
    hasCommute: boolean;
    hasFoodPreferences: boolean;
  };
}

interface DayWithOptions {
  dayNumber: number;
  date: string;
  city: string;
  title: string;
  slots: SlotWithOptions[];
}

interface SlotWithOptions {
  slotId: string;
  slotType: "morning" | "lunch" | "afternoon" | "dinner" | "evening";
  timeRange: { start: string; end: string };

  // CRITICAL: Multiple options per slot
  options: ActivityOption[];

  // User's selection (null until chosen)
  selectedOptionId: string | null;

  // Commute info from previous activity
  commuteFromPrevious?: CommuteInfo;
}

interface ActivityOption {
  id: string;
  rank: number;
  score: number;

  // Activity data
  activity: {
    name: string;
    description: string;
    category: string;
    duration: number; // minutes

    // PLACE DATA - Critical for maps
    place: PlaceData | null;

    // Cost info
    isFree: boolean;
    estimatedCost?: { amount: number; currency: string };

    // Tags for filtering
    tags: string[];

    // Source of this activity
    source: "ai" | "yelp" | "viator" | "google-places";
  };

  // For restaurants: food preferences match
  dietaryMatch?: {
    meetsRequirements: boolean;
    matchedPreferences: string[];
    warnings: string[];
  };

  // Why this was recommended
  matchReasons: string[];
  tradeoffs: string[];
}

interface PlaceData {
  googlePlaceId?: string;
  name: string;
  address: string;
  neighborhood: string;
  coordinates: { lat: number; lng: number };
  rating?: number;
  reviewCount?: number;
  photos?: string[];
  openingHours?: string[];
}

interface CommuteInfo {
  fromPlaceId: string;
  toPlaceId: string;
  duration: number; // minutes
  distance: number; // meters
  method: "walk" | "transit" | "taxi" | "drive";
  instructions: string;
  trainLines?: string[];
  cost?: { amount: number; currency: string };
}
```

#### 1.2 LLM Prompt Enhancement

```typescript
// File: src/lib/openai.ts - MODIFY the itinerary generation prompt

const ITINERARY_GENERATION_PROMPT = `
You are a travel planning AI. Generate a structured itinerary.

CRITICAL: Return BOTH a friendly text response AND structured JSON data.

Your response MUST follow this EXACT format:

---TEXT---
[Friendly conversational description of the itinerary]
---END_TEXT---

---JSON---
{
  "destination": "City Name",
  "days": [
    {
      "dayNumber": 1,
      "date": "YYYY-MM-DD",
      "city": "City Name",
      "title": "Day Theme",
      "slots": [
        {
          "slotId": "day1-morning",
          "slotType": "morning",
          "timeRange": { "start": "09:00", "end": "12:00" },
          "options": [
            {
              "id": "unique-id-1",
              "rank": 1,
              "score": 85,
              "activity": {
                "name": "Activity Name",
                "description": "What you'll do here",
                "category": "temple|museum|park|restaurant|...",
                "duration": 90,
                "place": {
                  "name": "Exact Place Name",
                  "address": "Full address",
                  "neighborhood": "Neighborhood Name",
                  "coordinates": { "lat": 35.1234, "lng": 139.1234 }
                },
                "isFree": true,
                "estimatedCost": null,
                "tags": ["family-friendly", "outdoor"],
                "source": "ai"
              },
              "matchReasons": ["Perfect for morning", "Kid-friendly"],
              "tradeoffs": ["Can be crowded"]
            },
            // 2-3 more options per slot
          ],
          "selectedOptionId": null,
          "commuteFromPrevious": null
        }
        // More slots...
      ]
    }
    // More days...
  ]
}
---END_JSON---

USER PREFERENCES:
- Destination: {{destination}}
- Dates: {{startDate}} to {{endDate}}
- Travelers: {{travelers}}
- Budget: {{budget}}
- Dietary Restrictions: {{dietaryRestrictions}}
- Interests: {{interests}}

RULES:
1. Provide 2-4 OPTIONS per time slot, ranked by fit
2. Include REAL place names with approximate coordinates
3. For restaurants, MUST filter by dietary restrictions
4. Consider commute time when suggesting nearby activities
5. Mark each activity with appropriate tags
`;
```

#### 1.3 Response Parser

```typescript
// File: src/lib/itinerary-parser.ts - ADD this function

interface ParsedItineraryResponse {
  text: string;
  structured: ItineraryResponse | null;
  parseError?: string;
}

export function parseItineraryResponse(llmResponse: string): ParsedItineraryResponse {
  // Extract text portion
  const textMatch = llmResponse.match(/---TEXT---([\s\S]*?)---END_TEXT---/);
  const text = textMatch ? textMatch[1].trim() : llmResponse;

  // Extract JSON portion
  const jsonMatch = llmResponse.match(/---JSON---([\s\S]*?)---END_JSON---/);

  if (!jsonMatch) {
    return {
      text,
      structured: null,
      parseError: "No structured JSON found in response"
    };
  }

  try {
    const structured = JSON.parse(jsonMatch[1].trim());
    return { text, structured };
  } catch (e) {
    return {
      text,
      structured: null,
      parseError: `JSON parse error: ${e.message}`
    };
  }
}
```

---

### PHASE 2: Place Data & Entity Resolution

**Problem:** AI generates place names, but we need:
- Google Place IDs for maps
- Verified coordinates
- Photos and ratings
- Opening hours

**Solution:** Post-process AI response with Google Places API.

#### 2.1 Place Resolution Service

```typescript
// File: src/lib/place-resolver.ts - CREATE this file

import { searchPlaces, getPlaceDetails } from "./google-places";

interface UnresolvedPlace {
  name: string;
  neighborhood?: string;
  city: string;
  country: string;
}

interface ResolvedPlace extends PlaceData {
  confidence: number; // 0-1, how sure we are this is correct
}

export async function resolvePlaces(
  itinerary: ItineraryResponse
): Promise<ItineraryResponse> {
  const resolvedItinerary = { ...itinerary };

  for (const day of resolvedItinerary.itinerary.days) {
    for (const slot of day.slots) {
      for (const option of slot.options) {
        if (!option.activity.place?.googlePlaceId) {
          // Need to resolve this place
          const resolved = await resolvePlace({
            name: option.activity.name,
            neighborhood: option.activity.place?.neighborhood,
            city: day.city,
            country: resolvedItinerary.itinerary.destination
          });

          if (resolved) {
            option.activity.place = resolved;
          }
        }
      }
    }
  }

  return resolvedItinerary;
}

async function resolvePlace(place: UnresolvedPlace): Promise<ResolvedPlace | null> {
  const query = `${place.name} ${place.neighborhood || ""} ${place.city}`;

  try {
    const results = await searchPlaces({
      query,
      location: { lat: 0, lng: 0 }, // Will be ignored for text search
      radius: 50000
    });

    if (results.length === 0) return null;

    const bestMatch = results[0];
    const details = await getPlaceDetails(bestMatch.place_id);

    return {
      googlePlaceId: details.place_id,
      name: details.name,
      address: details.formatted_address,
      neighborhood: extractNeighborhood(details),
      coordinates: {
        lat: details.geometry.location.lat,
        lng: details.geometry.location.lng
      },
      rating: details.rating,
      reviewCount: details.user_ratings_total,
      photos: details.photos?.slice(0, 5).map(p => p.photo_reference),
      openingHours: details.opening_hours?.weekday_text,
      confidence: calculateConfidence(place.name, details.name)
    };
  } catch (error) {
    console.error("Place resolution failed:", error);
    return null;
  }
}

function calculateConfidence(queryName: string, resultName: string): number {
  const queryLower = queryName.toLowerCase();
  const resultLower = resultName.toLowerCase();

  if (resultLower === queryLower) return 1.0;
  if (resultLower.includes(queryLower) || queryLower.includes(resultLower)) return 0.8;
  return 0.5;
}
```

---

### PHASE 3: Commute Time Calculation

**Problem:** Users need to know how long to get between activities.

**Solution:** Use Google Maps Directions API or pre-built matrices.

#### 3.1 Commute Service

```typescript
// File: src/lib/commute-service.ts - CREATE this file

interface CommuteRequest {
  origin: { lat: number; lng: number };
  destination: { lat: number; lng: number };
  mode: "walking" | "transit" | "driving";
  arrivalTime?: Date;
}

export async function calculateCommute(req: CommuteRequest): Promise<CommuteInfo> {
  // Option 1: Use Google Maps Directions API (accurate but costs money)
  if (process.env.USE_GOOGLE_DIRECTIONS === "true") {
    return await googleDirectionsCommute(req);
  }

  // Option 2: Use pre-built city matrices (free, approximate)
  return estimateFromMatrix(req);
}

// Fallback: Pre-built neighborhood matrices
const CITY_COMMUTE_MATRICES: Record<string, Record<string, Record<string, number>>> = {
  "Tokyo": {
    "Shinjuku": { "Shinjuku": 5, "Shibuya": 15, "Asakusa": 35, "Akihabara": 25 },
    "Shibuya": { "Shinjuku": 15, "Shibuya": 5, "Harajuku": 8, "Asakusa": 40 },
    "Asakusa": { "Shinjuku": 35, "Akihabara": 15, "Ueno": 10, "Odaiba": 45 },
    // ... more neighborhoods
  },
  "Kyoto": {
    "Kyoto Station": { "Fushimi Inari": 10, "Kiyomizu": 20, "Gion": 20, "Arashiyama": 25 },
    "Gion": { "Kiyomizu": 15, "Nishiki Market": 10, "Kyoto Station": 20 },
    // ... more neighborhoods
  }
};

function estimateFromMatrix(req: CommuteRequest): CommuteInfo {
  // Find nearest neighborhoods using coordinates
  const originNeighborhood = findNearestNeighborhood(req.origin);
  const destNeighborhood = findNearestNeighborhood(req.destination);

  const city = detectCity(req.origin);
  const matrix = CITY_COMMUTE_MATRICES[city];

  const duration = matrix?.[originNeighborhood]?.[destNeighborhood]
    || matrix?.[destNeighborhood]?.[originNeighborhood]
    || 30; // Default 30 min

  return {
    fromPlaceId: "",
    toPlaceId: "",
    duration,
    distance: duration * 500, // Rough: 500m per minute
    method: duration <= 10 ? "walk" : "transit",
    instructions: `${originNeighborhood} → ${destNeighborhood} (~${duration} min)`
  };
}
```

#### 3.2 Add Commute to Itinerary

```typescript
// File: src/lib/itinerary-orchestrator.ts - ADD this function

export async function addCommuteToItinerary(
  itinerary: GeneratedItinerary
): Promise<GeneratedItinerary> {
  for (const day of itinerary.days) {
    for (let i = 1; i < day.slots.length; i++) {
      const prevSlot = day.slots[i - 1];
      const currentSlot = day.slots[i];

      // Get selected or top-ranked option for each slot
      const prevPlace = getPlaceFromSlot(prevSlot);
      const currentPlace = getPlaceFromSlot(currentSlot);

      if (prevPlace?.coordinates && currentPlace?.coordinates) {
        currentSlot.commuteFromPrevious = await calculateCommute({
          origin: prevPlace.coordinates,
          destination: currentPlace.coordinates,
          mode: "transit"
        });
      }
    }
  }

  return itinerary;
}
```

---

### PHASE 4: Food Preferences & Restaurant Filtering

**Problem:** Restaurants don't respect dietary restrictions.

**Solution:** Enhanced Yelp filtering + AI awareness.

#### 4.1 Dietary Filter Service

```typescript
// File: src/lib/dietary-filter.ts - CREATE this file

export interface DietaryPreferences {
  restrictions: string[]; // "vegetarian", "vegan", "halal", etc.
  allergies: string[];
  avoid: string[];
}

// Map user preferences to Yelp categories
const YELP_CATEGORY_MAP: Record<string, string[]> = {
  "vegetarian": ["vegetarian", "vegan", "salad", "juice"],
  "vegan": ["vegan", "raw_food", "juice"],
  "halal": ["halal"],
  "kosher": ["kosher"],
  "gluten-free": ["gluten_free"],
  "no-pork": [], // Can't filter, just exclude results
  "no-beef": [], // Can't filter, just exclude results
};

const YELP_EXCLUDE_MAP: Record<string, string[]> = {
  "vegetarian": ["steakhouses", "bbq", "korean_bbq"],
  "vegan": ["steakhouses", "bbq", "seafood", "sushi"],
  "no-pork": ["bbq", "korean_bbq", "german", "southern"],
  "no-beef": ["steakhouses", "burgers"],
};

export function buildYelpSearchParams(
  prefs: DietaryPreferences,
  location: string,
  mealType: string
): YelpSearchParams {
  // Collect include categories
  const includeCategories = new Set<string>();
  for (const restriction of prefs.restrictions) {
    const categories = YELP_CATEGORY_MAP[restriction] || [];
    categories.forEach(c => includeCategories.add(c));
  }

  // Collect exclude patterns
  const excludePatterns = new Set<string>();
  for (const restriction of prefs.restrictions) {
    const patterns = YELP_EXCLUDE_MAP[restriction] || [];
    patterns.forEach(p => excludePatterns.add(p));
  }

  return {
    location,
    categories: Array.from(includeCategories).join(",") || "restaurants",
    excludePatterns: Array.from(excludePatterns),
    sort_by: "rating",
    limit: 20
  };
}

export function filterRestaurantResults(
  restaurants: YelpRestaurant[],
  prefs: DietaryPreferences
): YelpRestaurant[] {
  return restaurants.filter(r => {
    const categories = r.categories.map(c => c.alias.toLowerCase()).join(" ");

    // Exclude problematic categories
    for (const restriction of prefs.restrictions) {
      const excludes = YELP_EXCLUDE_MAP[restriction] || [];
      if (excludes.some(e => categories.includes(e))) {
        return false;
      }
    }

    return true;
  }).map(r => ({
    ...r,
    dietaryMatch: {
      meetsRequirements: true,
      matchedPreferences: prefs.restrictions,
      warnings: detectWarnings(r, prefs)
    }
  }));
}

function detectWarnings(restaurant: YelpRestaurant, prefs: DietaryPreferences): string[] {
  const warnings: string[] = [];
  const name = restaurant.name.toLowerCase();

  if (prefs.restrictions.includes("vegetarian") &&
      (name.includes("bbq") || name.includes("grill") || name.includes("steak"))) {
    warnings.push("Name suggests meat-focused, verify vegetarian options");
  }

  return warnings;
}
```

#### 4.2 Restaurant Integration in Itinerary

```typescript
// File: src/lib/itinerary-orchestrator.ts - MODIFY generateItinerary

async function populateMealSlots(
  day: DaySchedule,
  city: string,
  dietaryPrefs: DietaryPreferences
): Promise<void> {
  const mealSlots = day.slots.filter(s =>
    s.slotType === "lunch" || s.slotType === "dinner" || s.slotType === "breakfast"
  );

  for (const slot of mealSlots) {
    // Get neighborhood from previous activity
    const prevSlot = day.slots[day.slots.indexOf(slot) - 1];
    const neighborhood = prevSlot?.options[0]?.activity.place?.neighborhood || city;

    // Search for restaurants
    const searchParams = buildYelpSearchParams(dietaryPrefs, `${neighborhood}, ${city}`, slot.slotType);
    const results = await searchRestaurants(searchParams);
    const filtered = filterRestaurantResults(results, dietaryPrefs);

    // Convert to options
    slot.options = filtered.slice(0, 4).map((r, i) => ({
      id: `yelp-${r.id}`,
      rank: i + 1,
      score: Math.round(r.rating * 20),
      activity: {
        name: r.name,
        description: `${r.categories.map(c => c.title).join(", ")}`,
        category: "restaurant",
        duration: slot.slotType === "dinner" ? 90 : 60,
        place: {
          googlePlaceId: undefined,
          name: r.name,
          address: r.location.display_address.join(", "),
          neighborhood: r.location.city,
          coordinates: { lat: r.coordinates.latitude, lng: r.coordinates.longitude },
          rating: r.rating,
          reviewCount: r.review_count
        },
        isFree: false,
        estimatedCost: { amount: r.price?.length * 15 || 20, currency: "USD" },
        tags: ["restaurant", slot.slotType, ...r.categories.map(c => c.alias)],
        source: "yelp"
      },
      dietaryMatch: r.dietaryMatch,
      matchReasons: [
        `★ ${r.rating} rating (${r.review_count} reviews)`,
        `${r.price || "$$"} price range`,
        r.dietaryMatch?.meetsRequirements ? "✓ Meets dietary requirements" : ""
      ].filter(Boolean),
      tradeoffs: r.dietaryMatch?.warnings || []
    }));
  }
}
```

---

### PHASE 5: UI Components for Options Selection

**Problem:** Need UI for users to choose from options.

**Solution:** Build option selection components.

#### 5.1 Slot Options Component

```tsx
// File: src/components/itinerary/SlotOptions.tsx - CREATE this file

interface SlotOptionsProps {
  slot: SlotWithOptions;
  onSelectOption: (slotId: string, optionId: string) => void;
}

export function SlotOptions({ slot, onSelectOption }: SlotOptionsProps) {
  const [expanded, setExpanded] = useState(false);
  const selectedOption = slot.options.find(o => o.id === slot.selectedOptionId);
  const topOption = slot.options[0];
  const displayOption = selectedOption || topOption;

  return (
    <div className="slot-container">
      {/* Time Header */}
      <div className="slot-header">
        <span className="slot-time">{slot.timeRange.start} - {slot.timeRange.end}</span>
        <span className="slot-type">{slot.slotType}</span>
      </div>

      {/* Commute Block */}
      {slot.commuteFromPrevious && (
        <CommuteBlock commute={slot.commuteFromPrevious} />
      )}

      {/* Main Activity Card */}
      <ActivityOptionCard
        option={displayOption}
        isSelected={!!selectedOption}
        onSelect={() => onSelectOption(slot.slotId, displayOption.id)}
      />

      {/* Expand to see alternatives */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="see-alternatives-btn"
      >
        {expanded ? "Hide alternatives" : `See ${slot.options.length - 1} alternatives`}
      </button>

      {/* Alternative Options */}
      {expanded && (
        <div className="alternatives-grid">
          {slot.options.slice(1).map(option => (
            <ActivityOptionCard
              key={option.id}
              option={option}
              isCompact
              onSelect={() => onSelectOption(slot.slotId, option.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
```

#### 5.2 Activity Option Card

```tsx
// File: src/components/itinerary/ActivityOptionCard.tsx - CREATE this file

interface ActivityOptionCardProps {
  option: ActivityOption;
  isSelected?: boolean;
  isCompact?: boolean;
  onSelect: () => void;
}

export function ActivityOptionCard({ option, isSelected, isCompact, onSelect }: ActivityOptionCardProps) {
  const { activity, matchReasons, tradeoffs, dietaryMatch } = option;

  return (
    <div className={cn(
      "activity-card",
      isSelected && "selected",
      isCompact && "compact"
    )}>
      {/* Image */}
      {activity.place?.photos?.[0] && (
        <img src={getPhotoUrl(activity.place.photos[0])} alt={activity.name} />
      )}

      {/* Content */}
      <div className="card-content">
        <h3>{activity.name}</h3>
        <p className="description">{activity.description}</p>

        {/* Location & Duration */}
        <div className="meta">
          <span>📍 {activity.place?.neighborhood}</span>
          <span>⏱️ {activity.duration} min</span>
          <span>{activity.isFree ? "FREE" : `~$${activity.estimatedCost?.amount}`}</span>
        </div>

        {/* Rating */}
        {activity.place?.rating && (
          <div className="rating">
            ★ {activity.place.rating} ({activity.place.reviewCount} reviews)
          </div>
        )}

        {/* Dietary Match */}
        {dietaryMatch && (
          <DietaryBadge match={dietaryMatch} />
        )}

        {/* Match Reasons */}
        {!isCompact && matchReasons.length > 0 && (
          <ul className="match-reasons">
            {matchReasons.map((reason, i) => (
              <li key={i} className="text-green-600">{reason}</li>
            ))}
          </ul>
        )}

        {/* Tradeoffs */}
        {!isCompact && tradeoffs.length > 0 && (
          <ul className="tradeoffs">
            {tradeoffs.map((tradeoff, i) => (
              <li key={i} className="text-amber-600">{tradeoff}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Select Button */}
      <button onClick={onSelect} className="select-btn">
        {isSelected ? "✓ Selected" : "Choose This"}
      </button>
    </div>
  );
}
```

#### 5.3 Commute Block Component

```tsx
// File: src/components/itinerary/CommuteBlock.tsx - CREATE this file

interface CommuteBlockProps {
  commute: CommuteInfo;
}

export function CommuteBlock({ commute }: CommuteBlockProps) {
  const icon = commute.method === "walk" ? "🚶"
    : commute.method === "transit" ? "🚃"
    : commute.method === "taxi" ? "🚕"
    : "🚗";

  return (
    <div className="commute-block">
      <div className="commute-line" />
      <div className="commute-content">
        <span className="commute-icon">{icon}</span>
        <span className="commute-duration">{commute.duration} min</span>
        <span className="commute-method">{commute.method}</span>
      </div>
      {commute.instructions && (
        <span className="commute-instructions">{commute.instructions}</span>
      )}
      {commute.trainLines && (
        <div className="train-lines">
          {commute.trainLines.map(line => (
            <span key={line} className="train-line-badge">{line}</span>
          ))}
        </div>
      )}
    </div>
  );
}
```

---

### PHASE 6: Complete Integration Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     COMPLETE DATA FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. USER INPUT                                                              │
│     └─→ "Plan 7 days in Tokyo, vegetarian, family with 2 kids"             │
│                                                                             │
│  2. CHAT API (/api/chat)                                                    │
│     ├─→ Extract preferences (destination, dates, dietary, etc.)            │
│     └─→ Return: context + "Ready to generate" flag                         │
│                                                                             │
│  3. GENERATE API (/api/itinerary/generate)                                  │
│     ├─→ Call OpenAI with structured prompt                                 │
│     ├─→ Parse response (text + JSON)                                       │
│     ├─→ Resolve places via Google Places API                               │
│     ├─→ Calculate commute times                                            │
│     ├─→ Fetch restaurants from Yelp (with dietary filters)                 │
│     └─→ Return: ItineraryResponse with options                             │
│                                                                             │
│  4. UI RENDERING (ChatInterface.tsx)                                        │
│     ├─→ Display text message                                               │
│     └─→ Render structured components:                                      │
│         ├─→ <ItineraryDayView> for each day                                │
│         ├─→ <SlotOptions> for each time slot                               │
│         ├─→ <ActivityOptionCard> for each option                           │
│         ├─→ <CommuteBlock> between activities                              │
│         └─→ <DietaryBadge> for restaurants                                 │
│                                                                             │
│  5. USER SELECTION                                                          │
│     ├─→ User clicks "Choose This" on preferred option                      │
│     ├─→ Update slot.selectedOptionId                                       │
│     ├─→ Recalculate commute times                                          │
│     └─→ Save selection to state/store                                      │
│                                                                             │
│  6. FINAL ITINERARY                                                         │
│     ├─→ All slots have selections                                          │
│     ├─→ Export to calendar / PDF                                           │
│     └─→ Book activities via Viator links                                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Quick Implementation Order

1. **Week 1: Structured Response**
   - [ ] Update LLM prompt for JSON output
   - [ ] Create response parser
   - [ ] Update API to return structured data

2. **Week 2: Place Resolution**
   - [ ] Implement place resolver
   - [ ] Integrate with Google Places
   - [ ] Cache resolved places

3. **Week 3: Food Preferences**
   - [ ] Create dietary filter service
   - [ ] Integrate with Yelp search
   - [ ] Add dietary badges to UI

4. **Week 4: Commute & Options UI**
   - [ ] Implement commute calculator
   - [ ] Build SlotOptions component
   - [ ] Build ActivityOptionCard component
   - [ ] Build CommuteBlock component

5. **Week 5: Selection Flow**
   - [ ] Implement option selection state
   - [ ] Recalculate commutes on selection
   - [ ] Persist selections

---

## EXECUTIVE SUMMARY: How It All Works

### The Big Picture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  USER INPUT                     ALGORITHM                      OUTPUT       │
│  ───────────                    ─────────                      ──────       │
│                                                                             │
│  "Tokyo + Kyoto              ┌─────────────┐                  7-Day Plan   │
│   7 days                     │             │                  with:        │
│   2 adults, 2 kids    ──────▶│  ACTIVITY   │──────▶           • Activities │
│   vegetarian                 │  SUGGESTION │                  • Restaurants│
│   medium budget"             │  ENGINE     │                  • Commute    │
│                              │             │                  • Options    │
│                              └─────────────┘                  • Bookings   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Q: Where Do Activities Come From?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  SOURCE 1: OPENAI (Primary - Core Activities)                              │
│  ─────────────────────────────────────────────                              │
│                                                                             │
│  We ASK the AI to generate activities for the destination.                 │
│                                                                             │
│  INPUT (Prompt):                                                            │
│  "Generate 15-20 activities for Tokyo, Japan                               │
│   - Family with kids ages 8, 12                                            │
│   - January visit (cold weather)                                           │
│   - Moderate budget                                                         │
│   - Include: landmarks, temples, parks, neighborhoods, unique experiences  │
│                                                                             │
│   For EACH activity return:                                                 │
│   - name, description                                                       │
│   - category (temple, park, museum, etc.)                                  │
│   - neighborhood                                                            │
│   - bestTimeOfDay (morning/afternoon/evening)                              │
│   - recommendedDuration (in minutes)  ◀── THIS IS HOW WE GET DURATION     │
│   - isFree, estimatedCost                                                  │
│   - familyFriendly (true/false)                                            │
│   - localTip (insider knowledge)"                                          │
│                                                                             │
│  OUTPUT: 15-20 structured activities with all metadata                     │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SOURCE 2: YELP API (Restaurants)                                          │
│  ────────────────────────────────                                           │
│                                                                             │
│  For MEAL SLOTS (breakfast, lunch, dinner), we query Yelp:                 │
│                                                                             │
│  INPUT: { location: "Shinjuku, Tokyo", categories: "vegetarian,vegan",     │
│           price: "2,3", sort_by: "rating" }                                │
│                                                                             │
│  OUTPUT: Restaurants with ratings, prices, cuisine types                   │
│  DURATION: Assumed 60-90 min for meals                                     │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SOURCE 3: VIATOR API (Bookable Enhancements)                              │
│  ────────────────────────────────────────────                               │
│                                                                             │
│  For activities that CAN be enhanced with paid tours:                      │
│                                                                             │
│  INPUT: { destName: "Tokyo", tags: [museums], sortOrder: "TRAVELER_RATING"}│
│                                                                             │
│  OUTPUT: Bookable tours/tickets with prices, durations, ratings            │
│  DURATION: Comes from Viator product data                                  │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  SOURCE 4: WEATHER API                                                      │
│  ────────────────────────                                                   │
│                                                                             │
│  For each day, we check weather to filter outdoor activities               │
│                                                                             │
│  INPUT: { city: "Tokyo", date: "2025-01-18" }                              │
│  OUTPUT: Temperature, conditions, precipitation %                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Q: How Do We Get Activity Duration?

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  DURATION SOURCES BY ACTIVITY TYPE                                          │
│  ─────────────────────────────────                                          │
│                                                                             │
│  ┌──────────────────┬────────────────────┬─────────────────────────────┐   │
│  │ Source           │ Duration From      │ Example                     │   │
│  ├──────────────────┼────────────────────┼─────────────────────────────┤   │
│  │ OpenAI Core      │ AI estimates based │ "Senso-ji Temple"           │   │
│  │ Activities       │ on activity type   │ → 90-120 min                │   │
│  │                  │ and knowledge      │                             │   │
│  ├──────────────────┼────────────────────┼─────────────────────────────┤   │
│  │ Viator Products  │ API returns exact  │ "TeamLab Planets"           │   │
│  │                  │ duration in mins   │ → 150 min (from API)        │   │
│  ├──────────────────┼────────────────────┼─────────────────────────────┤   │
│  │ Restaurants      │ Default by meal    │ Breakfast: 45 min           │   │
│  │ (Yelp)           │ type               │ Lunch: 60 min               │   │
│  │                  │                    │ Dinner: 90 min              │   │
│  ├──────────────────┼────────────────────┼─────────────────────────────┤   │
│  │ Commute          │ Google Maps API    │ Asakusa → Akihabara         │   │
│  │                  │ OR pre-built       │ → 25 min (from matrix)      │   │
│  │                  │ city matrix        │                             │   │
│  └──────────────────┴────────────────────┴─────────────────────────────┘   │
│                                                                             │
│  AI PROMPT INSTRUCTS DURATION ESTIMATION:                                   │
│  "Estimate recommendedDuration in minutes. Consider:                       │
│   - Temple/shrine: 60-90 min                                               │
│   - Major museum: 120-180 min                                              │
│   - Neighborhood walk: 90-120 min                                          │
│   - Viewpoint/observation: 45-60 min                                       │
│   - Park/garden: 60-120 min                                                │
│   - Market: 60-90 min"                                                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Complete Algorithm Flow (No Code)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  PHASE 1: TRIP SETUP                                                        │
│  ═══════════════════                                                        │
│                                                                             │
│  INPUT: User requirements (destination, dates, travelers, preferences)     │
│                                                                             │
│  STEP 1.1: Create trip structure                                           │
│  ├── Calculate number of days                                              │
│  ├── Identify special days (arrival, departure, travel between cities)     │
│  └── Create empty slots for each day (morning, lunch, afternoon, etc.)     │
│                                                                             │
│  STEP 1.2: Set constraints                                                  │
│  ├── Dietary restrictions → affects restaurant filtering                   │
│  ├── Budget level → affects activity cost filtering                        │
│  ├── Family with kids → affects activity type filtering                    │
│  └── Pace preference → affects number of slots per day                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  PHASE 2: ACTIVITY GENERATION (Per City)                                    │
│  ═══════════════════════════════════════                                    │
│                                                                             │
│  API CALL: OpenAI                                                           │
│  ─────────────────                                                          │
│  Request: "Generate activities for [Tokyo] for [family] in [January]"      │
│  Response: 15-20 activities with name, duration, category, neighborhood,   │
│            bestTimeOfDay, cost, tips                                        │
│                                                                             │
│  API CALL: Weather (per day)                                                │
│  ───────────────────────────                                                │
│  Request: Forecast for each trip date                                      │
│  Response: Temperature, conditions → used to filter outdoor activities     │
│                                                                             │
│  API CALL: Yelp (per meal slot)                                            │
│  ──────────────────────────────                                             │
│  Request: Restaurants in [neighborhood] with [dietary] requirements        │
│  Response: Restaurant list with ratings, prices, cuisine                   │
│                                                                             │
│  OUTPUT: Pool of 30-50 activities/restaurants for the city                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  PHASE 3: SCORING & RANKING (Per Slot)                                      │
│  ═════════════════════════════════════                                      │
│                                                                             │
│  For each empty slot, score all candidate activities:                      │
│                                                                             │
│  SCORING FACTORS (100 points total):                                        │
│  ┌────────────────────────┬────────┬────────────────────────────────────┐  │
│  │ Factor                 │ Points │ How it's calculated                │  │
│  ├────────────────────────┼────────┼────────────────────────────────────┤  │
│  │ Interest match         │   25   │ Tags match user interests          │  │
│  │ Time-of-day fit        │   20   │ Morning activity in morning slot   │  │
│  │ Duration fit           │   15   │ Activity fits in slot time         │  │
│  │ Budget match           │   15   │ Cost matches budget preference     │  │
│  │ Weather appropriate    │   10   │ Outdoor OK if weather is good      │  │
│  │ Variety (not repeat)   │   10   │ Category not already done today    │  │
│  │ Rating/reviews         │    5   │ Higher rated = bonus               │  │
│  └────────────────────────┴────────┴────────────────────────────────────┘  │
│                                                                             │
│  OUTPUT: Ranked list of 3-5 options per slot                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  PHASE 4: SCHEDULE BUILDING                                                 │
│  ══════════════════════════                                                 │
│                                                                             │
│  STEP 4.1: Time slot allocation                                            │
│  ├── Morning slot: 09:00 - 12:00 (3 hours)                                 │
│  ├── Lunch slot: 12:00 - 14:00 (2 hours)                                   │
│  ├── Afternoon slot: 14:00 - 18:00 (4 hours)                               │
│  ├── Dinner slot: 18:00 - 20:00 (2 hours)                                  │
│  └── Evening slot: 20:00 - 22:00 (2 hours)                                 │
│                                                                             │
│  STEP 4.2: Fit activities into slots                                       │
│  ├── Check: Does activity duration ≤ slot duration?                        │
│  ├── Check: Is there buffer time for commute?                              │
│  └── Adjust: Compress or extend based on activity needs                    │
│                                                                             │
│  STEP 4.3: Calculate commute times                                          │
│  ├── Source: Google Maps API OR pre-built neighborhood matrix             │
│  ├── Insert commute blocks between activities                              │
│  └── Flag conflicts if arrival time > next slot start                      │
│                                                                             │
│  STEP 4.4: Optimize geographic flow                                         │
│  ├── Group activities by neighborhood                                       │
│  ├── Order to minimize backtracking                                        │
│  └── Prefer: Hotel → East → South → West → Hotel (circular)               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  PHASE 5: VIATOR ENHANCEMENT (Lazy Load)                                    │
│  ═══════════════════════════════════════                                    │
│                                                                             │
│  For activities marked "hasViatorExperiences: true":                       │
│                                                                             │
│  API CALL: Viator (on-demand, not upfront)                                 │
│  ──────────────────────────────────────────                                 │
│  Request: Search products matching activity name/category                  │
│  Response: Bookable tours with prices, durations, booking URLs             │
│                                                                             │
│  ATTACH to activity as optional enhancements:                              │
│  ├── Skip-the-line ticket: $25                                             │
│  ├── Guided tour: $65                                                       │
│  └── Private experience: $150                                              │
│                                                                             │
│  User can book OR just do the free version of the activity                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  PHASE 6: PRESENT OPTIONS TO USER                                           │
│  ════════════════════════════════                                           │
│                                                                             │
│  For each slot, show:                                                       │
│  ├── #1 Recommended activity (highest score)                               │
│  ├── #2, #3, #4 Alternative options                                        │
│  ├── Commute time from previous activity                                   │
│  ├── Cost estimate                                                         │
│  ├── "Enhance with Viator" option (if available)                           │
│  └── "Skip this slot" option                                               │
│                                                                             │
│  User selects → triggers PLANNING ADAPTATION                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### API Calls Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  COMPLETE API CALL SEQUENCE FOR 7-DAY TRIP                                  │
│  ═════════════════════════════════════════                                  │
│                                                                             │
│  ┌─────────────┬──────────────────────────────────────┬──────────┬───────┐ │
│  │ API         │ When Called                          │ # Calls  │ Cost  │ │
│  ├─────────────┼──────────────────────────────────────┼──────────┼───────┤ │
│  │ OpenAI      │ Once per city to generate activity   │ 2        │ $0.06 │ │
│  │             │ pool (Tokyo + Kyoto)                 │          │       │ │
│  ├─────────────┼──────────────────────────────────────┼──────────┼───────┤ │
│  │ Weather     │ Once per day for forecast            │ 7        │ Free  │ │
│  ├─────────────┼──────────────────────────────────────┼──────────┼───────┤ │
│  │ Yelp        │ Once per meal slot needing           │ 14-21    │ Free  │ │
│  │             │ restaurant suggestions               │          │       │ │
│  ├─────────────┼──────────────────────────────────────┼──────────┼───────┤ │
│  │ Viator      │ On-demand when user views activity   │ 5-10     │ Free  │ │
│  │             │ with enhancement options             │          │       │ │
│  ├─────────────┼──────────────────────────────────────┼──────────┼───────┤ │
│  │ Google Maps │ For commute times (optional -        │ 0-20     │ Free/ │ │
│  │ Directions  │ can use pre-built matrix instead)   │          │ $0.01 │ │
│  └─────────────┴──────────────────────────────────────┴──────────┴───────┘ │
│                                                                             │
│  TOTAL ESTIMATED COST: < $0.10 per trip                                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Two Modes Summary

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  PLANNING MODE (Before Trip)          EXECUTION MODE (During Trip)         │
│  ═══════════════════════════          ════════════════════════════         │
│                                                                             │
│  TRIGGER: User selects activity       TRIGGER: Time deviation detected     │
│                                                                             │
│  ACTIONS:                             ACTIONS:                              │
│  • Update "categories covered"        • Calculate delay impact              │
│  • Update "neighborhoods visited"     • Check for booking conflicts         │
│  • Recalculate commute for            • Suggest: compress/skip/swap         │
│    subsequent slots                   • Offer alternatives that fit         │
│  • Re-score remaining options         • Adjust remaining slot times         │
│  • Demote similar activities                                                │
│  • Promote efficient routes           STRATEGIES:                           │
│                                       • ≤15 min late: compress buffer       │
│  SCOPE: Entire trip                   • 16-30 min: shorten next activity   │
│                                       • 31-60 min: skip or swap             │
│  GOAL: Variety + efficiency           • 60+ min: reschedule rest of day    │
│                                                                             │
│                                       SCOPE: Current day only               │
│                                                                             │
│                                       GOAL: Don't miss bookings             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Philosophy: Activities-First, Booking-Optional

The core principle is that **activities should be about experiences, not just bookable tours**. Viator is an **enhancement layer** for users who want guided/paid experiences, not the primary source of suggestions.

---

## Activity Data Sources (Layered Architecture)

### 🏛️ Layer 1: Core Activities (FREE - AI-Generated + Knowledge Base)

**Source: OpenAI + Custom Knowledge Base**

These are the foundation - things to do that don't require booking:

```
┌─────────────────────────────────────────────────────────────────┐
│                    CORE ACTIVITIES (Free)                       │
├─────────────────────────────────────────────────────────────────┤
│  • Famous landmarks & viewpoints                                │
│  • Free museums (many have free days)                           │
│  • Parks, gardens, public spaces                                │
│  • Neighborhoods to explore/walk                                │
│  • Photo spots & scenic views                                   │
│  • Free walking routes                                          │
│  • Local markets & bazaars                                      │
│  • Street art & murals                                          │
│  • Beach/waterfront areas                                       │
│  • Religious sites (churches, temples, mosques)                 │
│  • University campuses                                          │
│  • Public events (festivals, parades)                           │
└─────────────────────────────────────────────────────────────────┘
```

**Data Structure:**
```typescript
interface CoreActivity {
  id: string;
  name: string;
  description: string;
  category: ActivityCategory;
  location: {
    city: string;
    neighborhood?: string;
    coordinates?: { lat: number; lng: number };
    address?: string;
  };

  // Time & logistics
  bestTimeOfDay: "morning" | "afternoon" | "evening" | "sunset" | "anytime";
  recommendedDuration: number; // minutes
  bestDays?: string[]; // e.g., ["sunday"] for flea markets
  seasonality?: "year-round" | "spring" | "summer" | "fall" | "winter";

  // Cost & access
  isFree: boolean;
  estimatedCost?: { min: number; max: number; currency: string };
  ticketRequired: boolean;
  reservationRecommended: boolean;

  // Experience tags
  tags: string[];
  suitableFor: ("solo" | "couples" | "families" | "groups")[];
  physicalLevel: "easy" | "moderate" | "challenging";

  // Tips & insights
  localTips: string[];
  insiderSecrets?: string;
  avoidWhen?: string; // e.g., "Avoid Monday - museums closed"

  // Enrichment potential
  hasViatorExperiences?: boolean;
  hasYelpListings?: boolean;
}
```

### 🍽️ Layer 2: Restaurants & Dining (Yelp API)

**Already Integrated!** Use for meal slots:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DINING LAYER (Yelp)                          │
├─────────────────────────────────────────────────────────────────┤
│  • Breakfast/Brunch spots                                       │
│  • Lunch restaurants                                            │
│  • Dinner venues                                                │
│  • Cafes & coffee shops                                         │
│  • Bars & nightlife                                             │
│  • Food markets                                                 │
│  • Local food specialties                                       │
└─────────────────────────────────────────────────────────────────┘
```

### 🌐 Layer 3: External Free APIs

**New integrations to consider:**

```
┌─────────────────────────────────────────────────────────────────┐
│                   FREE EXTERNAL APIs                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  📍 GOOGLE PLACES API (or OpenStreetMap/Foursquare)             │
│     • POI data, ratings, photos                                 │
│     • Opening hours                                             │
│     • Popular times                                             │
│                                                                 │
│  🎭 TICKETMASTER / EVENTBRITE                                   │
│     • Concerts, shows                                           │
│     • Local events                                              │
│     • Sports events                                             │
│                                                                 │
│  📸 UNSPLASH / PEXELS                                           │
│     • Destination photos                                        │
│     • Activity imagery                                          │
│                                                                 │
│  🌤️ WEATHER API (Already have!)                                 │
│     • Activity weather suitability                              │
│                                                                 │
│  🗺️ OPENSTREETMAP / OVERPASS API                                │
│     • POI data (free unlimited)                                 │
│     • Hiking trails                                             │
│     • Parks boundaries                                          │
│                                                                 │
│  📅 PREDICTHQ (Events API)                                      │
│     • Festivals, holidays                                       │
│     • Major events                                              │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### 🎫 Layer 4: Premium Experiences (Viator - Enhancement Layer)

**Current Integration - Use as ENHANCEMENT:**

```
┌─────────────────────────────────────────────────────────────────┐
│              PREMIUM EXPERIENCES (Viator)                       │
├─────────────────────────────────────────────────────────────────┤
│  • Guided tours with expert knowledge                           │
│  • Skip-the-line access                                         │
│  • Private experiences                                          │
│  • Multi-stop tours                                             │
│  • Unique experiences (cooking class, hot air balloon)          │
│  • Group activities                                             │
│  • VIP access                                                   │
└─────────────────────────────────────────────────────────────────┘
```

---

## The Algorithm: Smart Activity Suggestion Engine

### Step 1: Context Analysis

```typescript
interface SuggestionContext {
  // Trip basics
  destination: string;
  dates: { start: string; end: string };
  travelers: TravelerProfile;

  // Preferences
  budget: "budget" | "moderate" | "luxury";
  pace: "relaxed" | "moderate" | "packed";
  interests: string[];
  specialOccasion?: string;

  // Constraints
  mobilityLevel: "high" | "medium" | "low";
  hasChildren: boolean;
  childrenAges?: number[];
  dietaryRestrictions?: string[];

  // Time slot being filled
  timeSlot: {
    date: string;
    type: "morning" | "lunch" | "afternoon" | "dinner" | "evening";
    duration: number; // available minutes
  };

  // Already planned (avoid duplicates)
  plannedActivities: string[];
  plannedNeighborhoods: string[];
}
```

### Step 2: Generate Activity Pool

```typescript
async function generateActivityPool(context: SuggestionContext): Promise<ScoredActivity[]> {
  const activities: ScoredActivity[] = [];

  // 1. AI-Generated Core Activities (always first)
  const coreActivities = await generateCoreActivities(context);
  activities.push(...coreActivities.map(a => ({ ...a, source: "core", baseScore: 100 })));

  // 2. Add dining options for meal slots
  if (context.timeSlot.type === "lunch" || context.timeSlot.type === "dinner") {
    const restaurants = await getYelpRestaurants(context);
    activities.push(...restaurants.map(r => ({ ...r, source: "yelp", baseScore: 80 })));
  }

  // 3. Check for local events
  const events = await getLocalEvents(context);
  activities.push(...events.map(e => ({ ...e, source: "events", baseScore: 90 })));

  // 4. Weather-appropriate suggestions
  const weather = await getWeatherForecast(context.destination, context.timeSlot.date);
  activities.forEach(a => {
    a.weatherScore = calculateWeatherFit(a, weather);
  });

  return activities;
}
```

### Step 3: Scoring Algorithm

```typescript
interface ScoringWeights {
  interestMatch: 25;      // How well it matches user interests
  timeSlotFit: 20;        // Morning activity in morning slot, etc.
  durationFit: 15;        // Activity fits available time
  budgetMatch: 15;        // Matches budget preference
  weatherFit: 10;         // Weather appropriate
  uniqueness: 10;         // Not similar to already planned
  rating: 5;              // User ratings (if available)
}

function scoreActivity(activity: Activity, context: SuggestionContext): number {
  let score = 0;

  // Interest matching (25 points max)
  const interestOverlap = calculateInterestOverlap(activity.tags, context.interests);
  score += interestOverlap * 25;

  // Time slot fit (20 points max)
  score += getTimeSlotScore(activity, context.timeSlot) * 20;

  // Duration fit (15 points max)
  score += getDurationFitScore(activity.duration, context.timeSlot.duration) * 15;

  // Budget match (15 points max)
  score += getBudgetMatchScore(activity, context.budget) * 15;

  // Weather fit (10 points max)
  score += activity.weatherScore * 10;

  // Uniqueness - penalize if similar to planned
  if (isSimilarToPlanned(activity, context.plannedActivities)) {
    score -= 20;
  }

  // Rating boost
  if (activity.rating) {
    score += (activity.rating / 5) * 5;
  }

  return Math.max(0, score);
}
```

### Step 4: Viator Enhancement (Optional Layer)

```typescript
interface EnhancedActivity extends Activity {
  // Core activity stays the same
  ...activity,

  // Viator enhancement options (optional)
  viatorOptions?: {
    guidedTour?: ViatorProduct;
    skipTheLine?: ViatorProduct;
    privateExperience?: ViatorProduct;
    comboDeals?: ViatorProduct[];
  };

  // Show enhancement CTAs
  enhancementSuggestions?: string[];
  // e.g., "Want skip-the-line access? Book a guided tour from $45"
}

async function enhanceWithViator(activity: CoreActivity): Promise<EnhancedActivity> {
  // Only fetch Viator if activity is enhanceable
  if (!activity.hasViatorExperiences) {
    return activity;
  }

  const viatorProducts = await searchViatorProducts({
    destination: activity.location.city,
    keywords: extractKeywords(activity.name),
    tags: mapActivityTypeToViatorTags(activity.category),
  });

  // Categorize Viator options
  const options = categorizeViatorProducts(viatorProducts);

  return {
    ...activity,
    viatorOptions: options,
    enhancementSuggestions: generateEnhancementCTAs(activity, options),
  };
}
```

---

## Activity Categories

```typescript
type ActivityCategory =
  // Free/Low-cost exploration
  | "landmark"           // Famous monuments, buildings
  | "viewpoint"          // Scenic overlooks, rooftops
  | "park"               // Parks, gardens, nature
  | "neighborhood"       // Area to walk and explore
  | "market"             // Markets, bazaars
  | "religious"          // Churches, temples, mosques
  | "street-art"         // Murals, graffiti tours
  | "beach"              // Beaches, waterfronts

  // Culture & Learning
  | "museum"             // Museums, galleries
  | "historic-site"      // Ruins, castles, palaces
  | "architecture"       // Architectural tours
  | "local-culture"      // Cultural experiences

  // Food & Drink
  | "restaurant"         // Dining (from Yelp)
  | "cafe"               // Coffee, light bites
  | "bar"                // Bars, nightlife
  | "food-market"        // Food halls, food tours
  | "cooking-class"      // Cooking experiences

  // Active & Outdoors
  | "hiking"             // Trails, nature walks
  | "water-activity"     // Swimming, kayaking, etc.
  | "cycling"            // Bike tours, rentals
  | "sports"             // Sports activities

  // Entertainment
  | "show"               // Theater, concerts
  | "nightlife"          // Clubs, entertainment
  | "event"              // Special events, festivals

  // Unique Experiences (Viator territory)
  | "guided-tour"        // Expert-led tours
  | "workshop"           // Classes, workshops
  | "day-trip"           // Out of city excursions
  | "unique-experience"; // Hot air balloon, etc.
```

---

## UI/UX: How to Present This

### Activity Card Design

```
┌─────────────────────────────────────────────────────────────────┐
│  [Image]                                                        │
│                                                                 │
│  🏛️ The Louvre Museum                              FREE ENTRY  │
│  ────────────────────────────────────────────────────────────── │
│  📍 1st Arrondissement  •  ⏱️ 2-3 hours  •  🚶 Easy             │
│                                                                 │
│  World's largest art museum. Home to Mona Lisa and Venus de    │
│  Milo. Free entry first Sunday of each month.                  │
│                                                                 │
│  💡 Tip: Enter via Carrousel du Louvre for shorter lines       │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ ✨ ENHANCE YOUR VISIT                                    │   │
│  │                                                          │   │
│  │ 🎫 Skip-the-Line Ticket ─────────── from $25            │   │
│  │ 👤 Private Guided Tour ──────────── from $89            │   │
│  │ 🎨 Art History Expert Tour ──────── from $65            │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  [Add to Itinerary]                          [View Details]     │
└─────────────────────────────────────────────────────────────────┘
```

### Time Slot Suggestions

```
┌─────────────────────────────────────────────────────────────────┐
│  Day 2 - Morning (9:00 AM - 12:00 PM)                          │
│  ═══════════════════════════════════════════════════════════════│
│                                                                 │
│  RECOMMENDED FOR YOU                                            │
│  Based on your interests: art, history                          │
│                                                                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │
│  │ Louvre  │  │ Orsay   │  │ Marais  │  │ See All │            │
│  │ Museum  │  │ Museum  │  │ Walk    │  │   →     │            │
│  │  FREE   │  │  €14    │  │  FREE   │  │         │            │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │
│                                                                 │
│  ────────────────────────────────────────────────────────────── │
│                                                                 │
│  PREMIUM EXPERIENCES                                            │
│  Curated tours & skip-the-line access                          │
│                                                                 │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐                         │
│  │ Louvre  │  │ Private │  │ Hidden  │                         │
│  │ + Mona  │  │ Art     │  │ Paris   │                         │
│  │  $65    │  │  $120   │  │  $45    │                         │
│  └─────────┘  └─────────┘  └─────────┘                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## API Design

### GET /api/activities/suggestions

```typescript
interface SuggestionRequest {
  destination: string;
  date: string;
  timeSlot: "morning" | "lunch" | "afternoon" | "dinner" | "evening";
  duration?: number; // minutes available

  // User context
  interests?: string[];
  budget?: "budget" | "moderate" | "luxury";
  travelers?: number;
  hasChildren?: boolean;

  // Filtering
  excludeActivities?: string[]; // already planned
  includeViator?: boolean; // whether to fetch Viator options

  // Pagination
  limit?: number;
  offset?: number;
}

interface SuggestionResponse {
  suggestions: {
    recommended: EnhancedActivity[]; // Top picks
    free: CoreActivity[];            // Free activities
    dining?: Restaurant[];           // For meal slots
    premium?: ViatorProduct[];       // Paid experiences
    events?: Event[];                // Local events
  };

  // Context
  weather?: WeatherInfo;
  localTips?: string[];
}
```

---

## Implementation Priority

### Phase 1: AI-Powered Core Activities
1. Create knowledge base prompt for AI to generate activities
2. Structure output with proper categorization
3. Add local tips and insider knowledge
4. Integrate weather for outdoor activity filtering

### Phase 2: Enhance with Existing APIs
1. Better Yelp integration for dining slots
2. Weather-aware suggestions
3. Viator as enhancement layer (not primary)

### Phase 3: Additional Free APIs
1. Unsplash for activity images
2. OpenStreetMap for POI data
3. Event APIs (Eventbrite, PredictHQ)

### Phase 4: Smart Scheduling
1. Neighborhood clustering (plan activities near each other)
2. Opening hours awareness
3. Travel time between activities
4. Smart day planning algorithm

---

## Key Differentiators from Pure Viator

| Aspect | Viator-Only | Our Approach |
|--------|-------------|--------------|
| Free activities | ❌ None | ✅ Primary focus |
| Local secrets | ❌ Generic tours | ✅ AI-curated insider tips |
| Restaurant recs | ❌ Basic mentions | ✅ Full Yelp integration |
| Budget flexibility | ❌ Paid only | ✅ Free to premium range |
| Authentic experience | ⚠️ Tourist-focused | ✅ Mix of local & tourist |
| Customization | ⚠️ Pre-set tours | ✅ Build your own day |

---

## Sample AI Prompt for Core Activities

```
Generate unique activities for {destination} that a local would recommend:

For each activity provide:
1. Name and brief description
2. Why it's special (not just tourist facts)
3. Best time to visit and why
4. Insider tip that most tourists don't know
5. Nearby alternatives if too crowded
6. Whether guided tours enhance the experience

Focus on:
- Hidden gems locals love
- Free or low-cost experiences
- Authentic cultural experiences
- Best photo opportunities
- Off-peak timing recommendations

Avoid:
- Generic tourist trap descriptions
- Activities that require booking (unless truly exceptional)
- Chain restaurants or international brands

User context:
- Interests: {interests}
- Travel style: {pace}
- Budget: {budget}
- Traveling with: {travelerType}
- Special occasion: {occasion}
```

---

## Real Example Walkthrough: Tokyo + Kyoto Family Trip

Let's trace through the algorithm with a real trip request:

### Input Context

```typescript
const tripRequest = {
  // Multi-city trip
  destinations: [
    { city: "Tokyo", days: 4 },
    { city: "Kyoto", days: 3 }
  ],

  // Dates
  startDate: "2025-01-18",  // Saturday
  endDate: "2025-01-24",    // Friday (last day in Kyoto)
  returnDate: "2025-01-25", // Saturday - fly from NRT

  // Travelers
  adults: 2,
  children: 2,
  childrenAges: [8, 12], // Assumed school-age

  // Dietary restrictions
  dietaryRestrictions: ["vegetarian", "no-pork", "no-beef"],

  // Budget & style
  budget: "moderate",
  pace: "moderate", // With kids, not too packed

  // Constraints
  returnAirport: "NRT", // Narita - need buffer time on last day
};
```

---

### STEP 1: Trip Structure Planning

Before generating activities, we establish the macro structure:

```typescript
const tripStructure = {
  days: [
    // TOKYO (4 days)
    { day: 1, date: "2025-01-18", city: "Tokyo", theme: "Arrival + Explore" },
    { day: 2, date: "2025-01-19", city: "Tokyo", theme: "Full Day" },
    { day: 3, date: "2025-01-20", city: "Tokyo", theme: "Full Day" },
    { day: 4, date: "2025-01-21", city: "Tokyo", theme: "Travel Day → Kyoto" },

    // KYOTO (3 days)
    { day: 5, date: "2025-01-22", city: "Kyoto", theme: "Full Day" },
    { day: 6, date: "2025-01-23", city: "Kyoto", theme: "Full Day" },
    { day: 7, date: "2025-01-24", city: "Kyoto", theme: "Full Day" },

    // RETURN
    { day: 8, date: "2025-01-25", city: "Transit", theme: "Kyoto → NRT (3hr)" },
  ],

  logistics: {
    tokyoToKyoto: {
      method: "Shinkansen (bullet train)",
      duration: "2h 15min",
      suggestedDeparture: "Morning", // Get to Kyoto by lunch
      estimatedCost: "¥13,320 per person (~$90 USD)"
    },
    kyotoToNRT: {
      method: "Shinkansen → Narita Express",
      duration: "3h 30min + buffer",
      suggestedDeparture: "Early morning",
      note: "Leave Kyoto by 7am for noon flight"
    }
  }
};
```

---

### STEP 2: API Calls Per Day

#### Day 1 (Jan 18) - Tokyo Arrival Day

**Context for this day:**
```typescript
const day1Context = {
  date: "2025-01-18",
  dayType: "arrival", // Half day only
  city: "Tokyo",
  neighborhood: "Shinjuku", // Assuming hotel area
  availableSlots: ["afternoon", "dinner", "evening"],
  constraints: {
    familyFriendly: true,
    vegetarianRequired: true,
    jetlagConsideration: true, // Don't plan too much
  }
};
```

**API Calls:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  API CALL 1: OpenAI - Generate Core Activities for Tokyo                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ENDPOINT: POST /api/openai/chat                                           │
│                                                                             │
│  PROMPT:                                                                    │
│  """                                                                        │
│  Generate family-friendly activities for Tokyo, Japan for January.         │
│                                                                             │
│  Context:                                                                   │
│  - Traveling with: 2 adults, 2 children (ages 8, 12)                       │
│  - Day type: Arrival day (half day, evening only)                          │
│  - Budget: Moderate                                                         │
│  - Special needs: Vegetarian dining options needed                          │
│  - Consideration: Jetlag - keep it relaxed                                 │
│                                                                             │
│  For each activity provide JSON:                                            │
│  {                                                                          │
│    name, description, category, neighborhood,                               │
│    bestTimeOfDay, recommendedDuration,                                      │
│    isFree, estimatedCost, familyFriendly,                                  │
│    localTip, whySpecial                                                     │
│  }                                                                          │
│                                                                             │
│  Focus on:                                                                  │
│  - Easy first-day activities (not too demanding)                           │
│  - Shinjuku area (near hotels)                                             │
│  - Places kids will enjoy                                                   │
│  - Evening food options with vegetarian choices                            │
│  """                                                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

**OpenAI Response (Core Activities):**
```json
{
  "activities": [
    {
      "id": "tokyo-001",
      "name": "Shinjuku Gyoen National Garden",
      "description": "Stunning traditional Japanese garden with greenhouse. Perfect for a peaceful first-day stroll.",
      "category": "park",
      "neighborhood": "Shinjuku",
      "bestTimeOfDay": "afternoon",
      "recommendedDuration": 90,
      "isFree": false,
      "estimatedCost": { "min": 500, "max": 500, "currency": "JPY" },
      "familyFriendly": true,
      "physicalLevel": "easy",
      "localTip": "The greenhouse is heated - great for January! Kids love the koi fish.",
      "whySpecial": "Escape the city chaos. In January, you might catch early plum blossoms.",
      "tags": ["nature", "gardens", "peaceful", "photography"],
      "hasViatorExperiences": false
    },
    {
      "id": "tokyo-002",
      "name": "Omoide Yokocho (Memory Lane)",
      "description": "Atmospheric narrow alley with tiny restaurants. Not all veggie-friendly but amazing to walk through.",
      "category": "neighborhood",
      "neighborhood": "Shinjuku",
      "bestTimeOfDay": "evening",
      "recommendedDuration": 45,
      "isFree": true,
      "familyFriendly": true,
      "physicalLevel": "easy",
      "localTip": "Go at dusk when the lanterns light up. Great for photos!",
      "whySpecial": "Step back in time to 1940s Tokyo. Kids love the tiny alleyways.",
      "tags": ["nightlife", "food", "photography", "culture"],
      "hasViatorExperiences": true
    },
    {
      "id": "tokyo-003",
      "name": "Robot Restaurant Show",
      "description": "Wild, colorful robot cabaret show - quintessential Tokyo weirdness.",
      "category": "show",
      "neighborhood": "Shinjuku",
      "bestTimeOfDay": "evening",
      "recommendedDuration": 120,
      "isFree": false,
      "estimatedCost": { "min": 8000, "max": 10000, "currency": "JPY" },
      "familyFriendly": true,
      "localTip": "Book the 7:30pm show. Eat before - the bento isn't great.",
      "whySpecial": "Kids will LOVE this. Absolutely bonkers sensory experience.",
      "tags": ["entertainment", "unique", "kids", "evening"],
      "hasViatorExperiences": true
    }
  ]
}
```

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  API CALL 2: Weather API - Tokyo Forecast                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ENDPOINT: GET /api/weather?city=Tokyo&date=2025-01-18                     │
│                                                                             │
│  RESPONSE:                                                                  │
│  {                                                                          │
│    "date": "2025-01-18",                                                   │
│    "city": "Tokyo",                                                         │
│    "temperature": { "high": 10, "low": 2, "unit": "C" },                   │
│    "condition": "partly-cloudy",                                           │
│    "precipitation": 10,                                                     │
│    "sunset": "16:55",                                                       │
│    "recommendation": "Cold but clear. Layer up for outdoor activities."   │
│  }                                                                          │
│                                                                             │
│  USAGE:                                                                     │
│  → Shinjuku Gyoen is outdoor → check weather is OK ✓                       │
│  → Sunset at 4:55pm → plan indoor activities for evening                   │
│  → Cold (2-10°C) → suggest warm places for kids                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  API CALL 3: Yelp - Vegetarian Dinner Options in Shinjuku                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ENDPOINT: searchRestaurants()                                              │
│                                                                             │
│  PARAMS:                                                                    │
│  {                                                                          │
│    location: "Shinjuku, Tokyo, Japan",                                     │
│    categories: "vegetarian,vegan,japanese",                                │
│    price: "2,3",  // $$ to $$$ (moderate budget)                           │
│    limit: 10,                                                               │
│    sort_by: "rating"                                                        │
│  }                                                                          │
│                                                                             │
│  RESPONSE:                                                                  │
│  {                                                                          │
│    "restaurants": [                                                         │
│      {                                                                      │
│        "id": "ain-soph-ripple-shinjuku",                                   │
│        "name": "AIN SOPH.ripple",                                          │
│        "rating": 4.5,                                                       │
│        "reviewCount": 245,                                                  │
│        "priceLevel": 2,                                                     │
│        "cuisine": ["Vegan", "Japanese", "Burgers"],                        │
│        "address": "2-46-8 Kabukicho, Shinjuku",                            │
│        "phone": "+81-3-6380-1580",                                         │
│        "distance": 450,                                                     │
│        "url": "https://yelp.com/...",                                      │
│        "highlight": "Famous for vegan burgers. Kid-friendly menu."        │
│      },                                                                     │
│      {                                                                      │
│        "id": "ts-tantan-tokyo-station",                                    │
│        "name": "T's TanTan",                                               │
│        "rating": 4.3,                                                       │
│        "reviewCount": 189,                                                  │
│        "priceLevel": 1,                                                     │
│        "cuisine": ["Vegan", "Ramen", "Japanese"],                          │
│        "address": "Tokyo Station",                                          │
│        "highlight": "Vegan ramen - unique find in Tokyo!"                  │
│      }                                                                      │
│    ]                                                                        │
│  }                                                                          │
│                                                                             │
│  USAGE:                                                                     │
│  → Filters applied: vegetarian + moderate price + high rating              │
│  → Distance calculated from Shinjuku hotel area                            │
│  → Kid-friendly options prioritized                                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  API CALL 4: Viator - Enhancement Options (OPTIONAL)                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Called ONLY for activities with hasViatorExperiences: true                │
│                                                                             │
│  ENDPOINT: searchProducts()                                                 │
│                                                                             │
│  PARAMS (for Robot Restaurant):                                             │
│  {                                                                          │
│    destName: "Tokyo",                                                       │
│    count: 5,                                                                │
│    tags: [11901], // Nightlife                                             │
│    sortOrder: "TRAVELER_RATING"                                            │
│  }                                                                          │
│                                                                             │
│  RESPONSE:                                                                  │
│  {                                                                          │
│    "products": [                                                            │
│      {                                                                      │
│        "productCode": "5979P18",                                           │
│        "title": "Robot Restaurant Ticket with Meal",                       │
│        "price": { "amount": 85, "currency": "USD" },                       │
│        "rating": 4.2,                                                       │
│        "reviewCount": 1240,                                                 │
│        "duration": 120,                                                     │
│        "bookingUrl": "https://viator.com/...",                             │
│        "flags": ["INSTANT_CONFIRMATION"]                                   │
│      }                                                                      │
│    ]                                                                        │
│  }                                                                          │
│                                                                             │
│  USAGE:                                                                     │
│  → Match to "Robot Restaurant" activity                                    │
│  → Show as "Book tickets from $85" enhancement                             │
│  → User can book OR just go directly (it's the same place)                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### STEP 3: Scoring & Ranking for Day 1 Afternoon

```typescript
// Candidate activities for AFTERNOON slot (3-4 hour window)
const afternoonCandidates = [
  { activity: "Shinjuku Gyoen", rawScore: 0 },
  { activity: "Omoide Yokocho", rawScore: 0 },
  { activity: "Robot Restaurant", rawScore: 0 },
];

// Apply scoring algorithm
function scoreForAfternoon(activity, context) {
  let score = 0;

  // 1. TIME SLOT FIT (20 pts max)
  // Shinjuku Gyoen: bestTime = "afternoon" → Perfect match!
  // Omoide Yokocho: bestTime = "evening" → Poor match
  // Robot Restaurant: bestTime = "evening" → Poor match
  if (activity.bestTimeOfDay === "afternoon") score += 20;
  else if (activity.bestTimeOfDay === "anytime") score += 15;
  else score += 5;

  // 2. FAMILY FRIENDLY (15 pts max)
  // All three are family-friendly ✓
  if (activity.familyFriendly) score += 15;

  // 3. WEATHER APPROPRIATE (10 pts max)
  // Weather: Cold (2-10°C), partly cloudy
  // Gyoen: Outdoor but has greenhouse → 8/10
  // Omoide Yokocho: Semi-outdoor → 7/10
  if (activity.category === "park" && weather.temp > 0) score += 8;

  // 4. PHYSICAL LEVEL (10 pts max)
  // Arrival day = prefer easy activities
  if (activity.physicalLevel === "easy") score += 10;

  // 5. JETLAG CONSIDERATION (10 pts max)
  // First day = penalize long/intense activities
  if (activity.recommendedDuration <= 120) score += 10;

  // 6. NEIGHBORHOOD PROXIMITY (10 pts max)
  // All in Shinjuku = no penalty
  if (activity.neighborhood === context.hotelArea) score += 10;

  return score;
}

// RESULTS for Afternoon slot:
// ┌────────────────────────┬───────┬────────────────────────────────────┐
// │ Activity               │ Score │ Reasoning                          │
// ├────────────────────────┼───────┼────────────────────────────────────┤
// │ Shinjuku Gyoen         │  73   │ Perfect time + easy + near hotel   │
// │ Omoide Yokocho         │  45   │ Wrong time (evening activity)      │
// │ Robot Restaurant       │  40   │ Wrong time + too long for day 1    │
// └────────────────────────┴───────┴────────────────────────────────────┘
//
// WINNER: Shinjuku Gyoen for afternoon ✓
```

---

### STEP 4: Build Day 1 Schedule

```typescript
const day1Schedule = {
  date: "2025-01-18",
  dayNumber: 1,
  city: "Tokyo",
  title: "Arrival & First Taste of Tokyo",
  weather: { high: 10, low: 2, condition: "partly-cloudy" },

  slots: [
    {
      id: "d1-morning",
      time: "09:00-12:00",
      type: "morning",
      status: "unavailable",
      note: "✈️ Arrival at Narita, transfer to hotel"
    },
    {
      id: "d1-lunch",
      time: "12:00-14:00",
      type: "lunch",
      status: "flexible",
      suggestion: {
        type: "restaurant",
        name: "Grab lunch near hotel",
        note: "Rest and settle in first"
      }
    },
    {
      id: "d1-afternoon",
      time: "14:00-17:00",
      type: "afternoon",
      status: "planned",
      activity: {
        id: "tokyo-001",
        name: "Shinjuku Gyoen National Garden",
        source: "core",
        description: "Beautiful Japanese garden to ease into Tokyo",
        duration: 90,
        cost: "¥500/person",
        localTip: "Greenhouse is heated - perfect for cold January day!",
        tags: ["nature", "peaceful", "family"],

        // Viator enhancement (none for this one)
        viatorOptions: null,

        // Action buttons
        actions: ["Add to itinerary", "See alternatives"]
      }
    },
    {
      id: "d1-dinner",
      time: "18:00-20:00",
      type: "dinner",
      status: "planned",
      activity: {
        id: "yelp-ain-soph",
        name: "AIN SOPH.ripple",
        source: "yelp",
        type: "restaurant",
        description: "Highly-rated vegan restaurant with burgers kids love",
        cuisine: ["Vegan", "Japanese"],
        rating: 4.5,
        priceLevel: 2,
        address: "2-46-8 Kabukicho, Shinjuku",
        reservationUrl: "https://...",
        dietaryMatch: ["vegetarian", "no-pork", "no-beef"], // ✓ All requirements met

        actions: ["Make reservation", "See alternatives"]
      }
    },
    {
      id: "d1-evening",
      time: "20:00-22:00",
      type: "evening",
      status: "optional",
      suggestion: {
        name: "Explore Omoide Yokocho",
        description: "Short walk through atmospheric alley if not too tired",
        duration: 45,
        note: "Skip if jet-lagged - save for another evening!",

        // Free to walk through
        isFree: true
      }
    }
  ]
};
```

---

### STEP 5: Special Handling - Day 4 (Travel Day)

```typescript
// Day 4: Tokyo → Kyoto transition
const day4Context = {
  date: "2025-01-21",
  dayType: "travel",
  from: "Tokyo",
  to: "Kyoto",
  transport: "Shinkansen",

  // Morning in Tokyo, evening in Kyoto
  schedule: {
    morning: { city: "Tokyo", available: true },
    transit: { depart: "11:00", arrive: "13:15" },
    afternoon: { city: "Kyoto", available: true },
    evening: { city: "Kyoto", available: true }
  }
};

// API Calls for Day 4:

// 1. Tokyo morning activity (quick, near station)
const tokyoMorningPrompt = `
  Short activity in Tokyo for family before 10:30am departure.
  Must be near Tokyo Station or Shinjuku.
  2 hours max.
`;

// 2. Kyoto afternoon activity (after arrival, near station)
const kyotoAfternoonPrompt = `
  First activity in Kyoto for family arriving at 1:15pm.
  Near Kyoto Station (check into hotel first).
  Relaxed pace after train journey.
`;

// Result:
const day4Schedule = {
  slots: [
    {
      time: "08:00-10:00",
      city: "Tokyo",
      activity: {
        name: "Tsukiji Outer Market",
        description: "Explore the famous fish market. Great breakfast options!",
        vegetarianNote: "Veggie options available - tamagoyaki (egg), pickles, fresh fruit",
        localTip: "Go early before it gets crowded"
      }
    },
    {
      time: "10:00-10:30",
      type: "logistics",
      note: "Head to Tokyo Station"
    },
    {
      time: "11:00-13:15",
      type: "transit",
      activity: {
        name: "Shinkansen to Kyoto",
        icon: "🚄",
        description: "Bullet train experience - kids will love watching for Mt. Fuji!",
        tip: "Sit on right side (seats E) for Fuji views. Book ekiben (train bento) - veggie options at station.",
        cost: "~¥13,320/person"
      }
    },
    {
      time: "13:15-14:30",
      type: "logistics",
      note: "Check into Kyoto hotel"
    },
    {
      time: "14:30-18:00",
      city: "Kyoto",
      activity: {
        name: "Fushimi Inari Shrine",
        description: "Iconic thousand torii gates. Easy lower trails, challenging upper trails.",
        familyTip: "Do the first 30min of gates, then turn back. Full hike is 2-3 hours.",
        isFree: true,

        viatorOptions: {
          guidedTour: {
            name: "Fushimi Inari Walking Tour",
            price: 45,
            benefit: "Learn the history, avoid crowds, secret photo spots"
          }
        }
      }
    }
  ]
};
```

---

### STEP 6: Dietary Filtering Throughout

```typescript
// Every restaurant API call includes dietary filters
const dietaryFilter = {
  required: ["vegetarian"],
  exclude: ["pork", "beef"],

  // For Yelp API
  yelpCategories: "vegetarian,vegan,japanese,italian",
  yelpExclude: "steakhouses,bbq,yakiniku,tonkatsu",

  // For AI prompts
  promptAddition: `
    IMPORTANT: Wife is vegetarian. Family avoids pork and beef.
    For restaurant suggestions, ONLY recommend places with:
    - Clear vegetarian options on menu
    - No pork/beef dishes (fish and chicken OK for others)
    - Japanese cuisine with veggie options: shojin ryori, soba, tempura vegetables
    - International options: Italian, Indian, Thai

    AVOID: Yakiniku (BBQ), Tonkatsu (pork), Gyudon (beef bowl), most ramen shops
  `
};

// Applied to each day's restaurant search:
async function findDinnerOptions(city, neighborhood, date) {
  const restaurants = await searchRestaurants({
    location: `${neighborhood}, ${city}, Japan`,
    categories: dietaryFilter.yelpCategories,
    price: "2,3", // moderate
    sort_by: "rating",
    limit: 10
  });

  // Post-filter to double-check
  return restaurants.filter(r => {
    const cuisineLower = r.cuisine.map(c => c.toLowerCase()).join(" ");
    const isExcluded = ["tonkatsu", "yakiniku", "gyudon", "bbq", "steakhouse"]
      .some(x => cuisineLower.includes(x));
    return !isExcluded;
  });
}
```

---

### STEP 7: Final 7-Day Output Structure

```typescript
const completeTripPlan = {
  id: "trip-tokyo-kyoto-2025-01",
  title: "Tokyo & Kyoto Family Adventure",

  summary: {
    destinations: ["Tokyo", "Kyoto"],
    dates: "Jan 18-25, 2025",
    travelers: "2 adults, 2 children",
    budget: "moderate",
    dietaryNotes: "Vegetarian options highlighted throughout"
  },

  days: [
    // Day 1: Tokyo Arrival
    {
      day: 1,
      date: "2025-01-18",
      city: "Tokyo",
      title: "Arrival & First Taste of Tokyo",
      highlights: ["Shinjuku Gyoen", "Vegan dinner at AIN SOPH"],
      slots: [/* ... */]
    },

    // Day 2: Tokyo - East Side
    {
      day: 2,
      date: "2025-01-19",
      city: "Tokyo",
      title: "Temples, Tech & Tradition",
      highlights: ["Senso-ji Temple", "Akihabara", "TeamLab"],
      slots: [/* ... */]
    },

    // Day 3: Tokyo - Pop Culture
    {
      day: 3,
      date: "2025-01-20",
      city: "Tokyo",
      title: "Tokyo Pop Culture Day",
      highlights: ["Harajuku", "Shibuya Crossing", "Ghibli Store"],
      slots: [/* ... */]
    },

    // Day 4: Travel to Kyoto
    {
      day: 4,
      date: "2025-01-21",
      city: "Tokyo → Kyoto",
      title: "Bullet Train Adventure",
      highlights: ["Tsukiji Market", "Shinkansen", "Fushimi Inari"],
      slots: [/* ... */]
    },

    // Day 5: Kyoto - Classic
    {
      day: 5,
      date: "2025-01-22",
      city: "Kyoto",
      title: "Classic Kyoto",
      highlights: ["Kinkaku-ji", "Ryoan-ji", "Arashiyama"],
      slots: [/* ... */]
    },

    // Day 6: Kyoto - East
    {
      day: 6,
      date: "2025-01-23",
      city: "Kyoto",
      title: "Eastern Kyoto Temples",
      highlights: ["Kiyomizu-dera", "Gion District", "Nishiki Market"],
      slots: [/* ... */]
    },

    // Day 7: Kyoto - Day Trip Option
    {
      day: 7,
      date: "2025-01-24",
      city: "Kyoto",
      title: "Nara Day Trip or Relaxed Kyoto",
      highlights: ["Nara deer park", "Todai-ji", "or Kyoto crafts"],
      slots: [/* ... */]
    },

    // Day 8: Departure
    {
      day: 8,
      date: "2025-01-25",
      city: "Departure",
      title: "Return to Narita",
      note: "Early departure for NRT. 3.5hr journey.",
      slots: [
        {
          time: "06:30",
          activity: "Depart Kyoto Station (Shinkansen)"
        },
        {
          time: "08:45",
          activity: "Arrive Tokyo, transfer to Narita Express"
        },
        {
          time: "10:30",
          activity: "Arrive Narita Airport"
        }
      ]
    }
  ],

  // Aggregated data
  bookableExperiences: [
    { name: "TeamLab Planets Tokyo", viatorCode: "...", price: 38 },
    { name: "Fushimi Inari Guided Walk", viatorCode: "...", price: 45 },
    { name: "Nara Day Trip from Kyoto", viatorCode: "...", price: 89 }
  ],

  restaurantReservations: [
    { day: 1, name: "AIN SOPH.ripple", cuisine: "Vegan", needsBooking: false },
    { day: 3, name: "Afuri Ramen", cuisine: "Vegan Ramen", needsBooking: false },
    { day: 5, name: "Shigetsu", cuisine: "Shojin Ryori", needsBooking: true }
  ],

  transportBookings: [
    { type: "Shinkansen", route: "Tokyo → Kyoto", date: "2025-01-21", cost: "~$360 for 4" },
    { type: "Shinkansen + NEX", route: "Kyoto → NRT", date: "2025-01-25", cost: "~$480 for 4" }
  ],

  estimatedBudget: {
    activities: "$300-400",
    dining: "$600-800",
    transport: "$840",
    accommodation: "Not included",
    total: "~$1,740-2,040 (excl. hotels)"
  }
};
```

---

### STEP 8: Commute Time Between Activities

```typescript
// ============================================
// COMMUTE TIME CALCULATION
// ============================================

interface Location {
  lat: number;
  lng: number;
  neighborhood: string;
  nearestStation?: string;
}

interface CommuteInfo {
  fromActivity: string;
  toActivity: string;
  duration: number;        // minutes
  method: "walk" | "train" | "taxi" | "bus";
  distance: number;        // km
  cost?: number;           // in local currency
  instructions?: string;
  trainLines?: string[];   // e.g., ["JR Yamanote", "Tokyo Metro"]
}

// Option 1: Google Maps Directions API (PREFERRED - most accurate)
async function getCommuteTime(from: Location, to: Location): Promise<CommuteInfo> {
  const response = await fetch(
    `https://maps.googleapis.com/maps/api/directions/json?` +
    `origin=${from.lat},${from.lng}&` +
    `destination=${to.lat},${to.lng}&` +
    `mode=transit&` +  // Use public transit
    `key=${GOOGLE_MAPS_API_KEY}`
  );

  const data = await response.json();
  const route = data.routes[0].legs[0];

  return {
    fromActivity: from.name,
    toActivity: to.name,
    duration: Math.ceil(route.duration.value / 60), // Convert to minutes
    method: detectMethod(route),
    distance: route.distance.value / 1000,
    instructions: route.steps.map(s => s.html_instructions).join(" → "),
    trainLines: extractTrainLines(route)
  };
}

// Option 2: Estimate based on neighborhoods (FREE - no API needed)
const TOKYO_COMMUTE_MATRIX: Record<string, Record<string, number>> = {
  "Shinjuku": {
    "Shinjuku": 5,        // Same area = 5 min walk
    "Shibuya": 15,        // JR Yamanote line
    "Harajuku": 12,       // JR Yamanote line
    "Asakusa": 35,        // Metro transfer
    "Akihabara": 25,      // JR Chuo/Sobu line
    "Tokyo Station": 20,  // JR Chuo line
    "Ginza": 25,          // Metro Marunouchi
    "Odaiba": 45,         // Rinkai line
    "Ueno": 30,           // JR Yamanote
  },
  "Shibuya": {
    "Shinjuku": 15,
    "Shibuya": 5,
    "Harajuku": 8,        // Walking distance!
    "Asakusa": 40,
    "Akihabara": 30,
    // ... etc
  },
  // ... more neighborhoods
};

const KYOTO_COMMUTE_MATRIX: Record<string, Record<string, number>> = {
  "Kyoto Station": {
    "Kyoto Station": 5,
    "Fushimi Inari": 10,  // JR Nara line (2 stops)
    "Kiyomizu-dera": 20,  // Bus 100/206
    "Gion": 20,           // Bus or walk
    "Arashiyama": 25,     // JR Sagano line
    "Kinkaku-ji": 35,     // Bus 101/205
    "Nijo Castle": 15,    // Subway
  },
  "Gion": {
    "Kiyomizu-dera": 15,  // Walk uphill
    "Nishiki Market": 10, // Walk
    "Philosopher's Path": 25, // Bus
  },
  // ... more neighborhoods
};

function estimateCommute(
  from: string,
  to: string,
  city: string
): CommuteInfo {
  const matrix = city === "Tokyo" ? TOKYO_COMMUTE_MATRIX : KYOTO_COMMUTE_MATRIX;

  // Find neighborhoods
  const fromNeighborhood = from.neighborhood || detectNeighborhood(from, city);
  const toNeighborhood = to.neighborhood || detectNeighborhood(to, city);

  // Look up in matrix
  const duration = matrix[fromNeighborhood]?.[toNeighborhood]
    || matrix[toNeighborhood]?.[fromNeighborhood]  // Try reverse
    || 30; // Default fallback

  return {
    fromActivity: from,
    toActivity: to,
    duration,
    method: duration <= 10 ? "walk" : "train",
    distance: duration * 0.5, // Rough estimate: 0.5km per minute
    instructions: `${fromNeighborhood} → ${toNeighborhood} (~${duration} min)`
  };
}
```

**How Commute Time Affects Scheduling:**

```typescript
// When building a day schedule, we check if activities fit WITH commute time

function validateDaySchedule(slots: ScheduledSlot[]): ValidationResult {
  const issues: string[] = [];

  for (let i = 0; i < slots.length - 1; i++) {
    const current = slots[i];
    const next = slots[i + 1];

    if (!current.activity || !next.activity) continue;

    // Calculate end time of current activity
    const currentEndTime = addMinutes(current.startTime, current.activity.duration);

    // Get commute time to next activity
    const commute = estimateCommute(
      current.activity.location,
      next.activity.location,
      current.city
    );

    // Check if there's enough buffer
    const arrivalAtNext = addMinutes(currentEndTime, commute.duration);
    const nextStartTime = parseTime(next.startTime);

    if (arrivalAtNext > nextStartTime) {
      issues.push(
        `⚠️ Tight timing: ${current.activity.name} ends at ${currentEndTime}, ` +
        `need ${commute.duration}min to reach ${next.activity.name} ` +
        `which starts at ${next.startTime}`
      );
    }

    // Insert commute block between activities
    current.commuteToNext = commute;
  }

  return {
    isValid: issues.length === 0,
    issues,
    adjustedSchedule: slots
  };
}
```

**Example: Day 2 Tokyo with Commute Times**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  DAY 2 - TOKYO                                                              │
│  Theme: Temples, Tech & Tradition                                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  09:00 - 11:00  │ Senso-ji Temple & Nakamise                               │
│                 │ 📍 Asakusa                                                │
│                 │ ⏱️ 2 hours │ FREE                                         │
│                 │                                                           │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│  🚃 25 min │ Asakusa → Akihabara (TX Line direct)                          │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                 │                                                           │
│  11:30 - 13:00  │ Akihabara Electric Town                                  │
│                 │ 📍 Akihabara                                              │
│                 │ ⏱️ 1.5 hours │ FREE (browsing)                            │
│                 │ 👾 Kids will love: arcades, Pokémon Center               │
│                 │                                                           │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│  🚶 5 min │ Walk to restaurant                                             │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                 │                                                           │
│  13:00 - 14:00  │ 🍽️ LUNCH: Soranoiro (Veggie Ramen)                       │
│                 │ 📍 Tokyo Station area                                     │
│                 │ ★★★★☆ 4.2 │ $$ │ Vegetarian-friendly                     │
│                 │                                                           │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│  🚃 30 min │ Tokyo Station → Odaiba (Yurikamome Line)                      │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                 │                                                           │
│  14:30 - 17:00  │ TeamLab Planets                                          │
│                 │ 📍 Odaiba                                                 │
│                 │ ⏱️ 2.5 hours │ ¥3,200/person                              │
│                 │ ✨ BOOK AHEAD - sells out!                                │
│                 │ [Book on Viator - $38] [Official Site]                   │
│                 │                                                           │
└─────────────────────────────────────────────────────────────────────────────┘

Total commute time for Day 2: ~60 minutes
Neighborhood flow: Asakusa → Akihabara → Tokyo Station → Odaiba
This is efficient! (eastward flow, no backtracking)
```

---

### STEP 9: Multiple Options Per Slot

Instead of auto-selecting one activity, we present **choices** to the user:

```typescript
interface SlotWithOptions {
  slotId: string;
  date: string;
  timeRange: { start: string; end: string };
  slotType: "morning" | "lunch" | "afternoon" | "dinner" | "evening";

  // THE KEY CHANGE: Multiple ranked options instead of single selection
  options: RankedActivityOption[];

  // User's selection (initially null)
  selectedOption: string | null;

  // Context for why these options were chosen
  reasoning: string;
}

interface RankedActivityOption {
  id: string;
  rank: number;              // 1 = top recommendation
  score: number;             // From scoring algorithm
  activity: CoreActivity | Restaurant | ViatorProduct;
  source: "ai" | "yelp" | "viator" | "events";

  // Why this option?
  matchReasons: string[];    // e.g., ["Matches your interest in art", "Perfect for morning"]
  tradeoffs?: string[];      // e.g., ["Further from hotel", "May be crowded"]

  // Logistics
  commuteFromPrevious?: CommuteInfo;
  fitsInTimeSlot: boolean;

  // Enhancement options (for core activities)
  viatorEnhancements?: ViatorProduct[];
}
```

**Example: Afternoon Slot Options for Day 2**

```typescript
const day2AfternoonOptions: SlotWithOptions = {
  slotId: "day2-afternoon",
  date: "2025-01-19",
  timeRange: { start: "14:00", end: "18:00" },
  slotType: "afternoon",

  options: [
    {
      id: "teamlab-planets",
      rank: 1,
      score: 92,
      activity: {
        name: "TeamLab Planets",
        category: "museum",
        description: "Immersive digital art museum - walk through water and projections",
        duration: 150,
        isFree: false,
        estimatedCost: { min: 3200, max: 3200, currency: "JPY" },
        neighborhood: "Odaiba"
      },
      source: "ai",
      matchReasons: [
        "✓ Perfect for families with kids",
        "✓ Interactive - kids can touch and play",
        "✓ Indoor - good for cold January day",
        "✓ Unique to Tokyo"
      ],
      tradeoffs: [
        "⚠️ 30min commute from Akihabara",
        "⚠️ Must book in advance",
        "⚠️ Can be crowded on weekends"
      ],
      commuteFromPrevious: {
        duration: 30,
        method: "train",
        instructions: "Yurikamome Line from Shimbashi"
      },
      fitsInTimeSlot: true,
      viatorEnhancements: [
        {
          productCode: "12345P1",
          title: "TeamLab Planets Skip-the-Line Ticket",
          price: { amount: 38, currency: "USD" },
          benefit: "Guaranteed entry, no waiting"
        }
      ]
    },
    {
      id: "ueno-museums",
      rank: 2,
      score: 85,
      activity: {
        name: "Ueno Park & Museums",
        category: "park",
        description: "Japan's first public park with multiple museums, zoo, and shrines",
        duration: 180,
        isFree: true, // Park is free, museums extra
        neighborhood: "Ueno"
      },
      source: "ai",
      matchReasons: [
        "✓ Free to explore the park",
        "✓ National Science Museum great for kids",
        "✓ Zoo option if kids want animals",
        "✓ Close to Akihabara (15 min)"
      ],
      tradeoffs: [
        "⚠️ Less unique than TeamLab",
        "⚠️ Outdoor portions cold in January",
        "⚠️ Museums cost extra (¥600-1000 each)"
      ],
      commuteFromPrevious: {
        duration: 15,
        method: "train",
        instructions: "JR Yamanote Line"
      },
      fitsInTimeSlot: true
    },
    {
      id: "tokyo-skytree",
      rank: 3,
      score: 78,
      activity: {
        name: "Tokyo Skytree",
        category: "viewpoint",
        description: "World's tallest tower with observation decks at 350m and 450m",
        duration: 90,
        isFree: false,
        estimatedCost: { min: 2100, max: 3100, currency: "JPY" },
        neighborhood: "Sumida"
      },
      source: "ai",
      matchReasons: [
        "✓ Amazing views on clear day",
        "✓ Kids love the height",
        "✓ Indoor activity",
        "✓ Shopping mall attached"
      ],
      tradeoffs: [
        "⚠️ Just a view - less interactive",
        "⚠️ Expensive for family of 4",
        "⚠️ Can be foggy/cloudy in winter"
      ],
      commuteFromPrevious: {
        duration: 20,
        method: "train",
        instructions: "Tsukuba Express to Asakusa, then walk"
      },
      fitsInTimeSlot: true
    },
    {
      id: "ghibli-museum",
      rank: 4,
      score: 72,
      activity: {
        name: "Ghibli Museum",
        category: "museum",
        description: "Magical museum dedicated to Studio Ghibli films",
        duration: 120,
        isFree: false,
        estimatedCost: { min: 1000, max: 1000, currency: "JPY" }
      },
      source: "ai",
      matchReasons: [
        "✓ Perfect for Ghibli fans",
        "✓ Magical experience for kids",
        "✓ Indoor activity"
      ],
      tradeoffs: [
        "❌ MUST book weeks in advance",
        "❌ Likely sold out for your dates",
        "⚠️ 45min commute from Akihabara"
      ],
      fitsInTimeSlot: true,
      available: false // Pre-checked availability
    }
  ],

  selectedOption: null, // User hasn't chosen yet

  reasoning: "Recommending interactive/indoor activities for January afternoon with kids. TeamLab ranked #1 for unique experience + family appeal."
};
```

**UI for Options Selection:**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  AFTERNOON (2:00 PM - 6:00 PM)                                              │
│  Choose an activity:                                                        │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ⭐ RECOMMENDED                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  [Image]    TeamLab Planets                           SCORE: 92/100  │ │
│  │             Digital art immersion • 2.5 hrs • ¥3,200                 │ │
│  │                                                                       │ │
│  │  ✓ Perfect for families  ✓ Interactive  ✓ Indoor (warm!)            │ │
│  │  🚃 30 min from Akihabara                                            │ │
│  │                                                                       │ │
│  │  [Select This]  [Book Skip-Line $38]  [More Info]                   │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
│                                                                             │
│  OTHER OPTIONS                                                              │
│  ┌─────────────────────┐  ┌─────────────────────┐  ┌─────────────────────┐ │
│  │ Ueno Park &         │  │ Tokyo Skytree       │  │ Ghibli Museum      │ │
│  │ Museums             │  │                     │  │                     │ │
│  │ ⭐ 85 │ FREE+       │  │ ⭐ 78 │ ¥2,100     │  │ ⭐ 72 │ SOLD OUT   │ │
│  │ 🚃 15 min           │  │ 🚃 20 min           │  │ 🚃 45 min           │ │
│  │                     │  │                     │  │                     │ │
│  │ [Select]            │  │ [Select]            │  │ [Unavailable]       │ │
│  └─────────────────────┘  └─────────────────────┘  └─────────────────────┘ │
│                                                                             │
│  [+ Browse more options]                    [Skip this slot - free time]   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### STEP 10: Neighborhood Clustering for Efficiency

```typescript
// Smart day planning: Group activities by area to minimize commute

interface NeighborhoodCluster {
  neighborhood: string;
  activities: CoreActivity[];
  totalDuration: number;  // Combined activity time
  bestTimeOfDay: "morning" | "afternoon" | "evening";
}

function planEfficientDay(
  allActivities: CoreActivity[],
  city: string
): NeighborhoodCluster[] {

  // Group by neighborhood
  const clusters = groupBy(allActivities, a => a.neighborhood);

  // Score each cluster for time-of-day
  const scoredClusters = Object.entries(clusters).map(([neighborhood, activities]) => {
    const morningScore = activities.filter(a => a.bestTimeOfDay === "morning").length;
    const afternoonScore = activities.filter(a => a.bestTimeOfDay === "afternoon").length;
    const eveningScore = activities.filter(a => a.bestTimeOfDay === "evening").length;

    return {
      neighborhood,
      activities,
      totalDuration: activities.reduce((sum, a) => sum + a.duration, 0),
      bestTimeOfDay: morningScore >= afternoonScore && morningScore >= eveningScore
        ? "morning"
        : afternoonScore >= eveningScore
        ? "afternoon"
        : "evening"
    };
  });

  // Sort clusters by optimal time-of-day
  return scoredClusters.sort((a, b) => {
    const order = { morning: 0, afternoon: 1, evening: 2 };
    return order[a.bestTimeOfDay] - order[b.bestTimeOfDay];
  });
}

// Example output for Day 2:
const day2Clusters = [
  {
    neighborhood: "Asakusa",
    activities: ["Senso-ji Temple", "Nakamise Shopping Street"],
    totalDuration: 120, // 2 hours
    bestTimeOfDay: "morning",
    reasoning: "Temples best visited early before crowds"
  },
  {
    neighborhood: "Akihabara",
    activities: ["Electric Town", "Arcades", "Pokémon Center"],
    totalDuration: 120,
    bestTimeOfDay: "afternoon", // Actually flexible
    reasoning: "Shops open 10am-8pm, arcades busier evening"
  },
  {
    neighborhood: "Odaiba",
    activities: ["TeamLab Planets", "DiverCity"],
    totalDuration: 180,
    bestTimeOfDay: "afternoon",
    reasoning: "TeamLab has timed entry, book 2-3pm slot"
  }
];

// This creates an EFFICIENT geographic flow:
// Asakusa (east) → Akihabara (central) → Odaiba (south)
// Total commute: ~55 min (vs. 90+ min with random order)
```

**Visual: Geographic Day Planning**

```
                    N
                    ↑
        ┌───────────────────────┐
        │      TOKYO MAP        │
        │                       │
        │   ① Asakusa          │  ← Morning (9-11am)
        │      ↓ 25min         │
        │   ② Akihabara        │  ← Midday (11:30-1pm)
        │      ↓ 30min         │     + Lunch
        │   ③ Odaiba           │  ← Afternoon (2:30-5pm)
        │      ↓ 25min         │
        │   ④ Shinjuku         │  ← Evening (dinner)
        │      (hotel)          │
        │                       │
        └───────────────────────┘

     Total commute: 80 min

     ❌ BAD PLAN (backtracking):
     Shinjuku → Asakusa → Odaiba → Akihabara → Shinjuku
     Total commute: 140 min (almost 2.5 hours wasted!)
```

---

## ADAPTIVE SCHEDULING: Two Modes

The algorithm operates in two distinct modes with different triggers and behaviors:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│   MODE 1: PLANNING                    MODE 2: EXECUTION                     │
│   (Before trip)                       (During trip)                         │
│                                                                             │
│   ┌─────────────────────┐             ┌─────────────────────┐              │
│   │ User selects        │             │ User marks activity │              │
│   │ activity for slot   │             │ as "done" or        │              │
│   │        ↓            │             │ "taking longer"     │              │
│   │ Recalculate         │             │        ↓            │              │
│   │ remaining slots     │             │ Recalculate REST    │              │
│   │ in ENTIRE trip      │             │ of TODAY only       │              │
│   │        ↓            │             │        ↓            │              │
│   │ Update suggestions  │             │ Push/adjust times   │              │
│   │ based on what's     │             │ Suggest alternatives│              │
│   │ already planned     │             │ if slots squeezed   │              │
│   └─────────────────────┘             └─────────────────────┘              │
│                                                                             │
│   TRIGGERS:                           TRIGGERS:                             │
│   • User fills a slot                 • Activity completed                  │
│   • User skips a slot                 • Activity running over               │
│   • User changes preferences          • User skips activity                │
│   • User reorders days                • Weather changes                     │
│                                       • Venue closed unexpectedly           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### MODE 1: PLANNING ADAPTATION

**When:** User is building their itinerary before the trip

```typescript
// ============================================
// PLANNING STATE
// ============================================

interface PlanningState {
  tripId: string;

  // Overall trip context
  destinations: CityStay[];
  totalDays: number;

  // What's been decided vs pending
  confirmedSlots: ConfirmedSlot[];    // User has selected an activity
  pendingSlots: PendingSlot[];        // Still needs suggestions

  // Accumulated constraints from confirmed slots
  constraints: PlanningConstraints;
}

interface PlanningConstraints {
  // Categories already covered (per city)
  categoriesByCity: Record<string, string[]>;
  // e.g., { "Tokyo": ["temple", "museum", "market"], "Kyoto": ["temple"] }

  // Neighborhoods visited per day (for geographic efficiency)
  neighborhoodsByDay: Record<string, string[]>;
  // e.g., { "2025-01-19": ["Asakusa", "Akihabara", "Odaiba"] }

  // Budget tracking
  plannedSpendByDay: Record<string, number>;
  totalPlannedSpend: number;

  // Activities explicitly rejected
  rejectedActivities: string[];  // "Not interested in Robot Restaurant"

  // Activities saved for consideration
  maybeList: string[];  // "Consider Ghibli Museum if tickets available"

  // Dining preferences learned
  confirmedRestaurantTypes: string[];  // ["vegan", "ramen", "sushi"]
  rejectedRestaurantTypes: string[];   // ["yakiniku", "izakaya"]
}
```

#### How Planning Adaptation Works

```typescript
async function onSlotFilled(
  state: PlanningState,
  filledSlot: ConfirmedSlot
): Promise<PlanningState> {

  // 1. UPDATE CONSTRAINTS based on what was just selected
  const newConstraints = updateConstraints(state.constraints, filledSlot);

  // 2. IDENTIFY which pending slots need re-generation
  const affectedSlots = findAffectedSlots(state.pendingSlots, filledSlot, newConstraints);

  // 3. RE-GENERATE suggestions for affected slots
  for (const slot of affectedSlots) {
    slot.options = await generateAdaptiveSuggestions(slot, newConstraints);
    slot.adaptationReason = explainWhyChanged(slot, filledSlot);
  }

  return {
    ...state,
    confirmedSlots: [...state.confirmedSlots, filledSlot],
    pendingSlots: state.pendingSlots.filter(s => s.id !== filledSlot.id),
    constraints: newConstraints
  };
}

function updateConstraints(
  current: PlanningConstraints,
  filled: ConfirmedSlot
): PlanningConstraints {

  const activity = filled.activity;
  const date = filled.date;
  const city = filled.city;

  return {
    ...current,

    // Add category to covered list
    categoriesByCity: {
      ...current.categoriesByCity,
      [city]: [...(current.categoriesByCity[city] || []), activity.category]
    },

    // Add neighborhood to day's route
    neighborhoodsByDay: {
      ...current.neighborhoodsByDay,
      [date]: [...(current.neighborhoodsByDay[date] || []), activity.neighborhood]
    },

    // Update budget
    plannedSpendByDay: {
      ...current.plannedSpendByDay,
      [date]: (current.plannedSpendByDay[date] || 0) + (activity.estimatedCost?.max || 0)
    },
    totalPlannedSpend: current.totalPlannedSpend + (activity.estimatedCost?.max || 0)
  };
}
```

#### Example: Planning Adaptation in Action

```
SCENARIO: User is planning Day 2 in Tokyo

INITIAL STATE (nothing selected):
┌─────────────────────────────────────────────────────────────────────────────┐
│  DAY 2 - All slots pending                                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  Morning:   [5 options] Senso-ji, Meiji Shrine, Tsukiji, Fish Market...    │
│  Lunch:     [8 options] Various restaurants near suggested morning spots   │
│  Afternoon: [6 options] TeamLab, Ueno, Skytree, Akihabara, Harajuku...     │
│  Dinner:    [8 options] Various restaurants                                 │
│  Evening:   [4 options] Shibuya, Shinjuku nightlife, Robot Restaurant...   │
└─────────────────────────────────────────────────────────────────────────────┘

USER ACTION: Selects "Senso-ji Temple" for morning

ADAPTATION TRIGGERS:
├── Category "temple" now covered for Tokyo
├── Neighborhood "Asakusa" added to Day 2 route
├── Morning slot: 9:00-11:00 confirmed
└── Commute baseline established (user will be in Asakusa at 11am)

UPDATED STATE:
┌─────────────────────────────────────────────────────────────────────────────┐
│  DAY 2 - Morning confirmed, rest adapting                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│  Morning:   ✓ CONFIRMED: Senso-ji Temple (Asakusa)                         │
│             ──────────────────────────────────────────────────              │
│  Lunch:     [6 options] CHANGED! Now prioritizing:                         │
│             • Restaurants in/near Asakusa (proximity)                      │
│             • Removed options in Shinjuku (too far for lunch)              │
│             NEW #1: Asakusa vegetarian soba (was #4)                       │
│             ──────────────────────────────────────────────────              │
│  Afternoon: [5 options] CHANGED!                                           │
│             • Meiji Shrine DEMOTED (another temple - variety)              │
│             • Akihabara PROMOTED (easy commute from Asakusa)               │
│             • TeamLab still #1 (unique, not a temple)                      │
│             REMOVED: Senso-ji area walk (already doing morning)            │
│             ──────────────────────────────────────────────────              │
│  Dinner:    [8 options] Slightly adjusted based on likely afternoon area   │
│             ──────────────────────────────────────────────────              │
│  Evening:   [4 options] No major changes yet                               │
└─────────────────────────────────────────────────────────────────────────────┘

USER ACTION: Selects "Akihabara" for afternoon

ADDITIONAL ADAPTATIONS:
├── Route: Asakusa → [lunch] → Akihabara (eastward flow ✓)
├── Lunch options: Now MUST be between Asakusa and Akihabara
│   • Ueno area promoted (on the way)
│   • Akihabara restaurants added
├── Evening options:
│   • Shinjuku demoted (far from Akihabara)
│   • Shibuya demoted (backtracking)
│   • Odaiba PROMOTED (continuation eastward, then back to hotel)
└── Category: "electronics/gaming" now covered
```

#### Scoring Adjustments During Planning

```typescript
function scoreWithPlanningContext(
  activity: Activity,
  slot: PendingSlot,
  constraints: PlanningConstraints
): number {

  let score = activity.baseScore;  // Start with base relevance score

  // ========== VARIETY SCORING ==========

  // Penalize if category already covered (in this city)
  const cityCoveredCategories = constraints.categoriesByCity[slot.city] || [];
  if (cityCoveredCategories.includes(activity.category)) {
    score -= 25;
    // But don't eliminate - user might want two temples
  }

  // Bonus if category NOT covered yet (encourage variety)
  if (!cityCoveredCategories.includes(activity.category)) {
    score += 10;
  }

  // Heavy penalty if exact same activity already planned
  if (constraints.confirmedSlots.some(s => s.activity.id === activity.id)) {
    score -= 100;  // Effectively removes it
  }

  // ========== GEOGRAPHIC SCORING ==========

  // Get the route so far for this day
  const dayRoute = constraints.neighborhoodsByDay[slot.date] || [];

  if (dayRoute.length > 0) {
    const lastNeighborhood = dayRoute[dayRoute.length - 1];
    const commute = estimateCommute(lastNeighborhood, activity.neighborhood, slot.city);

    // Reward proximity (efficient routing)
    if (commute.duration <= 15) score += 20;
    else if (commute.duration <= 25) score += 10;
    else if (commute.duration >= 45) score -= 15;  // Penalize far activities

    // Penalize backtracking
    if (isBacktracking(dayRoute, activity.neighborhood, slot.city)) {
      score -= 20;
    }
  }

  // ========== BUDGET SCORING ==========

  const daySpentSoFar = constraints.plannedSpendByDay[slot.date] || 0;
  const tripSpentSoFar = constraints.totalPlannedSpend;

  // If already expensive day, prefer free/cheap
  if (daySpentSoFar > 10000) {  // ¥10,000 = ~$70
    if (activity.isFree) score += 15;
    if (activity.estimatedCost?.max > 5000) score -= 10;
  }

  // ========== TIME-OF-DAY SCORING ==========

  // This slot is afternoon, activity best in morning → penalty
  if (slot.slotType !== activity.bestTimeOfDay && activity.bestTimeOfDay !== "anytime") {
    score -= 15;
  }

  // ========== PREFERENCE LEARNING ==========

  // If user rejected similar activities, demote
  if (constraints.rejectedActivities.some(r => isSimilar(r, activity))) {
    score -= 30;
  }

  return Math.max(0, score);
}
```

---

### MODE 2: EXECUTION ADAPTATION

**When:** User is on the trip, things change in real-time

```typescript
// ============================================
// EXECUTION STATE
// ============================================

interface ExecutionState {
  tripId: string;
  currentDate: string;
  currentTime: string;

  // Today's schedule (the focus)
  todaySchedule: TodaySchedule;

  // Real-time tracking
  activeActivity: ActiveActivity | null;  // What's happening now
  completedToday: CompletedActivity[];

  // Deviation tracking
  runningLateBy: number;  // minutes behind schedule
  runningEarlyBy: number; // minutes ahead of schedule

  // Live conditions
  currentWeather: WeatherCondition;
  unexpectedClosures: string[];  // "Senso-ji closed for ceremony"

  // User energy/mood (inferred or explicit)
  energyLevel: "high" | "medium" | "low" | "exhausted";

  // What's left today
  remainingSlots: RemainingSlot[];
}

interface ActiveActivity {
  slotId: string;
  activity: Activity;
  plannedStart: string;  // "14:00"
  plannedEnd: string;    // "16:30"
  actualStart: string;   // "14:15" (started 15 min late)

  // Live tracking
  status: "on-track" | "running-over" | "wrapping-up";
  estimatedActualEnd?: string;  // "17:00" (30 min over)
}

interface RemainingSlot {
  slotId: string;
  originalTime: { start: string; end: string };
  adjustedTime: { start: string; end: string };  // After real-time adjustment

  status: "confirmed" | "at-risk" | "needs-change";

  // If at-risk or needs-change
  issue?: string;  // "Only 45 min left instead of 90 min"
  alternatives?: Activity[];  // Shorter activities that fit
}
```

#### Execution Triggers & Responses

```typescript
// ============================================
// TRIGGER 1: Activity Running Overtime
// ============================================

async function onActivityRunningOver(
  state: ExecutionState,
  overtimeMinutes: number
): Promise<ExecutionState> {

  console.log(`Activity running ${overtimeMinutes} min over schedule`);

  // 1. CALCULATE impact on remaining slots
  const impact = calculateScheduleImpact(state.remainingSlots, overtimeMinutes);

  // 2. DETERMINE adjustment strategy
  let strategy: AdjustmentStrategy;

  if (overtimeMinutes <= 15) {
    // Minor delay - just compress buffer time
    strategy = { type: "compress-buffers", minutes: overtimeMinutes };

  } else if (overtimeMinutes <= 30) {
    // Moderate delay - shorten next activity or skip buffer
    strategy = {
      type: "shorten-next",
      minutes: overtimeMinutes,
      suggestion: "Spend less time at next stop, or take a quicker route"
    };

  } else if (overtimeMinutes <= 60) {
    // Significant delay - need to skip or swap something
    strategy = {
      type: "skip-or-swap",
      candidates: findSkippableSlots(state.remainingSlots),
      alternatives: await findShorterAlternatives(state)
    };

  } else {
    // Major delay - reschedule rest of day
    strategy = {
      type: "reschedule-day",
      message: "Significant delay. Let's reorganize the rest of your day.",
      newSchedule: await generateNewAfternoonPlan(state)
    };
  }

  // 3. PRESENT options to user
  return {
    ...state,
    runningLateBy: overtimeMinutes,
    adjustmentStrategy: strategy,
    remainingSlots: impact.adjustedSlots
  };
}

// Example adjustment strategies:

const adjustmentStrategies = {
  // Strategy 1: Compress buffer time between activities
  "compress-buffers": {
    example: "Lunch ran 20 min over → Reduce walking/buffer time, head straight to TeamLab",
    impact: "No activity changes, just tighter schedule"
  },

  // Strategy 2: Shorten next activity
  "shorten-next": {
    example: "Lunch ran 30 min over → Spend 1.5hr at TeamLab instead of 2.5hr",
    impact: "Less time at next activity, but still doable"
  },

  // Strategy 3: Skip or swap an activity
  "skip-or-swap": {
    example: "Lunch ran 45 min over → Skip Akihabara, go straight to TeamLab",
    alternatives: [
      "Skip Akihabara (electronic stores) - can do tomorrow",
      "Swap TeamLab for Tokyo Skytree (shorter: 1hr vs 2.5hr)",
      "Skip Skytree, keep both Akihabara and TeamLab with shorter times"
    ]
  },

  // Strategy 4: Complete day reschedule
  "reschedule-day": {
    example: "It's 4pm and you're still at lunch location",
    action: "Regenerate evening plan from scratch based on current location"
  }
};
```

#### Example: Execution Adaptation in Action

```
SCENARIO: Day 2 in Tokyo, lunch running overtime

ORIGINAL PLAN:
┌─────────────────────────────────────────────────────────────────────────────┐
│  09:00-11:00  │ ✓ DONE: Senso-ji Temple                                    │
│  11:00-11:25  │ ✓ DONE: Commute to Akihabara                               │
│  11:30-13:00  │ ✓ DONE: Akihabara browsing                                 │
│  13:00-14:00  │ 🔄 IN PROGRESS: Lunch at Soranoiro                         │
│  14:00-14:30  │ ⏳ Commute to Odaiba                                        │
│  14:30-17:00  │ ⏳ TeamLab Planets (BOOKED for 15:00 entry)                 │
│  17:00-17:30  │ ⏳ Commute to Shibuya                                       │
│  18:00-19:30  │ ⏳ Dinner in Shibuya                                        │
│  20:00-21:30  │ ⏳ Shibuya Crossing & evening walk                          │
└─────────────────────────────────────────────────────────────────────────────┘

⚠️ TRIGGER: It's 14:15 and family is still enjoying lunch + kids want dessert

SYSTEM DETECTS:
├── Current time: 14:15
├── Lunch planned end: 14:00
├── Overtime: 15 minutes (and counting)
├── TeamLab booked slot: 15:00 (CRITICAL - can't miss)
├── Required: Leave for Odaiba by 14:30 latest
└── Buffer available: 15 min (was 14:00-14:30 commute, now 14:15-14:30)

ADAPTATION RESPONSE (Mode: compress-buffers):
┌─────────────────────────────────────────────────────────────────────────────┐
│  ⚠️ SCHEDULE UPDATE                                                         │
│  ─────────────────────────────────────────────────────────────────────────  │
│  You're 15 min behind. Here's the adjusted plan:                           │
│                                                                             │
│  13:00-14:20  │ 🔄 Lunch (finishing up)                                    │
│  14:20-14:50  │ ⚡ Commute to Odaiba (LEAVE BY 14:25!)                      │
│               │    → Take taxi instead of train to save 10 min             │
│               │    → Estimated cost: ¥2,500                                │
│  14:50-17:00  │ ⏳ TeamLab Planets (15:00 entry - you'll make it!)         │
│  ... rest unchanged ...                                                     │
│                                                                             │
│  [Accept Plan]  [Take Train Anyway]  [Call TeamLab to Reschedule]          │
└─────────────────────────────────────────────────────────────────────────────┘

─────────────────────────────────────────────────────────────────────────────

⚠️ WORSE SCENARIO: It's 14:45 and they're still at dessert

SYSTEM DETECTS:
├── Current time: 14:45
├── Overtime: 45 minutes
├── TeamLab 15:00 slot: WILL MISS (30 min commute minimum)
├── Options: Reschedule TeamLab OR skip and find alternative
└── Impact: Major

ADAPTATION RESPONSE (Mode: skip-or-swap):
┌─────────────────────────────────────────────────────────────────────────────┐
│  🚨 SCHEDULE CONFLICT                                                       │
│  ─────────────────────────────────────────────────────────────────────────  │
│  You'll miss your 15:00 TeamLab entry. Here are your options:              │
│                                                                             │
│  OPTION A: Reschedule TeamLab                                              │
│  ├── Next available slot: 17:00 (checking availability...)                │
│  ├── New plan: Akihabara → More shopping → TeamLab 17:00-19:30            │
│  └── Trade-off: Miss dinner reservation, eat late                         │
│                                                                             │
│  OPTION B: Skip TeamLab Today                                              │
│  ├── Move to Day 3 or 4 (checking availability...)                        │
│  ├── Today instead: Tokyo Skytree (nearby, no booking needed)             │
│  └── Trade-off: Rearranges later days                                     │
│                                                                             │
│  OPTION C: Rush to TeamLab                                                 │
│  ├── Leave NOW, take taxi (¥4,000)                                         │
│  ├── Might make 15:15 late entry (they sometimes allow 15min grace)       │
│  └── Trade-off: Stressful, not guaranteed                                 │
│                                                                             │
│  OPTION D: Free Afternoon                                                  │
│  ├── Skip structured activities                                            │
│  ├── Explore Akihabara at your own pace                                    │
│  └── Trade-off: Miss TeamLab entirely                                     │
│                                                                             │
│  [Choose A]  [Choose B]  [Choose C]  [Choose D]                            │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Real-Time Suggestion Adjustments

```typescript
function adjustSuggestionsForExecution(
  originalOptions: Activity[],
  executionState: ExecutionState
): Activity[] {

  let adjusted = [...originalOptions];

  // ========== TIME CONSTRAINT ==========

  // Filter to activities that fit in remaining time
  const availableMinutes = executionState.remainingSlots[0]?.adjustedTime
    ? calculateMinutes(executionState.remainingSlots[0].adjustedTime)
    : 0;

  adjusted = adjusted.filter(a => a.duration <= availableMinutes + 15); // 15 min grace

  // ========== ENERGY LEVEL ==========

  if (executionState.energyLevel === "low" || executionState.energyLevel === "exhausted") {
    // Promote relaxing activities
    adjusted.forEach(a => {
      if (a.category === "cafe" || a.category === "park") a.score += 25;
      if (a.physicalLevel === "challenging") a.score -= 30;
      if (a.duration > 90) a.score -= 20;
    });

    // Add "head back to hotel" as an option
    adjusted.push({
      id: "rest",
      name: "Rest at Hotel",
      description: "Take a break, recharge for evening activities",
      category: "rest",
      duration: 60,
      isFree: true,
      score: 80  // High score when energy is low
    });
  }

  // ========== WEATHER CHANGES ==========

  if (executionState.currentWeather.isRaining && !wasRainingBefore) {
    // Deprioritize outdoor activities
    adjusted.forEach(a => {
      if (a.category === "park" || a.category === "walking-tour") {
        a.score -= 40;
        a.weatherWarning = "🌧️ Currently raining - outdoor activity";
      }
      if (a.isIndoor) a.score += 15;
    });
  }

  // ========== PROXIMITY TO CURRENT LOCATION ==========

  const currentLocation = executionState.activeActivity?.activity.neighborhood
    || executionState.completedToday.slice(-1)[0]?.neighborhood;

  if (currentLocation) {
    adjusted.forEach(a => {
      const commute = estimateCommute(currentLocation, a.neighborhood, executionState.city);
      // Strong preference for nearby when running late
      if (executionState.runningLateBy > 0) {
        if (commute.duration <= 10) a.score += 30;
        else if (commute.duration >= 30) a.score -= 25;
      }
    });
  }

  // Re-sort by adjusted scores
  return adjusted.sort((a, b) => b.score - a.score);
}
```

---

### STEP 11: Tinder-Style Activity Selection

Instead of traditional dropdowns or lists, we use a **swipe-based card interface** for activity selection:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│                    TINDER-STYLE ACTIVITY CARDS                              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │                         [Activity Image]                            │   │
│  │                                                                     │   │
│  │  ─────────────────────────────────────────────────────────────────  │   │
│  │                                                                     │   │
│  │   TeamLab Planets                                     ⏱️ 2.5 hrs   │   │
│  │   📍 Odaiba  •  ★ 4.8  •  ¥3,200                                   │   │
│  │                                                                     │   │
│  │   Immersive digital art museum where you walk                      │   │
│  │   through water and light installations.                           │   │
│  │                                                                     │   │
│  │   ✓ Perfect for families                                           │   │
│  │   ✓ Indoor activity                                                │   │
│  │   ✓ Unique to Tokyo                                                │   │
│  │                                                                     │   │
│  │   💡 Book 2-3pm slot for fewer crowds                              │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│           ← SWIPE LEFT              SWIPE UP ↑              SWIPE RIGHT →  │
│              REJECT                SAVE FOR                    KEEP        │
│                                     LATER                                   │
│                                                                             │
│  ┌─────────┐              ┌─────────┐              ┌─────────┐             │
│  │    ✗    │              │    ↑    │              │    ✓    │             │
│  │  Reject │              │  Later  │              │  Keep   │             │
│  └─────────┘              └─────────┘              └─────────┘             │
│                                                                             │
│   "Not interested"         "Maybe for              "Add to Day 2           │
│                             another day"            Afternoon"              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Three Swipe Actions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ACTION 1: SWIPE RIGHT → KEEP ✓                                            │
│  ─────────────────────────────────                                          │
│                                                                             │
│  • Activity added to current slot                                          │
│  • Triggers PLANNING ADAPTATION:                                            │
│    - Category marked as "covered"                                          │
│    - Neighborhood added to day's route                                     │
│    - Remaining suggestions re-ranked                                       │
│  • Move to next empty slot                                                 │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ACTION 2: SWIPE LEFT → REJECT ✗                                           │
│  ─────────────────────────────────                                          │
│                                                                             │
│  • Activity removed from suggestions                                       │
│  • Added to "rejectedActivities" list                                      │
│  • Similar activities get score penalty                                    │
│  • Show next card in stack                                                 │
│  • Optional: Quick feedback prompt                                         │
│    - "Too expensive"                                                       │
│    - "Not interested in this type"                                         │
│    - "Already been there"                                                  │
│    - "Too far away"                                                        │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  ACTION 3: SWIPE UP → SAVE FOR LATER ↑                                     │
│  ───────────────────────────────────────                                    │
│                                                                             │
│  • Activity saved to "maybeList"                                           │
│  • Options presented:                                                       │
│    a) "Add to a different day" → Show day picker                          │
│    b) "Save to wishlist" → Available for any slot                         │
│    c) "Suggest best slot" → Algorithm finds optimal placement             │
│  • Show next card in stack                                                 │
│                                                                             │
│  SMART PLACEMENT:                                                           │
│  When user says "suggest best slot":                                       │
│  • Check activity's bestTimeOfDay                                          │
│  • Find empty slots that match                                             │
│  • Consider commute from nearby planned activities                         │
│  • Avoid days with same category                                           │
│  • Present: "TeamLab would work great on Day 3 afternoon!"                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### User-Suggested Activities

Users can also ADD their own activities:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  USER INPUT: "I want to visit the Pokémon Center Mega Tokyo"               │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  SYSTEM RESPONSE:                                                           │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ✨ Great choice! I found it:                                        │   │
│  │                                                                     │   │
│  │  Pokémon Center Mega Tokyo                                          │   │
│  │  📍 Ikebukuro, Sunshine City                                        │   │
│  │  ⏱️ Suggested: 45-60 min                                            │   │
│  │  💰 Free entry (shopping optional)                                  │   │
│  │                                                                     │   │
│  │  ─────────────────────────────────────────────────────────────────  │   │
│  │                                                                     │   │
│  │  📅 WHERE SHOULD I ADD IT?                                          │   │
│  │                                                                     │   │
│  │  [Day 2 - Morning]     Route: Near Akihabara ✓                     │   │
│  │  [Day 2 - Afternoon]   Route: Detour from plan ⚠️                   │   │
│  │  [Day 3 - Any slot]    Open day, flexible                          │   │
│  │                                                                     │   │
│  │  🤖 SMART SUGGESTION:                                                │   │
│  │  "Add to Day 2 morning! You're already doing Akihabara             │   │
│  │   in the afternoon. Ikebukuro is 15 min away. Perfect              │   │
│  │   combo for your kids' gaming/anime interests!"                    │   │
│  │                                                                     │   │
│  │  [Accept Suggestion]  [Choose Different Slot]  [Save for Later]    │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### How User Suggestions Integrate

```typescript
// ============================================
// USER SUGGESTION FLOW
// ============================================

interface UserSuggestion {
  rawInput: string;           // "I want to see the Robot Restaurant"
  parsedActivity?: Activity;  // Matched/created activity
  status: "pending" | "matched" | "custom" | "rejected";
  placement: "unassigned" | "assigned" | "wishlist";
  assignedSlot?: string;      // "day2-evening"
}

async function handleUserSuggestion(input: string, tripContext: TripContext): Promise<UserSuggestionResponse> {

  // 1. TRY TO MATCH with known activities
  const matched = await matchToKnownActivity(input, tripContext.city);

  if (matched.confidence > 0.8) {
    // High confidence match
    return {
      type: "matched",
      activity: matched.activity,
      suggestedSlots: findBestSlots(matched.activity, tripContext),
      message: `Found it! "${matched.activity.name}" in ${matched.activity.neighborhood}`
    };
  }

  // 2. TRY TO ENRICH with external APIs
  const enriched = await enrichUserSuggestion(input, tripContext);

  if (enriched) {
    return {
      type: "enriched",
      activity: enriched,
      suggestedSlots: findBestSlots(enriched, tripContext),
      message: `I found info about this! Here's what I know...`
    };
  }

  // 3. CREATE CUSTOM ACTIVITY (user defines details)
  return {
    type: "custom",
    activity: {
      name: input,
      category: "custom",
      duration: null,  // User needs to specify
      neighborhood: null,  // User needs to specify
    },
    promptForDetails: true,
    message: `I don't have details on this. Can you tell me more?`
  };
}

// Find optimal slots for user-suggested activity
function findBestSlots(activity: Activity, context: TripContext): SuggestedSlot[] {
  const suggestions: SuggestedSlot[] = [];

  for (const day of context.days) {
    for (const slot of day.emptySlots) {

      // Check time-of-day match
      const timeMatch = activity.bestTimeOfDay === slot.type
        || activity.bestTimeOfDay === "anytime";

      // Check geographic efficiency
      const nearbyActivities = day.filledSlots.filter(s =>
        estimateCommute(s.neighborhood, activity.neighborhood, context.city).duration <= 20
      );

      // Check category variety
      const categoryConflict = day.filledSlots.some(s =>
        s.activity.category === activity.category
      );

      const score =
        (timeMatch ? 30 : 0) +
        (nearbyActivities.length > 0 ? 25 : 0) +
        (!categoryConflict ? 20 : 0) +
        (slot.availableMinutes >= activity.duration ? 15 : 0);

      suggestions.push({
        dayNumber: day.dayNumber,
        slotType: slot.type,
        score,
        reasoning: generateReasoning(timeMatch, nearbyActivities, categoryConflict),
        commuteFromPrevious: nearbyActivities[0]
          ? estimateCommute(nearbyActivities[0].neighborhood, activity.neighborhood, context.city)
          : null
      });
    }
  }

  // Return top 3 slots
  return suggestions.sort((a, b) => b.score - a.score).slice(0, 3);
}
```

#### Swipe Session Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  SWIPE SESSION FOR: Day 2 Afternoon                                        │
│  ═══════════════════════════════════                                        │
│                                                                             │
│  Cards in Stack: 6 activities                                              │
│  Already filled: Morning (Senso-ji), Lunch (Asakusa Soba)                  │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  CARD 1: TeamLab Planets                                                   │
│  ├── User swipes RIGHT ✓                                                   │
│  ├── Added to Day 2 Afternoon                                              │
│  └── Session ends for this slot ✓                                          │
│                                                                             │
│  ─── OR ───                                                                 │
│                                                                             │
│  CARD 1: TeamLab Planets                                                   │
│  ├── User swipes LEFT ✗ ("Too expensive")                                  │
│  ├── TeamLab removed, "expensive" activities penalized                     │
│  └── Show Card 2                                                           │
│                                                                             │
│  CARD 2: Ueno Park & Museums                                               │
│  ├── User swipes UP ↑ ("Maybe another day")                                │
│  ├── Added to wishlist                                                     │
│  ├── System: "I'll suggest Ueno for Day 3 morning!"                       │
│  └── Show Card 3                                                           │
│                                                                             │
│  CARD 3: Tokyo Skytree                                                     │
│  ├── User swipes RIGHT ✓                                                   │
│  ├── Added to Day 2 Afternoon                                              │
│  └── Session ends for this slot ✓                                          │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  END STATE:                                                                 │
│  • Day 2 Afternoon: Tokyo Skytree ✓                                        │
│  • Wishlist: Ueno Park (suggested for Day 3)                               │
│  • Rejected: TeamLab (expensive)                                           │
│  • Remaining in pool: 3 activities (for other slots)                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Rejection Feedback Loop

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  WHY DID YOU SKIP THIS?                                                    │
│  (Optional - helps improve suggestions)                                     │
│                                                                             │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐          │
│  │  💰     │  │  🚶     │  │  👎     │  │  ✓      │  │  ⏭️     │          │
│  │ Too     │  │ Too     │  │ Not my  │  │ Been    │  │ Just    │          │
│  │ pricey  │  │ far     │  │ thing   │  │ there   │  │ skip    │          │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘          │
│                                                                             │
│  SYSTEM LEARNS:                                                             │
│  ─────────────                                                              │
│  "Too pricey" → Boost free/cheap activities                                │
│  "Too far" → Increase proximity scoring weight                             │
│  "Not my thing" → Demote similar categories                                │
│  "Been there" → Remove from future suggestions                             │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Preference Learning from Swipes

```typescript
interface SwipeHistory {
  kept: Activity[];           // Swiped right
  rejected: Activity[];       // Swiped left
  savedForLater: Activity[];  // Swiped up
  rejectionReasons: Record<string, string[]>;  // { "activityId": ["too-expensive", "too-far"] }
}

function learnFromSwipes(history: SwipeHistory): PreferenceAdjustments {
  const adjustments: PreferenceAdjustments = {
    categoryBoosts: {},
    categoryPenalties: {},
    pricePreference: "moderate",
    proximityImportance: "medium",
    durationPreference: "medium",
  };

  // Analyze KEPT activities
  const keptCategories = countBy(history.kept, a => a.category);
  const keptPrices = history.kept.map(a => a.estimatedCost?.max || 0);
  const keptDurations = history.kept.map(a => a.duration);

  // Boost frequently kept categories
  for (const [category, count] of Object.entries(keptCategories)) {
    if (count >= 2) {
      adjustments.categoryBoosts[category] = count * 10;  // +10 per kept
    }
  }

  // Analyze REJECTED activities
  const rejectedCategories = countBy(history.rejected, a => a.category);

  // Penalize frequently rejected categories
  for (const [category, count] of Object.entries(rejectedCategories)) {
    if (count >= 2) {
      adjustments.categoryPenalties[category] = count * 15;  // -15 per rejection
    }
  }

  // Analyze rejection REASONS
  const reasonCounts = countReasons(history.rejectionReasons);

  if (reasonCounts["too-expensive"] >= 2) {
    adjustments.pricePreference = "budget";
  }

  if (reasonCounts["too-far"] >= 2) {
    adjustments.proximityImportance = "high";
  }

  return adjustments;
}

// Apply learned preferences to future scoring
function applyLearnedPreferences(
  activity: Activity,
  adjustments: PreferenceAdjustments
): number {
  let scoreModifier = 0;

  // Category boosts/penalties
  scoreModifier += adjustments.categoryBoosts[activity.category] || 0;
  scoreModifier -= adjustments.categoryPenalties[activity.category] || 0;

  // Price preference
  if (adjustments.pricePreference === "budget") {
    if (activity.isFree) scoreModifier += 20;
    else if (activity.estimatedCost?.max > 3000) scoreModifier -= 15;
  }

  // Proximity importance
  if (adjustments.proximityImportance === "high") {
    // Proximity scoring weight increases from 10 → 20 points
    // (Applied in main scoring function)
  }

  return scoreModifier;
}
```

#### Wishlist & "Use Elsewhere" Management

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  📋 YOUR WISHLIST                                                           │
│  Activities saved for later                                                 │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  1. Ueno Park & Museums                                              │   │
│  │     🤖 Suggested: Day 3 Morning (matches your art interest)         │   │
│  │     [Add to Day 3] [Choose Different] [Remove]                       │   │
│  │                                                                     │   │
│  │  2. Ghibli Museum                                                    │   │
│  │     ⚠️ Requires advance booking - checking availability...          │   │
│  │     [Check Tickets] [Remove]                                         │   │
│  │                                                                     │   │
│  │  3. Pokémon Center (your suggestion)                                 │   │
│  │     🤖 Suggested: Day 2 Morning (near Akihabara)                    │   │
│  │     [Add to Day 2] [Choose Different] [Remove]                       │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ─────────────────────────────────────────────────────────────────────────  │
│                                                                             │
│  🔄 AUTO-PLACE ALL                                                          │
│  Let me find the best slot for each wishlist item                          │
│                                                                             │
│  [Auto-Place Wishlist Items]                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### Comparison: Planning vs Execution

| Aspect | Planning Mode | Execution Mode |
|--------|--------------|----------------|
| **Scope** | Entire trip | Current day only |
| **Time pressure** | None | Real-time |
| **Goal** | Optimize variety & efficiency | Adapt to reality |
| **Primary concern** | Don't repeat categories | Don't miss bookings |
| **User action** | Select from options | Confirm adjustments |
| **Rollback** | Easy (just change selection) | Hard (time has passed) |
| **Data sources** | All APIs (AI, Yelp, Viator) | Cached + live availability |
| **Commute priority** | Moderate (efficiency) | High (time-critical) |

---

### API Call Summary

| API | Calls per Day | Total (7 days) | Purpose |
|-----|---------------|----------------|---------|
| **OpenAI** | 1-2 | 10-14 | Generate core activities per city/day |
| **Weather** | 1 | 7 | Daily forecast for activity planning |
| **Yelp** | 2-3 | 15-20 | Breakfast/lunch/dinner options |
| **Viator** | 0-2 | 5-10 | Enhancement options (lazy-loaded) |

**Cost Estimate:**
- OpenAI: ~14 calls × $0.03 = $0.42
- Weather: Free tier usually sufficient
- Yelp: Free tier (500/day)
- Viator: Free (affiliate model)

**Total API cost: < $1 per trip generated**

---

## ADVANCED ENHANCEMENTS (From Feedback Review)

### 1. Entity Resolution & Grounding

**Problem:** Multi-source items (AI, Yelp, Viator, Places) can produce duplicates or hallucinations.

```typescript
interface ActivityExternalRefs {
  // Canonical IDs for deduplication
  googlePlaceId?: string;
  yelpId?: string;
  viatorProductCode?: string;
  osmId?: string;
  foursquareId?: string;
}

interface GroundedActivity extends CoreActivity {
  externalRefs: ActivityExternalRefs;

  // Grounding status
  groundingStatus: "verified" | "unverified" | "ai-generated";
  lastVerified?: string;  // ISO date

  // Conflict resolution
  preferredSource: "google" | "yelp" | "viator" | "ai";
}
```

**Deduplication Flow:**
```
1. AI generates "Senso-ji Temple"
2. Match against Google Places by name + geocode (fuzzy)
3. If match found → attach googlePlaceId, use Google's hours/photos/rating
4. If Yelp/Viator also match → merge into single entity
5. Flag conflicts (e.g., different hours) for manual review or prefer canonical source
```

**Benefit:** Consistent hours/ratings/photos; fewer user-visible conflicts; prevents suggesting closed venues.

---

### 2. Opening Hours, Holidays & Closures

**Extended Schema:**
```typescript
interface OperatingHours {
  dayOfWeek: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
  open: string;   // "09:00"
  close: string;  // "17:00"
  lastEntry?: string;  // "16:30" - important for museums
}

interface ActivityWithHours extends CoreActivity {
  operatingHours: OperatingHours[];
  closedDays?: string[];  // ["monday"] - regular closures
  holidayExceptions?: {
    date: string;      // "2025-01-01"
    isOpen: boolean;
    specialHours?: { open: string; close: string };
    note?: string;     // "Closed for New Year"
  }[];

  // Booking requirements
  requiresTimedEntry: boolean;
  advanceBookingDays?: number;  // "Book 30 days ahead"
  likelyToSellOut: boolean;
}
```

**Scoring Integration:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  HARD CONSTRAINT: Activity must be OPEN during slot time                   │
│                                                                             │
│  Slot: 14:00-17:00                                                          │
│  Activity: Senso-ji Temple (opens 06:00, closes 17:00)                     │
│                                                                             │
│  ✓ Opens before slot start (06:00 < 14:00)                                 │
│  ✓ Closes after slot end (17:00 >= 17:00) ← TIGHT!                         │
│  ⚠️ Warning: "Temple closes at 17:00. Arrive by 16:00 for full visit."     │
│                                                                             │
│  If overlap not feasible with commute → AUTO-REMOVE from options           │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 3. Uncertainty & Duration Buffers

**Store probabilistic durations:**
```typescript
interface DurationEstimate {
  durationP50: number;  // 50th percentile (typical)
  durationP90: number;  // 90th percentile (with buffer)

  // Adjustment factors
  kidsMultiplier: number;      // 1.2-1.3 (kids take 20-30% longer)
  weatherMultiplier: number;   // 1.1-1.15 (cold/rain slows down)
  crowdedMultiplier: number;   // 1.2 (weekends/holidays)
}

function getAdjustedDuration(
  activity: ActivityWithDuration,
  context: TripContext
): number {
  let duration = activity.durationP50;

  // Traveling with kids → use P90 and add 20%
  if (context.hasChildren) {
    duration = activity.durationP90 * 1.2;
  }

  // Bad weather → add 10%
  if (context.weather.isRainy || context.weather.temp < 5) {
    duration *= 1.1;
  }

  // Weekend/holiday → add 15% for crowds
  if (context.isWeekend || context.isHoliday) {
    duration *= 1.15;
  }

  return Math.ceil(duration);
}
```

**Dynamic Day Relaxation:**
```
If running late by lunch (> 30 min behind):
├── Auto-relax afternoon slots
├── Extend buffer times between activities
├── Suggest dropping lowest-priority item
└── Switch to "relaxed pace" mode for rest of day
```

---

### 4. Accessibility & Family Needs

**Extended Schema:**
```typescript
interface AccessibilityInfo {
  indoorOutdoor: "indoor" | "outdoor" | "mixed";
  wheelchairAccessible: boolean;
  strollerFriendly: boolean;
  restroomAvailability: "excellent" | "good" | "limited" | "none";
  elevatorAvailable: boolean;

  // Family-specific
  ageRecommendations?: {
    minAge?: number;
    maxAge?: number;
    idealAges?: string;  // "Best for ages 5-12"
  };

  // Comfort
  seatingAvailable: boolean;
  shadedAreas: boolean;  // Important for hot weather
  indoorBreakAreas: boolean;  // For rest stops
}
```

**Scoring Adjustments for Families:**
```typescript
function scoreFamilyFriendliness(
  activity: ActivityWithAccessibility,
  context: TripContext
): number {
  let score = 0;

  // Stroller users need accessible routes
  if (context.hasStroller) {
    if (activity.strollerFriendly) score += 20;
    else score -= 30;  // Hard penalty
  }

  // Kids need restrooms
  if (context.hasChildren) {
    if (activity.restroomAvailability === "excellent") score += 10;
    if (activity.restroomAvailability === "limited") score -= 10;
  }

  // Age appropriateness
  if (activity.ageRecommendations) {
    const childAges = context.childrenAges || [];
    const ageMatch = childAges.some(age =>
      age >= (activity.ageRecommendations.minAge || 0) &&
      age <= (activity.ageRecommendations.maxAge || 99)
    );
    if (ageMatch) score += 15;
    else score -= 10;
  }

  // Avoid multiple long walks back-to-back
  if (context.previousActivityWasLongWalk && activity.physicalLevel === "challenging") {
    score -= 20;
  }

  return score;
}
```

---

### 5. Popular Times & Crowd Avoidance

**Incorporate crowding heuristics:**
```typescript
interface PopularTimes {
  dayOfWeek: string;
  hourlyBusyness: number[];  // 0-100 for each hour (0-23)
  usuallyBusiestAt: string;  // "14:00"
  bestTimeToVisit: string;   // "09:00-10:00"
}

function getCrowdingScore(
  activity: ActivityWithPopularTimes,
  proposedTime: string
): number {
  const hour = parseInt(proposedTime.split(":")[0]);
  const busyness = activity.popularTimes?.hourlyBusyness[hour] || 50;

  // Penalize peak times
  if (busyness > 80) return -20;
  if (busyness > 60) return -10;
  if (busyness < 30) return +15;  // Bonus for off-peak

  return 0;
}
```

**Rain Plan - A/B Days:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  DAY 3: KYOTO                                                               │
│                                                                             │
│  ☀️ PLAN A (Good Weather)          🌧️ PLAN B (Rainy Day)                    │
│  ─────────────────────────          ────────────────────────                │
│  Morning: Arashiyama Bamboo         Morning: Kyoto Railway Museum          │
│  Lunch: Outdoor market              Lunch: Indoor food hall                │
│  Afternoon: Philosopher's Path      Afternoon: Nishiki Market (covered)    │
│  Evening: Gion walk                 Evening: Gion walk (with umbrellas)    │
│                                                                             │
│  [One-tap swap to Plan B if rain forecast]                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 6. Cost Modeling & Currency

**Detailed pricing:**
```typescript
interface DetailedPricing {
  // Per-person pricing
  adultPrice: number;
  childPrice?: number;
  seniorPrice?: number;

  // Group pricing
  isPerGroup: boolean;
  groupSize?: number;

  // Currency
  currency: string;  // "JPY"

  // Discounts
  freeForAgesUnder?: number;
  discounts?: {
    type: string;  // "student", "JR Pass holder"
    amount: number;
  }[];
}

interface TripBudgetTracker {
  totalBudget: number;
  currency: string;

  // Per-day tracking
  plannedSpendByDay: Record<string, number>;
  actualSpendByDay: Record<string, number>;

  // Real-time
  remainingBudget: number;
  percentUsed: number;

  // Nudges
  shouldSuggestFreeActivities: boolean;  // True if > 80% budget used
}

function formatCostDisplay(
  pricing: DetailedPricing,
  travelers: TravelerProfile,
  userCurrency: string
): string {
  const totalLocal =
    (pricing.adultPrice * travelers.adults) +
    (pricing.childPrice || 0) * travelers.children;

  const totalConverted = convertCurrency(totalLocal, pricing.currency, userCurrency);

  return `¥${totalLocal.toLocaleString()} (~$${totalConverted.toFixed(0)})`;
}
```

**Budget Awareness in Suggestions:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  💰 BUDGET TRACKER                                                          │
│                                                                             │
│  Day 1: ¥12,500 / Day 2: ¥18,200 / Day 3: ¥8,000 (so far)                  │
│  ────────────────────────────────────────────────────────────────────────── │
│  Total spent: ¥38,700 (~$260)                                              │
│  Remaining: ¥61,300 (~$410) for 4 more days                                │
│                                                                             │
│  📊 You're on track! Avg ¥15,300/day vs budget ¥14,300/day                 │
│                                                                             │
│  💡 Tip: Day 4 has ¥22,000 planned (TeamLab + nice dinner).                │
│     Consider free activities on Day 5 to balance.                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 7. Must-Do, Nice-to-Have & No-Go Lists

**User-defined constraints:**
```typescript
interface UserActivityLists {
  // Hard requirements - MUST be scheduled
  mustDo: {
    activityId: string;
    preferredDay?: number;
    preferredTimeOfDay?: string;
    isBooked: boolean;
    bookingDetails?: string;
  }[];

  // Would like but flexible
  niceToHave: {
    activityId: string;
    priority: "high" | "medium" | "low";
  }[];

  // Never suggest these
  noGo: {
    activityId?: string;
    category?: string;  // "nightclub", "bar"
    reason?: string;
  }[];

  // Locked items - don't reshuffle
  lockedSlots: {
    slotId: string;
    activityId: string;
    cannotMove: true;
  }[];
}
```

**Scheduling Priority:**
```
1. Schedule BOOKED items first (TeamLab 15:00 = anchor)
2. Schedule remaining MUST-DO items around anchors
3. Fill gaps with NICE-TO-HAVE by priority
4. Fill remaining with algorithm suggestions
5. NEVER suggest items in NO-GO list
6. NEVER move LOCKED items during reshuffles
```

---

### 8. Hard Constraints vs Soft Preferences

**Scoring Split:**
```typescript
interface ScoringConfig {
  // HARD CONSTRAINTS (must pass or activity is removed)
  hardConstraints: {
    mustBeOpen: true;           // Activity open during slot
    mustFitDuration: true;      // Fits in available time
    mustMatchDietary: true;     // Meets dietary requirements
    mustBeAccessible: boolean;  // If user requires wheelchair access
    mustBeAgeAppropriate: boolean;
  };

  // SOFT PREFERENCES (affect score, don't eliminate)
  softPreferences: {
    interestMatch: { weight: 25, enabled: true };
    budgetMatch: { weight: 15, enabled: true };
    proximityPreference: { weight: 10, enabled: true };
    weatherAppropriate: { weight: 10, enabled: true };
    crowdAvoidance: { weight: 5, enabled: true };
  };

  // USER-ADJUSTABLE WEIGHTS
  userOverrides?: {
    "less-commute": { proximityPreference: { weight: 25 } };
    "more-food": { boostCategories: ["restaurant", "food-market"] };
    "strict-budget": { budgetMatch: { weight: 30 } };
    "avoid-crowds": { crowdAvoidance: { weight: 20 } };
  };
}

function applyConstraintsAndScore(
  activity: Activity,
  slot: Slot,
  config: ScoringConfig
): { eligible: boolean; score: number; reasons: string[] } {

  // 1. CHECK HARD CONSTRAINTS
  if (config.hardConstraints.mustBeOpen) {
    if (!isOpenDuring(activity, slot.timeRange)) {
      return { eligible: false, score: 0, reasons: ["Closed during this time"] };
    }
  }

  if (config.hardConstraints.mustFitDuration) {
    if (activity.duration > slot.availableMinutes + 15) {
      return { eligible: false, score: 0, reasons: ["Too long for this slot"] };
    }
  }

  // ... other hard constraints

  // 2. CALCULATE SOFT PREFERENCE SCORE
  let score = 0;
  const reasons: string[] = [];

  for (const [pref, config] of Object.entries(config.softPreferences)) {
    if (!config.enabled) continue;
    const prefScore = calculatePreferenceScore(pref, activity, slot);
    score += prefScore * (config.weight / 100);
    if (prefScore > 0) reasons.push(`+${pref}`);
  }

  return { eligible: true, score, reasons };
}
```

---

### 9. Day Templates

**Pre-built itinerary templates:**
```typescript
interface DayTemplate {
  id: string;
  name: string;
  description: string;
  city: string;

  // Target audience
  suitableFor: ("families" | "couples" | "solo" | "groups")[];
  pace: "relaxed" | "moderate" | "packed";
  budget: "budget" | "moderate" | "luxury";

  // Template slots
  slots: {
    timeOfDay: "morning" | "lunch" | "afternoon" | "dinner" | "evening";
    activityType: string;  // "temple", "market", "museum"
    suggestedActivities: string[];  // Specific activity IDs
    isRequired: boolean;
  }[];

  // Metadata
  estimatedCost: number;
  totalWalkingKm: number;
  highlights: string[];
}

const KYOTO_TEMPLATES: DayTemplate[] = [
  {
    id: "classic-kyoto-temples",
    name: "Classic Kyoto Temples",
    description: "Hit the iconic temples in one efficient day",
    city: "Kyoto",
    suitableFor: ["families", "couples", "solo"],
    pace: "moderate",
    budget: "budget",
    slots: [
      { timeOfDay: "morning", activityType: "temple", suggestedActivities: ["kinkakuji", "ryoanji"], isRequired: true },
      { timeOfDay: "lunch", activityType: "restaurant", suggestedActivities: [], isRequired: true },
      { timeOfDay: "afternoon", activityType: "temple", suggestedActivities: ["kiyomizudera"], isRequired: true },
      { timeOfDay: "evening", activityType: "neighborhood", suggestedActivities: ["gion"], isRequired: false }
    ],
    estimatedCost: 2500,
    totalWalkingKm: 8,
    highlights: ["Golden Pavilion", "Zen Rock Garden", "Kiyomizu Stage", "Geisha District"]
  },
  {
    id: "anime-arcades-tokyo",
    name: "Anime & Arcades",
    description: "Perfect for gaming and anime fans",
    city: "Tokyo",
    suitableFor: ["families", "solo", "groups"],
    pace: "moderate",
    budget: "moderate",
    slots: [
      { timeOfDay: "morning", activityType: "shopping", suggestedActivities: ["akihabara"], isRequired: true },
      { timeOfDay: "afternoon", activityType: "entertainment", suggestedActivities: ["pokemon-center", "gundam-base"], isRequired: true },
      { timeOfDay: "evening", activityType: "arcade", suggestedActivities: ["sega-arcade"], isRequired: false }
    ],
    estimatedCost: 5000,
    totalWalkingKm: 5,
    highlights: ["Akihabara Electric Town", "Pokémon Center", "Retro Arcades"]
  }
];
```

**Template Selection UI:**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  📋 DAY TEMPLATES FOR KYOTO                                                 │
│  Skip the planning - use a curated itinerary                               │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  🏛️ Classic Kyoto Temples                          Budget: ¥2,500   │   │
│  │  Kinkaku-ji → Ryoan-ji → Kiyomizu-dera → Gion                       │   │
│  │  ★★★★★ Best for: First-time visitors                               │   │
│  │  [Use This Template]  [Customize First]                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  🍃 Arashiyama & Nature Day                        Budget: ¥3,000   │   │
│  │  Bamboo Grove → Monkey Park → Boat Ride → Togetsu Bridge            │   │
│  │  ★★★★☆ Best for: Nature lovers, photographers                      │   │
│  │  [Use This Template]  [Customize First]                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  🍜 Foodie Kyoto                                   Budget: ¥8,000   │   │
│  │  Nishiki Market → Cooking Class → Sake Tasting → Kaiseki Dinner     │   │
│  │  ★★★★★ Best for: Food enthusiasts                                  │   │
│  │  [Use This Template]  [Customize First]                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  [Build My Own Day Instead]                                                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 10. Enhanced Explainability

**Per-option explanations (first-class UI):**
```
┌─────────────────────────────────────────────────────────────────────────────┐
│  TeamLab Planets                                         SCORE: 92/100     │
│  ──────────────────────────────────────────────────────────────────────────│
│                                                                             │
│  ✅ WHY THIS IS RECOMMENDED:                                                │
│  • Matches your interests: art, unique experiences                         │
│  • Indoor activity - perfect for cold January weather                      │
│  • Highly rated for families with kids ages 8-12                          │
│  • 30 min from your lunch spot (efficient routing)                        │
│                                                                             │
│  ⚠️ TRADEOFFS TO CONSIDER:                                                  │
│  • Must book in advance (often sells out)                                  │
│  • ¥3,200/person - higher cost than alternatives                          │
│  • 2.5 hours - leaves less time for evening activities                    │
│                                                                             │
│  💡 TIP: Book the 14:30 slot - less crowded than 15:00                     │
│                                                                             │
│  [Book Now - $38] [Choose Different] [See Why Others Were Ranked Lower]   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 11. Venue Status Validation

**Prevent stale recommendations:**
```typescript
interface VenueStatus {
  isOperational: boolean;
  lastVerified: string;  // ISO date
  verificationSource: "google" | "manual" | "user-report";

  // Status changes
  permanentlyClosed?: boolean;
  temporarilyClosed?: {
    until?: string;
    reason?: string;
  };

  // Warnings
  statusWarnings?: string[];
  // e.g., ["Undergoing renovation", "Limited access until March"]
}

async function validateVenueBeforeSuggesting(activity: Activity): Promise<ValidationResult> {
  // 1. Check if we have recent data (< 30 days)
  if (activity.lastVerified && daysSince(activity.lastVerified) < 30) {
    return { valid: true };
  }

  // 2. Quick check against Google Places
  const placeStatus = await checkGooglePlaceStatus(activity.externalRefs.googlePlaceId);

  if (placeStatus.permanently_closed) {
    return {
      valid: false,
      reason: "This venue appears to be permanently closed",
      action: "remove-from-suggestions"
    };
  }

  if (placeStatus.temporarily_closed) {
    return {
      valid: false,
      reason: `Temporarily closed: ${placeStatus.reason}`,
      action: "warn-user"
    };
  }

  return { valid: true };
}
```

---

### 12. Commute Fidelity for Families

**Adjusted walking speeds:**
```typescript
interface CommutePaceSettings {
  // Base walking speeds (km/h)
  defaultWalkingSpeed: 4.5;
  withKidsSpeed: 3.0;        // Kids ages 5-10
  withToddlerSpeed: 2.5;     // Kids under 5
  withStrollerSpeed: 3.5;
  elderlySpeed: 3.0;

  // Mode preferences by context
  preferTrainWhen: ["distance > 2km", "time-critical"];
  preferTaxiWhen: ["running-late", "late-night", "heavy-rain", "with-stroller"];
  avoidWalking: ["extreme-weather", "accessibility-needs"];
}

function getAdjustedCommuteTime(
  baseMinutes: number,
  method: "walk" | "train" | "taxi",
  context: TripContext
): number {
  if (method !== "walk") return baseMinutes;

  let adjustedMinutes = baseMinutes;

  // Kids slow down walking
  if (context.hasChildren) {
    const youngestAge = Math.min(...(context.childrenAges || [10]));
    if (youngestAge < 5) adjustedMinutes *= 1.8;  // Toddler pace
    else if (youngestAge < 10) adjustedMinutes *= 1.5;  // Kid pace
    else adjustedMinutes *= 1.2;  // Older kid pace
  }

  // Stroller adds time (finding elevators, etc.)
  if (context.hasStroller) {
    adjustedMinutes *= 1.3;
  }

  return Math.ceil(adjustedMinutes);
}
```

---

### 13. Night Activities & Evening Slot Planning

Night slots require special handling due to venue closing times, transport constraints, family considerations, and safety factors.

#### Night Activity Data Model

```typescript
interface NightOperations {
  // Venue timing
  lastEntryTime?: string;           // "21:00" - must arrive before this
  closingTime?: string;             // "22:00" - venue closes
  openLateUntil?: string;           // Computed: venues open past 21:00
  seasonalNightOpen?: {             // Special extended hours
    start: string;                  // "2025-01-15"
    end: string;                    // "2025-02-28"
    hours: string;                  // "until 22:00"
  }[];

  // Family & safety
  ageRestricted?: boolean;          // Bars, adult venues
  noiseLevel?: "quiet" | "normal" | "loud";
  lightingQuality?: "well-lit" | "dim" | "dark";
  nightSafetyScore?: number;        // 0-1 based on neighborhood
  strollerFriendlyAtNight?: boolean;

  // Categories
  nightCategory?:
    | "observatory"      // Shibuya Sky, Tokyo Tower
    | "illumination"     // Seasonal light displays
    | "night-shrine"     // Lit temples/shrines
    | "entertainment"    // Arcades, shows
    | "dining"           // Restaurants, izakaya
    | "stroll"           // Evening walks
    | "late-museum"      // Museums with late hours
    | "soft-night";      // Hotel, onsen, low-key
}
```

#### Night Slot Timing Logic

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  NIGHT SLOT CONSTRAINTS                                                     │
│  ──────────────────────                                                     │
│                                                                             │
│  For each evening activity, validate:                                       │
│                                                                             │
│  1. LAST ENTRY CHECK                                                        │
│     ─────────────────                                                       │
│     arrivalTime + commuteBuffer ≤ lastEntryTime                            │
│                                                                             │
│     Example:                                                                │
│     • Shibuya Sky lastEntryTime: 22:00                                     │
│     • Dinner ends: 20:30                                                   │
│     • Commute: 15 min                                                      │
│     • Buffer: 10 min                                                       │
│     • Arrival: 20:55 ✓ (within 22:00)                                      │
│                                                                             │
│  2. LAST TRAIN CHECK                                                        │
│     ────────────────                                                        │
│     activityEnd + commuteToHotel + 15min buffer ≤ lastTrainTime            │
│                                                                             │
│     Example:                                                                │
│     • Activity ends: 22:30                                                 │
│     • Commute to hotel: 25 min                                             │
│     • Buffer: 15 min                                                       │
│     • Need train by: 23:10                                                 │
│     • Last train: 23:18 ✓                                                  │
│                                                                             │
│  3. FAMILY BEDTIME CHECK                                                    │
│     ─────────────────────                                                   │
│     activityEnd + commuteToHotel ≤ kidsBedtime - 30min                     │
│                                                                             │
│     Example:                                                                │
│     • Kids bedtime: 21:30                                                  │
│     • Wind-down buffer: 30 min                                             │
│     • Must be at hotel by: 21:00                                           │
│     • If commute is 20 min → activity must end by 20:40                    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Night-Specific Scoring Adjustments

Add these factors to the base 100-point scoring for evening slots:

```typescript
interface NightScoringAdjustments {
  // Additional scoring for night slots (modify base scores)
  lateHoursFit: {
    weight: 20,
    rule: "lastEntryTime - arrivalTime >= 30min → full points"
  };

  transportFeasibility: {
    weight: 15,
    rule: "lastTrain buffer >= 30-45min → full points"
  };

  familySuitability: {
    weight: 15,
    rules: [
      "No bars/adult venues if kids present",
      "Well-lit venues preferred",
      "Low noise for young kids",
      "Stroller accessible paths"
    ]
  };

  indoorComfort: {
    weight: 10,
    rule: "Cold/rain → boost indoor options"
  };

  vibeContinuity: {
    weight: 10,
    rule: "End day near hotel or dinner area (minimize backtracking)"
  };

  photoValue: {
    weight: 5,
    rule: "Night views, illuminations, lit landmarks"
  };
}
```

#### Prebuilt Night Bundles

One-tap curated evening experiences:

```typescript
const NIGHT_BUNDLES = {
  "view-stroll-dessert": {
    name: "View + Stroll + Dessert",
    description: "Family-friendly default evening",
    familyFriendly: true,
    typicalDuration: 120, // 2 hours
    pattern: ["observatory OR viewpoint", "short-stroll", "dessert-cafe"],
    example: "Shibuya Sky → Shibuya Crossing photos → Taiyaki stand"
  },

  "late-museum": {
    name: "Late Museum Night",
    description: "Museums with extended evening hours",
    familyFriendly: true,
    typicalDuration: 150,
    pattern: ["late-hours-museum"],
    example: "TeamLab Planets late slot (booked entry)"
  },

  "illumination-night": {
    name: "Illumination Walk",
    description: "Seasonal light displays",
    familyFriendly: true,
    typicalDuration: 90,
    seasonal: { start: "11-15", end: "02-15" },
    pattern: ["illumination-display", "hot-drink"],
    example: "Roppongi Midtown lights → hot chocolate"
  },

  "neighborhood-ambience": {
    name: "Evening Neighborhood",
    description: "Atmospheric district walk",
    familyFriendly: "with-guidance", // stay on main streets
    typicalDuration: 90,
    pattern: ["atmospheric-district-walk", "street-food OR cafe"],
    example: "Gion main street → Yasaka Shrine lit up",
    tips: ["Stay on main, well-lit streets with kids"]
  },

  "observatory-combo": {
    name: "Double Viewpoint",
    description: "Bookable + free viewpoints",
    familyFriendly: true,
    typicalDuration: 120,
    pattern: ["paid-observatory", "free-viewpoint"],
    example: "Shibuya Sky (booked) → Tokyo Metro Gov Building (free)"
  },

  "soft-night": {
    name: "Recovery Evening",
    description: "Low-key wind-down",
    familyFriendly: true,
    typicalDuration: 60,
    pattern: ["hotel-amenity OR quiet-activity"],
    examples: [
      "Hotel pool/onsen",
      "Convenience store snack hunt",
      "Quiet park loop near hotel"
    ],
    useWhen: ["day-ran-long", "kid-energy-low", "jet-lag"]
  }
};
```

#### Japan Night Activity Examples (January)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  TOKYO - FAMILY-FRIENDLY NIGHT OPTIONS                                     │
│  ─────────────────────────────────────                                      │
│                                                                             │
│  OBSERVATORIES & VIEWS                                                      │
│  • Shibuya Sky (timed entry, book ahead) - 21:00 last entry               │
│  • Tokyo City View (Roppongi Hills) - 22:00 last entry                    │
│  • Tokyo Skytree - 21:00 last entry                                        │
│  • Tokyo Metropolitan Gov Building (FREE) - 22:30 close                   │
│                                                                             │
│  EXPERIENCES                                                                │
│  • TeamLab Planets - late slots available, BOOK REQUIRED                  │
│  • Odaiba waterfront - Rainbow Bridge views, mall arcades                 │
│  • LEGO Discovery Center - check winter hours                              │
│                                                                             │
│  ILLUMINATIONS (Seasonal - verify dates)                                   │
│  • Roppongi Midtown Winter Lights                                         │
│  • Shinjuku Southern Terrace                                              │
│  • Tokyo Dome City                                                         │
│                                                                             │
│  ARCADES (Early evening with kids)                                         │
│  • Akihabara arcades - age rules vary                                      │
│  • Shinjuku arcades - keep to early evening                               │
│                                                                             │
│  ⚠️ CAUTION WITH KIDS                                                       │
│  • Golden Gai - adult-leaning late night                                  │
│  • Kabukicho - fine for early evening walk, leave before 20:00           │
│  • Omoide Yokocho - atmospheric but smoky, brief walk only               │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  KYOTO - FAMILY-FRIENDLY NIGHT OPTIONS                                     │
│  ─────────────────────────────────────                                      │
│                                                                             │
│  SHRINES & TEMPLES                                                          │
│  • Yasaka Shrine - lit at night, open 24h, beautiful                      │
│  • Fushimi Inari - magical at dusk, lower loops only with kids           │
│    └─ Bring flashlight, watch steps, 45-60 min max                        │
│                                                                             │
│  DISTRICTS                                                                  │
│  • Gion main street (Hanamikoji) - quiet, respectful                      │
│  • Pontocho alley - choose kid-friendly restaurants                       │
│  • Kamo River walk - near Shijo bridges, well-lit                         │
│                                                                             │
│  SEASONAL (Verify for January)                                             │
│  • Temple night illuminations - most are autumn/spring                    │
│  • Check Kyoto City Tourism for winter specials                           │
│                                                                             │
│  SOFT NIGHT OPTIONS                                                         │
│  • Depa-chika (department store basement) snacks                          │
│  • Short river walk → early turn-in                                       │
│  • Hotel onsen (verify kid policies)                                       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Transport Guardrails

```typescript
interface NightTransportGuardrails {
  lastTrainTracking: {
    // Query transit APIs for last trains
    apis: ["Google Directions Transit", "Jorudan", "Ekispert"];

    // Store per hotel
    lastTrainsToHotel: {
      fromShinjuku: "23:45";
      fromShibuya: "23:38";
      fromGinza: "23:22";
    };
  };

  taxiFallback: {
    // Show when last train is missed or tight
    showWhen: "lastTrainBuffer < 20min OR userRunningLate";

    display: {
      cost: "¥3,000-4,500";
      time: "25 min";
      benefit: "Saves the booking / no rush";
    };
  };

  // Alert thresholds
  alerts: {
    comfortable: "buffer >= 45min";    // Green - no alert
    advisory: "buffer 20-45min";       // Yellow - "Last train in 40 min"
    urgent: "buffer < 20min";          // Red - "Leave now or taxi"
  };
}
```

#### UX: Night Slot Banners & Nudges

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  BANNER: LAST ENTRY WARNING                                                 │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ⏰ Last entry to Shibuya Sky in 35 min                              │   │
│  │                                                                     │   │
│  │  [Leave Now]  [Switch to Nearby Option]  [Skip Tonight]            │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  BANNER: LAST TRAIN ALERT                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 🚃 Last train to Shinjuku at 23:18 (45 min from now)               │   │
│  │    Taxi alternative: ¥3,000, 20 min                                 │   │
│  │                                                                     │   │
│  │  [Navigate to Station]  [Book Taxi]  [Extend & Taxi Later]         │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  BANNER: BEDTIME APPROACH                                                   │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 🌙 Wind-down time in 40 min (kids bedtime: 21:30)                  │   │
│  │    Suggested: Head back after dessert                               │   │
│  │                                                                     │   │
│  │  [Start Walking Back]  [Extend 30 min]                             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ACTIVITY CARD BADGES                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │  [Indoor]  [Age-OK]  [Quiet]  [Viewpoint]  [Last-Train Safe]       │   │
│  │                                                                     │   │
│  │  [Illumination]  [Booked Entry]  [Well-Lit]  [Stroller OK]        │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Energy-Aware Night Suggestions

```typescript
function suggestNightActivity(
  context: DayContext,
  energyLevel: "high" | "okay" | "low"
): NightSuggestion {

  // If low energy or long day, suggest soft night
  if (energyLevel === "low" || context.dayRanLong) {
    return {
      bundle: "soft-night",
      message: "Long day! How about a relaxed evening?",
      options: [
        "Hotel pool/onsen wind-down",
        "Quick convenience store snack hunt",
        "30-min stroll near hotel"
      ]
    };
  }

  // If jet-lag day (days 1-2), shorter evening
  if (context.dayNumber <= 2 && context.isLongHaulFlight) {
    return {
      bundle: "soft-night",
      message: "First night - taking it easy helps with jet lag",
      options: [
        "Short neighborhood walk",
        "Early dinner, early bed"
      ],
      maxDuration: 60
    };
  }

  // Normal energy - full options
  if (energyLevel === "high" || energyLevel === "okay") {
    return {
      bundles: ["view-stroll-dessert", "illumination-night", "late-museum"],
      message: "Ready for evening adventures!",
      respectBedtime: context.hasKids
    };
  }
}
```

#### Night Data Sources

| Data Need | Source | Notes |
|-----------|--------|-------|
| Last entry times | Google Places + Official sites | Scrape if not in API |
| Closing times | Google Places / Foursquare | Verify seasonally |
| Last trains | Jorudan / Ekispert / Google Transit | Query per hotel |
| Illumination dates | City tourism boards | Visit Tokyo, Kyoto City Tourism |
| Events/shows | PredictHQ, Eventbrite | Filter family-friendly |
| Night safety | Curated heuristics | Neighborhood scores in knowledge base |
| Lighting quality | OSM tags where available | Supplement with curation |

---

### 14. Trip Mode & Traveler Composition

The algorithm adapts suggestions based on WHO is traveling. A couples getaway needs romantic options; a family trip needs kid-friendly venues; a solo traveler wants different experiences than a friends group.

#### Trip Modes

```typescript
type TripMode =
  | "family"              // Adults + children
  | "couples"             // Romantic getaway (2 adults, no kids)
  | "solo"                // Single traveler
  | "friends"             // Group of adults
  | "multi-generational"  // Kids + parents + grandparents
  | "girls-trip"          // Women's group trip
  | "guys-trip"           // Men's group trip
  | "honeymoon"           // Special couples mode
  | "babymoon";           // Expecting parents

interface TravelerComposition {
  mode: TripMode;
  adults: number;
  children?: number;
  childrenAges?: number[];
  seniors?: number;        // 65+

  // Inferred from mode
  needsKidFriendly: boolean;
  needsRomantic: boolean;
  needsAccessible: boolean;
  allowsAdultVenues: boolean;
  prefersSocialSpots: boolean;
}
```

#### Mode Detection

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  AUTO-DETECT TRIP MODE FROM INPUT                                           │
│  ───────────────────────────────                                            │
│                                                                             │
│  User Input                         →  Detected Mode                        │
│  ──────────────────────────────────────────────────────                     │
│  "2 adults, 2 kids"                 →  family                               │
│  "just the two of us"               →  couples                              │
│  "solo trip"                        →  solo                                 │
│  "me and my girlfriends"            →  girls-trip                           │
│  "bachelor party"                   →  guys-trip                            │
│  "honeymoon"                        →  honeymoon                            │
│  "with my parents and kids"         →  multi-generational                   │
│  "4 friends"                        →  friends                              │
│  "2 adults" (no kids, anniversary)  →  couples                              │
│                                                                             │
│  Also allow EXPLICIT selection in preferences:                              │
│  "This is a [family trip / romantic getaway / girls trip / ...]"           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Activity Filtering by Mode

```typescript
interface ActivityModeFilters {
  // Hard filters - exclude these activities entirely
  exclude: {
    family: [
      "bars", "nightclubs", "adult-entertainment",
      "wine-tastings-only", "romantic-dinners"
    ],
    couples: [
      "playgrounds", "kids-museums", "theme-parks-kids"
    ],
    honeymoon: [
      "family-activities", "group-tours", "crowded-spots"
    ],
    solo: [
      "couples-experiences", "romantic-dinners"
    ]
  };

  // Boost filters - prioritize these activities
  boost: {
    family: [
      "kid-friendly", "interactive", "outdoor-parks",
      "aquariums", "zoos", "hands-on-museums"
    ],
    couples: [
      "romantic", "scenic", "fine-dining",
      "sunset-views", "spa", "private-experiences"
    ],
    honeymoon: [
      "romantic", "luxury", "private", "intimate",
      "special-occasion", "sunset", "champagne"
    ],
    solo: [
      "social-hostels", "walking-tours", "cafes",
      "local-experiences", "cooking-classes"
    ],
    friends: [
      "group-activities", "nightlife", "adventure",
      "food-tours", "bar-hopping", "karaoke"
    ],
    "girls-trip": [
      "spa", "shopping", "brunch", "photo-spots",
      "wine-tasting", "rooftop-bars"
    ],
    "guys-trip": [
      "sports", "adventure", "craft-beer",
      "go-karts", "arcades", "izakaya"
    ]
  };
}
```

#### Scoring Adjustments by Mode

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  SCORING MODIFIERS BY TRIP MODE                                             │
│  ──────────────────────────────                                             │
│                                                                             │
│  MODE: FAMILY                                                               │
│  ├─ Kid-friendly venues:        +25 points                                 │
│  ├─ Has changing facilities:    +10 points                                 │
│  ├─ Short walking distances:    +15 points                                 │
│  ├─ Playground nearby:          +10 points                                 │
│  ├─ Stroller accessible:        +15 points                                 │
│  └─ Not kid-friendly:           EXCLUDE                                    │
│                                                                             │
│  MODE: COUPLES                                                              │
│  ├─ Romantic atmosphere:        +25 points                                 │
│  ├─ Sunset/view timing:         +20 points                                 │
│  ├─ Intimate setting:           +15 points                                 │
│  ├─ Fine dining available:      +10 points                                 │
│  ├─ Private experience option:  +15 points                                 │
│  └─ Very crowded/noisy:         -20 points                                 │
│                                                                             │
│  MODE: HONEYMOON                                                            │
│  ├─ All couples bonuses PLUS:                                              │
│  ├─ Luxury tier:                +20 points                                 │
│  ├─ "Special occasion" tag:     +25 points                                 │
│  ├─ Champagne/celebration:      +15 points                                 │
│  ├─ Photo-worthy:               +10 points                                 │
│  └─ Budget venues:              -15 points                                 │
│                                                                             │
│  MODE: SOLO                                                                 │
│  ├─ Solo-friendly:              +20 points                                 │
│  ├─ Social opportunities:       +15 points                                 │
│  ├─ Safe neighborhood:          +20 points                                 │
│  ├─ Cafe/work-friendly:         +10 points                                 │
│  └─ Requires partner:           EXCLUDE                                    │
│                                                                             │
│  MODE: FRIENDS                                                              │
│  ├─ Group-friendly:             +20 points                                 │
│  ├─ Shareable food:             +10 points                                 │
│  ├─ Lively atmosphere:          +15 points                                 │
│  ├─ Photo opportunities:        +10 points                                 │
│  └─ Intimate/quiet:             -10 points                                 │
│                                                                             │
│  MODE: MULTI-GENERATIONAL                                                   │
│  ├─ All ages welcome:           +25 points                                 │
│  ├─ Accessible (seniors):       +20 points                                 │
│  ├─ Seating available:          +15 points                                 │
│  ├─ Not too loud:               +10 points                                 │
│  ├─ Rest spots nearby:          +10 points                                 │
│  └─ Strenuous activity:         EXCLUDE or warn                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Mode-Specific Day Templates

```typescript
const MODE_DAY_TEMPLATES = {
  family: {
    "tokyo-kids-day": {
      name: "Tokyo with Kids",
      slots: [
        { time: "09:30", activity: "Ueno Zoo", duration: 150 },
        { time: "12:30", activity: "Kid-friendly ramen", duration: 60 },
        { time: "14:00", activity: "Ueno Park playground", duration: 60 },
        { time: "15:30", activity: "National Science Museum", duration: 120 },
        { time: "18:00", activity: "Early dinner", duration: 75 }
      ],
      features: ["playground-break", "early-dinner", "nap-buffer"]
    },
    "kyoto-family-temples": {
      name: "Kyoto Temples for All Ages",
      slots: [
        { time: "09:00", activity: "Fushimi Inari (lower gates)", duration: 90 },
        { time: "11:00", activity: "Snack break", duration: 30 },
        { time: "12:00", activity: "Lunch near Kyoto Station", duration: 75 },
        { time: "13:30", activity: "Nijo Castle", duration: 90 },
        { time: "15:30", activity: "Ice cream + rest", duration: 45 },
        { time: "17:00", activity: "Gion short walk", duration: 60 }
      ]
    }
  },

  couples: {
    "tokyo-romantic": {
      name: "Romantic Tokyo",
      slots: [
        { time: "10:00", activity: "Meiji Shrine peaceful walk", duration: 90 },
        { time: "12:00", activity: "Omotesando brunch", duration: 90 },
        { time: "14:00", activity: "TeamLab Planets", duration: 120 },
        { time: "17:00", activity: "Sunset at Shibuya Sky", duration: 75 },
        { time: "19:00", activity: "Romantic dinner Shibuya", duration: 120 }
      ],
      features: ["sunset-timed", "intimate-dining", "photo-spots"]
    },
    "kyoto-romantic": {
      name: "Romantic Kyoto",
      slots: [
        { time: "09:00", activity: "Arashiyama Bamboo Grove (early)", duration: 90 },
        { time: "11:00", activity: "Tenryu-ji Temple", duration: 60 },
        { time: "12:30", activity: "Riverside lunch", duration: 90 },
        { time: "14:30", activity: "Philosopher's Path stroll", duration: 90 },
        { time: "16:30", activity: "Tea ceremony (private)", duration: 75 },
        { time: "18:30", activity: "Gion dinner + evening walk", duration: 150 }
      ],
      features: ["private-experiences", "scenic-walks", "evening-stroll"]
    }
  },

  honeymoon: {
    "tokyo-honeymoon": {
      name: "Tokyo Honeymoon",
      slots: [
        { time: "10:30", activity: "Late breakfast at hotel", duration: 90 },
        { time: "12:30", activity: "Private sushi class", duration: 150 },
        { time: "15:30", activity: "Spa treatment", duration: 120 },
        { time: "18:00", activity: "Champagne at Park Hyatt bar", duration: 90 },
        { time: "20:00", activity: "Omakase dinner", duration: 150 }
      ],
      features: ["late-start", "luxury", "private", "special-occasion"]
    }
  },

  solo: {
    "tokyo-solo-explorer": {
      name: "Solo Tokyo Discovery",
      slots: [
        { time: "08:00", activity: "Tsukiji Outer Market breakfast", duration: 90 },
        { time: "10:00", activity: "Hamarikyu Gardens", duration: 75 },
        { time: "12:00", activity: "Ramen counter lunch", duration: 45 },
        { time: "13:00", activity: "Akihabara exploration", duration: 180 },
        { time: "16:30", activity: "Coffee + people watching", duration: 60 },
        { time: "18:00", activity: "Izakaya dinner (counter)", duration: 90 }
      ],
      features: ["solo-friendly-dining", "self-paced", "local-spots"]
    }
  },

  friends: {
    "tokyo-friends": {
      name: "Tokyo with the Squad",
      slots: [
        { time: "11:00", activity: "Brunch + coffee", duration: 90 },
        { time: "13:00", activity: "Harajuku Takeshita Street", duration: 120 },
        { time: "15:30", activity: "Purikura + arcade", duration: 90 },
        { time: "17:30", activity: "Shibuya Crossing photos", duration: 45 },
        { time: "18:30", activity: "Izakaya group dinner", duration: 120 },
        { time: "21:00", activity: "Karaoke or bar hopping", duration: 180 }
      ],
      features: ["group-activities", "photo-ops", "nightlife"]
    }
  }
};
```

#### Restaurant Filtering by Mode

```typescript
function getRestaurantFilters(mode: TripMode): YelpSearchParams {
  switch (mode) {
    case "family":
      return {
        attributes: ["kids_friendly", "highchairs"],
        exclude: ["bars", "cocktail-bars", "wine-bars"],
        priceRange: [1, 2, 3],  // Avoid $$$$ with kids
        sortBy: "rating"
      };

    case "couples":
    case "honeymoon":
      return {
        attributes: ["romantic", "intimate", "good_for_dates"],
        exclude: ["fast-food", "family-style"],
        ambience: ["romantic", "upscale", "trendy"],
        sortBy: "rating",
        boostCategories: ["fine-dining", "omakase", "rooftop"]
      };

    case "solo":
      return {
        attributes: ["counter_seating", "solo_friendly"],
        boostCategories: ["ramen", "sushi-counter", "izakaya", "cafes"],
        sortBy: "distance"  // Convenience for solo
      };

    case "friends":
      return {
        attributes: ["groups", "shareable"],
        boostCategories: ["izakaya", "yakiniku", "hot-pot", "tapas"],
        minCapacity: travelers.adults,
        sortBy: "rating"
      };

    case "girls-trip":
      return {
        attributes: ["trendy", "instagrammable"],
        boostCategories: ["brunch", "dessert-cafes", "rooftop", "afternoon-tea"],
        sortBy: "rating"
      };

    case "guys-trip":
      return {
        boostCategories: ["izakaya", "yakitori", "craft-beer", "sports-bar"],
        sortBy: "rating"
      };

    default:
      return { sortBy: "rating" };
  }
}
```

#### AI Prompt Adaptation

```typescript
function buildActivityPromptForMode(
  destination: string,
  mode: TripMode,
  context: TripContext
): string {

  const modeInstructions = {
    family: `
      - Focus on KID-FRIENDLY activities suitable for ages ${context.childrenAges?.join(", ")}
      - Include playgrounds, interactive museums, zoos, aquariums
      - Avoid long walking distances, plan rest breaks
      - Early dinners (before 18:00)
      - Activities with restroom access
      - Stroller-friendly paths where possible
    `,

    couples: `
      - Focus on ROMANTIC experiences for two
      - Include scenic viewpoints, especially at sunset
      - Quiet gardens, intimate restaurants
      - Private or small-group experiences preferred
      - Photo-worthy locations
      - Mix of cultural and relaxing activities
    `,

    honeymoon: `
      - LUXURY and SPECIAL OCCASION focus
      - Private experiences (tea ceremony, cooking class for 2)
      - High-end dining (omakase, kaiseki)
      - Spa and wellness options
      - Champagne/celebration moments
      - No crowded tourist spots
      - Late morning starts (10:00+)
    `,

    solo: `
      - SOLO-TRAVELER friendly activities
      - Counter seating restaurants (ramen, sushi bars)
      - Safe neighborhoods, especially at night
      - Walking tours or experiences where you can meet people
      - Cafes good for spending time alone
      - Self-guided options
    `,

    friends: `
      - GROUP ACTIVITIES for ${context.adults} friends
      - Shareable food experiences
      - Photo opportunities
      - Fun/active options (karaoke, arcades, adventures)
      - Nightlife options
      - Split-able costs
    `,

    "multi-generational": `
      - Activities suitable for ALL AGES (kids ${context.childrenAges?.join(", ")} AND seniors)
      - Accessible venues (elevators, minimal stairs)
      - Rest spots and seating available
      - Not too physically demanding
      - Interesting for both children and adults
      - Pace: relaxed with breaks
    `
  };

  return `
    Generate activities for ${destination}.

    TRIP MODE: ${mode.toUpperCase()}
    ${modeInstructions[mode] || ""}

    ${context.dietary ? `Dietary needs: ${context.dietary.join(", ")}` : ""}
    ${context.budget ? `Budget: ${context.budget}` : ""}
  `;
}
```

#### UI: Mode Selector

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  What kind of trip is this?                                                 │
│  ─────────────────────────                                                  │
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   👨‍👩‍👧‍👦       │  │   💑        │  │   🧳        │  │   👯        │        │
│  │   Family    │  │   Couples   │  │   Solo      │  │   Friends   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐        │
│  │   💍        │  │   👵👴👨‍👩‍👧   │  │   👩‍👩‍👧‍👦      │  │   👨‍👨‍👦‍👦      │        │
│  │  Honeymoon  │  │ Multi-Gen   │  │ Girls Trip  │  │ Guys Trip   │        │
│  └─────────────┘  └─────────────┘  └─────────────┘  └─────────────┘        │
│                                                                             │
│  [ ] Show me options appropriate for my trip type                          │
│  [ ] I want to see ALL options (I'll filter myself)                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Activity Card Mode Badges

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  FAMILY MODE BADGES                                                         │
│  [👶 Kid-Friendly] [🚼 Changing Room] [🛝 Playground] [♿ Stroller OK]      │
│                                                                             │
│  COUPLES MODE BADGES                                                        │
│  [💑 Romantic] [🌅 Sunset Spot] [🥂 Special Occasion] [📸 Photo Worthy]    │
│                                                                             │
│  SOLO MODE BADGES                                                           │
│  [🧳 Solo-Friendly] [🪑 Counter Seating] [🛡️ Safe Area] [☕ Cafe-Friendly] │
│                                                                             │
│  FRIENDS MODE BADGES                                                        │
│  [👯 Group-Friendly] [🍻 Shareable] [🎤 Karaoke] [📸 Insta-Worthy]         │
│                                                                             │
│  UNIVERSAL WARNINGS                                                         │
│  [⚠️ Not Kid-Friendly] [🚫 Couples Only] [👔 Dress Code] [🔞 21+]          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 15. Pace Controls & Day Preferences

Allow users to customize their travel pace and daily rhythm.

#### Pace Mode Selector

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  What's your travel pace?                                                   │
│  ────────────────────────                                                   │
│                                                                             │
│  ┌───────────────────┐  ┌───────────────────┐  ┌───────────────────┐       │
│  │      🐢            │  │       🚶          │  │       🏃          │       │
│  │    RELAXED         │  │     NORMAL        │  │    AMBITIOUS      │       │
│  │                     │  │                   │  │                   │       │
│  │  2-3 activities    │  │  3-4 activities   │  │  5-6 activities   │       │
│  │  Longer breaks     │  │  Balanced         │  │  Packed days      │       │
│  │  Sleep in          │  │  Standard times   │  │  Early starts     │       │
│  └───────────────────┘  └───────────────────┘  └───────────────────┘       │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Pace Settings Interface

```typescript
interface PaceSettings {
  mode: "relaxed" | "normal" | "ambitious";

  // Day timing
  dayStart: string;           // "09:30" relaxed, "08:30" normal, "07:30" ambitious
  dayEnd: string;             // "19:00" relaxed, "21:00" normal, "22:30" ambitious

  // Walking tolerance
  walkingTolerance: "low" | "medium" | "high";
  maxWalkMinutes: number;     // 10, 20, 30 between activities

  // Rest requirements
  napWindows?: {              // For families with young kids
    start: string;            // "13:00"
    end: string;              // "15:00"
  }[];

  // Special day modifiers
  jetLagDay?: boolean;        // First 1-2 days: slower pace
  noEarlyMornings?: boolean;  // Don't start before 10:00
  poolTime?: {                // Hotel pool/rest block
    preferred: boolean;
    duration: number;         // 60-90 min
    timeOfDay: "morning" | "afternoon";
  };

  // Activity density
  activitiesPerDay: {
    relaxed: { min: 2, max: 3 };
    normal: { min: 3, max: 4 };
    ambitious: { min: 5, max: 6 };
  };

  // Break frequency
  breakFrequency: {
    relaxed: "every-90-min";
    normal: "every-2-hours";
    ambitious: "every-3-hours";
  };
}
```

#### Pace Impact on Scheduling

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  RELAXED PACE                        AMBITIOUS PACE                         │
│  ────────────                        ──────────────                         │
│                                                                             │
│  09:30 - Wake up, hotel breakfast    07:30 - Tsukiji breakfast             │
│  11:00 - Senso-ji Temple             09:00 - Senso-ji Temple               │
│  13:00 - Lunch (90 min)              10:30 - Ueno Park                     │
│  14:30 - Rest/nap time               12:00 - Quick lunch (45 min)          │
│  16:00 - Ueno Park stroll            13:00 - National Museum               │
│  18:00 - Early dinner                15:30 - Akihabara                     │
│  19:30 - Return to hotel             17:30 - Dinner                        │
│                                      19:00 - TeamLab Planets               │
│  Activities: 3                       21:30 - Night view                    │
│  Walking: Low                                                              │
│  Breaks: Frequent                    Activities: 6                         │
│                                      Walking: High                          │
│                                      Breaks: Minimal                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### UI: Pace Sliders

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  Fine-tune your pace                                                        │
│  ───────────────────                                                        │
│                                                                             │
│  Day starts at:                                                             │
│  ◀──────────●──────────▶                                                   │
│  7:00      9:00      11:00                                                  │
│                                                                             │
│  Day ends at:                                                               │
│  ◀────────────●────────▶                                                   │
│  18:00      21:00    23:00                                                  │
│                                                                             │
│  Walking tolerance:                                                         │
│  [Low 🐢]  [Medium 🚶]  [●High 🏃]                                         │
│                                                                             │
│  Break frequency:                                                           │
│  [●Every 90min]  [Every 2hr]  [Every 3hr]                                  │
│                                                                             │
│  Special preferences:                                                       │
│  [✓] No early mornings (before 10:00)                                      │
│  [✓] Jet-lag adjustment (days 1-2)                                         │
│  [ ] Hotel pool time (afternoon)                                           │
│  [✓] Nap window (13:00-15:00)                                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 16. Activity Variants (Short vs Full Version)

Each activity offers flexible duration options that cascade through the day.

#### Variant Data Model

```typescript
interface ActivityVariants {
  activityId: string;

  short: {
    duration: number;         // 45-60 min
    description: string;      // "Quick visit to main hall"
    covers: string[];         // ["main-hall", "photo-spot"]
    misses: string[];         // ["gardens", "museum-wing"]
    bestFor: string[];        // ["tight-schedule", "preview"]
  };

  standard: {
    duration: number;         // 90-120 min
    description: string;      // "Full temple experience"
    covers: string[];         // ["main-hall", "gardens", "photo-spots"]
    misses: string[];         // ["museum-wing"]
    bestFor: string[];        // ["most-visitors"]
  };

  extended: {
    duration: number;         // 150-180 min
    description: string;      // "Deep dive with all areas"
    covers: string[];         // ["everything"]
    includes: string[];       // ["tea-ceremony", "guided-tour"]
    bestFor: string[];        // ["enthusiasts", "relaxed-pace"]
  };
}

// Example
const SENSO_JI_VARIANTS: ActivityVariants = {
  activityId: "sensoji-temple",

  short: {
    duration: 45,
    description: "Walk through Nakamise, see main hall",
    covers: ["nakamise-street", "main-hall", "incense"],
    misses: ["five-story-pagoda", "gardens", "side-temples"],
    bestFor: ["seen-before", "tight-schedule", "photo-stop"]
  },

  standard: {
    duration: 90,
    description: "Full Senso-ji experience",
    covers: ["nakamise-street", "main-hall", "pagoda", "incense", "omikuji"],
    misses: ["detailed-garden-exploration"],
    bestFor: ["first-time-visitors", "most-travelers"]
  },

  extended: {
    duration: 150,
    description: "Complete exploration with gardens",
    covers: ["everything", "gardens", "denboin-garden", "side-streets"],
    includes: ["early-morning-ceremony", "less-crowded-areas"],
    bestFor: ["temple-enthusiasts", "photography", "relaxed-pace"]
  }
};
```

#### UI: Variant Toggle

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ⛩️ Senso-ji Temple                                              11:00 AM  │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  Duration:  [Short 45m]  [●Standard 90m]  [Extended 2.5h]                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Standard (90 min) includes:                                         │   │
│  │ ✓ Nakamise shopping street                                         │   │
│  │ ✓ Main hall & incense ritual                                       │   │
│  │ ✓ Five-story pagoda views                                          │   │
│  │ ✓ Fortune paper (omikuji)                                          │   │
│  │                                                                     │   │
│  │ Extended adds: Denboin Garden, morning ceremony                    │   │
│  │ Short skips: Pagoda area, detailed exploration                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  💡 Switching to Short saves 45 min → Lunch moves to 11:45               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Cascade Preview

When user changes duration, show impact on rest of day:

```typescript
function previewVariantChange(
  currentSlot: TimeSlot,
  newDuration: number,
  remainingSlots: TimeSlot[]
): CascadePreview {
  const timeDelta = newDuration - currentSlot.duration;

  return {
    originalEndTime: currentSlot.endTime,
    newEndTime: addMinutes(currentSlot.endTime, timeDelta),

    affectedSlots: remainingSlots.map(slot => ({
      activity: slot.activity,
      originalTime: slot.startTime,
      newTime: addMinutes(slot.startTime, timeDelta),
      status: checkSlotValidity(slot, timeDelta)  // "ok" | "tight" | "conflict"
    })),

    warnings: [
      timeDelta > 0 && "Dinner reservation may need adjustment",
      timeDelta < -30 && "You'll have 45 min gap before lunch"
    ].filter(Boolean),

    savings: timeDelta < 0 ? `Saves ${Math.abs(timeDelta)} min` : null
  };
}
```

---

### 17. Swap with Similar Nearby

Contextual replacement that preserves timing, budget, and category.

#### Swap Logic

```typescript
interface SwapRequest {
  currentActivity: Activity;
  reason?: "weather" | "closed" | "not-interested" | "too-crowded" | "user-request";
  constraints: {
    maxCommuteFromPrevious: number;  // minutes
    maxCommuteToNext: number;
    preserveCategory: boolean;
    preserveBudget: boolean;
    preserveDuration: boolean;       // within ±15 min
  };
}

async function findSwapOptions(request: SwapRequest): Promise<SwapOption[]> {
  const { currentActivity, constraints } = request;

  // Find activities that match constraints
  const candidates = await searchActivities({
    nearLocation: currentActivity.location,
    maxDistance: "2km",
    category: constraints.preserveCategory ? currentActivity.category : undefined,
    duration: constraints.preserveDuration
      ? { min: currentActivity.duration - 15, max: currentActivity.duration + 15 }
      : undefined,
    priceRange: constraints.preserveBudget ? currentActivity.priceRange : undefined,
    excludeIds: [currentActivity.id, ...alreadyInPlan],
    openAt: currentActivity.scheduledTime
  });

  // Score and rank by fit
  return candidates
    .map(candidate => ({
      activity: candidate,
      commuteFromPrevious: calculateCommute(previousActivity, candidate),
      commuteToNext: calculateCommute(candidate, nextActivity),
      categoryMatch: candidate.category === currentActivity.category,
      timingFit: checkTimingFit(candidate, currentActivity.scheduledTime),
      reason: generateSwapReason(candidate, currentActivity)
    }))
    .filter(opt =>
      opt.commuteFromPrevious <= constraints.maxCommuteFromPrevious &&
      opt.commuteToNext <= constraints.maxCommuteToNext
    )
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}
```

#### UI: Swap Button

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  🏛️ Tokyo National Museum                                        14:00     │
│  ══════════════════════════════════════════════════════════════════════    │
│                                                                             │
│  [🔄 Swap with Similar]                                                    │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │  Similar options nearby (within 10 min):                           │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │ 🎨 Ueno Royal Museum              8 min walk                │   │   │
│  │  │    Art exhibitions • 90 min • ¥1,600                        │   │   │
│  │  │    "Smaller, less crowded alternative"                      │   │   │
│  │  │                                     [Swap] [Details]        │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │ 🐼 Ueno Zoo                        5 min walk                │   │   │
│  │  │    Animals • 120 min • ¥600                                 │   │   │
│  │  │    "Great for kids, different vibe"                         │   │   │
│  │  │                                     [Swap] [Details]        │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  │  ┌─────────────────────────────────────────────────────────────┐   │   │
│  │  │ 🌸 Ueno Park Stroll               2 min walk                 │   │   │
│  │  │    Outdoor • 60 min • Free                                  │   │   │
│  │  │    "Relaxed outdoor option, saves money"                    │   │   │
│  │  │                                     [Swap] [Details]        │   │   │
│  │  └─────────────────────────────────────────────────────────────┘   │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 18. View Preferences (Map vs Timeline)

Users think differently - some prefer maps, others prefer schedules.

#### View Modes

```typescript
type ViewPreference = "map-first" | "timeline-first" | "split";

interface ViewSettings {
  defaultView: ViewPreference;

  mapSettings: {
    showWalkingRoutes: boolean;
    showTransitLines: boolean;
    clusterNearbyPins: boolean;
    showNeighborhoodBoundaries: boolean;
  };

  timelineSettings: {
    showCommuteBlocks: boolean;
    showWeatherIcons: boolean;
    expandedByDefault: boolean;
    colorCodeByCategory: boolean;
  };
}
```

#### Map-First View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  DAY 1 - TOKYO                                            [Map] [Timeline] │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │                    🗺️ INTERACTIVE MAP                              │   │
│  │                                                                     │   │
│  │         ①─────────②                                                │   │
│  │        Senso-ji   │ 15 min                                         │   │
│  │                   ▼                                                │   │
│  │                  ③ Ueno                                            │   │
│  │                   │                                                │   │
│  │                   │ 20 min                                         │   │
│  │                   ▼                                                │   │
│  │                  ④ Akihabara                                       │   │
│  │                                                                     │   │
│  │  [Show walking routes]  [Show transit]  [Neighborhood view]        │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Quick List:                                                               │
│  ① 09:00 Senso-ji → ② 11:00 Lunch → ③ 12:30 Ueno → ④ 15:00 Akihabara    │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Timeline-First View

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  DAY 1 - TOKYO                                            [Map] [Timeline] │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │  09:00 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 10:30               │   │
│  │        ⛩️ Senso-ji Temple                                          │   │
│  │        Asakusa • Temple • 90 min                                   │   │
│  │                                                                     │   │
│  │  10:30 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ 🚶 15 min walk ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ 10:45       │   │
│  │                                                                     │   │
│  │  10:45 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 12:00                     │   │
│  │        🍜 Lunch at Ramen Shop                                      │   │
│  │        Ueno • Restaurant • 75 min                                  │   │
│  │                                                                     │   │
│  │  12:00 ┄┄┄┄┄┄┄┄┄┄┄┄┄┄┄ 🚃 10 min train ┄┄┄┄┄┄┄┄┄┄┄┄┄┄ 12:10       │   │
│  │                                                                     │   │
│  │  12:10 ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━ 14:30               │   │
│  │        🏛️ Tokyo National Museum                                    │   │
│  │        Ueno • Museum • 140 min                                     │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Mini map: [Asakusa] → [Ueno] → [Akihabara]                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 19. Live Energy Check-ins

Real-time adjustments based on how travelers are feeling.

#### Energy Check-in Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  It's 14:30 - How's everyone feeling?                                      │
│  ────────────────────────────────────                                       │
│                                                                             │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                         │
│  │     😊      │  │     😐      │  │     😫      │                         │
│  │    HIGH     │  │    OKAY     │  │     LOW     │                         │
│  │             │  │             │  │             │                         │
│  │ Keep going! │  │  On track   │  │ Need break  │                         │
│  └─────────────┘  └─────────────┘  └─────────────┘                         │
│                                                                             │
│  [ ] Don't ask again today                                                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Energy-Based Adjustments

```typescript
interface EnergyCheckIn {
  timestamp: Date;
  level: "high" | "okay" | "low";
  context: {
    activitiesCompletedToday: number;
    walkingMinutesToday: number;
    lastMealTime: Date;
    weather: WeatherConditions;
  };
}

function adjustPlanForEnergy(
  currentEnergy: EnergyCheckIn,
  remainingSlots: TimeSlot[]
): PlanAdjustment {

  if (currentEnergy.level === "low") {
    return {
      action: "simplify",
      changes: [
        {
          type: "insert-break",
          suggestion: "Add 30 min cafe break now",
          nearbyOptions: findNearbyCafes(currentLocation)
        },
        {
          type: "shorten-next",
          suggestion: "Switch to 'short' version of next activity",
          savings: "45 min"
        },
        {
          type: "skip-optional",
          suggestion: "Skip Akihabara today, do it tomorrow",
          recoverSlot: findAlternativeDay("akihabara")
        },
        {
          type: "reduce-walking",
          suggestion: "Take taxi to next spot (¥1,200, saves 20 min walk)"
        }
      ],
      message: "Let's take it easy this afternoon. Here are some options:"
    };
  }

  if (currentEnergy.level === "high") {
    return {
      action: "enhance",
      changes: [
        {
          type: "extend-current",
          suggestion: "Spend more time here? Switch to 'extended' version"
        },
        {
          type: "add-activity",
          suggestion: "You have energy for one more thing tonight",
          options: findEveningActivities(currentLocation)
        }
      ],
      message: "Great energy! Want to add more to today?"
    };
  }

  return { action: "continue", message: "On track! Next up in 30 min." };
}
```

#### Auto-Suggestions Based on Energy

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  😫 Low energy detected                                                     │
│  ──────────────────────                                                     │
│                                                                             │
│  Here's how we can adjust:                                                 │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ☕ Add a break now                                           [Yes]  │   │
│  │    Starbucks 3 min away • Rest for 30 min                          │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ⏱️ Shorten next activity                                    [Yes]  │   │
│  │    Tokyo National Museum: Full → Short (saves 45 min)              │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ⏭️ Skip Akihabara today                                     [Yes]  │   │
│  │    Move to Day 3 (you have a free afternoon slot)                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 🚕 Taxi instead of walk                                     [Yes]  │   │
│  │    ¥1,200 • Saves 20 min walking                                   │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│                                              [Keep Original Plan]          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 20. Real-time Nudges & Alerts

Proactive notifications during trip execution.

#### Nudge Types

```typescript
type NudgeType =
  | "departure-reminder"     // "Leave in 8 min for timed entry"
  | "booking-critical"       // "Your reservation is in 20 min"
  | "last-entry-warning"     // "Last entry to museum in 35 min"
  | "last-train-alert"       // "Last train at 23:18"
  | "weather-change"         // "Rain starting in 1 hour"
  | "grace-window"           // "You're 10 min late but still OK"
  | "running-late"           // "At risk of missing reservation"
  | "crowd-alert"            // "Currently very crowded"
  | "nearby-opportunity"     // "Cherry blossoms just started here!"
  | "closing-soon";          // "This closes in 30 min"

interface Nudge {
  type: NudgeType;
  priority: "critical" | "important" | "info";
  title: string;
  body: string;
  actions: NudgeAction[];
  expiresAt: Date;
  dismissable: boolean;
}
```

#### Nudge Examples

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  CRITICAL: DEPARTURE REMINDER                                               │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ⏰ Leave in 8 minutes                                               │   │
│  │                                                                     │   │
│  │ TeamLab Planets timed entry at 14:30                               │   │
│  │ Current commute: 22 min by train                                   │   │
│  │                                                                     │   │
│  │ Taxi option: 15 min, ¥2,300 (saves 7 min)                          │   │
│  │                                                                     │   │
│  │ [🚃 Navigate (Train)]  [🚕 Book Taxi]  [⏰ I'm Running Late]       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  IMPORTANT: GRACE WINDOW                                                    │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ✓ You're 12 min behind schedule - but still OK                     │   │
│  │                                                                     │   │
│  │ Restaurant reservation: 12:30                                       │   │
│  │ Grace period: 15 min (until 12:45)                                 │   │
│  │ Your ETA: 12:42 ✓                                                  │   │
│  │                                                                     │   │
│  │ [Got it]  [Call Restaurant]                                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  INFO: WEATHER CHANGE                                                       │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 🌧️ Rain expected at 15:00 (70% chance)                             │   │
│  │                                                                     │   │
│  │ Your 15:30 activity (Ueno Park) is outdoors                        │   │
│  │                                                                     │   │
│  │ [Switch to Indoor Option]  [Keep & Bring Umbrella]  [Dismiss]      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Grace Window Logic

```typescript
interface GraceWindow {
  venueType: string;
  defaultGraceMinutes: number;
  conditions: string;
}

const GRACE_WINDOWS: GraceWindow[] = [
  { venueType: "restaurant", defaultGraceMinutes: 15, conditions: "Most restaurants" },
  { venueType: "timed-entry", defaultGraceMinutes: 0, conditions: "Strict timing" },
  { venueType: "flexible-booking", defaultGraceMinutes: 30, conditions: "Open seating" },
  { venueType: "tour", defaultGraceMinutes: 5, conditions: "Group departure" }
];

function checkGraceWindow(
  booking: Booking,
  currentETA: Date
): GraceStatus {
  const lateBy = differenceInMinutes(currentETA, booking.time);
  const graceMinutes = booking.graceWindow || GRACE_WINDOWS
    .find(g => g.venueType === booking.type)?.defaultGraceMinutes || 10;

  if (lateBy <= 0) return { status: "on-time", message: null };
  if (lateBy <= graceMinutes) return {
    status: "grace",
    message: `${lateBy} min late but within grace period`
  };
  return {
    status: "at-risk",
    message: `May lose reservation - ${lateBy - graceMinutes} min past grace`
  };
}
```

---

### 21. Offline Mode

Essential functionality when connectivity is limited.

#### Offline Data Package

```typescript
interface OfflinePackage {
  tripId: string;
  generatedAt: Date;
  expiresAt: Date;

  // Core itinerary
  days: DayPlan[];
  activities: Activity[];
  restaurants: Restaurant[];

  // Maps & navigation
  offlineMaps: {
    regions: string[];          // ["tokyo-central", "kyoto-central"]
    zoomLevels: number[];       // [12, 14, 16]
    walkingRoutes: Route[];     // Pre-computed for each transition
  };

  // Bookings & tickets
  bookings: {
    confirmationCodes: string[];
    qrCodes: string[];          // Base64 encoded
    venueAddresses: LocalizedAddress[];
  };

  // Local language helpers
  localLanguage: {
    venueNames: { [id: string]: string };      // In local script
    venueAddresses: { [id: string]: string };  // In local script
    phrasebook: Phrase[];
    emergencyPhrases: Phrase[];
  };

  // Export formats
  exports: {
    dayPlanPDF: string;         // Base64 PDF
    calendarICS: string;        // ICS file content
  };

  sizeBytes: number;
}
```

#### What Works Offline

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  OFFLINE MODE - What's Available                                           │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  ✅ WORKS OFFLINE                      ❌ NEEDS CONNECTION                  │
│  ─────────────────                     ─────────────────────                │
│                                                                             │
│  ✓ View full itinerary                 ✗ Real-time re-planning            │
│  ✓ See activity details                ✗ Live crowd updates               │
│  ✓ View booking confirmations          ✗ New restaurant search            │
│  ✓ Show QR codes for tickets           ✗ Weather updates                  │
│  ✓ Navigate saved routes               ✗ Swap activity suggestions        │
│  ✓ View maps (downloaded areas)        ✗ Energy-based adjustments         │
│  ✓ Show venue in Japanese              ✗ Chat with AI                     │
│  ✓ Access phrasebook                   ✗ Book new activities              │
│  ✓ View cached restaurant menus        ✗ Call/reserve restaurants         │
│  ✓ Export day plan as PDF                                                  │
│                                                                             │
│  Storage used: 45 MB                                                       │
│  Last synced: 2 hours ago                                                  │
│                                                                             │
│  [Sync Now]  [Download More Days]  [Clear Offline Data]                   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Offline Activity Card

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  ⛩️ Senso-ji Temple                                              11:00 AM  │
│  ══════════════════════════════════════════════════════════════════════    │
│                                                                             │
│  📍 Show in local script:                                                  │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │                                                                     │   │
│  │  浅草寺 (せんそうじ)                                                │   │
│  │  Senso-ji Temple                                                    │   │
│  │                                                                     │   │
│  │  〒111-0032                                                         │   │
│  │  東京都台東区浅草2丁目3−1                                           │   │
│  │                                                                     │   │
│  │  [📋 Copy Address]  [📱 Show to Taxi Driver]                       │   │
│  │                                                                     │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  Cached info:                                                              │
│  • Hours: 6:00-17:00 (main hall)                                          │
│  • Duration: 90 min                                                        │
│  • Getting there: Asakusa Station, Exit 1                                 │
│                                                                             │
│  [📍 Offline Map]  [🚶 Walking Route from Previous]                       │
│                                                                             │
│  ⚠️ Offline mode - some features unavailable                              │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 22. Location-Aware Re-planning ("I'm at X now")

Rebuild remaining day based on current location.

#### Re-plan Trigger

```typescript
interface ReplanRequest {
  currentLocation: Coordinates;
  currentTime: Date;
  trigger:
    | "user-request"           // Tapped "I'm at X now"
    | "location-detected"      // GPS shows different location
    | "significant-delay"      // 30+ min behind schedule
    | "activity-skipped";      // User marked activity as skipped

  preferences: {
    preserveBookings: boolean;         // Don't move reservations
    preserveMustDos: boolean;          // Keep must-do activities
    maxCommuteToNext: number;          // Prefer nearby options
  };
}

async function replanFromHere(request: ReplanRequest): Promise<ReplanResult> {
  const { currentLocation, currentTime } = request;

  // Find what's nearby and time-appropriate
  const nearbyOptions = await findActivities({
    near: currentLocation,
    maxDistance: "2km",
    availableAt: currentTime,
    duration: { max: getRemainingDayMinutes(currentTime) }
  });

  // Get remaining must-dos and bookings
  const constraints = getRemainingConstraints(currentTime);

  // Build new schedule
  const newPlan = optimizeSchedule({
    startLocation: currentLocation,
    startTime: currentTime,
    activities: nearbyOptions,
    mustInclude: constraints.bookings,
    mustDo: constraints.mustDoActivities,
    endLocation: todaysHotel,
    endTime: dayEndTime
  });

  return {
    originalPlan: getTodaysRemainingPlan(),
    newPlan,
    changes: diffPlans(originalPlan, newPlan),
    savings: calculateTimeSavings(originalPlan, newPlan)
  };
}
```

#### UI: Re-plan Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  📍 You're in Shibuya (detected)                                           │
│  ───────────────────────────────                                            │
│                                                                             │
│  Your next planned activity is in Asakusa (35 min away).                   │
│  Want to explore Shibuya instead?                                          │
│                                                                             │
│  [🔄 Rebuild Day from Here]  [Keep Original Plan]                          │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘

                                ▼ User taps "Rebuild"

┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  New plan from Shibuya (2:30 PM onwards)                                   │
│  ═══════════════════════════════════════════════════════════════════════   │
│                                                                             │
│  14:30 - 16:00  🛍️ Shibuya shopping                                        │
│                 Shibuya 109, Tokyu Hands                                   │
│                                                                             │
│  16:00 - 17:00  🌅 Shibuya Sky (sunset views)                              │
│                 Timed entry available at 16:30                             │
│                                                                             │
│  17:00 - 17:15  🚶 Walk to dinner                                          │
│                                                                             │
│  17:15 - 18:30  🍣 Dinner at Genki Sushi                                   │
│                 ⚠️ Moved from Asakusa - similar quality                   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ Changes from original:                                              │   │
│  │ • Skipped: Senso-ji Temple → Moved to Day 3 morning               │   │
│  │ • Swapped: Asakusa dinner → Shibuya dinner (saves 35 min commute) │   │
│  │ • Added: Shibuya Sky (you're already here!)                        │   │
│  │                                                                     │   │
│  │ Time saved: 45 min less commuting                                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  [✓ Accept New Plan]  [Modify]  [Keep Original]                           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 23. Complete UserExperienceSettings Schema

Master settings object combining all preferences.

```typescript
interface UserExperienceSettings {
  // === PACE & TIMING ===
  pace: "relaxed" | "normal" | "ambitious";
  dayStart: string;                    // "09:30"
  dayEnd: string;                      // "20:00"
  napWindows?: { start: string; end: string }[];
  quietHours?: { start: string; end: string };   // Wind-down time
  jetLagDays?: number;                 // First N days slower

  // === WALKING & COMMUTE ===
  walkingTolerance: "low" | "medium" | "high";
  maxWalkMinutes: number;              // Between activities
  commutePreference: "shortest" | "balanced" | "scenic";
  avoidStairs: boolean;
  preferElevators: boolean;

  // === BUDGET ===
  budgetMode: "free-first" | "moderate" | "splurge-once-a-day";
  dailyBudgetLimit?: number;           // In local currency
  showPricesIn: string;                // "USD", "JPY", etc.

  // === DIETARY & ACCESSIBILITY ===
  dietary: string[];                   // ["vegetarian", "no-pork", "halal"]
  allergies: string[];                 // ["peanuts", "shellfish"]
  accessibility: {
    wheelchair: boolean;
    stroller: boolean;
    avoidStairs: boolean;
    restroomPriority: "low" | "high";
    mobilityLevel: "full" | "limited" | "requires-assistance";
  };

  // === TRIP MODE ===
  tripMode: TripMode;                  // "family", "couples", etc.
  travelers: {
    adults: number;
    children: number;
    childrenAges?: number[];
    seniors?: number;
  };

  // === ANCHORS & CONSTRAINTS ===
  anchors: {
    mustDo: string[];                  // Activity IDs that must happen
    niceToHave: string[];              // Boost these in scoring
    noGo: string[];                    // Never suggest these
  };

  hardConstraints: {
    maxActivitiesPerDay?: number;
    requiredBreakFrequency?: number;   // Minutes
    kidsBedtime?: string;              // "21:00"
    noEarlyMornings?: boolean;         // Nothing before 10:00
  };

  // === WEATHER & CONTINGENCY ===
  rainPlanEnabled: boolean;            // Auto-switch to indoor plan
  weatherSensitivity: "low" | "medium" | "high";

  // === REAL-TIME FEATURES ===
  energyCheckInsEnabled: boolean;
  checkInFrequency: "every-activity" | "twice-daily" | "manual";

  nudgeSettings: {
    departureReminders: boolean;
    lastTrainAlerts: boolean;
    weatherAlerts: boolean;
    crowdAlerts: boolean;
    graceWindowNotifications: boolean;
  };

  // === VIEW & LOCALIZATION ===
  viewPreference: "map-first" | "timeline-first" | "split";
  showLocalScripts: boolean;           // Show Japanese/local text
  language: string;                    // "en", "ja", etc.

  // === NOTIFICATIONS ===
  notifications: {
    enabled: boolean;
    criticalOnly: boolean;
    dnd: { start: string; end: string };   // Do not disturb
    channels: ("push" | "email" | "sms")[];
  };

  // === OFFLINE & SYNC ===
  offlineMode: {
    autoDownload: boolean;
    downloadDaysAhead: number;         // 1-7
    includeAlternatives: boolean;
    maxStorageMB: number;
  };

  // === ADVANCED ===
  scoringWeights?: {
    commute: number;       // 0-100
    variety: number;
    crowds: number;
    budget: number;
    rating: number;
  };

  vibePreferences?: string[];          // ["street-food", "temples", "pop-culture"]

  whatIfSimulation: boolean;           // Enable drag-and-drop impact preview
}
```

#### Default Settings by Trip Mode

```typescript
const DEFAULT_SETTINGS_BY_MODE: Record<TripMode, Partial<UserExperienceSettings>> = {
  family: {
    pace: "relaxed",
    dayStart: "09:00",
    dayEnd: "19:00",
    walkingTolerance: "low",
    maxWalkMinutes: 15,
    napWindows: [{ start: "13:00", end: "14:30" }],
    hardConstraints: {
      kidsBedtime: "20:30",
      requiredBreakFrequency: 90
    },
    rainPlanEnabled: true,
    energyCheckInsEnabled: true
  },

  couples: {
    pace: "normal",
    dayStart: "09:30",
    dayEnd: "22:00",
    walkingTolerance: "high",
    maxWalkMinutes: 25,
    rainPlanEnabled: false,
    energyCheckInsEnabled: false
  },

  honeymoon: {
    pace: "relaxed",
    dayStart: "10:00",
    dayEnd: "23:00",
    walkingTolerance: "medium",
    budgetMode: "splurge-once-a-day",
    hardConstraints: {
      maxActivitiesPerDay: 3
    }
  },

  solo: {
    pace: "ambitious",
    dayStart: "08:00",
    dayEnd: "23:00",
    walkingTolerance: "high",
    maxWalkMinutes: 30,
    budgetMode: "free-first"
  },

  friends: {
    pace: "normal",
    dayStart: "10:00",
    dayEnd: "24:00",
    walkingTolerance: "high",
    energyCheckInsEnabled: false
  },

  "multi-generational": {
    pace: "relaxed",
    dayStart: "09:00",
    dayEnd: "19:00",
    walkingTolerance: "low",
    accessibility: {
      avoidStairs: true,
      restroomPriority: "high"
    },
    hardConstraints: {
      maxActivitiesPerDay: 3,
      requiredBreakFrequency: 60
    }
  }
};
```

---

### Summary: Feedback Incorporated

| Feedback Item | Status | Section Added |
|---------------|--------|---------------|
| Opening hours & closed-day awareness | ✅ | Section 2 |
| Entity resolution / Place IDs | ✅ | Section 1 |
| Availability & "must book" flags | ✅ | Section 2 |
| Uncertainty buffers (p50/p90) | ✅ | Section 3 |
| Explainability in UI | ✅ | Section 10 |
| Accessibility & stroller-friendliness | ✅ | Section 4 |
| Dynamic pace learning | ✅ | Section 3 |
| Must-do / never-suggest lists | ✅ | Section 7 |
| Popular times / crowding | ✅ | Section 5 |
| Venue status validation | ✅ | Section 11 |
| Hard vs soft constraints | ✅ | Section 8 |
| Cost modeling & currency | ✅ | Section 6 |
| Day templates | ✅ | Section 9 |
| Kids walking pace | ✅ | Section 12 |
| Rain plan (A/B days) | ✅ | Section 5 |
| Night activities & evening slots | ✅ | Section 13 |
| Trip mode & traveler composition | ✅ | Section 14 |
| **Pace controls & day preferences** | ✅ | **Section 15** |
| **Activity variants (short/full)** | ✅ | **Section 16** |
| **Swap with similar nearby** | ✅ | **Section 17** |
| **View preferences (map/timeline)** | ✅ | **Section 18** |
| **Live energy check-ins** | ✅ | **Section 19** |
| **Real-time nudges & alerts** | ✅ | **Section 20** |
| **Offline mode** | ✅ | **Section 21** |
| **Location-aware re-planning** | ✅ | **Section 22** |
| **UserExperienceSettings schema** | ✅ | **Section 23** |

---

## Next Steps

1. [ ] Create `CoreActivity` type and knowledge base structure
2. [ ] Build AI prompt for generating destination activities
3. [ ] Create activity suggestion API endpoint
4. [ ] Modify UI to show free activities prominently
5. [ ] Add Viator as "Enhance" option below each activity
6. [ ] Integrate events API for local happenings
7. [ ] Add neighborhood clustering for efficient day planning
8. [ ] Implement entity resolution with Google Places
9. [ ] Add opening hours validation
10. [ ] Build day template system
11. [ ] Create budget tracker component
12. [ ] **Integrate Google Maps for day-of-travel dynamic decisions**

---

## Section 15: Dynamic Day-of-Travel Decisions (Google Maps Integration)

### Philosophy: From Static Itinerary to Living Travel Companion

A travel itinerary created days/weeks before the trip is just a **starting point**. Real travel is dynamic:
- Weather changes unexpectedly
- Traffic delays happen
- Users run late or finish early
- Restaurants are full or closed
- Energy levels fluctuate
- Serendipitous discoveries occur

This section describes how to use **Google Maps Platform APIs** to make real-time, intelligent decisions during the trip.

---

### 15.1 Google Maps APIs Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  GOOGLE MAPS PLATFORM - RELEVANT APIs FOR TRAVEL                           │
│  ═══════════════════════════════════════════════                            │
│                                                                             │
│  ┌─────────────────┬────────────────────────────────────────────────────┐  │
│  │ API             │ What It Answers                                    │  │
│  ├─────────────────┼────────────────────────────────────────────────────┤  │
│  │ Directions      │ "How do I get from A to B?"                        │  │
│  │                 │ → Routes, travel time, step-by-step navigation    │  │
│  │                 │ → Modes: driving, walking, transit, bicycling     │  │
│  │                 │ → Traffic-aware (real-time or predicted)          │  │
│  ├─────────────────┼────────────────────────────────────────────────────┤  │
│  │ Distance Matrix │ "How far apart are these N locations?"             │  │
│  │                 │ → Many-to-many distance/duration calculation      │  │
│  │                 │ → Great for: "Which restaurant is closest?"       │  │
│  │                 │ → Batch optimization for itinerary ordering       │  │
│  ├─────────────────┼────────────────────────────────────────────────────┤  │
│  │ Places          │ "What's nearby / What's at this location?"         │  │
│  │                 │ → Find restaurants, attractions, etc.             │  │
│  │                 │ → Business details: hours, rating, photos         │  │
│  │                 │ → Place autocomplete for search                   │  │
│  ├─────────────────┼────────────────────────────────────────────────────┤  │
│  │ Geocoding       │ "What are the coordinates for this address?"       │  │
│  │                 │ → Address → Lat/Lng (forward)                     │  │
│  │                 │ → Lat/Lng → Address (reverse)                     │  │
│  ├─────────────────┼────────────────────────────────────────────────────┤  │
│  │ Time Zone       │ "What time is it at this location?"                │  │
│  │                 │ → Timezone ID for any coordinates                 │  │
│  │                 │ → DST-aware offset calculations                   │  │
│  ├─────────────────┼────────────────────────────────────────────────────┤  │
│  │ Maps JavaScript │ "Show this on a map"                               │  │
│  │                 │ → Interactive embedded maps                       │  │
│  │                 │ → Custom markers, routes, overlays                │  │
│  │                 │ → Street View integration                         │  │
│  └─────────────────┴────────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 15.2 Pricing Considerations

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  GOOGLE MAPS PRICING (as of 2024)                                           │
│  ═════════════════════════════════                                          │
│                                                                             │
│  Monthly Credit: $200 FREE                                                  │
│                                                                             │
│  ┌─────────────────┬────────────────┬───────────────────────────────────┐  │
│  │ API             │ Cost / 1,000   │ Typical Usage per Trip            │  │
│  ├─────────────────┼────────────────┼───────────────────────────────────┤  │
│  │ Geocoding       │ $5.00          │ 10-20 calls (activity addresses)  │  │
│  ├─────────────────┼────────────────┼───────────────────────────────────┤  │
│  │ Directions      │ $5.00 (basic)  │ 20-40 calls (route calculations)  │  │
│  │                 │ $10.00 (adv)   │                                   │  │
│  ├─────────────────┼────────────────┼───────────────────────────────────┤  │
│  │ Distance Matrix │ $5.00 (basic)  │ 5-10 calls (optimization)         │  │
│  │                 │ $10.00 (adv)   │                                   │  │
│  ├─────────────────┼────────────────┼───────────────────────────────────┤  │
│  │ Places          │ $17.00-$40.00  │ 0 (use Yelp instead)              │  │
│  │                 │ (varies)       │                                   │  │
│  ├─────────────────┼────────────────┼───────────────────────────────────┤  │
│  │ Maps JS (Loads) │ $7.00          │ Included in page loads            │  │
│  └─────────────────┴────────────────┴───────────────────────────────────┘  │
│                                                                             │
│  COST ESTIMATE PER 7-DAY TRIP: $0.30 - $0.80                               │
│  (With caching & optimization)                                              │
│                                                                             │
│  STRATEGY: Use Google for Directions/Distance/Geocoding                    │
│            Use Yelp for restaurant search (free 500/day)                   │
│            Use Viator for activities (free with commission)                │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 15.3 Dynamic Decision Scenarios

#### Scenario 1: Running Late / Early

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  SCENARIO: User is running 20 minutes late at current activity             │
│  ═══════════════════════════════════════════════════════════                │
│                                                                             │
│  DETECTION:                                                                 │
│  • App tracks current time vs scheduled end time                           │
│  • User manually indicates "running late"                                  │
│  • Or: User hasn't moved from location past scheduled departure           │
│                                                                             │
│  API CALLS:                                                                 │
│  1. Directions API: Get updated travel time to next activity              │
│  2. Distance Matrix: If multiple alternatives, find fastest               │
│                                                                             │
│  SMART SUGGESTIONS:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ⏰ You're running 20 minutes late. Options:                         │   │
│  │                                                                      │   │
│  │ [A] Leave now, arrive 15 min late to lunch (restaurant notified)   │   │
│  │ [B] Skip Tuileries Garden → saves 45 min → arrive on time          │   │
│  │ [C] Shorten lunch to 45 min → back on track by 3pm                 │   │
│  │ [D] Push all afternoon activities by 20 min                        │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  DECISION LOGIC:                                                            │
│  ┌───────────────────┬──────────────────────────────────────────────────┐  │
│  │ Delay Amount      │ Strategy                                         │  │
│  ├───────────────────┼──────────────────────────────────────────────────┤  │
│  │ ≤ 15 min          │ Compress buffer time, no change needed           │  │
│  │ 16-30 min         │ Shorten next flexible activity                   │  │
│  │ 31-60 min         │ Skip one activity OR swap order                  │  │
│  │ > 60 min          │ Reschedule rest of day, protect reservations     │  │
│  └───────────────────┴──────────────────────────────────────────────────┘  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Scenario 2: Weather Change

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  SCENARIO: Rain starts / forecast changes during the day                   │
│  ═══════════════════════════════════════════════════════                    │
│                                                                             │
│  DETECTION:                                                                 │
│  • OpenWeather API shows rain in next 1-3 hours                            │
│  • Upcoming activity is tagged as "outdoor"                                │
│                                                                             │
│  API CALLS:                                                                 │
│  1. OpenWeather: Hourly forecast                                           │
│  2. Yelp/Places: Find indoor alternatives nearby                          │
│  3. Directions: Travel time to alternatives                                │
│                                                                             │
│  SMART SUGGESTIONS:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 🌧️ Rain expected 2pm-5pm. Your 3pm activity is outdoors.            │   │
│  │                                                                      │   │
│  │ Current Plan: Seine River Walk (3pm-5pm)                            │   │
│  │                                                                      │   │
│  │ [SWAP] Musée d'Orsay → Do now (indoor), Seine Walk tomorrow         │   │
│  │ [MOVE] Start Seine Walk at 5pm when rain clears                     │   │
│  │ [REPLACE] Visit Galeries Lafayette (indoor, nearby, 8 min walk)     │   │
│  │ [KEEP] Continue as planned (bring umbrella ☔)                       │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Scenario 3: Traffic-Aware Routing

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  SCENARIO: Heavy traffic to next destination                               │
│  ═════════════════════════════════════════════                              │
│                                                                             │
│  DETECTION:                                                                 │
│  • Directions API with "departure_time=now" shows traffic delay            │
│  • Normal 15 min → 45 min with traffic                                     │
│                                                                             │
│  API CALLS:                                                                 │
│  1. Directions API: With traffic (departure_time=now)                      │
│  2. Directions API: Alternative routes/modes                               │
│  3. Distance Matrix: Compare with alternative destinations                 │
│                                                                             │
│  SMART SUGGESTIONS:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 🚗 Traffic Alert: 45 min to Eiffel Tower (usually 15 min)           │   │
│  │                                                                      │   │
│  │ [A] Take Metro instead → 22 min (Line 6, 4 stops)                   │   │
│  │ [B] Leave 30 min earlier (skip coffee break)                        │   │
│  │ [C] Switch to Arc de Triomphe first → only 12 min away              │   │
│  │ [D] Wait 45 min for traffic to clear                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Scenario 4: Restaurant Full / Closed

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  SCENARIO: Planned restaurant is full or unexpectedly closed               │
│  ══════════════════════════════════════════════════════════                 │
│                                                                             │
│  DETECTION:                                                                 │
│  • User reports "couldn't get in"                                          │
│  • Places API shows "temporarily closed"                                   │
│  • Crowdedness indicator shows "extremely busy"                            │
│                                                                             │
│  API CALLS:                                                                 │
│  1. Yelp API: Find nearby restaurants, same cuisine, similar price        │
│  2. Distance Matrix: Rank by walking distance                              │
│  3. Places API: Check if alternatives are open now                         │
│                                                                             │
│  SMART SUGGESTIONS:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ 🍽️ Café de Flore is very busy. Similar options within 5 min walk:   │   │
│  │                                                                      │   │
│  │ 🥐 Les Deux Magots (3 min) ⭐ 4.5 · $$$                              │   │
│  │    Classic Parisian café, similar vibe                              │   │
│  │    [View] [Navigate] [Call to Reserve]                              │   │
│  │                                                                      │   │
│  │ 🍕 Le Petit Cler (5 min) ⭐ 4.7 · $$                                 │   │
│  │    Cozy bistro, less crowded                                        │   │
│  │    [View] [Navigate]                                                │   │
│  │                                                                      │   │
│  │ 🥗 Wild & The Moon (4 min) ⭐ 4.4 · $$                               │   │
│  │    Healthy/vegan, quick service                                     │   │
│  │    [View] [Navigate]                                                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

#### Scenario 5: Finished Early

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  SCENARIO: User finished activity faster than planned                      │
│  ═════════════════════════════════════════════════════                      │
│                                                                             │
│  DETECTION:                                                                 │
│  • User marks activity complete 30+ min early                              │
│  • Location shows user left venue before scheduled end                     │
│                                                                             │
│  API CALLS:                                                                 │
│  1. Yelp: Find nearby cafes/experiences                                    │
│  2. Viator: Quick activities (< 60 min)                                    │
│  3. Distance Matrix: What's closest to fill time?                          │
│                                                                             │
│  SMART SUGGESTIONS:                                                         │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │ ⏰ You have 45 min before lunch. Ideas:                              │   │
│  │                                                                      │   │
│  │ ☕ Grab coffee at nearby cafe (3 min walk)                           │   │
│  │    → Café Verlet, excellent pastries                                │   │
│  │                                                                      │   │
│  │ 🚶 Walk through Jardin du Palais Royal (5 min away)                  │   │
│  │    → Beautiful hidden garden, great photos                          │   │
│  │                                                                      │   │
│  │ 🏃 Head to lunch early                                               │   │
│  │    → Restaurant opens in 20 min, you'd arrive perfectly             │   │
│  │                                                                      │   │
│  │ 🛍️ Browse shops on Rue de Rivoli (you're already there)             │   │
│  │                                                                      │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 15.4 Day-of-Travel Context Object

```typescript
/**
 * Complete context for making real-time travel decisions
 */
interface DayOfTravelContext {
  // Current state
  currentLocation: Coordinates;
  currentTime: Date;
  currentActivity?: ItineraryItem;  // What they're doing now

  // Trip context
  tripId: string;
  dayNumber: number;
  remainingActivities: ItineraryItem[];  // Today's remaining schedule

  // External factors
  weather: {
    current: WeatherConditions;
    hourlyForecast: HourlyWeather[];
    alerts: WeatherAlert[];
  };

  // User state
  userPreferences: {
    pace: "relaxed" | "moderate" | "packed";
    budget: "budget" | "moderate" | "luxury";
    dietary: string[];
    mobility: MobilityRequirements;
  };

  // Travel factors
  travelMode: "walking" | "transit" | "driving" | "cycling";
  hasReservations: ReservationInfo[];  // Things that CAN'T be moved

  // Learning
  behaviorToday: {
    averageActivityDuration: number;  // vs planned
    averageTransitTime: number;       // vs estimated
    energyLevel: "high" | "normal" | "low";
  };
}

interface Coordinates {
  lat: number;
  lng: number;
}

interface ReservationInfo {
  activityId: string;
  time: Date;
  type: "restaurant" | "tour" | "tickets" | "transport";
  cancellationPolicy: "free" | "fee" | "non-refundable";
  confirmationNumber?: string;
}
```

---

### 15.5 Smart Suggestion Engine

```typescript
/**
 * Suggestion types the engine can produce
 */
interface SmartSuggestion {
  id: string;
  type: SuggestionType;
  priority: "critical" | "important" | "helpful" | "optional";
  reason: string;  // Why this suggestion?

  // What changes
  originalItem?: ItineraryItem;
  suggestedItem?: ItineraryItem;

  // Impact
  timeSaved?: number;       // minutes
  costChange?: number;      // currency change
  experienceImpact: "better" | "neutral" | "worse";

  // Actions
  actions: SuggestionAction[];
}

type SuggestionType =
  | "reschedule"   // Move to different time
  | "skip"         // Remove from itinerary
  | "swap"         // Exchange order with another activity
  | "replace"      // Substitute with alternative
  | "add"          // Fill gap with something new
  | "shorten"      // Reduce time at activity
  | "reroute";     // Change transportation method

interface SuggestionAction {
  label: string;           // Button text
  type: "accept" | "modify" | "dismiss" | "more_info";
  callback: () => void;
}
```

---

### 15.6 API Integration Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  SMART SUGGESTION ENGINE ARCHITECTURE                                       │
│  ════════════════════════════════════                                       │
│                                                                             │
│  ┌─────────────┐     ┌─────────────────────────────────────────────────┐   │
│  │             │     │                                                  │   │
│  │  User's     │     │         REAL-TIME DATA SOURCES                  │   │
│  │  Current    │     │                                                  │   │
│  │  Location   │     │  ┌─────────────┐ ┌─────────────┐ ┌───────────┐  │   │
│  │     +       │────▶│  │ OpenWeather │ │ Google Maps │ │   Yelp    │  │   │
│  │  Itinerary  │     │  │ (Weather)   │ │ (Directions)│ │(Restaurants)│  │   │
│  │             │     │  └──────┬──────┘ └──────┬──────┘ └─────┬─────┘  │   │
│  └─────────────┘     │         │               │               │        │   │
│                      │         └───────────────┼───────────────┘        │   │
│                      │                         ▼                        │   │
│                      │              ┌─────────────────────┐             │   │
│                      │              │                     │             │   │
│                      │              │  DECISION ENGINE    │             │   │
│                      │              │                     │             │   │
│                      │              │  • Time Analysis    │             │   │
│                      │              │  • Weather Impact   │             │   │
│                      │              │  • Route Optimize   │             │   │
│                      │              │  • Alternative Find │             │   │
│                      │              │                     │             │   │
│                      │              └──────────┬──────────┘             │   │
│                      │                         │                        │   │
│                      │                         ▼                        │   │
│                      │              ┌─────────────────────┐             │   │
│                      │              │  SMART SUGGESTIONS  │             │   │
│                      │              │                     │             │   │
│                      │              │  "Leave now to make │             │   │
│                      │              │   your reservation" │             │   │
│                      │              │                     │             │   │
│                      │              │  [Accept] [Modify]  │             │   │
│                      │              └─────────────────────┘             │   │
│                      │                                                  │   │
│                      └─────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 15.7 Travel Time Calculation

```typescript
/**
 * Calculate travel time between two points using Google Directions API
 */
interface TravelTimeRequest {
  origin: Coordinates | string;      // Lat/lng or address
  destination: Coordinates | string;
  mode: "walking" | "transit" | "driving" | "bicycling";
  departureTime?: Date;              // For traffic-aware routing
  arrivalTime?: Date;                // "I need to arrive by X"
}

interface TravelTimeResult {
  duration: {
    value: number;                   // Seconds
    text: string;                    // "25 mins"
  };
  durationInTraffic?: {              // Only for driving
    value: number;
    text: string;
  };
  distance: {
    value: number;                   // Meters
    text: string;                    // "2.1 km"
  };
  steps: TravelStep[];               // Turn-by-turn
  transitDetails?: TransitInfo[];    // Line names, stops

  // Smart additions
  suggestedDepartureTime: Date;      // "Leave by 2:35pm"
  arrivalTime: Date;                 // "Arrive at 3:00pm"
  alternatives: AlternativeRoute[];  // Other options
}

interface TravelStep {
  instruction: string;     // "Walk to Metro station"
  duration: number;        // Seconds
  distance: number;        // Meters
  mode: string;            // "WALKING", "TRANSIT"
  transitLine?: string;    // "Line 6"
}
```

---

### 15.8 Smart Departure Notifications

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  PROACTIVE DEPARTURE ALERTS                                                 │
│  ═══════════════════════════                                                │
│                                                                             │
│  The app continuously monitors:                                             │
│  1. Current location vs next activity location                             │
│  2. Real-time travel time (with traffic/delays)                            │
│  3. Buffer time needed                                                      │
│                                                                             │
│  ALERT SEQUENCE:                                                            │
│                                                                             │
│  [T-30 min] 🔔 "Your next activity is in 30 min"                           │
│             "Eiffel Tower (12 min walk from here)"                         │
│             [View on Map] [Get Directions]                                  │
│                                                                             │
│  [T-15 min] 🔔 "Time to start heading to Eiffel Tower"                     │
│             "Leave in 3 min to arrive on time"                             │
│             [Start Navigation]                                              │
│                                                                             │
│  [T-5 min]  ⚠️ "You should leave now!"                                      │
│             "You'll be 5 min late if you don't leave immediately"          │
│             [Navigate Now] [Push Back 15 min]                               │
│                                                                             │
│  [T+5 min]  🚨 "You're running late"                                        │
│             "Arrival: 3:17pm (17 min late)"                                │
│             [Notify Next Venue] [Find Faster Route]                        │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 15.9 Day View UI with Smart Suggestions

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  📍 LIVE DAY VIEW                                          Paris, Day 3    │
│  ═════════════════                                                          │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  🟢 NOW: Louvre Museum                            📍 You are here   │   │
│  │  ──────────────────────────────────────────────────────────────────  │   │
│  │  Scheduled: 09:00 - 12:00  |  Actual: 09:15 - ???                   │   │
│  │                                                                      │   │
│  │  ⏱️ Running 15 min behind  |  ☀️ 18°C Sunny                          │   │
│  │                                                                      │   │
│  │  [Mark Complete]  [I Need More Time]  [Skip to Next]                │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  ⚠️ SMART SUGGESTION                                                 │   │
│  │  ────────────────────                                                │   │
│  │  You're running 15 min late. To stay on schedule:                   │   │
│  │                                                                      │   │
│  │  → Leave Louvre by 12:00 (in 45 min)                                │   │
│  │  → Walk to Angelina (8 min) instead of planned café (15 min away)  │   │
│  │  → This saves 12 min, getting you back on track                     │   │
│  │                                                                      │   │
│  │  [Accept Changes]  [Show Other Options]  [Dismiss]                  │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
│  ─────── COMING UP ───────                                                  │
│                                                                             │
│  12:15  🚶 Walk to Restaurant (8 min)                                      │
│         └─ Traffic: Normal | Weather: ☀️ Stay sunny                        │
│                                                                             │
│  12:30  🍽️ Lunch at Café Marly                          ⚠️ Reservation     │
│         └─ Confirmed for 12:30 | [View Menu] [Call]                        │
│                                                                             │
│  14:00  🚶 Walk to Garden (12 min)                                         │
│                                                                             │
│  14:15  🌳 Tuileries Garden                               ☀️ Great weather │
│         └─ 90 min planned | Free entry                                     │
│                                                                             │
│  ─────── WEATHER ALERT ───────                                              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────┐   │
│  │  🌧️ Rain expected 4pm-6pm                                            │   │
│  │                                                                      │   │
│  │  Your 4pm activity (Seine Walk) is outdoors.                        │   │
│  │                                                                      │   │
│  │  [Swap with Tomorrow's Museum]  [Keep + Bring Umbrella]             │   │
│  └─────────────────────────────────────────────────────────────────────┘   │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 15.10 Implementation Phases

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  PHASE 1: Foundation (Week 1-2)                                            │
│  ═══════════════════════════════                                            │
│                                                                             │
│  □ Google Maps API key setup & billing                                     │
│  □ Create GoogleMapsService with:                                          │
│    • getDirections(origin, destination, mode)                              │
│    • getDistanceMatrix(origins, destinations)                              │
│    • geocodeAddress(address)                                               │
│  □ Add caching layer (1 hour for directions, 24h for geocoding)           │
│  □ Integrate with existing itinerary data model                            │
│  □ Show travel time between activities in itinerary view                   │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PHASE 2: Basic Real-Time (Week 3-4)                                       │
│  ════════════════════════════════════                                       │
│                                                                             │
│  □ Create DayOfTravelContext type                                          │
│  □ Build "Time to Leave" calculator                                        │
│  □ Add departure notifications (30 min, 15 min, 5 min)                     │
│  □ Create Day View UI with current activity tracking                       │
│  □ Integrate OpenWeather for real-time weather checks                      │
│  □ Show weather impact on upcoming outdoor activities                      │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PHASE 3: Smart Suggestions (Week 5-6)                                     │
│  ═════════════════════════════════════                                      │
│                                                                             │
│  □ Build SmartSuggestionEngine class                                       │
│  □ Implement "running late" detection & suggestions                        │
│  □ Implement "weather change" detection & indoor alternatives             │
│  □ Implement "restaurant busy/closed" alternative finder                   │
│  □ Create suggestion UI components                                         │
│  □ Add one-tap apply for suggestions                                       │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  PHASE 4: Advanced Features (Week 7-8)                                     │
│  ═════════════════════════════════════                                      │
│                                                                             │
│  □ Add live map view with current position                                 │
│  □ Implement turn-by-turn navigation handoff (Google Maps/Apple Maps)     │
│  □ Add "finished early" gap-filler suggestions                            │
│  □ Learn user's actual pace vs planned (ML-lite)                          │
│  □ Multi-day impact analysis (reschedule to tomorrow)                     │
│  □ Reservation protection (never suggest skipping reservations)           │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 15.11 API Service Implementation

```typescript
// /src/lib/google-maps.ts

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY!;
const DIRECTIONS_BASE = "https://maps.googleapis.com/maps/api/directions/json";
const DISTANCE_MATRIX_BASE = "https://maps.googleapis.com/maps/api/distancematrix/json";
const GEOCODE_BASE = "https://maps.googleapis.com/maps/api/geocode/json";

/**
 * Get directions between two points
 */
export async function getDirections(
  origin: string | Coordinates,
  destination: string | Coordinates,
  options: {
    mode?: "walking" | "transit" | "driving" | "bicycling";
    departureTime?: Date;
    alternatives?: boolean;
  } = {}
): Promise<DirectionsResult> {
  const params = new URLSearchParams({
    origin: formatLocation(origin),
    destination: formatLocation(destination),
    mode: options.mode || "walking",
    key: GOOGLE_MAPS_API_KEY,
  });

  if (options.departureTime) {
    params.set("departure_time", Math.floor(options.departureTime.getTime() / 1000).toString());
  }
  if (options.alternatives) {
    params.set("alternatives", "true");
  }

  const response = await cachedFetch(
    `${DIRECTIONS_BASE}?${params}`,
    { cacheKey: `directions-${params}`, ttl: 3600 }  // Cache 1 hour
  );

  return parseDirectionsResponse(response);
}

/**
 * Calculate distances between multiple origins and destinations
 */
export async function getDistanceMatrix(
  origins: (string | Coordinates)[],
  destinations: (string | Coordinates)[],
  mode: "walking" | "transit" | "driving" = "walking"
): Promise<DistanceMatrixResult> {
  const params = new URLSearchParams({
    origins: origins.map(formatLocation).join("|"),
    destinations: destinations.map(formatLocation).join("|"),
    mode,
    key: GOOGLE_MAPS_API_KEY,
  });

  const response = await cachedFetch(
    `${DISTANCE_MATRIX_BASE}?${params}`,
    { cacheKey: `matrix-${params}`, ttl: 3600 }
  );

  return parseDistanceMatrixResponse(response);
}

/**
 * Find the closest destination from current location
 */
export async function findClosest(
  currentLocation: Coordinates,
  candidates: Array<{ id: string; location: Coordinates; name: string }>,
  mode: "walking" | "transit" | "driving" = "walking"
): Promise<{ candidate: typeof candidates[0]; duration: number; distance: number }> {
  const matrix = await getDistanceMatrix(
    [currentLocation],
    candidates.map(c => c.location),
    mode
  );

  let closest = { index: 0, duration: Infinity };
  matrix.rows[0].elements.forEach((element, i) => {
    if (element.duration.value < closest.duration) {
      closest = { index: i, duration: element.duration.value };
    }
  });

  return {
    candidate: candidates[closest.index],
    duration: matrix.rows[0].elements[closest.index].duration.value,
    distance: matrix.rows[0].elements[closest.index].distance.value,
  };
}

/**
 * Calculate optimal departure time to arrive by target time
 */
export async function calculateDepartureTime(
  origin: Coordinates,
  destination: Coordinates,
  arrivalTime: Date,
  mode: "walking" | "transit" | "driving" = "walking",
  bufferMinutes: number = 5
): Promise<{
  departureTime: Date;
  travelDuration: number;
  alertTimes: { warning: Date; urgent: Date; critical: Date };
}> {
  const directions = await getDirections(origin, destination, { mode });
  const travelSeconds = directions.duration.value;
  const totalBuffer = (bufferMinutes * 60) + travelSeconds;

  const departureTime = new Date(arrivalTime.getTime() - (totalBuffer * 1000));

  return {
    departureTime,
    travelDuration: travelSeconds,
    alertTimes: {
      warning: new Date(departureTime.getTime() - 30 * 60 * 1000),   // 30 min before
      urgent: new Date(departureTime.getTime() - 15 * 60 * 1000),    // 15 min before
      critical: new Date(departureTime.getTime() - 5 * 60 * 1000),   // 5 min before
    },
  };
}

// Helper functions
function formatLocation(loc: string | Coordinates): string {
  if (typeof loc === "string") return loc;
  return `${loc.lat},${loc.lng}`;
}
```

---

### 15.12 Comparison: What Each API Provides

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                                                                             │
│  API RESPONSIBILITY MATRIX FOR LAYLA CLONE                                  │
│  ═════════════════════════════════════════                                  │
│                                                                             │
│  ┌────────────────────┬────────────┬────────────┬────────────┬───────────┐ │
│  │ Capability         │ Google Maps│ Yelp       │ Viator     │ OpenWeather│ │
│  ├────────────────────┼────────────┼────────────┼────────────┼───────────┤ │
│  │ Restaurant search  │     ⚪      │     ✅      │     ⚪      │    ⚪     │ │
│  │ Restaurant details │     ⚪      │     ✅      │     ⚪      │    ⚪     │ │
│  │ Activity search    │     ⚪      │     ⚪      │     ✅      │    ⚪     │ │
│  │ Activity booking   │     ⚪      │     ⚪      │     ✅      │    ⚪     │ │
│  │ Weather forecast   │     ⚪      │     ⚪      │     ⚪      │    ✅     │ │
│  │ Directions         │     ✅      │     ⚪      │     ⚪      │    ⚪     │ │
│  │ Travel time        │     ✅      │     ⚪      │     ⚪      │    ⚪     │ │
│  │ Traffic info       │     ✅      │     ⚪      │     ⚪      │    ⚪     │ │
│  │ Distance matrix    │     ✅      │     ⚪      │     ⚪      │    ⚪     │ │
│  │ Geocoding          │     ✅      │     ⚪      │     ⚪      │    ⚪     │ │
│  │ Map display        │     ✅      │     ⚪      │     ⚪      │    ⚪     │ │
│  │ Place photos       │     ✅      │     ✅      │     ✅      │    ⚪     │ │
│  │ Opening hours      │     ✅      │     ✅      │     ⚪      │    ⚪     │ │
│  │ Reviews/ratings    │     ✅      │     ✅      │     ✅      │    ⚪     │ │
│  └────────────────────┴────────────┴────────────┴────────────┴───────────┘ │
│                                                                             │
│  RECOMMENDED SPLIT:                                                         │
│  • Restaurants:     Yelp (better reviews, free tier)                       │
│  • Activities:      Viator (bookable, commission-based)                    │
│  • Weather:         OpenWeather (free tier sufficient)                     │
│  • Navigation:      Google Maps (no real alternative)                      │
│  • Maps Display:    Google Maps (or Mapbox as alternative)                 │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 15.13 Next Steps for Google Maps Integration

| Priority | Task | Effort | Value |
|----------|------|--------|-------|
| 1 | Set up Google Maps API key & billing | 1 hour | Prerequisite |
| 2 | Create `GoogleMapsService` with Directions API | 4 hours | High |
| 3 | Add travel time to itinerary items | 2 hours | High |
| 4 | Display itinerary on interactive map | 8 hours | High |
| 5 | Build "Time to Leave" notifications | 4 hours | Medium |
| 6 | Create Smart Suggestion Engine | 16 hours | High |
| 7 | Implement weather-based rerouting | 8 hours | Medium |
| 8 | Add alternative finder for closures | 8 hours | Medium |
| 9 | Live position tracking in Day View | 8 hours | Medium |
| 10 | Turn-by-turn navigation handoff | 4 hours | Low |
