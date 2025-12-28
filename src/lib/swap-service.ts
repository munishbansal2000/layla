// ============================================
// SWAP SERVICE
// ============================================
// Provides Tinder-style activity swapping and replacement functionality.
// Implements Section 17 (Swap with Similar Nearby) and Step 11 (Tinder-Style Selection)
// from docs/ACTIVITY_SUGGESTION_ALGORITHM.md

import {
  CoreActivity,
  RestaurantActivity,
  ScoredActivity,
  UserExperienceSettings,
  ActivityCategory,
  TripMode,
} from "@/types/activity-suggestion";
import { DaySchedule, ScheduledActivity } from "./schedule-builder";
import { createScoringEngine } from "./scoring-engine";

// ============================================
// TYPES
// ============================================

/**
 * Reason for requesting a swap
 */
export type SwapReason =
  | "weather"
  | "closed"
  | "not-interested"
  | "too-crowded"
  | "too-expensive"
  | "already-visited"
  | "too-far"
  | "duration-mismatch"
  | "user-request";

/**
 * Swipe action in Tinder-style interface
 */
export type SwipeAction = "keep" | "reject" | "save-for-later";

/**
 * Rejection reason for feedback
 */
export type RejectionReason =
  | "too-expensive"
  | "not-interested-in-type"
  | "already-been"
  | "too-far"
  | "too-long"
  | "not-for-my-group"
  | "bad-reviews"
  | "other";

/**
 * Constraints for finding swap options
 */
export interface SwapConstraints {
  maxCommuteFromPrevious: number; // minutes
  maxCommuteToNext: number; // minutes
  preserveCategory: boolean;
  preserveBudget: boolean;
  preserveDuration: boolean; // within ±15 min
  maxDistance: number; // meters
  mustBeOpen: boolean;
}

/**
 * Request for swap options
 */
export interface SwapRequest {
  currentActivity: CoreActivity | RestaurantActivity;
  slotId: string;
  scheduledTime: string;
  previousActivity?: CoreActivity | RestaurantActivity;
  nextActivity?: CoreActivity | RestaurantActivity;
  reason?: SwapReason;
  constraints: SwapConstraints;
  tripMode: TripMode;
}

/**
 * A swap option with scoring and metadata
 */
export interface SwapOption {
  activity: ScoredActivity;
  commuteFromPrevious: number; // minutes
  commuteToNext: number; // minutes
  categoryMatch: boolean;
  budgetMatch: boolean;
  durationDelta: number; // minutes difference from current
  distanceFromCurrent: number; // meters
  swapScore: number; // 0-100
  reason: string; // Human-readable explanation
  benefits: string[]; // List of benefits
  tradeoffs: string[]; // List of tradeoffs
}

/**
 * Result of a swipe action
 */
export interface SwipeResult {
  action: SwipeAction;
  activity: ScoredActivity;
  slotId?: string;
  feedback?: {
    reason?: RejectionReason;
    notes?: string;
  };
  suggestedPlacement?: {
    day: number;
    slotId: string;
    slotName: string;
    reason: string;
  };
}

/**
 * Activity card for Tinder-style display
 */
export interface ActivityCard {
  activity: CoreActivity | RestaurantActivity;
  score: number;
  matchReasons: string[];
  localTip?: string;
  highlights: string[];
  warnings?: string[];
  position: number; // Position in card stack
  totalCards: number;
}

/**
 * User's activity preferences learned from swipes
 */
export interface SwipePreferences {
  preferredCategories: Map<ActivityCategory, number>; // category -> affinity score
  rejectedCategories: Map<ActivityCategory, number>; // category -> rejection count
  preferredNeighborhoods: Set<string>;
  rejectedNeighborhoods: Set<string>;
  budgetTendency: "lower" | "same" | "higher";
  durationTendency: "shorter" | "same" | "longer";
  rejectedActivityIds: Set<string>;
  savedForLaterIds: Set<string>;
  rejectionReasons: Map<RejectionReason, number>;
}

/**
 * Session state for tracking swipe behavior
 */
export interface SwipeSession {
  sessionId: string;
  userId: string;
  tripId: string;
  currentSlotId?: string;
  cardStack: ActivityCard[];
  currentCardIndex: number;
  swipeHistory: SwipeResult[];
  preferences: SwipePreferences;
  startedAt: string;
  lastActivityAt: string;
}

