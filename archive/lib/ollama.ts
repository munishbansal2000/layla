import OpenAI from "openai";
import { getAIMode } from "./llm";
import { getSystemPrompt } from "./prompts";
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
// Ollama Client Configuration
// ===========================================
// Ollama provides an OpenAI-compatible API at /v1

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b";

const ollama = new OpenAI({
  baseURL: OLLAMA_BASE_URL,
  apiKey: "ollama", // Required but not used by Ollama
});

// ===========================================
// Provider Check
// ===========================================

export function isOllamaProvider(): boolean {
  const provider = process.env.AI_PROVIDER?.toLowerCase();
  return provider === "ollama";
}

export function getOllamaModel(): string {
  return OLLAMA_MODEL;
}

// ===========================================
// Ollama Chat Response Generation
// ===========================================

export async function generateOllamaChatResponse(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  userContext?: Record<string, unknown>
): Promise<string> {
  const mode = getAIMode();

  // In test mode, try to replay from logs first
  if (mode === "test") {
    console.log("[Ollama] Test mode - checking for replay match...");
    const replayMatch = await findReplayMatch("chat", messages, userContext);

    if (replayMatch.found && replayMatch.entry) {
      console.log(
        `[Ollama] Replay match found! Type: ${replayMatch.matchType}, Score: ${replayMatch.matchScore}`
      );
      console.log(`[Ollama] Using cached response from: ${replayMatch.entry.id}`);
      return replayMatch.entry.response.content;
    }

    console.log("[Ollama] No replay match - calling Ollama and saving response...");
  }

  return callOllamaChat(messages, userContext);
}

async function callOllamaChat(
  messages: { role: "user" | "assistant" | "system"; content: string }[],
  userContext?: Record<string, unknown>
): Promise<string> {
  const startTime = Date.now();
  const model = OLLAMA_MODEL;

  const requestMessages = [
    { role: "system" as const, content: getSystemPrompt("travelPlanner", "ollama") },
    ...messages,
  ];

  try {
    const response = await ollama.chat.completions.create({
      model,
      messages: requestMessages,
      temperature: 0.7,
      max_tokens: 1000,
    });

    const content =
      response.choices[0]?.message?.content ||
      "I apologize, I couldn't generate a response.";
    const durationMs = Date.now() - startTime;

    // Log the request/response (reusing OpenAI logger for consistency)
    const logEntry = createLogEntry(
      "chat",
      {
        model,
        messages: requestMessages,
        temperature: 0.7,
        max_tokens: 1000,
      },
      {
        id: `ollama-${Date.now()}`,
        content,
        finish_reason: response.choices[0]?.finish_reason || "stop",
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
      { ...userContext, provider: "ollama", model }
    );

    logOpenAIRequest(logEntry).catch(console.error);

    console.log(`[Ollama] Response logged: ${logEntry.id}`);
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
        temperature: 0.7,
        max_tokens: 1000,
      },
      {
        content: "",
      },
      durationMs,
      false,
      errorMessage,
      { ...userContext, provider: "ollama", model }
    );

    logOpenAIRequest(logEntry).catch(console.error);

    throw error;
  }
}

// ===========================================
// Ollama Itinerary Generation
// ===========================================

