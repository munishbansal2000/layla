"use client";

import Link from "next/link";
// NOTE: TripPlannerPane has been deprecated and archived
// import { TripPlannerPane } from "@/components/_archive/TripPlannerPane";
import {
  Plane,
  Calendar,
  Play,
  MessageSquare,
  Map,
  Sparkles,
  ArrowRight,
  ChevronRight,
} from "lucide-react";

export default function TestUIPage() {
  return (
    <div className="h-screen w-full flex">
      {/* Main content area */}
      <div className="flex-1 bg-gray-100 dark:bg-gray-950 overflow-y-auto">
        <div className="max-w-4xl mx-auto p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
              🧪 Trip Planner Test Hub
            </h1>
            <p className="text-gray-600 dark:text-gray-400">
              Test all trip planning features in different modes
            </p>
          </div>

          {/* Main Route Card - Unified Experience */}
          <div className="mb-8">
            <Link
              href="/trip"
              className="block p-6 bg-gradient-to-br from-purple-600 to-pink-600 rounded-2xl shadow-lg hover:shadow-xl transition-all hover:scale-[1.02]"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-14 h-14 bg-white/20 rounded-xl flex items-center justify-center">
                    <Sparkles className="h-7 w-7 text-white" />
                  </div>
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-1">
                      Unified Trip Experience
                    </h2>
                    <p className="text-purple-100">
                      Production-like flow: Plan → View → Execute
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-8 w-8 text-white/80" />
              </div>
              <div className="mt-4 flex items-center gap-4 text-sm text-purple-100">
                <span className="flex items-center gap-1">
                  <Plane className="h-4 w-4" /> Trip Input
                </span>
                <ChevronRight className="h-4 w-4" />
                <span className="flex items-center gap-1">
                  <Calendar className="h-4 w-4" /> Itinerary + Chat
                </span>
                <ChevronRight className="h-4 w-4" />
                <span className="flex items-center gap-1">
                  <Play className="h-4 w-4" /> Day Execution
                </span>
              </div>
            </Link>
          </div>

          {/* Individual Test Pages */}
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Individual Test Pages
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
            {/* Trip Input */}
            <Link
              href="/test/trip-input"
              className="p-5 bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-lg transition-all hover:scale-[1.01] border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 rounded-lg flex items-center justify-center">
                  <Plane className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Trip Input
                </h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Enter flights, hotels, and preferences. See AI parsing in
                action.
              </p>
            </Link>

            {/* Itinerary View */}
            <Link
              href="/test-ui/itinerary"
              className="p-5 bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-lg transition-all hover:scale-[1.01] border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-green-100 dark:bg-green-900/30 rounded-lg flex items-center justify-center">
                  <Calendar className="h-5 w-5 text-green-600 dark:text-green-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Itinerary + Chat
                </h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                View itinerary with chat panel for AI-powered adjustments.
              </p>
            </Link>

            {/* Execution Demo */}
            <Link
              href="/test/execution"
              className="p-5 bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-lg transition-all hover:scale-[1.01] border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-lg flex items-center justify-center">
                  <Play className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Execution Demo
                </h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Standalone execution simulator with sample Tokyo data.
              </p>
            </Link>

            {/* Trip Planner Pane */}
            <Link
              href="/test/itinerary"
              className="p-5 bg-white dark:bg-gray-800 rounded-xl shadow-md hover:shadow-lg transition-all hover:scale-[1.01] border border-gray-200 dark:border-gray-700"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-purple-100 dark:bg-purple-900/30 rounded-lg flex items-center justify-center">
                  <Map className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  Full Planner Pane
                </h3>
              </div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Complete TripPlannerPane with all features including execution.
              </p>
            </Link>
          </div>

          {/* Features List */}
          <div className="p-6 bg-white dark:bg-gray-800 rounded-xl shadow-md border border-gray-200 dark:border-gray-700">
            <h3 className="font-semibold text-gray-900 dark:text-white mb-4">
              ✅ Features to Test:
            </h3>
            <ul className="space-y-3 text-sm text-gray-600 dark:text-gray-400">
              <li className="flex items-start gap-2">
                <span className="text-purple-500 mt-0.5">•</span>
                <div>
                  <strong>Plan Phase:</strong> Trip input with flights/hotels,
                  AI parsing, itinerary generation
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 mt-0.5">•</span>
                <div>
                  <strong>View Phase:</strong> Interactive itinerary, chat
                  assistant, drag-drop reordering, slot options
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 mt-0.5">•</span>
                <div>
                  <strong>Execute Phase:</strong> Real-time simulation, scenario
                  triggers (late wakeup, delayed departure), decision modals,
                  notifications
                </div>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-purple-500 mt-0.5">•</span>
                <div>
                  <strong>Swipe Mode:</strong> Tinder-style activity selection
                  with keyboard shortcuts (←↑→↓)
                </div>
              </li>
            </ul>
          </div>
        </div>
      </div>

      {/* Activity Builder Pane - Right Side */}
      {/* NOTE: TripPlannerPane has been deprecated and archived */}
      {/* <div className="w-[420px] border-l border-gray-200 dark:border-gray-800 h-full hidden xl:block">
        <TripPlannerPane useMockData={true} />
      </div> */}
    </div>
  );
}
