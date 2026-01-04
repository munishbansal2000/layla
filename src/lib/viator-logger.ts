// Only import fs on server-side (not in browser)
const isServer = typeof window === "undefined";
let fs: typeof import("fs").promises | null = null;
let path: typeof import("path") | null = null;

// Lazy load fs and path modules (server-only)
async function getFs() {
  if (!isServer) return null;
  if (!fs) {
    fs = (await import("fs")).promises;
  }
  return fs;
}

async function getPath() {
  if (!isServer) return null;
  if (!path) {
    path = await import("path");
  }
  return path;
}

// ===========================================
// Viator API Request/Response Logging Types
// ===========================================

export interface ViatorLogEntry {
  id: string;
  timestamp: string;
  type: "search" | "destinations" | "product-details" | "availability" | "freetext" | "attractions";

  // Request details
  request: {
    endpoint: string;
    method: string;
    params: Record<string, unknown>;
  };

  // Response details
  response: {
    products?: unknown[];
    totalCount?: number;
    currency?: string;
    data?: unknown;
  };

  // Metadata
  metadata: {
    duration_ms: number;
    success: boolean;
    error?: string;
    destination?: string;
    productCode?: string;
  };
}

export interface ViatorLogIndex {
  total_entries: number;
  last_updated: string;
  entries: Array<{
    id: string;
    timestamp: string;
    type: ViatorLogEntry["type"];
    preview: string;
    success: boolean;
    cacheKey: string;
  }>;
}

// ===========================================
// Logger Configuration
// ===========================================

const LOG_DIR = process.env.VIATOR_LOG_DIR || "./viator-logs";
const MAX_LOG_ENTRIES = 500;

async function ensureLogDir(): Promise<void> {
  const fsModule = await getFs();
  if (!fsModule) return; // Skip on client-side

  try {
    await fsModule.access(LOG_DIR);
  } catch {
    await fsModule.mkdir(LOG_DIR, { recursive: true });
  }
}

function generateLogId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `viator_${timestamp}_${random}`;
}