// ============================================
// CONSTANTS
// ============================================

const DEFAULT_SWAP_CONSTRAINTS: SwapConstraints = {
  maxCommuteFromPrevious: 30,
  maxCommuteToNext: 30,
  preserveCategory: false,
  preserveBudget: true,
  preserveDuration: true,
  maxDistance: 2000, // 2km
  mustBeOpen: true,
};

const SWAP_SCORE_WEIGHTS = {
  categoryMatch: 20,
  budgetMatch: 15,
  durationFit: 15,
  commuteEfficiency: 20,
  proximity: 15,
  rating: 10,
  variety: 5,
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Generate unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Estimate commute time based on distance
 */
function estimateCommuteMinutes(distanceMeters: number): number {
  // Walking: ~80m/min
  if (distanceMeters <= 1600) {
    return Math.ceil(distanceMeters / 80);
  }
  // Transit: ~200m/min including wait
  return Math.ceil(distanceMeters / 200) + 10;
}

/**
 * Get budget level from activity
 */
function getBudgetLevel(activity: CoreActivity | RestaurantActivity): number {
  const cost = activity.estimatedCost?.amount || 0;
  if (cost === 0) return 1;
  if (cost <= 20) return 2;
  if (cost <= 50) return 3;
  return 4;
}

/**
 * Generate human-readable swap reason
 */
function generateSwapReason(
  candidate: CoreActivity | RestaurantActivity,
  current: CoreActivity | RestaurantActivity,
  distance: number
): string {
  const reasons: string[] = [];

  // Distance
  if (distance < 500) {
    reasons.push(`Just ${Math.round(distance)}m away`);
  } else if (distance < 1000) {
    reasons.push(`${Math.round(distance / 100) / 10}km walk`);
  }

  // Cost comparison
  const currentCost = current.estimatedCost?.amount || 0;
  const candidateCost = candidate.estimatedCost?.amount || 0;

  if (candidateCost === 0 && currentCost > 0) {
    reasons.push("Free alternative");
  } else if (candidateCost < currentCost * 0.7) {
    reasons.push("More budget-friendly");
  }

  // Duration
  const durationDiff = candidate.recommendedDuration - current.recommendedDuration;
  if (durationDiff < -20) {
    reasons.push("Shorter visit");
  } else if (durationDiff > 20) {
    reasons.push("More time to explore");
  }

  // Category match
  if ((candidate as CoreActivity).category === (current as CoreActivity).category) {
    reasons.push("Same type of experience");
  } else {
    reasons.push("Different vibe");
  }

  // Rating
  if (candidate.rating && candidate.rating >= 4.5) {
    reasons.push("Highly rated");
  }

  return reasons.join(" • ") || "Alternative option";
}

/**
 * Generate benefits list for swap option
 */
function generateBenefits(
  candidate: CoreActivity | RestaurantActivity,
  current: CoreActivity | RestaurantActivity,
  commuteFromPrevious: number,
  _commuteToNext: number
): string[] {
  const benefits: string[] = [];

  // Cost
  const currentCost = current.estimatedCost?.amount || 0;
  const candidateCost = candidate.estimatedCost?.amount || 0;
  if (candidateCost < currentCost) {
    benefits.push(`Save ${current.estimatedCost?.currency || "$"}${currentCost - candidateCost}`);
  }
  if (candidateCost === 0) {
    benefits.push("Free entry");
  }

  // Duration
  if (candidate.recommendedDuration < current.recommendedDuration - 15) {
    benefits.push("Saves time");
  }

  // Commute
  if (commuteFromPrevious < 10) {
    benefits.push("Short commute");
  }

  // Weather
  if (!candidate.weatherSensitive && current.weatherSensitive) {
    benefits.push("Weather-proof");
  }
  if (!candidate.isOutdoor && current.isOutdoor) {
    benefits.push("Indoor option");
  }

  // Rating
  if (candidate.rating && current.rating && candidate.rating > current.rating) {
    benefits.push(`Higher rated (${candidate.rating}★)`);
  }

  // Family friendly
  if (candidate.familyFriendly && !current.familyFriendly) {
    benefits.push("Kid-friendly");
  }

  return benefits;
}

/**
 * Generate tradeoffs list for swap option
 */
function generateTradeoffs(
  candidate: CoreActivity | RestaurantActivity,
  current: CoreActivity | RestaurantActivity
): string[] {
  const tradeoffs: string[] = [];

  // Cost
  const currentCost = current.estimatedCost?.amount || 0;
  const candidateCost = candidate.estimatedCost?.amount || 0;
  if (candidateCost > currentCost * 1.3) {
    tradeoffs.push("More expensive");
  }

  // Duration
  if (candidate.recommendedDuration > current.recommendedDuration + 30) {
    tradeoffs.push("Takes longer");
  }

  // Rating
  if (candidate.rating && current.rating && candidate.rating < current.rating - 0.5) {
    tradeoffs.push("Lower rated");
  }

  // Category mismatch
  if ((candidate as CoreActivity).category !== (current as CoreActivity).category) {
    tradeoffs.push("Different type of activity");
  }

  // Weather sensitivity
  if (candidate.weatherSensitive && !current.weatherSensitive) {
    tradeoffs.push("Weather dependent");
  }

  return tradeoffs;
}

// ============================================
// SWAP OPTION FINDING
// ============================================

/**
 * Calculate swap score for a candidate
 */
function calculateSwapScore(
  candidate: CoreActivity | RestaurantActivity,
  current: CoreActivity | RestaurantActivity,
  request: SwapRequest,
  commuteFromPrevious: number,
  commuteToNext: number,
  distance: number
): number {
  let score = 50; // Base score

  // Category match bonus
  if ((candidate as CoreActivity).category === (current as CoreActivity).category) {
    score += SWAP_SCORE_WEIGHTS.categoryMatch;
  }

  // Budget match
  const currentBudget = getBudgetLevel(current);
  const candidateBudget = getBudgetLevel(candidate);
  if (candidateBudget <= currentBudget) {
    score += SWAP_SCORE_WEIGHTS.budgetMatch;
  } else if (candidateBudget > currentBudget + 1) {
    score -= 10;
  }

  // Duration fit
  const durationDiff = Math.abs(candidate.recommendedDuration - current.recommendedDuration);
  if (durationDiff <= 15) {
    score += SWAP_SCORE_WEIGHTS.durationFit;
  } else if (durationDiff <= 30) {
    score += SWAP_SCORE_WEIGHTS.durationFit / 2;
  }

  // Commute efficiency
  const avgCommute = (commuteFromPrevious + commuteToNext) / 2;
  const commuteFit = Math.max(0, 1 - avgCommute / 30) * SWAP_SCORE_WEIGHTS.commuteEfficiency;
  score += commuteFit;

  // Proximity bonus
  const proximityScore = Math.max(0, 1 - distance / request.constraints.maxDistance);
  score += proximityScore * SWAP_SCORE_WEIGHTS.proximity;

  // Rating bonus
  if (candidate.rating) {
    score += (candidate.rating / 5) * SWAP_SCORE_WEIGHTS.rating;
  }

  // Trip mode bonuses
  if (request.tripMode === "family" && candidate.familyFriendly) {
    score += 10;
  }
  if (
    (request.tripMode === "couples" || request.tripMode === "honeymoon") &&
    candidate.romanticRating &&
    candidate.romanticRating > 0.7
  ) {
    score += 10;
  }

  // Weather reason bonus
  if (request.reason === "weather" && !candidate.weatherSensitive) {
    score += 15;
  }

  return Math.min(100, Math.max(0, Math.round(score)));
}

/**
 * Find swap options for an activity
 */
export function findSwapOptions(
  request: SwapRequest,
  availableActivities: ScoredActivity[],
  alreadyInPlan: Set<string>
): SwapOption[] {
  const { currentActivity, constraints, previousActivity, nextActivity } = request;

  // Filter candidates
  let candidates = availableActivities.filter((a) => {
    // Exclude current and already planned
    if (a.activity.id === currentActivity.id) return false;
    if (alreadyInPlan.has(a.activity.id)) return false;

    // Check distance
    const distance = calculateDistance(
      currentActivity.location.lat,
      currentActivity.location.lng,
      a.activity.location.lat,
      a.activity.location.lng
    );
    if (distance > constraints.maxDistance) return false;

    // Category filter
    if (constraints.preserveCategory) {
      if (
        (a.activity as CoreActivity).category !==
        (currentActivity as CoreActivity).category
      ) {
        return false;
      }
    }

    // Budget filter
    if (constraints.preserveBudget) {
      const currentBudget = getBudgetLevel(currentActivity);
      const candidateBudget = getBudgetLevel(a.activity);
      if (candidateBudget > currentBudget + 1) return false;
    }

    // Duration filter
    if (constraints.preserveDuration) {
      const durationDiff = Math.abs(
        a.activity.recommendedDuration - currentActivity.recommendedDuration
      );
      if (durationDiff > 30) return false;
    }

    return true;
  });

  // Score and build swap options
  const swapOptions: SwapOption[] = candidates.map((scored) => {
    const candidate = scored.activity;

    // Calculate distances
    const distanceFromCurrent = calculateDistance(
      currentActivity.location.lat,
      currentActivity.location.lng,
      candidate.location.lat,
      candidate.location.lng
    );

    // Calculate commutes
    const commuteFromPrevious = previousActivity
      ? estimateCommuteMinutes(
          calculateDistance(
            previousActivity.location.lat,
            previousActivity.location.lng,
            candidate.location.lat,
            candidate.location.lng
          )
        )
      : 0;

    const commuteToNext = nextActivity
      ? estimateCommuteMinutes(
          calculateDistance(
            candidate.location.lat,
            candidate.location.lng,
            nextActivity.location.lat,
            nextActivity.location.lng
          )
        )
      : 0;

    // Calculate swap score
    const swapScore = calculateSwapScore(
      candidate,
      currentActivity,
      request,
      commuteFromPrevious,
      commuteToNext,
      distanceFromCurrent
    );

    return {
      activity: scored,
      commuteFromPrevious,
      commuteToNext,
      categoryMatch:
        (candidate as CoreActivity).category ===
        (currentActivity as CoreActivity).category,
      budgetMatch: getBudgetLevel(candidate) <= getBudgetLevel(currentActivity),
      durationDelta: candidate.recommendedDuration - currentActivity.recommendedDuration,
      distanceFromCurrent: Math.round(distanceFromCurrent),
      swapScore,
      reason: generateSwapReason(candidate, currentActivity, distanceFromCurrent),
      benefits: generateBenefits(
        candidate,
        currentActivity,
        commuteFromPrevious,
        commuteToNext
      ),
      tradeoffs: generateTradeoffs(candidate, currentActivity),
    };
  });

  // Filter by commute constraints and sort by score
  return swapOptions
    .filter(
      (opt) =>
        opt.commuteFromPrevious <= constraints.maxCommuteFromPrevious &&
        opt.commuteToNext <= constraints.maxCommuteToNext
    )
    .sort((a, b) => b.swapScore - a.swapScore)
    .slice(0, 5);
}

// ============================================
// TINDER-STYLE CARD MANAGEMENT
// ============================================

/**
 * Generate match reasons for activity card
 */
function generateMatchReasons(
  activity: CoreActivity | RestaurantActivity,
  settings: UserExperienceSettings
): string[] {
  const reasons: string[] = [];

  // Trip mode specific
  if (settings.tripMode === "family" && activity.familyFriendly) {
    reasons.push("Perfect for families");
  }
  if (
    (settings.tripMode === "couples" || settings.tripMode === "honeymoon") &&
    activity.romanticRating &&
    activity.romanticRating > 0.7
  ) {
    reasons.push("Romantic spot");
  }
  if (settings.tripMode === "solo" && activity.soloFriendly) {
    reasons.push("Great for solo travelers");
  }

  // Weather
  if (!activity.weatherSensitive) {
    reasons.push("Indoor activity");
  }

  // Free
  if (activity.isFree) {
    reasons.push("Free entry");
  }

  // Rating
  if (activity.rating && activity.rating >= 4.5) {
    reasons.push("Highly rated");
  }

  // Unique
  if (activity.tags?.includes("unique") || activity.tags?.includes("must-see")) {
    reasons.push("Unique to destination");
  }

  return reasons.slice(0, 3);
}

/**
 * Generate highlights for activity card
 */
function generateHighlights(
  activity: CoreActivity | RestaurantActivity
): string[] {
  const highlights: string[] = [];

  // Duration
  const hours = Math.floor(activity.recommendedDuration / 60);
  const mins = activity.recommendedDuration % 60;
  if (hours > 0) {
    highlights.push(`⏱️ ${hours}${mins > 0 ? `.${Math.round(mins / 6)}` : ""} hrs`);
  } else {
    highlights.push(`⏱️ ${mins} min`);
  }

  // Location
  highlights.push(`📍 ${activity.neighborhood}`);

  // Rating
  if (activity.rating) {
    highlights.push(`★ ${activity.rating}`);
  }

  // Cost
  if (activity.isFree) {
    highlights.push("💰 Free");
  } else if (activity.estimatedCost) {
    highlights.push(
      `💰 ${activity.estimatedCost.currency}${activity.estimatedCost.amount}`
    );
  }

  return highlights;
}

/**
 * Generate warnings for activity card
 */
function generateCardWarnings(
  activity: CoreActivity | RestaurantActivity,
  settings: UserExperienceSettings
): string[] {
  const warnings: string[] = [];

  // Family warnings
  if (settings.tripMode === "family" && !activity.familyFriendly) {
    warnings.push("May not be suitable for children");
  }

  // Booking required
  if (activity.requiresBooking) {
    warnings.push("Advance booking recommended");
  }

  // Weather sensitive
  if (activity.weatherSensitive && activity.isOutdoor) {
    warnings.push("Weather dependent");
  }

  return warnings;
}

/**
 * Create activity card for Tinder-style display
 */
export function createActivityCard(
  scored: ScoredActivity,
  settings: UserExperienceSettings,
  position: number,
  totalCards: number
): ActivityCard {
  const activity = scored.activity;

  return {
    activity,
    score: scored.totalScore,
    matchReasons: generateMatchReasons(activity, settings),
    localTip: activity.localTip,
    highlights: generateHighlights(activity),
    warnings: generateCardWarnings(activity, settings),
    position,
    totalCards,
  };
}

/**
 * Create card stack for a slot
 */
export function createCardStack(
  activities: ScoredActivity[],
  settings: UserExperienceSettings,
  maxCards: number = 10
): ActivityCard[] {
  // Sort by score and take top cards
  const topActivities = [...activities]
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, maxCards);

  return topActivities.map((scored, index) =>
    createActivityCard(scored, settings, index + 1, topActivities.length)
  );
}

