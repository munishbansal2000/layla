"use client";

import { useState, useEffect, useCallback } from "react";
import type { SimpleWeatherInfo } from "@/lib/weather";

interface UseWeatherOptions {
  city: string;
  country?: string;
  startDate?: Date;
  endDate?: Date;
  enabled?: boolean;
}

interface UseWeatherResult {
  weather: SimpleWeatherInfo[] | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useWeather({
  city,
  country,
  startDate,
  endDate,
  enabled = true,
}: UseWeatherOptions): UseWeatherResult {
  const [weather, setWeather] = useState<SimpleWeatherInfo[] | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchWeather = useCallback(async () => {
    if (!city || !enabled) {
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams({ city });

      if (country) {
        params.set("country", country);
      }

      if (startDate && endDate) {
        params.set("type", "trip");
        params.set("startDate", startDate.toISOString());
        params.set("endDate", endDate.toISOString());
      }

      const response = await fetch(`/api/weather?${params}`);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || "Failed to fetch weather");
      }

      const data = await response.json();

      // Handle trip-specific forecast
      if (data.type === "trip" && data.forecast) {
        setWeather(data.forecast.map((f: SimpleWeatherInfo & { date: string }) => ({
          ...f,
          date: new Date(f.date),
        })));
      }
      // Handle full forecast
      else if (data.daily) {
        setWeather(
          data.daily.map((d: {
            date: string;
            temp: { day: number; min: number; max: number };
            weather: { main: string; description: string; icon: string };
            humidity: number;
            wind_speed: number;
            pop: number;
          }) => ({
            date: new Date(d.date),
            temperature: Math.round(d.temp.day),
            tempMin: Math.round(d.temp.min),
            tempMax: Math.round(d.temp.max),
            condition: mapCondition(d.weather.main),
            description: d.weather.description,
            icon: d.weather.icon,
            humidity: Math.round(d.humidity),
            windSpeed: Math.round(d.wind_speed),
            precipProbability: Math.round(d.pop * 100),
          }))
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
      setWeather(null);
    } finally {
      setIsLoading(false);
    }
  }, [city, country, startDate, endDate, enabled]);

  useEffect(() => {
    fetchWeather();
  }, [fetchWeather]);

  return {
    weather,
    isLoading,
    error,
    refetch: fetchWeather,
  };
}

function mapCondition(main: string): SimpleWeatherInfo["condition"] {
  const condition = main.toLowerCase();

  switch (condition) {
    case "clear":
      return "sunny";
    case "clouds":
      return "cloudy";
    case "rain":
    case "drizzle":
      return "rainy";
    case "thunderstorm":
      return "stormy";
    case "snow":
      return "snowy";
    case "mist":
    case "fog":
    case "haze":
      return "foggy";
    default:
      return "partly-cloudy";
  }
}

/**
 * Get weather for a specific date from a forecast array
 */
export function getWeatherForDate(
  forecasts: SimpleWeatherInfo[],
  date: Date
): SimpleWeatherInfo | undefined {
  const targetDate = new Date(date);
  targetDate.setHours(0, 0, 0, 0);

  return forecasts.find((forecast) => {
    const forecastDate = new Date(forecast.date);
    forecastDate.setHours(0, 0, 0, 0);
    return forecastDate.getTime() === targetDate.getTime();
  });
}
