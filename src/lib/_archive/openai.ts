import OpenAI from "openai";
import {
  logOpenAIRequest,
  createLogEntry,
  findReplayMatch,
} from "./openai-logger";
import {
  searchProducts,
  viatorProductToActivity,
} from "./viator";
import type { ViatorSearchParams } from "./viator";
import {
  searchRestaurants,
  searchRestaurantsNearby,
} from "./yelp";
import type { BookableRestaurant } from "@/types";

// ===========================================
// AI Mode Configuration
// ===========================================

export type AIMode = "prod" | "test";

export function getAIMode(): AIMode {
  const mode = process.env.AI_MODE?.toLowerCase();
  if (mode === "test" || mode === "development" || mode === "dev") {
    return "test";
  }
  return "prod";
}

export function isTestMode(): boolean {
  return getAIMode() === "test";
}

// ===========================================
// OpenAI Client (Lazy initialization)
// ===========================================

let _openaiClient: OpenAI | null = null;

function getOpenAIClient(): OpenAI {
  if (!_openaiClient) {
    _openaiClient = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || "not-configured",
    });
  }
  return _openaiClient;
}

// For backward compatibility - use getOpenAIClient() for lazy access
const openai = {
  get chat() {
    return getOpenAIClient().chat;
  },
};

export default openai;
export { getOpenAIClient };

// ===========================================
// System Prompts (using centralized prompts)
// ===========================================

// Import centralized prompts
import { SYSTEM_PROMPTS } from "./prompts";

// Re-export for backward compatibility
export { SYSTEM_PROMPTS };

// ===========================================
// Types - Basic (Legacy)
// ===========================================

export interface GeneratedItinerary {
  title: string;
  days: GeneratedDay[];
  tips: string[];
  estimatedBudget: {
    low: number;
    high: number;
    currency: string;
  };
}

export interface GeneratedDay {
  dayNumber: number;
  title: string;
  activities: GeneratedActivity[];
}

export interface GeneratedActivity {
  name: string;
  description: string;
  type: string;
  startTime: string;
  endTime: string;
  duration: number;
  location: {
    address: string;
    city: string;
    country: string;
  };
  priceLevel: number;
  rating: number;
  tags: string[];
  tips: string[];
}

// ===========================================
// Types - Structured Itinerary (New Schema)
// ===========================================

export interface StructuredItinerary {
  title: string;
  destination: {
    city: string;
    country: string;
  };
  dates: {
    start: string;
    end: string;
  };
  days: StructuredDay[];
  generalTips: string[];
  packingList: string[];
  estimatedBudget: {
    accommodation: { low: number; high: number };
    food: { low: number; high: number };
    activities: { low: number; high: number };
    transport: { low: number; high: number };
    total: { low: number; high: number };
    currency: string;
    perPerson: boolean;
  };
}

export interface StructuredDay {
  dayNumber: number;
  date: string;
  title: string;
  slots: StructuredSlot[];
}

export interface StructuredSlot {
  slotType: "morning" | "lunch" | "afternoon" | "dinner" | "evening";
  startTime: string;
  endTime: string;
  activity: StructuredActivity;
}

export interface StructuredActivity {
  name: string;
  description: string;
  type: string;
  duration: number;
  location: {
    name: string;
    address: string;
    neighborhood: string;
    coordinates: {
      lat: number;
      lng: number;
    };
  };
  priceRange: {
    min: number;
    max: number;
    currency: string;
    priceLevel: number;
  };
  rating: number;
  reservationRequired: boolean;
  reservationUrl?: string;
  tags: string[];
  tips: string[];
  alternativeOptions?: Array<{
    name: string;
    reason: string;
  }>;
}

// ===========================================
// Chat Response Generation
// ===========================================

export async function generateChatResponse(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  userContext?: Record<string, unknown>
): Promise<string> {
  const mode = getAIMode();

  // In test mode, try to replay from logs first
  if (mode === "test") {
    console.log("[AI] Test mode - checking for replay match...");
    const replayMatch = await findReplayMatch("chat", messages, userContext);

    if (replayMatch.found && replayMatch.entry) {
      console.log(
        `[AI] Replay match found! Type: ${replayMatch.matchType}, Score: ${replayMatch.matchScore}`
      );
      console.log(`[AI] Using cached response from: ${replayMatch.entry.id}`);
      return replayMatch.entry.response.content;
    }

    console.log("[AI] No replay match - calling OpenAI and saving response...");
  }

  // Call OpenAI (for prod, or test when no replay found)
  return callOpenAIChat(messages, userContext);
}

