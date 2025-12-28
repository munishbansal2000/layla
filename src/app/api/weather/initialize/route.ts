/**
 * API Route: Initialize weather monitoring for a trip
 * POST /api/weather/initialize
 */

import { NextRequest, NextResponse } from "next/server";
import {
  geocodeCity,
  getCurrentWeather,
  get5DayForecast,
} from "@/lib/weather";
import {
  analyzeOutdoorViability,
  DEFAULT_WEATHER_MONITOR_CONFIG,
} from "@/lib/weather-monitor";

interface InitializeRequest {
  tripId: string;
  city: string;
  country?: string;
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as InitializeRequest;

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

    // Fetch current weather and forecast
    const [currentWeather, dailyForecast] = await Promise.all([
      getCurrentWeather(location.lat, location.lon),
      get5DayForecast(location.lat, location.lon),
    ]);

    // Analyze current viability
    const viability = currentWeather
      ? analyzeOutdoorViability(currentWeather, DEFAULT_WEATHER_MONITOR_CONFIG)
      : null;

    return NextResponse.json({
      success: true,
      data: {
        tripId: body.tripId,
        location: {
          city: location.name,
          country: location.country,
          lat: location.lat,
          lon: location.lon,
        },
        currentWeather,
        dailyForecast,
        viability,
        initializedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error("[Weather Initialize] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "INTERNAL_ERROR",
          message: error instanceof Error ? error.message : "Failed to initialize weather monitoring",
        },
      },
      { status: 500 }
    );
  }
}
