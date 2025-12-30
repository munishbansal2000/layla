/**
 * OpenAI Provider
 *
 * Full OpenAI implementation with all LLM operations.
 * Extends BaseProvider which handles caching automatically.
 */

import OpenAI from "openai";
import { BaseProvider, registerProvider } from "./base";
import type {
  AIProvider,
  ProviderCapabilities,
  ChatMessage,
  ChatOptions,
  ToolMessage,
  ChatWithToolsOptions,
  ChatWithToolsResponse,
  HealthCheckResult,
  UnifiedToolDef,
  UnifiedToolCall,
} from "./types";

// ===========================================
// OpenAI Provider Implementation
// ===========================================

export class OpenAIProvider extends BaseProvider {
  readonly provider: AIProvider = "openai";
  readonly capabilities: ProviderCapabilities = {
    supportsTools: true,
    supportsParallelToolCalls: true,
    supportsToolChoice: true,
    supportsStreaming: true,
    supportsJsonMode: true,
    requiresToolFallback: false,
  };

  private client: OpenAI | null = null;
  private model: string;

  constructor(model: string = "gpt-4o-mini") {
    super();
    this.model = model;
  }

  getModel(): string {
    return this.model;
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

  // ===========================================
  // Core Implementation
  // ===========================================

  protected async callChat(
    messages: ChatMessage[],
    options?: ChatOptions
  ): Promise<{ content: string; usage?: { promptTokens: number; completionTokens: number; totalTokens: number } }> {
    const client = this.getClient();

    const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model: this.model,
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1000,
    };

    // Enable JSON mode if requested
    if (options?.jsonMode) {
      requestOptions.response_format = { type: "json_object" };
    }

    const response = await client.chat.completions.create(requestOptions);

    return {
      content: response.choices[0]?.message?.content || "",
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      } : undefined,
    };
  }

  protected async callChatWithTools(
    messages: ToolMessage[],
    options?: ChatWithToolsOptions
  ): Promise<ChatWithToolsResponse> {
    const client = this.getClient();

    // Build messages with system prompt
    const allMessages = options?.systemPrompt
      ? [{ role: "system" as const, content: options.systemPrompt }, ...messages]
      : messages;

    // Convert to OpenAI message format
    const openaiMessages = this.convertToOpenAIMessages(allMessages);

    const requestOptions: OpenAI.Chat.Completions.ChatCompletionCreateParams = {
      model: this.model,
      messages: openaiMessages,
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 4000,
    };

    // Add tools if provided
    if (options?.tools && options.tools.length > 0) {
      requestOptions.tools = this.formatTools(options.tools);
      requestOptions.tool_choice = this.formatToolChoice(options.toolChoice);
    }

    const response = await client.chat.completions.create(requestOptions);
    const message = response.choices[0]?.message;

    if (!message) {
      return { content: "", finishReason: "error" };
    }

    const toolCalls = this.parseToolCalls(message);

    return {
      content: message.content || "",
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
      usage: response.usage ? {
        promptTokens: response.usage.prompt_tokens,
        completionTokens: response.usage.completion_tokens,
        totalTokens: response.usage.total_tokens,
      } : undefined,
    };
  }

  async checkHealth(): Promise<HealthCheckResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return {
        available: false,
        provider: this.provider,
        model: this.model,
        error: "OPENAI_API_KEY not configured",
      };
    }

    return {
      available: true,
      provider: this.provider,
      model: this.model,
    };
  }

  // ===========================================
  // Tool Formatting Helpers
  // ===========================================

  private formatTools(tools: UnifiedToolDef[]): OpenAI.Chat.Completions.ChatCompletionTool[] {
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

  private formatToolChoice(
    choice: ChatWithToolsOptions["toolChoice"]
  ): OpenAI.Chat.Completions.ChatCompletionToolChoiceOption | undefined {
    if (!choice) return "auto";

    if (typeof choice === "string") {
      if (choice === "none") return "none";
      if (choice === "required") return "required";
      return "auto";
    }

    return {
      type: "function",
      function: { name: choice.name },
    };
  }

  private parseToolCalls(
    message: OpenAI.Chat.Completions.ChatCompletionMessage
  ): UnifiedToolCall[] {
    if (!message.tool_calls) return [];

    return message.tool_calls
      .filter((tc): tc is OpenAI.Chat.Completions.ChatCompletionMessageToolCall & { type: "function" } =>
        tc.type === "function"
      )
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      }));
  }

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
// Factory
// ===========================================

export function createOpenAIProvider(model?: string): OpenAIProvider {
  return new OpenAIProvider(model);
}

// Register with factory
registerProvider("openai", () => createOpenAIProvider());