// ============================================
// SWIPE SESSION MANAGEMENT
// ============================================

/**
 * Create initial swipe preferences
 */
function createInitialPreferences(): SwipePreferences {
  return {
    preferredCategories: new Map(),
    rejectedCategories: new Map(),
    preferredNeighborhoods: new Set(),
    rejectedNeighborhoods: new Set(),
    budgetTendency: "same",
    durationTendency: "same",
    rejectedActivityIds: new Set(),
    savedForLaterIds: new Set(),
    rejectionReasons: new Map(),
  };
}

/**
 * Create new swipe session
 */
export function createSwipeSession(
  userId: string,
  tripId: string,
  initialCards: ActivityCard[]
): SwipeSession {
  return {
    sessionId: generateId(),
    userId,
    tripId,
    cardStack: initialCards,
    currentCardIndex: 0,
    swipeHistory: [],
    preferences: createInitialPreferences(),
    startedAt: new Date().toISOString(),
    lastActivityAt: new Date().toISOString(),
  };
}

/**
 * Process swipe action
 */
export function processSwipe(
  session: SwipeSession,
  action: SwipeAction,
  slotId?: string,
  feedback?: { reason?: RejectionReason; notes?: string }
): SwipeSession {
  const currentCard = session.cardStack[session.currentCardIndex];
  if (!currentCard) return session;

  const activity = currentCard.activity;
  const category = (activity as CoreActivity).category;

  // Create swipe result
  const result: SwipeResult = {
    action,
    activity: {
      activity,
      totalScore: currentCard.score,
      scoreBreakdown: {
        interestMatch: 0,
        timeOfDayFit: 0,
        durationFit: 0,
        budgetMatch: 0,
        weatherFit: 0,
        varietyBonus: 0,
        ratingBonus: 0,
        modeAdjustment: 0,
      },
      explanation: "Selected via swipe",
      confidence: 0.8,
    },
    slotId,
    feedback,
  };

  // Update preferences based on action
  const updatedPreferences = { ...session.preferences };

  switch (action) {
    case "keep":
      // Increase affinity for category
      const currentAffinity =
        updatedPreferences.preferredCategories.get(category) || 0;
      updatedPreferences.preferredCategories.set(category, currentAffinity + 1);

      // Track neighborhood
      updatedPreferences.preferredNeighborhoods.add(activity.neighborhood);
      break;

    case "reject":
      // Track rejection
      updatedPreferences.rejectedActivityIds.add(activity.id);

      // Increase rejection count for category
      const currentRejections =
        updatedPreferences.rejectedCategories.get(category) || 0;
      updatedPreferences.rejectedCategories.set(category, currentRejections + 1);

      // Track rejection reason
      if (feedback?.reason) {
        const reasonCount =
          updatedPreferences.rejectionReasons.get(feedback.reason) || 0;
        updatedPreferences.rejectionReasons.set(feedback.reason, reasonCount + 1);

        // Update tendencies based on feedback
        if (feedback.reason === "too-expensive") {
          updatedPreferences.budgetTendency = "lower";
        }
        if (feedback.reason === "too-long") {
          updatedPreferences.durationTendency = "shorter";
        }
      }
      break;

    case "save-for-later":
      updatedPreferences.savedForLaterIds.add(activity.id);
      break;
  }

  // Return updated session
  return {
    ...session,
    currentCardIndex: session.currentCardIndex + 1,
    swipeHistory: [...session.swipeHistory, result],
    preferences: updatedPreferences,
    lastActivityAt: new Date().toISOString(),
  };
}

