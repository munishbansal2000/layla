"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Loader2,
  Users,
  UtensilsCrossed,
  ChevronLeft,
  Settings2,
  Calendar,
  Check,
  AlertTriangle,
  Umbrella,
  Heart,
  GripVertical,
  Sparkles,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import type {
  TripPlanningContext,
  DaySchedule,
  ViatorActivitySuggestion,
  TimeSlot,
} from "@/lib/trip-planning";
import type { ParsedItinerary } from "@/lib/itinerary-parser";
import {
  createEmptyDaySchedule,
  generateDateRange,
  matchActivityToSlot,
} from "@/lib/trip-planning";
import { useTripStore } from "@/store/trip-store";
import {
  ActivitySelectionFlow,
  useSelectionSession,
  type SelectionSlot,
  type ScoredActivityOption,
  type SelectionSession,
} from "./ActivitySelectionFlow";
import type {
  TripMode,
  PaceMode,
  NudgeType,
  EnergyLevel,
  ScoredActivity,
} from "@/types/activity-suggestion";
import type { CommuteMethod } from "@/lib/routing-service";
import type {
  DaySchedule as GeneratedDayScheduleType,
  ScheduledActivity,
} from "@/lib/schedule-builder";
import type { GeneratedItinerary } from "@/lib/itinerary-orchestrator";
import { SwapOptionsModal, type SwapOption } from "./SwapOptionsModal";
import { UnifiedItineraryView } from "../itinerary/UnifiedItineraryView";
import { ReshuffleModal, UndoToast } from "../reshuffling";
import { useReshuffling } from "@/hooks/useReshuffling";
import type { ReshuffleResult, ScheduleChange } from "@/types/reshuffling";
import { useVenueMonitoring } from "@/lib/venue-monitoring-service";
import { useNotifications } from "@/lib/notification-service";
import type { StructuredItineraryData } from "@/types/structured-itinerary";

// Import extracted components
import {
  TripHeader,
  CollapsibleSection,
  TravelerSettingsPanel,
  PreferencesPanel,
  DietaryAccessibilityPanel,
  NudgesPanel,
  EnergyCheckInBar,
  EnergyCheckInModal,
  DaySelector,
  ParsedItineraryView,
  TimeSlotCard,
  type TravelerSettings,
  type PreferenceSettings,
  type WeatherData,
  type Nudge,
  type CommuteDisplayInfo,
  type GenerationStatus,
  type GeneratedDaySchedule,
  type GeneratedSlot,
} from "./trip-planner";

// ============================================
// Mock Data for Testing
// ============================================

