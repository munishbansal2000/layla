/**
 * ListDayView Component
 *
 * Shows all days in a scrollable list with drag-drop reordering.
 * Supports expanding/collapsing days and tracking scroll position.
 */

"use client";

import { useState, useMemo, useCallback } from "react";
import { motion, Reorder } from "framer-motion";
import { DayCard } from "./DayCard";
import type {
  StructuredItineraryData,
  DayWithOptions,
  SlotWithOptions,
} from "@/types/structured-itinerary";

export interface ListDayViewProps {
  itinerary: StructuredItineraryData;
  isReorderMode: boolean;
  onSelectOption: (slotId: string, optionId: string) => void;
  onDaysReorder: (newDays: DayWithOptions[]) => void;
  onSlotsReorder: (dayIndex: number, newSlots: SlotWithOptions[]) => void;
  onMoveSlotToDay: (
    sourceDayIndex: number,
    slotId: string,
    targetDayIndex: number
  ) => void;
  onClearSlot?: (dayIndex: number, slotId: string) => void;
  onToggleLock?: (dayIndex: number, slotId: string) => void;
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
  onActiveDayChange?: (dayIndex: number) => void;
}

export function ListDayView({
  itinerary,
  isReorderMode,
  onSelectOption,
  onDaysReorder,
  onSlotsReorder,
  onMoveSlotToDay,
  onClearSlot,
  onToggleLock,
  onFillSlotWithActivity,
  onActiveDayChange,
}: ListDayViewProps) {
  const [expandedDays, setExpandedDays] = useState<Set<number>>(
    new Set(itinerary.days.map((_, i) => i))
  );

  // Refs for day cards to track scroll position
  const dayRefs = useMemo(() => new Map<number, HTMLDivElement>(), []);

  // Set up IntersectionObserver to track which day is in view
  const observerRef = useMemo(() => {
    if (typeof window === "undefined") return null;

    return new IntersectionObserver(
      (entries) => {
        let maxRatio = 0;
        let activeDayIndex = -1;

        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            const dayIndex = parseInt(
              entry.target.getAttribute("data-day-index") || "0",
              10
            );
            activeDayIndex = dayIndex;
          }
        });

        if (activeDayIndex >= 0 && onActiveDayChange) {
          onActiveDayChange(activeDayIndex);
        }
      },
      {
        root: null,
        rootMargin: "-20% 0px -60% 0px",
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    );
  }, [onActiveDayChange]);

  // Register day refs with observer
  const registerDayRef = useCallback(
    (dayIndex: number, el: HTMLDivElement | null) => {
      if (el) {
        dayRefs.set(dayIndex, el);
        observerRef?.observe(el);
      } else {
        const existingRef = dayRefs.get(dayIndex);
        if (existingRef) {
          observerRef?.unobserve(existingRef);
          dayRefs.delete(dayIndex);
        }
      }
    },
    [dayRefs, observerRef]
  );

  // Cleanup observer on unmount
  useMemo(() => {
    return () => {
      observerRef?.disconnect();
    };
  }, [observerRef]);

  const toggleDay = (index: number) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  if (isReorderMode) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <Reorder.Group
          axis="y"
          values={itinerary.days}
          onReorder={onDaysReorder}
          className="space-y-4"
        >
          {itinerary.days.map((day, dayIndex) => (
            <Reorder.Item key={day.dayNumber} value={day}>
              <div
                ref={(el) => registerDayRef(dayIndex, el)}
                data-day-index={dayIndex}
              >
                <DayCard
                  day={day}
                  dayIndex={dayIndex}
                  isExpanded={expandedDays.has(dayIndex)}
                  onToggle={() => toggleDay(dayIndex)}
                  onSelectOption={onSelectOption}
                  isReorderMode={isReorderMode}
                  onSlotsReorder={onSlotsReorder}
                  onMoveSlotToDay={onMoveSlotToDay}
                  onClearSlot={onClearSlot}
                  onToggleLock={onToggleLock}
                  onFillSlotWithActivity={onFillSlotWithActivity}
                  availableDays={itinerary.days.map((d, i) => ({
                    index: i,
                    label: `Day ${d.dayNumber}`,
                  }))}
                  itinerary={itinerary}
                />
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-4"
    >
      {itinerary.days.map((day, dayIndex) => (
        <div
          key={day.dayNumber}
          ref={(el) => registerDayRef(dayIndex, el)}
          data-day-index={dayIndex}
        >
          <DayCard
            day={day}
            dayIndex={dayIndex}
            isExpanded={expandedDays.has(dayIndex)}
            onToggle={() => toggleDay(dayIndex)}
            onSelectOption={onSelectOption}
            isReorderMode={false}
            onSlotsReorder={onSlotsReorder}
            onMoveSlotToDay={onMoveSlotToDay}
            onClearSlot={onClearSlot}
            onToggleLock={onToggleLock}
            onFillSlotWithActivity={onFillSlotWithActivity}
            availableDays={itinerary.days.map((d, i) => ({
              index: i,
              label: `Day ${d.dayNumber}`,
            }))}
            itinerary={itinerary}
          />
        </div>
      ))}
    </motion.div>
  );
}
