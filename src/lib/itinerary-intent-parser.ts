/**
 * Itinerary Intent Parser
 *
 * Parses natural language user messages into structured ItineraryIntent objects.
 * Uses a combination of:
 * 1. Rule-based parsing for common patterns (fast, reliable)
 * 2. LLM parsing for complex/ambiguous requests (flexible, context-aware)
 *
 * This ensures we don't hallucinate actions - the LLM outputs structured JSON
 * that maps to our defined intent types, not arbitrary actions.
 */

import type { StructuredItineraryData, ItinerarySlotType } from "@/types/structured-itinerary";
import type {
  ItineraryIntent,
  IntentActionType,
  ItineraryChatMessage,
  QuickAction,
} from "@/types/itinerary-chat";
import { findActivityByName, findSlotById } from "./constraint-engine";
import { generateId } from "./utils";

// ============================================
// PARSING PATTERNS
// ============================================

/**
 * Time slot keywords mapping
 */
const TIME_SLOT_KEYWORDS: Record<string, ItinerarySlotType> = {
  morning: "morning",
  am: "morning",
  early: "morning",
  breakfast: "breakfast",
  brunch: "breakfast",
  lunch: "lunch",
  midday: "lunch",
  noon: "lunch",
  afternoon: "afternoon",
  pm: "afternoon",
  dinner: "dinner",
  supper: "dinner",
  evening: "evening",
  night: "evening",
  late: "evening",
};

/**
 * Action pattern definitions
 */
interface ActionPattern {
  patterns: RegExp[];
  action: IntentActionType;
  priority: number;
}

const ACTION_PATTERNS: ActionPattern[] = [
  // Movement actions
  {
    patterns: [
      /\b(move|shift|reschedule|push|pull)\b/i,
      /\bto\s+(day|morning|afternoon|evening|lunch|dinner)\b/i,
    ],
    action: "MOVE_ACTIVITY",
    priority: 1,
  },
  {
    patterns: [/\b(swap|switch|exchange|trade)\b/i, /\bwith\b/i],
    action: "SWAP_ACTIVITIES",
    priority: 1,
  },

  // CRUD actions
  {
    patterns: [/\bfill\b.*\b(empty|slot|morning|afternoon|evening|lunch|dinner)\b/i],
    action: "SUGGEST_FROM_REPLACEMENT_POOL",
    priority: 1, // Higher priority than ADD_ACTIVITY
  },
  {
    patterns: [/\b(add|insert|include|schedule|plan|put)\b/i],
    action: "ADD_ACTIVITY",
    priority: 2,
  },
  {
    patterns: [/\bfill\b/i],
    action: "ADD_ACTIVITY", // "fill" without slot keywords falls back to ADD_ACTIVITY
    priority: 3,
  },
  {
    patterns: [/\b(delete|remove|cancel|drop|skip|take out)\b/i],
    action: "REMOVE_ACTIVITY",
    priority: 2,
  },
  {
    patterns: [/\b(replace|change|substitute)\b.*\bwith\b/i],
    action: "REPLACE_ACTIVITY",
    priority: 1,
  },

  // Priority actions
  {
    patterns: [/\b(lock|prioritize|must-do|important|fix|anchor)\b/i],
    action: "PRIORITIZE",
    priority: 3,
  },
  {
    patterns: [/\b(unlock|deprioritize|optional|maybe|flexible)\b/i],
    action: "DEPRIORITIZE",
    priority: 3,
  },

  // Suggestion actions
  {
    patterns: [
      /\b(suggest|recommend|find|show|what|any)\b.*\b(alternative|option|place|restaurant|activity)\b/i,
    ],
    action: "SUGGEST_ALTERNATIVES",
    priority: 3,
  },
  {
    patterns: [/\bwhat\b.*\b(should|could|can)\b/i, /\bhelp\b.*\b(find|choose)\b/i],
    action: "SUGGEST_ALTERNATIVES",
    priority: 4,
  },

  // Optimization actions
  {
    patterns: [/\b(optimize|optimise|improve)\b.*\broute\b/i],
    action: "OPTIMIZE_ROUTE",
    priority: 2,
  },
  {
    patterns: [/\b(optimize|optimise|group)\b.*\b(cluster|nearby|close)\b/i],
    action: "OPTIMIZE_CLUSTERS",
    priority: 2,
  },
  {
    patterns: [/\b(balance|spread|pace|relax)\b/i],
    action: "BALANCE_PACING",
    priority: 3,
  },

  // Day operations
  {
    patterns: [/\b(add|insert|create)\b.*\bday\b/i],
    action: "ADD_DAY",
    priority: 2,
  },
  {
    patterns: [/\b(remove|delete)\b.*\bday\b/i],
    action: "REMOVE_DAY",
    priority: 2,
  },

  // Duration actions
  {
    patterns: [/\b(extend|longer|more time)\b/i],
    action: "RESIZE_DURATION",
    priority: 3,
  },
  {
    patterns: [/\b(shorten|shorter|less time|quick)\b/i],
    action: "RESIZE_DURATION",
    priority: 3,
  },

  // History actions
  {
    patterns: [/\b(undo|revert|go back)\b/i],
    action: "UNDO",
    priority: 1,
  },
  {
    patterns: [/\b(redo|restore)\b/i],
    action: "REDO",
    priority: 1,
  },

  // Question actions (lowest priority)
  {
    patterns: [/\?$/, /\b(what|where|when|how|why|tell me|explain)\b/i],
    action: "ASK_QUESTION",
    priority: 5,
  },
];

