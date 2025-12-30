/**
 * Unified Tool Definitions
 *
 * Shared tool definitions for Viator and Yelp integrations.
 * These are provider-agnostic and converted by adapters.
 */

import type { UnifiedToolDef } from "./types";

// ===========================================
// Viator Tools (Activities & Tours)
// ===========================================

export const VIATOR_SEARCH_ACTIVITIES: UnifiedToolDef = {
  name: "search_activities",
  description:
    "Search for bookable tours, activities, and experiences in a destination. Use this when the user asks about things to do, activities, tours, or experiences in a specific location.",
  parameters: {
    type: "object",
    properties: {
      destination: {
        type: "string",
        description:
          "The destination city or location to search for activities (e.g., 'Paris', 'Tokyo', 'New York')",
      },
      category: {
        type: "string",
        description: "Optional category to filter activities",
        enum: [
          "tours",
          "day_trips",
          "food_tours",
          "cultural_tours",
          "outdoor_activities",
          "water_sports",
          "museums",
          "nightlife",
          "adventure",
          "family_friendly",
        ],
      },
      count: {
        type: "number",
        description: "Number of activities to return (default: 5, max: 10)",
      },
    },
    required: ["destination"],
  },
};

// ===========================================
// Yelp Tools (Restaurants)
// ===========================================

export const YELP_SEARCH_RESTAURANTS: UnifiedToolDef = {
  name: "search_restaurants",
  description:
    "Search for restaurants, cafes, and food establishments in a destination. Use this when the user asks about restaurants, where to eat, food recommendations, dining options, cafes, bars, or any food-related queries.",
  parameters: {
    type: "object",
    properties: {
      location: {
        type: "string",
        description:
          "The location to search for restaurants (e.g., 'Paris, France', 'Tokyo, Japan', 'New York, NY')",
      },
      cuisine: {
        type: "string",
        description:
          "Optional cuisine type to filter (e.g., 'italian', 'french', 'sushi', 'mexican', 'indian', 'chinese', 'thai', 'mediterranean', 'american', 'seafood')",
      },
      price: {
        type: "string",
        description:
          "Price level filter: 1=$, 2=$$, 3=$$$, 4=$$$$. Can combine adjacent levels.",
        enum: ["1", "2", "3", "4", "1,2", "2,3", "3,4"],
      },
      limit: {
        type: "number",
        description: "Number of restaurants to return (default: 5, max: 10)",
      },
    },
    required: ["location"],
  },
};

export const YELP_SEARCH_RESTAURANTS_NEARBY: UnifiedToolDef = {
  name: "search_restaurants_nearby",
  description:
    "Search for restaurants near a specific address, landmark, or attraction. Use this when the user asks about restaurants near a specific place, like 'restaurants near the Eiffel Tower' or 'where to eat near Louvre Museum'.",
  parameters: {
    type: "object",
    properties: {
      latitude: {
        type: "number",
        description: "Latitude of the location to search near",
      },
      longitude: {
        type: "number",
        description: "Longitude of the location to search near",
      },
      radius: {
        type: "number",
        description: "Search radius in meters (default: 500, max: 2000)",
      },
      cuisine: {
        type: "string",
        description: "Optional cuisine type to filter",
      },
      limit: {
        type: "number",
        description: "Number of restaurants to return (default: 5, max: 10)",
      },
    },
    required: ["latitude", "longitude"],
  },
};

// ===========================================
// Tool Groups
// ===========================================

/**
 * All Viator tools for activities/tours
 */
export const VIATOR_TOOLS: UnifiedToolDef[] = [VIATOR_SEARCH_ACTIVITIES];

/**
 * All Yelp tools for restaurants
 */
export const YELP_TOOLS: UnifiedToolDef[] = [
  YELP_SEARCH_RESTAURANTS,
  YELP_SEARCH_RESTAURANTS_NEARBY,
];

/**
 * All available tools
 */
export const ALL_TOOLS: UnifiedToolDef[] = [...VIATOR_TOOLS, ...YELP_TOOLS];

// ===========================================
// Tool Lookup Helpers
// ===========================================

const TOOL_MAP = new Map<string, UnifiedToolDef>();
ALL_TOOLS.forEach((tool) => TOOL_MAP.set(tool.name, tool));

/**
 * Get a tool by name
 */
export function getToolByName(name: string): UnifiedToolDef | undefined {
  return TOOL_MAP.get(name);
}

/**
 * Check if a tool exists
 */
export function hasToolWithName(name: string): boolean {
  return TOOL_MAP.has(name);
}

/**
 * Get tool names
 */
export function getToolNames(): string[] {
  return Array.from(TOOL_MAP.keys());
}