async function callOpenAIChat(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  userContext?: Record<string, unknown>
): Promise<string> {
  const startTime = Date.now();
  const model = "gpt-4o-mini";
  const temperature = 0.7;
  const max_tokens = 1000;

  const requestMessages = [
    { role: "system" as const, content: SYSTEM_PROMPTS.travelPlanner },
    ...messages,
  ];

  try {
    const response = await openai.chat.completions.create({
      model,
      messages: requestMessages,
      temperature,
      max_tokens,
    });

    const content =
      response.choices[0]?.message?.content ||
      "I apologize, I couldn't generate a response.";
    const durationMs = Date.now() - startTime;

    // Log the request/response
    const logEntry = createLogEntry(
      "chat",
      {
        model,
        messages: requestMessages,
        temperature,
        max_tokens,
      },
      {
        id: response.id,
        content,
        finish_reason: response.choices[0]?.finish_reason || undefined,
        usage: response.usage
          ? {
              prompt_tokens: response.usage.prompt_tokens,
              completion_tokens: response.usage.completion_tokens,
              total_tokens: response.usage.total_tokens,
            }
          : undefined,
      },
      durationMs,
      true,
      undefined,
      userContext
    );

    // Log asynchronously (don't await to avoid blocking)
    logOpenAIRequest(logEntry).catch(console.error);

    console.log(`[AI] OpenAI response logged: ${logEntry.id}`);
    return content;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Log the failed request
    const logEntry = createLogEntry(
      "chat",
      {
        model,
        messages: requestMessages,
        temperature,
        max_tokens,
      },
      {
        content: "",
      },
      durationMs,
      false,
      errorMessage,
      userContext
    );

    logOpenAIRequest(logEntry).catch(console.error);

    throw error;
  }
}

// ===========================================
// Yelp Integration - Function Calling
// ===========================================

export const YELP_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_restaurants",
      description: "Search for restaurants, cafes, and food establishments in a destination. Use this when the user asks about restaurants, where to eat, food recommendations, dining options, cafes, bars, or any food-related queries.",
      parameters: {
        type: "object",
        properties: {
          location: {
            type: "string",
            description: "The location to search for restaurants (e.g., 'Paris, France', 'Tokyo, Japan', 'New York, NY')",
          },
          cuisine: {
            type: "string",
            description: "Optional cuisine type to filter (e.g., 'italian', 'french', 'sushi', 'mexican', 'indian', 'chinese', 'thai', 'mediterranean', 'american', 'seafood')",
          },
          price: {
            type: "string",
            enum: ["1", "2", "3", "4", "1,2", "2,3", "3,4"],
            description: "Price level filter: 1=$, 2=$$, 3=$$$, 4=$$$$. Can combine adjacent levels.",
          },
          limit: {
            type: "number",
            description: "Number of restaurants to return (default: 5, max: 10)",
          },
        },
        required: ["location"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "search_restaurants_nearby",
      description: "Search for restaurants near a specific address, landmark, or attraction. Use this when the user asks about restaurants near a specific place, like 'restaurants near the Eiffel Tower' or 'where to eat near Louvre Museum'.",
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
    },
  },
];

export interface YelpFunctionResult {
  location: string;
  restaurants: BookableRestaurant[];
  totalCount: number;
}

// Helper to format distance
function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

export async function executeYelpFunction(
  functionName: string,
  args: Record<string, unknown>
): Promise<YelpFunctionResult | null> {
  if (functionName === "search_restaurants") {
    const location = args.location as string;
    const cuisine = args.cuisine as string | undefined;
    const priceArg = args.price as string | undefined;
    const limit = Math.min((args.limit as number) || 5, 10);

    // Parse price levels from string like "1,2" or "3"
    let priceLevel: (1 | 2 | 3 | 4)[] | undefined;
    if (priceArg) {
      priceLevel = priceArg.split(",").map(p => parseInt(p, 10) as 1 | 2 | 3 | 4);
    }

    try {
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
      console.error("Yelp function error:", error);
      return null;
    }
  }

  if (functionName === "search_restaurants_nearby") {
    const latitude = args.latitude as number;
    const longitude = args.longitude as number;
    const radius = Math.min((args.radius as number) || 500, 2000);
    const cuisine = args.cuisine as string | undefined;
    const limit = Math.min((args.limit as number) || 5, 10);

    try {
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
      console.error("Yelp nearby function error:", error);
      return null;
    }
  }

  return null;
}

