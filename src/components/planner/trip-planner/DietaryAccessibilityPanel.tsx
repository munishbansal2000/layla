"use client";

import { Accessibility } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PreferenceSettings } from "./types";
import type { DietaryOption } from "@/types/activity-suggestion";

interface DietaryAccessibilityPanelProps {
  preferences: PreferenceSettings;
  onChange: (preferences: PreferenceSettings) => void;
}

export function DietaryAccessibilityPanel({
  preferences,
  onChange,
}: DietaryAccessibilityPanelProps) {
  const dietaryOptions: { value: DietaryOption; label: string }[] = [
    { value: "vegetarian", label: "Vegetarian" },
    { value: "vegan", label: "Vegan" },
    { value: "gluten-free", label: "Gluten-Free" },
    { value: "halal", label: "Halal" },
    { value: "kosher", label: "Kosher" },
    { value: "no-pork", label: "No Pork" },
    { value: "nut-free", label: "Nut-Free" },
    { value: "dairy-free", label: "Dairy-Free" },
  ];

  const toggleDietary = (option: DietaryOption) => {
    const current = preferences.dietaryOptions;
    const newOptions = current.includes(option)
      ? current.filter((o) => o !== option)
      : [...current, option];
    onChange({ ...preferences, dietaryOptions: newOptions });
  };

  return (
    <div className="space-y-4">
      {/* Dietary Restrictions */}
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">
          Dietary Restrictions
        </label>
        <div className="flex flex-wrap gap-2">
          {dietaryOptions.map((option) => (
            <button
              key={option.value}
              onClick={() => toggleDietary(option.value)}
              className={cn(
                "px-2.5 py-1 rounded-full text-xs transition-colors",
                preferences.dietaryOptions.includes(option.value)
                  ? "bg-green-500 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
              )}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {/* Accessibility */}
      <label className="flex items-center justify-between p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
        <div className="flex items-center gap-2">
          <Accessibility className="w-4 h-4 text-purple-500" />
          <span className="text-xs text-gray-700 dark:text-gray-300">
            Needs wheelchair accessibility
          </span>
        </div>
        <input
          type="checkbox"
          checked={preferences.needsAccessibility}
          onChange={(e) =>
            onChange({ ...preferences, needsAccessibility: e.target.checked })
          }
          className="rounded text-purple-500"
        />
      </label>
    </div>
  );
}
