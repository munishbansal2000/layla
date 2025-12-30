/**
 * Gemini Provider
 *
 * Full Google Gemini implementation with all LLM operations.
 * Extends BaseProvider which handles caching automatically.
 */

import {
  GoogleGenerativeAI,
  HarmCategory,
  HarmBlockThreshold,
  SchemaType,
  type Part,
  type Content,
  type FunctionCall,
  type ToolConfig,
  type FunctionCallingMode,
} from "@google/generative-ai";
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
  ToolParameter,
} from "./types";

// ===========================================
// Gemini Provider Implementation
// ===========================================

export class GeminiProvider extends BaseProvider {
  readonly provider: AIProvider = "gemini";
  readonly capabilities: ProviderCapabilities = {
    supportsTools: true,
    supportsParallelToolCalls: true,
    supportsToolChoice: true,
    supportsStreaming: true,
    supportsJsonMode: true,
    requiresToolFallback: false,
  };

  private client: GoogleGenerativeAI | null = null;
  private model: string;

  private safetySettings = [
    {
      category: HarmCategory.HARM_CATEGORY_HARASSMENT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_HATE_SPEECH,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
    {
      category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
      threshold: HarmBlockThreshold.BLOCK_ONLY_HIGH,
    },
  ];

  constructor(model: string = "gemini-2.5-flash") {
    super();
    this.model = model;
  }

  getModel(): string {
    return this.model;
  }

  private getClient(): GoogleGenerativeAI {
    if (!this.client) {
      const apiKey = process.env.GEMINI_API_KEY;
      if (!apiKey) {
        throw new Error("GEMINI_API_KEY is required for Gemini provider");
      }
      this.client = new GoogleGenerativeAI(apiKey);
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

    // Extract system prompt and convert to Gemini format
    const systemMessage = messages.find((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system");

    const geminiModel = client.getGenerativeModel({
      model: this.model,
      safetySettings: this.safetySettings,
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens ?? 1000,
        ...(options?.jsonMode && { responseMimeType: "application/json" }),
      },
    });

    // Build content for Gemini
    const contents = chatMessages.map((m) => ({
      role: m.role === "assistant" ? "model" : "user",
      parts: [{ text: m.content }],
    }));

    const result = await geminiModel.generateContent({
      contents,
      ...(systemMessage && { systemInstruction: systemMessage.content }),
    });

    const response = result.response;

    return {
      content: response.text() || "",
      usage: response.usageMetadata ? {
        promptTokens: response.usageMetadata.promptTokenCount || 0,
        completionTokens: response.usageMetadata.candidatesTokenCount || 0,
        totalTokens: response.usageMetadata.totalTokenCount || 0,
      } : undefined,
    };
  }

  protected async callChatWithTools(
    messages: ToolMessage[],
    options?: ChatWithToolsOptions
  ): Promise<ChatWithToolsResponse> {
    const client = this.getClient();

    // Extract system prompt
    const systemMessage = messages.find((m) => m.role === "system");
    const chatMessages = messages.filter((m) => m.role !== "system");

    // Configure model with tools
    const tools = options?.tools && options.tools.length > 0
      ? this.formatTools(options.tools)
      : undefined;

    const toolConfig = options?.toolChoice
      ? this.formatToolChoice(options.toolChoice)
      : undefined;

    const geminiModel = client.getGenerativeModel({
      model: this.model,
      safetySettings: this.safetySettings,
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens ?? 4000,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: tools as any,
      toolConfig,
    });

    // Convert messages to Gemini format
    const contents = this.convertToGeminiContents(chatMessages);

    const result = await geminiModel.generateContent({
      contents,
      ...(systemMessage && { systemInstruction: systemMessage.content }),
    });

    const response = result.response;

    // Get text (may throw if there are only function calls)
    let text = "";
    try {
      text = response.text();
    } catch {
      // No text content, only function calls
    }

    // Check for function calls
    const functionCalls = response.functionCalls();
    const toolCalls = this.parseToolCalls(functionCalls);

    return {
      content: text || "",
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      finishReason: toolCalls.length > 0 ? "tool_calls" : "stop",
      usage: response.usageMetadata ? {
        promptTokens: response.usageMetadata.promptTokenCount || 0,
        completionTokens: response.usageMetadata.candidatesTokenCount || 0,
        totalTokens: response.usageMetadata.totalTokenCount || 0,
      } : undefined,
    };
  }

  async checkHealth(): Promise<HealthCheckResult> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return {
        available: false,
        provider: this.provider,
        model: this.model,
        error: "GEMINI_API_KEY not configured",
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

  private formatTools(tools: UnifiedToolDef[]): unknown[] {
    return [
      {
        functionDeclarations: tools.map((tool) => ({
          name: tool.name,
          description: tool.description,
          parameters: this.convertParametersToGemini(tool.parameters),
        })),
      },
    ];
  }

  private convertParametersToGemini(params: {
    type: string;
    properties: Record<string, ToolParameter>;
    required: string[];
  }): Record<string, unknown> {
    const properties: Record<string, Record<string, unknown>> = {};

    for (const [key, param] of Object.entries(params.properties)) {
      properties[key] = this.convertParameterType(param);
    }

    return {
      type: SchemaType.OBJECT,
      properties,
      required: params.required,
    };
  }

  private convertParameterType(param: ToolParameter): Record<string, unknown> {
    const typeMap: Record<string, SchemaType> = {
      string: SchemaType.STRING,
      number: SchemaType.NUMBER,
      boolean: SchemaType.BOOLEAN,
      object: SchemaType.OBJECT,
      array: SchemaType.ARRAY,
    };

    const geminiType = typeMap[param.type] || SchemaType.STRING;

    if (param.type === "object" && param.properties) {
      const props: Record<string, Record<string, unknown>> = {};
      for (const [k, v] of Object.entries(param.properties)) {
        props[k] = this.convertParameterType(v);
      }
      return {
        type: SchemaType.OBJECT,
        description: param.description,
        properties: props,
        required: param.required,
      };
    }

    if (param.type === "array" && param.items) {
      return {
        type: SchemaType.ARRAY,
        description: param.description,
        items: this.convertParameterType(param.items),
      };
    }

    const schema: Record<string, unknown> = {
      type: geminiType,
      description: param.description,
    };

    if (param.enum) {
      schema.enum = param.enum;
    }

    return schema;
  }

  private formatToolChoice(choice: ChatWithToolsOptions["toolChoice"]): ToolConfig | undefined {
    if (choice === "none") {
      return { functionCallingConfig: { mode: "NONE" as FunctionCallingMode } };
    }
    if (choice === "required") {
      return { functionCallingConfig: { mode: "ANY" as FunctionCallingMode } };
    }
    if (typeof choice === "object" && choice.name) {
      return {
        functionCallingConfig: {
          mode: "ANY" as FunctionCallingMode,
          allowedFunctionNames: [choice.name],
        },
      };
    }
    return { functionCallingConfig: { mode: "AUTO" as FunctionCallingMode } };
  }

  private parseToolCalls(functionCalls: FunctionCall[] | undefined): UnifiedToolCall[] {
    if (!functionCalls || functionCalls.length === 0) return [];

    return functionCalls.map((fc) => ({
      id: this.generateToolCallId(),
      name: fc.name,
      arguments: (fc.args as Record<string, unknown>) || {},
    }));
  }

  private convertToGeminiContents(messages: ToolMessage[]): Content[] {
    const contents: Content[] = [];

    for (const msg of messages) {
      if (msg.role === "system") {
        continue;
      }

      if (msg.role === "user") {
        contents.push({
          role: "user",
          parts: [{ text: msg.content }],
        });
      } else if (msg.role === "assistant") {
        const parts: Part[] = [];

        if (msg.content) {
          parts.push({ text: msg.content });
        }

        if (msg.toolCalls) {
          for (const tc of msg.toolCalls) {
            parts.push({
              functionCall: {
                name: tc.name,
                args: tc.arguments,
              },
            });
          }
        }

        contents.push({
          role: "model",
          parts,
        });
      } else if (msg.role === "tool") {
        contents.push({
          role: "user",
          parts: [
            {
              functionResponse: {
                name: msg.name!,
                response: JSON.parse(msg.content),
              },
            },
          ],
        });
      }
    }

    return contents;
  }
}

// ===========================================
// Factory
// ===========================================

export function createGeminiProvider(model?: string): GeminiProvider {
  return new GeminiProvider(model);
}

// Register with factory
registerProvider("gemini", () => createGeminiProvider());
