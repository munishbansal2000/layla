/**
 * ImprovedItineraryView Component
 *
 * A redesigned itinerary view with:
 * - Compact activity cards with smaller photos
 * - Properly sized free time slots
 * - Map markers that show slot numbers matching the list order
 * - Clean, modern aesthetic
 * - Full dynamic behaviors: undo/redo, view mode toggle, reordering, locking
 * - Chat integration for LLM-powered modifications
 * - Validation/Health scoring
 * - Impact panel for change visualization
 */

"use client";

import React, { useState, useMemo, useCallback } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import {
  MapPin,
  Clock,
  Star,
  ChevronLeft,
  ChevronRight,
  Check,
  Plus,
  Building2,
  Loader2,
  Undo2,
  Lock,
  Unlock,
  Trash2,
  GripVertical,
  List,
  LayoutGrid,
  History,
  MessageCircle,
  AlertTriangle,
  CheckCircle,
  Info,
  X,
  Lightbulb,
  Heart,
} from "lucide-react";
import dynamic from "next/dynamic";
import { cn } from "@/lib/utils";
import { selectOption } from "@/lib/structured-itinerary-parser";
import { CommuteNode } from "@/components/itinerary/CommuteNode";
import { ViatorEnhancementList } from "@/components/itinerary/ViatorEnhancementCard";
import {
  recalculateTimeSlots,
  mergeConsecutiveFreeSlots,
  parseTimeToMinutes,
  formatMinutesToTime,
  SLOT_TYPE_ORDER,
} from "@/utils/itinerary-helpers";
import { useItineraryHistory } from "../hooks";
import { useItineraryValidation } from "@/hooks/useItineraryValidation";
import { calculateImpact } from "@/utils/itinerary-validation";
import type {
  StructuredItineraryData,
  SlotWithOptions,
  DayWithOptions,
  StructuredCommuteInfo,
  ActivityOption,
  ItinerarySlotType,
} from "@/types/structured-itinerary";
import type {
  ChatState,
  UseItineraryChatReturn,
} from "@/hooks/useItineraryChat";
import type { ItineraryExecutionContext } from "../types";

// Dynamically import chat panel
const ItineraryChatPanel = dynamic(
  () =>
    import("@/components/chat/ItineraryChatPanel").then(
      (mod) => mod.ItineraryChatPanel
    ),
  {
    ssr: false,
    loading: () => <div className="p-4 text-gray-400">Loading chat...</div>,
  }
);

// Dynamically import map components
const MapContainer = dynamic(
  () => import("react-leaflet").then((mod) => mod.MapContainer),
  { ssr: false }
);
const TileLayer = dynamic(
  () => import("react-leaflet").then((mod) => mod.TileLayer),
  { ssr: false }
);
const Marker = dynamic(
  () => import("react-leaflet").then((mod) => mod.Marker),
  { ssr: false }
);
const Popup = dynamic(() => import("react-leaflet").then((mod) => mod.Popup), {
  ssr: false,
});
const Polyline = dynamic(
  () => import("react-leaflet").then((mod) => mod.Polyline),
  { ssr: false }
);

const MapUpdaterWrapper = dynamic(
  () => import("@/components/map/MapUpdaterWrapper"),
  {
    ssr: false,
  }
);

// ============================================
// TYPES
// ============================================

type ViewMode = "tabbed" | "list";

interface ValidationIssue {
  type: "error" | "warning" | "info";
  message: string;
  details?: string;
  slotId?: string;
  dayNumber?: number;
}

interface ImprovedItineraryViewProps {
  itinerary: StructuredItineraryData;
  onItineraryChange?: (updated: StructuredItineraryData) => void;
  onSelectOption?: (slotId: string, optionId: string) => void;
  onFillSlotWithActivity?: (
    dayIndex: number,
    slotId: string,
    activity: {
      name: string;
      category?: string;
      duration?: number;
      icon?: string;
      place?: {
        name: string;
        neighborhood?: string;
        rating?: number;
        coordinates?: { lat: number; lng: number };
      };
    }
  ) => void;
  className?: string;
  defaultViewMode?: ViewMode;
  enableReordering?: boolean;
  enableChat?: boolean;
  chatHook?: UseItineraryChatReturn;
  autoExpandSlotId?: string;
  onAutoExpandHandled?: () => void;
  executionContext?: ItineraryExecutionContext;
}

interface MapMarkerData {
  id: string;
  slotIndex: number;
  name: string;
  coordinates: { lat: number; lng: number };
  slotType: string;
  category: string;
}

// ============================================
// SLOT TYPE COLORS
// ============================================

const SLOT_COLORS: Record<string, { bg: string; text: string; icon: string }> =
  {
    morning: { bg: "bg-amber-100", text: "text-amber-700", icon: "🌅" },
    breakfast: { bg: "bg-orange-100", text: "text-orange-700", icon: "🥐" },
    lunch: { bg: "bg-green-100", text: "text-green-700", icon: "🍽️" },
    afternoon: { bg: "bg-blue-100", text: "text-blue-700", icon: "☀️" },
    dinner: { bg: "bg-purple-100", text: "text-purple-700", icon: "🍷" },
    evening: { bg: "bg-pink-100", text: "text-pink-700", icon: "🌙" },
  };

const MAP_MARKER_COLORS: Record<string, string> = {
  morning: "#f59e0b",
  breakfast: "#f97316",
  lunch: "#22c55e",
  afternoon: "#3b82f6",
  dinner: "#8b5cf6",
  evening: "#ec4899",
};

// ============================================
// CATEGORY IMAGES
// ============================================

const categoryImages: Record<string, string> = {
  restaurant:
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=200&h=120&fit=crop",
  cafe: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=200&h=120&fit=crop",
  temple:
    "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=200&h=120&fit=crop",
  shrine:
    "https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?w=200&h=120&fit=crop",
  museum:
    "https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=200&h=120&fit=crop",
  park: "https://images.unsplash.com/photo-1519331379826-f10be5486c6f?w=200&h=120&fit=crop",
  garden:
    "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=200&h=120&fit=crop",
  market:
    "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=200&h=120&fit=crop",
  shopping:
    "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=200&h=120&fit=crop",
  nightlife:
    "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=200&h=120&fit=crop",
  landmark:
    "https://images.unsplash.com/photo-1480796927426-f609979314bd?w=200&h=120&fit=crop",
  default:
    "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=200&h=120&fit=crop",
};

