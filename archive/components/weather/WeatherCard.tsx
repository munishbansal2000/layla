"use client";

import { motion } from "framer-motion";
import {
  Sun,
  Cloud,
  CloudRain,
  CloudSnow,
  CloudLightning,
  CloudFog,
  Droplets,
  Wind,
  Thermometer,
} from "lucide-react";
import {
  SimpleWeatherInfo,
  getWeatherIconUrl,
  formatTemperature,
} from "@/lib/weather";

interface WeatherCardProps {
  weather: SimpleWeatherInfo;
  variant?: "compact" | "full";
  unit?: "C" | "F";
  className?: string;
}

const weatherIcons: Record<
  SimpleWeatherInfo["condition"],
  React.ComponentType<{ className?: string }>
> = {
  sunny: Sun,
  "partly-cloudy": Cloud,
  cloudy: Cloud,
  rainy: CloudRain,
  snowy: CloudSnow,
  stormy: CloudLightning,
  foggy: CloudFog,
};

const weatherColors: Record<SimpleWeatherInfo["condition"], string> = {
  sunny: "from-amber-400 to-orange-500",
  "partly-cloudy": "from-blue-400 to-gray-400",
  cloudy: "from-gray-400 to-gray-500",
  rainy: "from-blue-500 to-blue-700",
  snowy: "from-blue-200 to-blue-400",
  stormy: "from-gray-600 to-purple-700",
  foggy: "from-gray-300 to-gray-400",
};

const weatherBgColors: Record<SimpleWeatherInfo["condition"], string> = {
  sunny: "bg-amber-50",
  "partly-cloudy": "bg-blue-50",
  cloudy: "bg-gray-100",
  rainy: "bg-blue-100",
  snowy: "bg-blue-50",
  stormy: "bg-gray-200",
  foggy: "bg-gray-100",
};

