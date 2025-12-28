// ===========================================
// Dynamic Input Types for AI Responses
// ===========================================

export interface DynamicQuestion {
  id: string;
  type: "text" | "date" | "daterange" | "select" | "multiselect" | "slider" | "number" | "toggle" | "traveler-group";
  label: string;
  description?: string;
  required?: boolean;
  options?: Array<{ value: string; label: string; icon?: string }>;
  placeholder?: string;
  min?: number;
  max?: number;
  step?: number;
  defaultValue?: string | number | boolean | string[] | TravelerGroup;
}

export interface TravelerGroup {
  adults: number;
  children: number;
  childrenAges?: number[]; // Ages of children for activity recommendations
}

export interface DynamicForm {
  id: string;
  title?: string;
  description?: string;
  questions: DynamicQuestion[];
}

export interface AIResponseWithInputs {
  message: string;
  hasQuestions: boolean;
  form?: DynamicForm;
  suggestedActions?: Array<{
    label: string;
    action: string;
    primary?: boolean;
  }>;
}

// ===========================================
// Question Detection Patterns
// ===========================================

const QUESTION_PATTERNS: Array<{
  pattern: RegExp;
  type: DynamicQuestion["type"];
  extractor: (match: RegExpMatchArray, fullText: string) => Partial<DynamicQuestion>;
}> = [
  // Date patterns
  {
    pattern: /when\s+(?:are\s+you|do\s+you\s+plan|would\s+you\s+like)\s+(?:to\s+)?(?:visit|travel|go|arrive|depart)/i,
    type: "daterange",
    extractor: () => ({
      label: "Travel Dates",
      description: "Select your arrival and departure dates",
      placeholder: "Select dates",
    }),
  },
  {
    pattern: /travel\s+dates?|when.*visit|dates?.*trip/i,
    type: "daterange",
    extractor: () => ({
      label: "Travel Dates",
      description: "When would you like to travel?",
    }),
  },
  // Budget patterns
  {
    pattern: /budget|how\s+much.*spend|price\s+range|cost/i,
    type: "select",
    extractor: () => ({
      label: "Budget Level",
      description: "What's your budget for this trip?",
      options: [
        { value: "budget", label: "Budget", icon: "💰" },
        { value: "moderate", label: "Moderate", icon: "💵" },
        { value: "luxury", label: "Luxury", icon: "💎" },
        { value: "no_limit", label: "No Limit", icon: "🌟" },
      ],
    }),
  },
  // Pace patterns
  {
    pattern: /pace|relaxed.*packed|how\s+busy|schedule.*prefer/i,
    type: "select",
    extractor: () => ({
      label: "Trip Pace",
      description: "How would you like to pace your trip?",
      options: [
        { value: "relaxed", label: "Relaxed", icon: "🧘" },
        { value: "moderate", label: "Moderate", icon: "🚶" },
        { value: "packed", label: "Packed", icon: "🏃" },
      ],
    }),
  },
  // Interests patterns
  {
    pattern: /interests?|(?:into|like|enjoy)\s+(?:art|food|history|culture|adventure|nature|shopping)/i,
    type: "multiselect",
    extractor: () => ({
      label: "Interests",
      description: "What are you interested in? (Select all that apply)",
      options: [
        { value: "art", label: "Art & Museums", icon: "🎨" },
        { value: "food", label: "Food & Dining", icon: "🍽️" },
        { value: "history", label: "History & Culture", icon: "🏛️" },
        { value: "nature", label: "Nature & Outdoors", icon: "🌿" },
        { value: "shopping", label: "Shopping", icon: "🛍️" },
        { value: "nightlife", label: "Nightlife", icon: "🌙" },
        { value: "adventure", label: "Adventure", icon: "🎢" },
        { value: "relaxation", label: "Relaxation & Spa", icon: "💆" },
        { value: "photography", label: "Photography", icon: "📸" },
        { value: "architecture", label: "Architecture", icon: "🏰" },
      ],
    }),
  },
  // Number of travelers with kids question
  {
    pattern: /how\s+many.*(?:people|travelers|guests)|group\s+size|traveling\s+with|who.*traveling/i,
    type: "traveler-group",
    extractor: () => ({
      label: "Who's Traveling?",
      description: "Tell us about your travel group",
      defaultValue: { adults: 2, children: 0, childrenAges: [] } as TravelerGroup,
    }),
  },
  // Special occasions
  {
    pattern: /special\s+occasion|celebrat|anniversary|birthday|honeymoon/i,
    type: "select",
    extractor: () => ({
      label: "Special Occasion",
      description: "Are you celebrating something special?",
      options: [
        { value: "none", label: "No special occasion", icon: "✨" },
        { value: "honeymoon", label: "Honeymoon", icon: "💒" },
        { value: "anniversary", label: "Anniversary", icon: "💕" },
        { value: "birthday", label: "Birthday", icon: "🎂" },
        { value: "proposal", label: "Proposal", icon: "💍" },
        { value: "graduation", label: "Graduation", icon: "🎓" },
        { value: "retirement", label: "Retirement", icon: "🎉" },
        { value: "other", label: "Other celebration", icon: "🥳" },
      ],
    }),
  },
  // Accommodation preferences
  {
    pattern: /accommodat|where.*stay|hotel|lodging|prefer.*stay/i,
    type: "select",
    extractor: () => ({
      label: "Accommodation Type",
      description: "Where would you prefer to stay?",
      options: [
        { value: "hotel", label: "Hotel", icon: "🏨" },
        { value: "boutique", label: "Boutique Hotel", icon: "🏩" },
        { value: "airbnb", label: "Airbnb/Apartment", icon: "🏠" },
        { value: "hostel", label: "Hostel", icon: "🛏️" },
        { value: "resort", label: "Resort", icon: "🌴" },
        { value: "villa", label: "Villa", icon: "🏡" },
      ],
    }),
  },
  // Travel style
  {
    pattern: /travel\s+style|type\s+of\s+traveler|kind\s+of\s+trip/i,
    type: "select",
    extractor: () => ({
      label: "Travel Style",
      description: "What's your travel style?",
      options: [
        { value: "adventure", label: "Adventure Seeker", icon: "🏔️" },
        { value: "cultural", label: "Culture Explorer", icon: "🎭" },
        { value: "relaxation", label: "Relaxation Lover", icon: "🌊" },
        { value: "foodie", label: "Foodie", icon: "👨‍🍳" },
        { value: "romantic", label: "Romantic Getaway", icon: "❤️" },
        { value: "family", label: "Family Fun", icon: "👨‍👩‍👧‍👦" },
        { value: "solo", label: "Solo Explorer", icon: "🎒" },
      ],
    }),
  },
];

