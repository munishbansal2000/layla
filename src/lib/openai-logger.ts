import { promises as fs } from "fs";
import path from "path";

// ===========================================
// OpenAI Request/Response Logging Types
// ===========================================

export interface OpenAILogEntry {
  id: string;
  timestamp: string;
  type: "chat" | "itinerary" | "structured-itinerary";

  // Request details
  request: {
    model: string;
    messages: Array<{
      role: "system" | "user" | "assistant";
      content: string;
    }>;
    temperature?: number;
    max_tokens?: number;
    response_format?: { type: string };
  };

  // Response details
  response: {
    id?: string;
    content: string;
    finish_reason?: string;
    usage?: {
      prompt_tokens: number;
      completion_tokens: number;
      total_tokens: number;
    };
  };

  // Metadata
  metadata: {
    duration_ms: number;
    success: boolean;
    error?: string;
    user_context?: Record<string, unknown>;
  };
}

export interface LogIndex {
  total_entries: number;
  last_updated: string;
  entries: Array<{
    id: string;
    timestamp: string;
    type: "chat" | "itinerary" | "structured-itinerary";
    preview: string;
    success: boolean;
  }>;
}

// ===========================================
// Logger Configuration
// ===========================================

const LOG_DIR = process.env.OPENAI_LOG_DIR || "./openai-logs";
const MAX_LOG_ENTRIES = 1000; // Max entries to keep in index

// Ensure log directory exists
async function ensureLogDir(): Promise<void> {
  try {
    await fs.access(LOG_DIR);
  } catch {
    await fs.mkdir(LOG_DIR, { recursive: true });
  }
}

// Generate unique ID for log entries
function generateLogId(): string {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 8);
  return `log_${timestamp}_${random}`;
}

