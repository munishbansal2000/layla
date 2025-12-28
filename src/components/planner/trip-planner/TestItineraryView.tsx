"use client";

import { useState } from "react";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  TestItinerary,
  TestItineraryDay,
  TestItinerarySlot,
  TestItineraryOption,
  TestItineraryCityTransition,
} from "@/types/test-itinerary";

interface TestItineraryViewProps {
  itinerary: TestItinerary;
}

// Slot type icons
const slotIcons: Record<string, string> = {
  morning: "🌅",
  lunch: "🍽️",
  afternoon: "☀️",
  dinner: "🌙",
  evening: "✨",
};

// Category icons
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

// Commute method icons
function CommuteMethodIcon({ method }: { method: string }) {
  switch (method) {
    case "walk":
      return <Footprints className="w-4 h-4" />;
    case "transit":
      return <Train className="w-4 h-4" />;
    case "drive":
      return <Car className="w-4 h-4" />;
    default:
      return <Train className="w-4 h-4" />;
  }
}

// Format duration to human readable
function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
}

// Format currency
function formatCurrency(amount: number, currency: string): string {
  if (currency === "JPY") {
    return `¥${amount.toLocaleString()}`;
  }
  return `${currency} ${amount.toLocaleString()}`;
}

// City Transition Card
function CityTransitionCard({
  transition,
}: {
  transition: TestItineraryCityTransition;
}) {
  return (
    <div className="mb-4 p-4 bg-gradient-to-r from-purple-500 to-indigo-500 rounded-xl text-white">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-white/20 rounded-lg">
          <Train className="w-5 h-5" />
        </div>
        <div className="flex-1">
          <h4 className="font-semibold">{transition.trainName}</h4>
          <p className="text-sm text-white/80">
            {transition.departureStation} → {transition.arrivalStation}
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

// Activity Option Card
function ActivityOptionCard({
  option,
  isSelected,
  onSelect,
  showAlternatives,
}: {
  option: TestItineraryOption;
  isSelected: boolean;
  onSelect: () => void;
  showAlternatives: boolean;
}) {
  const { activity } = option;
  const categoryIcon = categoryIcons[activity.category] || "📍";

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
            {activity.place.rating && (
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
          <div className="flex items-center gap-1 mt-1 text-xs text-gray-400">
            <MapPin className="w-3 h-3" />
            {activity.place.neighborhood}
          </div>

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

          {/* Match reasons & tradeoffs (only if showing alternatives) */}
          {showAlternatives && (
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

// Time Slot Section
function TimeSlotSection({
  slot,
  selectedOptions,
  onSelectOption,
}: {
  slot: TestItinerarySlot;
  selectedOptions: Record<string, string>;
  onSelectOption: (slotId: string, optionId: string) => void;
}) {
  const [showAlternatives, setShowAlternatives] = useState(false);
  const slotIcon = slotIcons[slot.slotType] || "📍";

  const selectedOptionId =
    selectedOptions[slot.slotId] || slot.options[0]?.id || null;
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
            showAlternatives={false}
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
                    showAlternatives={true}
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

// Day View Component
function DayView({
  day,
  selectedOptions,
  onSelectOption,
}: {
  day: TestItineraryDay;
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
    </div>
  );
}

// Budget Panel
function BudgetPanel({ itinerary }: { itinerary: TestItinerary }) {
  const { estimatedBudget } = itinerary;

  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl">
      <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2 mb-3">
        <Wallet className="w-4 h-4 text-purple-500" />
        Estimated Budget
      </h4>

      <div className="mb-3">
        <p className="text-2xl font-bold text-gray-900 dark:text-white">
          {formatCurrency(estimatedBudget.total.min, estimatedBudget.currency)}{" "}
          -{" "}
          {formatCurrency(estimatedBudget.total.max, estimatedBudget.currency)}
        </p>
        <p className="text-xs text-gray-500">
          Total for {itinerary.days.length} days
        </p>
      </div>

      <div className="space-y-2">
        {Object.entries(estimatedBudget.breakdown).map(([category, range]) => (
          <div
            key={category}
            className="flex items-center justify-between text-sm"
          >
            <span className="text-gray-600 dark:text-gray-400 capitalize">
              {category}
            </span>
            <span className="text-gray-900 dark:text-white">
              {formatCurrency(range.min, estimatedBudget.currency)} -{" "}
              {formatCurrency(range.max, estimatedBudget.currency)}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Tips Panel
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

// Main Component
export function TestItineraryView({ itinerary }: TestItineraryViewProps) {
  const [selectedDayIndex, setSelectedDayIndex] = useState(0);
  const [selectedOptions, setSelectedOptions] = useState<
    Record<string, string>
  >({});

  const currentDay = itinerary.days[selectedDayIndex];

  const handleSelectOption = (slotId: string, optionId: string) => {
    setSelectedOptions((prev) => ({
      ...prev,
      [slotId]: optionId,
    }));
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white">
          {itinerary.destination} Trip
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          {itinerary.cities.join(" → ")} • {itinerary.days.length} days
        </p>
      </div>

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
                <span className="block text-[10px] opacity-80">{day.city}</span>
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
        {itinerary.generalTips.length > 0 && (
          <TipsPanel tips={itinerary.generalTips} />
        )}
      </div>
    </div>
  );
}
