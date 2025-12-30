/**
 * EmptySlotPlaceholder Component
 *
 * Legacy placeholder shown when a slot has no activities scheduled.
 */

"use client";

import { Clock } from "lucide-react";
import type { SlotWithOptions } from "@/types/structured-itinerary";

export interface EmptySlotProps {
  slot: SlotWithOptions;
}

export function EmptySlotPlaceholder({ slot }: EmptySlotProps) {
  return (
    <div className="p-4 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-900/50">
      <div className="flex items-center gap-3 text-gray-400 dark:text-gray-500">
        <Clock className="w-5 h-5" />
        <div>
          <div className="text-sm font-medium capitalize">
            {slot.slotType} • {slot.timeRange.start} - {slot.timeRange.end}
          </div>
          <div className="text-xs mt-0.5">
            No activities scheduled — drag an activity here or add one
          </div>
        </div>
      </div>
    </div>
  );
}
