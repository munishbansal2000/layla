// ============================================
// API ENDPOINT TESTS
// ============================================
// Integration tests for the itinerary API endpoints
// Tests the full request/response cycle with mocked data

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import { POST } from "@/app/api/itinerary/generate/route";
import {
  GET as getItinerary,
  PUT as updateItinerary,
  DELETE as deleteItinerary,
} from "@/app/api/itinerary/[id]/route";
import {
  GET as getSlot,
  PUT as swapSlot,
} from "@/app/api/itinerary/[id]/slot/[slotId]/route";
import { ItineraryStore, createItineraryStore } from "@/lib/itinerary-store";
import { GeneratedItinerary } from "@/lib/itinerary-orchestrator";
import {
  createMockScoredActivities,
  createMockGenerateRequest,
  resetIdCounter,
  MOCK_DESTINATIONS,
} from "./mock-factories";
import { DaySchedule, ScheduledActivity } from "../schedule-builder";

// ============================================
// MOCK SETUP
// ============================================

// Mock the itinerary store
let mockStore: ItineraryStore;

vi.mock("@/lib/itinerary-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/itinerary-store")>("@/lib/itinerary-store");
  return {
    ...actual,
    getItineraryStore: () => mockStore,
  };
});

// Create a mock orchestrator with all methods
function createMockOrchestrator() {
  const actualOrchestrator = {
    generateItinerary: vi.fn().mockImplementation(async (request: any) => {
      return createMockGeneratedItinerary({
        destination: request.destination,
        tripMode: request.tripMode,
        pace: request.pace,
        budget: request.budget,
        dateRange: {
          start: request.startDate,
          end: request.endDate,
          totalDays: 3,
        },
      });
    }),

    getSwapOptions: vi.fn().mockImplementation((itinerary: GeneratedItinerary, slotId: string) => {
      for (let dayIndex = 0; dayIndex < itinerary.days.length; dayIndex++) {
        const day = itinerary.days[dayIndex];
        const slot = day.slots?.find((s: any) => s.slotId === slotId);
        if (slot) {
          return {
            slotId,
            dayIndex,
            scheduledActivity: slot,
            alternatives: slot.alternatives?.map((alt: any) => ({
              activity: alt,
              commuteFromPrevious: 10,
              commuteToNext: 10,
              categoryMatch: true,
              budgetMatch: true,
              durationDelta: 0,
              distanceFromCurrent: 500,
              swapScore: alt.totalScore,
              reason: "Similar activity nearby",
              benefits: ["Similar rating", "Close by"],
              tradeoffs: [],
            })) || [],
          };
        }
      }
      return null;
    }),

    swapActivity: vi.fn().mockImplementation((itinerary: GeneratedItinerary, slotId: string, newActivityId: string) => {
      const newActivity = itinerary.scoredActivities.find((sa: any) => sa.activity.id === newActivityId);
      if (!newActivity) {
        throw new Error(`Activity ${newActivityId} not found in activity pool`);
      }
      for (const day of itinerary.days) {
        const slotIndex = day.slots?.findIndex((s: any) => s.slotId === slotId) ?? -1;
        if (slotIndex !== -1 && day.slots) {
          const oldSlot = day.slots[slotIndex];
          day.slots[slotIndex] = {
            ...oldSlot,
            activity: newActivity,
            notes: `Swapped from ${oldSlot.activity.activity.name}`,
          };
          itinerary.lastModifiedAt = new Date().toISOString();
          return itinerary;
        }
      }
      throw new Error(`Slot ${slotId} not found in itinerary`);
    }),

    processSwipe: vi.fn().mockImplementation((itinerary: GeneratedItinerary, activityId: string, action: string) => {
      switch (action) {
        case "keep":
          itinerary.keptActivities.push(activityId);
          break;
        case "reject":
          itinerary.rejectedActivities.push(activityId);
          break;
        case "save-for-later":
          itinerary.savedForLater.push(activityId);
          break;
      }
      itinerary.swipeQueue = itinerary.swipeQueue.filter((sa: any) => sa.activity.id !== activityId);
      itinerary.lastModifiedAt = new Date().toISOString();
      return itinerary;
    }),

    lockActivity: vi.fn().mockImplementation((itinerary: GeneratedItinerary, slotId: string, locked: boolean) => {
      for (const day of itinerary.days) {
        const slot = day.slots?.find((s: any) => s.slotId === slotId);
        if (slot) {
          slot.isLocked = locked;
          itinerary.lastModifiedAt = new Date().toISOString();
          return itinerary;
        }
      }
      throw new Error(`Slot ${slotId} not found`);
    }),

    confirmItinerary: vi.fn().mockImplementation((itinerary: GeneratedItinerary) => {
      itinerary.status = "confirmed";
      itinerary.lastModifiedAt = new Date().toISOString();
      return itinerary;
    }),

    toLegacyTrip: vi.fn().mockImplementation((itinerary: GeneratedItinerary, userId: string) => {
      return {
        id: itinerary.id,
        userId,
        title: `Trip to ${itinerary.destination.name}`,
        destination: {
          lat: itinerary.destination.coordinates.lat,
          lng: itinerary.destination.coordinates.lng,
          city: itinerary.destination.name,
          country: itinerary.destination.country,
        },
        status: itinerary.status === "confirmed" ? "confirmed" : "planning",
        tripMode: itinerary.tripMode,
      };
    }),
  };

  return actualOrchestrator;
}

