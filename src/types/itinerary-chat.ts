/**
 * Itinerary Chat Types
 *
 * Types for LLM-powered chat interactions with the itinerary builder.
 * Supports natural language commands that are parsed into structured intents
 * and executed against the itinerary with full constraint awareness.
 */

import type {
  StructuredItineraryData,
  ItinerarySlotType,
  SlotWithOptions,
  ActivityOption,
  SlotBehavior,
} from "./structured-itinerary";

// ============================================
// INTENT TYPES
// ============================================

/**
 * All possible intent action types
 */
export type IntentActionType =
  // Basic CRUD
  | "ADD_ACTIVITY"
  | "REMOVE_ACTIVITY"
  | "REPLACE_ACTIVITY"
  // Movement & Ordering
  | "MOVE_ACTIVITY"
  | "SWAP_ACTIVITIES"
  | "REORDER_SLOT"
  // Time/Duration manipulation
  | "RESIZE_DURATION"
  | "CHANGE_TIME"
  | "BLOCK_TIME"
  // Priority/Rigidity manipulation
  | "PRIORITIZE"
  | "DEPRIORITIZE"
  | "LOCK_SLOT"
  | "UNLOCK_SLOT"
  // Suggestions & Optimization
  | "SUGGEST_ALTERNATIVES"
  | "SUGGEST_FROM_REPLACEMENT_POOL"
  | "OPTIMIZE_ROUTE"
  | "OPTIMIZE_CLUSTERS"
  | "BALANCE_PACING"
  // Day-level operations
  | "ADD_DAY"
  | "REMOVE_DAY"
  | "SWAP_DAYS"
  // Queries (no mutation)
  | "ASK_QUESTION"
  | "EXPLAIN_CONSTRAINT"
  | "CHECK_FEASIBILITY"
  // History
  | "UNDO"
  | "REDO";

/**
 * Parameters for ADD_ACTIVITY intent
 */
export interface AddActivityParams {
  dayNumber?: number;
  slotType?: ItinerarySlotType;
  activityDescription: string;
  category?: string;
  location?: string;
  duration?: number;
  constraints?: {
    maxBudget?: number;
    indoor?: boolean;
    familyFriendly?: boolean;
  };
}

/**
 * Parameters for REMOVE_ACTIVITY intent
 */
export interface RemoveActivityParams {
  activityName?: string;
  slotId?: string;
  dayNumber?: number;
}

/**
 * Parameters for REPLACE_ACTIVITY intent
 */
export interface ReplaceActivityParams {
  targetActivityName?: string;
  targetSlotId?: string;
  replacementDescription: string;
  dayNumber?: number;
}

/**
 * Parameters for MOVE_ACTIVITY intent
 */
export interface MoveActivityParams {
  activityName: string;
  fromDay?: number;
  toDay: number;
  toSlot?: ItinerarySlotType;
  toTime?: string;
  forceOverrideConstraints?: boolean;
}

/**
 * Parameters for SWAP_ACTIVITIES intent
 */
export interface SwapActivitiesParams {
  activity1Name: string;
  activity2Name: string;
}

/**
 * Parameters for SUGGEST_ALTERNATIVES intent
 */
export interface SuggestParams {
  context: "slot" | "replacement" | "gap" | "weather" | "crowd";
  slotId?: string;
  dayNumber?: number;
  preferences?: string;
  constraints?: {
    category?: string;
    maxDuration?: number;
    indoor?: boolean;
    budget?: "free" | "cheap" | "moderate" | "expensive";
  };
}

/**
 * Parameters for PRIORITIZE/DEPRIORITIZE intent
 */
export interface PriorityParams {
  activityName: string;
  rigidityScore?: number;
}

/**
 * Parameters for ASK_QUESTION intent
 */
export interface QuestionParams {
  question: string;
}

/**
 * Parameters for BLOCK_TIME intent
 */
export interface BlockTimeParams {
  dayNumber: number;
  startTime: string;
  endTime: string;
  reason: string;
}

/**
 * Parameters for day operations
 */
export interface DayOperationParams {
  dayNumber?: number;
  afterDay?: number;
  city?: string;
}

