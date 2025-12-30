"use client";

/**
 * Test Page for TripInputPanel
 *
 * Access at: http://localhost:3000/test/trip-input
 */

import React, { useState, useEffect } from "react";
import { TripInputPanel } from "@/components/chat/TripInputPanel";
import type { TripInput, DerivedTripStructure } from "@/types/trip-input";
import type { ParsedTripInput } from "@/lib/trip-input-parser";
import type { StructuredItineraryData } from "@/types/structured-itinerary";

// Store for parsed results from API calls (accessible via window for debugging)
interface ParseDebugInfo {
  parsed: ParsedTripInput | null;
  timing: { parseMs: number; totalMs: number } | null;
  lastUpdated: string | null;
}

// Store for generated itinerary
interface ItineraryDebugInfo {
  itinerary: StructuredItineraryData | null;
  request: Record<string, unknown> | null;
  metadata: {
    totalDays: number;
    cities: string[];
    generatedAt: string;
    totalSlots: number;
    totalOptions: number;
  } | null;
  lastUpdated: string | null;
}

export default function TripInputTestPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [submittedInput, setSubmittedInput] = useState<TripInput | null>(null);
  const [derivedStructure, setDerivedStructure] =
    useState<DerivedTripStructure | null>(null);
  const [parseDebug, setParseDebug] = useState<ParseDebugInfo>({
    parsed: null,
    timing: null,
    lastUpdated: null,
  });
  const [itineraryDebug, setItineraryDebug] = useState<ItineraryDebugInfo>({
    itinerary: null,
    request: null,
    metadata: null,
    lastUpdated: null,
  });

  // Listen for parse events from the TripInputPanel
  useEffect(() => {
    const handleParseResult = (event: CustomEvent) => {
      setParseDebug({
        parsed: event.detail.parsed,
        timing: event.detail.timing,
        lastUpdated: new Date().toISOString(),
      });
    };

    const handleItineraryGenerated = (event: CustomEvent) => {
      setItineraryDebug({
        itinerary: event.detail.itinerary,
        request: event.detail.request,
        metadata: event.detail.metadata || null,
        lastUpdated: new Date().toISOString(),
      });
    };

    window.addEventListener(
      "tripInputParsed",
      handleParseResult as EventListener
    );
    window.addEventListener(
      "itineraryGenerated",
      handleItineraryGenerated as EventListener
    );
    return () => {
      window.removeEventListener(
        "tripInputParsed",
        handleParseResult as EventListener
      );
      window.removeEventListener(
        "itineraryGenerated",
        handleItineraryGenerated as EventListener
      );
    };
  }, []);

  const handleStartPlanning = async (
    input: TripInput,
    structure: DerivedTripStructure
  ) => {
    console.log("=== TRIP INPUT SUBMITTED ===");
    console.log("Input:", input);
    console.log("Derived Structure:", structure);

    setIsLoading(true);
    setSubmittedInput(input);
    setDerivedStructure(structure);

    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1500));

    setIsLoading(false);
  };

  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-900">
      {/* Header */}
      <header className="bg-white dark:bg-gray-800 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <h1 className="text-xl font-bold text-gray-900 dark:text-gray-100">
            Trip Input Panel Test
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Test the new trip planning input interface with flights/hotels as
            anchors
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto p-4">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left: Trip Input Panel */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg overflow-hidden h-[700px]">
            <TripInputPanel
              onStartPlanning={handleStartPlanning}
              isLoading={isLoading}
            />
          </div>

          {/* Right: Debug Output */}
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg p-6 overflow-auto h-[700px]">
            <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">
              Debug Output
            </h2>

            {/* AI Parse Results */}
            {parseDebug.parsed && (
              <div className="mb-6 p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-medium text-purple-700 dark:text-purple-300">
                    🤖 AI Parse Results
                  </h3>
                  {parseDebug.timing && (
                    <span className="text-xs text-purple-500">
                      {(parseDebug.timing.parseMs / 1000).toFixed(1)}s
                    </span>
                  )}
                </div>

                {/* Confidence */}
                <div className="mb-2 text-xs">
                  <span className="text-gray-500">Confidence:</span>
                  <span className="ml-2 font-medium">
                    {Math.round(parseDebug.parsed.confidence * 100)}%
                  </span>
                </div>

                {/* Extracted Entities */}
                <div className="mb-2">
                  <span className="text-xs text-gray-500">Entities:</span>
                  <pre className="mt-1 text-[10px] bg-gray-900 text-green-400 rounded p-2 overflow-auto max-h-32">
                    {JSON.stringify(
                      parseDebug.parsed.extractedEntities,
                      null,
                      2
                    )}
                  </pre>
                </div>

                {/* Intent */}
                {parseDebug.parsed.intent && (
                  <div className="mb-2">
                    <span className="text-xs text-gray-500">Intent:</span>
                    <pre className="mt-1 text-[10px] bg-gray-900 text-blue-400 rounded p-2 overflow-auto max-h-24">
                      {JSON.stringify(parseDebug.parsed.intent, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Spelling Corrections */}
                {parseDebug.parsed.spellingCorrections.length > 0 && (
                  <div className="mb-2">
                    <span className="text-xs text-gray-500">
                      Spelling Corrections:
                    </span>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {parseDebug.parsed.spellingCorrections.map((c, i) => (
                        <span
                          key={i}
                          className="text-[10px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 rounded"
                        >
                          {c.original} → {c.corrected}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conflicts */}
                {parseDebug.parsed.conflicts.length > 0 && (
                  <div className="mb-2">
                    <span className="text-xs text-gray-500">Conflicts:</span>
                    <pre className="mt-1 text-[10px] bg-gray-900 text-amber-400 rounded p-2 overflow-auto max-h-24">
                      {JSON.stringify(parseDebug.parsed.conflicts, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Parsed TripInput */}
                <div>
                  <span className="text-xs text-gray-500">
                    Parsed TripInput:
                  </span>
                  <pre className="mt-1 text-[10px] bg-gray-900 text-purple-400 rounded p-2 overflow-auto max-h-40">
                    {JSON.stringify(parseDebug.parsed.tripInput, null, 2)}
                  </pre>
                </div>
              </div>
            )}

            {!submittedInput && !parseDebug.parsed ? (
              <div className="text-gray-500 dark:text-gray-400 text-sm">
                <p>
                  Fill in the trip details and click "Start Planning" to see the
                  output here.
                </p>
                <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <h3 className="font-medium mb-2">Test Scenarios:</h3>
                  <ul className="list-disc list-inside space-y-1 text-xs">
                    <li>
                      <strong>Simple:</strong> Just type "10 days in Japan for 2
                      adults" and submit
                    </li>
                    <li>
                      <strong>With flights:</strong> Add a flight SFO → NRT, Mar
                      15
                    </li>
                    <li>
                      <strong>Multi-city:</strong> Add hotels in Tokyo (Mar
                      15-18), Kyoto (Mar 18-22), Osaka (Mar 22-25)
                    </li>
                    <li>
                      <strong>Conflict test:</strong> Add flight to NRT but
                      hotel in Osaka (should show error)
                    </li>
                  </ul>
                </div>
              </div>
            ) : null}

            {submittedInput && (
              <div className="space-y-4">
                {/* Input Summary */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Trip Input
                  </h3>
                  <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-xs">
                    <div className="mb-2">
                      <span className="text-gray-500">Prompt:</span>
                      <span className="ml-2 text-gray-900 dark:text-gray-100">
                        {submittedInput.prompt || "(empty)"}
                      </span>
                    </div>
                    <div className="mb-2">
                      <span className="text-gray-500">Budget:</span>
                      <span className="ml-2 text-gray-900 dark:text-gray-100">
                        {submittedInput.budgetTier}
                      </span>
                    </div>
                    <div className="mb-2">
                      <span className="text-gray-500">Travelers:</span>
                      <span className="ml-2 text-gray-900 dark:text-gray-100">
                        {submittedInput.travelers.adults} adults
                        {submittedInput.travelers.children &&
                          submittedInput.travelers.children.length > 0 &&
                          `, ${submittedInput.travelers.children.length} children`}
                      </span>
                    </div>
                    <div className="mb-2">
                      <span className="text-gray-500">Flights:</span>
                      <span className="ml-2 text-gray-900 dark:text-gray-100">
                        {submittedInput.flights.length} booked
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Hotels:</span>
                      <span className="ml-2 text-gray-900 dark:text-gray-100">
                        {submittedInput.hotels.length} booked
                      </span>
                    </div>
                  </div>
                </div>

                {/* Flights Detail */}
                {submittedInput.flights.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Flights
                    </h3>
                    <div className="space-y-2">
                      {submittedInput.flights.map((flight, i) => (
                        <div
                          key={flight.id}
                          className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-2 text-xs"
                        >
                          <span className="font-medium">
                            {flight.from} → {flight.to}
                          </span>
                          <span className="ml-2 text-gray-500">
                            {flight.date} {flight.time && `@ ${flight.time}`}
                          </span>
                          {flight.flightNumber && (
                            <span className="ml-2 text-gray-500">
                              ({flight.flightNumber})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Hotels Detail */}
                {submittedInput.hotels.length > 0 && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Hotels
                    </h3>
                    <div className="space-y-2">
                      {submittedInput.hotels.map((hotel, i) => (
                        <div
                          key={hotel.id}
                          className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-2 text-xs"
                        >
                          <span className="font-medium">{hotel.city}</span>
                          <span className="ml-2 text-gray-500">
                            {hotel.checkIn} → {hotel.checkOut}
                          </span>
                          {hotel.name && (
                            <span className="ml-2 text-gray-500">
                              ({hotel.name})
                            </span>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Derived Structure */}
                {derivedStructure && (
                  <div>
                    <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Derived Trip Structure
                    </h3>
                    <div className="bg-gray-50 dark:bg-gray-700 rounded-lg p-3 text-xs space-y-2">
                      <div>
                        <span className="text-gray-500">Valid:</span>
                        <span
                          className={`ml-2 ${
                            derivedStructure.isValid
                              ? "text-green-600"
                              : "text-red-600"
                          }`}
                        >
                          {derivedStructure.isValid ? "✓ Yes" : "✗ No"}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Cities:</span>
                        <span className="ml-2 text-gray-900 dark:text-gray-100">
                          {derivedStructure.cities.join(" → ") || "(none)"}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Total Nights:</span>
                        <span className="ml-2 text-gray-900 dark:text-gray-100">
                          {derivedStructure.totalNights}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Legs:</span>
                        <span className="ml-2 text-gray-900 dark:text-gray-100">
                          {derivedStructure.legs.length}
                        </span>
                      </div>
                      <div>
                        <span className="text-gray-500">Transfers Needed:</span>
                        <span className="ml-2 text-gray-900 dark:text-gray-100">
                          {derivedStructure.transfers.length}
                        </span>
                      </div>
                    </div>

                    {/* Errors */}
                    {derivedStructure.errors.length > 0 && (
                      <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg">
                        <span className="text-xs font-medium text-red-700 dark:text-red-300">
                          Errors:
                        </span>
                        <ul className="list-disc list-inside text-xs text-red-600 dark:text-red-400 mt-1">
                          {derivedStructure.errors.map((err, i) => (
                            <li key={i}>{err.message}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Warnings */}
                    {derivedStructure.warnings.length > 0 && (
                      <div className="mt-2 p-2 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
                        <span className="text-xs font-medium text-amber-700 dark:text-amber-300">
                          Warnings:
                        </span>
                        <ul className="list-disc list-inside text-xs text-amber-600 dark:text-amber-400 mt-1">
                          {derivedStructure.warnings.map((warn, i) => (
                            <li key={i}>{warn.message}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {/* Transfers */}
                    {derivedStructure.transfers.length > 0 && (
                      <div className="mt-3">
                        <h4 className="text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">
                          Inferred Transfers
                        </h4>
                        <div className="space-y-2">
                          {derivedStructure.transfers.map((transfer) => (
                            <div
                              key={transfer.id}
                              className={`rounded-lg p-2 text-xs ${
                                transfer.status === "conflict"
                                  ? "bg-red-50 dark:bg-red-900/20"
                                  : "bg-gray-100 dark:bg-gray-600"
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <span className="font-medium">
                                  {transfer.from.city} → {transfer.to.city}
                                </span>
                                <span
                                  className={`px-1.5 py-0.5 rounded text-[10px] ${
                                    transfer.status === "conflict"
                                      ? "bg-red-200 text-red-800"
                                      : transfer.status === "booked"
                                      ? "bg-green-200 text-green-800"
                                      : "bg-blue-200 text-blue-800"
                                  }`}
                                >
                                  {transfer.status}
                                </span>
                              </div>
                              <div className="text-gray-500 mt-1">
                                {transfer.type} • {transfer.options.length}{" "}
                                options available
                              </div>
                              {transfer.conflict && (
                                <div className="text-red-600 mt-1">
                                  ⚠️ {transfer.conflict}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Raw JSON */}
                <div>
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Raw JSON
                  </h3>
                  <pre className="bg-gray-900 text-green-400 rounded-lg p-3 text-[10px] overflow-auto max-h-64">
                    {JSON.stringify(
                      { input: submittedInput, structure: derivedStructure },
                      null,
                      2
                    )}
                  </pre>
                </div>
              </div>
            )}

            {/* Generated Itinerary Display */}
            {itineraryDebug.itinerary && (
              <div className="mt-6 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                    🗾 Generated Itinerary
                  </h3>
                  <span className="text-xs text-emerald-500">
                    {itineraryDebug.itinerary.days.length} days •{" "}
                    {itineraryDebug.itinerary.destination}
                  </span>
                </div>

                {/* Request Used */}
                {itineraryDebug.request && (
                  <div className="mb-3">
                    <span className="text-xs text-gray-500">Request:</span>
                    <pre className="mt-1 text-[10px] bg-gray-900 text-cyan-400 rounded p-2 overflow-auto max-h-24">
                      {JSON.stringify(itineraryDebug.request, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Overview */}
                <div className="mb-3 p-2 bg-white dark:bg-gray-800 rounded">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-gray-500">Destination:</span>
                      <span className="ml-1 font-medium">
                        {itineraryDebug.itinerary.destination}
                      </span>
                    </div>
                    <div>
                      <span className="text-gray-500">Country:</span>
                      <span className="ml-1">
                        {itineraryDebug.itinerary.country || "Japan"}
                      </span>
                    </div>
                    {itineraryDebug.metadata && (
                      <>
                        <div>
                          <span className="text-gray-500">Total Days:</span>
                          <span className="ml-1">
                            {itineraryDebug.metadata.totalDays}
                          </span>
                        </div>
                        <div>
                          <span className="text-gray-500">Cities:</span>
                          <span className="ml-1">
                            {itineraryDebug.metadata.cities.join(" → ")}
                          </span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* Day by Day Summary */}
                <div className="space-y-2">
                  <span className="text-xs text-gray-500">Day-by-Day:</span>
                  {itineraryDebug.itinerary.days.map((day) => (
                    <div
                      key={day.dayNumber}
                      className="p-2 bg-white dark:bg-gray-800 rounded text-xs"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="font-medium">
                          Day {day.dayNumber}: {day.city}
                        </span>
                        <span className="text-gray-400">{day.date}</span>
                      </div>
                      <div className="text-gray-500 text-[10px]">
                        {day.slots.length} slots • {day.title || "No title"}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {day.slots.slice(0, 4).map((slot, si) => (
                          <span
                            key={si}
                            className="px-1.5 py-0.5 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 rounded text-[10px]"
                          >
                            {slot.slotType}
                          </span>
                        ))}
                        {day.slots.length > 4 && (
                          <span className="text-[10px] text-gray-400">
                            +{day.slots.length - 4} more
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Full Itinerary JSON */}
                <div className="mt-3">
                  <details className="text-xs">
                    <summary className="cursor-pointer text-gray-500 hover:text-gray-700">
                      View Full Itinerary JSON
                    </summary>
                    <pre className="mt-2 text-[10px] bg-gray-900 text-emerald-400 rounded p-2 overflow-auto max-h-96">
                      {JSON.stringify(itineraryDebug.itinerary, null, 2)}
                    </pre>
                  </details>
                </div>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
