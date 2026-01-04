/**
 * Weather Monitoring Service
 *
 * Based on: docs/REALTIME_RESHUFFLING_ALGORITHM.md - Phase 2
 *
 * Features:
 * - Morning sweep: Check all day's activities against weather forecast
 * - Periodic weather polling (configurable, default 30 minutes)
 * - Weather change detection with schedule-aware conflict analysis
 * - Indoor/outdoor activity classification
 * - Weather-triggered reshuffling events
 * - Severe weather alerts
 * - React hook for webapp integration
 *
 * Webapp Lifecycle:
 * - Morning sweep on page load / visibility change
 * - Polling while tab is active
 * - Pause when tab hidden, resume on visibility
 *
 * Integration:
 * - Uses existing weather.ts for API calls
 * - Creates TriggerEvents for reshuffling-service.ts
 * - Can be used client-side or server-side
 */

import {
  getCurrentWeather,
  get5DayForecast,
  geocodeCity,
  type CurrentWeather,
  type DailyForecast,
  type HourlyForecast,
} from "./weather";

import type {
  TriggerEvent,
  TriggerSeverity,
  WeatherTriggerContext,
} from "@/types/reshuffling";

import type { ActivityCategory } from "@/types/activity-suggestion";

// ============================================
// TYPES
// ============================================

/**
 * Weather condition classification for reshuffling
 */
export type WeatherImpact =
  | "good" // No impact on outdoor activities
  | "fair" // Minor impact, outdoor OK with preparation
  | "poor" // Significant impact, indoor preferred
  | "impossible"; // Outdoor activities not viable

/**
 * Outdoor viability for an hour or day
 */
export interface OutdoorViability {
  viability: WeatherImpact;
  reason: string;
  recommendations: string[];
}

/**
 * Weather change detection result
 */
export interface WeatherChange {
  type: "precipitation" | "temperature" | "severe" | "improvement";
  severity: TriggerSeverity;
  description: string;
  previousCondition: string;
  newCondition: string;
  affectsOutdoor: boolean;
  startTime: Date;
  endTime?: Date;
}

/**
 * Hourly weather forecast with viability
 */
export interface HourlyWeatherWithViability extends HourlyForecast {
  viability: OutdoorViability;
}

/**
 * Weather monitor state for a trip
 */
export interface WeatherMonitorState {
  tripId: string;
  location: {
    city: string;
    country?: string;
    lat: number;
    lon: number;
  };
  lastCheck: Date;
  currentWeather: CurrentWeather | null;
  hourlyForecast: HourlyWeatherWithViability[];
  dailyForecast: DailyForecast[];
  detectedChanges: WeatherChange[];
  alerts: WeatherAlert[];
  isMonitoring: boolean;
}

/**
 * Severe weather alert
 */
export interface WeatherAlert {
  id: string;
  type: "storm" | "extreme_heat" | "extreme_cold" | "heavy_rain" | "snow" | "fog" | "wind";
  severity: TriggerSeverity;
  title: string;
  description: string;
  startTime: Date;
  endTime?: Date;
  affectedAreas: string[];
  recommendations: string[];
}

/**
 * Configuration for weather monitoring
 */
export interface WeatherMonitorConfig {
  checkIntervalMinutes: number;
  rainProbabilityThreshold: number; // 0-100
  temperatureChangeThreshold: number; // degrees Celsius
  windSpeedThreshold: number; // m/s
  severeWeatherAlertTypes: string[];
  enableAutoReshuffle: boolean;
}

/**
 * Default configuration
 */
export const DEFAULT_WEATHER_MONITOR_CONFIG: WeatherMonitorConfig = {
  checkIntervalMinutes: 30,
  rainProbabilityThreshold: 70,
  temperatureChangeThreshold: 10,
  windSpeedThreshold: 15,
  severeWeatherAlertTypes: ["thunderstorm", "extreme_heat", "extreme_cold", "heavy_rain"],
  enableAutoReshuffle: true,
};

// ============================================
// ACTIVITY CLASSIFICATION
// ============================================

/**
 * Activity categories that are outdoor-dependent
 */
const OUTDOOR_ACTIVITIES: Set<ActivityCategory> = new Set([
  "park",
  "garden",
  "nature",
  "viewpoint",
  "walking-tour",
  "adventure",
  "photo-spot",
  "market",
]);

/**
 * Activity categories that are partially outdoor
 */
const PARTIALLY_OUTDOOR_ACTIVITIES: Set<ActivityCategory> = new Set([
  "shrine",
  "temple",
  "landmark",
  "neighborhood",
  "food-tour",
]);

/**
 * Activity categories that are always indoor
 */
const INDOOR_ACTIVITIES: Set<ActivityCategory> = new Set([
  "museum",
  "entertainment",
  "shopping",
  "cultural-experience",
  "relaxation",
  "family-activity",
  "nightlife",
]);

/**
 * Check if an activity is outdoor-dependent
 */
