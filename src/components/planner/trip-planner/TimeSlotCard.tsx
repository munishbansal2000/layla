"use client";

import { motion, AnimatePresence } from "framer-motion";
import { Plus, Check, Star, RefreshCw, ExternalLink } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ViatorActivitySuggestion, TimeSlot } from "@/lib/trip-planning";
import type {
  TravelerSettings,
  PreferenceSettings,
  SlotActivity,
} from "./types";

// ============================================
// Activity Suggestion Card
// ============================================

interface ActivitySuggestionCardProps {
  activity: ViatorActivitySuggestion;
  travelerSettings: TravelerSettings;
  preferences: PreferenceSettings;
  onAdd: () => void;
}

export function ActivitySuggestionCard({
  activity,
  travelerSettings,
  preferences,
  onAdd,
}: ActivitySuggestionCardProps) {
  const isFamilyFriendly = activity.tags?.some(
    (t) => t.toLowerCase().includes("family") || t.toLowerCase().includes("kid")
  );
  const isFree = activity.price?.amount === 0;

  return (
    <div className="flex gap-2 p-2 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
      <img
        src={activity.imageUrl}
        alt={activity.name}
        className="w-12 h-12 rounded-lg object-cover flex-shrink-0"
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <h5 className="text-xs font-medium text-gray-900 dark:text-white truncate">
            {activity.name}
          </h5>
          {travelerSettings.children > 0 && isFamilyFriendly && (
            <span title="Family-friendly" className="text-xs">
              👨‍👩‍👧
            </span>
          )}
          {preferences.budgetMode === "free-first" && isFree && (
            <span className="text-[10px] bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 px-1 rounded">
              FREE
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 mt-0.5">
          {activity.rating && (
            <span className="flex items-center gap-0.5 text-xs text-yellow-600">
              <Star className="w-3 h-3 fill-current" />
              {activity.rating.toFixed(1)}
            </span>
          )}
          <span className="text-xs text-gray-500">
            {Math.round(activity.duration / 60)}h
          </span>
          <span className="text-xs font-medium text-purple-600">
            ${activity.price.amount}
          </span>
          {activity.matchScore && (
            <span className="text-[10px] text-gray-400">
              {activity.matchScore}% match
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1">
        <a
          href={activity.bookingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1.5 text-gray-400 hover:text-purple-500 transition-colors"
          onClick={(e) => e.stopPropagation()}
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onAdd();
          }}
          className="p-1.5 text-purple-500 hover:bg-purple-100 dark:hover:bg-purple-900/30 rounded-lg transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}

// ============================================
// Time Slot Card
// ============================================

interface TimeSlotCardProps {
  slot: {
    id: string;
    timeSlot: TimeSlot;
    isPlaceholder: boolean;
    activity?: SlotActivity;
  };
  isSelected: boolean;
  onSelect: () => void;
  suggestions: ViatorActivitySuggestion[];
  travelerSettings: TravelerSettings;
  preferences: PreferenceSettings;
  onAddActivity: (activity: ViatorActivitySuggestion) => void;
  onSwap?: (slotId: string, activity: ViatorActivitySuggestion) => void;
  canSwap?: boolean;
}

export function TimeSlotCard({
  slot,
  isSelected,
  onSelect,
  suggestions,
  travelerSettings,
  preferences,
  onAddActivity,
  onSwap,
  canSwap = false,
}: TimeSlotCardProps) {
  const { timeSlot, isPlaceholder, activity } = slot;

  return (
    <div className="space-y-2">
      {/* Time Slot Header */}
      <div
        onClick={onSelect}
        className={cn(
          "p-3 rounded-xl border-2 cursor-pointer transition-all",
          isPlaceholder
            ? "border-dashed border-gray-300 dark:border-gray-600 hover:border-purple-400"
            : "border-solid border-purple-500 bg-purple-50 dark:bg-purple-900/20"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="text-xs font-mono text-gray-500 dark:text-gray-400">
              {timeSlot.startTime} - {timeSlot.endTime}
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {timeSlot.label}
            </span>
          </div>

          {isPlaceholder ? (
            <Plus className="w-4 h-4 text-gray-400" />
          ) : (
            <Check className="w-4 h-4 text-purple-500" />
          )}
        </div>

        {/* Activity Card (if assigned) */}
        {activity && (
          <div className="mt-2 flex gap-3">
            <img
              src={activity.imageUrl}
              alt={activity.name}
              className="w-16 h-16 rounded-lg object-cover"
            />
            <div className="flex-1 min-w-0">
              <h4 className="text-sm font-medium text-gray-900 dark:text-white truncate">
                {activity.name}
              </h4>
              <p className="text-xs text-gray-500 line-clamp-2">
                {activity.description}
              </p>
              <div className="flex items-center gap-2 mt-1">
                {activity.rating && (
                  <span className="flex items-center gap-0.5 text-xs text-yellow-600">
                    <Star className="w-3 h-3 fill-current" />
                    {activity.rating.toFixed(1)}
                  </span>
                )}
                {activity.price && (
                  <span className="text-xs text-gray-500">
                    From ${activity.price.amount}
                  </span>
                )}
                <span className="text-xs text-gray-400">
                  {Math.round(activity.duration / 60)}h
                </span>
              </div>
            </div>
            {/* Swap Button */}
            {canSwap && onSwap && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onSwap(slot.id, {
                    id: activity.id,
                    name: activity.name,
                    description: activity.description,
                    duration: activity.duration,
                    imageUrl: activity.imageUrl,
                    rating: activity.rating,
                    reviewCount: activity.reviewCount,
                    price: activity.price || { amount: 0, currency: "USD" },
                    bookingUrl: activity.bookingUrl || "",
                    viatorProductCode: activity.viatorProductCode || "",
                    tags: activity.tags || [],
                    matchScore: activity.matchScore,
                    bestTimeOfDay: activity.bestTimeOfDay as
                      | "morning"
                      | "afternoon"
                      | "evening"
                      | "flexible"
                      | undefined,
                  });
                }}
                className="flex-shrink-0 p-2 text-gray-400 hover:text-purple-500 hover:bg-purple-50 dark:hover:bg-purple-900/30 rounded-lg transition-colors"
                title="Find alternatives"
              >
                <RefreshCw className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Suggestions Dropdown */}
      <AnimatePresence>
        {isSelected && isPlaceholder && suggestions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="p-2 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg">
              <p className="text-xs text-gray-500 mb-2 px-1">
                Suggested activities for {timeSlot.label.toLowerCase()}:
              </p>
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {suggestions.map((activity) => (
                  <ActivitySuggestionCard
                    key={activity.id}
                    activity={activity}
                    travelerSettings={travelerSettings}
                    preferences={preferences}
                    onAdd={() => onAddActivity(activity)}
                  />
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
