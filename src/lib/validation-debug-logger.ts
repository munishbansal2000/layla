/**
 * Validation Debug Logger
 *
 * Captures and saves comprehensive debug information during the itinerary
 * generation and validation process. Saves all data to a JSON file under
 * the same trip ID for debugging and analysis.
 *
 * Data captured:
 * 1. User prompt - the original request from the user
 * 2. Prompt sent to OpenAI/LLM - the full constructed prompt
 * 3. Request structures - all intermediate data structures
 * 4. Validation results - outputs from validation services
 * 5. Remediations applied - changes made by remediation services
 */

import { promises as fs } from "fs";
import path from "path";
import type { StructuredItineraryData } from "@/types/structured-itinerary";
import type { RemediationChange } from "./itinerary-remediation";
import type { ItineraryValidationState } from "./itinerary-validation-service";

// ============================================
// TYPES
// ============================================

export interface LLMRequestCapture {
  provider: string;
  model?: string;
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
  jsonMode?: boolean;
  timestamp: string;
}

export interface LLMResponseCapture {
  rawResponse?: string;
  parsedResponse?: unknown;
  parseErrors?: string[];
  processingTimeMs?: number;
  timestamp: string;
}

export interface ValidationCapture {
  validationState: Partial<ItineraryValidationState>;
  violations: Array<{
    layer: string;
    severity: string;
    message: string;
    affectedSlotId?: string;
    resolution?: string;
  }>;
  healthScore: number;
  timestamp: string;
}

export interface RemediationCapture {
  algorithmicChanges: RemediationChange[];
  llmChanges: RemediationChange[];
  totalChanges: number;
  llmCallCount: number;
  processingTimeMs: number;
  timestamp: string;
}

export interface UserRequestCapture {
  /** The original user's natural language prompt (if provided) */
  tripPrompt?: string;
  rawRequest: Record<string, unknown>;
  parsedRequest?: Record<string, unknown>;
  validatedContext?: Record<string, unknown>;
  timestamp: string;
}

export interface ValidationDebugData {
  tripId: string;
  generatedAt: string;
  version: string;

  // 1. User prompt and original request
  userRequest: UserRequestCapture;

  // 2. Prompt sent to OpenAI/LLM
  llmRequest?: LLMRequestCapture;

  // 3. LLM response
  llmResponse?: LLMResponseCapture;

  // 4. Request structures used during processing
  requestStructures: {
    itineraryRequest?: Record<string, unknown>;
    flightConstraints?: Record<string, unknown>;
    transfers?: Array<Record<string, unknown>>;
    anchors?: Array<Record<string, unknown>>;
    hotels?: Array<Record<string, unknown>>;
  };

  // 5. Validation results
  validation?: ValidationCapture;

  // 6. Remediations applied
  remediation?: RemediationCapture;

  // 7. Final itinerary summary (not full data to save space)
  itinerarySummary: {
    destination: string;
    totalDays: number;
    totalSlots: number;
    totalOptions: number;
    cities: string[];
  };
}

// ============================================
// DEBUG LOGGER CLASS
// ============================================

export class ValidationDebugLogger {
  private data: Partial<ValidationDebugData>;
  private tripId: string;
  private enabled: boolean;

  constructor(tripId?: string) {
    this.tripId = tripId || "unknown";
    this.enabled = process.env.DEBUG_VALIDATION === "true" || process.env.NODE_ENV === "development";
    this.data = {
      tripId: this.tripId,
      generatedAt: new Date().toISOString(),
      version: "1.0.0",
      requestStructures: {},
    };
  }

  /**
   * Enable or disable debug logging
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
  }

  /**
   * Set the trip ID (can be set later if not known at construction time)
   */
  setTripId(tripId: string): void {
    this.tripId = tripId;
    this.data.tripId = tripId;
  }

