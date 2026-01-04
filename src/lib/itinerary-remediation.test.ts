/**
 * Unit Tests for Itinerary Remediation Service
 *
 * Tests the remediation capabilities:
 * 1. Remove impossible slots (before arrival / after departure)
 * 2. Remove cross-day duplicates
 * 3. Fix slot behaviors (travel, meal, anchor)
 * 4. Flag meals with long commutes
 * 5. Flag empty slots
 * 6. Recalculate slot IDs
 */

import { describe, it, expect } from "vitest";
import {
  remediateItinerary,
  remediateRemoveImpossibleSlots,
  remediateCrossDayDuplicates,
  remediateFixTransferBehavior,
  remediateFixMealBehavior,
  remediateFixAnchorBehavior,
  remediateMealLongCommute,
  remediateEmptySlots,
  remediateRecalculateSlotIds,
  type FlightConstraints,
} from "./itinerary-remediation";

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
      createMockSlot({ slotId: "d1-slot-1", slotType: "morning", timeRange: { start: "09:00", end: "12:00" } }),
      createMockSlot({ slotId: "d1-slot-2", slotType: "lunch", timeRange: { start: "12:00", end: "13:30" } }),
      createMockSlot({ slotId: "d1-slot-3", slotType: "afternoon", timeRange: { start: "14:00", end: "17:00" } }),
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
// REMOVE IMPOSSIBLE SLOTS TESTS
// ============================================

describe("remediateRemoveImpossibleSlots", () => {
  it("should remove slots before arrival time on Day 1", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          dayNumber: 1,
          slots: [
            createMockSlot({ slotId: "early-slot", timeRange: { start: "08:00", end: "10:00" } }),
            createMockSlot({ slotId: "afternoon-slot", timeRange: { start: "14:00", end: "17:00" } }),
          ],
        }),
      ],
    });

    const constraints: FlightConstraints = {
      arrivalFlightTime: "11:00", // Arrival at 11am, earliest activity at 1pm
    };

    const result = remediateRemoveImpossibleSlots(itinerary, constraints);

    expect(result.changes.length).toBe(1);
    expect(result.changes[0].type).toBe("REMOVED_IMPOSSIBLE_SLOT");
    expect(result.itinerary.days[0].slots.length).toBe(1);
    expect(result.itinerary.days[0].slots[0].slotId).toBe("afternoon-slot");
  });

  it("should remove slots after departure time on last day", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          dayNumber: 1,
          slots: [
            createMockSlot({ slotId: "morning-slot", timeRange: { start: "09:00", end: "12:00" } }),
            createMockSlot({ slotId: "late-slot", timeRange: { start: "15:00", end: "18:00" } }),
          ],
        }),
      ],
    });

    const constraints: FlightConstraints = {
      departureFlightTime: "16:00", // Departure at 4pm, latest activity should end by 1pm
    };

    const result = remediateRemoveImpossibleSlots(itinerary, constraints);

    expect(result.changes.length).toBe(1);
    expect(result.changes[0].type).toBe("REMOVED_IMPOSSIBLE_SLOT");
    expect(result.itinerary.days[0].slots.length).toBe(1);
    expect(result.itinerary.days[0].slots[0].slotId).toBe("morning-slot");
  });

  it("should keep travel slots even when outside time constraints", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          dayNumber: 1,
          slots: [
            createMockSlot({
              slotId: "airport-transfer",
              behavior: "travel",
              timeRange: { start: "08:00", end: "09:00" },
            }),
            createMockSlot({ slotId: "afternoon-slot", timeRange: { start: "14:00", end: "17:00" } }),
          ],
        }),
      ],
    });

    const constraints: FlightConstraints = {
      arrivalFlightTime: "11:00",
    };

    const result = remediateRemoveImpossibleSlots(itinerary, constraints);

    // Travel slot should be kept
    expect(result.itinerary.days[0].slots.length).toBe(2);
  });

  it("should return unchanged itinerary when no constraints provided", () => {
    const itinerary = createMockItinerary();

    const result = remediateRemoveImpossibleSlots(itinerary, undefined);

    expect(result.changes.length).toBe(0);
    expect(result.itinerary).toEqual(itinerary);
  });
});

// ============================================
// CROSS-DAY DUPLICATES TESTS
// ============================================

