// ============================================
// Trip Planning Context Types
// ============================================

import { isFutureOrToday, parseDate, adjustToFutureDates } from "./date-validation";

export interface TripPlanningContext {
  // Core trip parameters
  destination?: string;
  destinationId?: number; // Viator destination ID
  startDate?: string;
  endDate?: string;
  travelers?: number;

  // Family/group info
  adults?: number;
  children?: number;
  childrenAges?: number[];
  hasFamilyWithKids?: boolean;

  // Preferences
  budget?: "budget" | "moderate" | "luxury";
  pace?: "relaxed" | "moderate" | "packed";
  interests?: string[];
  travelStyle?: string;
  specialOccasion?: string;

  // Status flags
  isComplete: boolean;
  missingFields: string[];
}

export interface TimeSlot {
  id: string;
  startTime: string; // "09:00"
  endTime: string;   // "12:00"
  label: string;     // "Morning"
  type: "morning" | "lunch" | "afternoon" | "dinner" | "evening";
}

export interface ScheduledActivity {
  id: string;
  timeSlot: TimeSlot;
  activity?: {
    id: string;
    name: string;
    description: string;
    duration: number;
    imageUrl: string;
    rating?: number;
    reviewCount?: number;
    price?: { amount: number; currency: string };
    bookingUrl?: string;
    viatorProductCode?: string;
  };
  isPlaceholder: boolean;
  suggestedActivities?: ViatorActivitySuggestion[];
}

export interface ViatorActivitySuggestion {
  id: string;
  name: string;
  description: string;
  imageUrl: string;
  duration: number;
  rating?: number;
  reviewCount?: number;
  price: { amount: number; currency: string };
  bookingUrl: string;
  viatorProductCode: string;
  tags: string[];
  matchScore?: number; // How well it matches the time slot
  suggestedTimeSlots?: Array<{ startTime: string; endTime: string; label: string }>;
  bestTimeOfDay?: "morning" | "afternoon" | "evening" | "flexible";
}

export interface DaySchedule {
  date: string;
  dayNumber: number;
  title: string;
  slots: ScheduledActivity[];
}

export interface TripSchedule {
  id: string;
  context: TripPlanningContext;
  days: DaySchedule[];
  viatorActivities: ViatorActivitySuggestion[];
  status: "collecting" | "planning" | "ready" | "booked";
}

// ============================================
// Default Time Slots Template
// ============================================

export const DEFAULT_TIME_SLOTS: TimeSlot[] = [
  { id: "morning", startTime: "09:00", endTime: "12:00", label: "Morning", type: "morning" },
  { id: "lunch", startTime: "12:00", endTime: "14:00", label: "Lunch", type: "lunch" },
  { id: "afternoon", startTime: "14:00", endTime: "18:00", label: "Afternoon", type: "afternoon" },
  { id: "dinner", startTime: "18:00", endTime: "20:00", label: "Dinner", type: "dinner" },
  { id: "evening", startTime: "20:00", endTime: "23:00", label: "Evening", type: "evening" },
];

// Packed schedule with more slots
export const PACKED_TIME_SLOTS: TimeSlot[] = [
  { id: "early-morning", startTime: "07:00", endTime: "09:00", label: "Early Morning", type: "morning" },
  { id: "morning", startTime: "09:00", endTime: "12:00", label: "Morning", type: "morning" },
  { id: "lunch", startTime: "12:00", endTime: "13:30", label: "Lunch", type: "lunch" },
  { id: "early-afternoon", startTime: "13:30", endTime: "16:00", label: "Early Afternoon", type: "afternoon" },
  { id: "late-afternoon", startTime: "16:00", endTime: "18:30", label: "Late Afternoon", type: "afternoon" },
  { id: "dinner", startTime: "18:30", endTime: "20:00", label: "Dinner", type: "dinner" },
  { id: "evening", startTime: "20:00", endTime: "23:00", label: "Evening", type: "evening" },
];

