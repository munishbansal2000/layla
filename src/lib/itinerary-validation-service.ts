/**
 * Itinerary Validation Service
 *
 * Provides continuous validation of itinerary state, ensuring:
 * 1. Continuous validation - Real-time constraint checking on every change
 * 2. Suggestion filtering - Never show invalid or illogical suggestions
 * 3. User action validation - Accept user actions but flag constraint violations
 */

import type {
  StructuredItineraryData,
  SlotWithOptions,
  DayWithOptions,
  ActivityOption,
  ItinerarySlotType,
} from "@/types/structured-itinerary";

import type {
  ConstraintViolation,
  ConstraintAnalysis,
  ConstraintSeverity,
} from "@/types/itinerary-chat";

import {
  ConstraintEngine,
  createConstraintEngine,
  parseTimeToMinutes,
  getSelectedActivity,
  haversineDistance,
} from "./constraint-engine";

// ============================================
// VALIDATION CONSTANTS
// ============================================

/**
 * Validation limits and thresholds
 * Extracted from magic numbers for maintainability
 */
export const VALIDATION_LIMITS = {
  /** Maximum recommended daily activity time in minutes (9 hours) */
  MAX_DAILY_ACTIVITIES_MINUTES: 540,
  /** Warning threshold for total activity time per day in minutes (10 hours) */
  MAX_DAILY_ACTIVITY_WARNING_MINUTES: 600,
  /** Allowed overflow beyond slot time in minutes */
  SLOT_OVERFLOW_TOLERANCE_MINUTES: 30,
  /** Maximum reasonable distance between activities in meters (30km) */
  MAX_REASONABLE_DISTANCE_METERS: 30000,
  /** Distance threshold for showing travel warnings in meters (10km) */
  TRAVEL_WARNING_DISTANCE_METERS: 10000,
  /** Maximum recommended daily travel time in minutes (3 hours) */
  MAX_TRAVEL_TIME_MINUTES: 180,
  /** Maximum number of activities before warning */
  MAX_ACTIVITIES_PER_DAY: 6,
} as const;

// ============================================
// TYPES
// ============================================

/**
 * Result of validating a user action
 */
export interface UserActionValidationResult {
  /** Whether the action is allowed (we always allow user actions) */
  allowed: true;
  /** Whether the action has constraint violations */
  hasViolations: boolean;
  /** The violations if any */
  violations: ConstraintViolation[];
  /** Human-readable warnings to show the user */
  warnings: string[];
  /** Severity level of the most severe violation */
  maxSeverity: ConstraintSeverity | null;
  /** Auto-fix suggestions */
  autoFixSuggestions: AutoFixSuggestion[];
}

/**
 * Suggestion validity check result
 */
export interface SuggestionValidityResult {
  /** Whether this suggestion is valid to show */
  isValid: boolean;
  /** If invalid, the reason why */
  invalidReason?: string;
  /** Score adjustment based on constraint compatibility */
  scoreAdjustment: number;
  /** Warnings that should be shown with this suggestion */
  warnings: string[];
}

/**
 * Auto-fix suggestion for constraint violations
 */
export interface AutoFixSuggestion {
  type: "move" | "resize" | "remove" | "swap" | "adjust_time";
  description: string;
  /** Intent to execute for the fix */
  fixAction: {
    type: string;
    params: Record<string, unknown>;
  };
}

/**
 * Continuous validation state
 */
export interface ItineraryValidationState {
  /** Whether the entire itinerary is valid */
  isValid: boolean;
  /** All current violations across the itinerary */
  violations: ConstraintViolation[];
  /** Violations grouped by day */
  violationsByDay: Map<number, ConstraintViolation[]>;
  /** Violations grouped by slot */
  violationsBySlot: Map<string, ConstraintViolation[]>;
  /** Overall health score (0-100) */
  healthScore: number;
  /** Timestamp of last validation */
  lastValidatedAt: Date;
}

/**
 * Logical constraint types for suggestions
 */
export type LogicalConstraintType =
  | "opening_hours"
  | "travel_time"
  | "duration_fit"
  | "meal_timing"
  | "duplicate_activity"
  | "category_overload"
  | "pacing"
  | "weather";

// ============================================
// ITINERARY VALIDATION SERVICE
// ============================================

