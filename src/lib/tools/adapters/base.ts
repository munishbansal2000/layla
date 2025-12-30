/**
 * Base Tool Adapter Interface
 *
 * Defines the contract for provider-specific tool adapters.
 * Each provider (OpenAI, Gemini, Ollama) implements this interface.
 * Includes caching support via openai-logger.
 */

import type {
  UnifiedToolDef,
  UnifiedToolCall,
  UnifiedToolResult,
  ToolMessage,
  ChatWithToolsOptions,
  ChatWithToolsResponse,
  ProviderCapabilities,
  AIProvider,
} from "../types";
import {
  logOpenAIRequest,
  createLogEntry,
  findReplayMatch,
  type OpenAILogEntry,
} from "../../openai-logger";

// ===========================================
// Base Adapter Interface
// ===========================================

export interface ToolAdapter {
  /**
   * Provider identifier
   */
  readonly provider: AIProvider;

  /**
   * Provider capabilities
   */
  readonly capabilities: ProviderCapabilities;

  /**
   * Convert unified tool definitions to provider-specific format
   */
  formatTools(tools: UnifiedToolDef[]): unknown;

  /**
   * Convert tool choice option to provider-specific format
   */
  formatToolChoice(
    choice: ChatWithToolsOptions["toolChoice"]
  ): unknown;

  /**
   * Parse tool calls from provider response
   */
  parseToolCalls(response: unknown): UnifiedToolCall[];

  /**
   * Format tool results for sending back to the model
   */
  formatToolResults(results: UnifiedToolResult[]): unknown[];

  /**
   * Execute a chat completion with tool support
   */
  chatWithTools(
    messages: ToolMessage[],
    options: ChatWithToolsOptions
  ): Promise<ChatWithToolsResponse>;

  /**
   * Check if the model supports native tool calling
   * (For Ollama, this depends on the model)
   */
  supportsNativeTools(): boolean;
}

// ===========================================
// Abstract Base Implementation
// ===========================================

export abstract class BaseToolAdapter implements ToolAdapter {
  abstract readonly provider: AIProvider;
  abstract readonly capabilities: ProviderCapabilities;

  abstract formatTools(tools: UnifiedToolDef[]): unknown;
  abstract formatToolChoice(choice: ChatWithToolsOptions["toolChoice"]): unknown;
  abstract parseToolCalls(response: unknown): UnifiedToolCall[];
  abstract formatToolResults(results: UnifiedToolResult[]): unknown[];
  abstract chatWithTools(
    messages: ToolMessage[],
    options: ChatWithToolsOptions
  ): Promise<ChatWithToolsResponse>;

  supportsNativeTools(): boolean {
    return this.capabilities.supportsTools;
  }

