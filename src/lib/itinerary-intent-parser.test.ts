/**
 * Unit Tests for Itinerary Intent Parser
 *
 * Tests the rule-based parsing of natural language into structured intents.
 * Covers all action types, pattern matching, and clarification flow.
 */

import { describe, it, expect } from "vitest";
import {
  parseUserMessage,
  parseIntent,
  ParseResult,
} from "./itinerary-intent-parser";

import type { StructuredItineraryData, DayWithOptions, SlotWithOptions, ActivityOption } from "@/types/structured-itinerary";

// ============================================
// TEST FIXTURES
// ============================================

function createMockActivity(name: string = "Test Activity", overrides: Partial<ActivityOption> = {}): ActivityOption {
  return {
    id: "activity-1",
    rank: 1,
    score: 0.9,
    activity: {
      name,
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

function createMockItinerary(): StructuredItineraryData {
  return {
    destination: "Japan",
    country: "Japan",
    days: [
      {
        dayNumber: 1,
        date: "2025-04-15",
        city: "Tokyo",
        title: "Day 1 - Tokyo",
        slots: [
          createMockSlot({
            slotId: "slot-1",
            slotType: "morning",
            options: [createMockActivity("Senso-ji Temple", { id: "senso-ji" })],
            selectedOptionId: "senso-ji",
          }),
          createMockSlot({
            slotId: "slot-2",
            slotType: "lunch",
            options: [createMockActivity("Ramen Shop", { id: "ramen" })],
            selectedOptionId: "ramen",
          }),
          createMockSlot({
            slotId: "slot-3",
            slotType: "afternoon",
            options: [createMockActivity("TeamLab Borderless", { id: "teamlab" })],
            selectedOptionId: "teamlab",
          }),
        ],
      },
      {
        dayNumber: 2,
        date: "2025-04-16",
        city: "Tokyo",
        title: "Day 2 - Tokyo",
        slots: [
          createMockSlot({
            slotId: "slot-4",
            slotType: "morning",
            options: [createMockActivity("Meiji Shrine", { id: "meiji" })],
            selectedOptionId: "meiji",
          }),
          createMockSlot({
            slotId: "slot-5",
            slotType: "afternoon",
            options: [createMockActivity("Shibuya Crossing", { id: "shibuya" })],
            selectedOptionId: "shibuya",
          }),
        ],
      },
    ],
  };
}

// ============================================
// ACTION EXTRACTION TESTS
// ============================================

describe("Action Extraction", () => {
  const itinerary = createMockItinerary();

  describe("MOVE_ACTIVITY", () => {
    it("should detect move action with 'move' keyword", () => {
      const result = parseUserMessage("Move TeamLab to day 2", itinerary);
      expect(result.intent?.type).toBe("MOVE_ACTIVITY");
    });

    it("should detect move action with 'shift' keyword", () => {
      const result = parseUserMessage("Shift the temple to afternoon", itinerary);
      expect(result.intent?.type).toBe("MOVE_ACTIVITY");
    });

    it("should detect move action with 'reschedule' keyword", () => {
      const result = parseUserMessage("Reschedule TeamLab to morning", itinerary);
      expect(result.intent?.type).toBe("MOVE_ACTIVITY");
    });

    it("should extract activity name and day number", () => {
      const result = parseUserMessage('Move "Senso-ji Temple" to day 2', itinerary);
      expect(result.intent?.type).toBe("MOVE_ACTIVITY");
      if (result.intent?.type === "MOVE_ACTIVITY") {
        expect(result.intent.params.activityName).toBe("Senso-ji Temple");
        expect(result.intent.params.toDay).toBe(2);
      }
    });

    it("should request clarification if activity name is missing", () => {
      const result = parseUserMessage("Move it to day 2", itinerary);
      expect(result.needsClarification).toBe(true);
      expect(result.clarificationQuestion).toContain("activity");
    });
  });

  describe("SWAP_ACTIVITIES", () => {
    it("should detect swap action with 'swap' keyword", () => {
      const result = parseUserMessage("Swap TeamLab with Senso-ji", itinerary);
      expect(result.intent?.type).toBe("SWAP_ACTIVITIES");
    });

    it("should detect swap action with 'switch' keyword", () => {
      const result = parseUserMessage("Switch TeamLab and Senso-ji", itinerary);
      expect(result.intent?.type).toBe("SWAP_ACTIVITIES");
    });

    it("should extract both activity names", () => {
      const result = parseUserMessage("Swap TeamLab with Meiji Shrine", itinerary);
      expect(result.intent?.type).toBe("SWAP_ACTIVITIES");
      if (result.intent?.type === "SWAP_ACTIVITIES") {
        expect(result.intent.params.activity1Name).toContain("TeamLab");
        expect(result.intent.params.activity2Name).toContain("Meiji");
      }
    });

    it("should request clarification if activities are not specified", () => {
      const result = parseUserMessage("Swap them", itinerary);
      expect(result.needsClarification).toBe(true);
    });
  });

  describe("ADD_ACTIVITY", () => {
    it("should detect add action with 'add' keyword", () => {
      const result = parseUserMessage("Add a coffee break", itinerary);
      expect(result.intent?.type).toBe("ADD_ACTIVITY");
    });

    it("should detect add action with 'include' keyword", () => {
      const result = parseUserMessage("Include sushi dinner on day 2", itinerary);
      expect(result.intent?.type).toBe("ADD_ACTIVITY");
    });

    it("should extract category from message", () => {
      const result = parseUserMessage("Add a temple visit to day 1", itinerary);
      expect(result.intent?.type).toBe("ADD_ACTIVITY");
      if (result.intent?.type === "ADD_ACTIVITY") {
        expect(result.intent.params.category).toBe("temple");
      }
    });

    it("should extract location from message", () => {
      const result = parseUserMessage("Add a restaurant near Shinjuku", itinerary);
      expect(result.intent?.type).toBe("ADD_ACTIVITY");
      if (result.intent?.type === "ADD_ACTIVITY") {
        expect(result.intent.params.location).toBe("Shinjuku");
      }
    });

    it("should extract time slot from message", () => {
      const result = parseUserMessage("Add sushi for dinner", itinerary);
      expect(result.intent?.type).toBe("ADD_ACTIVITY");
      if (result.intent?.type === "ADD_ACTIVITY") {
        expect(result.intent.params.slotType).toBe("dinner");
      }
    });

    it("should extract day number from message", () => {
      const result = parseUserMessage("Add a museum to day 3", itinerary);
      expect(result.intent?.type).toBe("ADD_ACTIVITY");
      if (result.intent?.type === "ADD_ACTIVITY") {
        expect(result.intent.params.dayNumber).toBe(3);
      }
    });
  });

  describe("REMOVE_ACTIVITY", () => {
    it("should detect remove action with 'remove' keyword", () => {
      const result = parseUserMessage("Remove TeamLab from the itinerary", itinerary);
      expect(result.intent?.type).toBe("REMOVE_ACTIVITY");
    });

    it("should detect remove action with 'delete' keyword", () => {
      const result = parseUserMessage("Delete the Ramen Shop visit", itinerary);
      expect(result.intent?.type).toBe("REMOVE_ACTIVITY");
    });

    it("should detect remove action with 'skip' keyword", () => {
      const result = parseUserMessage("Skip Senso-ji Temple", itinerary);
      expect(result.intent?.type).toBe("REMOVE_ACTIVITY");
    });

    it("should extract activity name", () => {
      const result = parseUserMessage('Remove "TeamLab Borderless"', itinerary);
      expect(result.intent?.type).toBe("REMOVE_ACTIVITY");
      if (result.intent?.type === "REMOVE_ACTIVITY") {
        expect(result.intent.params.activityName).toBe("TeamLab Borderless");
      }
    });

    it("should request clarification if activity name is missing", () => {
      const result = parseUserMessage("Remove it please", itinerary);
      expect(result.needsClarification).toBe(true);
    });
  });

  describe("REPLACE_ACTIVITY", () => {
    it("should detect replace action", () => {
      const result = parseUserMessage("Replace TeamLab with a shopping trip", itinerary);
      expect(result.intent?.type).toBe("REPLACE_ACTIVITY");
    });

    it("should extract both target and replacement", () => {
      const result = parseUserMessage("Replace Senso-ji with Meiji Shrine", itinerary);
      expect(result.intent?.type).toBe("REPLACE_ACTIVITY");
      if (result.intent?.type === "REPLACE_ACTIVITY") {
        expect(result.intent.params.targetActivityName).toContain("Senso-ji");
        expect(result.intent.params.replacementDescription).toContain("Meiji");
      }
    });
  });

  describe("PRIORITIZE / DEPRIORITIZE", () => {
    it("should detect prioritize action with 'lock' keyword", () => {
      const result = parseUserMessage("Lock TeamLab in place", itinerary);
      expect(result.intent?.type).toBe("PRIORITIZE");
    });

    it("should detect prioritize action with 'must-do' keyword", () => {
      const result = parseUserMessage("Senso-ji is a must-do", itinerary);
      expect(result.intent?.type).toBe("PRIORITIZE");
    });

    it("should detect deprioritize action with 'optional' keyword", () => {
      const result = parseUserMessage("Make TeamLab optional", itinerary);
      expect(result.intent?.type).toBe("DEPRIORITIZE");
    });

    it("should detect deprioritize action with 'unlock' keyword", () => {
      const result = parseUserMessage("Unlock the afternoon activity", itinerary);
      expect(result.intent?.type).toBe("DEPRIORITIZE");
    });
  });

  describe("SUGGEST_ALTERNATIVES", () => {
    it("should detect suggest action with 'suggest' keyword", () => {
      const result = parseUserMessage("Suggest alternatives for lunch", itinerary);
      expect(result.intent?.type).toBe("SUGGEST_ALTERNATIVES");
    });

    it("should detect suggest action with 'recommend' keyword", () => {
      const result = parseUserMessage("Recommend a good restaurant", itinerary);
      expect(result.intent?.type).toBe("SUGGEST_ALTERNATIVES");
    });

    it("should detect suggest action for specific categories", () => {
      const result = parseUserMessage("Any temple suggestions?", itinerary);
      expect(result.intent?.type).toBe("SUGGEST_ALTERNATIVES");
    });
  });

  describe("OPTIMIZE Actions", () => {
    it("should detect OPTIMIZE_ROUTE", () => {
      const result = parseUserMessage("Optimize the route for day 1", itinerary);
      expect(result.intent?.type).toBe("OPTIMIZE_ROUTE");
    });

    it("should detect OPTIMIZE_CLUSTERS", () => {
      const result = parseUserMessage("Group nearby activities together", itinerary);
      expect(result.intent?.type).toBe("OPTIMIZE_CLUSTERS");
    });

    it("should detect BALANCE_PACING", () => {
      const result = parseUserMessage("Balance the pacing of day 2", itinerary);
      expect(result.intent?.type).toBe("BALANCE_PACING");
    });
  });

  describe("DAY Operations", () => {
    it("should detect ADD_DAY", () => {
      const result = parseUserMessage("Add a new day to the trip", itinerary);
      expect(result.intent?.type).toBe("ADD_DAY");
    });

    it("should detect REMOVE_DAY", () => {
      const result = parseUserMessage("Remove day 3", itinerary);
      expect(result.intent?.type).toBe("REMOVE_DAY");
    });

    it("should extract day number for REMOVE_DAY", () => {
      const result = parseUserMessage("Delete day 2 from the itinerary", itinerary);
      expect(result.intent?.type).toBe("REMOVE_DAY");
      if (result.intent?.type === "REMOVE_DAY") {
        expect(result.intent.params.dayNumber).toBe(2);
      }
    });
  });

  describe("UNDO / REDO", () => {
    it("should detect UNDO action", () => {
      const result = parseUserMessage("Undo that", itinerary);
      expect(result.intent?.type).toBe("UNDO");
      expect(result.confidence).toBeGreaterThan(0.9);
    });

    it("should detect REDO action", () => {
      const result = parseUserMessage("Redo", itinerary);
      expect(result.intent?.type).toBe("REDO");
      expect(result.confidence).toBeGreaterThan(0.9);
    });
  });

  describe("ASK_QUESTION", () => {
    it("should detect questions ending with ?", () => {
      const result = parseUserMessage("What is the best time to visit Senso-ji?", itinerary);
      expect(result.intent?.type).toBe("ASK_QUESTION");
    });

    it("should detect questions with 'what' keyword", () => {
      const result = parseUserMessage("What should I do in Shibuya", itinerary);
      expect(result.intent?.type).toBe("ASK_QUESTION");
    });

    it("should default to ASK_QUESTION for ambiguous messages", () => {
      const result = parseUserMessage("I'm not sure about this", itinerary);
      expect(result.intent?.type).toBe("ASK_QUESTION");
    });
  });
});

// ============================================
// TIME SLOT EXTRACTION TESTS
// ============================================

describe("Time Slot Extraction", () => {
  const itinerary = createMockItinerary();

  it("should extract 'morning' slot", () => {
    const result = parseUserMessage("Add something in the morning", itinerary);
    if (result.intent?.type === "ADD_ACTIVITY") {
      expect(result.intent.params.slotType).toBe("morning");
    }
  });

  it("should extract 'afternoon' slot", () => {
    const result = parseUserMessage("Move it to afternoon", itinerary);
    if (result.intent?.type === "MOVE_ACTIVITY") {
      expect(result.intent.params.toSlot).toBe("afternoon");
    }
  });

  it("should extract 'evening' slot", () => {
    const result = parseUserMessage("Add evening activity", itinerary);
    if (result.intent?.type === "ADD_ACTIVITY") {
      expect(result.intent.params.slotType).toBe("evening");
    }
  });

  it("should extract 'lunch' slot", () => {
    const result = parseUserMessage("Add lunch at noon", itinerary);
    if (result.intent?.type === "ADD_ACTIVITY") {
      expect(result.intent.params.slotType).toBe("lunch");
    }
  });

  it("should extract 'dinner' slot", () => {
    const result = parseUserMessage("Add dinner plans", itinerary);
    if (result.intent?.type === "ADD_ACTIVITY") {
      expect(result.intent.params.slotType).toBe("dinner");
    }
  });
});

// ============================================
// DAY NUMBER EXTRACTION TESTS
// ============================================

describe("Day Number Extraction", () => {
  const itinerary = createMockItinerary();

  it("should extract numeric day (day 3)", () => {
    const result = parseUserMessage("Add something to day 3", itinerary);
    if (result.intent?.type === "ADD_ACTIVITY") {
      expect(result.intent.params.dayNumber).toBe(3);
    }
  });

  it("should extract ordinal day (second)", () => {
    const result = parseUserMessage("Move it to the second day", itinerary);
    if (result.intent?.type === "MOVE_ACTIVITY") {
      expect(result.intent.params.toDay).toBe(2);
    }
  });

  it("should extract 'today' as day 1", () => {
    const result = parseUserMessage("Add coffee break today", itinerary);
    if (result.intent?.type === "ADD_ACTIVITY") {
      expect(result.intent.params.dayNumber).toBe(1);
    }
  });

  it("should extract 'tomorrow' as day 2", () => {
    const result = parseUserMessage("Move TeamLab to tomorrow", itinerary);
    if (result.intent?.type === "MOVE_ACTIVITY") {
      expect(result.intent.params.toDay).toBe(2);
    }
  });
});

// ============================================
// DURATION EXTRACTION TESTS
// ============================================

describe("Duration Extraction", () => {
  const itinerary = createMockItinerary();

  it("should extract duration in minutes", () => {
    const result = parseUserMessage("Add a 30 minute coffee break", itinerary);
    if (result.intent?.type === "ADD_ACTIVITY") {
      expect(result.intent.params.duration).toBe(30);
    }
  });

  it("should extract duration in hours and convert to minutes", () => {
    const result = parseUserMessage("Add a 2 hour museum visit", itinerary);
    if (result.intent?.type === "ADD_ACTIVITY") {
      expect(result.intent.params.duration).toBe(120);
    }
  });
});

// ============================================
// CATEGORY EXTRACTION TESTS
// ============================================

describe("Category Extraction", () => {
  const itinerary = createMockItinerary();

  it("should extract 'temple' category", () => {
    const result = parseUserMessage("Add a temple to day 2", itinerary);
    if (result.intent?.type === "ADD_ACTIVITY") {
      expect(result.intent.params.category).toBe("temple");
    }
  });

  it("should extract 'museum' category", () => {
    const result = parseUserMessage("Add a museum visit", itinerary);
    if (result.intent?.type === "ADD_ACTIVITY") {
      expect(result.intent.params.category).toBe("museum");
    }
  });

  it("should extract 'restaurant' category from food keywords", () => {
    const result = parseUserMessage("Add ramen for lunch", itinerary);
    if (result.intent?.type === "ADD_ACTIVITY") {
      expect(result.intent.params.category).toBe("restaurant");
    }
  });

  it("should extract 'shopping' category", () => {
    const result = parseUserMessage("Add some shopping time", itinerary);
    if (result.intent?.type === "ADD_ACTIVITY") {
      expect(result.intent.params.category).toBe("shopping");
    }
  });
});

// ============================================
// CONFIDENCE TESTS
// ============================================

describe("Confidence Scoring", () => {
  const itinerary = createMockItinerary();

  it("should have high confidence for clear commands", () => {
    const result = parseUserMessage("Undo", itinerary);
    expect(result.confidence).toBeGreaterThanOrEqual(0.9);
  });

  it("should have medium confidence for partial commands", () => {
    const result = parseUserMessage("Move something to day 2", itinerary);
    expect(result.confidence).toBeLessThan(0.7);
  });

  it("should have low confidence for ambiguous messages", () => {
    const result = parseUserMessage("Hmm maybe change it", itinerary);
    expect(result.confidence).toBeLessThan(0.5);
  });
});

// ============================================
// CLARIFICATION FLOW TESTS
// ============================================

describe("Clarification Flow", () => {
  const itinerary = createMockItinerary();

  it("should provide activity options for clarification", () => {
    const result = parseUserMessage("Remove it", itinerary);
    expect(result.needsClarification).toBe(true);
    expect(result.clarificationOptions).toBeDefined();
    expect(result.clarificationOptions!.length).toBeGreaterThan(0);
  });

  it("should ask which activity for move without target", () => {
    const result = parseUserMessage("Move something", itinerary);
    expect(result.needsClarification).toBe(true);
    expect(result.clarificationQuestion).toContain("activity");
  });

  it("should ask where to move for move without destination", () => {
    const result = parseUserMessage("Move TeamLab", itinerary);
    expect(result.needsClarification).toBe(true);
    expect(result.clarificationQuestion).toContain("move");
  });
});

// ============================================
// QUICK ACTIONS TESTS
// ============================================

describe("Quick Actions Generation", () => {
  const itinerary = createMockItinerary();

  it("should generate quick actions", () => {
    const result = parseUserMessage("What can I do?", itinerary);
    expect(result.suggestedQuickActions).toBeDefined();
    expect(result.suggestedQuickActions!.length).toBeGreaterThan(0);
  });

  it("should include optimize route action", () => {
    const result = parseUserMessage("Help", itinerary);
    const hasOptimize = result.suggestedQuickActions?.some(
      (a) => a.action.type === "OPTIMIZE_ROUTE"
    );
    expect(hasOptimize).toBe(true);
  });

  it("should limit quick actions to reasonable number", () => {
    const result = parseUserMessage("What now?", itinerary);
    expect(result.suggestedQuickActions!.length).toBeLessThanOrEqual(4);
  });
});

// ============================================
// ASYNC PARSER TESTS
// ============================================

describe("Combined Parser (parseIntent)", () => {
  const itinerary = createMockItinerary();

  it("should return rule-based result for high confidence", async () => {
    const result = await parseIntent("Undo", itinerary);
    expect(result.intent?.type).toBe("UNDO");
    expect(result.confidence).toBeGreaterThan(0.9);
  });

  it("should work without LLM fallback", async () => {
    const result = await parseIntent("Add a cafe", itinerary, { useLLMFallback: false });
    expect(result.intent?.type).toBe("ADD_ACTIVITY");
  });
});