// ===========================================
// Parse AI Response for Dynamic Inputs
// ===========================================

// Context hints that affect what questions we show
interface ConversationContext {
  isRomantic?: boolean;
  isFamilyTrip?: boolean;
  hasDestination?: boolean;
  hasDates?: boolean;
}

function detectContext(content: string, fullHistory?: string): ConversationContext {
  const text = (fullHistory || content).toLowerCase();
  return {
    isRomantic: /romantic|honeymoon|anniversary|couple|just\s+(?:us|the\s+two)/i.test(text),
    isFamilyTrip: /family|kids?|children|with\s+(?:our|my|the)\s+(?:kid|child)/i.test(text),
    hasDestination: /paris|tokyo|rome|london|barcelona|new\s+york|bali|dubai|amsterdam/i.test(text),
    hasDates: /\d{4}-\d{2}-\d{2}|(?:january|february|march|april|may|june|july|august|september|october|november|december)\s+\d/i.test(text),
  };
}

export function parseAIResponseForInputs(content: string, conversationHistory?: string): AIResponseWithInputs {
  const detectedQuestions: DynamicQuestion[] = [];
  const usedPatterns = new Set<string>();
  const context = detectContext(content, conversationHistory);

  // Check each pattern against the content
  for (const { pattern, type, extractor } of QUESTION_PATTERNS) {
    const match = content.match(pattern);
    if (match && !usedPatterns.has(type)) {
      // Skip certain questions based on context

      // Skip pace question for romantic trips (implied relaxed)
      if (type === "select" && pattern.source.includes("pace") && context.isRomantic) {
        continue;
      }

      // Skip special occasion for romantic/honeymoon (it IS the occasion)
      if (type === "select" && pattern.source.includes("occasion") && context.isRomantic) {
        continue;
      }

      // Skip traveler group for romantic trips (implied 2 adults)
      if (type === "traveler-group" && context.isRomantic) {
        continue;
      }

      const questionData = extractor(match, content);
      detectedQuestions.push({
        id: `q_${type}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        type,
        required: true,
        ...questionData,
      } as DynamicQuestion);
      usedPatterns.add(type);
    }
  }

  // If we detected questions, create a form
  if (detectedQuestions.length > 0) {
    return {
      message: content,
      hasQuestions: true,
      form: {
        id: `form_${Date.now()}`,
        title: "Let me know your preferences",
        description: "Fill in the details below to help me plan your perfect trip",
        questions: detectedQuestions,
      },
      suggestedActions: [
        { label: "Submit", action: "submit", primary: true },
        { label: "Skip for now", action: "skip" },
      ],
    };
  }

  return {
    message: content,
    hasQuestions: false,
  };
}

// ===========================================
// Format User Answers for AI
// ===========================================

export function formatAnswersForAI(
  answers: Record<string, string | number | boolean | string[] | TravelerGroup>,
  questions: DynamicQuestion[]
): string {
  const lines: string[] = ["Here are my preferences:"];

  for (const question of questions) {
    const answer = answers[question.id];
    if (answer === undefined || answer === null || answer === "") continue;

    let formattedAnswer: string;

    // Handle TravelerGroup type
    if (question.type === "traveler-group" && typeof answer === "object" && !Array.isArray(answer)) {
      const group = answer as TravelerGroup;
      const parts: string[] = [];

      if (group.adults === 1) {
        parts.push("1 adult");
      } else {
        parts.push(`${group.adults} adults`);
      }

      if (group.children > 0) {
        if (group.children === 1) {
          parts.push("1 child");
        } else {
          parts.push(`${group.children} children`);
        }

        if (group.childrenAges && group.childrenAges.length > 0) {
          parts.push(`(ages: ${group.childrenAges.join(", ")})`);
        }
      }

      formattedAnswer = parts.join(", ");
      lines.push(`- ${question.label}: ${formattedAnswer}`);

      // Add a note about family-friendly activities if kids are included
      if (group.children > 0) {
        lines.push("- Note: Traveling with children, please suggest family-friendly and kid-appropriate activities");
      }
      continue;
    } else if (Array.isArray(answer)) {
      // For multiselect, find the labels
      const labels = answer.map((v) => {
        const option = question.options?.find((o) => o.value === v);
        return option ? option.label : v;
      });
      formattedAnswer = labels.join(", ");
    } else if (question.options) {
      // For select, find the label
      const option = question.options.find((o) => o.value === answer);
      formattedAnswer = option ? option.label : String(answer);
    } else {
      formattedAnswer = String(answer);
    }

    lines.push(`- ${question.label}: ${formattedAnswer}`);
  }

  return lines.join("\n");
}

// ===========================================
// Check if Response Contains Itinerary
// ===========================================

export function containsItinerary(content: string): boolean {
  const itineraryPatterns = [
    /###?\s*(?:itinerary|day\s*\d+)/i,
    /\*\*day\s*\d+[:\s]/i,
    /(?:day\s+1|day\s+2|day\s+3)[:\s]+/i,
    /(?:morning|afternoon|evening)[:\s]+(?:visit|explore|stroll|check)/i,
    /I'(?:ve|ll)\s+creat(?:e|ed).*(?:itinerary|schedule)/i,
    /here(?:'s| is).*(?:itinerary|schedule|plan)/i,
    /personalized.*itinerary/i,
  ];

  return itineraryPatterns.some((pattern) => pattern.test(content));
}

// ===========================================
// Check if Response Indicates Ready for Itinerary
// ===========================================

export function isReadyForItinerary(content: string): boolean {
  const readyPatterns = [
    /(?:here(?:'s| is)|creating|generating).*itinerary/i,
    /let me (?:create|build|generate|prepare)/i,
    /based on your preferences/i,
    /perfect[!,].*(?:here|let)/i,
    /i'(?:ll|ve) (?:create|prepare|generate)/i,
  ];

  return readyPatterns.some((pattern) => pattern.test(content));
}