export function isOutdoorActivity(category: ActivityCategory): boolean {
  return OUTDOOR_ACTIVITIES.has(category);
}

/**
 * Check if an activity is partially outdoor
 */
export function isPartiallyOutdoorActivity(category: ActivityCategory): boolean {
  return PARTIALLY_OUTDOOR_ACTIVITIES.has(category);
}

/**
 * Check if an activity is indoor
 */
export function isIndoorActivity(category: ActivityCategory): boolean {
  return INDOOR_ACTIVITIES.has(category);
}

/**
 * Get outdoor dependency level
 */
export function getOutdoorDependency(category: ActivityCategory): "high" | "medium" | "low" {
  if (OUTDOOR_ACTIVITIES.has(category)) return "high";
  if (PARTIALLY_OUTDOOR_ACTIVITIES.has(category)) return "medium";
  return "low";
}

// ============================================
// WEATHER ANALYSIS
// ============================================

/**
 * Analyze outdoor viability based on weather conditions
 */
export function analyzeOutdoorViability(
  weather: CurrentWeather | DailyForecast,
  config: WeatherMonitorConfig = DEFAULT_WEATHER_MONITOR_CONFIG
): OutdoorViability {
  const recommendations: string[] = [];
  let viability: WeatherImpact = "good";
  let reason = "Good conditions for outdoor activities";

  // Get temperature (handle both CurrentWeather and DailyForecast)
  const temp = "temp" in weather && typeof weather.temp === "number"
    ? weather.temp
    : (weather as DailyForecast).temp.day;

  // Check precipitation first (can set "impossible")
  const weatherCondition = weather.weather.main.toLowerCase();
  const pop = "pop" in weather ? weather.pop : 0;

  if (weatherCondition.includes("thunderstorm")) {
    viability = "impossible";
    reason = "Thunderstorm - outdoor activities dangerous";
    recommendations.push("Stay indoors", "Avoid open areas", "Wait for storm to pass");
  } else if (weatherCondition.includes("rain") || weatherCondition.includes("drizzle")) {
    if (pop > config.rainProbabilityThreshold / 100 || weatherCondition === "rain") {
      viability = "poor";
      reason = "Rain expected - outdoor activities impacted";
      recommendations.push("Bring umbrella", "Consider indoor alternatives");
    } else {
      viability = "fair";
      recommendations.push("Bring umbrella just in case");
    }
  } else if (weatherCondition.includes("snow")) {
    viability = "poor";
    reason = "Snowy conditions - outdoor activities impacted";
    recommendations.push("Dress warmly", "Wear appropriate footwear");
  }

  // Only apply temperature/wind checks if not already "impossible"
  if (viability !== "impossible") {
    // Check temperature extremes
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

    // Check wind
    const windSpeed = weather.wind_speed;
    if (windSpeed > config.windSpeedThreshold) {
      if (viability === "good") viability = "fair";
      else if (viability === "fair") viability = "poor";
      reason = "High winds - outdoor activities may be affected";
      recommendations.push("Secure loose items", "Avoid elevated viewpoints");
    }
  }

  return { viability, reason, recommendations };
}

/**
 * Compare two weather conditions and detect significant changes
 */
export function detectWeatherChanges(
  previous: CurrentWeather | DailyForecast,
  current: CurrentWeather | DailyForecast,
  config: WeatherMonitorConfig = DEFAULT_WEATHER_MONITOR_CONFIG
): WeatherChange | null {
  const prevCondition = previous.weather.main.toLowerCase();
  const currCondition = current.weather.main.toLowerCase();

  // Get temperatures
  const prevTemp = "temp" in previous && typeof previous.temp === "number"
    ? previous.temp
    : (previous as DailyForecast).temp.day;
  const currTemp = "temp" in current && typeof current.temp === "number"
    ? current.temp
    : (current as DailyForecast).temp.day;

  // Check for severe weather
  if (currCondition.includes("thunderstorm") && !prevCondition.includes("thunderstorm")) {
    return {
      type: "severe",
      severity: "critical",
      description: "Thunderstorm approaching - outdoor activities unsafe",
      previousCondition: previous.weather.description,
      newCondition: current.weather.description,
      affectsOutdoor: true,
      startTime: new Date(),
    };
  }

  // Check for precipitation change
  if (
    (currCondition.includes("rain") || currCondition.includes("drizzle")) &&
    !prevCondition.includes("rain") &&
    !prevCondition.includes("drizzle")
  ) {
    const pop = "pop" in current ? current.pop : 0;
    return {
      type: "precipitation",
      severity: pop > 0.8 ? "high" : "medium",
      description: `Rain starting - ${current.weather.description}`,
      previousCondition: previous.weather.description,
      newCondition: current.weather.description,
      affectsOutdoor: true,
      startTime: new Date(),
    };
  }

  // Check for clearing weather (improvement)
  if (
    (currCondition === "clear" || currCondition === "clouds") &&
    (prevCondition.includes("rain") || prevCondition.includes("storm"))
  ) {
    return {
      type: "improvement",
      severity: "low",
      description: "Weather clearing up - outdoor activities now possible",
      previousCondition: previous.weather.description,
      newCondition: current.weather.description,
      affectsOutdoor: true,
      startTime: new Date(),
    };
  }

  // Check for significant temperature change
  const tempDiff = Math.abs(currTemp - prevTemp);
  if (tempDiff >= config.temperatureChangeThreshold) {
    return {
      type: "temperature",
      severity: tempDiff >= 15 ? "high" : "medium",
      description: currTemp > prevTemp
        ? `Temperature rising significantly (+${Math.round(tempDiff)}°C)`
        : `Temperature dropping significantly (-${Math.round(tempDiff)}°C)`,
      previousCondition: `${Math.round(prevTemp)}°C`,
      newCondition: `${Math.round(currTemp)}°C`,
      affectsOutdoor: currTemp > 35 || currTemp < 0,
      startTime: new Date(),
    };
  }

  return null;
}