// Relaxed schedule with fewer slots
export const RELAXED_TIME_SLOTS: TimeSlot[] = [
  { id: "morning", startTime: "10:00", endTime: "13:00", label: "Late Morning", type: "morning" },
  { id: "lunch", startTime: "13:00", endTime: "15:00", label: "Leisurely Lunch", type: "lunch" },
  { id: "afternoon", startTime: "15:00", endTime: "18:00", label: "Afternoon", type: "afternoon" },
  { id: "dinner", startTime: "19:00", endTime: "21:00", label: "Dinner", type: "dinner" },
];

// ============================================
// Helper Functions
// ============================================

export function getTimeSlotsForPace(pace: string): TimeSlot[] {
  switch (pace) {
    case "packed":
      return PACKED_TIME_SLOTS;
    case "relaxed":
      return RELAXED_TIME_SLOTS;
    default:
      return DEFAULT_TIME_SLOTS;
  }
}

export function createEmptyDaySchedule(
  date: string,
  dayNumber: number,
  pace: string = "moderate"
): DaySchedule {
  const slots = getTimeSlotsForPace(pace);

  return {
    date,
    dayNumber,
    title: `Day ${dayNumber}`,
    slots: slots.map((slot) => ({
      id: `${date}-${slot.id}`,
      timeSlot: slot,
      isPlaceholder: true,
      suggestedActivities: [],
    })),
  };
}

/**
 * Parse a date string in "YYYY-MM-DD" format to a local Date object.
 * This avoids timezone issues where new Date("2026-03-15") interprets
 * the date as UTC midnight, causing date shifts in non-UTC timezones.
 */
function parseDateLocal(dateStr: string): Date {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // month is 0-indexed
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day, 0, 0, 0, 0);
  }
  // Fallback for other formats
  return new Date(dateStr);
}

export function calculateTripDays(startDate: string, endDate: string): number {
  const start = parseDateLocal(startDate);
  const end = parseDateLocal(endDate);
  return Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;
}

export function generateDateRange(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const start = parseDateLocal(startDate);
  const end = parseDateLocal(endDate);

  const current = new Date(start);
  while (current <= end) {
    // Format as YYYY-MM-DD using local date components to avoid timezone issues
    const year = current.getFullYear();
    const month = String(current.getMonth() + 1).padStart(2, '0');
    const day = String(current.getDate()).padStart(2, '0');
    dates.push(`${year}-${month}-${day}`);
    current.setDate(current.getDate() + 1);
  }

  return dates;
}

// ============================================
// Trip Context Extraction from Chat
// ============================================

