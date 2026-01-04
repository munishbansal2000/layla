"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronLeft,
  ChevronRight,
  Star,
  Clock,
  MapPin,
  Train,
  Footprints,
  Car,
  ChevronDown,
  ChevronUp,
  Lightbulb,
  Wallet,
  Check,
  Loader2,
  RefreshCw,
  Settings2,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  StructuredItineraryData,
  DayWithOptions,
  SlotWithOptions,
  ActivityOption,
  CityTransitionInfo,
} from "@/types/structured-itinerary";

// ============================================
// Types
// ============================================

interface ItineraryConfig {
  cities: string[];
  startDate: string;
  totalDays?: number;
  pace: "relaxed" | "moderate" | "packed";
  includeKlookExperiences: boolean;
}

interface ApiResponse {
  success: boolean;
  data?: {
    itinerary: StructuredItineraryData;
    metadata: {
      generatedAt: string;
      source: string;
      totalDays: number;
      totalSlots: number;
      totalOptions: number;
      cities: string[];
    };
  };
  error?: string;
}

// ============================================
// Slot Icons
// ============================================

const slotIcons: Record<string, string> = {
  morning: "🌅",
  breakfast: "🥐",
  lunch: "🍽️",
  afternoon: "☀️",
  dinner: "🌙",
  evening: "✨",
};

const categoryIcons: Record<string, string> = {
  temple: "⛩️",
  shrine: "⛩️",
  restaurant: "🍴",
  cafe: "☕",
  market: "🛒",
  landmark: "🏛️",
  attraction: "🎡",
  museum: "🏛️",
  park: "🌳",
  nature: "🌲",
  shopping: "🛍️",
  nightlife: "🍸",
  activity: "🎭",
  transport: "🚄",
  neighborhood: "🏘️",
};

// ============================================
// Helper Functions
// ============================================

