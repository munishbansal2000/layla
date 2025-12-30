/**
 * Ollama Provider
 *
 * Full Ollama implementation with all LLM operations.
 * Uses OpenAI-compatible API. Extends BaseProvider which handles caching automatically.
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
// Ollama Provider Implementation
// ===========================================

export class OllamaProvider extends BaseProvider {
  readonly provider: AIProvider = "ollama";
  readonly capabilities: ProviderCapabilities = {
    supportsTools: true,
    supportsParallelToolCalls: true,
    supportsToolChoice: true,
    supportsStreaming: true,
    supportsJsonMode: false, // Ollama doesn't have native JSON mode
    requiresToolFallback: false,
  };

  private client: OpenAI | null = null;
  private model: string;
  private baseUrl: string;

  constructor(
    model: string = process.env.OLLAMA_MODEL || "llama3.1:8b",
    baseUrl: string = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1"
  ) {
    super();
    this.model = model;
    this.baseUrl = baseUrl;
  }

  getModel(): string {
    return this.model;
  }

  private getClient(): OpenAI {
    if (!this.client) {
      this.client = new OpenAI({
        baseURL: this.baseUrl,
        apiKey: "ollama", // Required but not used by Ollama
      });
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

    // For JSON mode, add instruction to the prompt since Ollama doesn't have native JSON mode
    let processedMessages = messages;
    if (options?.jsonMode) {
      const lastMessage = messages[messages.length - 1];
      if (lastMessage.role === "user") {
        processedMessages = [
          ...messages.slice(0, -1),
          {
            ...lastMessage,
            content: `${lastMessage.content}\n\nIMPORTANT: Respond ONLY with valid JSON, no markdown, no code blocks, just pure JSON.`,
          },
        ];
      }
    }

    const response = await client.chat.completions.create({
      model: this.model,
      messages: processedMessages.map((m) => ({ role: m.role, content: m.content })),
      temperature: options?.temperature ?? 0.7,
      max_tokens: options?.maxTokens ?? 1000,
    });

    let content = response.choices[0]?.message?.content || "";

    // For JSON mode, try to extract JSON from the response
    if (options?.jsonMode) {
      content = this.extractJsonFromResponse(content);
    }

    return {
      content,
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
    try {
      const baseURL = this.baseUrl.replace("/v1", "");
      const response = await fetch(`${baseURL}/api/tags`);

      if (!response.ok) {
        return {
          available: false,
          provider: this.provider,
          model: this.model,
          error: `Ollama returned status ${response.status}`,
        };
      }

      return {
        available: true,
        provider: this.provider,
        model: this.model,
      };
    } catch (error) {
      return {
        available: false,
        provider: this.provider,
        model: this.model,
        error: error instanceof Error ? error.message : "Failed to connect to Ollama",
      };
    }
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

export function createOllamaProvider(model?: string, baseUrl?: string): OllamaProvider {
  return new OllamaProvider(model, baseUrl);
}

// Register with factory
registerProvider("ollama", () => createOllamaProvider());
