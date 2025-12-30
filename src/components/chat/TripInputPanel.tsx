"use client";

/**
 * TripInputPanel Component
 *
 * A minimal, conversational input interface for starting trip planning.
 * Simple by default with one text field + optional anchors (flights/hotels).
 * Uses progressive disclosure to avoid overwhelming users.
 *
 * Features:
 * - Natural language parsing via AI (Ollama)
 * - Automatic extraction of flights, hotels, activities
 * - Spelling corrections and conflict detection
 */

import React, { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Plane,
  Building2,
  Plus,
  X,
  ChevronDown,
  ChevronUp,
  ChevronRight,
  Sparkles,
  AlertTriangle,
  CheckCircle,
  Clock,
  MapPin,
  Calendar,
  Users,
  DollarSign,
  Train,
  Car,
  Wand2,
  Loader2,
  Info,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type {
  TripInput,
  FlightAnchor,
  HotelAnchor,
  ActivityAnchor,
  ActivityAnchorCategory,
  BudgetTier,
  DerivedTripStructure,
  InferredTransfer,
  TransferOption,
} from "@/types/trip-input";
import {
  createEmptyTripInput,
  createEmptyFlightAnchor,
  createEmptyHotelAnchor,
  createEmptyActivityAnchor,
  ACTIVITY_CATEGORY_INFO,
} from "@/types/trip-input";
import { inferTripStructure } from "@/lib/transfer-inference";
import type { ParsedTripInput } from "@/lib/trip-input-parser";

// ============================================
// TYPES
// ============================================

interface TripInputPanelProps {
  onStartPlanning: (input: TripInput, structure: DerivedTripStructure) => void;
  isLoading?: boolean;
  className?: string;
}

interface ParseState {
  isParsing: boolean;
  parsed: ParsedTripInput | null;
  error: string | null;
  timing: { parseMs: number; totalMs: number } | null;
}

// Interface for tracking user-provided clarifications
interface UserClarifications {
  daysPerCity: Record<string, number>;
  startDate: string;
  endDate: string;
  totalDays: number;
  pace: "relaxed" | "moderate" | "packed";
}

// Interface for itinerary generation state
interface ItineraryState {
  isGenerating: boolean;
  generated: boolean;
  error: string | null;
}

// Pre-booked activity (to be locked into itinerary slots)
interface PreBookedActivity {
  name: string;
  date: string;
  time?: string;
  city?: string;
  duration?: number;
  category?: string;
  confirmationNumber?: string;
  notes?: string;
}

// Helper to convert parsed TripInput to JapanItineraryRequest
interface JapanItineraryRequest {
  cities: string[];
  startDate: string;
  daysPerCity?: Record<string, number>;
  totalDays?: number;
  pace?: "relaxed" | "moderate" | "packed";
  interests?: string[];
  includeKlookExperiences?: boolean;
  preBookedActivities?: PreBookedActivity[];
}

function convertToItineraryRequest(
  parsed: ParsedTripInput,
  userClarifications: UserClarifications
): JapanItineraryRequest | null {
  const destinations = parsed.extractedEntities.destinations || [];
  const dates = parsed.extractedEntities.dates;

  // We need at least cities and a start date
  if (destinations.length === 0) {
    return null;
  }

  // Get start date from parsed dates or user clarification
  let startDate = userClarifications.startDate || dates?.start || "";
  if (!startDate) {
    return null;
  }

  // Calculate total days if we have duration
  let totalDays = userClarifications.totalDays;
  if (!totalDays && dates?.duration) {
    // Parse duration like "2 weeks" or "14 days"
    const durationMatch = dates.duration.match(/(\d+)\s*(week|day)/i);
    if (durationMatch) {
      const num = parseInt(durationMatch[1]);
      const unit = durationMatch[2].toLowerCase();
      totalDays = unit.startsWith("week") ? num * 7 : num;
    }
  }
  if (!totalDays && dates?.start && dates?.end) {
    // Calculate from start/end dates
    const start = new Date(dates.start);
    const end = new Date(dates.end);
    totalDays = Math.ceil(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );
  }

  // Get pace from parsed intent or user clarification
  const pace = userClarifications.pace || parsed.intent?.pace || "moderate";

  // Get interests from parsed data
  const interests = parsed.extractedEntities.interests || [];

  // Use user-specified days per city or auto-distribute
  let daysPerCity = userClarifications.daysPerCity;
  if (
    Object.keys(daysPerCity).length === 0 &&
    totalDays &&
    destinations.length > 0
  ) {
    // Auto-distribute days evenly
    const daysEach = Math.floor(totalDays / destinations.length);
    const remainder = totalDays % destinations.length;
    daysPerCity = {};
    destinations.forEach((city, i) => {
      daysPerCity[city] = daysEach + (i < remainder ? 1 : 0);
    });
  }

  // Convert extracted activities to pre-booked activities format
  const preBookedActivities: PreBookedActivity[] = [];

  // From tripInput.activities (user-entered anchors)
  if (parsed.tripInput.activities && parsed.tripInput.activities.length > 0) {
    for (const activity of parsed.tripInput.activities) {
      if (activity.name && activity.date) {
        preBookedActivities.push({
          name: activity.name,
          date: activity.date,
          time: activity.startTime,
          city: activity.city,
          duration: activity.duration,
          category: activity.category,
          confirmationNumber: activity.confirmationNumber,
          notes: activity.notes,
        });
      }
    }
  }

  // Also check extractedEntities.activities (from LLM parsing)
  if (
    parsed.extractedEntities.activities &&
    parsed.extractedEntities.activities.length > 0
  ) {
    for (const activity of parsed.extractedEntities.activities) {
      // Only add if not already in preBookedActivities
      const activityName = activity.name ?? "";
      const alreadyAdded = preBookedActivities.some(
        (pa) =>
          pa.name.toLowerCase() === activityName.toLowerCase() &&
          pa.date === activity.date
      );
      if (!alreadyAdded && activity.name && activity.date) {
        preBookedActivities.push({
          name: activity.name,
          date: activity.date,
          time: activity.time,
          category: activity.category,
        });
      }
    }
  }

  return {
    cities: destinations,
    startDate,
    daysPerCity: Object.keys(daysPerCity).length > 0 ? daysPerCity : undefined,
    totalDays,
    pace: pace as "relaxed" | "moderate" | "packed",
    interests,
    includeKlookExperiences: true,
    preBookedActivities:
      preBookedActivities.length > 0 ? preBookedActivities : undefined,
  };
}

// Check if parsed data needs user clarifications
function getMissingClarifications(parsed: ParsedTripInput): string[] {
  const missing: string[] = [];

  const destinations = parsed.extractedEntities.destinations || [];
  const dates = parsed.extractedEntities.dates;

  if (destinations.length === 0) {
    missing.push("destination");
  }

  if (!dates?.start) {
    missing.push("start_date");
  }

  // Check if total days can be determined
  const hasDuration = dates?.duration || (dates?.start && dates?.end);
  if (!hasDuration) {
    missing.push("duration");
  }

  // For multi-city trips, check if days per city is specified
  if (destinations.length > 1) {
    // Look for clarification about city allocation
    const hasCityAllocation = parsed.clarifications.some(
      (c) =>
        c.toLowerCase().includes("time allocation") ||
        c.toLowerCase().includes("days per city") ||
        c.toLowerCase().includes("how many days")
    );
    if (hasCityAllocation || !hasDuration) {
      missing.push("days_per_city");
    }
  }

  return missing;
}

// ============================================
// BUDGET TIER SELECTOR
// ============================================

const BUDGET_TIERS: { value: BudgetTier; label: string; icon: string }[] = [
  { value: "budget", label: "$", icon: "$" },
  { value: "moderate", label: "$$", icon: "$$" },
  { value: "luxury", label: "$$$", icon: "$$$" },
  { value: "ultra", label: "$$$$", icon: "$$$$" },
];

function BudgetSelector({
  value,
  onChange,
}: {
  value: BudgetTier;
  onChange: (tier: BudgetTier) => void;
}) {
  return (
    <div className="flex gap-1">
      {BUDGET_TIERS.map((tier) => (
        <button
          key={tier.value}
          onClick={() => onChange(tier.value)}
          className={cn(
            "px-3 py-1.5 text-sm rounded-full transition-all",
            value === tier.value
              ? "bg-purple-600 text-white"
              : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
          )}
        >
          {tier.label}
        </button>
      ))}
    </div>
  );
}

// ============================================
// FLIGHT ANCHOR INPUT
// ============================================

interface FlightAnchorInputProps {
  flight: FlightAnchor;
  onChange: (flight: FlightAnchor) => void;
  onRemove: () => void;
  index: number;
}

function FlightAnchorInput({
  flight,
  onChange,
  onRemove,
  index,
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

// ============================================
// HOTEL ANCHOR INPUT
// ============================================

interface HotelAnchorInputProps {
  hotel: HotelAnchor;
  onChange: (hotel: HotelAnchor) => void;
  onRemove: () => void;
  index: number;
}

function HotelAnchorInput({
  hotel,
  onChange,
  onRemove,
  index,
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

// ============================================
// ACTIVITY ANCHOR INPUT (Booked tours, reservations, etc.)
// ============================================

interface ActivityAnchorInputProps {
  activity: ActivityAnchor;
  onChange: (activity: ActivityAnchor) => void;
  onRemove: () => void;
  index: number;
}

function ActivityAnchorInput({
  activity,
  onChange,
  onRemove,
  index,
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
        {/* Activity Name */}
        <input
          type="text"
          placeholder="Activity name (e.g., teamLab Planets)"
          value={activity.name}
          onChange={(e) => onChange({ ...activity, name: e.target.value })}
          className="col-span-2 px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
        />

        {/* Category Selector */}
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

        {/* City */}
        <input
          type="text"
          placeholder="City"
          value={activity.city}
          onChange={(e) => onChange({ ...activity, city: e.target.value })}
          className="px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
        />

        {/* Date */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-gray-500">Date</label>
          <input
            type="date"
            value={activity.date}
            onChange={(e) => onChange({ ...activity, date: e.target.value })}
            className="px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
          />
        </div>

        {/* Start Time */}
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

        {/* Duration (optional) */}
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

        {/* Confirmation Number (optional) */}
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

        {/* Notes (optional) */}
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

// ============================================
// TRANSFER CARD (Inferred)
// ============================================

function TransferCard({ transfer }: { transfer: InferredTransfer }) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = {
    needs_input: <AlertTriangle className="w-4 h-4 text-amber-500" />,
    suggested: <Clock className="w-4 h-4 text-blue-500" />,
    booked: <CheckCircle className="w-4 h-4 text-green-500" />,
    conflict: <AlertTriangle className="w-4 h-4 text-red-500" />,
  };

  const modeIcon = {
    train: <Train className="w-3 h-3" />,
    shinkansen: <Train className="w-3 h-3" />,
    bus: <Car className="w-3 h-3" />,
    taxi: <Car className="w-3 h-3" />,
    subway: <Train className="w-3 h-3" />,
  };

  return (
    <div
      className={cn(
        "p-3 rounded-lg border text-sm",
        transfer.status === "conflict"
          ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
          : transfer.status === "booked"
          ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
          : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
      )}
    >
      <div className="flex items-center gap-2">
        {statusIcon[transfer.status]}
        <div className="flex-1">
          <div className="font-medium">
            {transfer.from.city} → {transfer.to.city}
          </div>
          <div className="text-xs text-gray-500">
            {transfer.from.name || transfer.from.type} to{" "}
            {transfer.to.name || transfer.to.type}
          </div>
        </div>
        {transfer.options.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {transfer.conflict && (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400">
          ⚠️ {transfer.conflict}
        </div>
      )}

      {expanded && transfer.options.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-3 space-y-2"
        >
          {transfer.options.map((option) => (
            <TransferOptionRow key={option.id} option={option} />
          ))}
        </motion.div>
      )}
    </div>
  );
}

function TransferOptionRow({ option }: { option: TransferOption }) {
  return (
    <div
      className={cn(
        "flex items-center justify-between p-2 rounded text-xs",
        option.recommended
          ? "bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800"
          : "bg-white dark:bg-gray-700"
      )}
    >
      <div className="flex items-center gap-2">
        <Train className="w-3 h-3 text-gray-500" />
        <div>
          <div className="font-medium">{option.name}</div>
          <div className="text-gray-500">{option.duration} min</div>
        </div>
      </div>
      <div className="text-right">
        {option.cost && (
          <div className="font-medium">
            {option.cost.currency === "JPY" ? "¥" : "$"}
            {option.cost.amount.toLocaleString()}
          </div>
        )}
        {option.recommended && (
          <div className="text-purple-600 text-[10px]">Recommended</div>
        )}
      </div>
    </div>
  );
}

// ============================================
// TRIP TIMELINE PREVIEW
// ============================================

function TripTimelinePreview({
  structure,
}: {
  structure: DerivedTripStructure;
}) {
  if (structure.legs.length === 0) return null;

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 flex items-center gap-2">
        <MapPin className="w-4 h-4" />
        Your Trip Structure
      </h4>

      {/* Validation Errors */}
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

      {/* Timeline */}
      <div className="relative">
        {structure.legs.map((leg, index) => (
          <div key={leg.id} className="relative">
            {/* Leg Card */}
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

            {/* Transfer between legs */}
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

// ============================================
// MAIN COMPONENT
// ============================================

export function TripInputPanel({
  onStartPlanning,
  isLoading = false,
  className,
}: TripInputPanelProps) {
  // Trip input state
  const [tripInput, setTripInput] = useState<TripInput>(createEmptyTripInput());
  const [showAnchors, setShowAnchors] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  // Must have / must avoid input state
  const [mustHaveInput, setMustHaveInput] = useState("");
  const [mustAvoidInput, setMustAvoidInput] = useState("");

  // AI Parsing state
  const [parseState, setParseState] = useState<ParseState>({
    isParsing: false,
    parsed: null,
    error: null,
    timing: null,
  });
  const [showParseResults, setShowParseResults] = useState(false);

  // User clarifications state (for filling gaps from parsing)
  const [userClarifications, setUserClarifications] =
    useState<UserClarifications>({
      daysPerCity: {},
      startDate: "",
      endDate: "",
      totalDays: 0,
      pace: "moderate",
    });

  // Itinerary generation state
  const [itineraryState, setItineraryState] = useState<ItineraryState>({
    isGenerating: false,
    generated: false,
    error: null,
  });

  // Calculate missing fields based on parsed data
  const missingFields = useMemo(() => {
    if (!parseState.parsed) return [];
    return getMissingClarifications(parseState.parsed);
  }, [parseState.parsed]);

  // Check if we have enough info to generate itinerary
  const canGenerateItinerary = useMemo(() => {
    if (!parseState.parsed) return false;
    const destinations = parseState.parsed.extractedEntities.destinations || [];
    const dates = parseState.parsed.extractedEntities.dates;

    // Need at least destinations
    if (destinations.length === 0) return false;

    // Need start date (from parsed or user input)
    const hasStartDate = dates?.start || userClarifications.startDate;
    if (!hasStartDate) return false;

    // Need to know duration somehow
    const hasDuration =
      dates?.duration ||
      (dates?.start && dates?.end) ||
      userClarifications.totalDays > 0 ||
      Object.values(userClarifications.daysPerCity).some((d) => d > 0);
    if (!hasDuration) return false;

    return true;
  }, [parseState.parsed, userClarifications]);

  // Derive trip structure from anchors
  const derivedStructure = useMemo(() => {
    if (tripInput.flights.length === 0 && tripInput.hotels.length === 0) {
      return null;
    }
    return inferTripStructure(
      tripInput.flights,
      tripInput.hotels,
      tripInput.transfers
    );
  }, [tripInput.flights, tripInput.hotels, tripInput.transfers]);

  // Handlers
  const handlePromptChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setTripInput((prev) => ({ ...prev, prompt: e.target.value }));
    },
    []
  );

  const handleBudgetChange = useCallback((tier: BudgetTier) => {
    setTripInput((prev) => ({ ...prev, budgetTier: tier }));
  }, []);

  const handleAddFlight = useCallback(() => {
    setTripInput((prev) => ({
      ...prev,
      flights: [...prev.flights, createEmptyFlightAnchor()],
    }));
    setShowAnchors(true);
  }, []);

  const handleUpdateFlight = useCallback(
    (index: number, flight: FlightAnchor) => {
      setTripInput((prev) => ({
        ...prev,
        flights: prev.flights.map((f, i) => (i === index ? flight : f)),
      }));
    },
    []
  );

  const handleRemoveFlight = useCallback((index: number) => {
    setTripInput((prev) => ({
      ...prev,
      flights: prev.flights.filter((_, i) => i !== index),
    }));
  }, []);

  const handleAddHotel = useCallback(() => {
    setTripInput((prev) => ({
      ...prev,
      hotels: [...prev.hotels, createEmptyHotelAnchor()],
    }));
    setShowAnchors(true);
  }, []);

  const handleUpdateHotel = useCallback((index: number, hotel: HotelAnchor) => {
    setTripInput((prev) => ({
      ...prev,
      hotels: prev.hotels.map((h, i) => (i === index ? hotel : h)),
    }));
  }, []);

  const handleRemoveHotel = useCallback((index: number) => {
    setTripInput((prev) => ({
      ...prev,
      hotels: prev.hotels.filter((_, i) => i !== index),
    }));
  }, []);

  // Activity handlers
  const handleAddActivity = useCallback(() => {
    setTripInput((prev) => ({
      ...prev,
      activities: [...prev.activities, createEmptyActivityAnchor()],
    }));
    setShowAnchors(true);
  }, []);

  const handleUpdateActivity = useCallback(
    (index: number, activity: ActivityAnchor) => {
      setTripInput((prev) => ({
        ...prev,
        activities: prev.activities.map((a, i) => (i === index ? activity : a)),
      }));
    },
    []
  );

  const handleRemoveActivity = useCallback((index: number) => {
    setTripInput((prev) => ({
      ...prev,
      activities: prev.activities.filter((_, i) => i !== index),
    }));
  }, []);

  // AI Parsing handler
  const handleParseWithAI = useCallback(async () => {
    if (!tripInput.prompt.trim()) return;

    setParseState({
      isParsing: true,
      parsed: null,
      error: null,
      timing: null,
    });
    setShowParseResults(true);

    try {
      const response = await fetch("/api/trip-input/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: tripInput.prompt,
          quickValidate: true,
        }),
      });

      const data = await response.json();

      if (!data.success) {
        throw new Error(data.error || "Failed to parse input");
      }

      const { parsed } = data.data;

      // Update trip input with parsed data
      setTripInput((prev) => ({
        ...prev,
        ...parsed.tripInput,
        // Keep the original prompt
        prompt: prev.prompt,
      }));

      // Show anchors section if we extracted any
      if (
        parsed.tripInput.flights.length > 0 ||
        parsed.tripInput.hotels.length > 0 ||
        parsed.tripInput.activities.length > 0
      ) {
        setShowAnchors(true);
      }

      setParseState({
        isParsing: false,
        parsed,
        error: null,
        timing: data.timing,
      });

      // Dispatch event for debug panel
      if (typeof window !== "undefined") {
        window.dispatchEvent(
          new CustomEvent("tripInputParsed", {
            detail: { parsed, timing: data.timing },
          })
        );
      }
    } catch (error) {
      console.error("[TripInputPanel] Parse error:", error);
      setParseState({
        isParsing: false,
        parsed: null,
        error: error instanceof Error ? error.message : "Failed to parse input",
        timing: null,
      });
    }
  }, [tripInput.prompt]);

  // Apply parsed data to form
  const handleApplyParsedData = useCallback(() => {
    if (!parseState.parsed) return;

    setTripInput((prev) => ({
      ...prev,
      ...parseState.parsed!.tripInput,
      prompt: prev.prompt,
    }));

    if (
      parseState.parsed.tripInput.flights.length > 0 ||
      parseState.parsed.tripInput.hotels.length > 0 ||
      parseState.parsed.tripInput.activities.length > 0
    ) {
      setShowAnchors(true);
    }
  }, [parseState.parsed]);

  // Clear parse results
  const handleClearParseResults = useCallback(() => {
    setShowParseResults(false);
    setParseState({
      isParsing: false,
      parsed: null,
      error: null,
      timing: null,
    });
  }, []);

  const handleStartPlanning = useCallback(async () => {
    // If we have a prompt but no parsed data, auto-parse first
    if (tripInput.prompt.trim() && !parseState.parsed) {
      console.log("[TripInputPanel] No parsed data, auto-parsing first...");

      // Parse first
      setParseState({
        isParsing: true,
        parsed: null,
        error: null,
        timing: null,
      });
      setShowParseResults(true);

      try {
        const parseResponse = await fetch("/api/trip-input/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            input: tripInput.prompt,
            quickValidate: true,
          }),
        });

        const parseData = await parseResponse.json();

        if (!parseData.success) {
          throw new Error(parseData.error || "Failed to parse input");
        }

        const { parsed } = parseData.data;

        // Update state with parsed data
        setTripInput((prev) => ({
          ...prev,
          ...parsed.tripInput,
          prompt: prev.prompt,
        }));

        setParseState({
          isParsing: false,
          parsed,
          error: null,
          timing: parseData.timing,
        });

        // Dispatch parse event
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("tripInputParsed", {
              detail: { parsed, timing: parseData.timing },
            })
          );
        }

        // Now try to generate itinerary with the parsed data
        const destinations = parsed.extractedEntities.destinations || [];
        const dates = parsed.extractedEntities.dates;

        // Check if we can generate
        const hasStartDate = dates?.start || userClarifications.startDate;
        const hasDuration =
          dates?.duration ||
          (dates?.start && dates?.end) ||
          userClarifications.totalDays > 0 ||
          Object.values(userClarifications.daysPerCity).some((d) => d > 0);

        if (destinations.length === 0 || !hasStartDate || !hasDuration) {
          // Can't generate yet, show the clarification prompts
          console.log(
            "[TripInputPanel] Missing info, showing clarification prompts"
          );
          if (
            parsed.tripInput.flights.length > 0 ||
            parsed.tripInput.hotels.length > 0 ||
            parsed.tripInput.activities.length > 0
          ) {
            setShowAnchors(true);
          }
          return;
        }

        // We have enough info, proceed to generate
        const request = convertToItineraryRequest(parsed, userClarifications);
        if (request) {
          await generateItinerary(request, parsed);
        }
      } catch (error) {
        console.error("[TripInputPanel] Auto-parse error:", error);
        setParseState({
          isParsing: false,
          parsed: null,
          error:
            error instanceof Error ? error.message : "Failed to parse input",
          timing: null,
        });
      }
      return;
    }

    // If we have parsed data and can generate itinerary, call the API
    if (parseState.parsed && canGenerateItinerary) {
      const request = convertToItineraryRequest(
        parseState.parsed,
        userClarifications
      );

      if (request) {
        await generateItinerary(request, parseState.parsed);
        return;
      }
    }

    // Fallback: just call the original callback
    const structure = inferTripStructure(
      tripInput.flights,
      tripInput.hotels,
      tripInput.transfers
    );
    onStartPlanning(tripInput, structure);
  }, [
    tripInput,
    onStartPlanning,
    parseState.parsed,
    canGenerateItinerary,
    userClarifications,
  ]);

  // Helper function to generate itinerary
  const generateItinerary = useCallback(
    async (request: JapanItineraryRequest, parsed: ParsedTripInput) => {
      setItineraryState({
        isGenerating: true,
        generated: false,
        error: null,
      });

      try {
        const response = await fetch("/api/japan-itinerary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request),
        });

        const data = await response.json();

        if (!response.ok || !data.success) {
          throw new Error(data.error || "Failed to generate itinerary");
        }

        setItineraryState({
          isGenerating: false,
          generated: true,
          error: null,
        });

        // Store itinerary in localStorage so /test-ui/itinerary can use it
        if (typeof window !== "undefined") {
          localStorage.setItem(
            "generatedItinerary",
            JSON.stringify(data.data.itinerary)
          );
          console.log(
            "[TripInputPanel] Stored generated itinerary in localStorage"
          );
        }

        // Dispatch event with generated itinerary for parent components
        if (typeof window !== "undefined") {
          window.dispatchEvent(
            new CustomEvent("itineraryGenerated", {
              detail: {
                itinerary: data.data.itinerary,
                request,
                parsed,
                metadata: data.data.metadata,
              },
            })
          );
        }

        // Still call the original callback with trip structure
        const structure = inferTripStructure(
          tripInput.flights,
          tripInput.hotels,
          tripInput.transfers
        );
        onStartPlanning(tripInput, structure);
      } catch (error) {
        console.error("[TripInputPanel] Itinerary generation error:", error);
        setItineraryState({
          isGenerating: false,
          generated: false,
          error:
            error instanceof Error
              ? error.message
              : "Failed to generate itinerary",
        });
      }
    },
    [tripInput, onStartPlanning]
  );

  const hasAnchors =
    tripInput.flights.length > 0 ||
    tripInput.hotels.length > 0 ||
    tripInput.activities.length > 0;
  const canStartPlanning = tripInput.prompt.trim().length > 0 || hasAnchors;

  // Determine button state and label
  const getButtonState = () => {
    if (itineraryState.isGenerating) {
      return {
        label: "Generating Itinerary...",
        disabled: true,
        icon: "loading",
      };
    }
    if (isLoading) {
      return { label: "Planning...", disabled: true, icon: "loading" };
    }
    if (!canStartPlanning) {
      return { label: "Start Planning", disabled: true, icon: "sparkles" };
    }
    if (parseState.parsed && canGenerateItinerary) {
      return { label: "Generate Itinerary", disabled: false, icon: "sparkles" };
    }
    if (parseState.parsed && !canGenerateItinerary) {
      return {
        label: "Fill in missing info above",
        disabled: true,
        icon: "info",
      };
    }
    return { label: "Start Planning", disabled: false, icon: "sparkles" };
  };

  const buttonState = getButtonState();

  return (
    <div className={cn("flex flex-col h-full", className)}>
      {/* Main Input Area */}
      <div className="flex-1 p-4 overflow-y-auto">
        <div className="max-w-xl mx-auto space-y-4">
          {/* Hero Text Area */}
          <div className="space-y-2">
            <textarea
              value={tripInput.prompt}
              onChange={handlePromptChange}
              placeholder="Plan a trip to Japan for 2 adults, March 15-25, love food & temples..."
              rows={3}
              className="w-full px-4 py-3 text-base rounded-xl border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent resize-none"
            />
          </div>

          {/* AI Parse Button - show when there's text to parse */}
          {tripInput.prompt.trim().length > 5 && (
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleParseWithAI}
                disabled={parseState.isParsing}
                className="flex items-center gap-2 border-purple-400 text-purple-600 hover:bg-purple-50 dark:border-purple-500 dark:text-purple-400 dark:hover:bg-purple-900/20"
              >
                {parseState.isParsing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Parsing...
                  </>
                ) : (
                  <>
                    <Wand2 className="w-4 h-4" />
                    Parse with AI
                  </>
                )}
              </Button>
              {parseState.parsed && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleClearParseResults}
                  className="text-gray-500"
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          )}

          {/* AI Parse Results */}
          <AnimatePresence>
            {showParseResults &&
              (parseState.isParsing ||
                parseState.parsed ||
                parseState.error) && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-3"
                >
                  {/* Parsing indicator */}
                  {parseState.isParsing && (
                    <div className="p-4 bg-purple-50 dark:bg-purple-900/20 rounded-lg border border-purple-200 dark:border-purple-800">
                      <div className="flex items-center gap-3">
                        <Loader2 className="w-5 h-5 text-purple-600 animate-spin" />
                        <div>
                          <div className="font-medium text-purple-700 dark:text-purple-300">
                            Analyzing your trip request...
                          </div>
                          <div className="text-sm text-purple-600/70 dark:text-purple-400/70">
                            Extracting dates, destinations, bookings, and
                            preferences
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Error state */}
                  {parseState.error && (
                    <div className="p-4 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                      <div className="flex items-center gap-2 text-red-700 dark:text-red-300">
                        <AlertCircle className="w-5 h-5" />
                        <span className="font-medium">
                          Failed to parse input
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                        {parseState.error}
                      </p>
                      <p className="mt-2 text-xs text-red-500 dark:text-red-500">
                        Make sure Ollama is running with the model available.
                      </p>
                    </div>
                  )}

                  {/* Success - Show parsed results */}
                  {parseState.parsed && !parseState.isParsing && (
                    <div className="space-y-3">
                      {/* Parse summary card */}
                      <div className="p-4 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-800">
                        <div className="flex items-center justify-between mb-2">
                          <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                            <CheckCircle className="w-5 h-5" />
                            <span className="font-medium">
                              Parsed successfully!
                            </span>
                          </div>
                          {parseState.timing && (
                            <span className="text-xs text-green-600/70">
                              {(parseState.timing.parseMs / 1000).toFixed(1)}s
                            </span>
                          )}
                        </div>

                        {/* Confidence */}
                        <div className="flex items-center gap-2 mb-3">
                          <span className="text-xs text-gray-500">
                            Confidence:
                          </span>
                          <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                            <div
                              className={cn(
                                "h-full rounded-full transition-all",
                                parseState.parsed.confidence >= 0.8
                                  ? "bg-green-500"
                                  : parseState.parsed.confidence >= 0.5
                                  ? "bg-yellow-500"
                                  : "bg-red-500"
                              )}
                              style={{
                                width: `${parseState.parsed.confidence * 100}%`,
                              }}
                            />
                          </div>
                          <span className="text-xs font-medium">
                            {Math.round(parseState.parsed.confidence * 100)}%
                          </span>
                        </div>

                        {/* Extracted summary */}
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          {parseState.parsed.extractedEntities.destinations &&
                            parseState.parsed.extractedEntities.destinations
                              .length > 0 && (
                              <div className="flex items-center gap-1">
                                <MapPin className="w-3 h-3 text-gray-400" />
                                <span>
                                  {parseState.parsed.extractedEntities.destinations.join(
                                    ", "
                                  )}
                                </span>
                              </div>
                            )}
                          {parseState.parsed.extractedEntities.travelers && (
                            <div className="flex items-center gap-1">
                              <Users className="w-3 h-3 text-gray-400" />
                              <span>
                                {parseState.parsed.extractedEntities.travelers
                                  .adults || 0}{" "}
                                adults
                                {(parseState.parsed.extractedEntities.travelers
                                  .children ?? 0) > 0 &&
                                  `, ${parseState.parsed.extractedEntities.travelers.children} kids`}
                              </span>
                            </div>
                          )}
                          {parseState.parsed.extractedEntities.dates && (
                            <div className="flex items-center gap-1">
                              <Calendar className="w-3 h-3 text-gray-400" />
                              <span>
                                {parseState.parsed.extractedEntities.dates
                                  .duration ||
                                  parseState.parsed.extractedEntities.dates
                                    .start}
                              </span>
                            </div>
                          )}
                          {parseState.parsed.extractedEntities.budget && (
                            <div className="flex items-center gap-1">
                              <DollarSign className="w-3 h-3 text-gray-400" />
                              <span className="capitalize">
                                {parseState.parsed.extractedEntities.budget}
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Extracted anchors summary */}
                        <div className="mt-2 flex flex-wrap gap-2">
                          {parseState.parsed.tripInput.flights.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300">
                              <Plane className="w-3 h-3" />
                              {parseState.parsed.tripInput.flights.length}{" "}
                              flight
                              {parseState.parsed.tripInput.flights.length > 1
                                ? "s"
                                : ""}
                            </span>
                          )}
                          {parseState.parsed.tripInput.hotels.length > 0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
                              <Building2 className="w-3 h-3" />
                              {parseState.parsed.tripInput.hotels.length} hotel
                              {parseState.parsed.tripInput.hotels.length > 1
                                ? "s"
                                : ""}
                            </span>
                          )}
                          {parseState.parsed.tripInput.activities.length >
                            0 && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300">
                              🎭 {parseState.parsed.tripInput.activities.length}{" "}
                              activit
                              {parseState.parsed.tripInput.activities.length > 1
                                ? "ies"
                                : "y"}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Spelling corrections */}
                      {parseState.parsed.spellingCorrections.length > 0 && (
                        <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
                          <div className="flex items-center gap-2 text-blue-700 dark:text-blue-300 text-sm font-medium mb-2">
                            <Info className="w-4 h-4" />
                            Spelling corrections applied
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {parseState.parsed.spellingCorrections.map(
                              (correction, i) => (
                                <span
                                  key={i}
                                  className="text-xs text-blue-600 dark:text-blue-400"
                                >
                                  "{correction.original}" → "
                                  {correction.corrected}"
                                </span>
                              )
                            )}
                          </div>
                        </div>
                      )}

                      {/* Intent extraction */}
                      {parseState.parsed.intent && (
                        <div className="p-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
                          <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                            Trip Intent Detected
                          </div>
                          <div className="flex flex-wrap gap-2 text-xs">
                            <span className="px-2 py-1 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 capitalize">
                              {parseState.parsed.intent.tripType}
                            </span>
                            <span className="px-2 py-1 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 capitalize">
                              {parseState.parsed.intent.travelStyle}
                            </span>
                            <span className="px-2 py-1 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 capitalize">
                              {parseState.parsed.intent.pace} pace
                            </span>
                            {parseState.parsed.intent.goals?.map((goal, i) => (
                              <span
                                key={i}
                                className="px-2 py-1 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                              >
                                {goal}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Conflicts / Warnings */}
                      {parseState.parsed.conflicts.length > 0 && (
                        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800">
                          <div className="flex items-center gap-2 text-amber-700 dark:text-amber-300 text-sm font-medium mb-2">
                            <AlertTriangle className="w-4 h-4" />
                            Issues detected (
                            {parseState.parsed.conflicts.length})
                          </div>
                          <div className="space-y-2">
                            {parseState.parsed.conflicts.map((conflict, i) => (
                              <div key={i} className="text-xs">
                                <div
                                  className={cn(
                                    "font-medium",
                                    conflict.severity === "error"
                                      ? "text-red-600"
                                      : conflict.severity === "warning"
                                      ? "text-amber-600"
                                      : "text-blue-600"
                                  )}
                                >
                                  {conflict.message}
                                </div>
                                {conflict.suggestion && (
                                  <div className="text-gray-500 mt-0.5">
                                    💡 {conflict.suggestion}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Clarifications needed - Actionable prompts */}
                      {parseState.parsed.clarifications.length > 0 && (
                        <div className="p-3 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg border border-purple-200 dark:border-purple-700">
                          <div className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-3 flex items-center gap-2">
                            <Info className="w-4 h-4" />
                            Help us plan better:
                          </div>

                          {/* Days per city input - show for multi-city trips */}
                          {missingFields.includes("days_per_city") &&
                            parseState.parsed.extractedEntities.destinations &&
                            parseState.parsed.extractedEntities.destinations
                              .length > 1 && (
                              <div className="mb-4 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                                <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                  How many days in each city?
                                </div>
                                <div className="grid gap-2">
                                  {parseState.parsed.extractedEntities.destinations.map(
                                    (city) => (
                                      <div
                                        key={city}
                                        className="flex items-center gap-3"
                                      >
                                        <span className="text-sm text-gray-600 dark:text-gray-400 w-24 flex items-center gap-1">
                                          <MapPin className="w-3 h-3" />
                                          {city}
                                        </span>
                                        <input
                                          type="number"
                                          min="1"
                                          max="30"
                                          value={
                                            userClarifications.daysPerCity[
                                              city
                                            ] || ""
                                          }
                                          onChange={(e) => {
                                            const days = e.target.value
                                              ? parseInt(e.target.value)
                                              : 0;
                                            setUserClarifications((prev) => ({
                                              ...prev,
                                              daysPerCity: {
                                                ...prev.daysPerCity,
                                                [city]: days,
                                              },
                                            }));
                                          }}
                                          placeholder="days"
                                          className="w-20 px-2 py-1 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                                        />
                                        <span className="text-xs text-gray-400">
                                          days
                                        </span>
                                      </div>
                                    )
                                  )}
                                </div>
                                <p className="mt-2 text-xs text-gray-400">
                                  We&apos;ll suggest a breakdown based on
                                  attractions if left blank.
                                </p>
                              </div>
                            )}

                          {/* Start date input - if missing */}
                          {missingFields.includes("start_date") && (
                            <div className="mb-4 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                When does your trip start?
                              </div>
                              <input
                                type="date"
                                value={userClarifications.startDate}
                                onChange={(e) =>
                                  setUserClarifications((prev) => ({
                                    ...prev,
                                    startDate: e.target.value,
                                  }))
                                }
                                className="px-3 py-2 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                              />
                            </div>
                          )}

                          {/* Duration input - if missing */}
                          {missingFields.includes("duration") && (
                            <div className="mb-4 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                              <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                                How many total days?
                              </div>
                              <div className="flex items-center gap-2">
                                <input
                                  type="number"
                                  min="1"
                                  max="60"
                                  value={userClarifications.totalDays || ""}
                                  onChange={(e) =>
                                    setUserClarifications((prev) => ({
                                      ...prev,
                                      totalDays: e.target.value
                                        ? parseInt(e.target.value)
                                        : 0,
                                    }))
                                  }
                                  placeholder="e.g., 14"
                                  className="w-20 px-3 py-2 text-sm rounded border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                                />
                                <span className="text-sm text-gray-500">
                                  days
                                </span>
                              </div>
                            </div>
                          )}

                          {/* Pace selector */}
                          <div className="mb-3 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
                            <div className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                              What&apos;s your preferred pace?
                            </div>
                            <div className="flex gap-2">
                              {(["relaxed", "moderate", "packed"] as const).map(
                                (pace) => (
                                  <button
                                    key={pace}
                                    onClick={() =>
                                      setUserClarifications((prev) => ({
                                        ...prev,
                                        pace,
                                      }))
                                    }
                                    className={cn(
                                      "px-3 py-1.5 text-sm rounded-full transition-all capitalize",
                                      userClarifications.pace === pace
                                        ? "bg-purple-600 text-white"
                                        : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200"
                                    )}
                                  >
                                    {pace === "relaxed" && "🐢 "}
                                    {pace === "moderate" && "🚶 "}
                                    {pace === "packed" && "🏃 "}
                                    {pace}
                                  </button>
                                )
                              )}
                            </div>
                          </div>

                          {/* Other clarifications as info */}
                          {parseState.parsed.clarifications.filter(
                            (c) =>
                              !c.toLowerCase().includes("time allocation") &&
                              !c.toLowerCase().includes("days per city")
                          ).length > 0 && (
                            <div className="text-xs text-gray-500 dark:text-gray-400 space-y-1">
                              {parseState.parsed.clarifications
                                .filter(
                                  (c) =>
                                    !c
                                      .toLowerCase()
                                      .includes("time allocation") &&
                                    !c.toLowerCase().includes("days per city")
                                )
                                .map((item, i) => (
                                  <div key={i}>• {item}</div>
                                ))}
                            </div>
                          )}
                        </div>
                      )}

                      {/* Generate Itinerary CTA when we have enough info */}
                      {canGenerateItinerary && (
                        <div className="p-3 bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/20 dark:to-emerald-900/20 rounded-lg border border-green-200 dark:border-green-700">
                          <div className="flex items-center justify-between">
                            <div>
                              <div className="text-sm font-medium text-green-700 dark:text-green-300 flex items-center gap-2">
                                <CheckCircle className="w-4 h-4" />
                                Ready to generate itinerary!
                              </div>
                              <p className="text-xs text-green-600 dark:text-green-400 mt-1">
                                {parseState.parsed.extractedEntities.destinations?.join(
                                  " → "
                                )}{" "}
                                •{" "}
                                {Object.values(
                                  userClarifications.daysPerCity
                                ).reduce((a, b) => a + b, 0) ||
                                  userClarifications.totalDays ||
                                  "auto"}{" "}
                                days • {userClarifications.pace} pace
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
          </AnimatePresence>

          {/* Quick Options Row */}
          <div className="flex items-center justify-between flex-wrap gap-3">
            {/* Budget Selector */}
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-500">Budget:</span>
              <BudgetSelector
                value={tripInput.budgetTier}
                onChange={handleBudgetChange}
              />
            </div>
          </div>

          {/* Add Anchors Button (Collapsed by default) */}
          {!showAnchors && !hasAnchors && (
            <button
              onClick={() => setShowAnchors(true)}
              className="w-full py-3 px-4 rounded-xl border-2 border-dashed border-gray-200 dark:border-gray-700 text-gray-500 hover:border-purple-300 hover:text-purple-600 transition-colors flex items-center justify-center gap-2"
            >
              <Plus className="w-4 h-4" />
              Add flights, hotels, or activities I already have booked
            </button>
          )}

          {/* Anchors Section */}
          <AnimatePresence>
            {(showAnchors || hasAnchors) && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-4"
              >
                {/* Section Header */}
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300">
                    My Bookings (Anchors)
                  </h3>
                  {!hasAnchors && (
                    <button
                      onClick={() => setShowAnchors(false)}
                      className="text-xs text-gray-400 hover:text-gray-600"
                    >
                      Hide
                    </button>
                  )}
                </div>

                {/* Flights */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <Plane className="w-4 h-4" />
                    <span>Flights</span>
                  </div>
                  <AnimatePresence>
                    {tripInput.flights.map((flight, index) => (
                      <FlightAnchorInput
                        key={flight.id}
                        flight={flight}
                        index={index}
                        onChange={(f) => handleUpdateFlight(index, f)}
                        onRemove={() => handleRemoveFlight(index)}
                      />
                    ))}
                  </AnimatePresence>
                  <button
                    onClick={handleAddFlight}
                    className="w-full py-2 px-3 rounded-lg border border-dashed border-blue-200 dark:border-blue-800 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Add flight
                  </button>
                </div>

                {/* Hotels */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <Building2 className="w-4 h-4" />
                    <span>Hotels</span>
                  </div>
                  <AnimatePresence>
                    {tripInput.hotels.map((hotel, index) => (
                      <HotelAnchorInput
                        key={hotel.id}
                        hotel={hotel}
                        index={index}
                        onChange={(h) => handleUpdateHotel(index, h)}
                        onRemove={() => handleRemoveHotel(index)}
                      />
                    ))}
                  </AnimatePresence>
                  <button
                    onClick={handleAddHotel}
                    className="w-full py-2 px-3 rounded-lg border border-dashed border-amber-200 dark:border-amber-800 text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Add hotel
                  </button>
                </div>

                {/* Booked Activities & Reservations */}
                <div className="space-y-2">
                  <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <span className="text-base">🎭</span>
                    <span>Booked Activities & Reservations</span>
                  </div>
                  <p className="text-xs text-gray-400">
                    Tours, shows, restaurants, or any pre-booked experiences
                    that must be scheduled at specific times.
                  </p>
                  <AnimatePresence>
                    {tripInput.activities.map((activity, index) => (
                      <ActivityAnchorInput
                        key={activity.id}
                        activity={activity}
                        index={index}
                        onChange={(a) => handleUpdateActivity(index, a)}
                        onRemove={() => handleRemoveActivity(index)}
                      />
                    ))}
                  </AnimatePresence>
                  <button
                    onClick={handleAddActivity}
                    className="w-full py-2 px-3 rounded-lg border border-dashed border-purple-200 dark:border-purple-800 text-purple-600 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors flex items-center justify-center gap-2 text-sm"
                  >
                    <Plus className="w-4 h-4" />
                    Add booked activity
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Derived Trip Structure Preview */}
          <AnimatePresence>
            {derivedStructure && derivedStructure.legs.length > 0 && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="pt-4 border-t border-gray-200 dark:border-gray-700"
              >
                <TripTimelinePreview structure={derivedStructure} />
              </motion.div>
            )}
          </AnimatePresence>

          {/* Advanced Options (Collapsed) */}
          <div>
            <button
              onClick={() => setShowAdvanced(!showAdvanced)}
              className="text-sm text-gray-500 hover:text-gray-700 flex items-center gap-1"
            >
              {showAdvanced ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
              More options
            </button>

            <AnimatePresence>
              {showAdvanced && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="mt-3 space-y-4"
                >
                  {/* Travel Style */}
                  <div className="flex flex-wrap gap-2">
                    <span className="text-sm text-gray-500">Style:</span>
                    {["Relaxed", "Balanced", "Packed"].map((style) => (
                      <button
                        key={style}
                        className="px-3 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-purple-100 hover:text-purple-600"
                      >
                        {style}
                      </button>
                    ))}
                  </div>

                  {/* Interests */}
                  <div className="flex flex-wrap gap-2">
                    <span className="text-sm text-gray-500">Interests:</span>
                    {[
                      "🍜 Food",
                      "🏛️ Culture",
                      "🌿 Nature",
                      "🛍️ Shopping",
                      "🌙 Nightlife",
                    ].map((interest) => (
                      <button
                        key={interest}
                        className="px-3 py-1 text-xs rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-purple-100 hover:text-purple-600"
                      >
                        {interest}
                      </button>
                    ))}
                  </div>

                  {/* Must Have Activities */}
                  <div className="space-y-2">
                    <label className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                      <CheckCircle className="w-4 h-4 text-green-500" />
                      Must-have activities / places
                    </label>
                    <div className="flex flex-wrap gap-2 min-h-[32px]">
                      {tripInput.mustHave?.map((item, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                        >
                          {item}
                          <button
                            onClick={() => {
                              setTripInput((prev) => ({
                                ...prev,
                                mustHave: prev.mustHave?.filter(
                                  (_, i) => i !== index
                                ),
                              }));
                            }}
                            className="ml-1 hover:text-green-900"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={mustHaveInput}
                        onChange={(e) => setMustHaveInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && mustHaveInput.trim()) {
                            e.preventDefault();
                            setTripInput((prev) => ({
                              ...prev,
                              mustHave: [
                                ...(prev.mustHave || []),
                                mustHaveInput.trim(),
                              ],
                            }));
                            setMustHaveInput("");
                          }
                        }}
                        placeholder="e.g., Fushimi Inari, teamLab, ramen"
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          if (mustHaveInput.trim()) {
                            setTripInput((prev) => ({
                              ...prev,
                              mustHave: [
                                ...(prev.mustHave || []),
                                mustHaveInput.trim(),
                              ],
                            }));
                            setMustHaveInput("");
                          }
                        }}
                        disabled={!mustHaveInput.trim()}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-gray-400">
                      Press Enter or click + to add. These will be prioritized
                      in your itinerary.
                    </p>
                  </div>

                  {/* Must Avoid / Skip */}
                  <div className="space-y-2">
                    <label className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                      <X className="w-4 h-4 text-red-500" />
                      Things to skip / avoid
                    </label>
                    <div className="flex flex-wrap gap-2 min-h-[32px]">
                      {tripInput.mustAvoid?.map((item, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center gap-1 px-2 py-1 text-xs rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
                        >
                          {item}
                          <button
                            onClick={() => {
                              setTripInput((prev) => ({
                                ...prev,
                                mustAvoid: prev.mustAvoid?.filter(
                                  (_, i) => i !== index
                                ),
                              }));
                            }}
                            className="ml-1 hover:text-red-900"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={mustAvoidInput}
                        onChange={(e) => setMustAvoidInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && mustAvoidInput.trim()) {
                            e.preventDefault();
                            setTripInput((prev) => ({
                              ...prev,
                              mustAvoid: [
                                ...(prev.mustAvoid || []),
                                mustAvoidInput.trim(),
                              ],
                            }));
                            setMustAvoidInput("");
                          }
                        }}
                        placeholder="e.g., raw fish, crowded tourist spots, long walks"
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={() => {
                          if (mustAvoidInput.trim()) {
                            setTripInput((prev) => ({
                              ...prev,
                              mustAvoid: [
                                ...(prev.mustAvoid || []),
                                mustAvoidInput.trim(),
                              ],
                            }));
                            setMustAvoidInput("");
                          }
                        }}
                        disabled={!mustAvoidInput.trim()}
                      >
                        <Plus className="w-4 h-4" />
                      </Button>
                    </div>
                    <p className="text-xs text-gray-400">
                      These will be excluded from suggestions. Can include
                      foods, activities, or places.
                    </p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex-shrink-0 p-4 border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
        <div className="max-w-xl mx-auto">
          <Button
            variant="primary"
            size="lg"
            onClick={handleStartPlanning}
            disabled={buttonState.disabled}
            className="w-full"
          >
            {buttonState.icon === "loading" ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-5 h-5 animate-spin" />
                {buttonState.label}
              </span>
            ) : buttonState.icon === "info" ? (
              <span className="flex items-center gap-2">
                <Info className="w-5 h-5" />
                {buttonState.label}
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <Sparkles className="w-5 h-5" />
                {buttonState.label}
              </span>
            )}
          </Button>

          {/* Itinerary generation error */}
          {itineraryState.error && (
            <div className="mt-2 p-2 bg-red-50 dark:bg-red-900/20 rounded text-sm text-red-600 dark:text-red-400 flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              {itineraryState.error}
            </div>
          )}

          {/* Success - Link to view full itinerary */}
          {itineraryState.generated && (
            <div className="mt-2 p-3 bg-green-50 dark:bg-green-900/20 rounded-lg border border-green-200 dark:border-green-700 flex items-center justify-between">
              <div className="flex items-center gap-2 text-green-700 dark:text-green-300">
                <CheckCircle className="w-5 h-5" />
                <span className="text-sm font-medium">
                  Itinerary generated!
                </span>
              </div>
              <a
                href="/test-ui/itinerary"
                className="px-3 py-1.5 text-sm font-medium rounded-lg bg-green-600 hover:bg-green-700 text-white transition-colors flex items-center gap-1"
              >
                View Itinerary
                <ChevronRight className="w-4 h-4" />
              </a>
            </div>
          )}

          {/* Summary */}
          {derivedStructure && derivedStructure.legs.length > 0 && (
            <div className="mt-2 text-center text-xs text-gray-500">
              {derivedStructure.totalNights} nights •{" "}
              {derivedStructure.cities.join(" → ")}
              {derivedStructure.errors.length > 0 && (
                <span className="text-red-500 ml-2">
                  ({derivedStructure.errors.length} issue
                  {derivedStructure.errors.length > 1 ? "s" : ""} to resolve)
                </span>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatDateShort(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

export default TripInputPanel;
