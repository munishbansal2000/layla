/**
 * useItineraryValidation Hook
 *
 * React hook for continuous itinerary validation.
 * Provides real-time validation state, suggestion filtering,
 * and user action validation with constraint violation flagging.
 */

import { useState, useCallback, useEffect, useMemo, useRef } from "react";
import type {
  StructuredItineraryData,
  ActivityOption,
  ItinerarySlotType,
} from "@/types/structured-itinerary";
import type { ConstraintViolation } from "@/types/itinerary-chat";
import {
  ItineraryValidationService,
  createValidationService,
  type ItineraryValidationState,
  type UserActionValidationResult,
  type SuggestionValidityResult,
} from "@/lib/itinerary-validation-service";

// ============================================
// TYPES
// ============================================

export interface UseItineraryValidationOptions {
  /** Enable automatic validation on itinerary changes */
  autoValidate?: boolean;
  /** Debounce delay for validation (ms) */
  debounceMs?: number;
}

export interface UseItineraryValidationReturn {
  // Current validation state
  validationState: ItineraryValidationState | null;
  isValidating: boolean;

  // Health summary
  healthScore: number;
  healthStatus: "excellent" | "good" | "fair" | "poor";
  healthSummary: string;
  topIssues: string[];

  // Actions
  validateNow: () => void;
  validateUserAction: (action: {
    type: string;
    sourceSlotId?: string;
    targetDayIndex?: number;
    targetSlotIndex?: number;
    activityName?: string;
  }) => UserActionValidationResult;

  // Suggestion filtering
  filterSuggestions: (
    suggestions: ActivityOption[],
    context: {
      targetDayIndex: number;
      targetSlotType: ItinerarySlotType;
      targetTimeRange?: { start: string; end: string };
    }
  ) => Array<ActivityOption & { validationWarnings?: string[] }>;
  checkSuggestionValidity: (
    suggestion: ActivityOption,
    context: {
      targetDayIndex: number;
      targetSlotType: ItinerarySlotType;
      targetTimeRange?: { start: string; end: string };
    }
  ) => SuggestionValidityResult;

  // Get violations for specific elements
  getSlotViolations: (slotId: string) => ConstraintViolation[];
  getDayViolations: (dayIndex: number) => ConstraintViolation[];
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

export function useItineraryValidation(
  itinerary: StructuredItineraryData | null,
  options: UseItineraryValidationOptions = {}
): UseItineraryValidationReturn {
  const { autoValidate = true, debounceMs = 100 } = options;

  // Create validation service instance with lazy initialization
  const validationServiceRef = useRef<ItineraryValidationService>(null!);
  if (!validationServiceRef.current) {
    validationServiceRef.current = createValidationService();
  }
  const validationService = validationServiceRef.current;

  // State
  const [validationState, setValidationState] = useState<ItineraryValidationState | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Debounce timer ref
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Request counter for race condition prevention
  const requestCounterRef = useRef(0);

  // Validate the itinerary
  const validateNow = useCallback(() => {
    if (!itinerary) {
      setValidationState(null);
      return;
    }

    setIsValidating(true);

    // Increment request counter to track this validation request
    const currentRequest = ++requestCounterRef.current;

    // Run validation (synchronous, but we add a microtask for UI responsiveness)
    queueMicrotask(() => {
      try {
        const state = validationService.validateItinerary(itinerary);

        // Only update state if this is still the latest request
        if (currentRequest === requestCounterRef.current) {
          setValidationState(state);
          setIsValidating(false);
        }
        // If not the latest request, discard result (newer validation in progress)
      } catch (error) {
        console.error("[useItineraryValidation] Validation failed:", error);
        // Only update loading state if this is still the latest request
        if (currentRequest === requestCounterRef.current) {
          setIsValidating(false);
        }
      }
    });
  }, [itinerary, validationService]);

  // Auto-validate on itinerary changes (debounced)
  useEffect(() => {
    if (!autoValidate || !itinerary) return;

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      validateNow();
    }, debounceMs);

    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [itinerary, autoValidate, debounceMs, validateNow]);

  // Validate user action
  const validateUserAction = useCallback(
    (action: {
      type: string;
      sourceSlotId?: string;
      targetDayIndex?: number;
      targetSlotIndex?: number;
      activityName?: string;
    }): UserActionValidationResult => {
      if (!itinerary) {
        return {
          allowed: true,
          hasViolations: false,
          violations: [],
          warnings: [],
          maxSeverity: null,
          autoFixSuggestions: [],
        };
      }

      return validationService.validateUserAction(itinerary, action);
    },
    [itinerary, validationService]
  );

