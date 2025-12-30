/**
 * Itinerary Chat API
 *
 * POST /api/itinerary/chat
 *
 * Handles natural language commands for itinerary manipulation.
 * Parses user messages into structured intents, validates against constraints,
 * and returns either:
 * - Applied changes with undo action
 * - Clarifying questions if intent is ambiguous
 * - Suggestions if requested
 * - Error messages if constraints are violated
 */

import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse } from "@/types";
import type {
  ItineraryChatRequest,
  ItineraryChatResponse,
  ItineraryChatMessage,
  QuickAction,
} from "@/types/itinerary-chat";
import type { ItinerarySlotType, StructuredItineraryData } from "@/types/structured-itinerary";
import { parseIntent, parseUserMessage } from "@/lib/itinerary-intent-parser";
import { createActionExecutor } from "@/lib/itinerary-action-executor";
import { createConstraintEngine } from "@/lib/constraint-engine";
import { generateId } from "@/lib/utils";
import {
  recalculateTimeSlots,
  mergeConsecutiveFreeSlots,
} from "@/utils/itinerary-helpers";

// ============================================
// API HANDLER
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body: ItineraryChatRequest = await request.json();
    const { message, itinerary, context } = body;

    if (!message || !itinerary) {
      return NextResponse.json<ApiResponse<ItineraryChatResponse>>(
        {
          success: false,
          error: {
            code: "INVALID_REQUEST",
            message: "Message and itinerary are required",
          },
        },
        { status: 400 }
      );
    }

    // Initialize constraint engine with settings
    const constraintEngine = createConstraintEngine(
      context.constraintSettings
        ? {
            strictMode: context.constraintSettings.strictMode,
            autoAdjust: context.constraintSettings.autoAdjust,
            respectClusters: context.constraintSettings.respectClusters,
            weatherAware: context.constraintSettings.weatherAware,
          }
        : undefined
    );

    const actionExecutor = createActionExecutor(constraintEngine);

    // Parse the user message into an intent
    const parseResult = await parseIntent(message, itinerary, {
      currentDayIndex: context.currentDayIndex,
      selectedSlotId: context.selectedSlotId,
      conversationHistory: context.conversationHistory,
      useLLMFallback: true,
    });

    // If clarification is needed, return the question
    if (parseResult.needsClarification) {
      const response: ItineraryChatResponse = {
        message: parseResult.clarificationQuestion || "I need more information to help you.",
        intent: parseResult.intent,
        clarifyingQuestion: {
          question: parseResult.clarificationQuestion || "Could you provide more details?",
          options: parseResult.clarificationOptions || [],
        },
        suggestedActions: parseResult.suggestedQuickActions || [],
      };

      return NextResponse.json<ApiResponse<ItineraryChatResponse>>({
        success: true,
        data: response,
      });
    }

    // If we have a valid intent, execute it
    if (parseResult.intent) {
      // Handle ASK_QUESTION separately (no execution needed)
      if (parseResult.intent.type === "ASK_QUESTION") {
        const answer = await handleQuestion(
          message,
          itinerary,
          context.conversationHistory || []
        );

        const response: ItineraryChatResponse = {
          message: answer,
          intent: parseResult.intent,
          suggestedActions: parseResult.suggestedQuickActions || [],
        };

        return NextResponse.json<ApiResponse<ItineraryChatResponse>>({
          success: true,
          data: response,
        });
      }

      // Handle SUGGEST_FROM_REPLACEMENT_POOL - trigger UI action to open fill-slot panel
      if (parseResult.intent.type === "SUGGEST_FROM_REPLACEMENT_POOL") {
        const params = parseResult.intent.params as { slotType?: string; dayNumber?: number };
        const dayNumber = params.dayNumber || (context.currentDayIndex + 1);
        const dayIndex = dayNumber - 1;
        const requestedSlotType = params.slotType || "morning";

        // Find the slot ID for the specified slot type on the day
        const day = itinerary.days[dayIndex];
        let targetSlotId = "";
        let isEmptySlot = false;
        let existingActivityName = "";
        let actualSlotType = requestedSlotType;

        if (day) {
          // IMPORTANT: Process the day's slots the same way the client does
          // This creates FREE TIME slots for gaps between activities
          const startTime = day.slots[0]?.timeRange?.start || "09:00";
          const recalculatedSlots = recalculateTimeSlots(day.slots, startTime, dayNumber);
          const processedSlots = mergeConsecutiveFreeSlots(recalculatedSlots, dayNumber);

          // Log slots for debugging (after processing)
          console.log("[Chat API] Day slots (after processing):", processedSlots.map(s => ({
            id: s.slotId,
            type: s.slotType,
            options: s.options.length,
            isFree: s.slotId.startsWith("free-") || s.options.length === 0
          })));

          // First, look for an empty slot (options.length === 0) of the specified type
          const emptySlotOfType = processedSlots.find(s => {
            return s.options.length === 0 && s.slotType === requestedSlotType;
          });

          if (emptySlotOfType) {
            targetSlotId = emptySlotOfType.slotId;
            isEmptySlot = true;
            actualSlotType = emptySlotOfType.slotType;
            console.log("[Chat API] Found empty slot of type:", requestedSlotType, "->", targetSlotId);
          } else {
            // No empty slot of that type - check for ANY empty slot on the day
            const anyEmptySlot = processedSlots.find(s => s.options.length === 0);
            if (anyEmptySlot) {
              targetSlotId = anyEmptySlot.slotId;
              isEmptySlot = true;
              actualSlotType = anyEmptySlot.slotType;
              console.log("[Chat API] Found any empty slot:", targetSlotId, "type:", actualSlotType);
            } else {
              // No empty slots at all - check if there's a non-empty slot of the requested type
              const filledSlotOfType = processedSlots.find(s => s.slotType === requestedSlotType && s.options.length > 0);
              if (filledSlotOfType) {
                targetSlotId = filledSlotOfType.slotId;
                isEmptySlot = false;
                // Get the current activity name
                const selectedOption = filledSlotOfType.options.find(o => o.id === filledSlotOfType.selectedOptionId) || filledSlotOfType.options[0];
                existingActivityName = selectedOption?.activity?.name || "an activity";
                console.log("[Chat API] Slot not empty, has:", existingActivityName);
              }
            }
          }
        }

        // If slot is not empty, suggest alternatives instead
        if (!isEmptySlot && targetSlotId) {
          const response: ItineraryChatResponse = {
            message: `The ${requestedSlotType} slot on Day ${dayNumber} already has "${existingActivityName}". Would you like to:\n• Replace it with something else\n• Browse alternative options for that slot\n• Add a new activity at a different time`,
            intent: parseResult.intent,
            suggestedActions: [
              {
                id: "replace-activity",
                label: `Replace ${existingActivityName}`,
                action: {
                  type: "REPLACE_ACTIVITY",
                  params: {
                    targetSlotId,
                    targetActivityName: existingActivityName,
                    replacementDescription: "something new",
                    dayNumber,
                  },
                },
              },
              {
                id: "suggest-alternatives",
                label: "Show alternatives",
                action: {
                  type: "SUGGEST_ALTERNATIVES",
                  params: {
                    context: "slot" as const,
                    slotId: targetSlotId,
                    dayNumber,
                    preferences: `alternatives for ${requestedSlotType}`,
                  },
                },
              },
            ],
          };

          return NextResponse.json<ApiResponse<ItineraryChatResponse>>({
            success: true,
            data: response,
          });
        }

        // Empty slot found - trigger UI action to open fill-slot panel
        // We pass criteria (dayIndex + slotType) instead of exact ID
        // The client will find the first empty slot matching these criteria
        const response: ItineraryChatResponse = {
          message: `Opening suggestions for the ${actualSlotType} slot on Day ${dayNumber}. Choose from the options in the fill-slot panel.`,
          intent: parseResult.intent,
          suggestedActions: parseResult.suggestedQuickActions || [],
          uiAction: {
            type: "OPEN_FILL_SLOT_PANEL",
            params: {
              dayIndex,
              slotType: actualSlotType as ItinerarySlotType,
              findFirstEmpty: true,
            },
          },
        };

        return NextResponse.json<ApiResponse<ItineraryChatResponse>>({
          success: true,
          data: response,
        });
      }

      // Handle SUGGEST_ALTERNATIVES - trigger UI action to show alternatives panel
      if (parseResult.intent.type === "SUGGEST_ALTERNATIVES") {
        const params = parseResult.intent.params as { slotId?: string; dayNumber?: number; preferences?: string };
        const dayNumber = params.dayNumber || (context.currentDayIndex + 1);
        const dayIndex = dayNumber - 1;

        // Find the slot and activity
        const day = itinerary.days[dayIndex];
        let targetSlotId = params.slotId || "";
        let activityName = "this activity";

        if (day) {
          // If no specific slot, find the first slot with an activity
          if (!targetSlotId && day.slots.length > 0) {
            const firstFilledSlot = day.slots.find(s => s.options.length > 0);
            if (firstFilledSlot) {
              targetSlotId = firstFilledSlot.slotId;
              const selectedOption = firstFilledSlot.options.find(o => o.id === firstFilledSlot.selectedOptionId) || firstFilledSlot.options[0];
              activityName = selectedOption?.activity?.name || "this activity";
            }
          } else if (targetSlotId) {
            const slot = day.slots.find(s => s.slotId === targetSlotId);
            if (slot) {
              const selectedOption = slot.options.find(o => o.id === slot.selectedOptionId) || slot.options[0];
              activityName = selectedOption?.activity?.name || "this activity";
            }
          }
        }

        console.log("[Chat API] SUGGEST_ALTERNATIVES - triggering UI action:", {
          dayIndex,
          slotId: targetSlotId,
          activityName,
        });

        const response: ItineraryChatResponse = {
          message: `Showing alternatives for "${activityName}" on Day ${dayNumber}. Browse the options in the alternatives panel.`,
          intent: parseResult.intent,
          suggestedActions: parseResult.suggestedQuickActions || [],
          uiAction: {
            type: "SHOW_ALTERNATIVES_PANEL",
            params: {
              dayIndex,
              slotId: targetSlotId,
              activityName,
            },
          },
        };

        return NextResponse.json<ApiResponse<ItineraryChatResponse>>({
          success: true,
          data: response,
        });
      }

      // Handle OPTIMIZE_ROUTE - execute and return UI action to highlight changes
      if (parseResult.intent.type === "OPTIMIZE_ROUTE") {
        const params = parseResult.intent.params as { dayNumber?: number };
        const dayNumber = params.dayNumber || (context.currentDayIndex + 1);
        const dayIndex = dayNumber - 1;

        // Execute the optimization
        const executionResult = await actionExecutor.execute(parseResult.intent, itinerary);

        if (executionResult.success && executionResult.newItinerary) {
          // Get the reordered slot IDs from the optimized day
          const optimizedDay = executionResult.newItinerary.days[dayIndex];
          const reorderedSlotIds = optimizedDay?.slots.map(s => s.slotId) || [];

          // Calculate travel time saved (simplified estimation)
          let travelTimeSaved = 0;
          const originalDay = itinerary.days[dayIndex];
          if (originalDay && optimizedDay) {
            const originalTravel = originalDay.slots.reduce((sum, s) => sum + (s.commuteFromPrevious?.duration || 0), 0);
            const optimizedTravel = optimizedDay.slots.reduce((sum, s) => sum + (s.commuteFromPrevious?.duration || 0), 0);
            travelTimeSaved = Math.max(0, originalTravel - optimizedTravel);
          }

          console.log("[Chat API] OPTIMIZE_ROUTE - triggering UI action:", {
            dayIndex,
            reorderedSlotIds,
            travelTimeSaved,
          });

          const response: ItineraryChatResponse = {
            message: executionResult.message + (travelTimeSaved > 0 ? ` Saved approximately ${travelTimeSaved} minutes of travel time.` : ""),
            intent: parseResult.intent,
            suggestedActions: parseResult.suggestedQuickActions || [],
            appliedChanges: {
              newItinerary: executionResult.newItinerary,
              undoAction: executionResult.undoAction || { type: "UNDO", params: {} },
            },
            uiAction: {
              type: "HIGHLIGHT_ROUTE_OPTIMIZATION",
              params: {
                dayIndex,
                reorderedSlotIds,
                travelTimeSaved,
              },
            },
          };

          return NextResponse.json<ApiResponse<ItineraryChatResponse>>({
            success: true,
            data: response,
          });
        }

        // If optimization failed, return the error
        const response: ItineraryChatResponse = {
          message: executionResult.message,
          intent: parseResult.intent,
          suggestedActions: parseResult.suggestedQuickActions || [],
          blocked: {
            reason: executionResult.message,
            constraint: "travel",
          },
        };

        return NextResponse.json<ApiResponse<ItineraryChatResponse>>({
          success: true,
          data: response,
        });
      }

      const executionResult = await actionExecutor.execute(parseResult.intent, itinerary);

      // Build response based on execution result
      const response: ItineraryChatResponse = {
        message: executionResult.message,
        intent: parseResult.intent,
        suggestedActions: parseResult.suggestedQuickActions || [],
      };

      if (!executionResult.success) {
        response.blocked = {
          reason: executionResult.message,
          constraint: executionResult.constraintAnalysis?.affectedLayers[0] || "temporal",
        };

        // Add alternative suggestions based on the blocked action
        response.suggestedActions = await generateAlternativeSuggestions(
          parseResult.intent,
          itinerary,
          executionResult
        );
      } else if (executionResult.newItinerary) {
        response.appliedChanges = {
          newItinerary: executionResult.newItinerary,
          undoAction: executionResult.undoAction || { type: "UNDO", params: {} },
        };
      }

      // Add constraint analysis if there are warnings
      if (executionResult.constraintAnalysis) {
        response.constraintAnalysis = executionResult.constraintAnalysis;
      }

      // Check for proactive nudges
      response.proactiveNudges = generateProactiveNudges(
        executionResult.newItinerary || itinerary,
        context.currentDayIndex
      );

      return NextResponse.json<ApiResponse<ItineraryChatResponse>>({
        success: true,
        data: response,
      });
    }

    // Default response if we couldn't process the message
    const response: ItineraryChatResponse = {
      message: "I'm not sure what you'd like to do. Try commands like:\n- \"Move [activity] to morning\"\n- \"Add a ramen lunch on day 2\"\n- \"Swap [activity1] with [activity2]\"\n- \"Lock [activity]\"\n- \"Optimize today's route\"",
      intent: null,
      suggestedActions: parseResult.suggestedQuickActions || [],
    };

    return NextResponse.json<ApiResponse<ItineraryChatResponse>>({
      success: true,
      data: response,
    });
  } catch (error) {
    console.error("[Itinerary Chat API] Error:", error);
    return NextResponse.json<ApiResponse<ItineraryChatResponse>>(
      {
        success: false,
        error: {
          code: "CHAT_ERROR",
          message: error instanceof Error ? error.message : "Failed to process chat message",
        },
      },
      { status: 500 }
    );
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate alternative suggestions when an action is blocked
 */
async function generateAlternativeSuggestions(
  blockedIntent: NonNullable<ReturnType<typeof parseUserMessage>["intent"]>,
  itinerary: ItineraryChatRequest["itinerary"],
  executionResult: Awaited<ReturnType<ReturnType<typeof createActionExecutor>["execute"]>>
): Promise<QuickAction[]> {
  const suggestions: QuickAction[] = [];

  switch (blockedIntent.type) {
    case "MOVE_ACTIVITY": {
      // Suggest swapping instead
      suggestions.push({
        id: generateId(),
        label: "Swap with another activity instead",
        description: "Choose another activity to swap positions with",
        action: {
          type: "SUGGEST_ALTERNATIVES",
          params: {
            context: "slot",
            preferences: "swap options",
          },
        },
      });
      break;
    }

    case "REMOVE_ACTIVITY": {
      // Suggest unlocking first
      suggestions.push({
        id: generateId(),
        label: "Unlock the activity first",
        action: {
          type: "UNLOCK_SLOT",
          params: {
            slotId: (blockedIntent.params as { slotId?: string }).slotId || "",
          },
        },
        isPrimary: true,
      });
      break;
    }
  }

  // Always offer to ask for help
  suggestions.push({
    id: generateId(),
    label: "Help me find an alternative",
    action: {
      type: "ASK_QUESTION",
      params: {
        question: "What are my options?",
      },
    },
  });

  return suggestions;
}

/**
 * Generate proactive nudges based on itinerary state
 */
function generateProactiveNudges(
  itinerary: ItineraryChatRequest["itinerary"],
  currentDayIndex: number
): ItineraryChatResponse["proactiveNudges"] {
  const nudges: NonNullable<ItineraryChatResponse["proactiveNudges"]> = [];
  const day = itinerary.days[currentDayIndex];

  if (!day) return nudges;

  // Check pacing
  let totalActivityMinutes = 0;
  for (const slot of day.slots) {
    const activity = slot.options.find((o) => o.id === slot.selectedOptionId) || slot.options[0];
    if (activity?.activity?.duration) {
      totalActivityMinutes += activity.activity.duration;
    }
  }

  if (totalActivityMinutes > 600) {
    nudges.push({
      type: "pacing",
      message: `Day ${currentDayIndex + 1} has ${Math.round(totalActivityMinutes / 60)} hours of activities. Consider spreading them out.`,
      suggestedAction: {
        type: "BALANCE_PACING",
        params: { dayNumber: currentDayIndex + 1 },
      },
    });
  }

  // Check for booking requirements
  for (const slot of day.slots) {
    if (slot.fragility?.bookingRequired && !slot.isLocked) {
      const activity = slot.options.find((o) => o.id === slot.selectedOptionId) || slot.options[0];
      nudges.push({
        type: "booking",
        message: `"${activity?.activity?.name}" requires advance booking.`,
        suggestedAction: {
          type: "LOCK_SLOT",
          params: { slotId: slot.slotId },
        },
      });
      break; // Only one booking nudge per response
    }
  }

  return nudges.slice(0, 2); // Max 2 nudges
}

/**
 * Handle general questions using LLM
 */
async function handleQuestion(
  question: string,
  itinerary: ItineraryChatRequest["itinerary"],
  history: ItineraryChatMessage[]
): Promise<string> {
  // Build context about the itinerary
  const itineraryContext = buildItineraryContext(itinerary);

  const systemPrompt = `You are a helpful travel assistant. The user has a ${itinerary.days.length}-day trip to ${itinerary.destination}.

Here's their itinerary:
${itineraryContext}

Answer their question helpfully and concisely. If they ask about modifying the itinerary, suggest using commands like "Move X to Y" or "Add X to day N".`;

  // Try Gemini first
  if (process.env.GEMINI_API_KEY) {
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: question }] }],
        systemInstruction: systemPrompt,
      });

      return result.response.text() || generateFallbackAnswer(question, itinerary);
    } catch (error) {
      console.error("[Itinerary Chat API] Gemini question error:", error);
    }
  }

  // Fall back to OpenAI via unified llm module
  if (process.env.OPENAI_API_KEY) {
    try {
      const { llm } = await import("@/lib/llm");
      const response = await llm.chat(
        [
          { role: "system", content: systemPrompt },
          ...history.slice(-5).map((m) => ({
            role: m.role as "user" | "assistant",
            content: m.content,
          })),
          { role: "user", content: question },
        ],
        { temperature: 0.7, maxTokens: 300, providerOverride: "openai" }
      );

      return response || generateFallbackAnswer(question, itinerary);
    } catch (error) {
      console.error("[Itinerary Chat API] OpenAI question error:", error);
    }
  }

  return generateFallbackAnswer(question, itinerary);
}