// Mock the orchestrator module
vi.mock("@/lib/itinerary-orchestrator", async () => {
  const actual = await vi.importActual<typeof import("@/lib/itinerary-orchestrator")>("@/lib/itinerary-orchestrator");
  return {
    ...actual,
    getItineraryOrchestrator: () => createMockOrchestrator(),
  };
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function createMockRequest(method: string, body?: any, url?: string): NextRequest {
  const init: Record<string, any> = {
    method,
  };

  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }

  return new NextRequest(
    new URL(url || "http://localhost:3000/api/itinerary"),
    init
  );
}

function createMockDaySchedule(dayNumber: number, scoredActivities: ReturnType<typeof createMockScoredActivities>): DaySchedule {
  const date = new Date();
  date.setDate(date.getDate() + dayNumber);
  const dateStr = date.toISOString().split("T")[0];

  const slots: ScheduledActivity[] = scoredActivities.slice(0, 4).map((activity, i) => ({
    slotId: `${dateStr}-slot-${i}`,
    activity,
    scheduledStart: `${9 + i * 3}:00`,
    scheduledEnd: `${11 + i * 3}:00`,
    actualDuration: 120,
    isLocked: false,
    alternatives: scoredActivities.slice(4, 7),
  }));

  return {
    date: dateStr,
    dayNumber,
    city: "Tokyo",
    dayType: dayNumber === 1 ? "arrival" : "full",
    slots,
    totalActivityTime: 480,
    totalCommuteTime: 60,
    totalCost: { amount: 150, currency: "USD" },
    neighborhoodsVisited: ["Shibuya", "Shinjuku"],
    categoriesCovered: ["temple", "museum", "restaurant"],
    warnings: [],
    paceScore: 70,
  };
}

function createMockGeneratedItinerary(overrides: Partial<GeneratedItinerary> = {}): GeneratedItinerary {
  const scoredActivities = createMockScoredActivities(20);
  const days = [
    createMockDaySchedule(1, scoredActivities),
    createMockDaySchedule(2, scoredActivities),
    createMockDaySchedule(3, scoredActivities),
  ];

  return {
    id: `itin-test-${Date.now()}`,
    status: "draft",
    destination: {
      name: "Tokyo",
      coordinates: MOCK_DESTINATIONS.tokyo,
      country: "Japan",
    },
    dateRange: {
      start: "2025-02-01",
      end: "2025-02-03",
      totalDays: 3,
    },
    tripMode: "couples",
    pace: "normal",
    budget: "moderate",
    days,
    activityPool: scoredActivities.map((s) => s.activity),
    scoredActivities,
    swipeQueue: scoredActivities.slice(12, 18),
    keptActivities: [],
    rejectedActivities: [],
    savedForLater: [],
    stats: {
      totalActivities: 12,
      totalMeals: 6,
      estimatedCost: { min: 500, max: 800, currency: "USD" },
      freeActivities: 4,
      averageScore: 82,
      neighborhoods: ["Shibuya", "Shinjuku", "Asakusa"],
      categories: { temple: 3, museum: 4, restaurant: 6, park: 2 },
    },
    generatedAt: new Date().toISOString(),
    lastModifiedAt: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================
// TEST SUITE
// ============================================

describe("Itinerary API Endpoints", () => {
  beforeEach(() => {
    resetIdCounter();
    mockStore = createItineraryStore({
      maxEntries: 100,
      ttlMs: 60000,
      cleanupIntervalMs: 60000,
    });
  });

  afterEach(() => {
    mockStore.destroy();
    vi.clearAllMocks();
  });

  // ============================================
  // POST /api/itinerary/generate
  // ============================================

  describe("POST /api/itinerary/generate", () => {
    it("should generate an itinerary with valid request", async () => {
      const request = createMockRequest("POST", createMockGenerateRequest());
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.itinerary).toBeDefined();
      expect(json.data.itinerary.destination.name).toBe("Tokyo");
      expect(json.data.meta).toBeDefined();
    });

    it("should return 400 for missing destination name", async () => {
      const body = createMockGenerateRequest();
      delete body.destination.name;
      const request = createMockRequest("POST", body);
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("INVALID_REQUEST");
      expect(json.error.message).toContain("Destination name");
    });

    it("should return 400 for missing coordinates", async () => {
      const body = createMockGenerateRequest();
      delete body.destination.coordinates;
      const request = createMockRequest("POST", body);
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.message).toContain("coordinates");
    });

    it("should return 400 for missing dates", async () => {
      const body = createMockGenerateRequest();
      delete body.startDate;
      const request = createMockRequest("POST", body);
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.message).toContain("dates");
    });

    it("should return 400 for invalid date format", async () => {
      const body = createMockGenerateRequest();
      body.startDate = "not-a-date";
      const request = createMockRequest("POST", body);
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.message).toContain("Invalid date");
    });

    it("should return 400 when end date is before start date", async () => {
      const body = createMockGenerateRequest();
      body.startDate = "2025-02-10";
      body.endDate = "2025-02-05";
      const request = createMockRequest("POST", body);
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.success).toBe(false);
      expect(json.error.message).toContain("End date must be after");
    });

    it("should use default values for optional fields", async () => {
      const body = {
        destination: {
          name: "Paris",
          coordinates: MOCK_DESTINATIONS.paris,
          country: "France",
        },
        startDate: "2025-03-01",
        endDate: "2025-03-03",
      };
      const request = createMockRequest("POST", body);
      const response = await POST(request);
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
    });

    it("should store the generated itinerary", async () => {
      const request = createMockRequest("POST", createMockGenerateRequest());
      const response = await POST(request);
      const json = await response.json();

      expect(json.success).toBe(true);
      const stored = mockStore.get(json.data.itinerary.id);
      expect(stored).not.toBeNull();
    });
  });

  // ============================================
  // GET /api/itinerary/[id]
  // ============================================

  describe("GET /api/itinerary/[id]", () => {
    it("should return itinerary for valid id", async () => {
      const itinerary = createMockGeneratedItinerary();
      mockStore.save(itinerary);

      const request = createMockRequest("GET", undefined, `http://localhost:3000/api/itinerary/${itinerary.id}`);
      const params = Promise.resolve({ id: itinerary.id });

      const response = await getItinerary(request, { params });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.itinerary.id).toBe(itinerary.id);
    });

    it("should return 404 for non-existent id", async () => {
      const request = createMockRequest("GET");
      const params = Promise.resolve({ id: "non-existent-id" });

      const response = await getItinerary(request, { params });
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.success).toBe(false);
      expect(json.error.code).toBe("NOT_FOUND");
    });
  });

  // ============================================
  // PUT /api/itinerary/[id]
  // ============================================

  describe("PUT /api/itinerary/[id]", () => {
    it("should confirm an itinerary", async () => {
      const itinerary = createMockGeneratedItinerary();
      mockStore.save(itinerary);

      const request = createMockRequest("PUT", { action: "confirm" });
      const params = Promise.resolve({ id: itinerary.id });

      const response = await updateItinerary(request, { params });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.itinerary.status).toBe("confirmed");
    });

    it("should lock a slot", async () => {
      const itinerary = createMockGeneratedItinerary();
      mockStore.save(itinerary);
      const slotId = itinerary.days[0].slots[0].slotId;

      const request = createMockRequest("PUT", { action: "lock", slotId, locked: true });
      const params = Promise.resolve({ id: itinerary.id });

      const response = await updateItinerary(request, { params });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.itinerary.days[0].slots[0].isLocked).toBe(true);
    });

    it("should return 400 for lock action without slotId", async () => {
      const itinerary = createMockGeneratedItinerary();
      mockStore.save(itinerary);

      const request = createMockRequest("PUT", { action: "lock" });
      const params = Promise.resolve({ id: itinerary.id });

      const response = await updateItinerary(request, { params });
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.message).toContain("slotId");
    });

    it("should process a swipe action", async () => {
      const itinerary = createMockGeneratedItinerary();
      mockStore.save(itinerary);
      const activityId = itinerary.swipeQueue[0].activity.id;

      const request = createMockRequest("PUT", {
        action: "swipe",
        activityId,
        swipeAction: "keep",
      });
      const params = Promise.resolve({ id: itinerary.id });

      const response = await updateItinerary(request, { params });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.itinerary.keptActivities).toContain(activityId);
    });

    it("should return 400 for swipe action without required fields", async () => {
      const itinerary = createMockGeneratedItinerary();
      mockStore.save(itinerary);

      const request = createMockRequest("PUT", { action: "swipe" });
      const params = Promise.resolve({ id: itinerary.id });

      const response = await updateItinerary(request, { params });
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.message).toContain("activityId");
    });

    it("should return 400 for unknown action", async () => {
      const itinerary = createMockGeneratedItinerary();
      mockStore.save(itinerary);

      const request = createMockRequest("PUT", { action: "unknown-action" });
      const params = Promise.resolve({ id: itinerary.id });

      const response = await updateItinerary(request, { params });
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.code).toBe("INVALID_ACTION");
    });

    it("should do partial update without action", async () => {
      const itinerary = createMockGeneratedItinerary();
      mockStore.save(itinerary);

      const request = createMockRequest("PUT", { status: "reviewing" });
      const params = Promise.resolve({ id: itinerary.id });

      const response = await updateItinerary(request, { params });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.itinerary.status).toBe("reviewing");
    });

    it("should return 404 for non-existent id", async () => {
      const request = createMockRequest("PUT", { action: "confirm" });
      const params = Promise.resolve({ id: "non-existent-id" });

      const response = await updateItinerary(request, { params });
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error.code).toBe("NOT_FOUND");
    });
  });

  // ============================================
  // DELETE /api/itinerary/[id]
  // ============================================

  describe("DELETE /api/itinerary/[id]", () => {
    it("should delete an existing itinerary", async () => {
      const itinerary = createMockGeneratedItinerary();
      mockStore.save(itinerary);

      const request = createMockRequest("DELETE");
      const params = Promise.resolve({ id: itinerary.id });

      const response = await deleteItinerary(request, { params });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.deleted).toBe(true);
      expect(mockStore.has(itinerary.id)).toBe(false);
    });

    it("should return 404 for non-existent id", async () => {
      const request = createMockRequest("DELETE");
      const params = Promise.resolve({ id: "non-existent-id" });

      const response = await deleteItinerary(request, { params });
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error.code).toBe("NOT_FOUND");
    });
  });

  // ============================================
  // GET /api/itinerary/[id]/slot/[slotId]
  // ============================================

  describe("GET /api/itinerary/[id]/slot/[slotId]", () => {
    it("should return slot details with alternatives", async () => {
      const itinerary = createMockGeneratedItinerary();
      mockStore.save(itinerary);
      const slotId = itinerary.days[0].slots[0].slotId;

      const request = createMockRequest("GET");
      const params = Promise.resolve({ id: itinerary.id, slotId });

      const response = await getSlot(request, { params });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.slot.id).toBe(slotId);
      expect(json.data.alternatives).toBeDefined();
      expect(Array.isArray(json.data.alternatives)).toBe(true);
    });

    it("should return 404 for non-existent itinerary", async () => {
      const request = createMockRequest("GET");
      const params = Promise.resolve({ id: "non-existent-id", slotId: "slot-1" });

      const response = await getSlot(request, { params });
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error.code).toBe("NOT_FOUND");
    });

    it("should return 404 for non-existent slot", async () => {
      const itinerary = createMockGeneratedItinerary();
      mockStore.save(itinerary);

      const request = createMockRequest("GET");
      const params = Promise.resolve({ id: itinerary.id, slotId: "non-existent-slot" });

      const response = await getSlot(request, { params });
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error.code).toBe("SLOT_NOT_FOUND");
    });
  });

  // ============================================
  // PUT /api/itinerary/[id]/slot/[slotId]
  // ============================================

  describe("PUT /api/itinerary/[id]/slot/[slotId]", () => {
    it("should swap activity in slot", async () => {
      const itinerary = createMockGeneratedItinerary();
      mockStore.save(itinerary);
      const slotId = itinerary.days[0].slots[0].slotId;
      const newActivityId = itinerary.scoredActivities[10].activity.id;

      const request = createMockRequest("PUT", { newActivityId });
      const params = Promise.resolve({ id: itinerary.id, slotId });

      const response = await swapSlot(request, { params });
      const json = await response.json();

      expect(response.status).toBe(200);
      expect(json.success).toBe(true);
      expect(json.data.swappedSlot).toBe(slotId);
      expect(json.data.newActivityId).toBe(newActivityId);
    });

    it("should return 400 for missing newActivityId", async () => {
      const itinerary = createMockGeneratedItinerary();
      mockStore.save(itinerary);
      const slotId = itinerary.days[0].slots[0].slotId;

      const request = createMockRequest("PUT", {});
      const params = Promise.resolve({ id: itinerary.id, slotId });

      const response = await swapSlot(request, { params });
      const json = await response.json();

      expect(response.status).toBe(400);
      expect(json.error.code).toBe("INVALID_REQUEST");
      expect(json.error.message).toContain("newActivityId");
    });

    it("should return 404 for non-existent itinerary", async () => {
      const request = createMockRequest("PUT", { newActivityId: "act-123" });
      const params = Promise.resolve({ id: "non-existent-id", slotId: "slot-1" });

      const response = await swapSlot(request, { params });
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error.code).toBe("NOT_FOUND");
    });

    it("should return error for non-existent slot", async () => {
      const itinerary = createMockGeneratedItinerary();
      mockStore.save(itinerary);
      const newActivityId = itinerary.scoredActivities[10].activity.id;

      const request = createMockRequest("PUT", { newActivityId });
      const params = Promise.resolve({ id: itinerary.id, slotId: "non-existent-slot" });

      const response = await swapSlot(request, { params });
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error.message).toContain("not found");
    });

    it("should return error for non-existent activity", async () => {
      const itinerary = createMockGeneratedItinerary();
      mockStore.save(itinerary);
      const slotId = itinerary.days[0].slots[0].slotId;

      const request = createMockRequest("PUT", { newActivityId: "non-existent-activity" });
      const params = Promise.resolve({ id: itinerary.id, slotId });

      const response = await swapSlot(request, { params });
      const json = await response.json();

      expect(response.status).toBe(404);
      expect(json.error.message).toContain("not found");
    });

    it("should persist swap to store", async () => {
      const itinerary = createMockGeneratedItinerary();
      mockStore.save(itinerary);
      const slotId = itinerary.days[0].slots[0].slotId;
      const newActivityId = itinerary.scoredActivities[10].activity.id;

      const request = createMockRequest("PUT", { newActivityId });
      const params = Promise.resolve({ id: itinerary.id, slotId });

      await swapSlot(request, { params });

      const stored = mockStore.get(itinerary.id);
      expect(stored).not.toBeNull();
      expect(stored?.days[0].slots[0].activity.activity.id).toBe(newActivityId);
    });
  });
});
