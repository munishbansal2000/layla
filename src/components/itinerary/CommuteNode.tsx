/**
 * CommuteNode Component
 *
 * Renders commute/travel segments in the itinerary with appropriate styling
 * based on the commute type:
 * - arrival: Airport/station → Hotel (first day)
 * - departure: Hotel → Airport/station (last day)
 * - hotel-to-activity: Morning commute from hotel
 * - activity-to-hotel: Evening commute back to hotel
 * - between-activities: Commute between activities during the day
 * - city-transfer: Travel between cities (shinkansen, flight, etc.)
 * - to-station: Hotel to departure station
 * - from-station: Arrival station to hotel
 */

"use client";

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  Plane,
  Train,
  Bus,
  Car,
  Footprints,
  Ship,
  Building2,
  MapPin,
  Clock,
  ArrowDown,
  Wallet,
  Navigation,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  StructuredCommuteInfo,
  CommuteType,
} from "@/types/structured-itinerary";

// ============================================
// TYPES
// ============================================

export interface CommuteNodeProps {
  commute: StructuredCommuteInfo;
  /** Override commute type from data */
  type?: CommuteType;
  /** Show compact version (inline) vs expanded (block) */
  variant?: "compact" | "expanded" | "minimal";
  /** Optional class name */
  className?: string;
  /** From coordinates for directions link */
  fromCoords?: { lat: number; lng: number };
  /** To coordinates for directions link */
  toCoords?: { lat: number; lng: number };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate Google Maps directions URL
 */
function getDirectionsUrl(
  from?: { lat: number; lng: number },
  to?: { lat: number; lng: number },
  fromName?: string,
  toName?: string,
  travelMode?: string
): string | null {
  // Prefer coordinates, fallback to place names
  const origin = from
    ? `${from.lat},${from.lng}`
    : fromName
    ? encodeURIComponent(fromName)
    : null;
  const destination = to
    ? `${to.lat},${to.lng}`
    : toName
    ? encodeURIComponent(toName)
    : null;

  if (!origin || !destination) {
    return null;
  }

  // Map commute method to Google Maps travel mode
  let mode = "transit";
  switch (travelMode) {
    case "walk":
      mode = "walking";
      break;
    case "drive":
    case "taxi":
      mode = "driving";
      break;
    case "transit":
    case "shinkansen":
    case "bus":
    case "ferry":
      mode = "transit";
      break;
    case "bicycle":
      mode = "bicycling";
      break;
  }

  return `https://www.google.com/maps/dir/?api=1&origin=${origin}&destination=${destination}&travelmode=${mode}`;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getMethodIcon(
  method: StructuredCommuteInfo["method"],
  size = "w-4 h-4"
) {
  switch (method) {
    case "flight":
      return <Plane className={cn(size, "text-blue-500")} />;
    case "shinkansen":
      return <Train className={cn(size, "text-green-600")} />;
    case "transit":
      return <Train className={cn(size, "text-blue-500")} />;
    case "bus":
      return <Bus className={cn(size, "text-orange-500")} />;
    case "taxi":
    case "drive":
      return <Car className={cn(size, "text-purple-500")} />;
    case "walk":
      return <Footprints className={cn(size, "text-green-500")} />;
    case "ferry":
      return <Ship className={cn(size, "text-cyan-500")} />;
    default:
      return <Navigation className={cn(size, "text-gray-500")} />;
  }
}

function getMethodLabel(method: StructuredCommuteInfo["method"]) {
  switch (method) {
    case "shinkansen":
      return "Shinkansen";
    case "flight":
      return "Flight";
    case "transit":
      return "Train";
    case "bus":
      return "Bus";
    case "taxi":
      return "Taxi";
    case "drive":
      return "Drive";
    case "walk":
      return "Walk";
    case "ferry":
      return "Ferry";
    default:
      return method;
  }
}

function getTypeStyles(type: CommuteType) {
  switch (type) {
    case "arrival":
      return {
        bgColor: "bg-blue-50 dark:bg-blue-900/20",
        borderColor: "border-blue-200 dark:border-blue-800",
        iconBg: "bg-blue-100 dark:bg-blue-800",
        textColor: "text-blue-700 dark:text-blue-300",
        label: "Arrival",
        icon: <Plane className="w-4 h-4" />,
      };
    case "departure":
      return {
        bgColor: "bg-purple-50 dark:bg-purple-900/20",
        borderColor: "border-purple-200 dark:border-purple-800",
        iconBg: "bg-purple-100 dark:bg-purple-800",
        textColor: "text-purple-700 dark:text-purple-300",
        label: "Departure",
        icon: <Plane className="w-4 h-4" />,
      };
    case "hotel-to-activity":
      return {
        bgColor: "bg-amber-50 dark:bg-amber-900/20",
        borderColor: "border-amber-200 dark:border-amber-800",
        iconBg: "bg-amber-100 dark:bg-amber-800",
        textColor: "text-amber-700 dark:text-amber-300",
        label: "From Hotel",
        icon: <Building2 className="w-4 h-4" />,
      };
    case "activity-to-hotel":
      return {
        bgColor: "bg-indigo-50 dark:bg-indigo-900/20",
        borderColor: "border-indigo-200 dark:border-indigo-800",
        iconBg: "bg-indigo-100 dark:bg-indigo-800",
        textColor: "text-indigo-700 dark:text-indigo-300",
        label: "Back to Hotel",
        icon: <Building2 className="w-4 h-4" />,
      };
    case "city-transfer":
      return {
        bgColor: "bg-emerald-50 dark:bg-emerald-900/20",
        borderColor: "border-emerald-200 dark:border-emerald-800",
        iconBg: "bg-emerald-100 dark:bg-emerald-800",
        textColor: "text-emerald-700 dark:text-emerald-300",
        label: "City Transfer",
        icon: <Train className="w-4 h-4" />,
      };
    case "to-station":
      return {
        bgColor: "bg-slate-50 dark:bg-slate-900/20",
        borderColor: "border-slate-200 dark:border-slate-800",
        iconBg: "bg-slate-100 dark:bg-slate-800",
        textColor: "text-slate-700 dark:text-slate-300",
        label: "To Station",
        icon: <Train className="w-4 h-4" />,
      };
    case "from-station":
      return {
        bgColor: "bg-slate-50 dark:bg-slate-900/20",
        borderColor: "border-slate-200 dark:border-slate-800",
        iconBg: "bg-slate-100 dark:bg-slate-800",
        textColor: "text-slate-700 dark:text-slate-300",
        label: "From Station",
        icon: <Train className="w-4 h-4" />,
      };
    case "between-activities":
    default:
      return {
        bgColor: "bg-gray-50 dark:bg-gray-800/50",
        borderColor: "border-gray-200 dark:border-gray-700",
        iconBg: "bg-gray-100 dark:bg-gray-700",
        textColor: "text-gray-600 dark:text-gray-400",
        label: "Commute",
        icon: <Navigation className="w-4 h-4" />,
      };
  }
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${meters}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

// ============================================
// COMPONENT
// ============================================

export function CommuteNode({
  commute,
  type,
  variant = "compact",
  className,
  fromCoords,
  toCoords,
}: CommuteNodeProps) {
  const commuteType = type ?? commute.commuteType ?? "between-activities";
  const styles = useMemo(() => getTypeStyles(commuteType), [commuteType]);

  // Minimal variant - just a simple line with icon
  if (variant === "minimal") {
    const directionsUrl = getDirectionsUrl(
      fromCoords,
      toCoords,
      commute.fromName,
      commute.toName,
      commute.method
    );

    return (
      <div className={cn("flex items-center justify-center py-1", className)}>
        {directionsUrl ? (
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700/50 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors group"
          >
            {getMethodIcon(commute.method, "w-3 h-3")}
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {formatDuration(commute.duration)}
            </span>
            <ExternalLink className="w-3 h-3 text-gray-400 group-hover:text-blue-500 transition-colors" />
          </a>
        ) : (
          <div className="flex items-center gap-2 px-3 py-1 rounded-full bg-gray-100 dark:bg-gray-700/50">
            {getMethodIcon(commute.method, "w-3 h-3")}
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {formatDuration(commute.duration)}
            </span>
          </div>
        )}
      </div>
    );
  }

  // Compact variant - inline pill style
  if (variant === "compact") {
    const directionsUrl = getDirectionsUrl(
      fromCoords,
      toCoords,
      commute.fromName,
      commute.toName,
      commute.method
    );

    const content = (
      <>
        {getMethodIcon(commute.method, "w-3.5 h-3.5")}
        <span className={cn("text-xs font-medium", styles.textColor)}>
          {formatDuration(commute.duration)} {getMethodLabel(commute.method)}
        </span>
        {commute.distance > 0 && (
          <span className="text-[10px] text-gray-400 dark:text-gray-500">
            ({formatDistance(commute.distance)})
          </span>
        )}
        {commute.cost && (
          <span className="text-[10px] text-gray-500 dark:text-gray-400">
            ~¥{commute.cost.amount.toLocaleString()}
          </span>
        )}
        {directionsUrl && (
          <ExternalLink className="w-3 h-3 text-gray-400 group-hover:text-blue-500 transition-colors" />
        )}
      </>
    );

    return (
      <div className={cn("flex items-center justify-center py-2", className)}>
        {directionsUrl ? (
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full border group",
              "hover:shadow-md transition-all",
              styles.bgColor,
              styles.borderColor
            )}
          >
            {content}
          </a>
        ) : (
          <div
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-full border",
              styles.bgColor,
              styles.borderColor
            )}
          >
            {content}
          </div>
        )}
      </div>
    );
  }

  // Expanded variant - full card with details
  const directionsUrl = getDirectionsUrl(
    fromCoords,
    toCoords,
    commute.fromName,
    commute.toName,
    commute.method
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn(
        "relative rounded-lg border p-4",
        styles.bgColor,
        styles.borderColor,
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <div className={cn("p-1.5 rounded-lg", styles.iconBg)}>
            {styles.icon}
          </div>
          <div>
            <span className={cn("text-sm font-semibold", styles.textColor)}>
              {styles.label}
            </span>
            {commute.trainLines && commute.trainLines.length > 0 && (
              <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
                via {commute.trainLines.join(", ")}
              </span>
            )}
          </div>
        </div>
        <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <Clock className="w-3.5 h-3.5" />
            {formatDuration(commute.duration)}
          </span>
          {commute.cost && (
            <span className="flex items-center gap-1">
              <Wallet className="w-3.5 h-3.5" />¥
              {commute.cost.amount.toLocaleString()}
            </span>
          )}
          {/* Directions button */}
          {directionsUrl && (
            <a
              href={directionsUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 px-2 py-1 rounded-md bg-blue-100 dark:bg-blue-900/50 text-blue-600 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-800 transition-colors text-xs font-medium"
            >
              <Navigation className="w-3 h-3" />
              Directions
            </a>
          )}
        </div>
      </div>

      {/* Route visualization */}
      <div className="flex items-start gap-3">
        {/* Timeline */}
        <div className="flex flex-col items-center pt-1">
          <div className={cn("w-3 h-3 rounded-full", styles.iconBg)} />
          <div className="w-0.5 h-8 bg-gray-300 dark:bg-gray-600 my-1" />
          <ArrowDown className="w-4 h-4 text-gray-400" />
          <div className="w-0.5 h-8 bg-gray-300 dark:bg-gray-600 my-1" />
          <div className={cn("w-3 h-3 rounded-full", styles.iconBg)} />
        </div>

        {/* Locations */}
        <div className="flex-1 space-y-4">
          {/* From */}
          <div>
            <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-white">
              <MapPin className="w-3.5 h-3.5 text-gray-400" />
              {commute.fromName || "Origin"}
            </div>
          </div>

          {/* Method & Distance */}
          <div className="flex items-center gap-2 pl-5">
            {getMethodIcon(commute.method)}
            <span className="text-sm text-gray-600 dark:text-gray-400">
              {getMethodLabel(commute.method)}
            </span>
            {commute.distance > 0 && (
              <span className="text-xs text-gray-400">
                • {formatDistance(commute.distance)}
              </span>
            )}
          </div>

          {/* To */}
          <div>
            <div className="flex items-center gap-1.5 text-sm font-medium text-gray-900 dark:text-white">
              <MapPin className="w-3.5 h-3.5 text-gray-400" />
              {commute.toName || "Destination"}
            </div>
          </div>
        </div>
      </div>

      {/* Instructions */}
      {commute.instructions && (
        <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {commute.instructions}
          </p>
        </div>
      )}
    </motion.div>
  );
}

// ============================================
// SPECIALIZED COMPONENTS
// ============================================

/**
 * Arrival commute (airport → hotel) for first day
 */
export function ArrivalCommuteNode({
  commute,
  portName,
  hotelName,
  arrivalTime,
  flightNumber,
  className,
}: {
  commute: StructuredCommuteInfo;
  portName: string;
  hotelName: string;
  arrivalTime?: string;
  flightNumber?: string;
  className?: string;
}) {
  const enrichedCommute: StructuredCommuteInfo = {
    ...commute,
    fromName: portName,
    toName: hotelName,
    commuteType: "arrival",
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Arrival info */}
      <div className="flex items-center gap-3 px-4 py-2 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-200 dark:border-blue-800">
        <Plane className="w-5 h-5 text-blue-500" />
        <div>
          <div className="text-sm font-medium text-blue-700 dark:text-blue-300">
            Arrive at {portName}
          </div>
          <div className="text-xs text-blue-600/70 dark:text-blue-400/70">
            {arrivalTime && <span>{arrivalTime}</span>}
            {flightNumber && <span> • {flightNumber}</span>}
          </div>
        </div>
      </div>

      {/* Commute to hotel */}
      <CommuteNode
        commute={enrichedCommute}
        type="arrival"
        variant="expanded"
      />
    </div>
  );
}

