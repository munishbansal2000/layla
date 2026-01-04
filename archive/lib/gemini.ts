import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { getAIMode, getAIProvider, type AIProvider } from "./llm";
import { SYSTEM_PROMPTS } from "./prompts";
import {
  logOpenAIRequest,
  createLogEntry,
  findReplayMatch,
} from "./openai-logger";
import { parseStructuredResponse } from "./structured-itinerary-parser";
import type {
  StructuredItineraryResponse,
  TripContext,
} from "@/types/structured-itinerary";

// ===========================================
// Gemini Client Configuration
// ===========================================

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Safety settings to allow travel planning content
const safetySettings = [
  {
    category: HarmCategory.HARM_CATEGORY_HARASSMENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
  {
    category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
    threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
  },
];

// ===========================================
// AI Provider Type (re-export from llm.ts)
// ===========================================

export type { AIProvider } from "./llm";
export { getAIProvider, getAIMode } from "./llm";

export function isGeminiProvider(): boolean {
  return getAIProvider() === "gemini";
}

export function isOllamaProvider(): boolean {
  return getAIProvider() === "ollama";
}

// ===========================================
// Gemini Chat Response Generation
// ===========================================

export async function generateGeminiChatResponse(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  userContext?: Record<string, unknown>
): Promise<string> {
  const mode = getAIMode();

  // In test mode, try to replay from logs first
  if (mode === "test") {
    console.log("[Gemini] Test mode - checking for replay match...");
    const replayMatch = await findReplayMatch("chat", messages, userContext);

    if (replayMatch.found && replayMatch.entry) {
      console.log(
        `[Gemini] Replay match found! Type: ${replayMatch.matchType}, Score: ${replayMatch.matchScore}`
      );
      console.log(`[Gemini] Using cached response from: ${replayMatch.entry.id}`);
      return replayMatch.entry.response.content;
    }

    console.log("[Gemini] No replay match - calling Gemini and saving response...");
  }

  return callGeminiChat(messages, userContext);
}

// Default model - use gemini-2.5-flash as it's available and performant
const GEMINI_MODEL = "gemini-2.5-flash";

async function callGeminiChat(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  userContext?: Record<string, unknown>
): Promise<string> {
  const startTime = Date.now();
  const model = GEMINI_MODEL;

  // Get the Gemini model
  const geminiModel = genAI.getGenerativeModel({
    model,
    safetySettings,
  });

  // Convert messages to Gemini format
  // Gemini uses "user" and "model" roles, and handles system prompts separately
  const systemPrompt = SYSTEM_PROMPTS.travelPlanner;

  // Build chat history from messages
  const chatHistory = messages.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }],
  }));

  try {
    // Start a chat with system instruction
    const chat = geminiModel.startChat({
      history: chatHistory.slice(0, -1), // All but last message
      generationConfig: {
        temperature: 0.7,
        maxOutputTokens: 1000,
      },
      systemInstruction: systemPrompt,
    });

    // Send the last message and get response
    const lastMessage = messages[messages.length - 1];
    const result = await chat.sendMessage(lastMessage.content);
    const response = result.response;
    const content = response.text() || "I apologize, I couldn't generate a response.";

    const durationMs = Date.now() - startTime;

    // Log the request/response (reusing OpenAI logger for consistency)
    const logEntry = createLogEntry(
      "chat",
      {
        model,
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: 0.7,
        max_tokens: 1000,
      },
      {
        id: `gemini-${Date.now()}`,
        content,
        finish_reason: "stop",
        usage: {
          prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
          completion_tokens: response.usageMetadata?.candidatesTokenCount || 0,
          total_tokens: response.usageMetadata?.totalTokenCount || 0,
        },
      },
      durationMs,
      true,
      undefined,
      { ...userContext, provider: "gemini" }
    );

    logOpenAIRequest(logEntry).catch(console.error);

    console.log(`[Gemini] Response logged: ${logEntry.id}`);
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
        messages: [{ role: "system", content: systemPrompt }, ...messages],
        temperature: 0.7,
        max_tokens: 1000,
      },
      {
        content: "",
      },
      durationMs,
      false,
      errorMessage,
      { ...userContext, provider: "gemini" }
    );

    logOpenAIRequest(logEntry).catch(console.error);

    throw error;
  }
}

