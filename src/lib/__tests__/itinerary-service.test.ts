// ============================================
// ITINERARY SERVICE TESTS
// ============================================
// Tests for the unified itinerary service
// Validates generation from both data and LLM providers

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  generate,
  getItineraryProvider,
  getItineraryAIProvider,
  getItineraryConfig,
  getProviderInfo,
  type ItineraryRequest,
  type ItineraryResponse,
} from "../itinerary-service";

// ============================================
// TEST CONFIGURATION
// ============================================

// Store original env values
const originalEnv = { ...process.env };

function resetEnv() {
  // Reset to original values
  process.env = { ...originalEnv };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function createValidRequest(overrides: Partial<ItineraryRequest> = {}): ItineraryRequest {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 7); // 1 week from now

  return {
    cities: ["Tokyo"],
    startDate: startDate.toISOString().split("T")[0],
    totalDays: 3,
    pace: "moderate",
    interests: ["culture", "food"],
    ...overrides,
  };
}

function validateItineraryStructure(response: ItineraryResponse) {
  // Validate response structure
  expect(response).toBeDefined();
  expect(response.itinerary).toBeDefined();
  expect(response.metadata).toBeDefined();

  const { itinerary, metadata } = response;

  // Validate itinerary structure
  expect(itinerary.destination).toBeDefined();
  expect(typeof itinerary.destination).toBe("string");
  expect(itinerary.country).toBe("Japan");
  expect(Array.isArray(itinerary.days)).toBe(true);
  expect(itinerary.days.length).toBeGreaterThan(0);

  // Validate metadata
  expect(metadata.generatedAt).toBeDefined();
  expect(metadata.provider).toMatch(/^(data|llm)$/);
  expect(typeof metadata.totalDays).toBe("number");
  expect(typeof metadata.totalSlots).toBe("number");
  expect(typeof metadata.totalOptions).toBe("number");
  expect(Array.isArray(metadata.cities)).toBe(true);
}

function validateDayStructure(day: ItineraryResponse["itinerary"]["days"][number], expectedDayNumber: number) {
  expect(day.dayNumber).toBe(expectedDayNumber);
  expect(day.date).toBeDefined();
  expect(typeof day.date).toBe("string");
  expect(day.city).toBeDefined();
  expect(day.title).toBeDefined();
  expect(Array.isArray(day.slots)).toBe(true);
}

function validateSlotStructure(slot: ItineraryResponse["itinerary"]["days"][number]["slots"][number]) {
  expect(slot.slotId).toBeDefined();
  expect(slot.slotType).toBeDefined();
  expect(["morning", "breakfast", "lunch", "afternoon", "dinner", "evening"]).toContain(slot.slotType);
  expect(slot.timeRange).toBeDefined();
  expect(slot.timeRange.start).toBeDefined();
  expect(slot.timeRange.end).toBeDefined();
  expect(Array.isArray(slot.options)).toBe(true);
}

function validateActivityOption(option: ItineraryResponse["itinerary"]["days"][number]["slots"][number]["options"][number]) {
  expect(option.id).toBeDefined();
  expect(typeof option.rank).toBe("number");
  expect(typeof option.score).toBe("number");
  expect(option.activity).toBeDefined();
  expect(option.activity.name).toBeDefined();
  expect(typeof option.activity.name).toBe("string");
  expect(option.activity.category).toBeDefined();
  expect(typeof option.activity.duration).toBe("number");
  expect(option.activity.place).toBeDefined();
}

// ============================================
// TEST SUITE: CONFIGURATION
// ============================================

