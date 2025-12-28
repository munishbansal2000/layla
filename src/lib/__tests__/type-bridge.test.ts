// ============================================
// TYPE BRIDGE TESTS
// ============================================

import { describe, it, expect } from "vitest";
import {
  isScoredActivity,
  isViatorActivity,
  isCoreActivity,
  isRestaurantActivity,
  viatorToCoreActivity,
  viatorToScoredActivity,
  scoredActivityToViator,
  coreActivityToViator,
  viatorBatchToScoredActivities,
  scoredBatchToViator,
  normalizeToScoredActivity,
  normalizeToViator,
} from "../type-bridge";
import type { ViatorActivitySuggestion, TimeSlot } from "../trip-planning";
import type { ScoredActivity, CoreActivity } from "@/types/activity-suggestion";

// ============================================
// TEST FIXTURES
// ============================================

const mockViatorActivity: ViatorActivitySuggestion = {
  id: "viator-1",
  name: "Eiffel Tower Skip-the-Line",
  description: "Skip the lines and head straight to the summit of Paris's most iconic landmark.",
  imageUrl: "https://example.com/eiffel.jpg",
  duration: 180,
  rating: 4.8,
  reviewCount: 12543,
  price: { amount: 65, currency: "EUR" },
  bookingUrl: "https://viator.com/eiffel-tower",
  viatorProductCode: "EIFFEL-001",
  tags: ["Landmark", "Views", "Must-See", "Family"],
  matchScore: 95,
  bestTimeOfDay: "morning",
};

const mockTimeSlot: TimeSlot = {
  id: "morning",
  startTime: "09:00",
  endTime: "12:00",
  label: "Morning",
  type: "morning",
};

// ============================================
// TYPE GUARD TESTS
// ============================================

describe("Type Guards", () => {
  describe("isScoredActivity", () => {
    it("should return true for ScoredActivity", () => {
      const scored = viatorToScoredActivity(mockViatorActivity);
      expect(isScoredActivity(scored)).toBe(true);
    });

    it("should return false for ViatorActivitySuggestion", () => {
      expect(isScoredActivity(mockViatorActivity)).toBe(false);
    });

    it("should return false for null/undefined", () => {
      expect(isScoredActivity(null)).toBe(false);
      expect(isScoredActivity(undefined)).toBe(false);
    });
  });

  describe("isViatorActivity", () => {
    it("should return true for ViatorActivitySuggestion", () => {
      expect(isViatorActivity(mockViatorActivity)).toBe(true);
    });

    it("should return false for ScoredActivity", () => {
      const scored = viatorToScoredActivity(mockViatorActivity);
      expect(isViatorActivity(scored)).toBe(false);
    });
  });

  describe("isCoreActivity", () => {
    it("should return true for CoreActivity", () => {
      const core = viatorToCoreActivity(mockViatorActivity);
      expect(isCoreActivity(core)).toBe(true);
    });

    it("should return false for ViatorActivitySuggestion", () => {
      expect(isCoreActivity(mockViatorActivity)).toBe(false);
    });
  });
});

// ============================================
// CONVERSION: Viator → CoreActivity
// ============================================