export class ItineraryValidationService {
  private constraintEngine: ConstraintEngine;
  private validationState: ItineraryValidationState | null = null;

  constructor(constraintEngine?: ConstraintEngine) {
    this.constraintEngine = constraintEngine || createConstraintEngine();
  }

  // ============================================
  // CONTINUOUS VALIDATION
  // ============================================

  /**
   * Perform a full validation of the itinerary and cache the result
   * Call this whenever the itinerary changes
   */
  validateItinerary(itinerary: StructuredItineraryData): ItineraryValidationState {
    const analysis = this.constraintEngine.validateItinerary(itinerary);

    // Group violations by day
    const violationsByDay = new Map<number, ConstraintViolation[]>();
    const violationsBySlot = new Map<string, ConstraintViolation[]>();

    for (const violation of analysis.violations) {
      // Find the day for this violation
      if (violation.affectedSlotId) {
        for (let dayIndex = 0; dayIndex < itinerary.days.length; dayIndex++) {
          const day = itinerary.days[dayIndex];
          const slot = day.slots.find((s) => s.slotId === violation.affectedSlotId);
          if (slot) {
            // Add to day violations
            const dayViolations = violationsByDay.get(dayIndex) || [];
            dayViolations.push(violation);
            violationsByDay.set(dayIndex, dayViolations);

            // Add to slot violations
            const slotViolations = violationsBySlot.get(slot.slotId) || [];
            slotViolations.push(violation);
            violationsBySlot.set(slot.slotId, slotViolations);
            break;
          }
        }
      }
    }

    // Calculate health score
    const healthScore = this.calculateHealthScore(analysis);

    this.validationState = {
      isValid: analysis.feasible,
      violations: analysis.violations,
      violationsByDay,
      violationsBySlot,
      healthScore,
      lastValidatedAt: new Date(),
    };

    return this.validationState;
  }

  /**
   * Get the current validation state (or validate if not available)
   */
  getValidationState(itinerary: StructuredItineraryData): ItineraryValidationState {
    if (!this.validationState) {
      return this.validateItinerary(itinerary);
    }
    return this.validationState;
  }

  /**
   * Get violations for a specific slot
   */
  getSlotViolations(slotId: string): ConstraintViolation[] {
    return this.validationState?.violationsBySlot.get(slotId) || [];
  }

  /**
   * Get violations for a specific day
   */
  getDayViolations(dayIndex: number): ConstraintViolation[] {
    return this.validationState?.violationsByDay.get(dayIndex) || [];
  }

  // ============================================
  // USER ACTION VALIDATION
  // ============================================

  /**
   * Validate a user action before execution
   * User actions are ALWAYS allowed but may be flagged with warnings
   */
  validateUserAction(
    itinerary: StructuredItineraryData,
    action: {
      type: string;
      sourceSlotId?: string;
      targetDayIndex?: number;
      targetSlotIndex?: number;
      activityName?: string;
    }
  ): UserActionValidationResult {
    const violations: ConstraintViolation[] = [];
    const warnings: string[] = [];
    const autoFixSuggestions: AutoFixSuggestion[] = [];

    // Validate based on action type
    switch (action.type) {
      case "MOVE_ACTIVITY":
        this.validateMoveAction(itinerary, action, violations, warnings, autoFixSuggestions);
        break;

      case "SWAP_ACTIVITIES":
        this.validateSwapAction(itinerary, action, violations, warnings, autoFixSuggestions);
        break;

      case "ADD_ACTIVITY":
        this.validateAddAction(itinerary, action, violations, warnings, autoFixSuggestions);
        break;

      case "REMOVE_ACTIVITY":
        this.validateRemoveAction(itinerary, action, violations, warnings, autoFixSuggestions);
        break;

      case "CHANGE_TIME":
        this.validateTimeChangeAction(itinerary, action, violations, warnings, autoFixSuggestions);
        break;

      default:
        // For other actions, run general validation
        break;
    }

    // Simulate the action and check constraints
    if (violations.length === 0) {
      // Run general constraint check
      const analysis = this.constraintEngine.validateItinerary(itinerary);
      violations.push(...analysis.violations.filter((v) => v.severity === "error"));
    }

    // Determine max severity
    let maxSeverity: ConstraintSeverity | null = null;
    for (const v of violations) {
      if (v.severity === "error") {
        maxSeverity = "error";
        break;
      } else if (v.severity === "warning" && maxSeverity !== "warning") {
        maxSeverity = "warning";
      } else if (v.severity === "info" && maxSeverity === null) {
        maxSeverity = "info";
      }
    }

    return {
      allowed: true, // User actions are always allowed
      hasViolations: violations.length > 0,
      violations,
      warnings,
      maxSeverity,
      autoFixSuggestions,
    };
  }