/**
 * Category keywords for activity types
 */
const CATEGORY_KEYWORDS: Record<string, string> = {
  temple: "temple",
  shrine: "temple",
  museum: "museum",
  park: "park",
  garden: "park",
  restaurant: "restaurant",
  cafe: "restaurant",
  coffee: "restaurant",
  ramen: "restaurant",
  sushi: "restaurant",
  izakaya: "restaurant",
  shopping: "shopping",
  mall: "shopping",
  market: "shopping",
  viewpoint: "viewpoint",
  tower: "viewpoint",
  observation: "viewpoint",
  bar: "nightlife",
  club: "nightlife",
};

// ============================================
// PARSING FUNCTIONS
// ============================================

/**
 * Extract action type from message
 */
function extractAction(message: string): IntentActionType {
  const normalizedMessage = message.toLowerCase();
  let bestMatch: { action: IntentActionType; priority: number } | null = null;

  for (const pattern of ACTION_PATTERNS) {
    const matches = pattern.patterns.some((p) => p.test(normalizedMessage));
    if (matches) {
      if (!bestMatch || pattern.priority < bestMatch.priority) {
        bestMatch = { action: pattern.action, priority: pattern.priority };
      }
    }
  }

  return bestMatch?.action || "ASK_QUESTION";
}

/**
 * Extract time slot from message
 */
function extractTimeSlot(message: string): ItinerarySlotType | undefined {
  const normalizedMessage = message.toLowerCase();

  // Check for exact slot type names first (with word boundaries)
  // This prevents "afternoon" from matching "noon"
  const slotTypePatterns: Array<{ pattern: RegExp; slot: ItinerarySlotType }> = [
    { pattern: /\bmorning\b/, slot: "morning" },
    { pattern: /\bbreakfast\b/, slot: "breakfast" },
    { pattern: /\bbrunch\b/, slot: "breakfast" },
    { pattern: /\blunch\b/, slot: "lunch" },
    { pattern: /\bafternoon\b/, slot: "afternoon" },
    { pattern: /\bdinner\b/, slot: "dinner" },
    { pattern: /\bsupper\b/, slot: "dinner" },
    { pattern: /\bevening\b/, slot: "evening" },
    { pattern: /\bnight\b/, slot: "evening" },
  ];

  for (const { pattern, slot } of slotTypePatterns) {
    if (pattern.test(normalizedMessage)) {
      return slot;
    }
  }

  // Then check for less specific terms
  const secondaryPatterns: Array<{ pattern: RegExp; slot: ItinerarySlotType }> = [
    { pattern: /\bam\b/, slot: "morning" },
    { pattern: /\bearly\b/, slot: "morning" },
    { pattern: /\bmidday\b/, slot: "lunch" },
    { pattern: /\bnoon\b/, slot: "lunch" },  // Only matches standalone "noon", not "afternoon"
    { pattern: /\bpm\b/, slot: "afternoon" },
    { pattern: /\blate\b/, slot: "evening" },
  ];

  for (const { pattern, slot } of secondaryPatterns) {
    if (pattern.test(normalizedMessage)) {
      return slot;
    }
  }

  return undefined;
}

