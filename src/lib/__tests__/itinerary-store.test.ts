// ============================================
// ITINERARY STORE TESTS
// ============================================
// e2e tests for the in-memory itinerary store

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { ItineraryStore, createItineraryStore } from "../itinerary-store";
import { GeneratedItinerary } from "../itinerary-orchestrator";
import {
  createMockScoredActivities,
  resetIdCounter,
  MOCK_DESTINATIONS,
} from "./mock-factories";

// ============================================
// MOCK ITINERARY FACTORY
// ============================================

function createMockItinerary(overrides: Partial<GeneratedItinerary> = {}): GeneratedItinerary {
  const id = `itin-test-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;
  const scoredActivities = createMockScoredActivities(10);

  return {
    id,
    status: "draft",
    destination: {
      name: "Tokyo",
      coordinates: MOCK_DESTINATIONS.tokyo,
      country: "Japan",
    },
    dateRange: {
      start: "2025-02-01",
      end: "2025-02-05",
      totalDays: 5,
    },
    tripMode: "couples",
    pace: "normal",
    budget: "moderate",
    days: [],
    activityPool: scoredActivities.map((s) => s.activity),
    scoredActivities,
    swipeQueue: scoredActivities.slice(0, 5),
    keptActivities: [],
    rejectedActivities: [],
    savedForLater: [],
    stats: {
      totalActivities: 10,
      totalMeals: 5,
      estimatedCost: { min: 500, max: 800, currency: "USD" },
      freeActivities: 3,
      averageScore: 78,
      neighborhoods: ["Shibuya", "Shinjuku"],
      categories: { temple: 2, museum: 3, restaurant: 5 },
    },
    generatedAt: new Date().toISOString(),
    lastModifiedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================
// TEST SUITE
// ============================================

describe("ItineraryStore", () => {
  let store: ItineraryStore;

  beforeEach(() => {
    resetIdCounter();
    // Create store with short TTL and no cleanup interval for testing
    store = createItineraryStore({
      maxEntries: 10,
      ttlMs: 1000, // 1 second TTL for testing
      cleanupIntervalMs: 100000, // Long interval so it doesn't interfere
    });
  });

  afterEach(() => {
    store.destroy();
  });

  // ============================================
  // BASIC CRUD OPERATIONS
  // ============================================

  describe("CRUD Operations", () => {
    it("should save and retrieve an itinerary", () => {
      const itinerary = createMockItinerary();

      store.save(itinerary);
      const retrieved = store.get(itinerary.id);

      expect(retrieved).not.toBeNull();
      expect(retrieved?.id).toBe(itinerary.id);
      expect(retrieved?.destination.name).toBe("Tokyo");
    });

    it("should return null for non-existent itinerary", () => {
      const result = store.get("non-existent-id");
      expect(result).toBeNull();
    });

    it("should check if itinerary exists", () => {
      const itinerary = createMockItinerary();

      expect(store.has(itinerary.id)).toBe(false);
      store.save(itinerary);
      expect(store.has(itinerary.id)).toBe(true);
    });

    it("should delete an itinerary", () => {
      const itinerary = createMockItinerary();
      store.save(itinerary);

      expect(store.has(itinerary.id)).toBe(true);
      const deleted = store.delete(itinerary.id);

      expect(deleted).toBe(true);
      expect(store.has(itinerary.id)).toBe(false);
    });

    it("should return false when deleting non-existent itinerary", () => {
      const deleted = store.delete("non-existent-id");
      expect(deleted).toBe(false);
    });

    it("should update an existing itinerary", async () => {
      const itinerary = createMockItinerary({ status: "draft" });
      const originalModifiedAt = itinerary.lastModifiedAt;
      store.save(itinerary);

      // Wait to ensure timestamp difference
      await new Promise((r) => setTimeout(r, 10));
      const updated = store.update(itinerary.id, { status: "confirmed" });

      expect(updated).not.toBeNull();
      expect(updated?.status).toBe("confirmed");
      expect(updated?.lastModifiedAt).not.toBe(originalModifiedAt);
    });

    it("should return null when updating non-existent itinerary", () => {
      const updated = store.update("non-existent-id", { status: "confirmed" });
      expect(updated).toBeNull();
    });
  });

  // ============================================
  // QUERY OPERATIONS
  // ============================================

  describe("Query Operations", () => {
    it("should get all itineraries", () => {
      const itinerary1 = createMockItinerary();
      const itinerary2 = createMockItinerary();
      const itinerary3 = createMockItinerary();

      store.save(itinerary1);
      store.save(itinerary2);
      store.save(itinerary3);

      const all = store.getAll();
      expect(all).toHaveLength(3);
    });

    it("should get itineraries by status", () => {
      const draft = createMockItinerary({ status: "draft" });
      const confirmed1 = createMockItinerary({ status: "confirmed" });
      const confirmed2 = createMockItinerary({ status: "confirmed" });

      store.save(draft);
      store.save(confirmed1);
      store.save(confirmed2);

      const confirmedItineraries = store.getByStatus("confirmed");
      expect(confirmedItineraries).toHaveLength(2);

      const draftItineraries = store.getByStatus("draft");
      expect(draftItineraries).toHaveLength(1);
    });

    it("should get recent itineraries sorted by lastModifiedAt", async () => {
      const itinerary1 = createMockItinerary();
      await new Promise((r) => setTimeout(r, 10));
      const itinerary2 = createMockItinerary();
      await new Promise((r) => setTimeout(r, 10));
      const itinerary3 = createMockItinerary();

      store.save(itinerary1);
      store.save(itinerary2);
      store.save(itinerary3);

      const recent = store.getRecent(2);
      expect(recent).toHaveLength(2);
      // Most recent first
      expect(recent[0].id).toBe(itinerary3.id);
    });
  });

  // ============================================
  // CAPACITY & EVICTION
  // ============================================

  describe("Capacity & Eviction", () => {
    it("should evict oldest entry when max capacity reached", () => {
      const itineraries: GeneratedItinerary[] = [];

      // Create 10 itineraries (max capacity)
      for (let i = 0; i < 10; i++) {
        const itin = createMockItinerary();
        itineraries.push(itin);
        store.save(itin);
      }

      expect(store.getAll()).toHaveLength(10);

      // Save one more - should evict the oldest
      const newItinerary = createMockItinerary();
      store.save(newItinerary);

      expect(store.getAll()).toHaveLength(10);
      expect(store.has(newItinerary.id)).toBe(true);
      // First one should be evicted
      expect(store.has(itineraries[0].id)).toBe(false);
    });
  });

  // ============================================
  // TTL & EXPIRATION
  // ============================================

  describe("TTL & Expiration", () => {
    it("should expire itinerary after TTL", async () => {
      const itinerary = createMockItinerary();
      store.save(itinerary);

      expect(store.get(itinerary.id)).not.toBeNull();

      // Wait for TTL to expire
      await new Promise((r) => setTimeout(r, 1100));

      // Should be expired now
      expect(store.get(itinerary.id)).toBeNull();
    });
  });

  // ============================================
  // EVENT SUBSCRIPTION
  // ============================================

  describe("Event Subscription", () => {
    it("should emit events on save (create)", () => {
      const events: Array<{ type: string; itineraryId: string }> = [];
      store.subscribe((event) => events.push(event));

      const itinerary = createMockItinerary();
      store.save(itinerary);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("created");
      expect(events[0].itineraryId).toBe(itinerary.id);
    });

    it("should emit events on save (update)", () => {
      const events: Array<{ type: string; itineraryId: string }> = [];
      const itinerary = createMockItinerary();
      store.save(itinerary);

      store.subscribe((event) => events.push(event));
      store.save({ ...itinerary, status: "confirmed" });

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("updated");
    });

    it("should emit events on delete", () => {
      const events: Array<{ type: string; itineraryId: string }> = [];
      const itinerary = createMockItinerary();
      store.save(itinerary);

      store.subscribe((event) => events.push(event));
      store.delete(itinerary.id);

      expect(events).toHaveLength(1);
      expect(events[0].type).toBe("deleted");
    });

    it("should allow unsubscribing", () => {
      const events: Array<{ type: string }> = [];
      const unsubscribe = store.subscribe((event) => events.push(event));

      store.save(createMockItinerary());
      expect(events).toHaveLength(1);

      unsubscribe();
      store.save(createMockItinerary());
      expect(events).toHaveLength(1); // Still 1, unsubscribed
    });
  });

  // ============================================
  // STATISTICS
  // ============================================

  describe("Statistics", () => {
    it("should track store statistics", () => {
      const itinerary1 = createMockItinerary();
      const itinerary2 = createMockItinerary();

      store.save(itinerary1);
      store.save(itinerary2);

      // Access itinerary1 multiple times
      store.get(itinerary1.id);
      store.get(itinerary1.id);
      store.get(itinerary1.id);

      const stats = store.getStats();
      expect(stats.totalEntries).toBe(2);
      expect(stats.oldestEntry).not.toBeNull();
      expect(stats.newestEntry).not.toBeNull();
      expect(stats.averageAccessCount).toBeGreaterThan(1);
    });
  });

  // ============================================
  // CLEAR & DESTROY
  // ============================================

  describe("Clear & Destroy", () => {
    it("should clear all entries", () => {
      store.save(createMockItinerary());
      store.save(createMockItinerary());
      store.save(createMockItinerary());

      expect(store.getAll()).toHaveLength(3);

      store.clear();
      expect(store.getAll()).toHaveLength(0);
    });

    it("should emit delete events for each entry on clear", () => {
      const events: Array<{ type: string }> = [];
      store.subscribe((event) => events.push(event));

      store.save(createMockItinerary());
      store.save(createMockItinerary());
      events.length = 0; // Reset events

      store.clear();
      expect(events.filter((e) => e.type === "deleted")).toHaveLength(2);
    });
  });
});
