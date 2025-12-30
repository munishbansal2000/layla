#!/usr/bin/env node

/**
 * Japan POI Dataset Enhancer
 *
 * Enhances the existing POI data with:
 * 1. Must-see attractions per city (ranked by rating + reviews)
 * 2. Clusters of nearby attractions (for day planning)
 * 3. Nearby attractions for must-see POIs (within 500m)
 * 4. Nearby restaurants for must-see POIs (within 500m)
 * 5. Travel time matrix between must-see POIs
 * 6. Klook experiences matching
 * 7. NEW: Wikidata admission fee data
 *
 * Usage:
 *   node scripts/enhance-japan-poi-dataset.mjs
 *   node scripts/enhance-japan-poi-dataset.mjs --city tokyo
 *   node scripts/enhance-japan-poi-dataset.mjs --city tokyo --skip-wikidata
 */

import { promises as fs } from "fs";
import path from "path";

// ============================================
// WIKIDATA SPARQL CONFIGURATION
// ============================================

const WIKIDATA_ENDPOINT = "https://query.wikidata.org/sparql";
const WIKIDATA_USER_AGENT = "JapanPOIEnhancer/1.0 (layla-clone project)";

// Rate limiting for Wikidata queries
const WIKIDATA_DELAY_MS = 2000; // 2 seconds between queries to be nice

// ============================================
// TICKET REQUIREMENT TYPES
// ============================================

const TICKET_REQUIRED_CATEGORIES = [
    "museum",
    "aquarium",
    "zoo",
    "theme_park",
    "observation_deck",
    "tower",
    "castle_museum",
    "amusement_park",
];

const FREE_ENTRY_CATEGORIES = [
    "park",
    "nature",
    "landmark",
    "street",
    "neighborhood",
    "beach",
];

const TICKET_OPTIONAL_CATEGORIES = [
    "temple",
    "shrine",
    "castle_grounds",
    "market",
    "shopping",
];

// Known ticket requirements for famous places (manual curation)
const KNOWN_TICKET_REQUIREMENTS = {
    // Required tickets - with booking advice
    "tokyo skytree": {
        requirement: "required",
        fee: "2100-3100 JPY",
        bookingAdvice: {
            advanceBookingRequired: true,
            recommendedBookingDays: 1,
            walkUpAvailable: true,
            peakTimes: ["weekends", "holidays", "sunset hours"],
            tips: "Book online to skip ticket counter queues"
        }
    },
    "tokyo tower": {
        requirement: "required",
        fee: "1200 JPY",
        bookingAdvice: {
            advanceBookingRequired: false,
            walkUpAvailable: true,
            peakTimes: ["weekends", "sunset hours"],
            tips: "Walk-up tickets available, short waits except weekends"
        }
    },
    "teamlab borderless": {
        requirement: "required",
        fee: "3800 JPY",
        bookingAdvice: {
            advanceBookingRequired: true,
            recommendedBookingDays: 14,
            walkUpAvailable: false,
            peakTimes: ["weekends", "holidays", "school breaks"],
            tips: "MUST book in advance - sells out weeks ahead. No walk-up tickets."
        }
    },
    "teamlab planets": {
        requirement: "required",
        fee: "3800 JPY",
        bookingAdvice: {
            advanceBookingRequired: true,
            recommendedBookingDays: 7,
            walkUpAvailable: false,
            peakTimes: ["weekends", "holidays"],
            tips: "Book at least 1 week ahead. Timed entry slots."
        }
    },
    "shibuya sky": {
        requirement: "required",
        fee: "2200 JPY",
        bookingAdvice: {
            advanceBookingRequired: true,
            recommendedBookingDays: 3,
            walkUpAvailable: true,
            peakTimes: ["sunset hours", "weekends", "clear weather days"],
            tips: "Book sunset slots 3+ days ahead. Walk-up available for non-peak times."
        }
    },
    "tokyo disneyland": {
        requirement: "required",
        fee: "7900-10900 JPY",
        bookingAdvice: {
            advanceBookingRequired: true,
            recommendedBookingDays: 30,
            walkUpAvailable: false,
            peakTimes: ["weekends", "holidays", "school breaks", "special events"],
            tips: "Book 1+ month ahead. Sells out on weekends/holidays."
        }
    },
    "tokyo disneysea": {
        requirement: "required",
        fee: "7900-10900 JPY",
        bookingAdvice: {
            advanceBookingRequired: true,
            recommendedBookingDays: 30,
            walkUpAvailable: false,
            peakTimes: ["weekends", "holidays", "school breaks"],
            tips: "Book 1+ month ahead. More popular than Disneyland."
        }
    },
    "universal studios japan": {
        requirement: "required",
        fee: "8600+ JPY",
        bookingAdvice: {
            advanceBookingRequired: true,
            recommendedBookingDays: 14,
            walkUpAvailable: true,
            peakTimes: ["weekends", "holidays", "school breaks"],
            tips: "Book 2+ weeks ahead for weekends. Express Pass recommended."
        }
    },
    "ghibli museum": {
        requirement: "required",
        fee: "1000 JPY",
        bookingAdvice: {
            advanceBookingRequired: true,
            recommendedBookingDays: 30,
            walkUpAvailable: false,
            peakTimes: ["always busy"],
            tips: "MUST book 1 month ahead via Lawson. No walk-up. Very limited tickets."
        }
    },
    "legoland": { requirement: "required", fee: "5800 JPY" },
    "edo-tokyo museum": { requirement: "required", fee: "600 JPY" },
    "mori art museum": { requirement: "required", fee: "1800 JPY" },
    "kinkaku-ji": {
        requirement: "required",
        fee: "500 JPY",
        bookingAdvice: {
            advanceBookingRequired: false,
            walkUpAvailable: true,
            peakTimes: ["morning", "autumn foliage", "weekends"],
            tips: "Arrive early morning (8:30am opening) to avoid crowds"
        }
    },
    "ginkaku-ji": { requirement: "required", fee: "500 JPY" },
    "ryoan-ji": { requirement: "required", fee: "600 JPY" },
    "kiyomizu-dera": {
        requirement: "required",
        fee: "400 JPY",
        bookingAdvice: {
            advanceBookingRequired: false,
            walkUpAvailable: true,
            peakTimes: ["morning", "autumn foliage", "cherry blossom"],
            tips: "Opens 6am - go early to beat crowds"
        }
    },
    "todai-ji": {
        requirement: "required",
        fee: "600 JPY",
        bookingAdvice: {
            advanceBookingRequired: false,
            walkUpAvailable: true,
            peakTimes: ["mid-morning", "weekends"],
            tips: "Arrive early. Deer feeding is free in the surrounding park."
        }
    },
    "nijo castle": { requirement: "required", fee: "1300 JPY" },
    "hiroshima castle": { requirement: "required", fee: "370 JPY" },
    "osaka castle": { requirement: "required", fee: "600 JPY" },
    "peace memorial museum": {
        requirement: "required",
        fee: "200 JPY",
        bookingAdvice: {
            advanceBookingRequired: false,
            walkUpAvailable: true,
            peakTimes: ["August", "weekends"],
            tips: "Allow 2+ hours. Very moving experience."
        }
    },
    "shinjuku gyoen": { requirement: "required", fee: "500 JPY" },
    "hamarikyu gardens": { requirement: "required", fee: "300 JPY" },
    "hakone open air museum": { requirement: "required", fee: "1600 JPY" },
    "pola museum": { requirement: "required", fee: "1800 JPY" },
    "owakudani": { requirement: "required", fee: "Ropeway fee varies" },
    "narita-san": { requirement: "optional", fee: "Free (gardens extra)" },

    // Optional enhancements
    "senso-ji": { requirement: "optional", fee: "Free" },
    "sensoji": { requirement: "optional", fee: "Free" },
    "meiji shrine": { requirement: "optional", fee: "Free" },
    "fushimi inari": {
        requirement: "optional",
        fee: "Free",
        bookingAdvice: {
            advanceBookingRequired: false,
            walkUpAvailable: true,
            peakTimes: ["mid-morning to afternoon"],
            tips: "Go at sunrise or after 5pm for fewer crowds. Full hike takes 2-3 hours."
        }
    },
    "arashiyama bamboo": {
        requirement: "optional",
        fee: "Free",
        bookingAdvice: {
            advanceBookingRequired: false,
            walkUpAvailable: true,
            peakTimes: ["10am-4pm"],
            tips: "Arrive before 8am for empty photos. Combine with Tenryu-ji temple."
        }
    },
    "nara park": { requirement: "optional", fee: "Free" },
    "imperial palace": {
        requirement: "optional",
        fee: "Free (tour required)",
        bookingAdvice: {
            advanceBookingRequired: true,
            recommendedBookingDays: 7,
            walkUpAvailable: true,
            tips: "Inner grounds require free tour reservation. East Gardens are open access."
        }
    },
    "tsukiji market": { requirement: "optional", fee: "Free" },
    "dotonbori": { requirement: "optional", fee: "Free" },
    "gion": { requirement: "optional", fee: "Free" },

    // Free entry
    "yoyogi park": { requirement: "free", fee: "Free" },
    "ueno park": { requirement: "free", fee: "Free" },
    "shibuya crossing": { requirement: "free", fee: "Free" },
    "takeshita street": { requirement: "free", fee: "Free" },
    "akihabara": { requirement: "free", fee: "Free" },
    "ginza": { requirement: "free", fee: "Free" },
    "peace memorial park": { requirement: "free", fee: "Free" },
    "atomic bomb dome": { requirement: "free", fee: "Free" },
};

