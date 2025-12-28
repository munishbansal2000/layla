/**
 * Chat Directive Parser
 *
 * Parses natural language commands into structured actions for itinerary manipulation.
 * Supports commands like "Move TeamLab to morning" or "Add sushi lunch near Shinjuku"
 */

import type { StructuredItineraryData, SlotWithOptions, ActivityOption } from '@/types/structured-itinerary';

export type DirectiveAction =
  | 'move'
  | 'swap'
  | 'add'
  | 'delete'
  | 'prioritize'
  | 'deprioritize'
  | 'suggest'
  | 'lock'
  | 'unlock'
  | 'extend'
  | 'shorten';

export interface ParsedDirective {
  action: DirectiveAction;
  activityName?: string;
  activityId?: string;
  targetTime?: 'morning' | 'breakfast' | 'lunch' | 'afternoon' | 'dinner' | 'evening';
  targetDay?: number;
  priority?: 'must-do' | 'optional';
  location?: string;
  duration?: number;  // in minutes
  category?: string;  // restaurant, temple, etc.
  confidence: number; // 0-1 how confident we are in the parse
  rawInput: string;
}

export interface DirectiveExecutionResult {
  success: boolean;
  updatedItinerary?: StructuredItineraryData;
  message: string;
  clarificationNeeded?: string;
  suggestions?: string[];
}

// Time slot keywords
const TIME_KEYWORDS: Record<string, 'morning' | 'breakfast' | 'lunch' | 'afternoon' | 'dinner' | 'evening'> = {
  'morning': 'morning',
  'am': 'morning',
  'early': 'morning',
  'breakfast': 'breakfast',
  'brunch': 'breakfast',
  'lunch': 'lunch',
  'midday': 'lunch',
  'noon': 'lunch',
  'afternoon': 'afternoon',
  'pm': 'afternoon',
  'dinner': 'dinner',
  'supper': 'dinner',
  'evening': 'evening',
  'night': 'evening',
  'late': 'evening',
};

// Action keywords
const ACTION_PATTERNS: { pattern: RegExp; action: DirectiveAction }[] = [
  { pattern: /\b(move|shift|reschedule|push|pull)\b/i, action: 'move' },
  { pattern: /\b(swap|switch|exchange|trade)\b/i, action: 'swap' },
  { pattern: /\b(add|insert|include|schedule|plan)\b/i, action: 'add' },
  { pattern: /\b(delete|remove|cancel|drop|skip)\b/i, action: 'delete' },
  { pattern: /\b(prioritize|must-do|important|lock)\b/i, action: 'prioritize' },
  { pattern: /\b(deprioritize|optional|maybe|flexible|unlock)\b/i, action: 'deprioritize' },
  { pattern: /\b(suggest|recommend|find|show|what)\b/i, action: 'suggest' },
  { pattern: /\b(extend|longer|more time)\b/i, action: 'extend' },
  { pattern: /\b(shorten|shorter|less time|quick)\b/i, action: 'shorten' },
];

// Category keywords
const CATEGORY_KEYWORDS: Record<string, string> = {
  'temple': 'temple',
  'shrine': 'temple',
  'museum': 'museum',
  'park': 'park',
  'garden': 'park',
  'restaurant': 'restaurant',
  'cafe': 'restaurant',
  'coffee': 'restaurant',
  'ramen': 'restaurant',
  'sushi': 'restaurant',
  'izakaya': 'restaurant',
  'shopping': 'shopping',
  'mall': 'shopping',
  'market': 'shopping',
  'viewpoint': 'viewpoint',
  'tower': 'viewpoint',
  'observation': 'viewpoint',
  'bar': 'nightlife',
  'club': 'nightlife',
  'entertainment': 'entertainment',
  'show': 'entertainment',
  'performance': 'entertainment',
};

/**
 * Parse a natural language directive into structured action
 */
