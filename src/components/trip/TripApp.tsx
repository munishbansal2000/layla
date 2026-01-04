"use client";

/**
 * TripApp - Unified Trip Planning Experience
 *
 * A consolidated trip planning component that combines the best of:
 * - TripApp (phase-based flow, chat integration)
 * - TripPlannerPane (settings, swipe mode, energy check-in)
 *
 * Two main phases:
 * 1. PLAN - Input trip details, flights, hotels, preferences
 * 2. VIEW - View/edit itinerary with chat + EXECUTION MODE as overlay
 *
 * Execution is NOT a separate phase - it's a mode within VIEW that:
 * - Keeps chat accessible for real-time help
 * - Tracks time to lock past activities
 * - Shows current location and next activity
 */

import React, { useState, useCallback, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Plane,
  Calendar,
  Play,
  Pause,
  ChevronRight,
  MessageSquare,
  Map as MapIcon,
  Check,
  AlertCircle,
  Home,
  Lock,
  Clock,
  MapPin,
  Square,
  AlertTriangle,
  SkipForward,
  Timer,
  Settings2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

// Import input and view components
import { TripInputPanel } from "@/components/chat/TripInputPanel";
import { UnifiedItineraryView } from "@/components/itinerary/UnifiedItineraryView";
import { ItineraryChatPanel } from "@/components/chat/ItineraryChatPanel";
import { useItineraryChat } from "@/hooks/useItineraryChat";
import type { StructuredItineraryData } from "@/types/structured-itinerary";
import type { TripInput, DerivedTripStructure } from "@/types/trip-input";

// Import settings components from trip-planner
import {
  TravelerSettingsPanel,
  PreferencesPanel,
  DietaryAccessibilityPanel,
  NudgesPanel,
  EnergyCheckInBar,
  EnergyCheckInModal,
  CollapsibleSection,
  type TravelerSettings,
  type PreferenceSettings,
  type Nudge,
  type EnergyLevel,
} from "@/components/planner/trip-planner";

// Execution components
import {
  useExecutionState,
  type ScenarioType,
  type ActivityExecutionStatus,
} from "@/components/execution";
import {
  ExecutionNotificationFeed,
  useExecutionNotifications,
} from "@/components/execution/ExecutionNotifications";
import {
  ExecutionDecisionModal,
  useExecutionDecisions,
  createLateWakeupDecision,
  createDelayedDepartureDecision,
} from "@/components/execution/ExecutionDecisionModal";

// Queue-based execution
import { useExecutionQueue } from "@/hooks/useExecutionQueue";
import type {
  QueuedEvent,
  QueuedEventAction,
} from "@/lib/execution/execution-queue";

// Trip ID management
import {
  generateTripId,
  storeCurrentTripId,
  getCurrentTripId,
} from "@/lib/execution/trip-id";

// ============================================
// TYPES
// ============================================

type TripPhase = "plan" | "view";

export interface ExecutionContext {
  isExecuting: boolean;
  currentTime: Date;
  currentDayIndex: number;
  currentSlotId: string | null;
  currentActivityName: string | null;
  currentLocation: string | null;
  lockedSlotIds: Set<string>;
  completedSlotIds: Set<string>;
  skippedSlotIds: Set<string>;
}

interface TripAppProps {
  initialPhase?: TripPhase;
  initialItinerary?: StructuredItineraryData | null;
}

// ============================================
// PHASE INDICATOR
// ============================================

interface PhaseIndicatorProps {
  currentPhase: TripPhase;
  isExecuting: boolean;
  onPhaseClick: (phase: TripPhase) => void;
  canNavigateTo: (phase: TripPhase) => boolean;
}

function PhaseIndicator({
  currentPhase,
  isExecuting,
  onPhaseClick,
  canNavigateTo,
}: PhaseIndicatorProps) {
  const phases: Array<{
    id: TripPhase;
    label: string;
    icon: React.ElementType;
  }> = [
    { id: "plan", label: "Plan", icon: Plane },
    { id: "view", label: "Itinerary", icon: Calendar },
  ];

  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
      {phases.map((phase, index) => {
        const isActive = currentPhase === phase.id;
        const canNavigate = canNavigateTo(phase.id);
        const isPast = phases.findIndex((p) => p.id === currentPhase) > index;

        return (
          <React.Fragment key={phase.id}>
            <button
              onClick={() => canNavigate && onPhaseClick(phase.id)}
              disabled={!canNavigate || isExecuting}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                isActive
                  ? "bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300"
                  : isPast
                  ? "text-green-600 dark:text-green-400 hover:bg-green-50 dark:hover:bg-green-900/20"
                  : canNavigate && !isExecuting
                  ? "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
                  : "text-gray-300 dark:text-gray-600 cursor-not-allowed"
              )}
            >
              <phase.icon
                className={cn(
                  "h-4 w-4",
                  isPast && !isActive && "text-green-500"
                )}
              />
              <span>{phase.label}</span>
              {isPast && !isActive && (
                <Check className="h-3 w-3 text-green-500" />
              )}
            </button>
            {index < phases.length - 1 && (
              <ChevronRight className="h-4 w-4 text-gray-300 dark:text-gray-600" />
            )}
          </React.Fragment>
        );
      })}

      {isExecuting && (
        <div className="ml-auto flex items-center gap-2 px-3 py-1.5 bg-green-100 dark:bg-green-900/30 rounded-lg">
          <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
          <span className="text-sm font-medium text-green-700 dark:text-green-300">
            Executing
          </span>
        </div>
      )}
    </div>
  );
}

// ============================================
// EXECUTION STATUS BAR
// ============================================

interface ExecutionStatusBarProps {
  isExecuting: boolean;
  isPaused: boolean;
  currentTime: Date;
  currentActivityName: string | null;
  currentLocation: string | null;
  completedCount: number;
  totalCount: number;
  delayMinutes: number;
  speed: number;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSpeedChange: (speed: number) => void;
}

