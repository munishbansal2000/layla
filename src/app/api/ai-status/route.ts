import { NextResponse } from "next/server";
import { getAIModeInfo } from "@/lib/openai";
import { getLogStats, getAvailableReplays } from "@/lib/openai-logger";

// GET /api/ai-status - Get current AI mode and stats
export async function GET() {
  try {
    const modeInfo = getAIModeInfo();
    const stats = await getLogStats();
    const recentReplays = await getAvailableReplays("chat", 5);

    return NextResponse.json({
      success: true,
      data: {
        ...modeInfo,
        stats: {
          totalLogs: stats.total,
          chatLogs: stats.byType.chat,
          itineraryLogs: stats.byType.itinerary,
          successRate: `${stats.successRate.toFixed(1)}%`,
          avgDurationMs: Math.round(stats.avgDuration),
          totalTokensUsed: stats.tokenUsage.total,
          avgTokensPerRequest: Math.round(stats.tokenUsage.avg),
        },
        recentReplays: recentReplays.map((r) => ({
          id: r.id,
          timestamp: r.timestamp,
          preview: r.preview.substring(0, 50) + "...",
        })),
        howToSwitch: {
          toTest: "Set AI_MODE=test in .env.local and restart the server",
          toProd: "Set AI_MODE=prod in .env.local and restart the server",
        },
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