  private validateMoveAction(
    itinerary: StructuredItineraryData,
    action: { sourceSlotId?: string; targetDayIndex?: number; activityName?: string },
    violations: ConstraintViolation[],
    warnings: string[],
    _autoFixSuggestions: AutoFixSuggestion[]
  ): void {
    // Find source slot
    let sourceSlot: SlotWithOptions | null = null;
    let sourceDayIndex = -1;

    for (let i = 0; i < itinerary.days.length; i++) {
      const day = itinerary.days[i];
      const slot = day.slots.find((s) =>
        s.slotId === action.sourceSlotId ||
        getSelectedActivity(s)?.activity?.name?.toLowerCase() === action.activityName?.toLowerCase()
      );
      if (slot) {
        sourceSlot = slot;
        sourceDayIndex = i;
        break;
      }
    }

    if (!sourceSlot) return;

    const activity = getSelectedActivity(sourceSlot);
    const activityName = activity?.activity?.name || "Activity";

    // Check if slot is locked
    if (sourceSlot.isLocked) {
      violations.push({
        layer: "temporal",
        severity: "error",
        message: `"${activityName}" is locked and cannot be moved`,
        affectedSlotId: sourceSlot.slotId,
        resolution: "Unlock the activity first",
      });
      return;
    }

    // Check for timed tickets
    if (sourceSlot.fragility?.bookingRequired && sourceSlot.fragility.ticketType === "timed") {
      violations.push({
        layer: "fragility",
        severity: "warning",
        message: `"${activityName}" has a timed ticket - moving may require rebooking`,
        affectedSlotId: sourceSlot.slotId,
        resolution: "Check if your booking can be changed",
      });
      warnings.push(`⚠️ "${activityName}" has a timed ticket. You may need to rebook.`);
    }

    // Check if moving to different city
    if (action.targetDayIndex !== undefined && action.targetDayIndex !== sourceDayIndex) {
      const targetDay = itinerary.days[action.targetDayIndex];
      const sourceDay = itinerary.days[sourceDayIndex];

      if (targetDay && sourceDay && targetDay.city !== sourceDay.city) {
        violations.push({
          layer: "cross-day",
          severity: "warning",
          message: `Moving "${activityName}" to ${targetDay.city} (from ${sourceDay.city})`,
          affectedSlotId: sourceSlot.slotId,
          resolution: "This activity may not be accessible from the new city",
        });
        warnings.push(`⚠️ "${activityName}" is in ${sourceDay.city} but you're moving it to a ${targetDay.city} day.`);
      }
    }

    // Check dependencies
    if (sourceSlot.dependencies && sourceSlot.dependencies.length > 0) {
      warnings.push(`⚠️ "${activityName}" has dependencies on other activities that may be affected.`);
    }
  }

  private validateSwapAction(
    itinerary: StructuredItineraryData,
    action: { sourceSlotId?: string; activityName?: string },
    violations: ConstraintViolation[],
    _warnings: string[],
    _autoFixSuggestions: AutoFixSuggestion[]
  ): void {
    // For swaps, check if either slot is locked
    for (const day of itinerary.days) {
      for (const slot of day.slots) {
        if (slot.isLocked && (slot.slotId === action.sourceSlotId ||
            getSelectedActivity(slot)?.activity?.name?.toLowerCase() === action.activityName?.toLowerCase())) {
          violations.push({
            layer: "temporal",
            severity: "error",
            message: `"${getSelectedActivity(slot)?.activity?.name}" is locked`,
            affectedSlotId: slot.slotId,
          });
        }
      }
    }
  }