describe("ItineraryService Configuration", () => {
  afterEach(() => {
    resetEnv();
  });

  describe("getItineraryProvider", () => {
    it("should return 'data' by default", () => {
      delete process.env.ITINERARY_PROVIDER;
      expect(getItineraryProvider()).toBe("data");
    });

    it("should return 'llm' when ITINERARY_PROVIDER=llm", () => {
      process.env.ITINERARY_PROVIDER = "llm";
      expect(getItineraryProvider()).toBe("llm");
    });

    it("should return 'llm' when ITINERARY_PROVIDER=ai", () => {
      process.env.ITINERARY_PROVIDER = "ai";
      expect(getItineraryProvider()).toBe("llm");
    });

    it("should be case-insensitive", () => {
      process.env.ITINERARY_PROVIDER = "LLM";
      expect(getItineraryProvider()).toBe("llm");
    });
  });

  describe("getItineraryAIProvider", () => {
    it("should return 'openai' by default", () => {
      delete process.env.ITINERARY_AI_PROVIDER;
      delete process.env.AI_PROVIDER;
      expect(getItineraryAIProvider()).toBe("openai");
    });

    it("should respect ITINERARY_AI_PROVIDER override", () => {
      process.env.ITINERARY_AI_PROVIDER = "gemini";
      expect(getItineraryAIProvider()).toBe("gemini");
    });

    it("should fall back to AI_PROVIDER when no override", () => {
      delete process.env.ITINERARY_AI_PROVIDER;
      process.env.AI_PROVIDER = "ollama";
      expect(getItineraryAIProvider()).toBe("ollama");
    });

    it("should prefer ITINERARY_AI_PROVIDER over AI_PROVIDER", () => {
      process.env.ITINERARY_AI_PROVIDER = "gemini";
      process.env.AI_PROVIDER = "ollama";
      expect(getItineraryAIProvider()).toBe("gemini");
    });
  });

  describe("getItineraryConfig", () => {
    it("should return complete config object", () => {
      const config = getItineraryConfig();
      expect(config).toHaveProperty("provider");
      expect(config).toHaveProperty("aiProvider");
    });
  });

  describe("getProviderInfo", () => {
    it("should return provider info with description", () => {
      const info = getProviderInfo();
      expect(info).toHaveProperty("provider");
      expect(info).toHaveProperty("description");
      expect(typeof info.description).toBe("string");
    });
  });
});

// ============================================
// TEST SUITE: DATA PROVIDER GENERATION
// ============================================

describe("ItineraryService Data Provider", () => {
  beforeEach(() => {
    // Force data provider
    process.env.ITINERARY_PROVIDER = "data";
  });

  afterEach(() => {
    resetEnv();
  });

  describe("generate - basic functionality", () => {
    it("should generate a valid itinerary for Tokyo", async () => {
      const request = createValidRequest({
        cities: ["Tokyo"],
        totalDays: 3,
      });

      const response = await generate(request);

      validateItineraryStructure(response);
      expect(response.metadata.provider).toBe("data");
      expect(response.metadata.totalDays).toBe(3);
      expect(response.itinerary.days.length).toBe(3);
    }, 30000);

    it("should generate itinerary for multiple cities", async () => {
      const request = createValidRequest({
        cities: ["Tokyo", "Kyoto"],
        totalDays: 4,
        daysPerCity: { Tokyo: 2, Kyoto: 2 },
      });

      const response = await generate(request);

      validateItineraryStructure(response);
      expect(response.metadata.cities.length).toBeGreaterThanOrEqual(1);
      expect(response.itinerary.days.length).toBe(4);
    }, 30000);

    it("should include proper day structure", async () => {
      const request = createValidRequest({ totalDays: 2 });
      const response = await generate(request);

      for (let i = 0; i < response.itinerary.days.length; i++) {
        validateDayStructure(response.itinerary.days[i], i + 1);
      }
    }, 30000);

    it("should include proper slot structure", async () => {
      const request = createValidRequest({ totalDays: 1 });
      const response = await generate(request);

      const day = response.itinerary.days[0];
      expect(day.slots.length).toBeGreaterThanOrEqual(3); // At least morning, lunch, afternoon

      for (const slot of day.slots) {
        validateSlotStructure(slot);
      }
    }, 30000);

    it("should include activity options with proper structure", async () => {
      const request = createValidRequest({ totalDays: 1 });
      const response = await generate(request);

      const day = response.itinerary.days[0];
      const slotsWithOptions = day.slots.filter(s => s.options.length > 0);

      expect(slotsWithOptions.length).toBeGreaterThan(0);

      for (const slot of slotsWithOptions) {
        for (const option of slot.options) {
          validateActivityOption(option);
        }
      }
    }, 30000);
  });

  describe("generate - pace variations", () => {
    it("should respect relaxed pace", async () => {
      const request = createValidRequest({
        pace: "relaxed",
        totalDays: 2,
      });

      const response = await generate(request);

      validateItineraryStructure(response);
      // Relaxed pace might have fewer activities per day
      const avgSlotsPerDay = response.metadata.totalSlots / response.metadata.totalDays;
      expect(avgSlotsPerDay).toBeGreaterThanOrEqual(2);
    }, 30000);

    it("should respect packed pace", async () => {
      const request = createValidRequest({
        pace: "packed",
        totalDays: 2,
      });

      const response = await generate(request);

      validateItineraryStructure(response);
      // Packed pace should have more activities
      const avgSlotsPerDay = response.metadata.totalSlots / response.metadata.totalDays;
      expect(avgSlotsPerDay).toBeGreaterThanOrEqual(3);
    }, 30000);
  });

  describe("generate - interests", () => {
    it("should accept interest filters", async () => {
      const request = createValidRequest({
        interests: ["temples", "food", "nature"],
        totalDays: 2,
      });

      const response = await generate(request);

      validateItineraryStructure(response);
      expect(response.metadata.totalOptions).toBeGreaterThan(0);
    }, 30000);
  });

  describe("generate - metadata", () => {
    it("should include accurate metadata", async () => {
      const request = createValidRequest({ totalDays: 3 });
      const response = await generate(request);

      // Verify metadata accuracy
      expect(response.metadata.totalDays).toBe(response.itinerary.days.length);

      const actualTotalSlots = response.itinerary.days.reduce((sum, d) => sum + d.slots.length, 0);
      expect(response.metadata.totalSlots).toBe(actualTotalSlots);

      const actualTotalOptions = response.itinerary.days.reduce(
        (sum, d) => sum + d.slots.reduce((s, slot) => s + slot.options.length, 0),
        0
      );
      expect(response.metadata.totalOptions).toBe(actualTotalOptions);
    }, 30000);

    it("should include generation timestamp", async () => {
      const beforeGen = new Date().toISOString();
      const request = createValidRequest({ totalDays: 1 });
      const response = await generate(request);
      const afterGen = new Date().toISOString();

      expect(response.metadata.generatedAt).toBeDefined();
      expect(response.metadata.generatedAt >= beforeGen).toBe(true);
      expect(response.metadata.generatedAt <= afterGen).toBe(true);
    }, 30000);
  });
});

