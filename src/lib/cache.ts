/**
 * Shared Cache Utility
 *
 * Provides in-memory caching with TTL support for all API integrations.
 * Reduces API calls and enables offline fallback.
 *
 * Features:
 * - Memory cache with configurable TTL
 * - Automatic cleanup of expired entries
 * - Size limits to prevent memory bloat
 * - Cache statistics for monitoring
 */

// ============================================
// TYPES
// ============================================

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  createdAt: number;
}

interface CacheStats {
  hits: number;
  misses: number;
  size: number;
  oldestEntry: number | null;
}

interface CacheOptions {
  ttlMs?: number; // Time to live in milliseconds
  maxSize?: number; // Maximum number of entries
  namespace?: string; // Prefix for cache keys
}

// ============================================
// DEFAULT SETTINGS
// ============================================

const DEFAULT_TTL_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_MAX_SIZE = 1000;

// ============================================
// MEMORY CACHE
// ============================================

class MemoryCache {
  private cache: Map<string, CacheEntry<unknown>> = new Map();
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    size: 0,
    oldestEntry: null,
  };
  private cleanupInterval: NodeJS.Timeout | null = null;

  constructor() {
    // Run cleanup every minute
    if (typeof setInterval !== "undefined") {
      this.cleanupInterval = setInterval(() => this.cleanup(), 60 * 1000);
    }
  }

  /**
   * Get a value from cache
   */
  get<T>(key: string): T | null {
    const entry = this.cache.get(key) as CacheEntry<T> | undefined;

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.stats.misses++;
      this.updateStats();
      return null;
    }

    this.stats.hits++;
    return entry.data;
  }

  /**
   * Set a value in cache
   */
  set<T>(key: string, data: T, ttlMs: number = DEFAULT_TTL_MS): void {
    const now = Date.now();

    this.cache.set(key, {
      data,
      expiresAt: now + ttlMs,
      createdAt: now,
    });

    this.updateStats();

    // Enforce max size
    if (this.cache.size > DEFAULT_MAX_SIZE) {
      this.evictOldest();
    }
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      this.updateStats();
      return false;
    }

    return true;
  }

  /**
   * Delete a specific key
   */
  delete(key: string): boolean {
    const result = this.cache.delete(key);
    this.updateStats();
    return result;
  }

  /**
   * Clear all entries with a specific prefix
   */
  clearPrefix(prefix: string): number {
    let count = 0;
    for (const key of this.cache.keys()) {
      if (key.startsWith(prefix)) {
        this.cache.delete(key);
        count++;
      }
    }
    this.updateStats();
    return count;
  }

  /**
   * Clear all cache entries
   */
  clear(): void {
    this.cache.clear();
    this.stats = {
      hits: 0,
      misses: 0,
      size: 0,
      oldestEntry: null,
    };
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    return { ...this.stats };
  }

  /**
   * Get cache hit rate
   */
  getHitRate(): number {
    const total = this.stats.hits + this.stats.misses;
    return total === 0 ? 0 : this.stats.hits / total;
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        this.cache.delete(key);
      }
    }
    this.updateStats();
  }

  /**
   * Evict oldest entries when cache is full
   */
  private evictOldest(): void {
    const entries = Array.from(this.cache.entries());
    entries.sort((a, b) => a[1].createdAt - b[1].createdAt);

    // Remove oldest 10%
    const toRemove = Math.max(1, Math.floor(entries.length * 0.1));
    for (let i = 0; i < toRemove; i++) {
      this.cache.delete(entries[i][0]);
    }
    this.updateStats();
  }

  /**
   * Update statistics
   */
  private updateStats(): void {
    this.stats.size = this.cache.size;

    let oldest: number | null = null;
    for (const entry of this.cache.values()) {
      if (oldest === null || entry.createdAt < oldest) {
        oldest = entry.createdAt;
      }
    }
    this.stats.oldestEntry = oldest;
  }

  /**
   * Destroy the cache and cleanup interval
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.clear();
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

const globalCache = new MemoryCache();

// ============================================
// CACHE KEY GENERATORS
// ============================================

/**
 * Generate cache key with namespace
 */
