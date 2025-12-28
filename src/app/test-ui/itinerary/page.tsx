"use client";

import testItinerary from "@/fixtures/test-itinerary.json";
import { UnifiedItineraryView } from "@/components/itinerary/UnifiedItineraryView";
import type { StructuredItineraryData } from "@/types/structured-itinerary";

export default function TestItineraryPage() {
  return (
    <div className="h-screen flex flex-col bg-gray-100 dark:bg-gray-950">
      <div className="flex-1 overflow-y-auto">
        <div className="w-[80%] mx-auto p-4">
          <UnifiedItineraryView
            itinerary={testItinerary as unknown as StructuredItineraryData}
            enableReordering={true}
            defaultViewMode="tabbed"
          />
        </div>
      </div>
    </div>
  );
}