describe("remediateCrossDayDuplicates", () => {
  it("should remove duplicate activities by name across days", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          dayNumber: 1,
          slots: [
            createMockSlot({
              slotId: "day1-slot",
              options: [createMockActivity({ activity: { ...createMockActivity().activity, name: "Senso-ji Temple" } })],
            }),
          ],
        }),
        createMockDay({
          dayNumber: 2,
          slots: [
            createMockSlot({
              slotId: "day2-slot",
              options: [createMockActivity({ activity: { ...createMockActivity().activity, name: "Senso-ji Temple" } })],
            }),
          ],
        }),
      ],
    });

    const result = remediateCrossDayDuplicates(itinerary);

    expect(result.changes.length).toBe(1);
    expect(result.changes[0].type).toBe("REMOVED_DUPLICATE");
    expect(result.changes[0].day).toBe(2);
    expect(result.itinerary.days[1].slots.length).toBe(0);
  });

  it("should remove duplicate activities by placeId across days", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          dayNumber: 1,
          slots: [
            createMockSlot({
              slotId: "day1-slot",
              options: [
                createMockActivity({
                  activity: {
                    ...createMockActivity().activity,
                    name: "Temple A",
                    place: { ...createMockActivity().activity.place!, googlePlaceId: "same-place-id" },
                  },
                }),
              ],
            }),
          ],
        }),
        createMockDay({
          dayNumber: 2,
          slots: [
            createMockSlot({
              slotId: "day2-slot",
              options: [
                createMockActivity({
                  activity: {
                    ...createMockActivity().activity,
                    name: "Temple B", // Different name
                    place: { ...createMockActivity().activity.place!, googlePlaceId: "same-place-id" }, // Same placeId
                  },
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const result = remediateCrossDayDuplicates(itinerary);

    expect(result.changes.length).toBe(1);
    expect(result.changes[0].type).toBe("REMOVED_DUPLICATE");
  });

  it("should keep unique activities across days", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          dayNumber: 1,
          slots: [
            createMockSlot({
              slotId: "day1-slot",
              options: [createMockActivity({
                activity: {
                  ...createMockActivity().activity,
                  name: "Senso-ji Temple",
                  place: { ...createMockActivity().activity.place!, googlePlaceId: "sensoji-place" },
                }
              })],
            }),
          ],
        }),
        createMockDay({
          dayNumber: 2,
          slots: [
            createMockSlot({
              slotId: "day2-slot",
              options: [createMockActivity({
                activity: {
                  ...createMockActivity().activity,
                  name: "Meiji Shrine",
                  place: { ...createMockActivity().activity.place!, googlePlaceId: "meiji-place" },
                }
              })],
            }),
          ],
        }),
      ],
    });

    const result = remediateCrossDayDuplicates(itinerary);

    expect(result.changes.length).toBe(0);
    expect(result.itinerary.days[0].slots.length).toBe(1);
    expect(result.itinerary.days[1].slots.length).toBe(1);
  });
});

// ============================================
// FIX TRANSFER BEHAVIOR TESTS
// ============================================