/**
 * Extract day number from message
 */
function extractDayNumber(message: string): number | undefined {
  // Match "day 3", "day3", etc.
  const dayMatch = message.match(/day\s*(\d+)/i);
  if (dayMatch) {
    return parseInt(dayMatch[1], 10);
  }

  // Match numeric ordinals with "day": "2nd day", "3rd day", "1st day"
  const numericOrdinalMatch = message.match(/(\d+)(?:st|nd|rd|th)\s+day/i);
  if (numericOrdinalMatch) {
    return parseInt(numericOrdinalMatch[1], 10);
  }

  // Match standalone numeric ordinals in context: "for 2nd", "on 3rd", "to 1st"
  const standaloneOrdinalMatch = message.match(/(?:for|on|to)\s+(\d+)(?:st|nd|rd|th)\s+(?:day)?/i);
  if (standaloneOrdinalMatch) {
    return parseInt(standaloneOrdinalMatch[1], 10);
  }

  // Match word ordinals
  const ordinals: Record<string, number> = {
    first: 1,
    second: 2,
    third: 3,
    fourth: 4,
    fifth: 5,
    sixth: 6,
    seventh: 7,
  };

  for (const [word, num] of Object.entries(ordinals)) {
    if (message.toLowerCase().includes(word)) {
      return num;
    }
  }

  // Match "tomorrow", "today"
  if (message.toLowerCase().includes("tomorrow")) {
    return 2; // Assuming day 1 is today
  }
  if (message.toLowerCase().includes("today")) {
    return 1;
  }

  return undefined;
}

/**
 * Extract activity name from message
 * Looks for quoted text, hyphenated names, or capitalized proper nouns
 */
function extractActivityName(message: string): string | undefined {
  // Check for quoted text first
  const quotedMatch = message.match(/["']([^"']+)["']/);
  if (quotedMatch) {
    return quotedMatch[1];
  }

  // Look for hyphenated names (e.g., "Daiun-in", "Ryōan-ji")
  // This pattern matches capitalized words connected by hyphens
  const hyphenatedMatch = message.match(/\b([A-Z][a-zA-Zōūāēīōū]*(?:-[a-zA-Zōūāēīōū]+)+)\b/);
  if (hyphenatedMatch) {
    return hyphenatedMatch[1];
  }

  // Look for proper nouns (capitalized words that aren't common words)
  const commonWords = new Set([
    "The",
    "A",
    "An",
    "And",
    "Or",
    "But",
    "In",
    "On",
    "At",
    "To",
    "For",
    "Move",
    "Add",
    "Delete",
    "Remove",
    "Swap",
    "Find",
    "Show",
    "Morning",
    "Afternoon",
    "Evening",
    "Night",
    "Lunch",
    "Dinner",
    "Breakfast",
    "Day",
    "Near",
    "Can",
    "You",
    "I",
    "Please",
    "Want",
    "Visit",
  ]);

  const words = message.split(/\s+/);
  const properNouns: string[] = [];

  for (let i = 0; i < words.length; i++) {
    const word = words[i].replace(/[.,!?;:]$/, ""); // Remove trailing punctuation
    if (/^[A-Z]/.test(word) && !commonWords.has(word) && word.length > 2) {
      properNouns.push(word);
    }
  }

  if (properNouns.length > 0) {
    // Try to combine consecutive proper nouns
    return properNouns.join(" ");
  }

  return undefined;
}