// ============================================
// WIKIDATA ADMISSION FEE QUERY
// ============================================

/**
 * Query Wikidata for admission fee information for places in a city
 * Uses SPARQL to find:
 * - P2555: admission fee
 * - P5023: visitor fee
 * - P2130: cost
 * Also gets P31 (instance of) to help classify places
 */
async function queryWikidataAdmissionFees(cityName, cityCoords) {
    const lat = cityCoords ?.lat || 35.6762;
    const lng = cityCoords ?.lng || 139.6503;
    const radius = 30; // km radius around city center

    // SPARQL query to find tourist attractions with admission fees
    const query = `
SELECT DISTINCT ?place ?placeLabel ?placeJaLabel ?lat ?lng ?feeAmount ?feeCurrency ?typeLabel ?image ?website ?description WHERE {
  # Find places near the city coordinates
  SERVICE wikibase:around {
    ?place wdt:P625 ?location .
    bd:serviceParam wikibase:center "Point(${lng} ${lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${radius}" .
  }

  # Get coordinates
  ?place wdt:P625 ?location .
  BIND(geof:latitude(?location) AS ?lat)
  BIND(geof:longitude(?location) AS ?lng)

  # Must be a tourist attraction, museum, temple, shrine, or similar
  ?place wdt:P31 ?type .
  VALUES ?type {
    wd:Q33506    # museum
    wd:Q207694   # art museum
    wd:Q16970    # temple
    wd:Q845945   # Buddhist temple
    wd:Q9141     # shrine
    wd:Q2977    # castle
    wd:Q18674739 # observation tower
    wd:Q12570    # tower
    wd:Q41176    # building
    wd:Q35112127 # sky tower
    wd:Q22698    # park
    wd:Q847017   # garden
    wd:Q1244442  # national park
    wd:Q570116   # tourist attraction
    wd:Q473972   # theme park
    wd:Q1195942  # amusement park
    wd:Q178706   # zoo
    wd:Q45782    # aquarium
    wd:Q23413    # palace
  }

  # Try to get admission fee (P2555)
  OPTIONAL {
    ?place p:P2555 ?feeStatement .
    ?feeStatement ps:P2555 ?feeAmount .
    OPTIONAL { ?feeStatement pq:P3005 ?feeCurrency . }
  }

  # Also try cost (P2130)
  OPTIONAL {
    ?place wdt:P2130 ?cost .
  }

  # Optional: image
  OPTIONAL { ?place wdt:P18 ?image . }

  # Optional: official website
  OPTIONAL { ?place wdt:P856 ?website . }

  # Get labels
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en,ja" .
    ?place rdfs:label ?placeLabel .
    ?type rdfs:label ?typeLabel .
  }

  # Japanese label
  OPTIONAL {
    ?place rdfs:label ?placeJaLabel .
    FILTER(LANG(?placeJaLabel) = "ja")
  }

  # English description
  OPTIONAL {
    ?place schema:description ?description .
    FILTER(LANG(?description) = "en")
  }
}
ORDER BY DESC(?feeAmount)
LIMIT 200
`;

    try {
        console.log(`[Wikidata] Querying admission fees for ${cityName}...`);

        const response = await fetch(WIKIDATA_ENDPOINT, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "Accept": "application/sparql-results+json",
                "User-Agent": WIKIDATA_USER_AGENT,
            },
            body: `query=${encodeURIComponent(query)}`,
        });

        if (!response.ok) {
            console.warn(`[Wikidata] Query failed: ${response.status} ${response.statusText}`);
            return [];
        }

        const data = await response.json();
        const results = data.results ?.bindings || [];

        console.log(`[Wikidata] Found ${results.length} places with admission info`);

        // Parse results
        const places = results.map(r => ({
            wikidataId: r.place ?.value ?.replace("http://www.wikidata.org/entity/", ""),
            name: r.placeLabel ?.value,
            nameJa: r.placeJaLabel ?.value,
            lat: parseFloat(r.lat ?.value),
            lng: parseFloat(r.lng ?.value),
            admissionFee: r.feeAmount ?.value ? parseFloat(r.feeAmount.value) : null,
            feeCurrency: r.feeCurrency ?.value ?.replace("http://www.wikidata.org/entity/", "") || "JPY",
            type: r.typeLabel ?.value,
            image: r.image ?.value,
            website: r.website ?.value,
            description: r.description ?.value,
        }));

        return places;
    } catch (error) {
        console.warn(`[Wikidata] Query error: ${error.message}`);
        return [];
    }
}

/**
 * Simple helper to delay execution
 */
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Determine ticket requirement from various sources
 */
