/**
 * Action Recommender
 *
 * Uses LLM (Ollama by default) to generate smart, context-aware action options
 * for execution events. Instead of static buttons, we generate dynamic options
 * based on the full context of what's happening.
 *
 * Flow:
 * 1. Receive event + aggregated context
 * 2. Format context for LLM
 * 3. LLM generates 2-4 smart options
 * 4. Parse and validate options
 * 5. Return enriched event with dynamic actions
 */

import { llm } from "../llm";
import type { QueuedEvent, QueuedEventAction } from "./execution-queue";
import type { AggregatedContext } from "./context-aggregator";
import { formatContextAsJSON } from "./context-aggregator";

// ============================================
// TYPES
// ============================================

export interface RecommendedAction {
  id: string;
  label: string;
  message: string;
  impact: string;
  variant: "primary" | "secondary" | "warning";
  actionType: QueuedEventAction["type"];
  payload?: Record<string, unknown>;
}

export interface ActionRecommendation {
  /** Analysis of the situation */
  analysis: string;

  /** Whether we should show this event at all */
  shouldShow: boolean;

  /** Reason for showing/not showing */
  showReason: string;

  /** The message to show the user (may be different from original event) */
  message: string;

  /** Recommended actions (2-4 options) */
  actions: RecommendedAction[];

  /** Suggested tone for the message */
  tone: "relaxed" | "informative" | "urgent" | "empathetic";
}

export interface ActionRecommenderConfig {
  /** LLM provider to use (defaults to current provider) */
  provider?: "ollama" | "openai" | "gemini";

  /** Model to use */
  model?: string;

  /** Temperature for LLM (lower = more deterministic) */
  temperature?: number;

  /** Maximum actions to generate */
  maxActions?: number;

  /** Timeout in milliseconds */
  timeoutMs?: number;

  /** Whether to use fallback static actions on LLM failure */
  useFallbackOnError?: boolean;
}

// ============================================
// SYSTEM PROMPT
// ============================================

const ACTION_RECOMMENDER_SYSTEM_PROMPT = `You are a helpful travel assistant AI that helps users during their trip execution.
Your job is to analyze the current situation and suggest 2-4 smart actions the user can take.

IMPORTANT PRINCIPLES:
1. DON'T OVERWHELM - Only suggest actions when decisions are actually needed
2. BE CONTEXT-AWARE - Consider bookings, timing, weather, and user's current state
3. PRIORITIZE - Put the best option first (variant: "primary")
4. BE HELPFUL - If they skip something, help them find alternatives
5. BE CONCISE - Short labels (max 20 chars), brief explanations

ACTION TYPES you can suggest:
- "confirm" - Acknowledge/proceed (e.g., "Let's go!", "Got it")
- "skip" - Skip current/upcoming activity (requires slotId in payload)
- "extend" - Extend current activity (requires slotId and minutes in payload)
- "navigate" - Get directions
- "swap" - Find alternatives
- "dismiss" - Dismiss the notification
- "chat" - Send a message to the AI (requires message in payload)

VARIANTS:
- "primary" - Main recommended action (green/purple)
- "secondary" - Alternative options (gray)
- "warning" - Risky actions like skipping bookings (red)

RESPONSE FORMAT (JSON):
{
  "analysis": "Brief analysis of the situation",
  "shouldShow": true/false,
  "showReason": "Why we should/shouldn't interrupt the user",
  "message": "The message to show (can improve on original)",
  "tone": "relaxed|informative|urgent|empathetic",
  "actions": [
    {
      "id": "unique_id",
      "label": "Short Label",
      "message": "Brief explanation",
      "impact": "What happens if they choose this",
      "variant": "primary|secondary|warning",
      "actionType": "confirm|skip|extend|navigate|swap|dismiss|chat",
      "payload": { "slotId": "...", "minutes": 15 }
    }
  ]
}`;

// ============================================
// DEFAULT CONFIG
// ============================================

const DEFAULT_CONFIG: ActionRecommenderConfig = {
  temperature: 0.3,
  maxActions: 4,
  timeoutMs: 10000,
  useFallbackOnError: true,
};

// ============================================
// ACTION RECOMMENDER CLASS
// ============================================

export class ActionRecommender {
  private config: ActionRecommenderConfig;

