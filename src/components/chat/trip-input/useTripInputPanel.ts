"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import type { TripInput, FlightAnchor, HotelAnchor, ActivityAnchor, BudgetTier, DerivedTripStructure } from "@/types/trip-input";
import {
  createEmptyTripInput,
  createEmptyFlightAnchor,
  createEmptyHotelAnchor,
  createEmptyActivityAnchor,
} from "@/types/trip-input";
import { inferTripStructure } from "@/lib/transfer-inference";
import { validateAnchorsClient } from "@/lib/anchor-validation";
import type {
  ParseState,
  UserClarifications,
  AISuggestions,
  ItineraryState,
  ValidationState,
  ButtonState,
} from "./types";
import {
  getMissingClarifications,
  canGenerateItineraryCheck,
  getStartDateError,
  createDefaultUserClarifications,
  convertToItineraryRequest,
} from "./utils";

export function useTripInputPanel() {
  // Trip input state
  const [tripInput, setTripInput] = useState<TripInput>(createEmptyTripInput());
  const [showAnchors, setShowAnchors] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Must have / must avoid input state
  const [mustHaveInput, setMustHaveInput] = useState("");
  const [mustAvoidInput, setMustAvoidInput] = useState("");

  // AI Parsing state
  const [parseState, setParseState] = useState<ParseState>({
    isParsing: false,
    parsed: null,
    error: null,
    timing: null,
  });
  const [showParseResults, setShowParseResults] = useState(false);

  // User clarifications state
  const [userClarifications, setUserClarifications] = useState<UserClarifications>(
    createDefaultUserClarifications()
  );

  // AI suggestions state
  const [aiSuggestions, setAiSuggestions] = useState<AISuggestions | null>(null);

  // Itinerary generation state
  const [itineraryState, setItineraryState] = useState<ItineraryState>({
    isGenerating: false,
    generated: false,
    error: null,
  });

  // Anchor validation state
  const [validationState, setValidationState] = useState<ValidationState>({
    isValidating: false,
    clientIssues: [],
    semanticResult: null,
    lastValidated: null,
  });

  // Derived trip structure state (async)
  const [derivedStructure, setDerivedStructure] = useState<DerivedTripStructure | null>(null);
  const [isInferringStructure, setIsInferringStructure] = useState(false);

  // Effect to infer trip structure when flights/hotels change
  useEffect(() => {
    if (tripInput.flights.length === 0 && tripInput.hotels.length === 0) {
      setDerivedStructure(null);
      return;
    }

    let cancelled = false;
    setIsInferringStructure(true);

    inferTripStructure(
      tripInput.flights,
      tripInput.hotels,
      tripInput.transfers
    ).then((structure) => {
      if (!cancelled) {
        setDerivedStructure(structure);
        setIsInferringStructure(false);
      }
    }).catch((error) => {
      console.error('[useTripInputPanel] Error inferring trip structure:', error);
      if (!cancelled) {
        setIsInferringStructure(false);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [tripInput.flights, tripInput.hotels, tripInput.transfers]);

  // Calculated values
  const missingFields = useMemo(() => {
    if (!parseState.parsed) return [];
    return getMissingClarifications(parseState.parsed);
  }, [parseState.parsed]);

  const canGenerateItinerary = useMemo(() => {
    return canGenerateItineraryCheck(parseState.parsed, userClarifications);
  }, [parseState.parsed, userClarifications]);

  const hasAnchors =
    tripInput.flights.length > 0 ||
    tripInput.hotels.length > 0 ||
    tripInput.activities.length > 0;

  const canStartPlanning = tripInput.prompt.trim().length > 0 || hasAnchors;

  const hasValidationErrors =
    validationState.clientIssues.some((i) => i.severity === "error") ||
    (validationState.semanticResult?.errors?.length ?? 0) > 0;

  const hasValidationWarnings =
    validationState.clientIssues.some((i) => i.severity === "warning") ||
    (validationState.semanticResult?.warnings?.length ?? 0) > 0;

  const startDateError = useMemo(() => {
    return getStartDateError(parseState.parsed, userClarifications);
  }, [parseState.parsed, userClarifications]);

  // Handlers
  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setTripInput((prev) => ({ ...prev, prompt: e.target.value }));
    },
    []
  );

  const handleBudgetChange = useCallback((tier: BudgetTier) => {
    setTripInput((prev) => ({ ...prev, budgetTier: tier }));
  }, []);

  // Flight handlers
  const handleAddFlight = useCallback(() => {
    setTripInput((prev) => ({
      ...prev,
      flights: [...prev.flights, createEmptyFlightAnchor()],
    }));
    setShowAnchors(true);
  }, []);

  const handleUpdateFlight = useCallback((index: number, flight: FlightAnchor) => {
    setTripInput((prev) => ({
      ...prev,
      flights: prev.flights.map((f, i) => (i === index ? flight : f)),
    }));
  }, []);

  const handleRemoveFlight = useCallback((index: number) => {
    setTripInput((prev) => ({
      ...prev,
      flights: prev.flights.filter((_, i) => i !== index),
    }));
  }, []);

  // Hotel handlers
  const handleAddHotel = useCallback(() => {
    setTripInput((prev) => ({
      ...prev,
      hotels: [...prev.hotels, createEmptyHotelAnchor()],
    }));
    setShowAnchors(true);
  }, []);

  const handleUpdateHotel = useCallback((index: number, hotel: HotelAnchor) => {
    setTripInput((prev) => ({
      ...prev,
      hotels: prev.hotels.map((h, i) => (i === index ? hotel : h)),
    }));
  }, []);

  const handleRemoveHotel = useCallback((index: number) => {
    setTripInput((prev) => ({
      ...prev,
      hotels: prev.hotels.filter((_, i) => i !== index),
    }));
  }, []);

  // Activity handlers
  const handleAddActivity = useCallback(() => {
    setTripInput((prev) => ({
      ...prev,
      activities: [...prev.activities, createEmptyActivityAnchor()],
    }));
    setShowAnchors(true);
  }, []);

  const handleUpdateActivity = useCallback((index: number, activity: ActivityAnchor) => {
    setTripInput((prev) => ({
      ...prev,
      activities: prev.activities.map((a, i) => (i === index ? activity : a)),
    }));
  }, []);

  const handleRemoveActivity = useCallback((index: number) => {
    setTripInput((prev) => ({
      ...prev,
      activities: prev.activities.filter((_, i) => i !== index),
    }));
  }, []);

  // Must have/avoid handlers
  const handleAddMustHave = useCallback(() => {
    if (mustHaveInput.trim()) {
      setTripInput((prev) => ({
        ...prev,
        mustHave: [...(prev.mustHave || []), mustHaveInput.trim()],
      }));
      setMustHaveInput("");
    }
  }, [mustHaveInput]);

  const handleRemoveMustHave = useCallback((index: number) => {
    setTripInput((prev) => ({
      ...prev,
      mustHave: prev.mustHave?.filter((_, i) => i !== index),
    }));
  }, []);

  const handleAddMustAvoid = useCallback(() => {
    if (mustAvoidInput.trim()) {
      setTripInput((prev) => ({
        ...prev,
        mustAvoid: [...(prev.mustAvoid || []), mustAvoidInput.trim()],
      }));
      setMustAvoidInput("");
    }
  }, [mustAvoidInput]);

  const handleRemoveMustAvoid = useCallback((index: number) => {
    setTripInput((prev) => ({
      ...prev,
      mustAvoid: prev.mustAvoid?.filter((_, i) => i !== index),
    }));
  }, []);

  // AI Parsing
  const handleParseWithAI = useCallback(async () => {
    if (!tripInput.prompt.trim()) return;

    setParseState({
      isParsing: true,
      parsed: null,
      error: null,
      timing: null,
    });
    setShowParseResults(true);

    try {
      const response = await fetch("/api/trip-input/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: tripInput.prompt,
          quickValidate: true,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to parse input");
      }

      const { parsed } = data.data;

      // Update trip input with parsed data
      setTripInput((prev) => ({
        ...prev,
        ...parsed.tripInput,
        prompt: prev.prompt,
      }));

      // Show anchors section if we extracted any
      if (
        parsed.tripInput.flights.length > 0 ||
        parsed.tripInput.hotels.length > 0 ||
        parsed.tripInput.activities.length > 0 ||
        (parsed.tripInput.mustHave && parsed.tripInput.mustHave.length > 0) ||
        (parsed.tripInput.mustAvoid && parsed.tripInput.mustAvoid.length > 0)
      ) {
        setShowAnchors(true);

        if (
          (parsed.tripInput.mustHave && parsed.tripInput.mustHave.length > 0) ||
          (parsed.tripInput.mustAvoid && parsed.tripInput.mustAvoid.length > 0)
        ) {
          setShowAdvanced(true);
        }
      }

      setParseState({
        isParsing: false,
        parsed,
        error: null,
        timing: data.timing,
      });

      // Build AI suggestions
      const suggestions: AISuggestions = {
        daysPerCity: {},
        startDate: "",
        endDate: "",
        totalDays: 0,
        pace: "moderate",
      };

      const dates = parsed.extractedEntities?.dates;
      if (dates?.start) suggestions.startDate = dates.start;
      if (dates?.end) suggestions.endDate = dates.end;

      if (dates?.duration) {
        const durationMatch = dates.duration.match(/(\d+)\s*(week|day)/i);
        if (durationMatch) {
          const num = parseInt(durationMatch[1]);
          const unit = durationMatch[2].toLowerCase();
          suggestions.totalDays = unit.startsWith("week") ? num * 7 : num;
        }
      } else if (dates?.start && dates?.end) {
        const start = new Date(dates.start);
        const end = new Date(dates.end);
        suggestions.totalDays = Math.ceil(
          (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
        );
      }

      if (parsed.intent?.pace) {
        suggestions.pace = parsed.intent.pace as "relaxed" | "moderate" | "packed";
      }

      const destinations = parsed.extractedEntities?.destinations || [];
      if (destinations.length > 0 && suggestions.totalDays > 0) {
        const daysEach = Math.floor(suggestions.totalDays / destinations.length);
        const remainder = suggestions.totalDays % destinations.length;
        destinations.forEach((city: string, i: number) => {
          suggestions.daysPerCity[city] = daysEach + (i < remainder ? 1 : 0);
        });
      }

      setAiSuggestions(suggestions);

      setUserClarifications((prev) => ({
        ...prev,
        startDate: suggestions.startDate || prev.startDate,
        endDate: suggestions.endDate || prev.endDate,
        totalDays: suggestions.totalDays || prev.totalDays,
        pace: suggestions.pace || prev.pace,
        daysPerCity:
          Object.keys(suggestions.daysPerCity).length > 0
            ? suggestions.daysPerCity
            : prev.daysPerCity,
        confirmedFields: new Set<string>(),
      }));

      // Dispatch event for debug panel
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("tripInputParsed", {
            detail: { parsed, timing: data.timing },
          })
        );
      }
    } catch (error) {
      console.error("[TripInputPanel] Parse error:", error);
      setParseState({
        isParsing: false,
        parsed: null,
        error: error instanceof Error ? error.message : "Failed to parse input",
        timing: null,
      });
    }
  }, [tripInput.prompt]);

  const handleClearParseResults = useCallback(() => {
    setShowParseResults(false);
    setParseState({
      isParsing: false,
      parsed: null,
      error: null,
      timing: null,
    });
  }, []);

  // Validation
  const handleValidateAnchors = useCallback(async () => {
    const { flights, hotels, activities } = tripInput;

    if (flights.length === 0 && hotels.length === 0 && activities.length === 0) {
      return;
    }

    const clientResult = validateAnchorsClient(flights, hotels, activities);

    setValidationState({
      isValidating: true,
      clientIssues: clientResult.issues,
      semanticResult: null,
      lastValidated: null,
    });

    try {
      const response = await fetch("/api/anchors/validate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          flights,
          hotels,
          activities,
          tripPrompt: tripInput.prompt,
          includeLLMValidation: true,
        }),
      });

      const data = await response.json();

      if (data.success) {
        setValidationState({
          isValidating: false,
          clientIssues: clientResult.issues,
          semanticResult: data.semanticValidation || null,
          lastValidated: new Date(),
        });
      } else {
        setValidationState({
          isValidating: false,
          clientIssues: clientResult.issues,
          semanticResult: null,
          lastValidated: new Date(),
        });
      }
    } catch (error) {
      console.error("[TripInputPanel] Validation API error:", error);
      setValidationState({
        isValidating: false,
        clientIssues: clientResult.issues,
        semanticResult: null,
        lastValidated: new Date(),
      });
    }
  }, [tripInput]);

  // Button state
  const getButtonState = useCallback(
    (isLoading: boolean): ButtonState => {
      if (itineraryState.isGenerating) {
        return { label: "Generating Itinerary...", disabled: true, icon: "loading" };
      }
      if (isLoading) {
        return { label: "Planning...", disabled: true, icon: "loading" };
      }
      if (!canStartPlanning) {
        return { label: "Start Planning", disabled: true, icon: "sparkles" };
      }
      if (startDateError) {
        return { label: startDateError, disabled: true, icon: "error" };
      }
      if (parseState.parsed && canGenerateItinerary) {
        return { label: "Generate Itinerary", disabled: false, icon: "sparkles" };
      }
      if (parseState.parsed && !canGenerateItinerary) {
        return { label: "Fill in missing info above", disabled: true, icon: "info" };
      }
      return { label: "Start Planning", disabled: false, icon: "sparkles" };
    },
    [itineraryState.isGenerating, canStartPlanning, startDateError, parseState.parsed, canGenerateItinerary]
  );

  return {
    // State
    tripInput,
    showAnchors,
    setShowAnchors,
    showAdvanced,
    setShowAdvanced,
    mustHaveInput,
    setMustHaveInput,
    mustAvoidInput,
    setMustAvoidInput,
    parseState,
    setParseState,
    showParseResults,
    setShowParseResults,
    userClarifications,
    setUserClarifications,
    aiSuggestions,
    itineraryState,
    setItineraryState,
    validationState,

    // Calculated
    missingFields,
    canGenerateItinerary,
    derivedStructure,
    hasAnchors,
    canStartPlanning,
    hasValidationErrors,
    hasValidationWarnings,
    startDateError,

    // Handlers
    handlePromptChange,
    handleBudgetChange,
    handleAddFlight,
    handleUpdateFlight,
    handleRemoveFlight,
    handleAddHotel,
    handleUpdateHotel,
    handleRemoveHotel,
    handleAddActivity,
    handleUpdateActivity,
    handleRemoveActivity,
    handleAddMustHave,
    handleRemoveMustHave,
    handleAddMustAvoid,
    handleRemoveMustAvoid,
    handleParseWithAI,
    handleClearParseResults,
    handleValidateAnchors,
    getButtonState,

    // Utils
    setTripInput,
    convertToItineraryRequest,
    inferTripStructure,
  };
}