// ===========================================
// Combined Chat with Viator + Yelp Integration
// ===========================================

export interface ChatResponseWithAll {
  content: string;
  activities?: ReturnType<typeof viatorProductToActivity>[];
  restaurants?: BookableRestaurant[];
  destination?: string;
}

export async function generateChatResponseWithAll(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  userContext?: Record<string, unknown>
): Promise<ChatResponseWithAll> {
  const mode = getAIMode();

  // In test mode, try to replay from logs first
  if (mode === "test") {
    console.log("[AI] Test mode - checking for replay match...");
    const replayMatch = await findReplayMatch("chat", messages, userContext);

    if (replayMatch.found && replayMatch.entry) {
      console.log(
        `[AI] Replay match found! Type: ${replayMatch.matchType}, Score: ${replayMatch.matchScore}`
      );
      console.log(`[AI] Using cached response from: ${replayMatch.entry.id}`);
      return { content: replayMatch.entry.response.content };
    }

    console.log("[AI] No replay match - calling OpenAI with all tools...");
  }

  return callOpenAIChatWithAll(messages, userContext);
}

async function callOpenAIChatWithAll(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  userContext?: Record<string, unknown>
): Promise<ChatResponseWithAll> {
  const startTime = Date.now();
  const model = "gpt-4o-mini";
  const temperature = 0.7;
  const max_tokens = 1000;

  const systemPrompt = `${SYSTEM_PROMPTS.travelPlanner}

IMPORTANT: You have access to real-time data from two services:

1. ACTIVITIES (Viator): When users ask about tours, activities, attractions, things to do, sightseeing, or experiences, use the search_activities function to get real, bookable tours and activities.

2. RESTAURANTS (Yelp): When users ask about restaurants, where to eat, food recommendations, dining options, cafes, bars, or cuisine, use the search_restaurants function. If they ask for restaurants near a specific landmark, use search_restaurants_nearby.

HOW TO PRESENT RESULTS:

For ACTIVITIES:
- Show top 3-5 activities with names, descriptions, prices, and ratings
- Mention these are bookable experiences
- Highlight what makes each unique

For RESTAURANTS:
- Show top 3-5 restaurants with names, cuisine type, rating, price level, and address
- Use cuisine emojis (🍕 Italian, 🍣 Japanese, 🥐 French, 🌮 Mexican, etc.)
- Mention if they're highly rated or have many reviews

You can search for BOTH activities AND restaurants in the same response if the user's query involves both (e.g., "What can I do and where can I eat in Paris?").

Common landmark coordinates for nearby searches:
- Eiffel Tower: 48.8584, 2.2945
- Louvre Museum: 48.8606, 2.3376
- Notre-Dame: 48.8530, 2.3499
- Arc de Triomphe: 48.8738, 2.2950
- Colosseum Rome: 41.8902, 12.4922
- Tokyo Tower: 35.6586, 139.7454
- Statue of Liberty: 40.6892, -74.0445
- Big Ben: 51.5007, -0.1246`;

  // Combine all tools
  const allTools: OpenAI.Chat.Completions.ChatCompletionTool[] = [
    ...VIATOR_TOOLS,
    ...YELP_TOOLS,
  ];

  const requestMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    })),
  ];

  try {
    // First call with all tools
    const response = await openai.chat.completions.create({
      model,
      messages: requestMessages,
      temperature,
      max_tokens,
      tools: allTools,
      tool_choice: "auto",
    });

    const message = response.choices[0]?.message;
    let result: ChatResponseWithAll = { content: "" };

    // Check if the model wants to call functions
    if (message?.tool_calls && message.tool_calls.length > 0) {
      const toolResults: Array<{
        tool_call_id: string;
        content: string;
      }> = [];

      // Execute all tool calls
      for (const toolCall of message.tool_calls) {
        const toolCallAny = toolCall as { function?: { name: string; arguments: string }; id: string };
        const functionName = toolCallAny.function?.name || "";
        const functionArgs = JSON.parse(toolCallAny.function?.arguments || "{}");

        console.log(`[AI] Function call: ${functionName}`, functionArgs);

        // Determine which function to execute
        let functionResult: ViatorFunctionResult | YelpFunctionResult | null = null;

        if (functionName === "search_activities") {
          functionResult = await executeViatorFunction(functionName, functionArgs);
          if (functionResult && "activities" in functionResult) {
            result.activities = functionResult.activities;
            result.destination = functionResult.destination;
          }
        } else if (functionName === "search_restaurants" || functionName === "search_restaurants_nearby") {
          functionResult = await executeYelpFunction(functionName, functionArgs);
          if (functionResult && "restaurants" in functionResult) {
            result.restaurants = functionResult.restaurants;
            if (!result.destination) {
              result.destination = functionResult.location;
            }
          }
        }

        toolResults.push({
          tool_call_id: toolCall.id,
          content: JSON.stringify(functionResult || { error: "Function not found" }),
        });
      }

      // Call OpenAI again with all function results
      const followUpMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
        ...requestMessages,
        message,
        ...toolResults.map((tr) => ({
          role: "tool" as const,
          tool_call_id: tr.tool_call_id,
          content: tr.content,
        })),
      ];

      const followUpResponse = await openai.chat.completions.create({
        model,
        messages: followUpMessages,
        temperature,
        max_tokens: 1500,
      });

      result.content =
        followUpResponse.choices[0]?.message?.content ||
        "I found some results but had trouble presenting them.";

      const durationMs = Date.now() - startTime;

      // Log the request/response
      const logEntry = createLogEntry(
        "chat",
        {
          model,
          messages: messages.map((m) => ({ role: m.role, content: m.content })),
          temperature,
          max_tokens,
        },
        {
          id: followUpResponse.id,
          content: result.content,
          finish_reason: followUpResponse.choices[0]?.finish_reason || undefined,
          usage: followUpResponse.usage
            ? {
                prompt_tokens: followUpResponse.usage.prompt_tokens,
                completion_tokens: followUpResponse.usage.completion_tokens,
                total_tokens: followUpResponse.usage.total_tokens,
              }
            : undefined,
        },
        durationMs,
        true,
        undefined,
        {
          ...userContext,
          viatorResults: result.activities?.length || 0,
          yelpResults: result.restaurants?.length || 0,
        }
      );

      logOpenAIRequest(logEntry).catch(console.error);

      return result;
    }

    // No function call, return regular response
    result.content = message?.content || "I apologize, I couldn't generate a response.";
    const durationMs = Date.now() - startTime;

    // Log the request/response
    const logEntry = createLogEntry(
      "chat",
      {
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature,
        max_tokens,
      },
      {
        id: response.id,
        content: result.content,
        finish_reason: response.choices[0]?.finish_reason || undefined,
        usage: response.usage
          ? {
              prompt_tokens: response.usage.prompt_tokens,
              completion_tokens: response.usage.completion_tokens,
              total_tokens: response.usage.total_tokens,
            }
          : undefined,
      },
      durationMs,
      true,
      undefined,
      userContext
    );

    logOpenAIRequest(logEntry).catch(console.error);

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Log the failed request
    const logEntry = createLogEntry(
      "chat",
      {
        model,
        messages: messages.map((m) => ({ role: m.role, content: m.content })),
        temperature,
        max_tokens,
      },
      {
        content: "",
      },
      durationMs,
      false,
      errorMessage,
      userContext
    );

    logOpenAIRequest(logEntry).catch(console.error);

    throw error;
  }
}

