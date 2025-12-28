// ============================================
// POST /api/chat
// ============================================
// DEPRECATED FOR ITINERARY GENERATION
//
// This endpoint now handles ONLY conversational Q&A.
// For itinerary generation, use:
//   - POST /api/itinerary/generate (new orchestrator API)
//   - POST /api/trips/generate (legacy wrapper)
//
// This endpoint will:
// 1. Handle clarifying questions about trip preferences
// 2. Extract structured context from conversation
// 3. Return a redirect signal when ready to generate itinerary

import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse, ChatMessage, StructuredItineraryData, ItineraryResponseMetadata } from "@/types";
import { generateId } from "@/lib/utils";
import openai, { SYSTEM_PROMPTS, generateStructuredItinerary } from "@/lib/openai";
import { logOpenAIRequest, createLogEntry } from "@/lib/openai-logger";
import type { TripContext } from "@/types/structured-itinerary";

// ============================================
// TYPES
// ============================================

interface ConversationContext {
  destination?: string;
  startDate?: string;
  endDate?: string;
  travelers?: {
    adults?: number;
    children?: number;
  };
  budget?: string;
  pace?: string;
  interests?: string[];
  tripMode?: string;
  isReadyToGenerate: boolean;
  missingFields: string[];
}

interface ChatRequest {
  message: string;
  conversationId?: string;
}

interface ChatResponseData {
  message: ChatMessage;
  conversationId: string;
  context: ConversationContext;
  deprecated?: {
    notice: string;
    useInstead: string;
  };
}

// Store conversation history in memory
const conversationHistory: Map<string, { role: "user" | "assistant"; content: string }[]> = new Map();
const conversationContexts: Map<string, ConversationContext> = new Map();

// ============================================
// CONTEXT EXTRACTION
// ============================================

function extractContext(messages: { role: string; content: string }[]): ConversationContext {
  const context: ConversationContext = {
    isReadyToGenerate: false,
    missingFields: [],
  };

  const fullText = messages.map(m => m.content).join(" ").toLowerCase();

  console.log("[Chat API] Extracting context from messages:", messages.length);
  console.log("[Chat API] Full text (first 200 chars):", fullText.substring(0, 200));

  // Extract destination
  const destinations = [
    "paris", "tokyo", "london", "rome", "barcelona", "amsterdam",
    "new york", "los angeles", "san francisco", "sydney", "bali",
    "bangkok", "singapore", "dubai", "istanbul", "prague", "vienna",
    "berlin", "lisbon", "madrid", "florence", "venice", "kyoto"
  ];
  for (const dest of destinations) {
    if (fullText.includes(dest)) {
      context.destination = dest.charAt(0).toUpperCase() + dest.slice(1);
      console.log("[Chat API] Found destination:", context.destination);
      break;
    }
  }

  // Extract dates
  const datePatterns = [
    /(\d{4}-\d{2}-\d{2})/g,
    /(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}/gi,
  ];
  const dates: string[] = [];
  for (const pattern of datePatterns) {
    const matches = fullText.match(pattern);
    if (matches) dates.push(...matches);
  }
  if (dates.length >= 2) {
    context.startDate = dates[0];
    context.endDate = dates[1];
    console.log("[Chat API] Found dates:", context.startDate, "to", context.endDate);
  }

  // Extract duration - check for "X-day" or "X day" patterns
  const durationMatch = fullText.match(/(\d+)[\s-]?day/i);
  const hasDurationKeyword = fullText.includes("week") || fullText.includes("days") || durationMatch;
  console.log("[Chat API] Duration check - 'week':", fullText.includes("week"), "'days':", fullText.includes("days"), "pattern match:", !!durationMatch);

  if (durationMatch && !context.startDate) {
    // Use today as start date if we have duration but no specific dates
    const numDays = parseInt(durationMatch[1], 10);
    const today = new Date();
    context.startDate = today.toISOString().split("T")[0];
    const endDate = new Date(today.getTime() + (numDays - 1) * 24 * 60 * 60 * 1000);
    context.endDate = endDate.toISOString().split("T")[0];
    console.log("[Chat API] Inferred dates from duration:", context.startDate, "to", context.endDate, "(", numDays, "days)");
  }

  // Extract travelers
  if (fullText.includes("solo") || fullText.includes("alone")) {
    context.travelers = { adults: 1 };
  } else if (fullText.includes("couple") || fullText.includes("romantic") || fullText.includes("honeymoon")) {
    context.travelers = { adults: 2 };
    context.tripMode = "couples";
  } else if (fullText.includes("family")) {
    context.travelers = { adults: 2, children: 2 };
    context.tripMode = "family";
  } else if (fullText.match(/(\d+)\s*adults?/i)) {
    const adultMatch = fullText.match(/(\d+)\s*adults?/i);
    if (adultMatch) {
      context.travelers = { adults: parseInt(adultMatch[1], 10) };
      console.log("[Chat API] Found travelers:", context.travelers);
    }
  }

  // Extract budget
  if (fullText.includes("budget") || fullText.includes("cheap")) {
    context.budget = "budget";
  } else if (fullText.includes("luxury") || fullText.includes("splurge")) {
    context.budget = "luxury";
  } else if (fullText.includes("moderate") || fullText.includes("mid-range")) {
    context.budget = "moderate";
  }
  if (context.budget) console.log("[Chat API] Found budget:", context.budget);

  // Extract pace
  if (fullText.includes("relaxed") || fullText.includes("slow") || fullText.includes("chill")) {
    context.pace = "relaxed";
  } else if (fullText.includes("packed") || fullText.includes("ambitious") || fullText.includes("see everything")) {
    context.pace = "ambitious";
  }
  if (context.pace) console.log("[Chat API] Found pace:", context.pace);

  // Extract interests
  const interestKeywords = [
    "food", "art", "history", "culture", "nature", "adventure",
    "shopping", "nightlife", "museums", "photography", "architecture"
  ];
  context.interests = interestKeywords.filter(i => fullText.includes(i));
  if (context.interests.length > 0) console.log("[Chat API] Found interests:", context.interests);

  // Determine what's missing
  if (!context.destination) context.missingFields.push("destination");
  if (!context.startDate && !hasDurationKeyword) context.missingFields.push("dates");
  if (!context.travelers) context.missingFields.push("travelers");

  // Ready to generate if we have minimum requirements
  context.isReadyToGenerate =
    !!context.destination &&
    (!!context.startDate || !!hasDurationKeyword);

  console.log("[Chat API] Context extraction result:", {
    destination: context.destination,
    startDate: context.startDate,
    endDate: context.endDate,
    travelers: context.travelers,
    budget: context.budget,
    pace: context.pace,
    interests: context.interests,
    isReadyToGenerate: context.isReadyToGenerate,
    missingFields: context.missingFields,
  });

  return context;
}

