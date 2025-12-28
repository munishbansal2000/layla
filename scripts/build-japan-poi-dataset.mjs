#!/usr/bin/env node

/**
 * Japan POI Dataset Builder
 *
 * Comprehensive script to download, process, and combine open-source datasets
 * for Japan cities to use in place-resolver testing.
 *
 * Data Sources:
 * 1. OpenStreetMap (via Overpass API) - Coordinates, names, categories
 * 2. Wikidata (via SPARQL) - Descriptions, Wikipedia links, images
 * 3. Wikimedia Commons - High-quality photos for landmarks
 *
 * Usage:
 *   node scripts/build-japan-poi-dataset.mjs
 *   node scripts/build-japan-poi-dataset.mjs --city tokyo
 *   node scripts/build-japan-poi-dataset.mjs --city tokyo,kyoto,osaka
 *
 * Output:
 *   data/japan-pois/tokyo.json
 *   data/japan-pois/kyoto.json
 *   data/japan-pois/osaka.json
 *   data/japan-pois/index.json (combined lookup)
 */

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(
    import.meta.url);
const __dirname = path.dirname(__filename);

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
    outputDir: "./data/japan-pois",
    cacheDir: "./data/japan-pois/.cache",

    // Rate limiting
    overpassDelay: 1000, // 1 second between Overpass requests
    wikidataDelay: 500, // 0.5 second between Wikidata requests
    wikimediaDelay: 200, // 0.2 second between Wikimedia requests

    // API endpoints
    overpassUrl: "https://overpass-api.de/api/interpreter",
    wikidataUrl: "https://query.wikidata.org/sparql",
    wikimediaUrl: "https://commons.wikimedia.org/w/api.php",

    // Cities to process
    cities: {
        tokyo: {
            name: "Tokyo",
            nameJa: "東京",
            wikidataId: "Q1490",
            bbox: [139.5, 35.5, 139.95, 35.85], // [minLon, minLat, maxLon, maxLat]
        },
        kyoto: {
            name: "Kyoto",
            nameJa: "京都",
            wikidataId: "Q34600",
            bbox: [135.65, 34.9, 135.85, 35.1],
        },
        osaka: {
            name: "Osaka",
            nameJa: "大阪",
            wikidataId: "Q35765",
            bbox: [135.4, 34.6, 135.6, 34.75],
        },
        nara: {
            name: "Nara",
            nameJa: "奈良",
            wikidataId: "Q169134",
            bbox: [135.75, 34.65, 135.9, 34.75],
        },
        hiroshima: {
            name: "Hiroshima",
            nameJa: "広島",
            wikidataId: "Q34664",
            bbox: [132.35, 34.35, 132.55, 34.45],
        },
        hakone: {
            name: "Hakone",
            nameJa: "箱根",
            wikidataId: "Q273448",
            bbox: [138.95, 35.15, 139.15, 35.3],
        },
    },
};

// OSM category mappings
const OSM_CATEGORY_MAP = {
    // Tourism
    "tourism=attraction": { category: "landmark" },
    "tourism=museum": { category: "museum" },
    "tourism=gallery": { category: "museum", subcategory: "gallery" },
    "tourism=viewpoint": { category: "landmark", subcategory: "viewpoint" },
    "tourism=artwork": { category: "landmark", subcategory: "artwork" },
    "tourism=theme_park": { category: "activity", subcategory: "theme_park" },
    "tourism=zoo": { category: "activity", subcategory: "zoo" },
    "tourism=aquarium": { category: "activity", subcategory: "aquarium" },

    // Historic
    "historic=castle": { category: "landmark", subcategory: "castle" },
    "historic=monument": { category: "landmark", subcategory: "monument" },
    "historic=memorial": { category: "landmark", subcategory: "memorial" },
    "historic=ruins": { category: "landmark", subcategory: "ruins" },

    // Leisure
    "leisure=park": { category: "park" },
    "leisure=garden": { category: "park", subcategory: "garden" },
    "leisure=nature_reserve": { category: "park", subcategory: "nature" },

    // Amenity - Food
    "amenity=restaurant": { category: "restaurant" },
    "amenity=cafe": { category: "cafe" },
    "amenity=bar": { category: "bar" },
    "amenity=pub": { category: "bar" },
    "amenity=fast_food": { category: "restaurant", subcategory: "fast_food" },
    "amenity=food_court": { category: "restaurant", subcategory: "food_court" },

    // Shopping
    "shop=mall": { category: "shopping", subcategory: "mall" },
    "shop=department_store": { category: "shopping", subcategory: "department_store" },
    "shop=supermarket": { category: "shopping", subcategory: "supermarket" },
    "shop=marketplace": { category: "shopping", subcategory: "market" },
};

