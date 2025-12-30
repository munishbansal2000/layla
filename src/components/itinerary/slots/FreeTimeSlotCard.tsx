/**
 * FreeTimeSlotCard Component
 *
 * Shows when a slot is empty (free time) and allows users to fill it
 * with suggested activities fetched from the suggestions API.
 */

"use client";

import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { Clock, Check, ChevronRight, Loader2, RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { parseTimeToMinutes } from "@/utils/itinerary-helpers";
import suggestionsData from "@/fixtures/activity-suggestions.json";
import type {
  SlotWithOptions,
  StructuredItineraryData,
} from "@/types/structured-itinerary";

// ============================================
// TYPES
// ============================================

interface Suggestion {
  id: string;
  name: string;
  category: string;
  duration: number;
  icon: string;
  description?: string;
  neighborhood?: string;
  distance?: number | null;
  ticketRequired?: boolean;
  place?: {
    name: string;
    neighborhood?: string;
    rating?: number;
    coordinates?: { lat: number; lng: number };
  };
}

interface APISuggestion {
  id: string;
  type: string;
  activity: {
    name: string;
    category: string;
    duration: number;
    description?: string;
    place?: {
      name: string;
      neighborhood?: string;
      rating?: number;
      coordinates?: { lat: number; lng: number };
    };
  };
  distance?: number | null;
  ticketRequirement?: string;
}

export interface FreeTimeSlotCardProps {
  slot: SlotWithOptions;
  slotIndex: number;
  previousSlot: SlotWithOptions | null;
  nextSlot: SlotWithOptions | null;
  allDaySlots: SlotWithOptions[];
  itinerary?: StructuredItineraryData;
  dayIndex: number;
  onSelectOption: (slotId: string, optionId: string) => void;
  onFillSlotWithActivity?: (
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
  ) => void;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

const { fallbackSuggestions, categoryIcons } = suggestionsData;

function getIconForCategory(category: string): string {
  const lowerCat = category.toLowerCase();
  for (const [key, icon] of Object.entries(categoryIcons)) {
    if (lowerCat.includes(key)) return icon;
  }
  return categoryIcons.default;
}

// ============================================
// COMPONENT
// ============================================

export function FreeTimeSlotCard({
  slot,
  previousSlot,
  nextSlot,
  allDaySlots,
  itinerary,
  dayIndex,
  onFillSlotWithActivity,
}: FreeTimeSlotCardProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(
    null
  );
  const [apiSuggestions, setApiSuggestions] = useState<Suggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Calculate available time
  const startMinutes = parseTimeToMinutes(slot.timeRange.start);
  const endMinutes = parseTimeToMinutes(slot.timeRange.end);
  const availableMinutes = endMinutes - startMinutes;

  // Get city from itinerary
  const city = itinerary?.days[dayIndex]?.city || itinerary?.destination;

  // Get coordinates from previous activity for location-based suggestions
  const prevCoordinates = useMemo(() => {
    const prevActivity = previousSlot?.options.find(
      (o) => o.id === previousSlot.selectedOptionId
    )?.activity;
    return prevActivity?.place?.coordinates;
  }, [previousSlot]);

  // Get existing activity names to exclude from suggestions
  const existingActivityNames = useMemo(() => {
    const names: string[] = [];
    for (const daySlot of allDaySlots) {
      if (daySlot.options.length === 0) continue;
      const selectedOption =
        daySlot.options.find((o) => o.id === daySlot.selectedOptionId) ||
        daySlot.options[0];
      if (selectedOption?.activity?.name) {
        names.push(selectedOption.activity.name.toLowerCase());
      }
    }
    return names;
  }, [allDaySlots]);

  // Determine which meal slots are already filled in the day
  const existingMealSlots = useMemo(() => {
    const mealSlots: ("breakfast" | "lunch" | "dinner")[] = [];
    const mealSlotTypes = ["breakfast", "lunch", "dinner"];

    for (const daySlot of allDaySlots) {
      if (daySlot.slotId === slot.slotId) continue; // Skip current slot
      if (daySlot.options.length === 0) continue; // Skip empty slots

      // Check if this slot type is a meal slot and has an activity
      if (mealSlotTypes.includes(daySlot.slotType)) {
        mealSlots.push(daySlot.slotType as "breakfast" | "lunch" | "dinner");
      }
    }
    return mealSlots;
  }, [allDaySlots, slot.slotId]);

  // Get context for display
  const prevActivity = previousSlot?.options.find(
    (o) => o.id === previousSlot.selectedOptionId
  )?.activity;
  const nextActivity = nextSlot?.options.find(
    (o) => o.id === nextSlot.selectedOptionId
  )?.activity;

  // Fetch when suggestions panel is opened
  useEffect(() => {
    if (!showSuggestions || apiSuggestions.length > 0 || isLoading) {
      return;
    }

    if (!city) {
      console.log("[FreeTimeSlotCard] No city available, skipping API fetch");
      return;
    }

    const abortController = new AbortController();

    const fetchSuggestions = async () => {
      setIsLoading(true);
      setError(null);

      const requestBody = {
        city: city.toLowerCase(),
        slotType: slot.slotType,
        coordinates: prevCoordinates,
        maxDistance: 2000,
        limit: 6,
        excludeNames: existingActivityNames,
        existingMealSlots: existingMealSlots,
      };

      console.log("[FreeTimeSlotCard] Fetching suggestions:", requestBody);

      try {
        const response = await fetch("/api/japan-itinerary/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody),
          signal: abortController.signal,
        });

        const data = await response.json();
        console.log("[FreeTimeSlotCard] API response:", data);

        if (data.success && data.data?.suggestions) {
          const suggestions: Suggestion[] = data.data.suggestions.map(
            (s: APISuggestion) => ({
              id: s.id,
              name: s.activity.name,
              category: s.activity.category,
              duration: s.activity.duration,
              icon: getIconForCategory(s.activity.category),
              description: s.activity.description,
              neighborhood: s.activity.place?.neighborhood,
              distance: s.distance,
              ticketRequired: s.ticketRequirement === "required",
              place: s.activity.place,
            })
          );
          console.log("[FreeTimeSlotCard] Mapped suggestions:", suggestions);
          setApiSuggestions(suggestions);
        } else {
          console.warn("[FreeTimeSlotCard] API failed:", data.error);
          setError("Failed to load suggestions");
        }
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        console.error("[FreeTimeSlotCard] Fetch error:", err);
        setError("Failed to load suggestions");
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    fetchSuggestions();

    return () => {
      abortController.abort();
    };
  }, [
    showSuggestions,
    apiSuggestions.length,
    isLoading,
    city,
    slot.slotType,
    prevCoordinates,
    existingActivityNames,
    existingMealSlots,
  ]);

  // Manual refresh function for the refresh button
  const refreshSuggestions = async () => {
    if (!city) return;

    setIsLoading(true);
    setError(null);
    setApiSuggestions([]);

    const requestBody = {
      city: city.toLowerCase(),
      slotType: slot.slotType,
      coordinates: prevCoordinates,
      maxDistance: 2000,
      limit: 6,
      excludeNames: existingActivityNames,
      existingMealSlots: existingMealSlots,
    };

    try {
      const response = await fetch("/api/japan-itinerary/suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();

      if (data.success && data.data?.suggestions) {
        const suggestions: Suggestion[] = data.data.suggestions.map(
          (s: APISuggestion) => ({
            id: s.id,
            name: s.activity.name,
            category: s.activity.category,
            duration: s.activity.duration,
            icon: getIconForCategory(s.activity.category),
            description: s.activity.description,
            neighborhood: s.activity.place?.neighborhood,
            distance: s.distance,
            ticketRequired: s.ticketRequirement === "required",
            place: s.activity.place,
          })
        );
        setApiSuggestions(suggestions);
      } else {
        setError("Failed to load suggestions");
      }
    } catch (err) {
      console.error("[FreeTimeSlotCard] Refresh error:", err);
      setError("Failed to load suggestions");
    } finally {
      setIsLoading(false);
    }
  };

  // Get fallback suggestions filtered by available time
  const fallbackList = useMemo(() => {
    const base =
      (fallbackSuggestions as Record<string, Suggestion[]>)[slot.slotType] ||
      fallbackSuggestions.afternoon;
    return base.filter((s: Suggestion) => s.duration <= availableMinutes);
  }, [slot.slotType, availableMinutes]);

  // Use API suggestions if available, otherwise fallback
  const suggestions = apiSuggestions.length > 0 ? apiSuggestions : fallbackList;

  const handleSelectSuggestion = (suggestion: Suggestion) => {
    setSelectedSuggestion(suggestion.id);

    if (onFillSlotWithActivity) {
      onFillSlotWithActivity(dayIndex, slot.slotId, {
        name: suggestion.name,
        category: suggestion.category,
        duration: suggestion.duration,
        icon: suggestion.icon,
        place: suggestion.place
          ? {
              name: suggestion.place.name,
              neighborhood: suggestion.place.neighborhood,
              rating: suggestion.place.rating,
              coordinates: suggestion.place.coordinates,
            }
          : undefined,
      });
    }

    setShowSuggestions(false);
    setSelectedSuggestion(null);
  };

  return (
    <div className="p-4 flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <Clock className="w-4 h-4" />
          <span className="text-sm font-medium capitalize">
            {slot.slotType} • Free Time
          </span>
          <span className="text-xs text-gray-400">
            ({availableMinutes} min)
          </span>
        </div>
      </div>

      {/* Context */}
      {(prevActivity || nextActivity) && (
        <div className="text-xs text-gray-400">
          {prevActivity && (
            <span>
              After: <span className="text-gray-600">{prevActivity.name}</span>
            </span>
          )}
          {prevActivity && nextActivity && <span className="mx-2">•</span>}
          {nextActivity && (
            <span>
              Before: <span className="text-gray-600">{nextActivity.name}</span>
            </span>
          )}
        </div>
      )}

      {!showSuggestions ? (
        <button
          onClick={() => setShowSuggestions(true)}
          className="w-full py-3 px-4 border-2 border-dashed border-purple-300 dark:border-purple-700 rounded-lg text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors flex items-center justify-center gap-2 group"
        >
          <span className="text-lg group-hover:scale-110 transition-transform">
            +
          </span>
          <span className="font-medium">Fill this slot</span>
        </button>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          {/* Header */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">
                {apiSuggestions.length > 0
                  ? `📍 Nearby in ${city}`
                  : "💡 Suggestions"}
              </span>
              <button
                onClick={refreshSuggestions}
                disabled={isLoading}
                className="p-1 text-gray-400 hover:text-purple-500 transition-colors disabled:opacity-50"
                title="Refresh suggestions"
              >
                <RefreshCw
                  className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}
                />
              </button>
            </div>
            <button
              onClick={() => setShowSuggestions(false)}
              className="text-xs text-gray-400 hover:text-gray-600"
            >
              Cancel
            </button>
          </div>

          {/* Loading state */}
          {isLoading && (
            <div className="flex items-center justify-center py-6 text-gray-400">
              <Loader2 className="w-5 h-5 animate-spin mr-2" />
              <span className="text-sm">Finding suggestions...</span>
            </div>
          )}

          {/* Error state */}
          {error && !isLoading && (
            <div className="text-center py-4 text-sm text-amber-600">
              {error}. Showing general suggestions instead.
            </div>
          )}

          {/* Suggestions list */}
          {!isLoading && (
            <div className="grid grid-cols-1 gap-2">
              {suggestions.length > 0 ? (
                suggestions.map((suggestion, index) => (
                  <button
                    key={suggestion.id}
                    onClick={() => handleSelectSuggestion(suggestion)}
                    disabled={selectedSuggestion === suggestion.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                      selectedSuggestion === suggestion.id
                        ? "border-purple-400 bg-purple-50 dark:bg-purple-900/30"
                        : index === 0 && apiSuggestions.length > 0
                        ? "border-purple-300 bg-purple-50/50 dark:bg-purple-900/20"
                        : "border-gray-200 dark:border-gray-700 hover:border-purple-300 hover:bg-purple-50/50"
                    )}
                  >
                    <span className="text-2xl">{suggestion.icon}</span>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 dark:text-white flex items-center gap-2">
                        <span className="truncate">{suggestion.name}</span>
                        {index === 0 && apiSuggestions.length > 0 && (
                          <span className="px-1.5 py-0.5 text-xs bg-purple-100 text-purple-600 rounded flex-shrink-0">
                            Closest
                          </span>
                        )}
                        {suggestion.ticketRequired && (
                          <span className="px-1.5 py-0.5 text-xs bg-amber-100 text-amber-600 rounded flex-shrink-0">
                            🎫 Tickets
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500">
                        <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                          {suggestion.category}
                        </span>
                        <span>{suggestion.duration} min</span>
                        {suggestion.distance != null && (
                          <span>
                            {(suggestion.distance / 1000).toFixed(1)}km
                          </span>
                        )}
                        {suggestion.neighborhood && (
                          <span className="text-gray-400">
                            {suggestion.neighborhood}
                          </span>
                        )}
                      </div>
                    </div>
                    {selectedSuggestion === suggestion.id ? (
                      <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                ))
              ) : (
                <div className="text-center py-4 text-sm text-gray-500">
                  No activities fit in {availableMinutes} min.
                  <button
                    onClick={() => setShowSuggestions(false)}
                    className="block mx-auto mt-2 text-purple-600 hover:underline"
                  >
                    Keep as free time
                  </button>
                </div>
              )}
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}