  private validateAddAction(
    itinerary: StructuredItineraryData,
    action: { targetDayIndex?: number },
    _violations: ConstraintViolation[],
    warnings: string[],
    _autoFixSuggestions: AutoFixSuggestion[]
  ): void {
    if (action.targetDayIndex !== undefined) {
      const day = itinerary.days[action.targetDayIndex];
      if (day) {
        // Check if day is overloaded
        let totalDuration = 0;
        for (const slot of day.slots) {
          const activity = getSelectedActivity(slot);
          if (activity?.activity?.duration) {
            totalDuration += activity.activity.duration;
          }
        }

        if (totalDuration > VALIDATION_LIMITS.MAX_DAILY_ACTIVITIES_MINUTES) {
          warnings.push(`⚠️ Day ${day.dayNumber} already has ${Math.round(totalDuration / 60)} hours of activities. Adding more may be exhausting.`);
        }

        if (day.slots.length >= VALIDATION_LIMITS.MAX_ACTIVITIES_PER_DAY) {
          warnings.push(`⚠️ Day ${day.dayNumber} already has ${day.slots.length} activities. Consider spreading activities across days.`);
        }
      }
    }
  }

  private validateRemoveAction(
    itinerary: StructuredItineraryData,
    action: { sourceSlotId?: string; activityName?: string },
    violations: ConstraintViolation[],
    _warnings: string[],
    _autoFixSuggestions: AutoFixSuggestion[]
  ): void {
    // Check if slot is locked
    for (const day of itinerary.days) {
      for (const slot of day.slots) {
        if (slot.slotId === action.sourceSlotId ||
            getSelectedActivity(slot)?.activity?.name?.toLowerCase() === action.activityName?.toLowerCase()) {
          if (slot.isLocked) {
            violations.push({
              layer: "temporal",
              severity: "error",
              message: `"${getSelectedActivity(slot)?.activity?.name}" is locked and cannot be removed`,
              affectedSlotId: slot.slotId,
              resolution: "Unlock the activity first",
            });
          }
        }
      }
    }
  }

  private validateTimeChangeAction(
    itinerary: StructuredItineraryData,
    action: { sourceSlotId?: string; activityName?: string },
    violations: ConstraintViolation[],
    warnings: string[],
    _autoFixSuggestions: AutoFixSuggestion[]
  ): void {
    // Find the slot
    for (const day of itinerary.days) {
      for (const slot of day.slots) {
        if (slot.slotId === action.sourceSlotId ||
            getSelectedActivity(slot)?.activity?.name?.toLowerCase() === action.activityName?.toLowerCase()) {
          // Check for timed tickets
          if (slot.fragility?.bookingRequired && slot.fragility.ticketType === "timed") {
            violations.push({
              layer: "fragility",
              severity: "warning",
              message: `"${getSelectedActivity(slot)?.activity?.name}" has a timed ticket`,
              affectedSlotId: slot.slotId,
            });
            warnings.push(`⚠️ This activity has a timed ticket. Changing the time may require rebooking.`);
          }
        }
      }
    }
  }

  // ============================================
  // SUGGESTION FILTERING
  // ============================================

  /**
   * Pre-computed lookup structure for efficient duplicate checking
   */
  private buildActivityLookup(itinerary: StructuredItineraryData): {
    existingNames: Map<string, number>;
    existingPlaceIds: Map<string, number>;
    categoryCounts: Map<number, Map<string, number>>;
    dayCoordinates: Map<number, Array<{ lat: number; lng: number; name: string }>>;
    dayDurations: Map<number, number>;
  } {
    const existingNames = new Map<string, number>();
    const existingPlaceIds = new Map<string, number>();
    const categoryCounts = new Map<number, Map<string, number>>();
    const dayCoordinates = new Map<number, Array<{ lat: number; lng: number; name: string }>>();
    const dayDurations = new Map<number, number>();

    for (let dayIndex = 0; dayIndex < itinerary.days.length; dayIndex++) {
      const day = itinerary.days[dayIndex];
      const dayCategoryMap = new Map<string, number>();
      const coords: Array<{ lat: number; lng: number; name: string }> = [];
      let totalDuration = 0;

      for (const slot of day.slots) {
        for (const option of slot.options) {
          if (option.activity?.name) {
            existingNames.set(option.activity.name.toLowerCase(), day.dayNumber);
          }
          if (option.activity?.place?.googlePlaceId) {
            existingPlaceIds.set(option.activity.place.googlePlaceId, day.dayNumber);
          }
          if (option.activity?.category) {
            const cat = option.activity.category.toLowerCase();
            dayCategoryMap.set(cat, (dayCategoryMap.get(cat) || 0) + 1);
          }
          if (option.activity?.place?.coordinates) {
            coords.push({
              lat: option.activity.place.coordinates.lat,
              lng: option.activity.place.coordinates.lng,
              name: option.activity.name || "Activity",
            });
          }
          if (option.activity?.duration) {
            totalDuration += option.activity.duration;
          }
        }
      }

      categoryCounts.set(dayIndex, dayCategoryMap);
      dayCoordinates.set(dayIndex, coords);
      dayDurations.set(dayIndex, totalDuration);
    }

    return { existingNames, existingPlaceIds, categoryCounts, dayCoordinates, dayDurations };
  }

