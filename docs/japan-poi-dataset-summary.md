# Japan POI Dataset Generation - Complete Summary

**Date:** December 28, 2025
**Project:** Layla Clone - Japan Trip Planner

---

## Overview

Built a comprehensive Japan POI (Points of Interest) dataset from scratch using multiple data sources, with city-specific indexes, enhancement features, and paid activity integration for 6 Japanese cities.

---

## Data Sources Used

| Source | Purpose | Data Extracted |
|--------|---------|----------------|
| **OpenStreetMap (Overpass API)** | Primary POI data | Names, coordinates, categories, addresses |
| **Wikidata (SPARQL)** | Enrichment | Descriptions, Wikipedia links, images |
| **Wikimedia Commons** | Photos | Image URLs for POIs |
| **Klook (HTML scraping)** | Paid activities | Tours, tickets, experiences with pricing |

---

## Scripts Created

### 1. `/scripts/build-japan-poi-dataset.mjs`

**Purpose:** Downloads and processes POI data from OpenStreetMap, Wikidata, Wikimedia Commons

**Features:**
- Queries Overpass API for temples, shrines, museums, landmarks, parks, restaurants
- Enriches with Wikidata descriptions and Wikipedia links
- Adds Wikimedia Commons photos
- Retry logic for API timeouts (3 retries with exponential backoff)
- Builds city-specific indexes for O(1) lookups

**City-Specific Index Structure:**
```javascript
{
  byName: {},           // "Senso-ji" → POI
  byNameNormalized: {}, // "sensoji" → POI
  byCategory: {},       // "temple" → [POIs]
  byNeighborhood: {},   // "Asakusa" → [POIs]
  bySubcategory: {},    // "buddhist_temple" → [POIs]
}
```

**Usage:**
```bash
node scripts/build-japan-poi-dataset.mjs
node scripts/build-japan-poi-dataset.mjs --city tokyo
```

---

### 2. `/scripts/enhance-japan-poi-dataset.mjs`

**Purpose:** Enhances POI data with must-see rankings, clusters, nearby POIs, travel times

**Features:**
- **Must-See Generation:** Ranks POIs by score (rating + reviews + category bonus + famous place bonus)
- **Famous Places Boost:** +2.0 score for known landmarks (Senso-ji, Kinkaku-ji, etc.)
- **Geographic Clustering:** 800m radius groupings for day planning
- **Nearby POI Enrichment:** Finds attractions/restaurants within 500m
- **Travel Time Matrix:** Pre-computed walk/transit times between must-see POIs
- **Klook Integration:** Matches paid activities to POIs
- **Text Normalization:** Handles special characters (ō→o) for matching

**Must-See Score Formula:**
```
score = rating + log10(reviewCount)/4 + categoryBonus + famousPlaceBonus
```

**Usage:**
```bash
node scripts/enhance-japan-poi-dataset.mjs
node scripts/enhance-japan-poi-dataset.mjs --city tokyo,kyoto
```

---

### 3. `/scripts/parse-klook-html.mjs`

**Purpose:** Extracts paid activities from saved Klook HTML pages

**Features:**
- Parses JSON-LD structured data (name, rating, description, image, price)
- Extracts additional activities from HTML card patterns
- Supports individual files or batch processing

**Usage:**
```bash
node scripts/parse-klook-html.mjs "data/klook/tokyo.html" data/klook/tokyo-activities.json tokyo
node scripts/parse-klook-html.mjs --all
```

---

### 4. `/src/lib/local-poi-provider.ts`

**Purpose:** Provides O(1) lookups for local POI data with fuzzy matching

**Exports:**
```typescript
hasLocalData(city: string): Promise<boolean>
findByName(name: string, city: string): Promise<LocalPOI | null>
findByFuzzyName(name: string, city: string, options?): Promise<LocalPOI[]>
findByCategory(city: string, category: string, options?): Promise<LocalPOI[]>
findNearby(city: string, lat: number, lng: number, options?): Promise<LocalPOI[]>
```

---

## Data Generated

### Raw POI Data: `/data/japan-pois/`

| City | POIs | File |
|------|------|------|
| **Tokyo** | 27,942 | `tokyo.json`, `tokyo.index.json` |
| **Kyoto** | 5,877 | `kyoto.json`, `kyoto.index.json` |
| **Osaka** | 7,557 | `osaka.json`, `osaka.index.json` |
| **Nara** | 971 | `nara.json`, `nara.index.json` |
| **Hiroshima** | 1,202 | `hiroshima.json`, `hiroshima.index.json` |
| **Hakone** | 394 | `hakone.json`, `hakone.index.json` |
| **TOTAL** | **43,943** | `index.json` |

