// ============================================
// ITINERARY STORE
// ============================================
// In-memory store for managing itinerary state during a session.
// In production, this would be backed by a database (Redis, PostgreSQL, etc.)

import { GeneratedItinerary, ItineraryStats } from "./itinerary-orchestrator";

// ============================================
// TYPES
// ============================================

/**
 * Store entry with metadata
 */
interface StoreEntry {
  itinerary: GeneratedItinerary;
  createdAt: Date;
  lastAccessedAt: Date;
  accessCount: number;
}

/**
 * Store configuration
 */
interface StoreConfig {
  maxEntries: number;
  ttlMs: number; // Time to live in milliseconds
  cleanupIntervalMs: number;
}

/**
 * Event types for store changes
 */
type StoreEventType = "created" | "updated" | "deleted" | "expired";

interface StoreEvent {
  type: StoreEventType;
  itineraryId: string;
  timestamp: Date;
}

type StoreEventListener = (event: StoreEvent) => void;

// ============================================
// DEFAULT CONFIG
// ============================================

const DEFAULT_CONFIG: StoreConfig = {
  maxEntries: 100,
  ttlMs: 24 * 60 * 60 * 1000, // 24 hours
  cleanupIntervalMs: 60 * 60 * 1000, // 1 hour
};

// ============================================
// ITINERARY STORE CLASS
// ============================================

export class ItineraryStore {
  private store: Map<string, StoreEntry>;
  private config: StoreConfig;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private listeners: Set<StoreEventListener>;

  constructor(config: Partial<StoreConfig> = {}) {
    this.store = new Map();
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.listeners = new Set();

    // Start cleanup interval
    this.startCleanup();
  }

  /**
   * Save an itinerary to the store
   */
  save(itinerary: GeneratedItinerary): void {
    const now = new Date();

    // Check if we need to evict old entries
    if (this.store.size >= this.config.maxEntries) {
      this.evictOldest();
    }

    const isNew = !this.store.has(itinerary.id);

    this.store.set(itinerary.id, {
      itinerary,
      createdAt: isNew ? now : this.store.get(itinerary.id)!.createdAt,
      lastAccessedAt: now,
      accessCount: isNew ? 1 : this.store.get(itinerary.id)!.accessCount + 1,
    });

    this.emit({
      type: isNew ? "created" : "updated",
      itineraryId: itinerary.id,
      timestamp: now,
    });
  }

  /**
   * Get an itinerary by ID
   */
  get(id: string): GeneratedItinerary | null {
    const entry = this.store.get(id);

    if (!entry) {
      return null;
    }

    // Check if expired
    const age = Date.now() - entry.createdAt.getTime();
    if (age > this.config.ttlMs) {
      this.delete(id);
      return null;
    }

    // Update access time
    entry.lastAccessedAt = new Date();
    entry.accessCount++;

    return entry.itinerary;
  }

  /**
   * Check if itinerary exists
   */
  has(id: string): boolean {
    return this.store.has(id);
  }

  /**
   * Delete an itinerary
   */
  delete(id: string): boolean {
    const existed = this.store.delete(id);

    if (existed) {
      this.emit({
        type: "deleted",
        itineraryId: id,
        timestamp: new Date(),
      });
    }

    return existed;
  }

  /**
   * Get all itineraries (for a user, in production would filter by userId)
   */
  getAll(): GeneratedItinerary[] {
    const now = Date.now();
    const result: GeneratedItinerary[] = [];

    for (const [id, entry] of this.store) {
      const age = now - entry.createdAt.getTime();
      if (age > this.config.ttlMs) {
        this.delete(id);
      } else {
        result.push(entry.itinerary);
      }
    }

    return result;
  }

  /**
   * Get itineraries by status
   */
  getByStatus(status: GeneratedItinerary["status"]): GeneratedItinerary[] {
    return this.getAll().filter((i) => i.status === status);
  }

  /**
   * Get recent itineraries
   */
  getRecent(limit: number = 10): GeneratedItinerary[] {
    return this.getAll()
      .sort((a, b) =>
        new Date(b.lastModifiedAt).getTime() - new Date(a.lastModifiedAt).getTime()
      )
      .slice(0, limit);
  }

  /**
   * Update an itinerary (partial update)
   */
  update(
    id: string,
    updates: Partial<GeneratedItinerary>
  ): GeneratedItinerary | null {
    const entry = this.store.get(id);

    if (!entry) {
      return null;
    }

    const updatedItinerary = {
      ...entry.itinerary,
      ...updates,
      lastModifiedAt: new Date().toISOString(),
    };

    entry.itinerary = updatedItinerary;
    entry.lastAccessedAt = new Date();

    this.emit({
      type: "updated",
      itineraryId: id,
      timestamp: new Date(),
    });

    return updatedItinerary;
  }

  /**
   * Get store statistics
   */
  getStats(): {
    totalEntries: number;
    oldestEntry: Date | null;
    newestEntry: Date | null;
    averageAccessCount: number;
  } {
    let oldest: Date | null = null;
    let newest: Date | null = null;
    let totalAccess = 0;

    for (const entry of this.store.values()) {
      if (!oldest || entry.createdAt < oldest) {
        oldest = entry.createdAt;
      }
      if (!newest || entry.createdAt > newest) {
        newest = entry.createdAt;
      }
      totalAccess += entry.accessCount;
    }

    return {
      totalEntries: this.store.size,
      oldestEntry: oldest,
      newestEntry: newest,
      averageAccessCount: this.store.size > 0 ? totalAccess / this.store.size : 0,
    };
  }

  /**
   * Clear all entries
   */
  clear(): void {
    const ids = [...this.store.keys()];
    this.store.clear();

    for (const id of ids) {
      this.emit({
        type: "deleted",
        itineraryId: id,
        timestamp: new Date(),
      });
    }
  }

  /**
   * Subscribe to store events
   */
  subscribe(listener: StoreEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Cleanup and destroy the store
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
    this.listeners.clear();
  }

  // ============================================
  // PRIVATE METHODS
  // ============================================

  private emit(event: StoreEvent): void {
    for (const listener of this.listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[ItineraryStore] Listener error:", error);
      }
    }
  }

  private evictOldest(): void {
    let oldestId: string | null = null;
    let oldestTime: number = Infinity;

    for (const [id, entry] of this.store) {
      if (entry.lastAccessedAt.getTime() < oldestTime) {
        oldestTime = entry.lastAccessedAt.getTime();
        oldestId = id;
      }
    }

    if (oldestId) {
      this.delete(oldestId);
    }
  }

  private startCleanup(): void {
    this.cleanupInterval = setInterval(() => {
      const now = Date.now();
      const expired: string[] = [];

      for (const [id, entry] of this.store) {
        const age = now - entry.createdAt.getTime();
        if (age > this.config.ttlMs) {
          expired.push(id);
        }
      }

      for (const id of expired) {
        this.store.delete(id);
        this.emit({
          type: "expired",
          itineraryId: id,
          timestamp: new Date(),
        });
      }

      if (expired.length > 0) {
        console.log(`[ItineraryStore] Cleaned up ${expired.length} expired entries`);
      }
    }, this.config.cleanupIntervalMs);
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let storeInstance: ItineraryStore | null = null;

/**
 * Get the singleton store instance
 */
export function getItineraryStore(): ItineraryStore {
  if (!storeInstance) {
    storeInstance = new ItineraryStore();
  }
  return storeInstance;
}

/**
 * Create a new store instance (for testing)
 */
export function createItineraryStore(
  config?: Partial<StoreConfig>
): ItineraryStore {
  return new ItineraryStore(config);
}