const MOCK_ACTIVITIES: ViatorActivitySuggestion[] = [
  {
    id: "act-1",
    name: "Eiffel Tower Skip-the-Line Summit Access",
    description:
      "Skip the long lines and head straight to the summit of Paris's most iconic landmark. Enjoy breathtaking 360-degree views of the City of Light.",
    imageUrl:
      "https://images.unsplash.com/photo-1511739001486-6bfe10ce65f4?w=400&h=300&fit=crop",
    duration: 180,
    rating: 4.8,
    reviewCount: 12543,
    price: { amount: 65, currency: "EUR" },
    bookingUrl: "https://viator.com/eiffel-tower",
    viatorProductCode: "EIFFEL-001",
    tags: ["Landmark", "Views", "Must-See", "Family"],
    matchScore: 95,
    bestTimeOfDay: "morning",
  },
  {
    id: "act-2",
    name: "Louvre Museum Guided Tour with Mona Lisa",
    description:
      "Discover the world's largest art museum with an expert guide. See the Mona Lisa, Venus de Milo, and other masterpieces without the crowds.",
    imageUrl:
      "https://images.unsplash.com/photo-1499426600726-7f5b1a3a44fe?w=400&h=300&fit=crop",
    duration: 150,
    rating: 4.7,
    reviewCount: 8921,
    price: { amount: 55, currency: "EUR" },
    bookingUrl: "https://viator.com/louvre",
    viatorProductCode: "LOUVRE-001",
    tags: ["Museum", "Art", "Culture", "Indoor"],
    matchScore: 88,
    bestTimeOfDay: "morning",
  },
  {
    id: "act-3",
    name: "Seine River Dinner Cruise",
    description:
      "Cruise along the Seine while enjoying a gourmet French dinner. Watch Paris light up as you pass by Notre-Dame, the Louvre, and more.",
    imageUrl:
      "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=400&h=300&fit=crop",
    duration: 150,
    rating: 4.6,
    reviewCount: 5432,
    price: { amount: 95, currency: "EUR" },
    bookingUrl: "https://viator.com/seine-cruise",
    viatorProductCode: "SEINE-001",
    tags: ["Dining", "Romantic", "Cruise", "Evening"],
    matchScore: 82,
    bestTimeOfDay: "evening",
  },
  {
    id: "act-4",
    name: "Montmartre Walking Tour & Sacré-Cœur",
    description:
      "Explore the artistic neighborhood of Montmartre with a local guide. Visit Sacré-Cœur Basilica and discover hidden gems.",
    imageUrl:
      "https://images.unsplash.com/photo-1550340499-a6c60fc8287c?w=400&h=300&fit=crop",
    duration: 120,
    rating: 4.9,
    reviewCount: 3456,
    price: { amount: 35, currency: "EUR" },
    bookingUrl: "https://viator.com/montmartre",
    viatorProductCode: "MONT-001",
    tags: ["Walking Tour", "Art", "History", "Outdoor"],
    matchScore: 85,
    bestTimeOfDay: "afternoon",
  },
  {
    id: "act-5",
    name: "French Cooking Class with Market Visit",
    description:
      "Learn to cook authentic French cuisine! Start with a market tour to select fresh ingredients, then prepare a 3-course meal.",
    imageUrl:
      "https://images.unsplash.com/photo-1556910103-1c02745aae4d?w=400&h=300&fit=crop",
    duration: 240,
    rating: 4.9,
    reviewCount: 2134,
    price: { amount: 120, currency: "EUR" },
    bookingUrl: "https://viator.com/cooking",
    viatorProductCode: "COOK-001",
    tags: ["Cooking", "Food", "Cultural", "Indoor"],
    matchScore: 78,
    bestTimeOfDay: "morning",
  },
  {
    id: "act-6",
    name: "Palace of Versailles Full-Day Tour",
    description:
      "Visit the opulent Palace of Versailles with skip-the-line access. Explore the Hall of Mirrors, Royal Apartments, and stunning gardens.",
    imageUrl:
      "https://images.unsplash.com/photo-1551410224-699683e15636?w=400&h=300&fit=crop",
    duration: 480,
    rating: 4.7,
    reviewCount: 7654,
    price: { amount: 85, currency: "EUR" },
    bookingUrl: "https://viator.com/versailles",
    viatorProductCode: "VERS-001",
    tags: ["Palace", "History", "Day Trip", "Gardens"],
    matchScore: 90,
    bestTimeOfDay: "morning",
  },
  {
    id: "act-7",
    name: "Paris Wine Tasting Experience",
    description:
      "Sample exceptional French wines in a charming cellar. Learn about wine regions, grape varieties, and perfect food pairings.",
    imageUrl:
      "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=400&h=300&fit=crop",
    duration: 90,
    rating: 4.8,
    reviewCount: 1876,
    price: { amount: 45, currency: "EUR" },
    bookingUrl: "https://viator.com/wine",
    viatorProductCode: "WINE-001",
    tags: ["Wine", "Tasting", "Adult", "Indoor"],
    matchScore: 72,
    bestTimeOfDay: "afternoon",
  },
  {
    id: "act-8",
    name: "Notre-Dame Island Walk & Hidden Paris",
    description:
      "Discover the history of Notre-Dame and explore Île de la Cité. See the reconstruction progress and find secret medieval spots.",
    imageUrl:
      "https://images.unsplash.com/photo-1478391679764-b2d8b3cd1e94?w=400&h=300&fit=crop",
    duration: 90,
    rating: 4.6,
    reviewCount: 2345,
    price: { amount: 0, currency: "EUR" },
    bookingUrl: "https://viator.com/notre-dame",
    viatorProductCode: "ND-001",
    tags: ["Walking Tour", "History", "Free", "Outdoor"],
    matchScore: 80,
    bestTimeOfDay: "afternoon",
  },
  {
    id: "act-9",
    name: "Moulin Rouge Cabaret Show with Champagne",
    description:
      "Experience the world-famous Moulin Rouge! Enjoy the spectacular 'Féerie' show with half a bottle of champagne.",
    imageUrl:
      "https://images.unsplash.com/photo-1534430480872-3498386e7856?w=400&h=300&fit=crop",
    duration: 150,
    rating: 4.5,
    reviewCount: 4567,
    price: { amount: 150, currency: "EUR" },
    bookingUrl: "https://viator.com/moulin-rouge",
    viatorProductCode: "MR-001",
    tags: ["Show", "Nightlife", "Romantic", "Entertainment"],
    matchScore: 75,
    bestTimeOfDay: "evening",
  },
  {
    id: "act-10",
    name: "Le Marais Food & History Walking Tour",
    description:
      "Taste your way through the trendy Marais district. Sample artisan cheeses, fresh baguettes, chocolates, and local delicacies.",
    imageUrl:
      "https://images.unsplash.com/photo-1549931319-a545dcf3bc73?w=400&h=300&fit=crop",
    duration: 180,
    rating: 4.9,
    reviewCount: 3210,
    price: { amount: 75, currency: "EUR" },
    bookingUrl: "https://viator.com/marais",
    viatorProductCode: "MARAIS-001",
    tags: ["Food Tour", "Walking", "Culture", "Family"],
    matchScore: 88,
    bestTimeOfDay: "morning",
  },
  {
    id: "act-11",
    name: "Luxembourg Gardens Picnic Experience",
    description:
      "Enjoy a curated French picnic in the beautiful Luxembourg Gardens. Includes wine, cheese, charcuterie, and pastries.",
    imageUrl:
      "https://images.unsplash.com/photo-1520877880798-5ee004e3f11e?w=400&h=300&fit=crop",
    duration: 120,
    rating: 4.7,
    reviewCount: 987,
    price: { amount: 55, currency: "EUR" },
    bookingUrl: "https://viator.com/luxembourg",
    viatorProductCode: "LUX-001",
    tags: ["Picnic", "Garden", "Relaxing", "Outdoor"],
    matchScore: 70,
    bestTimeOfDay: "afternoon",
  },
  {
    id: "act-12",
    name: "Musée d'Orsay Skip-the-Line Tour",
    description:
      "Explore the world's greatest Impressionist collection. See works by Monet, Van Gogh, Renoir, and Degas with expert commentary.",
    imageUrl:
      "https://images.unsplash.com/photo-1591289009723-aef0a1a8a211?w=400&h=300&fit=crop",
    duration: 120,
    rating: 4.8,
    reviewCount: 5432,
    price: { amount: 50, currency: "EUR" },
    bookingUrl: "https://viator.com/orsay",
    viatorProductCode: "ORSAY-001",
    tags: ["Museum", "Art", "Impressionism", "Indoor"],
    matchScore: 86,
    bestTimeOfDay: "afternoon",
  },
];

// Mock context for testing
const MOCK_CONTEXT: TripPlanningContext = {
  destination: "Paris, France",
  destinationId: 123,
  startDate: new Date().toISOString().split("T")[0],
  endDate: new Date(Date.now() + 4 * 24 * 60 * 60 * 1000)
    .toISOString()
    .split("T")[0],
  travelers: 2,
  adults: 2,
  children: 0,
  budget: "moderate",
  pace: "moderate",
  interests: ["Art", "Food", "History", "Culture"],
  isComplete: true,
  missingFields: [],
};

// ============================================
// Extended Props & Types
// ============================================

interface TripPlannerPaneProps {
  context?: TripPlanningContext;
  parsedItinerary?: ParsedItinerary | null;
  structuredItinerary?: StructuredItineraryData | null;
  onClose?: () => void;
  useMockData?: boolean; // Enable mock data for testing
}

// ============================================
// Main Component
// ============================================