### Enhanced Data: `/data/japan-pois-enhanced/`

| City | Must-See | Clusters | Klook Activities |
|------|----------|----------|------------------|
| **Tokyo** | 20 | 959 | 180 |
| **Kyoto** | 20 | 206 | 202 |
| **Osaka** | 20 | 211 | 214 |
| **Nara** | 20 | 71 | 87 |
| **Hiroshima** | 20 | 80 | 95 |
| **Hakone** | 20 | 49 | 0 |

### Klook Activities: `/data/klook/`

| City | Activities | Top Activity |
|------|------------|--------------|
| **Tokyo** | 180 | Tokyo Disney Resort ($50.59, 5M+ booked) |
| **Kyoto** | 202 | Kyoto & Nara Day Trip ($46.09, 80K+ booked) |
| **Osaka** | 214 | Osaka Amazing Pass ($22.85, 4.7★) |
| **Nara** | 87 | Nara Day Tour ($45.45, 4.6★) |
| **Hiroshima** | 95 | Peace Memorial Museum ($1.30, 4.8★) |
| **TOTAL** | **778** | |

---

## Enhanced Data Schema

```json
{
  "city": "Tokyo",
  "cityJa": "東京",
  "lastEnhanced": "2025-12-28T...",

  "stats": {
    "totalPOIs": 27942,
    "mustSeeCount": 20,
    "clusterCount": 959,
    "attractionCount": 14137,
    "restaurantCount": 8234,
    "paidExperienceCount": 282
  },

  "mustSee": {
    "overall": [
      {
        "id": "osm_123",
        "rank": 1,
        "name": "Sensō-ji",
        "nameJa": "浅草寺",
        "category": "temple",
        "mustSeeScore": 7.87,
        "coordinates": { "lat": 35.7147, "lng": 139.7966 },
        "nearbyAttractions": [...],
        "nearbyRestaurants": [...],
        "paidExperiences": [...]
      }
    ],
    "byCategory": {
      "temple": [...],
      "shrine": [...],
      "museum": [...]
    }
  },

  "clusters": [
    {
      "id": "cluster_1",
      "name": "Asakusa",
      "anchorPOI": "Sensō-ji",
      "centroid": { "lat": 35.71, "lng": 139.79 },
      "pois": ["osm_123", "osm_456", ...],
      "nearbyRestaurantCount": 202,
      "estimatedDuration": 180
    }
  ],

  "travelMatrix": {
    "osm_123": {
      "osm_456": { "distance": 1200, "walkTime": 15, "transitTime": 8 }
    }
  },

  "paidExperiences": {
    "provider": "klook",
    "count": 180,
    "experiences": [
      {
        "id": "klook-70672",
        "name": "SHIBUYA SKY Ticket",
        "category": "observation_deck",
        "rating": 4.7,
        "bookingCount": 2000000,
        "price": { "amount": 18.35, "currency": "USD" },
        "url": "https://www.klook.com/activity/70672-..."
      }
    ]
  }
}
```

---

## Key Algorithms

### 1. Famous Places Boost

Curated list of famous landmarks per city that get +2.0 score boost:

```javascript
famousPlaces: {
  tokyo: ["sensō-ji", "meiji shrine", "tokyo skytree", "imperial palace", ...],
  kyoto: ["kinkaku-ji", "fushimi inari", "kiyomizu-dera", "arashiyama", ...],
  osaka: ["osaka castle", "dotonbori", "universal studios", ...],
  nara: ["todai-ji", "nara park", "kasuga taisha", ...],
  hiroshima: ["peace memorial", "atomic bomb dome", "miyajima", ...],
  hakone: ["lake ashi", "hakone shrine", "owakudani", ...]
}
```

### 2. Text Normalization

Handles Japanese romanization variants:

```javascript
function normalizeText(text) {
  return text
    .toLowerCase()
    .normalize("NFD")                    // Unicode decomposition
    .replace(/[\u0300-\u036f]/g, "")    // Remove diacritics
    .replace(/ō/g, "o")                  // Macron o → o
    .replace(/ū/g, "u")                  // Macron u → u
    .replace(/[-\s]+/g, "")             // Remove hyphens/spaces
}

// "Sensō-ji" → "sensoji"
// "Kinkaku-ji" → "kinkakuji"
```

