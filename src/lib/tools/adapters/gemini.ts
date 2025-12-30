/**
 * Gemini Tool Adapter
 *
 * Handles tool/function calling for Google Gemini models.
 * Gemini uses a different format from OpenAI.
 */

import {
  GoogleGenerativeAI,
  SchemaType,
  HarmCategory,
  HarmBlockThreshold,
  type Part,
  type Content,
  type FunctionCall,
  type ToolConfig,
  type FunctionCallingMode,
} from "@google/generative-ai";
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
  ToolParameter,
} from "../types";

// ===========================================
// Gemini Adapter Implementation
// ===========================================

export class GeminiToolAdapter extends BaseToolAdapter {
  readonly provider: AIProvider = "gemini";
  readonly capabilities: ProviderCapabilities = {
    supportsTools: true,
    supportsParallelToolCalls: true,
    supportsToolChoice: false,
    supportsStreaming: true,
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

  /**
   * Convert unified tool definitions to Gemini format
   * Using 'as unknown' to work around strict SDK types
   */
  formatTools(tools: UnifiedToolDef[]): unknown[] {
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

  /**
   * Convert unified parameters to Gemini Schema format
   */
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

  /**
   * Convert a single parameter to Gemini Schema type
   */
  private convertParameterType(param: ToolParameter): Record<string, unknown> {
    const typeMap: Record<string, SchemaType> = {
      string: SchemaType.STRING,
      number: SchemaType.NUMBER,
      boolean: SchemaType.BOOLEAN,
      object: SchemaType.OBJECT,
      array: SchemaType.ARRAY,
    };

    const geminiType = typeMap[param.type] || SchemaType.STRING;

    // Build schema based on type
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

    // Simple types with optional enum
    const schema: Record<string, unknown> = {
      type: geminiType,
      description: param.description,
    };

    if (param.enum) {
      schema.enum = param.enum;
    }

    return schema;
  }

  /**
   * Convert tool choice to Gemini format
   */
  formatToolChoice(choice: ChatWithToolsOptions["toolChoice"]): ToolConfig | undefined {
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

  /**
   * Parse tool calls from Gemini response
   */
  parseToolCalls(functionCalls: FunctionCall[] | undefined): UnifiedToolCall[] {
    if (!functionCalls || functionCalls.length === 0) return [];

    return functionCalls.map((fc) => ({
      id: this.generateToolCallId(),
      name: fc.name,
      arguments: (fc.args as Record<string, unknown>) || {},
    }));
  }

  /**
   * Format tool results for Gemini
   */
  formatToolResults(results: UnifiedToolResult[]): Part[] {
    return results.map((result) => ({
      functionResponse: {
        name: result.name,
        response: result.result as object,
      },
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

    // Extract system instruction
    const systemInstruction = allMessages.find((m) => m.role === "system")?.content;
    const chatMessages = allMessages.filter((m) => m.role !== "system");

    // Configure model - use type assertion to work around SDK limitations
    const tools = options.tools && options.tools.length > 0
      ? this.formatTools(options.tools)
      : undefined;

    const toolConfig = options.toolChoice
      ? this.formatToolChoice(options.toolChoice)
      : undefined;

    const geminiModel = client.getGenerativeModel({
      model: this.model,
      safetySettings: this.safetySettings,
      generationConfig: {
        temperature: options.temperature ?? 0.7,
        maxOutputTokens: options.maxTokens ?? 4000,
      },
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      tools: tools as any,
      toolConfig,
    });

    try {
      // Convert messages to Gemini format
      const contents = this.convertToGeminiContents(chatMessages);

      // Generate content
      const result = await geminiModel.generateContent({
        contents,
        ...(systemInstruction && { systemInstruction }),
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
        usage: response.usageMetadata
          ? {
              promptTokens: response.usageMetadata.promptTokenCount || 0,
              completionTokens: response.usageMetadata.candidatesTokenCount || 0,
              totalTokens: response.usageMetadata.totalTokenCount || 0,
            }
          : undefined,
      };
    } catch (error) {
      console.error("[Gemini Adapter] Error:", error);
      throw error;
    }
  }

  /**
   * Convert unified messages to Gemini Content format
   */
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
// Factory Registration
// ===========================================

export function createGeminiAdapter(model?: string): GeminiToolAdapter {
  return new GeminiToolAdapter(model);
}

// Register with factory
registerAdapter("gemini", () => createGeminiAdapter());