describe("remediateFixTransferBehavior", () => {
  it("should set behavior to travel for transport category activities", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          slots: [
            createMockSlot({
              slotId: "transport-slot",
              behavior: undefined,
              options: [
                createMockActivity({
                  activity: {
                    ...createMockActivity().activity,
                    name: "Airport Bus",
                    category: "transport",
                  },
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const result = remediateFixTransferBehavior(itinerary);

    expect(result.changes.length).toBe(1);
    expect(result.changes[0].type).toBe("FIXED_TRANSFER_BEHAVIOR");
    expect(result.itinerary.days[0].slots[0].behavior).toBe("travel");
  });

  it("should set behavior to travel for Shinkansen activities", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          slots: [
            createMockSlot({
              slotId: "shinkansen-slot",
              behavior: undefined,
              options: [
                createMockActivity({
                  activity: {
                    ...createMockActivity().activity,
                    name: "Shinkansen to Kyoto",
                    category: "sightseeing",
                  },
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const result = remediateFixTransferBehavior(itinerary);

    expect(result.changes.length).toBe(1);
    expect(result.itinerary.days[0].slots[0].behavior).toBe("travel");
  });

  it("should not change behavior for non-transport activities", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          slots: [
            createMockSlot({
              slotId: "regular-slot",
              behavior: "flex",
              options: [
                createMockActivity({
                  activity: {
                    ...createMockActivity().activity,
                    name: "Tokyo Tower",
                    category: "landmark",
                  },
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const result = remediateFixTransferBehavior(itinerary);

    expect(result.changes.length).toBe(0);
    expect(result.itinerary.days[0].slots[0].behavior).toBe("flex");
  });
});

// ============================================
// FIX MEAL BEHAVIOR TESTS
// ============================================

describe("remediateFixMealBehavior", () => {
  it("should set behavior to meal for lunch slots", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          slots: [
            createMockSlot({
              slotId: "lunch-slot",
              slotType: "lunch",
              behavior: undefined,
            }),
          ],
        }),
      ],
    });

    const result = remediateFixMealBehavior(itinerary);

    expect(result.changes.length).toBe(1);
    expect(result.changes[0].type).toBe("FIXED_MEAL_BEHAVIOR");
    expect(result.itinerary.days[0].slots[0].behavior).toBe("meal");
  });

  it("should set behavior to meal for dinner slots", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          slots: [
            createMockSlot({
              slotId: "dinner-slot",
              slotType: "dinner",
              behavior: "flex",
            }),
          ],
        }),
      ],
    });

    const result = remediateFixMealBehavior(itinerary);

    expect(result.changes.length).toBe(1);
    expect(result.itinerary.days[0].slots[0].behavior).toBe("meal");
  });

  it("should set behavior to meal for breakfast slots", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          slots: [
            createMockSlot({
              slotId: "breakfast-slot",
              slotType: "breakfast",
              behavior: undefined,
            }),
          ],
        }),
      ],
    });

    const result = remediateFixMealBehavior(itinerary);

    expect(result.changes.length).toBe(1);
    expect(result.itinerary.days[0].slots[0].behavior).toBe("meal");
  });

  it("should not change travel slots to meal", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          slots: [
            createMockSlot({
              slotId: "travel-lunch-slot",
              slotType: "lunch",
              behavior: "travel", // Already set to travel
            }),
          ],
        }),
      ],
    });

    const result = remediateFixMealBehavior(itinerary);

    expect(result.changes.length).toBe(0);
    expect(result.itinerary.days[0].slots[0].behavior).toBe("travel");
  });
});

// ============================================
// FIX ANCHOR BEHAVIOR TESTS
// ============================================