export function cacheKey(namespace: string, ...parts: (string | number | boolean)[]): string {
  const sanitizedParts = parts.map((p) =>
    String(p)
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "_")
  );
  return `${namespace}:${sanitizedParts.join(":")}`;
}

// ============================================
// CACHE WRAPPER FUNCTIONS
// ============================================

/**
 * Get or fetch pattern - check cache first, fetch if missing
 */
export async function getOrFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: CacheOptions
): Promise<T> {
  const fullKey = options?.namespace ? `${options.namespace}:${key}` : key;

  // Check cache first
  const cached = globalCache.get<T>(fullKey);
  if (cached !== null) {
    return cached;
  }

  // Fetch and cache
  const data = await fetcher();
  globalCache.set(fullKey, data, options?.ttlMs || DEFAULT_TTL_MS);

  return data;
}

/**
 * Cache a value
 */
export function setCache<T>(key: string, data: T, options?: CacheOptions): void {
  const fullKey = options?.namespace ? `${options.namespace}:${key}` : key;
  globalCache.set(fullKey, data, options?.ttlMs || DEFAULT_TTL_MS);
}

/**
 * Get from cache
 */
export function getCache<T>(key: string, namespace?: string): T | null {
  const fullKey = namespace ? `${namespace}:${key}` : key;
  return globalCache.get<T>(fullKey);
}

/**
 * Check if cached
 */
export function hasCache(key: string, namespace?: string): boolean {
  const fullKey = namespace ? `${namespace}:${key}` : key;
  return globalCache.has(fullKey);
}

/**
 * Clear cache by namespace
 */
export function clearCacheNamespace(namespace: string): number {
  return globalCache.clearPrefix(`${namespace}:`);
}

/**
 * Clear all cache
 */
export function clearAllCache(): void {
  globalCache.clear();
}

/**
 * Get cache statistics
 */
export function getCacheStats(): CacheStats {
  return globalCache.getStats();
}

// ============================================
// TTL PRESETS (in milliseconds)
// ============================================

export const CACHE_TTL = {
  // Very short - for real-time data
  REALTIME: 30 * 1000, // 30 seconds

  // Short - for frequently changing data
  SHORT: 5 * 60 * 1000, // 5 minutes

  // Medium - for semi-static data
  MEDIUM: 30 * 60 * 1000, // 30 minutes

  // Long - for slowly changing data
  LONG: 2 * 60 * 60 * 1000, // 2 hours

  // Very long - for static data
  STATIC: 24 * 60 * 60 * 1000, // 24 hours

  // Specific use cases
  EXCHANGE_RATES: 60 * 60 * 1000, // 1 hour
  WEATHER: 15 * 60 * 1000, // 15 minutes
  TRANSIT_ALERTS: 2 * 60 * 1000, // 2 minutes
  FLIGHT_STATUS: 5 * 60 * 1000, // 5 minutes
  PLACE_DETAILS: 24 * 60 * 60 * 1000, // 24 hours
  SEARCH_RESULTS: 30 * 60 * 1000, // 30 minutes
  TRANSLATION: 7 * 24 * 60 * 60 * 1000, // 7 days
  EMERGENCY_INFO: 30 * 24 * 60 * 60 * 1000, // 30 days (static data)
};

// ============================================
// NAMESPACE PRESETS
// ============================================

export const CACHE_NS = {
  TRANSLATION: "translation",
  PLACES: "places",
  WEATHER: "weather",
  FLIGHTS: "flights",
  TRANSIT: "transit",
  CURRENCY: "currency",
  EVENTS: "events",
  BOOKING: "booking",
  MAPS: "maps",
  EMERGENCY: "emergency",
  ADVISORY: "advisory",
};

export default {
  get: getCache,
  set: setCache,
  has: hasCache,
  getOrFetch,
  cacheKey,
  clearNamespace: clearCacheNamespace,
  clearAll: clearAllCache,
  getStats: getCacheStats,
  TTL: CACHE_TTL,
  NS: CACHE_NS,
};
