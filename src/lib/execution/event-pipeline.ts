/**
 * Event Pipeline
 *
 * Orchestrates the flow: Event → Context → Filter → Recommender → Enriched Event
 *
 * This is the main integration point for smart event handling.
 * Instead of showing raw events, we:
 * 1. Gather context (user state, schedule, external factors)
 * 2. Filter (should we even show this?)
 * 3. Recommend actions (what should user be able to do?)
 * 4. Return enriched event or null if suppressed
 */

import type { QueuedEvent, ExecutionState } from "./execution-queue";
import type { StructuredItineraryData } from "@/types/structured-itinerary";
import {
  ContextAggregator,
  type AggregatedContext,
  type UserState,
} from "./context-aggregator";
import {
  EventFilter,
  type FilterResult,
  quickShouldShow,
} from "./event-filter";
import {
  ActionRecommender,
  quickRecommend,
  toQueuedEventActions,
  type ActionRecommendation,
} from "./action-recommender";

// ============================================
// TYPES
// ============================================

export interface PipelineResult {
  /** Whether to show this event to the user */
  show: boolean;

  /** The (possibly enriched) event */
  event: QueuedEvent;

  /** Why we made this decision */
  reason: string;

  /** Filter result details */
  filterResult?: FilterResult;

  /** Action recommendation details */
  recommendation?: ActionRecommendation;

  /** If suppressed, what alternative action to take */
  alternativeAction?: "silent_update" | "timeline_note" | "status_badge" | "none";
}

export interface PipelineConfig {
  /** Enable LLM-based action recommendations (slower but smarter) */
  enableLLMRecommendations: boolean;

  /** Enable event filtering (suppress non-essential events) */
  enableFiltering: boolean;

  /** Use quick recommendations for common scenarios (no LLM call) */
  preferQuickRecommendations: boolean;

  /** Timeout for LLM calls in ms */
  llmTimeoutMs: number;
}

export interface PipelineContext {
  /** Current itinerary */
  itinerary: StructuredItineraryData;

  /** Current day index */
  dayIndex: number;

  /** Current simulated/real time */
  currentTime: Date;

  /** User's current location (if known) */
  userLocation?: { lat: number; lng: number };

  /** Current activity slot ID */
  currentSlotId?: string;

  /** How long user has been at current location (minutes) */
  dwellTimeMinutes?: number;

  /** Slot statuses */
  slotStatuses?: Record<string, string>;

  /** Accumulated delay in minutes */
  delayMinutes?: number;
}

// ============================================
// DEFAULT CONFIG
// ============================================

const DEFAULT_CONFIG: PipelineConfig = {
  enableLLMRecommendations: true,
  enableFiltering: true,
  preferQuickRecommendations: true,
  llmTimeoutMs: 10000,
};

// ============================================
// EVENT PIPELINE CLASS
// ============================================

export class EventPipeline {
  private config: PipelineConfig;
  private eventFilter: EventFilter;
  private actionRecommender: ActionRecommender;

  constructor(config: Partial<PipelineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.eventFilter = new EventFilter();
    this.actionRecommender = new ActionRecommender({
      timeoutMs: this.config.llmTimeoutMs,
      useFallbackOnError: true,
    });
  }

  /**
   * Process a single event through the pipeline
   */
  async process(
    event: QueuedEvent,
    pipelineContext: PipelineContext
  ): Promise<PipelineResult> {
    console.log(`[EventPipeline] Processing event: ${event.type} - ${event.title}`);

    // Step 1: Quick pre-filter (no context needed)
    if (this.config.enableFiltering && !quickShouldShow(event)) {
      // Need full context to make final decision
    }

    // Step 2: Build context (create aggregator for this request)
    const context = this.buildContext(event, pipelineContext);

    // Step 3: Filter
    let filterResult: FilterResult = { action: "show", reason: "Filtering disabled" };
    if (this.config.enableFiltering) {
      filterResult = this.eventFilter.filter(event, context);
      console.log(`[EventPipeline] Filter result: ${filterResult.action} - ${filterResult.reason}`);

      if (filterResult.action === "suppress") {
        return {
          show: false,
          event,
          reason: filterResult.reason,
          filterResult,
          alternativeAction: filterResult.alternativeAction,
        };
      }

      if (filterResult.action === "delay") {
        // For now, treat delay as suppress (client can implement delay logic)
        return {
          show: false,
          event,
          reason: filterResult.reason,
          filterResult,
          alternativeAction: "silent_update",
        };
      }
    }

    // Step 4: Recommend actions
    let recommendation: ActionRecommendation | undefined;
    let enrichedEvent = event;

    if (this.config.enableLLMRecommendations) {
      // Try quick recommendations first (no LLM call)
      if (this.config.preferQuickRecommendations) {
        const quickRec = quickRecommend(event, context);
        if (quickRec) {
          console.log(`[EventPipeline] Using quick recommendation`);
          recommendation = quickRec;

          // If quick rec says don't show, respect that
          if (!quickRec.shouldShow) {
            return {
              show: false,
              event,
              reason: quickRec.showReason,
              filterResult,
              recommendation: quickRec,
              alternativeAction: "silent_update",
            };
          }

          // Enrich event with recommended actions
          enrichedEvent = {
            ...event,
            message: quickRec.message,
            actions: toQueuedEventActions(quickRec.actions),
          };
        }
      }

      // If no quick recommendation, use LLM
      if (!recommendation) {
        try {
          console.log(`[EventPipeline] Calling LLM for recommendations`);
          recommendation = await this.actionRecommender.recommend(event, context);

          if (!recommendation.shouldShow) {
            return {
              show: false,
              event,
              reason: recommendation.showReason,
              filterResult,
              recommendation,
              alternativeAction: "silent_update",
            };
          }

          // Enrich event with recommended actions
          enrichedEvent = {
            ...event,
            message: recommendation.message,
            actions: toQueuedEventActions(recommendation.actions),
          };
        } catch (error) {
          console.error(`[EventPipeline] LLM recommendation failed:`, error);
          // Continue with original event actions
        }
      }
    }

    return {
      show: true,
      event: enrichedEvent,
      reason: filterResult.reason,
      filterResult,
      recommendation,
    };
  }

