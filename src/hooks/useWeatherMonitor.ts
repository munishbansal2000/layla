"use client";

/**
 * useWeatherMonitor Hook
 *
 * React hook for integrating weather monitoring with trip execution.
 * Provides real-time weather updates and triggers reshuffling when needed.
 *
 * Based on: docs/REALTIME_RESHUFFLING_ALGORITHM.md - Phase 2
 */

import { useState, useEffect, useCallback, useRef } from "react";
import type {
  WeatherMonitorState,
  WeatherChange,
  WeatherAlert,
  OutdoorViability,
  WeatherImpact,
} from "@/lib/weather-monitor";
import type { TriggerEvent } from "@/types/reshuffling";
import type { ActivityCategory } from "@/types/activity-suggestion";

// ============================================
// TYPES
// ============================================

interface UseWeatherMonitorOptions {
  tripId: string;
  city: string;
  country?: string;
  autoStart?: boolean;
  checkIntervalMinutes?: number;
  onWeatherChange?: (trigger: TriggerEvent) => void;
  onWeatherAlert?: (alert: WeatherAlert) => void;
}

interface UseWeatherMonitorReturn {
  // State
  isInitialized: boolean;
  isMonitoring: boolean;
  isLoading: boolean;
  error: string | null;

  // Weather data
  currentWeather: WeatherMonitorState["currentWeather"];
  dailyForecast: WeatherMonitorState["dailyForecast"];
  detectedChanges: WeatherChange[];
  alerts: WeatherAlert[];
  lastCheck: Date | null;

  // Viability
  currentViability: OutdoorViability | null;
  getViabilityForDate: (date: Date) => OutdoorViability | null;

  // Actions
  initialize: () => Promise<void>;
  startMonitoring: () => void;
  stopMonitoring: () => void;
  checkNow: () => Promise<WeatherChange[]>;
  dismissAlert: (alertId: string) => void;
  clearAlerts: () => void;

  // Helpers
  isGoodForOutdoor: (startTime: Date, endTime: Date) => Promise<{ isGood: boolean; reason: string; recommendation?: string }>;
  getActivityImpact: (category: ActivityCategory) => WeatherImpact | null;
}

// ============================================
// HOOK IMPLEMENTATION
// ============================================