export function parseDirective(input: string): ParsedDirective | null {
  if (!input || input.trim().length < 3) {
    return null;
  }

  const normalizedInput = input.toLowerCase().trim();
  let confidence = 0;
  let action: DirectiveAction = 'suggest'; // Default action
  let targetTime: ParsedDirective['targetTime'] | undefined;
  let targetDay: number | undefined;
  let activityName: string | undefined;
  let location: string | undefined;
  let category: string | undefined;
  let duration: number | undefined;

  // 1. Detect action
  for (const { pattern, action: detectedAction } of ACTION_PATTERNS) {
    if (pattern.test(normalizedInput)) {
      action = detectedAction;
      confidence += 0.3;
      break;
    }
  }

  // 2. Detect time slot
  for (const [keyword, timeSlot] of Object.entries(TIME_KEYWORDS)) {
    if (normalizedInput.includes(keyword)) {
      targetTime = timeSlot;
      confidence += 0.2;
      break;
    }
  }

  // 3. Detect day number
  const dayMatch = normalizedInput.match(/day\s*(\d+)/i);
  if (dayMatch) {
    targetDay = parseInt(dayMatch[1], 10);
    confidence += 0.15;
  }

  // 4. Detect "tomorrow", "today", etc.
  if (normalizedInput.includes('tomorrow')) {
    targetDay = 2; // Assuming day 1 is today
    confidence += 0.1;
  } else if (normalizedInput.includes('today')) {
    targetDay = 1;
    confidence += 0.1;
  }

  // 5. Detect category
  for (const [keyword, cat] of Object.entries(CATEGORY_KEYWORDS)) {
    if (normalizedInput.includes(keyword)) {
      category = cat;
      confidence += 0.15;
      break;
    }
  }

  // 6. Detect location (after "near", "in", "at", "around")
  const locationMatch = normalizedInput.match(/(?:near|in|at|around)\s+([a-z]+(?:\s+[a-z]+)?)/i);
  if (locationMatch) {
    location = locationMatch[1].trim();
    confidence += 0.15;
  }

  // 7. Detect duration
  const durationMatch = normalizedInput.match(/(\d+)\s*(?:min|minute|hour|hr)/i);
  if (durationMatch) {
    let value = parseInt(durationMatch[1], 10);
    if (normalizedInput.includes('hour') || normalizedInput.includes('hr')) {
      value *= 60;
    }
    duration = value;
    confidence += 0.1;
  }

  // 8. Extract activity name (quoted text or capitalized words)
  const quotedMatch = input.match(/["']([^"']+)["']/);
  if (quotedMatch) {
    activityName = quotedMatch[1];
    confidence += 0.25;
  } else {
    // Try to find proper nouns (capitalized words not at start of sentence)
    const words = input.split(/\s+/);
    const properNouns: string[] = [];

    for (let i = 1; i < words.length; i++) {
      const word = words[i];
      // Check if word starts with capital and isn't a common word
      if (/^[A-Z]/.test(word) && !isCommonWord(word)) {
        properNouns.push(word);
      }
    }

    if (properNouns.length > 0) {
      activityName = properNouns.join(' ');
      confidence += 0.15;
    }
  }

  // If we couldn't determine much, return null
  if (confidence < 0.2 && !activityName && !category) {
    return null;
  }

  // Cap confidence at 1.0
  confidence = Math.min(confidence, 1.0);

  return {
    action,
    activityName,
    targetTime,
    targetDay,
    location,
    category,
    duration,
    confidence,
    rawInput: input,
  };
}

/**
 * Check if a word is a common English word (not a proper noun)
 */
function isCommonWord(word: string): boolean {
  const commonWords = new Set([
    'The', 'A', 'An', 'And', 'Or', 'But', 'In', 'On', 'At', 'To', 'For',
    'With', 'By', 'From', 'Up', 'About', 'Into', 'Through', 'During',
    'Before', 'After', 'Above', 'Below', 'Between', 'Under', 'Again',
    'Further', 'Then', 'Once', 'Here', 'There', 'When', 'Where', 'Why',
    'How', 'All', 'Each', 'Few', 'More', 'Most', 'Other', 'Some', 'Such',
    'No', 'Nor', 'Not', 'Only', 'Own', 'Same', 'So', 'Than', 'Too', 'Very',
    'Can', 'Will', 'Just', 'Should', 'Now', 'Move', 'Add', 'Delete', 'Swap',
    'Find', 'Show', 'Get', 'Make', 'Put', 'Take', 'Come', 'Go', 'See',
    'Morning', 'Afternoon', 'Evening', 'Night', 'Lunch', 'Dinner', 'Breakfast',
    'Day', 'Time', 'Near', 'Around', 'Today', 'Tomorrow',
  ]);
  return commonWords.has(word);
}

