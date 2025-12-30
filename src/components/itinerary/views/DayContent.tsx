/**
 * DayContent Component
 *
 * Shared day content display used by both TabbedDayView and ListDayView.
 * Includes day header, map toggle, time slots, and commute nodes.
 */

"use client";

import { useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { MapPin, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { SlotOptions } from "../SlotOptions";
import { ItineraryMap } from "@/components/map/ItineraryMap";
import {
  CommuteNode,
  HotelToActivityNode,
  ActivityToHotelNode,
  CityTransferNode,
  ArrivalCommuteNode,
  DepartureCommuteNode,
} from "../CommuteNode";
import type {
  StructuredItineraryData,
  DayWithOptions,
} from "@/types/structured-itinerary";

export interface DayContentProps {
  day: DayWithOptions;
  itinerary: StructuredItineraryData;
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
  showMap?: boolean;
  autoExpandSlotId?: string; // Auto-expand fill suggestions for this slot ID
  onAutoExpandHandled?: () => void; // Callback when auto-expand has been handled
}

export function DayContent({
  day,
  itinerary,
  onSelectOption,
  onFillSlotWithActivity,
  showMap = true,
  autoExpandSlotId,
  onAutoExpandHandled,
}: DayContentProps) {
  const [mapVisible, setMapVisible] = useState(showMap);

  // Resolve criteria-based markers to a specific slot ID
  // This eliminates the race condition where multiple slots try to expand
  const resolvedAutoExpandSlotId = useMemo(() => {
    if (!autoExpandSlotId) return undefined;

    // If it's already a specific slot ID (not a criteria marker), use as-is
    const criteriaMatch = autoExpandSlotId.match(/^find-empty-(\w+)-day(\d+)$/);
    if (!criteriaMatch) {
      return autoExpandSlotId;
    }

    // Parse the criteria
    const [, targetSlotType, targetDayIndex] = criteriaMatch;
    const currentDayIndex = day.dayNumber - 1;

    // Only process if this is the target day
    if (currentDayIndex !== parseInt(targetDayIndex)) {
      return undefined;
    }

    // Log all slots for debugging
    console.log(
      "[DayContent] Looking for empty slot matching:",
      targetSlotType,
      "on day",
      targetDayIndex
    );
    console.log(
      "[DayContent] Available slots:",
      day.slots.map((s) => ({
        id: s.slotId,
        type: s.slotType,
        isEmpty: s.options.length === 0,
        optionCount: s.options.length,
      }))
    );

    // Find the FIRST empty slot matching the criteria
    // Try multiple matching strategies:
    // 1. Exact slotType match
    // 2. slotId contains the target type
    // 3. If looking for a meal (lunch/dinner/breakfast), find a free slot near that time
    for (const slot of day.slots) {
      const isEmptySlot = slot.options.length === 0;
      if (!isEmptySlot) continue;

      // Check if slot type matches directly
      const directMatch = targetSlotType === slot.slotType;

      // Check if slotId contains the target type
      const idContainsType = slot.slotId.includes(`-${targetSlotType}`);

      // Check if this is a free slot (for any target type)
      const isFreeSlot = slot.slotId.startsWith("free-");

      console.log("[DayContent] Checking slot:", {
        slotId: slot.slotId,
        slotType: slot.slotType,
        directMatch,
        idContainsType,
        isFreeSlot,
      });

      if (directMatch || idContainsType) {
        console.log(
          "[DayContent] Resolved criteria marker to slot:",
          slot.slotId
        );
        return slot.slotId;
      }
    }

    // If no exact match found and we have free slots, return the first free slot
    // This handles cases like "fill lunch" when lunch slot is already filled but there's a free time slot
    const firstEmptySlot = day.slots.find((s) => s.options.length === 0);
    if (firstEmptySlot) {
      console.log(
        "[DayContent] No exact match, using first empty slot:",
        firstEmptySlot.slotId
      );
      return firstEmptySlot.slotId;
    }

    console.log(
      "[DayContent] No matching slot found for criteria:",
      autoExpandSlotId
    );
    return undefined;
  }, [autoExpandSlotId, day.slots, day.dayNumber]);

  return (
    <motion.div
      key={day.dayNumber}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
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
            onClick={() => setMapVisible(!mapVisible)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              mapVisible
                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            )}
          >
            <MapPin className="w-4 h-4" />
            {mapVisible ? "Hide Map" : "Show Map"}
          </button>
        </div>
      </div>

      {/* Map View */}
      <AnimatePresence>
        {mapVisible && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6"
          >
            <ItineraryMap
              itinerary={itinerary}
              activeDayNumber={day.dayNumber}
              height="350px"
              showRoute={true}
              className="shadow-lg"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Accommodation Info */}
      {day.accommodation && (
        <div className="mb-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-sm font-medium text-amber-700 dark:text-amber-300">
              {day.accommodation.name}
            </span>
            {day.accommodation.neighborhood && (
              <span className="text-xs text-amber-600/70 dark:text-amber-400/70">
                • {day.accommodation.neighborhood}
              </span>
            )}
          </div>
        </div>
      )}

      {/* Arrival Commute (first day only) */}
      {day.dayNumber === 1 && itinerary.arrival?.commuteToHotel && (
        <div className="mb-4">
          <ArrivalCommuteNode
            commute={itinerary.arrival.commuteToHotel}
            portName={itinerary.arrival.port}
            hotelName={day.accommodation?.name || "Hotel"}
            arrivalTime={itinerary.arrival.arrivalTime}
            flightNumber={
              itinerary.arrival.flightNumber || itinerary.arrival.trainName
            }
          />
        </div>
      )}

      {/* City Transfer (if transitioning from another city) */}
      {day.cityTransition && (
        <div className="mb-4">
          <CityTransferNode
            fromCity={day.cityTransition.from}
            toCity={day.cityTransition.to}
            toStationCommute={day.cityTransition.commuteToStation}
            transferMethod={day.cityTransition.method}
            transferDuration={day.cityTransition.duration}
            transferCost={day.cityTransition.estimatedCost}
            fromStationCommute={day.cityTransition.commuteFromStation}
            departureStation={day.cityTransition.departureStation}
            arrivalStation={day.cityTransition.arrivalStation}
            trainName={day.cityTransition.trainName}
          />
        </div>
      )}

      {/* Hotel to First Activity Commute */}
      {day.commuteFromHotel && day.slots.length > 0 && (
        <div className="mb-2">
          <HotelToActivityNode
            commute={day.commuteFromHotel}
            hotelName={day.accommodation?.name || "Hotel"}
            activityName={
              day.slots[0]?.options?.[0]?.activity?.name || "First Activity"
            }
          />
        </div>
      )}

      {/* Time Slots */}
      <div className="space-y-2">
        {day.slots.map((slot, index) => {
          // Look back through previous slots to find the last one with valid coordinates
          // This handles cases where there are FREE TIME slots (empty options) between activities
          let prevActivityCoords: { lat: number; lng: number } | undefined;
          for (let i = index - 1; i >= 0; i--) {
            const prevSlot = day.slots[i];
            if (prevSlot.options.length > 0) {
              const selectedOption =
                prevSlot.options.find(
                  (o) => o.id === prevSlot.selectedOptionId
                ) || prevSlot.options[0];
              if (selectedOption?.activity?.place?.coordinates) {
                prevActivityCoords = selectedOption.activity.place.coordinates;
                break;
              }
            }
          }

          // Get previous activity name for commute display
          let prevActivityName: string | undefined;
          for (let i = index - 1; i >= 0; i--) {
            const prevSlot = day.slots[i];
            if (prevSlot.options.length > 0) {
              const selectedOption =
                prevSlot.options.find(
                  (o) => o.id === prevSlot.selectedOptionId
                ) || prevSlot.options[0];
              if (selectedOption?.activity?.name) {
                prevActivityName = selectedOption.activity.name;
                break;
              }
            }
          }

          // Get current activity name
          const currentOption =
            slot.options.find((o) => o.id === slot.selectedOptionId) ||
            slot.options[0];
          const currentActivityName = currentOption?.activity?.name;

          return (
            <div key={slot.slotId}>
              {/* Commute from previous activity (between-activities) */}
              {slot.commuteFromPrevious && index > 0 && (
                <CommuteNode
                  commute={{
                    ...slot.commuteFromPrevious,
                    fromName: prevActivityName,
                    toName: currentActivityName,
                  }}
                  type="between-activities"
                  variant="minimal"
                  fromCoords={prevActivityCoords}
                  toCoords={currentOption?.activity?.place?.coordinates}
                />
              )}

              <SlotOptions
                slot={slot}
                onSelectOption={onSelectOption}
                isFirst={index === 0}
                prevActivityCoords={prevActivityCoords}
                dayIndex={day.dayNumber - 1}
                allDaySlots={day.slots}
                city={day.city}
                onFillSlotWithActivity={onFillSlotWithActivity}
                autoExpandSlotId={resolvedAutoExpandSlotId}
                onAutoExpandHandled={onAutoExpandHandled}
              />
            </div>
          );
        })}
      </div>

      {/* Last Activity to Hotel Commute */}
      {day.commuteToHotel && day.slots.length > 0 && (
        <div className="mt-2">
          <ActivityToHotelNode
            commute={day.commuteToHotel}
            activityName={(() => {
              const lastSlotWithActivity = [...day.slots]
                .reverse()
                .find((s) => s.options.length > 0);
              const lastOption =
                lastSlotWithActivity?.options.find(
                  (o) => o.id === lastSlotWithActivity.selectedOptionId
                ) || lastSlotWithActivity?.options[0];
              return lastOption?.activity?.name || "Last Activity";
            })()}
            hotelName={day.accommodation?.name || "Hotel"}
          />
        </div>
      )}

      {/* Departure Commute (last day only) */}
      {day.dayNumber === itinerary.days.length &&
        itinerary.departure?.commuteFromHotel && (
          <div className="mt-4">
            <DepartureCommuteNode
              commute={itinerary.departure.commuteFromHotel}
              hotelName={day.accommodation?.name || "Hotel"}
              portName={itinerary.departure.port}
              departureTime={itinerary.departure.departureTime}
              flightNumber={
                itinerary.departure.flightNumber ||
                itinerary.departure.trainName
              }
            />
          </div>
        )}
    </motion.div>
  );
}
