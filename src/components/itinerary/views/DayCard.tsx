/**
 * DayCard Component
 *
 * A collapsible card for displaying a single day in list view.
 * Supports reordering, map toggle, and slot management.
 */

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, ChevronDown, GripVertical } from "lucide-react";
import { cn } from "@/lib/utils";
import { SlotOptions } from "../SlotOptions";
import { ReorderableSlots } from "../slots/ReorderableSlots";
import { ItineraryMap } from "@/components/map/ItineraryMap";
import type {
  StructuredItineraryData,
  DayWithOptions,
  SlotWithOptions,
} from "@/types/structured-itinerary";

export interface DayCardProps {
  day: DayWithOptions;
  dayIndex: number;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectOption: (slotId: string, optionId: string) => void;
  isReorderMode: boolean;
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
  availableDays: { index: number; label: string }[];
  itinerary?: StructuredItineraryData;
}

export function DayCard({
  day,
  dayIndex,
  isExpanded,
  onToggle,
  onSelectOption,
  isReorderMode,
  onSlotsReorder,
  onMoveSlotToDay,
  onClearSlot,
  onToggleLock,
  onFillSlotWithActivity,
  availableDays,
  itinerary,
}: DayCardProps) {
  const activityCount = day.slots.length;
  const [showMap, setShowMap] = useState(false);

  return (
    <motion.div
      layout
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden"
    >
      {/* Day Header */}
      <div
        className={cn(
          "flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-white dark:from-purple-900/20 dark:to-gray-800",
          isReorderMode && "cursor-grab active:cursor-grabbing"
        )}
      >
        <div className="flex items-center gap-3">
          {isReorderMode && (
            <GripVertical className="w-5 h-5 text-gray-400 flex-shrink-0" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">📅</span>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Day {day.dayNumber}: {day.title}
              </h3>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mt-1">
              <span>{day.date}</span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {day.city}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 text-xs font-medium text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900/30 rounded-full">
            {activityCount} {activityCount === 1 ? "activity" : "activities"}
          </span>

          {/* Map Toggle for List View */}
          {!isReorderMode && itinerary && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMap(!showMap);
              }}
              className={cn(
                "p-2 rounded-lg transition-colors",
                showMap
                  ? "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
                  : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
              )}
              title={showMap ? "Hide Map" : "Show Map"}
            >
              <MapPin className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onToggle}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="w-5 h-5 text-gray-400" />
            </motion.div>
          </button>
        </div>
      </div>

      {/* Day Content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              {/* Map for List View */}
              {showMap && itinerary && !isReorderMode && (
                <div className="mb-4">
                  <ItineraryMap
                    itinerary={itinerary}
                    activeDayNumber={day.dayNumber}
                    height="250px"
                    showRoute={true}
                    className="shadow-md rounded-lg"
                  />
                </div>
              )}

              {isReorderMode ? (
                <ReorderableSlots
                  day={day}
                  dayIndex={dayIndex}
                  onSlotsReorder={onSlotsReorder}
                  onMoveSlotToDay={onMoveSlotToDay}
                  onSelectOption={onSelectOption}
                  onClearSlot={onClearSlot}
                  onToggleLock={onToggleLock}
                  onFillSlotWithActivity={onFillSlotWithActivity}
                  availableDays={availableDays}
                  itinerary={itinerary}
                />
              ) : (
                <div className="space-y-2">
                  {day.slots.map((slot, index) => {
                    // Look back through previous slots to find the last one with valid coordinates
                    // This handles cases where there are FREE TIME slots (empty options) between activities
                    let prevActivityCoords:
                      | { lat: number; lng: number }
                      | undefined;
                    for (let i = index - 1; i >= 0; i--) {
                      const prevSlot = day.slots[i];
                      if (prevSlot.options.length > 0) {
                        const selectedOption =
                          prevSlot.options.find(
                            (o) => o.id === prevSlot.selectedOptionId
                          ) || prevSlot.options[0];
                        if (selectedOption?.activity?.place?.coordinates) {
                          prevActivityCoords =
                            selectedOption.activity.place.coordinates;
                          break;
                        }
                      }
                    }

                    return (
                      <SlotOptions
                        key={slot.slotId}
                        slot={slot}
                        onSelectOption={onSelectOption}
                        isFirst={index === 0}
                        prevActivityCoords={prevActivityCoords}
                        dayIndex={dayIndex}
                        allDaySlots={day.slots}
                        city={day.city}
                        onFillSlotWithActivity={onFillSlotWithActivity}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
