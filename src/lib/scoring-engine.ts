// ============================================
// ACTIVITY SCORING ENGINE
// ============================================
// Implements the 100-point scoring algorithm from the design doc
// Scores activities based on user preferences, timing, budget, weather, etc.

import {
  CoreActivity,
  RestaurantActivity,
  ScoredActivity,
  ScoringWeights,
  NightScoringAdjustments,
  ModeScoringAdjustments,
  TripMode,
  UserExperienceSettings,
  WeatherForecast,
  WeatherCondition,
  TimeOfDay,
  DietaryOption,
} from "@/types/activity-suggestion";

// ============================================
// DEFAULT WEIGHTS
// ============================================

export const DEFAULT_SCORING_WEIGHTS: ScoringWeights = {
  interestMatch: 25,
  timeOfDayFit: 20,
  durationFit: 15,
  budgetMatch: 15,
  weatherFit: 10,
  varietyBonus: 10,
  ratingBonus: 5,
};

export const DEFAULT_NIGHT_SCORING: NightScoringAdjustments = {
  lateHoursFit: 20,
  transportFeasibility: 15,
  familySuitability: 15,
  indoorComfort: 10,
  vibeContinuity: 10,
  photoValue: 5,
};

// ============================================
// TRIP MODE SCORING ADJUSTMENTS
// ============================================