/**
 * Departure commute (hotel → airport) for last day
 */
export function DepartureCommuteNode({
  commute,
  hotelName,
  portName,
  departureTime,
  flightNumber,
  className,
}: {
  commute: StructuredCommuteInfo;
  hotelName: string;
  portName: string;
  departureTime?: string;
  flightNumber?: string;
  className?: string;
}) {
  const enrichedCommute: StructuredCommuteInfo = {
    ...commute,
    fromName: hotelName,
    toName: portName,
    commuteType: "departure",
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Commute to airport */}
      <CommuteNode
        commute={enrichedCommute}
        type="departure"
        variant="expanded"
      />

      {/* Departure info */}
      <div className="flex items-center gap-3 px-4 py-2 bg-purple-50 dark:bg-purple-900/30 rounded-lg border border-purple-200 dark:border-purple-800">
        <Plane className="w-5 h-5 text-purple-500" />
        <div>
          <div className="text-sm font-medium text-purple-700 dark:text-purple-300">
            Depart from {portName}
          </div>
          <div className="text-xs text-purple-600/70 dark:text-purple-400/70">
            {departureTime && <span>{departureTime}</span>}
            {flightNumber && <span> • {flightNumber}</span>}
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * City transfer segment (includes hotel → station → travel → station → hotel)
 */
export function CityTransferNode({
  fromCity,
  toCity,
  toStationCommute,
  transferMethod,
  transferDuration,
  transferCost,
  fromStationCommute,
  departureStation,
  arrivalStation,
  trainName,
  className,
}: {
  fromCity: string;
  toCity: string;
  toStationCommute?: StructuredCommuteInfo;
  transferMethod: "shinkansen" | "flight" | "bus" | "train" | "ferry" | "car";
  transferDuration: number;
  transferCost?: { amount: number; currency: string };
  fromStationCommute?: StructuredCommuteInfo;
  departureStation?: string;
  arrivalStation?: string;
  trainName?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-xl border-2 border-dashed border-emerald-300 dark:border-emerald-700 p-4 bg-emerald-50/50 dark:bg-emerald-900/10",
        className
      )}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-800">
          <Train className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div>
          <h4 className="font-semibold text-emerald-700 dark:text-emerald-300">
            City Transfer: {fromCity} → {toCity}
          </h4>
          {trainName && (
            <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
              {trainName}
            </p>
          )}
        </div>
      </div>

      {/* Segments */}
      <div className="space-y-3">
        {/* To Station */}
        {toStationCommute && (
          <CommuteNode
            commute={{
              ...toStationCommute,
              fromName: `Hotel in ${fromCity}`,
              toName: departureStation || `${fromCity} Station`,
            }}
            type="to-station"
            variant="compact"
          />
        )}

        {/* Main transfer */}
        <div className="flex items-center justify-center">
          <div className="flex items-center gap-3 px-4 py-2 bg-emerald-100 dark:bg-emerald-800 rounded-lg">
            {getMethodIcon(
              transferMethod as StructuredCommuteInfo["method"],
              "w-5 h-5"
            )}
            <div className="text-center">
              <div className="text-sm font-medium text-emerald-700 dark:text-emerald-300">
                {departureStation || fromCity} → {arrivalStation || toCity}
              </div>
              <div className="text-xs text-emerald-600/70 dark:text-emerald-400/70">
                {formatDuration(transferDuration)}
                {transferCost && ` • ¥${transferCost.amount.toLocaleString()}`}
              </div>
            </div>
          </div>
        </div>

        {/* From Station */}
        {fromStationCommute && (
          <CommuteNode
            commute={{
              ...fromStationCommute,
              fromName: arrivalStation || `${toCity} Station`,
              toName: `Hotel in ${toCity}`,
            }}
            type="from-station"
            variant="compact"
          />
        )}
      </div>
    </div>
  );
}

/**
 * Hotel to first activity (morning commute)
 */
export function HotelToActivityNode({
  commute,
  hotelName,
  activityName,
  className,
}: {
  commute: StructuredCommuteInfo;
  hotelName: string;
  activityName: string;
  className?: string;
}) {
  return (
    <CommuteNode
      commute={{
        ...commute,
        fromName: hotelName,
        toName: activityName,
        commuteType: "hotel-to-activity",
      }}
      type="hotel-to-activity"
      variant="compact"
      className={className}
    />
  );
}

/**
 * Last activity back to hotel (evening commute)
 */
export function ActivityToHotelNode({
  commute,
  activityName,
  hotelName,
  className,
}: {
  commute: StructuredCommuteInfo;
  activityName: string;
  hotelName: string;
  className?: string;
}) {
  return (
    <CommuteNode
      commute={{
        ...commute,
        fromName: activityName,
        toName: hotelName,
        commuteType: "activity-to-hotel",
      }}
      type="activity-to-hotel"
      variant="compact"
      className={className}
    />
  );
}
