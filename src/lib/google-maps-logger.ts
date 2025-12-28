import { promises as fs } from "fs";
import path from "path";

// ===========================================
// Google Maps Request/Response Logging & Caching
// ===========================================

export interface GoogleMapsLogEntry {
  id: string;
  timestamp: string;
  type: "directions" | "distance-matrix" | "geocode" | "reverse-geocode" | "static-map";

  // Request details
  request: {
    endpoint: string;
    params: Record<string, string>;
    origin?: string;
    destination?: string;
  };

  // Response details
  response: {
    data: unknown;
    status: number;
  };

  // Metadata
  metadata: {
    duration_ms: number;
    success: boolean;
    error?: string;
    cached?: boolean;
  };
}

export interface GoogleMapsLogIndex {
  total_entries: number;
  last_updated: string;
  cache_hits: number;
  entries: Array<{
    id: string;
    timestamp: string;
    type: GoogleMapsLogEntry["type"];
    origin?: string;
    destination?: string;
    cacheKey: string;
    success: boolean;
  }>;
}

// ===========================================
// Configuration
// ===========================================

const LOG_DIR = process.env.GOOGLE_MAPS_LOG_DIR || "./google-maps-logs";
const MAX_LOG_ENTRIES = 500;
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days (routes don't change often)

// In-memory cache for faster lookups
const memoryCache = new Map<string, { data: unknown; timestamp: number }>();

// ===========================================
// Helper Functions
// ===========================================

async function ensureLogDir(): Promise<void> {
  try {
    await fs.access(LOG_DIR);
  } catch {
    await fs.mkdir(LOG_DIR, { recursive: true });
  }
}

function generateLogId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `gm_${timestamp}_${random}`;
}

