/**
 * Test endpoint to verify real API image loading
 * GET /api/test-place-images
 *
 * Tests Foursquare and Yelp APIs with real calls to fetch place images
 */

import { NextResponse } from "next/server";
import {
  searchFoursquarePlaces,
  buildPhotoUrl,
  isFoursquareConfigured,
} from "@/lib/foursquare";
import {
  searchRestaurants as searchYelpRestaurants,
  isYelpConfigured,
} from "@/lib/yelp";
import {
  resolvePlace,
  type UnresolvedPlace,
} from "@/lib/place-resolver";

export async function GET() {
  const results: {
    foursquare: {
      configured: boolean;
      places: Array<{
        name: string;
        photos: string[];
        rating?: number;
        reviewCount?: number;
      }>;
      error?: string;
    };
    yelp: {
      configured: boolean;
      places: Array<{
        name: string;
        photos: string[];
        rating?: number;
        reviewCount?: number;
      }>;
      error?: string;
    };
    placeResolver: {
      places: Array<{
        name: string;
        photos: string[];
        rating?: number;
        reviewCount?: number;
        source: string;
        confidence: number;
      }>;
      error?: string;
    };
  } = {
    foursquare: { configured: false, places: [] },
    yelp: { configured: false, places: [] },
    placeResolver: { places: [] },
  };

  // Test Foursquare
  results.foursquare.configured = isFoursquareConfigured();
  if (results.foursquare.configured) {
    try {
      console.log("[TestPlaceImages] Testing Foursquare API...");
      const fsqResponse = await searchFoursquarePlaces({
        query: "Senso-ji Temple",
        near: "Tokyo, Japan",
        limit: 3,
      });

      results.foursquare.places = fsqResponse.results.map((place) => ({
        name: place.name,
        photos: place.photos?.map((p) => buildPhotoUrl(p, "original")) || [],
        rating: (place as { rating?: number }).rating,
        reviewCount: (place as { stats?: { total_ratings?: number } }).stats?.total_ratings,
      }));

      console.log(`[TestPlaceImages] Foursquare returned ${results.foursquare.places.length} places`);
      results.foursquare.places.forEach((p) => {
        console.log(`  - ${p.name}: ${p.photos.length} photos, rating: ${p.rating}`);
      });
    } catch (error) {
      results.foursquare.error = error instanceof Error ? error.message : String(error);
      console.error("[TestPlaceImages] Foursquare error:", results.foursquare.error);
    }
  }

  // Test Yelp
  results.yelp.configured = isYelpConfigured();
  if (results.yelp.configured) {
    try {
      console.log("[TestPlaceImages] Testing Yelp API...");
      const yelpResponse = await searchYelpRestaurants("Tokyo", {
        cuisine: "ramen",
        limit: 3,
      });

      results.yelp.places = yelpResponse.map((place) => ({
        name: place.name,
        photos: place.imageUrl ? [place.imageUrl] : [],
        rating: place.rating,
        reviewCount: place.reviewCount,
      }));

      console.log(`[TestPlaceImages] Yelp returned ${results.yelp.places.length} places`);
      results.yelp.places.forEach((p) => {
        console.log(`  - ${p.name}: ${p.photos.length} photos, rating: ${p.rating}`);
      });
    } catch (error) {
      results.yelp.error = error instanceof Error ? error.message : String(error);
      console.error("[TestPlaceImages] Yelp error:", results.yelp.error);
    }
  }

  // Test Place Resolver (the main orchestrator)
  try {
    console.log("[TestPlaceImages] Testing Place Resolver...");

    const testPlaces: UnresolvedPlace[] = [
      {
        name: "Senso-ji Temple",
        category: "temple",
        neighborhood: "Asakusa",
        city: "Tokyo",
        country: "Japan",
      },
      {
        name: "Ichiran Ramen",
        category: "restaurant",
        neighborhood: "Shibuya",
        city: "Tokyo",
        country: "Japan",
      },
    ];

    for (const place of testPlaces) {
      const result = await resolvePlace(place, { forceRefresh: true });

      if (result.resolved) {
        results.placeResolver.places.push({
          name: result.resolved.name,
          photos: result.resolved.photos || [],
          rating: result.resolved.rating,
          reviewCount: result.resolved.reviewCount,
          source: result.resolved.source,
          confidence: result.resolved.confidence,
        });
        console.log(`  - ${result.resolved.name}: ${result.resolved.photos?.length || 0} photos from ${result.resolved.source}`);
      }
    }
  } catch (error) {
    results.placeResolver.error = error instanceof Error ? error.message : String(error);
    console.error("[TestPlaceImages] Place Resolver error:", results.placeResolver.error);
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    mode: process.env.AI_MODE || "unknown",
    results,
    summary: {
      foursquarePhotos: results.foursquare.places.reduce((sum, p) => sum + p.photos.length, 0),
      yelpPhotos: results.yelp.places.reduce((sum, p) => sum + p.photos.length, 0),
      resolverPhotos: results.placeResolver.places.reduce((sum, p) => sum + p.photos.length, 0),
    },
  });
}