function determineTicketRequirement(poi, wikidataInfo, klookExperiences) {
    const nameLower = normalizeText(poi.name);
    const nameJaLower = normalizeText(poi.nameJa);

    // 1. Check curated known places first (most reliable)
    for (const [place, info] of Object.entries(KNOWN_TICKET_REQUIREMENTS)) {
        const placeNorm = normalizeText(place);
        if (nameLower.includes(placeNorm) || placeNorm.includes(nameLower) ||
            (nameJaLower && (nameJaLower.includes(placeNorm) || placeNorm.includes(nameJaLower)))) {
            return {
                requirement: info.requirement,
                fee: info.fee,
                source: "curated",
                confidence: 1.0,
                bookingAdvice: info.bookingAdvice || null,
            };
        }
    }

    // 2. Check Wikidata admission fee data
    if (wikidataInfo) {
        if (wikidataInfo.admissionFee !== null && wikidataInfo.admissionFee > 0) {
            return {
                requirement: "required",
                fee: `${wikidataInfo.admissionFee} ${wikidataInfo.feeCurrency || "JPY"}`,
                source: "wikidata",
                wikidataId: wikidataInfo.wikidataId,
                confidence: 0.9,
            };
        }
        // Wikidata says it's free (fee = 0)
        if (wikidataInfo.admissionFee === 0) {
            return {
                requirement: "free",
                fee: "Free",
                source: "wikidata",
                wikidataId: wikidataInfo.wikidataId,
                confidence: 0.9,
            };
        }
    }

    // 3. Check OSM fee tag (from original POI data)
    // OSM has fee tag: "yes", "no", "donation", or specific amounts
    const osmFee = poi.osmTags ?.fee;
    if (osmFee) {
        const feeLower = osmFee.toLowerCase();
        if (feeLower === "yes") {
            return {
                requirement: "required",
                fee: "Admission fee required",
                source: "osm",
                confidence: 0.85,
            };
        }
        if (feeLower === "no") {
            return {
                requirement: "free",
                fee: "Free",
                source: "osm",
                confidence: 0.85,
            };
        }
        if (feeLower === "donation" || feeLower === "optional") {
            return {
                requirement: "optional",
                fee: "Donation suggested",
                source: "osm",
                confidence: 0.85,
            };
        }
        // Specific amount like "500 JPY" or "¥300"
        if (/\d/.test(osmFee)) {
            return {
                requirement: "required",
                fee: osmFee,
                source: "osm",
                confidence: 0.85,
            };
        }
    }

    // 4. Infer from Klook experiences
    if (klookExperiences && klookExperiences.length > 0) {
        const hasTicketExp = klookExperiences.some(e => {
            const nameLower = (e.name || "").toLowerCase();
            return nameLower.includes("ticket") ||
                nameLower.includes("admission") ||
                nameLower.includes("entry") ||
                nameLower.includes("pass");
        });

        if (hasTicketExp) {
            const ticketExp = klookExperiences.find(e => {
                const n = (e.name || "").toLowerCase();
                return n.includes("ticket") || n.includes("admission");
            });

            return {
                requirement: "required",
                fee: ticketExp ?.price ?.display || "Varies",
                source: "klook",
                confidence: 0.7,
            };
        }

        // Has experiences but none are tickets - optional enhancement
        return {
            requirement: "optional",
            fee: "Free (tours available)",
            source: "klook-inferred",
            confidence: 0.6,
        };
    }

    // 4. Infer from category
    const category = (poi.category || "").toLowerCase();
    const subcategory = (poi.subcategory || "").toLowerCase();

    if (TICKET_REQUIRED_CATEGORIES.some(c => category.includes(c) || subcategory.includes(c))) {
        return {
            requirement: "required",
            fee: "Varies",
            source: "category",
            confidence: 0.5,
        };
    }

    if (FREE_ENTRY_CATEGORIES.some(c => category.includes(c) || subcategory.includes(c))) {
        return {
            requirement: "free",
            fee: "Free",
            source: "category",
            confidence: 0.5,
        };
    }

    if (TICKET_OPTIONAL_CATEGORIES.some(c => category.includes(c) || subcategory.includes(c))) {
        return {
            requirement: "optional",
            fee: "Usually free",
            source: "category",
            confidence: 0.4,
        };
    }

    // 5. Default to optional (unknown)
    return {
        requirement: "optional",
        fee: "Unknown",
        source: "default",
        confidence: 0.2,
    };
}

/**
 * Match Wikidata places to must-see POIs by coordinates and name
 */
function matchWikidataToPOIs(mustSeePois, wikidataPlaces) {
    const matches = new Map();

    for (const poi of mustSeePois) {
        const poiNameNorm = normalizeText(poi.name);
        const poiNameJaNorm = normalizeText(poi.nameJa);

        // Find best matching Wikidata entry
        let bestMatch = null;
        let bestScore = 0;

        for (const wdPlace of wikidataPlaces) {
            let score = 0;

            // Distance check (within 500m)
            const distance = haversineDistance(
                poi.coordinates.lat,
                poi.coordinates.lng,
                wdPlace.lat,
                wdPlace.lng
            );

            if (distance > 500) continue; // Too far

            // Distance score (closer = better)
            score += Math.max(0, 1 - distance / 500);

            // Name matching
            const wdNameNorm = normalizeText(wdPlace.name);
            const wdNameJaNorm = normalizeText(wdPlace.nameJa);

            // Exact match
            if (poiNameNorm === wdNameNorm || poiNameJaNorm === wdNameJaNorm) {
                score += 3;
            }
            // Substring match
            else if (poiNameNorm.includes(wdNameNorm) || wdNameNorm.includes(poiNameNorm)) {
                score += 2;
            }
            // Japanese name match
            else if (poiNameJaNorm && wdNameJaNorm &&
                (poiNameJaNorm.includes(wdNameJaNorm) || wdNameJaNorm.includes(poiNameJaNorm))) {
                score += 2;
            }
            // Partial word match
            else {
                const poiWords = poiNameNorm.split(/\s+/).filter(w => w.length >= 3);
                const wdWords = wdNameNorm.split(/\s+/).filter(w => w.length >= 3);
                const matchingWords = poiWords.filter(w => wdWords.some(wd => wd.includes(w) || w.includes(wd)));
                if (matchingWords.length > 0) {
                    score += matchingWords.length * 0.5;
                }
            }

            if (score > bestScore) {
                bestScore = score;
                bestMatch = wdPlace;
            }
        }

        if (bestMatch && bestScore >= 1) {
            matches.set(poi.id, bestMatch);
        }
    }

    return matches;
}

// ============================================
// CONFIGURATION
// ============================================