describe("viatorToCoreActivity", () => {
  it("should convert ViatorActivitySuggestion to CoreActivity", () => {
    const result = viatorToCoreActivity(mockViatorActivity);

    expect(result.id).toBe("viator-1");
    expect(result.name).toBe("Eiffel Tower Skip-the-Line");
    expect(result.description).toContain("Skip the lines");
    expect(result.source).toBe("viator");
    expect(result.entityIds.viatorProductCode).toBe("EIFFEL-001");
    expect(result.entityIds.internalId).toBe("viator-1");
    expect(result.recommendedDuration).toBe(180);
    expect(result.rating).toBe(4.8);
    expect(result.reviewCount).toBe(12543);
    expect(result.imageUrl).toBe("https://example.com/eiffel.jpg");
    expect(result.estimatedCost).toEqual({ amount: 65, currency: "EUR" });
    expect(result.requiresBooking).toBe(true);
    expect(result.isFree).toBe(false);
  });

  it("should infer category from tags", () => {
    const museumActivity = { ...mockViatorActivity, tags: ["Museum", "Art"] };
    expect(viatorToCoreActivity(museumActivity).category).toBe("museum");

    const foodActivity = { ...mockViatorActivity, tags: ["Food Tour", "Culinary"] };
    expect(viatorToCoreActivity(foodActivity).category).toBe("food-tour");

    const nightActivity = { ...mockViatorActivity, tags: ["Nightlife", "Bar"] };
    expect(viatorToCoreActivity(nightActivity).category).toBe("nightlife");
  });

  it("should infer time of day from Viator bestTimeOfDay", () => {
    const morningActivity = { ...mockViatorActivity, bestTimeOfDay: "morning" as const };
    expect(viatorToCoreActivity(morningActivity).bestTimeOfDay).toContain("morning");

    const eveningActivity = { ...mockViatorActivity, bestTimeOfDay: "evening" as const };
    expect(viatorToCoreActivity(eveningActivity).bestTimeOfDay).toContain("evening");
    expect(viatorToCoreActivity(eveningActivity).bestTimeOfDay).toContain("night");
  });

  it("should detect family-friendly from tags", () => {
    const familyActivity = { ...mockViatorActivity, tags: ["Family", "Kids Welcome"] };
    expect(viatorToCoreActivity(familyActivity).familyFriendly).toBe(true);

    const adultActivity = { ...mockViatorActivity, tags: ["Wine", "Nightlife"] };
    expect(viatorToCoreActivity(adultActivity).familyFriendly).toBe(false);
  });

  it("should detect outdoor from tags", () => {
    const outdoorActivity = { ...mockViatorActivity, tags: ["Walking Tour", "Outdoor"] };
    expect(viatorToCoreActivity(outdoorActivity).isOutdoor).toBe(true);

    const indoorActivity = { ...mockViatorActivity, tags: ["Museum", "Indoor"] };
    expect(viatorToCoreActivity(indoorActivity).isOutdoor).toBe(false);
  });

  it("should handle free activities", () => {
    const freeActivity = {
      ...mockViatorActivity,
      price: { amount: 0, currency: "EUR" }
    };
    const result = viatorToCoreActivity(freeActivity);
    expect(result.isFree).toBe(true);
  });
});

// ============================================
// CONVERSION: Viator → ScoredActivity
// ============================================

describe("viatorToScoredActivity", () => {
  it("should convert ViatorActivitySuggestion to ScoredActivity", () => {
    const result = viatorToScoredActivity(mockViatorActivity);

    expect(result.activity).toBeDefined();
    expect(result.activity.name).toBe("Eiffel Tower Skip-the-Line");
    expect(result.totalScore).toBe(95);
    expect(result.scoreBreakdown).toBeDefined();
    expect(result.explanation).toBeDefined();
    expect(result.confidence).toBe(0.8);
  });

  it("should use matchScore from Viator if available", () => {
    const result = viatorToScoredActivity(mockViatorActivity);
    expect(result.totalScore).toBe(95);
  });

  it("should default to 70 if no matchScore", () => {
    const noScoreActivity = { ...mockViatorActivity, matchScore: undefined };
    const result = viatorToScoredActivity(noScoreActivity);
    expect(result.totalScore).toBe(70);
  });

  it("should include score breakdown", () => {
    const result = viatorToScoredActivity(mockViatorActivity);

    expect(result.scoreBreakdown.interestMatch).toBeGreaterThan(0);
    expect(result.scoreBreakdown.timeOfDayFit).toBeGreaterThan(0);
    expect(result.scoreBreakdown.durationFit).toBeGreaterThan(0);
    expect(result.scoreBreakdown.budgetMatch).toBeGreaterThan(0);
    expect(result.scoreBreakdown.ratingBonus).toBeDefined();
  });

  it("should adjust score breakdown when slot is provided", () => {
    const withSlot = viatorToScoredActivity(mockViatorActivity, mockTimeSlot);
    const withoutSlot = viatorToScoredActivity(mockViatorActivity);

    // Both should have valid breakdowns
    expect(withSlot.scoreBreakdown.timeOfDayFit).toBeGreaterThan(0);
    expect(withoutSlot.scoreBreakdown.timeOfDayFit).toBeGreaterThan(0);
  });

  it("should generate explanation", () => {
    const result = viatorToScoredActivity(mockViatorActivity, mockTimeSlot);
    expect(result.explanation).toContain("Highly rated");
    expect(result.explanation).toContain("4.8");
  });
});

// ============================================
// CONVERSION: ScoredActivity → Viator
// ============================================

