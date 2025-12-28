/**
 * Place Resolution Service
 *
 * Orchestrates multiple place data providers to resolve AI-generated
 * place names into verified place data with coordinates, photos, ratings.
 *
 * Provider Priority (cost-optimized):
 * 1. Foursquare (free tier - 1K/day) - Best for venues, restaurants
 * 2. OpenStreetMap/Nominatim (FREE) - Best for landmarks, addresses
 * 3. Yelp (free tier - 500/day) - Best for restaurants with reviews
 * 4. Viator (affiliate) - Best for tours/activities
 * 5. Google Places (paid) - Fallback for accuracy
 *
 * CACHING:
 * - Each provider API has its own file-based cache (yelp-logs, etc.)
 * - This resolver also has an in-memory cache for resolved places
 * - In TEST mode, we can use pre-cached results to avoid API calls
 */

import { promises as fs } from "fs";
import path from "path";
import {
  searchFoursquarePlaces,
  buildPhotoUrl,
  type FoursquarePlace,
  type FoursquareSearchResponse,
} from "./foursquare";
import {
  searchNominatim,
  type NominatimPlace,
} from "./openstreetmap";
import {
  searchRestaurants as searchYelpRestaurants,
  type Restaurant as YelpRestaurant,
} from "./yelp";
import {
  searchPlacesByText as searchGooglePlaces,
  type GooglePlace,
  type TextSearchResponse,
} from "./google-places";
import {
  searchProducts as searchViatorProducts,
  type ViatorProduct,
} from "./viator";
import {
  hasLocalData,
  findByName as findLocalPOI,
  findByFuzzyName as findLocalPOIFuzzy,
  type LocalPOI,
} from "./local-poi-provider";
import type { PlaceData } from "@/types/structured-itinerary";

// ============================================
// MODE CONFIGURATION
// ============================================

// Test mode: Use cached results, don't make API calls
const RESOLVER_MODE = process.env.PLACE_RESOLVER_MODE || process.env.AI_MODE || "test";

let testModeOverride: boolean | null = null;

export function isTestMode(): boolean {
  // Allow programmatic override for testing
  if (testModeOverride !== null) {
    return testModeOverride;
  }
  const mode = RESOLVER_MODE.toLowerCase();
  return mode === "test" || mode === "development" || mode === "dev";
}

/**
 * Override test mode programmatically (for unit testing)
 * @param enabled - true to force test mode, false to force production mode, null to use env
 */
export function setTestModeOverride(enabled: boolean | null): void {
  testModeOverride = enabled;
}

/**
 * Get current test mode override value (for testing)
 */
export function getTestModeOverride(): boolean | null {
  return testModeOverride;
}

// Cache directory for resolved places
const RESOLVER_CACHE_DIR = process.env.RESOLVER_CACHE_DIR || "./place-resolver-cache";

// ============================================
// TYPES
// ============================================

export interface UnresolvedPlace {
  name: string;
  category?: string; // "restaurant", "temple", "museum", "tour", etc.
  neighborhood?: string;
  city: string;
  country: string;
  coordinates?: { lat: number; lng: number }; // Hint from AI
}

export interface ResolvedPlace extends PlaceData {
  confidence: number; // 0-1, how sure we are this is correct
  source: "foursquare" | "osm" | "yelp" | "viator" | "google" | "ai";
  sourceId?: string; // ID from the source provider
  priceLevel?: number;
  isOpenNow?: boolean;
  website?: string;
  phone?: string;
}

export interface PlaceResolutionResult {
  original: UnresolvedPlace;
  resolved: ResolvedPlace | null;
  alternatives: ResolvedPlace[];
  error?: string;
  provider: string;
  duration: number; // ms
  cached: boolean;
}

export interface PlaceResolutionOptions {
  providers?: ("foursquare" | "osm" | "yelp" | "viator" | "google")[];
  maxAlternatives?: number;
  minConfidence?: number;
  preferredProvider?: string;
  skipExpensiveProviders?: boolean; // Skip Google to save cost
  forceRefresh?: boolean; // Bypass cache
}

// ============================================
// CONFIGURATION
// ============================================

const DEFAULT_OPTIONS: PlaceResolutionOptions = {
  providers: ["foursquare", "osm", "yelp", "google"],
  maxAlternatives: 2,
  minConfidence: 0.5,
  skipExpensiveProviders: false,
  forceRefresh: false,
};