/**
 * Get next card in session
 */
export function getNextCard(session: SwipeSession): ActivityCard | null {
  if (session.currentCardIndex >= session.cardStack.length) {
    return null;
  }
  return session.cardStack[session.currentCardIndex];
}

/**
 * Check if session has more cards
 */
export function hasMoreCards(session: SwipeSession): boolean {
  return session.currentCardIndex < session.cardStack.length;
}

/**
 * Get session summary
 */
export function getSessionSummary(session: SwipeSession): {
  kept: number;
  rejected: number;
  savedForLater: number;
  topCategories: ActivityCategory[];
  rejectedCategories: ActivityCategory[];
} {
  const kept = session.swipeHistory.filter((s) => s.action === "keep").length;
  const rejected = session.swipeHistory.filter((s) => s.action === "reject").length;
  const savedForLater = session.swipeHistory.filter(
    (s) => s.action === "save-for-later"
  ).length;

  // Get top preferred categories
  const sortedPreferred = [...session.preferences.preferredCategories.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat);

  // Get most rejected categories
  const sortedRejected = [...session.preferences.rejectedCategories.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([cat]) => cat);

  return {
    kept,
    rejected,
    savedForLater,
    topCategories: sortedPreferred,
    rejectedCategories: sortedRejected,
  };
}