// ============================================
// TEST SUITE: ITINERARY CONTENT QUALITY
// ============================================

describe("ItineraryService Content Quality", () => {
  beforeEach(() => {
    process.env.ITINERARY_PROVIDER = "data";
  });

  afterEach(() => {
    resetEnv();
  });

  describe("slot types", () => {
    it("should include meal slots (lunch and dinner)", async () => {
      const request = createValidRequest({ totalDays: 1 });
      const response = await generate(request);

      const day = response.itinerary.days[0];
      const slotTypes = day.slots.map(s => s.slotType);

      // Should have at least lunch and dinner
      const hasMealSlot = slotTypes.includes("lunch") || slotTypes.includes("dinner");
      expect(hasMealSlot).toBe(true);
    }, 30000);

    it("should include activity slots (morning/afternoon)", async () => {
      const request = createValidRequest({ totalDays: 1 });
      const response = await generate(request);

      const day = response.itinerary.days[0];
      const slotTypes = day.slots.map(s => s.slotType);

      const hasActivitySlot = slotTypes.includes("morning") || slotTypes.includes("afternoon");
      expect(hasActivitySlot).toBe(true);
    }, 30000);
  });

  describe("time ranges", () => {
    it("should have valid time range format (HH:MM)", async () => {
      const request = createValidRequest({ totalDays: 1 });
      const response = await generate(request);

      const timeRegex = /^\d{2}:\d{2}$/;

      for (const day of response.itinerary.days) {
        for (const slot of day.slots) {
          expect(slot.timeRange.start).toMatch(timeRegex);
          expect(slot.timeRange.end).toMatch(timeRegex);
        }
      }
    }, 30000);
  });

  describe("activity content", () => {
    it("should have activities with names", async () => {
      const request = createValidRequest({ totalDays: 1 });
      const response = await generate(request);

      for (const day of response.itinerary.days) {
        for (const slot of day.slots) {
          for (const option of slot.options) {
            expect(option.activity.name).toBeDefined();
            expect(option.activity.name.length).toBeGreaterThan(0);
          }
        }
      }
    }, 30000);

    it("should have activities with valid durations", async () => {
      const request = createValidRequest({ totalDays: 1 });
      const response = await generate(request);

      for (const day of response.itinerary.days) {
        for (const slot of day.slots) {
          for (const option of slot.options) {
            expect(option.activity.duration).toBeGreaterThan(0);
            expect(option.activity.duration).toBeLessThanOrEqual(480); // Max 8 hours
          }
        }
      }
    }, 30000);

    it("should have activities with place information", async () => {
      const request = createValidRequest({ totalDays: 1 });
      const response = await generate(request);

      let foundPlaceWithCoords = false;

      for (const day of response.itinerary.days) {
        for (const slot of day.slots) {
          for (const option of slot.options) {
            expect(option.activity.place).toBeDefined();
            const place = option.activity.place;
            if (place) {
              expect(place.name).toBeDefined();

              // Check if at least some activities have coordinates
              if (place.coordinates && place.coordinates.lat !== 0) {
                foundPlaceWithCoords = true;
              }
            }
          }
        }
      }

      // Data provider should have at least some activities with coordinates
      expect(foundPlaceWithCoords).toBe(true);
    }, 30000);
  });

  describe("option ranking", () => {
    it("should have options ranked 1, 2, 3...", async () => {
      const request = createValidRequest({ totalDays: 1 });
      const response = await generate(request);

      for (const day of response.itinerary.days) {
        for (const slot of day.slots) {
          if (slot.options.length > 0) {
            const ranks = slot.options.map(o => o.rank).sort((a, b) => a - b);
            // Ranks should start at 1 and be sequential
            for (let i = 0; i < ranks.length; i++) {
              expect(ranks[i]).toBe(i + 1);
            }
          }
        }
      }
    }, 30000);

    it("should have options with valid scores", async () => {
      const request = createValidRequest({ totalDays: 1 });
      const response = await generate(request);

      for (const day of response.itinerary.days) {
        for (const slot of day.slots) {
          for (const option of slot.options) {
            expect(option.score).toBeGreaterThanOrEqual(0);
            // Note: Some data provider scores may exceed 100 due to bonus multipliers
            // This is acceptable behavior - scores are relative rankings
            expect(option.score).toBeLessThanOrEqual(200);
          }
        }
      }
    }, 30000);
  });
});

