/**
 * ReorderableSlots Component
 *
 * Displays slots on a proportional time scale with:
 * 1. Commute nodes between activities
 * 2. Empty slots visible
 * 3. Time markers on the left
 *
 * Users can:
 * 1. Select from multiple options within a slot
 * 2. Move an activity to another day (adds as option, doesn't swap)
 * 3. Delete unwanted options
 */

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  MapPin,
  Clock,
  ChevronRight,
  Check,
  Lock,
  Unlock,
  Trash2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import {
  parseTimeToMinutes,
  generateGoogleMapsDirectionsUrl,
  COMMUTE_ICONS,
  SLOT_TYPE_COLORS,
} from "@/utils/itinerary-helpers";
import { FreeTimeSlotCard } from "./FreeTimeSlotCard";
import type {
  StructuredItineraryData,
  DayWithOptions,
  SlotWithOptions,
} from "@/types/structured-itinerary";

// ============================================
// TYPES
// ============================================

export interface ReorderableSlotsProps {
  day: DayWithOptions;
  dayIndex: number;
  onSlotsReorder: (dayIndex: number, newSlots: SlotWithOptions[]) => void;
  onMoveSlotToDay: (
    sourceDayIndex: number,
    slotId: string,
    targetDayIndex: number
  ) => void;
  onSelectOption: (slotId: string, optionId: string) => void;
  onDeleteOption?: (slotId: string, optionId: string) => void;
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

// ============================================
// COMPONENT
// ============================================

export function ReorderableSlots({
  day,
  dayIndex,
  onMoveSlotToDay,
  onSelectOption,
  onDeleteOption,
  onClearSlot,
  onToggleLock,
  onFillSlotWithActivity,
  availableDays,
  itinerary,
}: ReorderableSlotsProps) {
  const [showMoveMenu, setShowMoveMenu] = useState<string | null>(null);
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);

  // Calculate time scale boundaries
  const slots = day.slots;
  const firstSlotStart = slots[0]?.timeRange?.start || "09:00";
  const lastSlotEnd = slots[slots.length - 1]?.timeRange?.end || "21:00";
  const dayStartMinutes = parseTimeToMinutes(firstSlotStart);
  const dayEndMinutes = parseTimeToMinutes(lastSlotEnd);
  const totalDayMinutes = Math.max(dayEndMinutes - dayStartMinutes, 60);

  // Generate time markers (every 2 hours)
  const timeMarkers: string[] = [];
  const startHour = Math.floor(dayStartMinutes / 60);
  const endHour = Math.ceil(dayEndMinutes / 60);
  for (let hour = startHour; hour <= endHour; hour += 2) {
    timeMarkers.push(`${hour.toString().padStart(2, "0")}:00`);
  }

  return (
    <div className="relative">
      {/* Time Scale Header */}
      <div className="flex items-center mb-2 pl-16">
        <div className="flex-1 flex justify-between text-xs text-gray-400 dark:text-gray-500">
          {timeMarkers.map((time) => (
            <span key={time}>{time}</span>
          ))}
        </div>
      </div>

      {/* Timeline Track */}
      <div className="relative ml-16 h-2 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
        {slots.map((slot) => {
          if (slot.options.length === 0) return null;
          const startMinutes = parseTimeToMinutes(slot.timeRange.start);
          const endMinutes = parseTimeToMinutes(slot.timeRange.end);
          const leftPercent =
            ((startMinutes - dayStartMinutes) / totalDayMinutes) * 100;
          const widthPercent =
            ((endMinutes - startMinutes) / totalDayMinutes) * 100;

          return (
            <div
              key={slot.slotId}
              className="absolute h-full bg-purple-400 dark:bg-purple-600 rounded-full"
              style={{
                left: `${leftPercent}%`,
                width: `${Math.max(widthPercent, 2)}%`,
              }}
              title={`${slot.slotType}: ${slot.timeRange.start} - ${slot.timeRange.end}`}
            />
          );
        })}
      </div>

      {/* Slots with Commute Nodes */}
      <div className="space-y-1">
        {/* City Transition */}
        {day.cityTransition && renderCityTransition(day)}

        {/* Commute from Hotel to First Activity */}
        {day.commuteFromHotel &&
          day.accommodation &&
          slots.length > 0 &&
          !day.cityTransition &&
          renderHotelToFirstActivityCommute(day, slots)}

        {/* Render each slot */}
        {slots.map((slot, slotIndex) =>
          renderSlot({
            slot,
            slotIndex,
            slots,
            day,
            dayIndex,
            expandedSlot,
            setExpandedSlot,
            showMoveMenu,
            setShowMoveMenu,
            onSelectOption,
            onDeleteOption,
            onClearSlot,
            onToggleLock,
            onFillSlotWithActivity,
            onMoveSlotToDay,
            availableDays,
            itinerary,
          })
        )}

        {/* Commute back to Hotel */}
        {day.commuteToHotel &&
          day.accommodation &&
          slots.length > 0 &&
          renderLastActivityToHotelCommute(day, slots)}
      </div>
    </div>
  );
}

