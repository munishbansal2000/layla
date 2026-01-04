"use client";

/**
 * TripInputPanel Component
 *
 * A minimal, conversational input interface for starting trip planning.
 * Simple by default with one text field + optional anchors (flights/hotels).
 * Uses progressive disclosure to avoid overwhelming users.
 *
 * Features:
 * - Natural language parsing via AI (Ollama)
 * - Automatic extraction of flights, hotels, activities
 * - Spelling corrections and conflict detection
 */

import { useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plane,
  Building2,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  MapPin,
  Calendar,
  Users,
  DollarSign,
  Wand2,
  Loader2,
  Info,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { TripInput } from "@/types/trip-input";
import { inferTripStructure } from "@/lib/transfer-inference";

// Import from trip-input module
import {
  type TripInputPanelProps,
  BudgetSelector,
  FlightAnchorInput,
  HotelAnchorInput,
  ActivityAnchorInput,
  TripTimelinePreview,
  useTripInputPanel,
  convertToItineraryRequest,
} from "./trip-input";

// ============================================
// MAIN COMPONENT
// ============================================

export function TripInputPanel({
  onStartPlanning,
  isLoading = false,
  className,
}: TripInputPanelProps) {
  const {
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
  } = useTripInputPanel();

  // Start planning handler
  const handleStartPlanning = useCallback(async () => {
    if (tripInput.prompt.trim() && !parseState.parsed) {
      // Auto-parse first
      setParseState({
        isParsing: true,
        parsed: null,
        error: null,
        timing: null,
      });
      setShowParseResults(true);

      try {
        const parseResponse = await fetch("/api/trip-input/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: tripInput.prompt,
            quickValidate: true,
          }),
        });

        const parseData = await parseResponse.json();

        if (!parseData.success) {
          throw new Error(parseData.error || "Failed to parse input");
        }

        const { parsed } = parseData.data;

        setTripInput((prev: TripInput) => ({
          ...prev,
          ...parsed.tripInput,
          prompt: prev.prompt,
        }));

        setParseState({
          isParsing: false,
          parsed,
          error: null,
          timing: parseData.timing,
        });

        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("tripInputParsed", {
              detail: { parsed, timing: parseData.timing },
            })
          );
        }

        const destinations = parsed.extractedEntities.destinations || [];
        const dates = parsed.extractedEntities.dates;
        const hasStartDate = dates?.start || userClarifications.startDate;
        const hasDuration =
          dates?.duration ||
          (dates?.start && dates?.end) ||
          userClarifications.totalDays > 0 ||
          Object.values(userClarifications.daysPerCity).some((d) => d > 0);

        if (destinations.length === 0 || !hasStartDate || !hasDuration) {
          if (
            parsed.tripInput.flights.length > 0 ||
            parsed.tripInput.hotels.length > 0 ||
            parsed.tripInput.activities.length > 0
          ) {
            setShowAnchors(true);
          }
          return;
        }

        const request = convertToItineraryRequest(parsed, userClarifications);
        if (request) {
          const structure = await inferTripStructure(
            tripInput.flights,
            tripInput.hotels,
            tripInput.transfers
          );
          onStartPlanning(tripInput, structure);
        }
      } catch (error) {
        console.error("[TripInputPanel] Auto-parse error:", error);
        setParseState({
          isParsing: false,
          parsed: null,
          error:
            error instanceof Error ? error.message : "Failed to parse input",
          timing: null,
        });
      }
      return;
    }

    if (parseState.parsed && canGenerateItinerary) {
      const request = convertToItineraryRequest(
        parseState.parsed,
        userClarifications
      );
      if (request) {
        const structure = await inferTripStructure(
          tripInput.flights,
          tripInput.hotels,
          tripInput.transfers
        );
        onStartPlanning(tripInput, structure);
        return;
      }
    }

    const structure = await inferTripStructure(
      tripInput.flights,
      tripInput.hotels,
      tripInput.transfers
    );
    onStartPlanning(tripInput, structure);
  }, [
    tripInput,
    onStartPlanning,
    parseState.parsed,
    canGenerateItinerary,
    userClarifications,
    setParseState,
    setShowParseResults,
    setTripInput,
    setShowAnchors,
  ]);

  const buttonState = getButtonState(isLoading);

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Main Input Area */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-xl mx-auto space-y-4">
          {/* Hero Text Area */}
          <div className="space-y-2">
            <textarea
              value={tripInput.prompt}
              onChange={handlePromptChange}
              placeholder="Plan a trip to Japan for 2 adults, March 15-25, love food & temples..."
              rows={3}
              className="w-full px-4 py-3 text-base rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
            />
          </div>

          {/* AI Parse Button */}
          {tripInput.prompt.trim().length > 5 && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleParseWithAI}
                disabled={parseState.isParsing}
                className="flex items-center gap-2 border-purple-400 text-purple-600 hover:bg-purple-50 dark:border-purple-500 dark:text-purple-400 dark:hover:bg-purple-900/20"
              >
                {parseState.isParsing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    Parse with AI
                  </>
                )}
              </Button>
              {parseState.parsed && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearParseResults}
                  className="text-gray-500"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          )}

          {/* AI Parse Results */}
          <AnimatePresence>
            {showParseResults &&
              (parseState.isParsing ||
                parseState.parsed ||
                parseState.error) && (
                <ParseResultsSection
                  parseState={parseState}
                  missingFields={missingFields}
                  userClarifications={userClarifications}
                  setUserClarifications={setUserClarifications}
                  canGenerateItinerary={canGenerateItinerary}
                />
              )}
          </AnimatePresence>

          {/* Quick Options Row */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Budget:</span>
              <BudgetSelector
                value={tripInput.budgetTier}
                onChange={handleBudgetChange}
              />
            </div>
          </div>

          {/* Add Anchors Button */}
          {!showAnchors && !hasAnchors && (
            <button
              onClick={() => setShowAnchors(true)}
              className="w-full py-3 px-4 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-gray-500 hover:border-purple-300 hover:text-purple-600 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add flights, hotels, or activities I already have booked
            </button>
          )}

          {/* Anchors Section */}
          <AnimatePresence>
            {(showAnchors || hasAnchors) && (
              <AnchorsSection
                tripInput={tripInput}
                hasAnchors={hasAnchors}
                setShowAnchors={setShowAnchors}
                handleAddFlight={handleAddFlight}
                handleUpdateFlight={handleUpdateFlight}
                handleRemoveFlight={handleRemoveFlight}
                handleAddHotel={handleAddHotel}
                handleUpdateHotel={handleUpdateHotel}
                handleRemoveHotel={handleRemoveHotel}
                handleAddActivity={handleAddActivity}
                handleUpdateActivity={handleUpdateActivity}
                handleRemoveActivity={handleRemoveActivity}
                handleValidateAnchors={handleValidateAnchors}
                validationState={validationState}
                hasValidationErrors={hasValidationErrors}
                hasValidationWarnings={hasValidationWarnings}
              />
            )}
          </AnimatePresence>

          {/* Derived Trip Structure Preview */}
          <AnimatePresence>
            {derivedStructure?.legs?.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="pt-4 border-t border-gray-200 dark:border-gray-700"
              >
                <TripTimelinePreview structure={derivedStructure} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Advanced Options */}
          <AdvancedOptionsSection
            showAdvanced={showAdvanced}
            setShowAdvanced={setShowAdvanced}
            tripInput={tripInput}
            mustHaveInput={mustHaveInput}
            setMustHaveInput={setMustHaveInput}
            mustAvoidInput={mustAvoidInput}
            setMustAvoidInput={setMustAvoidInput}
            handleAddMustHave={handleAddMustHave}
            handleRemoveMustHave={handleRemoveMustHave}
            handleAddMustAvoid={handleAddMustAvoid}
            handleRemoveMustAvoid={handleRemoveMustAvoid}
          />
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="max-w-xl mx-auto">
          <Button
            variant="primary"
            size="lg"
            onClick={handleStartPlanning}
            disabled={buttonState.disabled}
            className="w-full"
          >
            {buttonState.icon === "loading" ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                {buttonState.label}
              </span>
            ) : buttonState.icon === "info" ? (
              <span className="flex items-center gap-2">
                <Info className="w-5 h-5" />
                {buttonState.label}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                {buttonState.label}
              </span>
            )}
          </Button>

          {itineraryState.error && (
            <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {itineraryState.error}
            </div>
          )}

          {itineraryState.generated && (
            <div className="mt-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700 flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">
                  Itinerary generated!
                </span>
              </div>
              <a
                href="/test-ui/itinerary"
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors flex items-center gap-1"
              >
                View Itinerary
                <ChevronRight className="w-4 h-4" />
              </a>
            </div>
          )}

          {derivedStructure?.legs?.length > 0 && (
            <div className="mt-2 text-center text-xs text-gray-500">
              {derivedStructure.totalNights} nights •{" "}
              {derivedStructure.cities.join(" → ")}
              {derivedStructure.errors.length > 0 && (
                <span className="text-red-500 ml-2">
                  ({derivedStructure.errors.length} issue
                  {derivedStructure.errors.length > 1 ? "s" : ""} to resolve)
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// SUB-COMPONENTS
// ============================================

interface ParseResultsSectionProps {
  parseState: ReturnType<typeof useTripInputPanel>["parseState"];
  missingFields: string[];
  userClarifications: ReturnType<
    typeof useTripInputPanel
  >["userClarifications"];
  setUserClarifications: ReturnType<
    typeof useTripInputPanel
  >["setUserClarifications"];
  canGenerateItinerary: boolean;
}

function ParseResultsSection({
  parseState,
  missingFields,
  userClarifications,
  setUserClarifications,
  canGenerateItinerary,
}: ParseResultsSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="space-y-3"
    >
      {/* Parsing indicator */}
      {parseState.isParsing && (
        <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
          <div className="flex items-center gap-3">
            <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
            <div>
              <div className="font-medium text-purple-700 dark:text-purple-300">
                Analyzing your trip request...
              </div>
              <div className="text-sm text-purple-600/70 dark:text-purple-400/70">
                Extracting dates, destinations, bookings, and preferences
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error state */}
      {parseState.error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
            <AlertCircle className="w-5 h-5" />
            <span className="font-medium">Failed to parse input</span>
          </div>
          <p className="mt-1 text-sm text-red-600 dark:text-red-400">
            {parseState.error}
          </p>
          <p className="mt-2 text-xs text-red-500 dark:text-red-500">
            Make sure Ollama is running with the model available.
          </p>
        </div>
      )}

      {/* Success - Show parsed results */}
      {parseState.parsed && !parseState.isParsing && (
        <div className="space-y-3">
          {/* Parse summary card */}
          <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                <CheckCircle className="w-5 h-5" />
                <span className="font-medium">Parsed successfully!</span>
              </div>
              {parseState.timing && (
                <span className="text-xs text-green-600/70">
                  {(parseState.timing.parseMs / 1000).toFixed(1)}s
                </span>
              )}
            </div>

            {/* Confidence */}
            <div className="flex items-center gap-2 mb-3">
              <span className="text-xs text-gray-500">Confidence:</span>
              <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className={cn(
                    "h-full rounded-full transition-all",
                    parseState.parsed.confidence >= 0.8
                      ? "bg-green-500"
                      : parseState.parsed.confidence >= 0.5
                      ? "bg-yellow-500"
                      : "bg-red-500"
                  )}
                  style={{ width: `${parseState.parsed.confidence * 100}%` }}
                />
              </div>
              <span className="text-xs font-medium">
                {Math.round(parseState.parsed.confidence * 100)}%
              </span>
            </div>

            {/* Extracted summary */}
            <div className="grid grid-cols-2 gap-2 text-sm">
              {(parseState.parsed.extractedEntities.destinations?.length ?? 0) >
                0 && (
                <div className="flex items-center gap-1">
                  <MapPin className="w-3 h-3 text-gray-400" />
                  <span>
                    {parseState.parsed.extractedEntities.destinations?.join(
                      ", "
                    )}
                  </span>
                </div>
              )}
              {parseState.parsed.extractedEntities.travelers && (
                <div className="flex items-center gap-1">
                  <Users className="w-3 h-3 text-gray-400" />
                  <span>
                    {parseState.parsed.extractedEntities.travelers.adults || 0}{" "}
                    adults
                    {(parseState.parsed.extractedEntities.travelers.children ??
                      0) > 0 &&
                      `, ${parseState.parsed.extractedEntities.travelers.children} kids`}
                  </span>
                </div>
              )}
              {parseState.parsed.extractedEntities.dates && (
                <div className="flex items-center gap-1">
                  <Calendar className="w-3 h-3 text-gray-400" />
                  <span>
                    {parseState.parsed.extractedEntities.dates.duration ||
                      parseState.parsed.extractedEntities.dates.start}
                  </span>
                </div>
              )}
              {parseState.parsed.extractedEntities.budget && (
                <div className="flex items-center gap-1">
                  <DollarSign className="w-3 h-3 text-gray-400" />
                  <span className="capitalize">
                    {parseState.parsed.extractedEntities.budget}
                  </span>
                </div>
              )}
            </div>

            {/* Extracted anchors summary */}
            <div className="mt-2 flex flex-wrap gap-2">
              {parseState.parsed.tripInput.flights.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                  <Plane className="w-3 h-3" />
                  {parseState.parsed.tripInput.flights.length} flight
                  {parseState.parsed.tripInput.flights.length > 1 ? "s" : ""}
                </span>
              )}
              {parseState.parsed.tripInput.hotels.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                  <Building2 className="w-3 h-3" />
                  {parseState.parsed.tripInput.hotels.length} hotel
                  {parseState.parsed.tripInput.hotels.length > 1 ? "s" : ""}
                </span>
              )}
              {parseState.parsed.tripInput.activities.length > 0 && (
                <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                  🎭 {parseState.parsed.tripInput.activities.length} activit
                  {parseState.parsed.tripInput.activities.length > 1
                    ? "ies"
                    : "y"}
                </span>
              )}
            </div>
          </div>

          {/* Spelling corrections */}
          {parseState.parsed.spellingCorrections.length > 0 && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
              <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 text-sm font-medium mb-2">
                <Info className="w-4 h-4" />
                Spelling corrections applied
              </div>
              <div className="flex flex-wrap gap-2">
                {parseState.parsed.spellingCorrections.map((correction, i) => (
                  <span
                    key={i}
                    className="text-xs text-blue-600 dark:text-blue-400"
                  >
                    &quot;{correction.original}&quot; → &quot;
                    {correction.corrected}&quot;
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Intent extraction */}
          {parseState.parsed.intent && (
            <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Trip Intent Detected
              </div>
              <div className="flex flex-wrap gap-2 text-xs">
                <span className="px-2 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 capitalize">
                  {parseState.parsed.intent.tripType}
                </span>
                <span className="px-2 py-1 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 capitalize">
                  {parseState.parsed.intent.travelStyle}
                </span>
                <span className="px-2 py-1 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 capitalize">
                  {parseState.parsed.intent.pace} pace
                </span>
                {parseState.parsed.intent.goals?.map((goal, i) => (
                  <span
                    key={i}
                    className="px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                  >
                    {goal}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Conflicts / Warnings */}
          {parseState.parsed.conflicts.length > 0 && (
            <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
              <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-sm font-medium mb-2">
                <AlertTriangle className="w-4 h-4" />
                Issues detected ({parseState.parsed.conflicts.length})
              </div>
              <div className="space-y-2">
                {parseState.parsed.conflicts.map((conflict, i) => (
                  <div key={i} className="text-xs">
                    <div
                      className={cn(
                        "font-medium",
                        conflict.severity === "error"
                          ? "text-red-600"
                          : conflict.severity === "warning"
                          ? "text-amber-600"
                          : "text-blue-600"
                      )}
                    >
                      {conflict.message}
                    </div>
                    {conflict.suggestion && (
                      <div className="text-gray-500 mt-0.5">
                        💡 {conflict.suggestion}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Clarifications needed */}
          {parseState.parsed.clarifications.length > 0 && (
            <ClarificationsSection
              parsed={parseState.parsed}
              missingFields={missingFields}
              userClarifications={userClarifications}
              setUserClarifications={setUserClarifications}
            />
          )}

          {/* Generate Itinerary CTA */}
          {canGenerateItinerary && (
            <div className="p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-700">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-green-700 dark:text-green-300 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Ready to generate itinerary!
                  </div>
                  <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                    {parseState.parsed.extractedEntities.destinations?.join(
                      " → "
                    )}{" "}
                    •{" "}
                    {Object.values(userClarifications.daysPerCity).reduce(
                      (a, b) => a + b,
                      0
                    ) ||
                      userClarifications.totalDays ||
                      "auto"}{" "}
                    days • {userClarifications.pace} pace
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
}

interface ClarificationsSectionProps {
  parsed: NonNullable<
    ReturnType<typeof useTripInputPanel>["parseState"]["parsed"]
  >;
  missingFields: string[];
  userClarifications: ReturnType<
    typeof useTripInputPanel
  >["userClarifications"];
  setUserClarifications: ReturnType<
    typeof useTripInputPanel
  >["setUserClarifications"];
}

function ClarificationsSection({
  parsed,
  missingFields,
  userClarifications,
  setUserClarifications,
}: ClarificationsSectionProps) {
  return (
    <div className="p-3 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
      <div className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-3 flex items-center gap-2">
        <Info className="w-4 h-4" />
        Help us plan better:
      </div>

      {/* Days per city input */}
      {missingFields.includes("days_per_city") &&
        (parsed.extractedEntities.destinations?.length ?? 0) > 1 && (
          <div className="mb-4 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              How many days in each city?
            </div>
            <div className="grid gap-2">
              {parsed.extractedEntities.destinations?.map((city) => (
                <div key={city} className="flex items-center gap-3">
                  <span className="text-sm text-gray-600 dark:text-gray-400 w-24 flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {city}
                  </span>
                  <input
                    type="number"
                    min="1"
                    max="30"
                    value={userClarifications.daysPerCity[city] || ""}
                    onChange={(e) => {
                      const days = e.target.value
                        ? parseInt(e.target.value)
                        : 0;
                      setUserClarifications((prev) => ({
                        ...prev,
                        daysPerCity: { ...prev.daysPerCity, [city]: days },
                      }));
                    }}
                    placeholder="days"
                    className="w-20 px-2 py-1 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                  />
                  <span className="text-xs text-gray-400">days</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-gray-400">
              We&apos;ll suggest a breakdown based on attractions if left blank.
            </p>
          </div>
        )}

      {/* Start date input */}
      {missingFields.includes("start_date") && (
        <div className="mb-4 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            When does your trip start?
          </div>
          <input
            type="date"
            value={userClarifications.startDate}
            onChange={(e) =>
              setUserClarifications((prev) => ({
                ...prev,
                startDate: e.target.value,
              }))
            }
            className="px-3 py-2 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
          />
        </div>
      )}

      {/* Duration input */}
      {missingFields.includes("duration") && (
        <div className="mb-4 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            How many total days?
          </div>
          <div className="flex items-center gap-2">
            <input
              type="number"
              min="1"
              max="60"
              value={userClarifications.totalDays || ""}
              onChange={(e) =>
                setUserClarifications((prev) => ({
                  ...prev,
                  totalDays: e.target.value ? parseInt(e.target.value) : 0,
                }))
              }
              placeholder="e.g., 14"
              className="w-20 px-3 py-2 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
            />
            <span className="text-sm text-gray-500">days</span>
          </div>
        </div>
      )}

      {/* Pace selector */}
      <div className="mb-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
        <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          What&apos;s your preferred pace?
        </div>
        <div className="flex gap-2">
          {(["relaxed", "moderate", "packed"] as const).map((pace) => (
            <button
              key={pace}
              onClick={() =>
                setUserClarifications((prev) => ({ ...prev, pace }))
              }
              className={cn(
                "px-3 py-1.5 text-sm rounded-full transition-all capitalize",
                userClarifications.pace === pace
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
              )}
            >
              {pace === "relaxed" && "🐢 "}
              {pace === "moderate" && "🚶 "}
              {pace === "packed" && "🏃 "}
              {pace}
            </button>
          ))}
        </div>
      </div>

      {/* Other clarifications */}
      {parsed.clarifications.filter(
        (c) =>
          !c.toLowerCase().includes("time allocation") &&
          !c.toLowerCase().includes("days per city")
      ).length > 0 && (
        <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
          {parsed.clarifications
            .filter(
              (c) =>
                !c.toLowerCase().includes("time allocation") &&
                !c.toLowerCase().includes("days per city")
            )
            .map((item, i) => (
              <div key={i}>• {item}</div>
            ))}
        </div>
      )}
    </div>
  );
}

interface AnchorsSectionProps {
  tripInput: TripInput;
  hasAnchors: boolean;
  setShowAnchors: (show: boolean) => void;
  handleAddFlight: () => void;
  handleUpdateFlight: (index: number, flight: any) => void;
  handleRemoveFlight: (index: number) => void;
  handleAddHotel: () => void;
  handleUpdateHotel: (index: number, hotel: any) => void;
  handleRemoveHotel: (index: number) => void;
  handleAddActivity: () => void;
  handleUpdateActivity: (index: number, activity: any) => void;
  handleRemoveActivity: (index: number) => void;
  handleValidateAnchors: () => void;
  validationState: ReturnType<typeof useTripInputPanel>["validationState"];
  hasValidationErrors: boolean;
  hasValidationWarnings: boolean;
}

function AnchorsSection({
  tripInput,
  hasAnchors,
  setShowAnchors,
  handleAddFlight,
  handleUpdateFlight,
  handleRemoveFlight,
  handleAddHotel,
  handleUpdateHotel,
  handleRemoveHotel,
  handleAddActivity,
  handleUpdateActivity,
  handleRemoveActivity,
  handleValidateAnchors,
  validationState,
  hasValidationErrors,
  hasValidationWarnings,
}: AnchorsSectionProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="space-y-4"
    >
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
          My Bookings (Anchors)
        </h3>
        {!hasAnchors && (
          <button
            onClick={() => setShowAnchors(false)}
            className="text-xs text-gray-400 hover:text-gray-600"
          >
            Hide
          </button>
        )}
      </div>

      {/* Flights */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Plane className="w-4 h-4" />
          <span>Flights</span>
        </div>
        <AnimatePresence>
          {tripInput.flights.map((flight, index) => (
            <FlightAnchorInput
              key={flight.id}
              flight={flight}
              index={index}
              onChange={(f) => handleUpdateFlight(index, f)}
              onRemove={() => handleRemoveFlight(index)}
            />
          ))}
        </AnimatePresence>
        <button
          onClick={handleAddFlight}
          className="w-full py-2 px-3 rounded-lg border border-dashed border-blue-200 dark:border-blue-800 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center justify-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          Add flight
        </button>
      </div>

      {/* Hotels */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Building2 className="w-4 h-4" />
          <span>Hotels</span>
        </div>
        <AnimatePresence>
          {tripInput.hotels.map((hotel, index) => (
            <HotelAnchorInput
              key={hotel.id}
              hotel={hotel}
              index={index}
              onChange={(h) => handleUpdateHotel(index, h)}
              onRemove={() => handleRemoveHotel(index)}
            />
          ))}
        </AnimatePresence>
        <button
          onClick={handleAddHotel}
          className="w-full py-2 px-3 rounded-lg border border-dashed border-amber-200 dark:border-amber-800 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors flex items-center justify-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          Add hotel
        </button>
      </div>

      {/* Booked Activities */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <span className="text-base">🎭</span>
          <span>Booked Activities & Reservations</span>
        </div>
        <p className="text-xs text-gray-400">
          Tours, shows, restaurants, or any pre-booked experiences that must be
          scheduled at specific times.
        </p>
        <AnimatePresence>
          {tripInput.activities.map((activity, index) => (
            <ActivityAnchorInput
              key={activity.id}
              activity={activity}
              index={index}
              onChange={(a) => handleUpdateActivity(index, a)}
              onRemove={() => handleRemoveActivity(index)}
            />
          ))}
        </AnimatePresence>
        <button
          onClick={handleAddActivity}
          className="w-full py-2 px-3 rounded-lg border border-dashed border-purple-200 dark:border-purple-800 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors flex items-center justify-center gap-2 text-sm"
        >
          <Plus className="w-4 h-4" />
          Add booked activity
        </button>
      </div>

      {/* Validate Anchors Button */}
      {hasAnchors && (
        <ValidationSection
          validationState={validationState}
          handleValidateAnchors={handleValidateAnchors}
          hasValidationErrors={hasValidationErrors}
          hasValidationWarnings={hasValidationWarnings}
        />
      )}
    </motion.div>
  );
}

interface ValidationSectionProps {
  validationState: ReturnType<typeof useTripInputPanel>["validationState"];
  handleValidateAnchors: () => void;
  hasValidationErrors: boolean;
  hasValidationWarnings: boolean;
}

function ValidationSection({
  validationState,
  handleValidateAnchors,
  hasValidationErrors,
  hasValidationWarnings,
}: ValidationSectionProps) {
  return (
    <div className="pt-3 border-t border-gray-200 dark:border-gray-700">
      <Button
        variant="outline"
        size="sm"
        onClick={handleValidateAnchors}
        disabled={validationState.isValidating}
        className={cn(
          "w-full flex items-center justify-center gap-2",
          hasValidationErrors
            ? "border-red-400 text-red-600 hover:bg-red-50"
            : hasValidationWarnings
            ? "border-amber-400 text-amber-600 hover:bg-amber-50"
            : "border-purple-400 text-purple-600 hover:bg-purple-50"
        )}
      >
        {validationState.isValidating ? (
          <>
            <Loader2 className="w-4 h-4 animate-spin" />
            Validating with AI...
          </>
        ) : validationState.lastValidated ? (
          <>
            {hasValidationErrors ? (
              <AlertCircle className="w-4 h-4" />
            ) : hasValidationWarnings ? (
              <AlertTriangle className="w-4 h-4" />
            ) : (
              <CheckCircle className="w-4 h-4" />
            )}
            Re-validate Anchors
          </>
        ) : (
          <>
            <Wand2 className="w-4 h-4" />
            Validate Anchors with AI
          </>
        )}
      </Button>

      {/* Validation Results - simplified for brevity */}
      <AnimatePresence>
        {(validationState.clientIssues.length > 0 ||
          validationState.semanticResult) && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 space-y-2"
          >
            {validationState.clientIssues.map((issue) => (
              <div
                key={issue.id}
                className={cn(
                  "p-2 rounded-lg border",
                  issue.severity === "error"
                    ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                    : "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800"
                )}
              >
                <div className="flex items-start gap-2">
                  {issue.severity === "error" ? (
                    <AlertCircle className="w-4 h-4 text-red-500 mt-0.5 flex-shrink-0" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                  )}
                  <div className="text-sm">
                    <span
                      className={
                        issue.severity === "error"
                          ? "text-red-700 dark:text-red-300"
                          : "text-amber-700 dark:text-amber-300"
                      }
                    >
                      {issue.message}
                    </span>
                    {issue.suggestion && (
                      <p
                        className={cn(
                          "text-xs mt-0.5",
                          issue.severity === "error"
                            ? "text-red-500"
                            : "text-amber-500"
                        )}
                      >
                        💡 {issue.suggestion}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface AdvancedOptionsSectionProps {
  showAdvanced: boolean;
  setShowAdvanced: (show: boolean) => void;
  tripInput: TripInput;
  mustHaveInput: string;
  setMustHaveInput: (value: string) => void;
  mustAvoidInput: string;
  setMustAvoidInput: (value: string) => void;
  handleAddMustHave: () => void;
  handleRemoveMustHave: (index: number) => void;
  handleAddMustAvoid: () => void;
  handleRemoveMustAvoid: (index: number) => void;
}

function AdvancedOptionsSection({
  showAdvanced,
  setShowAdvanced,
  tripInput,
  mustHaveInput,
  setMustHaveInput,
  mustAvoidInput,
  setMustAvoidInput,
  handleAddMustHave,
  handleRemoveMustHave,
  handleAddMustAvoid,
  handleRemoveMustAvoid,
}: AdvancedOptionsSectionProps) {
  return (
    <div>
      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
      >
        {showAdvanced ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
        More options
      </button>

      <AnimatePresence>
        {showAdvanced && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 space-y-4"
          >
            {/* Travel Style */}
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-gray-500">Style:</span>
              {["Relaxed", "Balanced", "Packed"].map((style) => (
                <button
                  key={style}
                  className="px-3 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-purple-100 hover:text-purple-600"
                >
                  {style}
                </button>
              ))}
            </div>

            {/* Interests */}
            <div className="flex flex-wrap gap-2">
              <span className="text-sm text-gray-500">Interests:</span>
              {[
                "🍜 Food",
                "🏛️ Culture",
                "🌿 Nature",
                "🛍️ Shopping",
                "🌙 Nightlife",
              ].map((interest) => (
                <button
                  key={interest}
                  className="px-3 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-purple-100 hover:text-purple-600"
                >
                  {interest}
                </button>
              ))}
            </div>

            {/* Must Have Activities */}
            <div className="space-y-2">
              <label className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                Must-have activities / places
              </label>
              <div className="flex flex-wrap gap-2 min-h-[32px]">
                {tripInput.mustHave?.map((item, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                  >
                    {item}
                    <button
                      onClick={() => handleRemoveMustHave(index)}
                      className="ml-1 hover:text-green-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={mustHaveInput}
                  onChange={(e) => setMustHaveInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && mustHaveInput.trim()) {
                      e.preventDefault();
                      handleAddMustHave();
                    }
                  }}
                  placeholder="e.g., Fushimi Inari, teamLab, ramen"
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleAddMustHave}
                  disabled={!mustHaveInput.trim()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-gray-400">
                Press Enter or click + to add. These will be prioritized in your
                itinerary.
              </p>
            </div>

            {/* Must Avoid */}
            <div className="space-y-2">
              <label className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                <X className="w-4 h-4 text-red-500" />
                Things to skip / avoid
              </label>
              <div className="flex flex-wrap gap-2 min-h-[32px]">
                {tripInput.mustAvoid?.map((item, index) => (
                  <span
                    key={index}
                    className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                  >
                    {item}
                    <button
                      onClick={() => handleRemoveMustAvoid(index)}
                      className="ml-1 hover:text-red-900"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={mustAvoidInput}
                  onChange={(e) => setMustAvoidInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && mustAvoidInput.trim()) {
                      e.preventDefault();
                      handleAddMustAvoid();
                    }
                  }}
                  placeholder="e.g., raw fish, crowded tourist spots, long walks"
                  className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleAddMustAvoid}
                  disabled={!mustAvoidInput.trim()}
                >
                  <Plus className="w-4 h-4" />
                </Button>
              </div>
              <p className="text-xs text-gray-400">
                These will be excluded from suggestions. Can include foods,
                activities, or places.
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default TripInputPanel;
