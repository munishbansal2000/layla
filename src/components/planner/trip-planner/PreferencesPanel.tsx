"use client";

import { DollarSign, Footprints, Sparkles, Umbrella } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PreferenceSettings } from "./types";
import type {
  PaceMode,
  BudgetMode,
  WalkingTolerance,
} from "@/types/activity-suggestion";

interface PreferencesPanelProps {
  preferences: PreferenceSettings;
  onChange: (preferences: PreferenceSettings) => void;
}

export function PreferencesPanel({
  preferences,
  onChange,
}: PreferencesPanelProps) {
  const paceModes: { value: PaceMode; label: string; description: string }[] = [
    { value: "relaxed", label: "Relaxed", description: "2-3 activities/day" },
    { value: "normal", label: "Normal", description: "3-4 activities/day" },
    {
      value: "ambitious",
      label: "Ambitious",
      description: "5+ activities/day",
    },
  ];

  const budgetModes: {
    value: BudgetMode;
    label: string;
    icon: React.ReactNode;
  }[] = [
    {
      value: "free-first",
      label: "Free First",
      icon: <DollarSign className="w-3 h-3" />,
    },
    {
      value: "moderate",
      label: "Moderate",
      icon: <DollarSign className="w-3 h-3" />,
    },
    {
      value: "splurge-once-a-day",
      label: "Splurge Daily",
      icon: <Sparkles className="w-3 h-3" />,
    },
  ];

  const walkingLevels: {
    value: WalkingTolerance;
    label: string;
    description: string;
  }[] = [
    { value: "low", label: "Low", description: "<30 min walks" },
    { value: "medium", label: "Medium", description: "30-60 min walks" },
    { value: "high", label: "High", description: "60+ min walks" },
  ];

  return (
    <div className="space-y-4">
      {/* Pace Mode */}
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">
          Trip Pace
        </label>
        <div className="grid grid-cols-3 gap-2">
          {paceModes.map((mode) => (
            <button
              key={mode.value}
              onClick={() => onChange({ ...preferences, paceMode: mode.value })}
              className={cn(
                "p-2 rounded-lg text-center transition-colors",
                preferences.paceMode === mode.value
                  ? "bg-purple-500 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
              )}
            >
              <span className="text-xs font-medium block">{mode.label}</span>
              <span className="text-[10px] opacity-75">{mode.description}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Budget Mode */}
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">
          Budget Strategy
        </label>
        <div className="flex flex-wrap gap-2">
          {budgetModes.map((mode) => (
            <button
              key={mode.value}
              onClick={() =>
                onChange({ ...preferences, budgetMode: mode.value })
              }
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors",
                preferences.budgetMode === mode.value
                  ? "bg-purple-500 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
              )}
            >
              {mode.icon}
              {mode.label}
            </button>
          ))}
        </div>
      </div>

      {/* Walking Tolerance */}
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 flex items-center gap-1">
          <Footprints className="w-3 h-3" />
          Walking Tolerance
        </label>
        <div className="grid grid-cols-3 gap-2">
          {walkingLevels.map((level) => (
            <button
              key={level.value}
              onClick={() =>
                onChange({ ...preferences, walkingTolerance: level.value })
              }
              className={cn(
                "p-2 rounded-lg text-center transition-colors",
                preferences.walkingTolerance === level.value
                  ? "bg-purple-500 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
              )}
            >
              <span className="text-xs font-medium block">{level.label}</span>
              <span className="text-[10px] opacity-75">
                {level.description}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Rain Plan Toggle */}
      <label className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        <div className="flex items-center gap-2">
          <Umbrella className="w-4 h-4 text-blue-500" />
          <span className="text-xs text-gray-700 dark:text-gray-300">
            Enable rain plan alternatives
          </span>
        </div>
        <input
          type="checkbox"
          checked={preferences.rainPlanEnabled}
          onChange={(e) =>
            onChange({ ...preferences, rainPlanEnabled: e.target.checked })
          }
          className="rounded text-purple-500"
        />
      </label>
    </div>
  );
}
