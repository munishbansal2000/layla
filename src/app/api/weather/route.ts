import { NextRequest, NextResponse } from "next/server";
import {
  getWeatherForCity,
  getWeatherForTrip,
  geocodeCity,
} from "@/lib/weather";
import { validateTripDates } from "@/lib/date-validation";

/**
 * GET /api/weather
 *
 * Query params:
 * - city: City name (required)
 * - country: Country code (optional)
 * - startDate: Trip start date for filtered forecast (optional)
 * - endDate: Trip end date for filtered forecast (optional)
 * - type: "full" | "trip" (default: "full")
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const city = searchParams.get("city");
    const country = searchParams.get("country") || undefined;
    const startDate = searchParams.get("startDate");
    const endDate = searchParams.get("endDate");
    const type = searchParams.get("type") || "full";

    if (!city) {
      return NextResponse.json(
        { error: "City parameter is required" },
        { status: 400 }
      );
    }

    // Check if API key is configured
    if (!process.env.OPENWEATHER_API_KEY) {
      return NextResponse.json(
        { error: "OpenWeather API key not configured" },
        { status: 503 }
      );
    }

    // If requesting trip-specific weather with date range
    if (type === "trip" && startDate && endDate) {
      // Validate that dates are in the future (only support future trip planning)
      const dateValidation = validateTripDates(startDate, endDate);
      if (!dateValidation.valid) {
        return NextResponse.json(
          {
            error: dateValidation.error!.message,
            code: dateValidation.error!.code,
          },
          { status: 400 }
        );
      }

      const tripWeather = await getWeatherForTrip(
        city,
        country,
        new Date(startDate),
        new Date(endDate)
      );

      // Return the result even if empty - the dates may be outside forecast range
      // (OpenWeather free tier only provides 5-day forecast from today)
      return NextResponse.json({
        city,
        country,
        type: "trip",
        forecast: tripWeather,
        // Include metadata about forecast availability
        forecastAvailable: tripWeather.length > 0,
        note: tripWeather.length === 0
          ? "Weather forecast not available for the requested dates. OpenWeather provides 5-day forecasts from today."
          : undefined,
      });
    }

    // Full weather forecast
    const forecast = await getWeatherForCity(city, country);

    if (!forecast) {
      return NextResponse.json(
        { error: "Could not fetch weather for the specified location" },
        { status: 404 }
      );
    }

    return NextResponse.json({
      ...forecast,
      type: "full",
    });
  } catch (error) {
    console.error("Weather API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch weather data" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/weather/geocode
 *
 * Body: { city: string, country?: string }
 * Returns coordinates for a city
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { city, country } = body;

    if (!city) {
      return NextResponse.json(
        { error: "City is required" },
        { status: 400 }
      );
    }

    if (!process.env.OPENWEATHER_API_KEY) {
      return NextResponse.json(
        { error: "OpenWeather API key not configured" },
        { status: 503 }
      );
    }

    const location = await geocodeCity(city, country);

    if (!location) {
      return NextResponse.json(
        { error: "Could not find location" },
        { status: 404 }
      );
    }

    return NextResponse.json(location);
  } catch (error) {
    console.error("Geocode API error:", error);
    return NextResponse.json(
      { error: "Failed to geocode location" },
      { status: 500 }
    );
  }
}