export const MODE_SCORING_ADJUSTMENTS: Record<TripMode, ModeScoringAdjustments> = {
  family: {
    mode: "family",
    boosts: [
      { tag: "kid-friendly", points: 25 },
      { tag: "family-activity", points: 20 },
      { tag: "playground", points: 15 },
      { tag: "interactive", points: 15 },
      { tag: "educational", points: 10 },
      { tag: "stroller-friendly", points: 15 },
      { tag: "changing-facilities", points: 10 },
      { tag: "outdoor-space", points: 10 },
    ],
    penalties: [
      { tag: "adult-only", points: -100 }, // Exclude
      { tag: "nightlife", points: -50 },
      { tag: "bar", points: -100 },
      { tag: "romantic", points: -10 },
      { tag: "long-walking", points: -15 },
    ],
    exclusions: ["adult-only", "bar", "nightclub", "wine-bar", "18+", "21+"],
  },

  couples: {
    mode: "couples",
    boosts: [
      { tag: "romantic", points: 25 },
      { tag: "scenic", points: 20 },
      { tag: "sunset-view", points: 20 },
      { tag: "intimate", points: 15 },
      { tag: "fine-dining", points: 15 },
      { tag: "photo-spot", points: 10 },
      { tag: "private-experience", points: 15 },
    ],
    penalties: [
      { tag: "kid-friendly", points: -5 },
      { tag: "playground", points: -20 },
      { tag: "noisy", points: -15 },
      { tag: "crowded", points: -10 },
    ],
    exclusions: ["playground", "kids-museum"],
  },

  honeymoon: {
    mode: "honeymoon",
    boosts: [
      { tag: "romantic", points: 30 },
      { tag: "luxury", points: 25 },
      { tag: "private", points: 25 },
      { tag: "special-occasion", points: 25 },
      { tag: "intimate", points: 20 },
      { tag: "champagne", points: 15 },
      { tag: "spa", points: 20 },
      { tag: "sunset-view", points: 20 },
      { tag: "photo-spot", points: 15 },
    ],
    penalties: [
      { tag: "budget", points: -15 },
      { tag: "crowded", points: -20 },
      { tag: "group-tour", points: -15 },
      { tag: "family-activity", points: -25 },
    ],
    exclusions: ["family-activity", "playground", "kids-museum", "budget"],
  },

  solo: {
    mode: "solo",
    boosts: [
      { tag: "solo-friendly", points: 25 },
      { tag: "safe-area", points: 20 },
      { tag: "counter-seating", points: 15 },
      { tag: "social", points: 15 },
      { tag: "walking-tour", points: 15 },
      { tag: "cafe", points: 10 },
      { tag: "local-experience", points: 15 },
    ],
    penalties: [
      { tag: "couples-only", points: -100 },
      { tag: "romantic", points: -10 },
      { tag: "group-required", points: -50 },
    ],
    exclusions: ["couples-only", "requires-partner"],
  },

  friends: {
    mode: "friends",
    boosts: [
      { tag: "group-friendly", points: 25 },
      { tag: "shareable", points: 15 },
      { tag: "lively", points: 15 },
      { tag: "nightlife", points: 15 },
      { tag: "photo-spot", points: 15 },
      { tag: "karaoke", points: 20 },
      { tag: "izakaya", points: 15 },
      { tag: "adventure", points: 15 },
    ],
    penalties: [
      { tag: "intimate", points: -10 },
      { tag: "quiet", points: -5 },
      { tag: "romantic", points: -10 },
    ],
    exclusions: [],
  },

  "multi-generational": {
    mode: "multi-generational",
    boosts: [
      { tag: "all-ages", points: 25 },
      { tag: "accessible", points: 25 },
      { tag: "seating-available", points: 20 },
      { tag: "elevator", points: 15 },
      { tag: "rest-spots", points: 15 },
      { tag: "kid-friendly", points: 15 },
      { tag: "not-strenuous", points: 15 },
    ],
    penalties: [
      { tag: "strenuous", points: -30 },
      { tag: "long-walking", points: -20 },
      { tag: "stairs-required", points: -25 },
      { tag: "adult-only", points: -100 },
    ],
    exclusions: ["adult-only", "strenuous", "extreme-adventure"],
  },

  "girls-trip": {
    mode: "girls-trip",
    boosts: [
      { tag: "trendy", points: 20 },
      { tag: "instagrammable", points: 20 },
      { tag: "brunch", points: 20 },
      { tag: "spa", points: 25 },
      { tag: "shopping", points: 15 },
      { tag: "rooftop", points: 15 },
      { tag: "afternoon-tea", points: 15 },
      { tag: "dessert", points: 10 },
    ],
    penalties: [
      { tag: "sports", points: -10 },
      { tag: "dive-bar", points: -15 },
    ],
    exclusions: [],
  },

  "guys-trip": {
    mode: "guys-trip",
    boosts: [
      { tag: "izakaya", points: 20 },
      { tag: "yakitori", points: 15 },
      { tag: "craft-beer", points: 20 },
      { tag: "sports", points: 15 },
      { tag: "adventure", points: 20 },
      { tag: "arcade", points: 15 },
      { tag: "go-kart", points: 20 },
    ],
    penalties: [
      { tag: "afternoon-tea", points: -15 },
      { tag: "spa", points: -10 },
    ],
    exclusions: [],
  },

  babymoon: {
    mode: "babymoon",
    boosts: [
      { tag: "relaxing", points: 25 },
      { tag: "spa", points: 25 },
      { tag: "romantic", points: 20 },
      { tag: "comfortable", points: 20 },
      { tag: "accessible", points: 15 },
      { tag: "not-strenuous", points: 20 },
      { tag: "scenic", points: 15 },
    ],
    penalties: [
      { tag: "strenuous", points: -30 },
      { tag: "adventure", points: -20 },
      { tag: "crowded", points: -15 },
      { tag: "long-walking", points: -20 },
    ],
    exclusions: ["strenuous", "extreme-adventure", "high-altitude"],
  },
};

// ============================================
// SCORING CONTEXT
// ============================================

export interface ScoringContext {
  settings: UserExperienceSettings;
  weather?: WeatherForecast;
  timeSlot?: { startTime: string; endTime: string };
  isNightSlot?: boolean;
  previousActivities?: (CoreActivity | RestaurantActivity)[];
  lastTrainTime?: string;
  hotelLocation?: { lat: number; lng: number };
}

// ============================================
// MAIN SCORING ENGINE
// ============================================

export class ActivityScoringEngine {
  private weights: ScoringWeights;
  private nightWeights: NightScoringAdjustments;

