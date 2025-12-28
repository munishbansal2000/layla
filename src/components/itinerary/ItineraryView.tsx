"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  MapPin,
  Calendar,
  Users,
  DollarSign,
  Share2,
  Download,
  Edit,
} from "lucide-react";
import { DayTimeline } from "./DayTimeline";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { useWeather, getWeatherForDate } from "@/hooks/useWeather";
import { formatDateRange, formatCurrency } from "@/lib/utils";
import type { Trip, DayPlan, WeatherInfo } from "@/types";

interface ItineraryViewProps {
  trip: Trip;
  selectedDayIndex: number;
  onSelectDay: (index: number) => void;
  onRemoveItem?: (dayId: string, itemId: string) => void;
  onAddActivity?: (dayId: string) => void;
}

export function ItineraryView({
  trip,
  selectedDayIndex,
  onSelectDay,
  onRemoveItem,
  onAddActivity,
}: ItineraryViewProps) {
  // Fetch weather for the trip destination
  const { weather, isLoading: weatherLoading } = useWeather({
    city: trip.destination.city,
    country: trip.destination.country,
    startDate: new Date(trip.startDate),
    endDate: new Date(trip.endDate),
    enabled: true,
  });

  // Enrich days with weather data
  const daysWithWeather = useMemo(() => {
    if (!weather || weather.length === 0) {
      return trip.days;
    }

    return trip.days.map((day): DayPlan => {
      const dayWeather = getWeatherForDate(weather, new Date(day.date));
      if (dayWeather) {
        const weatherForecast: WeatherInfo = {
          temperature: dayWeather.temperature,
          tempMin: dayWeather.tempMin,
          tempMax: dayWeather.tempMax,
          condition: dayWeather.condition,
          description: dayWeather.description,
          icon: dayWeather.icon,
          humidity: dayWeather.humidity,
          windSpeed: dayWeather.windSpeed,
          precipProbability: dayWeather.precipProbability,
        };
        return {
          ...day,
          weatherForecast,
        };
      }
      return day;
    });
  }, [trip.days, weather]);
  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      <div className="relative">
        <div className="h-48 md:h-64 relative">
          {trip.coverImage && (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={trip.coverImage}
                alt={trip.title}
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/30 to-transparent" />
            </>
          )}
        </div>

        <div className="absolute bottom-0 left-0 right-0 p-6 text-white">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <div className="flex items-center gap-2 mb-2">
              <Badge
                variant="success"
                size="sm"
                className="bg-white/20 text-white border-0"
              >
                {trip.status}
              </Badge>
              <Badge
                variant="info"
                size="sm"
                className="bg-white/20 text-white border-0"
              >
                {trip.preferences.travelStyle}
              </Badge>
            </div>
            <h1 className="text-2xl md:text-3xl font-bold mb-2">
              {trip.title}
            </h1>
            <div className="flex flex-wrap items-center gap-4 text-sm text-white/80">
              <span className="flex items-center gap-1">
                <MapPin className="w-4 h-4" />
                {trip.destination.city}, {trip.destination.country}
              </span>
              <span className="flex items-center gap-1">
                <Calendar className="w-4 h-4" />
                {formatDateRange(
                  new Date(trip.startDate),
                  new Date(trip.endDate)
                )}
              </span>
              <span className="flex items-center gap-1">
                <Users className="w-4 h-4" />
                {trip.travelers} travelers
              </span>
              {trip.totalBudget && (
                <span className="flex items-center gap-1">
                  <DollarSign className="w-4 h-4" />
                  {formatCurrency(trip.totalBudget, trip.currency)}
                </span>
              )}
            </div>
          </motion.div>
        </div>
      </div>

      <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {trip.days.length} days
          </span>
          <span className="text-gray-300 dark:text-gray-600">•</span>
          <span className="text-sm text-gray-500 dark:text-gray-400">
            {trip.days.reduce((acc, day) => acc + day.items.length, 0)}{" "}
            activities
          </span>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm">
            <Edit className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm">
            <Share2 className="w-4 h-4" />
          </Button>
          <Button variant="ghost" size="sm">
            <Download className="w-4 h-4" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {daysWithWeather.map((day, index) => (
          <DayTimeline
            key={day.id}
            day={day}
            isSelected={index === selectedDayIndex}
            onSelect={() => onSelectDay(index)}
            onRemoveItem={
              onRemoveItem
                ? (itemId) => onRemoveItem(day.id, itemId)
                : undefined
            }
            onAddActivity={
              onAddActivity ? () => onAddActivity(day.id) : undefined
            }
          />
        ))}
        {weatherLoading && (
          <div className="text-center text-sm text-gray-500 py-2">
            Loading weather data...
          </div>
        )}
      </div>
    </div>
  );
}