  constructor(config: Partial<ActionRecommenderConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Generate recommended actions for an event
   */
  async recommend(
    event: QueuedEvent,
    context: AggregatedContext
  ): Promise<ActionRecommendation> {
    try {
      // Build the prompt
      const prompt = this.buildPrompt(event, context);

      // Call LLM
      const response = await this.callLLM(prompt);

      // Parse and validate
      const recommendation = this.parseResponse(response, event, context);

      return recommendation;
    } catch (error) {
      console.error("[ActionRecommender] Error generating recommendations:", error);

      // Use fallback if configured
      if (this.config.useFallbackOnError) {
        return this.getFallbackRecommendation(event, context);
      }

      throw error;
    }
  }

  /**
   * Build the prompt for the LLM
   */
  private buildPrompt(event: QueuedEvent, context: AggregatedContext): string {
    const contextJson = formatContextAsJSON(context);

    return `Given this execution event and context, suggest 2-4 smart actions for the user.

EVENT:
Type: ${event.type}
Title: ${event.title}
Message: ${event.message}
Priority: ${event.priority}
${event.slotId ? `Slot ID: ${event.slotId}` : ""}
${event.tip ? `Tip: ${event.tip}` : ""}

CONTEXT:
${JSON.stringify(contextJson, null, 2)}

Based on the context summary:
- Urgency: ${context.summary.urgencyLevel}
- Decision Required: ${context.summary.decisionRequired}
- Primary Concern: ${context.summary.primaryConcern || "None"}
- Suggested Tone: ${context.summary.suggestedTone}

Generate appropriate actions. Remember:
- If urgency is "low" and no decision required, consider shouldShow: false
- If there's a booking at risk, make the primary action about preserving it
- If they're skipping a meal, suggest nearby alternatives
- Keep it simple - don't overwhelm with options

Respond with valid JSON only.`;
  }

  /**
   * Call the LLM
   */
  private async callLLM(prompt: string): Promise<string> {
    const response = await llm.chat(
      [{ role: "user", content: prompt }],
      {
        systemPrompt: ACTION_RECOMMENDER_SYSTEM_PROMPT,
        temperature: this.config.temperature,
      }
    );

    return response;
  }

  /**
   * Parse and validate the LLM response
   */
  private parseResponse(
    response: string,
    event: QueuedEvent,
    context: AggregatedContext
  ): ActionRecommendation {
    // Extract JSON from response (handle markdown code blocks)
    let jsonStr = response;
    const jsonMatch = response.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch) {
      jsonStr = jsonMatch[1].trim();
    }

    // Try to parse
    let parsed: Partial<ActionRecommendation>;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      // If parsing fails, try to extract just the JSON object
      const objectMatch = response.match(/\{[\s\S]*\}/);
      if (objectMatch) {
        parsed = JSON.parse(objectMatch[0]);
      } else {
        throw new Error("Failed to parse LLM response as JSON");
      }
    }

    // Validate and normalize
    return this.normalizeRecommendation(parsed, event, context);
  }

  /**
   * Normalize and validate the parsed recommendation
   */
  private normalizeRecommendation(
    parsed: Partial<ActionRecommendation>,
    event: QueuedEvent,
    context: AggregatedContext
  ): ActionRecommendation {
    // Ensure required fields
    const recommendation: ActionRecommendation = {
      analysis: parsed.analysis || "No analysis provided",
      shouldShow: parsed.shouldShow !== false, // Default to true
      showReason: parsed.showReason || "Default: show event",
      message: parsed.message || event.message,
      tone: parsed.tone || context.summary.suggestedTone,
      actions: [],
    };

    // Validate and normalize actions
    if (Array.isArray(parsed.actions)) {
      recommendation.actions = parsed.actions
        .slice(0, this.config.maxActions)
        .map((action, index) => this.normalizeAction(action, event, index));
    }

    // Ensure at least one action if showing
    if (recommendation.shouldShow && recommendation.actions.length === 0) {
      recommendation.actions = this.getDefaultActions(event, context);
    }

    return recommendation;
  }

  /**
   * Normalize a single action
   */
  private normalizeAction(
    action: Partial<RecommendedAction>,
    event: QueuedEvent,
    index: number
  ): RecommendedAction {
    return {
      id: action.id || `action_${index}_${Date.now()}`,
      label: (action.label || "Continue").slice(0, 20),
      message: action.message || "",
      impact: action.impact || "",
      variant: action.variant || (index === 0 ? "primary" : "secondary"),
      actionType: this.validateActionType(action.actionType),
      payload: action.payload,
    };
  }

  /**
   * Validate action type
   */
  private validateActionType(type?: string): QueuedEventAction["type"] {
    const validTypes: QueuedEventAction["type"][] = [
      "skip",
      "extend",
      "swap",
      "confirm",
      "dismiss",
      "navigate",
      "chat",
    ];

    if (type && validTypes.includes(type as QueuedEventAction["type"])) {
      return type as QueuedEventAction["type"];
    }

    return "confirm";
  }

  /**
   * Get default actions based on event type
   */
  private getDefaultActions(
    event: QueuedEvent,
    context: AggregatedContext
  ): RecommendedAction[] {
    // Return the original event actions converted to our format
    if (event.actions && event.actions.length > 0) {
      return event.actions.map((a, i) => ({
        id: a.id,
        label: a.label,
        message: "",
        impact: "",
        variant: (a.variant === "danger" ? "warning" : a.variant) || (i === 0 ? "primary" : "secondary") as RecommendedAction["variant"],
        actionType: a.type,
        payload: a.payload as Record<string, unknown> | undefined,
      }));
    }

    // Fallback to simple confirm/dismiss
    return [
      {
        id: "confirm",
        label: "Got it",
        message: "Acknowledge and continue",
        impact: "Continue with your trip",
        variant: "primary",
        actionType: "confirm",
      },
      {
        id: "dismiss",
        label: "Dismiss",
        message: "Hide this notification",
        impact: "Notification will be hidden",
        variant: "secondary",
        actionType: "dismiss",
      },
    ];
  }

  /**
   * Get fallback recommendation when LLM fails
   */
  private getFallbackRecommendation(
    event: QueuedEvent,
    context: AggregatedContext
  ): ActionRecommendation {
    return {
      analysis: "Using fallback due to LLM error",
      shouldShow: context.summary.decisionRequired || event.priority !== "low",
      showReason: "Fallback: showing based on priority and decision requirement",
      message: event.message,
      tone: context.summary.suggestedTone,
      actions: this.getDefaultActions(event, context),
    };
  }
}

