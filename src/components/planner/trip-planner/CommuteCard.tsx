"use client";

import { Footprints, Train, Car, Bike, Navigation } from "lucide-react";
import type { CommuteDisplayInfo } from "./types";
import type { CommuteMethod } from "@/lib/routing-service";

interface CommuteCardProps {
  commute: CommuteDisplayInfo;
  fromActivity?: string;
  toActivity?: string;
}

export function CommuteCard({ commute }: CommuteCardProps) {
  const getCommuteIcon = (method: CommuteMethod) => {
    switch (method) {
      case "walk":
        return <Footprints className="w-3.5 h-3.5 text-green-500" />;
      case "transit":
        return <Train className="w-3.5 h-3.5 text-blue-500" />;
      case "taxi":
      case "driving":
        return <Car className="w-3.5 h-3.5 text-purple-500" />;
      case "bicycle":
        return <Bike className="w-3.5 h-3.5 text-orange-500" />;
      default:
        return <Navigation className="w-3.5 h-3.5 text-gray-500" />;
    }
  };

  const getMethodLabel = (method: CommuteMethod) => {
    switch (method) {
      case "walk":
        return "Walk";
      case "transit":
        return "Transit";
      case "taxi":
        return "Taxi";
      case "driving":
        return "Drive";
      case "bicycle":
        return "Bike";
      case "mixed":
        return "Mixed";
      default:
        return method;
    }
  };

  const formatDistance = (meters: number) => {
    if (meters < 1000) {
      return `${meters}m`;
    }
    return `${(meters / 1000).toFixed(1)}km`;
  };

  return (
    <div className="flex items-center justify-center py-1">
      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-700/50 rounded-full">
        {getCommuteIcon(commute.method)}
        <span className="text-xs text-gray-600 dark:text-gray-400">
          {commute.durationMinutes} min {getMethodLabel(commute.method)}
        </span>
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          ({formatDistance(commute.distanceMeters)})
        </span>
        {commute.estimatedCost && (
          <span className="text-[10px] text-gray-500 dark:text-gray-400">
            ~${commute.estimatedCost.amount}
          </span>
        )}
      </div>
    </div>
  );
}