export function useWeatherMonitor({
  tripId,
  city,
  country,
  autoStart = true,
  checkIntervalMinutes = 30,
  onWeatherChange,
  onWeatherAlert,
}: UseWeatherMonitorOptions): UseWeatherMonitorReturn {
  // State
  const [isInitialized, setIsInitialized] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [currentWeather, setCurrentWeather] = useState<WeatherMonitorState["currentWeather"]>(null);
  const [dailyForecast, setDailyForecast] = useState<WeatherMonitorState["dailyForecast"]>([]);
  const [detectedChanges, setDetectedChanges] = useState<WeatherChange[]>([]);
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [currentViability, setCurrentViability] = useState<OutdoorViability | null>(null);

  // Refs
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const locationRef = useRef<{ lat: number; lon: number } | null>(null);

  // ============================================
  // API CALLS
  // ============================================

  /**
   * Initialize weather monitoring
   */
  const initialize = useCallback(async () => {
    if (isInitialized) return;

    setIsLoading(true);
    setError(null);

    try {
      // Fetch initial weather data
      const response = await fetch("/api/weather/initialize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId, city, country }),
      });

      if (!response.ok) {
        // If API doesn't exist, use client-side geocoding
        console.warn("[useWeatherMonitor] Weather API not available, using fallback");
        setIsInitialized(true);
        setIsLoading(false);
        return;
      }

      const data = await response.json();

      if (data.success) {
        setCurrentWeather(data.data.currentWeather);
        setDailyForecast(data.data.dailyForecast || []);
        setLastCheck(new Date());
        locationRef.current = data.data.location;

        // Calculate initial viability
        if (data.data.currentWeather) {
          setCurrentViability(calculateViability(data.data.currentWeather));
        }

        setIsInitialized(true);
      } else {
        setError(data.error?.message || "Failed to initialize weather monitor");
      }
    } catch (err) {
      // Gracefully handle missing API
      console.warn("[useWeatherMonitor] Weather initialization failed, continuing without weather data");
      setIsInitialized(true);
    } finally {
      setIsLoading(false);
    }
  }, [tripId, city, country, isInitialized]);

  /**
   * Check weather and detect changes
   */
  const checkNow = useCallback(async (): Promise<WeatherChange[]> => {
    if (!isInitialized) {
      return [];
    }

    setIsLoading(true);

    try {
      const response = await fetch("/api/weather/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tripId,
          city,
          country,
          previousWeather: currentWeather,
        }),
      });

      if (!response.ok) {
        return [];
      }

      const data = await response.json();

      if (data.success) {
        setCurrentWeather(data.data.currentWeather);
        setDailyForecast(data.data.dailyForecast || dailyForecast);
        setLastCheck(new Date());

        // Calculate new viability
        if (data.data.currentWeather) {
          setCurrentViability(calculateViability(data.data.currentWeather));
        }

        // Detect changes
        const changes: WeatherChange[] = [];
        if (data.data.changes && data.data.changes.length > 0) {
          for (const change of data.data.changes) {
            changes.push(change);
            setDetectedChanges((prev) => [...prev, change]);

            // Notify callback
            if (onWeatherChange && data.data.trigger) {
              onWeatherChange(data.data.trigger);
            }
          }
        }

        // Handle alerts
        if (data.data.alerts && data.data.alerts.length > 0) {
          for (const alert of data.data.alerts) {
            setAlerts((prev) => {
              // Avoid duplicate alerts
              if (prev.some((a) => a.type === alert.type)) {
                return prev;
              }
              return [...prev, alert];
            });

            onWeatherAlert?.(alert);
          }
        }

        return changes;
      }

      return [];
    } catch (err) {
      console.error("[useWeatherMonitor] Check error:", err);
      return [];
    } finally {
      setIsLoading(false);
    }
  }, [tripId, city, country, currentWeather, dailyForecast, isInitialized, onWeatherChange, onWeatherAlert]);

  // ============================================
  // MONITORING CONTROL
  // ============================================

  /**
   * Start periodic weather monitoring
   */
  const startMonitoring = useCallback(() => {
    if (isMonitoring || !isInitialized) {
      return;
    }

    setIsMonitoring(true);

    // Initial check
    checkNow();

    // Set up polling interval
    const intervalMs = checkIntervalMinutes * 60 * 1000;
    pollIntervalRef.current = setInterval(() => {
      checkNow();
    }, intervalMs);

    console.log(`[useWeatherMonitor] Started monitoring every ${checkIntervalMinutes} minutes`);
  }, [isMonitoring, isInitialized, checkIntervalMinutes, checkNow]);

  /**
   * Stop weather monitoring
   */
  const stopMonitoring = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
    setIsMonitoring(false);
    console.log("[useWeatherMonitor] Stopped monitoring");
  }, []);

  // ============================================
  // ALERT MANAGEMENT
  // ============================================

  /**
   * Dismiss a specific alert
   */
  const dismissAlert = useCallback((alertId: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }, []);

  /**
   * Clear all alerts
   */
  const clearAlerts = useCallback(() => {
    setAlerts([]);
  }, []);

  // ============================================
  // VIABILITY HELPERS
  // ============================================

/**
   * Calculate viability from weather data
   */
  const calculateViability = (weather: WeatherMonitorState["currentWeather"]): OutdoorViability | null => {
    if (!weather) return null;

    let viability: WeatherImpact = "good";
    let reason = "Good conditions for outdoor activities";
    const recommendations: string[] = [];

    const temp = weather.temp;
    const condition = weather.weather.main.toLowerCase();

    // Check weather conditions first (can set "impossible")
    if (condition.includes("thunderstorm")) {
      viability = "impossible";
      reason = "Thunderstorm - outdoor activities dangerous";
      recommendations.push("Stay indoors", "Avoid open areas");
    } else if (condition.includes("rain") || condition.includes("drizzle")) {
      viability = "poor";
      reason = "Rain expected - outdoor activities impacted";
      recommendations.push("Bring umbrella", "Consider indoor alternatives");
    } else if (condition.includes("snow")) {
      viability = "poor";
      reason = "Snowy conditions";
      recommendations.push("Dress warmly", "Wear appropriate footwear");
    }

    // Temperature checks (only if not already "impossible")
    if (viability !== "impossible") {
      if (temp > 35) {
        viability = "poor";
        reason = "Extreme heat - outdoor activities not recommended";
        recommendations.push("Stay hydrated", "Seek shade", "Consider indoor alternatives");
      } else if (temp > 30) {
        if (viability === "good") viability = "fair";
        recommendations.push("Stay hydrated", "Wear sunscreen");
      } else if (temp < 0) {
        viability = "poor";
        reason = "Freezing conditions - dress warmly";
        recommendations.push("Wear warm layers", "Consider indoor alternatives");
      } else if (temp < 5) {
        if (viability === "good") viability = "fair";
        recommendations.push("Wear warm clothing");
      }
    }

    return { viability, reason, recommendations };
  };

