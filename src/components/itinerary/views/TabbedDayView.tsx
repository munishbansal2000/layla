/**
 * TabbedDayView Component
 *
 * Shows one day at a time with tabs to switch between days.
 * Includes day navigation and content display.
 */

"use client";

import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { DayContent } from "./DayContent";
import type { StructuredItineraryData } from "@/types/structured-itinerary";

export interface TabbedDayViewProps {
  itinerary: StructuredItineraryData;
  activeDayIndex: number;
  setActiveDayIndex: (index: number) => void;
  onSelectOption: (slotId: string, optionId: string) => void;
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
  goToPrevDay: () => void;
  goToNextDay: () => void;
  autoExpandSlotId?: string; // Auto-expand fill suggestions for this slot ID
  onAutoExpandHandled?: () => void; // Callback when auto-expand has been handled
}

export function TabbedDayView({
  itinerary,
  activeDayIndex,
  setActiveDayIndex,
  onSelectOption,
  onFillSlotWithActivity,
  goToPrevDay,
  goToNextDay,
  autoExpandSlotId,
  onAutoExpandHandled,
}: TabbedDayViewProps) {
  const activeDay = itinerary.days[activeDayIndex];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
    >
      {/* Day Selector Tabs */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
        <button
          onClick={goToPrevDay}
          disabled={activeDayIndex === 0}
          className={cn(
            "p-2 rounded-lg transition-colors flex-shrink-0",
            activeDayIndex === 0
              ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
              : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          )}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex gap-2 overflow-x-auto">
          {itinerary.days.map((day, index) => (
            <button
              key={day.dayNumber}
              onClick={() => setActiveDayIndex(index)}
              className={cn(
                "flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                index === activeDayIndex
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              )}
            >
              Day {day.dayNumber}
            </button>
          ))}
        </div>

        <button
          onClick={goToNextDay}
          disabled={activeDayIndex === itinerary.days.length - 1}
          className={cn(
            "p-2 rounded-lg transition-colors flex-shrink-0",
            activeDayIndex === itinerary.days.length - 1
              ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
              : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          )}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Active Day Content */}
      {activeDay && (
        <DayContent
          day={activeDay}
          itinerary={itinerary}
          onSelectOption={onSelectOption}
          onFillSlotWithActivity={onFillSlotWithActivity}
          showMap={true}
          autoExpandSlotId={autoExpandSlotId}
          onAutoExpandHandled={onAutoExpandHandled}
        />
      )}
    </motion.div>
  );
}
