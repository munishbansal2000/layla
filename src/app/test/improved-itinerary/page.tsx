"use client";

import { useState } from "react";
import { ImprovedItineraryView } from "@/components/itinerary/views/ImprovedItineraryView";
// import tripData from "../../../../output/pipeline-2-enriched.json";
import tripData from "../../../../fixtures/gold-standard-family-japan.json";
import type { StructuredItineraryData } from "@/types/structured-itinerary";
import { useItineraryChat } from "@/hooks/useItineraryChat";

export default function ImprovedItineraryTestPage() {
  const [itinerary, setItinerary] = useState<StructuredItineraryData>(
    tripData as unknown as StructuredItineraryData
  );

  const chatHook = useItineraryChat(itinerary);

  const handleItineraryChange = (updated: StructuredItineraryData) => {
    console.log("Itinerary changed:", updated);
    setItinerary(updated);
  };

  const handleSelectOption = (slotId: string, optionId: string) => {
    console.log("Selected option:", slotId, optionId);
  };

  const handleFillSlotWithActivity = (
    dayIndex: number,
    slotId: string,
    activity: {
      name: string;
      category?: string;
      duration?: number;
      icon?: string;
      place?: {
        name: string;
        neighborhood?: string;
        rating?: number;
        coordinates?: { lat: number; lng: number };
      };
    }
  ) => {
    console.log("Fill slot:", dayIndex, slotId, activity);
  };

  return (
    <ImprovedItineraryView
      itinerary={itinerary}
      onItineraryChange={handleItineraryChange}
      onSelectOption={handleSelectOption}
      onFillSlotWithActivity={handleFillSlotWithActivity}
      defaultViewMode="tabbed"
      enableReordering={true}
      enableChat={true}
      chatHook={chatHook}
    />
  );
}
