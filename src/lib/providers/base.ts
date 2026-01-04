/**
 * Base Provider
 *
 * Abstract base class for all LLM providers.
 * Includes CachingProvider wrapper for automatic caching via openai-logger.
 */

import {
  logOpenAIRequest,
  createLogEntry,
  findReplayMatch,
} from "../openai-logger";
import { getSystemPrompt } from "../prompts";
import { parseStructuredResponse } from "../structured-itinerary-parser";
import type { TripContext, StructuredItineraryResponse } from "@/types/structured-itinerary";
import type {
  AIProvider,
  LLMProvider,
  ProviderCapabilities,
  ChatMessage,
  ChatOptions,
  ToolMessage,
  ChatWithToolsOptions,
  ChatWithToolsResponse,
  GeneratedItinerary,
  HealthCheckResult,
} from "./types";

// ===========================================
// Helper Functions
// ===========================================

export function getAIMode(): "prod" | "test" {
  const mode = process.env.AI_MODE?.toLowerCase();
  if (mode === "test" || mode === "development" || mode === "dev") {
    return "test";
  }
  return "prod";
}

// ===========================================
// Abstract Base Provider
// ===========================================

export abstract class BaseProvider implements LLMProvider {
  abstract readonly provider: AIProvider;
  abstract readonly capabilities: ProviderCapabilities;

  abstract getModel(): string;

  // Core abstract methods - each provider implements these
  protected abstract callChat(
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }>;

  protected abstract callChatWithTools(
    messages: ToolMessage[],
    options?: ChatWithToolsOptions
  ): Promise<ChatWithToolsResponse>;

  abstract checkHealth(): Promise<HealthCheckResult>;

  // ===========================================
  // Public API (with caching built-in)
  // ===========================================

  async chat(messages: ChatMessage[], options?: ChatOptions): Promise<string> {
    const globalMode = getAIMode();
    const startTime = Date.now();

    // Check for provider-specific mode override (e.g., OLLAMA_MODE=prod)
    const providerModeEnvVar = `${this.provider.toUpperCase()}_MODE`;
    const providerMode = process.env[providerModeEnvVar];
    const mode = providerMode || globalMode;

    // Build full messages with system prompt
    const allMessages = this.buildMessagesWithSystem(messages, options?.systemPrompt);

    // In test mode, try cache first (unless provider has its own mode override)
    if (mode === "test") {
      console.log(`[${this.provider}] Test mode - checking for replay match...`);
      const replayMatch = await findReplayMatch("chat", allMessages, {
        provider: this.provider,
        jsonMode: options?.jsonMode,
      });

      if (replayMatch.found && replayMatch.entry) {
        console.log(`[${this.provider}] Replay match found! Using cached response.`);
        return replayMatch.entry.response.content;
      }
      console.log(`[${this.provider}] No replay match - calling API...`);
    }

    // Log request details (always, so we can see what's being sent)
    console.log(`\n[${this.provider}] ========== REQUEST ==========`);
    console.log(`[${this.provider}] Model: ${this.getModel()}`);
    console.log(`[${this.provider}] Messages: ${allMessages.length} total`);
    allMessages.forEach((msg, i) => {
      const contentPreview = msg.content.length > 200
        ? msg.content.substring(0, 200) + '...'
        : msg.content;
      console.log(`[${this.provider}]   [${i}] ${msg.role}: "${contentPreview.replace(/\n/g, '\\n')}"`);
    });
    console.log(`[${this.provider}] Options: temp=${options?.temperature ?? 0.7}, maxTokens=${options?.maxTokens ?? 1000}, jsonMode=${options?.jsonMode ?? false}`);
    console.log(`[${this.provider}] ==============================\n`);

    // Call the actual API
    try {
      const result = await this.callChat(allMessages, options);
      const durationMs = Date.now() - startTime;

      // Log for future replay
      const logEntry = createLogEntry(
        "chat",
        {
          model: this.getModel(),
          messages: allMessages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 1000,
        },
        {
          id: `${this.provider}-${Date.now()}`,
          content: result.content,
          finish_reason: "stop",
          usage: result.usage ? {
            prompt_tokens: result.usage.promptTokens,
            completion_tokens: result.usage.completionTokens,
            total_tokens: result.usage.totalTokens,
          } : undefined,
        },
        durationMs,
        true,
        undefined,
        { provider: this.provider, jsonMode: options?.jsonMode }
      );

      logOpenAIRequest(logEntry).catch(console.error);
      console.log(`[${this.provider}] Response logged: ${logEntry.id}`);

      // Log response details
      console.log(`\n[${this.provider}] ========== RESPONSE ==========`);
      console.log(`[${this.provider}] Duration: ${durationMs}ms`);
      if (result.usage) {
        console.log(`[${this.provider}] Tokens: prompt=${result.usage.promptTokens}, completion=${result.usage.completionTokens}, total=${result.usage.totalTokens}`);
      }
      const responsePreview = result.content.length > 500
        ? result.content.substring(0, 500) + '...'
        : result.content;
      console.log(`[${this.provider}] Content: "${responsePreview.replace(/\n/g, '\\n')}"`);
      console.log(`[${this.provider}] ===============================\n`);

      return result.content;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // Log failed request
      const logEntry = createLogEntry(
        "chat",
        {
          model: this.getModel(),
          messages: allMessages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 1000,
        },
        { content: "" },
        durationMs,
        false,
        errorMessage,
        { provider: this.provider }
      );

      logOpenAIRequest(logEntry).catch(console.error);
      throw error;
    }
  }