// ============================================
// RENDER HELPERS
// ============================================

function renderCityTransition(day: DayWithOptions) {
  const transition = day.cityTransition!;
  const hasCommuteToStation = !!transition.commuteToStation;
  const hasCommuteFromStation = !!transition.commuteFromStation;

  const transportIcons: Record<string, string> = {
    shinkansen: "🚄",
    train: "🚃",
    bus: "🚌",
    flight: "✈️",
    car: "🚗",
    ferry: "⛴️",
  };

  return (
    <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-700 rounded-xl">
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">
          {transportIcons[transition.method] || "🚃"}
        </span>
        <span className="font-semibold text-blue-800 dark:text-blue-300">
          Travel Day: {transition.from} → {transition.to}
        </span>
        {transition.trainName && (
          <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-800/40 text-blue-600 dark:text-blue-400 rounded text-xs font-medium">
            {transition.trainName}
          </span>
        )}
      </div>

      <div className="flex flex-col gap-2 text-xs">
        {hasCommuteToStation && transition.commuteToStation && (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-600 font-medium">
              1
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 rounded-lg flex-1">
              <span className="text-lg">🏨</span>
              <span className="text-gray-600 dark:text-gray-400">
                Origin Hotel
              </span>
              <span className="text-gray-400">→</span>
              <span>
                {COMMUTE_ICONS[transition.commuteToStation.method] || "🚶"}
              </span>
              <span className="text-gray-600 dark:text-gray-400">
                {transition.commuteToStation.duration} min
              </span>
              {transition.commuteToStation.trainLines &&
                transition.commuteToStation.trainLines.length > 0 && (
                  <span className="text-purple-500">
                    {transition.commuteToStation.trainLines.join(" → ")}
                  </span>
                )}
              <span className="text-gray-400">→</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">
                🚉 {transition.departureStation}
              </span>
            </div>
          </div>
        )}

        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 font-medium">
            {hasCommuteToStation ? "2" : "1"}
          </div>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 rounded-lg flex-1">
            <span className="font-medium text-gray-700 dark:text-gray-300">
              🚉 {transition.departureStation || transition.from}
            </span>
            <span className="text-gray-400">→</span>
            <span className="text-xl">
              {transportIcons[transition.method] || "🚃"}
            </span>
            <span className="font-medium text-blue-600 dark:text-blue-400">
              {transition.duration} min
            </span>
            <span className="text-gray-500">
              ({transition.departureTime} - {transition.arrivalTime})
            </span>
            {transition.estimatedCost && (
              <span className="text-green-600 dark:text-green-400">
                ¥{transition.estimatedCost.amount.toLocaleString()}
              </span>
            )}
            <span className="text-gray-400">→</span>
            <span className="font-medium text-gray-700 dark:text-gray-300">
              🚉 {transition.arrivalStation || transition.to}
            </span>
          </div>
        </div>

        {hasCommuteFromStation && transition.commuteFromStation && (
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-600 font-medium">
              {hasCommuteToStation ? "3" : "2"}
            </div>
            <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 rounded-lg flex-1">
              <span className="font-medium text-gray-700 dark:text-gray-300">
                🚉 {transition.arrivalStation}
              </span>
              <span className="text-gray-400">→</span>
              <span>
                {COMMUTE_ICONS[transition.commuteFromStation.method] || "🚶"}
              </span>
              <span className="text-gray-600 dark:text-gray-400">
                {transition.commuteFromStation.duration} min
              </span>
              {transition.commuteFromStation.trainLines &&
                transition.commuteFromStation.trainLines.length > 0 && (
                  <span className="text-purple-500">
                    {transition.commuteFromStation.trainLines.join(" → ")}
                  </span>
                )}
              <span className="text-gray-400">→</span>
              <span className="text-lg">🏨</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {day.accommodation?.name || "Destination Hotel"}
              </span>
            </div>
          </div>
        )}
      </div>

      <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
        <span>
          Total travel:{" "}
          <span className="font-medium text-blue-600 dark:text-blue-400">
            {(transition.commuteToStation?.duration || 0) +
              transition.duration +
              (transition.commuteFromStation?.duration || 0)}{" "}
            min
          </span>
        </span>
        <span>•</span>
        <span>Check-in after: {transition.arrivalTime}</span>
      </div>
    </div>
  );
}