// Category-specific Unsplash photo URLs (fallback)
const CATEGORY_PHOTOS = {
    temple: [
        "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?w=800&h=600&fit=crop",
    ],
    shrine: [
        "https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1528360983277-13d401cdc186?w=800&h=600&fit=crop",
    ],
    museum: [
        "https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1566127444979-b3d2b654e3d7?w=800&h=600&fit=crop",
    ],
    park: [
        "https://images.unsplash.com/photo-1519331379826-f10be5486c6f?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=800&h=600&fit=crop",
    ],
    landmark: [
        "https://images.unsplash.com/photo-1480796927426-f609979314bd?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&h=600&fit=crop",
    ],
    restaurant: [
        "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1552566626-52f8b828add9?w=800&h=600&fit=crop",
    ],
    cafe: [
        "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&h=600&fit=crop",
    ],
    bar: [
        "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800&h=600&fit=crop",
    ],
    shopping: [
        "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1481437156560-3205f6a55735?w=800&h=600&fit=crop",
    ],
    activity: [
        "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=800&h=600&fit=crop",
    ],
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

async function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function ensureDir(dir) {
    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir, { recursive: true });
    }
}

async function loadCache(key) {
    try {
        const cachePath = path.join(CONFIG.cacheDir, `${key}.json`);
        const content = await fs.readFile(cachePath, "utf-8");
        const entry = JSON.parse(content);
        // Cache valid for 7 days
        const age = Date.now() - new Date(entry.timestamp).getTime();
        if (age < 7 * 24 * 60 * 60 * 1000) {
            return entry.data;
        }
    } catch {
        // Cache miss
    }
    return null;
}

async function saveCache(key, data, source) {
    await ensureDir(CONFIG.cacheDir);
    const cachePath = path.join(CONFIG.cacheDir, `${key}.json`);
    const entry = {
        data,
        timestamp: new Date().toISOString(),
        source,
    };
    await fs.writeFile(cachePath, JSON.stringify(entry, null, 2));
}

function generateRating(name, category) {
    // Deterministic rating based on name hash
    const hash = name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);

    const categoryRanges = {
        temple: { min: 4.2, max: 4.9, reviews: [100, 2000] },
        shrine: { min: 4.0, max: 4.8, reviews: [80, 1500] },
        museum: { min: 4.0, max: 4.7, reviews: [200, 3000] },
        park: { min: 4.1, max: 4.6, reviews: [100, 800] },
        landmark: { min: 4.0, max: 4.8, reviews: [150, 2500] },
        restaurant: { min: 3.8, max: 4.8, reviews: [50, 500] },
        cafe: { min: 4.0, max: 4.6, reviews: [30, 300] },
        bar: { min: 3.9, max: 4.5, reviews: [40, 400] },
        shopping: { min: 3.8, max: 4.5, reviews: [100, 1000] },
        activity: { min: 4.2, max: 4.8, reviews: [50, 500] },
        default: { min: 4.0, max: 4.6, reviews: [50, 500] },
    };

    const range = categoryRanges[category] || categoryRanges.default;
    const rating = Number((range.min + (hash % 10) / 10 * (range.max - range.min)).toFixed(1));
    const reviewCount = Math.floor(range.reviews[0] + (hash % 100) / 100 * (range.reviews[1] - range.reviews[0]));

    return { rating, reviewCount };
}

function mapOSMCategory(tags) {
    // Try compound keys first (e.g., "amenity=place_of_worship|religion=shinto")
    if (tags.amenity === "place_of_worship") {
        if (tags.religion === "shinto") return { category: "shrine" };
        if (tags.religion === "buddhist") return { category: "temple" };
        return { category: "temple" }; // Default for places of worship
    }

    // Try single key mappings
    for (const [key, value] of Object.entries(tags)) {
        const mapping = OSM_CATEGORY_MAP[`${key}=${value}`];
        if (mapping) return mapping;
    }

    return null;
}