/**
 * Find activity in itinerary by name (fuzzy match)
 */
export function findActivityByName(
  itinerary: StructuredItineraryData,
  name: string
): { dayIndex: number; slotIndex: number; optionIndex: number; option: ActivityOption } | null {
  const normalizedName = name.toLowerCase();

  for (let dayIndex = 0; dayIndex < itinerary.days.length; dayIndex++) {
    const day = itinerary.days[dayIndex];
    for (let slotIndex = 0; slotIndex < day.slots.length; slotIndex++) {
      const slot = day.slots[slotIndex];
      for (let optionIndex = 0; optionIndex < slot.options.length; optionIndex++) {
        const option = slot.options[optionIndex];
        const activityName = option.activity?.name?.toLowerCase() || '';

        // Exact match
        if (activityName === normalizedName) {
          return { dayIndex, slotIndex, optionIndex, option };
        }

        // Partial match
        if (activityName.includes(normalizedName) || normalizedName.includes(activityName)) {
          return { dayIndex, slotIndex, optionIndex, option };
        }

        // Word-based match
        const nameWords = normalizedName.split(/\s+/);
        const activityWords = activityName.split(/\s+/);
        const matchingWords = nameWords.filter(w => activityWords.some(aw => aw.includes(w) || w.includes(aw)));
        if (matchingWords.length >= Math.ceil(nameWords.length / 2)) {
          return { dayIndex, slotIndex, optionIndex, option };
        }
      }
    }
  }

  return null;
}

/**
 * Find slot by time type
 */
export function findSlotByTime(
  day: { slots: SlotWithOptions[] },
  targetTime: 'morning' | 'breakfast' | 'lunch' | 'afternoon' | 'dinner' | 'evening'
): { slotIndex: number; slot: SlotWithOptions } | null {
  for (let slotIndex = 0; slotIndex < day.slots.length; slotIndex++) {
    const slot = day.slots[slotIndex];
    if (slot.slotType === targetTime) {
      return { slotIndex, slot };
    }
  }
  return null;
}

/**
 * Execute a parsed directive on an itinerary
 */
