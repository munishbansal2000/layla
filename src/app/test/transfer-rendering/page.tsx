"use client";

import React, { useState } from "react";
import testItineraryWithTransfers from "@/fixtures/test-itinerary-with-transfers.json";
import { SlotOptions } from "@/components/itinerary/SlotOptions";
import type {
  StructuredItineraryData,
  SlotWithOptions,
} from "@/types/structured-itinerary";

/**
 * Test page to verify transfer slot rendering
 * Loads a test fixture with transfer slots (behavior: "travel") and renders them
 */
export default function TestTransferRenderingPage() {
  const [selectedDay, setSelectedDay] = useState(1);

  // Cast the imported JSON to the proper type
  const itinerary =
    testItineraryWithTransfers as unknown as StructuredItineraryData;
  const currentDay = itinerary.days.find((d) => d.dayNumber === selectedDay);

  const handleSelectOption = (slotId: string, optionId: string) => {
    console.log(
      `[TestTransferRendering] Selected option ${optionId} for slot ${slotId}`
    );
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 py-8 px-4">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
            Transfer Slot Rendering Test
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            This page tests the TransportSlotCard component rendering for slots
            with{" "}
            <code className="bg-gray-100 dark:bg-gray-800 px-1 rounded">
              behavior: "travel"
            </code>
          </p>
        </div>

        {/* Day Selector */}
        <div className="flex gap-2 mb-6">
          {itinerary.days.map((day) => (
            <button
              key={day.dayNumber}
              onClick={() => setSelectedDay(day.dayNumber)}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                selectedDay === day.dayNumber
                  ? "bg-purple-600 text-white"
                  : "bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
            >
              Day {day.dayNumber}
            </button>
          ))}
        </div>

        {/* Day Info */}
        {currentDay && (
          <div className="bg-white dark:bg-gray-800 rounded-xl p-4 mb-6 shadow-sm">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              {currentDay.title}
            </h2>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {currentDay.city} • {currentDay.date}
            </p>
          </div>
        )}

        {/* Slot Legend */}
        <div className="bg-blue-50 dark:bg-blue-900/20 rounded-xl p-4 mb-6">
          <h3 className="font-medium text-blue-800 dark:text-blue-300 mb-2">
            Legend
          </h3>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-purple-500"></span>
              <span className="text-blue-700 dark:text-blue-400">
                Airport Arrival
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-orange-500"></span>
              <span className="text-blue-700 dark:text-blue-400">
                Airport Departure
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-emerald-500"></span>
              <span className="text-blue-700 dark:text-blue-400">
                Shinkansen
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span className="w-3 h-3 rounded-full bg-blue-500"></span>
              <span className="text-blue-700 dark:text-blue-400">
                Inter-city Transfer
              </span>
            </div>
          </div>
        </div>

        {/* Slots */}
        <div className="space-y-4">
          {currentDay?.slots.map((slot, index) => {
            // Show slot info for debugging
            const isTransportSlot =
              slot.behavior === "travel" ||
              slot.options[0]?.activity?.category === "transport";

            return (
              <div key={slot.slotId}>
                {/* Debug Info */}
                <div className="text-xs text-gray-400 mb-1 font-mono">
                  slotId: {slot.slotId} | behavior:{" "}
                  {slot.behavior || "undefined"} | category:{" "}
                  {slot.options[0]?.activity?.category || "none"} |{" "}
                  <span
                    className={
                      isTransportSlot ? "text-green-500" : "text-gray-400"
                    }
                  >
                    isTransport: {String(isTransportSlot)}
                  </span>
                </div>

                {/* Actual SlotOptions component */}
                <SlotOptions
                  slot={slot as SlotWithOptions}
                  onSelectOption={handleSelectOption}
                  isFirst={index === 0}
                  dayIndex={selectedDay - 1}
                  city={currentDay.city}
                />
              </div>
            );
          })}
        </div>

        {/* Raw JSON for debugging */}
        <div className="mt-8 bg-gray-100 dark:bg-gray-800 rounded-xl p-4">
          <h3 className="font-medium text-gray-700 dark:text-gray-300 mb-2">
            Raw Slot Data (Day {selectedDay})
          </h3>
          <pre className="text-xs overflow-auto text-gray-600 dark:text-gray-400 max-h-96">
            {JSON.stringify(currentDay?.slots, null, 2)}
          </pre>
        </div>
      </div>
    </div>
  );
}