// ===========================================
// Gemini Itinerary Generation
// ===========================================

export interface GeminiGeneratedItinerary {
  title: string;
  days: Array<{
    dayNumber: number;
    title: string;
    activities: Array<{
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
    }>;
  }>;
  tips: string[];
  estimatedBudget: {
    low: number;
    high: number;
    currency: string;
  };
}

export async function generateGeminiItinerary(
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
): Promise<GeminiGeneratedItinerary> {
  const mode = getAIMode();

  const userContext = {
    destination,
    startDate,
    endDate,
    travelers,
    preferences,
    additionalNotes,
    provider: "gemini",
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
Provide insider tips for each activity.

IMPORTANT: Respond ONLY with valid JSON, no markdown, no code blocks, just pure JSON.`;

  const messages = [
    { role: "user" as const, content: prompt },
  ];

  // In test mode, try to replay from logs first
  if (mode === "test") {
    console.log("[Gemini] Test mode - checking for itinerary replay match...");
    const replayMatch = await findReplayMatch("itinerary", messages, userContext);

    if (replayMatch.found && replayMatch.entry) {
      console.log(
        `[Gemini] Replay match found! Type: ${replayMatch.matchType}, Score: ${replayMatch.matchScore}`
      );
      console.log(`[Gemini] Using cached itinerary from: ${replayMatch.entry.id}`);

      try {
        return JSON.parse(replayMatch.entry.response.content) as GeminiGeneratedItinerary;
      } catch {
        console.log("[Gemini] Failed to parse cached itinerary, calling Gemini...");
      }
    }

    console.log("[Gemini] No replay match - calling Gemini and saving response...");
  }

  return callGeminiItinerary(prompt, userContext);
}

async function callGeminiItinerary(
  prompt: string,
  userContext: Record<string, unknown>
): Promise<GeminiGeneratedItinerary> {
  const startTime = Date.now();
  const model = GEMINI_MODEL;

  const geminiModel = genAI.getGenerativeModel({
    model,
    safetySettings,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 4000,
      responseMimeType: "application/json",
    },
  });

  const systemPrompt = SYSTEM_PROMPTS.itineraryGenerator;

  try {
    const result = await geminiModel.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: systemPrompt,
    });

    const response = result.response;
    const content = response.text();
    const durationMs = Date.now() - startTime;

    if (!content) {
      throw new Error("Failed to generate itinerary");
    }

    // Log the request/response
    const logEntry = createLogEntry(
      "itinerary",
      {
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 4000,
      },
      {
        id: `gemini-${Date.now()}`,
        content,
        finish_reason: "stop",
        usage: {
          prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
          completion_tokens: response.usageMetadata?.candidatesTokenCount || 0,
          total_tokens: response.usageMetadata?.totalTokenCount || 0,
        },
      },
      durationMs,
      true,
      undefined,
      userContext
    );

    logOpenAIRequest(logEntry).catch(console.error);

    console.log(`[Gemini] Itinerary logged: ${logEntry.id}`);

    try {
      return JSON.parse(content) as GeminiGeneratedItinerary;
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
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 4000,
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
// Gemini Structured Itinerary Generation
// ===========================================

export async function generateGeminiStructuredItinerary(
  context: TripContext
): Promise<StructuredItineraryResponse> {
  const mode = getAIMode();

  const prompt = buildGeminiStructuredItineraryPrompt(context);

  const messages = [
    { role: "user" as const, content: prompt },
  ];

  const userContext = {
    ...context,
    isStructuredGeneration: true,
    provider: "gemini",
  };

  // In test mode, try to replay from logs first
  if (mode === "test") {
    console.log("[Gemini] Test mode - checking for structured itinerary replay match...");
    const replayMatch = await findReplayMatch("structured-itinerary", messages, userContext);

    if (replayMatch.found && replayMatch.entry) {
      console.log(
        `[Gemini] Replay match found! Type: ${replayMatch.matchType}, Score: ${replayMatch.matchScore}`
      );
      return parseStructuredResponse(replayMatch.entry.response.content);
    }

    console.log("[Gemini] No replay match - calling Gemini for structured itinerary...");
  }

  return callGeminiStructuredItinerary(prompt, userContext);
}

function buildGeminiStructuredItineraryPrompt(context: TripContext): string {
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

async function callGeminiStructuredItinerary(
  prompt: string,
  userContext: Record<string, unknown>
): Promise<StructuredItineraryResponse> {
  const startTime = Date.now();
  const model = GEMINI_MODEL;

  // For Gemini, use JSON mode directly for more reliable structured output
  const geminiModel = genAI.getGenerativeModel({
    model,
    safetySettings,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 8000,
      responseMimeType: "application/json",
    },
  });

  // Modified system prompt for Gemini's JSON mode (no text markers needed)
  const systemPrompt = `You are an expert travel itinerary generator. Create detailed, realistic travel itineraries with MULTIPLE OPTIONS per time slot.

Return a JSON object with this structure:
{
  "message": "A friendly 2-3 paragraph summary of the itinerary describing highlights and why this plan works well.",
  "destination": "City Name",
  "country": "Country Name",
  "days": [
    {
      "dayNumber": 1,
      "date": "YYYY-MM-DD",
      "city": "City Name",
      "title": "Theme for the day",
      "slots": [
        {
          "slotId": "day1-morning",
          "slotType": "morning",
          "timeRange": { "start": "09:00", "end": "12:00" },
          "options": [
            {
              "id": "opt-1",
              "rank": 1,
              "score": 85,
              "activity": {
                "name": "Activity Name",
                "description": "2-3 sentences about what you'll experience.",
                "category": "temple|museum|park|restaurant|landmark|neighborhood|market|viewpoint",
                "duration": 120,
                "place": {
                  "name": "Exact Venue Name",
                  "address": "Full street address",
                  "neighborhood": "Neighborhood Name",
                  "coordinates": { "lat": 35.6762, "lng": 139.6503 }
                },
                "isFree": false,
                "estimatedCost": { "amount": 15, "currency": "USD" },
                "tags": ["family-friendly", "indoor", "cultural"],
                "source": "ai"
              },
              "matchReasons": ["Why this is recommended"],
              "tradeoffs": ["Any considerations"]
            }
          ]
        }
      ]
    }
  ],
  "generalTips": ["Travel tips"],
  "estimatedBudget": {
    "total": { "min": 500, "max": 800 },
    "currency": "USD"
  }
}

TIME SLOTS:
- morning: 09:00-12:00 (sightseeing)
- lunch: 12:00-14:00 (restaurants only)
- afternoon: 14:00-18:00 (activities)
- dinner: 18:00-20:00 (restaurants only)
- evening: 20:00-22:00 (optional)

Provide 2-3 OPTIONS per slot. Use real venue names and approximate coordinates.`;

  try {
    const result = await geminiModel.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      systemInstruction: systemPrompt,
    });

    const response = result.response;
    const content = response.text();
    const durationMs = Date.now() - startTime;

    if (!content) {
      throw new Error("No response from Gemini");
    }

    // Log the request/response
    const logEntry = createLogEntry(
      "structured-itinerary",
      {
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 8000,
      },
      {
        id: `gemini-${Date.now()}`,
        content,
        finish_reason: "stop",
        usage: {
          prompt_tokens: response.usageMetadata?.promptTokenCount || 0,
          completion_tokens: response.usageMetadata?.candidatesTokenCount || 0,
          total_tokens: response.usageMetadata?.totalTokenCount || 0,
        },
      },
      durationMs,
      true,
      undefined,
      userContext
    );

    logOpenAIRequest(logEntry).catch(console.error);

    console.log(`[Gemini] Structured itinerary generated in ${durationMs}ms, logged: ${logEntry.id}`);

    // Parse the JSON response directly from Gemini
    return parseGeminiStructuredResponse(content);
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    // Log the failed request
    const logEntry = createLogEntry(
      "structured-itinerary",
      {
        model,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 8000,
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

/**
 * Parse Gemini's JSON response into StructuredItineraryResponse
 * This handles Gemini's direct JSON output format
 */
function parseGeminiStructuredResponse(jsonContent: string): StructuredItineraryResponse {
  try {
    // Try direct parse first
    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(jsonContent);
    } catch {
      // Try to repair JSON if direct parse fails
      const repaired = repairGeminiJson(jsonContent);
      parsed = JSON.parse(repaired);
    }

    // Extract message
    const message = (parsed.message as string) ||
      "Here's your personalized itinerary! I've created options for each time slot.";

    // Build the itinerary data
    const itinerary = {
      destination: (parsed.destination as string) || "Unknown",
      country: parsed.country as string | undefined,
      days: transformGeminiDays(parsed.days as unknown[]),
      generalTips: parsed.generalTips as string[] | undefined,
      estimatedBudget: parsed.estimatedBudget as { total: { min: number; max: number }; currency: string } | undefined,
    };

    // Calculate metadata
    let totalSlots = 0;
    let totalOptions = 0;
    let hasPlaces = false;

    for (const day of itinerary.days) {
      for (const slot of day.slots) {
        totalSlots++;
        totalOptions += slot.options.length;
        for (const option of slot.options) {
          if (option.activity.place?.coordinates?.lat) {
            hasPlaces = true;
          }
        }
      }
    }

    return {
      message,
      itinerary,
      metadata: {
        generatedAt: new Date().toISOString(),
        hasPlaces,
        hasCommute: false,
        hasFoodPreferences: false,
        totalDays: itinerary.days.length,
        totalSlots,
        totalOptions,
      },
    };
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : "Unknown error";
    console.error("[Gemini] Failed to parse structured response:", errorMsg);

    // Fall back to the original parser as last resort
    return parseStructuredResponse(`---TEXT---\nHere's your itinerary.\n---END_TEXT---\n\n---JSON---\n${jsonContent}\n---END_JSON---`);
  }
}