/**
 * Build a text summary of the itinerary for context
 */
function buildItineraryContext(itinerary: ItineraryChatRequest["itinerary"]): string {
  const lines: string[] = [];

  for (const day of itinerary.days) {
    lines.push(`Day ${day.dayNumber} (${day.city}): ${day.title}`);
    for (const slot of day.slots) {
      const activity = slot.options.find((o) => o.id === slot.selectedOptionId) || slot.options[0];
      if (activity?.activity?.name) {
        lines.push(`  - ${slot.slotType}: ${activity.activity.name}`);
      }
    }
  }

  return lines.join("\n");
}

/**
 * Handle suggestion requests (SUGGEST_ALTERNATIVES, SUGGEST_FROM_REPLACEMENT_POOL) using LLM
 */
async function handleSuggestionRequest(
  message: string,
  itinerary: ItineraryChatRequest["itinerary"],
  intent: NonNullable<ReturnType<typeof parseUserMessage>["intent"]>,
  history: ItineraryChatMessage[]
): Promise<string> {
  // Try to use Gemini or OpenAI
  const params = intent.params as { slotType?: string; dayNumber?: number; preferences?: string };
  const slotType = params.slotType || "morning";
  const dayNumber = params.dayNumber || 1;

  // Get current day context
  const day = itinerary.days[dayNumber - 1];
  const dayCity = day?.city || itinerary.destination;
  const existingActivities = day?.slots.map(s => {
    const activity = s.options.find(o => o.id === s.selectedOptionId) || s.options[0];
    return activity?.activity?.name;
  }).filter(Boolean).join(", ") || "none";

  // Try Gemini first
  if (process.env.GEMINI_API_KEY) {
    try {
      const { GoogleGenerativeAI } = await import("@google/generative-ai");
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

      const prompt = `You are a travel assistant helping plan a trip to ${itinerary.destination}.

The user is looking at Day ${dayNumber} (${dayCity}) and wants to fill the ${slotType} slot.

Current activities on this day: ${existingActivities}

User's request: "${message}"

Suggest 3-4 specific activities or places that would fit well for the ${slotType} time slot. For each suggestion, include:
1. Name of the place/activity
2. Brief description (1-2 sentences)
3. Why it's a good fit for ${slotType}

Be specific with real venue names when possible. Format as a friendly, conversational response.`;

      const result = await model.generateContent({
        contents: [{ role: "user", parts: [{ text: prompt }] }],
        systemInstruction: "You are a helpful travel assistant. Be friendly, specific, and provide actionable suggestions.",
      });

      return result.response.text() || generateFallbackSuggestions(slotType, dayCity);
    } catch (error) {
      console.error("[Itinerary Chat API] Gemini suggestion error:", error);
    }
  }

  // Fall back to OpenAI via unified llm module
  if (process.env.OPENAI_API_KEY) {
    try {
      const { llm } = await import("@/lib/llm");
      const response = await llm.chat(
        [
          {
            role: "system",
            content: "You are a helpful travel assistant. Be friendly, specific, and provide actionable suggestions.",
          },
          {
            role: "user",
            content: `Suggest 3-4 activities for the ${slotType} slot on Day ${dayNumber} in ${dayCity}. Current activities: ${existingActivities}. User said: "${message}"`,
          },
        ],
        { temperature: 0.7, maxTokens: 400, providerOverride: "openai" }
      );

      return response || generateFallbackSuggestions(slotType, dayCity);
    } catch (error) {
      console.error("[Itinerary Chat API] OpenAI suggestion error:", error);
    }
  }

  return generateFallbackSuggestions(slotType, dayCity);
}