// ============================================
// TRIGGER EVENT CREATION
// ============================================

/**
 * Create a weather trigger event for reshuffling
 */
export function createWeatherTrigger(
  change: WeatherChange,
  affectedSlotIds: string[],
  forecast: DailyForecast | CurrentWeather
): TriggerEvent {
  const id = `weather-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;

  // Get temperature values
  const temp = "temp" in forecast && typeof forecast.temp === "number"
    ? forecast.temp
    : (forecast as DailyForecast).temp.day;

  const tempMin = "temp" in forecast && typeof forecast.temp === "number"
    ? forecast.temp - 2 // Approximate range for current weather
    : (forecast as DailyForecast).temp.min;

  const tempMax = "temp" in forecast && typeof forecast.temp === "number"
    ? forecast.temp + 2 // Approximate range for current weather
    : (forecast as DailyForecast).temp.max;

  // Map weather condition to WeatherCondition type
  const conditionMain = forecast.weather.main.toLowerCase();
  let condition: "sunny" | "partly-cloudy" | "cloudy" | "rainy" | "heavy-rain" | "snowy" | "stormy" | "foggy" = "sunny";

  if (conditionMain.includes("thunderstorm") || conditionMain.includes("storm")) {
    condition = "stormy";
  } else if (conditionMain.includes("rain") || conditionMain.includes("drizzle")) {
    condition = conditionMain.includes("heavy") ? "heavy-rain" : "rainy";
  } else if (conditionMain.includes("snow")) {
    condition = "snowy";
  } else if (conditionMain.includes("fog") || conditionMain.includes("mist")) {
    condition = "foggy";
  } else if (conditionMain.includes("cloud")) {
    condition = "cloudy";
  } else if (conditionMain === "clear") {
    condition = "sunny";
  }

  const weatherContext: WeatherTriggerContext = {
    previousCondition: change.previousCondition,
    newCondition: change.newCondition,
    precipitationProbability: "pop" in forecast ? forecast.pop * 100 : 0,
    temperature: temp,
    forecast: {
      date: new Date().toISOString().split("T")[0],
      temperature: { min: tempMin, max: tempMax },
      condition,
      precipitationProbability: "pop" in forecast ? forecast.pop * 100 : 0,
      humidity: forecast.humidity,
      windSpeed: forecast.wind_speed,
      sunrise: "06:00",
      sunset: "18:00",
    },
  };

  return {
    id,
    type: "weather_change",
    severity: change.severity,
    detectedAt: new Date(),
    source: "weather_service",
    context: {
      weatherContext,
    },
    affectedSlotIds,
  };
}

/**
 * Find activities affected by weather change
 */
export function findAffectedActivities(
  activities: Array<{ slotId: string; category: ActivityCategory; startTime: string }>,
  change: WeatherChange,
  changeEndTime?: Date
): string[] {
  if (!change.affectsOutdoor) {
    return [];
  }

  const changeStart = change.startTime;
  const changeEnd = changeEndTime || new Date(changeStart.getTime() + 4 * 60 * 60 * 1000); // Default 4 hours

  return activities
    .filter((activity) => {
      // Check if activity is outdoor-dependent
      const dependency = getOutdoorDependency(activity.category);
      if (dependency === "low") return false;

      // Check if activity overlaps with weather change
      const activityStart = new Date(activity.startTime);
      return activityStart >= changeStart && activityStart <= changeEnd;
    })
    .map((activity) => activity.slotId);
}

// ============================================
// WEATHER MONITOR CLASS
// ============================================

/**
 * Weather monitoring service for real-time trip reshuffling
 */
export class WeatherMonitor {
  private config: WeatherMonitorConfig;
  private state: WeatherMonitorState | null = null;
  private pollInterval: NodeJS.Timeout | null = null;
  private onChangeCallbacks: Array<(trigger: TriggerEvent) => void> = [];
  private onAlertCallbacks: Array<(alert: WeatherAlert) => void> = [];

  constructor(config: WeatherMonitorConfig = DEFAULT_WEATHER_MONITOR_CONFIG) {
    this.config = config;
  }

  /**
   * Initialize monitoring for a trip
   */
  async initialize(
    tripId: string,
    city: string,
    country?: string
  ): Promise<WeatherMonitorState | null> {
    // Geocode the city
    const location = await geocodeCity(city, country);
    if (!location) {
      console.error(`[WeatherMonitor] Failed to geocode city: ${city}`);
      return null;
    }

    // Fetch initial weather data
    const [currentWeather, dailyForecast] = await Promise.all([
      getCurrentWeather(location.lat, location.lon),
      get5DayForecast(location.lat, location.lon),
    ]);

    // Create hourly forecast with viability (from 3-hour intervals)
    const hourlyWithViability: HourlyWeatherWithViability[] = [];
    // Note: 5-day forecast returns 3-hour intervals, we'll use daily for now
    // In production, use One Call API for true hourly data

    this.state = {
      tripId,
      location: {
        city,
        country,
        lat: location.lat,
        lon: location.lon,
      },
      lastCheck: new Date(),
      currentWeather,
      hourlyForecast: hourlyWithViability,
      dailyForecast,
      detectedChanges: [],
      alerts: [],
      isMonitoring: false,
    };

    console.log(`[WeatherMonitor] Initialized for ${city}, ${country || ""}`);
    console.log(`[WeatherMonitor] Current conditions: ${currentWeather?.weather.description || "Unknown"}`);

    return this.state;
  }

  /**
   * Start periodic weather monitoring
   */
  startMonitoring(): void {
    if (!this.state) {
      console.error("[WeatherMonitor] Cannot start monitoring - not initialized");
      return;
    }

    if (this.pollInterval) {
      this.stopMonitoring();
    }

    this.state.isMonitoring = true;

    // Initial check
    this.checkWeather();

    // Set up polling interval
    const intervalMs = this.config.checkIntervalMinutes * 60 * 1000;
    this.pollInterval = setInterval(() => {
      this.checkWeather();
    }, intervalMs);

    console.log(`[WeatherMonitor] Started monitoring every ${this.config.checkIntervalMinutes} minutes`);
  }

  /**
   * Stop weather monitoring
   */
  stopMonitoring(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }

    if (this.state) {
      this.state.isMonitoring = false;
    }

    console.log("[WeatherMonitor] Stopped monitoring");
  }

  /**
   * Check weather and detect changes
   */
  async checkWeather(): Promise<WeatherChange[]> {
    if (!this.state) {
      console.error("[WeatherMonitor] Cannot check weather - not initialized");
      return [];
    }

    const previousWeather = this.state.currentWeather;

    try {
      // Fetch current weather
      const currentWeather = await getCurrentWeather(
        this.state.location.lat,
        this.state.location.lon
      );

      if (!currentWeather) {
        console.error("[WeatherMonitor] Failed to fetch current weather");
        return [];
      }

      // Update state
      const previousTime = this.state.lastCheck;
      this.state.currentWeather = currentWeather;
      this.state.lastCheck = new Date();

      // Detect changes
      const changes: WeatherChange[] = [];

      if (previousWeather) {
        const change = detectWeatherChanges(previousWeather, currentWeather, this.config);
        if (change) {
          changes.push(change);
          this.state.detectedChanges.push(change);

          console.log(`[WeatherMonitor] Detected change: ${change.description}`);

          // Notify callbacks
          for (const callback of this.onChangeCallbacks) {
            // Create trigger event
            const trigger = createWeatherTrigger(change, [], currentWeather);
            callback(trigger);
          }
        }
      }

      // Check for severe weather alerts
      const alerts = this.checkForAlerts(currentWeather);
      for (const alert of alerts) {
        this.state.alerts.push(alert);
        for (const callback of this.onAlertCallbacks) {
          callback(alert);
        }
      }

      // Also refresh daily forecast periodically (every 3 hours)
      const hoursSinceLastForecast = previousTime
        ? (new Date().getTime() - previousTime.getTime()) / (1000 * 60 * 60)
        : 999;

      if (hoursSinceLastForecast >= 3) {
        const dailyForecast = await get5DayForecast(
          this.state.location.lat,
          this.state.location.lon
        );
        this.state.dailyForecast = dailyForecast;
      }

      return changes;
    } catch (error) {
      console.error("[WeatherMonitor] Error checking weather:", error);
      return [];
    }
  }

  /**
   * Check for severe weather alerts
   */
  private checkForAlerts(weather: CurrentWeather): WeatherAlert[] {
    const alerts: WeatherAlert[] = [];
    const condition = weather.weather.main.toLowerCase();

    // Thunderstorm alert
    if (condition.includes("thunderstorm")) {
      alerts.push({
        id: `alert-${Date.now()}-storm`,
        type: "storm",
        severity: "critical",
        title: "⛈️ Thunderstorm Warning",
        description: `Thunderstorm conditions detected: ${weather.weather.description}`,
        startTime: new Date(),
        affectedAreas: [this.state?.location.city || "Current location"],
        recommendations: [
          "Seek shelter indoors immediately",
          "Avoid open areas and tall structures",
          "Wait for the storm to pass before outdoor activities",
        ],
      });
    }

    // Extreme heat alert
    if (weather.temp > 38) {
      alerts.push({
        id: `alert-${Date.now()}-heat`,
        type: "extreme_heat",
        severity: "high",
        title: "🌡️ Extreme Heat Warning",
        description: `Temperature is ${Math.round(weather.temp)}°C - extremely hot conditions`,
        startTime: new Date(),
        affectedAreas: [this.state?.location.city || "Current location"],
        recommendations: [
          "Stay hydrated - drink plenty of water",
          "Avoid prolonged outdoor activities",
          "Seek air-conditioned spaces",
          "Wear light, breathable clothing",
        ],
      });
    }

    // Extreme cold alert
    if (weather.temp < -10) {
      alerts.push({
        id: `alert-${Date.now()}-cold`,
        type: "extreme_cold",
        severity: "high",
        title: "❄️ Extreme Cold Warning",
        description: `Temperature is ${Math.round(weather.temp)}°C - dangerously cold`,
        startTime: new Date(),
        affectedAreas: [this.state?.location.city || "Current location"],
        recommendations: [
          "Wear multiple warm layers",
          "Limit time outdoors",
          "Watch for signs of frostbite",
          "Seek heated indoor spaces",
        ],
      });
    }

    // High wind alert
    if (weather.wind_speed > 20) {
      alerts.push({
        id: `alert-${Date.now()}-wind`,
        type: "wind",
        severity: "medium",
        title: "💨 High Wind Advisory",
        description: `Wind speeds of ${Math.round(weather.wind_speed)} m/s detected`,
        startTime: new Date(),
        affectedAreas: [this.state?.location.city || "Current location"],
        recommendations: [
          "Secure loose items",
          "Be cautious near tall buildings",
          "Avoid elevated viewpoints",
        ],
      });
    }

    return alerts;
  }

  /**
   * Get current outdoor viability
   */
  getCurrentViability(): OutdoorViability | null {
    if (!this.state?.currentWeather) {
      return null;
    }
    return analyzeOutdoorViability(this.state.currentWeather, this.config);
  }

  /**
   * Get viability for a specific date
   */
  getViabilityForDate(date: Date): OutdoorViability | null {
    if (!this.state?.dailyForecast) {
      return null;
    }

    const dateStr = date.toISOString().split("T")[0];
    const forecast = this.state.dailyForecast.find(
      (f) => f.date.toISOString().split("T")[0] === dateStr
    );

    if (!forecast) {
      return null;
    }

    return analyzeOutdoorViability(forecast, this.config);
  }

  /**
   * Get forecast for upcoming hours
   */
  getUpcomingForecast(hours: number = 24): DailyForecast[] {
    if (!this.state?.dailyForecast) {
      return [];
    }

    const now = new Date();
    const cutoff = new Date(now.getTime() + hours * 60 * 60 * 1000);

    return this.state.dailyForecast.filter((f) => {
      const forecastDate = new Date(f.date);
      return forecastDate >= now && forecastDate <= cutoff;
    });
  }

  /**
   * Check if a specific time window is good for outdoor activities
   */
  async isGoodForOutdoor(
    startTime: Date,
    _endTime: Date
  ): Promise<{ isGood: boolean; reason: string; recommendation?: string }> {
    if (!this.state) {
      return { isGood: false, reason: "Weather monitor not initialized" };
    }

    // Get viability for the date
    const viability = this.getViabilityForDate(startTime);

    if (!viability) {
      return { isGood: true, reason: "No forecast data available, assuming good conditions" };
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
          recommendation: "Consider indoor alternatives or rescheduling",
        };
      case "impossible":
        return {
          isGood: false,
          reason: viability.reason,
          recommendation: "Outdoor activities not recommended - please reschedule or choose indoor options",
        };
    }
  }

  /**
   * Register callback for weather changes
   */
  onWeatherChange(callback: (trigger: TriggerEvent) => void): void {
    this.onChangeCallbacks.push(callback);
  }

  /**
   * Register callback for weather alerts
   */
  onWeatherAlert(callback: (alert: WeatherAlert) => void): void {
    this.onAlertCallbacks.push(callback);
  }

  /**
   * Get current state
   */
  getState(): WeatherMonitorState | null {
    return this.state;
  }

  /**
   * Get configuration
   */
  getConfig(): WeatherMonitorConfig {
    return this.config;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<WeatherMonitorConfig>): void {
    this.config = { ...this.config, ...config };

    // Restart monitoring if interval changed
    if (config.checkIntervalMinutes && this.state?.isMonitoring) {
      this.stopMonitoring();
      this.startMonitoring();
    }
  }
}

// ============================================
// MORNING SWEEP TYPES
// ============================================

/**
 * Activity for morning sweep analysis
 */
export interface ScheduledActivity {
  slotId: string;
  name: string;
  category: ActivityCategory;
  startTime: string; // ISO string or HH:MM
  endTime: string;
  isOutdoor?: boolean;
}

/**
 * Weather conflict from morning sweep
 */
export interface WeatherConflict {
  slotId: string;
  activityName: string;
  scheduledTime: string;
  weatherCondition: string;
  viability: WeatherImpact;
  reason: string;
  recommendations: string[];
  suggestedAction: "reschedule" | "swap_indoor" | "add_preparation" | "cancel";
}

/**
 * Morning sweep result
 */
export interface MorningSweepResult {
  sweepTime: Date;
  city: string;
  dayDate: string;
  overallViability: WeatherImpact;
  conflicts: WeatherConflict[];
  alerts: WeatherAlert[];
  hourlyBreakdown: Array<{
    hour: number;
    viability: WeatherImpact;
    condition: string;
    temperature: number;
  }>;
  recommendations: string[];
}

// ============================================
// MORNING SWEEP METHODS (added to WeatherMonitor)
// ============================================

declare module "./weather-monitor" {
  interface WeatherMonitor {
    performMorningSweep(activities: ScheduledActivity[]): Promise<MorningSweepResult | null>;
    analyzeActivityConflicts(
      activities: ScheduledActivity[],
      forecast: DailyForecast
    ): WeatherConflict[];
  }
}

/**
 * Perform morning sweep - check all day's activities against weather
 */
WeatherMonitor.prototype.performMorningSweep = async function (
  activities: ScheduledActivity[]
): Promise<MorningSweepResult | null> {
  if (!this.getState()) {
    console.error("[WeatherMonitor] Cannot perform morning sweep - not initialized");
    return null;
  }

  const state = this.getState()!;
  const today = new Date();
  const todayStr = today.toISOString().split("T")[0];

  console.log(`[WeatherMonitor] Performing morning sweep for ${activities.length} activities`);

  // Refresh weather data
  await this.checkWeather();

  // Get today's forecast
  const todayForecast = state.dailyForecast.find(
    (f) => f.date.toISOString().split("T")[0] === todayStr
  );

  if (!todayForecast) {
    console.warn("[WeatherMonitor] No forecast available for today");
    return null;
  }

  // Analyze overall viability
  const overallViability = analyzeOutdoorViability(todayForecast, this.getConfig());

  // Find conflicts with scheduled activities
  const conflicts = this.analyzeActivityConflicts(activities, todayForecast);

  // Build hourly breakdown (estimate from daily forecast)
  const hourlyBreakdown: MorningSweepResult["hourlyBreakdown"] = [];
  for (let hour = 8; hour <= 22; hour++) {
    // Interpolate temperature through the day
    const tempRange = todayForecast.temp.max - todayForecast.temp.min;
    const peakHour = 14; // Hottest around 2 PM
    const tempOffset = 1 - Math.abs(hour - peakHour) / 8;
    const estimatedTemp = todayForecast.temp.min + tempRange * Math.max(0, tempOffset);

    hourlyBreakdown.push({
      hour,
      viability: overallViability.viability,
      condition: todayForecast.weather.main,
      temperature: Math.round(estimatedTemp),
    });
  }

  // Build recommendations
  const recommendations: string[] = [...overallViability.recommendations];

  if (conflicts.length > 0) {
    const outdoorConflicts = conflicts.filter((c) => c.suggestedAction === "swap_indoor");
    if (outdoorConflicts.length > 0) {
      recommendations.push(
        `Consider swapping ${outdoorConflicts.length} outdoor activities for indoor alternatives`
      );
    }
  }

  // Get current alerts
  const alerts = state.alerts.filter(
    (a) => a.startTime.toISOString().split("T")[0] === todayStr
  );

  const result: MorningSweepResult = {
    sweepTime: new Date(),
    city: state.location.city,
    dayDate: todayStr,
    overallViability: overallViability.viability,
    conflicts,
    alerts,
    hourlyBreakdown,
    recommendations,
  };

  console.log(
    `[WeatherMonitor] Morning sweep complete: ${overallViability.viability} conditions, ${conflicts.length} conflicts`
  );

  return result;
};

/**
 * Analyze conflicts between activities and weather
 */
WeatherMonitor.prototype.analyzeActivityConflicts = function (
  activities: ScheduledActivity[],
  forecast: DailyForecast
): WeatherConflict[] {
  const conflicts: WeatherConflict[] = [];
  const viability = analyzeOutdoorViability(forecast, this.getConfig());

  // Only check for conflicts if weather is poor or worse
  if (viability.viability === "good" || viability.viability === "fair") {
    return conflicts;
  }

  for (const activity of activities) {
    const isOutdoor =
      activity.isOutdoor !== undefined
        ? activity.isOutdoor
        : isOutdoorActivity(activity.category) || isPartiallyOutdoorActivity(activity.category);

    if (!isOutdoor) {
      continue; // Indoor activities not affected
    }

    const dependency = getOutdoorDependency(activity.category);
    let suggestedAction: WeatherConflict["suggestedAction"];

    if (viability.viability === "impossible") {
      suggestedAction = dependency === "high" ? "cancel" : "swap_indoor";
    } else {
      // Poor conditions
      suggestedAction = dependency === "high" ? "swap_indoor" : "add_preparation";
    }

    conflicts.push({
      slotId: activity.slotId,
      activityName: activity.name,
      scheduledTime: activity.startTime,
      weatherCondition: forecast.weather.description,
      viability: viability.viability,
      reason: viability.reason,
      recommendations: viability.recommendations,
      suggestedAction,
    });
  }

  return conflicts;
};

// ============================================
// SINGLETON & FACTORY
// ============================================

let weatherMonitorInstance: WeatherMonitor | null = null;

/**
 * Get singleton weather monitor instance
 */
export function getWeatherMonitor(): WeatherMonitor {
  if (!weatherMonitorInstance) {
    weatherMonitorInstance = new WeatherMonitor();
  }
  return weatherMonitorInstance;
}

/**
 * Create a weather monitor instance
 */
export function createWeatherMonitor(
  config?: Partial<WeatherMonitorConfig>
): WeatherMonitor {
  const fullConfig = { ...DEFAULT_WEATHER_MONITOR_CONFIG, ...config };
  return new WeatherMonitor(fullConfig);
}

// ============================================
// REACT HOOK FOR WEBAPP
// ============================================

import { useState, useEffect, useCallback, useRef } from "react";

/**
 * React hook for weather monitoring in webapp context
 *
 * Features:
 * - Morning sweep on mount
 * - Periodic polling while tab is visible
 * - Pause/resume on visibility change
 * - Weather conflict detection for day's activities
 */
export function useWeatherMonitor(
  tripId: string | undefined,
  city: string | undefined,
  country?: string,
  options: {
    pollIntervalMinutes?: number;
    enableMorningSweep?: boolean;
    activities?: ScheduledActivity[];
  } = {}
) {
  const { pollIntervalMinutes = 30, enableMorningSweep = true, activities = [] } = options;

  const [isInitialized, setIsInitialized] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [currentWeather, setCurrentWeather] = useState<CurrentWeather | null>(null);
  const [dailyForecast, setDailyForecast] = useState<DailyForecast[]>([]);
  const [alerts, setAlerts] = useState<WeatherAlert[]>([]);
  const [conflicts, setConflicts] = useState<WeatherConflict[]>([]);
  const [morningSweepResult, setMorningSweepResult] = useState<MorningSweepResult | null>(null);
  const [lastCheck, setLastCheck] = useState<Date | null>(null);
  const [viability, setViability] = useState<OutdoorViability | null>(null);
  const [error, setError] = useState<string | null>(null);

  const monitorRef = useRef<WeatherMonitor | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize weather monitor
  useEffect(() => {
    if (!tripId || !city) {
      return;
    }

    const initializeMonitor = async () => {
      try {
        setError(null);
        const monitor = getWeatherMonitor();
        monitorRef.current = monitor;

        // Initialize with location
        const state = await monitor.initialize(tripId, city, country);

        if (state) {
          setIsInitialized(true);
          setCurrentWeather(state.currentWeather);
          setDailyForecast(state.dailyForecast);
          setAlerts(state.alerts);
          setLastCheck(state.lastCheck);
          setViability(monitor.getCurrentViability());

          // Set up callbacks
          monitor.onWeatherChange((trigger) => {
            console.log("[useWeatherMonitor] Weather change detected:", trigger);
            // Refresh state
            const newState = monitor.getState();
            if (newState) {
              setCurrentWeather(newState.currentWeather);
              setAlerts(newState.alerts);
              setLastCheck(newState.lastCheck);
              setViability(monitor.getCurrentViability());
            }
          });

          monitor.onWeatherAlert((alert) => {
            console.log("[useWeatherMonitor] Weather alert:", alert);
            setAlerts((prev) => [...prev, alert]);
          });

          // Perform morning sweep if enabled
          if (enableMorningSweep && activities.length > 0) {
            const sweepResult = await monitor.performMorningSweep(activities);
            if (sweepResult) {
              setMorningSweepResult(sweepResult);
              setConflicts(sweepResult.conflicts);
            }
          }
        }
      } catch (err) {
        console.error("[useWeatherMonitor] Initialization failed:", err);
        setError(err instanceof Error ? err.message : "Failed to initialize weather monitor");
      }
    };

    initializeMonitor();

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [tripId, city, country, enableMorningSweep, activities.length]);

  // Set up polling while tab is visible
  useEffect(() => {
    if (!isInitialized || !monitorRef.current) {
      return;
    }

    const startPolling = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }

      setIsMonitoring(true);
      pollIntervalRef.current = setInterval(async () => {
        if (monitorRef.current) {
          await monitorRef.current.checkWeather();
          const state = monitorRef.current.getState();
          if (state) {
            setCurrentWeather(state.currentWeather);
            setAlerts(state.alerts);
            setLastCheck(state.lastCheck);
            setViability(monitorRef.current.getCurrentViability());
          }
        }
      }, pollIntervalMinutes * 60 * 1000);
    };

    const stopPolling = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
      setIsMonitoring(false);
    };

    // Handle visibility change
    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
        // Also refresh immediately when tab becomes visible
        if (monitorRef.current) {
          monitorRef.current.checkWeather();
        }
      }
    };

    // Start polling initially if tab is visible
    if (!document.hidden) {
      startPolling();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isInitialized, pollIntervalMinutes]);

  // Re-run morning sweep when activities change
  useEffect(() => {
    if (!isInitialized || !monitorRef.current || !enableMorningSweep || activities.length === 0) {
      return;
    }

    const runSweep = async () => {
      const sweepResult = await monitorRef.current!.performMorningSweep(activities);
      if (sweepResult) {
        setMorningSweepResult(sweepResult);
        setConflicts(sweepResult.conflicts);
      }
    };

    runSweep();
  }, [isInitialized, enableMorningSweep, JSON.stringify(activities.map((a) => a.slotId))]);

  // Manual refresh
  const refresh = useCallback(async () => {
    if (!monitorRef.current) {
      return;
    }

    await monitorRef.current.checkWeather();
    const state = monitorRef.current.getState();
    if (state) {
      setCurrentWeather(state.currentWeather);
      setDailyForecast(state.dailyForecast);
      setAlerts(state.alerts);
      setLastCheck(state.lastCheck);
      setViability(monitorRef.current.getCurrentViability());
    }

    // Re-run morning sweep
    if (enableMorningSweep && activities.length > 0) {
      const sweepResult = await monitorRef.current.performMorningSweep(activities);
      if (sweepResult) {
        setMorningSweepResult(sweepResult);
        setConflicts(sweepResult.conflicts);
      }
    }
  }, [enableMorningSweep, activities]);

  // Dismiss alert
  const dismissAlert = useCallback((alertId: string) => {
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }, []);

  // Get viability for specific date
  const getViabilityForDate = useCallback(
    (date: Date): OutdoorViability | null => {
      if (!monitorRef.current) {
        return null;
      }
      return monitorRef.current.getViabilityForDate(date);
    },
    []
  );

  return {
    // State
    isInitialized,
    isMonitoring,
    currentWeather,
    dailyForecast,
    alerts,
    conflicts,
    morningSweepResult,
    lastCheck,
    viability,
    error,

    // Actions
    refresh,
    dismissAlert,
    getViabilityForDate,
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get weather impact description for UI
 */
export function getWeatherImpactDescription(impact: WeatherImpact): string {
  switch (impact) {
    case "good":
      return "Perfect for outdoor activities";
    case "fair":
      return "Outdoor activities OK with preparation";
    case "poor":
      return "Indoor activities recommended";
    case "impossible":
      return "Outdoor activities not safe";
  }
}

/**
 * Get weather impact emoji
 */
export function getWeatherImpactEmoji(impact: WeatherImpact): string {
  switch (impact) {
    case "good":
      return "☀️";
    case "fair":
      return "⛅";
    case "poor":
      return "🌧️";
    case "impossible":
      return "⛈️";
  }
}

/**
 * Get suggested swap activities based on weather
 */
export function getSuggestedSwaps(
  outdoorActivities: Array<{ slotId: string; category: ActivityCategory; name: string }>,
  indoorActivities: Array<{ slotId: string; category: ActivityCategory; name: string }>,
  weatherImpact: WeatherImpact
): Array<{ outdoor: typeof outdoorActivities[0]; indoor: typeof indoorActivities[0] }> {
  if (weatherImpact === "good" || weatherImpact === "fair") {
    return [];
  }

  const swaps: Array<{ outdoor: typeof outdoorActivities[0]; indoor: typeof indoorActivities[0] }> = [];

  // Find swappable pairs
  for (const outdoor of outdoorActivities) {
    // Find a suitable indoor alternative
    const indoor = indoorActivities.find((i) => {
      // Try to match categories loosely
      if (outdoor.category === "park" && i.category === "museum") return true;
      if (outdoor.category === "garden" && i.category === "cultural-experience") return true;
      if (outdoor.category === "viewpoint" && i.category === "entertainment") return true;
      if (outdoor.category === "market" && i.category === "shopping") return true;
      return false;
    });

    if (indoor) {
      swaps.push({ outdoor, indoor });
    }
  }

  return swaps;
}

// ============================================
// EXPORTS
// ============================================

export default WeatherMonitor;