// Get date-based subdirectory path
function getDatePath(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}/${month}/${day}`;
}

// ===========================================
// Core Logging Functions
// ===========================================

export async function logOpenAIRequest(entry: OpenAILogEntry): Promise<string> {
  await ensureLogDir();

  const datePath = getDatePath();
  const fullDir = path.join(LOG_DIR, datePath);

  // Create date-based subdirectory
  await fs.mkdir(fullDir, { recursive: true });

  // Save individual log entry
  const logFile = path.join(fullDir, `${entry.id}.json`);
  await fs.writeFile(logFile, JSON.stringify(entry, null, 2));

  // Update index
  await updateLogIndex(entry);

  return entry.id;
}

async function updateLogIndex(entry: OpenAILogEntry): Promise<void> {
  const indexPath = path.join(LOG_DIR, "index.json");

  let index: LogIndex;

  try {
    const content = await fs.readFile(indexPath, "utf-8");
    index = JSON.parse(content);
  } catch {
    index = {
      total_entries: 0,
      last_updated: new Date().toISOString(),
      entries: [],
    };
  }

  // Add new entry to the beginning
  const preview = entry.request.messages
    .filter((m) => m.role === "user")
    .map((m) => m.content.substring(0, 100))
    .join(" ")
    .substring(0, 150);

  index.entries.unshift({
    id: entry.id,
    timestamp: entry.timestamp,
    type: entry.type,
    preview: preview + (preview.length >= 150 ? "..." : ""),
    success: entry.metadata.success,
  });

  // Keep only the most recent entries
  if (index.entries.length > MAX_LOG_ENTRIES) {
    index.entries = index.entries.slice(0, MAX_LOG_ENTRIES);
  }

  index.total_entries++;
  index.last_updated = new Date().toISOString();

  await fs.writeFile(indexPath, JSON.stringify(index, null, 2));
}

// ===========================================
// Retrieval Functions
// ===========================================

export async function getLogEntry(id: string): Promise<OpenAILogEntry | null> {
  await ensureLogDir();

  // Search in index first to find the date
  const indexPath = path.join(LOG_DIR, "index.json");

  try {
    const indexContent = await fs.readFile(indexPath, "utf-8");
    const index: LogIndex = JSON.parse(indexContent);

    const entry = index.entries.find((e) => e.id === id);
    if (entry) {
      const date = new Date(entry.timestamp);
      const datePath = `${date.getFullYear()}/${String(date.getMonth() + 1).padStart(2, "0")}/${String(date.getDate()).padStart(2, "0")}`;
      const logFile = path.join(LOG_DIR, datePath, `${id}.json`);

      const content = await fs.readFile(logFile, "utf-8");
      return JSON.parse(content);
    }
  } catch {
    // Fall through to directory scan
  }

  return null;
}

export async function getLogIndex(): Promise<LogIndex> {
  await ensureLogDir();

  const indexPath = path.join(LOG_DIR, "index.json");

  try {
    const content = await fs.readFile(indexPath, "utf-8");
    return JSON.parse(content);
  } catch {
    return {
      total_entries: 0,
      last_updated: new Date().toISOString(),
      entries: [],
    };
  }
}

export async function getLogsByType(
  type: "chat" | "itinerary" | "structured-itinerary",
  limit: number = 50
): Promise<OpenAILogEntry[]> {
  const index = await getLogIndex();

  const filteredEntries = index.entries
    .filter((e) => e.type === type)
    .slice(0, limit);

  const logs: OpenAILogEntry[] = [];

  for (const entry of filteredEntries) {
    const log = await getLogEntry(entry.id);
    if (log) logs.push(log);
  }

  return logs;
}

export async function getLogsByDateRange(
  startDate: Date,
  endDate: Date,
  limit: number = 100
): Promise<OpenAILogEntry[]> {
  const index = await getLogIndex();

  const filteredEntries = index.entries
    .filter((e) => {
      const entryDate = new Date(e.timestamp);
      return entryDate >= startDate && entryDate <= endDate;
    })
    .slice(0, limit);

  const logs: OpenAILogEntry[] = [];

  for (const entry of filteredEntries) {
    const log = await getLogEntry(entry.id);
    if (log) logs.push(log);
  }

  return logs;
}

// ===========================================
// Replay Functions
// ===========================================

export interface ReplayResult {
  original: OpenAILogEntry;
  canReplay: boolean;
  replayData?: {
    messages: Array<{ role: string; content: string }>;
    model: string;
    temperature?: number;
    max_tokens?: number;
  };
}

export async function prepareReplay(logId: string): Promise<ReplayResult | null> {
  const entry = await getLogEntry(logId);

  if (!entry) {
    return null;
  }

  return {
    original: entry,
    canReplay: entry.metadata.success,
    replayData: {
      messages: entry.request.messages,
      model: entry.request.model,
      temperature: entry.request.temperature,
      max_tokens: entry.request.max_tokens,
    },
  };
}

// ===========================================
// Smart Replay Matching
// ===========================================

export interface ReplayMatch {
  found: boolean;
  entry?: OpenAILogEntry;
  matchScore?: number;
  matchType?: "exact" | "fuzzy" | "context";
}

/**
 * Find a matching log entry for replay based on the request
 * Strategies:
 * 1. Exact match - ENTIRE conversation history must match (for chat)
 * 2. Context match - same destination/preferences (for itinerary)
 *
 * NOTE: For chat, we match the FULL conversation, not just the last message.
 * This ensures we don't replay a response from a different conversation context.
 */
export async function findReplayMatch(
  type: "chat" | "itinerary" | "structured-itinerary",
  messages: Array<{ role: string; content: string }>,
  userContext?: Record<string, unknown>
): Promise<ReplayMatch> {
  const index = await getLogIndex();

  // Filter entries by type and success
  const candidates = index.entries.filter(
    (e) => e.type === type && e.success
  );

  if (candidates.length === 0) {
    return { found: false };
  }

  // For chat: we need to match the ENTIRE conversation, not just the last message
  // This prevents replaying a response from a different conversation context
  if (type === "chat") {
    // Extract all user messages for matching
    const userMessages = messages
      .filter((m) => m.role === "user")
      .map((m) => m.content.toLowerCase().trim());

    const conversationKey = userMessages.join("|||");

    for (const candidate of candidates) {
      const entry = await getLogEntry(candidate.id);
      if (!entry) continue;

      const entryUserMessages = entry.request.messages
        .filter((m) => m.role === "user")
        .map((m) => m.content.toLowerCase().trim());

      const entryConversationKey = entryUserMessages.join("|||");

      // Exact match: all user messages must match in order
      if (conversationKey === entryConversationKey) {
        console.log(`[Replay] Exact conversation match found: ${entry.id}`);
        return {
          found: true,
          entry,
          matchScore: 1.0,
          matchType: "exact",
        };
      }
    }

    // No match found for chat - don't use fuzzy matching as it breaks context
    console.log("[Replay] No exact conversation match - will call OpenAI");
    return { found: false };
  }

  // For itinerary or structured-itinerary: context match on destination/preferences
  if ((type === "itinerary" || type === "structured-itinerary") && userContext) {
    for (const candidate of candidates) {
      const entry = await getLogEntry(candidate.id);
      if (!entry) continue;

      if (entry.metadata.user_context) {
        const contextMatch = matchItineraryContext(userContext, entry.metadata.user_context);
        if (contextMatch > 0.8) {
          console.log(`[Replay] Context match found: ${entry.id} (score: ${contextMatch})`);
          return {
            found: true,
            entry,
            matchScore: contextMatch,
            matchType: "context",
          };
        }
      }
    }
  }

  return { found: false };
}

/**
 * Match itinerary context (destination, dates, preferences)
 * Supports both flat structure (budget, pace at root) and nested (preferences.budget, preferences.pace)
 */
function matchItineraryContext(
  ctx1: Record<string, unknown>,
  ctx2: Record<string, unknown>
): number {
  let matches = 0;
  let total = 0;

  // Check destination (required for any match)
  if (ctx1.destination && ctx2.destination) {
    total++;
    if (
      String(ctx1.destination).toLowerCase() ===
      String(ctx2.destination).toLowerCase()
    ) {
      matches++;
    }
  }

  // Check travelers (compare adults and children if nested)
  const travelers1 = ctx1.travelers as { adults?: number; children?: number } | number | undefined;
  const travelers2 = ctx2.travelers as { adults?: number; children?: number } | number | undefined;

  if (travelers1 !== undefined && travelers2 !== undefined) {
    total++;
    if (typeof travelers1 === 'object' && typeof travelers2 === 'object') {
      if (travelers1.adults === travelers2.adults && travelers1.children === travelers2.children) {
        matches++;
      }
    } else if (travelers1 === travelers2) {
      matches++;
    }
  }

  // Get budget - support both flat (ctx.budget) and nested (ctx.preferences.budget)
  const getBudget = (ctx: Record<string, unknown>): string | undefined => {
    if (ctx.budget) return String(ctx.budget);
    const prefs = ctx.preferences as Record<string, unknown> | undefined;
    if (prefs?.budget) return String(prefs.budget);
    return undefined;
  };

  // Get pace - support both flat (ctx.pace) and nested (ctx.preferences.pace)
  const getPace = (ctx: Record<string, unknown>): string | undefined => {
    if (ctx.pace) return String(ctx.pace);
    const prefs = ctx.preferences as Record<string, unknown> | undefined;
    if (prefs?.pace) return String(prefs.pace);
    return undefined;
  };

  // Check budget
  const budget1 = getBudget(ctx1);
  const budget2 = getBudget(ctx2);
  if (budget1 && budget2) {
    total++;
    if (budget1.toLowerCase() === budget2.toLowerCase()) matches++;
  }

  // Check pace
  const pace1 = getPace(ctx1);
  const pace2 = getPace(ctx2);
  if (pace1 && pace2) {
    total++;
    if (pace1.toLowerCase() === pace2.toLowerCase()) matches++;
  }

  // Check interests (if present)
  const interests1 = ctx1.interests as string[] | undefined;
  const interests2 = ctx2.interests as string[] | undefined;
  if (interests1 && interests2 && interests1.length > 0 && interests2.length > 0) {
    total++;
    const set1 = new Set(interests1.map(i => i.toLowerCase()));
    const set2 = new Set(interests2.map(i => i.toLowerCase()));
    const intersection = [...set1].filter(i => set2.has(i));
    if (intersection.length >= Math.min(set1.size, set2.size) * 0.5) {
      matches++;
    }
  }

  // Check tripMode (if present)
  if (ctx1.tripMode && ctx2.tripMode) {
    total++;
    if (String(ctx1.tripMode).toLowerCase() === String(ctx2.tripMode).toLowerCase()) {
      matches++;
    }
  }

  console.log(`[Replay] Context match: ${matches}/${total} = ${total > 0 ? (matches / total).toFixed(2) : 0}`);
  return total > 0 ? matches / total : 0;
}

/**
 * Get all successful logs for a specific type (for listing available replays)
 */
export async function getAvailableReplays(
  type: "chat" | "itinerary" | "structured-itinerary",
  limit: number = 20
): Promise<Array<{
  id: string;
  timestamp: string;
  preview: string;
  context?: Record<string, unknown>;
}>> {
  const index = await getLogIndex();

  const entries = index.entries
    .filter((e) => e.type === type && e.success)
    .slice(0, limit);

  const results = [];

  for (const e of entries) {
    const full = await getLogEntry(e.id);
    results.push({
      id: e.id,
      timestamp: e.timestamp,
      preview: e.preview,
      context: full?.metadata.user_context,
    });
  }

  return results;
}

// ===========================================
// Utility Functions
// ===========================================

export async function getLogStats(): Promise<{
  total: number;
  byType: { chat: number; itinerary: number; "structured-itinerary": number };
  successRate: number;
  avgDuration: number;
  tokenUsage: { total: number; avg: number };
}> {
  const index = await getLogIndex();

  let chatCount = 0;
  let itineraryCount = 0;
  let structuredItineraryCount = 0;
  let successCount = 0;
  let totalDuration = 0;
  let totalTokens = 0;
  let entriesWithTokens = 0;

  for (const entry of index.entries.slice(0, 100)) {
    if (entry.type === "chat") chatCount++;
    else if (entry.type === "structured-itinerary") structuredItineraryCount++;
    else itineraryCount++;
    if (entry.success) successCount++;

    // Get full entry for detailed stats
    const fullEntry = await getLogEntry(entry.id);
    if (fullEntry) {
      totalDuration += fullEntry.metadata.duration_ms;
      if (fullEntry.response.usage) {
        totalTokens += fullEntry.response.usage.total_tokens;
        entriesWithTokens++;
      }
    }
  }

  const total = index.entries.length;

  return {
    total: index.total_entries,
    byType: { chat: chatCount, itinerary: itineraryCount, "structured-itinerary": structuredItineraryCount },
    successRate: total > 0 ? (successCount / total) * 100 : 0,
    avgDuration: total > 0 ? totalDuration / total : 0,
    tokenUsage: {
      total: totalTokens,
      avg: entriesWithTokens > 0 ? totalTokens / entriesWithTokens : 0,
    },
  };
}

export async function clearOldLogs(daysToKeep: number = 30): Promise<number> {
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - daysToKeep);

  const index = await getLogIndex();
  let deletedCount = 0;

  for (const entry of index.entries) {
    const entryDate = new Date(entry.timestamp);
    if (entryDate < cutoffDate) {
      const log = await getLogEntry(entry.id);
      if (log) {
        const datePath = `${entryDate.getFullYear()}/${String(entryDate.getMonth() + 1).padStart(2, "0")}/${String(entryDate.getDate()).padStart(2, "0")}`;
        const logFile = path.join(LOG_DIR, datePath, `${entry.id}.json`);

        try {
          await fs.unlink(logFile);
          deletedCount++;
        } catch {
          // File may already be deleted
        }
      }
    }
  }

  // Update index to remove deleted entries
  const newEntries = index.entries.filter((e) => new Date(e.timestamp) >= cutoffDate);
  index.entries = newEntries;
  index.last_updated = new Date().toISOString();

  const indexPath = path.join(LOG_DIR, "index.json");
  await fs.writeFile(indexPath, JSON.stringify(index, null, 2));

  return deletedCount;
}

// ===========================================
// Helper to Create Log Entry
// ===========================================

export function createLogEntry(
  type: "chat" | "itinerary" | "structured-itinerary",
  request: OpenAILogEntry["request"],
  response: OpenAILogEntry["response"],
  durationMs: number,
  success: boolean,
  error?: string,
  userContext?: Record<string, unknown>
): OpenAILogEntry {
  return {
    id: generateLogId(),
    timestamp: new Date().toISOString(),
    type,
    request,
    response,
    metadata: {
      duration_ms: durationMs,
      success,
      error,
      user_context: userContext,
    },
  };
}
