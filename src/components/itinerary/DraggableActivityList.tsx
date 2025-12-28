/**
 * Draggable Activity List Component
 *
 * Provides drag-and-drop functionality for reordering activities
 * within days and across days using framer-motion.
 */

"use client";

import React, { useState, useCallback } from "react";
import { motion, Reorder, useDragControls } from "framer-motion";
import {
  GripVertical,
  Clock,
  MapPin,
  AlertCircle,
  ChevronRight,
} from "lucide-react";
import type { ScheduledActivity, DaySchedule } from "@/lib/schedule-builder";
import { cn } from "@/lib/utils";

// ============================================
// TYPES
// ============================================

interface DraggableActivityListProps {
  dayIndex: number;
  slots: ScheduledActivity[];
  onReorder: (
    dayIndex: number,
    fromSlotIndex: number,
    toSlotIndex: number
  ) => void;
  onMoveToDay?: (
    activityId: string,
    sourceDayIndex: number,
    sourceSlotIndex: number,
    targetDayIndex: number
  ) => void;
  availableDays?: { dayIndex: number; label: string }[];
  readOnly?: boolean;
  className?: string;
}

interface DraggableSlotProps {
  slot: ScheduledActivity;
  slotIndex: number;
  dayIndex: number;
  onMoveToDay?: (targetDayIndex: number) => void;
  availableDays?: { dayIndex: number; label: string }[];
  readOnly?: boolean;
}

interface DraggableDayListProps {
  days: DaySchedule[];
  onReorderDays: (fromIndex: number, toIndex: number) => void;
  onSwapDays?: (dayIndex1: number, dayIndex2: number) => void;
  onActivityReorder: (
    dayIndex: number,
    fromSlotIndex: number,
    toSlotIndex: number
  ) => void;
  onMoveActivityToDay?: (
    activityId: string,
    sourceDayIndex: number,
    sourceSlotIndex: number,
    targetDayIndex: number
  ) => void;
  readOnly?: boolean;
  className?: string;
}

// ============================================
// DRAGGABLE SLOT COMPONENT
// ============================================

