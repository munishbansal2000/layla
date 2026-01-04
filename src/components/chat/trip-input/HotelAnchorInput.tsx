"use client";

import { motion } from "framer-motion";
import { Building2, X } from "lucide-react";
import type { HotelAnchorInputProps } from "./types";

export function HotelAnchorInput({
  hotel,
  onChange,
  onRemove,
}: HotelAnchorInputProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="flex items-start gap-2 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800"
    >
      <Building2 className="w-4 h-4 text-amber-600 mt-2 flex-shrink-0" />
      <div className="flex-1 grid grid-cols-2 gap-2">
        <input
          type="text"
          placeholder="City"
          value={hotel.city}
          onChange={(e) => onChange({ ...hotel, city: e.target.value })}
          className="col-span-2 px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
        />
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Check-in</label>
          <input
            type="date"
            value={hotel.checkIn}
            onChange={(e) => onChange({ ...hotel, checkIn: e.target.value })}
            className="px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Check-out</label>
          <input
            type="date"
            value={hotel.checkOut}
            onChange={(e) => onChange({ ...hotel, checkOut: e.target.value })}
            className="px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
          />
        </div>
        <input
          type="text"
          placeholder="Hotel name (optional)"
          value={hotel.name || ""}
          onChange={(e) => onChange({ ...hotel, name: e.target.value })}
          className="col-span-2 px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
        />
      </div>
      <button
        onClick={onRemove}
        className="p-1 text-gray-400 hover:text-red-500 transition-colors"
        title="Remove hotel"
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}
