/**
 * Provider Types
 *
 * Shared types for all LLM providers.
 */

import type { TripContext, StructuredItineraryResponse } from "@/types/structured-itinerary";

// ===========================================
// Core Types
// ===========================================

export type AIProvider = "openai" | "gemini" | "ollama";
export type AIMode = "prod" | "test";

export interface ChatMessage {
  role: "user" | "assistant" | "system";
  content: string;
}

export interface ProviderConfig {
  provider: AIProvider;
  model: string;
  temperature?: number;
  maxTokens?: number;
}

// ===========================================
// Chat Options
// ===========================================

export interface ChatOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
}

// ===========================================
// Tool Types (re-export from tools module)
// ===========================================

export type ToolParameterType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array";

export interface UnifiedToolDef {
  name: string;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, ToolParameter>;
    required: string[];
  };
}

export interface ToolParameter {
  type: ToolParameterType;
  description: string;
  enum?: string[];
  items?: ToolParameter;
  properties?: Record<string, ToolParameter>;
  required?: string[];
}

export interface UnifiedToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface UnifiedToolResult {
  toolCallId: string;
  name: string;
  result: unknown;
  error?: string;
}

export interface ToolMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: UnifiedToolCall[];
  toolCallId?: string;
  name?: string;
}

export interface ChatWithToolsOptions extends ChatOptions {
  tools?: UnifiedToolDef[];
  toolChoice?: "auto" | "required" | "none" | { name: string };
}

export interface ChatWithToolsResponse {
  content: string;
  toolCalls?: UnifiedToolCall[];
  finishReason: "stop" | "tool_calls" | "length" | "error";
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

// ===========================================
// Provider Capabilities
// ===========================================

export interface ProviderCapabilities {
  supportsTools: boolean;
  supportsParallelToolCalls: boolean;
  supportsToolChoice: boolean;
  supportsStreaming: boolean;
  supportsJsonMode: boolean;
  requiresToolFallback: boolean;
}

// ===========================================
// Health Check
// ===========================================

export interface HealthCheckResult {
  available: boolean;
  provider: AIProvider;
  model: string;
  error?: string;
}

// ===========================================
// Provider Interface
// ===========================================

export interface LLMProvider {
  readonly provider: AIProvider;
  readonly capabilities: ProviderCapabilities;

  /**
   * Get the model name
   */
  getModel(): string;

  /**
   * Simple chat completion
   */
  chat(messages: ChatMessage[], options?: ChatOptions): Promise<string>;

  /**
   * Generate JSON response
   */
  generateJSON<T>(prompt: string, options?: ChatOptions): Promise<T>;

  /**
   * Generate itinerary (legacy format)
   */
  generateItinerary(
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
  ): Promise<GeneratedItinerary>;

  /**
   * Generate structured itinerary with options per slot
   */
  generateStructuredItinerary(
    context: TripContext
  ): Promise<StructuredItineraryResponse>;

  /**
   * Chat with tools support
   */
  chatWithTools(
    messages: ToolMessage[],
    options?: ChatWithToolsOptions
  ): Promise<ChatWithToolsResponse>;

  /**
   * Health check
   */
  checkHealth(): Promise<HealthCheckResult>;
}

// ===========================================
// Legacy Itinerary Types (for backward compatibility)
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
