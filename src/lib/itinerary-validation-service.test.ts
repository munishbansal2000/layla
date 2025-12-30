/**
 * Unit Tests for Itinerary Validation Service
 *
 * Tests the three main capabilities:
 * 1. Continuous validation - Real-time constraint checking
 * 2. Suggestion filtering - Never show invalid/illogical suggestions
 * 3. User action validation - Accept user actions but flag constraint violations
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ItineraryValidationService,
  createValidationService,
  getValidationService,
} from "./itinerary-validation-service";

import type {
  StructuredItineraryData,
  DayWithOptions,
  SlotWithOptions,
  ActivityOption,
} from "@/types/structured-itinerary";

// ============================================
// TEST FIXTURES
// ============================================

function createMockActivity(overrides: Partial<ActivityOption> = {}): ActivityOption {
  return {
    id: "activity-1",
    rank: 1,
    score: 85,
    activity: {
      name: "Test Activity",
      description: "A test activity",
      category: "sightseeing",
      duration: 120,
      place: {
        googlePlaceId: "test-place",
        name: "Test Place",
        address: "123 Test St",
        neighborhood: "Test Area",
        coordinates: { lat: 35.6762, lng: 139.6503 },
      },
      isFree: false,
      tags: ["popular"],
      source: "ai",
    },
    matchReasons: ["Test reason"],
    tradeoffs: [],
    ...overrides,
  };
}

function createMockSlot(overrides: Partial<SlotWithOptions> = {}): SlotWithOptions {
  return {
    slotId: "slot-1",
    slotType: "morning",
    timeRange: { start: "09:00", end: "12:00" },
    options: [createMockActivity()],
    ...overrides,
  };
}

function createMockDay(overrides: Partial<DayWithOptions> = {}): DayWithOptions {
  return {
    dayNumber: 1,
    date: "2025-04-15",
    city: "Tokyo",
    title: "Day 1 - Tokyo Exploration",
    slots: [
      createMockSlot({ slotId: "slot-1", slotType: "morning", timeRange: { start: "09:00", end: "12:00" } }),
      createMockSlot({ slotId: "slot-2", slotType: "lunch", timeRange: { start: "12:00", end: "13:30" } }),
      createMockSlot({ slotId: "slot-3", slotType: "afternoon", timeRange: { start: "14:00", end: "17:00" } }),
    ],
    ...overrides,
  };
}

function createMockItinerary(overrides: Partial<StructuredItineraryData> = {}): StructuredItineraryData {
  return {
    destination: "Japan",
    country: "Japan",
    days: [createMockDay()],
    ...overrides,
  };
}

// ============================================
// CONTINUOUS VALIDATION TESTS
// ============================================

describe("Continuous Validation", () => {
  let service: ItineraryValidationService;

  beforeEach(() => {
    service = createValidationService();
  });

  describe("validateItinerary", () => {
    it("should validate a valid itinerary with no violations", () => {
      const itinerary = createMockItinerary();
      const state = service.validateItinerary(itinerary);

      expect(state.isValid).toBe(true);
      expect(state.healthScore).toBeGreaterThanOrEqual(70);
      expect(state.lastValidatedAt).toBeInstanceOf(Date);
    });

    it("should detect violations and cache them by slot", () => {
      // Create itinerary with cluster fragmentation
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [
              createMockSlot({ slotId: "slot-1", clusterId: "shibuya" }),
              createMockSlot({ slotId: "slot-2", clusterId: "shinjuku" }),
              createMockSlot({ slotId: "slot-3", clusterId: "shibuya" }), // Back to shibuya
            ],
          }),
        ],
      });

      const state = service.validateItinerary(itinerary);

      expect(state.violations.length).toBeGreaterThan(0);
      expect(state.healthScore).toBeLessThan(100);
    });

    it("should group violations by day correctly", () => {
      // Create a multi-day itinerary with issues
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            dayNumber: 1,
            slots: [
              createMockSlot({
                slotId: "day1-slot-1",
                fragility: { weatherSensitivity: "high", crowdSensitivity: "none", bookingRequired: false },
              }),
            ],
          }),
          createMockDay({
            dayNumber: 2,
            slots: [
              createMockSlot({
                slotId: "day2-slot-1",
                fragility: { weatherSensitivity: "high", crowdSensitivity: "none", bookingRequired: true },
              }),
            ],
          }),
        ],
      });

      const state = service.validateItinerary(itinerary);

      // Violations should be grouped by day
      const day1Violations = service.getDayViolations(0);
      const day2Violations = service.getDayViolations(1);

      expect(day1Violations).toBeDefined();
      expect(day2Violations).toBeDefined();
    });

    it("should get slot violations correctly", () => {
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [
              createMockSlot({
                slotId: "test-slot",
                fragility: { weatherSensitivity: "high", crowdSensitivity: "none", bookingRequired: true },
              }),
            ],
          }),
        ],
      });

      service.validateItinerary(itinerary);
      const slotViolations = service.getSlotViolations("test-slot");

      // Should have violations for weather sensitivity and booking requirement
      expect(slotViolations).toBeDefined();
    });
  });

  describe("getHealthSummary", () => {
    it("should return excellent status for healthy itinerary", () => {
      // Create a minimal itinerary with no fragility issues
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [
              createMockSlot({
                slotId: "clean-slot",
                // No fragility, no dependencies, simple slot
              }),
            ],
          }),
        ],
      });
      const summary = service.getHealthSummary(itinerary);

      expect(["excellent", "good"]).toContain(summary.status);
      expect(summary.score).toBeGreaterThanOrEqual(70);
    });

    it("should return poor status for itinerary with many issues", () => {
      // Create an itinerary with multiple constraint violations
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [
              createMockSlot({
                slotId: "slot-1",
                dependencies: [{ type: "must-before", targetSlotId: "slot-2" }],
              }),
              createMockSlot({ slotId: "slot-2" }),
              // Add more violation-inducing slots
              createMockSlot({
                slotId: "slot-3",
                timeRange: { start: "14:00", end: "17:00" },
                options: [createMockActivity({ activity: { ...createMockActivity().activity, duration: 300 } })],
              }),
              createMockSlot({
                slotId: "slot-4",
                timeRange: { start: "17:00", end: "18:00" },
                commuteFromPrevious: { duration: 60, distance: 5000, method: "walk", instructions: "" },
              }),
              createMockSlot({
                slotId: "slot-5",
                timeRange: { start: "18:00", end: "19:00" },
                commuteFromPrevious: { duration: 60, distance: 5000, method: "walk", instructions: "" },
              }),
              createMockSlot({
                slotId: "slot-6",
                timeRange: { start: "19:00", end: "20:00" },
                commuteFromPrevious: { duration: 60, distance: 5000, method: "walk", instructions: "" },
              }),
            ],
          }),
        ],
      });

      const summary = service.getHealthSummary(itinerary);

      expect(summary.score).toBeLessThan(70);
      expect(["fair", "poor"]).toContain(summary.status);
    });

    it("should list top issues", () => {
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [
              createMockSlot({
                slotId: "slot-1",
                fragility: { weatherSensitivity: "high", crowdSensitivity: "none", bookingRequired: true },
              }),
            ],
          }),
        ],
      });

      const summary = service.getHealthSummary(itinerary);

      expect(summary.topIssues).toBeDefined();
      expect(Array.isArray(summary.topIssues)).toBe(true);
    });
  });
});

// ============================================
// USER ACTION VALIDATION TESTS
// ============================================

describe("User Action Validation", () => {
  let service: ItineraryValidationService;

  beforeEach(() => {
    service = createValidationService();
  });

  describe("validateUserAction", () => {
    it("should always allow user actions (allowed: true)", () => {
      const itinerary = createMockItinerary();
      const result = service.validateUserAction(itinerary, {
        type: "MOVE_ACTIVITY",
        sourceSlotId: "slot-1",
        targetDayIndex: 0,
      });

      expect(result.allowed).toBe(true);
    });

    it("should flag locked slot movements with error", () => {
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [
              createMockSlot({
                slotId: "locked-slot",
                isLocked: true,
                options: [createMockActivity({ activity: { ...createMockActivity().activity, name: "Locked Activity" } })],
              }),
            ],
          }),
        ],
      });

      const result = service.validateUserAction(itinerary, {
        type: "MOVE_ACTIVITY",
        sourceSlotId: "locked-slot",
        targetDayIndex: 0,
      });

      expect(result.allowed).toBe(true);
      expect(result.hasViolations).toBe(true);
      expect(result.maxSeverity).toBe("error");
      expect(result.violations.some((v) => v.message.includes("locked"))).toBe(true);
    });

    it("should warn about timed ticket activities", () => {
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [
              createMockSlot({
                slotId: "timed-slot",
                fragility: {
                  weatherSensitivity: "none",
                  crowdSensitivity: "none",
                  bookingRequired: true,
                  ticketType: "timed",
                },
                options: [createMockActivity({ activity: { ...createMockActivity().activity, name: "Timed Entry" } })],
              }),
            ],
          }),
        ],
      });

      const result = service.validateUserAction(itinerary, {
        type: "MOVE_ACTIVITY",
        sourceSlotId: "timed-slot",
        targetDayIndex: 0,
      });

      expect(result.allowed).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes("timed ticket"))).toBe(true);
    });

    it("should warn when moving activity to different city", () => {
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            dayNumber: 1,
            city: "Tokyo",
            slots: [
              createMockSlot({
                slotId: "tokyo-slot",
                options: [createMockActivity({ activity: { ...createMockActivity().activity, name: "Tokyo Temple" } })],
              }),
            ],
          }),
          createMockDay({
            dayNumber: 2,
            city: "Kyoto",
            slots: [],
          }),
        ],
      });

      const result = service.validateUserAction(itinerary, {
        type: "MOVE_ACTIVITY",
        sourceSlotId: "tokyo-slot",
        targetDayIndex: 1,
      });

      expect(result.allowed).toBe(true);
      expect(result.warnings.some((w) => w.includes("Kyoto"))).toBe(true);
    });

    it("should warn when adding to overloaded day", () => {
      // Create a day with many activities already
      const slots = [];
      for (let i = 0; i < 6; i++) {
        slots.push(
          createMockSlot({
            slotId: `slot-${i}`,
            options: [createMockActivity({ activity: { ...createMockActivity().activity, duration: 120 } })],
          })
        );
      }

      const itinerary = createMockItinerary({
        days: [createMockDay({ slots })],
      });

      const result = service.validateUserAction(itinerary, {
        type: "ADD_ACTIVITY",
        targetDayIndex: 0,
      });

      expect(result.allowed).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings.some((w) => w.includes("already has"))).toBe(true);
    });

    it("should flag locked slot removal", () => {
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [
              createMockSlot({
                slotId: "locked-slot",
                isLocked: true,
                options: [createMockActivity({ activity: { ...createMockActivity().activity, name: "Locked" } })],
              }),
            ],
          }),
        ],
      });

      const result = service.validateUserAction(itinerary, {
        type: "REMOVE_ACTIVITY",
        sourceSlotId: "locked-slot",
      });

      expect(result.allowed).toBe(true);
      expect(result.hasViolations).toBe(true);
      expect(result.violations.some((v) => v.message.includes("locked") && v.message.includes("cannot be removed"))).toBe(true);
    });

    it("should warn about time change for timed tickets", () => {
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [
              createMockSlot({
                slotId: "timed-slot",
                fragility: {
                  weatherSensitivity: "none",
                  crowdSensitivity: "none",
                  bookingRequired: true,
                  ticketType: "timed",
                },
              }),
            ],
          }),
        ],
      });

      const result = service.validateUserAction(itinerary, {
        type: "CHANGE_TIME",
        sourceSlotId: "timed-slot",
      });

      expect(result.allowed).toBe(true);
      expect(result.warnings.some((w) => w.includes("timed ticket"))).toBe(true);
    });
  });
});

// ============================================
// SUGGESTION FILTERING TESTS
// ============================================

describe("Suggestion Filtering", () => {
  let service: ItineraryValidationService;

  beforeEach(() => {
    service = createValidationService();
  });

  describe("filterSuggestions", () => {
    it("should filter out duplicate activities", () => {
      const existingActivity = createMockActivity({
        id: "existing-1",
        activity: {
          name: "Senso-ji Temple",
          description: "Historic temple",
          category: "sightseeing",
          duration: 90,
          place: {
            googlePlaceId: "existing-place",
            name: "Senso-ji Temple",
            address: "123 Temple St",
            neighborhood: "Asakusa",
            coordinates: { lat: 35.7148, lng: 139.7967 },
          },
          isFree: true,
          tags: ["temple"],
          source: "ai" as const,
        },
        matchReasons: ["Popular"],
        tradeoffs: [],
      });

      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [createMockSlot({ slotId: "slot-1", options: [existingActivity] })],
          }),
        ],
      });

      const suggestions = [
        createMockActivity({
          id: "dup-1",
          activity: {
            name: "Senso-ji Temple", // Duplicate
            description: "Historic temple",
            category: "sightseeing",
            duration: 90,
            place: {
              googlePlaceId: "dup-place",
              name: "Senso-ji Temple",
              address: "123 Temple St",
              neighborhood: "Asakusa",
              coordinates: { lat: 35.7148, lng: 139.7967 },
            },
            isFree: true,
            tags: ["temple"],
            source: "ai" as const,
          },
          matchReasons: ["Popular"],
          tradeoffs: [],
        }),
        createMockActivity({
          id: "new-1",
          activity: {
            name: "Meiji Shrine", // New
            description: "Beautiful shrine",
            category: "sightseeing",
            duration: 90,
            place: {
              googlePlaceId: "new-place",
              name: "Meiji Shrine",
              address: "456 Shrine St",
              neighborhood: "Shibuya",
              coordinates: { lat: 35.6764, lng: 139.6993 },
            },
            isFree: true,
            tags: ["shrine"],
            source: "ai" as const,
          },
          matchReasons: ["Popular"],
          tradeoffs: [],
        }),
      ];

      const filtered = service.filterSuggestions(suggestions, {
        itinerary,
        targetDayIndex: 0,
        targetSlotType: "afternoon",
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].activity.name).toBe("Meiji Shrine");
    });

    it("should filter out activities with duration exceeding slot time", () => {
      // Create a clean itinerary without any conflicting activities
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [], // Empty day for testing
          }),
        ],
      });

      const suggestions = [
        createMockActivity({
          id: "long-1",
          activity: {
            name: "Long Activity",
            description: "Very long activity",
            category: "sightseeing",
            duration: 300,
            place: {
              googlePlaceId: "long-place",
              name: "Long Place",
              address: "123 Long St",
              neighborhood: "Tokyo",
              coordinates: { lat: 35.68, lng: 139.76 },
            },
            isFree: false,
            tags: ["activity"],
            source: "ai" as const,
          },
          matchReasons: [],
          tradeoffs: [],
        }),
        createMockActivity({
          id: "short-1",
          activity: {
            name: "Short Activity",
            description: "Quick activity",
            category: "sightseeing",
            duration: 60,
            place: {
              googlePlaceId: "short-place",
              name: "Short Place",
              address: "456 Short St",
              neighborhood: "Tokyo",
              coordinates: { lat: 35.68, lng: 139.76 },
            },
            isFree: false,
            tags: ["activity"],
            source: "ai" as const,
          },
          matchReasons: [],
          tradeoffs: [],
        }),
      ];

      const filtered = service.filterSuggestions(suggestions, {
        itinerary,
        targetDayIndex: 0,
        targetSlotType: "lunch",
        targetTimeRange: { start: "12:00", end: "13:30" }, // 90 minutes
      });

      // The long activity (300 min) should be filtered out (exceeds 90 + 30 = 120 min)
      expect(filtered.some((s) => s.activity.name === "Long Activity")).toBe(false);
      expect(filtered.some((s) => s.activity.name === "Short Activity")).toBe(true);
    });

    it("should filter out dinner venues for breakfast slot", () => {
      // Create a clean itinerary
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [], // Empty day for testing
          }),
        ],
      });

      const suggestions = [
        createMockActivity({
          id: "dinner-1",
          activity: {
            name: "Izakaya Bar",
            description: "Evening drinking",
            category: "restaurant",
            duration: 90,
            place: {
              googlePlaceId: "dinner-place",
              name: "Izakaya Bar",
              address: "123 Bar St",
              neighborhood: "Shinjuku",
              coordinates: { lat: 35.69, lng: 139.70 },
            },
            isFree: false,
            tags: ["izakaya", "bar", "dinner"],
            source: "ai" as const,
          },
          matchReasons: [],
          tradeoffs: [],
        }),
        createMockActivity({
          id: "cafe-1",
          activity: {
            name: "Coffee Shop",
            description: "Morning coffee",
            category: "cafe",
            duration: 45,
            place: {
              googlePlaceId: "cafe-place",
              name: "Coffee Shop",
              address: "456 Cafe St",
              neighborhood: "Shibuya",
              coordinates: { lat: 35.66, lng: 139.70 },
            },
            isFree: false,
            tags: ["coffee", "breakfast"],
            source: "ai" as const,
          },
          matchReasons: [],
          tradeoffs: [],
        }),
      ];

      const filtered = service.filterSuggestions(suggestions, {
        itinerary,
        targetDayIndex: 0,
        targetSlotType: "breakfast",
      });

      expect(filtered.some((s) => s.activity.name === "Izakaya Bar")).toBe(false);
      expect(filtered.some((s) => s.activity.name === "Coffee Shop")).toBe(true);
    });

    it("should filter out geographically incompatible activities (>30km away)", () => {
      // Create an itinerary with activities in Tokyo
      const tokyoActivity = createMockActivity({
        id: "tokyo-1",
        activity: {
          name: "Tokyo Tower",
          description: "Iconic tower",
          category: "landmark",
          duration: 90,
          place: {
            googlePlaceId: "tokyo-tower",
            name: "Tokyo Tower",
            address: "4-2-8 Shibakoen",
            neighborhood: "Minato",
            coordinates: { lat: 35.6586, lng: 139.7454 },
          },
          isFree: false,
          tags: ["landmark"],
          source: "ai" as const,
        },
        matchReasons: [],
        tradeoffs: [],
      });

      const itinerary = createMockItinerary({
        days: [createMockDay({ slots: [createMockSlot({ slotId: "slot-1", options: [tokyoActivity] })] })],
      });

      const suggestions = [
        // Osaka is about 400km from Tokyo
        createMockActivity({
          id: "osaka-1",
          activity: {
            name: "Osaka Castle",
            description: "Historic castle",
            category: "landmark",
            duration: 120,
            place: {
              googlePlaceId: "osaka-castle",
              name: "Osaka Castle",
              address: "1-1 Osakajo",
              neighborhood: "Chuo",
              coordinates: { lat: 34.6873, lng: 135.5262 },
            },
            isFree: false,
            tags: ["castle"],
            source: "ai" as const,
          },
          matchReasons: [],
          tradeoffs: [],
        }),
        // Nearby Tokyo location
        createMockActivity({
          id: "nearby-1",
          activity: {
            name: "Shibuya Crossing",
            description: "Famous crossing",
            category: "landmark",
            duration: 30,
            place: {
              googlePlaceId: "shibuya-crossing",
              name: "Shibuya Crossing",
              address: "Shibuya",
              neighborhood: "Shibuya",
              coordinates: { lat: 35.6595, lng: 139.7004 },
            },
            isFree: true,
            tags: ["landmark"],
            source: "ai" as const,
          },
          matchReasons: [],
          tradeoffs: [],
        }),
      ];

      const filtered = service.filterSuggestions(suggestions, {
        itinerary,
        targetDayIndex: 0,
        targetSlotType: "afternoon",
      });

      expect(filtered.some((s) => s.activity.name === "Osaka Castle")).toBe(false);
      expect(filtered.some((s) => s.activity.name === "Shibuya Crossing")).toBe(true);
    });

    it("should add warning for activities 10-30km away", () => {
      const tokyoActivity = createMockActivity({
        id: "tokyo-station",
        activity: {
          name: "Tokyo Station",
          description: "Main station",
          category: "landmark",
          duration: 30,
          place: {
            googlePlaceId: "tokyo-station",
            name: "Tokyo Station",
            address: "1-9-1 Marunouchi",
            neighborhood: "Chiyoda",
            coordinates: { lat: 35.6812, lng: 139.7671 },
          },
          isFree: true,
          tags: ["station"],
          source: "ai" as const,
        },
        matchReasons: [],
        tradeoffs: [],
      });

      const itinerary = createMockItinerary({
        days: [createMockDay({ slots: [createMockSlot({ slotId: "slot-1", options: [tokyoActivity] })] })],
      });

      const suggestions = [
        // About 18km from Tokyo Station
        createMockActivity({
          id: "far-1",
          activity: {
            name: "Kawasaki Temple",
            description: "Buddhist temple",
            category: "temple",
            duration: 60,
            place: {
              googlePlaceId: "kawasaki-temple",
              name: "Kawasaki Temple",
              address: "Kawasaki",
              neighborhood: "Kawasaki",
              coordinates: { lat: 35.5309, lng: 139.7030 },
            },
            isFree: true,
            tags: ["temple"],
            source: "ai" as const,
          },
          matchReasons: [],
          tradeoffs: [],
        }),
      ];

      const filtered = service.filterSuggestions(suggestions, {
        itinerary,
        targetDayIndex: 0,
        targetSlotType: "afternoon",
      });

      // Should be included but with a warning
      expect(filtered).toHaveLength(1);
      expect(filtered[0].validationWarnings).toBeDefined();
      expect(filtered[0].validationWarnings?.some((w) => w.includes("km from"))).toBe(true);
    });

    it("should add warning for category overload", () => {
      // Create a day with 2 museum activities with unique names
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [
              createMockSlot({
                slotId: "slot-1",
                options: [createMockActivity({
                  id: "museum-1",
                  activity: {
                    name: "National Museum",
                    description: "Art museum",
                    category: "museum",
                    duration: 120,
                    place: {
                      googlePlaceId: "museum-1",
                      name: "National Museum",
                      address: "123 Museum St",
                      neighborhood: "Ueno",
                      coordinates: { lat: 35.7148, lng: 139.7767 },
                    },
                    isFree: false,
                    tags: ["museum"],
                    source: "ai" as const,
                  },
                  matchReasons: [],
                  tradeoffs: [],
                })],
              }),
              createMockSlot({
                slotId: "slot-2",
                options: [createMockActivity({
                  id: "museum-2",
                  activity: {
                    name: "Science Museum",
                    description: "Science museum",
                    category: "museum",
                    duration: 120,
                    place: {
                      googlePlaceId: "museum-2",
                      name: "Science Museum",
                      address: "456 Museum St",
                      neighborhood: "Ueno",
                      coordinates: { lat: 35.7148, lng: 139.7767 },
                    },
                    isFree: false,
                    tags: ["museum"],
                    source: "ai" as const,
                  },
                  matchReasons: [],
                  tradeoffs: [],
                })],
              }),
            ],
          }),
        ],
      });

      const suggestions = [
        createMockActivity({
          id: "museum-3",
          activity: {
            name: "Art Gallery",
            description: "Another museum",
            category: "museum",
            duration: 90,
            place: {
              googlePlaceId: "museum-3",
              name: "Art Gallery",
              address: "789 Art St",
              neighborhood: "Ueno",
              coordinates: { lat: 35.7148, lng: 139.7767 },
            },
            isFree: false,
            tags: ["museum", "art"],
            source: "ai" as const,
          },
          matchReasons: [],
          tradeoffs: [],
        }),
      ];

      const filtered = service.filterSuggestions(suggestions, {
        itinerary,
        targetDayIndex: 0,
        targetSlotType: "afternoon",
      });

      expect(filtered).toHaveLength(1);
      expect(filtered[0].validationWarnings).toBeDefined();
      expect(filtered[0].validationWarnings?.some((w) => w.includes("museum"))).toBe(true);
    });

    it("should sort filtered suggestions by adjusted score", () => {
      // Create a clean itinerary
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [], // Empty day for testing
          }),
        ],
      });

      const suggestions = [
        createMockActivity({
          id: "low",
          score: 70,
          activity: {
            name: "Low Score Activity",
            description: "Low score",
            category: "sightseeing",
            duration: 60,
            place: {
              googlePlaceId: "low-place",
              name: "Low Score Place",
              address: "123 Low St",
              neighborhood: "Tokyo",
              coordinates: { lat: 35.68, lng: 139.76 },
            },
            isFree: false,
            tags: ["activity"],
            source: "ai" as const,
          },
          matchReasons: [],
          tradeoffs: [],
        }),
        createMockActivity({
          id: "high",
          score: 95,
          activity: {
            name: "High Score Activity",
            description: "High score",
            category: "sightseeing",
            duration: 60,
            place: {
              googlePlaceId: "high-place",
              name: "High Score Place",
              address: "123 High St",
              neighborhood: "Tokyo",
              coordinates: { lat: 35.68, lng: 139.76 },
            },
            isFree: false,
            tags: ["activity"],
            source: "ai" as const,
          },
          matchReasons: [],
          tradeoffs: [],
        }),
        createMockActivity({
          id: "mid",
          score: 85,
          activity: {
            name: "Mid Score Activity",
            description: "Mid score",
            category: "sightseeing",
            duration: 60,
            place: {
              googlePlaceId: "mid-place",
              name: "Mid Score Place",
              address: "123 Mid St",
              neighborhood: "Tokyo",
              coordinates: { lat: 35.68, lng: 139.76 },
            },
            isFree: false,
            tags: ["activity"],
            source: "ai" as const,
          },
          matchReasons: [],
          tradeoffs: [],
        }),
      ];

      const filtered = service.filterSuggestions(suggestions, {
        itinerary,
        targetDayIndex: 0,
        targetSlotType: "afternoon",
      });

      expect(filtered[0].activity.name).toBe("High Score Activity");
      expect(filtered[1].activity.name).toBe("Mid Score Activity");
      expect(filtered[2].activity.name).toBe("Low Score Activity");
    });
  });

  describe("checkSuggestionValidity", () => {
    it("should return invalid for duplicate activities", () => {
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [
              createMockSlot({
                options: [createMockActivity({ activity: { ...createMockActivity().activity, name: "Existing Activity" } })],
              }),
            ],
          }),
        ],
      });

      const suggestion = createMockActivity({
        activity: { ...createMockActivity().activity, name: "Existing Activity" },
      });

      const result = service.checkSuggestionValidity(suggestion, {
        itinerary,
        targetDayIndex: 0,
        targetSlotType: "afternoon",
      });

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toContain("already in the itinerary");
    });

    it("should return valid with warnings for near-overflow duration", () => {
      // Create a clean itinerary without conflicting activities
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [], // Empty day for testing
          }),
        ],
      });

      const suggestion = createMockActivity({
        id: "overflow-1",
        activity: {
          name: "Overflow Activity",
          description: "Slightly long",
          category: "sightseeing",
          duration: 100, // Slightly over 90 min slot
          place: {
            googlePlaceId: "overflow-place",
            name: "Overflow Place",
            address: "123 Overflow St",
            neighborhood: "Tokyo",
            coordinates: { lat: 35.68, lng: 139.76 },
          },
          isFree: false,
          tags: ["activity"],
          source: "ai" as const,
        },
        matchReasons: [],
        tradeoffs: [],
      });

      const result = service.checkSuggestionValidity(suggestion, {
        itinerary,
        targetDayIndex: 0,
        targetSlotType: "lunch",
        targetTimeRange: { start: "12:00", end: "13:30" }, // 90 minutes
      });

      expect(result.isValid).toBe(true);
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.scoreAdjustment).toBeLessThan(0);
    });

    it("should handle suggestions without place data", () => {
      // Create a clean itinerary
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [], // Empty day for testing
          }),
        ],
      });

      const suggestion = createMockActivity({
        id: "no-place-1",
        activity: {
          name: "Virtual Activity",
          description: "No place",
          category: "activity",
          duration: 60,
          place: null,
          isFree: true,
          tags: ["virtual"],
          source: "ai" as const,
        },
        matchReasons: [],
        tradeoffs: [],
      });

      const result = service.checkSuggestionValidity(suggestion, {
        itinerary,
        targetDayIndex: 0,
        targetSlotType: "afternoon",
      });

      expect(result.isValid).toBe(true);
    });
  });
});

// ============================================
// SINGLETON TESTS
// ============================================

describe("Singleton Pattern", () => {
  it("getValidationService should return the same instance", () => {
    const service1 = getValidationService();
    const service2 = getValidationService();

    expect(service1).toBe(service2);
  });

  it("createValidationService should create new instances", () => {
    const service1 = createValidationService();
    const service2 = createValidationService();

    expect(service1).not.toBe(service2);
  });
});

// ============================================
// CACHE TESTS
// ============================================

describe("Validation Cache", () => {
  let service: ItineraryValidationService;

  beforeEach(() => {
    service = createValidationService();
  });

  it("should cache validation state", () => {
    const itinerary = createMockItinerary();

    const state1 = service.validateItinerary(itinerary);
    const state2 = service.getValidationState(itinerary);

    expect(state1.lastValidatedAt).toEqual(state2.lastValidatedAt);
  });

  it("should invalidate cache when requested", () => {
    const itinerary = createMockItinerary();

    service.validateItinerary(itinerary);
    service.invalidateCache();

    // After invalidation, getValidationState should re-validate
    const newState = service.getValidationState(itinerary);
    expect(newState).toBeDefined();
  });
});

// ============================================
// EDGE CASE TESTS
// ============================================

describe("Edge Cases", () => {
  let service: ItineraryValidationService;

  beforeEach(() => {
    service = createValidationService();
  });

  describe("getSlotViolations / getDayViolations edge cases", () => {
    it("should return empty array for non-existent slot ID", () => {
      const itinerary = createMockItinerary();
      service.validateItinerary(itinerary);

      const violations = service.getSlotViolations("non-existent-slot-id");
      expect(violations).toEqual([]);
    });

    it("should return empty array for non-existent day index", () => {
      const itinerary = createMockItinerary();
      service.validateItinerary(itinerary);

      const violations = service.getDayViolations(999);
      expect(violations).toEqual([]);
    });

    it("should return empty array when validation state is null", () => {
      // Don't call validateItinerary, so state is null
      const slotViolations = service.getSlotViolations("any-slot");
      const dayViolations = service.getDayViolations(0);

      expect(slotViolations).toEqual([]);
      expect(dayViolations).toEqual([]);
    });
  });

  describe("null safety in activity matching", () => {
    it("should handle activity with undefined name in duplicate check", () => {
      const itinerary = createMockItinerary();

      // Suggestion with undefined name should not match anything
      const suggestionWithNoName = createMockActivity({
        id: "no-name-activity",
        activity: {
          ...createMockActivity().activity,
          name: undefined as unknown as string,
        },
      });

      const result = service.checkSuggestionValidity(suggestionWithNoName, {
        itinerary,
        targetDayIndex: 0,
        targetSlotType: "afternoon",
      });

      // Should not crash and should be valid (undefined doesn't match anything)
      expect(result.isValid).toBe(true);
    });

    it("should not match when both activity names are undefined", () => {
      // Create itinerary with an activity that has undefined name
      const activityWithNoName = createMockActivity({
        id: "existing-no-name",
        activity: {
          ...createMockActivity().activity,
          name: undefined as unknown as string,
        },
      });

      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [createMockSlot({ options: [activityWithNoName] })],
          }),
        ],
      });

      const suggestionWithNoName = createMockActivity({
        id: "suggestion-no-name",
        activity: {
          ...createMockActivity().activity,
          name: undefined as unknown as string,
        },
      });

      const result = service.checkSuggestionValidity(suggestionWithNoName, {
        itinerary,
        targetDayIndex: 0,
        targetSlotType: "afternoon",
      });

      // Should not incorrectly match undefined === undefined
      expect(result.isValid).toBe(true);
    });
  });

  describe("empty itinerary handling", () => {
    it("should handle itinerary with no days", () => {
      const emptyItinerary = createMockItinerary({ days: [] });
      const state = service.validateItinerary(emptyItinerary);

      expect(state.isValid).toBe(true);
      expect(state.violations).toEqual([]);
      expect(state.healthScore).toBe(100);
    });

    it("should handle day with no slots", () => {
      const itinerary = createMockItinerary({
        days: [createMockDay({ slots: [] })],
      });

      const state = service.validateItinerary(itinerary);
      expect(state.isValid).toBe(true);
    });
  });

  describe("target day validation", () => {
    it("should return invalid for target day that does not exist", () => {
      const itinerary = createMockItinerary(); // Has 1 day (index 0)

      const suggestion = createMockActivity();
      const result = service.checkSuggestionValidity(suggestion, {
        itinerary,
        targetDayIndex: 5, // Does not exist
        targetSlotType: "afternoon",
      });

      expect(result.isValid).toBe(false);
      expect(result.invalidReason).toBe("Target day does not exist");
    });
  });

  describe("activity without place data", () => {
    it("should handle suggestion without coordinates for geographic check", () => {
      const itinerary = createMockItinerary();

      const suggestionNoPlace = createMockActivity({
        id: "no-place",
        activity: {
          name: "Virtual Activity",
          description: "No location",
          category: "activity",
          duration: 60,
          place: null,
          isFree: true,
          tags: ["virtual"],
          source: "ai" as const,
        },
      });

      const result = service.checkSuggestionValidity(suggestionNoPlace, {
        itinerary,
        targetDayIndex: 0,
        targetSlotType: "afternoon",
      });

      expect(result.isValid).toBe(true);
    });

    it("should handle day with no activities with coordinates", () => {
      const activityNoCoords = createMockActivity({
        id: "no-coords",
        activity: {
          name: "Activity Without Location",
          description: "Test",
          category: "activity",
          duration: 60,
          place: null,
          isFree: true,
          tags: [],
          source: "ai" as const,
        },
      });

      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [createMockSlot({ options: [activityNoCoords] })],
          }),
        ],
      });

      const suggestion = createMockActivity({
        id: "new-activity",
        activity: {
          name: "New Activity With Location",
          description: "Test",
          category: "activity",
          duration: 60,
          place: {
            googlePlaceId: "new-place",
            name: "New Place",
            address: "123 Test St",
            neighborhood: "Test Area",
            coordinates: { lat: 35.6762, lng: 139.6503 },
          },
          isFree: true,
          tags: [],
          source: "ai" as const,
        },
      });

      const result = service.checkSuggestionValidity(suggestion, {
        itinerary,
        targetDayIndex: 0,
        targetSlotType: "afternoon",
      });

      // Should be valid since there are no existing coords to compare against
      expect(result.isValid).toBe(true);
    });
  });
});
