import { NextResponse } from "next/server";
import { llm } from "@/lib/llm";
import { getLogStats, getAvailableReplays } from "@/lib/openai-logger";

// GET /api/ai-status - Get current AI mode and stats
export async function GET() {
  try {
    const providerInfo = llm.getProviderInfo();
    const stats = await getLogStats();
    const recentReplays = await getAvailableReplays("chat", 5);

    return NextResponse.json({
      success: true,
      data: {
        mode: providerInfo.mode,
        provider: providerInfo.provider,
        model: providerInfo.model,
        description: providerInfo.description,
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
          toOllama: "Set AI_PROVIDER=ollama in .env.local and restart the server",
          toGemini: "Set AI_PROVIDER=gemini in .env.local and restart the server",
          toOpenAI: "Set AI_PROVIDER=openai in .env.local and restart the server",
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
