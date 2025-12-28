import { NextRequest, NextResponse } from "next/server";
import {
  searchRestaurants,
  searchRestaurantsNearby,
  getBusinessDetails,
  getBusinessReviews,
} from "@/lib/yelp";

/**
 * GET /api/restaurants
 *
 * Query params:
 * - location: City/location name (required unless lat/lon provided)
 * - lat: Latitude (optional, use with lon for nearby search)
 * - lon: Longitude (optional, use with lat for nearby search)
 * - cuisine: Cuisine type filter (optional)
 * - price: Price levels, comma-separated e.g., "1,2" (optional)
 * - sortBy: Sort order: best_match, rating, review_count, distance (optional)
 * - limit: Number of results (default: 20, max: 50)
 * - offset: Pagination offset (optional)
 * - openNow: Filter to open restaurants only (optional)
 * - radius: Search radius in meters for nearby search (optional, max: 40000)
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const location = searchParams.get("location");
    const lat = searchParams.get("lat");
    const lon = searchParams.get("lon");
    const cuisine = searchParams.get("cuisine") || undefined;
    const priceParam = searchParams.get("price");
    const sortBy = searchParams.get("sortBy") as
      | "best_match"
      | "rating"
      | "review_count"
      | "distance"
      | null;
    const limit = parseInt(searchParams.get("limit") || "20", 10);
    const offset = parseInt(searchParams.get("offset") || "0", 10);
    const openNow = searchParams.get("openNow") === "true";
    const radius = searchParams.get("radius")
      ? parseInt(searchParams.get("radius")!, 10)
      : undefined;

    // Check if API key is configured
    if (!process.env.YELP_API_KEY) {
      return NextResponse.json(
        { error: "Yelp API key not configured" },
        { status: 503 }
      );
    }

    // Validate required params
    if (!location && (!lat || !lon)) {
      return NextResponse.json(
        { error: "Either location or lat/lon coordinates are required" },
        { status: 400 }
      );
    }

    // Parse price levels
    const priceLevel = priceParam
      ? (priceParam.split(",").map(Number).filter((n) => n >= 1 && n <= 4) as (1 | 2 | 3 | 4)[])
      : undefined;

    let restaurants;

    // If coordinates provided, use nearby search
    if (lat && lon) {
      restaurants = await searchRestaurantsNearby(
        parseFloat(lat),
        parseFloat(lon),
        {
          cuisine,
          radius,
          priceLevel,
          sortBy: sortBy || "distance",
          limit,
          openNow: openNow || undefined,
        }
      );
    } else {
      // Use location-based search
      restaurants = await searchRestaurants(location!, {
        cuisine,
        priceLevel,
        sortBy: sortBy || "best_match",
        limit,
        offset,
        openNow: openNow || undefined,
      });
    }

    return NextResponse.json({
      restaurants,
      total: restaurants.length,
      location: location || `${lat},${lon}`,
      filters: {
        cuisine,
        priceLevel,
        sortBy,
        openNow,
      },
    });
  } catch (error) {
    console.error("Restaurant API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch restaurants" },
      { status: 500 }
    );
  }
}

/**
 * POST /api/restaurants
 *
 * Body: { businessId: string, action: "details" | "reviews" }
 * Get details or reviews for a specific restaurant
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { businessId, action } = body;

    if (!businessId) {
      return NextResponse.json(
        { error: "businessId is required" },
        { status: 400 }
      );
    }

    if (!process.env.YELP_API_KEY) {
      return NextResponse.json(
        { error: "Yelp API key not configured" },
        { status: 503 }
      );
    }

    if (action === "reviews") {
      const reviews = await getBusinessReviews(businessId);
      return NextResponse.json({ reviews });
    }

    // Default: get business details
    const details = await getBusinessDetails(businessId);

    if (!details) {
      return NextResponse.json(
        { error: "Restaurant not found" },
        { status: 404 }
      );
    }

    return NextResponse.json({ business: details });
  } catch (error) {
    console.error("Restaurant details API error:", error);
    return NextResponse.json(
      { error: "Failed to fetch restaurant details" },
      { status: 500 }
    );
  }
}
