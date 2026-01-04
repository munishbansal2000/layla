/**
 * Sticky Map Panel Component
 *
 * Displays a sticky map panel in the list view showing the active day's locations.
 */

"use client";

import { MapPin } from "lucide-react";
import { cn } from "@/lib/utils";
import { ItineraryMap } from "@/components/map/ItineraryMap";
import type { StructuredItineraryData } from "@/types/structured-itinerary";

interface StickyMapPanelProps {
  itinerary: StructuredItineraryData;
  activeDayIndex: number;
  onDayChange: (index: number) => void;
  modifiedSlotIds: string[];
}

export function StickyMapPanel({
  itinerary,
  activeDayIndex,
  onDayChange,
  modifiedSlotIds,
}: StickyMapPanelProps) {
  const activeDay = itinerary.days[activeDayIndex];

  return (
    <div className="w-[400px] flex-shrink-0">
      <div className="sticky top-4">
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
          {/* Header */}
          <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
            <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
              <MapPin className="w-4 h-4 text-purple-500" />
              Day {activeDay?.dayNumber || 1} Map
            </h4>
            <DaySelector
              days={itinerary.days}
              activeDayIndex={activeDayIndex}
              onChange={onDayChange}
            />
          </div>

          {/* Map */}
          <ItineraryMap
            itinerary={itinerary}
            activeDayNumber={activeDay?.dayNumber || 1}
            modifiedSlotIds={modifiedSlotIds}
            height="450px"
            showRoute={true}
          />

          {/* Legend */}
          <MapLegend modifiedSlotIds={modifiedSlotIds} />
        </div>
      </div>
    </div>
  );
}

/**
 * Day selector buttons for the map panel
 */
function DaySelector({
  days,
  activeDayIndex,
  onChange,
}: {
  days: StructuredItineraryData["days"];
  activeDayIndex: number;
  onChange: (index: number) => void;
}) {
  return (
    <div className="flex gap-1">
      {days.map((day, idx) => (
        <button
          key={day.dayNumber}
          onClick={() => onChange(idx)}
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
  );
}

/**
 * Map legend showing slot type colors
 */
function MapLegend({ modifiedSlotIds }: { modifiedSlotIds: string[] }) {
  return (
    <div className="p-3 border-t border-gray-200 dark:border-gray-700">
      <div className="flex flex-wrap gap-3 text-xs">
        <LegendItem color="bg-amber-500" label="Morning" />
        <LegendItem color="bg-green-500" label="Lunch" />
        <LegendItem color="bg-blue-500" label="Afternoon" />
        <LegendItem color="bg-purple-500" label="Dinner" />
        <LegendItem color="bg-pink-500" label="Evening" />
      </div>
      {modifiedSlotIds.length > 0 && (
        <div className="mt-2 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
          <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
          <span>Recently changed</span>
        </div>
      )}
    </div>
  );
}

/**
 * Individual legend item
 */
function LegendItem({ color, label }: { color: string; label: string }) {
  return (
    <div className="flex items-center gap-1">
      <span className={cn("w-3 h-3 rounded-full", color)} />
      <span className="text-gray-600 dark:text-gray-400">{label}</span>
    </div>
  );
}