// ============================================
// OVERPASS API (OpenStreetMap)
// ============================================

async function fetchWithRetry(url, options, maxRetries = 3) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            const response = await fetch(url, options);
            if (response.ok) return response;
            if (response.status === 504 || response.status === 429) {
                console.log(`[Retry] Attempt ${attempt}/${maxRetries} failed (${response.status}), waiting...`);
                await sleep(5000 * attempt);
                continue;
            }
            return response;
        } catch (error) {
            if (attempt === maxRetries) throw error;
            console.log(`[Retry] Attempt ${attempt}/${maxRetries} failed, waiting...`);
            await sleep(5000 * attempt);
        }
    }
}

async function fetchOverpassData(cityKey) {
    const city = CONFIG.cities[cityKey];
    if (!city) throw new Error(`Unknown city: ${cityKey}`);

    const cacheKey = `overpass_${cityKey}`;
    const cached = await loadCache(cacheKey);
    if (cached) {
        console.log(`[Overpass] Cache hit for ${city.name}`);
        return cached;
    }

    console.log(`[Overpass] Fetching POIs for ${city.name}...`);

    const [minLon, minLat, maxLon, maxLat] = city.bbox;

    // Overpass QL query for tourist POIs
    const query = `
    [out:json][timeout:120];
    (
      // Tourism
      node["tourism"~"attraction|museum|gallery|viewpoint|artwork|theme_park|zoo|aquarium"](${minLat},${minLon},${maxLat},${maxLon});
      way["tourism"~"attraction|museum|gallery|viewpoint|artwork|theme_park|zoo|aquarium"](${minLat},${minLon},${maxLat},${maxLon});

      // Religion (temples, shrines)
      node["amenity"="place_of_worship"](${minLat},${minLon},${maxLat},${maxLon});
      way["amenity"="place_of_worship"](${minLat},${minLon},${maxLat},${maxLon});

      // Historic
      node["historic"~"castle|monument|memorial|ruins"](${minLat},${minLon},${maxLat},${maxLon});
      way["historic"~"castle|monument|memorial|ruins"](${minLat},${minLon},${maxLat},${maxLon});

      // Parks and gardens
      node["leisure"~"park|garden|nature_reserve"](${minLat},${minLon},${maxLat},${maxLon});
      way["leisure"~"park|garden|nature_reserve"](${minLat},${minLon},${maxLat},${maxLon});

      // Popular restaurants (only those with names and cuisine tags)
      node["amenity"~"restaurant|cafe|bar"]["name"]["cuisine"](${minLat},${minLon},${maxLat},${maxLon});

      // Major shopping
      node["shop"~"mall|department_store"]["name"](${minLat},${minLon},${maxLat},${maxLon});
      way["shop"~"mall|department_store"]["name"](${minLat},${minLon},${maxLat},${maxLon});
    );
    out center tags;
  `;

    const response = await fetchWithRetry(CONFIG.overpassUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: `data=${encodeURIComponent(query)}`,
    });

    if (!response || !response.ok) {
        throw new Error(`Overpass API error: ${response?.status || 'No response'} ${response?.statusText || ''}`);
    }

    const data = await response.json();
    console.log(`[Overpass] Received ${data.elements?.length || 0} elements for ${city.name}`);

    const pois = [];

    for (const element of data.elements || []) {
        const tags = element.tags || {};

        // Skip if no name
        if (!tags.name && !tags["name:en"] && !tags["name:ja"]) continue;

        // Get category
        const categoryInfo = mapOSMCategory(tags);
        if (!categoryInfo) continue;

        // Get coordinates (center for ways)
        const lat = element.lat || (element.center && element.center.lat);
        const lng = element.lon || (element.center && element.center.lon);
        if (!lat || !lng) continue;

        const name = tags["name:en"] || tags.name || tags["name:ja"];
        const { rating, reviewCount } = generateRating(name, categoryInfo.category);

        const poi = {
            id: `osm:${element.type}/${element.id}`,
            name,
            nameJa: tags["name:ja"] || tags.name,
            nameEn: tags["name:en"],
            coordinates: { lat, lng },
            address: [tags["addr:full"], tags["addr:street"], tags["addr:housenumber"]]
                .filter(Boolean).join(" ") || undefined,
            neighborhood: tags["addr:suburb"] || tags["addr:neighbourhood"] || tags["addr:district"],
            city: city.name,
            country: "Japan",
            category: categoryInfo.category,
            subcategory: categoryInfo.subcategory,
            website: tags.website || tags.url,
            phone: tags.phone || tags["contact:phone"],
            openingHours: tags.opening_hours,
            photos: CATEGORY_PHOTOS[categoryInfo.category] || CATEGORY_PHOTOS.landmark,
            rating,
            reviewCount,
            sources: ["osm"],
            osmTags: tags,
            lastUpdated: new Date().toISOString(),
        };

        pois.push(poi);
    }

    console.log(`[Overpass] Processed ${pois.length} POIs for ${city.name}`);

    await saveCache(cacheKey, pois, "overpass");
    await sleep(CONFIG.overpassDelay);

    return pois;
}