// ===========================================
// Itinerary Generation
// ===========================================

import { parseStructuredResponse } from "./structured-itinerary-parser";
import type {
  StructuredItineraryResponse,
  TripContext,
} from "@/types/structured-itinerary";

export async function generateItinerary(
  destination: string,
  startDate: string,
  endDate: string,
  travelers: number,
  preferences: {
    budget?: string;
    pace?: string;
    interests?: string[];
    travelStyle?: string;
  },
  additionalNotes?: string
): Promise<GeneratedItinerary> {
  const mode = getAIMode();

  const userContext = {
    destination,
    startDate,
    endDate,
    travelers,
    preferences,
    additionalNotes,
  };

  // Build the prompt
  const startDateObj = new Date(startDate);
  const endDateObj = new Date(endDate);
  const numberOfDays =
    Math.ceil(
      (endDateObj.getTime() - startDateObj.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

  const prompt = `Create a ${numberOfDays}-day travel itinerary for ${destination}.

Details:
- Dates: ${startDate} to ${endDate}
- Number of travelers: ${travelers}
- Budget level: ${preferences.budget || "moderate"}
- Pace: ${preferences.pace || "moderate"} (relaxed = 2-3 activities/day, moderate = 3-4, packed = 5+)
- Travel style: ${preferences.travelStyle || "mixed"}
- Interests: ${preferences.interests?.join(", ") || "general sightseeing, local food, culture"}
${additionalNotes ? `- Additional notes: ${additionalNotes}` : ""}

Create a realistic, day-by-day itinerary with specific times, locations, and activities.
Include breakfast, lunch, and dinner recommendations.
Consider travel time between locations.
Provide insider tips for each activity.`;

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPTS.itineraryGenerator },
    { role: "user" as const, content: prompt },
  ];

  // In test mode, try to replay from logs first
  if (mode === "test") {
    console.log("[AI] Test mode - checking for itinerary replay match...");
    const replayMatch = await findReplayMatch("itinerary", messages, userContext);

    if (replayMatch.found && replayMatch.entry) {
      console.log(
        `[AI] Replay match found! Type: ${replayMatch.matchType}, Score: ${replayMatch.matchScore}`
      );
      console.log(`[AI] Using cached itinerary from: ${replayMatch.entry.id}`);

      try {
        return JSON.parse(replayMatch.entry.response.content) as GeneratedItinerary;
      } catch {
        console.log("[AI] Failed to parse cached itinerary, calling OpenAI...");
      }
    }

    console.log("[AI] No replay match - calling OpenAI and saving response...");
  }

  // Call OpenAI (for prod, or test when no replay found)
  return callOpenAIItinerary(messages, userContext);
}