// ============================================
// SMART PLACEMENT (Save for Later)
// ============================================

/**
 * Find best slot for a saved activity
 */
export function findBestSlotForActivity(
  activity: CoreActivity | RestaurantActivity,
  schedule: DaySchedule[],
  settings: UserExperienceSettings
): {
  day: number;
  slotId: string;
  slotName: string;
  reason: string;
  score: number;
}[] {
  const suggestions: {
    day: number;
    slotId: string;
    slotName: string;
    reason: string;
    score: number;
  }[] = [];

  for (let dayIndex = 0; dayIndex < schedule.length; dayIndex++) {
    const day = schedule[dayIndex];

    // Skip travel days
    if (day.dayType === "travel") continue;

    // Check each slot
    for (const slot of day.slots) {
      let score = 50;
      const reasons: string[] = [];

      // Time of day match
      const slotHour = parseInt(slot.scheduledStart.split(":")[0]);
      const timeOfDay =
        slotHour < 12 ? "morning" : slotHour < 17 ? "afternoon" : "evening";

      if (activity.bestTimeOfDay.includes(timeOfDay as "morning" | "afternoon" | "evening")) {
        score += 20;
        reasons.push(`Good for ${timeOfDay}`);
      }

      // Category variety (avoid same category on same day)
      const dayCategories = new Set(
        day.slots.map((s) => (s.activity.activity as CoreActivity).category)
      );
      if (!dayCategories.has((activity as CoreActivity).category)) {
        score += 15;
        reasons.push("Adds variety");
      }

      // Neighborhood efficiency
      const dayNeighborhoods = new Set(
        day.slots.map((s) => s.activity.activity.neighborhood)
      );
      if (dayNeighborhoods.has(activity.neighborhood)) {
        score += 10;
        reasons.push("Near other activities");
      }

      // Duration fit
      const slotDuration =
        (parseInt(slot.scheduledEnd.split(":")[0]) -
          parseInt(slot.scheduledStart.split(":")[0])) *
        60;
      if (activity.recommendedDuration <= slotDuration + 30) {
        score += 10;
      }

      // Trip mode fit
      if (settings.tripMode === "family" && activity.familyFriendly) {
        score += 5;
      }

      suggestions.push({
        day: dayIndex + 1,
        slotId: slot.slotId,
        slotName: `Day ${dayIndex + 1} ${timeOfDay}`,
        reason: reasons.join(", ") || "Available slot",
        score,
      });
    }
  }

  // Sort by score and return top 3
  return suggestions.sort((a, b) => b.score - a.score).slice(0, 3);
}

