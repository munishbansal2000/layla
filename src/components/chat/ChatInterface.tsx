"use client";

import React, {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Send, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import {
  parseAIResponseForInputs,
  formatAnswersForAI,
  containsItinerary,
} from "@/lib/dynamic-inputs";
import type { TravelerGroup } from "@/lib/dynamic-inputs";
import { DynamicFormRenderer } from "./DynamicFormRenderer";
import { ActivityCarousel } from "./ActivityCarousel";
import { RestaurantCarousel } from "./RestaurantCarousel";
import type { ChatMessage, StructuredItineraryData } from "@/types";

interface ChatInterfaceProps {
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isLoading?: boolean;
  suggestedPrompts?: string[];
  onStructuredItineraryChange?: (
    messageId: string,
    updated: StructuredItineraryData
  ) => void;
}

export function ChatInterface({
  messages,
  onSendMessage,
  isLoading = false,
  suggestedPrompts = [],
  onStructuredItineraryChange,
}: ChatInterfaceProps) {
  const [input, setInput] = useState("");
  const [formSubmitted, setFormSubmitted] = useState<Set<string>>(new Set());
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Track local structured itinerary state for option selections
  const [localItineraries, setLocalItineraries] = useState<
    Record<string, StructuredItineraryData>
  >({});

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Parse the last AI message for dynamic questions
  const lastAIMessage = useMemo(() => {
    const aiMessages = messages.filter((m) => m.role === "assistant");
    return aiMessages[aiMessages.length - 1];
  }, [messages]);

  // Build conversation history for context detection
  const conversationHistory = useMemo(() => {
    return messages.map((m) => m.content).join("\n");
  }, [messages]);

  const parsedResponse = useMemo(() => {
    if (!lastAIMessage || formSubmitted.has(lastAIMessage.id)) return null;
    return parseAIResponseForInputs(lastAIMessage.content, conversationHistory);
  }, [lastAIMessage, formSubmitted, conversationHistory]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput("");
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const handleSuggestedPrompt = (prompt: string) => {
    onSendMessage(prompt);
  };

  const handleFormSubmit = (
    answers: Record<
      string,
      string | number | boolean | string[] | TravelerGroup
    >
  ) => {
    if (parsedResponse?.form) {
      const formattedAnswer = formatAnswersForAI(
        answers,
        parsedResponse.form.questions
      );
      setFormSubmitted((prev) => new Set(prev).add(lastAIMessage!.id));
      onSendMessage(formattedAnswer);
    }
  };

  const handleFormSkip = () => {
    if (lastAIMessage) {
      setFormSubmitted((prev) => new Set(prev).add(lastAIMessage.id));
    }
  };

  // Handle structured itinerary option selection
  const handleStructuredItineraryChange = useCallback(
    (messageId: string, updated: StructuredItineraryData) => {
      setLocalItineraries((prev) => ({
        ...prev,
        [messageId]: updated,
      }));
      onStructuredItineraryChange?.(messageId, updated);
    },
    [onStructuredItineraryChange]
  );

  // Get itinerary data for a message (local state takes precedence)
  const getItineraryForMessage = useCallback(
    (message: ChatMessage): StructuredItineraryData | null => {
      if (localItineraries[message.id]) {
        return localItineraries[message.id];
      }
      return message.metadata?.structuredItinerary || null;
    },
    [localItineraries]
  );

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className={cn(
                "flex gap-3",
                message.role === "user" ? "flex-row-reverse" : "flex-row"
              )}
            >
              <Avatar
                fallback={message.role === "user" ? "U" : "L"}
                className={cn(
                  "flex-shrink-0",
                  message.role === "assistant" &&
                    "bg-gradient-to-br from-purple-500 to-pink-500"
                )}
              />
              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-4 py-3",
                  message.role === "user"
                    ? "bg-gradient-to-r from-purple-600 to-pink-600 text-white"
                    : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm border border-gray-100 dark:border-gray-700"
                )}
              >
                <div className="whitespace-pre-wrap text-sm leading-relaxed">
                  {/* Show message content (structured itinerary is shown in side pane) */}
                  {message.content}
                </div>

                {/* Render bookable activities if present */}
                {message.role === "assistant" &&
                  message.metadata?.bookableActivities &&
                  message.metadata.bookableActivities.length > 0 && (
                    <ActivityCarousel
                      activities={message.metadata.bookableActivities}
                      destination={message.metadata.destination}
                      onAddToItinerary={(activity) => {
                        console.log("Add to itinerary:", activity);
                      }}
                    />
                  )}

                {/* Render bookable restaurants if present */}
                {message.role === "assistant" &&
                  message.metadata?.bookableRestaurants &&
                  message.metadata.bookableRestaurants.length > 0 && (
                    <RestaurantCarousel
                      restaurants={message.metadata.bookableRestaurants}
                      destination={message.metadata.destination}
                      onAddToItinerary={(restaurant) => {
                        console.log("Add to itinerary:", restaurant);
                      }}
                    />
                  )}

                <div
                  className={cn(
                    "text-xs mt-2 opacity-70",
                    message.role === "user" ? "text-right" : "text-left"
                  )}
                >
                  <MessageTime timestamp={message.timestamp} />
                </div>
              </div>
            </motion.div>
          ))}
        </AnimatePresence>

        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex gap-3"
          >
            <Avatar
              fallback="L"
              className="bg-gradient-to-br from-purple-500 to-pink-500"
            />
            <div className="bg-white dark:bg-gray-800 rounded-2xl px-4 py-3 shadow-sm border border-gray-100 dark:border-gray-700">
              <div className="flex items-center gap-2 text-gray-500">
                <Loader2 className="w-4 h-4 animate-spin" />
                <span className="text-sm">Thinking...</span>
              </div>
            </div>
          </motion.div>
        )}

        {/* Dynamic Form for AI Questions - only show if no itinerary has been generated yet */}
        {!isLoading &&
          parsedResponse?.hasQuestions &&
          parsedResponse.form &&
          !containsItinerary(lastAIMessage?.content || "") && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="px-4 py-2"
            >
              <DynamicFormRenderer
                form={parsedResponse.form}
                onSubmit={handleFormSubmit}
                onSkip={handleFormSkip}
              />
            </motion.div>
          )}

        <div ref={messagesEndRef} />
      </div>

      {messages.length <= 1 && suggestedPrompts.length > 0 && (
        <div className="px-4 pb-4">
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
            <Sparkles className="w-3 h-3" />
            Try asking:
          </p>
          <div className="flex flex-wrap gap-2">
            {suggestedPrompts.slice(0, 4).map((prompt, index) => (
              <motion.button
                key={index}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => handleSuggestedPrompt(prompt)}
                className="px-3 py-1.5 text-sm bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-full text-gray-700 dark:text-gray-300 hover:border-purple-300 dark:hover:border-purple-700 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
              >
                {prompt}
              </motion.button>
            ))}
          </div>
        </div>
      )}

      <form
        onSubmit={handleSubmit}
        className="p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800"
      >
        <div className="flex gap-3 items-end">
          <div className="flex-1 relative">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Tell me about your dream trip..."
              rows={1}
              className="w-full px-4 py-3 pr-12 rounded-xl border border-gray-200 dark:border-gray-600 bg-gray-50 dark:bg-gray-900 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
              style={{ minHeight: "48px", maxHeight: "120px" }}
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            size="md"
            disabled={!input.trim() || isLoading}
            className="flex-shrink-0"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </form>
    </div>
  );
}

// Client-only component to avoid hydration mismatch with time formatting
function MessageTime({ timestamp }: { timestamp: Date }) {
  const [formattedTime, setFormattedTime] = useState<string>("");

  useEffect(() => {
    setFormattedTime(
      new Date(timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  }, [timestamp]);

  // Return empty on server, time on client
  return <>{formattedTime}</>;
}