export async function executeDirective(
  directive: ParsedDirective,
  itinerary: StructuredItineraryData,
  handlers: {
    onMoveSlotToDay?: (sourceDayIndex: number, slotId: string, targetDayIndex: number) => void;
    onClearSlot?: (dayIndex: number, slotId: string) => void;
    onToggleLock?: (dayIndex: number, slotId: string) => void;
    onSelectOption?: (slotId: string, optionId: string) => void;
  }
): Promise<DirectiveExecutionResult> {
  const { action, activityName, targetTime, targetDay } = directive;

  switch (action) {
    case 'move': {
      if (!activityName) {
        return {
          success: false,
          message: 'Please specify which activity to move.',
          clarificationNeeded: 'Which activity would you like to move?',
          suggestions: getActivitySuggestions(itinerary),
        };
      }

      const found = findActivityByName(itinerary, activityName);
      if (!found) {
        return {
          success: false,
          message: `Could not find activity "${activityName}" in your itinerary.`,
          suggestions: getActivitySuggestions(itinerary),
        };
      }

      const sourceDayIndex = found.dayIndex;
      const sourceSlot = itinerary.days[sourceDayIndex].slots[found.slotIndex];

      // Determine target
      let targetDayIndex = targetDay !== undefined ? targetDay - 1 : sourceDayIndex;

      if (targetDayIndex < 0 || targetDayIndex >= itinerary.days.length) {
        return {
          success: false,
          message: `Day ${targetDay} doesn't exist. Your itinerary has ${itinerary.days.length} days.`,
        };
      }

      // If moving to different day
      if (targetDayIndex !== sourceDayIndex && handlers.onMoveSlotToDay) {
        handlers.onMoveSlotToDay(sourceDayIndex, sourceSlot.slotId, targetDayIndex);
        return {
          success: true,
          message: `Moved "${found.option.activity?.name}" to Day ${targetDayIndex + 1}${targetTime ? ` (${targetTime})` : ''}.`,
        };
      }

      // If moving within same day to different time slot
      if (targetTime) {
        const targetSlotInfo = findSlotByTime(itinerary.days[targetDayIndex], targetTime);
        if (!targetSlotInfo) {
          return {
            success: false,
            message: `No ${targetTime} slot found on Day ${targetDayIndex + 1}.`,
          };
        }

        return {
          success: true,
          message: `Would move "${found.option.activity?.name}" to ${targetTime} on Day ${targetDayIndex + 1}. (Slot swapping within day not yet fully implemented)`,
        };
      }

      return {
        success: false,
        message: 'Please specify where to move the activity (day number or time of day).',
        clarificationNeeded: 'Move to which day or time?',
      };
    }

    case 'delete': {
      if (!activityName) {
        return {
          success: false,
          message: 'Please specify which activity to delete.',
          clarificationNeeded: 'Which activity would you like to remove?',
          suggestions: getActivitySuggestions(itinerary),
        };
      }

      const found = findActivityByName(itinerary, activityName);
      if (!found) {
        return {
          success: false,
          message: `Could not find activity "${activityName}" in your itinerary.`,
          suggestions: getActivitySuggestions(itinerary),
        };
      }

      const slot = itinerary.days[found.dayIndex].slots[found.slotIndex];

      if (handlers.onClearSlot) {
        handlers.onClearSlot(found.dayIndex, slot.slotId);
        return {
          success: true,
          message: `Removed "${found.option.activity?.name}" from Day ${found.dayIndex + 1}.`,
        };
      }

      return {
        success: false,
        message: 'Delete handler not available.',
      };
    }

    case 'prioritize':
    case 'lock': {
      if (!activityName) {
        return {
          success: false,
          message: 'Please specify which activity to lock.',
          clarificationNeeded: 'Which activity would you like to lock?',
          suggestions: getActivitySuggestions(itinerary),
        };
      }

      const found = findActivityByName(itinerary, activityName);
      if (!found) {
        return {
          success: false,
          message: `Could not find activity "${activityName}" in your itinerary.`,
          suggestions: getActivitySuggestions(itinerary),
        };
      }

      const slot = itinerary.days[found.dayIndex].slots[found.slotIndex];

      if (handlers.onToggleLock && !slot.isLocked) {
        handlers.onToggleLock(found.dayIndex, slot.slotId);
        return {
          success: true,
          message: `Locked "${found.option.activity?.name}" - it won't be affected by reshuffling.`,
        };
      }

      if (slot.isLocked) {
        return {
          success: true,
          message: `"${found.option.activity?.name}" is already locked.`,
        };
      }

      return {
        success: false,
        message: 'Lock handler not available.',
      };
    }

    case 'deprioritize':
    case 'unlock': {
      if (!activityName) {
        return {
          success: false,
          message: 'Please specify which activity to unlock.',
          clarificationNeeded: 'Which activity would you like to unlock?',
          suggestions: getActivitySuggestions(itinerary),
        };
      }

      const found = findActivityByName(itinerary, activityName);
      if (!found) {
        return {
          success: false,
          message: `Could not find activity "${activityName}" in your itinerary.`,
          suggestions: getActivitySuggestions(itinerary),
        };
      }

      const slot = itinerary.days[found.dayIndex].slots[found.slotIndex];

      if (handlers.onToggleLock && slot.isLocked) {
        handlers.onToggleLock(found.dayIndex, slot.slotId);
        return {
          success: true,
          message: `Unlocked "${found.option.activity?.name}" - it can now be reshuffled.`,
        };
      }

      if (!slot.isLocked) {
        return {
          success: true,
          message: `"${found.option.activity?.name}" is already unlocked.`,
        };
      }

      return {
        success: false,
        message: 'Unlock handler not available.',
      };
    }

    case 'suggest': {
      const category = directive.category;
      const location = directive.location;

      let message = 'Here are some suggestions';
      if (category) message += ` for ${category}`;
      if (location) message += ` near ${location}`;
      if (targetTime) message += ` for ${targetTime}`;
      message += ':';

      // Return static suggestions for now
      return {
        success: true,
        message,
        suggestions: getSuggestionsForCategory(category, location, targetTime),
      };
    }

    case 'add': {
      const category = directive.category;
      const location = directive.location;
      const dayIndex = targetDay !== undefined ? targetDay - 1 : 0;

      if (dayIndex < 0 || dayIndex >= itinerary.days.length) {
        return {
          success: false,
          message: `Day ${targetDay} doesn't exist.`,
        };
      }

      // Find target slot
      let targetSlot: SlotWithOptions | undefined;
      if (targetTime) {
        const found = findSlotByTime(itinerary.days[dayIndex], targetTime);
        targetSlot = found?.slot;
      }

      return {
        success: true,
        message: `Would add a ${category || 'activity'}${location ? ` near ${location}` : ''} to Day ${dayIndex + 1}${targetTime ? ` (${targetTime})` : ''}. (Activity suggestion API integration pending)`,
        suggestions: getSuggestionsForCategory(category, location, targetTime),
      };
    }

    case 'swap': {
      return {
        success: false,
        message: 'Swap requires two activities. Try: "Swap TeamLab with Senso-ji"',
        clarificationNeeded: 'Which two activities would you like to swap?',
      };
    }

    case 'extend':
    case 'shorten': {
      if (!activityName) {
        return {
          success: false,
          message: `Please specify which activity to ${action}.`,
          clarificationNeeded: `Which activity would you like to ${action}?`,
          suggestions: getActivitySuggestions(itinerary),
        };
      }

      const found = findActivityByName(itinerary, activityName);
      if (!found) {
        return {
          success: false,
          message: `Could not find activity "${activityName}".`,
          suggestions: getActivitySuggestions(itinerary),
        };
      }

      return {
        success: true,
        message: `Would ${action} "${found.option.activity?.name}"${directive.duration ? ` to ${directive.duration} minutes` : ''}. (Duration adjustment not yet fully implemented)`,
      };
    }

    default:
      return {
        success: false,
        message: `Unknown action: ${action}`,
      };
  }
}