async function callOpenAIItinerary(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  userContext: Record<string, unknown>
): Promise<GeneratedItinerary> {
  const startTime = Date.now();
  const model = "gpt-4o-mini";
  const temperature = 0.7;
  const max_tokens = 4000;

  try {
    const response = await openai.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    const durationMs = Date.now() - startTime;

    if (!content) {
      throw new Error("Failed to generate itinerary");
    }

    // Log the request/response
    const logEntry = createLogEntry(
      "itinerary",
      {
        model,
        messages,
        temperature,
        max_tokens,
        response_format: { type: "json_object" },
      },
      {
        id: response.id,
        content,
        finish_reason: response.choices[0]?.finish_reason || undefined,
        usage: response.usage
          ? {
              prompt_tokens: response.usage.prompt_tokens,
              completion_tokens: response.usage.completion_tokens,
              total_tokens: response.usage.total_tokens,
            }
          : undefined,
      },
      durationMs,
      true,
      undefined,
      userContext
    );

    logOpenAIRequest(logEntry).catch(console.error);

    console.log(`[AI] OpenAI itinerary logged: ${logEntry.id}`);

    try {
      return JSON.parse(content) as GeneratedItinerary;
    } catch {
      throw new Error("Failed to parse itinerary response");
    }
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Log the failed request
    const logEntry = createLogEntry(
      "itinerary",
      {
        model,
        messages,
        temperature,
        max_tokens,
        response_format: { type: "json_object" },
      },
      {
        content: "",
      },
      durationMs,
      false,
      errorMessage,
      userContext
    );

    logOpenAIRequest(logEntry).catch(console.error);

    throw error;
  }
}

// ===========================================
// STRUCTURED Itinerary Generation (Phase 1)
// ===========================================
// Generates itineraries with OPTIONS per slot