function renderHotelToFirstActivityCommute(
  day: DayWithOptions,
  slots: SlotWithOptions[]
) {
  const firstSlot = slots.find((s) => s.options.length > 0);
  const firstActivity =
    firstSlot?.options.find((o) => o.id === firstSlot.selectedOptionId) ||
    firstSlot?.options[0];
  const firstActivityCoords = firstActivity?.activity?.place?.coordinates;
  const hotelCoords = day.accommodation?.coordinates;

  const googleMapsUrl =
    firstActivityCoords && hotelCoords
      ? generateGoogleMapsDirectionsUrl(
          hotelCoords,
          firstActivityCoords,
          day.commuteFromHotel!.method
        )
      : null;

  return (
    <div className="flex items-center gap-2 py-2 pl-16 mb-2">
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-xs">
        <span className="text-lg">🏨</span>
        <div className="flex flex-col">
          <span className="font-medium text-amber-800 dark:text-amber-300">
            From: {day.accommodation?.name}
          </span>
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mt-0.5">
            <span>{COMMUTE_ICONS[day.commuteFromHotel!.method] || "🚶"}</span>
            <span>{day.commuteFromHotel!.duration} min</span>
            {day.commuteFromHotel!.distance && (
              <span>
                • {(day.commuteFromHotel!.distance / 1000).toFixed(1)}km
              </span>
            )}
            {day.commuteFromHotel!.trainLines &&
              day.commuteFromHotel!.trainLines.length > 0 && (
                <span className="text-purple-500 dark:text-purple-400">
                  {day.commuteFromHotel!.trainLines.join(" → ")}
                </span>
              )}
          </div>
        </div>
        <span className="mx-2 text-amber-400">→</span>
        <span className="font-medium text-amber-800 dark:text-amber-300">
          First Activity
        </span>
        {googleMapsUrl && (
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-800/40 transition-colors flex items-center gap-1"
            title="Open directions in Google Maps"
          >
            <span className="text-sm">🗺️</span>
            <span className="font-medium">Directions</span>
          </a>
        )}
      </div>
    </div>
  );
}