// ============================================
// MAIN SWAP SERVICE CLASS
// ============================================

export class SwapService {
  private settings: UserExperienceSettings;

  constructor(settings: UserExperienceSettings) {
    this.settings = settings;
    // Scoring engine available for future use
    createScoringEngine(settings);
  }

  /**
   * Get swap options for an activity in a schedule
   */
  getSwapOptions(
    schedule: DaySchedule,
    slotId: string,
    availableActivities: ScoredActivity[],
    reason?: SwapReason
  ): SwapOption[] {
    const slotIndex = schedule.slots.findIndex((s) => s.slotId === slotId);
    if (slotIndex === -1) return [];

    const slot = schedule.slots[slotIndex];
    const previousSlot = slotIndex > 0 ? schedule.slots[slotIndex - 1] : undefined;
    const nextSlot =
      slotIndex < schedule.slots.length - 1
        ? schedule.slots[slotIndex + 1]
        : undefined;

    // Build already-in-plan set
    const alreadyInPlan = new Set(
      schedule.slots.map((s) => s.activity.activity.id)
    );

    const request: SwapRequest = {
      currentActivity: slot.activity.activity,
      slotId,
      scheduledTime: slot.scheduledStart,
      previousActivity: previousSlot?.activity.activity,
      nextActivity: nextSlot?.activity.activity,
      reason,
      constraints: DEFAULT_SWAP_CONSTRAINTS,
      tripMode: this.settings.tripMode,
    };

    return findSwapOptions(request, availableActivities, alreadyInPlan);
  }

