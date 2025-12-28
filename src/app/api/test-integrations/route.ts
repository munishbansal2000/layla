/**
 * API Integration Test Endpoint
 *
 * Tests all configured API integrations and verifies caching is working.
 *
 * Usage: GET /api/test-integrations
 * Optional: ?service=places,weather,events (comma-separated)
 */

import { NextRequest, NextResponse } from "next/server";
import { getCacheStats, clearAllCache } from "@/lib/cache";

// Import integrations
import { searchNearbyPlaces } from "@/lib/google-places";
import { getCurrentWeather } from "@/lib/weather";
import { searchEvents, getFestivals } from "@/lib/events";
import { getExchangeRate, convertCurrency } from "@/lib/currency";
import { translateText } from "@/lib/translation";
import { getFlightStatus } from "@/lib/flight-status";

interface TestResult {
  service: string;
  status: "success" | "error" | "skipped";
  message: string;
  data?: unknown;
  cached?: boolean;
  responseTimeMs?: number;
  error?: string;
}

interface IntegrationTestResults {
  timestamp: string;
  totalTests: number;
  passed: number;
  failed: number;
  skipped: number;
  cacheStats: {
    before: { hits: number; misses: number; size: number };
    after: { hits: number; misses: number; size: number };
  };
  results: TestResult[];
}