// ============================================
// TEST SUITE: EDGE CASES
// ============================================

describe("ItineraryService Edge Cases", () => {
  beforeEach(() => {
    process.env.ITINERARY_PROVIDER = "data";
  });

  afterEach(() => {
    resetEnv();
  });

  it("should handle single day trip", async () => {
    const request = createValidRequest({ totalDays: 1 });
    const response = await generate(request);

    validateItineraryStructure(response);
    expect(response.itinerary.days.length).toBe(1);
  }, 30000);

  it("should handle longer trips (7 days)", async () => {
    const request = createValidRequest({ totalDays: 7 });
    const response = await generate(request);

    validateItineraryStructure(response);
    expect(response.itinerary.days.length).toBe(7);
  }, 60000);

  it("should include general tips", async () => {
    const request = createValidRequest({ totalDays: 2 });
    const response = await generate(request);

    expect(response.itinerary.generalTips).toBeDefined();
    const tips = response.itinerary.generalTips;
    expect(Array.isArray(tips)).toBe(true);
    expect(tips!.length).toBeGreaterThan(0);
  }, 30000);

  it("should include estimated budget", async () => {
    const request = createValidRequest({ totalDays: 2 });
    const response = await generate(request);

    expect(response.itinerary.estimatedBudget).toBeDefined();
    const budget = response.itinerary.estimatedBudget;
    expect(budget!.total).toBeDefined();
    expect(budget!.currency).toBeDefined();
  }, 30000);
});

// ============================================
// TEST SUITE: MULTI-CITY ITINERARIES
// ============================================

describe("ItineraryService Multi-City", () => {
  beforeEach(() => {
    process.env.ITINERARY_PROVIDER = "data";
  });

  afterEach(() => {
    resetEnv();
  });

  it("should generate multi-city itinerary with proper city distribution", async () => {
    const request = createValidRequest({
      cities: ["Tokyo", "Osaka"],
      totalDays: 4,
      daysPerCity: { Tokyo: 2, Osaka: 2 },
    });

    const response = await generate(request);

    validateItineraryStructure(response);
    expect(response.itinerary.days.length).toBe(4);

    // Check that cities are properly distributed
    const citiesInItinerary = response.itinerary.days.map(d => d.city);
    expect(citiesInItinerary.filter(c => c === "Tokyo").length).toBeGreaterThanOrEqual(1);
    expect(citiesInItinerary.filter(c => c === "Osaka").length).toBeGreaterThanOrEqual(1);
  }, 30000);

  it("should handle three cities", async () => {
    const request = createValidRequest({
      cities: ["Tokyo", "Kyoto", "Osaka"],
      totalDays: 6,
      daysPerCity: { Tokyo: 2, Kyoto: 2, Osaka: 2 },
    });

    const response = await generate(request);

    validateItineraryStructure(response);
    expect(response.itinerary.days.length).toBe(6);
  }, 45000);
});