export function extractTripContext(messages: Array<{ role: string; content: string }>): TripPlanningContext {
  const context: TripPlanningContext = {
    isComplete: false,
    missingFields: [],
  };

  // Combine all messages for pattern matching
  const fullText = messages.map((m) => m.content).join("\n");
  const lowerText = fullText.toLowerCase();

  // Extract destination - be more comprehensive
  const destinationPatterns = [
    // Direct city mentions in context
    /(?:trip to|visit|go to|travel to|planning.*?for|week in|days? in)\s+([a-zA-Z\s,]+?)(?:\.|,|!|\?|$|\n)/gi,
    // When AI confirms destination
    /(?:your|the)?\s*(?:romantic|family|solo)?\s*(?:trip|week|vacation|getaway)\s+(?:to|in)\s+([a-zA-Z\s]+?)(?:\.|,|!|\?|:|$|\n)/gi,
    // Common city names anywhere
    /\b(Paris|Tokyo|Barcelona|Rome|London|New York|Bali|Santorini|Dubai|Amsterdam|Venice|Prague|Vienna|Berlin|Sydney|Kyoto|Florence|Marrakech|Lisbon|Singapore|Hong Kong|Bangkok|Seoul|Copenhagen|Reykjavik)\b/gi,
  ];

  for (const pattern of destinationPatterns) {
    pattern.lastIndex = 0; // Reset regex state
    const match = pattern.exec(fullText);
    if (match) {
      // Clean up the destination name
      const dest = match[1]
        .replace(/trip to|visit|go to|travel to|planning.*?for|week in|days? in/gi, "")
        .trim()
        .replace(/[.,!?:]/g, "")
        .trim();
      if (dest && dest.length > 2 && dest.length < 50) {
        context.destination = dest.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
        break;
      }
    }
  }

  // Extract dates - multiple formats
  const datePatterns = [
    // ISO format: 2026-01-26
    /(\d{4}-\d{2}-\d{2})\s*(?:to|until|-|–)\s*(\d{4}-\d{2}-\d{2})/i,
    // Month Day, Year format: January 26, 2026
    /((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})\s*(?:to|until|-|–)\s*((?:January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4})/i,
    // Shorter format: Jan 26 - Feb 1, 2026
    /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2})[,\s]+(?:\d{4})?\s*(?:to|until|-|–)\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\.?\s+\d{1,2})[,\s]+(\d{4})/i,
  ];

  for (const pattern of datePatterns) {
    const dateMatch = fullText.match(pattern);
    if (dateMatch) {
      context.startDate = dateMatch[1];
      context.endDate = dateMatch[2];
      break;
    }
  }

  // Validate and adjust dates if they're in the past
  // This project only supports future trip planning
  if (context.startDate && context.endDate) {
    const parsedStart = parseDate(context.startDate);
    if (parsedStart && !isFutureOrToday(parsedStart)) {
      // Dates are in the past - adjust to future dates
      const adjusted = adjustToFutureDates(context.startDate, context.endDate);
      context.startDate = adjusted.startDate;
      context.endDate = adjusted.endDate;
    }
  }

  // Extract budget from AI confirmation or user input
  if (lowerText.includes("budget level: budget") || lowerText.includes("budget-friendly") || lowerText.includes("**budget level**: budget")) {
    context.budget = "budget";
  } else if (lowerText.includes("budget level: luxury") || lowerText.includes("luxury") || lowerText.includes("**budget level**: luxury")) {
    context.budget = "luxury";
  } else if (lowerText.includes("budget level: moderate") || lowerText.includes("moderate budget") || lowerText.includes("**budget level**: moderate")) {
    context.budget = "moderate";
  }

  // Extract pace
  if (lowerText.includes("trip pace: relaxed") || lowerText.includes("relaxed pace") || lowerText.includes("romantic")) {
    context.pace = "relaxed";
  } else if (lowerText.includes("trip pace: packed") || lowerText.includes("packed schedule")) {
    context.pace = "packed";
  } else if (lowerText.includes("trip pace: moderate") || lowerText.includes("moderate pace")) {
    context.pace = "moderate";
  }

  // Extract interests from AI confirmation format
  const interestsMatch = fullText.match(/\*\*interests?\*\*[:\s]*([^\n]+)/i);
  if (interestsMatch) {
    context.interests = interestsMatch[1]
      .split(/[,&]/)
      .map((i) => i.trim().replace(/^[-•]\s*/, ""))
      .filter((i) => i.length > 2);
  } else {
    // Fallback to general interest patterns
    const interestPatterns = [
      /interests?:\s*([^.\n]+)/gi,
      /(?:into|like|enjoy|love)\s+([a-z,\s&]+?)(?:\.|,|!|\?|$)/gi,
    ];

    for (const pattern of interestPatterns) {
      const match = lowerText.match(pattern);
      if (match) {
        const interestText = match[0].replace(/interests?:/gi, "").trim();
        context.interests = interestText
          .split(/[,&]/)
          .map((i) => i.trim())
          .filter((i) => i.length > 2);
        break;
      }
    }
  }

  // Extract travelers count (adults) - check for romantic trip = 2 adults
  if (/romantic|honeymoon|anniversary|couple/i.test(lowerText)) {
    context.adults = 2;
    context.travelers = 2;
  } else {
    const adultsPattern = /(\d+)\s*(?:adults?)/i;
    const adultsMatch = lowerText.match(adultsPattern);
    if (adultsMatch) {
      context.adults = parseInt(adultsMatch[1], 10);
    }
  }

  // Extract children count
  const childrenPatterns = [
    /(\d+)\s*(?:children|child|kids?)/i,
    /traveling with children/i,
    /family-friendly/i,
    /kid-appropriate/i,
    /kid-friendly/i,
  ];

  for (const pattern of childrenPatterns) {
    const match = lowerText.match(pattern);
    if (match) {
      if (match[1]) {
        context.children = parseInt(match[1], 10);
        context.hasFamilyWithKids = true;
      } else {
        // Patterns like "traveling with children" without a number
        context.hasFamilyWithKids = true;
      }
      break;
    }
  }

  // Extract children's ages if mentioned
  const agesPattern = /ages?[:\s]*(\d+(?:\s*,\s*\d+)*)/i;
  const agesMatch = lowerText.match(agesPattern);
  if (agesMatch && context.hasFamilyWithKids) {
    context.childrenAges = agesMatch[1]
      .split(/\s*,\s*/)
      .map((a) => parseInt(a.trim(), 10))
      .filter((a) => !isNaN(a) && a >= 0 && a < 18);
  }

  // Total travelers count
  const travelersPattern = /(\d+)\s*(?:people|travelers|guests)/i;
  const travelersMatch = lowerText.match(travelersPattern);
  if (travelersMatch) {
    context.travelers = parseInt(travelersMatch[1], 10);
  } else if (!context.travelers) {
    // Calculate from adults + children
    context.travelers = (context.adults || 0) + (context.children || 0);
  }

  // Determine missing fields
  if (!context.destination) context.missingFields.push("destination");
  if (!context.startDate || !context.endDate) context.missingFields.push("dates");
  if (!context.budget) context.missingFields.push("budget");
  if (!context.pace) context.missingFields.push("pace");
  if (!context.travelers && !context.adults) context.missingFields.push("travelers");

  // Check if complete (destination + dates are minimum)
  context.isComplete = !!context.destination && !!context.startDate && !!context.endDate;

  return context;
}