  /**
   * Filter suggestions to remove invalid/illogical ones
   * Returns only valid suggestions with any necessary warnings
   */
  filterSuggestions(
    suggestions: ActivityOption[],
    context: {
      itinerary: StructuredItineraryData;
      targetDayIndex: number;
      targetSlotType: ItinerarySlotType;
      targetTimeRange?: { start: string; end: string };
    }
  ): Array<ActivityOption & { validationWarnings?: string[] }> {
    const validSuggestions: Array<ActivityOption & { validationWarnings?: string[] }> = [];

    // Pre-compute lookup structures once for all suggestions
    const lookup = this.buildActivityLookup(context.itinerary);

    for (const suggestion of suggestions) {
      const validity = this.checkSuggestionValidityWithLookup(suggestion, context, lookup);

      if (validity.isValid) {
        validSuggestions.push({
          ...suggestion,
          score: suggestion.score + validity.scoreAdjustment,
          validationWarnings: validity.warnings.length > 0 ? validity.warnings : undefined,
        });
      }
    }

    // Sort by adjusted score
    validSuggestions.sort((a, b) => b.score - a.score);

    return validSuggestions;
  }

  /**
   * Check if a single suggestion is valid for the given context
   */
  checkSuggestionValidity(
    suggestion: ActivityOption,
    context: {
      itinerary: StructuredItineraryData;
      targetDayIndex: number;
      targetSlotType: ItinerarySlotType;
      targetTimeRange?: { start: string; end: string };
    }
  ): SuggestionValidityResult {
    // Build lookup for single suggestion check (less efficient for bulk, but API compatible)
    const lookup = this.buildActivityLookup(context.itinerary);
    return this.checkSuggestionValidityWithLookup(suggestion, context, lookup);
  }