/**
 * Extract location/area from message
 */
function extractLocation(message: string): string | undefined {
  const locationMatch = message.match(/(?:near|in|at|around)\s+([A-Za-z]+(?:\s+[A-Za-z]+)?)/i);
  if (locationMatch) {
    return locationMatch[1].trim();
  }
  return undefined;
}

/**
 * Extract category from message
 */
function extractCategory(message: string): string | undefined {
  const normalizedMessage = message.toLowerCase();
  for (const [keyword, category] of Object.entries(CATEGORY_KEYWORDS)) {
    if (normalizedMessage.includes(keyword)) {
      return category;
    }
  }
  return undefined;
}

/**
 * Extract duration from message (in minutes)
 */
function extractDuration(message: string): number | undefined {
  const durationMatch = message.match(/(\d+)\s*(?:min|minute|hour|hr)/i);
  if (durationMatch) {
    let value = parseInt(durationMatch[1], 10);
    if (message.toLowerCase().includes("hour") || message.toLowerCase().includes("hr")) {
      value *= 60;
    }
    return value;
  }
  return undefined;
}

/**
 * Extract two activity names for swap operations
 */
function extractSwapActivities(
  message: string
): { activity1: string; activity2: string } | undefined {
  // Pattern: "swap X with Y" or "switch X and Y"
  const swapMatch = message.match(
    /(?:swap|switch|exchange)\s+["']?([^"']+?)["']?\s+(?:with|and)\s+["']?([^"']+?)["']?(?:\s|$|\.)/i
  );
  if (swapMatch) {
    return {
      activity1: swapMatch[1].trim(),
      activity2: swapMatch[2].trim(),
    };
  }
  return undefined;
}

// ============================================
// MAIN PARSER
// ============================================

/**
 * Parse result with confidence score
 */
export interface ParseResult {
  intent: ItineraryIntent | null;
  confidence: number;
  needsClarification: boolean;
  clarificationQuestion?: string;
  clarificationOptions?: Array<{ label: string; value: string }>;
  suggestedQuickActions?: QuickAction[];
}

/**
 * Parse a user message into an ItineraryIntent using rule-based parsing
 */