export async function generateStructuredItinerary(
  context: TripContext
): Promise<StructuredItineraryResponse> {
  const mode = getAIMode();

  // Build the user prompt with trip context
  const prompt = buildStructuredItineraryPrompt(context);

  const messages = [
    { role: "system" as const, content: SYSTEM_PROMPTS.structuredItineraryGenerator },
    { role: "user" as const, content: prompt },
  ];

  const userContext = {
    ...context,
    isStructuredGeneration: true,
  };

  // In test mode, try to replay from logs first
  if (mode === "test") {
    console.log("[AI] Test mode - checking for structured itinerary replay match...");
    const replayMatch = await findReplayMatch("structured-itinerary", messages, userContext);

    if (replayMatch.found && replayMatch.entry) {
      console.log(
        `[AI] Replay match found! Type: ${replayMatch.matchType}, Score: ${replayMatch.matchScore}`
      );
      return parseStructuredResponse(replayMatch.entry.response.content);
    }

    console.log("[AI] No replay match - calling OpenAI for structured itinerary...");
  }

  return callOpenAIStructuredItinerary(messages, userContext);
}

function buildStructuredItineraryPrompt(context: TripContext): string {
  const startDate = new Date(context.startDate);
  const endDate = new Date(context.endDate);
  const numberOfDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const travelerInfo = context.travelers.children > 0
    ? `${context.travelers.adults} adults and ${context.travelers.children} children${
        context.travelers.childrenAges?.length
          ? ` (ages: ${context.travelers.childrenAges.join(", ")})`
          : ""
      }`
    : `${context.travelers.adults} adult${context.travelers.adults > 1 ? "s" : ""}`;

  const dietaryInfo = context.dietaryRestrictions?.length
    ? `\nDietary Restrictions: ${context.dietaryRestrictions.join(", ")} - MUST filter restaurant options accordingly.`
    : "";

  return `Create a ${numberOfDays}-day structured itinerary for ${context.destination}.

TRIP DETAILS:
- Dates: ${context.startDate} to ${context.endDate} (${numberOfDays} days)
- Travelers: ${travelerInfo}
- Trip Mode: ${context.tripMode || "couples"}
- Budget Level: ${context.budget}
- Pace: ${context.pace}
- Interests: ${context.interests.join(", ") || "general sightseeing, local food, culture"}${dietaryInfo}

REQUIREMENTS:
1. Generate ${numberOfDays} complete days
2. Each day needs: morning, lunch, afternoon, dinner slots (evening optional based on pace)
3. Provide 2-4 ranked OPTIONS for each slot
4. Include REAL venue names with approximate coordinates
5. For restaurants: respect dietary restrictions${dietaryInfo ? " (IMPORTANT!)" : ""}
6. Match budget level: ${context.budget === "budget" ? "$-$$" : context.budget === "luxury" ? "$$$-$$$$" : "$$-$$$"}
7. Adjust density for ${context.pace} pace

Generate the itinerary now in the exact format specified (---TEXT---, ---JSON---).`;
}

async function callOpenAIStructuredItinerary(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  userContext: Record<string, unknown>
): Promise<StructuredItineraryResponse> {
  const startTime = Date.now();
  const model = "gpt-4o-mini";
  const temperature = 0.7;
  const max_tokens = 8000; // Larger for structured output

  try {
    const response = await openai.chat.completions.create({
      model,
      messages,
      temperature,
      max_tokens,
    });

    const content = response.choices[0]?.message?.content;
    const durationMs = Date.now() - startTime;

    if (!content) {
      throw new Error("No response from OpenAI");
    }

    // Log the request/response
    const logEntry = createLogEntry(
      "structured-itinerary",
      {
        model,
        messages,
        temperature,
        max_tokens,
      },
      {
        id: response.id,
        content,
        finish_reason: response.choices[0]?.finish_reason || undefined,
        usage: response.usage
          ? {
              prompt_tokens: response.usage.prompt_tokens,
              completion_tokens: response.usage.completion_tokens,
              total_tokens: response.usage.total_tokens,
            }
          : undefined,
      },
      durationMs,
      true,
      undefined,
      userContext
    );

    logOpenAIRequest(logEntry).catch(console.error);

    console.log(`[AI] Structured itinerary generated in ${durationMs}ms, logged: ${logEntry.id}`);

    // Parse the structured response
    return parseStructuredResponse(content);
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Log the failed request
    const logEntry = createLogEntry(
      "structured-itinerary",
      {
        model,
        messages,
        temperature,
        max_tokens,
      },
      {
        content: "",
      },
      durationMs,
      false,
      errorMessage,
      userContext
    );

    logOpenAIRequest(logEntry).catch(console.error);

    // Return error response
    return {
      message: "I encountered an error generating your itinerary. Please try again.",
      itinerary: null,
      metadata: {
        generatedAt: new Date().toISOString(),
        hasPlaces: false,
        hasCommute: false,
        hasFoodPreferences: false,
        totalDays: 0,
        totalSlots: 0,
        totalOptions: 0,
      },
      parseError: errorMessage,
    };
  }
}