function getPlaceholderImage(category: string): string {
  const lowerCat = category.toLowerCase();
  for (const [key, url] of Object.entries(categoryImages)) {
    if (lowerCat.includes(key)) return url;
  }
  return categoryImages.default;
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ImprovedItineraryView({
  itinerary: initialItinerary,
  onItineraryChange,
  onSelectOption: externalSelectOption,
  onFillSlotWithActivity: externalFillSlot,
  className,
  defaultViewMode = "tabbed",
  enableReordering = true,
  enableChat = false,
  chatHook,
  autoExpandSlotId,
  onAutoExpandHandled,
  executionContext,
}: ImprovedItineraryViewProps) {
  // Process itinerary to ensure proper time slots
  // IMPORTANT: We do NOT recalculate times on initial load to preserve the original times from the data
  // Times are only recalculated when the user makes changes (selects options, reorders, etc.)
  const processInitialItinerary = useCallback(
    (source: StructuredItineraryData): StructuredItineraryData => {
      const result = { ...source };
      result.days = result.days.map((day) => {
        // Only merge consecutive free slots, do NOT recalculate times
        // This preserves the original time ranges from the data source
        const mergedSlots = mergeConsecutiveFreeSlots(day.slots, day.dayNumber);
        return { ...day, slots: mergedSlots };
      });
      return result;
    },
    []
  );

  // Core state - ONLY initialize from processed itinerary
  // We manage this state internally; parent changes are ignored after mount
  // to avoid resetting our cascaded changes
  const [itinerary, setItinerary] = useState(() =>
    processInitialItinerary(initialItinerary)
  );

  // Track if we've initialized to avoid re-processing on parent updates
  const [isInitialized, setIsInitialized] = useState(false);
  React.useEffect(() => {
    if (!isInitialized) {
      setIsInitialized(true);
    }
  }, [isInitialized]);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const [showMap, setShowMap] = useState(true);
  const [hoveredSlotIndex, setHoveredSlotIndex] = useState<number | null>(null);
  const [isReorderMode, setIsReorderMode] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [showChat, setShowChat] = useState(enableChat);
  const [showValidation, setShowValidation] = useState(false);

  // Track modified slots for visual feedback (auto-clear after 3 seconds)
  const [modifiedSlotIds, setModifiedSlotIds] = useState<string[]>([]);
  const trackModifiedSlot = useCallback((slotId: string) => {
    setModifiedSlotIds((prev) => [
      ...prev.filter((id) => id !== slotId),
      slotId,
    ]);
    setTimeout(() => {
      setModifiedSlotIds((prev) => prev.filter((id) => id !== slotId));
    }, 3000);
  }, []);

  // History management
  const historyManager = useItineraryHistory();

  // Validation hook
  const {
    validationState,
    healthScore,
    healthStatus,
    healthSummary,
    topIssues,
  } = useItineraryValidation(itinerary);

  // Calculate validation issues from hook data
  const validationIssues = useMemo<ValidationIssue[]>(() => {
    if (!validationState) return [];

    return validationState.violations.map((violation) => {
      let dayNumber: number | undefined;
      if (violation.affectedSlotId) {
        for (const day of itinerary.days) {
          if (day.slots.some((s) => s.slotId === violation.affectedSlotId)) {
            dayNumber = day.dayNumber;
            break;
          }
        }
      }

      return {
        type:
          violation.severity === "error"
            ? "error"
            : violation.severity === "warning"
            ? "warning"
            : "info",
        message: violation.message,
        details: violation.resolution,
        slotId: violation.affectedSlotId,
        dayNumber,
      } as ValidationIssue;
    });
  }, [validationState, itinerary.days]);

  // Calculate impact from initial state
  const impact = useMemo(() => {
    if (historyManager.history.length === 0) return null;
    return calculateImpact(initialItinerary, itinerary);
  }, [initialItinerary, itinerary, historyManager.history.length]);

  // Derive locked slots from execution context
  const lockedSlotIds = useMemo(() => {
    return executionContext?.lockedSlotIds || new Set<string>();
  }, [executionContext?.lockedSlotIds]);

  // Check if a slot is the current activity in execution mode
  const isCurrentExecutionSlot = useCallback(
    (slotId: string) => {
      return (
        executionContext?.isExecuting &&
        executionContext?.currentSlotId === slotId
      );
    },
    [executionContext?.isExecuting, executionContext?.currentSlotId]
  );

  // Get activity status from execution context
  const getActivityStatus = useCallback(
    (slotId: string) => {
      return executionContext?.activityStatuses?.get(slotId) || null;
    },
    [executionContext?.activityStatuses]
  );

  // Check if slot is locked by execution context
  const isSlotLockedByExecution = useCallback(
    (slotId: string) => {
      return lockedSlotIds.has(slotId);
    },
    [lockedSlotIds]
  );

  const activeDay = itinerary.days[activeDayIndex];

  // Extract markers with proper slot indices for the active day
  const markers = useMemo(() => {
    if (!activeDay) return [];

    const result: MapMarkerData[] = [];
    let slotIndex = 1;

    for (const slot of activeDay.slots) {
      const option = slot.selectedOptionId
        ? slot.options.find((o) => o.id === slot.selectedOptionId)
        : slot.options[0];

      if (option?.activity.place?.coordinates) {
        const coords = option.activity.place.coordinates;
        if (coords.lat !== 0 && coords.lng !== 0) {
          result.push({
            id: slot.slotId,
            slotIndex,
            name: option.activity.name,
            coordinates: coords,
            slotType: slot.slotType,
            category: option.activity.category,
          });
          slotIndex++;
        }
      }
    }

    return result;
  }, [activeDay]);

  // Calculate map center and bounds
  const mapData = useMemo(() => {
    if (markers.length === 0) {
      return { center: { lat: 35.6762, lng: 139.6503 }, bounds: null };
    }

    const lats = markers.map((m) => m.coordinates.lat);
    const lngs = markers.map((m) => m.coordinates.lng);

    const center = {
      lat: lats.reduce((a, b) => a + b, 0) / lats.length,
      lng: lngs.reduce((a, b) => a + b, 0) / lngs.length,
    };

    const minLat = Math.min(...lats);
    const maxLat = Math.max(...lats);
    const minLng = Math.min(...lngs);
    const maxLng = Math.max(...lngs);

    const latPad = (maxLat - minLat) * 0.15 || 0.01;
    const lngPad = (maxLng - minLng) * 0.15 || 0.01;

    return {
      center,
      bounds: [
        [minLat - latPad, minLng - lngPad],
        [maxLat + latPad, maxLng + lngPad],
      ] as [[number, number], [number, number]],
    };
  }, [markers]);

  // Route path for polyline
  const routePath = useMemo(() => {
    return markers.map(
      (m) => [m.coordinates.lat, m.coordinates.lng] as [number, number]
    );
  }, [markers]);

  // Undo handler - restores the previous state from history
  // The history stores fully processed states, so no need to reprocess
  const handleUndo = useCallback(() => {
    const previousState = historyManager.undo(itinerary);
    if (previousState) {
      // Create a deep copy to ensure React detects the change
      const restoredState = JSON.parse(
        JSON.stringify(previousState)
      ) as StructuredItineraryData;
      setItinerary(restoredState);
      onItineraryChange?.(restoredState);
    }
  }, [historyManager, itinerary, onItineraryChange]);

  // Redo handler
  const handleRedo = useCallback(() => {
    const nextState = historyManager.redo(itinerary);
    if (nextState) {
      const restoredState = JSON.parse(
        JSON.stringify(nextState)
      ) as StructuredItineraryData;
      setItinerary(restoredState);
      onItineraryChange?.(restoredState);
    }
  }, [historyManager, itinerary, onItineraryChange]);

  // Cascade recalculate all slot times based on activity durations
  // This ensures that when one slot changes, all subsequent slots shift accordingly
  // NOTE: Must be defined BEFORE handleSelectOption that uses it
  const cascadeRecalculateSlotTimes = useCallback(
    (slots: SlotWithOptions[], dayNumber: number): SlotWithOptions[] => {
      // Default start times for each slot type (in minutes from midnight)
      const SLOT_DEFAULT_START_TIMES: Record<string, number> = {
        morning: 9 * 60, // 09:00
        breakfast: 8 * 60, // 08:00
        lunch: 12 * 60, // 12:00
        afternoon: 14 * 60, // 14:00
        dinner: 19 * 60, // 19:00
        evening: 20 * 60, // 20:00
      };

      if (slots.length === 0) return slots;

      const result: SlotWithOptions[] = [];
      // Start tracking time from the first slot's start
      let currentEndTime = parseTimeToMinutes(
        slots[0]?.timeRange?.start || "09:00"
      );

      for (let i = 0; i < slots.length; i++) {
        const slot = slots[i];
        const isEmptySlot =
          slot.options.length === 0 || slot.slotId.startsWith("free-");

        if (isEmptySlot) {
          // For free slots, update start time to when previous activity ends
          const freeStart = currentEndTime;

          // Look for next non-empty slot to calculate end time
          const nextNonEmptySlot = slots
            .slice(i + 1)
            .find((s) => s.options.length > 0 && !s.slotId.startsWith("free-"));

          let freeEnd: number;

          if (nextNonEmptySlot) {
            // Calculate when the next activity should start (based on its slot type default time)
            const nextDefaultStart =
              SLOT_DEFAULT_START_TIMES[nextNonEmptySlot.slotType] ||
              currentEndTime;
            const commuteTime =
              nextNonEmptySlot.commuteFromPrevious?.duration || 15;
            const nextStart = Math.max(
              currentEndTime + commuteTime,
              nextDefaultStart
            );

            // Free slot fills the gap (minus commute to next activity)
            freeEnd = nextStart - commuteTime;
          } else {
            // No more activities after this free slot
            // Preserve original end time, or extend if needed
            const originalEndMinutes = parseTimeToMinutes(slot.timeRange.end);
            freeEnd = Math.max(originalEndMinutes, freeStart + 30); // At least 30 min
          }

          const freeSlotDuration = freeEnd - freeStart;

          // Only create free slot if it's at least 30 minutes
          if (freeSlotDuration >= 30) {
            result.push({
              ...slot,
              timeRange: {
                start: formatMinutesToTime(freeStart),
                end: formatMinutesToTime(freeEnd),
              },
            });
            currentEndTime = freeEnd;
          }
          // If gap is too small (< 30 min), skip the free slot - it gets absorbed
        } else {
          // Activity slot - get duration from selected option
          const selectedOption =
            slot.options.find((o) => o.id === slot.selectedOptionId) ||
            slot.options[0];
          const duration = selectedOption?.activity?.duration || 60;

          // Calculate start time
          let startTime: number;
          if (i === 0) {
            // First slot keeps its original start time
            startTime = parseTimeToMinutes(slot.timeRange.start);
          } else {
            // Subsequent slots: start after previous ends + commute
            const commuteTime = slot.commuteFromPrevious?.duration || 15;
            const earliestStart = currentEndTime + commuteTime;
            const defaultStart =
              SLOT_DEFAULT_START_TIMES[slot.slotType] || earliestStart;

            // Use the later of: earliest possible OR default time for this slot type
            // This respects meal times (lunch at 12:00, dinner at 19:00)
            startTime = Math.max(earliestStart, defaultStart);
          }

          const endTime = startTime + duration;

          result.push({
            ...slot,
            timeRange: {
              start: formatMinutesToTime(startTime),
              end: formatMinutesToTime(endTime),
            },
          });

          currentEndTime = endTime;
        }
      }

      return result;
    },
    []
  );

  // Handle option selection - with proper cascading time recalculation
  const handleSelectOption = useCallback(
    (slotId: string, optionId: string) => {
      historyManager.saveToHistory("Select activity option", itinerary);

      // Find the day and slot
      const dayIndex = itinerary.days.findIndex((day) =>
        day.slots.some((s) => s.slotId === slotId)
      );

      if (dayIndex === -1) return;

      const day = itinerary.days[dayIndex];
      const slotIndex = day.slots.findIndex((s) => s.slotId === slotId);
      const slot = day.slots[slotIndex];
      const selectedOption = slot?.options.find((o) => o.id === optionId);

      // Create a copy of all slots with updated selectedOptionId
      const updatedSlots = day.slots.map((s, idx) => {
        if (idx === slotIndex) {
          return { ...s, selectedOptionId: optionId };
        }
        return { ...s };
      });

      // Now CASCADE recalculate ALL slot times from the beginning
      const cascadedSlots = cascadeRecalculateSlotTimes(
        updatedSlots,
        day.dayNumber
      );

      const mergedSlots = mergeConsecutiveFreeSlots(
        cascadedSlots,
        day.dayNumber
      );

      // Update the itinerary
      const updatedDays = [...itinerary.days];
      updatedDays[dayIndex] = { ...day, slots: mergedSlots };
      const updated = { ...itinerary, days: updatedDays };

      setItinerary(updated);
      onItineraryChange?.(updated);
      externalSelectOption?.(slotId, optionId);
    },
    [
      itinerary,
      onItineraryChange,
      historyManager,
      externalSelectOption,
      cascadeRecalculateSlotTimes,
    ]
  );

  // Handle clear slot
  const handleClearSlot = useCallback(
    (dayIndex: number, slotId: string) => {
      historyManager.saveToHistory("Clear slot", itinerary);

      const updatedDays = [...itinerary.days];
      const day = updatedDays[dayIndex];
      const slotIndex = day.slots.findIndex((s) => s.slotId === slotId);

      if (slotIndex === -1) return;

      const originalSlot = day.slots[slotIndex];
      const clearedSlot: SlotWithOptions = {
        ...originalSlot,
        slotId: originalSlot.slotId.startsWith("free-")
          ? originalSlot.slotId
          : `free-${originalSlot.slotId}`,
        options: [],
        selectedOptionId: undefined,
        isLocked: false,
      };

      const updatedSlots = [...day.slots];
      updatedSlots[slotIndex] = clearedSlot;

      const mergedSlots = mergeConsecutiveFreeSlots(
        updatedSlots,
        day.dayNumber
      );
      updatedDays[dayIndex] = { ...day, slots: mergedSlots };

      const updated = { ...itinerary, days: updatedDays };
      setItinerary(updated);
      onItineraryChange?.(updated);
    },
    [itinerary, onItineraryChange, historyManager]
  );

  // Handle toggle lock
  const handleToggleLock = useCallback(
    (dayIndex: number, slotId: string) => {
      const updatedDays = [...itinerary.days];
      const day = updatedDays[dayIndex];
      const slotIndex = day.slots.findIndex((s) => s.slotId === slotId);

      if (slotIndex === -1) return;

      const slot = day.slots[slotIndex];
      const isNowLocked = !slot.isLocked;

      historyManager.saveToHistory(
        isNowLocked ? "Lock slot" : "Unlock slot",
        itinerary
      );

      const updatedSlot: SlotWithOptions = {
        ...slot,
        isLocked: isNowLocked,
        rigidityScore: isNowLocked ? 1.0 : undefined,
        behavior: isNowLocked ? "anchor" : undefined,
      };

      const updatedSlots = [...day.slots];
      updatedSlots[slotIndex] = updatedSlot;
      updatedDays[dayIndex] = { ...day, slots: updatedSlots };

      const updated = { ...itinerary, days: updatedDays };
      setItinerary(updated);
      onItineraryChange?.(updated);
    },
    [itinerary, onItineraryChange, historyManager]
  );

  // Handle fill slot with activity
  const handleFillSlotWithActivity = useCallback(
    (
      dayIndex: number,
      slotId: string,
      activity: {
        name: string;
        category?: string;
        duration?: number;
        icon?: string;
        place?: {
          name: string;
          neighborhood?: string;
          rating?: number;
          coordinates?: { lat: number; lng: number };
        };
      }
    ) => {
      historyManager.saveToHistory("Fill slot with activity", itinerary);

      const updatedDays = [...itinerary.days];
      const day = updatedDays[dayIndex];
      const slotIndex = day.slots.findIndex((s) => s.slotId === slotId);

      if (slotIndex === -1) return;

      const originalSlot = day.slots[slotIndex];
      const slotStartMinutes = parseTimeToMinutes(originalSlot.timeRange.start);
      const slotEndMinutes = parseTimeToMinutes(originalSlot.timeRange.end);
      const availableDuration = slotEndMinutes - slotStartMinutes;
      const activityDuration =
        activity.duration || Math.min(availableDuration, 90);

      const newOptionId = `${slotId}-filled-${Date.now()}`;
      const newOption: ActivityOption = {
        id: newOptionId,
        rank: 1,
        score: 0.8,
        activity: {
          name: activity.name,
          category: activity.category || "activity",
          duration: activityDuration,
          description: `${activity.name} - added from suggestions`,
          place:
            activity.place && activity.place.coordinates
              ? {
                  name: activity.place.name,
                  address: activity.place.neighborhood || "",
                  neighborhood: activity.place.neighborhood || "",
                  rating: activity.place.rating,
                  coordinates: activity.place.coordinates,
                }
              : null,
          isFree: false,
          tags: [],
          source: "ai",
        },
        matchReasons: ["Added from suggestions"],
        tradeoffs: [],
      };

      const filledSlot: SlotWithOptions = {
        ...originalSlot,
        slotId: originalSlot.slotId.startsWith("free-")
          ? originalSlot.slotId.replace("free-", "")
          : originalSlot.slotId,
        options: [newOption],
        selectedOptionId: newOptionId,
        isLocked: false,
      };

      const newEndMinutes = slotStartMinutes + activityDuration;
      filledSlot.timeRange = {
        start: originalSlot.timeRange.start,
        end: formatMinutesToTime(newEndMinutes),
      };

      const updatedSlots = [...day.slots];
      updatedSlots[slotIndex] = filledSlot;

      // Create remaining free slot if needed
      if (newEndMinutes < slotEndMinutes - 15) {
        const remainingMidpoint = (newEndMinutes + slotEndMinutes) / 2;
        let remainingSlotType: ItinerarySlotType = "morning";
        if (remainingMidpoint >= 12 * 60 && remainingMidpoint < 14 * 60) {
          remainingSlotType = "lunch";
        } else if (
          remainingMidpoint >= 14 * 60 &&
          remainingMidpoint < 18 * 60
        ) {
          remainingSlotType = "afternoon";
        } else if (
          remainingMidpoint >= 18 * 60 &&
          remainingMidpoint < 20 * 60
        ) {
          remainingSlotType = "dinner";
        } else if (remainingMidpoint >= 20 * 60) {
          remainingSlotType = "evening";
        }

        const remainingFreeSlot: SlotWithOptions = {
          slotId: `free-after-${newOptionId}`,
          slotType: remainingSlotType,
          timeRange: {
            start: formatMinutesToTime(newEndMinutes),
            end: originalSlot.timeRange.end,
          },
          options: [],
          selectedOptionId: undefined,
          commuteFromPrevious: {
            duration: 0,
            distance: 0,
            method: "walk",
            instructions: "",
          },
        };
        updatedSlots.splice(slotIndex + 1, 0, remainingFreeSlot);
      }

      const startTime = updatedSlots[0]?.timeRange?.start || "09:00";
      const recalculatedSlots = recalculateTimeSlots(
        updatedSlots,
        startTime,
        day.dayNumber
      );
      const mergedSlots = mergeConsecutiveFreeSlots(recalculatedSlots);

      updatedDays[dayIndex] = { ...day, slots: mergedSlots };
      const updated = { ...itinerary, days: updatedDays };

      setItinerary(updated);
      onItineraryChange?.(updated);
      externalFillSlot?.(dayIndex, slotId, activity);
    },
    [itinerary, onItineraryChange, historyManager, externalFillSlot]
  );

  // Handle slots reorder within a day
  const handleSlotsReorder = useCallback(
    (dayIndex: number, newSlots: SlotWithOptions[]) => {
      historyManager.saveToHistory("Reorder slots", itinerary);

      const originalSlots = itinerary.days[dayIndex].slots;

      const reorderedActivities = newSlots.map((slot) => ({
        options: slot.options,
        selectedOptionId: slot.selectedOptionId,
        commuteFromPrevious: slot.commuteFromPrevious,
      }));

      const updatedSlots = originalSlots.map((originalSlot, index) => {
        if (index < reorderedActivities.length) {
          const newActivity = reorderedActivities[index];
          return {
            ...originalSlot,
            slotId: originalSlot.slotId,
            slotType: originalSlot.slotType,
            timeRange: originalSlot.timeRange,
            options: newActivity.options,
            selectedOptionId: newActivity.selectedOptionId,
            commuteFromPrevious:
              index === 0 ? undefined : newActivity.commuteFromPrevious,
          } as SlotWithOptions;
        }
        return originalSlot;
      });

      const startTime = originalSlots[0]?.timeRange?.start || "09:00";
      const recalculatedSlots = recalculateTimeSlots(
        updatedSlots,
        startTime,
        itinerary.days[dayIndex].dayNumber
      );

      const updatedDays = [...itinerary.days];
      updatedDays[dayIndex] = {
        ...updatedDays[dayIndex],
        slots: recalculatedSlots,
      };

      const updated = { ...itinerary, days: updatedDays };
      setItinerary(updated);
      onItineraryChange?.(updated);
    },
    [itinerary, onItineraryChange, historyManager]
  );

  // Handle days reorder
  const handleDaysReorder = useCallback(
    (newDays: DayWithOptions[]) => {
      historyManager.saveToHistory("Reorder days", itinerary);

      const renumberedDays = newDays.map((day, index) => ({
        ...day,
        dayNumber: index + 1,
      }));

      const updated = { ...itinerary, days: renumberedDays };
      setItinerary(updated);
      onItineraryChange?.(updated);
    },
    [itinerary, onItineraryChange, historyManager]
  );

  // Day navigation
  const goToPrevDay = () => {
    if (activeDayIndex > 0) setActiveDayIndex(activeDayIndex - 1);
  };

  const goToNextDay = () => {
    if (activeDayIndex < itinerary.days.length - 1)
      setActiveDayIndex(activeDayIndex + 1);
  };

  return (
    <div className={cn("bg-gray-50 dark:bg-gray-900 min-h-screen", className)}>
      {/* Header */}
      <div className="sticky top-0 z-20 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-900 dark:text-white">
              {`${itinerary.destination} Trip`}
            </h1>
            <div className="flex items-center gap-3">
              {/* Undo Button */}
              {historyManager.canUndo && (
                <button
                  onClick={handleUndo}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <Undo2 className="w-4 h-4" />
                  Undo
                </button>
              )}

              {/* History Toggle */}
              {historyManager.history.length > 0 && (
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
                    showHistory
                      ? "bg-purple-100 text-purple-700"
                      : "text-gray-600 hover:bg-gray-100"
                  )}
                >
                  <History className="w-4 h-4" />
                  History ({historyManager.history.length})
                </button>
              )}

              {/* View Mode Toggle */}
              <div className="flex items-center bg-gray-100 rounded-lg p-0.5">
                <button
                  onClick={() => setViewMode("tabbed")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                    viewMode === "tabbed"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  <LayoutGrid className="w-4 h-4" />
                  Tabbed
                </button>
                <button
                  onClick={() => setViewMode("list")}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-md transition-colors",
                    viewMode === "list"
                      ? "bg-white text-gray-900 shadow-sm"
                      : "text-gray-500 hover:text-gray-700"
                  )}
                >
                  <List className="w-4 h-4" />
                  List
                </button>
              </div>

              {/* Reorder Mode Toggle (List View Only) */}
              {viewMode === "list" && enableReordering && (
                <button
                  onClick={() => setIsReorderMode(!isReorderMode)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
                    isReorderMode
                      ? "bg-orange-100 text-orange-700"
                      : "text-gray-600 hover:bg-gray-100"
                  )}
                >
                  <GripVertical className="w-4 h-4" />
                  {isReorderMode ? "Done" : "Reorder"}
                </button>
              )}

              {/* Chat Toggle */}
              {enableChat && (
                <button
                  onClick={() => setShowChat(!showChat)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
                    showChat
                      ? "bg-blue-100 text-blue-700"
                      : "text-gray-600 hover:bg-gray-100"
                  )}
                >
                  <MessageCircle className="w-4 h-4" />
                  Chat
                </button>
              )}

              {/* Validation Toggle */}
              {validationIssues.length > 0 && (
                <button
                  onClick={() => setShowValidation(!showValidation)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg transition-colors",
                    showValidation
                      ? "bg-amber-100 text-amber-700"
                      : "text-gray-600 hover:bg-gray-100"
                  )}
                >
                  <AlertTriangle className="w-4 h-4" />
                  {validationIssues.length}
                </button>
              )}

              <div className="text-sm text-gray-500">
                {itinerary.days.length} days • {itinerary.destination}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* History Panel */}
      <AnimatePresence>
        {showHistory && historyManager.history.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="bg-purple-50 border-b border-purple-200 overflow-hidden"
          >
            <div className="max-w-6xl mx-auto px-4 py-3">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-medium text-purple-700">
                  Recent Changes
                </span>
                <button
                  onClick={historyManager.clearHistory}
                  className="text-xs text-purple-600 hover:text-purple-800"
                >
                  Clear All
                </button>
              </div>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {historyManager.history
                  .slice(-5)
                  .reverse()
                  .map((entry, idx) => (
                    <div
                      key={entry.timestamp}
                      className="flex-shrink-0 px-3 py-1.5 bg-white rounded-lg text-xs text-gray-600 shadow-sm"
                    >
                      {entry.description} •{" "}
                      {historyManager.formatTimeAgo(entry.timestamp)}
                    </div>
                  ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reorder Mode Banner */}
      {isReorderMode && (
        <div className="bg-orange-50 border-b border-orange-200">
          <div className="max-w-6xl mx-auto px-4 py-2 text-center">
            <span className="text-sm text-orange-700">
              🔀 Reorder mode active - Drag activities to rearrange them
            </span>
          </div>
        </div>
      )}

      {/* Day Tabs / Day List Header */}
      <div className="sticky top-[57px] z-10 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="max-w-6xl mx-auto px-4">
          <div className="flex items-center gap-2 py-2 overflow-x-auto">
            {viewMode === "tabbed" && (
              <button
                onClick={goToPrevDay}
                disabled={activeDayIndex === 0}
                className={cn(
                  "p-1.5 rounded-md transition-colors flex-shrink-0",
                  activeDayIndex === 0
                    ? "text-gray-300 cursor-not-allowed"
                    : "text-gray-500 hover:bg-gray-100"
                )}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            )}

            {itinerary.days.map((day, index) => (
              <button
                key={day.dayNumber}
                onClick={() => setActiveDayIndex(index)}
                className={cn(
                  "flex-shrink-0 px-3 py-1.5 rounded-full text-sm font-medium transition-all",
                  index === activeDayIndex
                    ? "bg-purple-600 text-white shadow-md"
                    : "text-gray-600 hover:bg-gray-100"
                )}
              >
                Day {day.dayNumber}
              </button>
            ))}

            {viewMode === "tabbed" && (
              <button
                onClick={goToNextDay}
                disabled={activeDayIndex === itinerary.days.length - 1}
                className={cn(
                  "p-1.5 rounded-md transition-colors flex-shrink-0",
                  activeDayIndex === itinerary.days.length - 1
                    ? "text-gray-300 cursor-not-allowed"
                    : "text-gray-500 hover:bg-gray-100"
                )}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            )}

            <div className="ml-auto flex-shrink-0">
              <button
                onClick={() => setShowMap(!showMap)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors",
                  showMap
                    ? "bg-purple-100 text-purple-700"
                    : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                )}
              >
                <MapPin className="w-3.5 h-3.5" />
                Map
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content - Full Width */}
      <div className="h-[calc(100vh-105px)] overflow-hidden">
        <div className="flex h-full">
          {/* Left: Chat Panel - Fixed, no scroll */}
          {showChat && chatHook && (
            <div className="w-[420px] flex-shrink-0 border-r border-gray-200 dark:border-gray-700 h-full overflow-hidden flex flex-col">
              <ItineraryChatPanel
                itinerary={itinerary}
                chatState={chatHook.chatState}
                onSendMessage={chatHook.sendMessage}
                onApplyChange={chatHook.applyChange}
                onRejectChange={chatHook.rejectChange}
                onClearChat={chatHook.clearChat}
              />
            </div>
          )}

          {/* Middle: Activities - Only this scrolls */}
          <div className="flex-1 min-w-0 h-full overflow-y-auto bg-slate-100 dark:bg-slate-900">
            <AnimatePresence mode="wait">
              {viewMode === "tabbed" ? (
                <motion.div
                  key="tabbed"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="p-4"
                >
                  {activeDay && (
                    <div className="space-y-4 max-w-2xl mx-auto">
                      <DayHeader day={activeDay} />
                      <div className="space-y-3">
                        {/* Morning: Hotel to first activity */}
                        {activeDay.commuteFromHotel &&
                          activeDay.slots.some((s) => s.options.length > 0) && (
                            <CommuteNode
                              commute={{
                                ...activeDay.commuteFromHotel,
                                fromName:
                                  activeDay.accommodation?.name || "Hotel",
                                toName: (() => {
                                  const firstSlot = activeDay.slots.find(
                                    (s) => s.options.length > 0
                                  );
                                  if (!firstSlot) return "First activity";
                                  const option = firstSlot.selectedOptionId
                                    ? firstSlot.options.find(
                                        (o) =>
                                          o.id === firstSlot.selectedOptionId
                                      )
                                    : firstSlot.options[0];
                                  return (
                                    option?.activity?.name || "First activity"
                                  );
                                })(),
                                commuteType: "hotel-to-activity",
                              }}
                              type="hotel-to-activity"
                              variant="compact"
                              fromCoords={activeDay.accommodation?.coordinates}
                              toCoords={(() => {
                                const firstSlot = activeDay.slots.find(
                                  (s) => s.options.length > 0
                                );
                                if (!firstSlot) return undefined;
                                const option = firstSlot.selectedOptionId
                                  ? firstSlot.options.find(
                                      (o) => o.id === firstSlot.selectedOptionId
                                    )
                                  : firstSlot.options[0];
                                return option?.activity?.place?.coordinates;
                              })()}
                            />
                          )}

                        {activeDay.slots.map((slot, index) => {
                          const isEmptySlot = slot.options.length === 0;
                          const slotMarker = markers.find(
                            (m) => m.id === slot.slotId
                          );

                          return (
                            <div key={slot.slotId}>
                              {index > 0 && slot.commuteFromPrevious && (
                                <CommuteNode
                                  commute={slot.commuteFromPrevious}
                                  variant="compact"
                                  fromCoords={(() => {
                                    // Find the previous slot that has options (skip free slots)
                                    let prevActivitySlot = null;
                                    for (let i = index - 1; i >= 0; i--) {
                                      if (
                                        activeDay.slots[i]?.options?.length > 0
                                      ) {
                                        prevActivitySlot = activeDay.slots[i];
                                        break;
                                      }
                                    }
                                    if (!prevActivitySlot) return undefined;
                                    const prevOption =
                                      prevActivitySlot.selectedOptionId
                                        ? prevActivitySlot.options.find(
                                            (o) =>
                                              o.id ===
                                              prevActivitySlot.selectedOptionId
                                          )
                                        : prevActivitySlot.options[0];
                                    return prevOption?.activity?.place
                                      ?.coordinates;
                                  })()}
                                  toCoords={(() => {
                                    const currOption = slot.selectedOptionId
                                      ? slot.options.find(
                                          (o) => o.id === slot.selectedOptionId
                                        )
                                      : slot.options[0];
                                    return currOption?.activity?.place
                                      ?.coordinates;
                                  })()}
                                />
                              )}

                              {isEmptySlot ? (
                                <CompactFreeTimeSlot
                                  slot={slot}
                                  dayIndex={activeDayIndex}
                                  city={activeDay.city}
                                  onFillSlotWithActivity={
                                    handleFillSlotWithActivity
                                  }
                                />
                              ) : (
                                <CompactActivityCard
                                  slot={slot}
                                  dayIndex={activeDayIndex}
                                  slotNumber={slotMarker?.slotIndex}
                                  isHovered={
                                    hoveredSlotIndex === slotMarker?.slotIndex
                                  }
                                  onHover={() =>
                                    setHoveredSlotIndex(
                                      slotMarker?.slotIndex ?? null
                                    )
                                  }
                                  onLeave={() => setHoveredSlotIndex(null)}
                                  onSelectOption={handleSelectOption}
                                  onClearSlot={handleClearSlot}
                                  onToggleLock={handleToggleLock}
                                  isReorderMode={false}
                                />
                              )}
                            </div>
                          );
                        })}

                        {/* Evening: Last activity back to hotel */}
                        {activeDay.commuteToHotel &&
                          activeDay.slots.some((s) => s.options.length > 0) && (
                            <CommuteNode
                              commute={{
                                ...activeDay.commuteToHotel,
                                fromName: (() => {
                                  // Find the last slot with options
                                  const lastSlot = [...activeDay.slots]
                                    .reverse()
                                    .find((s) => s.options.length > 0);
                                  if (!lastSlot) return "Last activity";
                                  const option = lastSlot.selectedOptionId
                                    ? lastSlot.options.find(
                                        (o) =>
                                          o.id === lastSlot.selectedOptionId
                                      )
                                    : lastSlot.options[0];
                                  return (
                                    option?.activity?.name || "Last activity"
                                  );
                                })(),
                                toName:
                                  activeDay.accommodation?.name || "Hotel",
                                commuteType: "activity-to-hotel",
                              }}
                              type="activity-to-hotel"
                              variant="compact"
                              fromCoords={(() => {
                                const lastSlot = [...activeDay.slots]
                                  .reverse()
                                  .find((s) => s.options.length > 0);
                                if (!lastSlot) return undefined;
                                const option = lastSlot.selectedOptionId
                                  ? lastSlot.options.find(
                                      (o) => o.id === lastSlot.selectedOptionId
                                    )
                                  : lastSlot.options[0];
                                return option?.activity?.place?.coordinates;
                              })()}
                              toCoords={activeDay.accommodation?.coordinates}
                            />
                          )}
                      </div>
                    </div>
                  )}
                </motion.div>
              ) : (
                <motion.div
                  key="list"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="p-4"
                >
                  <div className="space-y-8 max-w-2xl mx-auto">
                    {itinerary.days.map((day, dayIndex) => (
                      <div key={day.dayNumber} className="space-y-4">
                        <DayHeader day={day} />
                        <div className="space-y-3">
                          {/* Morning: Hotel to first activity */}
                          {day.commuteFromHotel &&
                            day.slots.some((s) => s.options.length > 0) && (
                              <CommuteNode
                                commute={{
                                  ...day.commuteFromHotel,
                                  fromName: day.accommodation?.name || "Hotel",
                                  toName: (() => {
                                    const firstSlot = day.slots.find(
                                      (s) => s.options.length > 0
                                    );
                                    if (!firstSlot) return "First activity";
                                    const option = firstSlot.selectedOptionId
                                      ? firstSlot.options.find(
                                          (o) =>
                                            o.id === firstSlot.selectedOptionId
                                        )
                                      : firstSlot.options[0];
                                    return (
                                      option?.activity?.name || "First activity"
                                    );
                                  })(),
                                  commuteType: "hotel-to-activity",
                                }}
                                type="hotel-to-activity"
                                variant="compact"
                                fromCoords={day.accommodation?.coordinates}
                                toCoords={(() => {
                                  const firstSlot = day.slots.find(
                                    (s) => s.options.length > 0
                                  );
                                  if (!firstSlot) return undefined;
                                  const option = firstSlot.selectedOptionId
                                    ? firstSlot.options.find(
                                        (o) =>
                                          o.id === firstSlot.selectedOptionId
                                      )
                                    : firstSlot.options[0];
                                  return option?.activity?.place?.coordinates;
                                })()}
                              />
                            )}

                          {day.slots.map((slot, index) => {
                            const isEmptySlot = slot.options.length === 0;
                            const slotMarker = markers.find(
                              (m) => m.id === slot.slotId
                            );

                            return (
                              <div key={slot.slotId}>
                                {index > 0 && slot.commuteFromPrevious && (
                                  <CommuteNode
                                    commute={slot.commuteFromPrevious}
                                    variant="compact"
                                    fromCoords={(() => {
                                      // Find the previous slot that has options (skip free slots)
                                      let prevActivitySlot = null;
                                      for (let i = index - 1; i >= 0; i--) {
                                        if (day.slots[i]?.options?.length > 0) {
                                          prevActivitySlot = day.slots[i];
                                          break;
                                        }
                                      }
                                      if (!prevActivitySlot) return undefined;
                                      const prevOption =
                                        prevActivitySlot.selectedOptionId
                                          ? prevActivitySlot.options.find(
                                              (o) =>
                                                o.id ===
                                                prevActivitySlot.selectedOptionId
                                            )
                                          : prevActivitySlot.options[0];
                                      return prevOption?.activity?.place
                                        ?.coordinates;
                                    })()}
                                    toCoords={(() => {
                                      const currOption = slot.selectedOptionId
                                        ? slot.options.find(
                                            (o) =>
                                              o.id === slot.selectedOptionId
                                          )
                                        : slot.options[0];
                                      return currOption?.activity?.place
                                        ?.coordinates;
                                    })()}
                                  />
                                )}

                                {isEmptySlot ? (
                                  <CompactFreeTimeSlot
                                    slot={slot}
                                    dayIndex={dayIndex}
                                    city={day.city}
                                    onFillSlotWithActivity={
                                      handleFillSlotWithActivity
                                    }
                                  />
                                ) : (
                                  <CompactActivityCard
                                    slot={slot}
                                    dayIndex={dayIndex}
                                    slotNumber={slotMarker?.slotIndex}
                                    isHovered={
                                      hoveredSlotIndex === slotMarker?.slotIndex
                                    }
                                    onHover={() =>
                                      setHoveredSlotIndex(
                                        slotMarker?.slotIndex ?? null
                                      )
                                    }
                                    onLeave={() => setHoveredSlotIndex(null)}
                                    onSelectOption={handleSelectOption}
                                    onClearSlot={handleClearSlot}
                                    onToggleLock={handleToggleLock}
                                    isReorderMode={false}
                                  />
                                )}
                              </div>
                            );
                          })}

                          {/* Evening: Last activity back to hotel */}
                          {day.commuteToHotel &&
                            day.slots.some((s) => s.options.length > 0) && (
                              <CommuteNode
                                commute={{
                                  ...day.commuteToHotel,
                                  fromName: (() => {
                                    const lastSlot = [...day.slots]
                                      .reverse()
                                      .find((s) => s.options.length > 0);
                                    if (!lastSlot) return "Last activity";
                                    const option = lastSlot.selectedOptionId
                                      ? lastSlot.options.find(
                                          (o) =>
                                            o.id === lastSlot.selectedOptionId
                                        )
                                      : lastSlot.options[0];
                                    return (
                                      option?.activity?.name || "Last activity"
                                    );
                                  })(),
                                  toName: day.accommodation?.name || "Hotel",
                                  commuteType: "activity-to-hotel",
                                }}
                                type="activity-to-hotel"
                                variant="compact"
                                fromCoords={(() => {
                                  const lastSlot = [...day.slots]
                                    .reverse()
                                    .find((s) => s.options.length > 0);
                                  if (!lastSlot) return undefined;
                                  const option = lastSlot.selectedOptionId
                                    ? lastSlot.options.find(
                                        (o) =>
                                          o.id === lastSlot.selectedOptionId
                                      )
                                    : lastSlot.options[0];
                                  return option?.activity?.place?.coordinates;
                                })()}
                                toCoords={day.accommodation?.coordinates}
                              />
                            )}
                        </div>
                      </div>
                    ))}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Right: Map - Fixed, no scroll, CLOSABLE */}
          {showMap && (
            <div className="w-[45%] flex-shrink-0 border-l border-gray-200 dark:border-gray-700 h-full relative">
              {/* Close button */}
              <button
                onClick={() => setShowMap(false)}
                className="absolute top-3 right-3 z-10 p-2 bg-white/90 hover:bg-white rounded-full shadow-md transition-colors"
                title="Close map"
              >
                <X className="w-4 h-4 text-gray-600" />
              </button>
              <CompactMap
                markers={markers}
                center={mapData.center}
                bounds={mapData.bounds}
                routePath={routePath}
                hoveredSlotIndex={hoveredSlotIndex}
                accommodation={activeDay?.accommodation}
                fullHeight
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// DAY HEADER
// ============================================

interface DayHeaderProps {
  day: DayWithOptions;
}

function DayHeader({ day }: DayHeaderProps) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white font-bold text-lg">
          {day.dayNumber}
        </div>
        <div>
          <h2 className="font-semibold text-gray-900 dark:text-white">
            {day.title}
          </h2>
          <div className="flex items-center gap-2 text-sm text-gray-500">
            <span>{day.date}</span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <MapPin className="w-3 h-3" />
              {day.city}
            </span>
          </div>
        </div>
      </div>

      {day.accommodation && (
        <div className="mt-3 flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
          <Building2 className="w-4 h-4 text-amber-600" />
          <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
            {day.accommodation.name}
          </span>
          {day.accommodation.neighborhood && (
            <span className="text-xs text-amber-600/70">
              • {day.accommodation.neighborhood}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// REORDERABLE SLOT LIST
// ============================================

interface ReorderableSlotListProps {
  day: DayWithOptions;
  dayIndex: number;
  markers: MapMarkerData[];
  hoveredSlotIndex: number | null;
  setHoveredSlotIndex: (index: number | null) => void;
  isReorderMode: boolean;
  onSelectOption: (slotId: string, optionId: string) => void;
  onClearSlot: (dayIndex: number, slotId: string) => void;
  onToggleLock: (dayIndex: number, slotId: string) => void;
  onFillSlotWithActivity: (
    dayIndex: number,
    slotId: string,
    activity: {
      name: string;
      category?: string;
      duration?: number;
      icon?: string;
      place?: {
        name: string;
        neighborhood?: string;
        rating?: number;
        coordinates?: { lat: number; lng: number };
      };
    }
  ) => void;
  onSlotsReorder: (dayIndex: number, newSlots: SlotWithOptions[]) => void;
}

function ReorderableSlotList({
  day,
  dayIndex,
  markers,
  hoveredSlotIndex,
  setHoveredSlotIndex,
  isReorderMode,
  onSelectOption,
  onClearSlot,
  onToggleLock,
  onFillSlotWithActivity,
  onSlotsReorder,
}: ReorderableSlotListProps) {
  const [slots, setSlots] = useState(day.slots);

  // Sync with parent when day slots change
  React.useEffect(() => {
    setSlots(day.slots);
  }, [day.slots]);

  const handleReorder = (newSlots: SlotWithOptions[]) => {
    setSlots(newSlots);
    onSlotsReorder(dayIndex, newSlots);
  };

  if (isReorderMode) {
    return (
      <Reorder.Group
        axis="y"
        values={slots}
        onReorder={handleReorder}
        className="space-y-2"
      >
        {slots.map((slot, index) => {
          const isEmptySlot = slot.options.length === 0;
          const slotMarker = markers.find((m) => m.id === slot.slotId);

          return (
            <Reorder.Item
              key={slot.slotId}
              value={slot}
              className="cursor-grab active:cursor-grabbing"
            >
              <div>
                {index > 0 && slot.commuteFromPrevious && (
                  <CommuteNode
                    commute={slot.commuteFromPrevious}
                    variant="compact"
                    fromCoords={(() => {
                      // Find the previous slot that has options (skip free slots)
                      let prevActivitySlot = null;
                      for (let i = index - 1; i >= 0; i--) {
                        if (slots[i]?.options?.length > 0) {
                          prevActivitySlot = slots[i];
                          break;
                        }
                      }
                      if (!prevActivitySlot) return undefined;
                      const prevOption = prevActivitySlot.selectedOptionId
                        ? prevActivitySlot.options.find(
                            (o) => o.id === prevActivitySlot.selectedOptionId
                          )
                        : prevActivitySlot.options[0];
                      return prevOption?.activity?.place?.coordinates;
                    })()}
                    toCoords={(() => {
                      const currOption = slot.selectedOptionId
                        ? slot.options.find(
                            (o) => o.id === slot.selectedOptionId
                          )
                        : slot.options[0];
                      return currOption?.activity?.place?.coordinates;
                    })()}
                  />
                )}

                {isEmptySlot ? (
                  <CompactFreeTimeSlot
                    slot={slot}
                    dayIndex={dayIndex}
                    city={day.city}
                    onFillSlotWithActivity={onFillSlotWithActivity}
                  />
                ) : (
                  <CompactActivityCard
                    slot={slot}
                    dayIndex={dayIndex}
                    slotNumber={slotMarker?.slotIndex}
                    isHovered={hoveredSlotIndex === slotMarker?.slotIndex}
                    onHover={() =>
                      setHoveredSlotIndex(slotMarker?.slotIndex ?? null)
                    }
                    onLeave={() => setHoveredSlotIndex(null)}
                    onSelectOption={onSelectOption}
                    onClearSlot={onClearSlot}
                    onToggleLock={onToggleLock}
                    isReorderMode={true}
                  />
                )}
              </div>
            </Reorder.Item>
          );
        })}
      </Reorder.Group>
    );
  }

  return (
    <div className="space-y-2">
      {slots.map((slot, index) => {
        const isEmptySlot = slot.options.length === 0;
        const slotMarker = markers.find((m) => m.id === slot.slotId);

        return (
          <div key={slot.slotId}>
            {index > 0 && slot.commuteFromPrevious && (
              <CommuteNode
                commute={slot.commuteFromPrevious}
                variant="compact"
                fromCoords={(() => {
                  // Find the previous slot that has options (skip free slots)
                  let prevActivitySlot = null;
                  for (let i = index - 1; i >= 0; i--) {
                    if (slots[i]?.options?.length > 0) {
                      prevActivitySlot = slots[i];
                      break;
                    }
                  }
                  if (!prevActivitySlot) return undefined;
                  const prevOption = prevActivitySlot.selectedOptionId
                    ? prevActivitySlot.options.find(
                        (o) => o.id === prevActivitySlot.selectedOptionId
                      )
                    : prevActivitySlot.options[0];
                  return prevOption?.activity?.place?.coordinates;
                })()}
                toCoords={(() => {
                  const currOption = slot.selectedOptionId
                    ? slot.options.find((o) => o.id === slot.selectedOptionId)
                    : slot.options[0];
                  return currOption?.activity?.place?.coordinates;
                })()}
              />
            )}

            {isEmptySlot ? (
              <CompactFreeTimeSlot
                slot={slot}
                dayIndex={dayIndex}
                city={day.city}
                onFillSlotWithActivity={onFillSlotWithActivity}
              />
            ) : (
              <CompactActivityCard
                slot={slot}
                dayIndex={dayIndex}
                slotNumber={slotMarker?.slotIndex}
                isHovered={hoveredSlotIndex === slotMarker?.slotIndex}
                onHover={() =>
                  setHoveredSlotIndex(slotMarker?.slotIndex ?? null)
                }
                onLeave={() => setHoveredSlotIndex(null)}
                onSelectOption={onSelectOption}
                onClearSlot={onClearSlot}
                onToggleLock={onToggleLock}
                isReorderMode={false}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================
// COMPACT ACTIVITY CARD
// ============================================

interface CompactActivityCardProps {
  slot: SlotWithOptions;
  dayIndex: number;
  slotNumber?: number;
  isHovered?: boolean;
  onHover?: () => void;
  onLeave?: () => void;
  onSelectOption?: (slotId: string, optionId: string) => void;
  onClearSlot?: (dayIndex: number, slotId: string) => void;
  onToggleLock?: (dayIndex: number, slotId: string) => void;
  isReorderMode?: boolean;
}

function CompactActivityCard({
  slot,
  dayIndex,
  slotNumber,
  isHovered,
  onHover,
  onLeave,
  onSelectOption,
  onClearSlot,
  onToggleLock,
  isReorderMode,
}: CompactActivityCardProps) {
  // Find the index of the currently selected option, or default to 0
  const selectedIndex = slot.selectedOptionId
    ? slot.options.findIndex((o) => o.id === slot.selectedOptionId)
    : 0;
  const [currentIndex, setCurrentIndex] = useState(
    selectedIndex >= 0 ? selectedIndex : 0
  );
  const [showActions, setShowActions] = useState(false);

  // Sync currentIndex when selectedOptionId changes (e.g., from undo)
  React.useEffect(() => {
    const newSelectedIndex = slot.selectedOptionId
      ? slot.options.findIndex((o) => o.id === slot.selectedOptionId)
      : 0;
    if (newSelectedIndex >= 0 && newSelectedIndex !== currentIndex) {
      setCurrentIndex(newSelectedIndex);
    }
  }, [slot.selectedOptionId, slot.options]);
  const currentOption = slot.options[currentIndex];
  const isSelected = currentOption?.id === slot.selectedOptionId;
  const totalOptions = slot.options.length;

  const slotStyle = SLOT_COLORS[slot.slotType] || SLOT_COLORS.afternoon;
  const activity = currentOption?.activity;

  const imageUrl =
    activity?.place?.photos?.[0] ||
    getPlaceholderImage(activity?.category || "default");

  // Navigate AND select the option
  const handleNavigate = (direction: "prev" | "next") => {
    let newIndex = currentIndex;
    if (direction === "prev" && currentIndex > 0) {
      newIndex = currentIndex - 1;
    } else if (direction === "next" && currentIndex < totalOptions - 1) {
      newIndex = currentIndex + 1;
    }

    if (newIndex !== currentIndex) {
      setCurrentIndex(newIndex);
      // Automatically select the new option and cascade times
      const newOption = slot.options[newIndex];
      if (newOption && onSelectOption) {
        onSelectOption(slot.slotId, newOption.id);
      }
    }
  };

  if (!currentOption) return null;

  return (
    <motion.div
      onMouseEnter={() => {
        onHover?.();
        setShowActions(true);
      }}
      onMouseLeave={() => {
        onLeave?.();
        setShowActions(false);
      }}
      className={cn(
        "bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden transition-all",
        isHovered && "ring-2 ring-purple-400 shadow-md",
        slot.isLocked && "ring-2 ring-amber-400"
      )}
    >
      <div className="flex">
        {/* Left: Compact Image with Slot Number */}
        <div className="relative w-24 h-24 flex-shrink-0">
          {isReorderMode && (
            <div className="absolute inset-0 bg-black/40 flex items-center justify-center z-10">
              <GripVertical className="w-6 h-6 text-white" />
            </div>
          )}
          <img
            src={imageUrl}
            alt={activity.name}
            className="w-full h-full object-cover"
            onError={(e) => {
              (e.target as HTMLImageElement).src = categoryImages.default;
            }}
          />

          {/* Slot Number Badge */}
          {slotNumber && (
            <div
              className="absolute top-2 left-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-md"
              style={{
                backgroundColor: MAP_MARKER_COLORS[slot.slotType] || "#6366f1",
              }}
            >
              {slotNumber}
            </div>
          )}

          {/* Selected indicator */}
          {isSelected && (
            <div className="absolute bottom-2 left-2 w-5 h-5 rounded-full bg-green-500 flex items-center justify-center">
              <Check className="w-3 h-3 text-white" />
            </div>
          )}

          {/* Lock indicator */}
          {slot.isLocked && (
            <div className="absolute bottom-2 right-2 w-5 h-5 rounded-full bg-amber-500 flex items-center justify-center">
              <Lock className="w-3 h-3 text-white" />
            </div>
          )}
        </div>

        {/* Right: Content */}
        <div className="flex-1 p-3 min-w-0">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              {(() => {
                // Calculate the time range based on the CURRENT option being viewed
                const startMinutes = parseTimeToMinutes(slot.timeRange.start);
                const endMinutes = startMinutes + (activity.duration || 60);
                const calculatedEnd = formatMinutesToTime(endMinutes);
                const isPreview =
                  currentOption?.id !== slot.selectedOptionId &&
                  slot.selectedOptionId !== null;

                return (
                  <div className="flex items-center gap-1.5 mb-0.5">
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded text-xs font-medium",
                        slotStyle.bg,
                        slotStyle.text
                      )}
                    >
                      {slotStyle.icon} {slot.slotType}
                    </span>
                    <span
                      className={cn(
                        "text-xs font-mono",
                        isPreview ? "text-purple-500" : "text-gray-400"
                      )}
                    >
                      {slot.timeRange.start} - {calculatedEnd}
                      {isPreview && " (preview)"}
                    </span>
                    <span className="text-xs text-purple-500">
                      ({activity.duration}m)
                    </span>
                  </div>
                );
              })()}
              <h3 className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                {activity.name}
              </h3>
            </div>

            {/* Action Buttons */}
            <AnimatePresence>
              {showActions && !isReorderMode && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  className="flex items-center gap-1"
                >
                  <button
                    onClick={() => onToggleLock?.(dayIndex, slot.slotId)}
                    className={cn(
                      "p-1 rounded transition-colors",
                      slot.isLocked
                        ? "text-amber-600 hover:bg-amber-50"
                        : "text-gray-400 hover:bg-gray-100"
                    )}
                    title={slot.isLocked ? "Unlock slot" : "Lock slot"}
                  >
                    {slot.isLocked ? (
                      <Lock className="w-3.5 h-3.5" />
                    ) : (
                      <Unlock className="w-3.5 h-3.5" />
                    )}
                  </button>
                  <button
                    onClick={() => onClearSlot?.(dayIndex, slot.slotId)}
                    className="p-1 rounded text-gray-400 hover:bg-red-50 hover:text-red-600 transition-colors"
                    title="Clear slot"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Score Badge (when not showing actions) */}
            {!showActions && currentOption.score && (
              <div
                className={cn(
                  "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold",
                  currentOption.score >= 80
                    ? "bg-green-100 text-green-700"
                    : currentOption.score >= 60
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-gray-100 text-gray-600"
                )}
              >
                {currentOption.score}
              </div>
            )}
          </div>

          {/* Meta Row */}
          <div className="flex items-center gap-2 mt-1.5 text-xs text-gray-500">
            {activity.place?.neighborhood && (
              <span className="flex items-center gap-0.5 truncate">
                <MapPin className="w-3 h-3 flex-shrink-0" />
                {activity.place.neighborhood}
              </span>
            )}
            <span className="flex items-center gap-0.5">
              <Clock className="w-3 h-3" />
              {activity.duration}m
            </span>
            {activity.place?.rating && (
              <span className="flex items-center gap-0.5">
                <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                {activity.place.rating}
              </span>
            )}
          </div>

          {/* Options Navigation */}
          {totalOptions > 1 && (
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-1">
                <button
                  onClick={() => handleNavigate("prev")}
                  disabled={currentIndex === 0}
                  className={cn(
                    "p-1 rounded transition-colors",
                    currentIndex === 0
                      ? "text-gray-300"
                      : "text-gray-500 hover:bg-gray-100"
                  )}
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-gray-500 min-w-[40px] text-center">
                  {currentIndex + 1}/{totalOptions}
                </span>
                <button
                  onClick={() => handleNavigate("next")}
                  disabled={currentIndex === totalOptions - 1}
                  className={cn(
                    "p-1 rounded transition-colors",
                    currentIndex === totalOptions - 1
                      ? "text-gray-300"
                      : "text-gray-500 hover:bg-gray-100"
                  )}
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              {/* Show checkmark if this option is selected, otherwise show "Tap to select" hint */}
              {isSelected ? (
                <span className="flex items-center gap-1 text-xs text-green-600">
                  <Check className="w-3.5 h-3.5" />
                  Selected
                </span>
              ) : (
                <button
                  onClick={() =>
                    onSelectOption?.(slot.slotId, currentOption.id)
                  }
                  className="px-2 py-1 text-xs font-medium text-purple-600 hover:bg-purple-50 rounded transition-colors"
                >
                  Use this
                </button>
              )}
            </div>
          )}

          {/* Viator Tour Enhancements */}
          {currentOption.viatorEnhancements &&
            currentOption.viatorEnhancements.length > 0 && (
              <ViatorEnhancementList
                enhancements={currentOption.viatorEnhancements}
                activityName={activity.name}
                defaultExpanded={false}
                maxVisible={2}
              />
            )}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================
// COMPACT FREE TIME SLOT
// ============================================

interface CompactFreeTimeSlotProps {
  slot: SlotWithOptions;
  dayIndex: number;
  city?: string;
  onFillSlotWithActivity?: (
    dayIndex: number,
    slotId: string,
    activity: {
      name: string;
      category?: string;
      duration?: number;
      icon?: string;
      place?: {
        name: string;
        neighborhood?: string;
        rating?: number;
        coordinates?: { lat: number; lng: number };
      };
    }
  ) => void;
}

function CompactFreeTimeSlot({
  slot,
  dayIndex,
  city,
  onFillSlotWithActivity,
}: CompactFreeTimeSlotProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const slotStyle = SLOT_COLORS[slot.slotType] || SLOT_COLORS.afternoon;

  // Calculate duration
  const [startH, startM] = slot.timeRange.start.split(":").map(Number);
  const [endH, endM] = slot.timeRange.end.split(":").map(Number);
  const duration = endH * 60 + endM - (startH * 60 + startM);

  return (
    <div className="bg-white/50 dark:bg-gray-800/50 rounded-lg overflow-hidden border border-dashed border-gray-300 dark:border-gray-600">
      <div className="px-3 py-2">
        {/* Header - compact single row */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-xs font-medium",
                slotStyle.bg,
                slotStyle.text
              )}
            >
              {slotStyle.icon}
            </span>
            <span className="text-xs text-gray-400">
              {slot.timeRange.start} - {slot.timeRange.end}
            </span>
            <span className="text-xs text-gray-400">•</span>
            <span className="text-xs text-gray-500">{duration}m free</span>
          </div>

          {/* Expand Button - inline */}
          {!isExpanded && (
            <button
              onClick={() => setIsExpanded(true)}
              className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-purple-600 hover:bg-purple-50 rounded transition-colors"
            >
              <Plus className="w-3 h-3" />
              Add
            </button>
          )}
        </div>

        {/* Expanded suggestions */}
        {isExpanded && (
          <FreeSlotSuggestions
            slot={slot}
            dayIndex={dayIndex}
            city={city}
            onFillSlotWithActivity={onFillSlotWithActivity}
            onClose={() => setIsExpanded(false)}
          />
        )}
      </div>
    </div>
  );
}

// ============================================
// FREE SLOT SUGGESTIONS
// ============================================

interface FreeSlotSuggestionsProps {
  slot: SlotWithOptions;
  dayIndex: number;
  city?: string;
  onFillSlotWithActivity?: (
    dayIndex: number,
    slotId: string,
    activity: {
      name: string;
      category?: string;
      duration?: number;
      icon?: string;
      place?: {
        name: string;
        neighborhood?: string;
        rating?: number;
        coordinates?: { lat: number; lng: number };
      };
    }
  ) => void;
  onClose: () => void;
}

const FALLBACK_SUGGESTIONS: Record<
  string,
  Array<{
    id: string;
    name: string;
    category: string;
    duration: number;
    icon: string;
  }>
> = {
  morning: [
    {
      id: "morning-temple",
      name: "Visit a temple",
      category: "Cultural",
      duration: 90,
      icon: "⛩️",
    },
    {
      id: "morning-garden",
      name: "Explore a garden",
      category: "Nature",
      duration: 60,
      icon: "🌸",
    },
  ],
  breakfast: [
    {
      id: "breakfast-cafe",
      name: "Local café",
      category: "Food",
      duration: 45,
      icon: "☕",
    },
  ],
  lunch: [
    {
      id: "lunch-ramen",
      name: "Try local ramen",
      category: "Food",
      duration: 60,
      icon: "🍜",
    },
    {
      id: "lunch-sushi",
      name: "Sushi restaurant",
      category: "Food",
      duration: 75,
      icon: "🍣",
    },
  ],
  afternoon: [
    {
      id: "afternoon-shopping",
      name: "Shopping district",
      category: "Shopping",
      duration: 120,
      icon: "🛍️",
    },
    {
      id: "afternoon-park",
      name: "Relax in a park",
      category: "Nature",
      duration: 60,
      icon: "🌳",
    },
  ],
  dinner: [
    {
      id: "dinner-kaiseki",
      name: "Kaiseki dinner",
      category: "Food",
      duration: 120,
      icon: "🍱",
    },
    {
      id: "dinner-yakitori",
      name: "Yakitori restaurant",
      category: "Food",
      duration: 90,
      icon: "🍗",
    },
  ],
  evening: [
    {
      id: "evening-bar",
      name: "Cocktail bar",
      category: "Nightlife",
      duration: 90,
      icon: "🍸",
    },
    {
      id: "evening-walk",
      name: "Night walk",
      category: "Sightseeing",
      duration: 45,
      icon: "🌙",
    },
  ],
};

function FreeSlotSuggestions({
  slot,
  dayIndex,
  onFillSlotWithActivity,
  onClose,
}: FreeSlotSuggestionsProps) {
  const suggestions =
    FALLBACK_SUGGESTIONS[slot.slotType] || FALLBACK_SUGGESTIONS.afternoon;

  const handleSelect = (suggestion: (typeof suggestions)[0]) => {
    if (onFillSlotWithActivity) {
      onFillSlotWithActivity(dayIndex, slot.slotId, {
        name: suggestion.name,
        category: suggestion.category,
        duration: suggestion.duration,
        icon: suggestion.icon,
      });
    }
    onClose();
  };

  return (
    <div className="mt-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">Suggestions</span>
        <button
          onClick={onClose}
          className="text-xs text-gray-400 hover:text-gray-600"
        >
          Cancel
        </button>
      </div>

      <div className="space-y-1.5">
        {suggestions.map((suggestion) => (
          <button
            key={suggestion.id}
            onClick={() => handleSelect(suggestion)}
            className="w-full flex items-center gap-3 p-2 rounded-lg border border-gray-200 hover:border-purple-300 hover:bg-purple-50/50 transition-colors text-left"
          >
            <span className="text-lg">{suggestion.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium text-gray-900 truncate">
                {suggestion.name}
              </div>
              <div className="text-xs text-gray-500">
                {suggestion.category} • {suggestion.duration} min
              </div>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        ))}
      </div>
    </div>
  );
}

// ============================================
// COMPACT COMMUTE INDICATOR
// ============================================

interface CompactCommuteIndicatorProps {
  commute: StructuredCommuteInfo;
  fromLocation?: { lat: number; lng: number };
  toLocation?: { lat: number; lng: number };
}

function CompactCommuteIndicator({
  commute,
  fromLocation,
  toLocation,
}: CompactCommuteIndicatorProps) {
  const methodIcons: Record<string, string> = {
    walk: "🚶",
    transit: "🚃",
    taxi: "🚕",
    drive: "🚗",
  };

  // Generate Google Maps directions URL
  const getGoogleMapsUrl = () => {
    if (
      !fromLocation ||
      !toLocation ||
      !fromLocation.lat ||
      !fromLocation.lng ||
      !toLocation.lat ||
      !toLocation.lng
    ) {
      return null;
    }

    const mode =
      commute.method === "walk"
        ? "walking"
        : commute.method === "transit"
        ? "transit"
        : "driving";

    return `https://www.google.com/maps/dir/?api=1&origin=${fromLocation.lat},${fromLocation.lng}&destination=${toLocation.lat},${toLocation.lng}&travelmode=${mode}`;
  };

  const mapsUrl = getGoogleMapsUrl();

  const content = (
    <div
      className={cn(
        "flex items-center gap-1.5 px-2.5 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full text-xs text-gray-500",
        mapsUrl &&
          "hover:bg-blue-100 dark:hover:bg-blue-900 cursor-pointer transition-colors border border-transparent hover:border-blue-300"
      )}
    >
      <span>{methodIcons[commute.method] || "🚶"}</span>
      <span className="font-medium">{Math.round(commute.duration)} min</span>
      <span className="capitalize">{commute.method}</span>
      {mapsUrl && (
        <span className="text-blue-500 font-medium ml-1">→ Maps</span>
      )}
    </div>
  );

  if (mapsUrl) {
    return (
      <div className="flex items-center justify-center py-1.5">
        <a
          href={mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          title="View directions in Google Maps"
        >
          {content}
        </a>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-center py-1.5">{content}</div>
  );
}

// ============================================
// COMPACT MAP
// ============================================

interface CompactMapProps {
  markers: MapMarkerData[];
  center: { lat: number; lng: number };
  bounds: [[number, number], [number, number]] | null;
  routePath: [number, number][];
  hoveredSlotIndex: number | null;
  accommodation?: {
    name: string;
    coordinates: { lat: number; lng: number };
  };
}

function CompactMap({
  markers,
  center,
  bounds,
  routePath,
  hoveredSlotIndex,
  accommodation,
}: CompactMapProps) {
  const [isClient, setIsClient] = useState(false);
  const [leafletLoaded, setLeafletLoaded] = useState(false);

  React.useEffect(() => {
    setIsClient(true);

    // Load Leaflet CSS
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    link.integrity = "sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=";
    link.crossOrigin = "";
    document.head.appendChild(link);

    setLeafletLoaded(true);

    return () => {
      document.head.removeChild(link);
    };
  }, []);

  if (!isClient || !leafletLoaded) {
    return (
      <div className="bg-gray-100 dark:bg-gray-800 rounded-xl h-[400px] flex items-center justify-center">
        <Loader2 className="w-6 h-6 text-gray-400 animate-spin" />
      </div>
    );
  }

  if (markers.length === 0) {
    return (
      <div className="bg-gray-100 dark:bg-gray-800 rounded-xl h-[400px] flex items-center justify-center">
        <div className="text-center text-gray-500">
          <MapPin className="w-8 h-8 mx-auto mb-2 text-gray-300" />
          <p className="text-sm">No locations for this day</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm overflow-hidden h-[400px]">
      <MapContainer
        center={[center.lat, center.lng]}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
      >
        <MapUpdaterWrapper bounds={bounds} center={center} />

        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Route line */}
        {routePath.length > 1 && (
          <Polyline
            positions={routePath}
            color="#6366f1"
            weight={3}
            opacity={0.6}
            dashArray="8, 8"
          />
        )}

        {/* Activity markers with slot numbers */}
        {markers.map((marker) => {
          const color = MAP_MARKER_COLORS[marker.slotType] || "#6366f1";
          const isHovered = hoveredSlotIndex === marker.slotIndex;

          return (
            <Marker
              key={marker.id}
              position={[marker.coordinates.lat, marker.coordinates.lng]}
              icon={createNumberedIcon(marker.slotIndex, color, isHovered)}
            >
              <Popup>
                <div className="min-w-[180px]">
                  <div className="flex items-center gap-2 mb-1">
                    <span
                      className="w-5 h-5 rounded-full flex items-center justify-center text-white text-xs font-bold"
                      style={{ backgroundColor: color }}
                    >
                      {marker.slotIndex}
                    </span>
                    <span className="text-xs uppercase text-gray-500">
                      {marker.slotType}
                    </span>
                  </div>
                  <h3 className="font-semibold text-gray-900 text-sm">
                    {marker.name}
                  </h3>
                  <div className="mt-1 text-xs text-gray-400">
                    {marker.category}
                  </div>
                </div>
              </Popup>
            </Marker>
          );
        })}

        {/* Accommodation marker */}
        {accommodation && (
          <Marker
            position={[
              accommodation.coordinates.lat,
              accommodation.coordinates.lng,
            ]}
            icon={createHotelMarkerIcon()}
          >
            <Popup>
              <div className="min-w-[150px]">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-lg">🏨</span>
                  <span className="text-xs uppercase text-amber-600 font-medium">
                    Hotel
                  </span>
                </div>
                <h3 className="font-semibold text-gray-900 text-sm">
                  {accommodation.name}
                </h3>
              </div>
            </Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  );
}

// ============================================
// MAP ICON HELPERS
// ============================================

function createNumberedIcon(number: number, color: string, isHovered: boolean) {
  if (typeof window === "undefined") return null;

  const L = require("leaflet");
  const size = isHovered ? 36 : 28;

  return L.divIcon({
    className: "custom-numbered-marker",
    html: `
      <div style="
        width: ${size}px;
        height: ${size}px;
        background: ${color};
        border: 3px solid white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: ${isHovered ? 14 : 12}px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.3);
        transition: all 0.2s ease;
        ${isHovered ? "transform: scale(1.2);" : ""}
      ">
        ${number}
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2],
  });
}

function createHotelMarkerIcon() {
  if (typeof window === "undefined") return null;

  const L = require("leaflet");

  return L.divIcon({
    className: "hotel-marker",
    html: `
      <div style="
        width: 32px;
        height: 32px;
        background: #1f2937;
        border: 3px solid #fbbf24;
        border-radius: 8px;
        display: flex;
        align-items: center;
        justify-content: center;
        font-size: 16px;
        box-shadow: 0 2px 8px rgba(0,0,0,0.4);
      ">
        🏨
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16],
  });
}

// ============================================
// EXPORTS
// ============================================

export default ImprovedItineraryView;