### 3. Haversine Distance

Calculate distance between two coordinates:

```javascript
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  // ... spherical geometry calculation
  return R * c; // Distance in meters
}
```

### 4. Travel Time Estimation

```javascript
walkingSpeedKmh: 4.5  // Average walking speed
transitMultiplier: 0.4  // Transit is faster than walking

walkTime = distance / (4.5 * 1000 / 60)  // minutes
transitTime = max(5, walkTime * 0.4 + 3)  // +3 for wait time
```

---

## Matching Accuracy

### POI to Klook Activity Matching Results:

| City | POIs with Matches | Percentage |
|------|-------------------|------------|
| Tokyo | 13/20 | 65% |
| Kyoto | 10/20 | 50% |
| Osaka | 7/20 | 35% |
| Nara | 11/20 | 55% |
| Hiroshima | 15/20 | 75% |
| **Overall** | **56/100** | **56%** |

### Example Matches:

| POI | Klook Matches |
|-----|---------------|
| Sensō-ji | 1 (Audio Guide) |
| Hiroshima Castle | 70 |
| Osaka Castle Museum | 146 |
| Naramachi Museum | 65 |
| Gion Quarter | 14 |

---

## Integration Points

### 1. Place Resolver (`/src/lib/place-resolver.ts`)

Updated to use local POI data in test mode:

```typescript
import { hasLocalData, findByName, findByFuzzyName } from "./local-poi-provider";

// In test mode: Try local POI data first, then fall back to mock
if (isTestMode()) {
  const localPOI = await findByName(place.name, place.city);
  if (localPOI) {
    return { ...localPOI, confidence: 0.9 };
  }
}
```

### 2. Test Mode Benefits

- **Zero API calls** in test mode (saves money)
- **Real OSM data** instead of mock data
- **0.9 confidence** for local matches
- **0.7 confidence** fallback for mock data

---

## Future Improvements

1. **Increase famous place bonus** from +2.0 to +3.0 for better separation
2. **Add Google Places enrichment** for real ratings/reviews
3. **Exclude city names** from keyword matching (reduce false positives)
4. **Add TripAdvisor data** for better must-see ranking
5. **Save Hakone Klook page** to complete the dataset

---

## File Structure

```
data/
├── japan-pois/
│   ├── index.json              # Global index
│   ├── tokyo.json              # 27,942 POIs
│   ├── tokyo.index.json        # O(1) lookup indexes
│   ├── kyoto.json              # 5,877 POIs
│   ├── kyoto.index.json
│   ├── osaka.json              # 7,557 POIs
│   ├── osaka.index.json
│   ├── nara.json               # 971 POIs
│   ├── nara.index.json
│   ├── hiroshima.json          # 1,202 POIs
│   ├── hiroshima.index.json
│   ├── hakone.json             # 394 POIs
│   └── hakone.index.json
│
├── japan-pois-enhanced/
│   ├── index.json              # Enhanced index
│   ├── tokyo.enhanced.json     # 20 must-see, 959 clusters
│   ├── kyoto.enhanced.json     # 20 must-see, 206 clusters
│   ├── osaka.enhanced.json     # 20 must-see, 211 clusters
│   ├── nara.enhanced.json      # 20 must-see, 71 clusters
│   ├── hiroshima.enhanced.json # 20 must-see, 80 clusters
│   └── hakone.enhanced.json    # 20 must-see, 49 clusters
│
└── klook/
    ├── tokyo-activities.json   # 180 activities
    ├── kyoto-activities.json   # 202 activities
    ├── osaka-activities.json   # 214 activities
    ├── nara-activities.json    # 87 activities
    ├── hiroshima-activities.json # 95 activities
    └── *.html                  # Source HTML files

scripts/
├── build-japan-poi-dataset.mjs    # OSM/Wikidata fetcher
├── enhance-japan-poi-dataset.mjs  # Enhancement & Klook integration
└── parse-klook-html.mjs           # Klook HTML parser

src/lib/
└── local-poi-provider.ts          # O(1) POI lookup API
```

---

## Commands Reference

```bash
# Build raw POI data from OSM
node scripts/build-japan-poi-dataset.mjs

# Enhance with must-see, clusters, Klook
node scripts/enhance-japan-poi-dataset.mjs

# Parse Klook HTML files
node scripts/parse-klook-html.mjs --all

# Build specific city
node scripts/build-japan-poi-dataset.mjs --city tokyo
node scripts/enhance-japan-poi-dataset.mjs --city tokyo
```