export function TripPlannerPane({
  context: providedContext,
  parsedItinerary: _propParsedItinerary,
  structuredItinerary,
  onClose,
  useMockData = false,
}: TripPlannerPaneProps) {
  // Use mock context if testing mode is enabled
  const context = useMockData ? MOCK_CONTEXT : providedContext || MOCK_CONTEXT;
  // Core state
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [activities, setActivities] = useState<ViatorActivitySuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [schedule, setSchedule] = useState<DaySchedule[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);

  // UI state
  const [expandedSection, setExpandedSection] = useState<string | null>(
    "travelers"
  );
  const [showSettings, setShowSettings] = useState(false);

  // Traveler settings
  const [travelerSettings, setTravelerSettings] = useState<TravelerSettings>({
    adults: context.adults || 2,
    children: context.children || 0,
    childrenAges: context.childrenAges || [],
    tripMode: "couples",
    hasSeniors: false,
    hasInfants: false,
  });

  // Preference settings
  const [preferences, setPreferences] = useState<PreferenceSettings>({
    paceMode: (context.pace as PaceMode) || "normal",
    budgetMode: "moderate",
    walkingTolerance: "medium",
    dietaryOptions: [],
    needsAccessibility: false,
    rainPlanEnabled: true,
  });

  // Weather data (mock for now)
  const [weather, setWeather] = useState<WeatherData | null>(null);

  // Energy tracking
  const [energyLevel, setEnergyLevel] = useState<EnergyLevel>("high");
  const [showEnergyCheckIn, setShowEnergyCheckIn] = useState(false);

  // Nudges
  const [nudges, setNudges] = useState<Nudge[]>([]);

  // Generation state
  const [generationStatus, setGenerationStatus] =
    useState<GenerationStatus>("idle");
  const [generationError, setGenerationError] = useState<string | null>(null);

  // Commute info for displayed activities
  const [, setCommuteInfo] = useState<Map<string, CommuteDisplayInfo>>(
    new Map()
  );

  // Swipe selection mode
  const [isSwipeMode, setIsSwipeMode] = useState(false);
  const [selectionSlots, setSelectionSlots] = useState<SelectionSlot[]>([]);

  // New itinerary API state
  const [generatedItineraryId, setGeneratedItineraryId] = useState<
    string | null
  >(null);
  const [, setGeneratedSchedule] = useState<GeneratedItinerary | null>(null);

  // Swap modal state
  const [swapModalState, setSwapModalState] = useState<{
    isOpen: boolean;
    slotId: string | null;
    currentActivity: ViatorActivitySuggestion | null;
    options: SwapOption[];
    isLoading: boolean;
  }>({
    isOpen: false,
    slotId: null,
    currentActivity: null,
    options: [],
    isLoading: false,
  });

  // Undo toast state
  const [undoToastState, setUndoToastState] = useState<{
    isVisible: boolean;
    message: string;
  }>({
    isVisible: false,
    message: "",
  });

  // Venue Monitoring Hook
  const venueMonitoring = useVenueMonitoring(generatedItineraryId || undefined);

  // Notifications Hook
  const notificationService = useNotifications();

  // Drag-and-drop mode state (used for default view mode in UnifiedItineraryView)
  const [isDragDropMode, setIsDragDropMode] = useState(false);

  // Reshuffling hook
  const reshuffling = useReshuffling({
    tripId: generatedItineraryId || "pending",
    dayIndex: selectedDayIndex,
    autoCheckInterval: 0, // Disabled auto-check for now
    onScheduleUpdate: useCallback((changes: ScheduleChange[]) => {
      console.log("Schedule updated with changes:", changes);
      setUndoToastState({
        isVisible: true,
        message: `Schedule adjusted: ${changes.length} change${
          changes.length !== 1 ? "s" : ""
        } applied`,
      });
    }, []),
    onUndoExpired: useCallback(() => {
      console.log("Undo window expired");
    }, []),
  });

  // Get parsed itinerary from store
  const { parsedItinerary } = useTripStore();

  // Calculate trip days
  const tripDays =
    context.startDate && context.endDate
      ? generateDateRange(context.startDate, context.endDate).length
      : 0;

  // Generate full itinerary using the new orchestrator API
  const generateFullItinerary = useCallback(async () => {
    if (!context.isComplete || !context.destination) return;

    setGenerationStatus("generating");
    setGenerationError(null);

    try {
      // Prepare request for the new itinerary generation API
      const requestBody = {
        destination: {
          name: context.destination,
          coordinates: {
            lat: 35.6762, // TODO: Get actual coordinates from destination lookup
            lng: 139.6503,
          },
          country: "Japan", // TODO: Extract from destination
        },
        startDate: context.startDate,
        endDate: context.endDate,
        travelers: {
          adults: travelerSettings.adults,
          children: travelerSettings.children,
          infants: travelerSettings.hasInfants ? 1 : 0,
        },
        tripMode: travelerSettings.tripMode,
        pace: preferences.paceMode,
        budget:
          preferences.budgetMode === "free-first"
            ? "budget"
            : preferences.budgetMode === "splurge-once-a-day"
            ? "luxury"
            : "moderate",
        interests: context.interests || [],
        dietaryRestrictions: preferences.dietaryOptions,
        mobilityNeeds: preferences.needsAccessibility ? ["wheelchair"] : [],
        groundEntities: true, // Enable entity grounding for real bookings
      };

      const response = await fetch("/api/itinerary/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error?.message || "Failed to generate itinerary"
        );
      }

      const data = await response.json();

      if (data.success && data.data?.itinerary) {
        const generatedItinerary = data.data.itinerary as GeneratedItinerary;

        // Store the itinerary ID and schedule
        setGeneratedItineraryId(generatedItinerary.id);
        setGeneratedSchedule(generatedItinerary);

        // Convert the new schedule format to the existing DaySchedule format for compatibility
        // This bridges the new API with the existing UI
        const newSchedule = generatedItinerary.days.map(
          (day: GeneratedDayScheduleType, dayIndex: number) => {
            const slots =
              day.slots?.map((slot: ScheduledActivity) => {
                const activityData = slot.activity;
                const coreActivity = activityData?.activity;
                return {
                  id: slot.slotId,
                  timeSlot: {
                    label: slot.scheduledStart,
                    startTime: slot.scheduledStart,
                    endTime: slot.scheduledEnd,
                  } as TimeSlot,
                  isPlaceholder: !activityData,
                  activity: coreActivity
                    ? {
                        id: coreActivity.id,
                        name: coreActivity.name,
                        description: coreActivity.description,
                        duration: coreActivity.recommendedDuration || 90,
                        imageUrl:
                          coreActivity.imageUrl ||
                          "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=400&h=300&fit=crop",
                        rating: coreActivity.rating,
                        reviewCount: coreActivity.reviewCount,
                        price: (
                          coreActivity as unknown as {
                            price?: { amount: number; currency: string };
                          }
                        ).price,
                        bookingUrl: (
                          coreActivity as unknown as {
                            bookingInfo?: { bookingUrl?: string };
                          }
                        ).bookingInfo?.bookingUrl,
                        viatorProductCode: (
                          coreActivity as unknown as {
                            viatorProductCode?: string;
                          }
                        ).viatorProductCode,
                      }
                    : undefined,
                };
              }) || [];

            return {
              date: day.date,
              dayNumber: dayIndex + 1,
              title: `Day ${dayIndex + 1}`,
              slots,
            };
          }
        );

        setSchedule(newSchedule);
        setGenerationStatus("complete");

        // Generate commute info from the schedule
        const commuteMap = new Map<string, CommuteDisplayInfo>();
        generatedItinerary.days.forEach((day: GeneratedDayScheduleType) => {
          const daySlots = day.slots || [];
          for (let i = 0; i < daySlots.length - 1; i++) {
            const fromSlot = daySlots[i];
            const toSlot = daySlots[i + 1];
            if (
              fromSlot.activity &&
              toSlot.activity &&
              toSlot.commuteFromPrevious
            ) {
              const commute = toSlot.commuteFromPrevious;
              const commuteMethod =
                (commute as unknown as { method?: string }).method || "walk";
              commuteMap.set(`${fromSlot.slotId}-${toSlot.slotId}`, {
                fromSlotId: fromSlot.slotId,
                toSlotId: toSlot.slotId,
                durationMinutes: commute.durationMinutes,
                method: commuteMethod as CommuteMethod,
                distanceMeters: commute.distanceMeters,
                estimatedCost: commute.estimatedCost,
              });
            }
          }
        });
        setCommuteInfo(commuteMap);
      } else {
        throw new Error(
          data.error?.message || "Unknown error generating itinerary"
        );
      }
    } catch (error) {
      console.error("Failed to generate itinerary:", error);
      setGenerationError(
        error instanceof Error ? error.message : "Failed to generate itinerary"
      );
      setGenerationStatus("error");
    }
  }, [context, travelerSettings, preferences]);

  // Handle opening the swap modal for a specific slot
  const handleOpenSwapModal = useCallback(
    async (slotId: string, currentActivity: ViatorActivitySuggestion) => {
      if (!generatedItineraryId) {
        console.error("No itinerary ID available for swap");
        return;
      }

      setSwapModalState((prev) => ({
        ...prev,
        isOpen: true,
        slotId,
        currentActivity,
        isLoading: true,
        options: [],
      }));

      try {
        const response = await fetch(
          `/api/itinerary/${generatedItineraryId}/slot/${slotId}`
        );

        if (!response.ok) {
          throw new Error("Failed to fetch swap options");
        }

        const data = await response.json();

        if (data.success && data.data?.alternatives) {
          const options: SwapOption[] = data.data.alternatives.map(
            (alt: {
              activityId: string;
              name: string;
              description: string;
              category: string;
              score: number;
              reason: string;
              benefits: string[];
              tradeoffs: string[];
              commuteFromPrevious?: {
                durationMinutes: number;
                method: CommuteMethod;
                distanceMeters: number;
              };
              commuteToNext?: {
                durationMinutes: number;
                method: CommuteMethod;
                distanceMeters: number;
              };
            }) => ({
              id: alt.activityId,
              name: alt.name,
              description: alt.description,
              category: alt.category,
              score: alt.score,
              reason: alt.reason,
              benefits: alt.benefits,
              tradeoffs: alt.tradeoffs,
              commuteFromPrevious: alt.commuteFromPrevious,
              commuteToNext: alt.commuteToNext,
            })
          );

          setSwapModalState((prev) => ({
            ...prev,
            options,
            isLoading: false,
          }));
        } else {
          throw new Error(data.error?.message || "Failed to load alternatives");
        }
      } catch (error) {
        console.error("Error fetching swap options:", error);
        setSwapModalState((prev) => ({
          ...prev,
          isLoading: false,
        }));
      }
    },
    [generatedItineraryId]
  );

  // Execute a swap
  const handleExecuteSwap = useCallback(
    async (newActivityId: string) => {
      if (!generatedItineraryId || !swapModalState.slotId) {
        console.error("Missing itinerary ID or slot ID");
        return;
      }

      try {
        const response = await fetch(
          `/api/itinerary/${generatedItineraryId}/slot/${swapModalState.slotId}`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ newActivityId }),
          }
        );

        if (!response.ok) {
          throw new Error("Failed to execute swap");
        }

        const data = await response.json();

        if (data.success && data.data?.itinerary) {
          const updatedItinerary = data.data.itinerary as GeneratedItinerary;
          setGeneratedSchedule(updatedItinerary);

          // Update the local schedule state to reflect the swap
          const newSchedule = updatedItinerary.days.map(
            (day: GeneratedDayScheduleType, dayIndex: number) => {
              const slots =
                day.slots?.map((slot: ScheduledActivity) => {
                  const activityData = slot.activity;
                  const coreActivity = activityData?.activity;
                  return {
                    id: slot.slotId,
                    timeSlot: {
                      label: slot.scheduledStart,
                      startTime: slot.scheduledStart,
                      endTime: slot.scheduledEnd,
                    } as TimeSlot,
                    isPlaceholder: !activityData,
                    activity: coreActivity
                      ? {
                          id: coreActivity.id,
                          name: coreActivity.name,
                          description: coreActivity.description,
                          duration: coreActivity.recommendedDuration || 90,
                          imageUrl:
                            coreActivity.imageUrl ||
                            "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=400&h=300&fit=crop",
                          rating: coreActivity.rating,
                          reviewCount: coreActivity.reviewCount,
                          price: (
                            coreActivity as unknown as {
                              price?: { amount: number; currency: string };
                            }
                          ).price,
                          bookingUrl: (
                            coreActivity as unknown as {
                              bookingInfo?: { bookingUrl?: string };
                            }
                          ).bookingInfo?.bookingUrl,
                          viatorProductCode: (
                            coreActivity as unknown as {
                              viatorProductCode?: string;
                            }
                          ).viatorProductCode,
                        }
                      : undefined,
                  };
                }) || [];

              return {
                date: day.date,
                dayNumber: dayIndex + 1,
                title: `Day ${dayIndex + 1}`,
                slots,
              };
            }
          );

          setSchedule(newSchedule);

          // Close the modal
          setSwapModalState({
            isOpen: false,
            slotId: null,
            currentActivity: null,
            options: [],
            isLoading: false,
          });
        } else {
          throw new Error(data.error?.message || "Swap failed");
        }
      } catch (error) {
        console.error("Error executing swap:", error);
      }
    },
    [generatedItineraryId, swapModalState.slotId]
  );

  // Close swap modal
  const handleCloseSwapModal = useCallback(() => {
    setSwapModalState({
      isOpen: false,
      slotId: null,
      currentActivity: null,
      options: [],
      isLoading: false,
    });
  }, []);

  // Convert schedule to SelectionSlots for swipe mode
  const convertToSelectionSlots = useCallback((): SelectionSlot[] => {
    const slots: SelectionSlot[] = [];
    const currentDay = schedule[selectedDayIndex];

    schedule.forEach((day, dayIndex) => {
      day.slots.forEach((slot) => {
        // Get suggestions for this slot and score them
        const suggestions = activities
          .map((activity) => ({
            ...activity,
            matchScore: matchActivityToSlot(activity, slot.timeSlot),
          }))
          .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
          .slice(0, 8);

        // Convert to ScoredActivityOption format
        const options: ScoredActivityOption[] = suggestions.map((activity) => {
          const score = activity.matchScore || 50;
          return {
            activity,
            score,
            scoreBreakdown: {
              interestMatch: Math.round(score * 0.3),
              timeOfDayFit: Math.round(score * 0.2),
              durationFit: Math.round(score * 0.15),
              budgetMatch: Math.round(score * 0.15),
              locationProximity: Math.round(score * 0.1),
              varietyBonus: Math.round(score * 0.1),
            },
            explanation: generateExplanation(
              activity,
              slot.timeSlot,
              travelerSettings,
              preferences
            ),
            tags: activity.tags || [],
          };
        });

        slots.push({
          id: slot.id,
          dayNumber: dayIndex + 1,
          date: currentDay?.date || new Date().toISOString().split("T")[0],
          timeSlot: slot.timeSlot,
          options,
          selectedOption: null,
          status: "pending",
        });
      });
    });

    return slots;
  }, [schedule, activities, travelerSettings, preferences, selectedDayIndex]);

  // Generate explanation for why an activity matches
  const generateExplanation = (
    activity: ViatorActivitySuggestion,
    timeSlot: TimeSlot,
    travelers: TravelerSettings,
    prefs: PreferenceSettings
  ): string => {
    const reasons: string[] = [];

    if (activity.rating && activity.rating >= 4.5) {
      reasons.push(`Highly rated (${activity.rating.toFixed(1)}⭐)`);
    }

    if (
      timeSlot.label === "Morning" &&
      activity.tags?.some((t) => t.toLowerCase().includes("tour"))
    ) {
      reasons.push("Perfect for morning exploration");
    }

    if (
      travelers.children > 0 &&
      activity.tags?.some((t) => t.toLowerCase().includes("family"))
    ) {
      reasons.push("Great for families with kids");
    }

    if (prefs.budgetMode === "free-first" && activity.price?.amount === 0) {
      reasons.push("Free activity - matches your budget preference");
    }

    if (activity.duration <= 120 && prefs.paceMode === "relaxed") {
      reasons.push("Short duration fits relaxed pace");
    }

    if (reasons.length === 0) {
      const mainTag = activity.tags?.[0] || "activity";
      reasons.push(`Popular ${mainTag} in the area`);
    }

    return reasons.slice(0, 2).join(". ") + ".";
  };

  // Handle entering swipe mode
  const handleStartSwipeMode = useCallback(() => {
    const slots = convertToSelectionSlots();
    if (slots.length > 0) {
      setSelectionSlots(slots);
      setIsSwipeMode(true);
    }
  }, [convertToSelectionSlots]);

  // Handle swipe mode plan updates (dynamic rescoring)
  const handleSwipePlanUpdate = useCallback((updatedSlots: SelectionSlot[]) => {
    setSelectionSlots(updatedSlots);
    // In a real implementation, we would rescore remaining options
    // based on the selections made (e.g., avoid duplicates, balance neighborhoods)
  }, []);

  // Handle swipe session completion - receives final session from the hook
  const handleSwipeSessionComplete = useCallback(
    (finalSession: SelectionSession) => {
      console.log("=== SWIPE SESSION COMPLETE ===");
      console.log("Final session:", finalSession);
      console.log("Session slots:", finalSession?.slots?.length);

      // Use the session's slots which have the actual selections
      const slotsWithSelections = finalSession?.slots || [];

      const selectedSlots = slotsWithSelections.filter((s) => s.selectedOption);
      console.log("Selected slots count:", selectedSlots.length);

      if (selectedSlots.length === 0) {
        console.log("No selections made, exiting swipe mode");
        setIsSwipeMode(false);
        return;
      }

      // Build a map of selections by day and slot ID for efficient lookup
      const selectionsMap = new Map<string, SelectionSlot>();
      selectedSlots.forEach((slot) => {
        selectionsMap.set(`${slot.dayNumber}-${slot.id}`, slot);
      });

      console.log("Selections map:", Array.from(selectionsMap.keys()));

      // Create a completely new schedule with immutable updates
      const newSchedule = schedule.map((day, dayIdx) => {
        const dayNumber = dayIdx + 1;

        // Check if any slots in this day have selections
        const dayHasSelections = day.slots.some((slot) =>
          selectionsMap.has(`${dayNumber}-${slot.id}`)
        );

        if (!dayHasSelections) {
          return day; // No changes to this day
        }

        // Create new day with updated slots
        return {
          ...day,
          slots: day.slots.map((slot) => {
            const selectionKey = `${dayNumber}-${slot.id}`;
            const selection = selectionsMap.get(selectionKey);

            if (!selection || !selection.selectedOption) {
              return slot; // No selection for this slot
            }

            const activity = selection.selectedOption.activity;
            console.log(
              `Updating slot ${slot.id} with activity: ${activity.name}`
            );

            // Return new slot object with activity
            return {
              ...slot,
              isPlaceholder: false,
              activity: {
                id: activity.id,
                name: activity.name,
                description: activity.description,
                duration: activity.duration,
                imageUrl: activity.imageUrl,
                rating: activity.rating,
                reviewCount: activity.reviewCount,
                price: activity.price,
                bookingUrl: activity.bookingUrl,
                viatorProductCode: activity.viatorProductCode,
              },
            };
          }),
        };
      });

      console.log("New schedule created, updating state...");

      // Update state
      setSchedule(newSchedule);
      setIsSwipeMode(false);
      setSelectionSlots([]); // Clear selection slots
      setGenerationStatus("complete");

      console.log("=== STATE UPDATED ===");
    },
    [schedule]
  );

  // Infer trip mode from context
  useEffect(() => {
    let mode: TripMode = "couples";
    if (
      context.hasFamilyWithKids ||
      (context.children && context.children > 0)
    ) {
      mode = "family";
    } else if (context.adults === 1 && !context.children) {
      mode = "solo";
    } else if (context.specialOccasion?.toLowerCase().includes("honeymoon")) {
      mode = "honeymoon";
    }
    setTravelerSettings((prev) => ({ ...prev, tripMode: mode }));
  }, [context]);

  // Generate day schedules when context changes
  useEffect(() => {
    if (context.startDate && context.endDate) {
      const dates = generateDateRange(context.startDate, context.endDate);
      const pace = context.pace || "moderate";
      const daySchedules = dates.map((date, i) =>
        createEmptyDaySchedule(date, i + 1, pace)
      );
      setSchedule(daySchedules);
    }
  }, [context.startDate, context.endDate, context.pace]);

  // Fetch Viator activities when destination is set
  useEffect(() => {
    if (context.destination && context.isComplete) {
      fetchActivities();
    }
  }, [context.destination, context.isComplete]);

  // Fetch mock weather
  useEffect(() => {
    if (context.destination && context.startDate) {
      setWeather({
        condition: "sunny",
        temperature: { min: 12, max: 22 },
        precipitationProbability: 15,
        humidity: 55,
      });
    }
  }, [context.destination, context.startDate]);

  // Generate sample nudges based on context
  useEffect(() => {
    const sampleNudges: Nudge[] = [];
    if (weather && weather.precipitationProbability > 50) {
      sampleNudges.push({
        id: "rain-warning",
        type: "weather-change",
        priority: "important",
        title: "Rain Expected",
        body: "Consider indoor alternatives for outdoor activities.",
        dismissable: true,
      });
    }
    if (travelerSettings.children > 0) {
      sampleNudges.push({
        id: "family-tip",
        type: "info" as NudgeType,
        priority: "info",
        title: "Family Tip",
        body: "Kid-friendly activities are marked with a 👨‍👩‍👧 icon.",
        dismissable: true,
      });
    }
    setNudges(sampleNudges);
  }, [weather, travelerSettings]);

  // Convert venue monitoring alerts to nudges
  useEffect(() => {
    if (venueMonitoring.alerts.length > 0) {
      const venueNudges: Nudge[] = venueMonitoring.alerts.map((alert) => ({
        id: alert.id,
        type: "venue-closure" as NudgeType,
        priority: alert.severity === "critical" ? "critical" : "important",
        title: alert.alertType === "closure" ? "Venue Closed" : "Venue Alert",
        body: alert.message,
        dismissable: true,
      }));
      setNudges((prev) => {
        // Filter out old venue alerts and add new ones
        const nonVenueNudges = prev.filter((n) => !n.id.startsWith("alert_"));
        return [...nonVenueNudges, ...venueNudges];
      });
    }
  }, [venueMonitoring.alerts]);

  // Request notification permission on mount
  useEffect(() => {
    if (generatedItineraryId) {
      notificationService.requestPermission();
    }
  }, [generatedItineraryId, notificationService]);

  // Drag-and-drop handlers
  const handleDayReorder = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (!generatedItineraryId) return;
      try {
        await fetch(`/api/trips/${generatedItineraryId}/days`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "reorder_days",
            data: { oldIndex: fromIndex, newIndex: toIndex },
          }),
        });
        // Refresh schedule after reorder
        const newSchedule = [...schedule];
        const [removed] = newSchedule.splice(fromIndex, 1);
        newSchedule.splice(toIndex, 0, removed);
        // Update day numbers
        newSchedule.forEach((day, i) => {
          day.dayNumber = i + 1;
        });
        setSchedule(newSchedule);
      } catch (error) {
        console.error("Failed to reorder days:", error);
      }
    },
    [generatedItineraryId, schedule]
  );

  const handleActivityReorder = useCallback(
    async (dayIndex: number, fromSlotIndex: number, toSlotIndex: number) => {
      if (!generatedItineraryId) return;
      const day = schedule[dayIndex];
      if (!day) return;

      try {
        const slotIds = day.slots.map((s) => s.id);
        // Reorder in the array
        const [removed] = slotIds.splice(fromSlotIndex, 1);
        slotIds.splice(toSlotIndex, 0, removed);

        await fetch(`/api/trips/${generatedItineraryId}/days`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "reorder_activities",
            data: { dayIndex, slotIds },
          }),
        });

        // Update local state
        const newSchedule = [...schedule];
        const daySlots = [...newSchedule[dayIndex].slots];
        const [removedSlot] = daySlots.splice(fromSlotIndex, 1);
        daySlots.splice(toSlotIndex, 0, removedSlot);
        newSchedule[dayIndex] = { ...newSchedule[dayIndex], slots: daySlots };
        setSchedule(newSchedule);
      } catch (error) {
        console.error("Failed to reorder activities:", error);
      }
    },
    [generatedItineraryId, schedule]
  );

  const handleMoveActivityToDay = useCallback(
    async (
      _activityId: string,
      sourceDayIndex: number,
      sourceSlotIndex: number,
      targetDayIndex: number
    ) => {
      if (!generatedItineraryId) return;
      const sourceDay = schedule[sourceDayIndex];
      if (!sourceDay || !sourceDay.slots[sourceSlotIndex]) return;

      try {
        const slotId = sourceDay.slots[sourceSlotIndex].id;
        await fetch(`/api/trips/${generatedItineraryId}/days`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "move_activity",
            data: {
              slotId,
              fromDayIndex: sourceDayIndex,
              toDayIndex: targetDayIndex,
            },
          }),
        });

        // Update local state
        const newSchedule = [...schedule];
        const [movedSlot] = newSchedule[sourceDayIndex].slots.splice(
          sourceSlotIndex,
          1
        );
        newSchedule[targetDayIndex].slots.push(movedSlot);
        setSchedule(newSchedule);
      } catch (error) {
        console.error("Failed to move activity:", error);
      }
    },
    [generatedItineraryId, schedule]
  );

  const fetchActivities = async () => {
    if (!context.destination) return;

    setIsLoading(true);
    try {
      // Use mock data when testing
      if (useMockData) {
        // Simulate a brief loading delay
        await new Promise((resolve) => setTimeout(resolve, 500));
        setActivities(MOCK_ACTIVITIES);
        return;
      }

      const response = await fetch("/api/trip-activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          destination: context.destination,
          startDate: context.startDate,
          endDate: context.endDate,
          interests: context.interests,
          count: 30,
        }),
      });

      const data = await response.json();
      if (data.success && data.data?.activities) {
        setActivities(data.data.activities);
      }
    } catch (error) {
      console.error("Failed to fetch activities:", error);
      // Fallback to mock data on error if in mock mode
      if (useMockData) {
        setActivities(MOCK_ACTIVITIES);
      }
    } finally {
      setIsLoading(false);
    }
  };

  // Get current day schedule
  const currentDay = schedule[selectedDayIndex];

  // Get suggested activities for a specific slot
  const getSuggestionsForSlot = useMemo(() => {
    return (slot: TimeSlot): ViatorActivitySuggestion[] => {
      return activities
        .map((activity) => ({
          ...activity,
          matchScore: matchActivityToSlot(activity, slot),
        }))
        .sort((a, b) => (b.matchScore || 0) - (a.matchScore || 0))
        .slice(0, 5);
    };
  }, [activities]);

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const dismissNudge = useCallback((nudgeId: string) => {
    setNudges((prev) => prev.filter((n) => n.id !== nudgeId));
  }, []);

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  // ============================================
  // Render
  // ============================================

  // Use selection session hook when in swipe mode
  const {
    session,
    handleSwipe,
    handleUndo,
    handleSlotComplete,
    // handleSessionComplete is available for programmatic session management
  } = useSelectionSession(selectionSlots, handleSwipePlanUpdate);

  // Render swipe mode if active
  if (isSwipeMode && selectionSlots.length > 0) {
    return (
      <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
        {/* Back button */}
        <div className="flex-shrink-0 p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsSwipeMode(false)}
            className="flex items-center gap-2"
          >
            <ChevronLeft className="w-4 h-4" />
            Back to Planner
          </Button>
        </div>

        {/* Activity Selection Flow */}
        <div className="flex-1 overflow-hidden">
          <ActivitySelectionFlow
            session={session}
            onSwipe={handleSwipe}
            onSlotComplete={handleSlotComplete}
            onSessionComplete={handleSwipeSessionComplete}
            onUndo={handleUndo}
            tripMode={travelerSettings.tripMode}
            paceMode={preferences.paceMode}
            hasChildren={travelerSettings.children > 0}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header with Trip Summary */}
      <TripHeader
        context={context}
        tripDays={tripDays}
        weather={weather}
        onClose={onClose}
        onSettingsClick={() => setShowSettings(!showSettings)}
      />

      {/* Settings Panel (Collapsible) */}
      <AnimatePresence>
        {showSettings && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-b border-gray-200 dark:border-gray-700"
          >
            <div className="p-4 bg-white dark:bg-gray-800 space-y-4">
              {/* Travelers Section */}
              <CollapsibleSection
                title="Travelers"
                icon={<Users className="w-4 h-4" />}
                isExpanded={expandedSection === "travelers"}
                onToggle={() => toggleSection("travelers")}
              >
                <TravelerSettingsPanel
                  settings={travelerSettings}
                  onChange={setTravelerSettings}
                />
              </CollapsibleSection>

              {/* Preferences Section */}
              <CollapsibleSection
                title="Trip Preferences"
                icon={<Settings2 className="w-4 h-4" />}
                isExpanded={expandedSection === "preferences"}
                onToggle={() => toggleSection("preferences")}
              >
                <PreferencesPanel
                  preferences={preferences}
                  onChange={setPreferences}
                />
              </CollapsibleSection>

              {/* Dietary & Accessibility */}
              <CollapsibleSection
                title="Dietary & Accessibility"
                icon={<UtensilsCrossed className="w-4 h-4" />}
                isExpanded={expandedSection === "dietary"}
                onToggle={() => toggleSection("dietary")}
              >
                <DietaryAccessibilityPanel
                  preferences={preferences}
                  onChange={setPreferences}
                />
              </CollapsibleSection>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Nudges/Alerts Panel */}
      {nudges.length > 0 && (
        <NudgesPanel nudges={nudges} onDismiss={dismissNudge} />
      )}

      {/* Energy Check-In Button */}
      <EnergyCheckInBar
        energyLevel={energyLevel}
        onCheckIn={() => setShowEnergyCheckIn(true)}
      />

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

      {/* Day Selector */}
      {schedule.length > 0 && (
        <DaySelector
          schedule={schedule}
          selectedDayIndex={selectedDayIndex}
          onSelectDay={setSelectedDayIndex}
          formatDate={formatDate}
          currentDay={currentDay}
        />
      )}

      {/* Timeline - Show structured itinerary, parsed itinerary, or activity slots */}
      <div className="flex-1 overflow-y-auto">
        {/* Priority 1: Show structured itinerary (new Phase 1 format) */}
        {structuredItinerary ? (
          <div className="p-4">
            <UnifiedItineraryView
              itinerary={structuredItinerary}
              onItineraryChange={(updated) => {
                console.log("Itinerary updated:", updated);
              }}
              defaultViewMode={isDragDropMode ? "list" : "tabbed"}
              enableReordering={true}
            />
          </div>
        ) : parsedItinerary && parsedItinerary.isComplete ? (
          <div className="p-4">
            <ParsedItineraryView
              itinerary={parsedItinerary}
              selectedDayIndex={selectedDayIndex}
              viatorActivities={activities}
              travelerSettings={travelerSettings}
              preferences={preferences}
            />
          </div>
        ) : isLoading && activities.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Loader2 className="w-8 h-8 animate-spin mb-3" />
            <p className="text-sm">Loading activities...</p>
          </div>
        ) : currentDay ? (
          <div className="p-4 space-y-3">
            {currentDay.slots.map((slot) => (
              <TimeSlotCard
                key={slot.id}
                slot={slot}
                isSelected={selectedSlotId === slot.id}
                onSelect={() =>
                  setSelectedSlotId(slot.id === selectedSlotId ? null : slot.id)
                }
                suggestions={getSuggestionsForSlot(slot.timeSlot)}
                travelerSettings={travelerSettings}
                preferences={preferences}
                canSwap={!!generatedItineraryId}
                onSwap={handleOpenSwapModal}
                onAddActivity={(activity) => {
                  setSchedule((prev) =>
                    prev.map((day, i) =>
                      i === selectedDayIndex
                        ? {
                            ...day,
                            slots: day.slots.map((s) =>
                              s.id === slot.id
                                ? {
                                    ...s,
                                    isPlaceholder: false,
                                    activity: {
                                      id: activity.id,
                                      name: activity.name,
                                      description: activity.description,
                                      duration: activity.duration,
                                      imageUrl: activity.imageUrl,
                                      rating: activity.rating,
                                      reviewCount: activity.reviewCount,
                                      price: activity.price,
                                      bookingUrl: activity.bookingUrl,
                                      viatorProductCode:
                                        activity.viatorProductCode,
                                    },
                                  }
                                : s
                            ),
                          }
                        : day
                    )
                  );
                  setSelectedSlotId(null);
                }}
              />
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center h-64 text-gray-500">
            <Calendar className="w-8 h-8 mb-3 opacity-50" />
            <p className="text-sm">Set your travel dates to see the schedule</p>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        {/* Generation Status */}
        {generationStatus === "generating" && (
          <div className="mb-3 flex items-center justify-center gap-2 text-purple-600 dark:text-purple-400">
            <Loader2 className="w-4 h-4 animate-spin" />
            <span className="text-sm">
              Generating your personalized itinerary...
            </span>
          </div>
        )}
        {generationStatus === "complete" && (
          <div className="mb-3 flex items-center justify-center gap-2 text-green-600 dark:text-green-400">
            <Check className="w-4 h-4" />
            <span className="text-sm">
              Itinerary generated! Scroll up to view.
            </span>
          </div>
        )}
        {generationStatus === "error" && generationError && (
          <div className="mb-3 flex items-center justify-center gap-2 text-red-600 dark:text-red-400">
            <AlertTriangle className="w-4 h-4" />
            <span className="text-sm">{generationError}</span>
          </div>
        )}

        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <span className="text-gray-500">
              {activities.length} activities available
            </span>
            {preferences.rainPlanEnabled &&
              weather &&
              weather.precipitationProbability > 30 && (
                <span className="flex items-center gap-1 text-blue-500 text-xs">
                  <Umbrella className="w-3 h-3" />
                  Rain plan active
                </span>
              )}
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleStartSwipeMode}>
              <Heart className="w-4 h-4 mr-1" />
              Swipe Mode
            </Button>
            <Button
              variant={isDragDropMode ? "primary" : "outline"}
              size="sm"
              onClick={() => setIsDragDropMode(!isDragDropMode)}
              title={
                isDragDropMode
                  ? "Exit drag-drop mode"
                  : "Enter drag-drop mode to reorder days and activities"
              }
            >
              <GripVertical className="w-4 h-4 mr-1" />
              {isDragDropMode ? "Exit Reorder" : "Reorder"}
            </Button>
            <Button variant="primary" size="sm" onClick={generateFullItinerary}>
              {generationStatus === "generating" ? (
                <>
                  <Loader2 className="w-4 h-4 mr-1 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 mr-1" />
                  Generate Full Itinerary
                </>
              )}
            </Button>
          </div>
        </div>
      </div>

      {/* Swap Options Modal */}
      {swapModalState.currentActivity && (
        <SwapOptionsModal
          isOpen={swapModalState.isOpen}
          onClose={handleCloseSwapModal}
          currentActivity={
            {
              activity: {
                id: swapModalState.currentActivity.id,
                entityIds: { internalId: swapModalState.currentActivity.id },
                source: "viator",
                name: swapModalState.currentActivity.name,
                description: swapModalState.currentActivity.description,
                category: "landmark",
                location: { lat: 0, lng: 0 },
                address: { formatted: "", city: "", country: "" },
                neighborhood: "",
                bestTimeOfDay: ["afternoon"],
                recommendedDuration: swapModalState.currentActivity.duration,
                openingHours: {
                  defaultStart: "09:00",
                  defaultEnd: "18:00",
                  schedule: {},
                },
                rating: swapModalState.currentActivity.rating,
                reviewCount: swapModalState.currentActivity.reviewCount,
                tags: swapModalState.currentActivity.tags || [],
                suitability: {
                  familyFriendly: true,
                  accessibilityLevel: "full",
                  physicalIntensity: "light",
                  seniorFriendly: true,
                },
                bookingInfo: {
                  requiresReservation: false,
                  advanceBookingDays: 0,
                  platform: "",
                  bookingUrl: swapModalState.currentActivity.bookingUrl,
                },
                price: swapModalState.currentActivity.price,
                imageUrl: swapModalState.currentActivity.imageUrl,
                viatorProductCode:
                  swapModalState.currentActivity.viatorProductCode,
              },
              totalScore: swapModalState.currentActivity.matchScore || 75,
              matchScore: swapModalState.currentActivity.matchScore || 75,
              scoreBreakdown: {
                interestMatch: 20,
                timeOfDayFit: 15,
                durationFit: 12,
                budgetMatch: 12,
                weatherFit: 8,
                varietyBonus: 8,
                ratingBonus: 0,
                modeAdjustment: 0,
              },
              alternativePool: [],
              rejectedActivities: [],
            } as unknown as ScoredActivity
          }
          options={swapModalState.options.map((opt) => ({
            activity: opt.activity || ({} as ScoredActivity),
            reason: opt.reason || "",
            scoreImprovement: (opt as unknown as { score?: number }).score || 0,
          }))}
          onSwap={(activity) => handleExecuteSwap(activity.activity.id)}
          isLoading={swapModalState.isLoading}
        />
      )}

      {/* Reshuffling Modal */}
      <ReshuffleModal
        isOpen={reshuffling.showModal}
        onClose={reshuffling.dismissModal}
        onApply={(result: ReshuffleResult) =>
          reshuffling.applyReshuffle(result)
        }
        onReject={reshuffling.rejectReshuffle}
        trigger={reshuffling.state.currentTrigger}
        impact={reshuffling.state.impact}
        suggestedResult={reshuffling.state.suggestedResult}
        alternatives={reshuffling.state.alternatives}
        autoApplyCountdown={reshuffling.autoApplyCountdown}
        isProcessing={reshuffling.state.isApplying}
      />

      {/* Undo Toast */}
      <UndoToast
        isVisible={undoToastState.isVisible}
        message={undoToastState.message}
        onUndo={() => {
          reshuffling.undoReshuffle();
          setUndoToastState({ isVisible: false, message: "" });
        }}
        onDismiss={() => setUndoToastState({ isVisible: false, message: "" })}
        autoHideDelay={5000}
        showUndoButton={!!reshuffling.state.undoToken}
      />
    </div>
  );
}