export function WeatherCard({
  weather,
  variant = "compact",
  unit = "C",
  className = "",
}: WeatherCardProps) {
  const WeatherIcon = weatherIcons[weather.condition] || Cloud;
  const gradientColors =
    weatherColors[weather.condition] || weatherColors.cloudy;
  const bgColor = weatherBgColors[weather.condition] || weatherBgColors.cloudy;

  if (variant === "compact") {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full ${bgColor} ${className}`}
      >
        <div className={`p-1 rounded-full bg-gradient-to-br ${gradientColors}`}>
          <WeatherIcon className="w-3.5 h-3.5 text-white" />
        </div>
        <span className="text-sm font-medium text-gray-700">
          {formatTemperature(weather.temperature, unit)}
        </span>
        {weather.precipProbability > 20 && (
          <span className="flex items-center text-xs text-blue-600">
            <Droplets className="w-3 h-3 mr-0.5" />
            {weather.precipProbability}%
          </span>
        )}
      </motion.div>
    );
  }

  // Full variant
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-xl overflow-hidden shadow-md ${className}`}
    >
      {/* Header with gradient */}
      <div className={`bg-gradient-to-r ${gradientColors} p-4 text-white`}>
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2">
              <WeatherIcon className="w-8 h-8" />
              <span className="text-3xl font-bold">
                {formatTemperature(weather.temperature, unit)}
              </span>
            </div>
            <p className="text-sm capitalize opacity-90 mt-1">
              {weather.description}
            </p>
          </div>
          <div className="text-right">
            <img
              src={getWeatherIconUrl(weather.icon, "medium")}
              alt={weather.description}
              className="w-16 h-16"
            />
          </div>
        </div>
      </div>

      {/* Details */}
      <div className="bg-white p-4">
        <div className="grid grid-cols-3 gap-4">
          <div className="flex flex-col items-center">
            <Thermometer className="w-5 h-5 text-gray-400 mb-1" />
            <span className="text-xs text-gray-500">High/Low</span>
            <span className="text-sm font-medium">
              {formatTemperature(weather.tempMax, unit)} /{" "}
              {formatTemperature(weather.tempMin, unit)}
            </span>
          </div>
          <div className="flex flex-col items-center">
            <Droplets className="w-5 h-5 text-blue-400 mb-1" />
            <span className="text-xs text-gray-500">Humidity</span>
            <span className="text-sm font-medium">{weather.humidity}%</span>
          </div>
          <div className="flex flex-col items-center">
            <Wind className="w-5 h-5 text-gray-400 mb-1" />
            <span className="text-xs text-gray-500">Wind</span>
            <span className="text-sm font-medium">
              {weather.windSpeed} km/h
            </span>
          </div>
        </div>

        {weather.precipProbability > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">Chance of precipitation</span>
              <span
                className={`font-medium ${
                  weather.precipProbability > 50
                    ? "text-blue-600"
                    : "text-gray-600"
                }`}
              >
                {weather.precipProbability}%
              </span>
            </div>
            <div className="mt-1.5 h-2 bg-gray-100 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${weather.precipProbability}%` }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="h-full bg-blue-500 rounded-full"
              />
            </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Mini weather badge for inline display
 */
export function WeatherBadge({
  weather,
  unit = "C",
}: {
  weather: SimpleWeatherInfo;
  unit?: "C" | "F";
}) {
  const WeatherIcon = weatherIcons[weather.condition] || Cloud;

  return (
    <div className="inline-flex items-center gap-1.5 text-xs text-gray-600">
      <WeatherIcon className="w-4 h-4" />
      <span>{formatTemperature(weather.temperature, unit)}</span>
    </div>
  );
}

/**
 * Weather row for displaying in a list
 */
export function WeatherRow({
  date,
  weather,
  unit = "C",
}: {
  date: Date;
  weather: SimpleWeatherInfo;
  unit?: "C" | "F";
}) {
  const WeatherIcon = weatherIcons[weather.condition] || Cloud;
  const dayName = date.toLocaleDateString("en-US", { weekday: "short" });
  const dateStr = date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });

  return (
    <div className="flex items-center justify-between py-2 px-3 hover:bg-gray-50 rounded-lg transition-colors">
      <div className="flex items-center gap-3">
        <div className="text-center min-w-[60px]">
          <p className="text-sm font-medium text-gray-900">{dayName}</p>
          <p className="text-xs text-gray-500">{dateStr}</p>
        </div>
        <WeatherIcon className="w-6 h-6 text-gray-600" />
        <span className="text-sm text-gray-600 capitalize">
          {weather.description}
        </span>
      </div>
      <div className="flex items-center gap-4">
        {weather.precipProbability > 0 && (
          <span className="flex items-center text-xs text-blue-600">
            <Droplets className="w-3 h-3 mr-0.5" />
            {weather.precipProbability}%
          </span>
        )}
        <div className="text-right min-w-[80px]">
          <span className="text-sm font-medium text-gray-900">
            {formatTemperature(weather.tempMax, unit)}
          </span>
          <span className="text-sm text-gray-400 mx-1">/</span>
          <span className="text-sm text-gray-500">
            {formatTemperature(weather.tempMin, unit)}
          </span>
        </div>
      </div>
    </div>
  );
}

/**
 * Full forecast panel showing multiple days
 */
export function WeatherForecastPanel({
  forecasts,
  location,
  unit = "C",
}: {
  forecasts: SimpleWeatherInfo[];
  location?: string;
  unit?: "C" | "F";
}) {
  if (forecasts.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <Cloud className="w-12 h-12 mx-auto mb-2 opacity-50" />
        <p>No weather data available</p>
      </div>
    );
  }

  const today = forecasts[0];

  return (
    <div className="bg-white rounded-xl shadow-md overflow-hidden">
      {/* Header with today's weather */}
      <div
        className={`bg-gradient-to-r ${
          weatherColors[today.condition]
        } p-5 text-white`}
      >
        <div className="flex items-start justify-between">
          <div>
            {location && (
              <h3 className="text-lg font-semibold mb-1">{location}</h3>
            )}
            <div className="flex items-baseline gap-2">
              <span className="text-4xl font-bold">
                {formatTemperature(today.temperature, unit)}
              </span>
              <span className="text-lg opacity-75">
                {formatTemperature(today.tempMax, unit)} /{" "}
                {formatTemperature(today.tempMin, unit)}
              </span>
            </div>
            <p className="text-sm capitalize mt-1 opacity-90">
              {today.description}
            </p>
          </div>
          <img
            src={getWeatherIconUrl(today.icon, "large")}
            alt={today.description}
            className="w-20 h-20"
          />
        </div>
      </div>

      {/* Forecast list */}
      <div className="divide-y divide-gray-100">
        {forecasts.slice(1).map((weather, index) => (
          <WeatherRow
            key={index}
            date={weather.date}
            weather={weather}
            unit={unit}
          />
        ))}
      </div>
    </div>
  );
}
