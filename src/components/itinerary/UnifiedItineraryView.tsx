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
import { AnimatePresence } from "framer-motion";
import { useItineraryValidation } from "@/hooks/useItineraryValidation";
import { cn } from "@/lib/utils";
import { selectOption } from "@/lib/structured-itinerary-parser";
import type {
  DayWithOptions,
  SlotWithOptions,
  ItinerarySlotType,
  ActivityOption,
} from "@/types/structured-itinerary";

import {
  SLOT_TYPE_ORDER,
  parseTimeToMinutes,
  formatMinutesToTime,
  recalculateTimeSlots,
  mergeConsecutiveFreeSlots,
} from "@/utils/itinerary-helpers";
import { calculateImpact } from "@/utils/itinerary-validation";

import { TabbedDayView, ListDayView } from "./views";
import { useItineraryHistory } from "./hooks";
import {
  ItineraryHeader,
  ImpactPanel,
  HistoryPanel,
  StickyMapPanel,
  TravelTipsSection,
  ReorderModeBanner,
} from "./panels";
import type {
  ViewMode,
  ValidationIssue,
  FillSlotActivityData,
  UnifiedItineraryViewProps,
  ItineraryExecutionContext,
} from "./types";

// Re-export types for external use
export type { UnifiedItineraryViewProps, ItineraryExecutionContext };

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

  // Core state
  const [itinerary, setItinerary] = useState(processedItinerary);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const [isReorderMode, setIsReorderMode] = useState(false);

  // Panel visibility state
  const [showImpactPanel, setShowImpactPanel] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showStickyMap, setShowStickyMap] = useState(true);

  // Track modified slots for map highlighting
  const [modifiedSlotIds, setModifiedSlotIds] = useState<string[]>([]);

  // Custom hooks
  const historyManager = useItineraryHistory();

  // Itinerary validation hook
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

  // Helper to track modified slots (auto-clear after 3 seconds)
  const trackModifiedSlot = useCallback((slotId: string) => {
    setModifiedSlotIds((prev) => [
      ...prev.filter((id) => id !== slotId),
      slotId,
    ]);
    setTimeout(() => {
      setModifiedSlotIds((prev) => prev.filter((id) => id !== slotId));
    }, 3000);
  }, []);

  // Undo handler
  const handleUndo = useCallback(() => {
    const previousState = historyManager.undo(itinerary);
    if (previousState) {
      setItinerary(previousState);
      onItineraryChange?.(previousState);
    }
  }, [historyManager, itinerary, onItineraryChange]);

  // Handle option selection
  const handleSelectOption = useCallback(
    (slotId: string, optionId: string) => {
      historyManager.saveToHistory("Select activity option", itinerary);

      let updated = selectOption(itinerary, slotId, optionId);

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
        const mergedSlots = mergeConsecutiveFreeSlots(recalculatedSlots);

        const updatedDays = [...updated.days];
        updatedDays[dayIndex] = { ...day, slots: mergedSlots };
        updated = { ...updated, days: updatedDays };
      }

      setItinerary(updated);
      onItineraryChange?.(updated);
      trackModifiedSlot(slotId);
    },
    [itinerary, onItineraryChange, historyManager, trackModifiedSlot]
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
      trackModifiedSlot(slotId);
    },
    [itinerary, onItineraryChange, historyManager, trackModifiedSlot]
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
    (dayIndex: number, slotId: string, activity: FillSlotActivityData) => {
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
      trackModifiedSlot(filledSlot.slotId);
    },
    [itinerary, onItineraryChange, historyManager, trackModifiedSlot]
  );

  // Handle days reorder
  const handleDaysReorder = useCallback(
    (newDays: DayWithOptions[]) => {
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

  // Handle slots reorder within a day
  const handleSlotsReorder = useCallback(
    (dayIndex: number, newSlots: SlotWithOptions[]) => {
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
    [itinerary, onItineraryChange]
  );

  // Handle move slot to another day
  const handleMoveSlotToDay = useCallback(
    (sourceDayIndex: number, slotId: string, targetDayIndex: number) => {
      const sourceDaySlots = [...itinerary.days[sourceDayIndex].slots];
      const slotIndex = sourceDaySlots.findIndex((s) => s.slotId === slotId);
      if (slotIndex === -1) return;

      const sourceSlot = sourceDaySlots[slotIndex];
      const optionToMove =
        sourceSlot.options.find((o) => o.id === sourceSlot.selectedOptionId) ||
        sourceSlot.options[0];

      if (!optionToMove) return;

      const remainingOptions = sourceSlot.options.filter(
        (o) => o.id !== optionToMove.id
      );

      sourceDaySlots[slotIndex] = {
        ...sourceSlot,
        options: remainingOptions,
        selectedOptionId: remainingOptions.length > 0 ? undefined : undefined,
      };

      const targetDaySlots = [...itinerary.days[targetDayIndex].slots];
      const compatibleSlotIndex = targetDaySlots.findIndex(
        (s) => s.slotType === sourceSlot.slotType
      );

      if (compatibleSlotIndex !== -1) {
        const compatibleSlot = targetDaySlots[compatibleSlotIndex];
        targetDaySlots[compatibleSlotIndex] = {
          ...compatibleSlot,
          options: [
            ...compatibleSlot.options,
            {
              ...optionToMove,
              id: `${optionToMove.id}-moved-${Date.now()}`,
              rank: compatibleSlot.options.length + 1,
            },
          ],
        };
      } else {
        const existingSlotTypes = new Set(
          targetDaySlots.map((s) => s.slotType)
        );
        let targetSlotType = sourceSlot.slotType;

        if (existingSlotTypes.has(targetSlotType)) {
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

        const newSlot: SlotWithOptions = {
          slotId: `${
            itinerary.days[targetDayIndex].dayNumber
          }-${targetSlotType}-${Date.now()}`,
          slotType: targetSlotType,
          timeRange: { start: "09:00", end: "12:00" },
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
        targetDaySlots.sort((a, b) => {
          const orderA = SLOT_TYPE_ORDER[a.slotType] ?? 99;
          const orderB = SLOT_TYPE_ORDER[b.slotType] ?? 99;
          return orderA - orderB;
        });
      }

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

  // Day navigation
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
      <ItineraryHeader
        itinerary={itinerary}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        isReorderMode={isReorderMode}
        onReorderModeChange={setIsReorderMode}
        enableReordering={enableReordering}
        showStickyMap={showStickyMap}
        onShowStickyMapChange={setShowStickyMap}
        showImpactPanel={showImpactPanel}
        onShowImpactPanelChange={setShowImpactPanel}
        showHistoryPanel={showHistoryPanel}
        onShowHistoryPanelChange={setShowHistoryPanel}
        history={historyManager.history}
        onUndo={handleUndo}
        validationIssues={validationIssues}
        healthScore={healthScore}
        healthStatus={healthStatus}
        healthSummary={healthSummary}
        topIssues={topIssues}
      />

      {/* Impact Panel */}
      <AnimatePresence>
        {showImpactPanel && (
          <ImpactPanel
            validationIssues={validationIssues}
            impact={impact}
            onClose={() => setShowImpactPanel(false)}
          />
        )}
      </AnimatePresence>

      {/* History Panel */}
      <AnimatePresence>
        {showHistoryPanel && historyManager.history.length > 0 && (
          <HistoryPanel
            history={historyManager.history}
            onUndo={handleUndo}
            onClearHistory={historyManager.clearHistory}
            onClose={() => setShowHistoryPanel(false)}
            formatTimeAgo={historyManager.formatTimeAgo}
          />
        )}
      </AnimatePresence>

      {/* Reorder Mode Banner */}
      {isReorderMode && <ReorderModeBanner />}

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
          <StickyMapPanel
            itinerary={itinerary}
            activeDayIndex={activeDayIndex}
            onDayChange={setActiveDayIndex}
            modifiedSlotIds={modifiedSlotIds}
          />
        )}
      </div>

      {/* General Tips */}
      <TravelTipsSection tips={itinerary.generalTips || []} />
    </div>
  );
}
