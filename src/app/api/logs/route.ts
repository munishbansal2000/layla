import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse } from "@/types";
import {
  getLogIndex,
  getLogEntry,
  getLogsByType,
  getLogStats,
  prepareReplay,
  clearOldLogs,
  type OpenAILogEntry,
  type LogIndex,
} from "@/lib/openai-logger";

// GET /api/logs - Get log index or specific log
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");
    const type = searchParams.get("type") as "chat" | "itinerary" | null;
    const action = searchParams.get("action");
    const limit = parseInt(searchParams.get("limit") || "50");

    // Get stats
    if (action === "stats") {
      const stats = await getLogStats();
      return NextResponse.json({
        success: true,
        data: stats,
      });
    }

    // Prepare replay data for a specific log
    if (action === "replay" && id) {
      const replayData = await prepareReplay(id);
      if (!replayData) {
        return NextResponse.json({
          success: false,
          error: { code: "NOT_FOUND", message: "Log entry not found" },
        }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        data: replayData,
      });
    }

    // Get specific log entry by ID
    if (id) {
      const entry = await getLogEntry(id);
      if (!entry) {
        return NextResponse.json({
          success: false,
          error: { code: "NOT_FOUND", message: "Log entry not found" },
        }, { status: 404 });
      }
      return NextResponse.json({
        success: true,
        data: { entry },
      });
    }

    // Get logs by type
    if (type) {
      const logs = await getLogsByType(type, limit);
      return NextResponse.json({
        success: true,
        data: { logs, count: logs.length },
      });
    }

    // Get log index (default)
    const index = await getLogIndex();
    return NextResponse.json({
      success: true,
      data: {
        index: {
          ...index,
          entries: index.entries.slice(0, limit),
        },
      },
    });
  } catch (error) {
    console.error("Logs API error:", error);
    return NextResponse.json({
      success: false,
      error: {
        code: "FETCH_ERROR",
        message: error instanceof Error ? error.message : "Failed to fetch logs",
      },
    }, { status: 500 });
  }
}

// POST /api/logs - Perform actions (cleanup, replay)
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action, params } = body;

    switch (action) {
      case "cleanup": {
        const daysToKeep = params?.daysToKeep || 30;
        const deletedCount = await clearOldLogs(daysToKeep);
        return NextResponse.json({
          success: true,
          data: { deletedCount, message: `Deleted ${deletedCount} old log entries` },
        });
      }

      case "replay": {
        const { logId } = params;
        if (!logId) {
          return NextResponse.json({
            success: false,
            error: { code: "MISSING_PARAM", message: "logId is required" },
          }, { status: 400 });
        }

        const replayData = await prepareReplay(logId);
        if (!replayData) {
          return NextResponse.json({
            success: false,
            error: { code: "NOT_FOUND", message: "Log entry not found" },
          }, { status: 404 });
        }

        // Return the replay data - client can use it to make a new request
        return NextResponse.json({
          success: true,
          data: {
            original: replayData.original,
            replayPayload: replayData.replayData,
            canReplay: replayData.canReplay,
          },
        });
      }

      default:
        return NextResponse.json({
          success: false,
          error: { code: "INVALID_ACTION", message: `Unknown action: ${action}` },
        }, { status: 400 });
    }
  } catch (error) {
    console.error("Logs API error:", error);
    return NextResponse.json({
      success: false,
      error: {
        code: "ACTION_ERROR",
        message: error instanceof Error ? error.message : "Failed to perform action",
      },
    }, { status: 500 });
  }
}