  constructor(
    weights: Partial<ScoringWeights> = {},
    nightWeights: Partial<NightScoringAdjustments> = {}
  ) {
    this.weights = { ...DEFAULT_SCORING_WEIGHTS, ...weights };
    this.nightWeights = { ...DEFAULT_NIGHT_SCORING, ...nightWeights };
  }

  /**
   * Score a single activity in context
   */
  scoreActivity(
    activity: CoreActivity | RestaurantActivity,
    context: ScoringContext
  ): ScoredActivity {
    const { settings } = context;

    // Check hard exclusions first
    if (this.isExcluded(activity, settings)) {
      return this.createExcludedScore(activity, "Excluded by trip mode constraints");
    }

    // Check dietary constraints for restaurants
    if (this.isRestaurant(activity)) {
      const dietaryCheck = this.checkDietaryConstraints(activity, settings.dietary);
      if (!dietaryCheck.pass) {
        return this.createExcludedScore(activity, dietaryCheck.reason);
      }
    }

    // Calculate individual scores
    const interestMatch = this.scoreInterestMatch(activity, settings);
    const timeOfDayFit = this.scoreTimeOfDayFit(activity, context);
    const durationFit = this.scoreDurationFit(activity, context);
    const budgetMatch = this.scoreBudgetMatch(activity, settings);
    const weatherFit = this.scoreWeatherFit(activity, context);
    const varietyBonus = this.scoreVariety(activity, context);
    const ratingBonus = this.scoreRating(activity);
    const modeAdjustment = this.scoreModeAdjustment(activity, settings.tripMode);

    // Night-specific scoring
    let nightAdjustment = 0;
    if (context.isNightSlot) {
      nightAdjustment = this.scoreNightFit(activity, context);
    }

    // Calculate total (base max is 100, mode adjustments can push higher/lower)
    const baseScore =
      interestMatch +
      timeOfDayFit +
      durationFit +
      budgetMatch +
      weatherFit +
      varietyBonus +
      ratingBonus;

    const totalScore = Math.max(0, Math.min(150, baseScore + modeAdjustment + nightAdjustment));

    // Generate explanation
    const explanation = this.generateExplanation(activity, context, {
      interestMatch,
      timeOfDayFit,
      durationFit,
      budgetMatch,
      weatherFit,
      varietyBonus,
      ratingBonus,
      modeAdjustment,
      nightAdjustment,
    });

    // Generate warnings
    const warnings = this.generateWarnings(activity, context);

    return {
      activity,
      totalScore,
      scoreBreakdown: {
        interestMatch,
        timeOfDayFit,
        durationFit,
        budgetMatch,
        weatherFit,
        varietyBonus,
        ratingBonus,
        modeAdjustment,
        nightAdjustment: context.isNightSlot ? nightAdjustment : undefined,
      },
      explanation,
      confidence: activity.confidence,
      warnings: warnings.length > 0 ? warnings : undefined,
    };
  }

  /**
   * Score multiple activities and return sorted by score
   */
  scoreActivities(
    activities: (CoreActivity | RestaurantActivity)[],
    context: ScoringContext
  ): ScoredActivity[] {
    return activities
      .map((activity) => this.scoreActivity(activity, context))
      .filter((scored) => scored.totalScore > 0) // Remove excluded
      .sort((a, b) => b.totalScore - a.totalScore);
  }

  /**
   * Get top N activities for a slot
   */
  getTopActivities(
    activities: (CoreActivity | RestaurantActivity)[],
    context: ScoringContext,
    limit: number = 5
  ): ScoredActivity[] {
    return this.scoreActivities(activities, context).slice(0, limit);
  }

  // ============================================
  // INDIVIDUAL SCORING FUNCTIONS
  // ============================================