describe("remediateFixAnchorBehavior", () => {
  it("should set behavior to anchor for pre-booked activities", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          slots: [
            createMockSlot({
              slotId: "booked-slot",
              behavior: "flex",
              options: [
                createMockActivity({
                  activity: {
                    ...createMockActivity().activity,
                    name: "TeamLab Borderless",
                    tags: ["pre-booked", "museum"],
                  },
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const result = remediateFixAnchorBehavior(itinerary);

    expect(result.changes.length).toBe(1);
    expect(result.changes[0].type).toBe("FIXED_ANCHOR_BEHAVIOR");
    expect(result.itinerary.days[0].slots[0].behavior).toBe("anchor");
  });

  it("should set behavior to anchor for activities tagged with anchor", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          slots: [
            createMockSlot({
              slotId: "anchor-slot",
              behavior: undefined,
              options: [
                createMockActivity({
                  activity: {
                    ...createMockActivity().activity,
                    name: "Reserved Restaurant",
                    tags: ["anchor"],
                  },
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const result = remediateFixAnchorBehavior(itinerary);

    expect(result.changes.length).toBe(1);
    expect(result.itinerary.days[0].slots[0].behavior).toBe("anchor");
  });

  it("should not change behavior for non-booked activities", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          slots: [
            createMockSlot({
              slotId: "regular-slot",
              behavior: "flex",
              options: [
                createMockActivity({
                  activity: {
                    ...createMockActivity().activity,
                    name: "Tokyo Tower",
                    tags: ["landmark"],
                  },
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const result = remediateFixAnchorBehavior(itinerary);

    expect(result.changes.length).toBe(0);
  });
});

// ============================================
// FLAG MEAL LONG COMMUTE TESTS
// ============================================

describe("remediateMealLongCommute", () => {
  it("should flag lunch with long commute from previous activity", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          slots: [
            createMockSlot({
              slotId: "morning-slot",
              slotType: "morning",
              options: [
                createMockActivity({
                  activity: {
                    ...createMockActivity().activity,
                    place: {
                      ...createMockActivity().activity.place!,
                      coordinates: { lat: 35.6762, lng: 139.6503 },
                    },
                  },
                }),
              ],
            }),
            createMockSlot({
              slotId: "lunch-slot",
              slotType: "lunch",
              commuteFromPrevious: {
                duration: 45, // 45 min commute > 30 min threshold
                distance: 5000,
                method: "transit",
                instructions: "Take train",
              },
            }),
          ],
        }),
      ],
    });

    const result = remediateMealLongCommute(itinerary, 30);

    expect(result.changes.length).toBe(1);
    expect(result.changes[0].type).toBe("FLAGGED_MEAL_FOR_NEARBY_SEARCH");
    expect(result.changes[0].slot).toBe("lunch-slot");
  });

  it("should flag meal with long commute to next activity", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          slots: [
            createMockSlot({
              slotId: "lunch-slot",
              slotType: "lunch",
            }),
            createMockSlot({
              slotId: "afternoon-slot",
              slotType: "afternoon",
              commuteFromPrevious: {
                duration: 60, // Long commute FROM lunch
                distance: 8000,
                method: "transit",
                instructions: "Take train",
              },
              options: [
                createMockActivity({
                  activity: {
                    ...createMockActivity().activity,
                    place: {
                      ...createMockActivity().activity.place!,
                      coordinates: { lat: 35.6900, lng: 139.7000 },
                    },
                  },
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const result = remediateMealLongCommute(itinerary, 30);

    expect(result.changes.length).toBe(1);
    expect(result.changes[0].type).toBe("FLAGGED_MEAL_FOR_NEARBY_SEARCH");
    expect(result.changes[0].slot).toBe("lunch-slot");
  });

  it("should not flag meals with short commutes", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          slots: [
            createMockSlot({
              slotId: "morning-slot",
              slotType: "morning",
            }),
            createMockSlot({
              slotId: "lunch-slot",
              slotType: "lunch",
              commuteFromPrevious: {
                duration: 10, // Short commute
                distance: 500,
                method: "walk",
                instructions: "Walk 10 min",
              },
            }),
          ],
        }),
      ],
    });

    const result = remediateMealLongCommute(itinerary, 30);

    expect(result.changes.length).toBe(0);
  });
});

// ============================================
// FLAG EMPTY SLOTS TESTS
// ============================================

describe("remediateEmptySlots", () => {
  it("should flag empty slots", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          slots: [
            createMockSlot({
              slotId: "empty-slot",
              slotType: "afternoon",
              options: [], // Empty
            }),
          ],
        }),
      ],
    });

    const result = remediateEmptySlots(itinerary);

    expect(result.changes.length).toBe(1);
    expect(result.changes[0].type).toBe("FLAGGED_EMPTY_SLOT");
  });

  it("should flag empty meal slots with restaurant category suggestion", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          slots: [
            createMockSlot({
              slotId: "empty-lunch",
              slotType: "lunch",
              options: [],
            }),
          ],
        }),
      ],
    });

    const result = remediateEmptySlots(itinerary);

    expect(result.changes.length).toBe(1);
    const slot = result.itinerary.days[0].slots[0] as any;
    expect(slot.metadata?.suggestedCategory).toBe("restaurant");
  });

  it("should flag empty activity slots with attraction category suggestion", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          slots: [
            createMockSlot({
              slotId: "empty-afternoon",
              slotType: "afternoon",
              options: [],
            }),
          ],
        }),
      ],
    });

    const result = remediateEmptySlots(itinerary);

    expect(result.changes.length).toBe(1);
    const slot = result.itinerary.days[0].slots[0] as any;
    expect(slot.metadata?.suggestedCategory).toBe("attraction");
  });

  it("should not flag slots with activities", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          slots: [
            createMockSlot({
              slotId: "filled-slot",
              options: [createMockActivity()],
            }),
          ],
        }),
      ],
    });

    const result = remediateEmptySlots(itinerary);

    expect(result.changes.length).toBe(0);
  });
});

// ============================================
// RECALCULATE SLOT IDS TESTS
// ============================================

describe("remediateRecalculateSlotIds", () => {
  it("should fix slot IDs to match pattern", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          dayNumber: 1,
          slots: [
            createMockSlot({ slotId: "wrong-id-1" }),
            createMockSlot({ slotId: "wrong-id-2" }),
          ],
        }),
      ],
    });

    const result = remediateRecalculateSlotIds(itinerary);

    expect(result.changes.length).toBe(2);
    expect(result.itinerary.days[0].slots[0].slotId).toBe("d1-slot-1");
    expect(result.itinerary.days[0].slots[1].slotId).toBe("d1-slot-2");
  });

  it("should not change already correct slot IDs", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          dayNumber: 1,
          slots: [
            createMockSlot({ slotId: "d1-slot-1" }),
            createMockSlot({ slotId: "d1-slot-2" }),
          ],
        }),
      ],
    });

    const result = remediateRecalculateSlotIds(itinerary);

    expect(result.changes.length).toBe(0);
  });
});