  /**
   * Execute a swap in the schedule
   */
  executeSwap(
    schedule: DaySchedule,
    slotId: string,
    newActivity: ScoredActivity
  ): DaySchedule {
    const slotIndex = schedule.slots.findIndex((s) => s.slotId === slotId);
    if (slotIndex === -1) return schedule;

    const slot = schedule.slots[slotIndex];

    // Create updated slot
    const updatedSlot: ScheduledActivity = {
      ...slot,
      activity: newActivity,
      alternatives: [slot.activity, ...slot.alternatives.slice(0, 2)],
      isLocked: false,
    };

    // Recalculate commutes
    const updatedSlots = [...schedule.slots];
    updatedSlots[slotIndex] = updatedSlot;

    // Update commute from previous
    if (slotIndex > 0) {
      const prev = updatedSlots[slotIndex - 1].activity.activity;
      const distance = calculateDistance(
        prev.location.lat,
        prev.location.lng,
        newActivity.activity.location.lat,
        newActivity.activity.location.lng
      );
      updatedSlot.commuteFromPrevious = {
        fromActivityId: prev.id,
        toActivityId: newActivity.activity.id,
        durationMinutes: estimateCommuteMinutes(distance),
        distanceMeters: Math.round(distance),
        mode: distance < 1600 ? "walking" : "transit",
      };
    }

    // Update commute to next
    if (slotIndex < updatedSlots.length - 1) {
      const next = updatedSlots[slotIndex + 1];
      const distance = calculateDistance(
        newActivity.activity.location.lat,
        newActivity.activity.location.lng,
        next.activity.activity.location.lat,
        next.activity.activity.location.lng
      );
      next.commuteFromPrevious = {
        fromActivityId: newActivity.activity.id,
        toActivityId: next.activity.activity.id,
        durationMinutes: estimateCommuteMinutes(distance),
        distanceMeters: Math.round(distance),
        mode: distance < 1600 ? "walking" : "transit",
      };
    }

    // Recalculate totals
    const totalCommuteTime = updatedSlots.reduce(
      (sum, s) => sum + (s.commuteFromPrevious?.durationMinutes || 0),
      0
    );

    return {
      ...schedule,
      slots: updatedSlots,
      totalCommuteTime,
      neighborhoodsVisited: [
        ...new Set(updatedSlots.map((s) => s.activity.activity.neighborhood)),
      ],
    };
  }