  /**
   * Score based on interest/tag match with user preferences
   */
  private scoreInterestMatch(
    activity: CoreActivity | RestaurantActivity,
    settings: UserExperienceSettings
  ): number {
    const maxScore = this.weights.interestMatch;
    const vibePreferences = settings.vibePreferences || [];
    const anchors = settings.anchors;

    // Must-do activities get full score
    if (anchors.mustDo.includes(activity.id)) {
      return maxScore;
    }

    // Nice-to-have activities get bonus
    if (anchors.niceToHave.includes(activity.id)) {
      return maxScore * 0.9;
    }

    // Match against vibe preferences
    if (vibePreferences.length === 0) {
      return maxScore * 0.5; // Neutral if no preferences set
    }

    const matchingTags = activity.tags.filter((tag) =>
      vibePreferences.some(
        (pref) =>
          tag.toLowerCase().includes(pref.toLowerCase()) ||
          pref.toLowerCase().includes(tag.toLowerCase())
      )
    );

    const matchRatio = Math.min(1, matchingTags.length / Math.max(1, vibePreferences.length));
    return Math.round(maxScore * (0.3 + 0.7 * matchRatio)); // Minimum 30% if no matches
  }

  /**
   * Score based on time of day fit
   */
  private scoreTimeOfDayFit(
    activity: CoreActivity | RestaurantActivity,
    context: ScoringContext
  ): number {
    const maxScore = this.weights.timeOfDayFit;

    if (!context.timeSlot) {
      return maxScore * 0.5; // Neutral if no time context
    }

    const slotTimeOfDay = this.getTimeOfDay(context.timeSlot.startTime);
    const activityBestTimes = activity.bestTimeOfDay;

    if (activityBestTimes.includes(slotTimeOfDay)) {
      return maxScore; // Perfect match
    }

    // Adjacent time periods get partial score
    const adjacentMatch = this.isAdjacentTimeOfDay(slotTimeOfDay, activityBestTimes);
    if (adjacentMatch) {
      return maxScore * 0.6;
    }

    return maxScore * 0.2; // Poor fit but not impossible
  }

  /**
   * Score based on duration fit within available slot
   */
  private scoreDurationFit(
    activity: CoreActivity | RestaurantActivity,
    context: ScoringContext
  ): number {
    const maxScore = this.weights.durationFit;

    if (!context.timeSlot) {
      return maxScore * 0.5;
    }

    const slotDuration = this.getSlotDurationMinutes(context.timeSlot);
    const activityDuration = activity.recommendedDuration;

    // Perfect fit: activity fills 60-90% of slot
    const fillRatio = activityDuration / slotDuration;

    if (fillRatio >= 0.6 && fillRatio <= 0.9) {
      return maxScore;
    }

    if (fillRatio >= 0.4 && fillRatio < 0.6) {
      return maxScore * 0.7; // Slightly short
    }

    if (fillRatio > 0.9 && fillRatio <= 1.1) {
      return maxScore * 0.8; // Slightly over
    }

    if (fillRatio > 1.1) {
      return maxScore * 0.3; // Too long for slot
    }

    return maxScore * 0.5; // Too short
  }

  /**
   * Score based on budget match
   */
  private scoreBudgetMatch(
    activity: CoreActivity | RestaurantActivity,
    settings: UserExperienceSettings
  ): number {
    const maxScore = this.weights.budgetMatch;
    const budgetMode = settings.budgetMode;

    // Free activities
    if (activity.isFree) {
      if (budgetMode === "free-first") {
        return maxScore; // Perfect for free-first
      }
      return maxScore * 0.8; // Still good for other modes
    }

    const estimatedCost = activity.estimatedCost?.amount || 0;
    const dailyLimit = settings.dailyBudgetLimit?.amount;

    // Restaurant price level check
    if (this.isRestaurant(activity)) {
      const priceLevel = activity.priceLevel;
      switch (budgetMode) {
        case "free-first":
          return maxScore * (1 - priceLevel * 0.2); // Penalize higher prices
        case "moderate":
          if (priceLevel <= 2) return maxScore;
          if (priceLevel === 3) return maxScore * 0.7;
          return maxScore * 0.4;
        case "splurge-once-a-day":
          return maxScore * 0.8; // All okay for splurge mode
      }
    }

    // Activity cost check
    if (dailyLimit && estimatedCost > dailyLimit * 0.5) {
      return maxScore * 0.4; // Single activity > 50% of daily budget
    }

    return maxScore * 0.7; // Default for paid activities
  }