export function parseUserMessage(
  message: string,
  itinerary: StructuredItineraryData,
  context?: {
    currentDayIndex?: number;
    selectedSlotId?: string;
  }
): ParseResult {
  const action = extractAction(message);
  const timeSlot = extractTimeSlot(message);
  const dayNumber = extractDayNumber(message);
  const activityName = extractActivityName(message);
  const location = extractLocation(message);
  const category = extractCategory(message);
  const duration = extractDuration(message);

  let confidence = 0;
  let intent: ItineraryIntent | null = null;
  let needsClarification = false;
  let clarificationQuestion: string | undefined;
  let clarificationOptions: Array<{ label: string; value: string }> | undefined;

  switch (action) {
    case "MOVE_ACTIVITY": {
      if (!activityName) {
        needsClarification = true;
        clarificationQuestion = "Which activity would you like to move?";
        clarificationOptions = getActivityOptions(itinerary);
        confidence = 0.3;
      } else if (!dayNumber && !timeSlot) {
        needsClarification = true;
        clarificationQuestion = `Where would you like to move "${activityName}"?`;
        clarificationOptions = [
          { label: "To a different day", value: "different_day" },
          { label: "To a different time", value: "different_time" },
        ];
        confidence = 0.5;
      } else {
        intent = {
          type: "MOVE_ACTIVITY",
          params: {
            activityName,
            toDay: dayNumber || (context?.currentDayIndex ?? 0) + 1,
            toSlot: timeSlot,
          },
        };
        confidence = activityName && (dayNumber || timeSlot) ? 0.85 : 0.6;
      }
      break;
    }

    case "SWAP_ACTIVITIES": {
      const swapActivities = extractSwapActivities(message);
      if (swapActivities) {
        intent = {
          type: "SWAP_ACTIVITIES",
          params: {
            activity1Name: swapActivities.activity1,
            activity2Name: swapActivities.activity2,
          },
        };
        confidence = 0.85;
      } else {
        needsClarification = true;
        clarificationQuestion = "Which two activities would you like to swap?";
        clarificationOptions = getActivityOptions(itinerary);
        confidence = 0.3;
      }
      break;
    }

    case "ADD_ACTIVITY": {
      // Extract a meaningful description: prefer extracted name, otherwise build from parts
      let description = activityName;
      if (!description) {
        // Build description from message by extracting key phrases
        // Improved regex: handles "for 2nd day lunch", "on day 2", "to morning" patterns
        const addMatch = message.match(/(?:add|insert|include|schedule|plan|put)\s+(?:a\s+)?(.+?)(?:\s+(?:on|to|for)\s+(?:(?:\d+(?:st|nd|rd|th)\s+)?day|\d+(?:st|nd|rd|th)|morning|afternoon|evening|lunch|dinner|breakfast)|\s*$)/i);
        if (addMatch) {
          description = addMatch[1].trim()
            .replace(/\s+(on|to|for)\s+(day\s*)?\d+/gi, '') // Remove "on day 2" etc
            .replace(/\s+(on|to|for)\s+\d+(st|nd|rd|th)/gi, '') // Remove "for 2nd" etc
            .trim();
        }
      }
      // Fall back to category if still nothing, then clean up the message
      if (!description || description.length < 2) {
        description = category;
      }
      if (!description) {
        // Last resort: extract just the core noun after the action verb
        const simpleMatch = message.match(/(?:add|insert|include|schedule|plan|put)\s+(?:a\s+)?(\w+)/i);
        if (simpleMatch) {
          description = simpleMatch[1];
        } else {
          description = message;
        }
      }

      intent = {
        type: "ADD_ACTIVITY",
        params: {
          dayNumber: dayNumber || (context?.currentDayIndex ?? 0) + 1,
          slotType: timeSlot,
          activityDescription: description,
          category,
          location,
          duration,
        },
      };
      confidence = category || location ? 0.7 : 0.5;
      break;
    }

    case "REMOVE_ACTIVITY": {
      if (!activityName) {
        needsClarification = true;
        clarificationQuestion = "Which activity would you like to remove?";
        clarificationOptions = getActivityOptions(itinerary);
        confidence = 0.3;
      } else {
        intent = {
          type: "REMOVE_ACTIVITY",
          params: {
            activityName,
            dayNumber,
          },
        };
        confidence = 0.8;
      }
      break;
    }

    case "REPLACE_ACTIVITY": {
      const replaceMatch = message.match(
        /(?:replace|change|substitute)\s+["']?([^"']+?)["']?\s+with\s+["']?([^"']+?)["']?/i
      );
      if (replaceMatch) {
        intent = {
          type: "REPLACE_ACTIVITY",
          params: {
            targetActivityName: replaceMatch[1].trim(),
            replacementDescription: replaceMatch[2].trim(),
            dayNumber,
          },
        };
        confidence = 0.8;
      } else {
        needsClarification = true;
        clarificationQuestion =
          "What would you like to replace, and with what? Try: 'Replace X with Y'";
        confidence = 0.3;
      }
      break;
    }

    case "PRIORITIZE": {
      if (!activityName) {
        needsClarification = true;
        clarificationQuestion = "Which activity would you like to prioritize/lock?";
        clarificationOptions = getActivityOptions(itinerary);
        confidence = 0.3;
      } else {
        intent = {
          type: "PRIORITIZE",
          params: {
            activityName,
          },
        };
        confidence = 0.8;
      }
      break;
    }

    case "DEPRIORITIZE": {
      if (!activityName) {
        needsClarification = true;
        clarificationQuestion = "Which activity would you like to unlock/make flexible?";
        clarificationOptions = getActivityOptions(itinerary);
        confidence = 0.3;
      } else {
        intent = {
          type: "DEPRIORITIZE",
          params: {
            activityName,
          },
        };
        confidence = 0.8;
      }
      break;
    }

    case "SUGGEST_ALTERNATIVES": {
      intent = {
        type: "SUGGEST_ALTERNATIVES",
        params: {
          context: "slot",
          dayNumber,
          preferences: message,
          constraints: category ? { category } : undefined,
        },
      };
      confidence = 0.7;
      break;
    }

    case "SUGGEST_FROM_REPLACEMENT_POOL": {
      intent = {
        type: "SUGGEST_FROM_REPLACEMENT_POOL",
        params: {
          slotType: timeSlot || "morning", // Default to morning if not specified
          dayNumber: dayNumber || (context?.currentDayIndex ?? 0) + 1,
          preferences: message,
        },
      };
      confidence = 0.85; // High confidence since we have a specific pattern match
      break;
    }

    case "OPTIMIZE_ROUTE": {
      intent = {
        type: "OPTIMIZE_ROUTE",
        params: {
          dayNumber,
          preserveAnchors: true,
        },
      };
      confidence = 0.85;
      break;
    }

    case "OPTIMIZE_CLUSTERS": {
      intent = {
        type: "OPTIMIZE_CLUSTERS",
        params: {
          dayNumber,
          preserveAnchors: true,
        },
      };
      confidence = 0.85;
      break;
    }

    case "BALANCE_PACING": {
      intent = {
        type: "BALANCE_PACING",
        params: {
          dayNumber,
        },
      };
      confidence = 0.8;
      break;
    }

    case "ADD_DAY": {
      intent = {
        type: "ADD_DAY",
        params: {
          afterDay: dayNumber,
        },
      };
      confidence = 0.8;
      break;
    }

    case "REMOVE_DAY": {
      if (!dayNumber) {
        needsClarification = true;
        clarificationQuestion = "Which day would you like to remove?";
        clarificationOptions = itinerary.days.map((d) => ({
          label: `Day ${d.dayNumber}: ${d.title}`,
          value: d.dayNumber.toString(),
        }));
        confidence = 0.3;
      } else {
        intent = {
          type: "REMOVE_DAY",
          params: {
            dayNumber,
          },
        };
        confidence = 0.8;
      }
      break;
    }

    case "RESIZE_DURATION": {
      if (!activityName) {
        needsClarification = true;
        clarificationQuestion = "Which activity's duration would you like to change?";
        clarificationOptions = getActivityOptions(itinerary);
        confidence = 0.3;
      } else {
        const isExtend = message.toLowerCase().includes("extend") || message.toLowerCase().includes("longer");
        const defaultDelta = isExtend ? 30 : -30;
        intent = {
          type: "RESIZE_DURATION",
          params: {
            activityName,
            newDuration: duration || defaultDelta,
          },
        };
        confidence = duration ? 0.8 : 0.6;
      }
      break;
    }

    case "UNDO": {
      intent = {
        type: "UNDO",
        params: {},
      };
      confidence = 0.95;
      break;
    }

    case "REDO": {
      intent = {
        type: "REDO",
        params: {},
      };
      confidence = 0.95;
      break;
    }

    case "ASK_QUESTION":
    default: {
      intent = {
        type: "ASK_QUESTION",
        params: {
          question: message,
        },
      };
      confidence = 0.5;
      break;
    }
  }

  // Generate quick actions based on context
  const suggestedQuickActions = generateQuickActions(itinerary, context);

  return {
    intent,
    confidence,
    needsClarification,
    clarificationQuestion,
    clarificationOptions,
    suggestedQuickActions,
  };
}