/**
   * Get viability for a specific date
   */
  const getViabilityForDate = useCallback((date: Date): OutdoorViability | null => {
    if (!dailyForecast || dailyForecast.length === 0) {
      return null;
    }

    const dateStr = date.toISOString().split("T")[0];
    const forecast = dailyForecast.find(
      (f) => new Date(f.date).toISOString().split("T")[0] === dateStr
    );

    if (!forecast) {
      return null;
    }

    // Similar viability calculation for forecast
    let viability: WeatherImpact = "good";
    let reason = "Good conditions expected";
    const recommendations: string[] = [];

    const temp = forecast.temp.day;
    const condition = forecast.weather.main.toLowerCase();
    const pop = forecast.pop;

    // Check weather conditions first (can set "impossible" or "poor")
    if (condition.includes("thunderstorm")) {
      viability = "impossible";
      reason = "Thunderstorm expected";
    } else if (condition.includes("rain") || pop > 0.7) {
      viability = "poor";
      reason = `Rain expected (${Math.round(pop * 100)}% chance)`;
      recommendations.push("Bring umbrella", "Have indoor backup plan");
    }

    // Temperature checks (only if not already "impossible")
    if (viability !== "impossible") {
      if (temp > 35) {
        viability = "poor";
        reason = "Extreme heat expected";
      } else if (temp < 0) {
        viability = "poor";
        reason = "Freezing conditions expected";
      }
    }

    return { viability, reason, recommendations };
  }, [dailyForecast]);

  /**
   * Check if a time window is good for outdoor activities
   */
  const isGoodForOutdoor = useCallback(async (
    startTime: Date,
    _endTime: Date
  ): Promise<{ isGood: boolean; reason: string; recommendation?: string }> => {
    const viability = getViabilityForDate(startTime);

    if (!viability) {
      return { isGood: true, reason: "No forecast data available" };
    }

    switch (viability.viability) {
      case "good":
        return { isGood: true, reason: viability.reason };
      case "fair":
        return {
          isGood: true,
          reason: viability.reason,
          recommendation: viability.recommendations.join(". "),
        };
      case "poor":
        return {
          isGood: false,
          reason: viability.reason,
          recommendation: "Consider indoor alternatives",
        };
      case "impossible":
        return {
          isGood: false,
          reason: viability.reason,
          recommendation: "Please reschedule or choose indoor options",
        };
    }
  }, [getViabilityForDate]);

  /**
   * Get weather impact for an activity category
   */
  const getActivityImpact = useCallback((category: ActivityCategory): WeatherImpact | null => {
    if (!currentViability) {
      return null;
    }

    // Outdoor activities are most affected
    const outdoorCategories: ActivityCategory[] = [
      "park", "garden", "nature", "viewpoint", "walking-tour",
      "adventure", "photo-spot", "market",
    ];

    // Partially outdoor activities
    const partiallyOutdoor: ActivityCategory[] = [
      "shrine", "temple", "landmark", "neighborhood", "food-tour",
    ];

    if (outdoorCategories.includes(category)) {
      return currentViability.viability;
    }

    if (partiallyOutdoor.includes(category)) {
      // Reduce severity for partially outdoor
      if (currentViability.viability === "impossible") return "poor";
      if (currentViability.viability === "poor") return "fair";
      return "good";
    }

    // Indoor activities are not affected
    return "good";
  }, [currentViability]);

  // ============================================
  // EFFECTS
  // ============================================

  // Auto-initialize
  useEffect(() => {
    if (city && !isInitialized) {
      initialize();
    }
  }, [city, isInitialized, initialize]);

  // Auto-start monitoring
  useEffect(() => {
    if (autoStart && isInitialized && !isMonitoring) {
      startMonitoring();
    }
  }, [autoStart, isInitialized, isMonitoring, startMonitoring]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // ============================================
  // RETURN
  // ============================================

  return {
    // State
    isInitialized,
    isMonitoring,
    isLoading,
    error,

    // Weather data
    currentWeather,
    dailyForecast,
    detectedChanges,
    alerts,
    lastCheck,

    // Viability
    currentViability,
    getViabilityForDate,

    // Actions
    initialize,
    startMonitoring,
    stopMonitoring,
    checkNow,
    dismissAlert,
    clearAlerts,

    // Helpers
    isGoodForOutdoor,
    getActivityImpact,
  };
}

// ============================================
// EXPORTS
// ============================================

export type { UseWeatherMonitorOptions, UseWeatherMonitorReturn };