  /**
   * Score based on weather appropriateness
   */
  private scoreWeatherFit(
    activity: CoreActivity | RestaurantActivity,
    context: ScoringContext
  ): number {
    const maxScore = this.weights.weatherFit;

    if (!context.weather) {
      return maxScore * 0.5; // Neutral if no weather data
    }

    const { condition, precipitationProbability } = context.weather;
    const isOutdoor = activity.isOutdoor;
    const weatherSensitive = activity.weatherSensitive;

    // Indoor activities in bad weather = bonus
    if (!isOutdoor) {
      if (this.isBadWeather(condition, precipitationProbability)) {
        return maxScore; // Indoor is great in bad weather
      }
      return maxScore * 0.7; // Indoor in good weather is fine
    }

    // Outdoor activities
    if (this.isBadWeather(condition, precipitationProbability)) {
      if (weatherSensitive) {
        return 0; // Don't recommend weather-sensitive outdoor in bad weather
      }
      return maxScore * 0.3; // Outdoor possible but not ideal
    }

    // Good weather for outdoor
    return maxScore;
  }

  /**
   * Score based on variety (avoid repetition of same category)
   */
  private scoreVariety(
    activity: CoreActivity | RestaurantActivity,
    context: ScoringContext
  ): number {
    const maxScore = this.weights.varietyBonus;

    if (!context.previousActivities || context.previousActivities.length === 0) {
      return maxScore; // First activity gets full variety score
    }

    const previousCategories = context.previousActivities.map((a) => a.category);

    // Check if same category was done recently
    const recentSameCategory = previousCategories
      .slice(-3) // Last 3 activities
      .filter((cat) => cat === activity.category).length;

    if (recentSameCategory === 0) {
      return maxScore; // Different category = variety bonus
    }

    if (recentSameCategory === 1) {
      return maxScore * 0.5; // One repeat is okay
    }

    return 0; // Too many repeats
  }

  /**
   * Score based on rating quality
   */
  private scoreRating(activity: CoreActivity | RestaurantActivity): number {
    const maxScore = this.weights.ratingBonus;

    if (!activity.rating) {
      return maxScore * 0.5; // Unknown rating = neutral
    }

    // Rating is typically 1-5
    const normalizedRating = Math.min(5, Math.max(1, activity.rating));

    if (normalizedRating >= 4.5) {
      return maxScore;
    }
    if (normalizedRating >= 4.0) {
      return maxScore * 0.8;
    }
    if (normalizedRating >= 3.5) {
      return maxScore * 0.6;
    }
    if (normalizedRating >= 3.0) {
      return maxScore * 0.3;
    }

    return 0; // Poor rating
  }

  /**
   * Score adjustments based on trip mode
   */
  private scoreModeAdjustment(
    activity: CoreActivity | RestaurantActivity,
    tripMode: TripMode
  ): number {
    const modeConfig = MODE_SCORING_ADJUSTMENTS[tripMode];
    if (!modeConfig) return 0;

    let adjustment = 0;

    // Apply boosts
    for (const boost of modeConfig.boosts) {
      if (this.activityHasTag(activity, boost.tag)) {
        adjustment += boost.points;
      }
    }

    // Apply penalties
    for (const penalty of modeConfig.penalties) {
      if (this.activityHasTag(activity, penalty.tag)) {
        adjustment += penalty.points; // penalties are negative
      }
    }

    // Special attribute checks
    if (tripMode === "family" || tripMode === "multi-generational") {
      if (activity.familyFriendly) {
        adjustment += 10;
      }
      if (activity.accessibilityInfo?.strollerFriendly) {
        adjustment += 10;
      }
    }

    if (tripMode === "couples" || tripMode === "honeymoon") {
      if (activity.romanticRating && activity.romanticRating > 0.7) {
        adjustment += 15;
      }
    }

    if (tripMode === "solo") {
      if (activity.soloFriendly) {
        adjustment += 15;
      }
    }

    return adjustment;
  }