// ============================================
// WIKIDATA API
// ============================================

async function fetchWikidataEnrichment(cityKey, pois) {
    const city = CONFIG.cities[cityKey];
    if (!city) return pois;

    const cacheKey = `wikidata_${cityKey}`;
    const cached = await loadCache(cacheKey);
    if (cached) {
        console.log(`[Wikidata] Cache hit for ${city.name}`);
        return mergeWikidataIntoPOIs(pois, cached);
    }

    console.log(`[Wikidata] Fetching enrichment data for ${city.name}...`);

    // SPARQL query for notable places in the city
    const query = `
    SELECT ?place ?placeLabel ?placeDescription ?coord ?image ?article ?website WHERE {
      ?place wdt:P131* wd:${city.wikidataId};
             wdt:P625 ?coord.

      # Filter for notable place types
      VALUES ?type {
        wd:Q16970      # Buddhist temple
        wd:Q845945     # Shinto shrine
        wd:Q33506      # Museum
        wd:Q22698      # Park
        wd:Q839954     # Archaeological site
        wd:Q570116     # Tourist attraction
        wd:Q2065736    # Cultural property
        wd:Q12323      # Castle
        wd:Q4989906    # Monument
      }
      ?place wdt:P31 ?type.

      OPTIONAL { ?place wdt:P18 ?image. }
      OPTIONAL { ?place wdt:P856 ?website. }
      OPTIONAL {
        ?article schema:about ?place;
                 schema:isPartOf <https://en.wikipedia.org/>.
      }

      SERVICE wikibase:label { bd:serviceParam wikibase:language "en,ja". }
    }
    LIMIT 500
  `;

    const url = `${CONFIG.wikidataUrl}?query=${encodeURIComponent(query)}&format=json`;

    const response = await fetch(url, {
        headers: {
            "User-Agent": "JapanPOIBuilder/1.0 (layla-clone testing)",
            "Accept": "application/json",
        },
    });

    if (!response.ok) {
        console.warn(`[Wikidata] API error: ${response.status}`);
        return pois;
    }

    const data = await response.json();
    const bindings = (data.results && data.results.bindings) || [];
    console.log(`[Wikidata] Received ${bindings.length} items for ${city.name}`);

    const wikidataMap = {};

    for (const binding of bindings) {
        const wikidataId = binding.place && binding.place.value && binding.place.value.split("/").pop();
        if (!wikidataId) continue;

        // Parse coordinates from "Point(lng lat)" format
        let coords;
        if (binding.coord && binding.coord.value) {
            const match = binding.coord.value.match(/Point\(([-\d.]+) ([-\d.]+)\)/);
            if (match) {
                coords = { lng: parseFloat(match[1]), lat: parseFloat(match[2]) };
            }
        }

        wikidataMap[wikidataId] = {
            wikidataId,
            name: binding.placeLabel && binding.placeLabel.value,
            description: binding.placeDescription && binding.placeDescription.value,
            coordinates: coords,
            image: binding.image && binding.image.value,
            wikipediaUrl: binding.article && binding.article.value,
            website: binding.website && binding.website.value,
        };
    }

    await saveCache(cacheKey, wikidataMap, "wikidata");
    await sleep(CONFIG.wikidataDelay);

    return mergeWikidataIntoPOIs(pois, wikidataMap);
}

