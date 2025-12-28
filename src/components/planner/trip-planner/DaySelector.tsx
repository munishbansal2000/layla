"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { DaySchedule } from "@/lib/trip-planning";

interface DaySelectorProps {
  schedule: DaySchedule[];
  selectedDayIndex: number;
  onSelectDay: (index: number) => void;
  formatDate: (date: string) => string;
  currentDay: DaySchedule | undefined;
}

export function DaySelector({
  schedule,
  selectedDayIndex,
  onSelectDay,
  formatDate,
  currentDay,
}: DaySelectorProps) {
  return (
    <div className="flex-shrink-0 p-3 border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      <div className="flex items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => onSelectDay(Math.max(0, selectedDayIndex - 1))}
          disabled={selectedDayIndex === 0}
        >
          <ChevronLeft className="w-4 h-4" />
        </Button>

        <div className="flex-1 flex gap-1 overflow-x-auto py-1">
          {schedule.map((day, index) => (
            <button
              key={day.date}
              onClick={() => onSelectDay(index)}
              className={cn(
                "flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors",
                index === selectedDayIndex
                  ? "bg-purple-500 text-white"
                  : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
              )}
            >
              Day {day.dayNumber}
            </button>
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            onSelectDay(Math.min(schedule.length - 1, selectedDayIndex + 1))
          }
          disabled={selectedDayIndex === schedule.length - 1}
        >
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>

      {currentDay && (
        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 text-center">
          {formatDate(currentDay.date)}
        </p>
      )}
    </div>
  );
}
