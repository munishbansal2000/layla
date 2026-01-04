"use client";

import React, { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, ChevronRight, PanelRightOpen } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { ItineraryView } from "@/components/itinerary/ItineraryView";
import { DestinationGrid } from "@/components/ui/DestinationCard";
import { UnifiedItineraryView } from "@/components/itinerary/UnifiedItineraryView";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { useTripStore } from "@/store/trip-store";
import {
  createMockTrip,
  popularDestinations,
  initialMessages,
  suggestedPrompts,
} from "@/data/mock-data";
import { generateId } from "@/lib/utils";
import { extractTripContext } from "@/lib/trip-planning";
import { parseItineraryFromText } from "@/lib/itinerary-parser";
import { containsItinerary } from "@/lib/dynamic-inputs";
import type {
  ChatMessage,
  Destination,
  StructuredItineraryData,
} from "@/types";

export default function HomePage() {
  const {
    currentTrip,
    setCurrentTrip,
    selectedDayIndex,
    setSelectedDayIndex,
    conversation,
    conversationId,
    addMessage,
    setConversation,
    setConversationId,
    isGenerating,
    setIsGenerating,
    removeItemFromDay,
    parsedItinerary,
    setParsedItinerary,
  } = useTripStore();

  const [showItinerary, setShowItinerary] = useState(false);
  const [showPlannerPane, setShowPlannerPane] = useState(false);
  const [structuredItinerary, setStructuredItinerary] =
    useState<StructuredItineraryData | null>(null);

  // Extract trip context from conversation
  const tripContext = useMemo(() => {
    const messagesForContext = conversation.map((m) => ({
      role: m.role,
      content: m.content,
    }));
    return extractTripContext(messagesForContext);
  }, [conversation]);

  // Auto-show planner pane when we have some trip context
  useEffect(() => {
    if (tripContext.destination || tripContext.startDate) {
      setShowPlannerPane(true);
    }
  }, [tripContext.destination, tripContext.startDate]);

  useEffect(() => {
    if (conversation.length === 0) {
      setConversation(initialMessages);
    }
  }, [conversation.length, setConversation]);

  const handleSendMessage = async (content: string) => {
    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content,
      type: "text",
      timestamp: new Date(),
    };
    addMessage(userMessage);
    setIsGenerating(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: content,
          conversationId: conversationId,
        }),
      });

      const data = await response.json();

      console.log("[Page] Chat API response:", {
        success: data.success,
        hasMessage: !!data.data?.message,
        hasGenerationInfo: !!data.data?.generationInfo,
        generationInfo: data.data?.generationInfo,
      });

      if (data.success && data.data?.message) {
        // Store the conversation ID for future messages
        if (data.data.conversationId && !conversationId) {
          setConversationId(data.data.conversationId);
        }

        // Check if we should generate structured itinerary
        const generationInfo = data.data.generationInfo;
        const extractedContext = generationInfo?.extractedContext;

        if (generationInfo?.readyToGenerate && extractedContext?.destination) {
          // We have enough context - generate structured itinerary!
          console.log(
            "[Page] Context ready, calling structured itinerary API..."
          );

          // Add a "generating" message
          const generatingMessage: ChatMessage = {
            id: generateId(),
            role: "assistant",
            content: `🎯 Perfect! I'm generating your personalized ${extractedContext.destination} itinerary with multiple options for each time slot...`,
            type: "loading",
            timestamp: new Date(),
          };
          addMessage(generatingMessage);

          try {
            // Build trip context for structured generation
            const tripContext = {
              destination: extractedContext.destination,
              startDate:
                extractedContext.startDate ||
                new Date().toISOString().split("T")[0],
              endDate:
                extractedContext.endDate ||
                new Date(Date.now() + 3 * 24 * 60 * 60 * 1000)
                  .toISOString()
                  .split("T")[0],
              travelers: {
                adults: extractedContext.travelers?.adults || 2,
                children: extractedContext.travelers?.children || 0,
              },
              budget:
                (extractedContext.budget as "budget" | "moderate" | "luxury") ||
                "moderate",
              pace:
                (extractedContext.pace as "relaxed" | "moderate" | "packed") ||
                "moderate",
              interests: extractedContext.interests || ["culture", "food"],
              tripMode: extractedContext.tripMode || "couples",
            };

            const structuredResponse = await fetch(
              "/api/itinerary/generate-structured",
              {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(tripContext),
              }
            );

            const structuredData = await structuredResponse.json();

            if (structuredData.success && structuredData.data) {
              console.log(
                "[Page] Structured itinerary received!",
                structuredData.data.metadata
              );

              // Store structured itinerary for the pane
              setStructuredItinerary(structuredData.data.itinerary);

              // Create message with structured itinerary in metadata
              const itineraryMessage: ChatMessage = {
                id: generateId(),
                role: "assistant",
                content:
                  structuredData.data.message ||
                  `Here's your personalized ${extractedContext.destination} itinerary! I've included multiple options for each time slot so you can choose what works best for you.`,
                type: "text",
                timestamp: new Date(),
                metadata: {
                  structuredItinerary: structuredData.data
                    .itinerary as StructuredItineraryData,
                  structuredItineraryMetadata: structuredData.data.metadata,
                  destination: extractedContext.destination,
                },
              };
              addMessage(itineraryMessage);
            } else {
              // Fallback to regular message
              const aiMessage = {
                ...data.data.message,
                timestamp: new Date(data.data.message.timestamp),
              };
              addMessage(aiMessage);
            }
          } catch (structuredError) {
            console.error(
              "Structured itinerary generation failed:",
              structuredError
            );
            // Fallback to regular chat message
            const aiMessage = {
              ...data.data.message,
              timestamp: new Date(data.data.message.timestamp),
            };
            addMessage(aiMessage);
          }
        } else {
          // Not ready for generation - just add the chat response
          const aiMessage = {
            ...data.data.message,
            timestamp: new Date(data.data.message.timestamp),
          };
          addMessage(aiMessage);

          // Check if this message contains an itinerary (legacy flow)
          if (containsItinerary(aiMessage.content)) {
            const parsed = parseItineraryFromText(aiMessage.content);
            if (parsed.isComplete) {
              setParsedItinerary(parsed);
            }
          }
        }

        // Legacy: Auto-generate mock trip on confirmation (keep for backward compat)
        if (
          content.toLowerCase().includes("yes") ||
          content.toLowerCase().includes("create") ||
          content.toLowerCase().includes("generate")
        ) {
          // Skip if we already have a structured itinerary
          if (!data.data.generationInfo?.readyToGenerate) {
            setTimeout(() => {
              const mockTrip = createMockTrip();
              setCurrentTrip(mockTrip);
              setShowItinerary(true);

              const tripMessage: ChatMessage = {
                id: generateId(),
                role: "assistant",
                content: `✨ I've created your personalized ${mockTrip.title}! You can see your complete itinerary on the right. Feel free to ask me to make any changes or add more activities!`,
                type: "text",
                timestamp: new Date(),
              };
              addMessage(tripMessage);
            }, 2000);
          }
        }
      }
    } catch (error) {
      console.error("Failed to send message:", error);
      const errorMessage: ChatMessage = {
        id: generateId(),
        role: "assistant",
        content: "I apologize, but I encountered an error. Please try again.",
        type: "text",
        timestamp: new Date(),
      };
      addMessage(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSelectDestination = (destination: Destination) => {
    handleSendMessage(
      `I want to plan a trip to ${destination.name}, ${destination.country}`
    );
  };

  const handleRemoveItem = (dayId: string, itemId: string) => {
    removeItemFromDay(dayId, itemId);
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800">
      <Header />

      <main className="pt-16">
        {/* Main Layout: 30% Chat / 70% Pane when pane is open */}
        <div className="flex h-[calc(100vh-64px)]">
          {/* Left: Chat Panel */}
          <div
            className={cn(
              "transition-all duration-300 flex flex-col",
              showPlannerPane
                ? "w-[30%] min-w-[360px] border-r border-gray-200 dark:border-gray-700"
                : "w-full"
            )}
            style={{ height: "calc(100vh - 64px)" }}
          >
            {/* Hero Section - only when no planner pane and no destination */}
            {!showPlannerPane && !tripContext.destination && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex-shrink-0 text-center py-8 px-4"
              >
                <div className="inline-flex items-center gap-2 px-4 py-2 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-sm font-medium mb-6">
                  <Sparkles className="w-4 h-4" />
                  AI-Powered Trip Planning
                </div>
                <h1 className="text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-4">
                  Plan your perfect trip
                  <br />
                  <span className="bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                    with AI
                  </span>
                </h1>
                <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
                  Tell me where you want to go, and I&apos;ll create a
                  personalized itinerary tailored to your preferences.
                </p>
              </motion.div>
            )}

            {/* Chat Interface */}
            <div
              className={cn(
                "flex-1 overflow-hidden",
                !showPlannerPane && "max-w-4xl mx-auto w-full px-4"
              )}
            >
              <div
                className={cn(
                  "h-full",
                  !showPlannerPane &&
                    "bg-white dark:bg-gray-800 rounded-2xl shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden"
                )}
              >
                <ChatInterface
                  messages={conversation}
                  onSendMessage={handleSendMessage}
                  isLoading={isGenerating}
                  suggestedPrompts={showPlannerPane ? [] : suggestedPrompts}
                />
              </div>
            </div>

            {/* Destination Grid - only when no trip context and no pane */}
            {!showPlannerPane && !tripContext.destination && (
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
                className="flex-shrink-0 max-w-4xl mx-auto w-full px-4 py-8"
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Popular Destinations
                  </h2>
                  <Button
                    variant="ghost"
                    rightIcon={<ChevronRight className="w-4 h-4" />}
                  >
                    View all
                  </Button>
                </div>
                <DestinationGrid
                  destinations={popularDestinations}
                  onSelectDestination={handleSelectDestination}
                />
              </motion.div>
            )}
          </div>

          {/* Right: Unified Itinerary View (70% width) */}
          <AnimatePresence>
            {showPlannerPane && (
              <motion.div
                initial={{ x: 100, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 100, opacity: 0 }}
                transition={{ type: "spring", damping: 25, stiffness: 200 }}
                className="flex-1 bg-white dark:bg-gray-800 shadow-2xl z-40 overflow-y-auto"
              >
                {structuredItinerary ? (
                  <div className="max-w-4xl mx-auto p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div>
                        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                          {structuredItinerary.destination}
                        </h2>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {structuredItinerary.days.length} days •{" "}
                          {structuredItinerary.days
                            .map((d) => d.city)
                            .filter((v, i, a) => a.indexOf(v) === i)
                            .join(" → ")}
                        </p>
                      </div>
                      <button
                        onClick={() => setShowPlannerPane(false)}
                        className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                      >
                        Close
                      </button>
                    </div>
                    <UnifiedItineraryView
                      itinerary={structuredItinerary}
                      enableReordering={true}
                      defaultViewMode="tabbed"
                    />
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full p-8">
                    <div className="text-center">
                      <p className="text-gray-500 dark:text-gray-400 mb-2">
                        Tell me about your trip to see your itinerary here
                      </p>
                      <button
                        onClick={() => setShowPlannerPane(false)}
                        className="mt-4 px-4 py-2 bg-purple-500 text-white rounded-lg hover:bg-purple-600 transition-colors"
                      >
                        Close
                      </button>
                    </div>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Toggle button when pane is closed */}
          {!showPlannerPane && tripContext.destination && (
            <motion.button
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              onClick={() => setShowPlannerPane(true)}
              className="fixed right-4 top-20 z-40 p-3 bg-purple-500 text-white rounded-full shadow-lg hover:bg-purple-600 transition-colors"
            >
              <PanelRightOpen className="w-5 h-5" />
            </motion.button>
          )}
        </div>
      </main>
    </div>
  );
}
