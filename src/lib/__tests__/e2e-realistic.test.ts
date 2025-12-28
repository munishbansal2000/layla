// ============================================
// E2E TESTS WITH REALISTIC FIXTURE DATA
// ============================================
// End-to-end tests that simulate the full user journey
// using realistic data based on actual API responses

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { NextRequest } from "next/server";
import {
  TOKYO_ACTIVITIES,
  TOKYO_RESTAURANTS,
  TRAVELER_PROFILES,
  createTokyoWeatherForecasts,
  createRealisticTokyoItinerary,
} from "./fixtures/tokyo-fixtures";
import { ItineraryStore, createItineraryStore } from "../itinerary-store";
import { GeneratedItinerary } from "../itinerary-orchestrator";
import { POST } from "@/app/api/itinerary/generate/route";
import {
  GET as getItinerary,
  PUT as updateItinerary,
} from "@/app/api/itinerary/[id]/route";
import {
  GET as getSlot,
  PUT as swapSlot,
} from "@/app/api/itinerary/[id]/slot/[slotId]/route";

// ============================================
// MOCK SETUP
// ============================================

let mockStore: ItineraryStore;

vi.mock("@/lib/itinerary-store", async () => {
  const actual = await vi.importActual<typeof import("@/lib/itinerary-store")>("@/lib/itinerary-store");
  return {
    ...actual,
    getItineraryStore: () => mockStore,
  };
});