  // Filter suggestions
  const filterSuggestions = useCallback(
    (
      suggestions: ActivityOption[],
      context: {
        targetDayIndex: number;
        targetSlotType: ItinerarySlotType;
        targetTimeRange?: { start: string; end: string };
      }
    ): Array<ActivityOption & { validationWarnings?: string[] }> => {
      if (!itinerary) {
        return suggestions.map((s) => ({ ...s, validationWarnings: undefined }));
      }

      return validationService.filterSuggestions(suggestions, {
        itinerary,
        ...context,
      });
    },
    [itinerary, validationService]
  );

  // Check single suggestion validity
  const checkSuggestionValidity = useCallback(
    (
      suggestion: ActivityOption,
      context: {
        targetDayIndex: number;
        targetSlotType: ItinerarySlotType;
        targetTimeRange?: { start: string; end: string };
      }
    ): SuggestionValidityResult => {
      if (!itinerary) {
        return { isValid: true, scoreAdjustment: 0, warnings: [] };
      }

      return validationService.checkSuggestionValidity(suggestion, {
        itinerary,
        ...context,
      });
    },
    [itinerary, validationService]
  );

  // Get slot violations
  const getSlotViolations = useCallback(
    (slotId: string): ConstraintViolation[] => {
      return validationService.getSlotViolations(slotId);
    },
    [validationService]
  );

  // Get day violations
  const getDayViolations = useCallback(
    (dayIndex: number): ConstraintViolation[] => {
      return validationService.getDayViolations(dayIndex);
    },
    [validationService]
  );

  // Compute health summary
  const healthSummary = useMemo(() => {
    if (!itinerary) {
      return {
        score: 100,
        status: "excellent" as const,
        summary: "No itinerary loaded",
        topIssues: [] as string[],
      };
    }

    return validationService.getHealthSummary(itinerary);
  }, [itinerary, validationService, validationState]); // eslint-disable-line react-hooks/exhaustive-deps

  return {
    // Current validation state
    validationState,
    isValidating,

    // Health summary
    healthScore: healthSummary.score,
    healthStatus: healthSummary.status,
    healthSummary: healthSummary.summary,
    topIssues: healthSummary.topIssues,

    // Actions
    validateNow,
    validateUserAction,

    // Suggestion filtering
    filterSuggestions,
    checkSuggestionValidity,

    // Get violations for specific elements
    getSlotViolations,
    getDayViolations,
  };
}

// ============================================
// UTILITY HOOKS
// ============================================

/**
 * Hook to get violations for a specific slot
 */
export function useSlotViolations(
  itinerary: StructuredItineraryData | null,
  slotId: string
): {
  violations: ConstraintViolation[];
  hasErrors: boolean;
  hasWarnings: boolean;
} {
  const { getSlotViolations, validationState } = useItineraryValidation(itinerary);

  const violations = useMemo(() => {
    if (!validationState) return [];
    return getSlotViolations(slotId);
  }, [validationState, slotId, getSlotViolations]);

  const hasErrors = violations.some((v) => v.severity === "error");
  const hasWarnings = violations.some((v) => v.severity === "warning");

  return { violations, hasErrors, hasWarnings };
}

/**
 * Hook to get violations for a specific day
 */
export function useDayViolations(
  itinerary: StructuredItineraryData | null,
  dayIndex: number
): {
  violations: ConstraintViolation[];
  hasErrors: boolean;
  hasWarnings: boolean;
} {
  const { getDayViolations, validationState } = useItineraryValidation(itinerary);

  const violations = useMemo(() => {
    if (!validationState) return [];
    return getDayViolations(dayIndex);
  }, [validationState, dayIndex, getDayViolations]);

  const hasErrors = violations.some((v) => v.severity === "error");
  const hasWarnings = violations.some((v) => v.severity === "warning");

  return { violations, hasErrors, hasWarnings };
}

/**
 * Hook to check if a user action would cause violations
 */
export function useActionValidation(
  itinerary: StructuredItineraryData | null
): (action: {
  type: string;
  sourceSlotId?: string;
  targetDayIndex?: number;
  targetSlotIndex?: number;
  activityName?: string;
}) => UserActionValidationResult {
  const { validateUserAction } = useItineraryValidation(itinerary, { autoValidate: false });
  return validateUserAction;
}