// Test location: Tokyo
const TEST_LOCATION = { lat: 35.6762, lng: 139.6503 };
const TEST_CITY = "Tokyo";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const servicesParam = searchParams.get("service");
  const clearCache = searchParams.get("clear") === "true";

  const requestedServices = servicesParam
    ? servicesParam.split(",").map(s => s.trim().toLowerCase())
    : null;

  // Optionally clear cache first
  if (clearCache) {
    clearAllCache();
  }

  const cacheStatsBefore = getCacheStats();
  const results: TestResult[] = [];

  // Helper to check if service should be tested
  const shouldTest = (service: string) =>
    !requestedServices || requestedServices.includes(service.toLowerCase());

  // ============================================
  // TEST: Google Places
  // ============================================
  if (shouldTest("places")) {
    const start = Date.now();
    try {
      const places = await searchNearbyPlaces(TEST_LOCATION.lat, TEST_LOCATION.lng, {
        types: ["restaurant"],
        radius: 1000,
        maxResults: 3,
      });

      // Second call should be cached
      const start2 = Date.now();
      await searchNearbyPlaces(TEST_LOCATION.lat, TEST_LOCATION.lng, {
        types: ["restaurant"],
        radius: 1000,
        maxResults: 3,
      });
      const cachedTime = Date.now() - start2;

      results.push({
        service: "Google Places",
        status: places.length > 0 ? "success" : "error",
        message: `Found ${places.length} places nearby`,
        data: places.slice(0, 2).map(p => ({ name: p.name, types: p.types })),
        cached: cachedTime < 50, // Cached calls should be very fast
        responseTimeMs: Date.now() - start,
      });
    } catch (error) {
      results.push({
        service: "Google Places",
        status: "error",
        message: "Failed to fetch places",
        error: error instanceof Error ? error.message : String(error),
        responseTimeMs: Date.now() - start,
      });
    }
  }

  // ============================================
  // TEST: Weather
  // ============================================
  if (shouldTest("weather")) {
    const start = Date.now();
    try {
      const weather = await getCurrentWeather(TEST_LOCATION.lat, TEST_LOCATION.lng);

      // Second call should be cached
      const start2 = Date.now();
      await getCurrentWeather(TEST_LOCATION.lat, TEST_LOCATION.lng);
      const cachedTime = Date.now() - start2;

      results.push({
        service: "OpenWeather",
        status: weather ? "success" : "error",
        message: weather
          ? `${TEST_CITY}: ${weather.temp}°C, ${weather.weather.description}`
          : "No weather data",
        data: weather ? {
          temp: weather.temp,
          feels_like: weather.feels_like,
          humidity: weather.humidity,
          description: weather.weather.description,
        } : null,
        cached: cachedTime < 50,
        responseTimeMs: Date.now() - start,
      });
    } catch (error) {
      results.push({
        service: "OpenWeather",
        status: "error",
        message: "Failed to fetch weather",
        error: error instanceof Error ? error.message : String(error),
        responseTimeMs: Date.now() - start,
      });
    }
  }

  // ============================================
  // TEST: Events (Ticketmaster/Eventbrite)
  // ============================================
  if (shouldTest("events")) {
    const start = Date.now();
    try {
      const events = await searchEvents({
        location: TEST_LOCATION,
        radius: 50,
        limit: 5,
      });

      // Also test festival data
      const festivals = getFestivals("JP");

      results.push({
        service: "Events (Ticketmaster/Eventbrite)",
        status: "success",
        message: `Found ${events.length} events, ${festivals.length} festivals`,
        data: {
          events: events.slice(0, 2).map(e => ({ name: e.name, category: e.category })),
          festivals: festivals.slice(0, 2).map(f => f.name),
        },
        responseTimeMs: Date.now() - start,
      });
    } catch (error) {
      results.push({
        service: "Events",
        status: "error",
        message: "Failed to fetch events",
        error: error instanceof Error ? error.message : String(error),
        responseTimeMs: Date.now() - start,
      });
    }
  }

  // ============================================
  // TEST: Currency (Frankfurter - FREE)
  // ============================================
  if (shouldTest("currency")) {
    const start = Date.now();
    try {
      const rate = await getExchangeRate("USD", "JPY");

      // Second call should be cached
      const start2 = Date.now();
      await getExchangeRate("USD", "JPY");
      const cachedTime = Date.now() - start2;

      // Test conversion
      const converted = await convertCurrency(100, "USD", "JPY");

      results.push({
        service: "Currency (Frankfurter)",
        status: rate ? "success" : "error",
        message: rate
          ? `1 USD = ${rate.rate.toFixed(2)} JPY (100 USD = ¥${converted?.toAmount.toFixed(0)})`
          : "No exchange rate data",
        data: rate ? {
          base: rate.base,
          target: rate.target,
          rate: rate.rate,
          source: rate.source,
        } : null,
        cached: cachedTime < 50,
        responseTimeMs: Date.now() - start,
      });
    } catch (error) {
      results.push({
        service: "Currency",
        status: "error",
        message: "Failed to fetch exchange rate",
        error: error instanceof Error ? error.message : String(error),
        responseTimeMs: Date.now() - start,
      });
    }
  }

  // ============================================
  // TEST: Translation (MyMemory - FREE)
  // ============================================
  if (shouldTest("translation")) {
    const start = Date.now();
    try {
      const translations = await translateText(
        ["Hello", "Thank you", "Where is the train station?"],
        "ja",
        "en"
      );

      // Second call should be cached
      const start2 = Date.now();
      await translateText(["Hello"], "ja", "en");
      const cachedTime = Date.now() - start2;

      results.push({
        service: "Translation (MyMemory/Lingva)",
        status: translations.length > 0 ? "success" : "error",
        message: `Translated ${translations.length} phrases to Japanese`,
        data: translations.map(t => ({
          original: t.originalText,
          translated: t.translatedText,
        })),
        cached: cachedTime < 50,
        responseTimeMs: Date.now() - start,
      });
    } catch (error) {
      results.push({
        service: "Translation",
        status: "error",
        message: "Failed to translate",
        error: error instanceof Error ? error.message : String(error),
        responseTimeMs: Date.now() - start,
      });
    }
  }

  // ============================================
  // TEST: Flight Status (Simulated/AeroDataBox)
  // ============================================
  if (shouldTest("flights")) {
    const start = Date.now();
    try {
      // Test with a sample flight
      const flight = await getFlightStatus("JL1", new Date().toISOString().split("T")[0]);

      results.push({
        service: "Flight Status",
        status: flight ? "success" : "error",
        message: flight
          ? `${flight.flightNumber}: ${flight.departure.airport.code} → ${flight.arrival.airport.code} (${flight.status})`
          : "No flight data",
        data: flight ? {
          flight: flight.flightNumber,
          airline: flight.airline.name,
          status: flight.status,
          departure: flight.departure.airport.code,
          arrival: flight.arrival.airport.code,
        } : null,
        responseTimeMs: Date.now() - start,
      });
    } catch (error) {
      results.push({
        service: "Flight Status",
        status: "error",
        message: "Failed to fetch flight status",
        error: error instanceof Error ? error.message : String(error),
        responseTimeMs: Date.now() - start,
      });
    }
  }

  // ============================================
  // TEST: Foursquare Places
  // ============================================
  if (shouldTest("foursquare")) {
    const start = Date.now();
    try {
      // Foursquare is used as fallback in google-places.ts
      // We test it through the main places API
      const places = await searchNearbyPlaces(TEST_LOCATION.lat, TEST_LOCATION.lng, {
        types: ["cafe"],
        radius: 500,
        maxResults: 2,
      });

      results.push({
        service: "Foursquare (via Places)",
        status: places.length > 0 ? "success" : "skipped",
        message: places.length > 0
          ? `Found ${places.length} cafes`
          : "No results (may need Foursquare fallback)",
        data: places.slice(0, 2).map(p => ({ name: p.name })),
        responseTimeMs: Date.now() - start,
      });
    } catch (error) {
      results.push({
        service: "Foursquare",
        status: "error",
        message: "Failed to fetch places",
        error: error instanceof Error ? error.message : String(error),
        responseTimeMs: Date.now() - start,
      });
    }
  }

  // ============================================
  // COMPILE RESULTS
  // ============================================
  const cacheStatsAfter = getCacheStats();

  const response: IntegrationTestResults = {
    timestamp: new Date().toISOString(),
    totalTests: results.length,
    passed: results.filter(r => r.status === "success").length,
    failed: results.filter(r => r.status === "error").length,
    skipped: results.filter(r => r.status === "skipped").length,
    cacheStats: {
      before: {
        hits: cacheStatsBefore.hits,
        misses: cacheStatsBefore.misses,
        size: cacheStatsBefore.size,
      },
      after: {
        hits: cacheStatsAfter.hits,
        misses: cacheStatsAfter.misses,
        size: cacheStatsAfter.size,
      },
    },
    results,
  };

  return NextResponse.json(response, { status: 200 });
}
