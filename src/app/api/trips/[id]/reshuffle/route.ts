// ============================================
// REAL-TIME RESHUFFLING API
// ============================================
// Based on: docs/REALTIME_RESHUFFLING_ALGORITHM.md
// Implements Phase 1: Core Reshuffling Infrastructure
//
// Endpoints:
// - POST /api/trips/[id]/reshuffle - Check triggers and get suggestions
// - PUT /api/trips/[id]/reshuffle - Apply a reshuffle
// - DELETE /api/trips/[id]/reshuffle - Undo a reshuffle

import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse } from "@/types";
import type { DaySchedule } from "@/lib/schedule-builder";
import {
  ReshufflingService,
  createReshufflingService,
} from "@/lib/reshuffling-service";
import type {
  CheckTriggersRequest,
  CheckTriggersResponse,
  ApplyReshuffleRequest,
  ApplyReshuffleResponse,
  UndoReshuffleRequest,
  UndoReshuffleResponse,
  UserState,
} from "@/types/reshuffling";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Singleton service instance (in production, use proper state management)
let reshufflingService: ReshufflingService | null = null;

function getService(): ReshufflingService {
  if (!reshufflingService) {
    reshufflingService = createReshufflingService();
  }
  return reshufflingService;
}

// ============================================
// POST - Check triggers and get suggested reshuffles
// ============================================

interface CheckTriggersRequestBody {
  currentTime: string;
  dayNumber: number;
  schedule: DaySchedule;
  userReportedIssue?: string;
  userState?: UserState;
  currentLocation?: {
    lat: number;
    lng: number;
  };
}

export async function POST(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body: CheckTriggersRequestBody = await request.json();

    // Validate required fields
    if (!body.schedule || !body.currentTime) {
      const response: ApiResponse<null> = {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "schedule and currentTime are required",
        },
      };
      return NextResponse.json(response, { status: 400 });
    }

    const service = getService();

    // Build check triggers request
    const checkRequest: CheckTriggersRequest = {
      tripId: id,
      currentTime: body.currentTime,
      userReportedIssue: body.userReportedIssue,
      userState: body.userState,
      currentLocation: body.currentLocation,
    };

    // Check for triggers and get suggestions
    const result = service.checkTriggers(checkRequest, body.schedule);

    const response: ApiResponse<CheckTriggersResponse> = {
      success: true,
      data: result,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Reshuffle check error:", error);
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: "RESHUFFLE_CHECK_ERROR",
        message: error instanceof Error ? error.message : "Failed to check triggers",
      },
    };
    return NextResponse.json(response, { status: 500 });
  }
}

// ============================================
// PUT - Apply a reshuffling action
// ============================================

interface ApplyReshuffleRequestBody {
  triggerId: string;
  selectedStrategy: ApplyReshuffleRequest["selectedStrategy"];
  schedule: DaySchedule;
  customInput?: ApplyReshuffleRequest["customInput"];
}

export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body: ApplyReshuffleRequestBody = await request.json();

    // Validate required fields
    if (!body.triggerId || !body.selectedStrategy || !body.schedule) {
      const response: ApiResponse<null> = {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "triggerId, selectedStrategy, and schedule are required",
        },
      };
      return NextResponse.json(response, { status: 400 });
    }

    const service = getService();

    // Build apply request
    const applyRequest: ApplyReshuffleRequest = {
      tripId: id,
      triggerId: body.triggerId,
      selectedStrategy: body.selectedStrategy,
      customInput: body.customInput,
    };

    // Apply the reshuffle
    const result = service.applyReshuffle(applyRequest, body.schedule);

    const response: ApiResponse<ApplyReshuffleResponse> = {
      success: true,
      data: result,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Reshuffle apply error:", error);
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: "RESHUFFLE_APPLY_ERROR",
        message: error instanceof Error ? error.message : "Failed to apply reshuffle",
      },
    };
    return NextResponse.json(response, { status: 500 });
  }
}

// ============================================
// DELETE - Undo a reshuffling action
// ============================================

export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { searchParams } = new URL(request.url);
    const undoToken = searchParams.get("undoToken");

    if (!undoToken) {
      const response: ApiResponse<null> = {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "undoToken query parameter is required",
        },
      };
      return NextResponse.json(response, { status: 400 });
    }

    const service = getService();

    // Build undo request
    const undoRequest: UndoReshuffleRequest = {
      tripId: id,
      undoToken,
    };

    // Undo the reshuffle
    const result = service.undoReshuffle(undoRequest);

    if (!result.success) {
      const response: ApiResponse<null> = {
        success: false,
        error: {
          code: "UNDO_FAILED",
          message: result.message,
        },
      };
      return NextResponse.json(response, { status: 400 });
    }

    const response: ApiResponse<UndoReshuffleResponse> = {
      success: true,
      data: result,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Reshuffle undo error:", error);
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: "RESHUFFLE_UNDO_ERROR",
        message: error instanceof Error ? error.message : "Failed to undo reshuffle",
      },
    };
    return NextResponse.json(response, { status: 500 });
  }
}

// ============================================
// PATCH - Quick reshuffle from user message
// ============================================

interface QuickReshuffleRequestBody {
  message: string;
  schedule: DaySchedule;
  currentTime?: string;
  autoApply?: boolean;
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id: _id } = await params;
    const body: QuickReshuffleRequestBody = await request.json();

    // Validate required fields
    if (!body.message || !body.schedule) {
      const response: ApiResponse<null> = {
        success: false,
        error: {
          code: "VALIDATION_ERROR",
          message: "message and schedule are required",
        },
      };
      return NextResponse.json(response, { status: 400 });
    }

    const service = getService();

    // Get suggested reshuffle based on user message
    const suggestion = service.getSuggestedReshuffle(body.message, body.schedule);

    const response: ApiResponse<{
      suggestion: typeof suggestion;
      requiresConfirmation: boolean;
      preview: string;
    }> = {
      success: true,
      data: {
        suggestion,
        requiresConfirmation: suggestion.requiresConfirmation,
        preview: suggestion.explanation,
      },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Quick reshuffle error:", error);
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: "QUICK_RESHUFFLE_ERROR",
        message: error instanceof Error ? error.message : "Failed to process reshuffle request",
      },
    };
    return NextResponse.json(response, { status: 500 });
  }
}