  async generateJSON<T>(prompt: string, options?: ChatOptions): Promise<T> {
    const response = await this.chat(
      [{ role: "user", content: prompt }],
      { ...options, jsonMode: true }
    );

    try {
      return JSON.parse(response) as T;
    } catch {
      // Try to extract JSON from response
      const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/) ||
                        response.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const jsonStr = jsonMatch[1] || jsonMatch[0];
        return JSON.parse(jsonStr.trim()) as T;
      }
      throw new Error("Failed to parse JSON response");
    }
  }

  async generateItinerary(
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
    const startTime = Date.now();

    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    const numberOfDays = Math.ceil(
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

    const messages: ChatMessage[] = [
      { role: "system", content: getSystemPrompt("itineraryGenerator", this.provider) },
      { role: "user", content: prompt },
    ];

    const userContext = {
      destination,
      startDate,
      endDate,
      travelers,
      preferences,
      additionalNotes,
      provider: this.provider,
    };

    // In test mode, try cache first
    if (mode === "test") {
      console.log(`[${this.provider}] Test mode - checking for itinerary replay...`);
      const replayMatch = await findReplayMatch("itinerary", messages, userContext);

      if (replayMatch.found && replayMatch.entry) {
        console.log(`[${this.provider}] Replay match found for itinerary!`);
        try {
          return JSON.parse(replayMatch.entry.response.content) as GeneratedItinerary;
        } catch {
          console.log(`[${this.provider}] Failed to parse cached itinerary, calling API...`);
        }
      }
    }

    // Call API
    try {
      const result = await this.callChat(messages, { jsonMode: true, maxTokens: 4000 });
      const durationMs = Date.now() - startTime;

      // Log for future replay
      const logEntry = createLogEntry(
        "itinerary",
        {
          model: this.getModel(),
          messages,
          temperature: 0.7,
          max_tokens: 4000,
        },
        {
          id: `${this.provider}-${Date.now()}`,
          content: result.content,
          finish_reason: "stop",
          usage: result.usage ? {
            prompt_tokens: result.usage.promptTokens,
            completion_tokens: result.usage.completionTokens,
            total_tokens: result.usage.totalTokens,
          } : undefined,
        },
        durationMs,
        true,
        undefined,
        userContext
      );

      logOpenAIRequest(logEntry).catch(console.error);

      return JSON.parse(result.content) as GeneratedItinerary;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      const logEntry = createLogEntry(
        "itinerary",
        { model: this.getModel(), messages, temperature: 0.7, max_tokens: 4000 },
        { content: "" },
        durationMs,
        false,
        errorMessage,
        userContext
      );

      logOpenAIRequest(logEntry).catch(console.error);
      throw error;
    }
  }

  async generateStructuredItinerary(
    context: TripContext
  ): Promise<StructuredItineraryResponse> {
    const mode = getAIMode();
    const startTime = Date.now();

    const prompt = this.buildStructuredItineraryPrompt(context);
    const messages: ChatMessage[] = [
      { role: "system", content: getSystemPrompt("structuredItineraryGenerator", this.provider) },
      { role: "user", content: prompt },
    ];

    const userContext = {
      ...context,
      isStructuredGeneration: true,
      provider: this.provider,
    };

    // In test mode, try cache first
    if (mode === "test") {
      console.log(`[${this.provider}] Test mode - checking for structured itinerary replay...`);
      const replayMatch = await findReplayMatch("structured-itinerary", messages, userContext);

      if (replayMatch.found && replayMatch.entry) {
        console.log(`[${this.provider}] Replay match found for structured itinerary!`);
        return parseStructuredResponse(replayMatch.entry.response.content);
      }
    }

    // Call API
    try {
      const result = await this.callChat(messages, { maxTokens: 8000 });
      const durationMs = Date.now() - startTime;

      // Log for future replay
      const logEntry = createLogEntry(
        "structured-itinerary",
        {
          model: this.getModel(),
          messages,
          temperature: 0.7,
          max_tokens: 8000,
        },
        {
          id: `${this.provider}-${Date.now()}`,
          content: result.content,
          finish_reason: "stop",
          usage: result.usage ? {
            prompt_tokens: result.usage.promptTokens,
            completion_tokens: result.usage.completionTokens,
            total_tokens: result.usage.totalTokens,
          } : undefined,
        },
        durationMs,
        true,
        undefined,
        userContext
      );

      logOpenAIRequest(logEntry).catch(console.error);
      console.log(`[${this.provider}] Structured itinerary generated in ${durationMs}ms`);

      return parseStructuredResponse(result.content);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      const logEntry = createLogEntry(
        "structured-itinerary",
        { model: this.getModel(), messages, temperature: 0.7, max_tokens: 8000 },
        { content: "" },
        durationMs,
        false,
        errorMessage,
        userContext
      );

      logOpenAIRequest(logEntry).catch(console.error);

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

  async chatWithTools(
    messages: ToolMessage[],
    options?: ChatWithToolsOptions
  ): Promise<ChatWithToolsResponse> {
    const mode = getAIMode();
    const startTime = Date.now();

    // Convert for logging
    const logMessages = messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    // In test mode, try cache first
    if (mode === "test") {
      console.log(`[${this.provider}] Test mode - checking for tool chat replay...`);
      const replayMatch = await findReplayMatch("chat", logMessages, {
        provider: this.provider,
        hasTools: !!options?.tools?.length,
      });

      if (replayMatch.found && replayMatch.entry) {
        console.log(`[${this.provider}] Replay match found for tool chat!`);
        return {
          content: replayMatch.entry.response.content,
          finishReason: "stop",
          usage: replayMatch.entry.response.usage ? {
            promptTokens: replayMatch.entry.response.usage.prompt_tokens,
            completionTokens: replayMatch.entry.response.usage.completion_tokens,
            totalTokens: replayMatch.entry.response.usage.total_tokens,
          } : undefined,
        };
      }
    }

    // Call API
    try {
      const response = await this.callChatWithTools(messages, options);
      const durationMs = Date.now() - startTime;

      // Log for future replay
      const logEntry = createLogEntry(
        "chat",
        {
          model: this.getModel(),
          messages: logMessages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 4000,
        },
        {
          id: `${this.provider}-${Date.now()}`,
          content: response.content,
          finish_reason: response.finishReason,
          usage: response.usage ? {
            prompt_tokens: response.usage.promptTokens,
            completion_tokens: response.usage.completionTokens,
            total_tokens: response.usage.totalTokens,
          } : undefined,
        },
        durationMs,
        true,
        undefined,
        {
          provider: this.provider,
          hasTools: !!options?.tools?.length,
          toolCallCount: response.toolCalls?.length || 0,
        }
      );

      logOpenAIRequest(logEntry).catch(console.error);

      return response;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      const logEntry = createLogEntry(
        "chat",
        {
          model: this.getModel(),
          messages: logMessages,
          temperature: options?.temperature ?? 0.7,
          max_tokens: options?.maxTokens ?? 4000,
        },
        { content: "" },
        durationMs,
        false,
        errorMessage,
        { provider: this.provider }
      );

      logOpenAIRequest(logEntry).catch(console.error);
      throw error;
    }
  }

  // ===========================================
  // Helper Methods
  // ===========================================

  protected buildMessagesWithSystem(
    messages: ChatMessage[],
    systemPrompt?: string
  ): ChatMessage[] {
    const defaultSystemPrompt = getSystemPrompt("travelPlanner", this.provider);
    const effectiveSystemPrompt = systemPrompt || defaultSystemPrompt;

    // Check if first message is already system
    if (messages[0]?.role === "system") {
      return [
        { role: "system", content: effectiveSystemPrompt },
        ...messages.slice(1),
      ];
    }

    return [{ role: "system", content: effectiveSystemPrompt }, ...messages];
  }

  protected buildStructuredItineraryPrompt(context: TripContext): string {
    const startDate = new Date(context.startDate);
    const endDate = new Date(context.endDate);
    const numberOfDays = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    ) + 1;

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

  protected extractJsonFromResponse(content: string): string {
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

    return content.trim();
  }

  protected repairJson(jsonStr: string): string {
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

  protected generateToolCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

// ===========================================
// Provider Registry
// ===========================================

const providerRegistry: Map<AIProvider, () => LLMProvider> = new Map();
const providerCache: Map<AIProvider, LLMProvider> = new Map();

export function registerProvider(
  provider: AIProvider,
  factory: () => LLMProvider
): void {
  providerRegistry.set(provider, factory);
}

export function getProvider(provider: AIProvider): LLMProvider {
  // Check cache first
  const cached = providerCache.get(provider);
  if (cached) {
    return cached;
  }

  const factory = providerRegistry.get(provider);
  if (!factory) {
    throw new Error(`No provider registered for: ${provider}`);
  }

  const instance = factory();
  providerCache.set(provider, instance);
  return instance;
}

export function hasProvider(provider: AIProvider): boolean {
  return providerRegistry.has(provider);
}

/**
 * Clear the provider cache to force re-creation of providers.
 * Useful for testing when environment variables change.
 */
export function clearProviderCache(): void {
  providerCache.clear();
}