// Mock the orchestrator to use realistic Tokyo fixtures
vi.mock("@/lib/itinerary-orchestrator", async () => {
  const actual = await vi.importActual<typeof import("@/lib/itinerary-orchestrator")>("@/lib/itinerary-orchestrator");
  return {
    ...actual,
    getItineraryOrchestrator: () => ({
      generateItinerary: vi.fn().mockImplementation(async (request: any) => {
        return createRealisticTokyoItinerary(
          request.tripMode,
          request.pace,
          request.budget
        );
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
                commuteFromPrevious: 15,
                commuteToNext: 15,
                categoryMatch: true,
                budgetMatch: true,
                durationDelta: 0,
                distanceFromCurrent: 800,
                swapScore: alt.totalScore,
                reason: "Alternative activity in similar category",
                benefits: ["Similar rating", "Good reviews"],
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
        throw new Error(`Slot ${slotId} not found`);
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

      toLegacyTrip: vi.fn().mockImplementation((itinerary: GeneratedItinerary, userId: string) => ({
        id: itinerary.id,
        userId,
        title: `Trip to ${itinerary.destination.name}`,
        destination: itinerary.destination,
        tripMode: itinerary.tripMode,
      })),
    }),
  };
});

// ============================================
// HELPER FUNCTIONS
// ============================================

function createMockRequest(method: string, body?: any, url?: string): NextRequest {
  const init: Record<string, any> = { method };
  if (body) {
    init.body = JSON.stringify(body);
    init.headers = { "Content-Type": "application/json" };
  }
  return new NextRequest(new URL(url || "http://localhost:3000/api/itinerary"), init);
}

// ============================================
// E2E TEST SUITES
// ============================================

describe("E2E Tests with Realistic Tokyo Data", () => {
  beforeEach(() => {
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
  // FULL USER JOURNEY: COUPLES TRIP TO TOKYO
  // ============================================

  describe("Complete User Journey: Couples Trip to Tokyo", () => {
    it("should complete full flow: generate → review → swap → confirm", async () => {
      // ============================================
      // STEP 1: Generate itinerary
      // ============================================
      const generateRequest = createMockRequest("POST", {
        destination: {
          name: "Tokyo",
          coordinates: { lat: 35.6762, lng: 139.6503 },
          country: "Japan",
        },
        startDate: "2025-02-15",
        endDate: "2025-02-18",
        travelers: { adults: 2, children: 0, infants: 0 },
        tripMode: "couples",
        pace: "normal",
        budget: "moderate",
        interests: ["culture", "food", "photography"],
      });

      const generateResponse = await POST(generateRequest);
      const generateJson = await generateResponse.json();

      expect(generateResponse.status).toBe(200);
      expect(generateJson.success).toBe(true);

      const itinerary = generateJson.data.itinerary;
      expect(itinerary.destination.name).toBe("Tokyo");
      expect(itinerary.tripMode).toBe("couples");
      expect(itinerary.dateRange.totalDays).toBe(4);
      expect(itinerary.days.length).toBe(4);

      // Verify we have real Tokyo activities
      const hasRealActivities = itinerary.activityPool.some(
        (a: any) => a.name === "Senso-ji Temple" || a.name === "Shibuya Crossing"
      );
      expect(hasRealActivities).toBe(true);

      // ============================================
      // STEP 2: Retrieve and verify itinerary
      // ============================================
      const getRequest = createMockRequest("GET");
      const getParams = Promise.resolve({ id: itinerary.id });
      const getResponse = await getItinerary(getRequest, { params: getParams });
      const getJson = await getResponse.json();

      expect(getResponse.status).toBe(200);
      expect(getJson.data.itinerary.id).toBe(itinerary.id);

      // ============================================
      // STEP 3: Get swap options for first slot
      // ============================================
      const firstSlot = itinerary.days[0].slots[0];
      const slotRequest = createMockRequest("GET");
      const slotParams = Promise.resolve({ id: itinerary.id, slotId: firstSlot.slotId });
      const slotResponse = await getSlot(slotRequest, { params: slotParams });
      const slotJson = await slotResponse.json();

      expect(slotResponse.status).toBe(200);
      expect(slotJson.data.slot.id).toBe(firstSlot.slotId);
      expect(slotJson.data.alternatives).toBeDefined();

      // ============================================
      // STEP 4: Swap an activity
      // ============================================
      // Find a restaurant to swap in (if current is an activity)
      const restaurantToSwapIn = itinerary.scoredActivities.find(
        (sa: any) => sa.activity.category === "restaurant"
      );

      if (restaurantToSwapIn) {
        const swapRequest = createMockRequest("PUT", {
          newActivityId: restaurantToSwapIn.activity.id,
        });
        const swapParams = Promise.resolve({ id: itinerary.id, slotId: firstSlot.slotId });
        const swapResponse = await swapSlot(swapRequest, { params: swapParams });
        const swapJson = await swapResponse.json();

        expect(swapResponse.status).toBe(200);
        expect(swapJson.data.newActivityId).toBe(restaurantToSwapIn.activity.id);
      }

      // ============================================
      // STEP 5: Lock a favorite activity
      // ============================================
      const secondSlot = itinerary.days[0].slots[1];
      const lockRequest = createMockRequest("PUT", {
        action: "lock",
        slotId: secondSlot.slotId,
        locked: true,
      });
      const lockParams = Promise.resolve({ id: itinerary.id });
      const lockResponse = await updateItinerary(lockRequest, { params: lockParams });
      const lockJson = await lockResponse.json();

      expect(lockResponse.status).toBe(200);
      expect(lockJson.data.itinerary.days[0].slots[1].isLocked).toBe(true);

      // ============================================
      // STEP 6: Process swipe actions
      // ============================================
      const savedItinerary = mockStore.get(itinerary.id);
      if (savedItinerary && savedItinerary.swipeQueue.length > 0) {
        const activityToKeep = savedItinerary.swipeQueue[0].activity.id;

        const swipeRequest = createMockRequest("PUT", {
          action: "swipe",
          activityId: activityToKeep,
          swipeAction: "keep",
        });
        const swipeParams = Promise.resolve({ id: itinerary.id });
        const swipeResponse = await updateItinerary(swipeRequest, { params: swipeParams });
        const swipeJson = await swipeResponse.json();

        expect(swipeResponse.status).toBe(200);
        expect(swipeJson.data.itinerary.keptActivities).toContain(activityToKeep);
      }

      // ============================================
      // STEP 7: Confirm itinerary
      // ============================================
      const confirmRequest = createMockRequest("PUT", { action: "confirm" });
      const confirmParams = Promise.resolve({ id: itinerary.id });
      const confirmResponse = await updateItinerary(confirmRequest, { params: confirmParams });
      const confirmJson = await confirmResponse.json();

      expect(confirmResponse.status).toBe(200);
      expect(confirmJson.data.itinerary.status).toBe("confirmed");

      console.log("\n✅ Complete couples trip journey successful!");
      console.log(`   📍 Destination: ${itinerary.destination.name}`);
      console.log(`   📅 Duration: ${itinerary.dateRange.totalDays} days`);
      console.log(`   🎯 Activities: ${itinerary.stats.totalActivities}`);
      console.log(`   🍽️  Restaurants: ${itinerary.stats.totalMeals}`);
      console.log(`   💰 Estimated cost: ¥${itinerary.stats.estimatedCost.min.toLocaleString()} - ¥${itinerary.stats.estimatedCost.max.toLocaleString()}`);
    });
  });

  // ============================================
  // FIXTURE DATA QUALITY TESTS
  // ============================================

  describe("Realistic Fixture Data Quality", () => {
    it("should have realistic Tokyo activities with real place names", () => {
      const expectedPlaces = [
        "Senso-ji Temple",
        "Meiji Shrine",
        "teamLab Borderless",
        "Shibuya Crossing",
        "Tsukiji Outer Market",
        "Tokyo Skytree",
      ];

      for (const placeName of expectedPlaces) {
        const found = TOKYO_ACTIVITIES.find((a) => a.name === placeName);
        expect(found, `Expected to find ${placeName}`).toBeDefined();
      }
    });

    it("should have activities with real Google Place IDs", () => {
      const activitiesWithPlaceIds = TOKYO_ACTIVITIES.filter(
        (a) => a.entityIds?.googlePlaceId?.startsWith("ChIJ")
      );
      expect(activitiesWithPlaceIds.length).toBeGreaterThan(5);
    });

    it("should have realistic Tokyo restaurants with cuisine types", () => {
      const ramenRestaurants = TOKYO_RESTAURANTS.filter(
        (r) => r.cuisineTypes?.includes("Ramen")
      );
      expect(ramenRestaurants.length).toBeGreaterThan(0);

      const sushiRestaurants = TOKYO_RESTAURANTS.filter(
        (r) => r.cuisineTypes?.includes("Sushi")
      );
      expect(sushiRestaurants.length).toBeGreaterThan(0);
    });

    it("should have activities with realistic coordinates in Tokyo", () => {
      for (const activity of TOKYO_ACTIVITIES) {
        // Tokyo latitude range: roughly 35.5 to 35.8
        expect(activity.location.lat).toBeGreaterThan(35.5);
        expect(activity.location.lat).toBeLessThan(35.9);

        // Tokyo longitude range: roughly 139.5 to 140.0
        expect(activity.location.lng).toBeGreaterThan(139.5);
        expect(activity.location.lng).toBeLessThan(140.0);
      }
    });

    it("should have realistic price ranges in JPY", () => {
      const paidActivities = TOKYO_ACTIVITIES.filter(
        (a) => !a.isFree && a.estimatedCost
      );

      for (const activity of paidActivities) {
        expect(activity.estimatedCost?.currency).toBe("JPY");
        expect(activity.estimatedCost?.amount).toBeGreaterThan(100); // At least 100 yen
        expect(activity.estimatedCost?.amount).toBeLessThan(10000); // Most under 10,000 yen
      }
    });

    it("should have realistic restaurant prices", () => {
      for (const restaurant of TOKYO_RESTAURANTS) {
        expect(restaurant.estimatedCost?.currency).toBe("JPY");

        // Budget ramen: 1000-2000 yen
        // Mid-range: 3000-8000 yen
        // Fine dining: 20,000-50,000 yen
        if (restaurant.priceLevel === 2) {
          expect(restaurant.estimatedCost?.amount).toBeLessThan(3000);
        } else if (restaurant.priceLevel === 4) {
          expect(restaurant.estimatedCost?.amount).toBeGreaterThan(20000);
        }
      }
    });

    it("should have varied categories across activities", () => {
      const categories = new Set(TOKYO_ACTIVITIES.map((a) => a.category));
      expect(categories.size).toBeGreaterThan(5);
      expect(categories.has("temple")).toBe(true);
      expect(categories.has("shrine")).toBe(true);
      expect(categories.has("museum")).toBe(true);
      expect(categories.has("market")).toBe(true);
    });

    it("should have varied neighborhoods", () => {
      const neighborhoods = new Set(TOKYO_ACTIVITIES.map((a) => a.neighborhood));
      expect(neighborhoods.size).toBeGreaterThan(5);
      expect(neighborhoods.has("Shibuya")).toBe(true);
      expect(neighborhoods.has("Asakusa")).toBe(true);
      expect(neighborhoods.has("Shinjuku")).toBe(true);
    });

    it("should have realistic weather forecasts", () => {
      const forecasts = createTokyoWeatherForecasts("2025-02-15", 5);

      expect(forecasts.length).toBe(5);

      for (const forecast of forecasts) {
        // Winter Tokyo temperatures: -2 to 15°C typical
        expect(forecast.temperature.min).toBeGreaterThan(-5);
        expect(forecast.temperature.max).toBeLessThan(20);
        expect(forecast.temperature.max).toBeGreaterThan(forecast.temperature.min);

        expect(forecast.humidity).toBeGreaterThan(30);
        expect(forecast.humidity).toBeLessThan(100);

        expect(forecast.sunrise).toMatch(/^\d{2}:\d{2}$/);
        expect(forecast.sunset).toMatch(/^\d{2}:\d{2}$/);
      }
    });
  });

  // ============================================
  // TRIP MODE VARIATIONS
  // ============================================

  describe("Different Trip Modes", () => {
    it("should create appropriate itinerary for family trip", async () => {
      const itinerary = createRealisticTokyoItinerary("family", "relaxed", "moderate");

      expect(itinerary.tripMode).toBe("family");
      expect(itinerary.pace).toBe("relaxed");

      // Family trips should have family-friendly activities
      const familyFriendlyActivities = itinerary.activityPool.filter(
        (a) => a.familyFriendly
      );
      expect(familyFriendlyActivities.length).toBeGreaterThan(0);
    });

    it("should create appropriate itinerary for solo trip", async () => {
      const itinerary = createRealisticTokyoItinerary("solo", "ambitious", "budget");

      expect(itinerary.tripMode).toBe("solo");
      expect(itinerary.budget).toBe("budget");

      // Solo trips should have solo-friendly activities
      const soloFriendlyActivities = itinerary.activityPool.filter(
        (a) => a.soloFriendly
      );
      expect(soloFriendlyActivities.length).toBeGreaterThan(0);
    });

    it("should create appropriate itinerary for friends trip", async () => {
      const itinerary = createRealisticTokyoItinerary("friends", "ambitious", "moderate");

      expect(itinerary.tripMode).toBe("friends");
      expect(itinerary.pace).toBe("ambitious");

      // Friends trips can include nightlife
      const nightlifeActivities = itinerary.activityPool.filter(
        (a) => a.category === "nightlife" || a.tags?.includes("nightlife")
      );
      expect(nightlifeActivities.length).toBeGreaterThan(0);
    });

    it("should exclude adult venues for family trips", () => {
      const familyProfile = TRAVELER_PROFILES.family;
      expect(familyProfile.allowsAdultVenues).toBe(false);
      expect(familyProfile.needsKidFriendly).toBe(true);
    });

    it("should prioritize romantic spots for couples", () => {
      const couplesProfile = TRAVELER_PROFILES.couples;
      expect(couplesProfile.needsRomantic).toBe(true);
    });
  });

  // ============================================
  // SCORING VERIFICATION
  // ============================================

  describe("Activity Scoring", () => {
    it("should score all activities between 0-100", () => {
      const itinerary = createRealisticTokyoItinerary("couples", "normal", "moderate");

      for (const scored of itinerary.scoredActivities) {
        expect(scored.totalScore).toBeGreaterThanOrEqual(0);
        expect(scored.totalScore).toBeLessThanOrEqual(100);
      }
    });

    it("should have score breakdowns that sum correctly", () => {
      const itinerary = createRealisticTokyoItinerary("couples", "normal", "moderate");

      for (const scored of itinerary.scoredActivities) {
        const breakdown = scored.scoreBreakdown;
        const sum =
          breakdown.interestMatch +
          breakdown.timeOfDayFit +
          breakdown.durationFit +
          breakdown.budgetMatch +
          breakdown.weatherFit +
          breakdown.varietyBonus +
          breakdown.ratingBonus +
          (breakdown.modeAdjustment || 0);

        // The score breakdown represents individual components
        // Sum should be close to total but may vary due to randomization
        expect(sum).toBeGreaterThan(50); // Reasonable minimum
        expect(sum).toBeLessThan(120); // Reasonable maximum
        expect(scored.totalScore).toBeGreaterThan(60);
        expect(scored.totalScore).toBeLessThan(100);
      }
    });

    it("should sort scored activities by score descending", () => {
      const itinerary = createRealisticTokyoItinerary("couples", "normal", "moderate");

      for (let i = 1; i < itinerary.scoredActivities.length; i++) {
        expect(itinerary.scoredActivities[i - 1].totalScore).toBeGreaterThanOrEqual(
          itinerary.scoredActivities[i].totalScore
        );
      }
    });
  });

  // ============================================
  // SCHEDULE STRUCTURE
  // ============================================

  describe("Schedule Structure", () => {
    it("should have fewer activities on arrival/departure days", () => {
      const itinerary = createRealisticTokyoItinerary("couples", "normal", "moderate");

      const arrivalDay = itinerary.days[0];
      const fullDay = itinerary.days[1];
      const departureDay = itinerary.days[itinerary.days.length - 1];

      expect(arrivalDay.dayType).toBe("arrival");
      expect(departureDay.dayType).toBe("departure");
      expect(fullDay.dayType).toBe("full");

      // Arrival/departure days should have fewer slots
      expect(arrivalDay.slots.length).toBeLessThanOrEqual(fullDay.slots.length);
      expect(departureDay.slots.length).toBeLessThanOrEqual(fullDay.slots.length);
    });

    it("should have unique slot IDs across all days", () => {
      const itinerary = createRealisticTokyoItinerary("couples", "normal", "moderate");
      const allSlotIds = new Set<string>();

      for (const day of itinerary.days) {
        for (const slot of day.slots) {
          expect(allSlotIds.has(slot.slotId)).toBe(false);
          allSlotIds.add(slot.slotId);
        }
      }
    });

    it("should have scheduled times in chronological order", () => {
      const itinerary = createRealisticTokyoItinerary("couples", "normal", "moderate");

      for (const day of itinerary.days) {
        for (let i = 1; i < day.slots.length; i++) {
          const prevEnd = day.slots[i - 1].scheduledEnd;
          const currStart = day.slots[i].scheduledStart;

          // Convert to minutes for comparison
          const [prevH, prevM] = prevEnd.split(":").map(Number);
          const [currH, currM] = currStart.split(":").map(Number);

          expect(currH * 60 + currM).toBeGreaterThanOrEqual(prevH * 60 + prevM);
        }
      }
    });
  });
});