  /**
   * Internal: Check suggestion validity using pre-computed lookup
   */
  private checkSuggestionValidityWithLookup(
    suggestion: ActivityOption,
    context: {
      itinerary: StructuredItineraryData;
      targetDayIndex: number;
      targetSlotType: ItinerarySlotType;
      targetTimeRange?: { start: string; end: string };
    },
    lookup: {
      existingNames: Map<string, number>;
      existingPlaceIds: Map<string, number>;
      categoryCounts: Map<number, Map<string, number>>;
      dayCoordinates: Map<number, Array<{ lat: number; lng: number; name: string }>>;
      dayDurations: Map<number, number>;
    }
  ): SuggestionValidityResult {
    const warnings: string[] = [];
    let scoreAdjustment = 0;
    const activity = suggestion.activity;
    const day = context.itinerary.days[context.targetDayIndex];

    if (!day) {
      return { isValid: false, invalidReason: "Target day does not exist", scoreAdjustment: 0, warnings: [] };
    }

    // 1. Check for duplicate activities using pre-computed lookup (O(1) instead of O(n))
    const duplicateCheck = this.checkDuplicateActivityWithLookup(suggestion, lookup);
    if (!duplicateCheck.isValid) {
      return { isValid: false, invalidReason: duplicateCheck.reason, scoreAdjustment: 0, warnings: [] };
    }

    // 2. Check duration fits in slot
    if (context.targetTimeRange && activity.duration) {
      const slotDuration =
        parseTimeToMinutes(context.targetTimeRange.end) -
        parseTimeToMinutes(context.targetTimeRange.start);

      if (activity.duration > slotDuration + VALIDATION_LIMITS.SLOT_OVERFLOW_TOLERANCE_MINUTES) {
        return {
          isValid: false,
          invalidReason: `Activity duration (${activity.duration}min) exceeds available time (${slotDuration}min)`,
          scoreAdjustment: 0,
          warnings: [],
        };
      }

      if (activity.duration > slotDuration) {
        warnings.push(`This activity may run ${activity.duration - slotDuration} minutes over the slot time`);
        scoreAdjustment -= 10;
      }
    }

    // 3. Check meal timing logic
    const mealCheck = this.checkMealTimingLogic(suggestion, context.targetSlotType);
    if (!mealCheck.isValid) {
      return { isValid: false, invalidReason: mealCheck.reason, scoreAdjustment: 0, warnings: [] };
    }
    if (mealCheck.warning) {
      warnings.push(mealCheck.warning);
      scoreAdjustment -= 5;
    }

    // 4. Check category overload (too many similar activities in one day)
    const categoryCheck = this.checkCategoryOverload(suggestion, day);
    if (categoryCheck.warning) {
      warnings.push(categoryCheck.warning);
      scoreAdjustment -= categoryCheck.penalty;
    }

    // 5. Check geographic compatibility
    const geoCheck = this.checkGeographicCompatibility(suggestion, day);
    if (!geoCheck.isValid) {
      return { isValid: false, invalidReason: geoCheck.reason, scoreAdjustment: 0, warnings: [] };
    }
    if (geoCheck.warning) {
      warnings.push(geoCheck.warning);
      scoreAdjustment -= geoCheck.penalty || 5;
    }

    // 6. Check travel time feasibility
    const travelCheck = this.checkTravelFeasibility(suggestion, day);
    if (travelCheck.warning) {
      warnings.push(travelCheck.warning);
      scoreAdjustment -= travelCheck.penalty || 10;
    }

    // 7. Check pacing (if day is already packed)
    const pacingCheck = this.checkDayPacing(suggestion, day);
    if (pacingCheck.warning) {
      warnings.push(pacingCheck.warning);
      scoreAdjustment -= pacingCheck.penalty || 5;
    }

    return {
      isValid: true,
      scoreAdjustment,
      warnings,
    };
  }

  private _checkDuplicateActivity(
    suggestion: ActivityOption,
    itinerary: StructuredItineraryData
  ): { isValid: boolean; reason?: string } {
    const suggestionName = suggestion.activity.name.toLowerCase();
    const suggestionPlaceId = suggestion.activity.place?.googlePlaceId;

    for (const day of itinerary.days) {
      for (const slot of day.slots) {
        for (const option of slot.options) {
          // Check by name
          if (option.activity?.name?.toLowerCase() === suggestionName) {
            return {
              isValid: false,
              reason: `"${suggestion.activity.name}" is already in the itinerary on Day ${day.dayNumber}`,
            };
          }
          // Check by place ID
          if (suggestionPlaceId && option.activity?.place?.googlePlaceId === suggestionPlaceId) {
            return {
              isValid: false,
              reason: `This location is already in the itinerary on Day ${day.dayNumber}`,
            };
          }
        }
      }
    }

    return { isValid: true };
  }

  /**
   * Optimized duplicate check using pre-computed lookup (O(1) vs O(n))
   */
  private checkDuplicateActivityWithLookup(
    suggestion: ActivityOption,
    lookup: {
      existingNames: Map<string, number>;
      existingPlaceIds: Map<string, number>;
    }
  ): { isValid: boolean; reason?: string } {
    const suggestionName = suggestion.activity.name?.toLowerCase();
    const suggestionPlaceId = suggestion.activity.place?.googlePlaceId;

    // Guard against undefined name matching undefined
    if (!suggestionName) {
      return { isValid: true };
    }

    // Check by name (O(1) lookup)
    if (suggestionName && lookup.existingNames.has(suggestionName)) {
      const dayNumber = lookup.existingNames.get(suggestionName);
      return {
        isValid: false,
        reason: `"${suggestion.activity.name}" is already in the itinerary on Day ${dayNumber}`,
      };
    }

    // Check by place ID (O(1) lookup)
    if (suggestionPlaceId && lookup.existingPlaceIds.has(suggestionPlaceId)) {
      const dayNumber = lookup.existingPlaceIds.get(suggestionPlaceId);
      return {
        isValid: false,
        reason: `This location is already in the itinerary on Day ${dayNumber}`,
      };
    }

    return { isValid: true };
  }