function mergeWikidataIntoPOIs(pois, wikidataMap) {
    // Try to match POIs with Wikidata items by name/coordinates
    for (const poi of pois) {
        // Check if OSM has wikidata tag
        const wikidataId = poi.osmTags && poi.osmTags.wikidata;
        if (wikidataId && wikidataMap[wikidataId]) {
            const wd = wikidataMap[wikidataId];
            if (wd.description) poi.description = wd.description;
            if (wd.image) poi.photos = [wd.image, ...poi.photos];
            if (wd.wikipediaUrl) poi.wikipediaUrl = wd.wikipediaUrl;
            if (wd.website && !poi.website) poi.website = wd.website;
            poi.wikidataId = wikidataId;
            poi.sources.push("wikidata");
        } else {
            // Try fuzzy matching by name and proximity
            for (const [wdId, wd] of Object.entries(wikidataMap)) {
                if (!wd.coordinates || !wd.name) continue;

                // Check if names are similar
                const nameSimilar =
                    poi.name.toLowerCase().includes(wd.name.toLowerCase()) ||
                    wd.name.toLowerCase().includes(poi.name.toLowerCase());

                if (!nameSimilar) continue;

                // Check if coordinates are close (within ~100m)
                const latDiff = Math.abs(poi.coordinates.lat - wd.coordinates.lat);
                const lngDiff = Math.abs(poi.coordinates.lng - wd.coordinates.lng);
                const closeEnough = latDiff < 0.001 && lngDiff < 0.001;

                if (closeEnough) {
                    if (wd.description) poi.description = wd.description;
                    if (wd.image) poi.photos = [wd.image, ...poi.photos];
                    if (wd.wikipediaUrl) poi.wikipediaUrl = wd.wikipediaUrl;
                    if (wd.website && !poi.website) poi.website = wd.website;
                    poi.wikidataId = wdId;
                    poi.sources.push("wikidata");
                    break;
                }
            }
        }
    }

    return pois;
}

// ============================================
// WIKIMEDIA COMMONS API (Additional Photos)
// ============================================

async function fetchWikimediaPhotos(pois) {
    console.log(`[Wikimedia] Enriching photos for ${pois.length} POIs...`);

    let enriched = 0;

    for (const poi of pois) {
        // Skip if already has good photos from Wikidata
        if (poi.photos.length > 0 && poi.photos[0].includes("wikimedia")) continue;

        // Skip if no Wikipedia URL
        if (!poi.wikipediaUrl) continue;

        try {
            const cacheKey = `wikimedia_${poi.id.replace(/[/:]/g, "_")}`;
            const cached = await loadCache(cacheKey);

            if (cached) {
                poi.photos = [...cached, ...poi.photos];
                enriched++;
                continue;
            }

            // Extract page title from Wikipedia URL
            const pageTitle = poi.wikipediaUrl.split("/wiki/").pop();
            if (!pageTitle) continue;

            // Fetch images from Wikipedia page
            const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${pageTitle}&prop=images&imlimit=5&format=json&origin=*`;

            const response = await fetch(url, {
                headers: { "User-Agent": "JapanPOIBuilder/1.0" },
            });

            if (!response.ok) continue;

            const data = await response.json();
            const pages = (data.query && data.query.pages) || {};
            const page = Object.values(pages)[0];

            if (!page || !page.images) continue;

            // Get actual image URLs
            const imageUrls = [];
            for (const img of page.images.slice(0, 3)) {
                // Skip icons, logos, etc.
                if (img.title.match(/icon|logo|flag|map|commons-logo|symbol/i)) continue;

                // Get image info
                const infoUrl = `https://commons.wikimedia.org/w/api.php?action=query&titles=${encodeURIComponent(img.title)}&prop=imageinfo&iiprop=url&iiurlwidth=800&format=json&origin=*`;

                const infoResponse = await fetch(infoUrl, {
                    headers: { "User-Agent": "JapanPOIBuilder/1.0" },
                });

                if (!infoResponse.ok) continue;

                const infoData = await infoResponse.json();
                const infoPages = (infoData.query && infoData.query.pages) || {};
                const infoPage = Object.values(infoPages)[0];

                if (infoPage && infoPage.imageinfo && infoPage.imageinfo[0] && infoPage.imageinfo[0].thumburl) {
                    imageUrls.push(infoPage.imageinfo[0].thumburl);
                }

                await sleep(CONFIG.wikimediaDelay);
            }

            if (imageUrls.length > 0) {
                await saveCache(cacheKey, imageUrls, "wikimedia");
                poi.photos = [...imageUrls, ...poi.photos];
                enriched++;
            }

        } catch (error) {
            // Ignore errors, keep existing photos
        }
    }

    console.log(`[Wikimedia] Enriched ${enriched} POIs with photos`);
    return pois;
}

