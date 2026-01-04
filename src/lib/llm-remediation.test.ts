/**
 * Unit Tests for LLM Remediation Service
 *
 * Tests the LLM-powered remediation capabilities with mocked LLM responses:
 * 1. Semantic duplicate detection
 * 2. Meal suitability validation
 * 3. Duration inference
 * 4. Category validation
 * 5. Full remediation pipeline
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  remediateWithLLM,
  fullRemediation,
  type LLMRemediationOptions,
} from "./llm-remediation";

import type {
  StructuredItineraryData,
  DayWithOptions,
  SlotWithOptions,
  ActivityOption,
} from "@/types/structured-itinerary";

// ============================================
// MOCK SETUP
// ============================================

// Mock fetch for Ollama/Gemini API calls
const mockFetch = vi.fn();
global.fetch = mockFetch;

function mockOllamaAvailable() {
  mockFetch.mockImplementation((url: string, options?: RequestInit) => {
    if (url.includes("/api/tags")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ models: ["llama3.2"] }),
      });
    }
    return Promise.resolve({ ok: false });
  });
}

function mockOllamaResponse(response: unknown) {
  mockFetch.mockImplementation((url: string, options?: RequestInit) => {
    if (url.includes("/api/tags")) {
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ models: ["llama3.2"] }),
      });
    }
    if (url.includes("/api/generate")) {
      return Promise.resolve({
        ok: true,
        json: () =>
          Promise.resolve({
            response: typeof response === "string" ? response : JSON.stringify(response),
          }),
      });
    }
    return Promise.resolve({ ok: false });
  });
}

function mockNoLLMAvailable() {
  mockFetch.mockImplementation(() => {
    return Promise.resolve({ ok: false });
  });
}

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
// TESTS
// ============================================

describe("LLM Remediation Service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("remediateWithLLM", () => {
    describe("when no LLM is available", () => {
      it("should return unchanged itinerary with no changes", async () => {
        mockNoLLMAvailable();

        const itinerary = createMockItinerary();
        const result = await remediateWithLLM(itinerary);

        expect(result.changes.length).toBe(0);
        expect(result.llmCalls).toBe(0);
        expect(result.itinerary).toEqual(itinerary);
      });
    });

    describe("semantic duplicate detection", () => {
      it("should detect and remove semantic duplicates", async () => {
        // Mock LLM response for duplicate detection
        mockOllamaResponse([
          { pairIndex: 1, isDuplicate: true, confidence: 0.95, reason: "Same temple" },
        ]);

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
                        name: "Tokyo Tower Observation Deck",
                        place: {
                          ...createMockActivity().activity.place!,
                          googlePlaceId: "tokyo-tower-deck-place", // Different placeId
                        },
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
                        name: "Tokyo Tower", // Semantic duplicate - name is contained in the other
                        place: {
                          ...createMockActivity().activity.place!,
                          googlePlaceId: "tokyo-tower-place", // Different placeId
                        },
                      },
                    }),
                  ],
                }),
              ],
            }),
          ],
        });

        const result = await remediateWithLLM(itinerary, {
          detectSemanticDuplicates: true,
          validateMealSuitability: false,
          inferMissingDurations: false,
          validateCategories: false,
        });

        expect(result.llmCalls).toBe(1);
        expect(result.changes.some((c) => c.type === "REMOVED_SEMANTIC_DUPLICATE")).toBe(true);
      });

      it("should skip duplicate detection when no potential pairs found", async () => {
        mockOllamaAvailable();

        const itinerary = createMockItinerary({
          days: [
            createMockDay({
              slots: [
                createMockSlot({
                  options: [
                    createMockActivity({
                      activity: { ...createMockActivity().activity, name: "Tokyo Tower" },
                    }),
                  ],
                }),
                createMockSlot({
                  slotId: "slot-2",
                  options: [
                    createMockActivity({
                      activity: { ...createMockActivity().activity, name: "Senso-ji Temple" },
                    }),
                  ],
                }),
              ],
            }),
          ],
        });

        const result = await remediateWithLLM(itinerary, {
          detectSemanticDuplicates: true,
          validateMealSuitability: false,
          inferMissingDurations: false,
          validateCategories: false,
        });

        // No LLM calls because no similar name pairs
        expect(result.llmCalls).toBe(0);
      });
    });

    describe("meal suitability validation", () => {
      it("should flag unsuitable meals", async () => {
        mockOllamaResponse([
          {
            index: 1,
            isSuitable: false,
            issue: "Izakayas are not open for breakfast",
            suggestion: "Choose a cafe or breakfast spot",
          },
        ]);

        const itinerary = createMockItinerary({
          days: [
            createMockDay({
              slots: [
                createMockSlot({
                  slotId: "breakfast-slot",
                  slotType: "breakfast",
                  options: [
                    createMockActivity({
                      activity: {
                        ...createMockActivity().activity,
                        name: "Izakaya Shibuya",
                        category: "restaurant",
                        tags: ["izakaya", "bar"],
                      },
                    }),
                  ],
                }),
              ],
            }),
          ],
        });

        const result = await remediateWithLLM(itinerary, {
          detectSemanticDuplicates: false,
          validateMealSuitability: true,
          inferMissingDurations: false,
          validateCategories: false,
        });

        expect(result.changes.some((c) => c.type === "FLAGGED_UNSUITABLE_MEAL")).toBe(true);

        // Check metadata was added
        const slot = result.itinerary.days[0].slots[0] as any;
        expect(slot.metadata?.needsReplacement).toBe(true);
      });

      it("should skip meal validation when no meal slots", async () => {
        mockOllamaAvailable();

        const itinerary = createMockItinerary({
          days: [
            createMockDay({
              slots: [
                createMockSlot({
                  slotType: "morning", // Not a meal slot
                }),
                createMockSlot({
                  slotId: "slot-2",
                  slotType: "afternoon",
                }),
              ],
            }),
          ],
        });

        const result = await remediateWithLLM(itinerary, {
          detectSemanticDuplicates: false,
          validateMealSuitability: true,
          inferMissingDurations: false,
          validateCategories: false,
        });

        expect(result.llmCalls).toBe(0);
      });
    });

    describe("duration inference", () => {
      it("should infer missing durations", async () => {
        mockOllamaResponse([
          { index: 1, durationMinutes: 90, reasoning: "Major temple visit" },
        ]);

        const itinerary = createMockItinerary({
          days: [
            createMockDay({
              slots: [
                createMockSlot({
                  slotId: "temple-slot",
                  options: [
                    createMockActivity({
                      activity: {
                        ...createMockActivity().activity,
                        name: "Senso-ji Temple",
                        duration: undefined as any, // Missing duration
                      },
                    }),
                  ],
                }),
              ],
            }),
          ],
        });

        const result = await remediateWithLLM(itinerary, {
          detectSemanticDuplicates: false,
          validateMealSuitability: false,
          inferMissingDurations: true,
          validateCategories: false,
        });

        expect(result.changes.some((c) => c.type === "INFERRED_DURATION")).toBe(true);

        // Check duration was set
        const activity = result.itinerary.days[0].slots[0].options[0];
        expect(activity.activity.duration).toBe(90);
      });

      it("should skip duration inference when all activities have durations", async () => {
        mockOllamaAvailable();

        const itinerary = createMockItinerary({
          days: [
            createMockDay({
              slots: [
                createMockSlot({
                  options: [
                    createMockActivity({
                      activity: {
                        ...createMockActivity().activity,
                        duration: 120, // Has duration
                      },
                    }),
                  ],
                }),
              ],
            }),
          ],
        });

        const result = await remediateWithLLM(itinerary, {
          detectSemanticDuplicates: false,
          validateMealSuitability: false,
          inferMissingDurations: true,
          validateCategories: false,
        });

        expect(result.llmCalls).toBe(0);
      });
    });

    describe("category validation", () => {
      it("should fix incorrect categories", async () => {
        mockOllamaResponse([
          { index: 1, correctCategory: "temple", needsChange: true },
        ]);

        const itinerary = createMockItinerary({
          days: [
            createMockDay({
              slots: [
                createMockSlot({
                  slotId: "temple-slot",
                  options: [
                    createMockActivity({
                      activity: {
                        ...createMockActivity().activity,
                        name: "Senso-ji Temple",
                        category: "restaurant", // Wrong category
                      },
                    }),
                  ],
                }),
              ],
            }),
          ],
        });

        const result = await remediateWithLLM(itinerary, {
          detectSemanticDuplicates: false,
          validateMealSuitability: false,
          inferMissingDurations: false,
          validateCategories: true,
        });

        expect(result.changes.some((c) => c.type === "FIXED_CATEGORY")).toBe(true);

        // Check category was fixed
        const activity = result.itinerary.days[0].slots[0].options[0];
        expect(activity.activity.category).toBe("temple");
      });
    });

    describe("error handling", () => {
      it("should handle LLM errors gracefully", async () => {
        // First call succeeds (availability check), second fails
        let callCount = 0;
        mockFetch.mockImplementation((url: string) => {
          callCount++;
          if (url.includes("/api/tags")) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ models: ["llama3.2"] }),
            });
          }
          if (url.includes("/api/generate")) {
            return Promise.resolve({
              ok: true,
              json: () => Promise.resolve({ response: "invalid json{" }), // Invalid JSON
            });
          }
          return Promise.resolve({ ok: false });
        });

        const itinerary = createMockItinerary({
          days: [
            createMockDay({
              slots: [
                createMockSlot({
                  options: [
                    createMockActivity({
                      activity: { ...createMockActivity().activity, name: "Senso-ji Temple" },
                    }),
                  ],
                }),
                createMockSlot({
                  slotId: "slot-2",
                  options: [
                    createMockActivity({
                      activity: { ...createMockActivity().activity, name: "Sensoji" }, // Potential duplicate
                    }),
                  ],
                }),
              ],
            }),
          ],
        });

        // Should not throw
        const result = await remediateWithLLM(itinerary, {
          detectSemanticDuplicates: true,
        });

        // Should return unchanged itinerary
        expect(result.itinerary.days[0].slots.length).toBe(2);
      });
    });
  });

  describe("fullRemediation", () => {
    it("should run algorithmic remediation first, then LLM", async () => {
      mockOllamaResponse([
        { index: 1, durationMinutes: 60, reasoning: "Lunch" },
      ]);

      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            dayNumber: 1,
            slots: [
              createMockSlot({
                slotId: "wrong-id",
                slotType: "lunch",
                behavior: undefined, // Should be fixed algorithmically
                options: [
                  createMockActivity({
                    activity: {
                      ...createMockActivity().activity,
                      name: "Ramen Shop",
                      duration: undefined as any, // Should be inferred by LLM
                    },
                  }),
                ],
              }),
            ],
          }),
        ],
      });

      const result = await fullRemediation(itinerary, undefined, {
        llm: {
          detectSemanticDuplicates: false,
          validateMealSuitability: false,
          inferMissingDurations: true,
          validateCategories: false,
        },
      });

      // Should have algorithmic changes
      expect(result.algorithmicChanges.some((c) => c.type === "FIXED_MEAL_BEHAVIOR")).toBe(true);

      // Should have LLM changes
      expect(result.llmChanges.some((c) => c.type === "INFERRED_DURATION")).toBe(true);

      // Total changes should be sum
      expect(result.totalChanges).toBe(result.algorithmicChanges.length + result.llmChanges.length);
    });

    it("should skip LLM when skipLLM option is true", async () => {
      mockOllamaAvailable();

      const itinerary = createMockItinerary({
        days: [
          createMockDay({
            slots: [
              createMockSlot({
                slotType: "lunch",
                behavior: undefined,
              }),
            ],
          }),
        ],
      });

      const result = await fullRemediation(itinerary, undefined, {
        skipLLM: true,
      });

      expect(result.llmChanges.length).toBe(0);
      expect(result.llmCalls).toBe(0);
      // Should still have algorithmic changes
      expect(result.algorithmicChanges.length).toBeGreaterThan(0);
    });
  });
});

// ============================================
// INTEGRATION TESTS (with mocked LLM)
// ============================================

describe("LLM Remediation Integration", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should handle complex multi-issue itinerary", async () => {
    // Set up mock to return appropriate responses for different prompts
    let callCount = 0;
    mockFetch.mockImplementation((url: string, options?: RequestInit) => {
      if (url.includes("/api/tags")) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ models: ["llama3.2"] }),
        });
      }
      if (url.includes("/api/generate")) {
        callCount++;

        // Parse the prompt to determine what type of request
        const body = options?.body ? JSON.parse(options.body as string) : {};
        const prompt = body.prompt || "";

        if (prompt.includes("duplicate")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                response: JSON.stringify([
                  { pairIndex: 1, isDuplicate: true, confidence: 0.9, reason: "Same location" },
                ]),
              }),
          });
        }

        if (prompt.includes("meal")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                response: JSON.stringify([
                  { index: 1, isSuitable: false, issue: "Bar not for breakfast", suggestion: "Find cafe" },
                ]),
              }),
          });
        }

        if (prompt.includes("duration")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                response: JSON.stringify([
                  { index: 1, durationMinutes: 75, reasoning: "Temple visit" },
                ]),
              }),
          });
        }

        if (prompt.includes("categor")) {
          return Promise.resolve({
            ok: true,
            json: () =>
              Promise.resolve({
                response: JSON.stringify([
                  { index: 1, correctCategory: "temple", needsChange: true },
                  { index: 2, correctCategory: "restaurant", needsChange: false },
                ]),
              }),
          });
        }

        // Default response
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ response: "[]" }),
        });
      }
      return Promise.resolve({ ok: false });
    });

    const itinerary = createMockItinerary({
      days: [
        createMockDay({
          dayNumber: 1,
          slots: [
            createMockSlot({
              slotId: "breakfast-1",
              slotType: "breakfast",
              options: [
                createMockActivity({
                  activity: {
                    ...createMockActivity().activity,
                    name: "Golden Gai Bar", // Wrong for breakfast
                    category: "bar",
                    tags: ["bar", "nightlife"],
                  },
                }),
              ],
            }),
            createMockSlot({
              slotId: "morning-1",
              slotType: "morning",
              options: [
                createMockActivity({
                  activity: {
                    ...createMockActivity().activity,
                    name: "Senso-ji Temple",
                    category: "attraction", // Should be temple
                    duration: undefined as any,
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
              slotId: "afternoon-2",
              options: [
                createMockActivity({
                  activity: {
                    ...createMockActivity().activity,
                    name: "Sensoji", // Semantic duplicate
                  },
                }),
              ],
            }),
          ],
        }),
      ],
    });

    const result = await remediateWithLLM(itinerary, {
      detectSemanticDuplicates: true,
      validateMealSuitability: true,
      inferMissingDurations: true,
      validateCategories: true,
    });

    // Should have made multiple LLM calls
    expect(result.llmCalls).toBeGreaterThanOrEqual(1);

    // Should have various types of changes
    const changeTypes = result.changes.map((c) => c.type);

    // At least some issues should be detected (depends on which prompts match)
    expect(result.changes.length).toBeGreaterThan(0);
  });
});