  private checkMealTimingLogic(
    suggestion: ActivityOption,
    slotType: ItinerarySlotType
  ): { isValid: boolean; reason?: string; warning?: string } {
    const category = suggestion.activity.category.toLowerCase();
    const isRestaurant = ["restaurant", "food", "cafe", "dining", "meal"].some((t) =>
      category.includes(t)
    );

    // Non-meal activities in meal slots are generally fine
    // But restaurants in non-meal slots might be odd
    const isMealSlot = ["breakfast", "lunch", "dinner"].includes(slotType);

    if (isRestaurant && !isMealSlot) {
      // Restaurants in morning/afternoon/evening slots
      if (slotType === "morning" || slotType === "afternoon") {
        return {
          isValid: true,
          warning: "This restaurant is being added to a non-meal time slot",
        };
      }
    }

    // Check if we're suggesting breakfast food for dinner, etc.
    const suggestionTags = suggestion.activity.tags.map((t) => t.toLowerCase());
    const isBreakfastFood = suggestionTags.some((t) => t.includes("breakfast"));
    const isDinnerFood = suggestionTags.some((t) => t.includes("dinner") || t.includes("izakaya") || t.includes("bar"));

    if (isBreakfastFood && slotType === "dinner") {
      return {
        isValid: true,
        warning: "This is typically a breakfast spot",
      };
    }

    if (isDinnerFood && slotType === "breakfast") {
      return {
        isValid: false,
        reason: "This is a dinner venue and may not be open for breakfast",
      };
    }

    return { isValid: true };
  }

  private checkCategoryOverload(
    suggestion: ActivityOption,
    day: DayWithOptions
  ): { warning?: string; penalty: number } {
    const category = suggestion.activity.category.toLowerCase();
    let sameCount = 0;

    for (const slot of day.slots) {
      const activity = getSelectedActivity(slot);
      if (activity?.activity?.category?.toLowerCase() === category) {
        sameCount++;
      }
    }

    if (sameCount >= 2) {
      return {
        warning: `Day ${day.dayNumber} already has ${sameCount} ${category} activities`,
        penalty: sameCount * 5,
      };
    }

    return { penalty: 0 };
  }

  private checkGeographicCompatibility(
    suggestion: ActivityOption,
    day: DayWithOptions
  ): { isValid: boolean; reason?: string; warning?: string; penalty?: number } {
    const suggestionCoords = suggestion.activity.place?.coordinates;
    if (!suggestionCoords) {
      return { isValid: true };
    }

    // Get coordinates of existing activities in the day
    const dayCoords: Array<{ lat: number; lng: number; name: string }> = [];
    for (const slot of day.slots) {
      const activity = getSelectedActivity(slot);
      const coords = activity?.activity?.place?.coordinates;
      if (coords) {
        dayCoords.push({
          lat: coords.lat,
          lng: coords.lng,
          name: activity.activity?.name || "Activity",
        });
      }
    }

    if (dayCoords.length === 0) {
      return { isValid: true };
    }

    // Check if suggestion is too far from all activities (> 30km)
    const MAX_REASONABLE_DISTANCE = 30000; // 30km
    let minDistance = Infinity;
    let closestActivity = "";

    for (const coords of dayCoords) {
      const distance = haversineDistance(
        suggestionCoords.lat,
        suggestionCoords.lng,
        coords.lat,
        coords.lng
      );
      if (distance < minDistance) {
        minDistance = distance;
        closestActivity = coords.name;
      }
    }

    if (minDistance > MAX_REASONABLE_DISTANCE) {
      return {
        isValid: false,
        reason: `"${suggestion.activity.name}" is ${Math.round(minDistance / 1000)}km from the other activities on this day`,
      };
    }

    // Warn if it's more than 10km from any activity
    if (minDistance > 10000) {
      return {
        isValid: true,
        warning: `${Math.round(minDistance / 1000)}km from ${closestActivity}`,
        penalty: Math.round((minDistance - 10000) / 1000),
      };
    }

    return { isValid: true };
  }