// ============================================
// DATA PROCESSING & OUTPUT
// ============================================

function deduplicatePOIs(pois) {
    const seen = new Map();

    for (const poi of pois) {
        // Create a key based on name + approximate location
        const latKey = Math.round(poi.coordinates.lat * 1000);
        const lngKey = Math.round(poi.coordinates.lng * 1000);
        const key = `${poi.name.toLowerCase()}_${latKey}_${lngKey}`;

        const existing = seen.get(key);
        if (!existing) {
            seen.set(key, poi);
        } else {
            // Merge: prefer entry with more data
            if (poi.description && !existing.description) existing.description = poi.description;
            if (poi.photos.length > existing.photos.length) existing.photos = poi.photos;
            if (poi.wikipediaUrl && !existing.wikipediaUrl) existing.wikipediaUrl = poi.wikipediaUrl;
            existing.sources = [...new Set([...existing.sources, ...poi.sources])];
        }
    }

    return Array.from(seen.values());
}

function categorizePOIs(pois) {
    const counts = {};
    for (const poi of pois) {
        counts[poi.category] = (counts[poi.category] || 0) + 1;
    }
    return counts;
}

function normalizeNameForIndex(name) {
    return name
        .toLowerCase()
        .replace(/['']/g, "'")
        .replace(/[""]/g, '"')
        .replace(/\s+/g, " ")
        .trim();
}

function buildCityIndex(pois) {
    const index = {
        byName: {},
        byNameNormalized: {},
        byCategory: {},
        byNeighborhood: {},
        bySubcategory: {},
    };

    for (let i = 0; i < pois.length; i++) {
        const poi = pois[i];

        // Index by exact name
        if (poi.name) {
            index.byName[poi.name] = i;
        }

        // Index by normalized name (for fuzzy matching)
        if (poi.name) {
            const normalized = normalizeNameForIndex(poi.name);
            index.byNameNormalized[normalized] = i;

            // Also add Japanese name if different
            if (poi.nameJa && poi.nameJa !== poi.name) {
                index.byNameNormalized[normalizeNameForIndex(poi.nameJa)] = i;
            }

            // Add English name variant if exists
            if (poi.nameEn && poi.nameEn !== poi.name) {
                index.byNameNormalized[normalizeNameForIndex(poi.nameEn)] = i;
            }
        }

        // Index by category
        if (poi.category) {
            if (!index.byCategory[poi.category]) {
                index.byCategory[poi.category] = [];
            }
            index.byCategory[poi.category].push(i);
        }

        // Index by subcategory
        if (poi.subcategory) {
            const key = `${poi.category}:${poi.subcategory}`;
            if (!index.bySubcategory[key]) {
                index.bySubcategory[key] = [];
            }
            index.bySubcategory[key].push(i);
        }

        // Index by neighborhood
        if (poi.neighborhood) {
            const neighborhood = poi.neighborhood.toLowerCase();
            if (!index.byNeighborhood[neighborhood]) {
                index.byNeighborhood[neighborhood] = [];
            }
            index.byNeighborhood[neighborhood].push(i);
        }
    }

    return index;
}

