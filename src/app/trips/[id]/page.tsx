"use client";

import { useState, use } from "react";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { Header } from "@/components/layout/Header";
import { ChatInterface } from "@/components/chat/ChatInterface";
import { ItineraryView } from "@/components/itinerary/ItineraryView";
import { Button } from "@/components/ui/Button";
import { createMockTrip, initialMessages } from "@/data/mock-data";
import { generateId } from "@/lib/utils";
import type { ChatMessage } from "@/types";

interface TripPageProps {
  params: Promise<{ id: string }>;
}

export default function TripPage({ params }: TripPageProps) {
  const _params = use(params);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [conversation, setConversation] =
    useState<ChatMessage[]>(initialMessages);
  const [isGenerating, setIsGenerating] = useState(false);

  const trip = createMockTrip();

  const handleSendMessage = async (content: string) => {
    const userMessage: ChatMessage = {
      id: generateId(),
      role: "user",
      content,
      type: "text",
      timestamp: new Date(),
    };
    setConversation((prev) => [...prev, userMessage]);
    setIsGenerating(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: content }),
      });

      const data = await response.json();

      if (data.success && data.data?.message) {
        setConversation((prev) => [
          ...prev,
          {
            ...data.data.message,
            timestamp: new Date(data.data.message.timestamp),
          },
        ]);
      }
    } catch (error) {
      console.error("Failed to send message:", error);
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <Header showMenu onMenuToggle={() => {}} />

      <main className="pt-16">
        <div className="flex h-[calc(100vh-64px)]">
          <div className="w-full lg:w-1/2 flex flex-col">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
              <Link href="/trips">
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon={<ArrowLeft className="w-4 h-4" />}
                >
                  Back to Trips
                </Button>
              </Link>
            </div>
            <div className="flex-1">
              <ChatInterface
                messages={conversation}
                onSendMessage={handleSendMessage}
                isLoading={isGenerating}
                suggestedPrompts={[
                  "Add a restaurant for dinner on Day 2",
                  "What's the best time to visit the Eiffel Tower?",
                  "Add more activities for Day 3",
                  "Change the hotel to something more luxurious",
                ]}
              />
            </div>
          </div>

          <div className="hidden lg:block w-1/2 border-l border-gray-200 dark:border-gray-700">
            <ItineraryView
              trip={trip}
              selectedDayIndex={selectedDayIndex}
              onSelectDay={setSelectedDayIndex}
            />
          </div>
        </div>
      </main>
    </div>
  );
}