function CommuteMethodIcon({ method }: { method: string }) {
  switch (method) {
    case "walk":
      return <Footprints className="w-4 h-4" />;
    case "transit":
      return <Train className="w-4 h-4" />;
    case "drive":
    case "taxi":
      return <Car className="w-4 h-4" />;
    default:
      return <Train className="w-4 h-4" />;
  }
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

function formatCurrency(amount: number, currency: string): string {
  if (currency === "JPY") {
    return `¥${amount.toLocaleString()}`;
  }
  return `${currency} ${amount.toLocaleString()}`;
}

// ============================================
// City Transition Card
// ============================================

function CityTransitionCard({
  transition,
}: {
  transition: CityTransitionInfo;
}) {
  return (
    <div className="mb-4 p-4 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-xl text-white">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-white/20 rounded-lg">
          <Train className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold">
            {transition.trainName || transition.method}
          </h4>
          <p className="text-sm text-white/80">
            {transition.departureStation || transition.from} →{" "}
            {transition.arrivalStation || transition.to}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm font-medium">
            {transition.departureTime} - {transition.arrivalTime}
          </p>
          <p className="text-xs text-white/80">
            {formatDuration(transition.duration)}
          </p>
        </div>
      </div>
      {transition.estimatedCost && (
        <div className="mt-2 text-xs text-white/80 text-right">
          {formatCurrency(
            transition.estimatedCost.amount,
            transition.estimatedCost.currency
          )}
        </div>
      )}
    </div>
  );
}

// ============================================
// Activity Option Card
// ============================================

function ActivityOptionCard({
  option,
  isSelected,
  onSelect,
  showDetails,
}: {
  option: ActivityOption;
  isSelected: boolean;
  onSelect: () => void;
  showDetails: boolean;
}) {
  const { activity } = option;
  const categoryIcon = categoryIcons[activity.category] || "📍";

  // Check if this has a booking URL (Klook experience)
  const bookingUrl = (activity as { bookingUrl?: string }).bookingUrl;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "p-3 rounded-xl border-2 transition-all cursor-pointer",
        isSelected
          ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 hover:border-purple-300"
      )}
      onClick={onSelect}
    >
      <div className="flex items-start gap-3">
        <span className="text-2xl flex-shrink-0">{categoryIcon}</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h5 className="font-medium text-gray-900 dark:text-white truncate">
              {activity.name}
            </h5>
            {isSelected && (
              <span className="flex-shrink-0 w-5 h-5 bg-purple-500 rounded-full flex items-center justify-center">
                <Check className="w-3 h-3 text-white" />
              </span>
            )}
          </div>

          <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mt-1">
            {activity.description}
          </p>

          {/* Meta info row */}
          <div className="flex items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formatDuration(activity.duration)}
            </span>
            {activity.place?.rating && (
              <span className="flex items-center gap-1">
                <Star className="w-3 h-3 text-yellow-500 fill-current" />
                {activity.place.rating.toFixed(1)}
                {activity.place.reviewCount && (
                  <span className="text-gray-400">
                    ({activity.place.reviewCount.toLocaleString()})
                  </span>
                )}
              </span>
            )}
            {activity.isFree ? (
              <span className="text-green-600 font-medium">Free</span>
            ) : activity.estimatedCost ? (
              <span>
                {formatCurrency(
                  activity.estimatedCost.amount,
                  activity.estimatedCost.currency
                )}
              </span>
            ) : null}
          </div>

          {/* Location */}
          {activity.place?.neighborhood && (
            <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
              <MapPin className="w-3 h-3" />
              {activity.place.neighborhood}
            </div>
          )}

          {/* Tags */}
          {activity.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {activity.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full text-xs"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Match reasons & tradeoffs (only when showing details) */}
          {showDetails && (
            <>
              {option.matchReasons.length > 0 && (
                <div className="mt-2 text-xs text-green-600 dark:text-green-400">
                  ✓ {option.matchReasons.join(" • ")}
                </div>
              )}
              {option.tradeoffs.length > 0 && (
                <div className="mt-1 text-xs text-amber-600 dark:text-amber-400">
                  ⚠️ {option.tradeoffs.join(" • ")}
                </div>
              )}
            </>
          )}

          {/* Booking button for Klook */}
          {bookingUrl && (
            <a
              href={bookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="mt-2 inline-flex items-center gap-1 px-2 py-1 bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 rounded-lg text-xs font-medium hover:bg-orange-200"
            >
              <ExternalLink className="w-3 h-3" />
              Book on Klook
            </a>
          )}
        </div>

        {/* Score badge */}
        <div
          className={cn(
            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold",
            option.score >= 90
              ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
              : option.score >= 80
              ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
              : "bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
          )}
        >
          {option.score}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================
// Time Slot Section
// ============================================

function TimeSlotSection({
  slot,
  selectedOptions,
  onSelectOption,
}: {
  slot: SlotWithOptions;
  selectedOptions: Record<string, string>;
  onSelectOption: (slotId: string, optionId: string) => void;
}) {
  const [showAlternatives, setShowAlternatives] = useState(false);
  const slotIcon = slotIcons[slot.slotType] || "📍";

  const selectedOptionId =
    selectedOptions[slot.slotId] ||
    slot.selectedOptionId ||
    slot.options[0]?.id ||
    null;
  const selectedOption = slot.options.find((o) => o.id === selectedOptionId);
  const alternativeOptions = slot.options.filter(
    (o) => o.id !== selectedOptionId
  );

  return (
    <div className="relative">
      {/* Commute info */}
      {slot.commuteFromPrevious && (
        <div className="flex items-center gap-2 mb-2 ml-6 text-xs text-gray-500 dark:text-gray-400">
          <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 dark:bg-gray-700 rounded-lg">
            <CommuteMethodIcon method={slot.commuteFromPrevious.method} />
            <span>{formatDuration(slot.commuteFromPrevious.duration)}</span>
          </div>
          <span className="text-gray-400 truncate">
            {slot.commuteFromPrevious.instructions}
          </span>
        </div>
      )}

      {/* Slot header */}
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">{slotIcon}</span>
        <div>
          <h4 className="text-sm font-medium text-gray-900 dark:text-white capitalize">
            {slot.slotType}
          </h4>
          <p className="text-xs text-gray-500">
            {slot.timeRange.start} - {slot.timeRange.end}
          </p>
        </div>
      </div>

      {/* Selected activity */}
      {selectedOption && (
        <div className="ml-7">
          <ActivityOptionCard
            option={selectedOption}
            isSelected={true}
            onSelect={() => {}}
            showDetails={false}
          />

          {/* Show alternatives toggle */}
          {alternativeOptions.length > 0 && (
            <button
              onClick={() => setShowAlternatives(!showAlternatives)}
              className="flex items-center gap-1 mt-2 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
            >
              {showAlternatives ? (
                <>
                  <ChevronUp className="w-3 h-3" />
                  Hide alternatives
                </>
              ) : (
                <>
                  <ChevronDown className="w-3 h-3" />
                  Show {alternativeOptions.length} alternative
                  {alternativeOptions.length > 1 ? "s" : ""}
                </>
              )}
            </button>
          )}

          {/* Alternative options */}
          <AnimatePresence>
            {showAlternatives && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="mt-2 space-y-2 overflow-hidden"
              >
                {alternativeOptions.map((option) => (
                  <ActivityOptionCard
                    key={option.id}
                    option={option}
                    isSelected={false}
                    onSelect={() => onSelectOption(slot.slotId, option.id)}
                    showDetails={true}
                  />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Timeline connector */}
      <div className="absolute left-[14px] top-8 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />
    </div>
  );
}

// ============================================
// Day View Component
// ============================================

function DayView({
  day,
  selectedOptions,
  onSelectOption,
}: {
  day: DayWithOptions;
  selectedOptions: Record<string, string>;
  onSelectOption: (slotId: string, optionId: string) => void;
}) {
  return (
    <div className="space-y-4">
      {/* Day header */}
      <div className="text-center pb-3 border-b border-gray-200 dark:border-gray-700">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded-full text-sm font-medium mb-2">
          📍 {day.city}
        </div>
        <h3 className="font-semibold text-gray-900 dark:text-white">
          {day.title}
        </h3>
        <p className="text-xs text-gray-500 mt-1">
          {new Date(day.date).toLocaleDateString("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            year: "numeric",
          })}
        </p>
      </div>

      {/* City transition (if applicable) */}
      {day.cityTransition && (
        <CityTransitionCard transition={day.cityTransition} />
      )}

      {/* Time slots */}
      <div className="space-y-6">
        {day.slots.map((slot) => (
          <TimeSlotSection
            key={slot.slotId}
            slot={slot}
            selectedOptions={selectedOptions}
            onSelectOption={onSelectOption}
          />
        ))}
      </div>

      {/* Accommodation */}
      {day.accommodation && (
        <div className="mt-4 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
          <div className="flex items-center gap-2 text-sm">
            <span>🏨</span>
            <span className="font-medium text-gray-900 dark:text-white">
              {day.accommodation.name}
            </span>
            {day.accommodation.rating && (
              <span className="flex items-center gap-1 text-xs text-gray-500">
                <Star className="w-3 h-3 text-yellow-500 fill-current" />
                {day.accommodation.rating}
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500 mt-1 ml-6">
            {day.accommodation.neighborhood}
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================
// Budget Panel
// ============================================

function BudgetPanel({ itinerary }: { itinerary: StructuredItineraryData }) {
  const budget = itinerary.estimatedBudget;
  if (!budget) return null;

  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
      <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2 mb-3">
        <Wallet className="w-4 h-4 text-purple-500" />
        Estimated Budget
      </h4>

      <div className="mb-3">
        <p className="text-2xl font-bold text-gray-900 dark:text-white">
          {formatCurrency(budget.total.min, budget.currency)} -{" "}
          {formatCurrency(budget.total.max, budget.currency)}
        </p>
        <p className="text-xs text-gray-500">
          Total for {itinerary.days.length} days
        </p>
      </div>

      {budget.breakdown && (
        <div className="space-y-2">
          {Object.entries(budget.breakdown).map(([category, range]) => (
            <div
              key={category}
              className="flex items-center justify-between text-sm"
            >
              <span className="text-gray-600 dark:text-gray-400 capitalize">
                {category}
              </span>
              <span className="text-gray-900 dark:text-white">
                {formatCurrency(range.min, budget.currency)} -{" "}
                {formatCurrency(range.max, budget.currency)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// Tips Panel
// ============================================

function TipsPanel({ tips }: { tips: string[] }) {
  const [showAll, setShowAll] = useState(false);
  const displayedTips = showAll ? tips : tips.slice(0, 3);

  return (
    <div className="p-4 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
      <h4 className="font-medium text-amber-800 dark:text-amber-200 flex items-center gap-2 mb-3">
        <Lightbulb className="w-4 h-4" />
        Travel Tips
      </h4>

      <ul className="space-y-2">
        {displayedTips.map((tip, index) => (
          <li
            key={index}
            className="text-sm text-amber-700 dark:text-amber-300 flex items-start gap-2"
          >
            <span className="text-amber-500 mt-0.5">•</span>
            {tip}
          </li>
        ))}
      </ul>

      {tips.length > 3 && (
        <button
          onClick={() => setShowAll(!showAll)}
          className="mt-2 text-xs text-amber-600 dark:text-amber-400 hover:text-amber-700"
        >
          {showAll ? "Show less" : `Show ${tips.length - 3} more tips`}
        </button>
      )}
    </div>
  );
}

// ============================================
// Configuration Panel
// ============================================

function ConfigPanel({
  config,
  onChange,
  onGenerate,
  isLoading,
  availableCities,
}: {
  config: ItineraryConfig;
  onChange: (config: ItineraryConfig) => void;
  onGenerate: () => void;
  isLoading: boolean;
  availableCities: string[];
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="border-b border-gray-200 dark:border-gray-700">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full p-3 flex items-center justify-between text-sm text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-800"
      >
        <span className="flex items-center gap-2">
          <Settings2 className="w-4 h-4" />
          Configure Trip
        </span>
        {isOpen ? (
          <ChevronUp className="w-4 h-4" />
        ) : (
          <ChevronDown className="w-4 h-4" />
        )}
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="p-4 space-y-4 bg-gray-50 dark:bg-gray-800/50">
              {/* Cities */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Cities (in order)
                </label>
                <div className="flex flex-wrap gap-1">
                  {availableCities.map((city) => (
                    <button
                      key={city}
                      onClick={() => {
                        const cities = config.cities.includes(city)
                          ? config.cities.filter((c) => c !== city)
                          : [...config.cities, city];
                        onChange({ ...config, cities });
                      }}
                      className={cn(
                        "px-2 py-1 text-xs rounded-full transition-colors capitalize",
                        config.cities.includes(city)
                          ? "bg-purple-500 text-white"
                          : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                      )}
                    >
                      {city}
                    </button>
                  ))}
                </div>
                {config.cities.length > 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Order: {config.cities.join(" → ")}
                  </p>
                )}
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Start Date
                </label>
                <input
                  type="date"
                  value={config.startDate}
                  onChange={(e) =>
                    onChange({ ...config, startDate: e.target.value })
                  }
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                />
              </div>

              {/* Total Days */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Total Days
                </label>
                <input
                  type="number"
                  min={1}
                  max={14}
                  value={config.totalDays || ""}
                  onChange={(e) =>
                    onChange({
                      ...config,
                      totalDays: parseInt(e.target.value) || undefined,
                    })
                  }
                  placeholder="Auto"
                  className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
                />
              </div>

              {/* Pace */}
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Pace
                </label>
                <div className="flex gap-2">
                  {(["relaxed", "moderate", "packed"] as const).map((pace) => (
                    <button
                      key={pace}
                      onClick={() => onChange({ ...config, pace })}
                      className={cn(
                        "flex-1 px-3 py-2 text-xs rounded-lg transition-colors capitalize",
                        config.pace === pace
                          ? "bg-purple-500 text-white"
                          : "bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400"
                      )}
                    >
                      {pace}
                    </button>
                  ))}
                </div>
              </div>

              {/* Klook toggle */}
              <div className="flex items-center justify-between">
                <span className="text-xs text-gray-700 dark:text-gray-300">
                  Include Klook Experiences
                </span>
                <button
                  onClick={() =>
                    onChange({
                      ...config,
                      includeKlookExperiences: !config.includeKlookExperiences,
                    })
                  }
                  className={cn(
                    "w-10 h-6 rounded-full transition-colors",
                    config.includeKlookExperiences
                      ? "bg-purple-500"
                      : "bg-gray-300 dark:bg-gray-600"
                  )}
                >
                  <div
                    className={cn(
                      "w-4 h-4 bg-white rounded-full transition-transform mx-1",
                      config.includeKlookExperiences
                        ? "translate-x-4"
                        : "translate-x-0"
                    )}
                  />
                </button>
              </div>

              {/* Generate button */}
              <button
                onClick={onGenerate}
                disabled={isLoading || config.cities.length === 0}
                className="w-full py-2 px-4 bg-purple-500 text-white rounded-lg font-medium text-sm disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Generating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="w-4 h-4" />
                    Generate Itinerary
                  </>
                )}
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// Main Component
// ============================================

export function JapanItineraryView() {
  const [itinerary, setItinerary] = useState<StructuredItineraryData | null>(
    null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string>
  >({});
  const [availableCities, setAvailableCities] = useState<string[]>([]);

  const [config, setConfig] = useState<ItineraryConfig>({
    cities: ["Tokyo", "Kyoto", "Osaka"],
    startDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
      .toISOString()
      .split("T")[0], // 30 days from now
    totalDays: 7,
    pace: "moderate",
    includeKlookExperiences: true,
  });

  // Fetch available cities on mount
  useEffect(() => {
    fetch("/api/japan-itinerary")
      .then((res) => res.json())
      .then((data) => {
        if (data.success && data.data.availableCities) {
          setAvailableCities(data.data.availableCities);
        }
      })
      .catch(console.error);
  }, []);

  // Generate itinerary
  const generateItinerary = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/japan-itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(config),
      });

      const data: ApiResponse = await response.json();

      if (!data.success || !data.data) {
        throw new Error(data.error || "Failed to generate itinerary");
      }

      setItinerary(data.data.itinerary);
      setSelectedDayIndex(0);
      setSelectedOptions({});
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to generate itinerary"
      );
    } finally {
      setIsLoading(false);
    }
  }, [config]);

  // Generate on initial load
  useEffect(() => {
    if (availableCities.length > 0 && !itinerary && !isLoading) {
      generateItinerary();
    }
  }, [availableCities, itinerary, isLoading, generateItinerary]);

  const handleSelectOption = (slotId: string, optionId: string) => {
    setSelectedOptions((prev) => ({
      ...prev,
      [slotId]: optionId,
    }));
  };

  const currentDay = itinerary?.days[selectedDayIndex];

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          {itinerary?.destination || "Japan"} Trip
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {itinerary
            ? `${itinerary.days
                .map((d) => d.city)
                .filter((v, i, a) => a.indexOf(v) === i)
                .join(" → ")} • ${itinerary.days.length} days`
            : "Configure your trip below"}
        </p>
      </div>

      {/* Config Panel */}
      <ConfigPanel
        config={config}
        onChange={setConfig}
        onGenerate={generateItinerary}
        isLoading={isLoading}
        availableCities={availableCities}
      />

      {/* Loading state */}
      {isLoading && (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin text-purple-500 mx-auto mb-2" />
            <p className="text-sm text-gray-500">
              Generating your itinerary...
            </p>
          </div>
        </div>
      )}

      {/* Error state */}
      {error && !isLoading && (
        <div className="flex-1 flex items-center justify-center p-4">
          <div className="text-center">
            <p className="text-red-500 mb-2">{error}</p>
            <button
              onClick={generateItinerary}
              className="px-4 py-2 bg-purple-500 text-white rounded-lg text-sm"
            >
              Try Again
            </button>
          </div>
        </div>
      )}

      {/* Itinerary content */}
      {itinerary && !isLoading && (
        <>
          {/* Day Selector */}
          <div className="flex-shrink-0 p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setSelectedDayIndex(Math.max(0, selectedDayIndex - 1))
                }
                disabled={selectedDayIndex === 0}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>

              <div className="flex-1 flex gap-1 overflow-x-auto py-1">
                {itinerary.days.map((day, index) => (
                  <button
                    key={day.date}
                    onClick={() => setSelectedDayIndex(index)}
                    className={cn(
                      "flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                      index === selectedDayIndex
                        ? "bg-purple-500 text-white"
                        : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                    )}
                  >
                    <span className="block">Day {day.dayNumber}</span>
                    <span className="block text-[10px] opacity-80">
                      {day.city}
                    </span>
                  </button>
                ))}
              </div>

              <button
                onClick={() =>
                  setSelectedDayIndex(
                    Math.min(itinerary.days.length - 1, selectedDayIndex + 1)
                  )
                }
                disabled={selectedDayIndex === itinerary.days.length - 1}
                className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Main Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {currentDay && (
              <DayView
                day={currentDay}
                selectedOptions={selectedOptions}
                onSelectOption={handleSelectOption}
              />
            )}

            {/* Budget section (show on last day) */}
            {selectedDayIndex === itinerary.days.length - 1 && (
              <BudgetPanel itinerary={itinerary} />
            )}

            {/* Tips section */}
            {itinerary.generalTips && itinerary.generalTips.length > 0 && (
              <TipsPanel tips={itinerary.generalTips} />
            )}
          </div>
        </>
      )}
    </div>
  );
}
