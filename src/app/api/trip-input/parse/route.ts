/**
 * API Route: Parse Trip Input
 *
 * Accepts natural language trip requests and returns structured TripInput.
 * Uses Ollama LLM for entity extraction, spelling correction, and conflict detection.
 *
 * POST /api/trip-input/parse
 * Body: { input: string, referenceDate?: string }
 * Returns: ParsedTripInput
 */

import { NextRequest, NextResponse } from "next/server";
import {
  parseTripInput,
  validateParsedInput,
  quickValidateInput,
  type ParsedTripInput,
  type ParseValidationResult,
} from "@/lib/trip-input-parser";

export interface ParseTripInputRequest {
  input: string;
  referenceDate?: string;
  quickValidate?: boolean;
}

export interface ParseTripInputResponse {
  success: boolean;
  data?: {
    parsed: ParsedTripInput;
    validation: ParseValidationResult;
  };
  error?: string;
  timing?: {
    parseMs: number;
    totalMs: number;
  };
}

export async function POST(
  request: NextRequest
): Promise<NextResponse<ParseTripInputResponse>> {
  const startTime = Date.now();

  try {
    const body: ParseTripInputRequest = await request.json();

    if (!body.input || typeof body.input !== "string") {
      return NextResponse.json(
        {
          success: false,
          error: "Missing or invalid 'input' field. Expected a string.",
        },
        { status: 400 }
      );
    }

    if (body.input.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: "Input cannot be empty.",
        },
        { status: 400 }
      );
    }

    // Parse the input using LLM
    const parseStart = Date.now();
    const parsed = await parseTripInput(body.input, body.referenceDate);
    const parseMs = Date.now() - parseStart;

    // Run validation
    const validation = validateParsedInput(parsed);

    // Also run quick (non-LLM) validation for additional checks
    if (body.quickValidate !== false) {
      const quickConflicts = quickValidateInput(parsed.tripInput);
      // Merge quick conflicts with LLM-detected conflicts, avoiding duplicates
      for (const conflict of quickConflicts) {
        const isDuplicate = validation.conflicts.some(
          (c) => c.type === conflict.type && c.message === conflict.message
        );
        if (!isDuplicate) {
          validation.conflicts.push(conflict);
        }
      }
    }

    const totalMs = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      data: {
        parsed,
        validation,
      },
      timing: {
        parseMs,
        totalMs,
      },
    });
  } catch (error) {
    console.error("[API] Error parsing trip input:", error);

    return NextResponse.json(
      {
        success: false,
        error:
          error instanceof Error
            ? error.message
            : "Failed to parse trip input",
      },
      { status: 500 }
    );
  }
}

// Health check / info endpoint
export async function GET(): Promise<NextResponse> {
  return NextResponse.json({
    endpoint: "/api/trip-input/parse",
    method: "POST",
    description: "Parse natural language trip requests into structured format",
    body: {
      input: "string (required) - The natural language trip request",
      referenceDate:
        "string (optional) - Reference date for relative date parsing (YYYY-MM-DD)",
      quickValidate:
        "boolean (optional, default: true) - Run additional non-LLM validation",
    },
    response: {
      success: "boolean",
      data: {
        parsed: "ParsedTripInput - The parsed trip input with extracted entities",
        validation: "ParseValidationResult - Validation results and suggestions",
      },
      timing: {
        parseMs: "number - Time spent parsing",
        totalMs: "number - Total request time",
      },
    },
  });
}