function getDatePath(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

/**
 * Generate a cache key for Google Maps requests
 */
export function generateCacheKey(
  type: GoogleMapsLogEntry["type"],
  params: Record<string, string>
): string {
  // Sort params for consistent cache key
  const sortedParams = Object.keys(params)
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
  return `${type}:${sortedParams}`;
}

// ===========================================
// Cache Functions
// ===========================================

/**
 * Check memory cache first, then file cache
 */
export async function getCachedResponse(
  cacheKey: string
): Promise<{ data: unknown; entry: GoogleMapsLogEntry } | null> {
  // Check memory cache first
  const memCached = memoryCache.get(cacheKey);
  if (memCached && Date.now() - memCached.timestamp < CACHE_TTL_MS) {
    console.log(`[Google Maps Cache] Memory hit: ${cacheKey.substring(0, 50)}...`);
    return { data: memCached.data, entry: null as unknown as GoogleMapsLogEntry };
  }

  // Check file cache
  await ensureLogDir();
  const indexPath = path.join(LOG_DIR, "index.json");

  try {
    const indexContent = await fs.readFile(indexPath, "utf-8");
    const index: GoogleMapsLogIndex = JSON.parse(indexContent);

    // Find matching cache entry
    const cachedEntry = index.entries.find(
      (e) => e.cacheKey === cacheKey && e.success
    );

    if (cachedEntry) {
      const entryDate = new Date(cachedEntry.timestamp);
      const age = Date.now() - entryDate.getTime();

      // Check if cache is still valid
      if (age < CACHE_TTL_MS) {
        const entry = await getLogEntry(cachedEntry.id);
        if (entry) {
          console.log(`[Google Maps Cache] File hit: ${cacheKey.substring(0, 50)}... (age: ${Math.round(age / 1000 / 60)}min)`);

          // Update memory cache
          memoryCache.set(cacheKey, {
            data: entry.response.data,
            timestamp: entryDate.getTime(),
          });

          return { data: entry.response.data, entry };
        }
      }
    }
  } catch {
    // No cache found
  }

  console.log(`[Google Maps Cache] Miss: ${cacheKey.substring(0, 50)}...`);
  return null;
}

/**
 * Update cache hit counter
 */
async function incrementCacheHits(): Promise<void> {
  const indexPath = path.join(LOG_DIR, "index.json");

  try {
    const content = await fs.readFile(indexPath, "utf-8");
    const index: GoogleMapsLogIndex = JSON.parse(content);
    index.cache_hits = (index.cache_hits || 0) + 1;
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  } catch {
    // Ignore
  }
}

// ===========================================
// Logging Functions
// ===========================================

export async function logGoogleMapsRequest(
  entry: GoogleMapsLogEntry,
  cacheKey: string
): Promise<string> {
  await ensureLogDir();

  const datePath = getDatePath();
  const fullDir = path.join(LOG_DIR, datePath);

  // Create date-based subdirectory
  await fs.mkdir(fullDir, { recursive: true });

  // Save individual log entry
  const logFile = path.join(fullDir, `${entry.id}.json`);
  await fs.writeFile(logFile, JSON.stringify(entry, null, 2));

  // Update memory cache
  if (entry.metadata.success) {
    memoryCache.set(cacheKey, {
      data: entry.response.data,
      timestamp: Date.now(),
    });
  }

  // Update index
  await updateLogIndex(entry, cacheKey);

  return entry.id;
}

async function updateLogIndex(entry: GoogleMapsLogEntry, cacheKey: string): Promise<void> {
  const indexPath = path.join(LOG_DIR, "index.json");

  let index: GoogleMapsLogIndex;

  try {
    const content = await fs.readFile(indexPath, "utf-8");
    index = JSON.parse(content);
  } catch {
    index = {
      total_entries: 0,
      last_updated: new Date().toISOString(),
      cache_hits: 0,
      entries: [],
    };
  }

  // Remove old entry with same cache key if exists
  index.entries = index.entries.filter((e) => e.cacheKey !== cacheKey);

  // Add new entry to the beginning
  index.entries.unshift({
    id: entry.id,
    timestamp: entry.timestamp,
    type: entry.type,
    origin: entry.request.origin,
    destination: entry.request.destination,
    cacheKey,
    success: entry.metadata.success,
  });

  // Keep only the most recent entries
  if (index.entries.length > MAX_LOG_ENTRIES) {
    index.entries = index.entries.slice(0, MAX_LOG_ENTRIES);
  }

  index.total_entries++;
  index.last_updated = new Date().toISOString();

  await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
}

// ===========================================
// Retrieval Functions
// ===========================================

export async function getLogEntry(id: string): Promise<GoogleMapsLogEntry | null> {
  await ensureLogDir();

  const indexPath = path.join(LOG_DIR, "index.json");

  try {
    const indexContent = await fs.readFile(indexPath, "utf-8");
    const index: GoogleMapsLogIndex = JSON.parse(indexContent);

    const entry = index.entries.find((e) => e.id === id);
    if (entry) {
      const date = new Date(entry.timestamp);
      const datePath = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
      const logFile = path.join(LOG_DIR, datePath, `${id}.json`);

      const content = await fs.readFile(logFile, "utf-8");
      return JSON.parse(content);
    }
  } catch {
    // Fall through
  }

  return null;
}

export async function getLogIndex(): Promise<GoogleMapsLogIndex> {
  await ensureLogDir();

  const indexPath = path.join(LOG_DIR, "index.json");

  try {
    const content = await fs.readFile(indexPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      total_entries: 0,
      last_updated: new Date().toISOString(),
      cache_hits: 0,
      entries: [],
    };
  }
}

// ===========================================
// Stats Functions
// ===========================================

export async function getGoogleMapsCacheStats(): Promise<{
  total_requests: number;
  cache_hits: number;
  cache_hit_rate: number;
  entries_by_type: Record<GoogleMapsLogEntry["type"], number>;
  memory_cache_size: number;
}> {
  const index = await getLogIndex();

  const byType: Record<GoogleMapsLogEntry["type"], number> = {
    "directions": 0,
    "distance-matrix": 0,
    "geocode": 0,
    "reverse-geocode": 0,
    "static-map": 0,
  };

  for (const entry of index.entries) {
    byType[entry.type]++;
  }

  return {
    total_requests: index.total_entries,
    cache_hits: index.cache_hits || 0,
    cache_hit_rate:
      index.total_entries > 0
        ? ((index.cache_hits || 0) / index.total_entries) * 100
        : 0,
    entries_by_type: byType,
    memory_cache_size: memoryCache.size,
  };
}

// ===========================================
// Helper to Create Log Entry
// ===========================================

export function createGoogleMapsLogEntry(
  type: GoogleMapsLogEntry["type"],
  request: GoogleMapsLogEntry["request"],
  response: GoogleMapsLogEntry["response"],
  durationMs: number,
  success: boolean,
  error?: string,
  cached?: boolean
): GoogleMapsLogEntry {
  return {
    id: generateLogId(),
    timestamp: new Date().toISOString(),
    type,
    request,
    response,
    metadata: {
      duration_ms: durationMs,
      success,
      error,
      cached,
    },
  };
}

/**
 * Wrapper for making cached Google Maps API calls
 */
export async function cachedGoogleMapsFetch<T>(
  type: GoogleMapsLogEntry["type"],
  url: string,
  params: Record<string, string>,
  routeInfo?: { origin?: string; destination?: string }
): Promise<T> {
  const cacheKey = generateCacheKey(type, params);

  // Check cache first
  const cached = await getCachedResponse(cacheKey);
  if (cached) {
    await incrementCacheHits();
    return cached.data as T;
  }

  // Make actual API call
  const startTime = Date.now();

  try {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    const data = await response.json();
    const duration = Date.now() - startTime;

    // Log the request
    const entry = createGoogleMapsLogEntry(
      type,
      {
        endpoint: url.split("?")[0],
        params,
        origin: routeInfo?.origin,
        destination: routeInfo?.destination,
      },
      {
        data,
        status: response.status,
      },
      duration,
      response.ok,
      response.ok ? undefined : `HTTP ${response.status}`
    );

    await logGoogleMapsRequest(entry, cacheKey);

    if (!response.ok) {
      const errorMsg =
        (data as { error_message?: string }).error_message || `HTTP ${response.status}`;
      throw new Error(`Google Maps API error: ${errorMsg}`);
    }

    return data as T;
  } catch (error) {
    const duration = Date.now() - startTime;

    // Log failed request
    const entry = createGoogleMapsLogEntry(
      type,
      {
        endpoint: url.split("?")[0],
        params,
        origin: routeInfo?.origin,
        destination: routeInfo?.destination,
      },
      {
        data: null,
        status: 0,
      },
      duration,
      false,
      error instanceof Error ? error.message : "Unknown error"
    );

    await logGoogleMapsRequest(entry, cacheKey);
    throw error;
  }
}

/**
 * Clear memory cache
 */
export function clearMemoryCache(): void {
  memoryCache.clear();
}

/**
 * Get memory cache stats
 */
export function getMemoryCacheStats(): { size: number; keys: string[] } {
  return {
    size: memoryCache.size,
    keys: Array.from(memoryCache.keys()),
  };
}