function ExecutionStatusBar({
  isExecuting,
  isPaused,
  currentTime,
  currentActivityName,
  currentLocation,
  completedCount,
  totalCount,
  delayMinutes,
  speed,
  onPause,
  onResume,
  onStop,
  onSpeedChange,
}: ExecutionStatusBarProps) {
  if (!isExecuting) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-gradient-to-r from-purple-900 via-purple-800 to-indigo-900 text-white px-4 py-3 shadow-lg"
    >
      <div className="max-w-6xl mx-auto flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-purple-300" />
            <span className="text-lg font-mono font-bold">
              {currentTime.toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
            <span className="text-xs text-purple-300">({speed}x)</span>
          </div>

          {currentLocation && (
            <div className="flex items-center gap-1.5 text-sm text-purple-200">
              <MapPin className="h-4 w-4" />
              <span>{currentLocation}</span>
            </div>
          )}

          {delayMinutes > 0 && (
            <div className="flex items-center gap-1.5 px-2 py-0.5 bg-amber-500/20 rounded-full">
              <AlertTriangle className="h-3.5 w-3.5 text-amber-400" />
              <span className="text-xs text-amber-300">
                {delayMinutes}m behind
              </span>
            </div>
          )}
        </div>

        <div className="flex-1 text-center">
          {currentActivityName ? (
            <div className="text-sm">
              <span className="text-purple-300">Now: </span>
              <span className="font-medium">{currentActivityName}</span>
            </div>
          ) : (
            <div className="text-sm text-purple-300">
              Ready to start day execution
            </div>
          )}
          <div className="text-xs text-purple-400 mt-0.5">
            {completedCount} of {totalCount} activities completed
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={speed}
            onChange={(e) => onSpeedChange(Number(e.target.value))}
            className="bg-purple-700/50 text-white text-xs rounded px-2 py-1 border border-purple-500/30"
          >
            <option value={1}>1x</option>
            <option value={2}>2x</option>
            <option value={5}>5x</option>
            <option value={10}>10x</option>
            <option value={30}>30x</option>
          </select>

          <button
            onClick={isPaused ? onResume : onPause}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 transition-colors"
          >
            {isPaused ? (
              <Play className="h-4 w-4" />
            ) : (
              <Pause className="h-4 w-4" />
            )}
          </button>

          <button
            onClick={onStop}
            className="p-2 rounded-lg bg-red-500/20 hover:bg-red-500/30 text-red-300 transition-colors"
          >
            <Square className="h-4 w-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================
// SETTINGS MODAL
// ============================================

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  travelerSettings: TravelerSettings;
  onTravelerSettingsChange: (settings: TravelerSettings) => void;
  preferences: PreferenceSettings;
  onPreferencesChange: (prefs: PreferenceSettings) => void;
}

function SettingsModal({
  isOpen,
  onClose,
  travelerSettings,
  onTravelerSettingsChange,
  preferences,
  onPreferencesChange,
}: SettingsModalProps) {
  const [expandedSection, setExpandedSection] = useState<string | null>(
    "travelers"
  );

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.95 }}
        className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto bg-white dark:bg-gray-900 rounded-xl shadow-xl m-4"
      >
        <div className="sticky top-0 flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Trip Settings
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
          >
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <CollapsibleSection
            title="Travelers"
            icon={<Settings2 className="w-4 h-4" />}
            isExpanded={expandedSection === "travelers"}
            onToggle={() =>
              setExpandedSection(
                expandedSection === "travelers" ? null : "travelers"
              )
            }
          >
            <TravelerSettingsPanel
              settings={travelerSettings}
              onChange={onTravelerSettingsChange}
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Trip Preferences"
            icon={<Settings2 className="w-4 h-4" />}
            isExpanded={expandedSection === "preferences"}
            onToggle={() =>
              setExpandedSection(
                expandedSection === "preferences" ? null : "preferences"
              )
            }
          >
            <PreferencesPanel
              preferences={preferences}
              onChange={onPreferencesChange}
            />
          </CollapsibleSection>

          <CollapsibleSection
            title="Dietary & Accessibility"
            icon={<Settings2 className="w-4 h-4" />}
            isExpanded={expandedSection === "dietary"}
            onToggle={() =>
              setExpandedSection(
                expandedSection === "dietary" ? null : "dietary"
              )
            }
          >
            <DietaryAccessibilityPanel
              preferences={preferences}
              onChange={onPreferencesChange}
            />
          </CollapsibleSection>
        </div>

        <div className="sticky bottom-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
          <Button variant="primary" onClick={onClose} className="w-full">
            Done
          </Button>
        </div>
      </motion.div>
    </div>
  );
}

// ============================================
// MAIN TRIP APP COMPONENT
// ============================================