async function saveCityData(cityKey, pois) {
    const city = CONFIG.cities[cityKey];
    if (!city) return;

    await ensureDir(CONFIG.outputDir);

    const cityData = {
        city: city.name,
        cityJa: city.nameJa,
        country: "Japan",
        totalPOIs: pois.length,
        categories: categorizePOIs(pois),
        lastUpdated: new Date().toISOString(),
        pois,
    };

    // Save full POI data
    const outputPath = path.join(CONFIG.outputDir, `${cityKey}.json`);
    await fs.writeFile(outputPath, JSON.stringify(cityData, null, 2));
    console.log(`[Output] Saved ${pois.length} POIs to ${outputPath}`);

    // Build and save city-specific index
    const cityIndex = buildCityIndex(pois);
    cityIndex.city = city.name;
    cityIndex.cityKey = cityKey;
    cityIndex.totalPOIs = pois.length;
    cityIndex.lastUpdated = new Date().toISOString();

    const indexPath = path.join(CONFIG.outputDir, `${cityKey}.index.json`);
    await fs.writeFile(indexPath, JSON.stringify(cityIndex, null, 2));

    const nameCount = Object.keys(cityIndex.byNameNormalized).length;
    const categoryCount = Object.keys(cityIndex.byCategory).length;
    const neighborhoodCount = Object.keys(cityIndex.byNeighborhood).length;
    console.log(`[Output] Built index: ${nameCount} names, ${categoryCount} categories, ${neighborhoodCount} neighborhoods`);
}

async function buildIndex(cities) {
    const index = {};

    for (const cityKey of cities) {
        const city = CONFIG.cities[cityKey];
        if (!city) continue;

        try {
            const filePath = path.join(CONFIG.outputDir, `${cityKey}.json`);
            const content = await fs.readFile(filePath, "utf-8");
            const data = JSON.parse(content);

            index[cityKey] = {
                file: `${cityKey}.json`,
                count: data.totalPOIs,
                categories: data.categories,
            };
        } catch {
            // City not processed yet
        }
    }

    const indexPath = path.join(CONFIG.outputDir, "index.json");
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
    console.log(`[Output] Built index for ${Object.keys(index).length} cities`);
}

// ============================================
// MAIN
// ============================================

async function processCity(cityKey) {
    const city = CONFIG.cities[cityKey];
    if (!city) {
        console.error(`Unknown city: ${cityKey}`);
        return;
    }

    console.log(`\n${"=".repeat(60)}`);
    console.log(`Processing: ${city.name} (${city.nameJa})`);
    console.log(`${"=".repeat(60)}\n`);

    // Step 1: Fetch OSM data
    let pois = await fetchOverpassData(cityKey);

    // Step 2: Enrich with Wikidata
    pois = await fetchWikidataEnrichment(cityKey, pois);

    // Step 3: Fetch additional photos from Wikimedia
    pois = await fetchWikimediaPhotos(pois);

    // Step 4: Deduplicate
    pois = deduplicatePOIs(pois);

    // Step 5: Save
    await saveCityData(cityKey, pois);

    // Summary
    const categories = categorizePOIs(pois);
    console.log(`\n[Summary] ${city.name}:`);
    console.log(`  Total POIs: ${pois.length}`);
    console.log(`  Categories:`);
    for (const [cat, count] of Object.entries(categories).sort((a, b) => b[1] - a[1])) {
        console.log(`    ${cat}: ${count}`);
    }
}

async function main() {
    console.log("=".repeat(60));
    console.log("Japan POI Dataset Builder");
    console.log("=".repeat(60));

    // Parse command line args
    const args = process.argv.slice(2);
    let citiesToProcess = [];

    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--city" && args[i + 1]) {
            citiesToProcess = args[i + 1].split(",").map(c => c.trim().toLowerCase());
            i++;
        }
    }

    // Default to all cities
    if (citiesToProcess.length === 0) {
        citiesToProcess = Object.keys(CONFIG.cities);
    }

    console.log(`\nCities to process: ${citiesToProcess.join(", ")}`);

    // Process each city
    for (const cityKey of citiesToProcess) {
        try {
            await processCity(cityKey);
        } catch (error) {
            console.error(`Error processing ${cityKey}:`, error);
        }
    }

    // Build index
    await buildIndex(citiesToProcess);

    console.log("\n" + "=".repeat(60));
    console.log("Done! Dataset built successfully.");
    console.log("=".repeat(60));
}

// Run
main().catch(console.error);