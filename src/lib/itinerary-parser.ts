// ============================================
// AI Itinerary Parser
// Extracts structured data from AI text responses
// ============================================

export interface ParsedActivity {
  id: string;
  name: string;
  description: string;
  timeSlot: "morning" | "lunch" | "afternoon" | "dinner" | "evening";
  startTime?: string;
  endTime?: string;
  type: "attraction" | "restaurant" | "activity" | "transport" | "other";
  tips?: string[];
}

export interface ParsedDay {
  dayNumber: number;
  title: string;
  date?: string;
  activities: ParsedActivity[];
}

export interface ParsedItinerary {
  destination: string;
  title: string;
  days: ParsedDay[];
  tips: string[];
  isComplete: boolean;
}

// Generate unique ID
function generateId(): string {
  return `act_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// Determine time slot from text
function detectTimeSlot(text: string): ParsedActivity["timeSlot"] {
  const lower = text.toLowerCase();

  if (/morning|breakfast|early|9[:\s]?[0-9]|10[:\s]?[0-9]|11[:\s]?[0-9]/i.test(lower)) {
    return "morning";
  }
  if (/lunch|midday|12[:\s]?[0-9]|1[:\s]?[0-9]?[0-9]?\s*pm|noon/i.test(lower)) {
    return "lunch";
  }
  if (/afternoon|2[:\s]?[0-9]|3[:\s]?[0-9]|4[:\s]?[0-9]|5[:\s]?[0-9]?\s*pm/i.test(lower)) {
    return "afternoon";
  }
  if (/dinner|evening meal|7[:\s]?[0-9]|8[:\s]?[0-9]?\s*pm/i.test(lower)) {
    return "dinner";
  }
  if (/evening|night|9[:\s]?[0-9]?\s*pm|10[:\s]?[0-9]?\s*pm|after dinner/i.test(lower)) {
    return "evening";
  }

  return "afternoon"; // Default
}

// Determine activity type from text
function detectActivityType(text: string): ParsedActivity["type"] {
  const lower = text.toLowerCase();

  if (/restaurant|café|cafe|bistro|dinner|lunch|eat|dine|meal|food/i.test(lower)) {
    return "restaurant";
  }
  if (/museum|cathedral|church|palace|castle|monument|historic|gallery/i.test(lower)) {
    return "attraction";
  }
  if (/tour|walk|cruise|show|class|experience|explore/i.test(lower)) {
    return "activity";
  }
  if (/check.?in|hotel|arrive|depart|transfer|airport/i.test(lower)) {
    return "transport";
  }

  return "activity";
}

// Extract time from text like "09:00-12:00" or "Morning:"
function extractTime(text: string): { start?: string; end?: string } {
  // Look for time ranges like "09:00 - 12:00" or "9am-12pm"
  const rangeMatch = text.match(/(\d{1,2}):?(\d{2})?\s*(?:am|pm)?\s*[-–]\s*(\d{1,2}):?(\d{2})?\s*(?:am|pm)?/i);
  if (rangeMatch) {
    const startHour = rangeMatch[1].padStart(2, "0");
    const startMin = rangeMatch[2] || "00";
    const endHour = rangeMatch[3].padStart(2, "0");
    const endMin = rangeMatch[4] || "00";
    return {
      start: `${startHour}:${startMin}`,
      end: `${endHour}:${endMin}`,
    };
  }

  return {};
}

// Parse a single activity line
function parseActivityLine(line: string, context: string): ParsedActivity | null {
  // Skip empty or header lines
  if (!line.trim() || line.trim().length < 10) return null;

  // Extract activity name - look for bold text or text after dash/bullet
  let name = "";
  let description = "";

  // Pattern: "- **Name**: Description" or "- Name: Description"
  const boldPattern = /[-•]\s*\*\*([^*]+)\*\*[:\s]*(.+)?/;
  const colonPattern = /[-•]\s*([^:]+)[:\s]+(.+)/;
  const simplePattern = /[-•]\s*(.+)/;

  let match = line.match(boldPattern);
  if (match) {
    name = match[1].trim();
    description = match[2]?.trim() || "";
  } else {
    match = line.match(colonPattern);
    if (match) {
      name = match[1].trim();
      description = match[2]?.trim() || "";
    } else {
      match = line.match(simplePattern);
      if (match) {
        name = match[1].trim();
      }
    }
  }

  if (!name || name.length < 3) return null;

  // Clean up name - remove time prefixes
  name = name.replace(/^(morning|afternoon|evening|lunch|dinner)[:\s]*/i, "").trim();

  const timeSlot = detectTimeSlot(context + " " + line);
  const type = detectActivityType(name + " " + description);
  const times = extractTime(context + " " + line);

  return {
    id: generateId(),
    name,
    description,
    timeSlot,
    startTime: times.start,
    endTime: times.end,
    type,
  };
}

// Parse the AI itinerary text into structured data
export function parseItineraryFromText(text: string): ParsedItinerary {
  const days: ParsedDay[] = [];
  const tips: string[] = [];
  let destination = "";
  let title = "";

  // Extract destination from text
  const destMatch = text.match(/(?:week|trip|vacation|getaway)\s+(?:in|to)\s+([A-Za-z\s]+?)(?:\.|!|:|\n)/i);
  if (destMatch) {
    destination = destMatch[1].trim();
  }

  // Extract title
  const titleMatch = text.match(/(?:###?\s*)?(?:itinerary|trip|vacation)\s+(?:overview|for|to)?[:\s]*([^\n]+)/i);
  if (titleMatch) {
    title = titleMatch[1].trim();
  } else {
    title = destination ? `Trip to ${destination}` : "Your Trip";
  }

  // Split by day markers
  const dayPattern = /\*\*Day\s*(\d+)[:\s]*([^\n*]+)?\*\*/gi;
  const dayMatches = [...text.matchAll(dayPattern)];

  if (dayMatches.length === 0) {
    // Try alternative patterns
    const altDayPattern = /###?\s*Day\s*(\d+)[:\s]*([^\n]+)?/gi;
    const altMatches = [...text.matchAll(altDayPattern)];
    if (altMatches.length > 0) {
      dayMatches.push(...altMatches);
    }
  }

  // Process each day
  for (let i = 0; i < dayMatches.length; i++) {
    const match = dayMatches[i];
    const dayNumber = parseInt(match[1], 10);
    const dayTitle = match[2]?.trim() || `Day ${dayNumber}`;

    // Get the content between this day marker and the next (or end)
    const startIndex = match.index! + match[0].length;
    const endIndex = i < dayMatches.length - 1 ? dayMatches[i + 1].index! : text.length;
    const dayContent = text.slice(startIndex, endIndex);

    // Parse activities from this day's content
    const activities: ParsedActivity[] = [];

    // Split by time slot markers
    const timeSlotPattern = /[-•]\s*\*?\*?(Morning|Lunch|Afternoon|Dinner|Evening)[:\s*]*/gi;
    let currentSlotContext = "";

    const lines = dayContent.split("\n");
    for (const line of lines) {
      // Check if this is a time slot marker
      const slotMatch = line.match(timeSlotPattern);
      if (slotMatch) {
        currentSlotContext = slotMatch[0];
      }

      // Try to parse as activity
      if (line.includes("-") || line.includes("•") || line.includes("*")) {
        const activity = parseActivityLine(line, currentSlotContext);
        if (activity) {
          activities.push(activity);
        }
      }
    }

    // If no activities parsed with bullets, try line-by-line with context
    if (activities.length === 0) {
      const contextLines = dayContent.split("\n").filter(l => l.trim().length > 10);
      let currentContext = "morning";

      for (const line of contextLines) {
        if (/morning/i.test(line)) currentContext = "morning";
        else if (/lunch/i.test(line)) currentContext = "lunch";
        else if (/afternoon/i.test(line)) currentContext = "afternoon";
        else if (/dinner/i.test(line)) currentContext = "dinner";
        else if (/evening/i.test(line)) currentContext = "evening";

        // Extract activity-like content
        const colonMatch = line.match(/(?:^|\n)\s*[-•]?\s*([^:]+)[:\s]+(.+)/);
        if (colonMatch && colonMatch[1].length > 3 && colonMatch[1].length < 50) {
          activities.push({
            id: generateId(),
            name: colonMatch[1].trim().replace(/^\*+|\*+$/g, ""),
            description: colonMatch[2].trim(),
            timeSlot: currentContext as ParsedActivity["timeSlot"],
            type: detectActivityType(colonMatch[1] + " " + colonMatch[2]),
          });
        }
      }
    }

    days.push({
      dayNumber,
      title: dayTitle,
      activities,
    });
  }

  // Extract tips if present
  const tipsSection = text.match(/###?\s*(?:insider\s+)?tips?[:\s]*\n?([\s\S]*?)(?=###|$)/i);
  if (tipsSection) {
    const tipLines = tipsSection[1].split("\n");
    for (const line of tipLines) {
      const tipMatch = line.match(/[-•*]\s*\*?\*?([^*\n]+)\*?\*?/);
      if (tipMatch && tipMatch[1].trim().length > 10) {
        tips.push(tipMatch[1].trim());
      }
    }
  }

  return {
    destination,
    title,
    days,
    tips,
    isComplete: days.length > 0 && days.some(d => d.activities.length > 0),
  };
}

// Convert parsed itinerary to time-slotted schedule for display
export function convertToSchedule(parsed: ParsedItinerary): ParsedDay[] {
  // Ensure each day has activities in all time slots (fill gaps)
  return parsed.days.map(day => {
    const slotOrder: ParsedActivity["timeSlot"][] = ["morning", "lunch", "afternoon", "dinner", "evening"];

    // Group activities by slot
    const bySlot = new Map<string, ParsedActivity[]>();
    for (const slot of slotOrder) {
      bySlot.set(slot, []);
    }

    for (const activity of day.activities) {
      const existing = bySlot.get(activity.timeSlot) || [];
      existing.push(activity);
      bySlot.set(activity.timeSlot, existing);
    }

    // Flatten back to ordered list
    const orderedActivities: ParsedActivity[] = [];
    for (const slot of slotOrder) {
      orderedActivities.push(...(bySlot.get(slot) || []));
    }

    return {
      ...day,
      activities: orderedActivities,
    };
  });
}

// Get default time for a slot
export function getDefaultTimeForSlot(slot: ParsedActivity["timeSlot"]): { start: string; end: string } {
  switch (slot) {
    case "morning":
      return { start: "09:00", end: "12:00" };
    case "lunch":
      return { start: "12:00", end: "14:00" };
    case "afternoon":
      return { start: "14:00", end: "18:00" };
    case "dinner":
      return { start: "18:00", end: "20:00" };
    case "evening":
      return { start: "20:00", end: "23:00" };
    default:
      return { start: "09:00", end: "12:00" };
  }
}

// Get slot label
export function getSlotLabel(slot: ParsedActivity["timeSlot"]): string {
  switch (slot) {
    case "morning":
      return "Morning";
    case "lunch":
      return "Lunch";
    case "afternoon":
      return "Afternoon";
    case "dinner":
      return "Dinner";
    case "evening":
      return "Evening";
    default:
      return slot;
  }
}
