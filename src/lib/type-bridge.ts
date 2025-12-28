// ============================================
// TYPE BRIDGE: Old System ↔ New System
// ============================================
// Converts between legacy ViatorActivitySuggestion types
// and the new ScoredActivity/CoreActivity types from
// the Activity Suggestion Engine (Phase 9).

import type { ViatorActivitySuggestion, TimeSlot } from "./trip-planning";
import type {
  CoreActivity,
  RestaurantActivity,
  ScoredActivity,
  ActivityCategory,
  TimeOfDay,
  ActivitySource,
  EntityIds,
  LocalizedAddress,
  Coordinates,
  MoneyAmount,
} from "@/types/activity-suggestion";

// ============================================
// TYPE GUARDS
// ============================================

/**
 * Check if an activity is a ScoredActivity (new system)
 */
export function isScoredActivity(
  activity: unknown
): activity is ScoredActivity {
  return (
    typeof activity === "object" &&
    activity !== null &&
    "totalScore" in activity &&
    "activity" in activity &&
    "scoreBreakdown" in activity
  );
}

/**
 * Check if an activity is a ViatorActivitySuggestion (old system)
 */
export function isViatorActivity(
  activity: unknown
): activity is ViatorActivitySuggestion {
  return (
    typeof activity === "object" &&
    activity !== null &&
    "viatorProductCode" in activity &&
    "bookingUrl" in activity &&
    !("totalScore" in activity)
  );
}

/**
 * Check if an activity is a CoreActivity
 */
export function isCoreActivity(
  activity: unknown
): activity is CoreActivity {
  return (
    typeof activity === "object" &&
    activity !== null &&
    "entityIds" in activity &&
    "source" in activity &&
    "category" in activity
  );
}

/**
 * Check if an activity is a RestaurantActivity
 */
export function isRestaurantActivity(
  activity: unknown
): activity is RestaurantActivity {
  return (
    isCoreActivity(activity) &&
    "mealType" in activity &&
    "cuisineTypes" in activity
  );
}

// ============================================
// CONVERSION: Viator → CoreActivity
// ============================================

/**
 * Convert a legacy ViatorActivitySuggestion to a CoreActivity
 */
export function viatorToCoreActivity(
  viator: ViatorActivitySuggestion
): CoreActivity {
  // Infer category from tags
  const category = inferCategoryFromTags(viator.tags);

  // Infer best time of day
  const bestTimeOfDay = inferTimeOfDayFromViator(viator);

  // Generate placeholder location (would need geocoding in production)
  const location: Coordinates = {
    lat: 0,
    lng: 0,
  };

  // Generate entity IDs
  const entityIds: EntityIds = {
    viatorProductCode: viator.viatorProductCode,
    internalId: viator.id,
  };

  // Generate address
  const address: LocalizedAddress = {
    formatted: "",
    city: "",
    country: "",
  };

  // Build cost
  const estimatedCost: MoneyAmount | undefined = viator.price
    ? {
        amount: viator.price.amount,
        currency: viator.price.currency,
      }
    : undefined;

  return {
    id: viator.id,
    entityIds,
    source: "viator" as ActivitySource,

    // Basic info
    name: viator.name,
    description: viator.description,
    category,
    tags: viator.tags || [],

    // Location
    location,
    address,
    neighborhood: "",

    // Timing
    bestTimeOfDay,
    recommendedDuration: viator.duration,

    // Scheduling
    requiresBooking: true,

    // Cost
    isFree: viator.price?.amount === 0,
    estimatedCost,

    // Audience fit
    familyFriendly: viator.tags?.some(
      (t) =>
        t.toLowerCase().includes("family") ||
        t.toLowerCase().includes("kid")
    ) ?? false,
    soloFriendly: true,
    groupFriendly: true,

    // Weather
    isOutdoor: viator.tags?.some(
      (t) =>
        t.toLowerCase().includes("outdoor") ||
        t.toLowerCase().includes("walking") ||
        t.toLowerCase().includes("tour")
    ) ?? false,
    weatherSensitive: false,

    // Ratings
    rating: viator.rating,
    reviewCount: viator.reviewCount,

    // Media
    imageUrl: viator.imageUrl,

    // Metadata
    confidence: 0.8,
  };
}

