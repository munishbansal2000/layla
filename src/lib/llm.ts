/**
 * Unified LLM Interface
 *
 * Clean abstraction for all LLM operations.
 * Routes to provider implementations (OpenAI, Gemini, Ollama) with consistent caching.
 *
 * Usage:
 *   import { llm } from './llm';
 *   const response = await llm.chat(messages);
 *   const itinerary = await llm.generateStructuredItinerary(context);
 */

import {
  getProvider,
  getConfiguredProvider,
  getConfiguredAIProvider,
  getAIMode,
  checkProviderHealth,
  getProviderInfo,
} from "./providers";
import type {
  AIProvider,
  ChatMessage,
  ChatOptions,
  ToolMessage,
  ChatWithToolsOptions,
  ChatWithToolsResponse,
  GeneratedItinerary,
} from "./providers/types";
import type { TripContext, StructuredItineraryResponse } from "@/types/structured-itinerary";

// ===========================================
// Re-exports for backward compatibility
// ===========================================

export type { AIProvider, ChatMessage, ChatOptions } from "./providers/types";
export type AIMode = "prod" | "test";
export type PromptFlavor = "standard" | "ollama";

export { getAIMode };

export function getAIProvider(): AIProvider {
  return getConfiguredAIProvider();
}

export function getPromptFlavor(): PromptFlavor {
  return getAIProvider() === "ollama" ? "ollama" : "standard";
}

export function getModelName(): string {
  const provider = getConfiguredProvider();
  return provider.getModel();
}

export interface LLMConfig {
  provider: AIProvider;
  mode: AIMode;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

export function getLLMConfig(): LLMConfig {
  const provider = getConfiguredProvider();
  return {
    provider: getAIProvider(),
    mode: getAIMode(),
    model: provider.getModel(),
    temperature: 0.7,
    maxTokens: 4000,
  };
}

// ===========================================
// Core LLM Functions
// ===========================================

/**
 * Send a chat completion request to the configured LLM
 */
export async function chat(
  messages: ChatMessage[],
  options?: ChatOptions & { providerOverride?: AIProvider }
): Promise<string> {
  const providerType = options?.providerOverride ?? getAIProvider();
  const provider = getProvider(providerType);

  console.log(`[LLM] Using ${providerType} with model ${provider.getModel()}`);

  return provider.chat(messages, options);
}

/**
 * Simple completion with just a prompt string
 */
export async function complete(
  prompt: string,
  systemPrompt?: string
): Promise<string> {
  return chat([{ role: "user", content: prompt }], { systemPrompt });
}

/**
 * Generate JSON response
 */
export async function generateJSON<T>(
  prompt: string,
  systemPrompt?: string
): Promise<T> {
  const provider = getConfiguredProvider();
  return provider.generateJSON<T>(prompt, { systemPrompt });
}

/**
 * Generate itinerary (legacy format)
 */
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
  const provider = getConfiguredProvider();
  return provider.generateItinerary(
    destination,
    startDate,
    endDate,
    travelers,
    preferences,
    additionalNotes
  );
}

/**
 * Generate structured itinerary with options per slot
 */
export async function generateStructuredItinerary(
  context: TripContext
): Promise<StructuredItineraryResponse> {
  const provider = getConfiguredProvider();
  return provider.generateStructuredItinerary(context);
}

/**
 * Chat with tools support
 */
export async function chatWithTools(
  messages: ToolMessage[],
  options?: ChatWithToolsOptions
): Promise<ChatWithToolsResponse> {
  const provider = getConfiguredProvider();
  return provider.chatWithTools(messages, options);
}

// ===========================================
// Provider Info
// ===========================================

export { getProviderInfo, checkProviderHealth as checkHealth };

// ===========================================
// Unified LLM Object
// ===========================================

export const llm = {
  chat,
  complete,
  generateJSON,
  generateItinerary,
  generateStructuredItinerary,
  chatWithTools,
  chatWithToolsAndExecute: async (
    messages: ToolMessage[],
    options?: ChatWithToolsOptions & { maxToolRounds?: number }
  ) => {
    // Import dynamically to avoid circular deps and use tools types
    const tools = await import("./tools");
    const provider = getAIProvider();
    // Convert to tool module's message type
    const toolMessages = messages.map((m) => ({
      role: m.role,
      content: m.content,
      toolCalls: m.toolCalls,
      toolCallId: m.toolCallId,
      name: m.name,
    })) as import("./tools/types").ToolMessage[];

    // Convert options to tools format
    const toolOptions = options ? {
      systemPrompt: options.systemPrompt,
      temperature: options.temperature,
      maxTokens: options.maxTokens,
      tools: options.tools as import("./tools/types").UnifiedToolDef[] | undefined,
      toolChoice: options.toolChoice,
      maxToolRounds: options.maxToolRounds,
    } : undefined;

    return tools.chatWithToolsAndExecute(provider, toolMessages, toolOptions);
  },
  getConfig: getLLMConfig,
  getProvider: getAIProvider,
  getMode: getAIMode,
  getPromptFlavor,
  getProviderInfo,
  checkHealth: checkProviderHealth,
};

export default llm;

// ===========================================
// Re-export tools for convenience
// ===========================================

export { chatWithTools as chatWithToolsFromTools, chatWithToolsAndExecute, ALL_TOOLS } from "./tools";