describe("scoredActivityToViator", () => {
  it("should convert ScoredActivity back to ViatorActivitySuggestion", () => {
    const scored = viatorToScoredActivity(mockViatorActivity);
    const result = scoredActivityToViator(scored);

    expect(result.id).toBe("viator-1");
    expect(result.name).toBe("Eiffel Tower Skip-the-Line");
    expect(result.duration).toBe(180);
    expect(result.rating).toBe(4.8);
    expect(result.matchScore).toBe(95);
    expect(result.viatorProductCode).toBe("EIFFEL-001");
    expect(result.tags).toContain("Landmark");
  });

  it("should preserve score as matchScore", () => {
    const scored = viatorToScoredActivity(mockViatorActivity);
    const result = scoredActivityToViator(scored);
    expect(result.matchScore).toBe(scored.totalScore);
  });

  it("should map bestTimeOfDay correctly", () => {
    // Morning
    const morningActivity = { ...mockViatorActivity, bestTimeOfDay: "morning" as const };
    const scored = viatorToScoredActivity(morningActivity);
    expect(scoredActivityToViator(scored).bestTimeOfDay).toBe("morning");
  });
});

// ============================================
// BATCH CONVERSIONS
// ============================================

describe("Batch conversions", () => {
  const activities = [
    mockViatorActivity,
    { ...mockViatorActivity, id: "viator-2", name: "Louvre Museum" },
    { ...mockViatorActivity, id: "viator-3", name: "Seine River Cruise" },
  ];

  it("should batch convert Viator to ScoredActivities", () => {
    const result = viatorBatchToScoredActivities(activities);

    expect(result).toHaveLength(3);
    expect(result[0].activity.name).toBe("Eiffel Tower Skip-the-Line");
    expect(result[1].activity.name).toBe("Louvre Museum");
    expect(result[2].activity.name).toBe("Seine River Cruise");
  });

  it("should batch convert ScoredActivities to Viator", () => {
    const scored = viatorBatchToScoredActivities(activities);
    const result = scoredBatchToViator(scored);

    expect(result).toHaveLength(3);
    expect(result[0].name).toBe("Eiffel Tower Skip-the-Line");
    expect(result[1].name).toBe("Louvre Museum");
    expect(result[2].name).toBe("Seine River Cruise");
  });
});

// ============================================
// NORMALIZE FUNCTIONS
// ============================================

describe("normalizeToScoredActivity", () => {
  it("should return ScoredActivity as-is", () => {
    const scored = viatorToScoredActivity(mockViatorActivity);
    const result = normalizeToScoredActivity(scored);
    expect(result).toBe(scored);
  });

  it("should convert ViatorActivitySuggestion to ScoredActivity", () => {
    const result = normalizeToScoredActivity(mockViatorActivity);
    expect(isScoredActivity(result)).toBe(true);
    expect(result.activity.name).toBe("Eiffel Tower Skip-the-Line");
  });

  it("should convert CoreActivity to ScoredActivity", () => {
    const core = viatorToCoreActivity(mockViatorActivity);
    const result = normalizeToScoredActivity(core);
    expect(isScoredActivity(result)).toBe(true);
    expect(result.totalScore).toBe(70);
  });
});

describe("normalizeToViator", () => {
  it("should return ViatorActivitySuggestion as-is", () => {
    const result = normalizeToViator(mockViatorActivity);
    expect(result).toBe(mockViatorActivity);
  });

  it("should convert ScoredActivity to ViatorActivitySuggestion", () => {
    const scored = viatorToScoredActivity(mockViatorActivity);
    const result = normalizeToViator(scored);
    expect(isViatorActivity(result)).toBe(true);
    expect(result.name).toBe("Eiffel Tower Skip-the-Line");
  });

  it("should convert CoreActivity to ViatorActivitySuggestion", () => {
    const core = viatorToCoreActivity(mockViatorActivity);
    const result = normalizeToViator(core);
    expect(isViatorActivity(result)).toBe(true);
    expect(result.name).toBe("Eiffel Tower Skip-the-Line");
  });
});

// ============================================
// ROUND-TRIP CONVERSION
// ============================================

describe("Round-trip conversion", () => {
  it("should preserve essential data through Viator → Scored → Viator", () => {
    const scored = viatorToScoredActivity(mockViatorActivity);
    const back = scoredActivityToViator(scored);

    expect(back.id).toBe(mockViatorActivity.id);
    expect(back.name).toBe(mockViatorActivity.name);
    expect(back.duration).toBe(mockViatorActivity.duration);
    expect(back.rating).toBe(mockViatorActivity.rating);
    expect(back.viatorProductCode).toBe(mockViatorActivity.viatorProductCode);
  });

  it("should preserve tags through conversion", () => {
    const scored = viatorToScoredActivity(mockViatorActivity);
    const back = scoredActivityToViator(scored);

    mockViatorActivity.tags.forEach((tag) => {
      expect(back.tags).toContain(tag);
    });
  });
});
