/**
 * Multi-City Itinerary UI Components
 *
 * Complete set of components for displaying and managing
 * multi-city trip itineraries.
 */

"use client";

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plane,
  Train,
  Bus,
  Ship,
  Car,
  MapPin,
  Calendar,
  Clock,
  ChevronDown,
  ChevronRight,
  Users,
  Wallet,
  Leaf,
  Plus,
  Trash2,
  GripVertical,
  ArrowRight,
} from "lucide-react";
import type {
  MultiCityTrip,
  CityStop,
  InterCityLeg,
  CityItinerary,
  CityDestination,
  InterCityTransportMode,
} from "@/types/multi-city";
import { cn } from "@/lib/utils";

// ============================================
// TRANSPORT MODE ICONS
// ============================================

const TransportIcon: React.FC<{
  mode: InterCityTransportMode;
  className?: string;
}> = ({ mode, className }) => {
  const icons: Record<InterCityTransportMode, React.ReactNode> = {
    flight: <Plane className={className} />,
    train: <Train className={className} />,
    bus: <Bus className={className} />,
    ferry: <Ship className={className} />,
    car_rental: <Car className={className} />,
    private_transfer: <Car className={className} />,
  };

  return <>{icons[mode] || <MapPin className={className} />}</>;
};

// ============================================
// CITY CARD COMPONENT
// ============================================

interface CityCardProps {
  stop: CityStop;
  index: number;
  isExpanded: boolean;
  onToggle: () => void;
  onRemove?: () => void;
  onUpdateNights?: (nights: number) => void;
  cityItinerary?: CityItinerary;
  readonly?: boolean;
}

