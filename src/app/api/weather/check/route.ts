/**
 * API Route: Check current weather and detect changes
 * POST /api/weather/check
 */

import { NextRequest, NextResponse } from "next/server";
import {
  geocodeCity,
  getCurrentWeather,
  get5DayForecast,
  type CurrentWeather,
} from "@/lib/weather";
import {
  detectWeatherChanges,
  createWeatherTrigger,
  analyzeOutdoorViability,
  DEFAULT_WEATHER_MONITOR_CONFIG,
  type WeatherChange,
  type WeatherAlert,
} from "@/lib/weather-monitor";

interface CheckRequest {
  tripId: string;
  city: string;
  country?: string;
  previousWeather?: CurrentWeather;
  affectedSlotIds?: string[];
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as CheckRequest;

    // Validate required fields
    if (!body.city) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_REQUEST", message: "city is required" },
        },
        { status: 400 }
      );
    }

    // Geocode the city
    const location = await geocodeCity(body.city, body.country);
    if (!location) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "GEOCODE_FAILED", message: `Could not geocode city: ${body.city}` },
        },
        { status: 400 }
      );
    }

    // Fetch current weather
    const currentWeather = await getCurrentWeather(location.lat, location.lon);
    if (!currentWeather) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "WEATHER_FETCH_FAILED", message: "Failed to fetch current weather" },
        },
        { status: 500 }
      );
    }

    // Detect changes if we have previous weather
    const changes: WeatherChange[] = [];
    let trigger = null;

    if (body.previousWeather) {
      const change = detectWeatherChanges(
        body.previousWeather,
        currentWeather,
        DEFAULT_WEATHER_MONITOR_CONFIG
      );

      if (change) {
        changes.push(change);
        trigger = createWeatherTrigger(
          change,
          body.affectedSlotIds || [],
          currentWeather
        );
      }
    }

    // Check for alerts
    const alerts: WeatherAlert[] = [];
    const condition = currentWeather.weather.main.toLowerCase();

    // Thunderstorm alert
    if (condition.includes("thunderstorm")) {
      alerts.push({
        id: `alert-${Date.now()}-storm`,
        type: "storm",
        severity: "critical",
        title: "⛈️ Thunderstorm Warning",
        description: `Thunderstorm conditions detected: ${currentWeather.weather.description}`,
        startTime: new Date(),
        affectedAreas: [body.city],
        recommendations: [
          "Seek shelter indoors immediately",
          "Avoid open areas and tall structures",
          "Wait for the storm to pass before outdoor activities",
        ],
      });
    }

    // Extreme heat alert
    if (currentWeather.temp > 38) {
      alerts.push({
        id: `alert-${Date.now()}-heat`,
        type: "extreme_heat",
        severity: "high",
        title: "🌡️ Extreme Heat Warning",
        description: `Temperature is ${Math.round(currentWeather.temp)}°C - extremely hot conditions`,
        startTime: new Date(),
        affectedAreas: [body.city],
        recommendations: [
          "Stay hydrated - drink plenty of water",
          "Avoid prolonged outdoor activities",
          "Seek air-conditioned spaces",
        ],
      });
    }

    // Extreme cold alert
    if (currentWeather.temp < -10) {
      alerts.push({
        id: `alert-${Date.now()}-cold`,
        type: "extreme_cold",
        severity: "high",
        title: "❄️ Extreme Cold Warning",
        description: `Temperature is ${Math.round(currentWeather.temp)}°C - dangerously cold`,
        startTime: new Date(),
        affectedAreas: [body.city],
        recommendations: [
          "Wear multiple warm layers",
          "Limit time outdoors",
          "Watch for signs of frostbite",
        ],
      });
    }

    // High wind alert
    if (currentWeather.wind_speed > 20) {
      alerts.push({
        id: `alert-${Date.now()}-wind`,
        type: "wind",
        severity: "medium",
        title: "💨 High Wind Advisory",
        description: `Wind speeds of ${Math.round(currentWeather.wind_speed)} m/s detected`,
        startTime: new Date(),
        affectedAreas: [body.city],
        recommendations: [
          "Secure loose items",
          "Be cautious near tall buildings",
          "Avoid elevated viewpoints",
        ],
      });
    }

    // Analyze current viability
    const viability = analyzeOutdoorViability(currentWeather, DEFAULT_WEATHER_MONITOR_CONFIG);

    // Optionally fetch updated forecast
    let dailyForecast = null;
    if (changes.length > 0 || alerts.length > 0) {
      dailyForecast = await get5DayForecast(location.lat, location.lon);
    }

    return NextResponse.json({
      success: true,
      data: {
        tripId: body.tripId,
        currentWeather,
        dailyForecast,
        viability,
        changes,
        alerts,
        trigger,
        checkedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[Weather Check] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Failed to check weather",
        },
      },
      { status: 500 }
    );
  }
}