/**
 * Convert a ViatorActivitySuggestion to a ScoredActivity
 * Uses the matchScore from Viator if available, otherwise calculates one
 */
export function viatorToScoredActivity(
  viator: ViatorActivitySuggestion,
  slot?: TimeSlot
): ScoredActivity {
  const coreActivity = viatorToCoreActivity(viator);

  // Use matchScore from Viator or calculate a default
  const totalScore = viator.matchScore ?? 70;

  // Distribute score across breakdown categories
  const scoreBreakdown = calculateScoreBreakdown(totalScore, viator, slot);

  // Generate explanation
  const explanation = generateExplanation(viator, slot);

  return {
    activity: coreActivity,
    totalScore,
    scoreBreakdown,
    explanation,
    confidence: 0.8,
    warnings: [],
  };
}

/**
 * Batch convert multiple Viator activities to ScoredActivities
 */
export function viatorBatchToScoredActivities(
  activities: ViatorActivitySuggestion[],
  slot?: TimeSlot
): ScoredActivity[] {
  return activities.map((viator) => viatorToScoredActivity(viator, slot));
}

// ============================================
// CONVERSION: ScoredActivity → Viator
// ============================================

/**
 * Convert a ScoredActivity back to ViatorActivitySuggestion format
 * Useful for backward compatibility with existing UI components
 */
export function scoredActivityToViator(
  scored: ScoredActivity
): ViatorActivitySuggestion {
  const core = scored.activity;

  // Map best time of day to Viator format
  let bestTimeOfDay: "morning" | "afternoon" | "evening" | "flexible" =
    "flexible";
  if (core.bestTimeOfDay?.includes("morning")) {
    bestTimeOfDay = "morning";
  } else if (core.bestTimeOfDay?.includes("afternoon")) {
    bestTimeOfDay = "afternoon";
  } else if (
    core.bestTimeOfDay?.includes("evening") ||
    core.bestTimeOfDay?.includes("night")
  ) {
    bestTimeOfDay = "evening";
  }

  // Extract Viator product code from entity IDs
  const viatorProductCode = core.entityIds?.viatorProductCode || core.id;

  return {
    id: core.id,
    name: core.name,
    description: core.description,
    imageUrl: core.imageUrl || "",
    duration: core.recommendedDuration,
    rating: core.rating,
    reviewCount: core.reviewCount,
    price: core.estimatedCost
      ? {
          amount: core.estimatedCost.amount,
          currency: core.estimatedCost.currency,
        }
      : { amount: 0, currency: "USD" },
    bookingUrl: `https://viator.com/product/${viatorProductCode}`,
    viatorProductCode,
    tags: core.tags,
    matchScore: scored.totalScore,
    bestTimeOfDay,
  };
}

/**
 * Batch convert ScoredActivities to ViatorActivitySuggestions
 */
export function scoredBatchToViator(
  activities: ScoredActivity[]
): ViatorActivitySuggestion[] {
  return activities.map(scoredActivityToViator);
}

// ============================================
// CONVERSION: CoreActivity → Viator
// ============================================

/**
 * Convert a CoreActivity to ViatorActivitySuggestion format
 */