  /**
   * Night-specific scoring adjustments
   */
  private scoreNightFit(
    activity: CoreActivity | RestaurantActivity,
    context: ScoringContext
  ): number {
    let score = 0;

    // Late hours fit - activity should be open late
    const hasLateHours = this.hasLateHours(activity);
    if (hasLateHours) {
      score += this.nightWeights.lateHoursFit;
    }

    // Transport feasibility - can get back to hotel
    if (context.lastTrainTime && context.hotelLocation) {
      // This would need more complex calculation in practice
      // For now, indoor activities near hotel get bonus
      if (!activity.isOutdoor) {
        score += this.nightWeights.transportFeasibility * 0.7;
      }
    }

    // Family suitability for night
    const tripMode = context.settings.tripMode;
    if (tripMode === "family" || tripMode === "multi-generational") {
      if (activity.familyFriendly && !this.activityHasTag(activity, "adult-only")) {
        score += this.nightWeights.familySuitability;
      } else {
        score -= 20; // Penalize non-family-friendly at night
      }
    }

    // Indoor comfort (for cold/bad weather)
    if (context.weather && this.isBadWeather(context.weather.condition, context.weather.precipitationProbability)) {
      if (!activity.isOutdoor) {
        score += this.nightWeights.indoorComfort;
      }
    }

    // Photo/night view value
    if (
      this.activityHasTag(activity, "viewpoint") ||
      this.activityHasTag(activity, "illumination") ||
      this.activityHasTag(activity, "night-view") ||
      this.activityHasTag(activity, "observatory")
    ) {
      score += this.nightWeights.photoValue;
    }

    return score;
  }

  // ============================================
  // HELPER FUNCTIONS
  // ============================================

  private isExcluded(
    activity: CoreActivity | RestaurantActivity,
    settings: UserExperienceSettings
  ): boolean {
    // Check no-go list
    if (settings.anchors.noGo.includes(activity.id)) {
      return true;
    }

    // Check mode exclusions
    const modeConfig = MODE_SCORING_ADJUSTMENTS[settings.tripMode];
    if (modeConfig) {
      for (const exclusion of modeConfig.exclusions) {
        if (this.activityHasTag(activity, exclusion)) {
          return true;
        }
      }
    }

    // Check accessibility requirements
    if (settings.accessibility.wheelchairAccessible) {
      if (!activity.accessibilityInfo?.wheelchairAccessible) {
        return true;
      }
    }

    if (settings.accessibility.avoidStairs) {
      if (!activity.accessibilityInfo?.hasElevator) {
        // May exclude if no elevator info
      }
    }

    return false;
  }

  private checkDietaryConstraints(
    activity: RestaurantActivity,
    dietary: DietaryOption[]
  ): { pass: boolean; reason: string } {
    if (dietary.length === 0) {
      return { pass: true, reason: "" };
    }

    const restaurantOptions = activity.dietaryOptions || [];

    for (const requirement of dietary) {
      // Check if restaurant can accommodate
      const canAccommodate = restaurantOptions.some(
        (opt) => opt === requirement || this.isDietaryCompatible(opt, requirement)
      );

      if (!canAccommodate) {
        return {
          pass: false,
          reason: `Does not accommodate: ${requirement}`,
        };
      }
    }

    return { pass: true, reason: "" };
  }

  private isDietaryCompatible(offered: DietaryOption, required: DietaryOption): boolean {
    // Vegan covers vegetarian
    if (required === "vegetarian" && offered === "vegan") return true;
    // Halal covers no-pork
    if (required === "no-pork" && offered === "halal") return true;
    // Kosher covers no-pork
    if (required === "no-pork" && offered === "kosher") return true;
    return false;
  }