// ===========================================
// Utility Functions
// ===========================================

export function getAIModeInfo(): {
  mode: AIMode;
  description: string;
  features: string[];
} {
  const mode = getAIMode();

  if (mode === "test") {
    return {
      mode: "test",
      description: "Test mode - replays from logs when possible, saves new responses",
      features: [
        "Checks logs for matching requests",
        "Returns cached responses to save API costs",
        "Falls back to OpenAI when no match found",
        "Saves all new responses for future replay",
      ],
    };
  }

  return {
    mode: "prod",
    description: "Production mode - all requests go to OpenAI",
    features: [
      "Direct OpenAI API calls",
      "Responses are logged for future replay",
      "No replay matching",
    ],
  };
}

// ===========================================
// Viator Integration - Function Calling
// ===========================================

export const VIATOR_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = [
  {
    type: "function",
    function: {
      name: "search_activities",
      description: "Search for bookable tours, activities, and experiences in a destination. Use this when the user asks about things to do, activities, tours, or experiences in a specific location.",
      parameters: {
        type: "object",
        properties: {
          destination: {
            type: "string",
            description: "The destination city or location to search for activities (e.g., 'Paris', 'Tokyo', 'New York')",
          },
          category: {
            type: "string",
            enum: ["tours", "day_trips", "food_tours", "cultural_tours", "outdoor_activities", "water_sports", "museums", "nightlife", "adventure", "family_friendly"],
            description: "Optional category to filter activities",
          },
          count: {
            type: "number",
            description: "Number of activities to return (default: 5, max: 10)",
          },
        },
        required: ["destination"],
      },
    },
  },
];

export interface ViatorFunctionResult {
  destination: string;
  activities: ReturnType<typeof viatorProductToActivity>[];
  totalCount: number;
}

export async function executeViatorFunction(
  functionName: string,
  args: Record<string, unknown>
): Promise<ViatorFunctionResult | null> {
  if (functionName === "search_activities") {
    const destination = args.destination as string;
    const category = args.category as string | undefined;
    const count = Math.min((args.count as number) || 5, 10);

    try {
      const searchParams: ViatorSearchParams = {
        destName: destination,
        count,
        sortOrder: "TRAVELER_RATING",
      };

      // Map category to tag if provided
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
      console.error("Viator function error:", error);
      return null;
    }
  }

  return null;
}

// ===========================================
// Chat with Viator Integration
// ===========================================

export interface ChatResponseWithActivities {
  content: string;
  activities?: ReturnType<typeof viatorProductToActivity>[];
  destination?: string;
}

export async function generateChatResponseWithViator(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  userContext?: Record<string, unknown>
): Promise<ChatResponseWithActivities> {
  const mode = getAIMode();

  // In test mode, try to replay from logs first
  if (mode === "test") {
    console.log("[AI] Test mode - checking for replay match...");
    const replayMatch = await findReplayMatch("chat", messages, userContext);

    if (replayMatch.found && replayMatch.entry) {
      console.log(
        `[AI] Replay match found! Type: ${replayMatch.matchType}, Score: ${replayMatch.matchScore}`
      );
      console.log(`[AI] Using cached response from: ${replayMatch.entry.id}`);
      return { content: replayMatch.entry.response.content };
    }

    console.log("[AI] No replay match - calling OpenAI with Viator tools...");
  }

  return callOpenAIChatWithViator(messages, userContext);
}