/**
 * Parameters for optimization operations
 */
export interface OptimizeParams {
  dayNumber?: number;
  preserveAnchors?: boolean;
}

/**
 * Union type for all intent types with their params
 */
export type ItineraryIntent =
  | { type: "ADD_ACTIVITY"; params: AddActivityParams }
  | { type: "REMOVE_ACTIVITY"; params: RemoveActivityParams }
  | { type: "REPLACE_ACTIVITY"; params: ReplaceActivityParams }
  | { type: "MOVE_ACTIVITY"; params: MoveActivityParams }
  | { type: "SWAP_ACTIVITIES"; params: SwapActivitiesParams }
  | { type: "REORDER_SLOT"; params: { slotId: string; newIndex: number } }
  | { type: "RESIZE_DURATION"; params: { activityName: string; newDuration: number } }
  | { type: "CHANGE_TIME"; params: { activityName: string; newStartTime: string } }
  | { type: "BLOCK_TIME"; params: BlockTimeParams }
  | { type: "PRIORITIZE"; params: PriorityParams }
  | { type: "DEPRIORITIZE"; params: PriorityParams }
  | { type: "LOCK_SLOT"; params: { slotId: string } }
  | { type: "UNLOCK_SLOT"; params: { slotId: string } }
  | { type: "SUGGEST_ALTERNATIVES"; params: SuggestParams }
  | { type: "SUGGEST_FROM_REPLACEMENT_POOL"; params: { slotId?: string; slotType?: ItinerarySlotType; dayNumber?: number; preferences?: string } }
  | { type: "OPTIMIZE_ROUTE"; params: OptimizeParams }
  | { type: "OPTIMIZE_CLUSTERS"; params: OptimizeParams }
  | { type: "BALANCE_PACING"; params: OptimizeParams }
  | { type: "ADD_DAY"; params: DayOperationParams }
  | { type: "REMOVE_DAY"; params: { dayNumber: number } }
  | { type: "SWAP_DAYS"; params: { day1: number; day2: number } }
  | { type: "ASK_QUESTION"; params: QuestionParams }
  | { type: "EXPLAIN_CONSTRAINT"; params: { slotId?: string; constraintType?: string } }
  | { type: "CHECK_FEASIBILITY"; params: { proposedChange: string } }
  | { type: "UNDO"; params: Record<string, never> }
  | { type: "REDO"; params: Record<string, never> };

// ============================================
// CONSTRAINT TYPES
// ============================================

/**
 * The 7 constraint layers from the semantic model
 */
export type ConstraintLayer =
  | "temporal"
  | "travel"
  | "clustering"
  | "dependencies"
  | "pacing"
  | "fragility"
  | "cross-day";

/**
 * Constraint violation severity
 */
export type ConstraintSeverity = "info" | "warning" | "error";

/**
 * A single constraint violation
 */
export interface ConstraintViolation {
  layer: ConstraintLayer;
  severity: ConstraintSeverity;
  message: string;
  affectedSlotId?: string;
  resolution?: string;
}

/**
 * Auto-adjustment made by the system
 */
export interface AutoAdjustment {
  slotId: string;
  adjustment: string;
  before?: string;
  after?: string;
}

/**
 * Full constraint analysis result
 */
export interface ConstraintAnalysis {
  feasible: boolean;
  affectedLayers: ConstraintLayer[];
  violations: ConstraintViolation[];
  autoAdjustments: AutoAdjustment[];
}

// ============================================
// BOOKING STATUS
// ============================================

/**
 * Booking status for a slot
 */
export interface SlotBookingStatus {
  reservationRequired: boolean;
  userBookingStatus: "not-needed" | "not-booked" | "booked" | "unknown";
  confirmedTime?: string;
  confirmationRef?: string;
  bookingUrl?: string;
}

// ============================================
// CHAT MESSAGE TYPES
// ============================================

/**
 * A message in the itinerary chat
 */
export interface ItineraryChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  timestamp: Date;
  intent?: ItineraryIntent;
  constraintAnalysis?: ConstraintAnalysis;
  appliedChanges?: boolean;
}

/**
 * Quick action button shown in chat
 */