  /**
   * Capture the original user request
   */
  captureUserRequest(
    rawRequest: Record<string, unknown>,
    parsedRequest?: Record<string, unknown>,
    validatedContext?: Record<string, unknown>
  ): void {
    if (!this.enabled) return;

    // Extract tripPrompt from raw request (the user's natural language prompt)
    const tripPrompt = typeof rawRequest.tripPrompt === "string" ? rawRequest.tripPrompt : undefined;

    this.data.userRequest = {
      tripPrompt,
      rawRequest: this.sanitizeForJson(rawRequest),
      parsedRequest: parsedRequest ? this.sanitizeForJson(parsedRequest) : undefined,
      validatedContext: validatedContext ? this.sanitizeForJson(validatedContext) : undefined,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Capture the LLM request (prompt sent to OpenAI/Gemini/Ollama)
   */
  captureLLMRequest(
    provider: string,
    systemPrompt: string,
    userPrompt: string,
    options?: {
      model?: string;
      temperature?: number;
      maxTokens?: number;
      jsonMode?: boolean;
    }
  ): void {
    if (!this.enabled) return;

    this.data.llmRequest = {
      provider,
      model: options?.model,
      systemPrompt,
      userPrompt,
      temperature: options?.temperature,
      maxTokens: options?.maxTokens,
      jsonMode: options?.jsonMode,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Capture the LLM response
   */
  captureLLMResponse(
    rawResponse?: string,
    parsedResponse?: unknown,
    parseErrors?: string[],
    processingTimeMs?: number
  ): void {
    if (!this.enabled) return;

    this.data.llmResponse = {
      rawResponse: rawResponse?.substring(0, 50000), // Limit to 50KB
      parsedResponse: parsedResponse ? this.sanitizeForJson(parsedResponse as Record<string, unknown>) : undefined,
      parseErrors,
      processingTimeMs,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Capture request structures used during processing
   */
  captureRequestStructures(structures: {
    itineraryRequest?: Record<string, unknown>;
    flightConstraints?: Record<string, unknown>;
    transfers?: Array<Record<string, unknown>>;
    anchors?: Array<Record<string, unknown>>;
    hotels?: Array<Record<string, unknown>>;
  }): void {
    if (!this.enabled) return;

    this.data.requestStructures = {
      ...this.data.requestStructures,
      ...this.sanitizeForJson(structures),
    };
  }

  /**
   * Capture validation results
   */
  captureValidation(
    validationState: ItineraryValidationState,
    healthScore: number
  ): void {
    if (!this.enabled) return;

    // Convert Map to array for JSON serialization
    const violations = validationState.violations.map((v) => ({
      layer: v.layer,
      severity: v.severity,
      message: v.message,
      affectedSlotId: v.affectedSlotId,
      resolution: v.resolution,
    }));

    this.data.validation = {
      validationState: {
        isValid: validationState.isValid,
        healthScore: validationState.healthScore,
        lastValidatedAt: validationState.lastValidatedAt,
      },
      violations,
      healthScore,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Capture remediation results
   */
  captureRemediation(
    algorithmicChanges: RemediationChange[],
    llmChanges: RemediationChange[],
    llmCallCount: number,
    processingTimeMs: number
  ): void {
    if (!this.enabled) return;

    this.data.remediation = {
      algorithmicChanges,
      llmChanges,
      totalChanges: algorithmicChanges.length + llmChanges.length,
      llmCallCount,
      processingTimeMs,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Capture itinerary summary
   */
  captureItinerarySummary(itinerary: StructuredItineraryData): void {
    if (!this.enabled) return;

    const totalSlots = itinerary.days.reduce((sum, d) => sum + d.slots.length, 0);
    const totalOptions = itinerary.days.reduce(
      (sum, d) => sum + d.slots.reduce((s, slot) => s + slot.options.length, 0),
      0
    );
    const cities = [...new Set(itinerary.days.map((d) => d.city))];

    this.data.itinerarySummary = {
      destination: itinerary.destination || "Unknown",
      totalDays: itinerary.days.length,
      totalSlots,
      totalOptions,
      cities,
    };
  }

  /**
   * Get the captured debug data
   */
  getData(): Partial<ValidationDebugData> {
    return this.data;
  }

  /**
   * Save the debug data to a JSON file
   */
  async save(): Promise<string | null> {
    if (!this.enabled) {
      console.log("[validation-debug] Debug logging disabled, skipping save");
      return null;
    }

    if (!this.tripId || this.tripId === "unknown") {
      console.warn("[validation-debug] No trip ID set, skipping save");
      return null;
    }

    try {
      const tripsDir = path.join(process.cwd(), "data", "trips");
      await fs.mkdir(tripsDir, { recursive: true });

      const filename = `${this.tripId}.debug.json`;
      const filePath = path.join(tripsDir, filename);

      const content = JSON.stringify(this.data, null, 2);
      await fs.writeFile(filePath, content, "utf-8");

      console.log(`[validation-debug] Saved debug data to ${filePath}`);
      return filePath;
    } catch (error) {
      console.error("[validation-debug] Failed to save debug data:", error);
      return null;
    }
  }

  /**
   * Sanitize an object for JSON serialization
   * Handles Maps, Sets, circular references, and large arrays
   */
  private sanitizeForJson(obj: Record<string, unknown>): Record<string, unknown> {
    const seen = new WeakSet();

    const sanitize = (value: unknown, depth = 0): unknown => {
      // Prevent too deep recursion
      if (depth > 10) {
        return "[max depth exceeded]";
      }

      // Handle null/undefined
      if (value === null || value === undefined) {
        return value;
      }

      // Handle primitives
      if (typeof value !== "object") {
        return value;
      }

      // Handle Date
      if (value instanceof Date) {
        return value.toISOString();
      }

      // Handle Map
      if (value instanceof Map) {
        const obj: Record<string, unknown> = {};
        value.forEach((v, k) => {
          obj[String(k)] = sanitize(v, depth + 1);
        });
        return obj;
      }

      // Handle Set
      if (value instanceof Set) {
        return Array.from(value).map((v) => sanitize(v, depth + 1));
      }

      // Handle circular references
      if (seen.has(value as object)) {
        return "[circular reference]";
      }
      seen.add(value as object);

      // Handle arrays
      if (Array.isArray(value)) {
        // Limit large arrays
        const limited = value.length > 100 ? value.slice(0, 100) : value;
        const result = limited.map((v) => sanitize(v, depth + 1));
        if (value.length > 100) {
          result.push(`[...${value.length - 100} more items]`);
        }
        return result;
      }

      // Handle objects
      const result: Record<string, unknown> = {};
      for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
        // Skip functions
        if (typeof val === "function") continue;
        result[key] = sanitize(val, depth + 1);
      }
      return result;
    };

    return sanitize(obj) as Record<string, unknown>;
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let currentLogger: ValidationDebugLogger | null = null;

/**
 * Get or create a validation debug logger for the current request
 */
export function getValidationDebugLogger(tripId?: string): ValidationDebugLogger {
  if (!currentLogger || (tripId && currentLogger.getData().tripId !== tripId)) {
    currentLogger = new ValidationDebugLogger(tripId);
  }
  return currentLogger;
}

/**
 * Set the current validation debug logger (used to sync across modules)
 */
export function setCurrentValidationDebugLogger(logger: ValidationDebugLogger): void {
  currentLogger = logger;
}

/**
 * Create a new validation debug logger
 */
export function createValidationDebugLogger(tripId?: string): ValidationDebugLogger {
  return new ValidationDebugLogger(tripId);
}

/**
 * Clear the current logger (call after saving)
 */
export function clearValidationDebugLogger(): void {
  currentLogger = null;
}