  private isRestaurant(
    activity: CoreActivity | RestaurantActivity
  ): activity is RestaurantActivity {
    return activity.category === "restaurant";
  }

  private activityHasTag(activity: CoreActivity | RestaurantActivity, tag: string): boolean {
    const lowerTag = tag.toLowerCase();
    return (
      activity.tags.some((t) => t.toLowerCase().includes(lowerTag)) ||
      activity.category.toLowerCase().includes(lowerTag)
    );
  }

  private getTimeOfDay(timeString: string): TimeOfDay {
    const hour = parseInt(timeString.split(":")[0], 10);

    if (hour < 7) return "early-morning";
    if (hour < 12) return "morning";
    if (hour < 17) return "afternoon";
    if (hour < 20) return "evening";
    return "night";
  }

  private isAdjacentTimeOfDay(slot: TimeOfDay, activityTimes: TimeOfDay[]): boolean {
    const order: TimeOfDay[] = ["early-morning", "morning", "afternoon", "evening", "night"];
    const slotIndex = order.indexOf(slot);

    return activityTimes.some((time) => {
      const timeIndex = order.indexOf(time);
      return Math.abs(slotIndex - timeIndex) === 1;
    });
  }

  private getSlotDurationMinutes(timeSlot: { startTime: string; endTime: string }): number {
    const [startHour, startMin] = timeSlot.startTime.split(":").map(Number);
    const [endHour, endMin] = timeSlot.endTime.split(":").map(Number);

    return (endHour * 60 + endMin) - (startHour * 60 + startMin);
  }

  private isBadWeather(condition: WeatherCondition, precipProbability: number): boolean {
    const badConditions: WeatherCondition[] = ["rainy", "heavy-rain", "stormy", "snowy"];
    return badConditions.includes(condition) || precipProbability > 50;
  }

  private hasLateHours(activity: CoreActivity | RestaurantActivity): boolean {
    if (!activity.openingHours?.regular) return false;

    return activity.openingHours.regular.some((hours) => {
      const closeHour = parseInt(hours.close.split(":")[0], 10);
      return closeHour >= 21 || closeHour < 6; // Closes at 9pm or later (or after midnight)
    });
  }

  private createExcludedScore(
    activity: CoreActivity | RestaurantActivity,
    reason: string
  ): ScoredActivity {
    return {
      activity,
      totalScore: 0,
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
      explanation: `Excluded: ${reason}`,
      confidence: 0,
      warnings: [reason],
    };
  }

  // ============================================
  // EXPLANATION GENERATOR
  // ============================================

  private generateExplanation(
    activity: CoreActivity | RestaurantActivity,
    context: ScoringContext,
    scores: {
      interestMatch: number;
      timeOfDayFit: number;
      durationFit: number;
      budgetMatch: number;
      weatherFit: number;
      varietyBonus: number;
      ratingBonus: number;
      modeAdjustment: number;
      nightAdjustment?: number;
    }
  ): string {
    const reasons: string[] = [];

    // Top scoring factors
    if (scores.interestMatch >= this.weights.interestMatch * 0.8) {
      reasons.push("matches your interests");
    }

    if (scores.timeOfDayFit >= this.weights.timeOfDayFit * 0.8) {
      const timeOfDay = context.timeSlot
        ? this.getTimeOfDay(context.timeSlot.startTime)
        : "this time";
      reasons.push(`great for ${timeOfDay}`);
    }

    if (scores.weatherFit >= this.weights.weatherFit * 0.8) {
      if (!activity.isOutdoor && context.weather) {
        reasons.push("indoor option");
      } else if (activity.isOutdoor) {
        reasons.push("perfect weather for outdoor");
      }
    }

    if (scores.modeAdjustment > 15) {
      const mode = context.settings.tripMode;
      const modeLabel = mode.replace("-", " ");
      reasons.push(`ideal for ${modeLabel}`);
    }

    if (activity.rating && activity.rating >= 4.5) {
      reasons.push("highly rated");
    }

    if (activity.isFree) {
      reasons.push("free");
    }

    if (activity.familyFriendly && context.settings.tripMode === "family") {
      reasons.push("family-friendly");
    }

    if (scores.varietyBonus >= this.weights.varietyBonus * 0.8) {
      reasons.push("adds variety to your day");
    }

    if (context.isNightSlot && scores.nightAdjustment && scores.nightAdjustment > 10) {
      reasons.push("great evening option");
    }

    if (reasons.length === 0) {
      reasons.push("good fit for your trip");
    }

    return `Chosen because: ${reasons.slice(0, 3).join(", ")}`;
  }