export function coreActivityToViator(
  core: CoreActivity | RestaurantActivity,
  matchScore?: number
): ViatorActivitySuggestion {
  // Map best time of day
  let bestTimeOfDay: "morning" | "afternoon" | "evening" | "flexible" =
    "flexible";
  if (core.bestTimeOfDay?.includes("morning")) {
    bestTimeOfDay = "morning";
  } else if (core.bestTimeOfDay?.includes("afternoon")) {
    bestTimeOfDay = "afternoon";
  } else if (
    core.bestTimeOfDay?.includes("evening") ||
    core.bestTimeOfDay?.includes("night")
  ) {
    bestTimeOfDay = "evening";
  }

  const viatorProductCode = core.entityIds?.viatorProductCode || core.id;

  return {
    id: core.id,
    name: core.name,
    description: core.description,
    imageUrl: core.imageUrl || "",
    duration: core.recommendedDuration,
    rating: core.rating,
    reviewCount: core.reviewCount,
    price: core.estimatedCost
      ? {
          amount: core.estimatedCost.amount,
          currency: core.estimatedCost.currency,
        }
      : { amount: 0, currency: "USD" },
    bookingUrl: `https://viator.com/product/${viatorProductCode}`,
    viatorProductCode,
    tags: core.tags,
    matchScore,
    bestTimeOfDay,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Infer ActivityCategory from Viator tags
 */
function inferCategoryFromTags(tags: string[]): ActivityCategory {
  const lowerTags = tags.map((t) => t.toLowerCase());

  // Check for specific category matches
  if (lowerTags.some((t) => t.includes("museum"))) return "museum";
  if (lowerTags.some((t) => t.includes("temple"))) return "temple";
  if (lowerTags.some((t) => t.includes("shrine"))) return "shrine";
  if (lowerTags.some((t) => t.includes("park") || t.includes("garden")))
    return "garden";
  if (lowerTags.some((t) => t.includes("market"))) return "market";
  if (lowerTags.some((t) => t.includes("shopping"))) return "shopping";
  if (lowerTags.some((t) => t.includes("nightlife") || t.includes("night")))
    return "nightlife";
  if (lowerTags.some((t) => t.includes("food") || t.includes("culinary")))
    return "food-tour";
  if (lowerTags.some((t) => t.includes("walking") || t.includes("tour")))
    return "walking-tour";
  if (lowerTags.some((t) => t.includes("day trip"))) return "day-trip";
  if (lowerTags.some((t) => t.includes("view"))) return "viewpoint";
  if (lowerTags.some((t) => t.includes("landmark"))) return "landmark";
  if (lowerTags.some((t) => t.includes("entertainment") || t.includes("show")))
    return "entertainment";
  if (lowerTags.some((t) => t.includes("cultural"))) return "cultural-experience";
  if (lowerTags.some((t) => t.includes("relax") || t.includes("spa")))
    return "relaxation";
  if (lowerTags.some((t) => t.includes("adventure"))) return "adventure";
  if (lowerTags.some((t) => t.includes("family") || t.includes("kid")))
    return "family-activity";
  if (lowerTags.some((t) => t.includes("photo"))) return "photo-spot";
  if (lowerTags.some((t) => t.includes("nature") || t.includes("outdoor")))
    return "nature";

  // Default category
  return "landmark";
}

/**
 * Infer TimeOfDay array from Viator bestTimeOfDay
 */
function inferTimeOfDayFromViator(
  viator: ViatorActivitySuggestion
): TimeOfDay[] {
  switch (viator.bestTimeOfDay) {
    case "morning":
      return ["morning"];
    case "afternoon":
      return ["afternoon"];
    case "evening":
      return ["evening", "night"];
    case "flexible":
    default:
      return ["morning", "afternoon", "evening"];
  }
}

/**
 * Calculate score breakdown from total score
 */
function calculateScoreBreakdown(
  totalScore: number,
  viator: ViatorActivitySuggestion,
  slot?: TimeSlot
): ScoredActivity["scoreBreakdown"] {
  // Distribute score based on typical weights:
  // interestMatch: 25, timeOfDayFit: 20, durationFit: 15, budgetMatch: 15,
  // weatherFit: 10, varietyBonus: 10, ratingBonus: 5

  const ratio = totalScore / 100;

  // Adjust based on slot match if available
  let timeOfDayFit = Math.round(20 * ratio);
  let durationFit = Math.round(15 * ratio);

  if (slot) {
    // Better time of day match
    const slotType = slot.type;
    if (
      (viator.bestTimeOfDay === "morning" && slotType === "morning") ||
      (viator.bestTimeOfDay === "afternoon" && slotType === "afternoon") ||
      (viator.bestTimeOfDay === "evening" &&
        (slotType === "evening" || slotType === "dinner"))
    ) {
      timeOfDayFit = Math.min(20, timeOfDayFit + 5);
    }

    // Duration fit
    const slotDuration = getSlotDurationMinutes(slot);
    if (viator.duration <= slotDuration && viator.duration >= slotDuration * 0.5) {
      durationFit = Math.min(15, durationFit + 3);
    }
  }

  // Rating bonus
  let ratingBonus = 0;
  if (viator.rating && viator.rating >= 4.5) {
    ratingBonus = 5;
  } else if (viator.rating && viator.rating >= 4.0) {
    ratingBonus = 3;
  }

  return {
    interestMatch: Math.round(25 * ratio),
    timeOfDayFit,
    durationFit,
    budgetMatch: Math.round(15 * ratio),
    weatherFit: Math.round(10 * ratio),
    varietyBonus: Math.round(10 * ratio),
    ratingBonus,
    modeAdjustment: 0,
  };
}

/**
 * Generate explanation string for why activity matches
 */
function generateExplanation(
  viator: ViatorActivitySuggestion,
  slot?: TimeSlot
): string {
  const reasons: string[] = [];

  // Rating
  if (viator.rating && viator.rating >= 4.5) {
    reasons.push(`Highly rated (${viator.rating.toFixed(1)}★)`);
  }

  // Time match
  if (slot && viator.bestTimeOfDay) {
    const slotType = slot.type;
    if (
      (viator.bestTimeOfDay === "morning" && slotType === "morning") ||
      (viator.bestTimeOfDay === "afternoon" && slotType === "afternoon") ||
      (viator.bestTimeOfDay === "evening" &&
        (slotType === "evening" || slotType === "dinner"))
    ) {
      reasons.push(`Ideal for ${slot.label.toLowerCase()}`);
    }
  }

  // Duration
  if (viator.duration <= 120) {
    reasons.push(`Short activity (${Math.round(viator.duration / 60)}h)`);
  } else if (viator.duration >= 240) {
    reasons.push(`Full experience (${Math.round(viator.duration / 60)}h)`);
  }

  // Price
  if (viator.price?.amount === 0) {
    reasons.push("Free entry");
  }

  // Tags
  if (viator.tags?.length > 0) {
    const mainTag = viator.tags[0];
    reasons.push(`Popular ${mainTag.toLowerCase()}`);
  }

  if (reasons.length === 0) {
    reasons.push("Good match for your preferences");
  }

  return reasons.slice(0, 3).join(". ") + ".";
}

/**
 * Get slot duration in minutes
 */
function getSlotDurationMinutes(slot: TimeSlot): number {
  const [startHour, startMin] = slot.startTime.split(":").map(Number);
  const [endHour, endMin] = slot.endTime.split(":").map(Number);
  return endHour * 60 + endMin - (startHour * 60 + startMin);
}

// ============================================
// UNIFIED ACTIVITY TYPE
// ============================================

/**
 * Union type representing any activity format
 */
export type AnyActivity =
  | ViatorActivitySuggestion
  | ScoredActivity
  | CoreActivity
  | RestaurantActivity;

/**
 * Normalize any activity to ScoredActivity format
 */
export function normalizeToScoredActivity(
  activity: AnyActivity,
  slot?: TimeSlot
): ScoredActivity {
  if (isScoredActivity(activity)) {
    return activity;
  }

  if (isViatorActivity(activity)) {
    return viatorToScoredActivity(activity, slot);
  }

  if (isCoreActivity(activity)) {
    return {
      activity,
      totalScore: 70,
      scoreBreakdown: {
        interestMatch: 17,
        timeOfDayFit: 14,
        durationFit: 10,
        budgetMatch: 10,
        weatherFit: 7,
        varietyBonus: 7,
        ratingBonus: 5,
        modeAdjustment: 0,
      },
      explanation: "Good match for your preferences.",
      confidence: 0.7,
    };
  }

  // Fallback - shouldn't reach here
  throw new Error("Unknown activity format");
}

/**
 * Normalize any activity to ViatorActivitySuggestion format
 */
export function normalizeToViator(
  activity: AnyActivity
): ViatorActivitySuggestion {
  if (isViatorActivity(activity)) {
    return activity;
  }

  if (isScoredActivity(activity)) {
    return scoredActivityToViator(activity);
  }

  if (isCoreActivity(activity)) {
    return coreActivityToViator(activity);
  }

  // Fallback
  throw new Error("Unknown activity format");
}

// ============================================
// EXPORTS
// ============================================

export type {
  ViatorActivitySuggestion,
  ScoredActivity,
  CoreActivity,
  RestaurantActivity,
  TimeSlot,
};