/**
 * Get activity options from itinerary for clarification
 */
function getActivityOptions(
  itinerary: StructuredItineraryData
): Array<{ label: string; value: string }> {
  const options: Array<{ label: string; value: string }> = [];

  for (const day of itinerary.days) {
    for (const slot of day.slots) {
      const activity = slot.options.find((o) => o.id === slot.selectedOptionId) || slot.options[0];
      if (activity?.activity?.name) {
        options.push({
          label: `${activity.activity.name} (Day ${day.dayNumber})`,
          value: activity.activity.name,
        });
      }
    }
  }

  return options.slice(0, 10); // Limit to 10 options
}

/**
 * Generate contextual quick actions
 */
function generateQuickActions(
  itinerary: StructuredItineraryData,
  context?: {
    currentDayIndex?: number;
    selectedSlotId?: string;
  }
): QuickAction[] {
  const actions: QuickAction[] = [];
  const dayIndex = context?.currentDayIndex ?? 0;
  const day = itinerary.days[dayIndex];

  if (!day) return actions;

  // Always offer optimization
  actions.push({
    id: generateId(),
    label: `Optimize Day ${dayIndex + 1} route`,
    action: {
      type: "OPTIMIZE_ROUTE",
      params: { dayNumber: dayIndex + 1 },
    },
  });

  // If a slot is selected, offer related actions
  if (context?.selectedSlotId) {
    const slotLocation = findSlotById(itinerary, context.selectedSlotId);
    if (slotLocation) {
      const activity =
        slotLocation.slot.options.find((o) => o.id === slotLocation.slot.selectedOptionId) ||
        slotLocation.slot.options[0];

      if (activity?.activity?.name) {
        actions.push({
          id: generateId(),
          label: `Find alternatives for ${activity.activity.name}`,
          action: {
            type: "SUGGEST_ALTERNATIVES",
            params: {
              context: "slot",
              slotId: context.selectedSlotId,
            },
          },
        });

        if (!slotLocation.slot.isLocked) {
          actions.push({
            id: generateId(),
            label: `Lock ${activity.activity.name}`,
            action: {
              type: "LOCK_SLOT",
              params: { slotId: context.selectedSlotId },
            },
          });
        }
      }
    }
  }

  // Check for pacing issues
  let totalActivityMinutes = 0;
  for (const slot of day.slots) {
    const activity = slot.options.find((o) => o.id === slot.selectedOptionId) || slot.options[0];
    if (activity?.activity?.duration) {
      totalActivityMinutes += activity.activity.duration;
    }
  }

  if (totalActivityMinutes > 600) {
    // More than 10 hours
    actions.push({
      id: generateId(),
      label: "Balance day pacing",
      description: "This day might be too packed",
      action: {
        type: "BALANCE_PACING",
        params: { dayNumber: dayIndex + 1 },
      },
      isPrimary: true,
    });
  }

  return actions.slice(0, 4); // Limit to 4 quick actions
}