const CONFIG = {
    inputDir: "./data/japan-pois",
    outputDir: "./data/japan-pois-enhanced",

    // Nearby search radius in meters
    nearbyRadius: 500,

    // Cluster radius in meters
    clusterRadius: 800,

    // Max nearby items per category
    maxNearbyAttractions: 10,
    maxNearbyRestaurants: 5,

    // Must-see counts
    mustSeeOverall: 20,
    mustSeePerCategory: {
        temple: 5,
        shrine: 3,
        museum: 3,
        landmark: 5,
        park: 3,
        activity: 2,
    },

    // Categories considered as attractions
    attractionCategories: ["temple", "shrine", "museum", "landmark", "park", "activity"],

    // Categories considered as food
    foodCategories: ["restaurant", "cafe", "bar"],

    // Average walking speed in km/h
    walkingSpeedKmh: 4.5,

    // Transit multiplier (transit is typically faster than walking)
    transitMultiplier: 0.4,

    // Famous landmarks that should always rank high (manual curation)
    // Include various spellings, special characters, and partial matches
    famousPlaces: {
        tokyo: [
            "sensō-ji", "senso-ji", "sensoji", "浅草寺", "asakusa temple", "asakusa kannon",
            "meiji shrine", "meiji jingu", "明治神宮",
            "tokyo skytree", "skytree", "東京スカイツリー",
            "tokyo tower", "東京タワー",
            "imperial palace", "皇居", "kokyo",
            "shibuya crossing", "shibuya scramble", "渋谷スクランブル",
            "tsukiji", "築地",
            "ueno park", "上野公園", "ueno zoo",
            "shinjuku gyoen", "新宿御苑",
            "harajuku", "原宿", "takeshita",
            "akihabara", "秋葉原",
            "ginza", "銀座",
            "teamlab", "team lab",
            "roppongi hills", "六本木ヒルズ",
            "odaiba", "お台場",
            "nakamise", "仲見世",
            "asakusa shrine", "浅草神社",
            "zojo-ji", "zojoji", "増上寺",
            "nezu shrine", "根津神社",
        ],
        kyoto: [
            "kinkaku-ji", "kinkakuji", "金閣寺", "golden pavilion",
            "fushimi inari", "伏見稲荷", "fushimi inari taisha", "thousand torii",
            "kiyomizu-dera", "kiyomizudera", "清水寺", "kiyomizu temple",
            "arashiyama", "嵐山", "bamboo grove", "bamboo forest",
            "ginkaku-ji", "ginkakuji", "銀閣寺", "silver pavilion",
            "nijo castle", "nijojo", "二条城",
            "ryoan-ji", "ryoanji", "龍安寺",
            "tenryu-ji", "tenryuji", "天龍寺",
            "gion", "祇園",
            "philosopher's path", "philosopher", "哲学の道",
            "nishiki market", "nishiki", "錦市場",
            "toji", "to-ji", "東寺",
            "heian shrine", "heian jingu", "平安神宮",
            "sanjusangendo", "三十三間堂",
            "nanzen-ji", "nanzenji", "南禅寺",
            "yasaka shrine", "八坂神社",
            "kodai-ji", "kodaiji", "高台寺",
            "kennin-ji", "kenninji", "建仁寺",
            "higashiyama", "東山",
            "kyoto tower", "京都タワー",
            "ninna-ji", "仁和寺",
        ],
        osaka: [
            "osaka castle", "大阪城", "osakajo",
            "dotonbori", "道頓堀",
            "shitennoji", "shitenno-ji", "四天王寺",
            "sumiyoshi taisha", "sumiyoshi shrine", "住吉大社",
            "shinsekai", "新世界", "tsutenkaku", "通天閣",
            "universal studios", "usj", "ユニバーサル",
            "kuromon market", "kuromon ichiba", "黒門市場",
            "umeda sky building", "umeda", "梅田スカイビル",
            "namba", "なんば", "難波",
            "abeno harukas", "あべのハルカス",
            "tennoji", "天王寺",
            "osaka aquarium", "kaiyukan", "海遊館",
            "cup noodles museum", "カップヌードルミュージアム",
        ],
        nara: [
            "todai-ji", "todaiji", "東大寺", "great buddha", "daibutsu",
            "nara park", "奈良公園", "deer park",
            "kasuga taisha", "kasuga shrine", "春日大社",
            "kofuku-ji", "kofukuji", "興福寺",
            "isuien garden", "isuien", "依水園",
            "naramachi", "奈良町",
            "horyu-ji", "horyuji", "法隆寺",
            "yoshikien", "吉城園",
            "nara deer", "鹿",
        ],
        hiroshima: [
            "peace memorial", "peace park", "原爆ドーム", "atomic bomb dome", "a-bomb dome", "genbaku",
            "hiroshima castle", "広島城",
            "itsukushima", "厳島神社", "miyajima", "宮島",
            "shukkeien", "縮景園",
            "peace museum", "平和記念資料館",
            "hiroshima station", "広島駅",
            "shukkei-en", "shukkeien garden",
            "orizuru tower", "おりづるタワー",
        ],
        hakone: [
            "lake ashi", "芦ノ湖", "ashinoko",
            "hakone shrine", "箱根神社",
            "open air museum", "彫刻の森美術館", "hakone open-air",
            "owakudani", "大涌谷",
            "hakone ropeway", "箱根ロープウェイ",
            "pola museum", "ポーラ美術館",
            "hakone yumoto", "箱根湯本",
            "gora", "強羅",
            "hakone checkpoint", "hakone sekisho", "箱根関所",
            "hakone glass", "ガラスの森",
        ],
    },

    // Well-known neighborhoods for cluster naming
    neighborhoods: {
        tokyo: {
            "Asakusa": { lat: 35.7147, lng: 139.7967 },
            "Shibuya": { lat: 35.6580, lng: 139.7016 },
            "Shinjuku": { lat: 35.6896, lng: 139.6921 },
            "Ginza": { lat: 35.6717, lng: 139.7649 },
            "Ueno": { lat: 35.7141, lng: 139.7774 },
            "Akihabara": { lat: 35.7023, lng: 139.7745 },
            "Harajuku": { lat: 35.6702, lng: 139.7027 },
            "Roppongi": { lat: 35.6627, lng: 139.7318 },
            "Odaiba": { lat: 35.6299, lng: 139.7753 },
            "Ikebukuro": { lat: 35.7295, lng: 139.7109 },
        },
        kyoto: {
            "Gion": { lat: 35.0037, lng: 135.7756 },
            "Arashiyama": { lat: 35.0094, lng: 135.6722 },
            "Higashiyama": { lat: 35.0000, lng: 135.7800 },
            "Kinkaku-ji Area": { lat: 35.0394, lng: 135.7292 },
            "Fushimi": { lat: 34.9671, lng: 135.7727 },
            "Nijo": { lat: 35.0142, lng: 135.7481 },
            "Kyoto Station": { lat: 34.9858, lng: 135.7588 },
        },
        osaka: {
            "Dotonbori": { lat: 34.6687, lng: 135.5031 },
            "Umeda": { lat: 34.7055, lng: 135.4983 },
            "Namba": { lat: 34.6659, lng: 135.5013 },
            "Shinsekai": { lat: 34.6522, lng: 135.5062 },
            "Osaka Castle": { lat: 34.6873, lng: 135.5259 },
            "Tennoji": { lat: 34.6467, lng: 135.5135 },
        },
        nara: {
            "Nara Park": { lat: 34.6851, lng: 135.8430 },
            "Todai-ji Area": { lat: 34.6890, lng: 135.8398 },
            "Naramachi": { lat: 34.6780, lng: 135.8320 },
        },
        hiroshima: {
            "Peace Park": { lat: 34.3955, lng: 132.4536 },
            "Hiroshima Station": { lat: 34.3983, lng: 132.4756 },
            "Miyajima": { lat: 34.2961, lng: 132.3198 },
        },
        hakone: {
            "Hakone Yumoto": { lat: 35.2325, lng: 139.1069 },
            "Lake Ashi": { lat: 35.2041, lng: 139.0222 },
            "Gora": { lat: 35.2444, lng: 139.0647 },
        },
    },
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Normalize text for matching - removes diacritics and special characters
 * Examples: "Sensō-ji" → "sensoji", "Kinkaku-ji" → "kinkakuji"
 */
function normalizeText(text) {
    if (!text) return "";

    return text
        .toLowerCase()
        // Normalize Unicode characters (NFD splits accented chars into base + diacritic)
        .normalize("NFD")
        // Remove diacritical marks (accents, macrons, etc.)
        .replace(/[\u0300-\u036f]/g, "")
        // Common Japanese romanization substitutions
        .replace(/ō/g, "o")
        .replace(/ū/g, "u")
        .replace(/ā/g, "a")
        .replace(/ē/g, "e")
        .replace(/ī/g, "i")
        // Remove hyphens and spaces for matching
        .replace(/[-\s]+/g, "")
        // Remove common suffixes for looser matching
        .replace(/temple$/, "")
        .replace(/shrine$/, "")
        .replace(/museum$/, "")
        .replace(/park$/, "")
        .replace(/station$/, "")
        .trim();
}

/**
 * Normalize text but keep spaces (for word-based matching)
 */
function normalizeTextKeepSpaces(text) {
    if (!text) return "";

    return text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/ō/g, "o")
        .replace(/ū/g, "u")
        .replace(/ā/g, "a")
        .replace(/ē/g, "e")
        .replace(/ī/g, "i")
        .replace(/-/g, " ")
        .trim();
}