function DraggableSlot({
  slot,
  slotIndex,
  dayIndex,
  onMoveToDay,
  availableDays,
  readOnly,
}: DraggableSlotProps) {
  const [showMoveMenu, setShowMoveMenu] = useState(false);
  const dragControls = useDragControls();

  const activity = slot.activity?.activity;
  if (!activity) return null;

  return (
    <motion.div
      layout
      className={cn(
        "relative flex items-stretch bg-white rounded-lg border shadow-sm",
        "hover:shadow-md transition-shadow",
        readOnly && "cursor-default"
      )}
      whileHover={{ scale: readOnly ? 1 : 1.01 }}
      whileTap={{ scale: readOnly ? 1 : 0.99 }}
    >
      {/* Drag Handle */}
      {!readOnly && (
        <div
          className="flex items-center px-2 cursor-grab active:cursor-grabbing bg-gray-50 rounded-l-lg border-r"
          onPointerDown={(e) => dragControls.start(e)}
        >
          <GripVertical className="w-4 h-4 text-gray-400" />
        </div>
      )}

      {/* Activity Content */}
      <div className="flex-1 p-3">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <h4 className="font-medium text-gray-900">{activity.name}</h4>
            <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
              <Clock className="w-3.5 h-3.5" />
              <span>
                {slot.scheduledStart} - {slot.scheduledEnd}
              </span>
            </div>
            {typeof activity.address === "string" && activity.address && (
              <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                <MapPin className="w-3.5 h-3.5" />
                <span className="truncate">{activity.address}</span>
              </div>
            )}
          </div>

          {/* Move to Day Menu */}
          {!readOnly &&
            onMoveToDay &&
            availableDays &&
            availableDays.length > 0 && (
              <div className="relative">
                <button
                  onClick={() => setShowMoveMenu(!showMoveMenu)}
                  className="p-1.5 hover:bg-gray-100 rounded-md transition-colors"
                  title="Move to another day"
                >
                  <ChevronRight className="w-4 h-4 text-gray-400" />
                </button>

                {showMoveMenu && (
                  <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border z-50 min-w-[140px]">
                    <div className="p-2 border-b text-xs font-medium text-gray-500">
                      Move to Day
                    </div>
                    {availableDays
                      .filter((d) => d.dayIndex !== dayIndex)
                      .map((day) => (
                        <button
                          key={day.dayIndex}
                          onClick={() => {
                            onMoveToDay(day.dayIndex);
                            setShowMoveMenu(false);
                          }}
                          className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors"
                        >
                          {day.label}
                        </button>
                      ))}
                  </div>
                )}
              </div>
            )}
        </div>

        {/* Booking Indicator */}
        {slot.isLocked && (
          <div className="flex items-center gap-1 mt-2 text-xs text-amber-600">
            <AlertCircle className="w-3.5 h-3.5" />
            <span>Has booking</span>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ============================================
// DRAGGABLE ACTIVITY LIST
// ============================================

export function DraggableActivityList({
  dayIndex,
  slots,
  onReorder,
  onMoveToDay,
  availableDays,
  readOnly = false,
  className,
}: DraggableActivityListProps) {
  const [orderedSlots, setOrderedSlots] = useState(slots);

  // Sync with external changes
  React.useEffect(() => {
    setOrderedSlots(slots);
  }, [slots]);

  const handleReorder = useCallback(
    (newOrder: ScheduledActivity[]) => {
      const fromIndex = slots.findIndex(
        (s) =>
          s.slotId ===
          orderedSlots.find((os, i) => os.slotId !== newOrder[i]?.slotId)
            ?.slotId
      );
      const toIndex = newOrder.findIndex(
        (s) =>
          s.slotId ===
          orderedSlots.find((os, i) => os.slotId !== newOrder[i]?.slotId)
            ?.slotId
      );

      if (fromIndex !== -1 && toIndex !== -1 && fromIndex !== toIndex) {
        onReorder(dayIndex, fromIndex, toIndex);
      }

      setOrderedSlots(newOrder);
    },
    [dayIndex, slots, orderedSlots, onReorder]
  );

  const handleMoveToDay = useCallback(
    (slotIndex: number, activityId: string) => (targetDayIndex: number) => {
      onMoveToDay?.(activityId, dayIndex, slotIndex, targetDayIndex);
    },
    [dayIndex, onMoveToDay]
  );

  const activitySlots = orderedSlots.filter((slot) => slot.activity?.activity);

  if (activitySlots.length === 0) {
    return (
      <div className={cn("text-center py-8 text-gray-400", className)}>
        No activities scheduled
      </div>
    );
  }

  if (readOnly) {
    return (
      <div className={cn("space-y-3", className)}>
        {activitySlots.map((slot, index) => (
          <DraggableSlot
            key={slot.slotId}
            slot={slot}
            slotIndex={index}
            dayIndex={dayIndex}
            readOnly
          />
        ))}
      </div>
    );
  }

  return (
    <Reorder.Group
      axis="y"
      values={orderedSlots}
      onReorder={handleReorder}
      className={cn("space-y-3", className)}
    >
      {activitySlots.map((slot, index) => (
        <Reorder.Item key={slot.slotId} value={slot}>
          <DraggableSlot
            slot={slot}
            slotIndex={index}
            dayIndex={dayIndex}
            onMoveToDay={
              onMoveToDay && slot.activity?.activity?.id
                ? handleMoveToDay(index, slot.activity.activity.id)
                : undefined
            }
            availableDays={availableDays}
          />
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
}

// ============================================
// DRAGGABLE DAY LIST
// ============================================

export function DraggableDayList({
  days,
  onReorderDays,
  onSwapDays,
  onActivityReorder,
  onMoveActivityToDay,
  readOnly = false,
  className,
}: DraggableDayListProps) {
  const [orderedDays, setOrderedDays] = useState(days);
  const [expandedDays, setExpandedDays] = useState<Set<number>>(
    new Set(days.map((_, i) => i))
  );

  React.useEffect(() => {
    setOrderedDays(days);
  }, [days]);

  const toggleDay = useCallback((dayIndex: number) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(dayIndex)) {
        next.delete(dayIndex);
      } else {
        next.add(dayIndex);
      }
      return next;
    });
  }, []);

  const handleDayReorder = useCallback(
    (newOrder: DaySchedule[]) => {
      const oldIndex = orderedDays.findIndex(
        (d) =>
          !newOrder.some((nd, i) => nd.dayNumber === orderedDays[i]?.dayNumber)
      );
      const newIndex = newOrder.findIndex(
        (d) =>
          !orderedDays.some((od, i) => od.dayNumber === newOrder[i]?.dayNumber)
      );

      if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
        onReorderDays(oldIndex, newIndex);
      }

      setOrderedDays(newOrder);
    },
    [orderedDays, onReorderDays]
  );

  const availableDays = orderedDays.map((day, index) => ({
    dayIndex: index,
    label: `Day ${day.dayNumber} - ${formatDate(day.date)}`,
  }));

  if (readOnly) {
    return (
      <div className={cn("space-y-6", className)}>
        {orderedDays.map((day, dayIndex) => (
          <DayCard
            key={day.dayNumber}
            day={day}
            dayIndex={dayIndex}
            isExpanded={expandedDays.has(dayIndex)}
            onToggle={() => toggleDay(dayIndex)}
            onActivityReorder={onActivityReorder}
            readOnly
          />
        ))}
      </div>
    );
  }

  return (
    <Reorder.Group
      axis="y"
      values={orderedDays}
      onReorder={handleDayReorder}
      className={cn("space-y-6", className)}
    >
      {orderedDays.map((day, dayIndex) => (
        <Reorder.Item key={day.dayNumber} value={day}>
          <DayCard
            day={day}
            dayIndex={dayIndex}
            isExpanded={expandedDays.has(dayIndex)}
            onToggle={() => toggleDay(dayIndex)}
            onActivityReorder={onActivityReorder}
            onMoveActivityToDay={onMoveActivityToDay}
            availableDays={availableDays}
            onSwapWith={
              onSwapDays
                ? (otherDayIndex) => onSwapDays(dayIndex, otherDayIndex)
                : undefined
            }
          />
        </Reorder.Item>
      ))}
    </Reorder.Group>
  );
}

// ============================================
// DAY CARD COMPONENT
// ============================================

interface DayCardProps {
  day: DaySchedule;
  dayIndex: number;
  isExpanded: boolean;
  onToggle: () => void;
  onActivityReorder: (
    dayIndex: number,
    fromSlotIndex: number,
    toSlotIndex: number
  ) => void;
  onMoveActivityToDay?: (
    activityId: string,
    sourceDayIndex: number,
    sourceSlotIndex: number,
    targetDayIndex: number
  ) => void;
  availableDays?: { dayIndex: number; label: string }[];
  onSwapWith?: (otherDayIndex: number) => void;
  readOnly?: boolean;
}

function DayCard({
  day,
  dayIndex,
  isExpanded,
  onToggle,
  onActivityReorder,
  onMoveActivityToDay,
  availableDays,
  onSwapWith,
  readOnly,
}: DayCardProps) {
  const [showSwapMenu, setShowSwapMenu] = useState(false);
  const activityCount =
    day.slots?.filter((s) => s.activity?.activity).length ?? 0;

  return (
    <motion.div
      layout
      className="bg-white rounded-xl border shadow-sm overflow-hidden"
    >
      {/* Day Header */}
      <div
        className={cn(
          "flex items-center justify-between p-4 bg-gradient-to-r from-blue-50 to-white",
          !readOnly && "cursor-grab active:cursor-grabbing"
        )}
      >
        <div className="flex items-center gap-3">
          {!readOnly && <GripVertical className="w-5 h-5 text-gray-400" />}
          <div>
            <h3 className="font-semibold text-gray-900">Day {day.dayNumber}</h3>
            <p className="text-sm text-gray-500">{formatDate(day.date)}</p>
          </div>
          <span className="px-2 py-0.5 text-xs font-medium text-blue-600 bg-blue-100 rounded-full">
            {activityCount} {activityCount === 1 ? "activity" : "activities"}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Swap Menu */}
          {!readOnly && onSwapWith && availableDays && (
            <div className="relative">
              <button
                onClick={() => setShowSwapMenu(!showSwapMenu)}
                className="px-2 py-1 text-xs text-gray-500 hover:text-gray-700 hover:bg-gray-100 rounded transition-colors"
              >
                Swap
              </button>
              {showSwapMenu && (
                <div className="absolute right-0 top-full mt-1 bg-white rounded-lg shadow-lg border z-50 min-w-[140px]">
                  <div className="p-2 border-b text-xs font-medium text-gray-500">
                    Swap with
                  </div>
                  {availableDays
                    .filter((d) => d.dayIndex !== dayIndex)
                    .map((d) => (
                      <button
                        key={d.dayIndex}
                        onClick={() => {
                          onSwapWith(d.dayIndex);
                          setShowSwapMenu(false);
                        }}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 transition-colors"
                      >
                        {d.label}
                      </button>
                    ))}
                </div>
              )}
            </div>
          )}

          {/* Expand/Collapse */}
          <button
            onClick={onToggle}
            className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
          >
            <motion.div
              animate={{ rotate: isExpanded ? 90 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </motion.div>
          </button>
        </div>
      </div>

      {/* Activities */}
      <motion.div
        initial={false}
        animate={{
          height: isExpanded ? "auto" : 0,
          opacity: isExpanded ? 1 : 0,
        }}
        transition={{ duration: 0.3 }}
        className="overflow-hidden"
      >
        <div className="p-4 border-t">
          <DraggableActivityList
            dayIndex={dayIndex}
            slots={day.slots || []}
            onReorder={onActivityReorder}
            onMoveToDay={onMoveActivityToDay}
            availableDays={availableDays}
            readOnly={readOnly}
          />
        </div>
      </motion.div>
    </motion.div>
  );
}

// ============================================
// UTILITIES
// ============================================

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

// ============================================
// EXPORTS
// ============================================

export { DraggableSlot, DayCard };
