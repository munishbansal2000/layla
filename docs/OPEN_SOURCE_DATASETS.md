# Open Source Datasets for Place Resolution

## Goal
Find open-source datasets that can **fully replace** our API calls during testing for Japan cities.

---

## What We Need to Replace

| API | Data Needed | Current Use |
|-----|-------------|-------------|
| **Yelp** | name, coords, rating, reviews, photos, price | Restaurants |
| **OSM/Nominatim** | name, coords, address | Attractions |
| **Google Places** | name, coords, rating, photos, hours | Fallback |
| **Foursquare** | name, coords, rating, photos | Venues |
| **Viator** | name, description, rating, photos, price | Tours |

---

## Available Open Source Datasets

### 1. 🗺️ OpenStreetMap Exports (HOTOSM / Geofabrik)

**Source**:
- https://data.humdata.org/dataset/hotosm_jpn_points_of_interest
- https://download.geofabrik.de/asia/japan.html

**Format**: GeoJSON, Shapefile, PBF

**Data Available**:
| Field | Available | Quality |
|-------|-----------|---------|
| Name (EN/JA) | ✅ | Good |
| Coordinates | ✅ | Excellent |
| Address | ⚠️ | Partial |
| Category (OSM tags) | ✅ | Good |
| Opening Hours | ⚠️ | ~30% coverage |
| Website | ⚠️ | ~20% coverage |
| Phone | ⚠️ | ~20% coverage |
| Rating | ❌ | None |
| Photos | ❌ | None |

**Best For**: Temples, shrines, museums, parks, landmarks

**Japan Cities Available**: ALL (nationwide coverage)

---

### 2. ⭐ Yelp Open Dataset (Academic)

**Source**: https://www.yelp.com/dataset

**Format**: JSON

**Data Available**:
| Field | Available | Quality |
|-------|-----------|---------|
| Name | ✅ | Excellent |
| Coordinates | ✅ | Excellent |
| Address | ✅ | Excellent |
| Category | ✅ | Excellent |
| Rating | ✅ | Excellent |
| Review Count | ✅ | Excellent |
| Price Level | ✅ | Good |
| Hours | ✅ | Good |
| Photos | ❌ | Not included |

**Limitation**: Only covers select US/Canada cities, **NOT Japan** ❌

**Alternative**: Use for US city testing only

---

### 3. 🌐 Wikidata + Wikipedia

**Source**:
- https://www.wikidata.org/
- SPARQL endpoint: https://query.wikidata.org/

**Format**: JSON (via SPARQL queries)

**Data Available**:
| Field | Available | Quality |
|-------|-----------|---------|
| Name (multi-language) | ✅ | Excellent |
| Coordinates | ✅ | Good |
| Description | ✅ | Good |
| Wikipedia link | ✅ | Excellent |
| Image (Wikimedia) | ✅ | Good for landmarks |
| Category | ✅ | Via Wikidata properties |
| Official website | ⚠️ | Sometimes |
| Rating | ❌ | None |

**Best For**: Famous landmarks, museums, temples (notable places)

**Japan Coverage**: Major attractions well covered

**Example SPARQL Query**:
```sparql
SELECT ?place ?placeLabel ?coord ?image WHERE {
  ?place wdt:P131* wd:Q1490;  # Located in Tokyo
         wdt:P31 wd:Q16970;    # Instance of temple
         wdt:P625 ?coord.      # Has coordinates
  OPTIONAL { ?place wdt:P18 ?image. }
  SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ja". }
}
```

---

### 4. 📸 Wikimedia Commons (Photos)

**Source**: https://commons.wikimedia.org/

**Format**: API / JSON

**Data Available**:
- Free-to-use photos of landmarks
- Geotagged images
- Categories for places

**Best For**: Landmark/attraction photos

**Example**: Senso-ji Temple has 1000+ free photos

---

### 5. 🗾 Japan Government Open Data

**Source**: https://www.data.go.jp/

**Datasets**:
- Cultural properties database (temples, shrines, historic sites)
- National parks
- Museums and galleries
- Tourist information

**Format**: CSV, JSON

**Data Available**:
| Field | Available |
|-------|-----------|
| Name (JA/EN) | ✅ |
| Coordinates | ✅ |
| Address | ✅ |
| Description | ✅ |
| Category | ✅ |
| Photos | ❌ |
| Rating | ❌ |

---

### 6. 🍜 Tabelog Data (Scraped/Cached)

**Note**: Not open source, but widely scraped

Tabelog is Japan's #1 restaurant rating site (like Yelp for Japan).

**If we can find cached/scraped data**:
| Field | Available |
|-------|-----------|
| Name | ✅ |
| Coordinates | ✅ |
| Rating (out of 5) | ✅ |
| Price Range | ✅ |
| Cuisine | ✅ |
| Photos | ✅ |

**Legal**: Gray area - for testing only, not production

---

### 7. 🌍 GeoNames

**Source**: https://www.geonames.org/export/

**Format**: TSV, dump files