/**
 * Calculate haversine distance between two points in meters
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000; // Earth radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Calculate walking time in minutes
 */
function walkingTimeMinutes(distanceMeters) {
    const speedMpm = (CONFIG.walkingSpeedKmh * 1000) / 60; // meters per minute
    return Math.round(distanceMeters / speedMpm);
}

/**
 * Calculate transit time in minutes (estimate)
 */
function transitTimeMinutes(distanceMeters) {
    const walkTime = walkingTimeMinutes(distanceMeters);
    // Transit includes wait time + faster travel
    // For short distances, walking might be faster
    if (distanceMeters < 500) return walkTime;
    return Math.max(5, Math.round(walkTime * CONFIG.transitMultiplier + 3)); // +3 for wait time
}

/**
 * Check if POI name matches any famous place
 */
function isFamousPlace(poiName, cityKey) {
    const famousList = CONFIG.famousPlaces[cityKey] || [];
    const nameLower = (poiName || "").toLowerCase();

    for (const famous of famousList) {
        const famousLower = famous.toLowerCase();
        if (nameLower.includes(famousLower) || famousLower.includes(nameLower)) {
            return true;
        }
    }
    return false;
}

/**
 * Calculate must-see score (higher is better)
 */
function calculateMustSeeScore(poi, cityKey) {
    const rating = poi.rating || 4.0;
    const reviewCount = poi.reviewCount || 100;

    // Normalize review count (log scale)
    const reviewScore = Math.log10(reviewCount + 1) / 4; // Max ~1.0 for 10000 reviews

    // Category bonus
    const categoryBonus = {
        temple: 0.2,
        shrine: 0.15,
        landmark: 0.15,
        museum: 0.1,
        park: 0.05,
        activity: 0.0,
    };

    const bonus = categoryBonus[poi.category] || 0;

    // Has description bonus
    const descBonus = poi.description ? 0.1 : 0;

    // Has good photos bonus
    const photoBonus = (poi.photos && poi.photos.length > 1) ? 0.05 : 0;

    // MAJOR BONUS: Famous place recognition
    const famousBonus = isFamousPlace(poi.name, cityKey) ? 2.0 : 0;
    const famousJaBonus = isFamousPlace(poi.nameJa, cityKey) ? 2.0 : 0;
    const totalFamousBonus = Math.max(famousBonus, famousJaBonus);

    return rating + reviewScore + bonus + descBonus + photoBonus + totalFamousBonus;
}

/**
 * Find nearest well-known neighborhood
 */
function findNearestNeighborhood(lat, lng, cityKey) {
    const neighborhoods = CONFIG.neighborhoods[cityKey] || {};
    let nearest = null;
    let minDistance = Infinity;

    for (const [name, coords] of Object.entries(neighborhoods)) {
        const distance = haversineDistance(lat, lng, coords.lat, coords.lng);
        if (distance < minDistance) {
            minDistance = distance;
            nearest = { name, distance };
        }
    }

    return nearest;
}

async function ensureDir(dir) {
    try {
        await fs.access(dir);
    } catch {
        await fs.mkdir(dir, { recursive: true });
    }
}

// ============================================
// KLOOK ACTIVITIES LOADING
// ============================================

async function loadKlookActivities(cityKey) {
    try {
        // Try loading city-specific Klook activities
        const klookDir = "./data/klook";
        const possibleFiles = [
            `${cityKey}-activities.json`,
            `${cityKey}.json`,
            `Best Things to Do in ${cityKey.charAt(0).toUpperCase() + cityKey.slice(1)} 2025.json`,
        ];

        for (const filename of possibleFiles) {
            try {
                const filePath = path.join(klookDir, filename);
                const content = await fs.readFile(filePath, "utf-8");
                const data = JSON.parse(content);

                if (data.activities && data.activities.length > 0) {
                    console.log(`[Klook] Loaded ${data.activities.length} paid activities from ${filename}`);
                    return data.activities;
                }
            } catch {
                // File doesn't exist, try next
            }
        }

        // Try the generic tokyo file if city is tokyo
        if (cityKey === "tokyo") {
            try {
                const filePath = path.join(klookDir, "tokyo-activities.json");
                const content = await fs.readFile(filePath, "utf-8");
                const data = JSON.parse(content);

                if (data.activities && data.activities.length > 0) {
                    console.log(`[Klook] Loaded ${data.activities.length} paid activities from tokyo-activities.json`);
                    return data.activities;
                }
            } catch {
                // File doesn't exist
            }
        }

        console.log(`[Klook] No Klook activities found for ${cityKey}`);
        return [];
    } catch (error) {
        console.log(`[Klook] Error loading Klook activities: ${error.message}`);
        return [];
    }
}

/**
 * Match Klook activities to must-see POIs
 */