export interface QuickAction {
  id: string;
  label: string;
  description?: string;
  action: ItineraryIntent;
  isPrimary?: boolean;
}

/**
 * Proactive nudge from the system
 */
export interface ProactiveNudge {
  type: "pacing" | "weather" | "cluster" | "conflict" | "booking";
  message: string;
  suggestedAction?: ItineraryIntent;
}

// ============================================
// API REQUEST/RESPONSE TYPES
// ============================================

/**
 * Request to the itinerary chat API
 */
export interface ItineraryChatRequest {
  message: string;
  itinerary: StructuredItineraryData;
  context: {
    currentDayIndex: number;
    selectedSlotId?: string;
    viewMode?: "day" | "multi-day" | "list";
    conversationHistory?: ItineraryChatMessage[];
    constraintSettings?: {
      strictMode: boolean;
      autoAdjust: boolean;
      respectClusters: boolean;
      weatherAware: boolean;
    };
  };
}

/**
 * Clarifying question when intent is ambiguous
 */
export interface ClarifyingQuestion {
  question: string;
  options: Array<{
    label: string;
    value: string;
    action?: ItineraryIntent;
  }>;
}

/**
 * Preview of proposed changes
 */
export interface ChangePreview {
  description: string;
  beforeSummary: string;
  afterSummary: string;
  affectedSlotIds: string[];
  impact: {
    travelTimeChange: number;
    pacingScore: number;
    clusterEfficiency: number;
    riskLevel: "low" | "medium" | "high";
  };
}

/**
 * Response from the itinerary chat API
 */
export interface ItineraryChatResponse {
  message: string;
  intent: ItineraryIntent | null;

  // If the request was blocked
  blocked?: {
    reason: string;
    constraint: ConstraintLayer | "booking";
    affectedSlotId?: string;
  };

  // Constraint analysis
  constraintAnalysis?: ConstraintAnalysis;

  // If we need more info from user
  clarifyingQuestion?: ClarifyingQuestion;

  // Alternative actions we can do
  suggestedActions: QuickAction[];

  // Preview of changes (for confirmation)
  changePreview?: ChangePreview;

  // If changes were applied directly
  appliedChanges?: {
    newItinerary: StructuredItineraryData;
    undoAction: ItineraryIntent;
  };

  // Activity suggestions
  suggestions?: ActivityOption[];

  // Proactive system nudges
  proactiveNudges?: ProactiveNudge[];

  // UI action to trigger (e.g., open fill-slot panel, show alternatives)
  uiAction?: ChatUiAction;
}

/**
 * UI actions that can be triggered from chat commands
 */
export type ChatUiAction =
  | {
      type: "OPEN_FILL_SLOT_PANEL";
      params: {
        dayIndex: number;
        slotType: ItinerarySlotType;
        findFirstEmpty: true; // Always find the first empty slot of this type
      };
    }
  | {
      type: "SHOW_ALTERNATIVES_PANEL";
      params: {
        dayIndex: number;
        slotId: string;
        activityName: string;
        suggestions?: ActivityOption[];
      };
    }
  | {
      type: "HIGHLIGHT_ROUTE_OPTIMIZATION";
      params: {
        dayIndex: number;
        reorderedSlotIds: string[];
        travelTimeSaved: number;
      };
    }
  | {
      type: "NAVIGATE_TO_DAY";
      params: {
        dayIndex: number;
      };
    };

// ============================================
// EXECUTOR RESULT
// ============================================

/**
 * Result of executing an intent
 */
export interface IntentExecutionResult {
  success: boolean;
  newItinerary?: StructuredItineraryData;
  message: string;
  constraintAnalysis?: ConstraintAnalysis;
  undoAction?: ItineraryIntent;
  warnings?: string[];
}

// ============================================
// UTILITY TYPES
// ============================================

/**
 * Slot location in the itinerary
 */
export interface SlotLocation {
  dayIndex: number;
  slotIndex: number;
  slotId: string;
  slot: SlotWithOptions;
}

/**
 * Activity location in the itinerary
 */
export interface ActivityLocation extends SlotLocation {
  optionIndex: number;
  option: ActivityOption;
}
