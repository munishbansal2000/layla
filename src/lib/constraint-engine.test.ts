/**
 * Unit Tests for Constraint Engine
 *
 * Tests the 7-layer constraint validation system:
 * 1. Temporal: Activity fits within slot time
 * 2. Travel: Enough time to commute between activities
 * 3. Clustering: Prefer keeping cluster activities together
 * 4. Dependencies: Respect must-before/after relationships
 * 5. Pacing: Don't overload days
 * 6. Fragility: Weather-sensitive, crowd times, bookings
 * 7. Cross-day: Intercity travel, hotel check-in/out
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  ConstraintEngine,
  parseTimeToMinutes,
  formatMinutesToTime,
  haversineDistance,
  getSelectedActivity,
  findActivityByName,
  findSlotById,
  calculateRigidity,
  validateTemporalConstraints,
  validateTravelConstraints,
  validateClusteringConstraints,
  validateDependencyConstraints,
  validatePacingConstraints,
  validateFragilityConstraints,
  validateCrossDayConstraints,
} from "./constraint-engine";

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
    score: 0.9,
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
// UTILITY FUNCTION TESTS
// ============================================

describe("Utility Functions", () => {
  describe("parseTimeToMinutes", () => {
    it("should parse valid time strings", () => {
      expect(parseTimeToMinutes("00:00")).toBe(0);
      expect(parseTimeToMinutes("09:00")).toBe(540);
      expect(parseTimeToMinutes("12:30")).toBe(750);
      expect(parseTimeToMinutes("23:59")).toBe(1439);
    });
  });

  describe("formatMinutesToTime", () => {
    it("should format minutes to time strings", () => {
      expect(formatMinutesToTime(0)).toBe("00:00");
      expect(formatMinutesToTime(540)).toBe("09:00");
      expect(formatMinutesToTime(750)).toBe("12:30");
      expect(formatMinutesToTime(1439)).toBe("23:59");
    });
  });

  describe("haversineDistance", () => {
    it("should calculate distance between two points", () => {
      // Tokyo to Kyoto approximate distance
      const distance = haversineDistance(35.6762, 139.6503, 35.0116, 135.7681);
      // Should be roughly 370-380 km
      expect(distance).toBeGreaterThan(370000);
      expect(distance).toBeLessThan(380000);
    });

    it("should return 0 for same location", () => {
      const distance = haversineDistance(35.6762, 139.6503, 35.6762, 139.6503);
      expect(distance).toBe(0);
    });
  });

  describe("getSelectedActivity", () => {
    it("should return selected activity when selectedOptionId is set", () => {
      const slot = createMockSlot({
        options: [
          createMockActivity({ id: "opt-1" }),
          createMockActivity({ id: "opt-2" }),
        ],
        selectedOptionId: "opt-2",
      });
      const activity = getSelectedActivity(slot);
      expect(activity?.id).toBe("opt-2");
    });

    it("should return first activity when no selection", () => {
      const slot = createMockSlot({
        options: [
          createMockActivity({ id: "opt-1" }),
          createMockActivity({ id: "opt-2" }),
        ],
      });
      const activity = getSelectedActivity(slot);
      expect(activity?.id).toBe("opt-1");
    });

    it("should return null for empty options", () => {
      const slot = createMockSlot({ options: [] });
      const activity = getSelectedActivity(slot);
      expect(activity).toBeNull();
    });
  });

  describe("findActivityByName", () => {
    it("should find activity by exact name match", () => {
      const activity = createMockActivity({
        activity: {
          ...createMockActivity().activity,
          name: "Senso-ji Temple",
        },
      });
      const itinerary = createMockItinerary({
        days: [createMockDay({ slots: [createMockSlot({ options: [activity] })] })],
      });

      const location = findActivityByName(itinerary, "Senso-ji Temple");
      expect(location).not.toBeNull();
      expect(location?.option.activity?.name).toBe("Senso-ji Temple");
    });

    it("should find activity by partial match", () => {
      const activity = createMockActivity({
        activity: {
          ...createMockActivity().activity,
          name: "Senso-ji Temple",
        },
      });
      const itinerary = createMockItinerary({
        days: [createMockDay({ slots: [createMockSlot({ options: [activity] })] })],
      });

      const location = findActivityByName(itinerary, "senso-ji");
      expect(location).not.toBeNull();
    });

    it("should return null for non-existent activity", () => {
      const itinerary = createMockItinerary();
      const location = findActivityByName(itinerary, "Non-existent Activity");
      expect(location).toBeNull();
    });
  });

  describe("findSlotById", () => {
    it("should find slot by ID", () => {
      const itinerary = createMockItinerary();
      const location = findSlotById(itinerary, "slot-2");
      expect(location).not.toBeNull();
      expect(location?.slotId).toBe("slot-2");
      expect(location?.dayIndex).toBe(0);
      expect(location?.slotIndex).toBe(1);
    });

    it("should return null for non-existent slot", () => {
      const itinerary = createMockItinerary();
      const location = findSlotById(itinerary, "non-existent");
      expect(location).toBeNull();
    });
  });

  describe("calculateRigidity", () => {
    it("should return explicit rigidity score if set", () => {
      const slot = createMockSlot({ rigidityScore: 0.8 });
      expect(calculateRigidity(slot)).toBe(0.8);
    });

    it("should return 1.0 for anchor behavior", () => {
      const slot = createMockSlot({ behavior: "anchor" });
      expect(calculateRigidity(slot)).toBe(1.0);
    });

    it("should return 0.6 for meal behavior", () => {
      const slot = createMockSlot({ behavior: "meal" });
      expect(calculateRigidity(slot)).toBe(0.6);
    });

    it("should return 0.4 for flex behavior", () => {
      const slot = createMockSlot({ behavior: "flex" });
      expect(calculateRigidity(slot)).toBe(0.4);
    });

    it("should return 0.2 for optional behavior", () => {
      const slot = createMockSlot({ behavior: "optional" });
      expect(calculateRigidity(slot)).toBe(0.2);
    });
  });
});

// ============================================
// CONSTRAINT VALIDATOR TESTS
// ============================================

describe("Constraint Validators", () => {
  describe("Layer 1: Temporal Constraints", () => {
    it("should pass when activity fits in slot", () => {
      const slot = createMockSlot({
        timeRange: { start: "09:00", end: "12:00" }, // 180 minutes
      });
      const activity = createMockActivity({
        activity: { ...createMockActivity().activity, duration: 120 },
      });

      const violations = validateTemporalConstraints(slot, activity);
      expect(violations).toHaveLength(0);
    });

    it("should warn when activity exceeds slot duration", () => {
      const slot = createMockSlot({
        timeRange: { start: "09:00", end: "10:00" }, // 60 minutes
      });
      const activity = createMockActivity({
        activity: { ...createMockActivity().activity, duration: 120 },
      });

      const violations = validateTemporalConstraints(slot, activity);
      expect(violations).toHaveLength(1);
      expect(violations[0].layer).toBe("temporal");
      expect(violations[0].severity).toBe("warning");
    });
  });

  describe("Layer 2: Travel Constraints", () => {
    it("should pass when there's enough time for commute", () => {
      const day = createMockDay({
        slots: [
          createMockSlot({
            slotId: "slot-1",
            timeRange: { start: "09:00", end: "11:00" },
          }),
          createMockSlot({
            slotId: "slot-2",
            timeRange: { start: "11:30", end: "13:00" }, // 30 min gap
            commuteFromPrevious: {
              duration: 20,
              distance: 2000,
              method: "walk",
              instructions: "Walk 20 minutes",
            },
          }),
        ],
      });

      const violations = validateTravelConstraints(day, {
        strictMode: false,
        autoAdjust: true,
        respectClusters: true,
        weatherAware: true,
        maxDailyWalkingDistance: 15000,
        minActivityBuffer: 15,
      });

      // Should not have travel time errors
      const errors = violations.filter((v) => v.severity === "error");
      expect(errors).toHaveLength(0);
    });

    it("should error when commute exceeds available gap", () => {
      const day = createMockDay({
        slots: [
          createMockSlot({
            slotId: "slot-1",
            timeRange: { start: "09:00", end: "11:00" },
          }),
          createMockSlot({
            slotId: "slot-2",
            timeRange: { start: "11:10", end: "13:00" }, // Only 10 min gap
            commuteFromPrevious: {
              duration: 30, // Need 30 minutes
              distance: 3000,
              method: "walk",
              instructions: "Walk 30 minutes",
            },
          }),
        ],
      });

      const violations = validateTravelConstraints(day, {
        strictMode: false,
        autoAdjust: true,
        respectClusters: true,
        weatherAware: true,
        maxDailyWalkingDistance: 15000,
        minActivityBuffer: 15,
      });

      const errors = violations.filter((v) => v.severity === "error");
      expect(errors.length).toBeGreaterThan(0);
      expect(errors[0].layer).toBe("travel");
    });
  });

  describe("Layer 3: Clustering Constraints", () => {
    it("should warn about cluster fragmentation", () => {
      const day = createMockDay({
        slots: [
          createMockSlot({ slotId: "slot-1", clusterId: "shibuya" }),
          createMockSlot({ slotId: "slot-2", clusterId: "shinjuku" }),
          createMockSlot({ slotId: "slot-3", clusterId: "shibuya" }), // Back to shibuya
        ],
      });

      const violations = validateClusteringConstraints(day, {
        strictMode: false,
        autoAdjust: true,
        respectClusters: true,
        weatherAware: true,
        maxDailyWalkingDistance: 15000,
        minActivityBuffer: 15,
      });

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].layer).toBe("clustering");
    });

    it("should not warn when respectClusters is false", () => {
      const day = createMockDay({
        slots: [
          createMockSlot({ slotId: "slot-1", clusterId: "shibuya" }),
          createMockSlot({ slotId: "slot-2", clusterId: "shinjuku" }),
          createMockSlot({ slotId: "slot-3", clusterId: "shibuya" }),
        ],
      });

      const violations = validateClusteringConstraints(day, {
        strictMode: false,
        autoAdjust: true,
        respectClusters: false,
        weatherAware: true,
        maxDailyWalkingDistance: 15000,
        minActivityBuffer: 15,
      });

      expect(violations).toHaveLength(0);
    });
  });

  describe("Layer 4: Dependency Constraints", () => {
    it("should error on must-before violation", () => {
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [
              createMockSlot({
                slotId: "slot-1",
                dependencies: [{ type: "must-before", targetSlotId: "slot-2" }],
              }),
              createMockSlot({ slotId: "slot-2" }),
            ],
          }),
        ],
      });

      // slot-1 has must-before slot-2, but slot-1 is at index 0 and slot-2 is at index 1
      // This should be valid (slot-1 IS before slot-2)
      const violations = validateDependencyConstraints(itinerary);
      expect(violations).toHaveLength(0);
    });

    it("should error when must-before is violated", () => {
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [
              createMockSlot({ slotId: "slot-2" }),
              createMockSlot({
                slotId: "slot-1",
                dependencies: [{ type: "must-before", targetSlotId: "slot-2" }],
              }), // slot-1 claims it must be before slot-2, but it's after
            ],
          }),
        ],
      });

      const violations = validateDependencyConstraints(itinerary);
      const dependencyErrors = violations.filter((v) => v.layer === "dependencies");
      expect(dependencyErrors.length).toBeGreaterThan(0);
    });
  });

  describe("Layer 5: Pacing Constraints", () => {
    it("should warn when day is overloaded", () => {
      // Create a day with activities totaling more than 10 hours
      const day = createMockDay({
        slots: [
          createMockSlot({
            slotId: "slot-1",
            options: [createMockActivity({ activity: { ...createMockActivity().activity, duration: 180 } })],
          }),
          createMockSlot({
            slotId: "slot-2",
            options: [createMockActivity({ activity: { ...createMockActivity().activity, duration: 180 } })],
          }),
          createMockSlot({
            slotId: "slot-3",
            options: [createMockActivity({ activity: { ...createMockActivity().activity, duration: 180 } })],
          }),
          createMockSlot({
            slotId: "slot-4",
            options: [createMockActivity({ activity: { ...createMockActivity().activity, duration: 180 } })],
          }),
        ],
      });

      const violations = validatePacingConstraints(day, {
        strictMode: false,
        autoAdjust: true,
        respectClusters: true,
        weatherAware: true,
        maxDailyWalkingDistance: 15000,
        minActivityBuffer: 15,
      });

      const pacingWarnings = violations.filter((v) => v.layer === "pacing");
      expect(pacingWarnings.length).toBeGreaterThan(0);
    });

    it("should warn when daily walking distance exceeds limit", () => {
      const day = createMockDay({
        slots: [
          createMockSlot({ slotId: "slot-1" }),
          createMockSlot({
            slotId: "slot-2",
            commuteFromPrevious: { duration: 60, distance: 5000, method: "walk", instructions: "" },
          }),
          createMockSlot({
            slotId: "slot-3",
            commuteFromPrevious: { duration: 60, distance: 6000, method: "walk", instructions: "" },
          }),
          createMockSlot({
            slotId: "slot-4",
            commuteFromPrevious: { duration: 60, distance: 6000, method: "walk", instructions: "" },
          }),
        ],
      });

      const violations = validatePacingConstraints(day, {
        strictMode: false,
        autoAdjust: true,
        respectClusters: true,
        weatherAware: true,
        maxDailyWalkingDistance: 15000, // 15km limit
        minActivityBuffer: 15,
      });

      const walkingWarnings = violations.filter((v) => v.message.includes("walking"));
      expect(walkingWarnings.length).toBeGreaterThan(0);
    });
  });

  describe("Layer 6: Fragility Constraints", () => {
    it("should inform about weather-sensitive activities", () => {
      const slot = createMockSlot({
        fragility: {
          weatherSensitivity: "high",
          crowdSensitivity: "none",
          bookingRequired: false,
        },
      });

      const violations = validateFragilityConstraints(slot, {
        strictMode: false,
        autoAdjust: true,
        respectClusters: true,
        weatherAware: true,
        maxDailyWalkingDistance: 15000,
        minActivityBuffer: 15,
      });

      expect(violations.length).toBeGreaterThan(0);
      expect(violations[0].layer).toBe("fragility");
      expect(violations[0].message).toContain("weather-sensitive");
    });

    it("should warn about booking requirements", () => {
      const slot = createMockSlot({
        fragility: {
          weatherSensitivity: "none",
          crowdSensitivity: "none",
          bookingRequired: true,
          bookingUrl: "https://example.com/book",
        },
      });

      const violations = validateFragilityConstraints(slot, {
        strictMode: false,
        autoAdjust: true,
        respectClusters: true,
        weatherAware: true,
        maxDailyWalkingDistance: 15000,
        minActivityBuffer: 15,
      });

      const bookingWarnings = violations.filter((v) => v.message.includes("booking"));
      expect(bookingWarnings.length).toBeGreaterThan(0);
    });

    it("should not check weather when weatherAware is false", () => {
      const slot = createMockSlot({
        fragility: {
          weatherSensitivity: "high",
          crowdSensitivity: "none",
          bookingRequired: false,
        },
      });

      const violations = validateFragilityConstraints(slot, {
        strictMode: false,
        autoAdjust: true,
        respectClusters: true,
        weatherAware: false,
        maxDailyWalkingDistance: 15000,
        minActivityBuffer: 15,
      });

      expect(violations).toHaveLength(0);
    });
  });

  describe("Layer 7: Cross-day Constraints", () => {
    it("should warn when buffer before intercity travel is too short", () => {
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [
              createMockSlot({
                slotId: "slot-1",
                timeRange: { start: "09:00", end: "11:50" }, // Ends at 11:50
              }),
            ],
            cityTransition: {
              from: "Tokyo",
              to: "Kyoto",
              method: "shinkansen",
              duration: 120,
              departureTime: "12:00", // Only 10 min after last activity
              arrivalTime: "14:00",
              trainName: "Nozomi",
              commuteToStation: { duration: 15, distance: 1000, method: "walk", instructions: "" },
            },
          }),
        ],
      });

      const violations = validateCrossDayConstraints(itinerary);
      const crossDayWarnings = violations.filter((v) => v.layer === "cross-day");
      expect(crossDayWarnings.length).toBeGreaterThan(0);
    });
  });
});

// ============================================
// CONSTRAINT ENGINE CLASS TESTS
// ============================================

describe("ConstraintEngine Class", () => {
  let engine: ConstraintEngine;

  beforeEach(() => {
    engine = new ConstraintEngine();
  });

  describe("validateItinerary", () => {
    it("should return feasible for valid itinerary", () => {
      const itinerary = createMockItinerary();
      const analysis = engine.validateItinerary(itinerary);

      expect(analysis.feasible).toBe(true);
    });

    it("should return infeasible when there are errors", () => {
      // Create an itinerary with a dependency violation
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [
              createMockSlot({ slotId: "slot-2" }),
              createMockSlot({
                slotId: "slot-1",
                dependencies: [{ type: "must-before", targetSlotId: "slot-2" }],
              }),
            ],
          }),
        ],
      });

      const analysis = engine.validateItinerary(itinerary);
      expect(analysis.feasible).toBe(false);
    });

    it("should aggregate violations from all layers", () => {
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [
              createMockSlot({
                slotId: "slot-1",
                timeRange: { start: "09:00", end: "09:30" },
                options: [createMockActivity({ activity: { ...createMockActivity().activity, duration: 120 } })],
                fragility: { weatherSensitivity: "high", crowdSensitivity: "none", bookingRequired: false },
              }),
            ],
          }),
        ],
      });

      const analysis = engine.validateItinerary(itinerary);
      expect(analysis.violations.length).toBeGreaterThan(0);
      expect(analysis.affectedLayers.length).toBeGreaterThan(0);
    });
  });

  describe("canMoveSlot", () => {
    it("should allow moving flexible slots", () => {
      const itinerary = createMockItinerary();
      const analysis = engine.canMoveSlot(itinerary, "slot-1", 0, 2);

      expect(analysis.feasible).toBe(true);
    });

    it("should prevent moving locked slots", () => {
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [createMockSlot({ slotId: "slot-1", isLocked: true })],
          }),
        ],
      });

      const analysis = engine.canMoveSlot(itinerary, "slot-1", 0, 1);
      expect(analysis.feasible).toBe(false);
    });

    it("should prevent moving slots with timed tickets", () => {
      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [
              createMockSlot({
                slotId: "slot-1",
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

      const analysis = engine.canMoveSlot(itinerary, "slot-1", 0, 1);
      expect(analysis.feasible).toBe(false);
    });

    it("should error for non-existent slot", () => {
      const itinerary = createMockItinerary();
      const analysis = engine.canMoveSlot(itinerary, "non-existent", 0, 1);

      expect(analysis.feasible).toBe(false);
      expect(analysis.violations[0].message).toContain("not found");
    });

    it("should error for non-existent day", () => {
      const itinerary = createMockItinerary();
      const analysis = engine.canMoveSlot(itinerary, "slot-1", 99);

      expect(analysis.feasible).toBe(false);
    });
  });

  describe("Configuration", () => {
    it("should use strict mode when configured", () => {
      engine = new ConstraintEngine({ strictMode: true });

      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [
              createMockSlot({
                slotId: "slot-1",
                fragility: { weatherSensitivity: "high", crowdSensitivity: "none", bookingRequired: false },
              }),
            ],
          }),
        ],
      });

      const analysis = engine.validateItinerary(itinerary);
      // In strict mode, warnings make the itinerary infeasible
      if (analysis.violations.some((v) => v.severity === "warning")) {
        expect(analysis.feasible).toBe(false);
      }
    });

    it("should allow updating configuration", () => {
      engine.updateConfig({ maxDailyWalkingDistance: 20000 });
      const config = engine.getConfig();
      expect(config.maxDailyWalkingDistance).toBe(20000);
    });
  });
});
