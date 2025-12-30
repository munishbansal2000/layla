"use client";

import { useState, useEffect } from "react";
import { UnifiedItineraryView } from "@/components/itinerary/UnifiedItineraryView";
import { ItineraryChatPanel } from "@/components/chat/ItineraryChatPanel";
import { useItineraryChat } from "@/hooks/useItineraryChat";
import type { StructuredItineraryData } from "@/types/structured-itinerary";
import { MessageSquare, ChevronRight, ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import Link from "next/link";

// Fallback to static data if API fails
import staticItinerary from "@/fixtures/test-itinerary.json";

// Load custom itinerary from output folder for testing
import customItinerary from "../../../../output/f_japan_it.json";

export default function TestItineraryPage() {
  const [initialItinerary, setInitialItinerary] =
    useState<StructuredItineraryData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [chatPanelOpen, setChatPanelOpen] = useState(true);
  const [chatPanelWidth] = useState(380);
  const [source, setSource] = useState<"generated" | "api" | "static">("api");

  useEffect(() => {
    async function loadItinerary() {
      // OPTION 1: Load custom itinerary from output folder (for testing)
      // Uncomment to use the custom itinerary from a_japan_it.json
      if (customItinerary?.data?.itinerary) {
        console.log(
          "[TestItineraryPage] Using custom itinerary from output/f_japan_it.json"
        );
        setInitialItinerary(
          customItinerary.data.itinerary as unknown as StructuredItineraryData
        );
        setSource("generated");
        setIsLoading(false);
        return;
      }

      // OPTION 2: Check if we have a generated itinerary in localStorage (from trip input flow)
      const storedItinerary = localStorage.getItem("generatedItinerary");
      if (storedItinerary) {
        try {
          const parsed = JSON.parse(storedItinerary);
          if (parsed && parsed.days && parsed.days.length > 0) {
            console.log(
              "[TestItineraryPage] Using generated itinerary from trip input flow"
            );
            setInitialItinerary(parsed as StructuredItineraryData);
            setSource("generated");
            setIsLoading(false);
            // Clear it so subsequent loads use API
            // localStorage.removeItem("generatedItinerary"); // Uncomment to clear after use
            return;
          }
        } catch (e) {
          console.warn(
            "[TestItineraryPage] Failed to parse stored itinerary:",
            e
          );
        }
      }

      // Otherwise, fetch from local Japan data API
      try {
        const response = await fetch("/api/japan-itinerary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            cities: ["Tokyo", "Kyoto", "Osaka"],
            startDate: "2025-04-15",
            totalDays: 7,
            pace: "moderate",
            includeKlookExperiences: true,
          }),
        });

        const data = await response.json();

        if (data.success && data.data?.itinerary) {
          setInitialItinerary(data.data.itinerary as StructuredItineraryData);
          setSource("api");
        } else {
          // Fallback to static data
          console.warn("API failed, using static data:", data.error);
          setInitialItinerary(
            staticItinerary as unknown as StructuredItineraryData
          );
          setSource("static");
        }
      } catch (error) {
        // Fallback to static data on error
        console.error("Failed to load from API, using static data:", error);
        setInitialItinerary(
          staticItinerary as unknown as StructuredItineraryData
        );
        setSource("static");
      } finally {
        setIsLoading(false);
      }
    }

    loadItinerary();

    // Listen for itineraryGenerated events (for real-time updates from trip input page)
    const handleItineraryGenerated = (event: CustomEvent) => {
      if (event.detail.itinerary) {
        console.log("[TestItineraryPage] Received itinerary from event");
        setInitialItinerary(event.detail.itinerary as StructuredItineraryData);
        setSource("generated");
        // Also store in localStorage for page refreshes
        localStorage.setItem(
          "generatedItinerary",
          JSON.stringify(event.detail.itinerary)
        );
      }
    };

    window.addEventListener(
      "itineraryGenerated",
      handleItineraryGenerated as EventListener
    );
    return () => {
      window.removeEventListener(
        "itineraryGenerated",
        handleItineraryGenerated as EventListener
      );
    };
  }, []);

  if (isLoading) {
    return (
      <div className="h-screen flex flex-col bg-gray-100 dark:bg-gray-950 items-center justify-center">
        <div className="w-8 h-8 border-4 border-purple-500 border-t-transparent rounded-full animate-spin mb-2" />
        <p className="text-sm text-gray-500">
          Loading itinerary from local data...
        </p>
      </div>
    );
  }

  if (!initialItinerary) {
    return null;
  }

  return (
    <ItineraryPageContent
      initialItinerary={initialItinerary}
      chatPanelOpen={chatPanelOpen}
      setChatPanelOpen={setChatPanelOpen}
      chatPanelWidth={chatPanelWidth}
      source={source}
    />
  );
}