// ============================================
// CONVERT RECOMMENDATION TO QUEUED EVENT ACTIONS
// ============================================

/**
 * Convert recommended actions to QueuedEventAction format
 */
export function toQueuedEventActions(
  actions: RecommendedAction[]
): QueuedEventAction[] {
  return actions.map((action) => ({
    id: action.id,
    label: action.label,
    type: action.actionType,
    payload: action.payload as QueuedEventAction["payload"],
    // Map "warning" variant to "danger" for QueuedEventAction compatibility
    variant: action.variant === "warning" ? "danger" : action.variant,
  }));
}

/**
 * Enrich an event with LLM-recommended actions
 */
export async function enrichEventWithRecommendations(
  event: QueuedEvent,
  context: AggregatedContext,
  recommender?: ActionRecommender
): Promise<{ event: QueuedEvent; recommendation: ActionRecommendation }> {
  const rec = recommender || new ActionRecommender();
  const recommendation = await rec.recommend(event, context);

  // Create enriched event with new actions
  const enrichedEvent: QueuedEvent = {
    ...event,
    message: recommendation.message,
    actions: toQueuedEventActions(recommendation.actions),
  };

  return { event: enrichedEvent, recommendation };
}

// ============================================
// QUICK RECOMMENDATIONS (Without full LLM call)
// ============================================

/**
 * Generate quick recommendations based on rules (no LLM call)
 * Use this for common scenarios where LLM is overkill
 */
export function quickRecommend(
  event: QueuedEvent,
  context: AggregatedContext
): ActionRecommendation | null {
  const { summary, schedule } = context;

  // Scenario: Duration warning with plenty of buffer
  if (
    event.type === "duration_warning" &&
    !schedule.hasBookingsAtRisk &&
    schedule.upcomingActivities[0]?.bufferMinutes > 30
  ) {
    return {
      analysis: "Plenty of buffer time, no rush needed",
      shouldShow: false,
      showReason: `${schedule.upcomingActivities[0].bufferMinutes} min buffer, no bookings at risk`,
      message: event.message,
      tone: "relaxed",
      actions: [],
    };
  }

  // Scenario: Arrival at regular venue (no booking)
  if (
    event.type === "arrival" &&
    !schedule.currentSlot?.fragility?.bookingRequired
  ) {
    return {
      analysis: "Simple arrival, no booking to check in",
      shouldShow: false,
      showReason: "User knows they arrived, no action needed",
      message: event.message,
      tone: "relaxed",
      actions: [],
    };
  }

  // Scenario: Morning briefing - always show with start action
  if (event.type === "morning_briefing") {
    const city = schedule.city;
    const activities = schedule.upcomingActivities.slice(0, 3);

    return {
      analysis: "Daily briefing - show overview",
      shouldShow: true,
      showReason: "Start of day briefing",
      message: event.message,
      tone: "relaxed",
      actions: [
        {
          id: "start_day",
          label: "Let's go! ☀️",
          message: "Start your day",
          impact: "Begin tracking your activities",
          variant: "primary",
          actionType: "confirm",
        },
        {
          id: "show_schedule",
          label: "View schedule",
          message: "See today's full itinerary",
          impact: "Opens schedule view",
          variant: "secondary",
          actionType: "navigate",
        },
      ],
    };
  }

  // No quick recommendation available - need LLM
  return null;
}

// ============================================
// FACTORY & SINGLETON
// ============================================

let defaultRecommender: ActionRecommender | null = null;

/**
 * Get the default action recommender instance
 */
export function getActionRecommender(): ActionRecommender {
  if (!defaultRecommender) {
    defaultRecommender = new ActionRecommender();
  }
  return defaultRecommender;
}

/**
 * Create a new action recommender with custom config
 */
export function createActionRecommender(
  config?: Partial<ActionRecommenderConfig>
): ActionRecommender {
  return new ActionRecommender(config);
}

/**
 * Reset the default recommender (for testing)
 */
export function resetActionRecommender(): void {
  defaultRecommender = null;
}