function matchKlookToMustSee(mustSeePois, klookActivities) {
    const matchedActivities = [];

    // Build keyword lookup for POIs with normalized names
    const poiKeywords = mustSeePois.map(poi => {
        const keywords = [];
        const name = (poi.name || "");
        const nameJa = (poi.nameJa || "");

        // Add normalized versions
        const nameNorm = normalizeText(name);
        const nameJaNorm = normalizeText(nameJa);
        const nameKeepSpaces = normalizeTextKeepSpaces(name);

        if (nameNorm) keywords.push(nameNorm);
        if (nameJaNorm) keywords.push(nameJaNorm);

        // Add individual normalized words (min 4 chars)
        const words = nameKeepSpaces.split(/\s+/).filter(w => w.length >= 4);
        keywords.push(...words);

        return { poi, keywords, nameNorm };
    });

    for (const klook of klookActivities) {
        const klookName = klook.name || "";
        const klookNameNorm = normalizeText(klookName);
        const klookKeepSpaces = normalizeTextKeepSpaces(klookName);
        const klookWords = klookKeepSpaces.split(/\s+/).filter(w => w.length >= 4);

        for (const { poi, keywords, nameNorm }
            of poiKeywords) {
            let matched = false;

            // Normalized substring match
            for (const keyword of keywords) {
                if (keyword.length >= 4 && klookNameNorm.includes(keyword)) {
                    matched = true;
                    break;
                }
            }

            // Reverse match - POI normalized name in Klook word
            if (!matched && nameNorm.length >= 4) {
                for (const klookWord of klookWords) {
                    if (klookWord.length >= 4 && nameNorm.includes(klookWord)) {
                        matched = true;
                        break;
                    }
                }
            }

            // Special matching for known landmarks (using normalized comparison)
            const knownMatches = [
                { klook: "skytree", poi: "skytree" },
                { klook: "shibuyasky", poi: "shibuya" },
                { klook: "teamlab", poi: "teamlab" },
                { klook: "disney", poi: "disney" },
                { klook: "sensoji", poi: "sensoji" },
                { klook: "asakusa", poi: "asakusa" },
                { klook: "meiji", poi: "meiji" },
                { klook: "imperialpalace", poi: "imperial" },
                { klook: "tokyotower", poi: "tokyotower" },
                { klook: "ueno", poi: "ueno" },
                { klook: "ginza", poi: "ginza" },
                { klook: "shinjuku", poi: "shinjuku" },
                { klook: "harajuku", poi: "harajuku" },
                { klook: "akihabara", poi: "akihabara" },
                { klook: "roppongi", poi: "roppongi" },
                { klook: "odaiba", poi: "odaiba" },
                { klook: "mtfuji", poi: "fuji" },
                { klook: "hakone", poi: "hakone" },
                { klook: "kinkaku", poi: "kinkaku" },
                { klook: "fushimi", poi: "fushimi" },
                { klook: "kiyomizu", poi: "kiyomizu" },
                { klook: "arashiyama", poi: "arashiyama" },
                { klook: "bamboo", poi: "bamboo" },
                { klook: "gion", poi: "gion" },
                { klook: "nijo", poi: "nijo" },
                { klook: "osakacastle", poi: "osakacastle" },
                { klook: "dotonbori", poi: "dotonbori" },
                { klook: "universal", poi: "universal" },
                { klook: "usj", poi: "universal" },
                { klook: "todaiji", poi: "todai" },
                { klook: "narapark", poi: "nara" },
                { klook: "deer", poi: "deer" },
                { klook: "hiroshima", poi: "hiroshima" },
                { klook: "miyajima", poi: "miyajima" },
                { klook: "itsukushima", poi: "itsukushima" },
                { klook: "peace", poi: "peace" },
                { klook: "atomicbomb", poi: "atomic" },
                { klook: "ryoanji", poi: "ryoan" },
                { klook: "ginkakuji", poi: "ginkaku" },
                { klook: "nanzenji", poi: "nanzen" },
                { klook: "kenninji", poi: "kennin" },
                { klook: "tenryuji", poi: "tenryu" },
            ];

            if (!matched) {
                for (const { klook: klookPattern, poi: poiPattern }
                    of knownMatches) {
                    if (klookNameNorm.includes(klookPattern) && nameNorm.includes(poiPattern)) {
                        matched = true;
                        break;
                    }
                }
            }

            if (matched) {
                // Add to POI's paid experiences
                if (!poi.paidExperiences) {
                    poi.paidExperiences = [];
                }

                // Avoid duplicates
                if (!poi.paidExperiences.some(e => e.id === klook.id)) {
                    poi.paidExperiences.push({
                        id: klook.id,
                        provider: "klook",
                        name: klook.name,
                        category: klook.category,
                        url: klook.url,
                        image: klook.image,
                        rating: klook.rating,
                        bookingCount: klook.bookingCount,
                        price: klook.price,
                    });
                }

                matchedActivities.push({
                    klookId: klook.id,
                    poiId: poi.id,
                    poiName: poi.name,
                });
            }
        }
    }

    return matchedActivities;
}

// ============================================
// DATA LOADING
// ============================================

async function loadCityData(cityKey) {
    const dataPath = path.join(CONFIG.inputDir, `${cityKey}.json`);
    const content = await fs.readFile(dataPath, "utf-8");
    return JSON.parse(content);
}

async function loadGlobalIndex() {
    const indexPath = path.join(CONFIG.inputDir, "index.json");
    const content = await fs.readFile(indexPath, "utf-8");
    return JSON.parse(content);
}

// ============================================
// MUST-SEE GENERATION
// ============================================

function generateMustSeeList(pois, cityKey) {
    // Group by category
    const byCategory = {};
    for (const poi of pois) {
        const cat = poi.category;
        if (!byCategory[cat]) byCategory[cat] = [];
        byCategory[cat].push(poi);
    }

    // Generate per-category lists
    const byCateg = {};
    for (const category of CONFIG.attractionCategories) {
        const categoryPois = byCategory[category] || [];
        const limit = CONFIG.mustSeePerCategory[category] || 3;

        const sorted = categoryPois
            .map(poi => ({...poi, mustSeeScore: calculateMustSeeScore(poi, cityKey) }))
            .sort((a, b) => b.mustSeeScore - a.mustSeeScore)
            .slice(0, limit);

        byCateg[category] = sorted.map((poi, rank) => formatMustSeePOI(poi, rank + 1, cityKey));
    }

    // Generate overall top list
    const allAttractions = pois
        .filter(p => CONFIG.attractionCategories.includes(p.category))
        .map(poi => ({...poi, mustSeeScore: calculateMustSeeScore(poi, cityKey) }))
        .sort((a, b) => b.mustSeeScore - a.mustSeeScore)
        .slice(0, CONFIG.mustSeeOverall);

    const overall = allAttractions.map((poi, rank) => formatMustSeePOI(poi, rank + 1, cityKey));

    return { overall, byCategory: byCateg };
}

function formatMustSeePOI(poi, rank, cityKey) {
    const neighborhood = findNearestNeighborhood(
        poi.coordinates.lat,
        poi.coordinates.lng,
        cityKey
    );

    return {
        id: poi.id,
        rank,
        name: poi.name,
        nameJa: poi.nameJa,
        category: poi.category,
        subcategory: poi.subcategory,
        mustSeeScore: Math.round(poi.mustSeeScore * 100) / 100,
        rating: poi.rating,
        reviewCount: poi.reviewCount,
        coordinates: poi.coordinates,
        address: poi.address,
        neighborhood: neighborhood ? neighborhood.name : poi.neighborhood,
        description: poi.description,
        photos: poi.photos ? poi.photos.slice(0, 3) : [],
        website: poi.website,
        openingHours: poi.openingHours,
        // Placeholders for enhancement
        nearbyAttractions: [],
        nearbyRestaurants: [],
        paidExperiences: [],
    };
}

// ============================================
// NEARBY POI ENRICHMENT
// ============================================

function findNearbyPOIs(poi, allPois, categories, maxCount, radiusMeters) {
    const nearby = [];

    for (const other of allPois) {
        if (other.id === poi.id) continue;
        if (!categories.includes(other.category)) continue;

        const distance = haversineDistance(
            poi.coordinates.lat,
            poi.coordinates.lng,
            other.coordinates.lat,
            other.coordinates.lng
        );

        if (distance > radiusMeters) continue;

        nearby.push({
            id: other.id,
            name: other.name,
            nameJa: other.nameJa,
            category: other.category,
            subcategory: other.subcategory,
            distance: Math.round(distance),
            walkTime: walkingTimeMinutes(distance),
            rating: other.rating,
            reviewCount: other.reviewCount,
            photos: other.photos ? other.photos.slice(0, 1) : [],
            coordinates: other.coordinates,
        });
    }

    // Sort by distance, then by rating
    nearby.sort((a, b) => {
        const distDiff = a.distance - b.distance;
        if (Math.abs(distDiff) > 50) return distDiff; // Prefer closer if >50m difference
        return (b.rating || 0) - (a.rating || 0); // Otherwise prefer higher rated
    });

    return nearby.slice(0, maxCount);
}

function enrichMustSeeWithNearby(mustSeeList, allPois) {
    for (const poi of mustSeeList) {
        poi.nearbyAttractions = findNearbyPOIs(
            poi,
            allPois,
            CONFIG.attractionCategories,
            CONFIG.maxNearbyAttractions,
            CONFIG.nearbyRadius
        );

        poi.nearbyRestaurants = findNearbyPOIs(
            poi,
            allPois,
            CONFIG.foodCategories,
            CONFIG.maxNearbyRestaurants,
            CONFIG.nearbyRadius
        );
    }

    return mustSeeList;
}