export function TripApp({
  initialPhase = "plan",
  initialItinerary = null,
}: TripAppProps) {
  // Phase management
  const [currentPhase, setCurrentPhase] = useState<TripPhase>(initialPhase);

  // Trip data
  const [tripInput, setTripInput] = useState<TripInput | null>(null);
  const [derivedStructure, setDerivedStructure] =
    useState<DerivedTripStructure | null>(null);
  const [itinerary, setItinerary] = useState<StructuredItineraryData | null>(
    initialItinerary
  );

  // UI state
  const [isGenerating, setIsGenerating] = useState(false);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [chatPanelOpen, setChatPanelOpen] = useState(true);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  // Settings state (from TripPlannerPane)
  const [travelerSettings, setTravelerSettings] = useState<TravelerSettings>({
    adults: 2,
    children: 0,
    childrenAges: [],
    tripMode: "couples",
    hasSeniors: false,
    hasInfants: false,
  });

  const [preferences, setPreferences] = useState<PreferenceSettings>({
    paceMode: "normal",
    budgetMode: "moderate",
    walkingTolerance: "medium",
    dietaryOptions: [],
    needsAccessibility: false,
    rainPlanEnabled: true,
  });

  // Energy tracking
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel>("high");
  const [showEnergyCheckIn, setShowEnergyCheckIn] = useState(false);

  // Nudges
  const [nudges, setNudges] = useState<Nudge[]>([]);

  // Execution mode state
  const [isExecuting, setIsExecuting] = useState(false);
  const [executionContext, setExecutionContext] =
    useState<ExecutionContext | null>(null);

  // Check localStorage for existing itinerary on mount only
  // Don't load if we're generating a new itinerary
  useEffect(() => {
    if (!initialItinerary && !isGenerating) {
      const stored = localStorage.getItem("generatedItinerary");
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          if (parsed?.days?.length > 0) {
            setItinerary(parsed as StructuredItineraryData);
            setCurrentPhase("view");
          }
        } catch (e) {
          console.warn("Failed to parse stored itinerary:", e);
        }
      }
    }
    // Only run on initial mount, not when isGenerating changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialItinerary]);

  // Navigation helpers
  const canNavigateTo = useCallback(
    (phase: TripPhase) => {
      if (isExecuting) return false;
      switch (phase) {
        case "plan":
          return true;
        case "view":
          return !!itinerary;
      }
    },
    [itinerary, isExecuting]
  );

  const handlePhaseClick = useCallback(
    (phase: TripPhase) => {
      if (canNavigateTo(phase)) {
        setCurrentPhase(phase);
      }
    },
    [canNavigateTo]
  );

  // Handle trip input submission
  const handleStartPlanning = useCallback(
    async (input: TripInput, structure: DerivedTripStructure) => {
      setTripInput(input);
      setDerivedStructure(structure);
      setIsGenerating(true);
      setGenerationError(null);

      // Update traveler settings from input
      if (input.travelers) {
        const childCount = Array.isArray(input.travelers.children)
          ? input.travelers.children.length
          : input.travelers.children || 0;
        setTravelerSettings((prev) => ({
          ...prev,
          adults: input.travelers?.adults || 2,
          children: childCount,
        }));
      }

      try {
        // Calculate end date from start date and total days
        const startDate =
          structure.legs[0]?.startDate ||
          new Date().toISOString().split("T")[0];
        const totalDays = structure.totalNights + 1;
        const endDate = new Date(startDate);
        endDate.setDate(endDate.getDate() + totalDays - 1);
        const endDateStr = endDate.toISOString().split("T")[0];

        // Convert ActivityAnchors to anchors format for generate-structured
        const activityAnchors = input.activities
          .filter((activity) => activity.name && activity.date)
          .map((activity) => ({
            name: activity.name,
            city: activity.city || structure.cities[0] || "Tokyo",
            date: activity.date,
            startTime: activity.startTime,
            endTime: activity.endTime,
            duration: activity.duration,
            category: activity.category,
            notes: activity.notes,
            isFlexible: activity.isFlexible,
          }));

        // Convert Flights to anchors (arrival/departure constraints)
        // Be flexible: include flights that have a date AND either from OR to
        const flightAnchors = input.flights
          .filter((flight) => flight.date && (flight.from || flight.to))
          .map((flight) => {
            // Determine if this is arrival or departure based on which field is populated
            const isArrival = !!flight.to;
            const isDeparture = !!flight.from && !flight.to;

            // Build a descriptive name
            const flightNumPart = flight.flightNumber
              ? ` ${flight.flightNumber}`
              : "";
            let flightName: string;
            if (flight.from && flight.to) {
              flightName = `Flight${flightNumPart} ${flight.from} → ${flight.to}`;
            } else if (flight.from) {
              flightName = `Flight${flightNumPart} departing ${flight.from}`;
            } else if (flight.to) {
              flightName = `Flight${flightNumPart} arriving ${flight.to}`;
            } else {
              flightName = `Flight${flightNumPart}`;
            }

            // For city, use destination if arriving, or origin if departing
            // (departure flight means we're leaving that city at the end)
            const city = flight.to || flight.from || "";

            return {
              name: flightName.trim(),
              city,
              date: flight.date,
              startTime: flight.time,
              category: "transport" as const,
              notes: flight.confirmationNumber
                ? `Confirmation: ${flight.confirmationNumber}`
                : isDeparture
                ? "Departure flight - end of trip"
                : undefined,
              isFlexible: false,
            };
          });

        // Only use activity anchors - flights are handled via transfers, not as anchors
        // Flights should be processed via arrivalFlightTime/departureFlightTime and transfers array
        const allAnchors = [...activityAnchors];
        // Note: flightAnchors are NOT included - they inform day structure via transfers instead

        // Extract children ages properly
        const childrenAges = Array.isArray(input.travelers?.children)
          ? input.travelers.children.map((c) => c.age)
          : [];
        const childrenCount = childrenAges.length;

        // Determine trip mode based on travelers
        let tripMode: string = "couples";
        if (childrenCount > 0) {
          tripMode = "family";
        } else if (input.travelers?.adults === 1) {
          tripMode = "solo";
        }

        // Get dietary restrictions from preferences if available
        const dietaryRestrictions =
          preferences.dietaryOptions?.length > 0
            ? preferences.dietaryOptions
            : undefined;

        // Build request body for generate-structured API
        const requestBody = {
          // Include the original user prompt for debug logging
          tripPrompt: input.prompt,
          destination:
            structure.cities.length > 1
              ? `${structure.cities.join(", ")}, Japan`
              : `${structure.cities[0]}, Japan`,
          cities: structure.cities,
          startDate,
          endDate: endDateStr,
          pace: preferences.paceMode || "moderate",
          travelers: {
            adults: input.travelers?.adults || 2,
            children: childrenCount,
            childrenAges: childrenAges.length > 0 ? childrenAges : undefined,
          },
          budget: input.budgetTier || "moderate",
          interests:
            input.interests && input.interests.length > 0
              ? input.interests
              : undefined,
          tripMode,
          dietaryRestrictions,
          // Constraints
          mustHave:
            input.mustHave && input.mustHave.length > 0
              ? input.mustHave
              : undefined,
          mustAvoid:
            input.mustAvoid && input.mustAvoid.length > 0
              ? input.mustAvoid
              : undefined,
          anchors: allAnchors.length > 0 ? allAnchors : undefined,
          clusterByNeighborhood: true,
          // Flight time constraints - adjust first/last day activities
          arrivalFlightTime: structure.legs?.[0]?.arrivalFlight?.time,
          departureFlightTime:
            structure.legs?.[structure.legs.length - 1]?.departureFlight?.time,
          arrivalAirport: structure.legs?.[0]?.arrivalFlight?.to,
          departureAirport:
            structure.legs?.[structure.legs.length - 1]?.departureFlight?.from,
          // Inter-city transfers (Shinkansen, flights, etc.)
          transfers: structure.transfers
            ?.filter(
              (t) =>
                t.type === "inter_city" ||
                t.type === "airport_arrival" ||
                t.type === "airport_departure"
            )
            .map((t) => ({
              type: t.type,
              date: t.date,
              fromCity: t.from.city || "",
              toCity: t.to.city || "",
              mode: t.options?.[0]?.mode,
              duration: t.options?.[0]?.duration,
            })),
          // Optional enrichments
          includeViatorTours: false, // Can enable if desired
        };

        console.log(
          "[TripApp] Sending comprehensive request to generate-structured:",
          {
            destination: requestBody.destination,
            cities: requestBody.cities,
            startDate: requestBody.startDate,
            endDate: requestBody.endDate,
            totalDays,
            travelers: requestBody.travelers,
            tripMode: requestBody.tripMode,
            pace: requestBody.pace,
            budget: requestBody.budget,
            anchors: requestBody.anchors?.length || 0,
            activityAnchors: activityAnchors.length,
            flightAnchors: flightAnchors.length,
            mustHave: requestBody.mustHave?.length || 0,
            mustAvoid: requestBody.mustAvoid?.length || 0,
            interests: requestBody.interests?.length || 0,
            dietaryRestrictions: requestBody.dietaryRestrictions?.length || 0,
          }
        );

        // Log detailed anchors for debugging
        if (allAnchors.length > 0) {
          console.log("[TripApp] Anchors being sent:", allAnchors);
        }

        const response = await fetch("/api/itinerary/generate-structured", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
        });

        const data = await response.json();

        // Log the response for debugging
        if (!response.ok) {
          console.error(
            "[TripApp] generate-structured returned error:",
            response.status,
            data
          );
        }

        if (data.success && data.data?.itinerary) {
          // Backend generates tripId and saves to disk - just use it directly
          const generatedItinerary = data.data
            .itinerary as StructuredItineraryData;

          console.log(
            "[TripApp] Received itinerary with tripId:",
            generatedItinerary.tripId
          );

          setItinerary(generatedItinerary);
          localStorage.setItem(
            "generatedItinerary",
            JSON.stringify(generatedItinerary)
          );

          window.dispatchEvent(
            new CustomEvent("itineraryGenerated", {
              detail: { itinerary: generatedItinerary, request: requestBody },
            })
          );

          setCurrentPhase("view");
        } else {
          throw new Error(
            data.error?.message || "Failed to generate itinerary"
          );
        }
      } catch (error) {
        console.error("Itinerary generation failed:", error);
        setGenerationError(
          error instanceof Error
            ? error.message
            : "Failed to generate itinerary"
        );
      } finally {
        setIsGenerating(false);
      }
    },
    [preferences.paceMode]
  );

  // Clear and start over
  const handleStartOver = useCallback(() => {
    if (isExecuting) {
      setIsExecuting(false);
      setExecutionContext(null);
    }
    localStorage.removeItem("generatedItinerary");
    setItinerary(null);
    setTripInput(null);
    setDerivedStructure(null);
    setCurrentPhase("plan");
  }, [isExecuting]);

  // Start execution mode
  const handleStartExecution = useCallback(() => {
    if (!itinerary) return;

    const currentDay = itinerary.days[selectedDayIndex];
    if (!currentDay) return;

    const startTime = new Date();
    startTime.setHours(8, 0, 0, 0);

    setExecutionContext({
      isExecuting: true,
      currentTime: startTime,
      currentDayIndex: selectedDayIndex,
      currentSlotId: currentDay.slots?.[0]?.slotId || null,
      currentActivityName:
        currentDay.slots?.[0]?.options?.[0]?.activity?.name || null,
      currentLocation: currentDay.city,
      lockedSlotIds: new Set<string>(),
      completedSlotIds: new Set<string>(),
      skippedSlotIds: new Set<string>(),
    });

    setIsExecuting(true);
  }, [itinerary, selectedDayIndex]);

  // Stop execution mode
  const handleStopExecution = useCallback(() => {
    setIsExecuting(false);
  }, []);

  // Dismiss nudge
  const dismissNudge = useCallback((nudgeId: string) => {
    setNudges((prev) => prev.filter((n) => n.id !== nudgeId));
  }, []);

  return (
    <div className="h-screen flex flex-col bg-gray-100 dark:bg-gray-950">
      {/* Header */}
      <header className="flex-shrink-0 bg-white dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-gradient-to-br from-purple-500 to-pink-500 rounded-lg flex items-center justify-center">
              <MapIcon className="h-4 w-4 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-gray-900 dark:text-white">
                {itinerary?.destination || "Trip Planner"}
              </h1>
              {itinerary && (
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {itinerary.days.length} days •{" "}
                  {itinerary.days
                    .map((d) => d.city)
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .join(" → ")}
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {itinerary && !isExecuting && (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowSettingsModal(true)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <Settings2 className="h-4 w-4 mr-1" />
                  Settings
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleStartOver}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <Home className="h-4 w-4 mr-1" />
                  New Trip
                </Button>
              </>
            )}
          </div>
        </div>

        <PhaseIndicator
          currentPhase={currentPhase}
          isExecuting={isExecuting}
          onPhaseClick={handlePhaseClick}
          canNavigateTo={canNavigateTo}
        />
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          {currentPhase === "plan" && (
            <PlanPhase
              key="plan"
              isGenerating={isGenerating}
              generationError={generationError}
              onStartPlanning={handleStartPlanning}
            />
          )}

          {currentPhase === "view" && itinerary && (
            <ViewPhase
              key="view"
              itinerary={itinerary}
              setItinerary={setItinerary}
              chatPanelOpen={chatPanelOpen}
              setChatPanelOpen={setChatPanelOpen}
              selectedDayIndex={selectedDayIndex}
              setSelectedDayIndex={setSelectedDayIndex}
              isExecuting={isExecuting}
              executionContext={executionContext}
              setExecutionContext={setExecutionContext}
              onStartExecution={handleStartExecution}
              onStopExecution={handleStopExecution}
              energyLevel={energyLevel}
              showEnergyCheckIn={showEnergyCheckIn}
              setShowEnergyCheckIn={setShowEnergyCheckIn}
              setEnergyLevel={setEnergyLevel}
              nudges={nudges}
              onDismissNudge={dismissNudge}
              preferences={preferences}
            />
          )}
        </AnimatePresence>
      </main>

      {/* Settings Modal */}
      <AnimatePresence>
        {showSettingsModal && (
          <SettingsModal
            isOpen={showSettingsModal}
            onClose={() => setShowSettingsModal(false)}
            travelerSettings={travelerSettings}
            onTravelerSettingsChange={setTravelerSettings}
            preferences={preferences}
            onPreferencesChange={setPreferences}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// PLAN PHASE
// ============================================

interface PlanPhaseProps {
  isGenerating: boolean;
  generationError: string | null;
  onStartPlanning: (input: TripInput, structure: DerivedTripStructure) => void;
}

function PlanPhase({
  isGenerating,
  generationError,
  onStartPlanning,
}: PlanPhaseProps) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="h-full flex"
    >
      <div className="flex-1 max-w-2xl mx-auto p-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg overflow-hidden h-full">
          <TripInputPanel
            onStartPlanning={onStartPlanning}
            isLoading={isGenerating}
          />
        </div>
      </div>

      <div className="hidden lg:block w-80 p-4">
        <div className="bg-white dark:bg-gray-900 rounded-xl shadow-lg p-6 h-full">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Quick Start
          </h3>

          <div className="space-y-4 text-sm text-gray-600 dark:text-gray-400">
            <div className="p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg">
              <p className="font-medium text-purple-700 dark:text-purple-300 mb-1">
                💡 Try saying:
              </p>
              <p className="text-purple-600 dark:text-purple-400 italic">
                &quot;10 days in Japan for 2 adults, starting in Tokyo&quot;
              </p>
            </div>

            <div>
              <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-2">
                Add Your Bookings
              </h4>
              <ul className="list-disc list-inside space-y-1">
                <li>Add flights you&apos;ve already booked</li>
                <li>Add hotel reservations</li>
                <li>We&apos;ll build around your anchors</li>
              </ul>
            </div>

            <div>
              <h4 className="font-medium text-gray-800 dark:text-gray-200 mb-2">
                What Happens Next
              </h4>
              <ul className="list-disc list-inside space-y-1">
                <li>AI generates personalized itinerary</li>
                <li>Chat to make adjustments</li>
                <li>Execute on the day with real-time help</li>
              </ul>
            </div>
          </div>

          {generationError && (
            <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                <AlertCircle className="h-4 w-4" />
                <span className="text-sm font-medium">Error</span>
              </div>
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {generationError}
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================
// VIEW PHASE WITH EXECUTION
// ============================================

interface ViewPhaseProps {
  itinerary: StructuredItineraryData;
  setItinerary: (itinerary: StructuredItineraryData) => void;
  chatPanelOpen: boolean;
  setChatPanelOpen: (open: boolean) => void;
  selectedDayIndex: number;
  setSelectedDayIndex: (index: number) => void;
  isExecuting: boolean;
  executionContext: ExecutionContext | null;
  setExecutionContext: (context: ExecutionContext | null) => void;
  onStartExecution: () => void;
  onStopExecution: () => void;
  energyLevel: EnergyLevel;
  showEnergyCheckIn: boolean;
  setShowEnergyCheckIn: (show: boolean) => void;
  setEnergyLevel: (level: EnergyLevel) => void;
  nudges: Nudge[];
  onDismissNudge: (id: string) => void;
  preferences: PreferenceSettings;
}

function ViewPhase({
  itinerary: initialItinerary,
  setItinerary: setParentItinerary,
  chatPanelOpen,
  setChatPanelOpen,
  selectedDayIndex,
  setSelectedDayIndex,
  isExecuting,
  executionContext,
  setExecutionContext,
  onStartExecution,
  onStopExecution,
  energyLevel,
  showEnergyCheckIn,
  setShowEnergyCheckIn,
  setEnergyLevel,
  nudges,
  onDismissNudge,
  preferences,
}: ViewPhaseProps) {
  const chatPanelWidth = 380;

  // Get tripId from itinerary (generated during creation)
  const tripId = useMemo(() => {
    // Use tripId from itinerary if available
    if (initialItinerary.tripId) {
      storeCurrentTripId(initialItinerary.tripId);
      return initialItinerary.tripId;
    }

    // Fallback: generate one if missing (for old itineraries)
    const existing = getCurrentTripId();
    if (existing) return existing;

    const newId = generateTripId(initialItinerary.destination);
    storeCurrentTripId(newId);
    return newId;
  }, [initialItinerary.tripId, initialItinerary.destination]);

  // State for copy feedback
  const [copiedTripId, setCopiedTripId] = useState(false);

  // Copy tripId to clipboard
  const copyTripId = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(tripId);
      setCopiedTripId(true);
      setTimeout(() => setCopiedTripId(false), 2000);
    } catch (err) {
      console.error("Failed to copy tripId:", err);
    }
  }, [tripId]);

  // Initialize chat hook
  const {
    chatState,
    itinerary,
    sendMessage,
    executeAction,
    confirmPreview,
    rejectPreview,
    answerClarification,
    canUndo,
    canRedo,
    undo,
    redo,
    dismissNudge: chatDismissNudge,
    setCurrentDayIndex,
    addAgentMessage,
  } = useItineraryChat({
    initialItinerary,
    strictMode: false,
    autoAdjust: true,
  });

  // Execution hooks
  const currentDay = itinerary.days[selectedDayIndex];
  const executionState = useExecutionState(currentDay?.slots?.length || 0);
  const executionNotifications = useExecutionNotifications();
  const executionDecisions = useExecutionDecisions();

  // Queue-based execution
  const executionQueue = useExecutionQueue({
    tripId,
    itinerary,
    dayIndex: selectedDayIndex,
    pollIntervalMs: 3000,
    onEvent: useCallback(
      (event: QueuedEvent) => {
        // Create chat content from event
        const chatContent = event.tip
          ? `**${event.title}**\n\n${event.message}\n\n💡 *${event.tip}*`
          : `**${event.title}**\n\n${event.message}`;

        // Add message with the full event for interactive rendering
        addAgentMessage(chatContent, { executionEvent: event });

        executionNotifications.addNotification({
          type:
            event.priority === "urgent"
              ? "booking_at_risk"
              : event.priority === "high"
              ? "delay_warning"
              : "info",
          title: event.title,
          message: event.message,
          priority:
            event.priority === "urgent"
              ? "urgent"
              : event.priority === "high"
              ? "high"
              : "normal",
          autoDismiss: event.priority !== "urgent",
        });
      },
      [executionNotifications, addAgentMessage]
    ),
  });

  // Activity statuses
  const [activityStatuses, setActivityStatuses] = useState<
    Map<string, ActivityExecutionStatus>
  >(() => new Map());

  // Locked slots
  const lockedSlotIds = useMemo(() => {
    const locked = new Set<string>();
    if (executionContext && currentDay?.slots) {
      currentDay.slots.forEach((slot) => {
        const status = activityStatuses.get(slot.slotId);
        if (status === "completed" || status === "skipped") {
          locked.add(slot.slotId);
        }
      });
    }
    return locked;
  }, [executionContext, currentDay, activityStatuses]);

  // Sync day index
  useEffect(() => {
    setCurrentDayIndex(selectedDayIndex);
  }, [selectedDayIndex, setCurrentDayIndex]);

  // Sync itinerary to parent
  useEffect(() => {
    if (itinerary !== initialItinerary) {
      setParentItinerary(itinerary);
      localStorage.setItem("generatedItinerary", JSON.stringify(itinerary));
    }
  }, [itinerary, initialItinerary, setParentItinerary]);

  // Initialize execution
  useEffect(() => {
    if (isExecuting && executionContext && currentDay?.slots?.length) {
      const initialStatuses = new Map<string, ActivityExecutionStatus>();
      currentDay.slots.forEach((slot, index) => {
        initialStatuses.set(slot.slotId, index === 0 ? "pending" : "upcoming");
      });
      setActivityStatuses(initialStatuses);

      executionState.setTotalActivities(currentDay.slots.length);

      const startTime = new Date();
      startTime.setHours(8, 0, 0, 0);
      executionState.start(startTime);

      const firstSlot = currentDay.slots[0];
      if (firstSlot?.options?.[0]) {
        executionState.updateCurrentActivity(
          firstSlot.slotId,
          firstSlot.options[0].activity.name
        );
      }

      executionQueue.startExecution().then((success) => {
        if (success) {
          executionQueue.startPolling();
        }
      });

      executionNotifications.addNotification({
        type: "info",
        title: "Execution Started",
        message: `Executing Day ${selectedDayIndex + 1} in ${
          currentDay.city
        }. Chat is still available for help!`,
        priority: "normal",
      });
    }
  }, [isExecuting, selectedDayIndex]);

  // Cleanup on stop
  useEffect(() => {
    if (!isExecuting) {
      executionState.stop();
    }
  }, [isExecuting]);

  // Handle scenarios
  const handleTriggerScenario = useCallback(
    (scenario: ScenarioType) => {
      const currentActivityName =
        executionState.state.currentActivityName || "Current Activity";
      const nextSlotIndex = executionState.state.completedActivities;
      const nextSlot = currentDay?.slots?.[nextSlotIndex + 1];
      const nextActivityName =
        nextSlot?.options?.[0]?.activity?.name || "Next Activity";

      switch (scenario) {
        case "late_wakeup": {
          const delayMinutes = 45;
          executionState.addDelay(delayMinutes);
          executionNotifications.addNotification({
            type: "scenario_trigger",
            title: "Late Wakeup",
            message: `Running ${delayMinutes} minutes behind. Ask the agent for help!`,
            priority: "high",
          });
          executionDecisions.showDecision(
            createLateWakeupDecision(
              executionState.state.simulatedTime.current.toLocaleTimeString(
                "en-US",
                { hour: "2-digit", minute: "2-digit" }
              ),
              delayMinutes,
              currentDay?.slots?.[0]?.options?.[0]?.activity?.name ||
                "Breakfast",
              nextActivityName,
              false
            )
          );
          break;
        }
        case "delayed_departure": {
          const delayMinutes = 25;
          executionState.addDelay(delayMinutes);
          executionNotifications.addNotification({
            type: "delay_warning",
            title: "Running Behind",
            message: `${delayMinutes} min delay. Use chat for rescheduling options.`,
            priority: "high",
          });
          executionDecisions.showDecision(
            createDelayedDepartureDecision(
              executionState.state.simulatedTime.current.toLocaleTimeString(
                "en-US",
                { hour: "2-digit", minute: "2-digit" }
              ),
              delayMinutes,
              currentActivityName,
              nextActivityName,
              false
            )
          );
          break;
        }
        case "slow_activity": {
          executionState.addDelay(20);
          executionNotifications.addNotification({
            type: "activity_ending",
            title: "Activity Running Long",
            message: `${currentActivityName} is taking longer. Chat with agent to adjust.`,
            priority: "normal",
            actionLabel: "Extend 15 min",
            onAction: () => executionState.addDelay(15),
          });
          break;
        }
        case "booking_risk": {
          executionNotifications.addNotification({
            type: "booking_at_risk",
            title: "Booking at Risk!",
            message:
              "You may miss your reservation. Ask agent for alternatives!",
            priority: "urgent",
            autoDismiss: false,
          });
          break;
        }
      }
    },
    [currentDay, executionState, executionNotifications, executionDecisions]
  );

  // Decision handler
  const handleDecisionSelect = useCallback(
    async (optionId: string) => {
      await executionDecisions.handleSelect(optionId, async (id) => {
        executionNotifications.addNotification({
          type: "info",
          title: "Decision Applied",
          message: `Applied: ${id}`,
          priority: "normal",
        });

        if (id === "skip_breakfast" || id === "skip_next") {
          const currentSlotIndex = executionState.state.completedActivities;
          if (currentDay?.slots?.[currentSlotIndex]) {
            setActivityStatuses((prev) => {
              const updated = new Map(prev);
              updated.set(currentDay.slots[currentSlotIndex].slotId, "skipped");
              return updated;
            });
            executionState.completeActivity();
          }
        }
      });
    },
    [executionDecisions, executionNotifications, executionState, currentDay]
  );

  // Skip activity
  const handleSkipActivity = useCallback(() => {
    const currentSlotIndex = executionState.state.completedActivities;
    if (currentDay?.slots?.[currentSlotIndex]) {
      setActivityStatuses((prev) => {
        const updated = new Map(prev);
        updated.set(currentDay.slots[currentSlotIndex].slotId, "skipped");
        return updated;
      });
      executionState.completeActivity();

      const nextSlot = currentDay.slots[currentSlotIndex + 1];
      if (nextSlot?.options?.[0]) {
        executionState.updateCurrentActivity(
          nextSlot.slotId,
          nextSlot.options[0].activity.name
        );
      }

      executionNotifications.addNotification({
        type: "skip_suggestion",
        title: "Activity Skipped",
        message: "Skipped current activity",
        priority: "normal",
      });
    }
  }, [currentDay, executionState, executionNotifications]);

  // Extend activity
  const handleExtendActivity = useCallback(() => {
    executionNotifications.addNotification({
      type: "extension_available",
      title: "Activity Extended",
      message: "Added 15 minutes to current activity",
      priority: "normal",
    });
    executionState.addDelay(15);
  }, [executionNotifications, executionState]);

  // Handle event actions from chat (skip, extend, navigate, etc.)
  const handleEventAction = useCallback(
    async (event: QueuedEvent, action: QueuedEventAction) => {
      console.log("[ViewPhase] Event action triggered:", action.type, action);

      try {
        // Call the execution queue action API
        const response = await fetch("/api/execution/queue/action", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            tripId,
            eventId: event.id,
            action: action.type,
            payload: action.payload,
          }),
        });

        const result = await response.json();

        if (!result.success) {
          console.error("[ViewPhase] Action failed:", result.error);
          executionNotifications.addNotification({
            type: "info",
            title: "Action Failed",
            message: result.error?.message || "Could not perform action",
            priority: "normal",
          });
          return;
        }

        // Handle specific action types locally
        switch (action.type) {
          case "skip": {
            if (action.payload?.slotId) {
              setActivityStatuses((prev) => {
                const updated = new Map(prev);
                updated.set(action.payload!.slotId as string, "skipped");
                return updated;
              });
            }
            handleSkipActivity();
            break;
          }
          case "extend": {
            const minutes = (action.payload?.minutes as number) || 15;
            executionState.addDelay(minutes);
            executionNotifications.addNotification({
              type: "extension_available",
              title: "Activity Extended",
              message: `Added ${minutes} minutes to current activity`,
              priority: "normal",
            });
            break;
          }
          case "navigate": {
            // Open navigation (could launch maps app in real implementation)
            executionNotifications.addNotification({
              type: "info",
              title: "Navigation",
              message: "Opening navigation to destination...",
              priority: "normal",
            });
            break;
          }
          case "confirm": {
            executionNotifications.addNotification({
              type: "info",
              title: "Acknowledged",
              message: result.message || "Got it!",
              priority: "normal",
            });
            break;
          }
          case "dismiss": {
            // Just dismiss, no notification needed
            break;
          }
          case "swap": {
            // This would trigger finding alternatives
            addAgentMessage(
              "Looking for alternatives nearby... What type of activity would you prefer?"
            );
            break;
          }
          case "chat": {
            // Send a chat message from the payload
            if (action.payload?.message) {
              sendMessage(action.payload.message as string);
            }
            break;
          }
          default: {
            executionNotifications.addNotification({
              type: "info",
              title: "Action Completed",
              message: result.message || `Action ${action.type} completed`,
              priority: "normal",
            });
          }
        }
      } catch (error) {
        console.error("[ViewPhase] Event action error:", error);
        executionNotifications.addNotification({
          type: "info",
          title: "Error",
          message: "Failed to perform action. Please try again.",
          priority: "normal",
        });
      }
    },
    [
      tripId,
      executionNotifications,
      executionState,
      handleSkipActivity,
      addAgentMessage,
      sendMessage,
    ]
  );

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 20 }}
      className="flex-1 flex flex-col overflow-hidden"
    >
      {/* Execution Status Bar */}
      <AnimatePresence>
        {isExecuting && (
          <ExecutionStatusBar
            isExecuting={isExecuting}
            isPaused={executionState.state.phase === "paused"}
            currentTime={executionState.state.simulatedTime.current}
            currentActivityName={executionState.state.currentActivityName}
            currentLocation={currentDay?.city || null}
            completedCount={executionState.state.completedActivities}
            totalCount={currentDay?.slots?.length || 0}
            delayMinutes={executionState.state.delayMinutes}
            speed={executionState.state.simulatedTime.speed}
            onPause={executionState.pause}
            onResume={executionState.resume}
            onStop={onStopExecution}
            onSpeedChange={executionState.setSpeed}
          />
        )}
      </AnimatePresence>

      {/* Nudges Panel - Show during execution */}
      {isExecuting && nudges.length > 0 && (
        <NudgesPanel nudges={nudges} onDismiss={onDismissNudge} />
      )}

      {/* Energy Check-In - Show during execution */}
      {isExecuting && (
        <EnergyCheckInBar
          energyLevel={energyLevel}
          onCheckIn={() => setShowEnergyCheckIn(true)}
        />
      )}

      {/* Energy Check-In Modal */}
      <AnimatePresence>
        {showEnergyCheckIn && (
          <EnergyCheckInModal
            currentLevel={energyLevel}
            onSubmit={(level) => {
              setEnergyLevel(level);
              setShowEnergyCheckIn(false);
            }}
            onClose={() => setShowEnergyCheckIn(false)}
          />
        )}
      </AnimatePresence>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Itinerary View */}
        <div
          className="flex-1 overflow-y-auto transition-all duration-300"
          style={{ marginRight: chatPanelOpen ? chatPanelWidth : 0 }}
        >
          <div className="max-w-4xl mx-auto p-4">
            {/* Day Selector */}
            <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
              {itinerary.days.map((day, index) => {
                const isCurrentExecutionDay =
                  isExecuting && index === selectedDayIndex;

                return (
                  <button
                    key={day.dayNumber}
                    onClick={() => {
                      if (!isExecuting || index === selectedDayIndex) {
                        setSelectedDayIndex(index);
                      }
                    }}
                    disabled={isExecuting && index !== selectedDayIndex}
                    className={cn(
                      "flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors relative",
                      selectedDayIndex === index
                        ? "bg-purple-600 text-white"
                        : isExecuting
                        ? "bg-gray-200 dark:bg-gray-700 text-gray-400 cursor-not-allowed"
                        : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
                    )}
                  >
                    Day {day.dayNumber}: {day.city}
                    {isCurrentExecutionDay && (
                      <span className="absolute -top-1 -right-1 w-3 h-3 bg-green-500 rounded-full animate-pulse" />
                    )}
                  </button>
                );
              })}
            </div>

            {/* Trip ID Badge + Execute/Stop Button */}
            {!isExecuting && (
              <div className="mb-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="text-sm text-gray-500 dark:text-gray-400">
                    Chat with the agent to modify your itinerary, or start
                    execution for real-time guidance.
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {/* Trip ID Badge */}
                  <button
                    onClick={copyTripId}
                    className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-lg text-xs font-mono hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                    title="Click to copy Trip ID (use in simulator)"
                  >
                    <span className="text-gray-500 dark:text-gray-400">
                      ID:
                    </span>
                    <span className="text-purple-600 dark:text-purple-400 font-semibold">
                      {tripId}
                    </span>
                    {copiedTripId ? (
                      <Check className="h-3 w-3 text-green-500" />
                    ) : (
                      <svg
                        className="h-3 w-3 text-gray-400"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
                        />
                      </svg>
                    )}
                  </button>
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={onStartExecution}
                    leftIcon={<Play className="h-4 w-4" />}
                    className="bg-green-600 hover:bg-green-700"
                  >
                    Execute Day {selectedDayIndex + 1}
                  </Button>
                </div>
              </div>
            )}

            {/* Execution Quick Actions */}
            {isExecuting && (
              <div className="mb-4 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <span className="font-medium text-purple-700 dark:text-purple-300">
                      Execution Mode Active
                    </span>
                    <span className="text-purple-600 dark:text-purple-400 ml-2">
                      • Chat is still available for help
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleSkipActivity}
                      leftIcon={<SkipForward className="h-4 w-4" />}
                      className="text-amber-600 hover:bg-amber-50"
                    >
                      Skip Current
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={handleExtendActivity}
                      leftIcon={<Timer className="h-4 w-4" />}
                      className="text-blue-600 hover:bg-blue-50"
                    >
                      Extend +15m
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleTriggerScenario("delayed_departure")}
                      leftIcon={<AlertTriangle className="h-4 w-4" />}
                      className="text-orange-600 hover:bg-orange-50"
                    >
                      Simulate Delay
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Itinerary View */}
            <div className="relative">
              <UnifiedItineraryView
                itinerary={itinerary}
                enableReordering={!isExecuting}
                defaultViewMode="tabbed"
                executionContext={
                  isExecuting
                    ? {
                        isExecuting: true,
                        currentSlotId:
                          executionState.state.currentActivityId || null,
                        lockedSlotIds,
                        activityStatuses,
                        currentTime: executionState.state.simulatedTime.current,
                      }
                    : undefined
                }
              />

              {isExecuting && lockedSlotIds.size > 0 && (
                <div className="absolute top-0 left-0 right-0 text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-t-lg border-b border-amber-200 dark:border-amber-700">
                  <Lock className="h-3 w-3" />
                  <span>
                    {lockedSlotIds.size} past activities locked (agent
                    can&apos;t modify)
                  </span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right: Chat Panel */}
        <div
          className={cn(
            "fixed top-0 right-0 h-full bg-white dark:bg-gray-900 shadow-xl transition-transform duration-300 z-40",
            chatPanelOpen ? "translate-x-0" : "translate-x-full"
          )}
          style={{
            width: chatPanelWidth,
            top: isExecuting ? "156px" : "108px",
            height: isExecuting ? "calc(100% - 156px)" : "calc(100% - 108px)",
          }}
        >
          {isExecuting && (
            <div className="px-3 py-2 bg-green-50 dark:bg-green-900/20 border-b border-green-200 dark:border-green-700 text-xs">
              <div className="flex items-center gap-1.5 text-green-700 dark:text-green-300">
                <div className="w-2 h-2 bg-green-500 rounded-full animate-pulse" />
                <span>
                  Execution mode - Agent aware of time &amp; locked activities
                </span>
              </div>
            </div>
          )}

          <button
            onClick={() => setChatPanelOpen(false)}
            className="absolute top-2 left-2 z-10 p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700"
          >
            <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>

          <div className="h-full pt-10">
            <ItineraryChatPanel
              chatState={chatState}
              onSendMessage={(message) => {
                sendMessage(message);
              }}
              onExecuteAction={executeAction}
              onConfirmPreview={confirmPreview}
              onRejectPreview={rejectPreview}
              onAnswerClarification={answerClarification}
              onDismissNudge={chatDismissNudge}
              onEventAction={handleEventAction}
              canUndo={canUndo}
              canRedo={canRedo}
              onUndo={undo}
              onRedo={redo}
              className="h-full rounded-none border-0 border-l"
            />
          </div>
        </div>

        {/* Chat Toggle FAB */}
        {!chatPanelOpen && (
          <button
            onClick={() => setChatPanelOpen(true)}
            className={cn(
              "fixed bottom-6 right-6 w-14 h-14 rounded-full shadow-lg flex items-center justify-center z-40",
              isExecuting
                ? "bg-green-600 hover:bg-green-700"
                : "bg-purple-600 hover:bg-purple-700",
              "text-white"
            )}
          >
            <MessageSquare className="w-6 h-6" />
            {isExecuting && (
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-amber-400 rounded-full flex items-center justify-center text-xs text-black font-bold">
                !
              </span>
            )}
          </button>
        )}
      </div>

      {/* Notifications */}
      {isExecuting && (
        <ExecutionNotificationFeed
          notifications={executionNotifications.notifications}
          onDismiss={executionNotifications.dismissNotification}
          position="top-right"
        />
      )}

      {/* Decision Modal */}
      {isExecuting && (
        <ExecutionDecisionModal
          isOpen={!!executionDecisions.currentDecision}
          decision={executionDecisions.currentDecision}
          onSelect={handleDecisionSelect}
          onDismiss={executionDecisions.dismissDecision}
          isProcessing={executionDecisions.isProcessing}
        />
      )}
    </motion.div>
  );
}

export default TripApp;