  /**
   * Create Tinder-style card stack for a slot
   */
  createCardStackForSlot(
    activities: ScoredActivity[],
    maxCards: number = 10
  ): ActivityCard[] {
    return createCardStack(activities, this.settings, maxCards);
  }

  /**
   * Start a new swipe session
   */
  startSwipeSession(
    userId: string,
    tripId: string,
    activities: ScoredActivity[]
  ): SwipeSession {
    const cards = this.createCardStackForSlot(activities);
    return createSwipeSession(userId, tripId, cards);
  }

  /**
   * Process user swipe in session
   */
  handleSwipe(
    session: SwipeSession,
    action: SwipeAction,
    slotId?: string,
    feedback?: { reason?: RejectionReason; notes?: string }
  ): SwipeSession {
    return processSwipe(session, action, slotId, feedback);
  }

  /**
   * Find smart placement for saved activity
   */
  findSmartPlacement(
    activity: CoreActivity | RestaurantActivity,
    schedule: DaySchedule[]
  ): ReturnType<typeof findBestSlotForActivity> {
    return findBestSlotForActivity(activity, schedule, this.settings);
  }

  /**
   * Get weather-based swap suggestions
   */
  getWeatherSwapSuggestions(
    schedule: DaySchedule,
    availableActivities: ScoredActivity[],
    isRaining: boolean
  ): Map<string, SwapOption[]> {
    const suggestions = new Map<string, SwapOption[]>();

    if (!isRaining) return suggestions;

    // Find outdoor activities that need swaps
    for (const slot of schedule.slots) {
      const activity = slot.activity.activity;
      if (activity.isOutdoor && activity.weatherSensitive) {
        const options = this.getSwapOptions(
          schedule,
          slot.slotId,
          availableActivities.filter((a) => !a.activity.isOutdoor),
          "weather"
        );
        if (options.length > 0) {
          suggestions.set(slot.slotId, options);
        }
      }
    }

    return suggestions;
  }

  /**
   * Rerank remaining cards based on swipe preferences
   */
  rerankCards(
    session: SwipeSession,
    remainingActivities: ScoredActivity[]
  ): ScoredActivity[] {
    const { preferences } = session;

    return remainingActivities
      .filter((a) => !preferences.rejectedActivityIds.has(a.activity.id))
      .map((scored) => {
        let adjustedScore = scored.totalScore;
        const category = (scored.activity as CoreActivity).category;

        // Boost preferred categories
        const preferredBoost = preferences.preferredCategories.get(category) || 0;
        adjustedScore += preferredBoost * 5;

        // Penalize rejected categories
        const rejectionPenalty = preferences.rejectedCategories.get(category) || 0;
        adjustedScore -= rejectionPenalty * 10;

        // Boost preferred neighborhoods
        if (preferences.preferredNeighborhoods.has(scored.activity.neighborhood)) {
          adjustedScore += 5;
        }

        // Budget adjustment
        if (preferences.budgetTendency === "lower") {
          if (scored.activity.isFree) adjustedScore += 10;
          if (getBudgetLevel(scored.activity) <= 2) adjustedScore += 5;
        }

        // Duration adjustment
        if (preferences.durationTendency === "shorter") {
          if (scored.activity.recommendedDuration <= 60) adjustedScore += 5;
        }

        return {
          ...scored,
          totalScore: Math.max(0, Math.min(100, adjustedScore)),
        };
      })
      .sort((a, b) => b.totalScore - a.totalScore);
  }
}

// ============================================
// FACTORY FUNCTIONS
// ============================================

/**
 * Create swap service
 */
export function createSwapService(settings: UserExperienceSettings): SwapService {
  return new SwapService(settings);
}

// ============================================
// EXPORTS
// ============================================

export {
  DEFAULT_SWAP_CONSTRAINTS,
  SWAP_SCORE_WEIGHTS,
  generateSwapReason,
  generateBenefits,
  generateTradeoffs,
  calculateSwapScore,
};

export default SwapService;
