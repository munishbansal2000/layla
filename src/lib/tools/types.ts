/**
 * Unified Tool Types
 *
 * Provider-agnostic type definitions for tool/function calling.
 * These types are converted to provider-specific formats by adapters.
 */

// ===========================================
// Parameter Types
// ===========================================

export type ToolParameterType =
  | "string"
  | "number"
  | "boolean"
  | "object"
  | "array";

export interface ToolParameter {
  type: ToolParameterType;
  description: string;
  enum?: string[];
  items?: ToolParameter; // For array types
  properties?: Record<string, ToolParameter>; // For object types
  required?: string[]; // For object types
}

export interface ToolParameters {
  type: "object";
  properties: Record<string, ToolParameter>;
  required: string[];
}

// ===========================================
// Tool Definition
// ===========================================

export interface UnifiedToolDef {
  name: string;
  description: string;
  parameters: ToolParameters;
}

// ===========================================
// Tool Calls (from model response)
// ===========================================

export interface UnifiedToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// ===========================================
// Tool Results (to send back to model)
// ===========================================

export interface UnifiedToolResult {
  toolCallId: string;
  name: string;
  result: unknown;
  isError?: boolean;
}

// ===========================================
// Chat Messages with Tool Support
// ===========================================

export interface ToolMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  toolCalls?: UnifiedToolCall[];
  toolCallId?: string; // For tool role messages
  name?: string; // For tool role messages
}

// ===========================================
// Chat Options with Tools
// ===========================================

export interface ChatWithToolsOptions {
  systemPrompt?: string;
  temperature?: number;
  maxTokens?: number;
  tools?: UnifiedToolDef[];
  toolChoice?: "auto" | "required" | "none" | { name: string };
}

// ===========================================
// Chat Response with Tools
// ===========================================

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
// Provider Types
// ===========================================

export type AIProvider = "openai" | "gemini" | "ollama";

export interface ProviderCapabilities {
  supportsTools: boolean;
  supportsParallelToolCalls: boolean;
  supportsToolChoice: boolean;
  supportsStreaming: boolean;
  requiresToolFallback: boolean;
}

// ===========================================
// Tool Executor Function Type
// ===========================================

export type ToolExecutor = (
  name: string,
  args: Record<string, unknown>
) => Promise<unknown>;