export function CityCard({
  stop,
  index,
  isExpanded,
  onToggle,
  onRemove,
  onUpdateNights,
  cityItinerary,
  readonly = false,
}: CityCardProps) {
  const city = stop.city;

  return (
    <motion.div
      layout
      className="bg-white rounded-xl border shadow-sm overflow-hidden"
    >
      {/* City Header */}
      <div
        className={cn(
          "flex items-center gap-4 p-4 cursor-pointer hover:bg-gray-50 transition-colors",
          stop.isOrigin && "bg-gradient-to-r from-green-50 to-white",
          stop.isFinalDestination && "bg-gradient-to-r from-blue-50 to-white"
        )}
        onClick={onToggle}
      >
        {/* Drag Handle */}
        {!readonly && (
          <div className="cursor-grab active:cursor-grabbing">
            <GripVertical className="w-5 h-5 text-gray-400" />
          </div>
        )}

        {/* City Number */}
        <div
          className={cn(
            "flex items-center justify-center w-8 h-8 rounded-full text-white font-semibold text-sm",
            stop.isOrigin
              ? "bg-green-500"
              : stop.isFinalDestination
              ? "bg-blue-500"
              : "bg-gray-500"
          )}
        >
          {index + 1}
        </div>

        {/* City Info */}
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-gray-900">{city.name}</h3>
            <span className="text-sm text-gray-500">{city.country}</span>
            {stop.isOrigin && (
              <span className="px-2 py-0.5 text-xs font-medium text-green-600 bg-green-100 rounded-full">
                Start
              </span>
            )}
            {stop.isFinalDestination && (
              <span className="px-2 py-0.5 text-xs font-medium text-blue-600 bg-blue-100 rounded-full">
                End
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 mt-1 text-sm text-gray-500">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {formatDateRange(stop.arrivalDate, stop.departureDate)}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {stop.nights} {stop.nights === 1 ? "night" : "nights"}
            </span>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          {!readonly && onRemove && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                onRemove();
              }}
              className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors"
              title="Remove city"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <motion.div
            animate={{ rotate: isExpanded ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-5 h-5 text-gray-400" />
          </motion.div>
        </div>
      </div>

      {/* Expanded Content */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden"
          >
            <div className="p-4 border-t bg-gray-50">
              {/* Nights Selector */}
              {!readonly && onUpdateNights && (
                <div className="flex items-center gap-3 mb-4">
                  <span className="text-sm text-gray-600">Nights:</span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() =>
                        onUpdateNights(Math.max(1, stop.nights - 1))
                      }
                      className="p-1 rounded-md hover:bg-gray-200 transition-colors"
                      disabled={stop.nights <= 1}
                    >
                      -
                    </button>
                    <span className="w-8 text-center font-medium">
                      {stop.nights}
                    </span>
                    <button
                      onClick={() => onUpdateNights(stop.nights + 1)}
                      className="p-1 rounded-md hover:bg-gray-200 transition-colors"
                    >
                      +
                    </button>
                  </div>
                </div>
              )}

              {/* City Itinerary Summary */}
              {cityItinerary && (
                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-gray-700">
                    Daily Schedule
                  </h4>
                  {cityItinerary.days.map((day, dayIndex) => (
                    <div
                      key={day.date}
                      className="flex items-center gap-3 p-2 bg-white rounded-lg"
                    >
                      <div
                        className={cn(
                          "w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium",
                          day.dayType === "arrival"
                            ? "bg-green-100 text-green-600"
                            : day.dayType === "departure"
                            ? "bg-blue-100 text-blue-600"
                            : "bg-gray-100 text-gray-600"
                        )}
                      >
                        {dayIndex + 1}
                      </div>
                      <div className="flex-1">
                        <span className="text-sm text-gray-600">
                          {formatDate(day.date)}
                        </span>
                        <span className="text-xs text-gray-400 ml-2">
                          {day.dayType === "arrival"
                            ? "Arrival Day"
                            : day.dayType === "departure"
                            ? "Departure Day"
                            : "Full Day"}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {day.activities.length} activities
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {/* City Details */}
              <div className="mt-4 grid grid-cols-2 gap-4">
                <div className="p-3 bg-white rounded-lg">
                  <span className="text-xs text-gray-500">Currency</span>
                  <p className="font-medium text-gray-900">{city.currency}</p>
                </div>
                <div className="p-3 bg-white rounded-lg">
                  <span className="text-xs text-gray-500">Language</span>
                  <p className="font-medium text-gray-900">{city.language}</p>
                </div>
                <div className="p-3 bg-white rounded-lg">
                  <span className="text-xs text-gray-500">Timezone</span>
                  <p className="font-medium text-gray-900">
                    {city.timezone.split("/")[1] || city.timezone}
                  </p>
                </div>
                {city.airportCodes && city.airportCodes.length > 0 && (
                  <div className="p-3 bg-white rounded-lg">
                    <span className="text-xs text-gray-500">Airports</span>
                    <p className="font-medium text-gray-900">
                      {city.airportCodes.join(", ")}
                    </p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ============================================
// INTER-CITY LEG CARD
// ============================================

interface InterCityLegCardProps {
  leg: InterCityLeg;
  className?: string;
}

export function InterCityLegCard({ leg, className }: InterCityLegCardProps) {
  return (
    <motion.div
      layout
      className={cn(
        "flex items-center gap-4 px-4 py-3 mx-8 bg-gradient-to-r from-gray-100 to-gray-50 rounded-lg border border-dashed",
        className
      )}
    >
      {/* Transport Icon */}
      <div className="flex items-center justify-center w-10 h-10 bg-white rounded-full shadow-sm">
        <TransportIcon
          mode={leg.transportMode}
          className="w-5 h-5 text-blue-500"
        />
      </div>

      {/* Route Info */}
      <div className="flex-1">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-gray-700">{leg.fromCity.name}</span>
          <ArrowRight className="w-4 h-4 text-gray-400" />
          <span className="font-medium text-gray-700">{leg.toCity.name}</span>
        </div>
        <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
          <span>
            {formatTime(leg.departureTime)} → {formatTime(leg.arrivalTime)}
          </span>
          <span>•</span>
          <span>{formatDuration(leg.durationMinutes)}</span>
          {leg.carrier && (
            <>
              <span>•</span>
              <span>{leg.carrier.name}</span>
            </>
          )}
        </div>
      </div>

      {/* Price & Carbon */}
      <div className="text-right">
        {leg.price && (
          <div className="text-sm font-medium text-gray-900">
            {formatPrice(leg.price.amount, leg.price.currency)}
          </div>
        )}
        {leg.carbonFootprint && (
          <div className="flex items-center gap-1 text-xs text-green-600">
            <Leaf className="w-3 h-3" />
            {leg.carbonFootprint.kgCO2.toFixed(0)} kg CO₂
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ============================================
// MULTI-CITY TIMELINE
// ============================================

interface MultiCityTimelineProps {
  trip: MultiCityTrip;
  onCityClick?: (stopIndex: number) => void;
  onRemoveCity?: (stopIndex: number) => void;
  onAddCity?: (afterStopIndex: number) => void;
  readonly?: boolean;
  className?: string;
}

export function MultiCityTimeline({
  trip,
  onCityClick,
  onRemoveCity,
  onAddCity,
  readonly = false,
  className,
}: MultiCityTimelineProps) {
  const [expandedCity, setExpandedCity] = useState<number | null>(null);

  const toggleCity = useCallback((index: number) => {
    setExpandedCity((prev) => (prev === index ? null : index));
  }, []);

  return (
    <div className={cn("space-y-2", className)}>
      {trip.stops.map((stop, index) => (
        <React.Fragment key={stop.id}>
          {/* City Card */}
          <CityCard
            stop={stop}
            index={index}
            isExpanded={expandedCity === index}
            onToggle={() => {
              toggleCity(index);
              onCityClick?.(index);
            }}
            onRemove={
              !readonly && onRemoveCity && trip.stops.length > 2
                ? () => onRemoveCity(index)
                : undefined
            }
            cityItinerary={trip.cityItineraries.get(stop.city.id)}
            readonly={readonly}
          />

          {/* Transport Leg (between cities) */}
          {index < trip.stops.length - 1 && (
            <div className="relative">
              <InterCityLegCard leg={trip.transitions[index]} />

              {/* Add City Button */}
              {!readonly && onAddCity && (
                <button
                  onClick={() => onAddCity(index)}
                  className="absolute -bottom-3 left-1/2 transform -translate-x-1/2 flex items-center gap-1 px-3 py-1 text-xs font-medium text-blue-600 bg-white border border-blue-200 rounded-full hover:bg-blue-50 transition-colors shadow-sm"
                >
                  <Plus className="w-3 h-3" />
                  Add City
                </button>
              )}
            </div>
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

// ============================================
// TRIP STATS CARD
// ============================================

interface TripStatsCardProps {
  trip: MultiCityTrip;
  className?: string;
}

export function TripStatsCard({ trip, className }: TripStatsCardProps) {
  const { stats, travelers } = trip;

  return (
    <div className={cn("bg-white rounded-xl border shadow-sm p-4", className)}>
      <h3 className="font-semibold text-gray-900 mb-4">Trip Overview</h3>

      <div className="grid grid-cols-2 gap-4">
        {/* Duration */}
        <div className="flex items-start gap-3">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Calendar className="w-4 h-4 text-blue-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">
              {stats.totalDays}
            </p>
            <p className="text-xs text-gray-500">Days</p>
          </div>
        </div>

        {/* Cities */}
        <div className="flex items-start gap-3">
          <div className="p-2 bg-purple-50 rounded-lg">
            <MapPin className="w-4 h-4 text-purple-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">
              {stats.totalCities}
            </p>
            <p className="text-xs text-gray-500">Cities</p>
          </div>
        </div>

        {/* Travelers */}
        <div className="flex items-start gap-3">
          <div className="p-2 bg-green-50 rounded-lg">
            <Users className="w-4 h-4 text-green-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">
              {travelers.adults + travelers.children + travelers.infants}
            </p>
            <p className="text-xs text-gray-500">Travelers</p>
          </div>
        </div>

        {/* Estimated Cost */}
        <div className="flex items-start gap-3">
          <div className="p-2 bg-amber-50 rounded-lg">
            <Wallet className="w-4 h-4 text-amber-500" />
          </div>
          <div>
            <p className="text-2xl font-bold text-gray-900">
              {formatPrice(
                stats.estimatedTotalCost.amount,
                stats.estimatedTotalCost.currency
              )}
            </p>
            <p className="text-xs text-gray-500">Est. Transport</p>
          </div>
        </div>
      </div>

      {/* Additional Stats */}
      <div className="mt-4 pt-4 border-t space-y-2">
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Total Flight Time</span>
          <span className="font-medium text-gray-900">
            {formatDuration(stats.totalFlightTime)}
          </span>
        </div>
        {stats.totalTrainTime > 0 && (
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Total Train Time</span>
            <span className="font-medium text-gray-900">
              {formatDuration(stats.totalTrainTime)}
            </span>
          </div>
        )}
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Countries</span>
          <span className="font-medium text-gray-900">
            {stats.countriesVisited.length}
          </span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-gray-500">Carbon Footprint</span>
          <span className="font-medium text-green-600 flex items-center gap-1">
            <Leaf className="w-3 h-3" />
            {stats.carbonFootprint.kgCO2.toFixed(0)} kg CO₂
          </span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// CITY SELECTOR
// ============================================

interface CitySelectorProps {
  cities: CityDestination[];
  selectedCities: CityDestination[];
  onSelect: (city: CityDestination) => void;
  onDeselect: (cityId: string) => void;
  maxCities?: number;
  className?: string;
}

export function CitySelector({
  cities,
  selectedCities,
  onSelect,
  onDeselect,
  maxCities = 10,
  className,
}: CitySelectorProps) {
  const [searchTerm, setSearchTerm] = useState("");

  const filteredCities = cities.filter(
    (city) =>
      city.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      city.country.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedIds = new Set(selectedCities.map((c) => c.id));

  return (
    <div className={cn("space-y-4", className)}>
      {/* Search */}
      <input
        type="text"
        placeholder="Search cities..."
        value={searchTerm}
        onChange={(e) => setSearchTerm(e.target.value)}
        className="w-full px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
      />

      {/* Selected Cities */}
      {selectedCities.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {selectedCities.map((city, index) => (
            <div
              key={city.id}
              className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-700 rounded-full"
            >
              <span className="text-xs font-medium text-blue-500">
                {index + 1}
              </span>
              <span className="text-sm font-medium">{city.name}</span>
              <button
                onClick={() => onDeselect(city.id)}
                className="p-0.5 hover:bg-blue-100 rounded-full transition-colors"
              >
                <Trash2 className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Available Cities */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-64 overflow-y-auto">
        {filteredCities.map((city) => {
          const isSelected = selectedIds.has(city.id);
          const isDisabled = !isSelected && selectedCities.length >= maxCities;

          return (
            <button
              key={city.id}
              onClick={() => {
                if (isSelected) {
                  onDeselect(city.id);
                } else if (!isDisabled) {
                  onSelect(city);
                }
              }}
              disabled={isDisabled}
              className={cn(
                "flex items-center gap-2 p-3 rounded-lg border transition-colors text-left",
                isSelected
                  ? "bg-blue-50 border-blue-300"
                  : isDisabled
                  ? "bg-gray-50 border-gray-200 opacity-50 cursor-not-allowed"
                  : "bg-white border-gray-200 hover:border-blue-300 hover:bg-blue-50"
              )}
            >
              <MapPin
                className={cn(
                  "w-4 h-4",
                  isSelected ? "text-blue-500" : "text-gray-400"
                )}
              />
              <div className="flex-1 min-w-0">
                <p
                  className={cn(
                    "font-medium truncate",
                    isSelected ? "text-blue-700" : "text-gray-900"
                  )}
                >
                  {city.name}
                </p>
                <p className="text-xs text-gray-500 truncate">{city.country}</p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function formatDateRange(start: string, end: string): string {
  const startDate = new Date(start);
  const endDate = new Date(end);

  const startStr = startDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  const endStr = endDate.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return `${startStr} - ${endStr}`;
}

function formatTime(isoDateTime: string): string {
  const date = new Date(isoDateTime);
  return date.toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatPrice(amount: number, currency: string): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

// ============================================
// EXPORTS
// ============================================

export {
  TransportIcon,
  formatDate,
  formatDateRange,
  formatTime,
  formatDuration,
  formatPrice,
};
