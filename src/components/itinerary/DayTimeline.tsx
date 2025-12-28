"use client";

import { motion } from "framer-motion";
import {
  Calendar,
  Sun,
  Cloud,
  CloudRain,
  Snowflake,
  CloudLightning,
  CloudFog,
  Plus,
  Droplets,
} from "lucide-react";
import { ActivityCard } from "./ActivityCard";
import { Button } from "@/components/ui/Button";
import { cn, formatDate } from "@/lib/utils";
import type { DayPlan } from "@/types";

interface DayTimelineProps {
  day: DayPlan;
  isSelected: boolean;
  onSelect: () => void;
  onRemoveItem?: (itemId: string) => void;
  onAddActivity?: () => void;
}

const weatherIconMap = {
  sunny: Sun,
  cloudy: Cloud,
  rainy: CloudRain,
  snowy: Snowflake,
  "partly-cloudy": Cloud,
  stormy: CloudLightning,
  foggy: CloudFog,
};

const weatherColorMap = {
  sunny: "text-amber-500",
  cloudy: "text-gray-500",
  rainy: "text-blue-500",
  snowy: "text-blue-300",
  "partly-cloudy": "text-gray-400",
  stormy: "text-purple-600",
  foggy: "text-gray-400",
};

export function DayTimeline({
  day,
  isSelected,
  onSelect,
  onRemoveItem,
  onAddActivity,
}: DayTimelineProps) {
  const condition = day.weatherForecast?.condition || "sunny";
  const WeatherIcon = weatherIconMap[condition] || Sun;
  const weatherColor = weatherColorMap[condition] || "text-gray-500";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-8"
    >
      <div
        onClick={onSelect}
        className={cn(
          "flex items-center gap-4 p-4 rounded-xl cursor-pointer transition-all duration-200 mb-4",
          isSelected
            ? "bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/20 dark:to-pink-900/20 border-2 border-purple-200 dark:border-purple-700"
            : "bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 hover:border-purple-200 dark:hover:border-purple-700"
        )}
      >
        <div
          className={cn(
            "w-14 h-14 rounded-xl flex flex-col items-center justify-center",
            isSelected
              ? "bg-gradient-to-br from-purple-600 to-pink-600 text-white"
              : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300"
          )}
        >
          <span className="text-xs font-medium">Day</span>
          <span className="text-lg font-bold">{day.dayNumber}</span>
        </div>

        <div className="flex-1">
          <h3 className="font-semibold text-gray-900 dark:text-gray-100">
            {day.title}
          </h3>
          <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400 mt-1">
            <Calendar className="w-4 h-4" />
            <span>{formatDate(new Date(day.date))}</span>
            <span className="text-gray-300 dark:text-gray-600">•</span>
            <span>{day.items.length} activities</span>
          </div>
        </div>

        {day.weatherForecast && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-gray-50 dark:bg-gray-700">
            <WeatherIcon className={cn("w-5 h-5", weatherColor)} />
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {day.weatherForecast.temperature}°
            </span>
            {day.weatherForecast.tempMax && day.weatherForecast.tempMin && (
              <span className="text-xs text-gray-400">
                {day.weatherForecast.tempMax}°/{day.weatherForecast.tempMin}°
              </span>
            )}
            {day.weatherForecast.precipProbability &&
              day.weatherForecast.precipProbability > 20 && (
                <span className="flex items-center text-xs text-blue-500">
                  <Droplets className="w-3 h-3 mr-0.5" />
                  {day.weatherForecast.precipProbability}%
                </span>
              )}
          </div>
        )}
      </div>

      {isSelected && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="pl-6 border-l-2 border-purple-200 dark:border-purple-700 ml-7"
        >
          <div className="space-y-4">
            {day.items.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <p className="mb-4">No activities planned for this day yet.</p>
                {onAddActivity && (
                  <Button
                    variant="outline"
                    size="sm"
                    leftIcon={<Plus className="w-4 h-4" />}
                    onClick={onAddActivity}
                  >
                    Add Activity
                  </Button>
                )}
              </div>
            ) : (
              <>
                {day.items.map((item) => (
                  <ActivityCard
                    key={item.id}
                    item={item}
                    onRemove={
                      onRemoveItem ? () => onRemoveItem(item.id) : undefined
                    }
                  />
                ))}
                {onAddActivity && (
                  <div className="flex justify-center pt-2">
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Plus className="w-4 h-4" />}
                      onClick={onAddActivity}
                    >
                      Add Activity
                    </Button>
                  </div>
                )}
              </>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}
