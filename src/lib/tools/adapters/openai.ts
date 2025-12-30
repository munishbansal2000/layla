/**
 * OpenAI Tool Adapter
 *
 * Handles tool/function calling for OpenAI models.
 * OpenAI has full native support for tool calling.
 */

import OpenAI from "openai";
import { BaseToolAdapter, registerAdapter } from "./base";
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

// ===========================================
// OpenAI Adapter Implementation
// ===========================================

export class OpenAIToolAdapter extends BaseToolAdapter {
  readonly provider: AIProvider = "openai";
  readonly capabilities: ProviderCapabilities = {
    supportsTools: true,
    supportsParallelToolCalls: true,
    supportsToolChoice: true,
    supportsStreaming: true,
    requiresToolFallback: false,
  };

  private client: OpenAI | null = null;
  private model: string;

  constructor(model: string = "gpt-4o-mini") {
    super();
    this.model = model;
  }

  private getClient(): OpenAI {
    if (!this.client) {
      const apiKey = process.env.OPENAI_API_KEY;
      if (!apiKey) {
        throw new Error("OPENAI_API_KEY is required for OpenAI provider");
      }
      this.client = new OpenAI({ apiKey });
    }
    return this.client;
  }

  /**
   * Convert unified tool definitions to OpenAI format
   */
  formatTools(tools: UnifiedToolDef[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
    return tools.map((tool) => ({
      type: "function" as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: {
          type: "object" as const,
          properties: this.convertParameters(tool.parameters.properties),
          required: tool.parameters.required,
        },
      },
    }));
  }

  /**
   * Convert unified parameter format to OpenAI format
   */
  private convertParameters(
    properties: Record<string, { type: string; description: string; enum?: string[] }>
  ): Record<string, object> {
    const result: Record<string, object> = {};

    for (const [key, param] of Object.entries(properties)) {
      result[key] = {
        type: param.type,
        description: param.description,
        ...(param.enum && { enum: param.enum }),
      };
    }

    return result;
  }

  /**
   * Convert tool choice to OpenAI format
   */
  formatToolChoice(
    choice: ChatWithToolsOptions["toolChoice"]
  ): OpenAI.Chat.Completions.ChatCompletionToolChoiceOption | undefined {
    if (!choice) return "auto";

    if (typeof choice === "string") {
      if (choice === "none") return "none";
      if (choice === "required") return "required";
      return "auto";
    }

    // Specific function
    return {
      type: "function",
      function: { name: choice.name },
    };
  }

  /**
   * Parse tool calls from OpenAI response
   */
  parseToolCalls(
    response: OpenAI.Chat.Completions.ChatCompletionMessage
  ): UnifiedToolCall[] {
    if (!response.tool_calls) return [];

    return response.tool_calls
      .filter((tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & { type: "function" } =>
        tc.type === "function"
      )
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      }));
  }

  /**
   * Format tool results for OpenAI
   */
  formatToolResults(
    results: UnifiedToolResult[]
  ): OpenAI.Chat.Completions.ChatCompletionToolMessageParam[] {
    return results.map((result) => ({
      role: "tool" as const,
      tool_call_id: result.toolCallId,
      content: JSON.stringify(result.result),
    }));
  }

  /**
   * Execute chat with tools
   */
  async chatWithTools(
    messages: ToolMessage[],
    options: ChatWithToolsOptions
  ): Promise<ChatWithToolsResponse> {
    const client = this.getClient();

    // Build messages with system prompt
    const allMessages = this.buildMessagesWithSystem(messages, options.systemPrompt);

    // Convert to OpenAI message format
    const openaiMessages = this.convertToOpenAIMessages(allMessages);

    // Build request options
    const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model: this.model,
      messages: openaiMessages,
      temperature: options.temperature ?? 0.7,
      max_tokens: options.maxTokens ?? 4000,
    };

    // Add tools if provided
    if (options.tools && options.tools.length > 0) {
      requestOptions.tools = this.formatTools(options.tools);
      requestOptions.tool_choice = this.formatToolChoice(options.toolChoice);
    }

    try {
      const response = await client.chat.completions.create(requestOptions);
      const message = response.choices[0]?.message;

      if (!message) {
        return {
          content: "",
          finishReason: "error",
        };
      }

      const toolCalls = this.parseToolCalls(message);

      return {
        content: message.content || "",
        toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
        finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
        usage: response.usage
          ? {
              promptTokens: response.usage.prompt_tokens,
              completionTokens: response.usage.completion_tokens,
              totalTokens: response.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error) {
      console.error("[OpenAI Adapter] Error:", error);
      throw error;
    }
  }

  /**
   * Convert unified messages to OpenAI format
   */
  private convertToOpenAIMessages(
    messages: ToolMessage[]
  ): OpenAI.Chat.Completions.ChatCompletionMessageParam[] {
    return messages.map((msg) => {
      if (msg.role === "tool") {
        return {
          role: "tool" as const,
          tool_call_id: msg.toolCallId!,
          content: msg.content,
        };
      }

      if (msg.role === "assistant" && msg.toolCalls) {
        return {
          role: "assistant" as const,
          content: msg.content || null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: "function" as const,
            function: {
              name: tc.name,
              arguments: JSON.stringify(tc.arguments),
            },
          })),
        };
      }

      return {
        role: msg.role as "user" | "assistant" | "system",
        content: msg.content,
      };
    });
  }
}

// ===========================================
// Factory Registration
// ===========================================

export function createOpenAIAdapter(model?: string): OpenAIToolAdapter {
  return new OpenAIToolAdapter(model);
}

// Register with factory
registerAdapter("openai", () => createOpenAIAdapter());