async function callOpenAIChatWithViator(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  userContext?: Record<string, unknown>
): Promise<ChatResponseWithActivities> {
  const startTime = Date.now();
  const model = "gpt-4o-mini";
  const temperature = 0.7;
  const max_tokens = 1000;

  const systemPrompt = `${SYSTEM_PROMPTS.travelPlanner}

IMPORTANT: When users ask about activities, tours, or things to do in a destination, use the search_activities function to get real, bookable experiences. After receiving results, present 3-5 top activities with their names, descriptions, prices, and ratings. Let the user know they can book these directly.

When presenting activities, format them nicely and include:
- Activity name
- Brief description
- Price (if available)
- Rating and review count
- Duration

Always mention that these are real bookable experiences powered by Viator.`;

  const requestMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
    { role: "system", content: systemPrompt },
    ...messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    })),
  ];

  try {
    // First call with tools
    const response = await openai.chat.completions.create({
      model,
      messages: requestMessages,
      temperature,
      max_tokens,
      tools: VIATOR_TOOLS,
      tool_choice: "auto",
    });

    const message = response.choices[0]?.message;

    // Check if the model wants to call a function
    if (message?.tool_calls && message.tool_calls.length > 0) {
      const toolCall = message.tool_calls[0];
      // Access function properties safely
      const toolCallAny = toolCall as { function?: { name: string; arguments: string }; id: string };
      const functionName = toolCallAny.function?.name || "";
      const functionArgs = JSON.parse(toolCallAny.function?.arguments || "{}");

      console.log(`[AI] Function call: ${functionName}`, functionArgs);

      // Execute the Viator function
      const functionResult = await executeViatorFunction(functionName, functionArgs);

      if (functionResult) {
        // Call OpenAI again with the function result
        const followUpMessages: OpenAI.Chat.Completions.ChatCompletionMessageParam[] = [
          ...requestMessages,
          message,
          {
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify(functionResult),
          },
        ];

        const followUpResponse = await openai.chat.completions.create({
          model,
          messages: followUpMessages,
          temperature,
          max_tokens: 1500,
        });

        const finalContent =
          followUpResponse.choices[0]?.message?.content ||
          "I found some activities but had trouble presenting them.";

        const durationMs = Date.now() - startTime;

        // Log the request/response
        const logEntry = createLogEntry(
          "chat",
          {
            model,
            messages: messages.map(m => ({ role: m.role, content: m.content })),
            temperature,
            max_tokens,
          },
          {
            id: followUpResponse.id,
            content: finalContent,
            finish_reason: followUpResponse.choices[0]?.finish_reason || undefined,
            usage: followUpResponse.usage
              ? {
                  prompt_tokens: followUpResponse.usage.prompt_tokens,
                  completion_tokens: followUpResponse.usage.completion_tokens,
                  total_tokens: followUpResponse.usage.total_tokens,
                }
              : undefined,
          },
          durationMs,
          true,
          undefined,
          { ...userContext, viatorResults: functionResult.totalCount }
        );

        logOpenAIRequest(logEntry).catch(console.error);

        return {
          content: finalContent,
          activities: functionResult.activities,
          destination: functionResult.destination,
        };
      }
    }

    // No function call, return regular response
    const content =
      message?.content || "I apologize, I couldn't generate a response.";
    const durationMs = Date.now() - startTime;

    // Log the request/response
    const logEntry = createLogEntry(
      "chat",
      {
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature,
        max_tokens,
      },
      {
        id: response.id,
        content,
        finish_reason: response.choices[0]?.finish_reason || undefined,
        usage: response.usage
          ? {
              prompt_tokens: response.usage.prompt_tokens,
              completion_tokens: response.usage.completion_tokens,
              total_tokens: response.usage.total_tokens,
            }
          : undefined,
      },
      durationMs,
      true,
      undefined,
      userContext
    );

    logOpenAIRequest(logEntry).catch(console.error);

    return { content };
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";

    // Log the failed request
    const logEntry = createLogEntry(
      "chat",
      {
        model,
        messages: messages.map(m => ({ role: m.role, content: m.content })),
        temperature,
        max_tokens,
      },
      {
        content: "",
      },
      durationMs,
      false,
      errorMessage,
      userContext
    );

    logOpenAIRequest(logEntry).catch(console.error);

    throw error;
  }
}