/**
 * Repair common Gemini JSON issues
 */
function repairGeminiJson(jsonStr: string): string {
  let repaired = jsonStr.trim();

  // Remove trailing commas before } or ]
  repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

  // Balance braces
  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  for (let i = 0; i < openBraces - closeBraces; i++) {
    repaired += '}';
  }

  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    repaired += ']';
  }

  return repaired;
}

/**
 * Transform Gemini days format to our internal format
 */
function transformGeminiDays(days: unknown[]): Array<{
  dayNumber: number;
  date: string;
  city: string;
  title: string;
  slots: Array<{
    slotId: string;
    slotType: "morning" | "breakfast" | "lunch" | "afternoon" | "dinner" | "evening";
    timeRange: { start: string; end: string };
    options: Array<{
      id: string;
      rank: number;
      score: number;
      activity: {
        name: string;
        description: string;
        category: string;
        duration: number;
        place: { name: string; address: string; neighborhood: string; coordinates: { lat: number; lng: number } } | null;
        isFree: boolean;
        estimatedCost?: { amount: number; currency: string };
        tags: string[];
        source: "ai" | "yelp" | "viator" | "google-places" | "local-data" | "klook";
      };
      matchReasons: string[];
      tradeoffs: string[];
    }>;
    selectedOptionId: string | null;
  }>;
}> {
  if (!Array.isArray(days)) return [];

  return days.map((day: unknown) => {
    const d = day as Record<string, unknown>;
    return {
      dayNumber: (d.dayNumber as number) || 1,
      date: (d.date as string) || new Date().toISOString().split('T')[0],
      city: (d.city as string) || "Unknown",
      title: (d.title as string) || `Day ${d.dayNumber || 1}`,
      slots: transformGeminiSlots(d.slots as unknown[]),
    };
  });
}

