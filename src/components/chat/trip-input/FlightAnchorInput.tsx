"use client";

import { motion } from "framer-motion";
import { Plane, X } from "lucide-react";
import type { FlightAnchorInputProps } from "./types";

export function FlightAnchorInput({
  flight,
  onChange,
  onRemove,
}: FlightAnchorInputProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800"
    >
      <Plane className="w-4 h-4 text-blue-600 mt-2 flex-shrink-0" />
      <div className="flex-1 grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder="From (e.g., SFO)"
          value={flight.from}
          onChange={(e) =>
            onChange({ ...flight, from: e.target.value.toUpperCase() })
          }
          className="px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
        />
        <input
          type="text"
          placeholder="To (e.g., NRT)"
          value={flight.to}
          onChange={(e) =>
            onChange({ ...flight, to: e.target.value.toUpperCase() })
          }
          className="px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
        />
        <input
          type="date"
          value={flight.date}
          onChange={(e) => onChange({ ...flight, date: e.target.value })}
          className="px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
        />
        <input
          type="time"
          value={flight.time || ""}
          onChange={(e) => onChange({ ...flight, time: e.target.value })}
          placeholder="Time"
          className="px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
        />
        <input
          type="text"
          placeholder="Flight # (optional)"
          value={flight.flightNumber || ""}
          onChange={(e) =>
            onChange({ ...flight, flightNumber: e.target.value })
          }
          className="col-span-2 px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
        />
      </div>
      <button
        onClick={onRemove}
        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
        title="Remove flight"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}