  // ============================================
  // WARNING GENERATOR
  // ============================================

  private generateWarnings(
    activity: CoreActivity | RestaurantActivity,
    context: ScoringContext
  ): string[] {
    const warnings: string[] = [];

    // Booking warning
    if (activity.requiresBooking) {
      warnings.push("Requires advance booking");
    }

    // Weather warning
    if (
      activity.isOutdoor &&
      context.weather &&
      this.isBadWeather(context.weather.condition, context.weather.precipitationProbability)
    ) {
      warnings.push("Outdoor activity - check weather");
    }

    // Confidence warning
    if (activity.confidence < 0.7) {
      warnings.push("Limited information available - verify details");
    }

    // Last verified warning
    if (activity.lastVerified) {
      const daysSinceVerified = Math.floor(
        (Date.now() - activity.lastVerified.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysSinceVerified > 30) {
        warnings.push(`Last verified ${daysSinceVerified} days ago`);
      }
    }

    // Accessibility warning
    if (
      context.settings.accessibility.wheelchairAccessible &&
      !activity.accessibilityInfo?.wheelchairAccessible
    ) {
      warnings.push("Wheelchair accessibility unconfirmed");
    }

    return warnings;
  }
}

// ============================================
// FACTORY & UTILITIES
// ============================================

/**
 * Create a scoring engine with user's custom weights
 */
export function createScoringEngine(
  settings?: Partial<UserExperienceSettings>
): ActivityScoringEngine {
  return new ActivityScoringEngine(settings?.scoringWeights);
}

/**
 * Quick score an activity list with default settings
 */
export function quickScore(
  activities: (CoreActivity | RestaurantActivity)[],
  settings: UserExperienceSettings,
  context?: Partial<ScoringContext>
): ScoredActivity[] {
  const engine = createScoringEngine(settings);
  return engine.scoreActivities(activities, {
    settings,
    ...context,
  });
}

/**
 * Get the best activity for a specific slot
 */
export function getBestForSlot(
  activities: (CoreActivity | RestaurantActivity)[],
  settings: UserExperienceSettings,
  timeSlot: { startTime: string; endTime: string },
  options?: {
    weather?: WeatherForecast;
    previousActivities?: (CoreActivity | RestaurantActivity)[];
    isNightSlot?: boolean;
  }
): ScoredActivity | null {
  const engine = createScoringEngine(settings);
  const scored = engine.getTopActivities(
    activities,
    {
      settings,
      timeSlot,
      ...options,
    },
    1
  );
  return scored[0] || null;
}

/**
 * Filter and score restaurants based on meal type and dietary requirements
 */
export function scoreRestaurants(
  restaurants: RestaurantActivity[],
  settings: UserExperienceSettings,
  mealType: "breakfast" | "brunch" | "lunch" | "dinner",
  context?: Partial<ScoringContext>
): ScoredActivity[] {
  // Filter by meal type first
  const relevantRestaurants = restaurants.filter((r) => r.mealType.includes(mealType));

  const engine = createScoringEngine(settings);
  return engine.scoreActivities(relevantRestaurants, {
    settings,
    ...context,
  });
}

// ============================================
// EXPORTS
// ============================================

export default ActivityScoringEngine;
