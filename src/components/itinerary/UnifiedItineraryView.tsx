/**
 * Unified Itinerary View Component
 *
 * Combines both view modes:
 * 1. Tabbed Day View - Shows one day at a time with tabs to switch between days
 * 2. List View - Shows all days in a scrollable list with drag-drop reordering
 *
 * Both modes support:
 * - Activity selection from multiple options (carousel)
 * - Map integration
 * - Commute information
 * - Drag-and-drop reordering (when enabled)
 * - Move activities between days
 * - Consistent styling
 */

"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  MapPin,
  Wallet,
  GripVertical,
  List,
  LayoutGrid,
  Clock,
  Check,
  Undo2,
  AlertTriangle,
  AlertCircle,
  Info,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { useTravelFeasibility } from "@/hooks/useTravelFeasibility";
import { useItineraryValidation } from "@/hooks/useItineraryValidation";
import { parseDirective, executeDirective } from "@/lib/chat-directive-parser";
import { cn } from "@/lib/utils";
import { selectOption } from "@/lib/structured-itinerary-parser";
import { ItineraryMap } from "@/components/map/ItineraryMap";
import type {
  StructuredItineraryData,
  DayWithOptions,
  SlotWithOptions,
  ItinerarySlotType,
  ActivityOption,
} from "@/types/structured-itinerary";

// Import extracted utilities
import {
  SLOT_TYPE_ORDER,
  parseTimeToMinutes,
  formatMinutesToTime,
  formatTimeAgo,
  recalculateTimeSlots,
  mergeConsecutiveFreeSlots,
} from "@/utils/itinerary-helpers";
import { calculateClusters } from "@/utils/semantic-model";
import {
  calculateImpact,
  type HistoryEntry,
} from "@/utils/itinerary-validation";

// Import extracted view components
import { TabbedDayView, ListDayView } from "./views";

// ============================================
// TYPES
// ============================================

type ViewMode = "tabbed" | "list";

interface UnifiedItineraryViewProps {
  itinerary: StructuredItineraryData;
  onItineraryChange?: (updated: StructuredItineraryData) => void;
  className?: string;
  defaultViewMode?: ViewMode;
  enableReordering?: boolean;
  autoExpandSlotId?: string; // Auto-expand fill suggestions for this slot ID (from chat)
  onAutoExpandHandled?: () => void; // Callback when auto-expand has been handled
}

// ============================================
// UNIFIED ITINERARY VIEW
// ============================================

