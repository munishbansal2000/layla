"use client";

import { Building2, MapPin, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { DerivedTripStructure } from "@/types/trip-input";
import { TransferCard } from "./TransferCard";
import { formatDateShort } from "./utils";
import type { TripTimelinePreviewProps } from "./types";

export function TripTimelinePreview({ structure }: TripTimelinePreviewProps) {
  if (structure.legs.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <MapPin className="w-4 h-4" />
        Your Trip Structure
      </h4>

      {structure.errors.length > 0 && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
          {structure.errors.map((error, i) => (
            <div
              key={i}
              className="text-sm text-red-700 dark:text-red-300 flex items-center gap-2"
            >
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error.message}
            </div>
          ))}
        </div>
      )}

      <div className="relative">
        {structure.legs.map((leg, index) => (
          <div key={leg.id} className="relative">
            <div
              className={cn(
                "p-3 rounded-lg border mb-2",
                leg.hasConflict
                  ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
                  : "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700"
              )}
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="font-medium text-gray-900 dark:text-gray-100">
                    {leg.city}
                  </div>
                  <div className="text-xs text-gray-500">
                    {formatDateShort(leg.startDate)} -{" "}
                    {formatDateShort(leg.endDate)}
                    <span className="ml-2 text-purple-600">
                      {leg.nights} {leg.nights === 1 ? "night" : "nights"}
                    </span>
                  </div>
                  {leg.hotel?.name && (
                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-1">
                      <Building2 className="w-3 h-3" />
                      {leg.hotel.name}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {leg.departureTransfer && index < structure.legs.length - 1 && (
              <div className="ml-4 mb-2">
                <TransferCard transfer={leg.departureTransfer} />
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
