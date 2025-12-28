"use client";

import { Users, Heart, Baby } from "lucide-react";
import { cn } from "@/lib/utils";
import type { TravelerSettings } from "./types";
import type { TripMode } from "@/types/activity-suggestion";

interface TravelerSettingsPanelProps {
  settings: TravelerSettings;
  onChange: (settings: TravelerSettings) => void;
}

export function TravelerSettingsPanel({
  settings,
  onChange,
}: TravelerSettingsPanelProps) {
  const tripModes: { value: TripMode; label: string; icon: React.ReactNode }[] =
    [
      { value: "solo", label: "Solo", icon: <Users className="w-4 h-4" /> },
      {
        value: "couples",
        label: "Couple",
        icon: <Heart className="w-4 h-4" />,
      },
      { value: "family", label: "Family", icon: <Users className="w-4 h-4" /> },
      {
        value: "friends",
        label: "Friends",
        icon: <Users className="w-4 h-4" />,
      },
      {
        value: "honeymoon",
        label: "Honeymoon",
        icon: <Heart className="w-4 h-4" />,
      },
    ];

  const updateChildAge = (index: number, age: number) => {
    const newAges = [...settings.childrenAges];
    newAges[index] = age;
    onChange({ ...settings, childrenAges: newAges });
  };

  const updateChildrenCount = (count: number) => {
    const newAges = settings.childrenAges.slice(0, count);
    while (newAges.length < count) {
      newAges.push(8);
    }
    onChange({ ...settings, children: count, childrenAges: newAges });
  };

  return (
    <div className="space-y-4">
      {/* Trip Mode */}
      <div>
        <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">
          Trip Mode
        </label>
        <div className="flex flex-wrap gap-2">
          {tripModes.map((mode) => (
            <button
              key={mode.value}
              onClick={() => onChange({ ...settings, tripMode: mode.value })}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors",
                settings.tripMode === mode.value
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

      {/* Adults & Children Counter */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">
            Adults
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                onChange({
                  ...settings,
                  adults: Math.max(1, settings.adults - 1),
                })
              }
              className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              -
            </button>
            <span className="w-8 text-center font-medium text-gray-900 dark:text-white">
              {settings.adults}
            </span>
            <button
              onClick={() =>
                onChange({ ...settings, adults: settings.adults + 1 })
              }
              className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              +
            </button>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">
            Children
          </label>
          <div className="flex items-center gap-2">
            <button
              onClick={() =>
                updateChildrenCount(Math.max(0, settings.children - 1))
              }
              className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              -
            </button>
            <span className="w-8 text-center font-medium text-gray-900 dark:text-white">
              {settings.children}
            </span>
            <button
              onClick={() => updateChildrenCount(settings.children + 1)}
              className="w-8 h-8 rounded-lg bg-gray-100 dark:bg-gray-700 flex items-center justify-center text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
            >
              +
            </button>
          </div>
        </div>
      </div>

      {/* Children Ages */}
      {settings.children > 0 && (
        <div>
          <label className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2 block">
            Children Ages
          </label>
          <div className="flex flex-wrap gap-2">
            {settings.childrenAges.map((age, index) => (
              <div key={index} className="flex items-center gap-1">
                <Baby className="w-3 h-3 text-purple-400" />
                <select
                  value={age}
                  onChange={(e) =>
                    updateChildAge(index, parseInt(e.target.value))
                  }
                  className="px-2 py-1 text-xs rounded-lg bg-gray-100 dark:bg-gray-700 border-none text-gray-700 dark:text-gray-300"
                >
                  {Array.from({ length: 18 }, (_, i) => (
                    <option key={i} value={i}>
                      {i} yrs
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Special travelers */}
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={settings.hasSeniors}
            onChange={(e) =>
              onChange({ ...settings, hasSeniors: e.target.checked })
            }
            className="rounded text-purple-500"
          />
          Has seniors (65+)
        </label>
        <label className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400">
          <input
            type="checkbox"
            checked={settings.hasInfants}
            onChange={(e) =>
              onChange({ ...settings, hasInfants: e.target.checked })
            }
            className="rounded text-purple-500"
          />
          Has infants (&lt;2)
        </label>
      </div>
    </div>
  );
}