// ============================================
// LLM PARSING (for complex cases)
// ============================================

// Import centralized prompts
import { getSystemPrompt } from "./prompts";

/**
 * System prompt for LLM intent parsing
 * @deprecated Use getSystemPrompt('intentParser') instead
 */
export const INTENT_PARSING_SYSTEM_PROMPT = getSystemPrompt("intentParser");

/**
 * Build itinerary context for LLM
 */
function buildItineraryContextForLLM(itinerary: StructuredItineraryData): string {
  return itinerary.days.map(day => {
    const slots = day.slots.map(slot => {
      const activity = slot.options.find(o => o.id === slot.selectedOptionId) || slot.options[0];
      const activityName = activity?.activity?.name || "(empty)";
      return `  - ${slot.slotType}: ${activityName}`;
    }).join("\n");
    return `Day ${day.dayNumber} (${day.city}):\n${slots}`;
  }).join("\n\n");
}

/**
 * Parse intent using LLM (for complex cases where rule-based parsing has low confidence)
 */
export async function parseIntentWithLLM(
  message: string,
  itinerary: StructuredItineraryData,
  context?: {
    currentDayIndex?: number;
    conversationHistory?: ItineraryChatMessage[];
  }
): Promise<ParseResult> {
  // Dynamically import to avoid circular dependencies
  const { getAIProvider } = await import("./llm");

  // Build context for the LLM
  const itineraryContext = buildItineraryContextForLLM(itinerary);
  const currentDay = context?.currentDayIndex !== undefined
    ? `Current view: Day ${context.currentDayIndex + 1}`
    : "";

  const prompt = `Given this ${itinerary.days.length}-day ${itinerary.destination} itinerary:

${itineraryContext}

${currentDay}

Parse this user message into a structured intent:
"${message}"

Return ONLY a valid JSON object with type, params, confidence (0-1), and explanation.`;

  try {
    const provider = getAIProvider();

    if (provider === "gemini") {
      // Use Gemini
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");
      const model = genAI.getGenerativeModel({
        model: "gemini-2.5-flash",
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.3,
        },
      });

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: INTENT_PARSING_SYSTEM_PROMPT,
      });

      const response = result.response.text();
      const parsed = JSON.parse(response);

      console.log("[IntentParser] LLM parsed:", parsed.type, "confidence:", parsed.confidence);

      // Convert LLM response to ParseResult
      return {
        intent: {
          type: parsed.type,
          params: parsed.params || {},
        } as ItineraryIntent,
        confidence: parsed.confidence || 0.7,
        needsClarification: false,
        suggestedQuickActions: generateQuickActions(itinerary, context),
      };
    } else {
        // Use OpenAI via unified llm module
        const { llm } = await import("./llm");

        const response = await llm.chat(
          [{ role: "user", content: prompt }],
          {
            systemPrompt: INTENT_PARSING_SYSTEM_PROMPT,
            temperature: 0.3,
            jsonMode: true,
            providerOverride: "openai",
          }
        );

        const content = JSON.parse(response) as { type: string; params?: Record<string, unknown>; confidence?: number };

        console.log("[IntentParser] LLM parsed:", content.type, "confidence:", content.confidence);

      return {
        intent: {
          type: content.type,
          params: content.params || {},
        } as ItineraryIntent,
        confidence: content.confidence || 0.7,
        needsClarification: false,
        suggestedQuickActions: generateQuickActions(itinerary, context),
      };
    }
  } catch (error) {
    console.error("[IntentParser] LLM parsing failed:", error);
    // Fall back to rule-based parsing
    return parseUserMessage(message, itinerary, context);
  }
}

/**
 * Combined parser that uses rules first, LLM for complex cases
 */
export async function parseIntent(
  message: string,
  itinerary: StructuredItineraryData,
  context?: {
    currentDayIndex?: number;
    selectedSlotId?: string;
    conversationHistory?: ItineraryChatMessage[];
    useLLMFallback?: boolean;
  }
): Promise<ParseResult> {
  // First try rule-based parsing
  const ruleResult = parseUserMessage(message, itinerary, context);

  // If confidence is high enough, use rule-based result
  if (ruleResult.confidence >= 0.7) {
    return ruleResult;
  }

  // For lower confidence, try LLM if enabled
  if (context?.useLLMFallback && ruleResult.confidence < 0.5) {
    try {
      const llmResult = await parseIntentWithLLM(message, itinerary, context);
      // Use LLM result if it has higher confidence
      if (llmResult.confidence > ruleResult.confidence) {
        return llmResult;
      }
    } catch (error) {
      console.error("[IntentParser] LLM parsing failed:", error);
    }
  }

  return ruleResult;
}

export default parseIntent;