// ============================================
// ROUTE HANDLER
// ============================================

export async function POST(request: NextRequest) {
  try {
    const { message, conversationId }: ChatRequest = await request.json();

    const currentConversationId = conversationId || generateId();
    const history = conversationHistory.get(currentConversationId) || [];

    // Add user message to history
    history.push({ role: "user", content: message });

    // Extract context from conversation
    const context = extractContext(history);

    let aiResponse: string;

    // Generate conversational response
    if (process.env.OPENAI_API_KEY) {
      try {
        const startTime = Date.now();
        const messages = [
          { role: "system" as const, content: SYSTEM_PROMPTS.travelPlanner },
          ...history.map(m => ({ role: m.role as "user" | "assistant", content: m.content })),
        ];

        const response = await openai.chat.completions.create({
          model: "gpt-4o-mini",
          messages,
          temperature: 0.7,
          max_tokens: 500,
        });

        aiResponse = response.choices[0]?.message?.content || getContextualResponse(context);

        // Log the request
        const logEntry = createLogEntry(
          "chat",
          { model: "gpt-4o-mini", messages, temperature: 0.7, max_tokens: 500 },
          {
            id: response.id,
            content: aiResponse,
            finish_reason: response.choices[0]?.finish_reason || "stop",
            usage: response.usage,
          },
          Date.now() - startTime,
          true
        );
        await logOpenAIRequest(logEntry);

      } catch (error) {
        console.error("OpenAI API error:", error);
        aiResponse = getContextualResponse(context);
      }
    } else {
      aiResponse = getContextualResponse(context);
    }

    // Add assistant response to history
    history.push({ role: "assistant", content: aiResponse });

    // Store updated history
    conversationHistory.set(currentConversationId, history.slice(-20));
    conversationContexts.set(currentConversationId, context);

    // Build response
    const responseMessage: ChatMessage = {
      id: generateId(),
      role: "assistant",
      content: aiResponse,
      type: "text",
      timestamp: new Date(),
    };

    // Add generation prompt if ready - store in a separate field
    const generationInfo = context.isReadyToGenerate ? {
      readyToGenerate: true,
      suggestedAction: "generate_itinerary",
      generationEndpoint: "/api/itinerary/generate",
      extractedContext: context,
    } : null;

    const responseData: ChatResponseData & { generationInfo?: typeof generationInfo } = {
      message: responseMessage,
      conversationId: currentConversationId,
      context,
      generationInfo,
      deprecated: {
        notice: "This endpoint no longer generates itineraries. Use /api/itinerary/generate instead.",
        useInstead: "/api/itinerary/generate",
      },
    };

    const response: ApiResponse<ChatResponseData> = {
      success: true,
      data: responseData,
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error("Chat API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "CHAT_ERROR",
          message: error instanceof Error ? error.message : "Failed to process chat",
        },
      },
      { status: 500 }
    );
  }
}

// ============================================
// CONTEXTUAL RESPONSES
// ============================================

function getContextualResponse(context: ConversationContext): string {
  if (context.isReadyToGenerate) {
    return `I have enough information to create your itinerary! 🎉

**What I understood:**
${context.destination ? `📍 Destination: ${context.destination}` : ""}
${context.startDate ? `📅 Dates: ${context.startDate}${context.endDate ? ` to ${context.endDate}` : ""}` : ""}
${context.travelers ? `👥 Travelers: ${context.travelers.adults} adult(s)${context.travelers.children ? `, ${context.travelers.children} child(ren)` : ""}` : ""}
${context.budget ? `💰 Budget: ${context.budget}` : ""}
${context.pace ? `⚡ Pace: ${context.pace}` : ""}
${context.interests?.length ? `❤️ Interests: ${context.interests.join(", ")}` : ""}

Click "Generate Itinerary" to create your personalized trip plan with scored activities, optimized scheduling, and booking options!`;
  }

  if (context.destination && context.missingFields.length > 0) {
    const missing = context.missingFields
      .map(f => {
        if (f === "dates") return "📅 When are you traveling?";
        if (f === "travelers") return "👥 How many travelers?";
        return f;
      })
      .join("\n");

    return `${context.destination} sounds wonderful! 🌟

To create the perfect itinerary, I just need a bit more info:

${missing}

Once I have these details, I'll generate a personalized itinerary with scored activities and optimized scheduling!`;
  }

  return `Welcome! 🌍 I'm here to help plan your perfect trip.

Tell me about your dream destination and I'll create a personalized itinerary with:
✨ Scored activities matched to your interests
🗓️ Optimized day-by-day scheduling
🍽️ Restaurant recommendations
🚶 Smart routing between locations

Where would you like to go?`;
}