// Category to provider mapping (Yelp prioritized for restaurants since it works)
const CATEGORY_PROVIDER_MAP: Record<string, string[]> = {
  restaurant: ["yelp", "google"],
  cafe: ["yelp", "google"],
  bar: ["yelp", "google"],
  food: ["yelp", "google"],
  tour: ["viator", "google"],
  activity: ["viator", "google"],
  experience: ["viator", "google"],
  temple: ["osm", "google"],
  shrine: ["osm", "google"],
  museum: ["osm", "google"],
  park: ["osm", "google"],
  landmark: ["osm", "google"],
  hotel: ["google"],
  shopping: ["yelp", "google"],
  default: ["osm", "google"],
};

// ============================================
// FILE-BASED CACHE FOR TEST MODE
// ============================================

interface CacheEntry {
  place: UnresolvedPlace;
  result: PlaceResolutionResult;
  timestamp: string;
}

interface CacheIndex {
  entries: Record<string, CacheEntry>;
  lastUpdated: string;
  totalHits: number;
  totalMisses: number;
}

async function ensureCacheDir(): Promise<void> {
  try {
    await fs.access(RESOLVER_CACHE_DIR);
  } catch {
    await fs.mkdir(RESOLVER_CACHE_DIR, { recursive: true });
  }
}

// In-memory cache for faster lookups during a single session
const memoryCache = new Map<string, { data: PlaceResolutionResult; timestamp: number }>();
const MEMORY_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// ============================================
// CACHE WRITE MUTEX
// ============================================
// Prevents race conditions when multiple parallel resolves try to update the cache

class CacheMutex {
  private queue: Promise<void> = Promise.resolve();
  private cachedIndex: CacheIndex | null = null;
  private isDirty: boolean = false;
  private flushTimeout: NodeJS.Timeout | null = null;
  private readonly FLUSH_DELAY = 100; // ms - batch writes within this window

  /**
   * Execute a cache operation with exclusive access
   */
  async withLock<T>(operation: (index: CacheIndex) => Promise<T>): Promise<T> {
    let result: T;

    // Chain this operation onto the queue
    this.queue = this.queue.then(async () => {
      // Load index if not cached
      if (!this.cachedIndex) {
        this.cachedIndex = await this._loadIndex();
      }

      // Execute the operation with the cached index
      result = await operation(this.cachedIndex);
    });

    // Wait for our turn in the queue
    await this.queue;
    return result!;
  }

  /**
   * Mark the cache as dirty and schedule a flush
   */
  markDirty(): void {
    this.isDirty = true;

    // Debounce the flush to batch multiple writes
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
    }

    this.flushTimeout = setTimeout(() => {
      this.flush();
    }, this.FLUSH_DELAY);
  }

  /**
   * Immediately flush the cache to disk
   */
  async flush(): Promise<void> {
    if (this.flushTimeout) {
      clearTimeout(this.flushTimeout);
      this.flushTimeout = null;
    }

    if (!this.isDirty || !this.cachedIndex) {
      return;
    }

    await this._saveIndex(this.cachedIndex);
    this.isDirty = false;
  }

  private async _loadIndex(): Promise<CacheIndex> {
    try {
      const indexPath = path.join(RESOLVER_CACHE_DIR, "index.json");
      const content = await fs.readFile(indexPath, "utf-8");
      return JSON.parse(content);
    } catch {
      return {
        entries: {},
        lastUpdated: new Date().toISOString(),
        totalHits: 0,
        totalMisses: 0,
      };
    }
  }

  private async _saveIndex(index: CacheIndex): Promise<void> {
    await ensureCacheDir();
    const indexPath = path.join(RESOLVER_CACHE_DIR, "index.json");
    index.lastUpdated = new Date().toISOString();
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  }
}

const cacheMutex = new CacheMutex();

// ============================================
// CACHE HELPERS
// ============================================

function getCacheKey(place: UnresolvedPlace): string {
  return `${place.name}|${place.city}|${place.country}|${place.category || ""}`.toLowerCase();
}

async function getCachedResult(place: UnresolvedPlace): Promise<PlaceResolutionResult | null> {
  const key = getCacheKey(place);

  return cacheMutex.withLock(async (index) => {
    const entry = index.entries[key];

    if (entry) {
      console.log(`[PlaceResolver] Cache HIT: "${place.name}" in ${place.city}`);
      index.totalHits++;
      cacheMutex.markDirty();
      return { ...entry.result, cached: true };
    }

    console.log(`[PlaceResolver] Cache MISS: "${place.name}" in ${place.city}`);
    index.totalMisses++;
    cacheMutex.markDirty();
    return null;
  });
}