  /**
   * Generate a unique tool call ID
   */
  protected generateToolCallId(): string {
    return `call_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  /**
   * Build messages array with system prompt prepended
   */
  protected buildMessagesWithSystem(
    messages: ToolMessage[],
    systemPrompt?: string
  ): ToolMessage[] {
    if (!systemPrompt) return messages;

    // Check if first message is already a system message
    if (messages[0]?.role === "system") {
      // Replace existing system message
      return [
        { role: "system", content: systemPrompt },
        ...messages.slice(1),
      ];
    }

    // Prepend system message
    return [{ role: "system", content: systemPrompt }, ...messages];
  }

  /**
   * Extract JSON from a potentially wrapped response
   * Useful for models that wrap JSON in markdown code blocks
   */
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

    // Return as-is
    return content.trim();
  }

  /**
   * Repair common JSON issues from LLM responses
   */
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
}

// ===========================================
// Adapter Factory
// ===========================================

export type AdapterFactory = () => ToolAdapter;

const adapterRegistry: Map<AIProvider, AdapterFactory> = new Map();

export function registerAdapter(
  provider: AIProvider,
  factory: AdapterFactory
): void {
  adapterRegistry.set(provider, factory);
}

export function getAdapter(provider: AIProvider): ToolAdapter {
  const factory = adapterRegistry.get(provider);
  if (!factory) {
    throw new Error(`No adapter registered for provider: ${provider}`);
  }
  return factory();
}

export function hasAdapter(provider: AIProvider): boolean {
  return adapterRegistry.has(provider);
}

// ===========================================
// Caching Wrapper
// ===========================================

/**
 * Get AI mode from environment
 */
function getAIMode(): "prod" | "test" {
  const mode = process.env.AI_MODE?.toLowerCase();
  if (mode === "test" || mode === "development" || mode === "dev") {
    return "test";
  }
  return "prod";
}

/**
 * Wraps a ToolAdapter with caching support.
 * In test mode, tries to replay from cache before making actual API calls.
 * All responses are logged for future replay.
 */
export class CachingToolAdapter implements ToolAdapter {
  private adapter: ToolAdapter;

  get provider(): AIProvider {
    return this.adapter.provider;
  }

  get capabilities(): ProviderCapabilities {
    return this.adapter.capabilities;
  }

  constructor(adapter: ToolAdapter) {
    this.adapter = adapter;
  }

  formatTools(tools: UnifiedToolDef[]): unknown {
    return this.adapter.formatTools(tools);
  }

  formatToolChoice(choice: ChatWithToolsOptions["toolChoice"]): unknown {
    return this.adapter.formatToolChoice(choice);
  }

  parseToolCalls(response: unknown): UnifiedToolCall[] {
    return this.adapter.parseToolCalls(response);
  }

  formatToolResults(results: UnifiedToolResult[]): unknown[] {
    return this.adapter.formatToolResults(results);
  }

  supportsNativeTools(): boolean {
    return this.adapter.supportsNativeTools();
  }

  async chatWithTools(
    messages: ToolMessage[],
    options: ChatWithToolsOptions
  ): Promise<ChatWithToolsResponse> {
    const mode = getAIMode();
    const startTime = Date.now();

    // Convert messages for logging format
    const logMessages = messages.map((m) => ({
      role: m.role as "user" | "assistant" | "system",
      content: m.content,
    }));

    // In test mode, try to replay from cache
    if (mode === "test") {
      console.log(`[${this.provider}] Test mode - checking for replay match...`);

      const replayMatch = await findReplayMatch("chat", logMessages, {
        provider: this.provider,
        hasTools: !!options.tools?.length,
      });

      if (replayMatch.found && replayMatch.entry) {
        console.log(
          `[${this.provider}] Replay match found! Type: ${replayMatch.matchType}, Score: ${replayMatch.matchScore}`
        );
        console.log(`[${this.provider}] Using cached response from: ${replayMatch.entry.id}`);

        // Parse tool calls from cached content if present
        let toolCalls: UnifiedToolCall[] | undefined;
        const content = replayMatch.entry.response.content;

        // Try to detect if cached response had tool calls
        // (This is a simplified approach - in production you'd store tool calls in the log)

        return {
          content,
          toolCalls,
          finishReason: "stop",
          usage: replayMatch.entry.response.usage
            ? {
                promptTokens: replayMatch.entry.response.usage.prompt_tokens,
                completionTokens: replayMatch.entry.response.usage.completion_tokens,
                totalTokens: replayMatch.entry.response.usage.total_tokens,
              }
            : undefined,
        };
      }

      console.log(`[${this.provider}] No replay match - calling API and saving response...`);
    }

    // Make actual API call
    try {
      const response = await this.adapter.chatWithTools(messages, options);
      const durationMs = Date.now() - startTime;

      // Log the request/response for future replay
      const logEntry = createLogEntry(
        "chat",
        {
          model: this.getModelName(),
          messages: logMessages,
          temperature: options.temperature,
          max_tokens: options.maxTokens,
        },
        {
          id: `${this.provider}-${Date.now()}`,
          content: response.content,
          finish_reason: response.finishReason,
          usage: response.usage
            ? {
                prompt_tokens: response.usage.promptTokens,
                completion_tokens: response.usage.completionTokens,
                total_tokens: response.usage.totalTokens,
              }
            : undefined,
        },
        durationMs,
        true,
        undefined,
        {
          provider: this.provider,
          hasTools: !!options.tools?.length,
          toolCallCount: response.toolCalls?.length || 0,
        }
      );

      // Log asynchronously (don't block response)
      logOpenAIRequest(logEntry).catch(console.error);

      console.log(`[${this.provider}] Response logged: ${logEntry.id}`);

      return response;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : "Unknown error";

      // Log the failed request
      const logEntry = createLogEntry(
        "chat",
        {
          model: this.getModelName(),
          messages: logMessages,
          temperature: options.temperature,
          max_tokens: options.maxTokens,
        },
        {
          content: "",
        },
        durationMs,
        false,
        errorMessage,
        { provider: this.provider }
      );

      logOpenAIRequest(logEntry).catch(console.error);

      throw error;
    }
  }

  private getModelName(): string {
    switch (this.provider) {
      case "openai":
        return "gpt-4o-mini";
      case "gemini":
        return "gemini-2.5-flash";
      case "ollama":
        return process.env.OLLAMA_MODEL || "llama3.1:8b";
      default:
        return "unknown";
    }
  }
}

/**
 * Create a cached adapter for a provider
 */
export function createCachedAdapter(provider: AIProvider): CachingToolAdapter {
  const adapter = getAdapter(provider);
  return new CachingToolAdapter(adapter);
}