export interface OllamaGeneratedItinerary {
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

export async function generateOllamaItinerary(
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
): Promise<OllamaGeneratedItinerary> {
  const mode = getAIMode();

  const userContext = {
    destination,
    startDate,
    endDate,
    travelers,
    preferences,
    additionalNotes,
    provider: "ollama",
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

  const messages = [{ role: "user" as const, content: prompt }];

  // In test mode, try to replay from logs first
  if (mode === "test") {
    console.log("[Ollama] Test mode - checking for itinerary replay match...");
    const replayMatch = await findReplayMatch("itinerary", messages, userContext);

    if (replayMatch.found && replayMatch.entry) {
      console.log(
        `[Ollama] Replay match found! Type: ${replayMatch.matchType}, Score: ${replayMatch.matchScore}`
      );
      console.log(`[Ollama] Using cached itinerary from: ${replayMatch.entry.id}`);

      try {
        return JSON.parse(replayMatch.entry.response.content) as OllamaGeneratedItinerary;
      } catch {
        console.log("[Ollama] Failed to parse cached itinerary, calling Ollama...");
      }
    }

    console.log("[Ollama] No replay match - calling Ollama and saving response...");
  }

  return callOllamaItinerary(prompt, userContext);
}

async function callOllamaItinerary(
  prompt: string,
  userContext: Record<string, unknown>
): Promise<OllamaGeneratedItinerary> {
  const startTime = Date.now();
  const model = OLLAMA_MODEL;

  try {
    const response = await ollama.chat.completions.create({
      model,
      messages: [
        { role: "system", content: getSystemPrompt("itineraryGenerator", "ollama") },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
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
        messages: [{ role: "user", content: prompt }],
        temperature: 0.7,
        max_tokens: 4000,
      },
      {
        id: `ollama-${Date.now()}`,
        content,
        finish_reason: response.choices[0]?.finish_reason || "stop",
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

    console.log(`[Ollama] Itinerary logged: ${logEntry.id}`);

    // Parse and return the JSON response
    try {
      // Try to extract JSON from the response (Ollama may include markdown)
      const jsonContent = extractJsonFromResponse(content);
      return JSON.parse(jsonContent) as OllamaGeneratedItinerary;
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
// Ollama Structured Itinerary Generation
// ===========================================

export async function generateOllamaStructuredItinerary(
  context: TripContext
): Promise<StructuredItineraryResponse> {
  const mode = getAIMode();

  const prompt = buildOllamaStructuredItineraryPrompt(context);

  const messages = [{ role: "user" as const, content: prompt }];

  const userContext = {
    ...context,
    isStructuredGeneration: true,
    provider: "ollama",
  };

  // In test mode, try to replay from logs first
  if (mode === "test") {
    console.log("[Ollama] Test mode - checking for structured itinerary replay match...");
    const replayMatch = await findReplayMatch("structured-itinerary", messages, userContext);

    if (replayMatch.found && replayMatch.entry) {
      console.log(
        `[Ollama] Replay match found! Type: ${replayMatch.matchType}, Score: ${replayMatch.matchScore}`
      );
      return parseStructuredResponse(replayMatch.entry.response.content);
    }

    console.log("[Ollama] No replay match - calling Ollama for structured itinerary...");
  }

  return callOllamaStructuredItinerary(prompt, userContext);
}

function buildOllamaStructuredItineraryPrompt(context: TripContext): string {
  const startDate = new Date(context.startDate);
  const endDate = new Date(context.endDate);
  const numberOfDays =
    Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)) + 1;

  const travelerInfo =
    context.travelers.children > 0
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

RESPONSE FORMAT:
Your response MUST follow this EXACT format with markers:

---TEXT---
[Write a friendly 2-3 paragraph summary describing the itinerary highlights]
---END_TEXT---

---JSON---
{
  "destination": "City Name",
  "country": "Country Name",
  "days": [
    {
      "dayNumber": 1,
      "date": "${context.startDate}",
      "city": "City Name",
      "title": "Day theme",
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
                "description": "Description of the activity",
                "category": "temple",
                "duration": 120,
                "place": {
                  "name": "Venue Name",
                  "address": "Full address",
                  "neighborhood": "Neighborhood",
                  "coordinates": { "lat": 35.6762, "lng": 139.6503 }
                },
                "isFree": false,
                "estimatedCost": { "amount": 15, "currency": "USD" },
                "tags": ["cultural", "indoor"],
                "source": "ai"
              },
              "matchReasons": ["Reason 1"],
              "tradeoffs": ["Tradeoff 1"]
            }
          ]
        }
      ]
    }
  ],
  "generalTips": ["Tip 1", "Tip 2"],
  "estimatedBudget": {
    "total": { "min": 500, "max": 800 },
    "currency": "USD"
  }
}
---END_JSON---

Generate the complete itinerary now.`;
}

async function callOllamaStructuredItinerary(
  prompt: string,
  userContext: Record<string, unknown>
): Promise<StructuredItineraryResponse> {
  const startTime = Date.now();
  const model = OLLAMA_MODEL;

  try {
    const response = await ollama.chat.completions.create({
      model,
      messages: [
        { role: "system", content: getSystemPrompt("structuredItineraryGenerator", "ollama") },
        { role: "user", content: prompt },
      ],
      temperature: 0.7,
      max_tokens: 8000,
    });

    const content = response.choices[0]?.message?.content;
    const durationMs = Date.now() - startTime;

    if (!content) {
      throw new Error("No response from Ollama");
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
        id: `ollama-${Date.now()}`,
        content,
        finish_reason: response.choices[0]?.finish_reason || "stop",
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

    console.log(`[Ollama] Structured itinerary generated in ${durationMs}ms, logged: ${logEntry.id}`);

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

// ===========================================
// Helper Functions
// ===========================================

/**
 * Extract JSON from a response that may contain markdown or other formatting
 */
function extractJsonFromResponse(content: string): string {
  // Try to find JSON in code blocks
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find JSON between braces
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  // Return as-is if no extraction needed
  return content.trim();
}

/**
 * Repair common JSON issues from local models
 */
export function repairOllamaJson(jsonStr: string): string {
  let repaired = jsonStr.trim();

  // Remove trailing commas before } or ]
  repaired = repaired.replace(/,(\s*[}\]])/g, "$1");

  // Balance braces
  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  for (let i = 0; i < openBraces - closeBraces; i++) {
    repaired += "}";
  }

  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    repaired += "]";
  }

  return repaired;
}

// ===========================================
// Ollama Health Check
// ===========================================

export async function checkOllamaHealth(): Promise<{
  available: boolean;
  models: string[];
  error?: string;
}> {
  try {
    // Try to list models
    const response = await fetch(`${OLLAMA_BASE_URL.replace("/v1", "")}/api/tags`);

    if (!response.ok) {
      return {
        available: false,
        models: [],
        error: `Ollama returned status ${response.status}`,
      };
    }

    const data = (await response.json()) as { models?: Array<{ name: string }> };
    const models = data.models?.map((m) => m.name) || [];

    return {
      available: true,
      models,
    };
  } catch (error) {
    return {
      available: false,
      models: [],
      error: error instanceof Error ? error.message : "Failed to connect to Ollama",
    };
  }
}

// ===========================================
// Provider Info
// ===========================================

export function getOllamaProviderInfo(): {
  provider: "ollama";
  description: string;
  model: string;
  baseUrl: string;
} {
  return {
    provider: "ollama",
    description: `Ollama (Local) - using ${OLLAMA_MODEL} model`,
    model: OLLAMA_MODEL,
    baseUrl: OLLAMA_BASE_URL,
  };
}
