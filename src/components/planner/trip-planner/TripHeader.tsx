"use client";

import {
  MapPin,
  Calendar,
  Clock,
  DollarSign,
  Sparkles,
  ChevronRight,
  AlertTriangle,
  Settings2,
  Sun,
  CloudRain,
  Umbrella,
  Wind,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { TripPlanningContext } from "@/lib/trip-planning";
import type { WeatherData } from "./types";
import type { WeatherCondition } from "@/types/activity-suggestion";

// Cloud icon component (not in lucide-react)
function Cloud({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
    >
      <path d="M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z" />
    </svg>
  );
}

interface TripHeaderProps {
  context: TripPlanningContext;
  tripDays: number;
  weather: WeatherData | null;
  onClose?: () => void;
  onSettingsClick: () => void;
}

export function TripHeader({
  context,
  tripDays,
  weather,
  onClose,
  onSettingsClick,
}: TripHeaderProps) {
  const getWeatherIcon = (condition: WeatherCondition) => {
    switch (condition) {
      case "sunny":
        return <Sun className="w-4 h-4 text-yellow-500" />;
      case "rainy":
      case "heavy-rain":
        return <CloudRain className="w-4 h-4 text-blue-500" />;
      case "cloudy":
      case "partly-cloudy":
        return <Cloud className="w-4 h-4 text-gray-500" />;
      default:
        return <Sun className="w-4 h-4 text-yellow-500" />;
    }
  };

  return (
    <div className="flex-shrink-0 p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-purple-500" />
          Activity Builder
        </h2>
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onSettingsClick}>
            <Settings2 className="w-4 h-4" />
          </Button>
          {onClose && (
            <Button variant="ghost" size="sm" onClick={onClose}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          )}
        </div>
      </div>

      {/* Trip Summary Grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <MapPin className="w-4 h-4 text-purple-500" />
          <span className="truncate">{context.destination || "Not set"}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Calendar className="w-4 h-4 text-purple-500" />
          <span>{tripDays > 0 ? `${tripDays} days` : "Not set"}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <DollarSign className="w-4 h-4 text-purple-500" />
          <span className="capitalize">{context.budget || "Not set"}</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          <Clock className="w-4 h-4 text-purple-500" />
          <span className="capitalize">{context.pace || "Not set"}</span>
        </div>
      </div>

      {/* Weather indicator */}
      {weather && (
        <div className="mt-3 p-2 bg-gradient-to-r from-blue-50 to-purple-50 dark:from-blue-900/20 dark:to-purple-900/20 rounded-lg flex items-center justify-between">
          <div className="flex items-center gap-2">
            {getWeatherIcon(weather.condition)}
            <span className="text-xs text-gray-600 dark:text-gray-400">
              {weather.temperature.min}° - {weather.temperature.max}°C
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-gray-500">
            <span className="flex items-center gap-1">
              <Umbrella className="w-3 h-3" />
              {weather.precipitationProbability}%
            </span>
            <span className="flex items-center gap-1">
              <Wind className="w-3 h-3" />
              {weather.humidity}%
            </span>
          </div>
        </div>
      )}

      {/* Missing fields warning */}
      {context.missingFields.length > 0 && (
        <div className="mt-3 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg flex items-center gap-2">
          <AlertTriangle className="w-4 h-4 text-yellow-600 dark:text-yellow-400" />
          <p className="text-xs text-yellow-700 dark:text-yellow-400">
            Still needed: {context.missingFields.join(", ")}
          </p>
        </div>
      )}
    </div>
  );
}
