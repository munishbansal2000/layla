"use client";

import { motion } from "framer-motion";
import { X } from "lucide-react";
import {
  ACTIVITY_CATEGORY_INFO,
  type ActivityAnchorCategory,
} from "@/types/trip-input";
import type { ActivityAnchorInputProps } from "./types";

export function ActivityAnchorInput({
  activity,
  onChange,
  onRemove,
}: ActivityAnchorInputProps) {
  const categoryInfo = ACTIVITY_CATEGORY_INFO[activity.category];

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="flex items-start gap-2 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800"
    >
      <span className="text-lg mt-1">{categoryInfo.emoji}</span>
      <div className="flex-1 grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder="Activity name (e.g., teamLab Planets)"
          value={activity.name}
          onChange={(e) => onChange({ ...activity, name: e.target.value })}
          className="col-span-2 px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
        />

        <select
          value={activity.category}
          onChange={(e) =>
            onChange({
              ...activity,
              category: e.target.value as ActivityAnchorCategory,
            })
          }
          className="px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
        >
          {Object.entries(ACTIVITY_CATEGORY_INFO).map(([key, info]) => (
            <option key={key} value={key}>
              {info.emoji} {info.label}
            </option>
          ))}
        </select>

        <input
          type="text"
          placeholder="City"
          value={activity.city}
          onChange={(e) => onChange({ ...activity, city: e.target.value })}
          className="px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
        />

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Date</label>
          <input
            type="date"
            value={activity.date}
            onChange={(e) => onChange({ ...activity, date: e.target.value })}
            className="px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Start time</label>
          <input
            type="time"
            value={activity.startTime || ""}
            onChange={(e) =>
              onChange({ ...activity, startTime: e.target.value })
            }
            className="px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Duration (min)</label>
          <input
            type="number"
            placeholder="e.g., 120"
            value={activity.duration || ""}
            onChange={(e) =>
              onChange({
                ...activity,
                duration: e.target.value ? parseInt(e.target.value) : undefined,
              })
            }
            className="px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Confirmation #</label>
          <input
            type="text"
            placeholder="Optional"
            value={activity.confirmationNumber || ""}
            onChange={(e) =>
              onChange({ ...activity, confirmationNumber: e.target.value })
            }
            className="px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
          />
        </div>

        <input
          type="text"
          placeholder="Notes (e.g., arrive 30 min early)"
          value={activity.notes || ""}
          onChange={(e) => onChange({ ...activity, notes: e.target.value })}
          className="col-span-2 px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
        />
      </div>
      <button
        onClick={onRemove}
        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
        title="Remove activity"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}