async function cacheResult(place: UnresolvedPlace, result: PlaceResolutionResult): Promise<void> {
  const key = getCacheKey(place);

  await cacheMutex.withLock(async (index) => {
    index.entries[key] = {
      place,
      result,
      timestamp: new Date().toISOString(),
    };
    cacheMutex.markDirty();
    console.log(`[PlaceResolver] Cached: "${place.name}" from ${result.provider}`);
  });
}

// ============================================
// MAIN RESOLVER
// ============================================

/**
 * Resolve a single place using multiple providers
 */
export async function resolvePlace(
  place: UnresolvedPlace,
  options: PlaceResolutionOptions = {}
): Promise<PlaceResolutionResult> {
  const startTime = Date.now();
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const cacheKey = getCacheKey(place);

  // Check memory cache first (fastest)
  const memCached = memoryCache.get(cacheKey);
  if (memCached && Date.now() - memCached.timestamp < MEMORY_CACHE_TTL && !opts.forceRefresh) {
    console.log(`[PlaceResolver] Memory cache HIT: "${place.name}"`);
    return { ...memCached.data, duration: Date.now() - startTime, cached: true };
  }

  // Check file cache (for test mode persistence)
  if (!opts.forceRefresh) {
    const fileCached = await getCachedResult(place);
    if (fileCached) {
      // Update memory cache
      memoryCache.set(cacheKey, { data: fileCached, timestamp: Date.now() });
      return { ...fileCached, duration: Date.now() - startTime };
    }
  }

  // In test mode without cache, try local POI data first, then fall back to mock data
  if (isTestMode()) {
    // Try local POI provider first (real OpenStreetMap data)
    const hasLocal = await hasLocalData(place.city);
    if (hasLocal) {
      console.log(`[PlaceResolver] TEST MODE - Trying local POI data for: "${place.name}" in ${place.city}`);

      // Try exact match first
      let localPOI = await findLocalPOI(place.name, place.city);

      // Try fuzzy match if exact match fails
      if (!localPOI) {
        const fuzzyResults = await findLocalPOIFuzzy(place.name, place.city, {
          maxResults: 1,
          minSimilarity: 0.6,
          category: place.category,
        });
        if (fuzzyResults.length > 0) {
          localPOI = fuzzyResults[0];
        }
      }

      if (localPOI) {
        console.log(`[PlaceResolver] TEST MODE - Found local POI: "${localPOI.name}"`);

        const localResult: PlaceResolutionResult = {
          original: place,
          resolved: {
            name: localPOI.name,
            address: localPOI.address || `${localPOI.neighborhood || ""} ${localPOI.city}, ${localPOI.country}`.trim(),
            neighborhood: localPOI.neighborhood || "",
            coordinates: localPOI.coordinates,
            confidence: 0.9, // High confidence - real data
            source: "osm" as const,
            sourceId: localPOI.id,
            rating: localPOI.rating,
            reviewCount: localPOI.reviewCount,
            photos: localPOI.photos,
            website: localPOI.website,
            phone: localPOI.phone,
          },
          alternatives: [],
          provider: "local-poi",
          duration: Date.now() - startTime,
          cached: false,
        };

        // Cache the result for future use
        await cacheResult(place, localResult);
        memoryCache.set(cacheKey, { data: localResult, timestamp: Date.now() });
        await cacheMutex.flush();

        return localResult;
      }

      console.log(`[PlaceResolver] TEST MODE - No local POI match, falling back to mock data`);
    }

    // Fall back to mock data if local POI not found
    console.log(`[PlaceResolver] TEST MODE - Using AI fallback with mock data for: "${place.name}"`);

    // Generate realistic mock ratings based on category
    const categoryRatings: Record<string, { min: number; max: number; reviews: [number, number] }> = {
      restaurant: { min: 3.8, max: 4.8, reviews: [50, 500] },
      temple: { min: 4.2, max: 4.9, reviews: [100, 2000] },
      shrine: { min: 4.0, max: 4.8, reviews: [80, 1500] },
      museum: { min: 4.0, max: 4.7, reviews: [200, 3000] },
      park: { min: 4.1, max: 4.6, reviews: [100, 800] },
      market: { min: 4.0, max: 4.5, reviews: [150, 1200] },
      cafe: { min: 4.0, max: 4.6, reviews: [30, 300] },
      bar: { min: 3.9, max: 4.5, reviews: [40, 400] },
      tour: { min: 4.3, max: 4.9, reviews: [50, 500] },
      default: { min: 4.0, max: 4.6, reviews: [50, 500] },
    };

    // Category-based placeholder images (high-quality Unsplash photos)
    const categoryPhotos: Record<string, string[]> = {
      restaurant: [
        "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1552566626-52f8b828add9?w=800&h=600&fit=crop",
      ],
      temple: [
        "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&h=600&fit=crop",
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
      market: [
        "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1534723452862-4c874018d66d?w=800&h=600&fit=crop",
      ],
      cafe: [
        "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800&h=600&fit=crop",
      ],
      bar: [
        "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=800&h=600&fit=crop",
      ],
      tour: [
        "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=800&h=600&fit=crop",
      ],
      landmark: [
        "https://images.unsplash.com/photo-1480796927426-f609979314bd?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=800&h=600&fit=crop",
      ],
      shopping: [
        "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1481437156560-3205f6a55735?w=800&h=600&fit=crop",
      ],
      nightlife: [
        "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1566417713940-fe7c737a9ef2?w=800&h=600&fit=crop",
      ],
      default: [
        "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=800&h=600&fit=crop",
        "https://images.unsplash.com/photo-1476514525535-07fb3b4ae5f1?w=800&h=600&fit=crop",
      ],
    };

    const category = place.category?.toLowerCase() || "default";
    const ratingConfig = categoryRatings[category] || categoryRatings.default;

    // Get photos for this category
    const photos = categoryPhotos[category] || categoryPhotos.default;

    // Use place name hash for consistent "random" values
    const nameHash = place.name.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const rating = Number((ratingConfig.min + (nameHash % 10) / 10 * (ratingConfig.max - ratingConfig.min)).toFixed(1));
    const reviewCount = Math.floor(ratingConfig.reviews[0] + (nameHash % 100) / 100 * (ratingConfig.reviews[1] - ratingConfig.reviews[0]));

    const fallbackResult: PlaceResolutionResult = {
      original: place,
      resolved: {
        name: place.name,
        address: `${place.neighborhood || ""} ${place.city}, ${place.country}`.trim(),
        neighborhood: place.neighborhood || "",
        coordinates: place.coordinates || { lat: 0, lng: 0 },
        confidence: 0.7, // Higher confidence with mock data
        source: "ai",
        rating,
        reviewCount,
        photos, // Include category-based photos
      },
      alternatives: [],
      provider: "ai-fallback",
      duration: Date.now() - startTime,
      cached: false,
    };

    // Cache the fallback for future use
    await cacheResult(place, fallbackResult);
    memoryCache.set(cacheKey, { data: fallbackResult, timestamp: Date.now() });

    // Flush cache immediately to ensure persistence before function returns
    // (debounced flush may not complete before serverless function terminates)
    await cacheMutex.flush();

    return fallbackResult;
  }

  // Determine which providers to try based on category
  const category = place.category?.toLowerCase() || "default";
  const categoryProviders = CATEGORY_PROVIDER_MAP[category] || CATEGORY_PROVIDER_MAP.default;

  // Filter by allowed providers
  let providersToTry = opts.providers
    ? categoryProviders.filter((p) => (opts.providers as string[]).includes(p))
    : categoryProviders;

  // Skip expensive providers if requested
  if (opts.skipExpensiveProviders) {
    providersToTry = providersToTry.filter((p) => p !== "google");
  }

  // Try each provider in order
  let bestResult: ResolvedPlace | null = null;
  let alternatives: ResolvedPlace[] = [];
  let lastError: string | undefined;
  let successProvider = "none";

  for (const provider of providersToTry) {
    try {
      const result = await tryProvider(provider, place);

      if (result && result.length > 0) {
        // Sort by confidence
        const sorted = result.sort((a, b) => b.confidence - a.confidence);

        // Check if best result meets confidence threshold
        if (sorted[0].confidence >= (opts.minConfidence || 0)) {
          bestResult = sorted[0];
          alternatives = sorted.slice(1, (opts.maxAlternatives || 2) + 1);
          successProvider = provider;
          break; // Found a good match, stop trying other providers
        }
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      console.warn(`[PlaceResolver] ${provider} failed for "${place.name}":`, lastError);
      continue; // Try next provider
    }
  }

  const result: PlaceResolutionResult = {
    original: place,
    resolved: bestResult,
    alternatives,
    error: bestResult ? undefined : lastError || "No matching place found",
    provider: successProvider,
    duration: Date.now() - startTime,
    cached: false,
  };

  // Cache successful result
  if (bestResult) {
    await cacheResult(place, result);
    memoryCache.set(cacheKey, { data: result, timestamp: Date.now() });
  }

  return result;
}

/**
 * Resolve multiple places in parallel (with rate limiting)
 */
export async function resolvePlaces(
  places: UnresolvedPlace[],
  options: PlaceResolutionOptions = {}
): Promise<PlaceResolutionResult[]> {
  // Process in batches to avoid rate limiting
  const BATCH_SIZE = 5;
  const results: PlaceResolutionResult[] = [];

  for (let i = 0; i < places.length; i += BATCH_SIZE) {
    const batch = places.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map((place) => resolvePlace(place, options))
    );
    results.push(...batchResults);

    // Small delay between batches to respect rate limits
    if (i + BATCH_SIZE < places.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return results;
}

// ============================================
// PROVIDER-SPECIFIC RESOLVERS
// ============================================

async function tryProvider(
  provider: string,
  place: UnresolvedPlace
): Promise<ResolvedPlace[] | null> {
  // Double-check test mode - providers should NEVER be called in test mode
  if (isTestMode()) {
    console.warn(`[PlaceResolver] WARNING: tryProvider called in test mode for provider "${provider}" - this should not happen!`);
    return null;
  }

  switch (provider) {
    case "foursquare":
      return tryFoursquare(place);
    case "osm":
      return tryOpenStreetMap(place);
    case "yelp":
      return tryYelp(place);
    case "viator":
      return tryViator(place);
    case "google":
      return tryGoogle(place);
    default:
      return null;
  }
}

/**
 * Try Foursquare Places API
 */
async function tryFoursquare(place: UnresolvedPlace): Promise<ResolvedPlace[]> {
  const query = place.name;
  const near = place.neighborhood
    ? `${place.neighborhood}, ${place.city}, ${place.country}`
    : `${place.city}, ${place.country}`;

  const response: FoursquareSearchResponse = await searchFoursquarePlaces({
    query,
    near,
    limit: 5,
  });

  return response.results.map((fsq: FoursquarePlace) => foursquareToResolvedPlace(fsq, place.name));
}

/**
 * Try OpenStreetMap/Nominatim
 */
async function tryOpenStreetMap(place: UnresolvedPlace): Promise<ResolvedPlace[]> {
  const query = place.neighborhood
    ? `${place.name}, ${place.neighborhood}, ${place.city}, ${place.country}`
    : `${place.name}, ${place.city}, ${place.country}`;

  const results = await searchNominatim({
    q: query,
    format: "jsonv2",
    addressdetails: 1,
    limit: 5,
  });

  return results.map((osm) => osmToResolvedPlace(osm, place.name));
}

/**
 * Try Yelp Fusion API (for restaurants)
 */
async function tryYelp(place: UnresolvedPlace): Promise<ResolvedPlace[]> {
  const location = place.neighborhood
    ? `${place.neighborhood}, ${place.city}`
    : place.city;

  const results = await searchYelpRestaurants(location, {
    cuisine: place.name,
    limit: 5,
  });

  // Also try exact name match
  const exactMatch = results.find(
    (r) => r.name.toLowerCase().includes(place.name.toLowerCase())
  );

  if (exactMatch) {
    // Move exact match to front
    const filtered = results.filter((r) => r.id !== exactMatch.id);
    return [
      yelpToResolvedPlace(exactMatch, place.name),
      ...filtered.slice(0, 4).map((r) => yelpToResolvedPlace(r, place.name)),
    ];
  }

  return results.map((r) => yelpToResolvedPlace(r, place.name));
}

/**
 * Try Viator API (for tours/activities)
 */
async function tryViator(place: UnresolvedPlace): Promise<ResolvedPlace[]> {
  const results = await searchViatorProducts({
    destName: place.city,
    count: 5,
  });

  // Filter by name similarity
  const filtered = results.products.filter((p) =>
    p.title.toLowerCase().includes(place.name.toLowerCase()) ||
    place.name.toLowerCase().includes(p.title.toLowerCase().split(" ").slice(0, 3).join(" "))
  );

  return filtered.map((v) => viatorToResolvedPlace(v, place));
}

/**
 * Try Google Places API (paid fallback)
 */
async function tryGoogle(place: UnresolvedPlace): Promise<ResolvedPlace[]> {
  const textQuery = place.neighborhood
    ? `${place.name} ${place.neighborhood} ${place.city}`
    : `${place.name} ${place.city}`;

  const response: TextSearchResponse = await searchGooglePlaces({
    textQuery,
    maxResultCount: 5,
  });

  return response.places.map((g: GooglePlace) => googleToResolvedPlace(g, place.name));
}

// ============================================
// DATA CONVERTERS
// ============================================

function foursquareToResolvedPlace(
  fsq: FoursquarePlace,
  queryName: string
): ResolvedPlace {
  const geocodes = fsq.geocodes as { main?: { latitude: number; longitude: number } } | undefined;

  // Build photo URLs from Foursquare photos array
  const photoUrls = fsq.photos?.map((photo) => buildPhotoUrl(photo, "original")) || [];

  return {
    name: fsq.name,
    address: fsq.location?.formatted_address || fsq.location?.address || "",
    neighborhood: fsq.location?.neighborhood?.[0] || fsq.location?.locality || "",
    coordinates: {
      lat: geocodes?.main?.latitude || 0,
      lng: geocodes?.main?.longitude || 0,
    },
    rating: (fsq as FoursquarePlace & { rating?: number }).rating,
    reviewCount: (fsq as FoursquarePlace & { stats?: { total_ratings?: number } }).stats?.total_ratings,
    photos: photoUrls,
    confidence: calculateConfidence(queryName, fsq.name),
    source: "foursquare",
    sourceId: fsq.fsq_id,
    priceLevel: fsq.price?.tier,
    isOpenNow: fsq.closed_bucket === "LikelyOpen",
    website: (fsq as FoursquarePlace & { website?: string }).website,
    phone: (fsq as FoursquarePlace & { tel?: string }).tel,
  };
}

function osmToResolvedPlace(
  osm: NominatimPlace,
  queryName: string
): ResolvedPlace {
  return {
    name: osm.namedetails?.name || osm.display_name.split(",")[0],
    address: osm.display_name,
    neighborhood: osm.address?.suburb || osm.address?.neighbourhood || "",
    coordinates: {
      lat: parseFloat(osm.lat),
      lng: parseFloat(osm.lon),
    },
    photos: [],
    confidence: calculateConfidence(queryName, osm.namedetails?.name || osm.display_name),
    source: "osm",
    sourceId: `${osm.osm_type}/${osm.osm_id}`,
    website: osm.extratags?.website,
    phone: osm.extratags?.phone,
  };
}

function yelpToResolvedPlace(
  yelp: YelpRestaurant,
  queryName: string
): ResolvedPlace {
  return {
    name: yelp.name,
    address: yelp.address,
    neighborhood: yelp.city,
    coordinates: {
      lat: yelp.coordinates.lat,
      lng: yelp.coordinates.lng,
    },
    rating: yelp.rating,
    reviewCount: yelp.reviewCount,
    photos: yelp.imageUrl ? [yelp.imageUrl] : [],
    confidence: calculateConfidence(queryName, yelp.name),
    source: "yelp",
    sourceId: yelp.id,
    priceLevel: yelp.priceLevel,
    isOpenNow: yelp.isOpenNow,
    phone: yelp.phone,
    website: yelp.url,
  };
}

function viatorToResolvedPlace(
  viator: ViatorProduct,
  place: UnresolvedPlace
): ResolvedPlace {
  // Viator doesn't provide coordinates directly, use city hint
  return {
    name: viator.title,
    address: place.city,
    neighborhood: "",
    coordinates: place.coordinates || { lat: 0, lng: 0 },
    rating: viator.reviews?.combinedAverageRating,
    reviewCount: viator.reviews?.totalReviews,
    photos: viator.images?.slice(0, 5).map((img) =>
      img.variants[0]?.url || ""
    ).filter(Boolean) || [],
    confidence: calculateConfidence(place.name, viator.title),
    source: "viator",
    sourceId: viator.productCode,
    website: viator.productUrl,
  };
}

function googleToResolvedPlace(
  google: GooglePlace,
  queryName: string
): ResolvedPlace {
  return {
    googlePlaceId: google.id,
    name: google.displayName?.text || "",
    address: google.formattedAddress || "",
    neighborhood: extractNeighborhood(google),
    coordinates: {
      lat: google.location?.latitude || 0,
      lng: google.location?.longitude || 0,
    },
    rating: google.rating,
    reviewCount: google.userRatingCount,
    photos: [], // Would need separate API call with photo references
    openingHours: google.regularOpeningHours?.weekdayDescriptions,
    confidence: calculateConfidence(queryName, google.displayName?.text || ""),
    source: "google",
    sourceId: google.id,
    priceLevel: priceLevelToNumber(google.priceLevel),
    isOpenNow: google.regularOpeningHours?.openNow,
    website: google.websiteUri,
    phone: google.internationalPhoneNumber,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function calculateConfidence(queryName: string, resultName: string): number {
  const queryLower = queryName.toLowerCase().trim();
  const resultLower = resultName.toLowerCase().trim();

  // Exact match
  if (resultLower === queryLower) return 1.0;

  // One contains the other
  if (resultLower.includes(queryLower)) return 0.9;
  if (queryLower.includes(resultLower)) return 0.85;

  // Word overlap
  const queryWords = new Set(queryLower.split(/\s+/));
  const resultWords = new Set(resultLower.split(/\s+/));
  const intersection = [...queryWords].filter((w) => resultWords.has(w));
  const wordOverlap = intersection.length / Math.max(queryWords.size, 1);

  if (wordOverlap >= 0.5) return 0.7 + wordOverlap * 0.2;

  // Some similarity
  if (intersection.length > 0) return 0.5;

  // Low confidence
  return 0.3;
}

function extractNeighborhood(google: GooglePlace): string {
  const component = google.addressComponents?.find(
    (c) =>
      c.types.includes("neighborhood") ||
      c.types.includes("sublocality") ||
      c.types.includes("sublocality_level_1")
  );
  return component?.longText || "";
}

function priceLevelToNumber(
  priceLevel?: string
): number | undefined {
  const map: Record<string, number> = {
    PRICE_LEVEL_FREE: 0,
    PRICE_LEVEL_INEXPENSIVE: 1,
    PRICE_LEVEL_MODERATE: 2,
    PRICE_LEVEL_EXPENSIVE: 3,
    PRICE_LEVEL_VERY_EXPENSIVE: 4,
  };
  return priceLevel ? map[priceLevel] : undefined;
}

// ============================================
// BATCH RESOLVER FOR ITINERARIES
// ============================================

export interface ItineraryPlaceResolutionResult {
  dayNumber: number;
  slotId: string;
  optionId: string;
  resolution: PlaceResolutionResult;
}

/**
 * Resolve all places in a structured itinerary
 */
export async function resolveItineraryPlaces(
  itinerary: {
    days: Array<{
      dayNumber: number;
      city: string;
      slots: Array<{
        slotId: string;
        options: Array<{
          id: string;
          activity: {
            name: string;
            category: string;
            place?: { neighborhood?: string } | null;
          };
        }>;
      }>;
    }>;
    destination: string;
    country?: string;
  },
  options: PlaceResolutionOptions = {}
): Promise<ItineraryPlaceResolutionResult[]> {
  const placesToResolve: Array<{
    dayNumber: number;
    slotId: string;
    optionId: string;
    place: UnresolvedPlace;
  }> = [];

  // Extract all places from itinerary
  for (const day of itinerary.days) {
    for (const slot of day.slots) {
      for (const option of slot.options) {
        placesToResolve.push({
          dayNumber: day.dayNumber,
          slotId: slot.slotId,
          optionId: option.id,
          place: {
            name: option.activity.name,
            category: option.activity.category,
            neighborhood: option.activity.place?.neighborhood,
            city: day.city,
            country: itinerary.country || itinerary.destination,
          },
        });
      }
    }
  }

  // Resolve all places
  const resolutions = await resolvePlaces(
    placesToResolve.map((p) => p.place),
    options
  );

  // Map results back to itinerary structure
  return placesToResolve.map((p, i) => ({
    dayNumber: p.dayNumber,
    slotId: p.slotId,
    optionId: p.optionId,
    resolution: resolutions[i],
  }));
}

// ============================================
// EXPORTS
// ============================================

export default {
  resolvePlace,
  resolvePlaces,
  resolveItineraryPlaces,
};