// ============================================
// TRAVEL TIME MATRIX
// ============================================

function buildTravelTimeMatrix(mustSeePois) {
    const matrix = {};

    for (const poi1 of mustSeePois) {
        matrix[poi1.id] = {};

        for (const poi2 of mustSeePois) {
            if (poi1.id === poi2.id) {
                matrix[poi1.id][poi2.id] = { distance: 0, walkTime: 0, transitTime: 0 };
                continue;
            }

            const distance = haversineDistance(
                poi1.coordinates.lat,
                poi1.coordinates.lng,
                poi2.coordinates.lat,
                poi2.coordinates.lng
            );

            matrix[poi1.id][poi2.id] = {
                distance: Math.round(distance),
                walkTime: walkingTimeMinutes(distance),
                transitTime: transitTimeMinutes(distance),
            };
        }
    }

    return matrix;
}

// ============================================
// CLUSTERING
// ============================================

function buildClusters(pois, cityKey) {
    const clusters = [];
    const assigned = new Set();

    // Only cluster attractions
    const attractions = pois.filter(p =>
        CONFIG.attractionCategories.includes(p.category)
    );

    // Sort by must-see score to start clusters from best POIs
    const sorted = [...attractions]
        .map(poi => ({...poi, score: calculateMustSeeScore(poi, cityKey) }))
        .sort((a, b) => b.score - a.score);

    for (const poi of sorted) {
        if (assigned.has(poi.id)) continue;

        // Find nearest neighborhood for cluster name
        const neighborhood = findNearestNeighborhood(
            poi.coordinates.lat,
            poi.coordinates.lng,
            cityKey
        );

        const cluster = {
            id: `cluster_${clusters.length + 1}`,
            name: neighborhood ? neighborhood.name : `Area ${clusters.length + 1}`,
            anchorPOI: poi.name,
            centroid: {...poi.coordinates },
            pois: [poi.id],
            poiSummaries: [{
                id: poi.id,
                name: poi.name,
                category: poi.category,
                rating: poi.rating,
            }],
            categories: {
                [poi.category]: 1
            },
        };

        assigned.add(poi.id);

        // Find nearby POIs to add to cluster
        for (const other of sorted) {
            if (assigned.has(other.id)) continue;

            const distance = haversineDistance(
                poi.coordinates.lat,
                poi.coordinates.lng,
                other.coordinates.lat,
                other.coordinates.lng
            );

            if (distance <= CONFIG.clusterRadius) {
                cluster.pois.push(other.id);
                cluster.poiSummaries.push({
                    id: other.id,
                    name: other.name,
                    category: other.category,
                    rating: other.rating,
                });
                cluster.categories[other.category] = (cluster.categories[other.category] || 0) + 1;
                assigned.add(other.id);
            }
        }

        // Only keep clusters with 2+ POIs
        if (cluster.pois.length >= 2) {
            // Recalculate centroid
            let totalLat = 0,
                totalLng = 0;
            for (const poiId of cluster.pois) {
                const p = pois.find(x => x.id === poiId);
                if (p) {
                    totalLat += p.coordinates.lat;
                    totalLng += p.coordinates.lng;
                }
            }
            cluster.centroid = {
                lat: totalLat / cluster.pois.length,
                lng: totalLng / cluster.pois.length,
            };

            // Count nearby restaurants
            const nearbyRestaurants = pois.filter(p => {
                if (!CONFIG.foodCategories.includes(p.category)) return false;
                const dist = haversineDistance(
                    cluster.centroid.lat,
                    cluster.centroid.lng,
                    p.coordinates.lat,
                    p.coordinates.lng
                );
                return dist <= CONFIG.clusterRadius;
            });
            cluster.nearbyRestaurantCount = nearbyRestaurants.length;

            // Estimate time to explore cluster
            cluster.estimatedDuration = Math.round(cluster.pois.length * 45); // ~45 min per attraction

            clusters.push(cluster);
        }
    }

    // Sort clusters by total POI rating (best clusters first)
    clusters.sort((a, b) => {
        const aScore = a.poiSummaries.reduce((sum, p) => sum + (p.rating || 4), 0);
        const bScore = b.poiSummaries.reduce((sum, p) => sum + (p.rating || 4), 0);
        return bScore - aScore;
    });

    // Re-number clusters after sorting
    clusters.forEach((c, i) => {
        c.id = `cluster_${i + 1}`;
        c.rank = i + 1;
    });

    return clusters;
}

// ============================================
// INTER-CLUSTER TRAVEL
// ============================================

function buildClusterTravelMatrix(clusters) {
    const matrix = {};

    for (const c1 of clusters) {
        matrix[c1.id] = {};

        for (const c2 of clusters) {
            if (c1.id === c2.id) {
                matrix[c1.id][c2.id] = { distance: 0, walkTime: 0, transitTime: 0 };
                continue;
            }

            const distance = haversineDistance(
                c1.centroid.lat,
                c1.centroid.lng,
                c2.centroid.lat,
                c2.centroid.lng
            );

            matrix[c1.id][c2.id] = {
                distance: Math.round(distance),
                walkTime: walkingTimeMinutes(distance),
                transitTime: transitTimeMinutes(distance),
                recommended: distance <= 1500 ? "walk" : "transit",
            };
        }
    }

    return matrix;
}

// ============================================
// MAIN PROCESSING
// ============================================

