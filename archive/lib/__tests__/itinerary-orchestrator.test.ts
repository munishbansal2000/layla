// ============================================
// ITINERARY ORCHESTRATOR TESTS
// ============================================
// Tests for the itinerary orchestrator service
// Tests the public interface methods with mock itinerary data

import { describe, it, expect, beforeEach } from "vitest";
import {
  ItineraryOrchestrator,
  GeneratedItinerary,
} from "../itinerary-orchestrator";
import {
  createMockScoredActivities,
  resetIdCounter,
  MOCK_DESTINATIONS,
} from "./mock-factories";
import { DaySchedule, ScheduledActivity } from "../schedule-builder";

// ============================================
// HELPER FUNCTIONS
// ============================================

function createMockDaySchedule(dayNumber: number): DaySchedule {
  const scoredActivities = createMockScoredActivities(4);
  const date = new Date();
  date.setDate(date.getDate() + dayNumber);
  const dateStr = date.toISOString().split("T")[0];

  const slots: ScheduledActivity[] = scoredActivities.map((activity, i) => ({
    slotId: `${dateStr}-slot-${i}`,
    activity,
    scheduledStart: `${9 + i * 3}:00`,
    scheduledEnd: `${11 + i * 3}:00`,
    actualDuration: 120,
    isLocked: false,
    alternatives: createMockScoredActivities(3),
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

function createMockItinerary(): GeneratedItinerary {
  const scoredActivities = createMockScoredActivities(20);
  const days = [
    createMockDaySchedule(1),
    createMockDaySchedule(2),
    createMockDaySchedule(3),
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
  };
}

// ============================================
// TEST SUITE
// ============================================

describe("ItineraryOrchestrator", () => {
  let orchestrator: ItineraryOrchestrator;

  beforeEach(() => {
    resetIdCounter();
    orchestrator = new ItineraryOrchestrator();
  });

  // ============================================
  // SWAP OPTIONS
  // ============================================

  describe("getSwapOptions", () => {
    it("should return slot details for valid slot", () => {
      const itinerary = createMockItinerary();
      const slotId = itinerary.days[0].slots[0].slotId;

      const slotDetails = orchestrator.getSwapOptions(itinerary, slotId);

      expect(slotDetails).not.toBeNull();
      expect(slotDetails?.slotId).toBe(slotId);
      expect(slotDetails?.dayIndex).toBe(0);
      expect(slotDetails?.scheduledActivity).toBeDefined();
    });

    it("should return null for non-existent slot", () => {
      const itinerary = createMockItinerary();
      const slotDetails = orchestrator.getSwapOptions(itinerary, "non-existent-slot");

      expect(slotDetails).toBeNull();
    });

    it("should include alternatives", () => {
      const itinerary = createMockItinerary();
      const slotId = itinerary.days[0].slots[0].slotId;

      const slotDetails = orchestrator.getSwapOptions(itinerary, slotId);

      expect(slotDetails?.alternatives).toBeDefined();
      expect(Array.isArray(slotDetails?.alternatives)).toBe(true);
    });

    it("should find slot in any day", () => {
      const itinerary = createMockItinerary();
      const slotId = itinerary.days[1].slots[2].slotId;

      const slotDetails = orchestrator.getSwapOptions(itinerary, slotId);

      expect(slotDetails).not.toBeNull();
      expect(slotDetails?.dayIndex).toBe(1);
    });
  });

  // ============================================
  // SWAP ACTIVITY
  // ============================================

  describe("swapActivity", () => {
    it("should swap activity in slot", () => {
      const itinerary = createMockItinerary();
      const slotId = itinerary.days[0].slots[0].slotId;
      const originalActivityId = itinerary.days[0].slots[0].activity.activity.id;
      const newActivityId = itinerary.scoredActivities[10].activity.id;

      const updated = orchestrator.swapActivity(itinerary, slotId, newActivityId);

      const updatedSlot = updated.days[0].slots[0];
      expect(updatedSlot.activity.activity.id).toBe(newActivityId);
      expect(updatedSlot.activity.activity.id).not.toBe(originalActivityId);
    });

    it("should update lastModifiedAt after swap", async () => {
      const itinerary = createMockItinerary();
      const originalModified = itinerary.lastModifiedAt;
      const slotId = itinerary.days[0].slots[0].slotId;
      const newActivityId = itinerary.scoredActivities[10].activity.id;

      await new Promise((r) => setTimeout(r, 10));
      const updated = orchestrator.swapActivity(itinerary, slotId, newActivityId);

      expect(updated.lastModifiedAt).not.toBe(originalModified);
    });

    it("should throw error for non-existent slot", () => {
      const itinerary = createMockItinerary();
      const newActivityId = itinerary.scoredActivities[10].activity.id;

      expect(() =>
        orchestrator.swapActivity(itinerary, "non-existent-slot", newActivityId)
      ).toThrow("Slot non-existent-slot not found");
    });

    it("should throw error for non-existent activity", () => {
      const itinerary = createMockItinerary();
      const slotId = itinerary.days[0].slots[0].slotId;

      expect(() =>
        orchestrator.swapActivity(itinerary, slotId, "non-existent-activity")
      ).toThrow("Activity non-existent-activity not found");
    });

    it("should add notes about the swap", () => {
      const itinerary = createMockItinerary();
      const slotId = itinerary.days[0].slots[0].slotId;
      const originalName = itinerary.days[0].slots[0].activity.activity.name;
      const newActivityId = itinerary.scoredActivities[10].activity.id;

      const updated = orchestrator.swapActivity(itinerary, slotId, newActivityId);

      expect(updated.days[0].slots[0].notes).toContain(originalName);
    });
  });

  // ============================================
  // SWIPE PROCESSING
  // ============================================

  describe("processSwipe", () => {
    it("should add activity to keptActivities on keep", () => {
      const itinerary = createMockItinerary();
      const activityId = itinerary.swipeQueue[0].activity.id;

      const updated = orchestrator.processSwipe(itinerary, activityId, "keep");

      expect(updated.keptActivities).toContain(activityId);
      expect(updated.swipeQueue.find((s) => s.activity.id === activityId)).toBeUndefined();
    });

    it("should add activity to rejectedActivities on reject", () => {
      const itinerary = createMockItinerary();
      const activityId = itinerary.swipeQueue[0].activity.id;

      const updated = orchestrator.processSwipe(itinerary, activityId, "reject");

      expect(updated.rejectedActivities).toContain(activityId);
      expect(updated.swipeQueue.find((s) => s.activity.id === activityId)).toBeUndefined();
    });

    it("should add activity to savedForLater on save-for-later", () => {
      const itinerary = createMockItinerary();
      const activityId = itinerary.swipeQueue[0].activity.id;

      const updated = orchestrator.processSwipe(itinerary, activityId, "save-for-later");

      expect(updated.savedForLater).toContain(activityId);
      expect(updated.swipeQueue.find((s) => s.activity.id === activityId)).toBeUndefined();
    });

    it("should update lastModifiedAt after swipe", async () => {
      const itinerary = createMockItinerary();
      const activityId = itinerary.swipeQueue[0].activity.id;
      const originalModified = itinerary.lastModifiedAt;

      await new Promise((r) => setTimeout(r, 10));
      const updated = orchestrator.processSwipe(itinerary, activityId, "keep");

      expect(updated.lastModifiedAt).not.toBe(originalModified);
    });

    it("should remove activity from swipe queue", () => {
      const itinerary = createMockItinerary();
      const originalQueueLength = itinerary.swipeQueue.length;
      const activityId = itinerary.swipeQueue[0].activity.id;

      const updated = orchestrator.processSwipe(itinerary, activityId, "keep");

      expect(updated.swipeQueue.length).toBe(originalQueueLength - 1);
    });

    it("should handle multiple swipes correctly", () => {
      let itinerary = createMockItinerary();
      const activity1Id = itinerary.swipeQueue[0].activity.id;
      const activity2Id = itinerary.swipeQueue[1].activity.id;
      const activity3Id = itinerary.swipeQueue[2].activity.id;

      itinerary = orchestrator.processSwipe(itinerary, activity1Id, "keep");
      itinerary = orchestrator.processSwipe(itinerary, activity2Id, "reject");
      itinerary = orchestrator.processSwipe(itinerary, activity3Id, "save-for-later");

      expect(itinerary.keptActivities).toContain(activity1Id);
      expect(itinerary.rejectedActivities).toContain(activity2Id);
      expect(itinerary.savedForLater).toContain(activity3Id);
    });
  });

  // ============================================
  // LOCK ACTIVITY
  // ============================================

  describe("lockActivity", () => {
    it("should lock a slot", () => {
      const itinerary = createMockItinerary();
      const slotId = itinerary.days[0].slots[0].slotId;

      const updated = orchestrator.lockActivity(itinerary, slotId, true);

      expect(updated.days[0].slots[0].isLocked).toBe(true);
    });

    it("should unlock a slot", () => {
      const itinerary = createMockItinerary();
      const slotId = itinerary.days[0].slots[0].slotId;
      itinerary.days[0].slots[0].isLocked = true;

      const updated = orchestrator.lockActivity(itinerary, slotId, false);

      expect(updated.days[0].slots[0].isLocked).toBe(false);
    });

    it("should throw error for non-existent slot", () => {
      const itinerary = createMockItinerary();

      expect(() =>
        orchestrator.lockActivity(itinerary, "non-existent-slot", true)
      ).toThrow("Slot non-existent-slot not found");
    });

    it("should lock slot in any day", () => {
      const itinerary = createMockItinerary();
      const slotId = itinerary.days[2].slots[1].slotId;

      const updated = orchestrator.lockActivity(itinerary, slotId, true);

      expect(updated.days[2].slots[1].isLocked).toBe(true);
    });
  });

  // ============================================
  // CONFIRM ITINERARY
  // ============================================

  describe("confirmItinerary", () => {
    it("should set status to confirmed", () => {
      const itinerary = createMockItinerary();
      expect(itinerary.status).toBe("draft");

      const confirmed = orchestrator.confirmItinerary(itinerary);

      expect(confirmed.status).toBe("confirmed");
    });

    it("should update lastModifiedAt", async () => {
      const itinerary = createMockItinerary();
      const originalModified = itinerary.lastModifiedAt;

      await new Promise((r) => setTimeout(r, 10));
      const confirmed = orchestrator.confirmItinerary(itinerary);

      expect(confirmed.lastModifiedAt).not.toBe(originalModified);
    });
  });

  // ============================================
  // LEGACY CONVERSION
  // ============================================

  describe("toLegacyTrip", () => {
    it("should convert itinerary to legacy Trip format", () => {
      const itinerary = createMockItinerary();
      const userId = "user-123";

      const trip = orchestrator.toLegacyTrip(itinerary, userId);

      expect(trip.id).toBe(itinerary.id);
      expect(trip.userId).toBe(userId);
      expect(trip.title).toContain("Tokyo");
      expect(trip.destination?.city).toBe("Tokyo");
      expect(trip.tripMode).toBe("couples");
    });

    it("should map destination coordinates", () => {
      const itinerary = createMockItinerary();
      const trip = orchestrator.toLegacyTrip(itinerary, "user");

      expect(trip.destination?.lat).toBe(MOCK_DESTINATIONS.tokyo.lat);
      expect(trip.destination?.lng).toBe(MOCK_DESTINATIONS.tokyo.lng);
      expect(trip.destination?.country).toBe("Japan");
    });

    it("should map pace correctly", () => {
      const relaxedItinerary = createMockItinerary();
      relaxedItinerary.pace = "relaxed";

      const ambitiousItinerary = createMockItinerary();
      ambitiousItinerary.pace = "ambitious";

      const normalItinerary = createMockItinerary();
      normalItinerary.pace = "normal";

      const relaxedTrip = orchestrator.toLegacyTrip(relaxedItinerary, "user");
      const ambitiousTrip = orchestrator.toLegacyTrip(ambitiousItinerary, "user");
      const normalTrip = orchestrator.toLegacyTrip(normalItinerary, "user");

      expect(relaxedTrip.preferences?.pace).toBe("relaxed");
      expect(ambitiousTrip.preferences?.pace).toBe("packed");
      expect(normalTrip.preferences?.pace).toBe("moderate");
    });

    it("should map budget correctly", () => {
      const budgetItinerary = createMockItinerary();
      budgetItinerary.budget = "budget";

      const luxuryItinerary = createMockItinerary();
      luxuryItinerary.budget = "luxury";

      const moderateItinerary = createMockItinerary();
      moderateItinerary.budget = "moderate";

      const budgetTrip = orchestrator.toLegacyTrip(budgetItinerary, "user");
      const luxuryTrip = orchestrator.toLegacyTrip(luxuryItinerary, "user");
      const moderateTrip = orchestrator.toLegacyTrip(moderateItinerary, "user");

      expect(budgetTrip.preferences?.budget).toBe("budget");
      expect(luxuryTrip.preferences?.budget).toBe("luxury");
      expect(moderateTrip.preferences?.budget).toBe("moderate");
    });

    it("should map status correctly", () => {
      const draftItinerary = createMockItinerary();
      draftItinerary.status = "draft";

      const confirmedItinerary = createMockItinerary();
      confirmedItinerary.status = "confirmed";

      const draftTrip = orchestrator.toLegacyTrip(draftItinerary, "user");
      const confirmedTrip = orchestrator.toLegacyTrip(confirmedItinerary, "user");

      expect(draftTrip.status).toBe("planning");
      expect(confirmedTrip.status).toBe("confirmed");
    });

    it("should include activity pool and scored activities", () => {
      const itinerary = createMockItinerary();
      const trip = orchestrator.toLegacyTrip(itinerary, "user");

      expect(trip.activityPool).toBeDefined();
      expect(trip.activityPool?.length).toBe(itinerary.activityPool.length);
      expect(trip.scoredActivities).toBeDefined();
      expect(trip.scoredActivities?.length).toBe(itinerary.scoredActivities.length);
    });
  });
});