**Data Available**:
| Field | Available |
|-------|-----------|
| Name (multi-lang) | ✅ |
| Coordinates | ✅ |
| Feature class | ✅ |
| Population | ✅ |
| Elevation | ✅ |
| Admin divisions | ✅ |

**Best For**: Geographic features, city/district names

**Japan Coverage**: Complete

---

### 8. 🎌 Japan Tourism Board Data

**Source**: https://www.jnto.go.jp/

**May have**: Official tourist spot databases

---

## Recommended Dataset Combination

To fully replace APIs for Japan testing:

```
┌─────────────────────────────────────────────────────────────────┐
│                    Combined Test Dataset                         │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   OpenStreetMap │     │    Wikidata     │     │    Wikimedia    │
│   (HOTOSM)      │     │                 │     │    Commons      │
│                 │     │                 │     │                 │
│ • Coordinates   │     │ • Descriptions  │     │ • Photos        │
│ • Names         │  +  │ • Wikipedia URL │  +  │ • Geotagged     │
│ • Categories    │     │ • Notable places│     │ • Free license  │
│ • Hours         │     │ • Some images   │     │                 │
│ • ALL places    │     │ • Curated       │     │                 │
└─────────────────┘     └─────────────────┘     └─────────────────┘
         │                       │                       │
         └───────────────────────┴───────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │    Mock Ratings Layer   │
                    │                         │
                    │ • Generate from name    │
                    │ • Category-based ranges │
                    │ • Consistent per place  │
                    └─────────────────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   Local Test Database   │
                    │                         │
                    │   japan_places.json     │
                    │   • Tokyo: ~5000 POIs   │
                    │   • Kyoto: ~3000 POIs   │
                    │   • Osaka: ~2000 POIs   │
                    └─────────────────────────┘
```

---

## Cities to Prepare

| City | Priority | Est. POIs | Notes |
|------|----------|-----------|-------|
| **Tokyo** | P0 | 5,000+ | Most itineraries |
| **Kyoto** | P0 | 3,000+ | Temples, culture |
| **Osaka** | P1 | 2,000+ | Food, nightlife |
| **Nara** | P1 | 500+ | Temples, deer park |
| **Hiroshima** | P2 | 800+ | Peace memorial |
| **Hakone** | P2 | 300+ | Onsen, Mt. Fuji views |

---

## Data Schema for Combined Dataset

```typescript
interface TestPlace {
  // Identity
  id: string;                    // "osm:way/12345" or "wikidata:Q12345"
  name: string;                  // "Senso-ji Temple"
  nameJa?: string;               // "浅草寺"
  nameEn?: string;               // "Senso-ji Temple"

  // Location
  coordinates: {
    lat: number;                 // 35.7148
    lng: number;                 // 139.7967
  };
  address?: string;              // "2-3-1 Asakusa, Taito City, Tokyo"
  neighborhood?: string;         // "Asakusa"
  city: string;                  // "Tokyo"

  // Classification
  category: string;              // "temple" | "restaurant" | "park" | etc.
  subcategory?: string;          // "buddhist" | "ramen" | etc.
  osmTags?: Record<string, string>;

  // Details
  description?: string;          // From Wikidata/Wikipedia
  website?: string;
  phone?: string;
  openingHours?: string;         // OSM format: "Mo-Su 06:00-17:00"

  // Media (from Wikimedia Commons)
  photos?: string[];             // ["https://commons.wikimedia.org/..."]
  wikipediaUrl?: string;         // "https://en.wikipedia.org/wiki/Sensō-ji"

  // Mock data (generated)
  rating?: number;               // 4.5 (generated from name hash)
  reviewCount?: number;          // 1234 (generated)
  priceLevel?: number;           // 1-4

  // Metadata
  sources: string[];             // ["osm", "wikidata", "wikimedia"]
  lastUpdated: string;           // ISO date
}
```

---

## Download Scripts Needed

1. **OSM Extractor**: Download Japan POIs from Geofabrik/HOTOSM
2. **Wikidata Enricher**: Query notable places, get descriptions + images
3. **Wikimedia Photos**: Fetch Creative Commons photos by place
4. **Combiner**: Merge datasets, deduplicate, add mock ratings
5. **City Splitter**: Split into per-city JSON files

---

## Gaps Remaining

| Gap | Workaround |
|-----|------------|
| **Restaurant ratings** | Generate mock ratings OR use Tabelog scrape |
| **Restaurant photos** | Use Unsplash food photos by cuisine |
| **Real-time hours** | Use OSM opening_hours field |
| **Price levels** | Infer from category or generate mock |
| **Tour/Activity data** | Wikidata + manual curation |

---

## Next Steps

1. [ ] Download HOTOSM Japan POI data
2. [ ] Write Wikidata SPARQL queries for major attractions
3. [ ] Fetch Wikimedia Commons photos for landmarks
4. [ ] Create combiner script
5. [ ] Generate test datasets for Tokyo, Kyoto, Osaka
6. [ ] Integrate as new "local" provider in place-resolver
