# Place Resolver Caching Documentation

## Overview

The Place Resolver service transforms AI-generated place names into verified place data with coordinates, photos, and ratings. To save money and improve performance, we cache resolved place data.

---

## APIs Being Called

| Provider | API | Use Case | Cost | Rate Limit |
|----------|-----|----------|------|------------|
| **Yelp** | Fusion API v3 | Restaurants, cafes, bars | FREE | 500/day |
| **OpenStreetMap** | Nominatim | Temples, shrines, museums, parks, landmarks | FREE | 1 req/sec |
| **Foursquare** | Places API | Venues, restaurants | FREE | 1,000/day |
| **Viator** | Partner API | Tours, activities, experiences | Affiliate | Unlimited |
| **Google Places** | Text Search (v2) | Fallback for all categories | PAID (~$17/1K) | Pay-as-you-go |

### Category → Provider Mapping

```typescript
const CATEGORY_PROVIDER_MAP = {
  // Food & Drink → Yelp first
  restaurant: ["yelp", "google"],
  cafe: ["yelp", "google"],
  bar: ["yelp", "google"],
  food: ["yelp", "google"],

  // Tours → Viator first
  tour: ["viator", "google"],
  activity: ["viator", "google"],
  experience: ["viator", "google"],

  // Attractions → OSM first (FREE!)
  temple: ["osm", "google"],
  shrine: ["osm", "google"],
  museum: ["osm", "google"],
  park: ["osm", "google"],
  landmark: ["osm", "google"],

  // Other
  hotel: ["google"],
  shopping: ["yelp", "google"],
  default: ["osm", "google"],
};
```

---

## Cache Architecture

### Two-Layer Caching

```
┌─────────────────────────────────────────────────────────┐
│                    Request Flow                          │
└─────────────────────────────────────────────────────────┘
                           │
                           ▼
              ┌────────────────────────┐
              │   1. Memory Cache      │  ← Fastest (in-process)
              │   TTL: 24 hours        │
              └────────────────────────┘
                           │ MISS
                           ▼
              ┌────────────────────────┐
              │   2. File Cache        │  ← Persists across restarts
              │   place-resolver-cache/│
              │   index.json           │
              └────────────────────────┘
                           │ MISS
                           ▼
              ┌────────────────────────┐
              │   3. Test Mode?        │
              │   ├─ YES → AI Fallback │  ← Mock data, no API call
              │   └─ NO  → Call APIs   │  ← Real provider calls
              └────────────────────────┘
```

### Cache Key Format

```
{name}|{city}|{country}|{category}
```

Example: `senso-ji temple|tokyo|japan|temple`

**Note**: Keys are case-insensitive.

---

## Cached Response Format

### `PlaceResolutionResult` (What we cache)

```typescript
interface PlaceResolutionResult {
  original: UnresolvedPlace;      // Input from AI
  resolved: ResolvedPlace | null; // Matched place data
  alternatives: ResolvedPlace[];  // Other potential matches
  error?: string;                 // Error message if failed
  provider: string;               // Which provider succeeded
  duration: number;               // Resolution time in ms
  cached: boolean;                // Was this from cache?
}
```

### `ResolvedPlace` (The actual place data)

```typescript
interface ResolvedPlace {
  // === REQUIRED FIELDS ===
  name: string;                   // "Senso-ji Temple"
  address: string;                // "2-3-1 Asakusa, Taito City, Tokyo"
  neighborhood: string;           // "Asakusa"
  coordinates: {
    lat: number;                  // 35.7148
    lng: number;                  // 139.7967
  };
  confidence: number;             // 0.0 - 1.0 (match confidence)
  source: "yelp" | "osm" | "foursquare" | "viator" | "google" | "ai";

  // === OPTIONAL FIELDS ===
  rating?: number;                // 4.5 (out of 5)
  reviewCount?: number;           // 1234
  photos?: string[];              // ["https://...jpg", ...]
  openingHours?: string[];        // ["Mon: 9AM-5PM", ...]
  sourceId?: string;              // Provider's internal ID
  priceLevel?: number;            // 1-4 ($-$$$$)
  isOpenNow?: boolean;            // true/false
  website?: string;               // "https://..."
  phone?: string;                 // "+81 3-1234-5678"
  googlePlaceId?: string;         // For Google-resolved places
}
```

---

## Fields We Need (Priority)

