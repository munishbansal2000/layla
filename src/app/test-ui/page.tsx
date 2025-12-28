"use client";

import { TripPlannerPane } from "@/components/planner/TripPlannerPane";

export default function TestUIPage() {
  return (
    <div className="h-screen w-full flex">
      {/* Main content area */}
      <div className="flex-1 bg-gray-100 dark:bg-gray-950 flex items-center justify-center">
        <div className="text-center p-8">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
            🧪 UI Test Page
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-2">
            This page displays the TripPlannerPane with mock data.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            The right panel shows the Activity Builder with a 5-day Paris trip.
          </p>
          <div className="mt-8 p-4 bg-white dark:bg-gray-800 rounded-xl text-left">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-2">
              ✅ Features to Test:
            </h3>
            <ul className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
              <li className="flex items-center gap-2">
                <span className="text-purple-500">•</span>
                Settings panel (click gear icon) with Travelers, Preferences,
                Dietary
              </li>
              <li className="flex items-center gap-2">
                <span className="text-purple-500">•</span>
                Energy check-in bar (click to update energy level)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-purple-500">•</span>
                Day selector (navigate between days)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-purple-500">•</span>
                Time slots (click to see activity suggestions)
              </li>
              <li className="flex items-center gap-2">
                <span className="text-purple-500">•</span>
                <strong>Swipe Mode</strong> button for Tinder-style activity
                selection
              </li>
              <li className="flex items-center gap-2">
                <span className="text-purple-500">•</span>
                Keyboard shortcuts in Swipe Mode:
                <span className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">
                  ←
                </span>{" "}
                Skip,
                <span className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">
                  →
                </span>{" "}
                Add,
                <span className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">
                  ↑
                </span>{" "}
                Must-Do,
                <span className="text-xs bg-gray-100 dark:bg-gray-700 px-1 rounded">
                  ↓
                </span>{" "}
                Later
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Activity Builder Pane - Right Side */}
      <div className="w-[420px] border-l border-gray-200 dark:border-gray-800 h-full">
        <TripPlannerPane useMockData={true} />
      </div>
    </div>
  );
}
