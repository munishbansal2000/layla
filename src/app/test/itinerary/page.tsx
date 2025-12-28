"use client";

import testItinerary from "@/fixtures/test-itinerary.json";
import { TestItineraryView } from "@/components/planner/trip-planner/TestItineraryView";
import type { TestItinerary } from "@/types/test-itinerary";

export default function TestItineraryPage() {
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950">
      <div className="max-w-md mx-auto h-screen">
        <TestItineraryView itinerary={testItinerary as TestItinerary} />
      </div>
    </div>
  );
}