### Critical (Must Have)
| Field | Why | Source Priority |
|-------|-----|-----------------|
| `name` | Display to user | All |
| `coordinates.lat/lng` | Map display, routing | All |
| `address` | Display, directions | All |

### Important (Should Have)
| Field | Why | Source Priority |
|-------|-----|-----------------|
| `photos[]` | Visual appeal | Yelp > Foursquare > Viator > Google |
| `rating` | Quality indicator | Yelp > Google > Foursquare |
| `reviewCount` | Trust signal | Yelp > Google |
| `neighborhood` | Context | All |

### Nice to Have
| Field | Why | Source Priority |
|-------|-----|-----------------|
| `openingHours` | Planning | Google > OSM |
| `priceLevel` | Budget planning | Yelp > Google |
| `phone` | Contact | All |
| `website` | More info | All |
| `isOpenNow` | Real-time status | Google |

---

## Provider Response → ResolvedPlace Mapping

### Yelp → ResolvedPlace

```typescript
// Yelp API Response
{
  id: "abc123",
  name: "Asakusa Imahan",
  location: {
    address1: "2-1-12 Nishi-Asakusa",
    city: "Taito",
  },
  coordinates: { latitude: 35.714, longitude: 139.792 },
  rating: 4.5,
  review_count: 234,
  image_url: "https://s3-media.fl.yelpcdn.com/...",
  price: "$$$$",
  phone: "+81312345678",
  url: "https://yelp.com/biz/...",
}

// Maps to:
{
  name: "Asakusa Imahan",
  address: "2-1-12 Nishi-Asakusa",
  neighborhood: "Taito",
  coordinates: { lat: 35.714, lng: 139.792 },
  rating: 4.5,
  reviewCount: 234,
  photos: ["https://s3-media.fl.yelpcdn.com/..."],
  confidence: 0.9,  // calculated from name match
  source: "yelp",
  sourceId: "abc123",
  priceLevel: 4,    // $$$$ = 4
  phone: "+81312345678",
  website: "https://yelp.com/biz/...",
}
```

### OpenStreetMap/Nominatim → ResolvedPlace

```typescript
// OSM API Response
{
  place_id: 12345,
  osm_type: "way",
  osm_id: 67890,
  lat: "35.7148",
  lon: "139.7967",
  display_name: "Senso-ji, 2-3-1, Asakusa, Taito, Tokyo, 111-0032, Japan",
  namedetails: { name: "Senso-ji" },
  address: {
    tourism: "Senso-ji",
    suburb: "Asakusa",
    city: "Taito",
  },
  extratags: {
    website: "https://senso-ji.jp",
    phone: "+81 3-3842-0181",
  },
}

// Maps to:
{
  name: "Senso-ji",
  address: "Senso-ji, 2-3-1, Asakusa, Taito, Tokyo, 111-0032, Japan",
  neighborhood: "Asakusa",
  coordinates: { lat: 35.7148, lng: 139.7967 },
  photos: [],  // OSM doesn't provide photos!
  confidence: 0.85,
  source: "osm",
  sourceId: "way/67890",
  website: "https://senso-ji.jp",
  phone: "+81 3-3842-0181",
}
```

### Google Places → ResolvedPlace

```typescript
// Google Places API Response
{
  id: "ChIJ8T1GpMOMGGARDYGSgpooDWw",
  displayName: { text: "Senso-ji Temple" },
  formattedAddress: "2-3-1 Asakusa, Taito City, Tokyo 111-0032",
  location: { latitude: 35.7148, longitude: 139.7967 },
  rating: 4.6,
  userRatingCount: 45678,
  regularOpeningHours: {
    openNow: true,
    weekdayDescriptions: ["Monday: 6:00 AM – 5:00 PM", ...],
  },
  priceLevel: "PRICE_LEVEL_FREE",
  websiteUri: "https://senso-ji.jp",
  internationalPhoneNumber: "+81 3-3842-0181",
}

// Maps to:
{
  name: "Senso-ji Temple",
  address: "2-3-1 Asakusa, Taito City, Tokyo 111-0032",
  neighborhood: "Asakusa",  // extracted from addressComponents
  coordinates: { lat: 35.7148, lng: 139.7967 },
  rating: 4.6,
  reviewCount: 45678,
  photos: [],  // requires separate API call
  openingHours: ["Monday: 6:00 AM – 5:00 PM", ...],
  confidence: 0.95,
  source: "google",
  sourceId: "ChIJ8T1GpMOMGGARDYGSgpooDWw",
  googlePlaceId: "ChIJ8T1GpMOMGGARDYGSgpooDWw",
  priceLevel: 0,  // FREE = 0
  isOpenNow: true,
  website: "https://senso-ji.jp",
  phone: "+81 3-3842-0181",
}
```

