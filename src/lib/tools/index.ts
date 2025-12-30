/**
 * Tools Module Index
 *
 * Unified tool calling interface for all LLM providers.
 *
 * Usage:
 *   import { chatWithTools, ALL_TOOLS } from './tools';
 *
 *   const response = await chatWithTools(
 *     'openai',
 *     [{ role: 'user', content: 'Find restaurants in Paris' }],
 *     { tools: ALL_TOOLS }
 *   );
 */

// Types
export * from "./types";

// Tool Definitions
export * from "./definitions";

// Tool Executor
export { executeTool, executeTools, createToolExecutor } from "./executor";

// Adapters
export {
  type ToolAdapter,
  BaseToolAdapter,
  CachingToolAdapter,
  registerAdapter,
  getAdapter,
  hasAdapter,
  createCachedAdapter,
} from "./adapters/base";

// Import adapters to register them
import "./adapters/openai";
import "./adapters/gemini";
import "./adapters/ollama";

// Re-export adapter factories for direct use
export { createOpenAIAdapter, OpenAIToolAdapter } from "./adapters/openai";
export { createGeminiAdapter, GeminiToolAdapter } from "./adapters/gemini";
export { createOllamaAdapter, OllamaToolAdapter } from "./adapters/ollama";

// ===========================================
// Convenience Functions
// ===========================================

import type {
  AIProvider,
  ToolMessage,
  ChatWithToolsOptions,
  ChatWithToolsResponse,
  UnifiedToolResult,
} from "./types";
import { createCachedAdapter, getAdapter } from "./adapters/base";
import { executeTools } from "./executor";
import { ALL_TOOLS } from "./definitions";

/**
 * Chat with tools using the specified provider.
 * Uses caching automatically.
 */
export async function chatWithTools(
  provider: AIProvider,
  messages: ToolMessage[],
  options?: ChatWithToolsOptions
): Promise<ChatWithToolsResponse> {
  const adapter = createCachedAdapter(provider);

  return adapter.chatWithTools(messages, {
    ...options,
    tools: options?.tools ?? ALL_TOOLS,
  });
}

/**
 * Chat with tools and automatically execute any tool calls.
 * Returns the final response after all tool calls are resolved.
 */
export async function chatWithToolsAndExecute(
  provider: AIProvider,
  messages: ToolMessage[],
  options?: ChatWithToolsOptions & { maxToolRounds?: number }
): Promise<{
  response: ChatWithToolsResponse;
  toolResults: UnifiedToolResult[];
  messages: ToolMessage[];
}> {
  const adapter = createCachedAdapter(provider);
  const maxRounds = options?.maxToolRounds ?? 3;

  let currentMessages = [...messages];
  let allToolResults: UnifiedToolResult[] = [];
  let response: ChatWithToolsResponse;
  let round = 0;

  do {
    response = await adapter.chatWithTools(currentMessages, {
      ...options,
      tools: options?.tools ?? ALL_TOOLS,
    });

    if (!response.toolCalls || response.toolCalls.length === 0) {
      break;
    }

    // Execute tool calls
    const toolResults = await executeTools(response.toolCalls);
    allToolResults.push(...toolResults);

    // Add assistant message with tool calls
    currentMessages.push({
      role: "assistant",
      content: response.content,
      toolCalls: response.toolCalls,
    });

    // Add tool results
    for (const result of toolResults) {
      currentMessages.push({
        role: "tool",
        content: JSON.stringify(result.result),
        toolCallId: result.toolCallId,
        name: result.name,
      });
    }

    round++;
  } while (round < maxRounds);

  return {
    response,
    toolResults: allToolResults,
    messages: currentMessages,
  };
}

/**
 * Get provider capabilities
 */
export function getProviderCapabilities(provider: AIProvider) {
  const adapter = getAdapter(provider);
  return adapter.capabilities;
}