function transformGeminiSlots(slots: unknown[]): Array<{
  slotId: string;
  slotType: "morning" | "breakfast" | "lunch" | "afternoon" | "dinner" | "evening";
  timeRange: { start: string; end: string };
  options: Array<{
    id: string;
    rank: number;
    score: number;
    activity: {
      name: string;
      description: string;
      category: string;
      duration: number;
      place: { name: string; address: string; neighborhood: string; coordinates: { lat: number; lng: number } } | null;
      isFree: boolean;
      estimatedCost?: { amount: number; currency: string };
      tags: string[];
      source: "ai" | "yelp" | "viator" | "google-places" | "local-data" | "klook";
    };
    matchReasons: string[];
    tradeoffs: string[];
  }>;
  selectedOptionId: string | null;
}> {
  if (!Array.isArray(slots)) return [];

  return slots.map((slot: unknown) => {
    const s = slot as Record<string, unknown>;
    const timeRange = s.timeRange as { start: string; end: string } || { start: "09:00", end: "12:00" };

    return {
      slotId: (s.slotId as string) || `slot-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      slotType: (s.slotType as "morning" | "breakfast" | "lunch" | "afternoon" | "dinner" | "evening") || "morning",
      timeRange,
      options: transformGeminiOptions(s.options as unknown[]),
      selectedOptionId: null,
    };
  });
}

function transformGeminiOptions(options: unknown[]): Array<{
  id: string;
  rank: number;
  score: number;
  activity: {
    name: string;
    description: string;
    category: string;
    duration: number;
    place: { name: string; address: string; neighborhood: string; coordinates: { lat: number; lng: number } } | null;
    isFree: boolean;
    estimatedCost?: { amount: number; currency: string };
    tags: string[];
    source: "ai" | "yelp" | "viator" | "google-places" | "local-data" | "klook";
  };
  matchReasons: string[];
  tradeoffs: string[];
}> {
  if (!Array.isArray(options)) return [];

  return options.map((option: unknown, index: number) => {
    const o = option as Record<string, unknown>;
    const activity = o.activity as Record<string, unknown> || {};
    const place = activity.place as Record<string, unknown> | null;
    const coords = place?.coordinates as { lat: number; lng: number } | null;

    return {
      id: (o.id as string) || `opt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      rank: (o.rank as number) || index + 1,
      score: (o.score as number) || 80,
      activity: {
        name: (activity.name as string) || "Activity",
        description: (activity.description as string) || "",
        category: (activity.category as string) || "attraction",
        duration: (activity.duration as number) || 120,
        place: place ? {
          name: (place.name as string) || "",
          address: (place.address as string) || "",
          neighborhood: (place.neighborhood as string) || "",
          coordinates: coords || { lat: 0, lng: 0 },
        } : null,
        isFree: (activity.isFree as boolean) || false,
        estimatedCost: activity.estimatedCost as { amount: number; currency: string } | undefined,
        tags: (activity.tags as string[]) || [],
        source: "ai" as const,
      },
      matchReasons: (o.matchReasons as string[]) || [],
      tradeoffs: (o.tradeoffs as string[]) || [],
    };
  });
}

