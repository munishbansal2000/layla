import { promises as fs } from "fs";
import path from "path";

// ===========================================
// Yelp Request/Response Logging & Caching
// ===========================================

export interface YelpLogEntry {
  id: string;
  timestamp: string;
  type: "search" | "business" | "reviews";

  // Request details
  request: {
    endpoint: string;
    params: Record<string, string>;
    location?: string;
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

export interface YelpLogIndex {
  total_entries: number;
  last_updated: string;
  cache_hits: number;
  entries: Array<{
    id: string;
    timestamp: string;
    type: "search" | "business" | "reviews";
    location?: string;
    cacheKey: string;
    success: boolean;
  }>;
}

// ===========================================
// Configuration
// ===========================================

const LOG_DIR = process.env.YELP_LOG_DIR || "./yelp-logs";
const MAX_LOG_ENTRIES = 500;
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour cache (Yelp data changes less frequently)

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
  return `yelp_${timestamp}_${random}`;
}

function getDatePath(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

/**
 * Generate a cache key for Yelp requests
 */
export function generateCacheKey(
  type: "search" | "business" | "reviews",
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
): Promise<{ data: unknown; entry: YelpLogEntry } | null> {
  // Check memory cache first
  const memCached = memoryCache.get(cacheKey);
  if (memCached && Date.now() - memCached.timestamp < CACHE_TTL_MS) {
    console.log(`[Yelp Cache] Memory hit: ${cacheKey.substring(0, 50)}...`);
    return { data: memCached.data, entry: null as unknown as YelpLogEntry };
  }

  // Check file cache
  await ensureLogDir();
  const indexPath = path.join(LOG_DIR, "index.json");

  try {
    const indexContent = await fs.readFile(indexPath, "utf-8");
    const index: YelpLogIndex = JSON.parse(indexContent);

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
          console.log(`[Yelp Cache] File hit: ${cacheKey.substring(0, 50)}... (age: ${Math.round(age / 1000)}s)`);

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

  console.log(`[Yelp Cache] Miss: ${cacheKey.substring(0, 50)}...`);
  return null;
}

/**
 * Update cache hit counter
 */
async function incrementCacheHits(): Promise<void> {
  const indexPath = path.join(LOG_DIR, "index.json");

  try {
    const content = await fs.readFile(indexPath, "utf-8");
    const index: YelpLogIndex = JSON.parse(content);
    index.cache_hits = (index.cache_hits || 0) + 1;
    await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
  } catch {
    // Ignore
  }
}

// ===========================================
// Logging Functions
// ===========================================

export async function logYelpRequest(entry: YelpLogEntry, cacheKey: string): Promise<string> {
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

async function updateLogIndex(entry: YelpLogEntry, cacheKey: string): Promise<void> {
  const indexPath = path.join(LOG_DIR, "index.json");

  let index: YelpLogIndex;

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
    location: entry.request.location,
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

export async function getLogEntry(id: string): Promise<YelpLogEntry | null> {
  await ensureLogDir();

  const indexPath = path.join(LOG_DIR, "index.json");

  try {
    const indexContent = await fs.readFile(indexPath, "utf-8");
    const index: YelpLogIndex = JSON.parse(indexContent);

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

export async function getLogIndex(): Promise<YelpLogIndex> {
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

export async function getYelpCacheStats(): Promise<{
  total_requests: number;
  cache_hits: number;
  cache_hit_rate: number;
  entries_by_type: { search: number; business: number; reviews: number };
  memory_cache_size: number;
}> {
  const index = await getLogIndex();

  const byType = { search: 0, business: 0, reviews: 0 };
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

export function createYelpLogEntry(
  type: "search" | "business" | "reviews",
  request: YelpLogEntry["request"],
  response: YelpLogEntry["response"],
  durationMs: number,
  success: boolean,
  error?: string,
  cached?: boolean
): YelpLogEntry {
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
 * Wrapper for making cached Yelp API calls
 */
export async function cachedYelpFetch<T>(
  type: "search" | "business" | "reviews",
  endpoint: string,
  params: Record<string, string>,
  apiKey: string,
  locationInfo?: { location?: string }
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
  const queryParams = new URLSearchParams(params);
  const url = `${endpoint}?${queryParams}`;

  try {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${apiKey}`,
        Accept: "application/json",
      },
    });

    const data = await response.json();
    const duration = Date.now() - startTime;

    // Log the request
    const entry = createYelpLogEntry(
      type,
      {
        endpoint,
        params,
        location: locationInfo?.location,
      },
      {
        data,
        status: response.status,
      },
      duration,
      response.ok,
      response.ok ? undefined : `HTTP ${response.status}`
    );

    await logYelpRequest(entry, cacheKey);

    if (!response.ok) {
      const errorMsg = (data as { error?: { description?: string } }).error?.description || `HTTP ${response.status}`;
      throw new Error(`Yelp API error: ${errorMsg}`);
    }

    return data as T;
  } catch (error) {
    const duration = Date.now() - startTime;

    // Log failed request
    const entry = createYelpLogEntry(
      type,
      {
        endpoint,
        params,
        location: locationInfo?.location,
      },
      {
        data: null,
        status: 0,
      },
      duration,
      false,
      error instanceof Error ? error.message : "Unknown error"
    );

    await logYelpRequest(entry, cacheKey);
    throw error;
  }
}