function renderLastActivityToHotelCommute(
  day: DayWithOptions,
  slots: SlotWithOptions[]
) {
  const lastSlotWithActivity = [...slots]
    .reverse()
    .find((s) => s.options.length > 0);
  const lastActivity =
    lastSlotWithActivity?.options.find(
      (o) => o.id === lastSlotWithActivity.selectedOptionId
    ) || lastSlotWithActivity?.options[0];
  const lastActivityCoords = lastActivity?.activity?.place?.coordinates;
  const hotelCoords = day.accommodation?.coordinates;

  const googleMapsUrl =
    lastActivityCoords && hotelCoords
      ? generateGoogleMapsDirectionsUrl(
          lastActivityCoords,
          hotelCoords,
          day.commuteToHotel!.method
        )
      : null;

  return (
    <div className="flex items-center gap-2 py-2 pl-16 mt-2">
      <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-xs">
        <span className="font-medium text-amber-800 dark:text-amber-300">
          Last Activity
        </span>
        <span className="mx-2 text-amber-400">→</span>
        <span className="text-lg">🏨</span>
        <div className="flex flex-col">
          <span className="font-medium text-amber-800 dark:text-amber-300">
            To: {day.accommodation?.name}
          </span>
          <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mt-0.5">
            <span>{COMMUTE_ICONS[day.commuteToHotel!.method] || "🚶"}</span>
            <span>{day.commuteToHotel!.duration} min</span>
            {day.commuteToHotel!.distance && (
              <span>
                • {(day.commuteToHotel!.distance / 1000).toFixed(1)}km
              </span>
            )}
            {day.commuteToHotel!.trainLines &&
              day.commuteToHotel!.trainLines.length > 0 && (
                <span className="text-purple-500 dark:text-purple-400">
                  {day.commuteToHotel!.trainLines.join(" → ")}
                </span>
              )}
          </div>
        </div>
        {googleMapsUrl && (
          <a
            href={googleMapsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-2 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-800/40 transition-colors flex items-center gap-1"
            title="Open directions in Google Maps"
          >
            <span className="text-sm">🗺️</span>
            <span className="font-medium">Directions</span>
          </a>
        )}
      </div>
    </div>
  );
}

interface RenderSlotParams {
  slot: SlotWithOptions;
  slotIndex: number;
  slots: SlotWithOptions[];
  day: DayWithOptions;
  dayIndex: number;
  expandedSlot: string | null;
  setExpandedSlot: (id: string | null) => void;
  showMoveMenu: string | null;
  setShowMoveMenu: (id: string | null) => void;
  onSelectOption: (slotId: string, optionId: string) => void;
  onDeleteOption?: (slotId: string, optionId: string) => void;
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
  onMoveSlotToDay: (
    sourceDayIndex: number,
    slotId: string,
    targetDayIndex: number
  ) => void;
  availableDays: { index: number; label: string }[];
  itinerary?: StructuredItineraryData;
}

function renderSlot(params: RenderSlotParams) {
  const {
    slot,
    slotIndex,
    slots,
    day,
    dayIndex,
    expandedSlot,
    setExpandedSlot,
    showMoveMenu,
    setShowMoveMenu,
    onSelectOption,
    onDeleteOption,
    onClearSlot,
    onToggleLock,
    onFillSlotWithActivity,
    onMoveSlotToDay,
    availableDays,
    itinerary,
  } = params;

  const isExpanded = expandedSlot === slot.slotId;
  const hasMultipleOptions = slot.options.length > 1;
  const isEmpty = slot.options.length === 0;

  const selectedOption = isEmpty
    ? null
    : slot.options.find((o) => o.id === slot.selectedOptionId) ||
      slot.options[0];

  // Look back through previous slots to find the last one with valid coordinates
  // This handles cases where there are FREE TIME slots (empty options) between activities
  let prevSelectedOption: (typeof slots)[number]["options"][number] | null =
    null;
  for (let i = slotIndex - 1; i >= 0; i--) {
    const prevSlot = slots[i];
    if (prevSlot.options.length > 0) {
      const option =
        prevSlot.options.find((o) => o.id === prevSlot.selectedOptionId) ||
        prevSlot.options[0];
      if (option?.activity?.place?.coordinates) {
        prevSelectedOption = option;
        break;
      }
    }
  }

  const startMinutes = parseTimeToMinutes(slot.timeRange.start);
  const endMinutes = parseTimeToMinutes(slot.timeRange.end);
  const durationMinutes = endMinutes - startMinutes;
  const minHeight = isEmpty ? 60 : Math.max(80, durationMinutes * 0.8);

  const commuteGoogleMapsUrl = (() => {
    if (!slot.commuteFromPrevious || slotIndex === 0) return null;

    const isAfterTransport =
      prevSelectedOption?.activity?.category === "transport";
    const isTravelDay = !!day.cityTransition;

    let fromCoords;
    if (isTravelDay && isAfterTransport && day.accommodation?.coordinates) {
      fromCoords = day.accommodation.coordinates;
    } else {
      fromCoords = prevSelectedOption?.activity?.place?.coordinates;
    }

    const toCoords = selectedOption?.activity?.place?.coordinates;
    if (!fromCoords || !toCoords) return null;
    return generateGoogleMapsDirectionsUrl(
      fromCoords,
      toCoords,
      slot.commuteFromPrevious.method
    );
  })();

  const isAfterTransportOnTravelDay =
    slotIndex > 0 &&
    prevSelectedOption?.activity?.category === "transport" &&
    !!day.cityTransition;

  return (
    <div key={slot.slotId}>
      {/* Commute Node */}
      {slotIndex > 0 && slot.commuteFromPrevious && (
        <div className="flex items-center gap-2 py-2 pl-16">
          <div className="flex-1 border-l-2 border-dashed border-gray-300 dark:border-gray-600 h-8" />
          {isAfterTransportOnTravelDay ? (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-xs">
              <span className="text-lg">🏨</span>
              <span className="font-medium text-amber-800 dark:text-amber-300">
                {day.accommodation?.name || "Hotel"}
              </span>
              <span className="text-amber-400 mx-1">→</span>
              <span>
                {COMMUTE_ICONS[slot.commuteFromPrevious.method] || "🚶"}
              </span>
              <span className="text-amber-600 dark:text-amber-400">
                {slot.commuteFromPrevious.duration} min
              </span>
              {slot.commuteFromPrevious.distance && (
                <span className="text-amber-500 dark:text-amber-500">
                  • {(slot.commuteFromPrevious.distance / 1000).toFixed(1)}km
                </span>
              )}
              {commuteGoogleMapsUrl && (
                <a
                  href={commuteGoogleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-800/40 transition-colors"
                  title="Open directions in Google Maps"
                >
                  🗺️
                </a>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full text-xs text-gray-600 dark:text-gray-400">
              <span>
                {COMMUTE_ICONS[slot.commuteFromPrevious.method] || "🚶"}
              </span>
              <span>{slot.commuteFromPrevious.duration} min</span>
              {slot.commuteFromPrevious.distance && (
                <span className="text-gray-400">
                  • {(slot.commuteFromPrevious.distance / 1000).toFixed(1)}km
                </span>
              )}
              {slot.commuteFromPrevious.trainLines &&
                slot.commuteFromPrevious.trainLines.length > 0 && (
                  <span className="text-purple-500 dark:text-purple-400">
                    {slot.commuteFromPrevious.trainLines.join(" → ")}
                  </span>
                )}
              {commuteGoogleMapsUrl && (
                <a
                  href={commuteGoogleMapsUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ml-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-800/40 transition-colors"
                  title="Open directions in Google Maps"
                >
                  🗺️
                </a>
              )}
            </div>
          )}
          <div className="flex-1 border-l-2 border-dashed border-gray-300 dark:border-gray-600 h-8" />
        </div>
      )}

      {/* Divider for slots without commute */}
      {slotIndex > 0 && !slot.commuteFromPrevious && (
        <div className="flex items-center gap-2 py-1 pl-16">
          <div className="flex-1 border-t border-dashed border-gray-200 dark:border-gray-700" />
        </div>
      )}

      {/* Slot Card */}
      <div className="flex gap-3">
        {/* Time Label */}
        <div className="w-14 flex-shrink-0 text-right">
          <div className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {slot.timeRange.start}
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500">
            {slot.timeRange.end}
          </div>
        </div>

        {/* Slot Content */}
        <div
          className={cn(
            "flex-1 rounded-lg border overflow-hidden transition-all",
            isEmpty
              ? "border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50"
              : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm"
          )}
          style={{
            minHeight: `${minHeight}px`,
            borderLeftWidth: "4px",
            borderLeftColor: SLOT_TYPE_COLORS[slot.slotType] || "#6b7280",
          }}
        >
          {isEmpty ? (
            <FreeTimeSlotCard
              slot={slot}
              slotIndex={slotIndex}
              previousSlot={slotIndex > 0 ? slots[slotIndex - 1] : null}
              nextSlot={
                slotIndex < slots.length - 1 ? slots[slotIndex + 1] : null
              }
              allDaySlots={day.slots}
              itinerary={itinerary}
              dayIndex={dayIndex}
              onSelectOption={onSelectOption}
              onFillSlotWithActivity={onFillSlotWithActivity}
            />
          ) : (
            <div className="p-3">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="px-2 py-0.5 text-xs font-medium capitalize bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded">
                      {slot.slotType}
                    </span>
                    {hasMultipleOptions && (
                      <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-xs">
                        {slot.options.length} options
                      </span>
                    )}
                    {slot.selectedOptionId && (
                      <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                        <Check className="w-3 h-3" />
                      </span>
                    )}
                    {slot.isLocked && (
                      <span className="flex items-center gap-1 text-xs text-red-500 dark:text-red-400">
                        <Lock className="w-3 h-3" />
                      </span>
                    )}
                  </div>

                  <h4 className="font-medium text-gray-900 dark:text-white">
                    {selectedOption?.activity.name}
                  </h4>

                  {selectedOption?.activity.place?.neighborhood && (
                    <div className="flex items-center gap-1 mt-1 text-sm text-gray-500 dark:text-gray-400">
                      <MapPin className="w-3 h-3" />
                      <span>{selectedOption.activity.place.neighborhood}</span>
                    </div>
                  )}

                  {selectedOption?.activity.duration && (
                    <div className="flex items-center gap-1 mt-1 text-xs text-gray-400 dark:text-gray-500">
                      <Clock className="w-3 h-3" />
                      <span>{selectedOption.activity.duration} min</span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex items-center gap-1">
                  <button
                    onClick={() => onToggleLock?.(dayIndex, slot.slotId)}
                    className={cn(
                      "p-1.5 rounded-md transition-colors",
                      slot.isLocked
                        ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                        : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
                    )}
                    title={slot.isLocked ? "Unlock slot" : "Lock slot"}
                  >
                    {slot.isLocked ? (
                      <Lock className="w-4 h-4" />
                    ) : (
                      <Unlock className="w-4 h-4" />
                    )}
                  </button>

                  <button
                    onClick={() => onClearSlot?.(dayIndex, slot.slotId)}
                    className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 rounded-md transition-colors"
                    title="Clear slot"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>

                  {hasMultipleOptions && (
                    <button
                      onClick={() =>
                        setExpandedSlot(isExpanded ? null : slot.slotId)
                      }
                      className={cn(
                        "px-2 py-1 text-xs rounded-md transition-colors",
                        isExpanded
                          ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                      )}
                    >
                      {isExpanded ? "Hide" : "Options"}
                    </button>
                  )}

                  <div className="relative">
                    <button
                      onClick={() =>
                        setShowMoveMenu(
                          showMoveMenu === slot.slotId ? null : slot.slotId
                        )
                      }
                      className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                      title="Move to another day"
                    >
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    </button>

                    {showMoveMenu === slot.slotId && (
                      <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 min-w-[140px]">
                        <div className="p-2 border-b border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-500 dark:text-gray-400">
                          Move to Day
                        </div>
                        {availableDays
                          .filter((d) => d.index !== dayIndex)
                          .map((d) => (
                            <button
                              key={d.index}
                              onClick={() => {
                                onMoveSlotToDay(dayIndex, slot.slotId, d.index);
                                setShowMoveMenu(null);
                              }}
                              className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                            >
                              {d.label}
                            </button>
                          ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Options List */}
              <AnimatePresence>
                {isExpanded && hasMultipleOptions && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: "auto", opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    className="overflow-hidden mt-3 pt-3 border-t border-gray-100 dark:border-gray-700"
                  >
                    <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                      Click to select:
                    </p>
                    <div className="space-y-2">
                      {slot.options.map((option, index) => {
                        const isSelected =
                          option.id === slot.selectedOptionId ||
                          (index === 0 && !slot.selectedOptionId);
                        return (
                          <div
                            key={option.id}
                            className={cn(
                              "flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer",
                              isSelected
                                ? "border-purple-300 bg-purple-50 dark:border-purple-600 dark:bg-purple-900/20"
                                : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 hover:border-purple-200 dark:hover:border-purple-700"
                            )}
                            onClick={() =>
                              onSelectOption(slot.slotId, option.id)
                            }
                          >
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                {isSelected && (
                                  <Check className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                )}
                                <span
                                  className={cn(
                                    "font-medium text-sm",
                                    isSelected
                                      ? "text-purple-700 dark:text-purple-300"
                                      : "text-gray-700 dark:text-gray-300"
                                  )}
                                >
                                  {option.activity.name}
                                </span>
                                <span className="text-xs text-gray-400">
                                  #{option.rank}
                                </span>
                              </div>
                              {option.activity.place?.neighborhood && (
                                <p className="text-xs text-gray-500 dark:text-gray-400 ml-6">
                                  {option.activity.place.neighborhood}
                                </p>
                              )}
                            </div>

                            {slot.options.length > 1 && onDeleteOption && (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  onDeleteOption(slot.slotId, option.id);
                                }}
                                className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                title="Remove this option"
                              >
                                <span className="text-xs">✕</span>
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
