"use client";

import React, { useState, useCallback, useMemo, useEffect } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  PanInfo,
} from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Clock,
  DollarSign,
  Star,
  Check,
  X,
  Bookmark,
  Layers,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SlotWithOptions,
  ActivityOption,
  StructuredCommuteInfo,
} from "@/types/structured-itinerary";
import { ViatorEnhancementList } from "./ViatorEnhancementCard";

// ============================================
// SLOT OPTIONS - Main Container
// ============================================

interface SlotOptionsProps {
  slot: SlotWithOptions;
  onSelectOption: (slotId: string, optionId: string) => void;
  isFirst?: boolean;
  prevActivityCoords?: { lat: number; lng: number };
  dayIndex?: number;
  allDaySlots?: SlotWithOptions[];
  city?: string;
  autoExpandSlotId?: string; // Auto-expand fill suggestions for this slot ID (triggered from chat)
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
  onAutoExpandHandled?: () => void; // Callback when auto-expand has been handled
}

export function SlotOptions({
  slot,
  onSelectOption,
  isFirst,
  prevActivityCoords,
  dayIndex = 0,
  allDaySlots = [],
  city,
  autoExpandSlotId,
  onFillSlotWithActivity,
  onAutoExpandHandled,
}: SlotOptionsProps) {
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // Auto-expand when triggered from chat
  // The parent (DayContent) now resolves criteria-based markers to specific slot IDs,
  // so we only need to check for exact matches here
  useEffect(() => {
    if (!autoExpandSlotId) return;

    const matches = autoExpandSlotId === slot.slotId;

    console.log("[SlotOptions] Auto-expand check:", {
      autoExpandSlotId,
      currentSlotId: slot.slotId,
      matches,
      showSuggestions,
      hasOptions: slot.options.length > 0,
      slotType: slot.slotType,
      dayIndex,
    });

    if (matches && !showSuggestions) {
      console.log("[SlotOptions] ✅ Auto-expanding slot:", slot.slotId);
      setShowSuggestions(true);
      // Notify parent that we've handled the auto-expand
      onAutoExpandHandled?.();
    }
  }, [
    autoExpandSlotId,
    slot.slotId,
    slot.slotType,
    slot.options.length,
    showSuggestions,
    onAutoExpandHandled,
    dayIndex,
  ]);

  const slotTypeLabels: Record<string, { label: string; icon: string }> = {
    morning: { label: "Morning", icon: "🌅" },
    breakfast: { label: "Breakfast", icon: "🥐" },
    lunch: { label: "Lunch", icon: "🍽️" },
    afternoon: { label: "Afternoon", icon: "☀️" },
    dinner: { label: "Dinner", icon: "🍷" },
    evening: { label: "Evening", icon: "🌙" },
  };

  const slotInfo = slotTypeLabels[slot.slotType] || {
    label: slot.slotType,
    icon: "📍",
  };

  const handleSelect = useCallback(
    (optionId: string) => {
      onSelectOption(slot.slotId, optionId);
    },
    [onSelectOption, slot.slotId]
  );

  const handleNavigate = useCallback(
    (direction: "prev" | "next") => {
      setCurrentCardIndex((prev) => {
        if (direction === "prev") return Math.max(0, prev - 1);
        return Math.min(slot.options.length - 1, prev + 1);
      });
    },
    [slot.options.length]
  );

  const totalOptions = slot.options.length;
  const currentOption = slot.options[currentCardIndex];
  const isSelected = currentOption?.id === slot.selectedOptionId;

  // Get current activity coordinates for commute directions
  const currentActivityCoords = currentOption?.activity?.place?.coordinates;

  // Check if this is a transport/travel slot
  const isTransportSlot =
    slot.behavior === "travel" ||
    currentOption?.activity?.category === "transport";

  return (
    <div className="slot-container mb-4">
      {/* Commute Block (if not first slot) */}
      {!isFirst && slot.commuteFromPrevious && (
        <CommuteBlock
          commute={slot.commuteFromPrevious}
          fromCoords={prevActivityCoords}
          toCoords={currentActivityCoords}
        />
      )}

      {/* Transport/Travel Slot - Special rendering */}
      {isTransportSlot && currentOption && (
        <TransportSlotCard slot={slot} option={currentOption} />
      )}

      {/* Regular Slot */}
      {!isTransportSlot && (
        <>
          {/* Slot Header */}
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>{slotInfo.icon}</span>
              <span className="font-medium">{slotInfo.label}</span>
              <span className="text-gray-400">
                {slot.timeRange.start} - {slot.timeRange.end}
              </span>
            </div>

            {/* Card Counter */}
            {totalOptions > 1 && (
              <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">
                {currentCardIndex + 1} / {totalOptions}
              </span>
            )}
          </div>

          {/* Carousel View - Always On */}
          {currentOption && (
            <SwipeCarousel
              options={slot.options}
              currentIndex={currentCardIndex}
              selectedOptionId={slot.selectedOptionId}
              onNavigate={handleNavigate}
              onSelect={handleSelect}
            />
          )}

          {/* Empty Slot - Fill the Slot UI */}
          {!currentOption && (
            <div className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900/50">
              <div className="flex items-center justify-center gap-2 text-gray-500 dark:text-gray-400 mb-3">
                <Clock className="w-4 h-4" />
                <span className="text-sm font-medium">Free Time</span>
              </div>

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
                <FillSlotSuggestions
                  slot={slot}
                  dayIndex={dayIndex}
                  allDaySlots={allDaySlots}
                  city={city}
                  onFillSlotWithActivity={onFillSlotWithActivity}
                  onClose={() => setShowSuggestions(false)}
                />
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ============================================
// TRANSPORT SLOT CARD - Special rendering for transfer slots
// ============================================

interface TransportSlotCardProps {
  slot: SlotWithOptions;
  option: ActivityOption;
}

function TransportSlotCard({ slot, option }: TransportSlotCardProps) {
  const activity = option.activity;
  const tags = activity.tags || [];

  // Determine transport type from tags or name
  const isShinkansen =
    tags.includes("shinkansen") ||
    activity.name.toLowerCase().includes("shinkansen");
  const isAirportArrival =
    tags.includes("arrival") ||
    activity.name.toLowerCase().includes("airport → hotel");
  const isAirportDeparture =
    tags.includes("departure") ||
    activity.name.toLowerCase().includes("hotel → airport");
  const isIntercity = tags.includes("intercity") || activity.name.includes("→");

  // Choose icon and color based on type
  let icon = "🚃";
  let bgColor = "bg-blue-50 dark:bg-blue-900/20";
  let borderColor = "border-blue-200 dark:border-blue-800";
  let textColor = "text-blue-700 dark:text-blue-300";
  let accentColor = "text-blue-600 dark:text-blue-400";

  if (isShinkansen) {
    icon = "🚅";
    bgColor = "bg-emerald-50 dark:bg-emerald-900/20";
    borderColor = "border-emerald-200 dark:border-emerald-800";
    textColor = "text-emerald-700 dark:text-emerald-300";
    accentColor = "text-emerald-600 dark:text-emerald-400";
  } else if (isAirportArrival) {
    icon = "✈️🛬";
    bgColor = "bg-purple-50 dark:bg-purple-900/20";
    borderColor = "border-purple-200 dark:border-purple-800";
    textColor = "text-purple-700 dark:text-purple-300";
    accentColor = "text-purple-600 dark:text-purple-400";
  } else if (isAirportDeparture) {
    icon = "✈️🛫";
    bgColor = "bg-orange-50 dark:bg-orange-900/20";
    borderColor = "border-orange-200 dark:border-orange-800";
    textColor = "text-orange-700 dark:text-orange-300";
    accentColor = "text-orange-600 dark:text-orange-400";
  }

  // Format duration
  const durationHours = Math.floor(activity.duration / 60);
  const durationMins = activity.duration % 60;
  const durationStr =
    durationHours > 0
      ? `${durationHours}h ${durationMins > 0 ? `${durationMins}m` : ""}`
      : `${durationMins}m`;

  return (
    <div className={cn("rounded-xl border-2 p-4", bgColor, borderColor)}>
      {/* Header with icon and time */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{icon}</span>
          <div>
            <div className={cn("font-semibold", textColor)}>
              {activity.name}
            </div>
            <div className={cn("text-sm", accentColor)}>
              {slot.timeRange.start} - {slot.timeRange.end}
            </div>
          </div>
        </div>

        {/* Duration badge */}
        <div
          className={cn(
            "px-3 py-1 rounded-full text-sm font-medium",
            bgColor,
            textColor
          )}
        >
          <Clock className="w-3 h-3 inline mr-1" />
          {durationStr}
        </div>
      </div>

      {/* Description */}
      {activity.description && (
        <p className={cn("text-sm mb-3", accentColor)}>
          {activity.description}
        </p>
      )}

      {/* Cost if available */}
      {activity.estimatedCost && (
        <div className={cn("flex items-center gap-1 text-sm", accentColor)}>
          <DollarSign className="w-3 h-3" />
          <span>
            ~{activity.estimatedCost.currency === "JPY" ? "¥" : "$"}
            {activity.estimatedCost.amount.toLocaleString()}
          </span>
        </div>
      )}

      {/* Transfer type badge */}
      <div className="mt-3 flex flex-wrap gap-2">
        {isShinkansen && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-emerald-100 dark:bg-emerald-800 text-emerald-800 dark:text-emerald-200">
            🚅 Shinkansen
          </span>
        )}
        {isAirportArrival && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 dark:bg-purple-800 text-purple-800 dark:text-purple-200">
            ✈️ Airport Arrival
          </span>
        )}
        {isAirportDeparture && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-orange-100 dark:bg-orange-800 text-orange-800 dark:text-orange-200">
            ✈️ Airport Departure
          </span>
        )}
        {isIntercity && !isShinkansen && (
          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-200">
            🚃 Inter-city Transfer
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================
// FILL SLOT SUGGESTIONS - Suggestions panel for empty slots
// ============================================

const ACTIVITY_SUGGESTIONS: Record<
  string,
  Array<{
    id: string;
    name: string;
    category: string;
    duration: number;
    icon: string;
  }>
> = {
  morning: [
    {
      id: "morning-temple",
      name: "Visit a temple",
      category: "Cultural",
      duration: 90,
      icon: "⛩️",
    },
    {
      id: "morning-garden",
      name: "Explore a garden",
      category: "Nature",
      duration: 60,
      icon: "🌸",
    },
    {
      id: "morning-museum",
      name: "Visit a museum",
      category: "Cultural",
      duration: 120,
      icon: "🏛️",
    },
  ],
  breakfast: [
    {
      id: "breakfast-cafe",
      name: "Local café",
      category: "Food",
      duration: 45,
      icon: "☕",
    },
    {
      id: "breakfast-market",
      name: "Morning market",
      category: "Food",
      duration: 60,
      icon: "🥐",
    },
  ],
  lunch: [
    {
      id: "lunch-ramen",
      name: "Try local ramen",
      category: "Food",
      duration: 60,
      icon: "🍜",
    },
    {
      id: "lunch-sushi",
      name: "Sushi restaurant",
      category: "Food",
      duration: 75,
      icon: "🍣",
    },
    {
      id: "lunch-izakaya",
      name: "Casual izakaya",
      category: "Food",
      duration: 90,
      icon: "🍶",
    },
  ],
  afternoon: [
    {
      id: "afternoon-shopping",
      name: "Shopping district",
      category: "Shopping",
      duration: 120,
      icon: "🛍️",
    },
    {
      id: "afternoon-park",
      name: "Relax in a park",
      category: "Nature",
      duration: 60,
      icon: "🌳",
    },
    {
      id: "afternoon-temple",
      name: "Temple visit",
      category: "Cultural",
      duration: 90,
      icon: "⛩️",
    },
  ],
  dinner: [
    {
      id: "dinner-kaiseki",
      name: "Kaiseki dinner",
      category: "Food",
      duration: 120,
      icon: "🍱",
    },
    {
      id: "dinner-yakitori",
      name: "Yakitori restaurant",
      category: "Food",
      duration: 90,
      icon: "🍗",
    },
    {
      id: "dinner-tempura",
      name: "Tempura specialty",
      category: "Food",
      duration: 75,
      icon: "🍤",
    },
  ],
  evening: [
    {
      id: "evening-bar",
      name: "Cocktail bar",
      category: "Nightlife",
      duration: 90,
      icon: "🍸",
    },
    {
      id: "evening-walk",
      name: "Night walk",
      category: "Sightseeing",
      duration: 45,
      icon: "🌙",
    },
  ],
};

interface FillSlotSuggestionsProps {
  slot: SlotWithOptions;
  dayIndex: number;
  allDaySlots?: SlotWithOptions[];
  city?: string;
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
  onClose: () => void;
}

// Type for API suggestions
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
      photos?: string[];
    };
  };
  distance?: number | null;
  bookingInfo?: {
    hasTickets: boolean;
    ticketType: string;
  };
  // Time conflict information
  timeConflict?: {
    hasConflict: boolean;
    slotDuration: number;
    activityDuration: number;
    overflowMinutes: number;
    severity: "minor" | "moderate" | "major";
    suggestion?: string;
  };
}

function FillSlotSuggestions({
  slot,
  dayIndex,
  allDaySlots = [],
  city,
  onFillSlotWithActivity,
  onClose,
}: FillSlotSuggestionsProps) {
  const [refreshKey, setRefreshKey] = useState(0);
  const [apiSuggestions, setApiSuggestions] = useState<APISuggestion[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Analyze existing activities in the day
  const existingCategories = useMemo(() => {
    const categories = new Set<string>();
    for (const daySlot of allDaySlots) {
      if (daySlot.slotId === slot.slotId) continue; // Skip current slot
      if (daySlot.options.length === 0) continue;

      const selectedOption =
        daySlot.options.find((o) => o.id === daySlot.selectedOptionId) ||
        daySlot.options[0];
      if (selectedOption?.activity?.category) {
        categories.add(selectedOption.activity.category.toLowerCase());
      }
    }
    return categories;
  }, [allDaySlots, slot.slotId, refreshKey]);

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

  // Get coordinates from previous activity if available
  const prevCoordinates = useMemo(() => {
    for (const daySlot of allDaySlots) {
      if (daySlot.slotId === slot.slotId) break;
      if (daySlot.options.length === 0) continue;
      const selectedOption =
        daySlot.options.find((o) => o.id === daySlot.selectedOptionId) ||
        daySlot.options[0];
      if (selectedOption?.activity?.place?.coordinates) {
        return selectedOption.activity.place.coordinates;
      }
    }
    return undefined;
  }, [allDaySlots, slot.slotId]);

  // Calculate slot duration in minutes
  const slotDuration = useMemo(() => {
    const [startHour, startMin] = slot.timeRange.start.split(":").map(Number);
    const [endHour, endMin] = slot.timeRange.end.split(":").map(Number);
    return endHour * 60 + endMin - (startHour * 60 + startMin);
  }, [slot.timeRange]);

  // Fetch suggestions from API
  useEffect(() => {
    if (!city) return;

    const abortController = new AbortController();

    const fetchSuggestions = async () => {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/japan-itinerary/suggestions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            city: city.toLowerCase(),
            slotType: slot.slotType,
            coordinates: prevCoordinates,
            maxDistance: 2000,
            limit: 8, // Request more to include some with time conflicts
            excludeNames: existingActivityNames,
            existingMealSlots: existingMealSlots,
            slotDuration: slotDuration,
            includeTimeConflicts: true,
          }),
          signal: abortController.signal,
        });

        const data = await response.json();

        if (data.success && data.data?.suggestions) {
          setApiSuggestions(data.data.suggestions);
        } else {
          setError("Failed to load suggestions");
        }
      } catch (err) {
        // Don't log abort errors - they're expected in Strict Mode
        if (err instanceof Error && err.name === "AbortError") {
          return;
        }
        console.error("Failed to fetch suggestions:", err);
        setError("Failed to load suggestions");
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoading(false);
        }
      }
    };

    fetchSuggestions();

    // Cleanup: abort fetch if component unmounts or dependencies change
    return () => {
      abortController.abort();
    };
  }, [
    city,
    slot.slotType,
    prevCoordinates,
    existingActivityNames,
    refreshKey,
    slotDuration,
  ]);

  // Category to icon mapping
  const categoryIcons: Record<string, string> = {
    temple: "⛩️",
    shrine: "⛩️",
    museum: "🏛️",
    park: "🌸",
    garden: "🌸",
    restaurant: "🍽️",
    ramen: "🍜",
    sushi: "🍣",
    cafe: "☕",
    shopping: "🛍️",
    market: "🏬",
    viewpoint: "🗼",
    landmark: "🏯",
    nightlife: "🌙",
    bar: "🍸",
    experience: "✨",
    default: "📍",
  };

  const getIconForCategory = (category: string): string => {
    const lowerCat = category.toLowerCase();
    for (const [key, icon] of Object.entries(categoryIcons)) {
      if (lowerCat.includes(key)) return icon;
    }
    return categoryIcons.default;
  };

  // Convert API suggestions to display format
  const suggestions = useMemo(() => {
    if (apiSuggestions.length > 0) {
      return apiSuggestions.map((s) => ({
        id: s.id,
        name: s.activity.name,
        category: s.activity.category,
        duration: s.activity.duration,
        icon: getIconForCategory(s.activity.category),
        description: s.activity.description,
        neighborhood: s.activity.place?.neighborhood,
        rating: s.activity.place?.rating,
        hasTickets: s.bookingInfo?.hasTickets || false,
        // Preserve full place data for directions
        place: s.activity.place,
        // Time conflict info
        timeConflict: s.timeConflict,
      }));
    }

    // Fallback to generic suggestions if no API suggestions
    const baseSuggestions =
      ACTIVITY_SUGGESTIONS[slot.slotType] || ACTIVITY_SUGGESTIONS.afternoon;
    return baseSuggestions.map((s) => ({
      ...s,
      description: undefined,
      neighborhood: undefined,
      rating: undefined,
      hasTickets: false,
      place: undefined,
      timeConflict: undefined,
    }));
  }, [apiSuggestions, slot.slotType]);

  const handleSelectSuggestion = (suggestion: (typeof suggestions)[0]) => {
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
    onClose();
  };

  const handleRefresh = () => {
    setRefreshKey((prev) => prev + 1);
  };

  // Check what categories are already present for display
  const categoryHints = useMemo(() => {
    if (existingCategories.size === 0) return null;
    const cats = Array.from(existingCategories).slice(0, 3);
    return cats.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(", ");
  }, [existingCategories]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
            {city ? `Suggestions for ${city}:` : "Smart suggestions:"}
          </span>
          <button
            onClick={handleRefresh}
            disabled={isLoading}
            className="p-1 text-gray-400 hover:text-purple-500 dark:hover:text-purple-400 transition-colors disabled:opacity-50"
            title="Refresh suggestions"
          >
            <svg
              className={cn("w-3.5 h-3.5", isLoading && "animate-spin")}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>
        <button
          onClick={onClose}
          className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
        >
          Cancel
        </button>
      </div>

      {/* Context hint */}
      {categoryHints && (
        <div className="text-xs text-gray-400 dark:text-gray-500 bg-gray-50 dark:bg-gray-800 px-2 py-1 rounded">
          Already planned: {categoryHints}
        </div>
      )}

      {/* Loading state */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="animate-spin rounded-full h-6 w-6 border-2 border-purple-500 border-t-transparent"></div>
          <span className="ml-2 text-sm text-gray-500">
            Loading suggestions...
          </span>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 px-2 py-1 rounded">
          {error} - showing generic suggestions
        </div>
      )}

      {/* Suggestions grid */}
      {!isLoading && (
        <div className="grid gap-2">
          {suggestions.map((suggestion, index) => {
            const isDeprioritized = existingCategories.has(
              suggestion.category.toLowerCase()
            );
            return (
              <button
                key={`${suggestion.id}-${refreshKey}`}
                onClick={() => handleSelectSuggestion(suggestion)}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                  isDeprioritized
                    ? "border-gray-200 dark:border-gray-700 opacity-60 hover:opacity-100"
                    : suggestion.timeConflict?.hasConflict
                    ? "border-amber-300 dark:border-amber-600 bg-amber-50/30 dark:bg-amber-900/10 hover:bg-amber-100/50 dark:hover:bg-amber-900/20"
                    : index === 0
                    ? "border-purple-300 dark:border-purple-700 bg-purple-50/50 dark:bg-purple-900/20 hover:bg-purple-100/50 dark:hover:bg-purple-900/30"
                    : "border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700 hover:bg-purple-50/50 dark:hover:bg-purple-900/10"
                )}
              >
                <span className="text-2xl">{suggestion.icon}</span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium text-sm text-gray-900 dark:text-white flex items-center gap-2 flex-wrap">
                    <span className="truncate">{suggestion.name}</span>
                    {index === 0 &&
                      !isDeprioritized &&
                      !suggestion.timeConflict?.hasConflict && (
                        <span className="px-1.5 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/50 text-purple-600 dark:text-purple-400 rounded flex-shrink-0">
                          Recommended
                        </span>
                      )}
                    {isDeprioritized && (
                      <span className="px-1.5 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded flex-shrink-0">
                        Similar exists
                      </span>
                    )}
                    {suggestion.hasTickets && (
                      <span className="px-1.5 py-0.5 text-xs bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 rounded flex-shrink-0">
                        🎫
                      </span>
                    )}
                    {/* Time conflict badge */}
                    {suggestion.timeConflict?.hasConflict && (
                      <span
                        className={cn(
                          "px-1.5 py-0.5 text-xs rounded flex-shrink-0 flex items-center gap-1",
                          suggestion.timeConflict.severity === "minor"
                            ? "bg-yellow-100 dark:bg-yellow-900/50 text-yellow-700 dark:text-yellow-400"
                            : suggestion.timeConflict.severity === "moderate"
                            ? "bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-400"
                            : "bg-red-100 dark:bg-red-900/50 text-red-700 dark:text-red-400"
                        )}
                      >
                        ⏱️ +{suggestion.timeConflict.overflowMinutes}min
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                    <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                      {suggestion.category}
                    </span>
                    <span>{suggestion.duration} min</span>
                    {suggestion.neighborhood && (
                      <>
                        <span>•</span>
                        <span className="truncate">
                          {suggestion.neighborhood}
                        </span>
                      </>
                    )}
                    {suggestion.rating && (
                      <>
                        <span>•</span>
                        <span className="flex items-center gap-0.5">
                          ⭐ {suggestion.rating}
                        </span>
                      </>
                    )}
                  </div>
                  {/* Time conflict hint */}
                  {suggestion.timeConflict?.hasConflict &&
                    suggestion.timeConflict.suggestion && (
                      <div className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                        💡 {suggestion.timeConflict.suggestion}
                      </div>
                    )}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ============================================
// SWIPE CAROUSEL - Always-on carousel for options
// ============================================

interface SwipeCarouselProps {
  options: ActivityOption[];
  currentIndex: number;
  selectedOptionId?: string | null;
  onNavigate: (direction: "prev" | "next") => void;
  onSelect: (optionId: string) => void;
}

function SwipeCarousel({
  options,
  currentIndex,
  selectedOptionId,
  onNavigate,
  onSelect,
}: SwipeCarouselProps) {
  const currentOption = options[currentIndex];
  const totalOptions = options.length;
  const isSelected = currentOption?.id === selectedOptionId;

  if (!currentOption) return null;

  return (
    <div className="relative">
      {/* Carousel Container */}
      <div className="relative flex items-center gap-2">
        {/* Left Arrow */}
        <button
          onClick={() => onNavigate("prev")}
          disabled={currentIndex <= 0}
          className={cn(
            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all z-10",
            currentIndex > 0
              ? "bg-white dark:bg-gray-700 shadow-md hover:shadow-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
              : "bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed"
          )}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Card Display Area */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentOption.id}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.2 }}
            >
              <CarouselActivityCard
                option={currentOption}
                isSelected={isSelected}
                onSelect={() => onSelect(currentOption.id)}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right Arrow */}
        <button
          onClick={() => onNavigate("next")}
          disabled={currentIndex >= totalOptions - 1}
          className={cn(
            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all z-10",
            currentIndex < totalOptions - 1
              ? "bg-white dark:bg-gray-700 shadow-md hover:shadow-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
              : "bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed"
          )}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Progress Dots */}
      {totalOptions > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {options.map((opt, idx) => (
            <button
              key={opt.id}
              onClick={() => {
                const diff = idx - currentIndex;
                if (diff > 0) {
                  for (let i = 0; i < diff; i++) onNavigate("next");
                } else if (diff < 0) {
                  for (let i = 0; i < -diff; i++) onNavigate("prev");
                }
              }}
              className={cn(
                "h-2 rounded-full transition-all",
                idx === currentIndex
                  ? "bg-purple-500 w-6"
                  : opt.id === selectedOptionId
                  ? "bg-green-400 w-2"
                  : "bg-gray-300 dark:bg-gray-600 w-2 hover:bg-gray-400"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// SWIPE CARD STACK (Carousel-style) - Legacy
// ============================================

interface SwipeCardStackProps {
  options: ActivityOption[];
  currentIndex: number;
  onSwipe: (action: "keep" | "reject" | "save") => void;
  onClose: () => void;
}

function SwipeCardStack({
  options,
  currentIndex: initialIndex,
  onSwipe,
  onClose,
}: SwipeCardStackProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const alternatives = options.slice(1); // Skip the main selection
  const totalCards = alternatives.length;
  const currentOption = alternatives[currentIndex - 1]; // -1 because index starts from 1

  const goToPrevious = () => {
    if (currentIndex > 1) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goToNext = () => {
    if (currentIndex < totalCards) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleAction = (action: "keep" | "reject" | "save") => {
    if (action === "keep") {
      onSwipe("keep");
    } else if (action === "reject") {
      // Move to next card or exit if at end
      if (currentIndex < totalCards) {
        setCurrentIndex(currentIndex + 1);
      } else {
        onClose();
      }
    } else if (action === "save") {
      // Save for later (bookmark), move to next
      if (currentIndex < totalCards) {
        setCurrentIndex(currentIndex + 1);
      } else {
        onClose();
      }
    }
  };

  if (!currentOption) {
    return (
      <div className="relative bg-gray-50 dark:bg-gray-800/50 rounded-xl p-8">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-30 w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center justify-center h-[200px] text-gray-500">
          <div className="text-center">
            <Layers className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p>No more alternatives</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-800 dark:to-gray-900 rounded-xl p-4 shadow-lg">
      {/* Header: Close button and counter */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-purple-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Browse Alternatives
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {currentIndex} / {totalCards}
          </span>
          <button
            onClick={onClose}
            className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Carousel Container */}
      <div className="relative flex items-center gap-2">
        {/* Left Arrow */}
        <button
          onClick={goToPrevious}
          disabled={currentIndex <= 1}
          className={cn(
            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all",
            currentIndex > 1
              ? "bg-white dark:bg-gray-700 shadow-md hover:shadow-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
              : "bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed"
          )}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Card Display Area */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentOption.id}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.2 }}
            >
              <CarouselActivityCard option={currentOption} />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right Arrow */}
        <button
          onClick={goToNext}
          disabled={currentIndex >= totalCards}
          className={cn(
            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all",
            currentIndex < totalCards
              ? "bg-white dark:bg-gray-700 shadow-md hover:shadow-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
              : "bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed"
          )}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-center gap-4 mt-4">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleAction("reject")}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium shadow-md hover:shadow-lg transition-shadow"
        >
          <X className="w-4 h-4" />
          <span>Skip</span>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleAction("save")}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium shadow-md hover:shadow-lg transition-shadow"
        >
          <Bookmark className="w-4 h-4" />
          <span>Save</span>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleAction("keep")}
          className="flex items-center gap-2 px-5 py-2 rounded-full bg-green-500 dark:bg-green-600 text-white font-medium shadow-md hover:shadow-lg transition-shadow"
        >
          <Check className="w-4 h-4" />
          <span>Select</span>
        </motion.button>
      </div>

      {/* Progress Dots */}
      <div className="flex items-center justify-center gap-1 mt-3">
        {alternatives.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx + 1)}
            className={cn(
              "w-2 h-2 rounded-full transition-all",
              idx + 1 === currentIndex
                ? "bg-purple-500 w-4"
                : "bg-gray-300 dark:bg-gray-600 hover:bg-gray-400"
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================
// CAROUSEL ACTIVITY CARD (with image)
// ============================================

interface CarouselActivityCardProps {
  option: ActivityOption;
  isSelected?: boolean;
  onSelect?: () => void;
}

// Category-based placeholder images from Unsplash
const categoryImages: Record<string, string> = {
  restaurant:
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=250&fit=crop",
  cafe: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400&h=250&fit=crop",
  temple:
    "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=400&h=250&fit=crop",
  shrine:
    "https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?w=400&h=250&fit=crop",
  museum:
    "https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=400&h=250&fit=crop",
  park: "https://images.unsplash.com/photo-1519331379826-f10be5486c6f?w=400&h=250&fit=crop",
  garden:
    "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=400&h=250&fit=crop",
  market:
    "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=400&h=250&fit=crop",
  shopping:
    "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=250&fit=crop",
  nightlife:
    "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400&h=250&fit=crop",
  bar: "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=400&h=250&fit=crop",
  landmark:
    "https://images.unsplash.com/photo-1480796927426-f609979314bd?w=400&h=250&fit=crop",
  attraction:
    "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=400&h=250&fit=crop",
  tour: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=400&h=250&fit=crop",
  activity:
    "https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=400&h=250&fit=crop",
  default:
    "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400&h=250&fit=crop",
};

function getPlaceholderImage(category: string): string {
  const lowerCat = category.toLowerCase();
  for (const [key, url] of Object.entries(categoryImages)) {
    if (lowerCat.includes(key)) return url;
  }
  return categoryImages.default;
}

function CarouselActivityCard({
  option,
  isSelected,
  onSelect,
}: CarouselActivityCardProps) {
  const { activity, matchReasons, score, rank } = option;

  // Get image: use place photos if available, otherwise use category placeholder
  const imageUrl =
    activity.place?.photos?.[0] || getPlaceholderImage(activity.category);

  return (
    <div
      className={cn(
        "bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden border-2 transition-all",
        isSelected
          ? "border-green-500 ring-2 ring-green-200 dark:ring-green-800"
          : "border-gray-200 dark:border-gray-700"
      )}
    >
      {/* Image Section */}
      <div className="relative h-36 overflow-hidden">
        <img
          src={imageUrl}
          alt={activity.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = categoryImages.default;
          }}
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Selected badge */}
        {isSelected && (
          <div className="absolute top-3 left-3 px-2 py-1 text-xs font-bold bg-green-500 text-white rounded-full shadow flex items-center gap-1">
            <Check className="w-3 h-3" />
            Selected
          </div>
        )}

        {/* Score badge on image */}
        <div
          className={cn(
            "absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-lg",
            score >= 80
              ? "bg-green-500 text-white"
              : score >= 60
              ? "bg-yellow-500 text-white"
              : "bg-gray-500 text-white"
          )}
        >
          {score}
        </div>

        {/* Rank badge */}
        {rank <= 3 && !isSelected && (
          <div className="absolute top-3 left-3 px-2 py-1 text-xs font-bold bg-yellow-400 text-yellow-900 rounded-full shadow">
            #{rank}
          </div>
        )}

        {/* Title overlay on image */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <h4 className="font-bold text-white text-base drop-shadow-lg line-clamp-1">
            {activity.name}
          </h4>
          <div className="flex items-center gap-2 text-white/90 text-xs mt-0.5">
            {activity.place?.neighborhood && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {activity.place.neighborhood}
              </span>
            )}
            {activity.place?.rating && (
              <span className="flex items-center gap-1">
                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                {activity.place.rating}
                {activity.place.reviewCount && (
                  <span>({activity.place.reviewCount.toLocaleString()})</span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="p-3">
        {/* Description */}
        <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2 mb-2">
          {activity.description}
        </p>

        {/* Meta Row: Duration, Cost, Tags */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300">
            <Clock className="w-3 h-3" />
            {activity.duration} min
          </span>

          {activity.isFree ? (
            <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
              FREE
            </span>
          ) : (
            activity.estimatedCost && (
              <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300">
                <DollarSign className="w-3 h-3" />~
                {activity.estimatedCost.amount}{" "}
                {activity.estimatedCost.currency}
              </span>
            )
          )}

          {activity.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Match Reasons */}
        {matchReasons.length > 0 && (
          <div className="mb-3">
            {matchReasons.slice(0, 2).map((reason, i) => (
              <div
                key={i}
                className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400"
              >
                <Check className="w-3 h-3" />
                {reason}
              </div>
            ))}
          </div>
        )}

        {/* Select Button */}
        <button
          onClick={onSelect}
          className={cn(
            "w-full py-2 rounded-lg font-medium text-sm transition-all",
            isSelected
              ? "bg-green-500 text-white"
              : "bg-purple-600 hover:bg-purple-700 text-white"
          )}
        >
          {isSelected ? (
            <span className="flex items-center justify-center gap-1">
              <Check className="w-4 h-4" />
              Selected
            </span>
          ) : (
            "Select This Option"
          )}
        </button>

        {/* Viator Tour Enhancements */}
        {option.viatorEnhancements && option.viatorEnhancements.length > 0 && (
          <ViatorEnhancementList
            enhancements={option.viatorEnhancements}
            activityName={activity.name}
            maxVisible={2}
          />
        )}
      </div>
    </div>
  );
}

// ============================================
// SWIPEABLE ACTIVITY CARD
// ============================================

interface SwipeableActivityCardProps {
  option: ActivityOption;
  isTop: boolean;
  stackIndex: number;
  onSwipe: (action: "keep" | "reject" | "save") => void;
}

function SwipeableActivityCard({
  option,
  isTop,
  stackIndex,
  onSwipe,
}: SwipeableActivityCardProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const opacity = useTransform(
    x,
    [-200, -100, 0, 100, 200],
    [0.5, 1, 1, 1, 0.5]
  );

  // Swipe indicators
  const keepOpacity = useTransform(x, [0, 100], [0, 1]);
  const rejectOpacity = useTransform(x, [-100, 0], [1, 0]);

  const handleDragEnd = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    const swipeThreshold = 100;
    const velocityThreshold = 500;
    const { offset, velocity } = info;

    if (
      Math.abs(offset.x) > swipeThreshold ||
      Math.abs(velocity.x) > velocityThreshold
    ) {
      if (offset.x > 0) {
        onSwipe("keep");
      } else {
        onSwipe("reject");
      }
      return;
    }

    // Vertical swipe for save
    if (offset.y < -swipeThreshold || velocity.y < -velocityThreshold) {
      onSwipe("save");
    }
  };

  const { activity, matchReasons, score, rank } = option;

  return (
    <motion.div
      className={cn(
        "absolute inset-0",
        isTop ? "z-20" : `z-${10 - stackIndex}`
      )}
      style={{
        x: isTop ? x : 0,
        y: isTop ? y : 0,
        rotate: isTop ? rotate : 0,
        scale: 1 - stackIndex * 0.05,
        opacity: isTop ? opacity : 0.8 - stackIndex * 0.2,
        top: stackIndex * 8,
      }}
      drag={isTop}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.8}
      onDragEnd={isTop ? handleDragEnd : undefined}
      whileTap={{ cursor: "grabbing" }}
    >
      <div className="h-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Swipe Indicators */}
        {isTop && (
          <>
            <motion.div
              className="absolute top-4 left-4 z-30 px-3 py-1 bg-green-500 text-white font-bold text-sm rounded-lg rotate-[-10deg]"
              style={{ opacity: keepOpacity }}
            >
              SELECT ✓
            </motion.div>
            <motion.div
              className="absolute top-4 right-4 z-30 px-3 py-1 bg-red-500 text-white font-bold text-sm rounded-lg rotate-[10deg]"
              style={{ opacity: rejectOpacity }}
            >
              SKIP ✗
            </motion.div>
          </>
        )}

        {/* Card Content */}
        <div className="p-4 h-full flex flex-col">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                  {activity.name}
                </h4>
                {rank <= 2 && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full flex-shrink-0">
                    {rank === 1 ? "Top Pick" : "#2"}
                  </span>
                )}
              </div>

              {/* Location & Duration */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
                {activity.place?.neighborhood && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {activity.place.neighborhood}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {activity.duration} min
                </span>
                {activity.place?.rating && (
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                    {activity.place.rating}
                    {activity.place.reviewCount && (
                      <span className="text-gray-400">
                        ({activity.place.reviewCount})
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>

            {/* Score Badge */}
            <div
              className={cn(
                "flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold",
                score >= 80
                  ? "bg-green-100 text-green-700"
                  : score >= 60
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-gray-100 text-gray-600"
              )}
            >
              {score}
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3 mb-3">
            {activity.description}
          </p>

          {/* Cost */}
          <div className="flex items-center gap-2 mb-3">
            {activity.isFree ? (
              <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                FREE
              </span>
            ) : (
              activity.estimatedCost && (
                <span className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300">
                  <DollarSign className="w-3 h-3" />~
                  {activity.estimatedCost.amount}{" "}
                  {activity.estimatedCost.currency}
                </span>
              )
            )}
          </div>

          {/* Tags */}
          {activity.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {activity.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Match Reasons */}
          {matchReasons.length > 0 && (
            <div className="mt-auto space-y-1">
              {matchReasons.slice(0, 2).map((reason, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400"
                >
                  <Check className="w-3 h-3" />
                  {reason}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================
// ACTIVITY OPTION CARD
// ============================================

interface ActivityOptionCardProps {
  option: ActivityOption;
  isSelected?: boolean;
  isCompact?: boolean;
  onSelect: () => void;
}

export function ActivityOptionCard({
  option,
  isSelected,
  isCompact,
  onSelect,
}: ActivityOptionCardProps) {
  const { activity, matchReasons, tradeoffs, dietaryMatch, score, rank } =
    option;

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className={cn(
        "rounded-xl border transition-all cursor-pointer",
        isSelected
          ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800",
        isCompact ? "p-3" : "p-4"
      )}
      onClick={onSelect}
    >
      <div className="flex gap-4">
        {/* Left: Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4
                  className={cn(
                    "font-semibold text-gray-900 dark:text-white truncate",
                    isCompact ? "text-sm" : "text-base"
                  )}
                >
                  {activity.name}
                </h4>
                {rank === 1 && !isCompact && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                    Top Pick
                  </span>
                )}
              </div>

              {/* Location & Duration */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
                {activity.place?.neighborhood && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {activity.place.neighborhood}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {activity.duration} min
                </span>
                <span className="flex items-center gap-1">
                  {activity.isFree ? (
                    <span className="text-green-600 font-medium">FREE</span>
                  ) : activity.estimatedCost ? (
                    <>
                      <DollarSign className="w-3 h-3" />~
                      {activity.estimatedCost.currency === "USD" ? "$" : ""}
                      {activity.estimatedCost.amount}
                    </>
                  ) : null}
                </span>
                {activity.place?.rating && (
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-yellow-500" />
                    {activity.place.rating}
                  </span>
                )}
              </div>
            </div>

            {/* Score Badge */}
            {!isCompact && (
              <div
                className={cn(
                  "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold",
                  score >= 80
                    ? "bg-green-100 text-green-700"
                    : score >= 60
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-gray-100 text-gray-600"
                )}
              >
                {score}
              </div>
            )}
          </div>

          {/* Description */}
          {!isCompact && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
              {activity.description}
            </p>
          )}

          {/* Tags */}
          {!isCompact && activity.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {activity.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Dietary Match Badge */}
          {dietaryMatch && (
            <DietaryBadge match={dietaryMatch} compact={isCompact} />
          )}

          {/* Match Reasons & Tradeoffs (only for expanded view) */}
          {!isCompact && (
            <div className="mt-3 space-y-2">
              {matchReasons.length > 0 && (
                <div className="space-y-1">
                  {matchReasons.slice(0, 3).map((reason, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400"
                    >
                      <Check className="w-3 h-3" />
                      {reason}
                    </div>
                  ))}
                </div>
              )}

              {tradeoffs.length > 0 && (
                <div className="space-y-1">
                  {tradeoffs.slice(0, 2).map((tradeoff, i) => (
                    <div
                      key={i}
                      className="text-xs text-amber-600 dark:text-amber-400"
                    >
                      ⚠️ {tradeoff}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Selection indicator */}
        <div className="flex-shrink-0 flex items-center">
          <div
            className={cn(
              "w-6 h-6 rounded-full border-2 flex items-center justify-center",
              isSelected
                ? "border-purple-500 bg-purple-500"
                : "border-gray-300 dark:border-gray-600"
            )}
          >
            {isSelected && <Check className="w-4 h-4 text-white" />}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================
// DIETARY BADGE
// ============================================

interface DietaryBadgeProps {
  match: NonNullable<ActivityOption["dietaryMatch"]>;
  compact?: boolean;
}

function DietaryBadge({ match, compact }: DietaryBadgeProps) {
  if (!match.meetsRequirements && match.warnings.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-1 mt-2", compact && "mt-1")}>
      {match.meetsRequirements ? (
        <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
          <Check className="w-3 h-3" />
          Dietary OK
        </span>
      ) : null}
      {match.warnings.length > 0 && (
        <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">
          ⚠️ {match.warnings[0]}
        </span>
      )}
    </div>
  );
}

// ============================================
// COMMUTE BLOCK
// ============================================

// Google Maps travel mode mapping
const GOOGLE_MAPS_TRAVEL_MODE: Record<string, string> = {
  walk: "walking",
  transit: "transit",
  taxi: "driving",
  drive: "driving",
};

function generateGoogleMapsDirectionsUrl(
  origin: { lat: number; lng: number } | string,
  destination: { lat: number; lng: number } | string,
  travelMode: string = "transit"
): string {
  const originStr =
    typeof origin === "string"
      ? encodeURIComponent(origin)
      : `${origin.lat},${origin.lng}`;
  const destStr =
    typeof destination === "string"
      ? encodeURIComponent(destination)
      : `${destination.lat},${destination.lng}`;
  const mode = GOOGLE_MAPS_TRAVEL_MODE[travelMode] || "transit";

  return `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}&travelmode=${mode}`;
}

interface CommuteBlockProps {
  commute: StructuredCommuteInfo;
  fromCoords?: { lat: number; lng: number };
  toCoords?: { lat: number; lng: number };
}

export function CommuteBlock({
  commute,
  fromCoords,
  toCoords,
}: CommuteBlockProps) {
  const methodIcons: Record<string, string> = {
    walk: "🚶",
    transit: "🚃",
    taxi: "🚕",
    drive: "🚗",
  };

  const icon = methodIcons[commute.method] || "🚶";

  const googleMapsUrl =
    fromCoords && toCoords
      ? generateGoogleMapsDirectionsUrl(fromCoords, toCoords, commute.method)
      : null;

  return (
    <div className="flex items-center gap-2 py-2 px-3 my-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-lg">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {Math.round(commute.duration)} min
          </span>
          <span className="text-gray-400">•</span>
          <span className="text-gray-500 dark:text-gray-400 capitalize">
            {commute.method}
          </span>
          {commute.trainLines && commute.trainLines.length > 0 && (
            <>
              <span className="text-gray-400">•</span>
              <span className="text-xs text-gray-500 truncate">
                {commute.trainLines.join(", ")}
              </span>
            </>
          )}
        </div>
        {commute.instructions && (
          <p className="text-xs text-gray-400 truncate">
            {commute.instructions}
          </p>
        )}
      </div>
      {commute.cost && (
        <div className="flex-shrink-0 text-xs text-gray-500">
          ~{commute.cost.currency === "USD" ? "$" : ""}
          {commute.cost.amount}
        </div>
      )}
      {googleMapsUrl && (
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-800/40 transition-colors text-xs"
          title="Open directions in Google Maps"
        >
          🗺️ Directions
        </a>
      )}
    </div>
  );
}

// ============================================
// EXPORTS
// ============================================

export default SlotOptions;