// ============================================
// FULL REMEDIATION PIPELINE TESTS
// ============================================

describe("remediateItinerary (full pipeline)", () => {
  it("should run all remediations in order", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          dayNumber: 1,
          slots: [
            createMockSlot({
              slotId: "wrong-id",
              slotType: "lunch",
              behavior: undefined, // Should be fixed to meal
              options: [],
            }),
          ],
        }),
      ],
    });

    const result = remediateItinerary(itinerary);

    expect(result.changes.length).toBeGreaterThan(0);
    // Should have meal behavior fix, empty slot flag, and slot ID fix
    expect(result.changes.some((c) => c.type === "FIXED_MEAL_BEHAVIOR")).toBe(true);
    expect(result.changes.some((c) => c.type === "FLAGGED_EMPTY_SLOT")).toBe(true);
    expect(result.changes.some((c) => c.type === "FIXED_SLOT_ID")).toBe(true);
  });

  it("should apply flight constraints when provided", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          dayNumber: 1,
          slots: [
            createMockSlot({ slotId: "early", timeRange: { start: "07:00", end: "09:00" } }),
            createMockSlot({ slotId: "late", timeRange: { start: "14:00", end: "17:00" } }),
          ],
        }),
      ],
    });

    const constraints: FlightConstraints = {
      arrivalFlightTime: "11:00",
    };

    const result = remediateItinerary(itinerary, constraints);

    expect(result.changes.some((c) => c.type === "REMOVED_IMPOSSIBLE_SLOT")).toBe(true);
  });

  it("should allow selective remediation via options", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          slots: [
            createMockSlot({
              slotId: "lunch-slot",
              slotType: "lunch",
              behavior: undefined,
              options: [],
            }),
          ],
        }),
      ],
    });

    const result = remediateItinerary(itinerary, undefined, {
      fixMealBehavior: false,
      flagEmptySlots: false,
      recalculateSlotIds: false,
    });

    expect(result.changes.some((c) => c.type === "FIXED_MEAL_BEHAVIOR")).toBe(false);
    expect(result.changes.some((c) => c.type === "FLAGGED_EMPTY_SLOT")).toBe(false);
  });

  it("should handle empty itinerary gracefully", () => {
    const itinerary = createMockItinerary({ days: [] });

    const result = remediateItinerary(itinerary);

    expect(result.changes.length).toBe(0);
    expect(result.itinerary.days.length).toBe(0);
  });

  it("should handle itinerary with empty days gracefully", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({ slots: [] }),
        createMockDay({ dayNumber: 2, slots: [] }),
      ],
    });

    const result = remediateItinerary(itinerary);

    expect(result.itinerary.days.length).toBe(2);
  });
});

// ============================================
// EDGE CASES
// ============================================

describe("Edge Cases", () => {
  it("should handle slots without timeRange", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          slots: [
            createMockSlot({
              slotId: "no-time",
              timeRange: undefined as any,
            }),
          ],
        }),
      ],
    });

    const constraints: FlightConstraints = {
      arrivalFlightTime: "11:00",
    };

    // Should not throw
    expect(() => remediateRemoveImpossibleSlots(itinerary, constraints)).not.toThrow();
  });

  it("should handle activities without name", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          slots: [
            createMockSlot({
              options: [
                createMockActivity({
                  activity: {
                    ...createMockActivity().activity,
                    name: undefined as any,
                  },
                }),
              ],
            }),
          ],
        }),
      ],
    });

    // Should not throw
    expect(() => remediateCrossDayDuplicates(itinerary)).not.toThrow();
  });

  it("should handle multiple duplicates on same day", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          dayNumber: 1,
          slots: [
            createMockSlot({
              slotId: "slot-1",
              options: [createMockActivity({ activity: { ...createMockActivity().activity, name: "Temple A" } })],
            }),
            createMockSlot({
              slotId: "slot-2",
              options: [createMockActivity({ activity: { ...createMockActivity().activity, name: "Temple A" } })],
            }),
            createMockSlot({
              slotId: "slot-3",
              options: [createMockActivity({ activity: { ...createMockActivity().activity, name: "Temple A" } })],
            }),
          ],
        }),
      ],
    });

    const result = remediateCrossDayDuplicates(itinerary);

    // Should remove 2 duplicates, keep 1
    expect(result.changes.length).toBe(2);
    expect(result.itinerary.days[0].slots.length).toBe(1);
  });

  it("should respect selectedOptionId when getting activity", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          slots: [
            createMockSlot({
              slotId: "multi-option-slot",
              slotType: "lunch",
              selectedOptionId: "opt-2",
              options: [
                createMockActivity({ id: "opt-1", activity: { ...createMockActivity().activity, name: "Restaurant A" } }),
                createMockActivity({ id: "opt-2", activity: { ...createMockActivity().activity, name: "Restaurant B", tags: ["pre-booked"] } }),
              ],
            }),
          ],
        }),
      ],
    });

    const result = remediateFixAnchorBehavior(itinerary);

    // Should use opt-2 (selected) which has pre-booked tag
    expect(result.changes.length).toBe(1);
    expect(result.itinerary.days[0].slots[0].behavior).toBe("anchor");
  });
});

