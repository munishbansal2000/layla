"use client";

import { motion } from "framer-motion";
import { Sparkles, Star, ExternalLink } from "lucide-react";
import type { ParsedItinerary, ParsedActivity } from "@/lib/itinerary-parser";
import { getDefaultTimeForSlot, getSlotLabel } from "@/lib/itinerary-parser";
import type { ViatorActivitySuggestion } from "@/lib/trip-planning";
import type { TravelerSettings, PreferenceSettings } from "./types";

interface ParsedItineraryViewProps {
  itinerary: ParsedItinerary;
  selectedDayIndex: number;
  viatorActivities: ViatorActivitySuggestion[];
  travelerSettings: TravelerSettings;
  preferences: PreferenceSettings;
}

export function ParsedItineraryView({
  itinerary,
  selectedDayIndex,
  viatorActivities,
  travelerSettings,
}: ParsedItineraryViewProps) {
  const day = itinerary.days[selectedDayIndex];

  if (!day) {
    return (
      <div className="text-center text-gray-500 py-8">
        <p>No activities planned for this day yet.</p>
      </div>
    );
  }

  // Group activities by time slot
  const slotOrder: ParsedActivity["timeSlot"][] = [
    "morning",
    "lunch",
    "afternoon",
    "dinner",
    "evening",
  ];

  const activityBySlot = new Map<string, ParsedActivity[]>();
  for (const slot of slotOrder) {
    activityBySlot.set(slot, []);
  }

  for (const activity of day.activities) {
    const existing = activityBySlot.get(activity.timeSlot) || [];
    existing.push(activity);
    activityBySlot.set(activity.timeSlot, existing);
  }

  // Get icon for slot type
  const getSlotIcon = (slot: ParsedActivity["timeSlot"]) => {
    switch (slot) {
      case "morning":
        return "🌅";
      case "lunch":
        return "🍽️";
      case "afternoon":
        return "☀️";
      case "dinner":
        return "🌙";
      case "evening":
        return "✨";
      default:
        return "📍";
    }
  };

  // Get activity type icon
  const getActivityTypeIcon = (type: ParsedActivity["type"]) => {
    switch (type) {
      case "restaurant":
        return "🍴";
      case "attraction":
        return "🏛️";
      case "activity":
        return "🎭";
      case "transport":
        return "🚗";
      default:
        return "📍";
    }
  };

  // Find matching Viator activity for a parsed activity
  const findViatorMatch = (
    activity: ParsedActivity
  ): ViatorActivitySuggestion | undefined => {
    const activityName = activity.name.toLowerCase();
    return viatorActivities.find((v) => {
      const viatorName = v.name.toLowerCase();
      return (
        viatorName.includes(activityName) ||
        activityName.includes(viatorName) ||
        activityName
          .split(" ")
          .some((word) => word.length > 3 && viatorName.includes(word))
      );
    });
  };

  return (
    <div className="space-y-4">
      {/* Day Header */}
      <div className="text-center pb-2 border-b border-gray-200 dark:border-gray-700">
        <h3 className="font-semibold text-gray-900 dark:text-white">
          {day.title}
        </h3>
        <p className="text-xs text-gray-500">Day {day.dayNumber}</p>
      </div>

      {/* Time Slots */}
      {slotOrder.map((slot) => {
        const activities = activityBySlot.get(slot) || [];
        const times = getDefaultTimeForSlot(slot);

        if (
          activities.length === 0 &&
          slot !== "morning" &&
          slot !== "afternoon"
        ) {
          return null;
        }

        return (
          <div key={slot} className="relative">
            {/* Time Slot Header */}
            <div className="flex items-center gap-2 mb-2">
              <span className="text-lg">{getSlotIcon(slot)}</span>
              <div>
                <h4 className="text-sm font-medium text-gray-900 dark:text-white">
                  {getSlotLabel(slot)}
                </h4>
                <p className="text-xs text-gray-500">
                  {times.start} - {times.end}
                </p>
              </div>
            </div>

            {/* Activities in this slot */}
            {activities.length > 0 ? (
              <div className="ml-8 space-y-2">
                {activities.map((activity) => {
                  const viatorMatch = findViatorMatch(activity);

                  return (
                    <motion.div
                      key={activity.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      className="p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm"
                    >
                      <div className="flex items-start gap-2">
                        <span className="text-lg flex-shrink-0">
                          {getActivityTypeIcon(activity.type)}
                        </span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1">
                            <h5 className="text-sm font-medium text-gray-900 dark:text-white">
                              {activity.name}
                            </h5>
                            {travelerSettings.children > 0 && (
                              <span title="Family-friendly" className="text-xs">
                                👨‍👩‍👧
                              </span>
                            )}
                          </div>
                          {activity.description && (
                            <p className="text-xs text-gray-500 mt-0.5 line-clamp-2">
                              {activity.description}
                            </p>
                          )}

                          {/* Viator Book Button */}
                          {viatorMatch && (
                            <div className="mt-2 flex items-center gap-2">
                              <a
                                href={viatorMatch.bookingUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 px-2 py-1 bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-lg text-xs font-medium hover:bg-purple-100 dark:hover:bg-purple-900/50 transition-colors"
                              >
                                <ExternalLink className="w-3 h-3" />
                                Book on Viator
                              </a>
                              {viatorMatch.price && (
                                <span className="text-xs text-gray-500">
                                  from ${viatorMatch.price.amount}
                                </span>
                              )}
                              {viatorMatch.rating && (
                                <span className="flex items-center gap-0.5 text-xs text-yellow-600">
                                  <Star className="w-3 h-3 fill-current" />
                                  {viatorMatch.rating.toFixed(1)}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            ) : (
              <div className="ml-8 p-3 border-2 border-dashed border-gray-200 dark:border-gray-700 rounded-xl text-center">
                <p className="text-xs text-gray-400">Free time</p>
              </div>
            )}

            {/* Timeline connector */}
            {slot !== "evening" && (
              <div className="absolute left-[18px] top-10 bottom-0 w-0.5 bg-gray-200 dark:bg-gray-700" />
            )}
          </div>
        );
      })}

      {/* Tips Section */}
      {itinerary.tips.length > 0 && (
        <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-purple-500" />
            Insider Tips
          </h4>
          <ul className="space-y-1">
            {itinerary.tips.slice(0, 3).map((tip, index) => (
              <li
                key={index}
                className="text-xs text-gray-600 dark:text-gray-400 flex items-start gap-2"
              >
                <span className="text-purple-500">•</span>
                {tip}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