async function enhanceCity(cityKey, skipWikidata = false) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`Enhancing: ${cityKey.toUpperCase()}`);
    console.log(`${"=".repeat(60)}`);

    // Load existing data
    const cityData = await loadCityData(cityKey);
    const pois = cityData.pois;

    console.log(`[Load] ${pois.length} POIs loaded`);

    // Step 1: Generate must-see list
    console.log(`[MustSee] Generating must-see attractions...`);
    const mustSee = generateMustSeeList(pois, cityKey);
    console.log(`[MustSee] Top ${mustSee.overall.length} overall attractions selected`);

    // Step 2: Enrich must-see with nearby POIs
    console.log(`[Nearby] Enriching must-see POIs with nearby attractions & restaurants...`);
    enrichMustSeeWithNearby(mustSee.overall, pois);

    // Also enrich category lists
    for (const category of Object.keys(mustSee.byCategory)) {
        enrichMustSeeWithNearby(mustSee.byCategory[category], pois);
    }

    const totalNearby = mustSee.overall.reduce((sum, p) =>
        sum + p.nearbyAttractions.length + p.nearbyRestaurants.length, 0
    );
    console.log(`[Nearby] Added ${totalNearby} nearby POI references`);

    // Step 3: Load and match Klook activities
    console.log(`[Klook] Loading paid activities...`);
    const klookActivities = await loadKlookActivities(cityKey);

    if (klookActivities.length > 0) {
        const matched = matchKlookToMustSee(mustSee.overall, klookActivities);
        console.log(`[Klook] Matched ${matched.length} activities to must-see POIs`);

        // Also try to match to category must-see
        for (const category of Object.keys(mustSee.byCategory)) {
            const catMatched = matchKlookToMustSee(mustSee.byCategory[category], klookActivities);
            if (catMatched.length > 0) {
                console.log(`[Klook] Matched ${catMatched.length} activities to ${category} category`);
            }
        }
    }

    // Step 4: Query Wikidata for admission fees
    let wikidataMatches = new Map();
    if (!skipWikidata) {
        console.log(`[Wikidata] Querying admission fee data...`);
        const cityCoords = getCityCoords(cityKey);
        const wikidataPlaces = await queryWikidataAdmissionFees(cityKey, cityCoords);

        if (wikidataPlaces.length > 0) {
            wikidataMatches = matchWikidataToPOIs(mustSee.overall, wikidataPlaces);
            console.log(`[Wikidata] Matched ${wikidataMatches.size} POIs with Wikidata admission data`);
        }

        // Be nice to Wikidata servers
        await delay(WIKIDATA_DELAY_MS);
    } else {
        console.log(`[Wikidata] Skipping Wikidata query (--skip-wikidata flag)`);
    }

    // Step 5: Add ticket information to must-see POIs
    console.log(`[Tickets] Adding ticket requirement information...`);
    let ticketStats = { required: 0, optional: 0, free: 0 };

    for (const poi of mustSee.overall) {
        const wikidataInfo = wikidataMatches.get(poi.id);
        const ticketInfo = determineTicketRequirement(poi, wikidataInfo, poi.paidExperiences);

        poi.ticketInfo = ticketInfo;
        ticketStats[ticketInfo.requirement]++;
    }

    console.log(`[Tickets] Ticket requirements: ${ticketStats.required} required, ${ticketStats.optional} optional, ${ticketStats.free} free`);

    // Also add ticket info to category lists
    for (const category of Object.keys(mustSee.byCategory)) {
        for (const poi of mustSee.byCategory[category]) {
            const wikidataInfo = wikidataMatches.get(poi.id);
            const ticketInfo = determineTicketRequirement(poi, wikidataInfo, poi.paidExperiences);
            poi.ticketInfo = ticketInfo;
        }
    }

    // Step 6: Build travel time matrix for must-see POIs
    console.log(`[Travel] Building travel time matrix...`);
    const travelMatrix = buildTravelTimeMatrix(mustSee.overall);
    console.log(`[Travel] Matrix built: ${Object.keys(travelMatrix).length} x ${Object.keys(travelMatrix).length}`);

    // Step 7: Build clusters
    console.log(`[Clusters] Building geographic clusters...`);
    const clusters = buildClusters(pois, cityKey);
    const totalClustered = clusters.reduce((sum, c) => sum + c.pois.length, 0);
    console.log(`[Clusters] Created ${clusters.length} clusters covering ${totalClustered} POIs`);

    // Step 8: Build inter-cluster travel matrix
    console.log(`[Clusters] Building inter-cluster travel matrix...`);
    const clusterTravel = buildClusterTravelMatrix(clusters);

    // Step 9: Compile enhanced data
    const enhancedData = {
        city: cityData.city,
        cityJa: cityData.cityJa,
        country: cityData.country,
        lastEnhanced: new Date().toISOString(),

        // Summary stats
        stats: {
            totalPOIs: pois.length,
            mustSeeCount: mustSee.overall.length,
            clusterCount: clusters.length,
            attractionCount: pois.filter(p => CONFIG.attractionCategories.includes(p.category)).length,
            restaurantCount: pois.filter(p => CONFIG.foodCategories.includes(p.category)).length,
            paidExperienceCount: mustSee.overall.reduce((sum, p) => sum + (p.paidExperiences && p.paidExperiences.length ? p.paidExperiences.length : 0), 0),
            ticketStats,
        },

        // Must-see attractions
        mustSee,

        // Geographic clusters for day planning
        clusters,

        // Travel times between clusters
        clusterTravel,

        // Travel times between must-see POIs
        travelMatrix,

        // All Klook activities (for reference and search)
        paidExperiences: {
            provider: "klook",
            lastUpdated: klookActivities.length > 0 ? new Date().toISOString() : null,
            count: klookActivities.length,
            experiences: klookActivities,
        },
    };

    // Save enhanced data
    await ensureDir(CONFIG.outputDir);
    const outputPath = path.join(CONFIG.outputDir, `${cityKey}.enhanced.json`);
    await fs.writeFile(outputPath, JSON.stringify(enhancedData, null, 2));
    console.log(`[Output] Saved enhanced data to ${outputPath}`);

    // Print summary
    console.log(`\n[Summary] ${cityData.city}:`);
    console.log(`  Must-see attractions: ${mustSee.overall.length}`);
    console.log(`  Clusters: ${clusters.length}`);
    console.log(`  Paid experiences: ${klookActivities.length}`);
    console.log(`  Ticket info: ${ticketStats.required} required, ${ticketStats.optional} optional, ${ticketStats.free} free`);
    console.log(`  Top clusters:`);
    for (const cluster of clusters.slice(0, 5)) {
        console.log(`    - ${cluster.name}: ${cluster.pois.length} attractions, ${cluster.nearbyRestaurantCount} restaurants`);
    }

    return enhancedData;
}

/**
 * Get city center coordinates
 */
function getCityCoords(cityKey) {
    const coords = {
        tokyo: { lat: 35.6762, lng: 139.6503 },
        kyoto: { lat: 35.0116, lng: 135.7681 },
        osaka: { lat: 34.6937, lng: 135.5023 },
        nara: { lat: 34.6851, lng: 135.8048 },
        hiroshima: { lat: 34.3853, lng: 132.4553 },
        hakone: { lat: 35.2326, lng: 139.1069 },
    };
    return coords[cityKey] || coords.tokyo;
}

async function buildEnhancedIndex(cities) {
    const index = {};

    for (const cityKey of cities) {
        try {
            const filePath = path.join(CONFIG.outputDir, `${cityKey}.enhanced.json`);
            const content = await fs.readFile(filePath, "utf-8");
            const data = JSON.parse(content);

            index[cityKey] = {
                file: `${cityKey}.enhanced.json`,
                city: data.city,
                stats: data.stats,
                topMustSee: data.mustSee.overall.slice(0, 5).map(p => ({
                    name: p.name,
                    category: p.category,
                    rating: p.rating,
                })),
                clusterCount: data.clusters.length,
            };
        } catch (e) {
            console.warn(`[Index] Skipping ${cityKey}: ${e.message}`);
        }
    }

    const indexPath = path.join(CONFIG.outputDir, "index.json");
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
    console.log(`\n[Index] Built enhanced index for ${Object.keys(index).length} cities`);
}

// ============================================
// MAIN
// ============================================

async function main() {
    console.log("=".repeat(60));
    console.log("Japan POI Dataset Enhancer");
    console.log("=".repeat(60));

    // Parse command line args
    const args = process.argv.slice(2);
    let citiesToProcess = [];
    let skipWikidata = false;

    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--city" && args[i + 1]) {
            citiesToProcess = args[i + 1].split(",").map(c => c.trim().toLowerCase());
            i++;
        }
        if (args[i] === "--skip-wikidata") {
            skipWikidata = true;
        }
    }

    // Default to all cities
    if (citiesToProcess.length === 0) {
        const globalIndex = await loadGlobalIndex();
        citiesToProcess = Object.keys(globalIndex);
    }

    console.log(`\nCities to enhance: ${citiesToProcess.join(", ")}`);
    if (skipWikidata) {
        console.log(`[Config] Skipping Wikidata queries`);
    }

    // Process each city
    for (const cityKey of citiesToProcess) {
        try {
            await enhanceCity(cityKey, skipWikidata);
        } catch (error) {
            console.error(`Error enhancing ${cityKey}:`, error.message);
        }
    }

    // Build index
    await buildEnhancedIndex(citiesToProcess);

    console.log("\n" + "=".repeat(60));
    console.log("Done! Enhanced datasets built successfully.");
    console.log("=".repeat(60));
}

// Run
main().catch(console.error);