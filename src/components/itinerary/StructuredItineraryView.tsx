"use client";

import React, { useState, useCallback } from "react";
import { motion } from "framer-motion";
import {
  Calendar,
  MapPin,
  Users,
  Wallet,
  Zap,
  ChevronRight,
  ChevronLeft,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { SlotOptions } from "./SlotOptions";
import { selectOption } from "@/lib/structured-itinerary-parser";
import { ItineraryMap } from "@/components/map/ItineraryMap";
import type {
  StructuredItineraryData,
  DayWithOptions,
} from "@/types/structured-itinerary";

// ============================================
// STRUCTURED ITINERARY VIEW
// ============================================

interface StructuredItineraryViewProps {
  itinerary: StructuredItineraryData;
  onItineraryChange?: (updated: StructuredItineraryData) => void;
  className?: string;
}

export function StructuredItineraryView({
  itinerary: initialItinerary,
  onItineraryChange,
  className,
}: StructuredItineraryViewProps) {
  const [itinerary, setItinerary] = useState(initialItinerary);
  const [activeDayIndex, setActiveDayIndex] = useState(0);

  const activeDay = itinerary.days[activeDayIndex];

  // Handle option selection
  const handleSelectOption = useCallback(
    (slotId: string, optionId: string) => {
      const updated = selectOption(itinerary, slotId, optionId);
      setItinerary(updated);
      onItineraryChange?.(updated);
    },
    [itinerary, onItineraryChange]
  );

  // Navigate days
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
    <div className={cn("structured-itinerary-view", className)}>
      {/* Header */}
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {itinerary.destination}
        </h2>
        {itinerary.country && (
          <p className="text-gray-500 dark:text-gray-400">
            {itinerary.country}
          </p>
        )}

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

      {/* Day Selector Tabs */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
        <button
          onClick={goToPrevDay}
          disabled={activeDayIndex === 0}
          className={cn(
            "p-2 rounded-lg transition-colors",
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
                "px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-colors",
                activeDayIndex === index
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
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
            "p-2 rounded-lg transition-colors",
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
        <DayView
          day={activeDay}
          itinerary={itinerary}
          onSelectOption={handleSelectOption}
        />
      )}

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

// ============================================
// DAY VIEW
// ============================================

interface DayViewProps {
  day: DayWithOptions;
  itinerary: StructuredItineraryData;
  onSelectOption: (slotId: string, optionId: string) => void;
}

function DayView({ day, itinerary, onSelectOption }: DayViewProps) {
  const [showMap, setShowMap] = useState(true);

  return (
    <motion.div
      key={day.dayNumber}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
      className="day-view"
    >
      {/* Day Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📅</span>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Day {day.dayNumber}: {day.title}
              </h3>
              <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                <span>{day.date}</span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {day.city}
                </span>
              </div>
            </div>
          </div>
          {/* Map Toggle Button */}
          <button
            onClick={() => setShowMap(!showMap)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              showMap
                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            )}
          >
            <MapPin className="w-4 h-4" />
            {showMap ? "Hide Map" : "Show Map"}
          </button>
        </div>
      </div>

      {/* Map View */}
      {showMap && (
        <div className="mb-6">
          <ItineraryMap
            itinerary={itinerary}
            activeDayNumber={day.dayNumber}
            height="350px"
            showRoute={true}
            className="shadow-lg"
          />
        </div>
      )}

      {/* Time Slots */}
      <div className="space-y-2">
        {day.slots.map((slot, index) => {
          // Get previous slot's activity coordinates for commute directions
          const prevSlot = index > 0 ? day.slots[index - 1] : null;
          const prevActivityCoords =
            prevSlot && prevSlot.options.length > 0
              ? (
                  prevSlot.options.find(
                    (o) => o.id === prevSlot.selectedOptionId
                  ) || prevSlot.options[0]
                )?.activity?.place?.coordinates
              : undefined;

          return (
            <SlotOptions
              key={slot.slotId}
              slot={slot}
              onSelectOption={onSelectOption}
              isFirst={index === 0}
              prevActivityCoords={prevActivityCoords}
            />
          );
        })}
      </div>
    </motion.div>
  );
}

// ============================================
// EXPORTS
// ============================================

export default StructuredItineraryView;