// ===========================================
// Unified AI Interface
// ===========================================
// These functions automatically use the configured provider

export async function generateAIChatResponse(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  userContext?: Record<string, unknown>
): Promise<string> {
  const provider = getAIProvider();

  if (provider === "gemini") {
    return generateGeminiChatResponse(messages, userContext);
  }

  if (provider === "ollama") {
    // Import dynamically to avoid circular deps
    const { generateOllamaChatResponse } = await import("./ollama");
    return generateOllamaChatResponse(messages, userContext);
  }

  // Default: Import dynamically to avoid circular deps
  const { generateChatResponse } = await import("./openai");
  return generateChatResponse(messages, userContext);
}

export async function generateAIStructuredItinerary(
  context: TripContext
): Promise<StructuredItineraryResponse> {
  const provider = getAIProvider();

  if (provider === "gemini") {
    return generateGeminiStructuredItinerary(context);
  }

  if (provider === "ollama") {
    // Import dynamically to avoid circular deps
    const { generateOllamaStructuredItinerary } = await import("./ollama");
    return generateOllamaStructuredItinerary(context);
  }

  // Default: Import dynamically to avoid circular deps
  const { generateStructuredItinerary } = await import("./openai");
  return generateStructuredItinerary(context);
}

// ===========================================
// Provider Info
// ===========================================

export function getAIProviderInfo(): {
  provider: AIProvider;
  description: string;
  model: string;
} {
  const provider = getAIProvider();

  if (provider === "gemini") {
    return {
      provider: "gemini",
      description: "Google Gemini AI - using Gemini 2.5 Flash model",
      model: GEMINI_MODEL,
    };
  }

  if (provider === "ollama") {
    const ollamaModel = process.env.OLLAMA_MODEL || "qwen2.5:7b";
    return {
      provider: "ollama",
      description: `Ollama (Local) - using ${ollamaModel} model`,
      model: ollamaModel,
    };
  }

  return {
    provider: "openai",
    description: "OpenAI - using GPT-4o Mini model",
    model: "gpt-4o-mini",
  };
}