/**
 * Generate fallback suggestions without LLM
 */
function generateFallbackSuggestions(slotType: string, city: string): string {
  const suggestions: Record<string, string> = {
    morning: `For a ${slotType} activity in ${city}, consider:
• **Temple or Shrine Visit** - Start your day with a peaceful cultural experience
• **Local Market Exploration** - Experience the morning bustle and fresh food
• **Park or Garden Stroll** - Enjoy the cooler morning temperatures

To add one, just say: "Add [activity name] to morning"`,

    lunch: `For ${slotType} in ${city}, consider:
• **Local Ramen Shop** - Try the regional specialty
• **Casual Izakaya** - Great for a variety of dishes
• **Street Food Tour** - Explore local flavors on foot

To add one, say: "Add ramen lunch on this day"`,

    afternoon: `For an ${slotType} activity in ${city}, consider:
• **Museum or Gallery** - Beat the midday heat with culture
• **Shopping District** - Explore local shops and boutiques
• **Neighborhood Walking Tour** - Discover hidden gems

To add one, say: "Add [activity] to afternoon"`,

    dinner: `For ${slotType} in ${city}, consider:
• **Traditional Restaurant** - Try authentic local cuisine
• **Rooftop Bar/Restaurant** - Enjoy views with your meal
• **Food Alley** - Multiple options in one location

To add one, say: "Add sushi dinner"`,

    evening: `For an ${slotType} activity in ${city}, consider:
• **Night View Spot** - City lights and skyline views
• **Entertainment District** - Experience the nightlife
• **Late-Night Food Tour** - Discover the after-hours food scene

To add one, say: "Add evening activity"`,
  };

  return suggestions[slotType] || suggestions["afternoon"];
}

/**
 * Generate a fallback answer without LLM
 */
function generateFallbackAnswer(question: string, itinerary: ItineraryChatRequest["itinerary"]): string {
  const q = question.toLowerCase();

  if (q.includes("how many days") || q.includes("how long")) {
    return `Your trip is ${itinerary.days.length} days long, visiting ${itinerary.destination}.`;
  }

  if (q.includes("weather") || q.includes("rain")) {
    return "I don't have current weather data, but I recommend checking a weather app closer to your trip dates.";
  }

  if (q.includes("best") && q.includes("restaurant")) {
    return "To find restaurant recommendations, try: \"Add a ramen lunch near Shinjuku\" or \"Suggest dinner options for day 2\".";
  }

  if (q.includes("help") || q.includes("what can you do")) {
    return `I can help you manage your ${itinerary.destination} itinerary! Try commands like:
• "Move [activity] to morning"
• "Add sushi lunch on day 2"
• "Swap [activity1] with [activity2]"
• "Lock [activity]" to protect it from changes
• "Optimize day 3 route"
• "Remove [activity]"`;
  }

  return `I'm here to help with your ${itinerary.destination} trip! You can ask me to move, add, remove, or swap activities. Try "help" for more options.`;
}