// ============================================
// INTEGRATION SCENARIOS
// ============================================

describe("Integration Scenarios", () => {
  it("should handle realistic multi-day Japan itinerary", () => {
    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          dayNumber: 1,
          city: "Tokyo",
          slots: [
            createMockSlot({
              slotId: "arrival",
              slotType: "morning",
              timeRange: { start: "14:00", end: "16:00" }, // After arrival
              options: [
                createMockActivity({
                  activity: {
                    ...createMockActivity().activity,
                    name: "Narita Airport Transfer",
                    category: "transport",
                    place: { ...createMockActivity().activity.place!, googlePlaceId: "narita-transfer" },
                  },
                }),
              ],
            }),
            createMockSlot({
              slotId: "sensoji-day1",
              slotType: "evening",
              timeRange: { start: "19:00", end: "21:00" },
              options: [
                createMockActivity({
                  activity: {
                    ...createMockActivity().activity,
                    name: "Senso-ji Temple", // First occurrence - will be kept
                    place: { ...createMockActivity().activity.place!, googlePlaceId: "sensoji-place" },
                  },
                }),
              ],
            }),
            createMockSlot({
              slotId: "lunch-1",
              slotType: "lunch",
              timeRange: { start: "12:00", end: "13:30" },
              options: [],
            }),
            createMockSlot({
              slotId: "afternoon-1",
              slotType: "afternoon",
              timeRange: { start: "16:00", end: "19:00" },
              options: [
                createMockActivity({
                  activity: {
                    ...createMockActivity().activity,
                    name: "TeamLab Borderless",
                    tags: ["pre-booked"],
                    place: { ...createMockActivity().activity.place!, googlePlaceId: "teamlab-place" },
                  },
                }),
              ],
            }),
          ],
        }),
        createMockDay({
          dayNumber: 2,
          city: "Tokyo",
          slots: [
            createMockSlot({
              slotId: "morning-2",
              slotType: "morning",
              options: [
                createMockActivity({
                  activity: {
                    ...createMockActivity().activity,
                    name: "Senso-ji Temple",
                    place: { ...createMockActivity().activity.place!, googlePlaceId: "sensoji-place" },
                  },
                }),
              ],
            }),
            createMockSlot({
              slotId: "duplicate",
              slotType: "afternoon",
              options: [
                createMockActivity({
                  activity: {
                    ...createMockActivity().activity,
                    name: "Senso-ji Temple", // Duplicate! Same name as Day 1 - will be removed
                    place: { ...createMockActivity().activity.place!, googlePlaceId: "sensoji-place" },
                  },
                }),
              ],
            }),
          ],
        }),
        createMockDay({
          dayNumber: 3,
          city: "Kyoto",
          slots: [
            createMockSlot({
              slotId: "shinkansen",
              slotType: "morning",
              options: [
                createMockActivity({
                  activity: {
                    ...createMockActivity().activity,
                    name: "Shinkansen Tokyo to Kyoto",
                    category: "sightseeing", // Wrong category
                    place: { ...createMockActivity().activity.place!, googlePlaceId: "shinkansen-place" },
                  },
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const result = remediateItinerary(itinerary); // No flight constraints

    // Check various fixes were applied
    const changeTypes = result.changes.map((c) => c.type);

    expect(changeTypes).toContain("REMOVED_DUPLICATE"); // Senso-ji duplicate
    expect(changeTypes).toContain("FIXED_TRANSFER_BEHAVIOR"); // Shinkansen
    expect(changeTypes).toContain("FIXED_ANCHOR_BEHAVIOR"); // TeamLab
    expect(changeTypes).toContain("FLAGGED_EMPTY_SLOT"); // Empty lunch
  });
});