  /**
   * Process multiple events through the pipeline
   */
  async processMany(
    events: QueuedEvent[],
    pipelineContext: PipelineContext
  ): Promise<PipelineResult[]> {
    const results: PipelineResult[] = [];

    for (const event of events) {
      const result = await this.process(event, pipelineContext);
      results.push(result);
    }

    return results;
  }

  /**
   * Process events and return only those that should be shown
   */
  async processAndFilter(
    events: QueuedEvent[],
    pipelineContext: PipelineContext
  ): Promise<QueuedEvent[]> {
    const results = await this.processMany(events, pipelineContext);
    return results
      .filter((r) => r.show)
      .map((r) => r.event);
  }

  /**
   * Build context for an event using the ContextAggregator
   */
  private buildContext(
    event: QueuedEvent,
    pipelineContext: PipelineContext
  ): AggregatedContext {
    const { itinerary, dayIndex, currentTime, slotStatuses, delayMinutes } = pipelineContext;

    // Build an ExecutionState-compatible object
    const executionState: ExecutionState = {
      tripId: event.tripId,
      dayIndex,
      startedAt: new Date(),
      currentTime,
      timeMultiplier: 1,
      isPaused: false,
      slotStatuses: (slotStatuses || {}) as Record<string, import("./execution-queue").ActivityStatus>,
      lockedSlotIds: [],
      currentLocation: pipelineContext.userLocation,
      currentVenueId: pipelineContext.currentSlotId,
      accumulatedDelayMinutes: delayMinutes || 0,
      completedCount: 0,
      skippedCount: 0,
    };

    // Create a context aggregator for this specific request
    const aggregator = new ContextAggregator(itinerary, executionState);

    // If we have dwell time info, update the aggregator
    if (pipelineContext.currentSlotId && pipelineContext.dwellTimeMinutes) {
      // Calculate entry time based on dwell time
      const entryTime = new Date(currentTime.getTime() - pipelineContext.dwellTimeMinutes * 60000);
      aggregator.enterSlot(pipelineContext.currentSlotId);
    }

    return aggregator.aggregate(event);
  }

  /**
   * Reset the filter's rate limiting (for testing)
   */
  reset(): void {
    this.eventFilter.reset();
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus() {
    return this.eventFilter.getRateLimitStatus();
  }
}

// ============================================
// SINGLETON & FACTORY
// ============================================

let defaultPipeline: EventPipeline | null = null;

/**
 * Get the default event pipeline instance
 */
export function getEventPipeline(): EventPipeline {
  if (!defaultPipeline) {
    defaultPipeline = new EventPipeline();
  }
  return defaultPipeline;
}

/**
 * Create a new event pipeline with custom config
 */
export function createEventPipeline(
  config?: Partial<PipelineConfig>
): EventPipeline {
  return new EventPipeline(config);
}

/**
 * Reset the default pipeline (for testing)
 */
export function resetEventPipeline(): void {
  defaultPipeline = null;
}

// ============================================
// CONVENIENCE FUNCTION
// ============================================

/**
 * Quick process - process events with default pipeline
 */
export async function processEvents(
  events: QueuedEvent[],
  context: PipelineContext
): Promise<QueuedEvent[]> {
  const pipeline = getEventPipeline();
  return pipeline.processAndFilter(events, context);
}