export function UnifiedItineraryView({
  itinerary: initialItinerary,
  onItineraryChange,
  className,
  defaultViewMode = "tabbed",
  enableReordering = true,
  autoExpandSlotId,
  onAutoExpandHandled,
}: UnifiedItineraryViewProps) {
  // Process itinerary to ensure empty slots are visible
  const processedItinerary = useMemo(() => {
    const result = { ...initialItinerary };
    result.days = result.days.map((day) => {
      const startTime = day.slots[0]?.timeRange?.start || "09:00";
      const recalculatedSlots = recalculateTimeSlots(
        day.slots,
        startTime,
        day.dayNumber
      );
      const mergedSlots = mergeConsecutiveFreeSlots(
        recalculatedSlots,
        day.dayNumber
      );
      return { ...day, slots: mergedSlots };
    });
    return result;
  }, [initialItinerary]);

  const [itinerary, setItinerary] = useState(processedItinerary);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const [isReorderMode, setIsReorderMode] = useState(false);

  // History for undo/redo functionality
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const [showImpactPanel, setShowImpactPanel] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);

  // Track modified slots for map highlighting
  const [modifiedSlotIds, setModifiedSlotIds] = useState<string[]>([]);
  const [showStickyMap, setShowStickyMap] = useState(true);

  // Travel feasibility hook
  const { checkMoveFeasibility } = useTravelFeasibility();

  // Itinerary validation hook - provides real-time constraint checking
  const {
    validationState,
    healthScore,
    healthStatus,
    healthSummary,
    topIssues,
    validateUserAction,
    getSlotViolations,
    getDayViolations,
  } = useItineraryValidation(itinerary);

  // Calculate clusters for the active day
  const activeDayClusters = useMemo(() => {
    const activeDay = itinerary.days[activeDayIndex];
    if (!activeDay) return [];
    return calculateClusters(activeDay.slots);
  }, [itinerary, activeDayIndex]);

  // Calculate day metrics for pacing warnings
  const dayMetrics = useMemo(() => {
    return itinerary.days.map((day) => {
      let totalWalkingDistance = 0;
      let totalCommuteTime = 0;
      let activityCount = 0;

      for (const slot of day.slots) {
        if (slot.commuteFromPrevious) {
          totalCommuteTime += slot.commuteFromPrevious.duration || 0;
          if (slot.commuteFromPrevious.method === "walk") {
            totalWalkingDistance += slot.commuteFromPrevious.distance || 0;
          }
        }
        if (slot.options.length > 0) {
          activityCount++;
        }
      }

      // Calculate intensity score (0-1)
      const intensityScore = Math.min(
        1,
        (totalWalkingDistance / 15000 +
          totalCommuteTime / 240 +
          activityCount / 8) /
          3
      );

      return {
        dayNumber: day.dayNumber,
        totalWalkingDistance,
        totalCommuteTime,
        activityCount,
        intensityScore,
      };
    });
  }, [itinerary]);

  // Calculate current validation issues - use hook data when available
  const validationIssues = useMemo(() => {
    if (!validationState) return [];

    // Convert constraint violations to the existing ValidationIssue format
    return validationState.violations.map((violation) => {
      // Find the day number for this violation if it has an affected slot
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
            ? ("error" as const)
            : violation.severity === "warning"
            ? ("warning" as const)
            : ("info" as const),
        message: violation.message,
        details: violation.resolution,
        slotId: violation.affectedSlotId,
        dayNumber,
      };
    });
  }, [validationState, itinerary.days]);

  // Calculate impact from initial state
  const impact = useMemo(() => {
    if (history.length === 0) return null;
    return calculateImpact(initialItinerary, itinerary);
  }, [initialItinerary, itinerary, history.length]);

  // Helper to save history before making changes
  const saveToHistory = useCallback(
    (description: string) => {
      setHistory((prev) => [
        ...prev.slice(-9), // Keep last 10 entries
        {
          timestamp: Date.now(),
          itinerary: JSON.parse(JSON.stringify(itinerary)),
          description,
        },
      ]);
    },
    [itinerary]
  );

  // Helper to track modified slots (auto-clear after 3 seconds)
  const trackModifiedSlot = useCallback((slotId: string) => {
    setModifiedSlotIds((prev) => [
      ...prev.filter((id) => id !== slotId),
      slotId,
    ]);
    // Clear after 3 seconds
    setTimeout(() => {
      setModifiedSlotIds((prev) => prev.filter((id) => id !== slotId));
    }, 3000);
  }, []);

  // Undo function
  const handleUndo = useCallback(() => {
    if (history.length === 0) return;

    const lastEntry = history[history.length - 1];

    // Save current state to redo stack before undoing
    setRedoStack((prev) => [
      ...prev.slice(-9),
      {
        timestamp: Date.now(),
        itinerary: JSON.parse(JSON.stringify(itinerary)),
        description: `Undo: ${lastEntry.description}`,
      },
    ]);

    setItinerary(lastEntry.itinerary);
    setHistory((prev) => prev.slice(0, -1));
    onItineraryChange?.(lastEntry.itinerary);
  }, [history, itinerary, onItineraryChange]);

  // Redo function
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;

    const lastRedo = redoStack[redoStack.length - 1];

    // Save current state to history
    setHistory((prev) => [
      ...prev.slice(-9),
      {
        timestamp: Date.now(),
        itinerary: JSON.parse(JSON.stringify(itinerary)),
        description: `Redo: ${lastRedo.description}`,
      },
    ]);

    setItinerary(lastRedo.itinerary);
    setRedoStack((prev) => prev.slice(0, -1));
    onItineraryChange?.(lastRedo.itinerary);
  }, [redoStack, itinerary, onItineraryChange]);

  // Handle delete individual option from a slot
  const handleDeleteOption = useCallback(
    (slotId: string, optionId: string) => {
      saveToHistory("Delete option");

      // Find the slot
      let dayIndex = -1;
      let slotIndex = -1;

      for (let di = 0; di < itinerary.days.length; di++) {
        const si = itinerary.days[di].slots.findIndex(
          (s) => s.slotId === slotId
        );
        if (si !== -1) {
          dayIndex = di;
          slotIndex = si;
          break;
        }
      }

      if (dayIndex === -1 || slotIndex === -1) return;

      const slot = itinerary.days[dayIndex].slots[slotIndex];
      const remainingOptions = slot.options.filter((o) => o.id !== optionId);

      // Update the slot
      const updatedSlot: SlotWithOptions = {
        ...slot,
        options: remainingOptions,
        selectedOptionId:
          slot.selectedOptionId === optionId
            ? remainingOptions[0]?.id
            : slot.selectedOptionId,
      };

      const updatedSlots = [...itinerary.days[dayIndex].slots];
      updatedSlots[slotIndex] = updatedSlot;

      // Recalculate time slots if empty
      const startTime = updatedSlots[0]?.timeRange?.start || "09:00";
      const recalculatedSlots = recalculateTimeSlots(
        updatedSlots,
        startTime,
        itinerary.days[dayIndex].dayNumber
      );
      const mergedSlots = mergeConsecutiveFreeSlots(recalculatedSlots);

      const updatedDays = [...itinerary.days];
      updatedDays[dayIndex] = { ...updatedDays[dayIndex], slots: mergedSlots };

      const updated = { ...itinerary, days: updatedDays };
      setItinerary(updated);
      onItineraryChange?.(updated);
      trackModifiedSlot(slotId);
    },
    [itinerary, onItineraryChange, saveToHistory, trackModifiedSlot]
  );

  // Handle chat directive input
  const handleChatDirective = useCallback(
    async (input: string) => {
      const directive = parseDirective(input);

      if (!directive) {
        return;
      }

      // Note: These handlers are referenced from scope, not dependencies
      // The itinerary state is accessed via closure
      const result = await executeDirective(directive, itinerary, {});
    },
    [itinerary]
  );

  // Handle option selection
  // When selecting a different option, recalculate time slots if duration changed
  const handleSelectOption = useCallback(
    (slotId: string, optionId: string) => {
      saveToHistory("Select activity option");

      // First, select the option
      let updated = selectOption(itinerary, slotId, optionId);

      // Find which day this slot belongs to and recalculate its time slots
      const dayIndex = updated.days.findIndex((day) =>
        day.slots.some((s) => s.slotId === slotId)
      );

      if (dayIndex !== -1) {
        const day = updated.days[dayIndex];
        const startTime = day.slots[0]?.timeRange?.start || "09:00";
        const recalculatedSlots = recalculateTimeSlots(
          day.slots,
          startTime,
          day.dayNumber
        );

        // Merge consecutive free slots
        const mergedSlots = mergeConsecutiveFreeSlots(recalculatedSlots);

        const updatedDays = [...updated.days];
        updatedDays[dayIndex] = {
          ...day,
          slots: mergedSlots,
        };
        updated = { ...updated, days: updatedDays };
      }

      setItinerary(updated);
      onItineraryChange?.(updated);
      trackModifiedSlot(slotId);
    },
    [itinerary, onItineraryChange, saveToHistory, trackModifiedSlot]
  );

  // Handle clear slot (remove all activities, make it free time)
  const handleClearSlot = useCallback(
    (dayIndex: number, slotId: string) => {
      saveToHistory("Clear slot");

      const updatedDays = [...itinerary.days];
      const day = updatedDays[dayIndex];
      const slotIndex = day.slots.findIndex((s) => s.slotId === slotId);

      if (slotIndex === -1) return;

      const originalSlot = day.slots[slotIndex];

      // Mark the slot as free time (empty options, rename slotId to free-*)
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

      // Merge consecutive free slots WITHOUT recalculating times
      // This preserves the time structure while combining adjacent free slots
      const mergedSlots = mergeConsecutiveFreeSlots(
        updatedSlots,
        day.dayNumber
      );

      updatedDays[dayIndex] = { ...day, slots: mergedSlots };
      const updated = { ...itinerary, days: updatedDays };

      setItinerary(updated);
      onItineraryChange?.(updated);
      trackModifiedSlot(slotId);
    },
    [itinerary, onItineraryChange, saveToHistory, trackModifiedSlot]
  );

  // Handle toggle lock on a slot
  const handleToggleLock = useCallback(
    (dayIndex: number, slotId: string) => {
      const updatedDays = [...itinerary.days];
      const day = updatedDays[dayIndex];
      const slotIndex = day.slots.findIndex((s) => s.slotId === slotId);

      if (slotIndex === -1) return;

      const slot = day.slots[slotIndex];
      const isNowLocked = !slot.isLocked;

      saveToHistory(isNowLocked ? "Lock slot" : "Unlock slot");

      const updatedSlot: SlotWithOptions = {
        ...slot,
        isLocked: isNowLocked,
        rigidityScore: isNowLocked ? 1.0 : undefined, // Reset rigidity when unlocking
        behavior: isNowLocked ? "anchor" : undefined, // Reset behavior when unlocking
      };

      const updatedSlots = [...day.slots];
      updatedSlots[slotIndex] = updatedSlot;

      updatedDays[dayIndex] = { ...day, slots: updatedSlots };
      const updated = { ...itinerary, days: updatedDays };

      setItinerary(updated);
      onItineraryChange?.(updated);
    },
    [itinerary, onItineraryChange, saveToHistory]
  );

  // Handle filling a free slot with an activity (from suggestions)
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
      saveToHistory("Fill slot with activity");

      const updatedDays = [...itinerary.days];
      const day = updatedDays[dayIndex];
      const slotIndex = day.slots.findIndex((s) => s.slotId === slotId);

      if (slotIndex === -1) return;

      const originalSlot = day.slots[slotIndex];

      // Calculate duration - use provided or calculate from slot time range
      const slotStartMinutes = parseTimeToMinutes(originalSlot.timeRange.start);
      const slotEndMinutes = parseTimeToMinutes(originalSlot.timeRange.end);
      const availableDuration = slotEndMinutes - slotStartMinutes;
      const activityDuration =
        activity.duration || Math.min(availableDuration, 90);

      // Create a new option for this activity
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

      // Create the filled slot - remove "free-" prefix if present
      const filledSlot: SlotWithOptions = {
        ...originalSlot,
        slotId: originalSlot.slotId.startsWith("free-")
          ? originalSlot.slotId.replace("free-", "")
          : originalSlot.slotId,
        options: [newOption],
        selectedOptionId: newOptionId,
        isLocked: false,
      };

      // Update the slot's time range based on activity duration
      const newEndMinutes = slotStartMinutes + activityDuration;
      filledSlot.timeRange = {
        start: originalSlot.timeRange.start,
        end: formatMinutesToTime(newEndMinutes),
      };

      const updatedSlots = [...day.slots];
      updatedSlots[slotIndex] = filledSlot;

      // If there's remaining time after the activity, create a new free slot
      if (newEndMinutes < slotEndMinutes - 15) {
        // Determine slot type based on actual time, not inherited from original
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

      // Recalculate time slots to adjust subsequent activities and commutes
      const startTime = updatedSlots[0]?.timeRange?.start || "09:00";
      const recalculatedSlots = recalculateTimeSlots(
        updatedSlots,
        startTime,
        day.dayNumber
      );

      // Merge consecutive free slots
      const mergedSlots = mergeConsecutiveFreeSlots(recalculatedSlots);

      updatedDays[dayIndex] = { ...day, slots: mergedSlots };
      const updated = { ...itinerary, days: updatedDays };

      setItinerary(updated);
      onItineraryChange?.(updated);
      trackModifiedSlot(filledSlot.slotId);
    },
    [itinerary, onItineraryChange, saveToHistory, trackModifiedSlot]
  );

  // Handle day reordering
  const handleDaysReorder = useCallback(
    (newDays: DayWithOptions[]) => {
      // Renumber days
      const renumberedDays = newDays.map((day, index) => ({
        ...day,
        dayNumber: index + 1,
      }));

      const updated = { ...itinerary, days: renumberedDays };
      setItinerary(updated);
      onItineraryChange?.(updated);
    },
    [itinerary, onItineraryChange]
  );

  // Handle slot reordering within a day
  // IMPORTANT: When users reorder, we swap the ACTIVITIES between slots,
  // but keep the slot timeline (morning → evening) intact
  const handleSlotsReorder = useCallback(
    (dayIndex: number, newSlots: SlotWithOptions[]) => {
      const originalSlots = itinerary.days[dayIndex].slots;

      // Extract the new order of activities (options) from the dragged slots
      const reorderedActivities = newSlots.map((slot) => ({
        options: slot.options,
        selectedOptionId: slot.selectedOptionId,
        commuteFromPrevious: slot.commuteFromPrevious,
      }));

      // Apply reordered activities to the original slot structure (preserving timeline)
      const updatedSlots = originalSlots.map((originalSlot, index) => {
        if (index < reorderedActivities.length) {
          const newActivity = reorderedActivities[index];
          return {
            ...originalSlot,
            // Keep the original slot's time structure
            slotId: originalSlot.slotId,
            slotType: originalSlot.slotType,
            timeRange: originalSlot.timeRange,
            // But use the new activity's content
            options: newActivity.options,
            selectedOptionId: newActivity.selectedOptionId,
            // Recalculate commute (undefined for first, keep for others if available)
            commuteFromPrevious:
              index === 0 ? undefined : newActivity.commuteFromPrevious,
          } as SlotWithOptions;
        }
        return originalSlot;
      });

      // Recalculate time slots to ensure no gaps
      // Get the start time from the first slot
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
    [itinerary, onItineraryChange]
  );

  // Move slot to another day
  // The moved activity becomes an OPTION in the target day's slot
  // Source slot keeps remaining options or becomes empty
  const handleMoveSlotToDay = useCallback(
    (sourceDayIndex: number, slotId: string, targetDayIndex: number) => {
      const sourceDaySlots = [...itinerary.days[sourceDayIndex].slots];
      const slotIndex = sourceDaySlots.findIndex((s) => s.slotId === slotId);
      if (slotIndex === -1) return;

      const sourceSlot = sourceDaySlots[slotIndex];

      // Get the selected option (or first option) to move
      const optionToMove =
        sourceSlot.options.find((o) => o.id === sourceSlot.selectedOptionId) ||
        sourceSlot.options[0];

      if (!optionToMove) return;

      // OPTION 1: Remove just the selected option from source slot
      // Keep the slot with remaining options, or mark as empty
      const remainingOptions = sourceSlot.options.filter(
        (o) => o.id !== optionToMove.id
      );

      // Update source slot - keep it but with remaining options (or empty)
      sourceDaySlots[slotIndex] = {
        ...sourceSlot,
        options: remainingOptions,
        selectedOptionId: remainingOptions.length > 0 ? undefined : undefined,
      };

      // Get target day's existing slots
      const targetDaySlots = [...itinerary.days[targetDayIndex].slots];

      // Find a compatible slot in target day (same slot type)
      const compatibleSlotIndex = targetDaySlots.findIndex(
        (s) => s.slotType === sourceSlot.slotType
      );

      if (compatibleSlotIndex !== -1) {
        // Add as an option to the existing compatible slot
        const compatibleSlot = targetDaySlots[compatibleSlotIndex];
        targetDaySlots[compatibleSlotIndex] = {
          ...compatibleSlot,
          options: [
            ...compatibleSlot.options,
            {
              ...optionToMove,
              id: `${optionToMove.id}-moved-${Date.now()}`, // Unique ID
              rank: compatibleSlot.options.length + 1,
            },
          ],
        };
      } else {
        // No compatible slot - create a new slot with this as the only option
        // Find the best slot type based on what's available
        const existingSlotTypes = new Set(
          targetDaySlots.map((s) => s.slotType)
        );
        let targetSlotType = sourceSlot.slotType;

        if (existingSlotTypes.has(targetSlotType)) {
          // Find next available slot type
          const slotTypesInOrder: ItinerarySlotType[] = [
            "morning",
            "breakfast",
            "lunch",
            "afternoon",
            "dinner",
            "evening",
          ];
          const originalTypeIndex = slotTypesInOrder.indexOf(
            sourceSlot.slotType
          );

          for (let offset = 1; offset < slotTypesInOrder.length; offset++) {
            const afterIndex = originalTypeIndex + offset;
            if (
              afterIndex < slotTypesInOrder.length &&
              !existingSlotTypes.has(slotTypesInOrder[afterIndex])
            ) {
              targetSlotType = slotTypesInOrder[afterIndex];
              break;
            }
            const beforeIndex = originalTypeIndex - offset;
            if (
              beforeIndex >= 0 &&
              !existingSlotTypes.has(slotTypesInOrder[beforeIndex])
            ) {
              targetSlotType = slotTypesInOrder[beforeIndex];
              break;
            }
          }
        }

        // Create new slot with the moved activity as an option
        const newSlot: SlotWithOptions = {
          slotId: `${
            itinerary.days[targetDayIndex].dayNumber
          }-${targetSlotType}-${Date.now()}`,
          slotType: targetSlotType,
          timeRange: { start: "09:00", end: "12:00" }, // Will be recalculated
          options: [
            {
              ...optionToMove,
              id: `${optionToMove.id}-moved-${Date.now()}`,
              rank: 1,
            },
          ],
          selectedOptionId: undefined,
          commuteFromPrevious: undefined,
        };

        targetDaySlots.push(newSlot);

        // Sort by slot type order
        targetDaySlots.sort((a, b) => {
          const orderA = SLOT_TYPE_ORDER[a.slotType] ?? 99;
          const orderB = SLOT_TYPE_ORDER[b.slotType] ?? 99;
          return orderA - orderB;
        });
      }

      // Recalculate times for both days
      const sourceStartTime = sourceDaySlots[0]?.timeRange?.start || "09:00";
      const targetStartTime = targetDaySlots[0]?.timeRange?.start || "09:00";

      const recalculatedSourceSlots = recalculateTimeSlots(
        sourceDaySlots,
        sourceStartTime,
        itinerary.days[sourceDayIndex].dayNumber
      );
      const recalculatedTargetSlots = recalculateTimeSlots(
        targetDaySlots,
        targetStartTime,
        itinerary.days[targetDayIndex].dayNumber
      );

      const updatedDays = itinerary.days.map((day, index) => {
        if (index === sourceDayIndex) {
          return { ...day, slots: recalculatedSourceSlots };
        }
        if (index === targetDayIndex) {
          return { ...day, slots: recalculatedTargetSlots };
        }
        return day;
      });

      const updated = { ...itinerary, days: updatedDays };
      setItinerary(updated);
      onItineraryChange?.(updated);
    },
    [itinerary, onItineraryChange]
  );

  // Navigate days (tabbed mode)
  const goToPrevDay = () => {
    if (activeDayIndex > 0) {
      setActiveDayIndex(activeDayIndex - 1);
    }
  };

  const goToNextDay = () => {
    if (activeDayIndex < itinerary.days.length - 1) {
      setActiveDayIndex(activeDayIndex + 1);
    }
  };

  return (
    <div className={cn("unified-itinerary-view", className)}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {itinerary.destination}
            </h2>
            {itinerary.country && (
              <p className="text-gray-500 dark:text-gray-400">
                {itinerary.country}
              </p>
            )}
          </div>

          {/* View Mode Toggle & Controls */}
          <div className="flex items-center gap-2">
            {/* Health Score Badge */}
            {healthStatus && (
              <div
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium",
                  healthStatus === "excellent" &&
                    "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
                  healthStatus === "good" &&
                    "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
                  healthStatus === "fair" &&
                    "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
                  healthStatus === "poor" &&
                    "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                )}
                title={`${healthSummary}${
                  topIssues.length > 0 ? `\n• ${topIssues.join("\n• ")}` : ""
                }`}
              >
                {healthStatus === "excellent" && (
                  <ShieldCheck className="w-4 h-4" />
                )}
                {healthStatus === "good" && <Shield className="w-4 h-4" />}
                {healthStatus === "fair" && <ShieldAlert className="w-4 h-4" />}
                {healthStatus === "poor" && <AlertCircle className="w-4 h-4" />}
                <span>{healthScore}</span>
              </div>
            )}
            {/* Undo Button */}
            {history.length > 0 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleUndo}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                  title={`Undo: ${history[history.length - 1]?.description}`}
                >
                  <Undo2 className="w-4 h-4" />
                  Undo
                </button>
                <button
                  onClick={() => setShowHistoryPanel(!showHistoryPanel)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm transition-all",
                    showHistoryPanel
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                      : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  )}
                  title="View change history"
                >
                  <span className="text-xs">{history.length}</span>
                </button>
              </div>
            )}

            {/* Sticky Map Toggle (only in list mode) */}
            {viewMode === "list" && (
              <button
                onClick={() => setShowStickyMap(!showStickyMap)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                  showStickyMap
                    ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                )}
              >
                <MapPin className="w-4 h-4" />
                Map
              </button>
            )}

            {/* Impact Panel Toggle */}
            {(validationIssues.length > 0 || impact) && (
              <button
                onClick={() => setShowImpactPanel(!showImpactPanel)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                  validationIssues.some((i) => i.type === "error")
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                    : validationIssues.some((i) => i.type === "warning")
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                    : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                )}
              >
                {validationIssues.some((i) => i.type === "error") ? (
                  <AlertCircle className="w-4 h-4" />
                ) : validationIssues.some((i) => i.type === "warning") ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : (
                  <Info className="w-4 h-4" />
                )}
                {validationIssues.length}{" "}
                {validationIssues.length === 1 ? "issue" : "issues"}
              </button>
            )}

            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode("tabbed")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                  viewMode === "tabbed"
                    ? "bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                )}
              >
                <LayoutGrid className="w-4 h-4" />
                Tabs
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                  viewMode === "list"
                    ? "bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                )}
              >
                <List className="w-4 h-4" />
                List
              </button>
            </div>

            {/* Reorder Toggle (only in list mode) */}
            {enableReordering && viewMode === "list" && (
              <button
                onClick={() => setIsReorderMode(!isReorderMode)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                  isReorderMode
                    ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                )}
              >
                <GripVertical className="w-4 h-4" />
                {isReorderMode ? "Done" : "Reorder"}
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-600 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            {itinerary.days.length} days
          </span>
          {itinerary.estimatedBudget && (
            <span className="flex items-center gap-1">
              <Wallet className="w-4 h-4" />$
              {itinerary.estimatedBudget.total.min} - $
              {itinerary.estimatedBudget.total.max}
            </span>
          )}
        </div>
      </div>

      {/* Impact Panel */}
      <AnimatePresence>
        {showImpactPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4"
          >
            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Validation & Impact
                </h3>
                <button
                  onClick={() => setShowImpactPanel(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              </div>

              {/* Impact Summary */}
              {impact && (
                <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Changes from Original
                  </h4>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span
                        className={cn(
                          impact.totalCommuteChange > 0
                            ? "text-red-600 dark:text-red-400"
                            : impact.totalCommuteChange < 0
                            ? "text-green-600 dark:text-green-400"
                            : "text-gray-600 dark:text-gray-400"
                        )}
                      >
                        Commute: {impact.totalCommuteChange > 0 ? "+" : ""}
                        {impact.totalCommuteChange} min
                      </span>
                    </div>
                    {impact.affectedDays.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600 dark:text-gray-400">
                          {impact.affectedDays.length} days affected
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Validation Issues List */}
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {validationIssues.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                    <Check className="w-6 h-6 mx-auto mb-2 text-green-500" />
                    <p className="text-sm">No issues found!</p>
                  </div>
                ) : (
                  validationIssues.map((issue, index) => (
                    <div
                      key={index}
                      className={cn(
                        "p-3 rounded-lg flex items-start gap-3",
                        issue.type === "error" &&
                          "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800",
                        issue.type === "warning" &&
                          "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800",
                        issue.type === "info" &&
                          "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                      )}
                    >
                      {issue.type === "error" && (
                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      )}
                      {issue.type === "warning" && (
                        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      )}
                      {issue.type === "info" && (
                        <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "font-medium text-sm",
                              issue.type === "error" &&
                                "text-red-700 dark:text-red-300",
                              issue.type === "warning" &&
                                "text-amber-700 dark:text-amber-300",
                              issue.type === "info" &&
                                "text-blue-700 dark:text-blue-300"
                            )}
                          >
                            {issue.message}
                          </span>
                          {issue.dayNumber && (
                            <span className="text-xs px-1.5 py-0.5 bg-white dark:bg-gray-800 rounded text-gray-500 dark:text-gray-400">
                              Day {issue.dayNumber}
                            </span>
                          )}
                        </div>
                        {issue.details && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                            {issue.details}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History Panel */}
      <AnimatePresence>
        {showHistoryPanel && history.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4"
          >
            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Undo2 className="w-4 h-4 text-purple-500" />
                  Change History
                </h3>
                <button
                  onClick={() => setShowHistoryPanel(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              </div>

              {/* History Timeline */}
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {history
                  .slice()
                  .reverse()
                  .map((entry, index) => {
                    const isLatest = index === 0;
                    const timeAgo = formatTimeAgo(entry.timestamp);

                    return (
                      <div
                        key={entry.timestamp}
                        className={cn(
                          "flex items-center gap-3 p-2 rounded-lg",
                          isLatest
                            ? "bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700"
                            : "bg-gray-50 dark:bg-gray-900/50"
                        )}
                      >
                        <div
                          className={cn(
                            "w-2 h-2 rounded-full flex-shrink-0",
                            isLatest
                              ? "bg-purple-500"
                              : "bg-gray-300 dark:bg-gray-600"
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <span
                            className={cn(
                              "text-sm",
                              isLatest
                                ? "text-purple-700 dark:text-purple-300 font-medium"
                                : "text-gray-600 dark:text-gray-400"
                            )}
                          >
                            {entry.description}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                          {timeAgo}
                        </span>
                        {isLatest && (
                          <button
                            onClick={handleUndo}
                            className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded hover:bg-purple-200 dark:hover:bg-purple-800/30 transition-colors"
                          >
                            Undo
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>

              {/* Clear History */}
              {history.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {history.length} change{history.length !== 1 ? "s" : ""}{" "}
                    recorded
                  </span>
                  <button
                    onClick={() => setHistory([])}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    Clear history
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reorder Mode Banner */}
      {isReorderMode && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="mb-4 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg flex items-center gap-2"
        >
          <GripVertical className="w-5 h-5 text-purple-500" />
          <div>
            <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
              Drag & Drop Mode
            </p>
            <p className="text-xs text-purple-600 dark:text-purple-400">
              Drag days or activities to reorder. Click &quot;Done&quot; when
              finished.
            </p>
          </div>
        </motion.div>
      )}

      {/* View Content - Split Layout with Sticky Map */}
      <div
        className={cn(
          "flex gap-6",
          showStickyMap && viewMode === "list" ? "flex-row" : "flex-col"
        )}
      >
        {/* Main Content */}
        <div
          className={cn(
            showStickyMap && viewMode === "list" ? "flex-1 min-w-0" : "w-full"
          )}
        >
          <AnimatePresence mode="wait">
            {viewMode === "tabbed" ? (
              <TabbedDayView
                key="tabbed"
                itinerary={itinerary}
                activeDayIndex={activeDayIndex}
                setActiveDayIndex={setActiveDayIndex}
                onSelectOption={handleSelectOption}
                onFillSlotWithActivity={handleFillSlotWithActivity}
                goToPrevDay={goToPrevDay}
                goToNextDay={goToNextDay}
                autoExpandSlotId={autoExpandSlotId}
                onAutoExpandHandled={onAutoExpandHandled}
              />
            ) : (
              <ListDayView
                key="list"
                itinerary={itinerary}
                isReorderMode={isReorderMode}
                onSelectOption={handleSelectOption}
                onDaysReorder={handleDaysReorder}
                onSlotsReorder={handleSlotsReorder}
                onMoveSlotToDay={handleMoveSlotToDay}
                onClearSlot={handleClearSlot}
                onToggleLock={handleToggleLock}
                onFillSlotWithActivity={handleFillSlotWithActivity}
                onActiveDayChange={setActiveDayIndex}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Sticky Map Panel (List View Only) */}
        {showStickyMap && viewMode === "list" && (
          <div className="w-[400px] flex-shrink-0">
            <div className="sticky top-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
                <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-purple-500" />
                    Day {itinerary.days[activeDayIndex]?.dayNumber || 1} Map
                  </h4>
                  <div className="flex gap-1">
                    {itinerary.days.map((day, idx) => (
                      <button
                        key={day.dayNumber}
                        onClick={() => setActiveDayIndex(idx)}
                        className={cn(
                          "w-6 h-6 rounded-full text-xs font-medium transition-colors",
                          idx === activeDayIndex
                            ? "bg-purple-600 text-white"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                        )}
                      >
                        {day.dayNumber}
                      </button>
                    ))}
                  </div>
                </div>
                <ItineraryMap
                  itinerary={itinerary}
                  activeDayNumber={
                    itinerary.days[activeDayIndex]?.dayNumber || 1
                  }
                  modifiedSlotIds={modifiedSlotIds}
                  height="450px"
                  showRoute={true}
                />
                {/* Legend */}
                <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex flex-wrap gap-3 text-xs">
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-amber-500" />
                      <span className="text-gray-600 dark:text-gray-400">
                        Morning
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-green-500" />
                      <span className="text-gray-600 dark:text-gray-400">
                        Lunch
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-blue-500" />
                      <span className="text-gray-600 dark:text-gray-400">
                        Afternoon
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-purple-500" />
                      <span className="text-gray-600 dark:text-gray-400">
                        Dinner
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-pink-500" />
                      <span className="text-gray-600 dark:text-gray-400">
                        Evening
                      </span>
                    </div>
                  </div>
                  {modifiedSlotIds.length > 0 && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                      <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
                      <span>Recently changed</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* General Tips */}
      {itinerary.generalTips && itinerary.generalTips.length > 0 && (
        <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
          <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">
            💡 Travel Tips
          </h3>
          <ul className="space-y-1 text-sm text-blue-700 dark:text-blue-400">
            {itinerary.generalTips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2">
                <span>•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