// ============================================
// Match Activities to Time Slots
// ============================================

export function matchActivityToSlot(
  activity: ViatorActivitySuggestion,
  slot: TimeSlot
): number {
  let score = 0;

  // Duration match (activities should fit in the slot)
  const slotDuration = getSlotDurationMinutes(slot);
  if (activity.duration <= slotDuration) {
    score += 30;
    // Bonus for activities that use most of the slot
    if (activity.duration >= slotDuration * 0.6) {
      score += 20;
    }
  }

  // Type match based on tags and slot type
  const tags = activity.tags.map((t) => t.toLowerCase());

  switch (slot.type) {
    case "morning":
      if (tags.some((t) => t.includes("tour") || t.includes("walk") || t.includes("museum"))) {
        score += 20;
      }
      break;
    case "lunch":
      if (tags.some((t) => t.includes("food") || t.includes("culinary") || t.includes("cooking"))) {
        score += 30;
      }
      break;
    case "afternoon":
      if (tags.some((t) => t.includes("attraction") || t.includes("activity") || t.includes("experience"))) {
        score += 20;
      }
      break;
    case "dinner":
      if (tags.some((t) => t.includes("food") || t.includes("dinner") || t.includes("wine"))) {
        score += 30;
      }
      break;
    case "evening":
      if (tags.some((t) => t.includes("night") || t.includes("show") || t.includes("entertainment"))) {
        score += 25;
      }
      break;
  }

  // Rating bonus
  if (activity.rating && activity.rating >= 4.5) {
    score += 15;
  } else if (activity.rating && activity.rating >= 4.0) {
    score += 10;
  }

  return score;
}

function getSlotDurationMinutes(slot: TimeSlot): number {
  const [startHour, startMin] = slot.startTime.split(":").map(Number);
  const [endHour, endMin] = slot.endTime.split(":").map(Number);

  return (endHour * 60 + endMin) - (startHour * 60 + startMin);
}