/**
 * Get list of activity names from itinerary for suggestions
 */
function getActivitySuggestions(itinerary: StructuredItineraryData): string[] {
  const activities: string[] = [];

  for (const day of itinerary.days) {
    for (const slot of day.slots) {
      const selected = slot.options.find(o => o.id === slot.selectedOptionId) || slot.options[0];
      if (selected?.activity?.name) {
        activities.push(selected.activity.name);
      }
    }
  }

  return activities.slice(0, 5);
}

/**
 * Get category-based suggestions
 */
function getSuggestionsForCategory(
  category?: string,
  location?: string,
  time?: string
): string[] {
  // Static suggestions - in production, this would call an API
  const suggestions: Record<string, string[]> = {
    restaurant: [
      'Afuri Ramen - Famous yuzu shio ramen',
      'Gonpachi Nishi-Azabu - "Kill Bill" restaurant',
      'Tsukiji Outer Market - Fresh sushi and seafood',
    ],
    temple: [
      'Senso-ji Temple - Tokyo\'s oldest temple',
      'Meiji Shrine - Serene Shinto shrine',
      'Zojo-ji Temple - Historic temple near Tokyo Tower',
    ],
    museum: [
      'TeamLab Borderless - Digital art museum',
      'Ghibli Museum - Studio Ghibli animations',
      'Tokyo National Museum - Japanese art and history',
    ],
    park: [
      'Yoyogi Park - Large urban park',
      'Ueno Park - Museums and cherry blossoms',
      'Shinjuku Gyoen - Beautiful Japanese garden',
    ],
    shopping: [
      'Shibuya 109 - Fashion shopping',
      'Nakamise Street - Traditional souvenirs',
      'Akihabara - Electronics and anime',
    ],
    nightlife: [
      'Golden Gai - Tiny bars in Shinjuku',
      'Roppongi - Clubs and bars',
      'Shibuya Center-gai - Youth nightlife',
    ],
  };

  if (category && suggestions[category]) {
    return suggestions[category];
  }

  // Default suggestions
  return [
    'Try specifying a category like "restaurant", "temple", or "museum"',
    `Example: "Add sushi lunch near ${location || 'Shinjuku'}"`,
  ];
}

export default parseDirective;