function getDatePath(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

/**
 * Generate a cache key for a Viator request
 * Used for matching replay requests
 */
export function generateCacheKey(
  type: ViatorLogEntry["type"],
  params: Record<string, unknown>
): string {
  const relevantParams: Record<string, unknown> = {};

switch (type) {
    case "search":
      relevantParams.destId = params.destId;
      relevantParams.destName = params.destName;
      relevantParams.tags = params.tags;
      relevantParams.sortOrder = params.sortOrder;
      relevantParams.count = params.count;
      break;
    case "destinations":
      relevantParams.query = params.query;
      break;
    case "product-details":
      relevantParams.productCode = params.productCode;
      break;
    case "availability":
      relevantParams.productCode = params.productCode;
      relevantParams.date = params.date;
      break;
    case "freetext":
      relevantParams.searchTerm = params.searchTerm;
      relevantParams.count = params.count;
      break;
    case "attractions":
      relevantParams.destId = params.destId;
      relevantParams.count = params.count;
      break;
  }

  // Sort keys and stringify for consistent hashing
  const sorted = Object.keys(relevantParams)
    .sort()
    .reduce((acc, key) => {
      if (relevantParams[key] !== undefined) {
        acc[key] = relevantParams[key];
      }
      return acc;
    }, {} as Record<string, unknown>);

  return `${type}:${JSON.stringify(sorted)}`;
}

// ===========================================
// Core Logging Functions
// ===========================================

export async function logViatorRequest(entry: ViatorLogEntry): Promise<string> {
  const fsModule = await getFs();
  const pathModule = await getPath();
  if (!fsModule || !pathModule) {
    console.log("[ViatorLogger] Skipping log - not running on server");
    return entry.id;
  }

  await ensureLogDir();

  const datePath = getDatePath();
  const fullDir = pathModule.join(LOG_DIR, datePath);

  await fsModule.mkdir(fullDir, { recursive: true });

  const logFile = pathModule.join(fullDir, `${entry.id}.json`);
  await fsModule.writeFile(logFile, JSON.stringify(entry, null, 2));

  await updateViatorLogIndex(entry);

  return entry.id;
}

async function updateViatorLogIndex(entry: ViatorLogEntry): Promise<void> {
  const fsModule = await getFs();
  const pathModule = await getPath();
  if (!fsModule || !pathModule) return;

  const indexPath = pathModule.join(LOG_DIR, "index.json");

  let index: ViatorLogIndex;

  try {
    const content = await fsModule.readFile(indexPath, "utf-8");
    index = JSON.parse(content);
  } catch {
    index = {
      total_entries: 0,
      last_updated: new Date().toISOString(),
      entries: [],
    };
  }

  // Generate cache key for this request
  const cacheKey = generateCacheKey(entry.type, entry.request.params);

  // Generate preview
  let preview = "";
  if (entry.type === "search") {
    const dest = entry.metadata.destination || entry.request.params.destName || entry.request.params.destId;
    preview = `Search: ${dest} (${entry.response.totalCount || 0} results)`;
  } else if (entry.type === "destinations") {
    preview = `Destinations: ${entry.request.params.query}`;
  } else if (entry.type === "product-details") {
    preview = `Product: ${entry.metadata.productCode}`;
  } else {
    preview = `${entry.type}: ${JSON.stringify(entry.request.params).substring(0, 50)}`;
  }

  // Remove existing entry with same cache key (update cache)
  index.entries = index.entries.filter((e) => e.cacheKey !== cacheKey);

  // Add new entry to the beginning
  index.entries.unshift({
    id: entry.id,
    timestamp: entry.timestamp,
    type: entry.type,
    preview,
    success: entry.metadata.success,
    cacheKey,
  });

  // Keep only the most recent entries
  if (index.entries.length > MAX_LOG_ENTRIES) {
    index.entries = index.entries.slice(0, MAX_LOG_ENTRIES);
  }

  index.total_entries++;
  index.last_updated = new Date().toISOString();

  await fsModule.writeFile(indexPath, JSON.stringify(index, null, 2));
}

// ===========================================
// Retrieval Functions
// ===========================================

export async function getViatorLogEntry(id: string): Promise<ViatorLogEntry | null> {
  const fsModule = await getFs();
  const pathModule = await getPath();
  if (!fsModule || !pathModule) return null;

  await ensureLogDir();

  const indexPath = pathModule.join(LOG_DIR, "index.json");

  try {
    const indexContent = await fsModule.readFile(indexPath, "utf-8");
    const index: ViatorLogIndex = JSON.parse(indexContent);

    const entry = index.entries.find((e) => e.id === id);
    if (entry) {
      const date = new Date(entry.timestamp);
      const datePath = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
      const logFile = pathModule.join(LOG_DIR, datePath, `${id}.json`);

      const content = await fsModule.readFile(logFile, "utf-8");
      return JSON.parse(content);
    }
  } catch {
    // Entry not found
  }

  return null;
}

export async function getViatorLogIndex(): Promise<ViatorLogIndex> {
  const fsModule = await getFs();
  const pathModule = await getPath();
  if (!fsModule || !pathModule) {
    return {
      total_entries: 0,
      last_updated: new Date().toISOString(),
      entries: [],
    };
  }

  await ensureLogDir();

  const indexPath = pathModule.join(LOG_DIR, "index.json");

  try {
    const content = await fsModule.readFile(indexPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      total_entries: 0,
      last_updated: new Date().toISOString(),
      entries: [],
    };
  }
}

// ===========================================
// Replay Functions
// ===========================================

export interface ViatorReplayMatch {
  found: boolean;
  entry?: ViatorLogEntry;
  cacheKey?: string;
  age?: number; // Age in milliseconds
}

/**
 * Find a cached response for a Viator request
 * Returns the cached response if found and not expired
 */
export async function findViatorReplayMatch(
  type: ViatorLogEntry["type"],
  params: Record<string, unknown>,
  maxAgeMs: number = 24 * 60 * 60 * 1000 // Default: 24 hours
): Promise<ViatorReplayMatch> {
  const cacheKey = generateCacheKey(type, params);
  const index = await getViatorLogIndex();

  // Find entry with matching cache key
  const candidate = index.entries.find(
    (e) => e.cacheKey === cacheKey && e.success
  );

  if (!candidate) {
    return { found: false, cacheKey };
  }

  // Check if cache is expired
  const entryTime = new Date(candidate.timestamp).getTime();
  const age = Date.now() - entryTime;

  if (age > maxAgeMs) {
    console.log(`[Viator Cache] Entry expired (age: ${Math.round(age / 1000 / 60)} min)`);
    return { found: false, cacheKey };
  }

  // Load full entry
  const entry = await getViatorLogEntry(candidate.id);

  if (!entry) {
    return { found: false, cacheKey };
  }

  console.log(`[Viator Cache] HIT - ${cacheKey} (age: ${Math.round(age / 1000 / 60)} min)`);

  return {
    found: true,
    entry,
    cacheKey,
    age,
  };
}

// ===========================================
// Helper to Create Log Entry
// ===========================================

export function createViatorLogEntry(
  type: ViatorLogEntry["type"],
  endpoint: string,
  method: string,
  params: Record<string, unknown>,
  response: ViatorLogEntry["response"],
  durationMs: number,
  success: boolean,
  error?: string,
  metadata?: Partial<ViatorLogEntry["metadata"]>
): ViatorLogEntry {
  return {
    id: generateLogId(),
    timestamp: new Date().toISOString(),
    type,
    request: {
      endpoint,
      method,
      params,
    },
    response,
    metadata: {
      duration_ms: durationMs,
      success,
      error,
      ...metadata,
    },
  };
}

// ===========================================
// Cache Statistics
// ===========================================

export async function getViatorCacheStats(): Promise<{
  total: number;
  byType: Record<string, number>;
  hitRate: number;
  oldestEntry: string | null;
  newestEntry: string | null;
}> {
  const index = await getViatorLogIndex();

  const byType: Record<string, number> = {};
  for (const entry of index.entries) {
    byType[entry.type] = (byType[entry.type] || 0) + 1;
  }

  return {
    total: index.entries.length,
    byType,
    hitRate: 0, // Would need to track hits/misses separately
    oldestEntry: index.entries[index.entries.length - 1]?.timestamp || null,
    newestEntry: index.entries[0]?.timestamp || null,
  };
}

/**
 * Clear expired cache entries
 */
export async function clearExpiredViatorCache(maxAgeMs: number = 7 * 24 * 60 * 60 * 1000): Promise<number> {
  const fsModule = await getFs();
  const pathModule = await getPath();
  if (!fsModule || !pathModule) return 0;

  const index = await getViatorLogIndex();
  const cutoffTime = Date.now() - maxAgeMs;
  let deletedCount = 0;

  const validEntries = [];

  for (const entry of index.entries) {
    const entryTime = new Date(entry.timestamp).getTime();

    if (entryTime < cutoffTime) {
      // Delete old file
      try {
        const date = new Date(entry.timestamp);
        const datePath = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
        const logFile = pathModule.join(LOG_DIR, datePath, `${entry.id}.json`);
        await fsModule.unlink(logFile);
        deletedCount++;
      } catch {
        // File may already be deleted
      }
    } else {
      validEntries.push(entry);
    }
  }

  // Update index
  index.entries = validEntries;
  index.last_updated = new Date().toISOString();

  const indexPath = pathModule.join(LOG_DIR, "index.json");
  await fsModule.writeFile(indexPath, JSON.stringify(index, null, 2));

  return deletedCount;
}
