/**
 * Tool Executor
 *
 * Executes tools and returns results.
 * Connects the unified tool interface to actual API implementations.
 */

import type { UnifiedToolCall, UnifiedToolResult, ToolExecutor } from "./types";

// ===========================================
// Viator Executor
// ===========================================

async function executeViatorSearch(
  args: Record<string, unknown>
): Promise<unknown> {
  try {
    // Dynamic import to avoid circular dependencies
    const { searchProducts, viatorProductToActivity } = await import("../viator");

    const destination = args.destination as string;
    const category = args.category as string | undefined;
    const count = Math.min((args.count as number) || 5, 10);

    const searchParams = {
      destName: destination,
      count,
      sortOrder: "TRAVELER_RATING" as const,
      tags: undefined as number[] | undefined,
    };

    // Map category to Viator tag ID
    if (category) {
      const tagMap: Record<string, number> = {
        tours: 11889,
        day_trips: 11894,
        cultural_tours: 12065,
        food_tours: 12066,
        outdoor_activities: 11919,
        water_sports: 11920,
        museums: 12062,
        nightlife: 11901,
        adventure: 11917,
        family_friendly: 11899,
      };
      if (tagMap[category]) {
        searchParams.tags = [tagMap[category]];
      }
    }

    const response = await searchProducts(searchParams);
    const activities = response.products.map(viatorProductToActivity);

    return {
      destination,
      activities,
      totalCount: response.totalCount,
    };
  } catch (error) {
    console.error("[Tool Executor] Viator search error:", error);
    return null;
  }
}

// ===========================================
// Yelp Executor
// ===========================================

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

async function executeYelpSearch(
  args: Record<string, unknown>
): Promise<unknown> {
  try {
    const { searchRestaurants } = await import("../yelp");

    const location = args.location as string;
    const cuisine = args.cuisine as string | undefined;
    const priceArg = args.price as string | undefined;
    const limit = Math.min((args.limit as number) || 5, 10);

    // Parse price levels
    let priceLevel: (1 | 2 | 3 | 4)[] | undefined;
    if (priceArg) {
      priceLevel = priceArg.split(",").map((p) => parseInt(p, 10) as 1 | 2 | 3 | 4);
    }

    const restaurants = await searchRestaurants(location, {
      cuisine,
      priceLevel,
      limit,
      sortBy: "rating",
    });

    return {
      location,
      restaurants: restaurants.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.cuisine?.join(", ") || "Restaurant",
        cuisine: r.cuisine?.[0] || "Restaurant",
        imageUrl: r.imageUrl || "/placeholder-restaurant.jpg",
        rating: r.rating,
        reviewCount: r.reviewCount,
        priceLevel: r.priceLevel,
        address: r.address,
        distance: r.distance ? formatDistance(r.distance) : undefined,
        url: r.url,
        phone: r.phone,
        categories: r.cuisine || [],
        isOpen: r.isOpenNow,
        coordinates: r.coordinates,
      })),
      totalCount: restaurants.length,
    };
  } catch (error) {
    console.error("[Tool Executor] Yelp search error:", error);
    return null;
  }
}

async function executeYelpNearbySearch(
  args: Record<string, unknown>
): Promise<unknown> {
  try {
    const { searchRestaurantsNearby } = await import("../yelp");

    const latitude = args.latitude as number;
    const longitude = args.longitude as number;
    const radius = Math.min((args.radius as number) || 500, 2000);
    const cuisine = args.cuisine as string | undefined;
    const limit = Math.min((args.limit as number) || 5, 10);

    const restaurants = await searchRestaurantsNearby(latitude, longitude, {
      cuisine,
      radius,
      limit,
      sortBy: "distance",
    });

    return {
      location: `${latitude},${longitude}`,
      restaurants: restaurants.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.cuisine?.join(", ") || "Restaurant",
        cuisine: r.cuisine?.[0] || "Restaurant",
        imageUrl: r.imageUrl || "/placeholder-restaurant.jpg",
        rating: r.rating,
        reviewCount: r.reviewCount,
        priceLevel: r.priceLevel,
        address: r.address,
        distance: r.distance ? formatDistance(r.distance) : undefined,
        url: r.url,
        phone: r.phone,
        categories: r.cuisine || [],
        isOpen: r.isOpenNow,
        coordinates: r.coordinates,
      })),
      totalCount: restaurants.length,
    };
  } catch (error) {
    console.error("[Tool Executor] Yelp nearby search error:", error);
    return null;
  }
}

// ===========================================
// Main Executor
// ===========================================

/**
 * Execute a single tool call
 */
export async function executeTool(
  toolCall: UnifiedToolCall
): Promise<UnifiedToolResult> {
  const { id, name, arguments: args } = toolCall;

  console.log(`[Tool Executor] Executing: ${name}`, args);

  let result: unknown = null;
  let isError = false;

  try {
    switch (name) {
      case "search_activities":
        result = await executeViatorSearch(args);
        break;

      case "search_restaurants":
        result = await executeYelpSearch(args);
        break;

      case "search_restaurants_nearby":
        result = await executeYelpNearbySearch(args);
        break;

      default:
        result = { error: `Unknown tool: ${name}` };
        isError = true;
    }

    if (result === null) {
      result = { error: `Tool ${name} returned no results` };
      isError = true;
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    result = { error: errorMessage };
    isError = true;
    console.error(`[Tool Executor] Error executing ${name}:`, error);
  }

  return {
    toolCallId: id,
    name,
    result,
    isError,
  };
}

/**
 * Execute multiple tool calls in parallel
 */
export async function executeTools(
  toolCalls: UnifiedToolCall[]
): Promise<UnifiedToolResult[]> {
  return Promise.all(toolCalls.map(executeTool));
}

/**
 * Create a tool executor function
 */
export function createToolExecutor(): ToolExecutor {
  return async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    const result = await executeTool({
      id: `exec_${Date.now()}`,
      name,
      arguments: args,
    });
    return result.result;
  };
}
