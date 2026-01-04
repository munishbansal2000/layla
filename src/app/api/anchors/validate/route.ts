/**
 * API Route: Anchor Validation
 *
 * Validates trip anchors using hybrid approach:
 * 1. Client-side validation for quick format checks
 * 2. LLM semantic validation for logical conflicts and suggestions
 */

import { NextRequest, NextResponse } from "next/server";
import {
  validateAnchorsClient,
  validateAnchorsWithLLM,
  type AnchorValidationResult,
  type SemanticValidationResult,
  ANCHOR_VALIDATION_SYSTEM_PROMPT,
  buildAnchorValidationPrompt,
} from "@/lib/anchor-validation";
import {
  createValidationDebugLogger,
} from "@/lib/validation-debug-logger";
import type {
  FlightAnchor,
  HotelAnchor,
  ActivityAnchor,
} from "@/types/trip-input";

export interface AnchorValidationRequest {
  flights: FlightAnchor[];
  hotels: HotelAnchor[];
  activities: ActivityAnchor[];
  tripPrompt?: string;
  includeLLMValidation?: boolean; // Default true
}

export interface AnchorValidationResponse {
  success: boolean;
  clientValidation: {
    isValid: boolean;
    hasWarnings: boolean;
    issues: Array<{
      id: string;
      severity: "error" | "warning" | "info" | "suggestion";
      anchorType: string;
      anchorId?: string;
      field?: string;
      message: string;
      suggestion?: string;
    }>;
  };
  semanticValidation?: SemanticValidationResult;
  timing: {
    clientMs: number;
    llmMs?: number;
    totalMs: number;
  };
}

export async function POST(request: NextRequest) {
  const startTime = Date.now();

  // Create debug logger for this validation request
  const debugLogger = createValidationDebugLogger();

  try {
    const body: AnchorValidationRequest = await request.json();
    const {
      flights = [],
      hotels = [],
      activities = [],
      tripPrompt,
      includeLLMValidation = true,
    } = body;

    // Capture user request for debugging
    debugLogger.captureUserRequest(body as unknown as Record<string, unknown>);

    // Step 1: Client-side validation (fast)
    const clientStart = Date.now();
    const clientResult = validateAnchorsClient(flights, hotels, activities);
    const clientMs = Date.now() - clientStart;

    // Convert Map issues to array for JSON serialization
    const clientIssues = clientResult.issues.map((issue) => ({
      id: issue.id,
      severity: issue.severity,
      anchorType: issue.anchorType,
      anchorId: issue.anchorId,
      field: issue.field,
      message: issue.message,
      suggestion: issue.suggestion,
    }));

    // Capture request structures for debugging
    debugLogger.captureRequestStructures({
      flightConstraints: flights.length > 0 ? { flights } as unknown as Record<string, unknown> : undefined,
      anchors: activities as unknown as Array<Record<string, unknown>>,
      hotels: hotels as unknown as Array<Record<string, unknown>>,
    });

    // Step 2: LLM semantic validation (if requested and we have anchors)
    let semanticResult: SemanticValidationResult | undefined;
    let llmMs: number | undefined;

    const hasAnchors =
      flights.length > 0 || hotels.length > 0 || activities.length > 0;

    if (includeLLMValidation && hasAnchors) {
      const llmStart = Date.now();
      try {
        // Build the prompt for debugging capture
        const validationPrompt = buildAnchorValidationPrompt(flights, hotels, activities, tripPrompt);

        // Capture LLM request for debugging
        debugLogger.captureLLMRequest(
          "openai", // Default provider for anchor validation
          ANCHOR_VALIDATION_SYSTEM_PROMPT,
          validationPrompt,
          {
            jsonMode: true,
          }
        );

        semanticResult = await validateAnchorsWithLLM(
          flights,
          hotels,
          activities,
          tripPrompt
        );
        llmMs = Date.now() - llmStart;

        // Capture LLM response for debugging
        debugLogger.captureLLMResponse(
          JSON.stringify(semanticResult),
          semanticResult as unknown,
          undefined,
          llmMs
        );
      } catch (error) {
        console.error("[AnchorValidation API] LLM validation error:", error);
        // Capture error in debug log
        debugLogger.captureLLMResponse(
          undefined,
          undefined,
          [error instanceof Error ? error.message : "LLM validation failed"],
          Date.now() - llmStart
        );
        // Continue without LLM validation
      }
    }

    const totalMs = Date.now() - startTime;

    // Capture validation summary using the remediation capture
    // (reusing structure for consistency)
    debugLogger.captureRemediation(
      clientIssues.map(issue => ({
        type: `CLIENT_${issue.severity.toUpperCase()}`,
        day: 0,
        slot: issue.anchorId || null,
        reason: issue.message,
      })),
      semanticResult ? [
        ...semanticResult.errors.map(e => ({
          type: "LLM_ERROR",
          day: 0,
          slot: null,
          reason: e.message,
        })),
        ...semanticResult.warnings.map(w => ({
          type: "LLM_WARNING",
          day: 0,
          slot: null,
          reason: w.message,
        })),
      ] : [],
      includeLLMValidation && hasAnchors ? 1 : 0,
      totalMs
    );

    // Save debug data - use a timestamp-based ID since we don't have tripId yet
    const debugId = `anchor-validation-${Date.now()}`;
    debugLogger.setTripId(debugId);

    try {
      await debugLogger.save();
    } catch (debugSaveError) {
      console.warn("[AnchorValidation API] Failed to save debug data:", debugSaveError);
    }

    const response: AnchorValidationResponse = {
      success: true,
      clientValidation: {
        isValid: clientResult.isValid,
        hasWarnings: clientResult.hasWarnings,
        issues: clientIssues,
      },
      semanticValidation: semanticResult,
      timing: {
        clientMs,
        llmMs,
        totalMs,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("[AnchorValidation API] Error:", error);
    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error ? error.message : "Validation failed",
        timing: {
          clientMs: 0,
          totalMs: Date.now() - startTime,
        },
      },
      { status: 500 }
    );
  }
}