  private checkTravelFeasibility(
    suggestion: ActivityOption,
    day: DayWithOptions
  ): { warning?: string; penalty?: number } {
    const suggestionCoords = suggestion.activity.place?.coordinates;
    if (!suggestionCoords) {
      return {};
    }

    // Estimate total travel time for the day with this addition
    let totalTravelTime = 0;
    const allCoords: Array<{ lat: number; lng: number }> = [];

    for (const slot of day.slots) {
      const activity = getSelectedActivity(slot);
      const coords = activity?.activity?.place?.coordinates;
      if (coords) {
        allCoords.push(coords);
      }
    }

    // Add the suggestion
    allCoords.push(suggestionCoords);

    // Estimate travel time between consecutive activities (assuming 20 min per 5km)
    for (let i = 1; i < allCoords.length; i++) {
      const distance = haversineDistance(
        allCoords[i - 1].lat,
        allCoords[i - 1].lng,
        allCoords[i].lat,
        allCoords[i].lng
      );
      totalTravelTime += Math.max(10, (distance / 5000) * 20); // At least 10 min, 20 min per 5km
    }

    if (totalTravelTime > VALIDATION_LIMITS.MAX_TRAVEL_TIME_MINUTES) {
      return {
        warning: `Adding this may result in ~${Math.round(totalTravelTime / 60)} hours of travel time for the day`,
        penalty: Math.round((totalTravelTime - VALIDATION_LIMITS.MAX_TRAVEL_TIME_MINUTES) / 10),
      };
    }

    return {};
  }

  private checkDayPacing(
    suggestion: ActivityOption,
    day: DayWithOptions
  ): { warning?: string; penalty?: number } {
    let totalDuration = 0;

    for (const slot of day.slots) {
      const activity = getSelectedActivity(slot);
      if (activity?.activity?.duration) {
        totalDuration += activity.activity.duration;
      }
    }

    // Add suggested activity duration
    if (suggestion.activity.duration) {
      totalDuration += suggestion.activity.duration;
    }

    if (totalDuration > VALIDATION_LIMITS.MAX_DAILY_ACTIVITY_WARNING_MINUTES) {
      return {
        warning: `This would make Day ${day.dayNumber} have ${Math.round(totalDuration / 60)} hours of activities`,
        penalty: Math.round((totalDuration - VALIDATION_LIMITS.MAX_DAILY_ACTIVITY_WARNING_MINUTES) / 30),
      };
    }

    return {};
  }

  // ============================================
  // UTILITY METHODS
  // ============================================

  private calculateHealthScore(analysis: ConstraintAnalysis): number {
    let score = 100;

    for (const violation of analysis.violations) {
      switch (violation.severity) {
        case "error":
          score -= 15;
          break;
        case "warning":
          score -= 5;
          break;
        case "info":
          score -= 1;
          break;
      }
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Get a human-readable summary of the current itinerary health
   */
  getHealthSummary(itinerary: StructuredItineraryData): {
    score: number;
    status: "excellent" | "good" | "fair" | "poor";
    summary: string;
    topIssues: string[];
  } {
    const state = this.validateItinerary(itinerary);

    let status: "excellent" | "good" | "fair" | "poor";
    if (state.healthScore >= 90) {
      status = "excellent";
    } else if (state.healthScore >= 70) {
      status = "good";
    } else if (state.healthScore >= 50) {
      status = "fair";
    } else {
      status = "poor";
    }

    const errorCount = state.violations.filter((v) => v.severity === "error").length;
    const warningCount = state.violations.filter((v) => v.severity === "warning").length;

    let summary: string;
    if (errorCount === 0 && warningCount === 0) {
      summary = "Your itinerary looks great!";
    } else if (errorCount === 0) {
      summary = `${warningCount} minor issue${warningCount > 1 ? "s" : ""} to consider`;
    } else {
      summary = `${errorCount} issue${errorCount > 1 ? "s" : ""} that may need attention`;
    }

    const topIssues = state.violations
      .filter((v) => v.severity === "error" || v.severity === "warning")
      .slice(0, 3)
      .map((v) => v.message);

    return {
      score: state.healthScore,
      status,
      summary,
      topIssues,
    };
  }

  /**
   * Clear the cached validation state (call when itinerary changes)
   */
  invalidateCache(): void {
    this.validationState = null;
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let validationServiceInstance: ItineraryValidationService | null = null;

export function getValidationService(): ItineraryValidationService {
  if (!validationServiceInstance) {
    validationServiceInstance = new ItineraryValidationService();
  }
  return validationServiceInstance;
}

export function createValidationService(constraintEngine?: ConstraintEngine): ItineraryValidationService {
  return new ItineraryValidationService(constraintEngine);
}