---

## Test Mode (AI Fallback)

When `PLACE_RESOLVER_MODE=test`, we skip ALL API calls and return mock data:

```typescript
{
  name: "Senso-ji Temple",  // from input
  address: "Asakusa Tokyo, Japan",
  neighborhood: "Asakusa",
  coordinates: { lat: 0, lng: 0 },  // no real coords!
  rating: 4.5,  // generated from name hash
  reviewCount: 500,  // generated from name hash
  photos: [  // category-based Unsplash photos
    "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=800",
  ],
  confidence: 0.7,
  source: "ai",
}
```

### Mock Rating Generation

Ratings are deterministically generated from place name hash:
- Same name → Same rating (consistent across runs)
- Different categories have different rating ranges:
  - `temple`: 4.2 - 4.9
  - `restaurant`: 3.8 - 4.8
  - `museum`: 4.0 - 4.7

### Category Photos (Unsplash)

Each category has curated Unsplash photos:
- `temple`: Japanese temple photos
- `restaurant`: Food/dining photos
- `park`: Nature/garden photos
- etc.

---

## Cache File Structure

### Location
```
./place-resolver-cache/index.json
```

### Format
```json
{
  "entries": {
    "asakusa imahan|tokyo|japan|restaurant": {
      "place": {
        "name": "Asakusa Imahan",
        "category": "restaurant",
        "neighborhood": "Asakusa",
        "city": "Tokyo",
        "country": "Japan"
      },
      "result": {
        "original": { ... },
        "resolved": { ... },
        "alternatives": [ ... ],
        "provider": "yelp",
        "duration": 234,
        "cached": false
      },
      "timestamp": "2025-12-28T17:18:01.109Z"
    },
    // ... more entries
  },
  "lastUpdated": "2025-12-28T17:30:00.000Z",
  "totalHits": 45,
  "totalMisses": 10
}
```

---

## Environment Variables

```bash
# Control which mode to use
PLACE_RESOLVER_MODE=test   # "test" or "prod"
AI_MODE=test               # Fallback if PLACE_RESOLVER_MODE not set

# Cache directory (optional)
RESOLVER_CACHE_DIR=./place-resolver-cache
```

---

## How to Prime the Cache

### Option 1: Run the App
```bash
# Set to prod mode temporarily to make real API calls
PLACE_RESOLVER_MODE=prod npm run dev

# Generate itineraries for common destinations
# Each unique place will be cached
```

### Option 2: Create a Priming Script
```typescript
// scripts/prime-cache.ts
import { resolvePlace } from '../src/lib/place-resolver';

const COMMON_PLACES = [
  { name: "Senso-ji Temple", category: "temple", city: "Tokyo", country: "Japan" },
  { name: "Tokyo Tower", category: "landmark", city: "Tokyo", country: "Japan" },
  // ... more places
];

async function primeCache() {
  for (const place of COMMON_PLACES) {
    await resolvePlace(place);
    await sleep(500); // Rate limit
  }
}
```

---

## Troubleshooting

### Cache Miss in Test Mode
- Check if `PLACE_RESOLVER_MODE=test` is set
- Verify cache file exists: `./place-resolver-cache/index.json`
- Check cache key matches (case-insensitive)

### No Photos for Attractions
- OSM doesn't provide photos
- In prod mode, attractions resolved via OSM will have `photos: []`
- In test mode, we inject Unsplash photos based on category

### Stale Cache
- Delete `./place-resolver-cache/index.json` to reset
- Use `forceRefresh: true` option to bypass cache for specific requests

---

## Cost Analysis

| Destination | Places/Trip | Yelp Calls | OSM Calls | Google Calls | Est. Cost |
|-------------|-------------|------------|-----------|--------------|-----------|
| Tokyo 3-day | ~24 | ~10 | ~14 | 0 | $0 |
| Paris 5-day | ~40 | ~15 | ~25 | 0 | $0 |
| NYC 7-day | ~56 | ~25 | ~31 | 0 | $0 |

**Note**: With caching, repeat trips to the same destination cost $0!