interface ItineraryPageContentProps {
  initialItinerary: StructuredItineraryData;
  chatPanelOpen: boolean;
  setChatPanelOpen: (open: boolean) => void;
  chatPanelWidth: number;
  source: "generated" | "api" | "static";
}

function ItineraryPageContent({
  initialItinerary,
  chatPanelOpen,
  setChatPanelOpen,
  chatPanelWidth,
}: ItineraryPageContentProps) {
  // Initialize the chat hook
  const {
    chatState,
    itinerary,
    sendMessage,
    executeAction,
    confirmPreview,
    rejectPreview,
    answerClarification,
    canUndo,
    canRedo,
    undo,
    redo,
    dismissNudge,
    clearPendingUiAction,
    setCurrentDayIndex,
  } = useItineraryChat({
    initialItinerary,
    strictMode: false,
    autoAdjust: true,
  });

  // State for active day index (to sync with chat UI actions)
  const [activeDayIndex, setActiveDayIndex] = useState(0);

  // State for programmatic fill-slot panel
  const [fillSlotTarget, setFillSlotTarget] = useState<{
    dayIndex: number;
    slotId: string;
  } | null>(null);

  // State for alternatives panel (triggered from chat)
  const [alternativesTarget, setAlternativesTarget] = useState<{
    dayIndex: number;
    slotId: string;
    activityName: string;
  } | null>(null);

  // State for route optimization highlight (triggered from chat)
  const [routeHighlight, setRouteHighlight] = useState<{
    dayIndex: number;
    slotIds: string[];
    travelTimeSaved: number;
  } | null>(null);

  // Handle pending UI action from chat
  useEffect(() => {
    console.log(
      "[ItineraryPage] pendingUiAction changed:",
      chatState.pendingUiAction
    );

    if (!chatState.pendingUiAction) return;

    const action = chatState.pendingUiAction;

    switch (action.type) {
      case "OPEN_FILL_SLOT_PANEL": {
        const { dayIndex, slotType, findFirstEmpty } = action.params;
        console.log("[ItineraryPage] ✅ Handling OPEN_FILL_SLOT_PANEL:", {
          dayIndex,
          slotType,
          findFirstEmpty,
        });

        // Navigate to the correct day
        setActiveDayIndex(dayIndex);
        setCurrentDayIndex(dayIndex);

        // Find the first empty slot of the requested type on this day
        // The slot will be found in UnifiedItineraryView after processing
        // We pass the criteria as a special marker that SlotOptions will understand
        const slotMarker = `find-empty-${slotType}-day${dayIndex}`;
        console.log("[ItineraryPage] Setting fill target marker:", slotMarker);
        setFillSlotTarget({ dayIndex, slotId: slotMarker });
        break;
      }

      case "SHOW_ALTERNATIVES_PANEL": {
        const { dayIndex, slotId, activityName } = action.params;
        console.log("[ItineraryPage] ✅ Handling SHOW_ALTERNATIVES_PANEL:", {
          dayIndex,
          slotId,
          activityName,
        });
        // Navigate to the correct day
        setActiveDayIndex(dayIndex);
        setCurrentDayIndex(dayIndex);
        // Set alternatives target (will auto-expand the slot options)
        setAlternativesTarget({ dayIndex, slotId, activityName });
        // Also set as fillSlotTarget to expand the panel
        setFillSlotTarget({ dayIndex, slotId });
        break;
      }

      case "HIGHLIGHT_ROUTE_OPTIMIZATION": {
        const { dayIndex, reorderedSlotIds, travelTimeSaved } = action.params;
        console.log(
          "[ItineraryPage] ✅ Handling HIGHLIGHT_ROUTE_OPTIMIZATION:",
          {
            dayIndex,
            reorderedSlotIds,
            travelTimeSaved,
          }
        );
        // Navigate to the correct day
        setActiveDayIndex(dayIndex);
        setCurrentDayIndex(dayIndex);
        // Set route highlight state (for visual feedback)
        setRouteHighlight({
          dayIndex,
          slotIds: reorderedSlotIds,
          travelTimeSaved,
        });
        // Clear highlight after 3 seconds
        setTimeout(() => setRouteHighlight(null), 3000);
        break;
      }

      case "NAVIGATE_TO_DAY": {
        const { dayIndex } = action.params;
        console.log("[ItineraryPage] ✅ Handling NAVIGATE_TO_DAY:", {
          dayIndex,
        });
        setActiveDayIndex(dayIndex);
        setCurrentDayIndex(dayIndex);
        break;
      }
    }

    // Clear the pending action
    clearPendingUiAction();
  }, [chatState.pendingUiAction, clearPendingUiAction, setCurrentDayIndex]);

  // Log active day changes and ALL slot IDs for debugging
  useEffect(() => {
    if (activeDayIndex >= 0 && itinerary.days[activeDayIndex]) {
      const day = itinerary.days[activeDayIndex];
      console.log(
        "[ItineraryPage] Current day slots:",
        day.slots.map((s) => ({
          id: s.slotId,
          type: s.slotType,
          hasOptions: s.options.length > 0,
        }))
      );
    }
    if (fillSlotTarget) {
      console.log("[ItineraryPage] Fill target:", fillSlotTarget);
    }
  }, [activeDayIndex, fillSlotTarget, itinerary.days]);

  return (
    <div className="h-screen flex bg-gray-100 dark:bg-gray-950">
      {/* Main Itinerary View */}
      <div
        className="flex-1 overflow-y-auto transition-all duration-300"
        style={{
          marginRight: chatPanelOpen ? chatPanelWidth : 0,
        }}
      >
        <div className="max-w-4xl mx-auto p-4">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Link
                href="/test-ui"
                className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                title="Back to test UI"
              >
                <ArrowLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
              </Link>
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {itinerary.destination}
                </h1>
                <p className="text-sm text-gray-500 dark:text-gray-400">
                  {itinerary.days.length} days •{" "}
                  {itinerary.days
                    .map((d) => d.city)
                    .filter((v, i, a) => a.indexOf(v) === i)
                    .join(" → ")}
                </p>
              </div>
            </div>

            {/* Chat toggle button (when panel is closed) */}
            {!chatPanelOpen && (
              <button
                onClick={() => setChatPanelOpen(true)}
                className="flex items-center gap-2 px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg shadow-lg transition-colors"
              >
                <MessageSquare className="w-4 h-4" />
                <span className="text-sm font-medium">Chat Assistant</span>
              </button>
            )}
          </div>

          {/* Itinerary View */}
          <UnifiedItineraryView
            itinerary={itinerary}
            enableReordering={true}
            defaultViewMode="tabbed"
            autoExpandSlotId={fillSlotTarget?.slotId}
            onAutoExpandHandled={() => setFillSlotTarget(null)}
          />
        </div>
      </div>

      {/* Chat Panel */}
      <div
        className={cn(
          "fixed top-0 right-0 h-full bg-white dark:bg-gray-900 shadow-xl transition-transform duration-300 z-50",
          chatPanelOpen ? "translate-x-0" : "translate-x-full"
        )}
        style={{ width: chatPanelWidth }}
      >
        {/* Panel Header with Close Button */}
        <div className="absolute top-2 left-2 z-10">
          <button
            onClick={() => setChatPanelOpen(false)}
            className="p-2 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            title="Close chat panel"
          >
            <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Chat Panel Content */}
        <div className="h-full pt-12">
          <ItineraryChatPanel
            chatState={chatState}
            onSendMessage={sendMessage}
            onExecuteAction={executeAction}
            onConfirmPreview={confirmPreview}
            onRejectPreview={rejectPreview}
            onAnswerClarification={answerClarification}
            onDismissNudge={dismissNudge}
            canUndo={canUndo}
            canRedo={canRedo}
            onUndo={undo}
            onRedo={redo}
            className="h-full rounded-none border-0 border-l"
          />
        </div>
      </div>

      {/* Floating Chat Button (when panel is closed, as mobile-style FAB) */}
      {!chatPanelOpen && (
        <button
          onClick={() => setChatPanelOpen(true)}
          className="fixed bottom-6 right-6 w-14 h-14 bg-purple-600 hover:bg-purple-700 text-white rounded-full shadow-lg flex items-center justify-center transition-all hover:scale-105 z-50 md:hidden"
          title="Open chat assistant"
        >
          <MessageSquare className="w-6 h-6" />
        </button>
      )}
    </div>
  );
}
