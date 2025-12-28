/**
 * Unified Itinerary View Component
 *
 * Combines both view modes:
 * 1. Tabbed Day View - Shows one day at a time with tabs to switch between days
 * 2. List View - Shows all days in a scrollable list with drag-drop reordering
 *
 * Both modes support:
 * - Activity selection from multiple options (carousel)
 * - Map integration
 * - Commute information
 * - Drag-and-drop reordering (when enabled)
 * - Move activities between days
 * - Consistent styling
 */

"use client";

import { useState, useCallback, useMemo } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import {
  Calendar,
  MapPin,
  Wallet,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  GripVertical,
  List,
  LayoutGrid,
  Clock,
  Check,
  Undo2,
  Redo2,
  AlertTriangle,
  AlertCircle,
  Info,
  Lock,
  Unlock,
  Trash2,
  Merge,
  Split,
  MessageSquare,
  Send,
  X,
  Footprints,
  Zap,
  Coffee,
} from "lucide-react";
import { useTravelFeasibility } from "@/hooks/useTravelFeasibility";
import { parseDirective, executeDirective } from "@/lib/chat-directive-parser";
import { cn } from "@/lib/utils";
import { SlotOptions } from "./SlotOptions";
import { selectOption } from "@/lib/structured-itinerary-parser";
import { ItineraryMap } from "@/components/map/ItineraryMap";
import type {
  StructuredItineraryData,
  DayWithOptions,
  SlotWithOptions,
  ItinerarySlotType,
  SlotBehavior,
  SlotDependency,
  ActivityCluster,
  ActivityOption,
} from "@/types/structured-itinerary";

// ============================================
// TYPES & CONSTANTS
// ============================================

type ViewMode = "tabbed" | "list";

// Slot types in chronological order (morning to evening)
const SLOT_TYPE_ORDER: Record<string, number> = {
  morning: 0,
  breakfast: 1,
  lunch: 2,
  afternoon: 3,
  dinner: 4,
  evening: 5,
};

// Default start times for each slot type (natural meal/activity times)
const SLOT_DEFAULT_START_TIMES: Record<string, number> = {
  morning: 9 * 60, // 09:00
  breakfast: 8 * 60, // 08:00
  lunch: 12 * 60, // 12:00
  afternoon: 14 * 60, // 14:00
  dinner: 19 * 60, // 19:00
  evening: 20 * 60, // 20:00
};

// ============================================
// SEMANTIC MODEL HELPERS
// ============================================

/**
 * Calculate rigidity score for a slot based on its properties
 * Higher score = more fixed (anchors, booked tickets)
 * Lower score = more flexible (optional activities)
 */
function calculateRigidityScore(slot: SlotWithOptions): number {
  // If explicitly set, use that
  if (slot.rigidityScore !== undefined) {
    return slot.rigidityScore;
  }

  // Calculate based on behavior type
  if (slot.behavior) {
    const behaviorScores: Record<SlotBehavior, number> = {
      anchor: 1.0,
      travel: 0.9,
      meal: 0.6,
      flex: 0.4,
      optional: 0.2,
    };
    return behaviorScores[slot.behavior];
  }

  // Infer from slot properties
  let score = 0.5; // Default middle ground

  // Locked slots are rigid
  if (slot.isLocked) {
    score = 1.0;
  }
  // Slots with bookings are more rigid
  else if (slot.fragility?.bookingRequired) {
    score = 0.9;
  }
  // Meal slots have moderate rigidity
  else if (
    slot.slotType === "breakfast" ||
    slot.slotType === "lunch" ||
    slot.slotType === "dinner"
  ) {
    score = 0.6;
  }
  // Empty slots are fully flexible
  else if (slot.options.length === 0) {
    score = 0.0;
  }

  return score;
}

/**
 * Infer slot behavior from its properties
 */
function inferSlotBehavior(slot: SlotWithOptions): SlotBehavior {
  if (slot.behavior) {
    return slot.behavior;
  }

  // Infer from properties
  if (slot.isLocked || slot.fragility?.bookingRequired) {
    return "anchor";
  }
  if (
    slot.slotType === "breakfast" ||
    slot.slotType === "lunch" ||
    slot.slotType === "dinner"
  ) {
    return "meal";
  }
  if (slot.options.length === 0) {
    return "optional";
  }
  return "flex";
}

/**
 * Get visual properties for a slot behavior
 */
function getSlotBehaviorVisuals(behavior: SlotBehavior): {
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
} {
  const visuals: Record<
    SlotBehavior,
    {
      icon: string;
      color: string;
      bgColor: string;
      borderColor: string;
      label: string;
    }
  > = {
    anchor: {
      icon: "🔒",
      color: "text-red-600 dark:text-red-400",
      bgColor: "bg-red-50 dark:bg-red-900/20",
      borderColor: "border-red-300 dark:border-red-700",
      label: "Fixed",
    },
    travel: {
      icon: "🚃",
      color: "text-blue-600 dark:text-blue-400",
      bgColor: "bg-blue-50 dark:bg-blue-900/20",
      borderColor: "border-blue-300 dark:border-blue-700",
      label: "Travel",
    },
    meal: {
      icon: "🍽️",
      color: "text-green-600 dark:text-green-400",
      bgColor: "bg-green-50 dark:bg-green-900/20",
      borderColor: "border-green-300 dark:border-green-700",
      label: "Meal",
    },
    flex: {
      icon: "↔️",
      color: "text-purple-600 dark:text-purple-400",
      bgColor: "bg-purple-50 dark:bg-purple-900/20",
      borderColor: "border-purple-300 dark:border-purple-700",
      label: "Flexible",
    },
    optional: {
      icon: "○",
      color: "text-gray-500 dark:text-gray-400",
      bgColor: "bg-gray-50 dark:bg-gray-900/20",
      borderColor: "border-gray-300 dark:border-gray-600",
      label: "Optional",
    },
  };
  return visuals[behavior];
}

/**
 * Check for dependency violations between slots
 */
function checkDependencyViolations(
  slots: SlotWithOptions[],
  dependencies: SlotDependency[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const dep of dependencies) {
    const sourceSlotIndex = slots.findIndex(
      (s) => s.slotId === dep.targetSlotId
    );
    if (sourceSlotIndex === -1) continue;

    // Find the slot that has this dependency
    const dependentSlot = slots.find((s) => s.dependencies?.includes(dep));
    if (!dependentSlot) continue;

    const dependentIndex = slots.findIndex(
      (s) => s.slotId === dependentSlot.slotId
    );

    switch (dep.type) {
      case "must-before":
        if (sourceSlotIndex >= dependentIndex) {
          issues.push({
            type: "error",
            slotId: dependentSlot.slotId,
            message: `Ordering constraint violated`,
            details: `${dependentSlot.slotType} must come before ${slots[sourceSlotIndex].slotType}`,
          });
        }
        break;
      case "must-after":
        if (sourceSlotIndex <= dependentIndex) {
          issues.push({
            type: "error",
            slotId: dependentSlot.slotId,
            message: `Ordering constraint violated`,
            details: `${dependentSlot.slotType} must come after ${slots[sourceSlotIndex].slotType}`,
          });
        }
        break;
    }
  }

  return issues;
}

/**
 * Calculate clusters from activity locations
 * Groups activities within 1km radius
 */
function calculateClusters(slots: SlotWithOptions[]): ActivityCluster[] {
  const clusters: ActivityCluster[] = [];
  const clusterRadius = 1000; // 1km in meters
  const processedSlots = new Set<string>();

  for (const slot of slots) {
    if (processedSlots.has(slot.slotId)) continue;

    const selectedOption =
      slot.options.find((o) => o.id === slot.selectedOptionId) ||
      slot.options[0];
    if (!selectedOption?.activity?.place?.coordinates) continue;

    const coords = selectedOption.activity.place.coordinates;
    const clusterMembers: string[] = [slot.slotId];
    processedSlots.add(slot.slotId);

    // Find nearby slots
    for (const otherSlot of slots) {
      if (processedSlots.has(otherSlot.slotId)) continue;

      const otherOption =
        otherSlot.options.find((o) => o.id === otherSlot.selectedOptionId) ||
        otherSlot.options[0];
      if (!otherOption?.activity?.place?.coordinates) continue;

      const otherCoords = otherOption.activity.place.coordinates;
      const distance = haversineDistance(
        coords.lat,
        coords.lng,
        otherCoords.lat,
        otherCoords.lng
      );

      if (distance <= clusterRadius) {
        clusterMembers.push(otherSlot.slotId);
        processedSlots.add(otherSlot.slotId);
      }
    }

    if (clusterMembers.length > 1) {
      // Calculate centroid
      let totalLat = 0,
        totalLng = 0;
      for (const memberId of clusterMembers) {
        const memberSlot = slots.find((s) => s.slotId === memberId);
        const memberOption =
          memberSlot?.options.find(
            (o) => o.id === memberSlot.selectedOptionId
          ) || memberSlot?.options[0];
        if (memberOption?.activity?.place?.coordinates) {
          totalLat += memberOption.activity.place.coordinates.lat;
          totalLng += memberOption.activity.place.coordinates.lng;
        }
      }

      clusters.push({
        clusterId: `cluster-${clusters.length + 1}`,
        centroidLocation: {
          lat: totalLat / clusterMembers.length,
          lng: totalLng / clusterMembers.length,
        },
        activityIds: clusterMembers,
        avgIntraClusterDistance: clusterRadius / 2, // Approximation
        name: selectedOption.activity.place.neighborhood || undefined,
      });
    }
  }

  return clusters;
}

/**
 * Haversine distance between two points in meters
 */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Get rigidity indicator component
 */
function RigidityIndicator({ score }: { score: number }) {
  const segments = 5;
  const filledSegments = Math.round(score * segments);

  return (
    <div
      className="flex gap-0.5 items-center"
      title={`Rigidity: ${(score * 100).toFixed(0)}%`}
    >
      {Array.from({ length: segments }).map((_, i) => (
        <div
          key={i}
          className={cn(
            "w-1.5 h-3 rounded-sm",
            i < filledSegments
              ? score > 0.7
                ? "bg-red-400 dark:bg-red-500"
                : score > 0.4
                ? "bg-yellow-400 dark:bg-yellow-500"
                : "bg-green-400 dark:bg-green-500"
              : "bg-gray-200 dark:bg-gray-700"
          )}
        />
      ))}
    </div>
  );
}

/**
 * Slot Behavior Badge Component
 * Shows the behavior type with appropriate icon and color
 */
function SlotBehaviorBadge({
  slot,
  showRigidity = false,
}: {
  slot: SlotWithOptions;
  showRigidity?: boolean;
}) {
  const behavior = inferSlotBehavior(slot);
  const visuals = getSlotBehaviorVisuals(behavior);
  const rigidity = calculateRigidityScore(slot);

  return (
    <div className="flex items-center gap-2">
      <span
        className={cn(
          "inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium",
          visuals.bgColor,
          visuals.color
        )}
        title={`${visuals.label} slot (rigidity: ${(rigidity * 100).toFixed(
          0
        )}%)`}
      >
        <span>{visuals.icon}</span>
        <span>{visuals.label}</span>
      </span>
      {showRigidity && <RigidityIndicator score={rigidity} />}
    </div>
  );
}

/**
 * Cluster Badge Component
 * Shows cluster membership for grouped activities
 */
function ClusterBadge({ clusterName }: { clusterName: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400"
      title={`Part of ${clusterName} cluster`}
    >
      <span>📍</span>
      <span>{clusterName}</span>
    </span>
  );
}

/**
 * Fragility Warning Badge
 * Shows weather/booking sensitivity warnings
 */
function FragilityBadge({ slot }: { slot: SlotWithOptions }) {
  if (!slot.fragility) return null;

  const warnings: Array<{ icon: string; label: string; severity: string }> = [];

  if (
    slot.fragility.weatherSensitivity === "high" ||
    slot.fragility.weatherSensitivity === "medium"
  ) {
    warnings.push({
      icon: "🌧️",
      label: "Weather sensitive",
      severity:
        slot.fragility.weatherSensitivity === "high" ? "high" : "medium",
    });
  }

  if (slot.fragility.bookingRequired) {
    warnings.push({
      icon: "🎫",
      label: "Booking required",
      severity: "high",
    });
  }

  if (
    slot.fragility.crowdSensitivity === "high" ||
    slot.fragility.crowdSensitivity === "medium"
  ) {
    warnings.push({
      icon: "👥",
      label: "Crowd sensitive",
      severity: slot.fragility.crowdSensitivity === "high" ? "high" : "medium",
    });
  }

  if (warnings.length === 0) return null;

  return (
    <div className="flex items-center gap-1">
      {warnings.map((warning, index) => (
        <span
          key={index}
          className={cn(
            "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs",
            warning.severity === "high"
              ? "bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400"
              : "bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400"
          )}
          title={warning.label}
        >
          <span>{warning.icon}</span>
        </span>
      ))}
    </div>
  );
}

/**
 * Format a timestamp to relative time ago string
 */
function formatTimeAgo(timestamp: number): string {
  const now = Date.now();
  const diffMs = now - timestamp;
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHour = Math.floor(diffMin / 60);

  if (diffSec < 60) return "just now";
  if (diffMin < 60) return `${diffMin}m ago`;
  if (diffHour < 24) return `${diffHour}h ago`;
  return new Date(timestamp).toLocaleDateString();
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Parse time string "HH:MM" to minutes since midnight
 */
function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Format minutes since midnight to "HH:MM"
 */
function formatMinutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins
    .toString()
    .padStart(2, "0")}`;
}

/**
 * Calculate activity duration from options
 */
function getActivityDuration(slot: SlotWithOptions): number {
  const selectedOption =
    slot.options.find((o) => o.id === slot.selectedOptionId) || slot.options[0];
  if (selectedOption?.activity?.duration) {
    return selectedOption.activity.duration;
  }
  // Default duration based on slot type
  const defaultDurations: Record<string, number> = {
    morning: 180, // 3 hours
    brunch: 90, // 1.5 hours
    lunch: 90, // 1.5 hours
    afternoon: 240, // 4 hours
    dinner: 120, // 2 hours
    evening: 120, // 2 hours
    night: 120, // 2 hours
  };
  return defaultDurations[slot.slotType] || 120;
}

/**
 * Check if a slot is a "free time" slot (empty, no activities)
 */
function isFreeTimeSlot(slot: SlotWithOptions): boolean {
  return slot.options.length === 0 || slot.slotId.startsWith("free-");
}

/**
 * Recalculate time slots after activity changes.
 *
 * IMPORTANT: This respects natural slot type times!
 * - Lunch stays around 12:00, not 10:25
 * - Dinner stays around 19:00, not 15:00
 *
 * SMART SLOT MANAGEMENT:
 * - When an activity is SHORTER: A FREE TIME slot is inserted if gap > 30 min
 * - When an activity is LONGER: Adjacent FREE TIME slots are consumed/shrunk
 * - Free time slots that become < 15 min are removed entirely
 * - Commute times are adjusted based on new positions
 */
function recalculateTimeSlots(
  slots: SlotWithOptions[],
  startTime: string = "09:00"
): SlotWithOptions[] {
  if (slots.length === 0) return slots;

  // PHASE 1: Filter out existing free-time slots that will be recalculated
  // Keep track of non-free slots only
  const nonFreeSlots = slots.filter((slot) => !isFreeTimeSlot(slot));

  if (nonFreeSlots.length === 0) return slots;

  const result: SlotWithOptions[] = [];
  let previousEndTime = parseTimeToMinutes(startTime);

  for (let i = 0; i < nonFreeSlots.length; i++) {
    const slot = nonFreeSlots[i];
    const duration = getActivityDuration(slot);
    const defaultStart =
      SLOT_DEFAULT_START_TIMES[slot.slotType] || previousEndTime;

    // Calculate the actual start time for this slot
    // Use the later of: previous end time OR the default start time for this slot type
    let actualStartTime: number;

    if (i === 0) {
      // First slot: use original start or default
      actualStartTime = parseTimeToMinutes(slot.timeRange.start);
    } else {
      // Subsequent slots: respect natural slot timing
      // Start at the default time for this slot type, but not before previous ends
      const commuteTime = slot.commuteFromPrevious?.duration || 15;
      const earliestPossibleStart = previousEndTime + commuteTime;

      // Use the default start time if we have enough gap, otherwise use earliest possible
      actualStartTime = Math.max(earliestPossibleStart, defaultStart);

      // Check if there's a significant gap (free time)
      const gapMinutes = actualStartTime - previousEndTime - commuteTime;

      if (gapMinutes >= 30) {
        // Insert a FREE TIME slot
        // Determine slot type based on time of day
        const freeSlotMidpoint = previousEndTime + gapMinutes / 2;
        let freeSlotType: ItinerarySlotType = "morning";
        if (freeSlotMidpoint >= 12 * 60 && freeSlotMidpoint < 14 * 60) {
          freeSlotType = "lunch";
        } else if (freeSlotMidpoint >= 14 * 60 && freeSlotMidpoint < 18 * 60) {
          freeSlotType = "afternoon";
        } else if (freeSlotMidpoint >= 18 * 60 && freeSlotMidpoint < 20 * 60) {
          freeSlotType = "dinner";
        } else if (freeSlotMidpoint >= 20 * 60) {
          freeSlotType = "evening";
        }

        const freeTimeSlot: SlotWithOptions = {
          slotId: `free-${slot.slotId}-${Date.now()}`,
          slotType: freeSlotType,
          timeRange: {
            start: formatMinutesToTime(previousEndTime),
            end: formatMinutesToTime(actualStartTime - commuteTime),
          },
          options: [], // Empty - this is free time
          selectedOptionId: undefined,
          commuteFromPrevious: undefined,
        };
        result.push(freeTimeSlot);
      }
    }

    const actualEndTime = actualStartTime + duration;

    // Update the slot with new times
    const updatedSlot: SlotWithOptions = {
      ...slot,
      timeRange: {
        start: formatMinutesToTime(actualStartTime),
        end: formatMinutesToTime(actualEndTime),
      },
      // Update commute if not first slot
      commuteFromPrevious:
        i === 0
          ? slot.commuteFromPrevious
          : {
              ...(slot.commuteFromPrevious || {
                duration: 15,
                distance: 1000,
                method: "walk" as const,
                instructions: "Walk to next location",
              }),
              // Recalculate commute duration based on actual gap
              duration: slot.commuteFromPrevious?.duration || 15,
            },
    };

    result.push(updatedSlot);
    previousEndTime = actualEndTime;
  }

  return result;
}

/**
 * Merge consecutive free time slots into a single larger slot
 * This prevents fragmentation when activities are removed or shortened
 */
function mergeConsecutiveFreeSlots(
  slots: SlotWithOptions[]
): SlotWithOptions[] {
  if (slots.length <= 1) return slots;

  const result: SlotWithOptions[] = [];
  let i = 0;

  while (i < slots.length) {
    const currentSlot = slots[i];

    // If this is not a free slot, just add it
    if (!isFreeTimeSlot(currentSlot)) {
      result.push(currentSlot);
      i++;
      continue;
    }

    // This is a free slot - check if next slots are also free
    let mergedEndTime = parseTimeToMinutes(currentSlot.timeRange.end);
    let lastMergedSlotType = currentSlot.slotType;
    let mergeCount = 0;

    while (
      i + 1 + mergeCount < slots.length &&
      isFreeTimeSlot(slots[i + 1 + mergeCount])
    ) {
      const nextFreeSlot = slots[i + 1 + mergeCount];
      mergedEndTime = parseTimeToMinutes(nextFreeSlot.timeRange.end);
      lastMergedSlotType = nextFreeSlot.slotType;
      mergeCount++;
    }

    if (mergeCount > 0) {
      // Merge into a single free slot
      const mergedSlot: SlotWithOptions = {
        ...currentSlot,
        slotId: `free-merged-${Date.now()}`,
        slotType: lastMergedSlotType, // Use the last slot's type for better context
        timeRange: {
          start: currentSlot.timeRange.start,
          end: formatMinutesToTime(mergedEndTime),
        },
      };
      result.push(mergedSlot);
      i += 1 + mergeCount; // Skip all merged slots
    } else {
      // Single free slot, just add it
      result.push(currentSlot);
      i++;
    }
  }

  return result;
}

// ============================================
// VALIDATION TYPES & FUNCTIONS
// ============================================

interface ValidationIssue {
  type: "error" | "warning" | "info";
  dayNumber?: number;
  slotId?: string;
  message: string;
  details?: string;
}

interface ItineraryImpact {
  totalCommuteChange: number; // in minutes (positive = longer, negative = shorter)
  affectedDays: number[];
  cityTransitionChanges: { from: string; to: string; impact: string }[];
  warnings: ValidationIssue[];
  timeConflicts: ValidationIssue[];
}

interface HistoryEntry {
  timestamp: number;
  itinerary: StructuredItineraryData;
  description: string;
}

/**
 * Validate itinerary for issues
 */
function validateItinerary(
  itinerary: StructuredItineraryData
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  itinerary.days.forEach((day, dayIndex) => {
    // Check for empty slots
    day.slots.forEach((slot) => {
      if (slot.options.length === 0) {
        issues.push({
          type: "warning",
          dayNumber: day.dayNumber,
          slotId: slot.slotId,
          message: `Empty ${slot.slotType} slot`,
          details: `Day ${day.dayNumber} has no activity scheduled for ${slot.slotType}`,
        });
      }
    });

    // Check for time conflicts within a day
    for (let i = 0; i < day.slots.length - 1; i++) {
      const currentSlot = day.slots[i];
      const nextSlot = day.slots[i + 1];

      const currentEnd = parseTimeToMinutes(currentSlot.timeRange.end);
      const nextStart = parseTimeToMinutes(nextSlot.timeRange.start);

      if (currentEnd > nextStart) {
        issues.push({
          type: "error",
          dayNumber: day.dayNumber,
          slotId: currentSlot.slotId,
          message: `Time overlap detected`,
          details: `${currentSlot.slotType} (ends ${currentSlot.timeRange.end}) overlaps with ${nextSlot.slotType} (starts ${nextSlot.timeRange.start})`,
        });
      }

      // Check if commute time exceeds gap
      if (nextSlot.commuteFromPrevious) {
        const gapMinutes = nextStart - currentEnd;
        if (nextSlot.commuteFromPrevious.duration > gapMinutes) {
          issues.push({
            type: "warning",
            dayNumber: day.dayNumber,
            slotId: nextSlot.slotId,
            message: `Tight schedule`,
            details: `Only ${gapMinutes} min gap but ${nextSlot.commuteFromPrevious.duration} min commute needed`,
          });
        }
      }
    }

    // Check for city transitions
    if (dayIndex > 0) {
      const prevDay = itinerary.days[dayIndex - 1];
      if (prevDay.city !== day.city && !day.cityTransition) {
        issues.push({
          type: "info",
          dayNumber: day.dayNumber,
          message: `City transition`,
          details: `Moving from ${prevDay.city} to ${day.city} - ensure transport is planned`,
        });
      }
    }

    // Check total commute time per day
    const totalCommuteMinutes = day.slots.reduce((sum, slot) => {
      return sum + (slot.commuteFromPrevious?.duration || 0);
    }, 0);

    if (totalCommuteMinutes > 180) {
      issues.push({
        type: "warning",
        dayNumber: day.dayNumber,
        message: `High commute time`,
        details: `Total commute time is ${totalCommuteMinutes} min (${(
          totalCommuteMinutes / 60
        ).toFixed(1)} hours)`,
      });
    }
  });

  return issues;
}

/**
 * Calculate impact of changes between two itinerary states
 */
function calculateImpact(
  oldItinerary: StructuredItineraryData,
  newItinerary: StructuredItineraryData
): ItineraryImpact {
  let totalCommuteChange = 0;
  const affectedDays: number[] = [];
  const cityTransitionChanges: { from: string; to: string; impact: string }[] =
    [];
  const warnings = validateItinerary(newItinerary);
  const timeConflicts = warnings.filter((w) => w.type === "error");

  // Calculate commute time differences
  newItinerary.days.forEach((newDay, dayIndex) => {
    const oldDay = oldItinerary.days[dayIndex];
    if (!oldDay) return;

    let oldDayCommute = 0;
    let newDayCommute = 0;

    oldDay.slots.forEach((slot) => {
      oldDayCommute += slot.commuteFromPrevious?.duration || 0;
    });

    newDay.slots.forEach((slot) => {
      newDayCommute += slot.commuteFromPrevious?.duration || 0;
    });

    const dayChange = newDayCommute - oldDayCommute;
    if (dayChange !== 0) {
      totalCommuteChange += dayChange;
      affectedDays.push(newDay.dayNumber);
    }

    // Check for city changes
    if (oldDay.city !== newDay.city) {
      cityTransitionChanges.push({
        from: oldDay.city,
        to: newDay.city,
        impact: `Day ${newDay.dayNumber} city changed`,
      });
    }
  });

  return {
    totalCommuteChange,
    affectedDays,
    cityTransitionChanges,
    warnings,
    timeConflicts,
  };
}

interface UnifiedItineraryViewProps {
  itinerary: StructuredItineraryData;
  onItineraryChange?: (updated: StructuredItineraryData) => void;
  className?: string;
  defaultViewMode?: ViewMode;
  enableReordering?: boolean;
}

// ============================================
// UNIFIED ITINERARY VIEW
// ============================================

export function UnifiedItineraryView({
  itinerary: initialItinerary,
  onItineraryChange,
  className,
  defaultViewMode = "tabbed",
  enableReordering = true,
}: UnifiedItineraryViewProps) {
  // Process itinerary to ensure empty slots are visible
  const processedItinerary = useMemo(() => {
    const result = { ...initialItinerary };
    result.days = result.days.map((day) => {
      const startTime = day.slots[0]?.timeRange?.start || "09:00";
      const recalculatedSlots = recalculateTimeSlots(day.slots, startTime);
      const mergedSlots = mergeConsecutiveFreeSlots(recalculatedSlots);
      return { ...day, slots: mergedSlots };
    });
    return result;
  }, [initialItinerary]);

  const [itinerary, setItinerary] = useState(processedItinerary);
  const [activeDayIndex, setActiveDayIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>(defaultViewMode);
  const [isReorderMode, setIsReorderMode] = useState(false);

  // History for undo/redo functionality
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);
  const [showImpactPanel, setShowImpactPanel] = useState(false);
  const [showHistoryPanel, setShowHistoryPanel] = useState(false);
  const [showChatInput, setShowChatInput] = useState(false);
  const [chatInput, setChatInput] = useState("");
  const [chatMessage, setChatMessage] = useState<{
    type: "success" | "error" | "info";
    text: string;
  } | null>(null);

  // Track modified slots for map highlighting
  const [modifiedSlotIds, setModifiedSlotIds] = useState<string[]>([]);
  const [showStickyMap, setShowStickyMap] = useState(true);

  // Travel feasibility hook
  const { checkMoveFeasibility } = useTravelFeasibility();

  // Calculate clusters for the active day
  const activeDayClusters = useMemo(() => {
    const activeDay = itinerary.days[activeDayIndex];
    if (!activeDay) return [];
    return calculateClusters(activeDay.slots);
  }, [itinerary, activeDayIndex]);

  // Calculate day metrics for pacing warnings
  const dayMetrics = useMemo(() => {
    return itinerary.days.map((day) => {
      let totalWalkingDistance = 0;
      let totalCommuteTime = 0;
      let activityCount = 0;

      for (const slot of day.slots) {
        if (slot.commuteFromPrevious) {
          totalCommuteTime += slot.commuteFromPrevious.duration || 0;
          if (slot.commuteFromPrevious.method === "walk") {
            totalWalkingDistance += slot.commuteFromPrevious.distance || 0;
          }
        }
        if (slot.options.length > 0) {
          activityCount++;
        }
      }

      // Calculate intensity score (0-1)
      const intensityScore = Math.min(
        1,
        (totalWalkingDistance / 15000 +
          totalCommuteTime / 240 +
          activityCount / 8) /
          3
      );

      return {
        dayNumber: day.dayNumber,
        totalWalkingDistance,
        totalCommuteTime,
        activityCount,
        intensityScore,
      };
    });
  }, [itinerary]);

  // Calculate current validation issues
  const validationIssues = useMemo(
    () => validateItinerary(itinerary),
    [itinerary]
  );

  // Calculate impact from initial state
  const impact = useMemo(() => {
    if (history.length === 0) return null;
    return calculateImpact(initialItinerary, itinerary);
  }, [initialItinerary, itinerary, history.length]);

  // Helper to save history before making changes
  const saveToHistory = useCallback(
    (description: string) => {
      setHistory((prev) => [
        ...prev.slice(-9), // Keep last 10 entries
        {
          timestamp: Date.now(),
          itinerary: JSON.parse(JSON.stringify(itinerary)),
          description,
        },
      ]);
    },
    [itinerary]
  );

  // Helper to track modified slots (auto-clear after 3 seconds)
  const trackModifiedSlot = useCallback((slotId: string) => {
    setModifiedSlotIds((prev) => [
      ...prev.filter((id) => id !== slotId),
      slotId,
    ]);
    // Clear after 3 seconds
    setTimeout(() => {
      setModifiedSlotIds((prev) => prev.filter((id) => id !== slotId));
    }, 3000);
  }, []);

  // Undo function
  const handleUndo = useCallback(() => {
    if (history.length === 0) return;

    const lastEntry = history[history.length - 1];

    // Save current state to redo stack before undoing
    setRedoStack((prev) => [
      ...prev.slice(-9),
      {
        timestamp: Date.now(),
        itinerary: JSON.parse(JSON.stringify(itinerary)),
        description: `Undo: ${lastEntry.description}`,
      },
    ]);

    setItinerary(lastEntry.itinerary);
    setHistory((prev) => prev.slice(0, -1));
    onItineraryChange?.(lastEntry.itinerary);
  }, [history, itinerary, onItineraryChange]);

  // Redo function
  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;

    const lastRedo = redoStack[redoStack.length - 1];

    // Save current state to history
    setHistory((prev) => [
      ...prev.slice(-9),
      {
        timestamp: Date.now(),
        itinerary: JSON.parse(JSON.stringify(itinerary)),
        description: `Redo: ${lastRedo.description}`,
      },
    ]);

    setItinerary(lastRedo.itinerary);
    setRedoStack((prev) => prev.slice(0, -1));
    onItineraryChange?.(lastRedo.itinerary);
  }, [redoStack, itinerary, onItineraryChange]);

  // Handle delete individual option from a slot
  const handleDeleteOption = useCallback(
    (slotId: string, optionId: string) => {
      saveToHistory("Delete option");

      // Find the slot
      let dayIndex = -1;
      let slotIndex = -1;

      for (let di = 0; di < itinerary.days.length; di++) {
        const si = itinerary.days[di].slots.findIndex(
          (s) => s.slotId === slotId
        );
        if (si !== -1) {
          dayIndex = di;
          slotIndex = si;
          break;
        }
      }

      if (dayIndex === -1 || slotIndex === -1) return;

      const slot = itinerary.days[dayIndex].slots[slotIndex];
      const remainingOptions = slot.options.filter((o) => o.id !== optionId);

      // Update the slot
      const updatedSlot: SlotWithOptions = {
        ...slot,
        options: remainingOptions,
        selectedOptionId:
          slot.selectedOptionId === optionId
            ? remainingOptions[0]?.id
            : slot.selectedOptionId,
      };

      const updatedSlots = [...itinerary.days[dayIndex].slots];
      updatedSlots[slotIndex] = updatedSlot;

      // Recalculate time slots if empty
      const startTime = updatedSlots[0]?.timeRange?.start || "09:00";
      const recalculatedSlots = recalculateTimeSlots(updatedSlots, startTime);
      const mergedSlots = mergeConsecutiveFreeSlots(recalculatedSlots);

      const updatedDays = [...itinerary.days];
      updatedDays[dayIndex] = { ...updatedDays[dayIndex], slots: mergedSlots };

      const updated = { ...itinerary, days: updatedDays };
      setItinerary(updated);
      onItineraryChange?.(updated);
      trackModifiedSlot(slotId);
    },
    [itinerary, onItineraryChange, saveToHistory, trackModifiedSlot]
  );

  // Handle chat directive input
  const handleChatDirective = useCallback(
    async (input: string) => {
      const directive = parseDirective(input);

      if (!directive) {
        setChatMessage({
          type: "error",
          text: 'I didn\'t understand that. Try: "Move TeamLab to morning" or "Delete Meiji Shrine"',
        });
        return;
      }

      // Note: These handlers are referenced from scope, not dependencies
      // The itinerary state is accessed via closure
      const result = await executeDirective(directive, itinerary, {});

      setChatMessage({
        type: result.success ? "success" : "error",
        text: result.message,
      });

      // Clear message after 5 seconds
      setTimeout(() => setChatMessage(null), 5000);
    },
    [itinerary]
  );

  // Handle option selection
  // When selecting a different option, recalculate time slots if duration changed
  const handleSelectOption = useCallback(
    (slotId: string, optionId: string) => {
      saveToHistory("Select activity option");

      // First, select the option
      let updated = selectOption(itinerary, slotId, optionId);

      // Find which day this slot belongs to and recalculate its time slots
      const dayIndex = updated.days.findIndex((day) =>
        day.slots.some((s) => s.slotId === slotId)
      );

      if (dayIndex !== -1) {
        const day = updated.days[dayIndex];
        const startTime = day.slots[0]?.timeRange?.start || "09:00";
        const recalculatedSlots = recalculateTimeSlots(day.slots, startTime);

        // Merge consecutive free slots
        const mergedSlots = mergeConsecutiveFreeSlots(recalculatedSlots);

        const updatedDays = [...updated.days];
        updatedDays[dayIndex] = {
          ...day,
          slots: mergedSlots,
        };
        updated = { ...updated, days: updatedDays };
      }

      setItinerary(updated);
      onItineraryChange?.(updated);
      trackModifiedSlot(slotId);
    },
    [itinerary, onItineraryChange, saveToHistory, trackModifiedSlot]
  );

  // Handle clear slot (remove all activities, make it free time)
  const handleClearSlot = useCallback(
    (dayIndex: number, slotId: string) => {
      saveToHistory("Clear slot");

      const updatedDays = [...itinerary.days];
      const day = updatedDays[dayIndex];
      const slotIndex = day.slots.findIndex((s) => s.slotId === slotId);

      if (slotIndex === -1) return;

      const originalSlot = day.slots[slotIndex];

      // Mark the slot as free time (empty options, rename slotId to free-*)
      const clearedSlot: SlotWithOptions = {
        ...originalSlot,
        slotId: originalSlot.slotId.startsWith("free-")
          ? originalSlot.slotId
          : `free-${originalSlot.slotId}`,
        options: [],
        selectedOptionId: undefined,
        isLocked: false,
      };

      const updatedSlots = [...day.slots];
      updatedSlots[slotIndex] = clearedSlot;

      // Merge consecutive free slots WITHOUT recalculating times
      // This preserves the time structure while combining adjacent free slots
      const mergedSlots = mergeConsecutiveFreeSlots(updatedSlots);

      updatedDays[dayIndex] = { ...day, slots: mergedSlots };
      const updated = { ...itinerary, days: updatedDays };

      setItinerary(updated);
      onItineraryChange?.(updated);
      trackModifiedSlot(slotId);
    },
    [itinerary, onItineraryChange, saveToHistory, trackModifiedSlot]
  );

  // Handle toggle lock on a slot
  const handleToggleLock = useCallback(
    (dayIndex: number, slotId: string) => {
      const updatedDays = [...itinerary.days];
      const day = updatedDays[dayIndex];
      const slotIndex = day.slots.findIndex((s) => s.slotId === slotId);

      if (slotIndex === -1) return;

      const slot = day.slots[slotIndex];
      const isNowLocked = !slot.isLocked;

      saveToHistory(isNowLocked ? "Lock slot" : "Unlock slot");

      const updatedSlot: SlotWithOptions = {
        ...slot,
        isLocked: isNowLocked,
        rigidityScore: isNowLocked ? 1.0 : undefined, // Reset rigidity when unlocking
        behavior: isNowLocked ? "anchor" : undefined, // Reset behavior when unlocking
      };

      const updatedSlots = [...day.slots];
      updatedSlots[slotIndex] = updatedSlot;

      updatedDays[dayIndex] = { ...day, slots: updatedSlots };
      const updated = { ...itinerary, days: updatedDays };

      setItinerary(updated);
      onItineraryChange?.(updated);
    },
    [itinerary, onItineraryChange, saveToHistory]
  );

  // Handle filling a free slot with an activity (from suggestions)
  const handleFillSlotWithActivity = useCallback(
    (
      dayIndex: number,
      slotId: string,
      activity: {
        name: string;
        category?: string;
        duration?: number;
        icon?: string;
      }
    ) => {
      saveToHistory("Fill slot with activity");

      const updatedDays = [...itinerary.days];
      const day = updatedDays[dayIndex];
      const slotIndex = day.slots.findIndex((s) => s.slotId === slotId);

      if (slotIndex === -1) return;

      const originalSlot = day.slots[slotIndex];

      // Calculate duration - use provided or calculate from slot time range
      const slotStartMinutes = parseTimeToMinutes(originalSlot.timeRange.start);
      const slotEndMinutes = parseTimeToMinutes(originalSlot.timeRange.end);
      const availableDuration = slotEndMinutes - slotStartMinutes;
      const activityDuration =
        activity.duration || Math.min(availableDuration, 90);

      // Create a new option for this activity
      const newOptionId = `${slotId}-filled-${Date.now()}`;
      const newOption: ActivityOption = {
        id: newOptionId,
        rank: 1,
        score: 0.8,
        activity: {
          name: activity.name,
          category: activity.category || "activity",
          duration: activityDuration,
          description: `${activity.name} - added from suggestions`,
          place: null,
          isFree: false,
          tags: [],
          source: "ai",
        },
        matchReasons: ["Added from suggestions"],
        tradeoffs: [],
      };

      // Create the filled slot - remove "free-" prefix if present
      const filledSlot: SlotWithOptions = {
        ...originalSlot,
        slotId: originalSlot.slotId.startsWith("free-")
          ? originalSlot.slotId.replace("free-", "")
          : originalSlot.slotId,
        options: [newOption],
        selectedOptionId: newOptionId,
        isLocked: false,
      };

      // Update the slot's time range based on activity duration
      const newEndMinutes = slotStartMinutes + activityDuration;
      filledSlot.timeRange = {
        start: originalSlot.timeRange.start,
        end: formatMinutesToTime(newEndMinutes),
      };

      const updatedSlots = [...day.slots];
      updatedSlots[slotIndex] = filledSlot;

      // If there's remaining time after the activity, create a new free slot
      if (newEndMinutes < slotEndMinutes - 15) {
        const remainingFreeSlot: SlotWithOptions = {
          slotId: `free-after-${newOptionId}`,
          slotType: originalSlot.slotType,
          timeRange: {
            start: formatMinutesToTime(newEndMinutes),
            end: originalSlot.timeRange.end,
          },
          options: [],
          selectedOptionId: undefined,
          commuteFromPrevious: {
            duration: 0,
            distance: 0,
            method: "walk",
            instructions: "",
          },
        };
        updatedSlots.splice(slotIndex + 1, 0, remainingFreeSlot);
      }

      // Merge consecutive free slots
      const mergedSlots = mergeConsecutiveFreeSlots(updatedSlots);

      updatedDays[dayIndex] = { ...day, slots: mergedSlots };
      const updated = { ...itinerary, days: updatedDays };

      setItinerary(updated);
      onItineraryChange?.(updated);
      trackModifiedSlot(filledSlot.slotId);
    },
    [itinerary, onItineraryChange, saveToHistory, trackModifiedSlot]
  );

  // Handle split slot (when adding activity to a large free slot)
  const handleSplitSlot = useCallback(
    (
      dayIndex: number,
      slotId: string,
      splitPoint: number, // minutes since midnight
      newActivityDuration: number // minutes
    ) => {
      saveToHistory("Split slot");

      const updatedDays = [...itinerary.days];
      const day = updatedDays[dayIndex];
      const slotIndex = day.slots.findIndex((s) => s.slotId === slotId);

      if (slotIndex === -1) return;

      const originalSlot = day.slots[slotIndex];
      const originalStart = parseTimeToMinutes(originalSlot.timeRange.start);
      const originalEnd = parseTimeToMinutes(originalSlot.timeRange.end);

      // Create the before-free slot (if there's space)
      const slots: SlotWithOptions[] = [];

      if (splitPoint > originalStart + 15) {
        // At least 15 min gap before
        slots.push({
          slotId: `${originalSlot.slotId}-before-${Date.now()}`,
          slotType: originalSlot.slotType,
          timeRange: {
            start: originalSlot.timeRange.start,
            end: formatMinutesToTime(splitPoint),
          },
          options: [],
          selectedOptionId: undefined,
          commuteFromPrevious: originalSlot.commuteFromPrevious,
        });
      }

      // Create the activity slot
      const activityEnd = Math.min(
        splitPoint + newActivityDuration,
        originalEnd
      );
      slots.push({
        slotId: `${originalSlot.slotId}-activity-${Date.now()}`,
        slotType: originalSlot.slotType,
        timeRange: {
          start: formatMinutesToTime(splitPoint),
          end: formatMinutesToTime(activityEnd),
        },
        options: [], // Will be filled by the caller
        selectedOptionId: undefined,
        commuteFromPrevious:
          slots.length > 0
            ? { duration: 0, distance: 0, method: "walk", instructions: "" }
            : originalSlot.commuteFromPrevious,
      });

      // Create the after-free slot (if there's space)
      if (activityEnd < originalEnd - 15) {
        // At least 15 min gap after
        slots.push({
          slotId: `${originalSlot.slotId}-after-${Date.now()}`,
          slotType: originalSlot.slotType,
          timeRange: {
            start: formatMinutesToTime(activityEnd),
            end: originalSlot.timeRange.end,
          },
          options: [],
          selectedOptionId: undefined,
          commuteFromPrevious: {
            duration: 0,
            distance: 0,
            method: "walk",
            instructions: "",
          },
        });
      }

      // Replace the original slot with the new slots
      const updatedSlots = [
        ...day.slots.slice(0, slotIndex),
        ...slots,
        ...day.slots.slice(slotIndex + 1),
      ];

      updatedDays[dayIndex] = { ...day, slots: updatedSlots };
      const updated = { ...itinerary, days: updatedDays };

      setItinerary(updated);
      onItineraryChange?.(updated);
    },
    [itinerary, onItineraryChange, saveToHistory]
  );

  // Handle day reordering
  const handleDaysReorder = useCallback(
    (newDays: DayWithOptions[]) => {
      // Renumber days
      const renumberedDays = newDays.map((day, index) => ({
        ...day,
        dayNumber: index + 1,
      }));

      const updated = { ...itinerary, days: renumberedDays };
      setItinerary(updated);
      onItineraryChange?.(updated);
    },
    [itinerary, onItineraryChange]
  );

  // Handle slot reordering within a day
  // IMPORTANT: When users reorder, we swap the ACTIVITIES between slots,
  // but keep the slot timeline (morning → evening) intact
  const handleSlotsReorder = useCallback(
    (dayIndex: number, newSlots: SlotWithOptions[]) => {
      const originalSlots = itinerary.days[dayIndex].slots;

      // Extract the new order of activities (options) from the dragged slots
      const reorderedActivities = newSlots.map((slot) => ({
        options: slot.options,
        selectedOptionId: slot.selectedOptionId,
        commuteFromPrevious: slot.commuteFromPrevious,
      }));

      // Apply reordered activities to the original slot structure (preserving timeline)
      const updatedSlots = originalSlots.map((originalSlot, index) => {
        if (index < reorderedActivities.length) {
          const newActivity = reorderedActivities[index];
          return {
            ...originalSlot,
            // Keep the original slot's time structure
            slotId: originalSlot.slotId,
            slotType: originalSlot.slotType,
            timeRange: originalSlot.timeRange,
            // But use the new activity's content
            options: newActivity.options,
            selectedOptionId: newActivity.selectedOptionId,
            // Recalculate commute (undefined for first, keep for others if available)
            commuteFromPrevious:
              index === 0 ? undefined : newActivity.commuteFromPrevious,
          } as SlotWithOptions;
        }
        return originalSlot;
      });

      // Recalculate time slots to ensure no gaps
      // Get the start time from the first slot
      const startTime = originalSlots[0]?.timeRange?.start || "09:00";
      const recalculatedSlots = recalculateTimeSlots(updatedSlots, startTime);

      const updatedDays = [...itinerary.days];
      updatedDays[dayIndex] = {
        ...updatedDays[dayIndex],
        slots: recalculatedSlots,
      };

      const updated = { ...itinerary, days: updatedDays };
      setItinerary(updated);
      onItineraryChange?.(updated);
    },
    [itinerary, onItineraryChange]
  );

  // Move slot to another day
  // The moved activity becomes an OPTION in the target day's slot
  // Source slot keeps remaining options or becomes empty
  const handleMoveSlotToDay = useCallback(
    (sourceDayIndex: number, slotId: string, targetDayIndex: number) => {
      const sourceDaySlots = [...itinerary.days[sourceDayIndex].slots];
      const slotIndex = sourceDaySlots.findIndex((s) => s.slotId === slotId);
      if (slotIndex === -1) return;

      const sourceSlot = sourceDaySlots[slotIndex];

      // Get the selected option (or first option) to move
      const optionToMove =
        sourceSlot.options.find((o) => o.id === sourceSlot.selectedOptionId) ||
        sourceSlot.options[0];

      if (!optionToMove) return;

      // OPTION 1: Remove just the selected option from source slot
      // Keep the slot with remaining options, or mark as empty
      const remainingOptions = sourceSlot.options.filter(
        (o) => o.id !== optionToMove.id
      );

      // Update source slot - keep it but with remaining options (or empty)
      sourceDaySlots[slotIndex] = {
        ...sourceSlot,
        options: remainingOptions,
        selectedOptionId: remainingOptions.length > 0 ? undefined : undefined,
      };

      // Get target day's existing slots
      const targetDaySlots = [...itinerary.days[targetDayIndex].slots];

      // Find a compatible slot in target day (same slot type)
      const compatibleSlotIndex = targetDaySlots.findIndex(
        (s) => s.slotType === sourceSlot.slotType
      );

      if (compatibleSlotIndex !== -1) {
        // Add as an option to the existing compatible slot
        const compatibleSlot = targetDaySlots[compatibleSlotIndex];
        targetDaySlots[compatibleSlotIndex] = {
          ...compatibleSlot,
          options: [
            ...compatibleSlot.options,
            {
              ...optionToMove,
              id: `${optionToMove.id}-moved-${Date.now()}`, // Unique ID
              rank: compatibleSlot.options.length + 1,
            },
          ],
        };
      } else {
        // No compatible slot - create a new slot with this as the only option
        // Find the best slot type based on what's available
        const existingSlotTypes = new Set(
          targetDaySlots.map((s) => s.slotType)
        );
        let targetSlotType = sourceSlot.slotType;

        if (existingSlotTypes.has(targetSlotType)) {
          // Find next available slot type
          const slotTypesInOrder: ItinerarySlotType[] = [
            "morning",
            "breakfast",
            "lunch",
            "afternoon",
            "dinner",
            "evening",
          ];
          const originalTypeIndex = slotTypesInOrder.indexOf(
            sourceSlot.slotType
          );

          for (let offset = 1; offset < slotTypesInOrder.length; offset++) {
            const afterIndex = originalTypeIndex + offset;
            if (
              afterIndex < slotTypesInOrder.length &&
              !existingSlotTypes.has(slotTypesInOrder[afterIndex])
            ) {
              targetSlotType = slotTypesInOrder[afterIndex];
              break;
            }
            const beforeIndex = originalTypeIndex - offset;
            if (
              beforeIndex >= 0 &&
              !existingSlotTypes.has(slotTypesInOrder[beforeIndex])
            ) {
              targetSlotType = slotTypesInOrder[beforeIndex];
              break;
            }
          }
        }

        // Create new slot with the moved activity as an option
        const newSlot: SlotWithOptions = {
          slotId: `${
            itinerary.days[targetDayIndex].dayNumber
          }-${targetSlotType}-${Date.now()}`,
          slotType: targetSlotType,
          timeRange: { start: "09:00", end: "12:00" }, // Will be recalculated
          options: [
            {
              ...optionToMove,
              id: `${optionToMove.id}-moved-${Date.now()}`,
              rank: 1,
            },
          ],
          selectedOptionId: undefined,
          commuteFromPrevious: undefined,
        };

        targetDaySlots.push(newSlot);

        // Sort by slot type order
        targetDaySlots.sort((a, b) => {
          const orderA = SLOT_TYPE_ORDER[a.slotType] ?? 99;
          const orderB = SLOT_TYPE_ORDER[b.slotType] ?? 99;
          return orderA - orderB;
        });
      }

      // Recalculate times for both days
      const sourceStartTime = sourceDaySlots[0]?.timeRange?.start || "09:00";
      const targetStartTime = targetDaySlots[0]?.timeRange?.start || "09:00";

      const recalculatedSourceSlots = recalculateTimeSlots(
        sourceDaySlots,
        sourceStartTime
      );
      const recalculatedTargetSlots = recalculateTimeSlots(
        targetDaySlots,
        targetStartTime
      );

      const updatedDays = itinerary.days.map((day, index) => {
        if (index === sourceDayIndex) {
          return { ...day, slots: recalculatedSourceSlots };
        }
        if (index === targetDayIndex) {
          return { ...day, slots: recalculatedTargetSlots };
        }
        return day;
      });

      const updated = { ...itinerary, days: updatedDays };
      setItinerary(updated);
      onItineraryChange?.(updated);
    },
    [itinerary, onItineraryChange]
  );

  // Navigate days (tabbed mode)
  const goToPrevDay = () => {
    if (activeDayIndex > 0) {
      setActiveDayIndex(activeDayIndex - 1);
    }
  };

  const goToNextDay = () => {
    if (activeDayIndex < itinerary.days.length - 1) {
      setActiveDayIndex(activeDayIndex + 1);
    }
  };

  return (
    <div className={cn("unified-itinerary-view", className)}>
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
              {itinerary.destination}
            </h2>
            {itinerary.country && (
              <p className="text-gray-500 dark:text-gray-400">
                {itinerary.country}
              </p>
            )}
          </div>

          {/* View Mode Toggle & Controls */}
          <div className="flex items-center gap-2">
            {/* Undo Button */}
            {history.length > 0 && (
              <div className="flex items-center gap-1">
                <button
                  onClick={handleUndo}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                  title={`Undo: ${history[history.length - 1]?.description}`}
                >
                  <Undo2 className="w-4 h-4" />
                  Undo
                </button>
                <button
                  onClick={() => setShowHistoryPanel(!showHistoryPanel)}
                  className={cn(
                    "flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm transition-all",
                    showHistoryPanel
                      ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                      : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                  )}
                  title="View change history"
                >
                  <span className="text-xs">{history.length}</span>
                </button>
              </div>
            )}

            {/* Sticky Map Toggle (only in list mode) */}
            {viewMode === "list" && (
              <button
                onClick={() => setShowStickyMap(!showStickyMap)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                  showStickyMap
                    ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                )}
              >
                <MapPin className="w-4 h-4" />
                Map
              </button>
            )}

            {/* Impact Panel Toggle */}
            {(validationIssues.length > 0 || impact) && (
              <button
                onClick={() => setShowImpactPanel(!showImpactPanel)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                  validationIssues.some((i) => i.type === "error")
                    ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                    : validationIssues.some((i) => i.type === "warning")
                    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                    : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                )}
              >
                {validationIssues.some((i) => i.type === "error") ? (
                  <AlertCircle className="w-4 h-4" />
                ) : validationIssues.some((i) => i.type === "warning") ? (
                  <AlertTriangle className="w-4 h-4" />
                ) : (
                  <Info className="w-4 h-4" />
                )}
                {validationIssues.length}{" "}
                {validationIssues.length === 1 ? "issue" : "issues"}
              </button>
            )}

            <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
              <button
                onClick={() => setViewMode("tabbed")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                  viewMode === "tabbed"
                    ? "bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                )}
              >
                <LayoutGrid className="w-4 h-4" />
                Tabs
              </button>
              <button
                onClick={() => setViewMode("list")}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
                  viewMode === "list"
                    ? "bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm"
                    : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
                )}
              >
                <List className="w-4 h-4" />
                List
              </button>
            </div>

            {/* Reorder Toggle (only in list mode) */}
            {enableReordering && viewMode === "list" && (
              <button
                onClick={() => setIsReorderMode(!isReorderMode)}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                  isReorderMode
                    ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                    : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                )}
              >
                <GripVertical className="w-4 h-4" />
                {isReorderMode ? "Done" : "Reorder"}
              </button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-600 dark:text-gray-400">
          <span className="flex items-center gap-1">
            <Calendar className="w-4 h-4" />
            {itinerary.days.length} days
          </span>
          {itinerary.estimatedBudget && (
            <span className="flex items-center gap-1">
              <Wallet className="w-4 h-4" />$
              {itinerary.estimatedBudget.total.min} - $
              {itinerary.estimatedBudget.total.max}
            </span>
          )}
        </div>
      </div>

      {/* Impact Panel */}
      <AnimatePresence>
        {showImpactPanel && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4"
          >
            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-500" />
                  Validation & Impact
                </h3>
                <button
                  onClick={() => setShowImpactPanel(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              </div>

              {/* Impact Summary */}
              {impact && (
                <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
                  <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Changes from Original
                  </h4>
                  <div className="flex flex-wrap gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-gray-400" />
                      <span
                        className={cn(
                          impact.totalCommuteChange > 0
                            ? "text-red-600 dark:text-red-400"
                            : impact.totalCommuteChange < 0
                            ? "text-green-600 dark:text-green-400"
                            : "text-gray-600 dark:text-gray-400"
                        )}
                      >
                        Commute: {impact.totalCommuteChange > 0 ? "+" : ""}
                        {impact.totalCommuteChange} min
                      </span>
                    </div>
                    {impact.affectedDays.length > 0 && (
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-gray-400" />
                        <span className="text-gray-600 dark:text-gray-400">
                          {impact.affectedDays.length} days affected
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Validation Issues List */}
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {validationIssues.length === 0 ? (
                  <div className="text-center py-4 text-gray-500 dark:text-gray-400">
                    <Check className="w-6 h-6 mx-auto mb-2 text-green-500" />
                    <p className="text-sm">No issues found!</p>
                  </div>
                ) : (
                  validationIssues.map((issue, index) => (
                    <div
                      key={index}
                      className={cn(
                        "p-3 rounded-lg flex items-start gap-3",
                        issue.type === "error" &&
                          "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800",
                        issue.type === "warning" &&
                          "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800",
                        issue.type === "info" &&
                          "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
                      )}
                    >
                      {issue.type === "error" && (
                        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                      )}
                      {issue.type === "warning" && (
                        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
                      )}
                      {issue.type === "info" && (
                        <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "font-medium text-sm",
                              issue.type === "error" &&
                                "text-red-700 dark:text-red-300",
                              issue.type === "warning" &&
                                "text-amber-700 dark:text-amber-300",
                              issue.type === "info" &&
                                "text-blue-700 dark:text-blue-300"
                            )}
                          >
                            {issue.message}
                          </span>
                          {issue.dayNumber && (
                            <span className="text-xs px-1.5 py-0.5 bg-white dark:bg-gray-800 rounded text-gray-500 dark:text-gray-400">
                              Day {issue.dayNumber}
                            </span>
                          )}
                        </div>
                        {issue.details && (
                          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                            {issue.details}
                          </p>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* History Panel */}
      <AnimatePresence>
        {showHistoryPanel && history.length > 0 && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-4"
          >
            <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                  <Undo2 className="w-4 h-4 text-purple-500" />
                  Change History
                </h3>
                <button
                  onClick={() => setShowHistoryPanel(false)}
                  className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  ✕
                </button>
              </div>

              {/* History Timeline */}
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {history
                  .slice()
                  .reverse()
                  .map((entry, index) => {
                    const isLatest = index === 0;
                    const timeAgo = formatTimeAgo(entry.timestamp);

                    return (
                      <div
                        key={entry.timestamp}
                        className={cn(
                          "flex items-center gap-3 p-2 rounded-lg",
                          isLatest
                            ? "bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700"
                            : "bg-gray-50 dark:bg-gray-900/50"
                        )}
                      >
                        <div
                          className={cn(
                            "w-2 h-2 rounded-full flex-shrink-0",
                            isLatest
                              ? "bg-purple-500"
                              : "bg-gray-300 dark:bg-gray-600"
                          )}
                        />
                        <div className="flex-1 min-w-0">
                          <span
                            className={cn(
                              "text-sm",
                              isLatest
                                ? "text-purple-700 dark:text-purple-300 font-medium"
                                : "text-gray-600 dark:text-gray-400"
                            )}
                          >
                            {entry.description}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
                          {timeAgo}
                        </span>
                        {isLatest && (
                          <button
                            onClick={handleUndo}
                            className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded hover:bg-purple-200 dark:hover:bg-purple-800/30 transition-colors"
                          >
                            Undo
                          </button>
                        )}
                      </div>
                    );
                  })}
              </div>

              {/* Clear History */}
              {history.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {history.length} change{history.length !== 1 ? "s" : ""}{" "}
                    recorded
                  </span>
                  <button
                    onClick={() => setHistory([])}
                    className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    Clear history
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reorder Mode Banner */}
      {isReorderMode && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="mb-4 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg flex items-center gap-2"
        >
          <GripVertical className="w-5 h-5 text-purple-500" />
          <div>
            <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
              Drag & Drop Mode
            </p>
            <p className="text-xs text-purple-600 dark:text-purple-400">
              Drag days or activities to reorder. Click &quot;Done&quot; when
              finished.
            </p>
          </div>
        </motion.div>
      )}

      {/* View Content - Split Layout with Sticky Map */}
      <div
        className={cn(
          "flex gap-6",
          showStickyMap && viewMode === "list" ? "flex-row" : "flex-col"
        )}
      >
        {/* Main Content */}
        <div
          className={cn(
            showStickyMap && viewMode === "list" ? "flex-1 min-w-0" : "w-full"
          )}
        >
          <AnimatePresence mode="wait">
            {viewMode === "tabbed" ? (
              <TabbedDayView
                key="tabbed"
                itinerary={itinerary}
                activeDayIndex={activeDayIndex}
                setActiveDayIndex={setActiveDayIndex}
                onSelectOption={handleSelectOption}
                goToPrevDay={goToPrevDay}
                goToNextDay={goToNextDay}
              />
            ) : (
              <ListDayView
                key="list"
                itinerary={itinerary}
                isReorderMode={isReorderMode}
                onSelectOption={handleSelectOption}
                onDaysReorder={handleDaysReorder}
                onSlotsReorder={handleSlotsReorder}
                onMoveSlotToDay={handleMoveSlotToDay}
                onClearSlot={handleClearSlot}
                onToggleLock={handleToggleLock}
                onFillSlotWithActivity={handleFillSlotWithActivity}
                onActiveDayChange={setActiveDayIndex}
              />
            )}
          </AnimatePresence>
        </div>

        {/* Sticky Map Panel (List View Only) */}
        {showStickyMap && viewMode === "list" && (
          <div className="w-[400px] flex-shrink-0">
            <div className="sticky top-4">
              <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-lg overflow-hidden">
                <div className="p-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
                  <h4 className="font-medium text-gray-900 dark:text-white flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-purple-500" />
                    Day {itinerary.days[activeDayIndex]?.dayNumber || 1} Map
                  </h4>
                  <div className="flex gap-1">
                    {itinerary.days.map((day, idx) => (
                      <button
                        key={day.dayNumber}
                        onClick={() => setActiveDayIndex(idx)}
                        className={cn(
                          "w-6 h-6 rounded-full text-xs font-medium transition-colors",
                          idx === activeDayIndex
                            ? "bg-purple-600 text-white"
                            : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                        )}
                      >
                        {day.dayNumber}
                      </button>
                    ))}
                  </div>
                </div>
                <ItineraryMap
                  itinerary={itinerary}
                  activeDayNumber={
                    itinerary.days[activeDayIndex]?.dayNumber || 1
                  }
                  modifiedSlotIds={modifiedSlotIds}
                  height="450px"
                  showRoute={true}
                />
                {/* Legend */}
                <div className="p-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex flex-wrap gap-3 text-xs">
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-amber-500" />
                      <span className="text-gray-600 dark:text-gray-400">
                        Morning
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-green-500" />
                      <span className="text-gray-600 dark:text-gray-400">
                        Lunch
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-blue-500" />
                      <span className="text-gray-600 dark:text-gray-400">
                        Afternoon
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-purple-500" />
                      <span className="text-gray-600 dark:text-gray-400">
                        Dinner
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="w-3 h-3 rounded-full bg-pink-500" />
                      <span className="text-gray-600 dark:text-gray-400">
                        Evening
                      </span>
                    </div>
                  </div>
                  {modifiedSlotIds.length > 0 && (
                    <div className="mt-2 flex items-center gap-2 text-xs text-amber-600 dark:text-amber-400">
                      <span className="w-3 h-3 rounded-full bg-amber-400 animate-pulse" />
                      <span>Recently changed</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* General Tips */}
      {itinerary.generalTips && itinerary.generalTips.length > 0 && (
        <div className="mt-8 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-xl">
          <h3 className="font-semibold text-blue-800 dark:text-blue-300 mb-2">
            💡 Travel Tips
          </h3>
          <ul className="space-y-1 text-sm text-blue-700 dark:text-blue-400">
            {itinerary.generalTips.map((tip, i) => (
              <li key={i} className="flex items-start gap-2">
                <span>•</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

// ============================================
// TABBED DAY VIEW
// ============================================

interface TabbedDayViewProps {
  itinerary: StructuredItineraryData;
  activeDayIndex: number;
  setActiveDayIndex: (index: number) => void;
  onSelectOption: (slotId: string, optionId: string) => void;
  goToPrevDay: () => void;
  goToNextDay: () => void;
}

function TabbedDayView({
  itinerary,
  activeDayIndex,
  setActiveDayIndex,
  onSelectOption,
  goToPrevDay,
  goToNextDay,
}: TabbedDayViewProps) {
  const activeDay = itinerary.days[activeDayIndex];

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      transition={{ duration: 0.2 }}
    >
      {/* Day Selector Tabs */}
      <div className="flex items-center gap-2 mb-4 overflow-x-auto pb-2">
        <button
          onClick={goToPrevDay}
          disabled={activeDayIndex === 0}
          className={cn(
            "p-2 rounded-lg transition-colors flex-shrink-0",
            activeDayIndex === 0
              ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
              : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          )}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <div className="flex gap-2 overflow-x-auto">
          {itinerary.days.map((day, index) => (
            <button
              key={day.dayNumber}
              onClick={() => setActiveDayIndex(index)}
              className={cn(
                "flex-shrink-0 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                index === activeDayIndex
                  ? "bg-purple-600 text-white"
                  : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700"
              )}
            >
              Day {day.dayNumber}
            </button>
          ))}
        </div>

        <button
          onClick={goToNextDay}
          disabled={activeDayIndex === itinerary.days.length - 1}
          className={cn(
            "p-2 rounded-lg transition-colors flex-shrink-0",
            activeDayIndex === itinerary.days.length - 1
              ? "text-gray-300 dark:text-gray-600 cursor-not-allowed"
              : "text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-800"
          )}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Active Day Content */}
      {activeDay && (
        <DayContent
          day={activeDay}
          itinerary={itinerary}
          onSelectOption={onSelectOption}
          showMap={true}
        />
      )}
    </motion.div>
  );
}

// ============================================
// LIST DAY VIEW
// ============================================

interface ListDayViewProps {
  itinerary: StructuredItineraryData;
  isReorderMode: boolean;
  onSelectOption: (slotId: string, optionId: string) => void;
  onDaysReorder: (newDays: DayWithOptions[]) => void;
  onSlotsReorder: (dayIndex: number, newSlots: SlotWithOptions[]) => void;
  onMoveSlotToDay: (
    sourceDayIndex: number,
    slotId: string,
    targetDayIndex: number
  ) => void;
  onClearSlot?: (dayIndex: number, slotId: string) => void;
  onToggleLock?: (dayIndex: number, slotId: string) => void;
  onFillSlotWithActivity?: (
    dayIndex: number,
    slotId: string,
    activity: {
      name: string;
      category?: string;
      duration?: number;
      icon?: string;
    }
  ) => void;
  onActiveDayChange?: (dayIndex: number) => void;
}

function ListDayView({
  itinerary,
  isReorderMode,
  onSelectOption,
  onDaysReorder,
  onSlotsReorder,
  onMoveSlotToDay,
  onClearSlot,
  onToggleLock,
  onFillSlotWithActivity,
  onActiveDayChange,
}: ListDayViewProps) {
  const [expandedDays, setExpandedDays] = useState<Set<number>>(
    new Set(itinerary.days.map((_, i) => i))
  );

  // Refs for day cards to track scroll position
  const dayRefs = useMemo(() => new Map<number, HTMLDivElement>(), []);

  // Set up IntersectionObserver to track which day is in view
  const observerRef = useMemo(() => {
    if (typeof window === "undefined") return null;

    return new IntersectionObserver(
      (entries) => {
        // Find the entry with the highest intersection ratio
        let maxRatio = 0;
        let activeDayIndex = -1;

        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            const dayIndex = parseInt(
              entry.target.getAttribute("data-day-index") || "0",
              10
            );
            activeDayIndex = dayIndex;
          }
        });

        if (activeDayIndex >= 0 && onActiveDayChange) {
          onActiveDayChange(activeDayIndex);
        }
      },
      {
        root: null, // viewport
        rootMargin: "-20% 0px -60% 0px", // Focus on the top portion of viewport
        threshold: [0, 0.25, 0.5, 0.75, 1],
      }
    );
  }, [onActiveDayChange]);

  // Register day refs with observer
  const registerDayRef = useCallback(
    (dayIndex: number, el: HTMLDivElement | null) => {
      if (el) {
        dayRefs.set(dayIndex, el);
        observerRef?.observe(el);
      } else {
        const existingRef = dayRefs.get(dayIndex);
        if (existingRef) {
          observerRef?.unobserve(existingRef);
          dayRefs.delete(dayIndex);
        }
      }
    },
    [dayRefs, observerRef]
  );

  // Cleanup observer on unmount
  useMemo(() => {
    return () => {
      observerRef?.disconnect();
    };
  }, [observerRef]);

  const toggleDay = (index: number) => {
    setExpandedDays((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  if (isReorderMode) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        <Reorder.Group
          axis="y"
          values={itinerary.days}
          onReorder={onDaysReorder}
          className="space-y-4"
        >
          {itinerary.days.map((day, dayIndex) => (
            <Reorder.Item key={day.dayNumber} value={day}>
              <div
                ref={(el) => registerDayRef(dayIndex, el)}
                data-day-index={dayIndex}
              >
                <DayCard
                  day={day}
                  dayIndex={dayIndex}
                  isExpanded={expandedDays.has(dayIndex)}
                  onToggle={() => toggleDay(dayIndex)}
                  onSelectOption={onSelectOption}
                  isReorderMode={isReorderMode}
                  onSlotsReorder={onSlotsReorder}
                  onMoveSlotToDay={onMoveSlotToDay}
                  onClearSlot={onClearSlot}
                  onToggleLock={onToggleLock}
                  availableDays={itinerary.days.map((d, i) => ({
                    index: i,
                    label: `Day ${d.dayNumber}`,
                  }))}
                  itinerary={itinerary}
                />
              </div>
            </Reorder.Item>
          ))}
        </Reorder.Group>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="space-y-4"
    >
      {itinerary.days.map((day, dayIndex) => (
        <div
          key={day.dayNumber}
          ref={(el) => registerDayRef(dayIndex, el)}
          data-day-index={dayIndex}
        >
          <DayCard
            day={day}
            dayIndex={dayIndex}
            isExpanded={expandedDays.has(dayIndex)}
            onToggle={() => toggleDay(dayIndex)}
            onSelectOption={onSelectOption}
            isReorderMode={false}
            onSlotsReorder={onSlotsReorder}
            onMoveSlotToDay={onMoveSlotToDay}
            onClearSlot={onClearSlot}
            onToggleLock={onToggleLock}
            availableDays={itinerary.days.map((d, i) => ({
              index: i,
              label: `Day ${d.dayNumber}`,
            }))}
            itinerary={itinerary}
          />
        </div>
      ))}
    </motion.div>
  );
}

// ============================================
// DAY CARD (for list view)
// ============================================

interface DayCardProps {
  day: DayWithOptions;
  dayIndex: number;
  isExpanded: boolean;
  onToggle: () => void;
  onSelectOption: (slotId: string, optionId: string) => void;
  isReorderMode: boolean;
  onSlotsReorder: (dayIndex: number, newSlots: SlotWithOptions[]) => void;
  onMoveSlotToDay: (
    sourceDayIndex: number,
    slotId: string,
    targetDayIndex: number
  ) => void;
  onClearSlot?: (dayIndex: number, slotId: string) => void;
  onToggleLock?: (dayIndex: number, slotId: string) => void;
  onFillSlotWithActivity?: (
    dayIndex: number,
    slotId: string,
    activity: {
      name: string;
      category?: string;
      duration?: number;
      icon?: string;
    }
  ) => void;
  availableDays: { index: number; label: string }[];
  itinerary?: StructuredItineraryData;
}

function DayCard({
  day,
  dayIndex,
  isExpanded,
  onToggle,
  onSelectOption,
  isReorderMode,
  onSlotsReorder,
  onMoveSlotToDay,
  onClearSlot,
  onToggleLock,
  onFillSlotWithActivity,
  availableDays,
  itinerary,
}: DayCardProps) {
  const activityCount = day.slots.length;
  const [showMap, setShowMap] = useState(false);

  return (
    <motion.div
      layout
      className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden"
    >
      {/* Day Header */}
      <div
        className={cn(
          "flex items-center justify-between p-4 bg-gradient-to-r from-purple-50 to-white dark:from-purple-900/20 dark:to-gray-800",
          isReorderMode && "cursor-grab active:cursor-grabbing"
        )}
      >
        <div className="flex items-center gap-3">
          {isReorderMode && (
            <GripVertical className="w-5 h-5 text-gray-400 flex-shrink-0" />
          )}
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">📅</span>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                Day {day.dayNumber}: {day.title}
              </h3>
            </div>
            <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400 mt-1">
              <span>{day.date}</span>
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {day.city}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 text-xs font-medium text-purple-600 bg-purple-100 dark:text-purple-400 dark:bg-purple-900/30 rounded-full">
            {activityCount} {activityCount === 1 ? "activity" : "activities"}
          </span>

          {/* Map Toggle for List View */}
          {!isReorderMode && itinerary && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                setShowMap(!showMap);
              }}
              className={cn(
                "p-2 rounded-lg transition-colors",
                showMap
                  ? "bg-purple-100 text-purple-600 dark:bg-purple-900/30 dark:text-purple-400"
                  : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
              )}
              title={showMap ? "Hide Map" : "Show Map"}
            >
              <MapPin className="w-4 h-4" />
            </button>
          )}

          <button
            onClick={onToggle}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <motion.div
              animate={{ rotate: isExpanded ? 180 : 0 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronDown className="w-5 h-5 text-gray-400" />
            </motion.div>
          </button>
        </div>
      </div>

      {/* Day Content */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3 }}
            className="overflow-hidden"
          >
            <div className="p-4 border-t border-gray-200 dark:border-gray-700">
              {/* Map for List View */}
              {showMap && itinerary && !isReorderMode && (
                <div className="mb-4">
                  <ItineraryMap
                    itinerary={itinerary}
                    activeDayNumber={day.dayNumber}
                    height="250px"
                    showRoute={true}
                    className="shadow-md rounded-lg"
                  />
                </div>
              )}

              {isReorderMode ? (
                <ReorderableSlots
                  day={day}
                  dayIndex={dayIndex}
                  onSlotsReorder={onSlotsReorder}
                  onMoveSlotToDay={onMoveSlotToDay}
                  onSelectOption={onSelectOption}
                  onClearSlot={onClearSlot}
                  onToggleLock={onToggleLock}
                  onFillSlotWithActivity={onFillSlotWithActivity}
                  availableDays={availableDays}
                  itinerary={itinerary}
                />
              ) : (
                <div className="space-y-2">
                  {day.slots.map((slot, index) => {
                    // Get previous slot's activity coordinates for commute directions
                    const prevSlot = index > 0 ? day.slots[index - 1] : null;
                    const prevActivityCoords =
                      prevSlot && prevSlot.options.length > 0
                        ? (
                            prevSlot.options.find(
                              (o) => o.id === prevSlot.selectedOptionId
                            ) || prevSlot.options[0]
                          )?.activity?.place?.coordinates
                        : undefined;

                    return (
                      <SlotOptions
                        key={slot.slotId}
                        slot={slot}
                        onSelectOption={onSelectOption}
                        isFirst={index === 0}
                        prevActivityCoords={prevActivityCoords}
                      />
                    );
                  })}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ============================================
// REORDERABLE SLOTS (Timeline View)
// ============================================
// Displays slots on a proportional time scale with:
// 1. Commute nodes between activities
// 2. Empty slots visible
// 3. Time markers on the left
// Users can:
// 1. Select from multiple options within a slot
// 2. Move an activity to another day (adds as option, doesn't swap)
// 3. Delete unwanted options

interface ReorderableSlotsProps {
  day: DayWithOptions;
  dayIndex: number;
  onSlotsReorder: (dayIndex: number, newSlots: SlotWithOptions[]) => void;
  onMoveSlotToDay: (
    sourceDayIndex: number,
    slotId: string,
    targetDayIndex: number
  ) => void;
  onSelectOption: (slotId: string, optionId: string) => void;
  onDeleteOption?: (slotId: string, optionId: string) => void;
  onClearSlot?: (dayIndex: number, slotId: string) => void;
  onToggleLock?: (dayIndex: number, slotId: string) => void;
  onFillSlotWithActivity?: (
    dayIndex: number,
    slotId: string,
    activity: {
      name: string;
      category?: string;
      duration?: number;
      icon?: string;
    }
  ) => void;
  availableDays: { index: number; label: string }[];
  itinerary?: StructuredItineraryData;
}

// Commute mode icons
const COMMUTE_ICONS: Record<string, string> = {
  walk: "🚶",
  transit: "🚇",
  taxi: "🚕",
  drive: "🚗",
};

// Map commute method to Google Maps travel mode
const GOOGLE_MAPS_TRAVEL_MODE: Record<string, string> = {
  walk: "walking",
  transit: "transit",
  taxi: "driving",
  drive: "driving",
};

/**
 * Generate a Google Maps directions URL
 * @param origin - Starting coordinates {lat, lng} or address string
 * @param destination - Ending coordinates {lat, lng} or address string
 * @param travelMode - Travel mode: walk, transit, taxi, drive
 * @returns Google Maps directions URL
 */
function generateGoogleMapsDirectionsUrl(
  origin: { lat: number; lng: number } | string,
  destination: { lat: number; lng: number } | string,
  travelMode: string = "transit"
): string {
  const originStr =
    typeof origin === "string"
      ? encodeURIComponent(origin)
      : `${origin.lat},${origin.lng}`;
  const destStr =
    typeof destination === "string"
      ? encodeURIComponent(destination)
      : `${destination.lat},${destination.lng}`;
  const mode = GOOGLE_MAPS_TRAVEL_MODE[travelMode] || "transit";

  return `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}&travelmode=${mode}`;
}

// Slot type colors matching the map legend
const SLOT_TYPE_COLORS: Record<string, string> = {
  morning: "#f59e0b", // amber-500
  breakfast: "#f97316", // orange-500
  lunch: "#22c55e", // green-500
  afternoon: "#3b82f6", // blue-500
  dinner: "#8b5cf6", // purple-500
  evening: "#ec4899", // pink-500
};

function ReorderableSlots({
  day,
  dayIndex,
  onMoveSlotToDay,
  onSelectOption,
  onDeleteOption,
  onClearSlot,
  onToggleLock,
  onFillSlotWithActivity,
  availableDays,
  itinerary,
}: ReorderableSlotsProps) {
  const [showMoveMenu, setShowMoveMenu] = useState<string | null>(null);
  const [expandedSlot, setExpandedSlot] = useState<string | null>(null);

  // Calculate time scale boundaries
  const slots = day.slots;
  const firstSlotStart = slots[0]?.timeRange?.start || "09:00";
  const lastSlotEnd = slots[slots.length - 1]?.timeRange?.end || "21:00";
  const dayStartMinutes = parseTimeToMinutes(firstSlotStart);
  const dayEndMinutes = parseTimeToMinutes(lastSlotEnd);
  const totalDayMinutes = Math.max(dayEndMinutes - dayStartMinutes, 60);

  // Generate time markers (every 2 hours)
  const timeMarkers: string[] = [];
  const startHour = Math.floor(dayStartMinutes / 60);
  const endHour = Math.ceil(dayEndMinutes / 60);
  for (let hour = startHour; hour <= endHour; hour += 2) {
    timeMarkers.push(`${hour.toString().padStart(2, "0")}:00`);
  }

  return (
    <div className="relative">
      {/* Time Scale Header */}
      <div className="flex items-center mb-2 pl-16">
        <div className="flex-1 flex justify-between text-xs text-gray-400 dark:text-gray-500">
          {timeMarkers.map((time) => (
            <span key={time}>{time}</span>
          ))}
        </div>
      </div>

      {/* Timeline Track */}
      <div className="relative ml-16 h-2 bg-gray-100 dark:bg-gray-800 rounded-full mb-4">
        {/* Filled slots on timeline */}
        {slots.map((slot) => {
          if (slot.options.length === 0) return null;
          const startMinutes = parseTimeToMinutes(slot.timeRange.start);
          const endMinutes = parseTimeToMinutes(slot.timeRange.end);
          const leftPercent =
            ((startMinutes - dayStartMinutes) / totalDayMinutes) * 100;
          const widthPercent =
            ((endMinutes - startMinutes) / totalDayMinutes) * 100;

          return (
            <div
              key={slot.slotId}
              className="absolute h-full bg-purple-400 dark:bg-purple-600 rounded-full"
              style={{
                left: `${leftPercent}%`,
                width: `${Math.max(widthPercent, 2)}%`,
              }}
              title={`${slot.slotType}: ${slot.timeRange.start} - ${slot.timeRange.end}`}
            />
          );
        })}
      </div>

      {/* Slots with Commute Nodes */}
      <div className="space-y-1">
        {/* City Transition (Travel Day) - Full journey from origin to destination */}
        {day.cityTransition &&
          (() => {
            const transition = day.cityTransition;
            const hasCommuteToStation = !!transition.commuteToStation;
            const hasCommuteFromStation = !!transition.commuteFromStation;

            // Transport method icons
            const transportIcons: Record<string, string> = {
              shinkansen: "🚄",
              train: "🚃",
              bus: "🚌",
              flight: "✈️",
              car: "🚗",
              ferry: "⛴️",
            };

            return (
              <div className="mb-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-700 rounded-xl">
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-xl">
                    {transportIcons[transition.method] || "🚃"}
                  </span>
                  <span className="font-semibold text-blue-800 dark:text-blue-300">
                    Travel Day: {transition.from} → {transition.to}
                  </span>
                  {transition.trainName && (
                    <span className="px-2 py-0.5 bg-blue-100 dark:bg-blue-800/40 text-blue-600 dark:text-blue-400 rounded text-xs font-medium">
                      {transition.trainName}
                    </span>
                  )}
                </div>

                {/* Step-by-step travel flow */}
                <div className="flex flex-col gap-2 text-xs">
                  {/* Step 1: From origin hotel to departure station */}
                  {hasCommuteToStation && transition.commuteToStation && (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center text-amber-600 font-medium">
                        1
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 rounded-lg flex-1">
                        <span className="text-lg">🏨</span>
                        <span className="text-gray-600 dark:text-gray-400">
                          Origin Hotel
                        </span>
                        <span className="text-gray-400">→</span>
                        <span>
                          {COMMUTE_ICONS[transition.commuteToStation.method] ||
                            "🚶"}
                        </span>
                        <span className="text-gray-600 dark:text-gray-400">
                          {transition.commuteToStation.duration} min
                        </span>
                        {transition.commuteToStation.trainLines &&
                          transition.commuteToStation.trainLines.length > 0 && (
                            <span className="text-purple-500">
                              {transition.commuteToStation.trainLines.join(
                                " → "
                              )}
                            </span>
                          )}
                        <span className="text-gray-400">→</span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          🚉 {transition.departureStation}
                        </span>
                      </div>
                    </div>
                  )}

                  {/* Step 2: Main transport (Shinkansen, etc.) */}
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center text-blue-600 font-medium">
                      {hasCommuteToStation ? "2" : "1"}
                    </div>
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 rounded-lg flex-1">
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        🚉 {transition.departureStation || transition.from}
                      </span>
                      <span className="text-gray-400">→</span>
                      <span className="text-xl">
                        {transportIcons[transition.method] || "🚃"}
                      </span>
                      <span className="font-medium text-blue-600 dark:text-blue-400">
                        {transition.duration} min
                      </span>
                      <span className="text-gray-500">
                        ({transition.departureTime} - {transition.arrivalTime})
                      </span>
                      {transition.estimatedCost && (
                        <span className="text-green-600 dark:text-green-400">
                          ¥{transition.estimatedCost.amount.toLocaleString()}
                        </span>
                      )}
                      <span className="text-gray-400">→</span>
                      <span className="font-medium text-gray-700 dark:text-gray-300">
                        🚉 {transition.arrivalStation || transition.to}
                      </span>
                    </div>
                  </div>

                  {/* Step 3: From arrival station to destination hotel */}
                  {hasCommuteFromStation && transition.commuteFromStation && (
                    <div className="flex items-center gap-2">
                      <div className="w-6 h-6 rounded-full bg-green-100 dark:bg-green-900/40 flex items-center justify-center text-green-600 font-medium">
                        {hasCommuteToStation ? "3" : "2"}
                      </div>
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-gray-800 rounded-lg flex-1">
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          🚉 {transition.arrivalStation}
                        </span>
                        <span className="text-gray-400">→</span>
                        <span>
                          {COMMUTE_ICONS[
                            transition.commuteFromStation.method
                          ] || "🚶"}
                        </span>
                        <span className="text-gray-600 dark:text-gray-400">
                          {transition.commuteFromStation.duration} min
                        </span>
                        {transition.commuteFromStation.trainLines &&
                          transition.commuteFromStation.trainLines.length >
                            0 && (
                            <span className="text-purple-500">
                              {transition.commuteFromStation.trainLines.join(
                                " → "
                              )}
                            </span>
                          )}
                        <span className="text-gray-400">→</span>
                        <span className="text-lg">🏨</span>
                        <span className="font-medium text-gray-700 dark:text-gray-300">
                          {day.accommodation?.name || "Destination Hotel"}
                        </span>
                      </div>
                    </div>
                  )}
                </div>

                {/* Total travel time summary */}
                <div className="mt-3 pt-3 border-t border-blue-200 dark:border-blue-700 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
                  <span>
                    Total travel:{" "}
                    <span className="font-medium text-blue-600 dark:text-blue-400">
                      {(transition.commuteToStation?.duration || 0) +
                        transition.duration +
                        (transition.commuteFromStation?.duration || 0)}{" "}
                      min
                    </span>
                  </span>
                  <span>•</span>
                  <span>Check-in after: {transition.arrivalTime}</span>
                </div>
              </div>
            );
          })()}

        {/* Commute from Hotel to First Activity - Skip on travel days (city transition covers this) */}
        {day.commuteFromHotel &&
          day.accommodation &&
          slots.length > 0 &&
          !day.cityTransition && // Don't show on travel days - city transition already shows hotel-to-station
          (() => {
            // Get first activity's coordinates for Google Maps link
            const firstSlot = slots.find((s) => s.options.length > 0);
            const firstActivity =
              firstSlot?.options.find(
                (o) => o.id === firstSlot.selectedOptionId
              ) || firstSlot?.options[0];
            const firstActivityCoords =
              firstActivity?.activity?.place?.coordinates;
            const hotelCoords = day.accommodation.coordinates;

            const googleMapsUrl =
              firstActivityCoords && hotelCoords
                ? generateGoogleMapsDirectionsUrl(
                    hotelCoords,
                    firstActivityCoords,
                    day.commuteFromHotel.method
                  )
                : null;

            return (
              <div className="flex items-center gap-2 py-2 pl-16 mb-2">
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-xs">
                  <span className="text-lg">🏨</span>
                  <div className="flex flex-col">
                    <span className="font-medium text-amber-800 dark:text-amber-300">
                      From: {day.accommodation.name}
                    </span>
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mt-0.5">
                      <span>
                        {COMMUTE_ICONS[day.commuteFromHotel.method] || "🚶"}
                      </span>
                      <span>{day.commuteFromHotel.duration} min</span>
                      {day.commuteFromHotel.distance && (
                        <span>
                          • {(day.commuteFromHotel.distance / 1000).toFixed(1)}
                          km
                        </span>
                      )}
                      {day.commuteFromHotel.trainLines &&
                        day.commuteFromHotel.trainLines.length > 0 && (
                          <span className="text-purple-500 dark:text-purple-400">
                            {day.commuteFromHotel.trainLines.join(" → ")}
                          </span>
                        )}
                    </div>
                  </div>
                  <span className="mx-2 text-amber-400">→</span>
                  <span className="font-medium text-amber-800 dark:text-amber-300">
                    First Activity
                  </span>
                  {googleMapsUrl && (
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-800/40 transition-colors flex items-center gap-1"
                      title="Open directions in Google Maps"
                    >
                      <span className="text-sm">🗺️</span>
                      <span className="font-medium">Directions</span>
                    </a>
                  )}
                </div>
              </div>
            );
          })()}

        {slots.map((slot, slotIndex) => {
          const isExpanded = expandedSlot === slot.slotId;
          const hasMultipleOptions = slot.options.length > 1;
          const isEmpty = slot.options.length === 0;

          const selectedOption = isEmpty
            ? null
            : slot.options.find((o) => o.id === slot.selectedOptionId) ||
              slot.options[0];

          // Get previous slot's activity for commute link
          const prevSlot = slotIndex > 0 ? slots[slotIndex - 1] : null;
          const prevSelectedOption =
            prevSlot && prevSlot.options.length > 0
              ? prevSlot.options.find(
                  (o) => o.id === prevSlot.selectedOptionId
                ) || prevSlot.options[0]
              : null;

          // Calculate slot duration for display sizing
          const startMinutes = parseTimeToMinutes(slot.timeRange.start);
          const endMinutes = parseTimeToMinutes(slot.timeRange.end);
          const durationMinutes = endMinutes - startMinutes;
          const minHeight = isEmpty ? 60 : Math.max(80, durationMinutes * 0.8);

          // Generate Google Maps URL for commute between activities
          // On travel days, first activity after transport should use hotel coordinates
          const commuteGoogleMapsUrl = (() => {
            if (!slot.commuteFromPrevious || slotIndex === 0) return null;

            // Check if this is a travel day and previous slot is transport
            const isAfterTransport =
              prevSelectedOption?.activity?.category === "transport";
            const isTravelDay = !!day.cityTransition;

            let fromCoords;
            if (
              isTravelDay &&
              isAfterTransport &&
              day.accommodation?.coordinates
            ) {
              // On travel day, use destination hotel coordinates instead of transport slot
              fromCoords = day.accommodation.coordinates;
            } else {
              fromCoords = prevSelectedOption?.activity?.place?.coordinates;
            }

            const toCoords = selectedOption?.activity?.place?.coordinates;
            if (!fromCoords || !toCoords) return null;
            return generateGoogleMapsDirectionsUrl(
              fromCoords,
              toCoords,
              slot.commuteFromPrevious.method
            );
          })();

          // Determine if we should show special "From Hotel" styling
          const isAfterTransportOnTravelDay =
            slotIndex > 0 &&
            prevSelectedOption?.activity?.category === "transport" &&
            !!day.cityTransition;

          return (
            <div key={slot.slotId}>
              {/* Commute Node (between slots) - Special styling for after transport on travel days */}
              {slotIndex > 0 && slot.commuteFromPrevious && (
                <div className="flex items-center gap-2 py-2 pl-16">
                  <div className="flex-1 border-l-2 border-dashed border-gray-300 dark:border-gray-600 h-8" />
                  {isAfterTransportOnTravelDay ? (
                    // Special hotel commute styling after arriving at destination
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-xs">
                      <span className="text-lg">🏨</span>
                      <span className="font-medium text-amber-800 dark:text-amber-300">
                        {day.accommodation?.name || "Hotel"}
                      </span>
                      <span className="text-amber-400 mx-1">→</span>
                      <span>
                        {COMMUTE_ICONS[slot.commuteFromPrevious.method] || "🚶"}
                      </span>
                      <span className="text-amber-600 dark:text-amber-400">
                        {slot.commuteFromPrevious.duration} min
                      </span>
                      {slot.commuteFromPrevious.distance && (
                        <span className="text-amber-500 dark:text-amber-500">
                          •{" "}
                          {(slot.commuteFromPrevious.distance / 1000).toFixed(
                            1
                          )}
                          km
                        </span>
                      )}
                      {commuteGoogleMapsUrl && (
                        <a
                          href={commuteGoogleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-800/40 transition-colors"
                          title="Open directions in Google Maps"
                        >
                          🗺️
                        </a>
                      )}
                    </div>
                  ) : (
                    // Normal commute styling between activities
                    <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-100 dark:bg-gray-800 rounded-full text-xs text-gray-600 dark:text-gray-400">
                      <span>
                        {COMMUTE_ICONS[slot.commuteFromPrevious.method] || "🚶"}
                      </span>
                      <span>{slot.commuteFromPrevious.duration} min</span>
                      {slot.commuteFromPrevious.distance && (
                        <span className="text-gray-400">
                          •{" "}
                          {(slot.commuteFromPrevious.distance / 1000).toFixed(
                            1
                          )}
                          km
                        </span>
                      )}
                      {slot.commuteFromPrevious.trainLines &&
                        slot.commuteFromPrevious.trainLines.length > 0 && (
                          <span className="text-purple-500 dark:text-purple-400">
                            {slot.commuteFromPrevious.trainLines.join(" → ")}
                          </span>
                        )}
                      {commuteGoogleMapsUrl && (
                        <a
                          href={commuteGoogleMapsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="ml-1 px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-800/40 transition-colors"
                          title="Open directions in Google Maps"
                        >
                          🗺️
                        </a>
                      )}
                    </div>
                  )}
                  <div className="flex-1 border-l-2 border-dashed border-gray-300 dark:border-gray-600 h-8" />
                </div>
              )}

              {/* Slot with Empty indicator if no commute */}
              {slotIndex > 0 && !slot.commuteFromPrevious && (
                <div className="flex items-center gap-2 py-1 pl-16">
                  <div className="flex-1 border-t border-dashed border-gray-200 dark:border-gray-700" />
                </div>
              )}

              {/* Slot Card */}
              <div className="flex gap-3">
                {/* Time Label */}
                <div className="w-14 flex-shrink-0 text-right">
                  <div className="text-sm font-medium text-gray-600 dark:text-gray-400">
                    {slot.timeRange.start}
                  </div>
                  <div className="text-xs text-gray-400 dark:text-gray-500">
                    {slot.timeRange.end}
                  </div>
                </div>

                {/* Slot Content */}
                <div
                  className={cn(
                    "flex-1 rounded-lg border overflow-hidden transition-all",
                    isEmpty
                      ? "border-dashed border-gray-300 dark:border-gray-600 bg-gray-50 dark:bg-gray-900/50"
                      : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 shadow-sm"
                  )}
                  style={{
                    minHeight: `${minHeight}px`,
                    borderLeftWidth: "4px",
                    borderLeftColor:
                      SLOT_TYPE_COLORS[slot.slotType] || "#6b7280",
                  }}
                >
                  {isEmpty ? (
                    /* Empty Slot - Fill with suggestions */
                    <FreeTimeSlotCard
                      slot={slot}
                      slotIndex={slotIndex}
                      previousSlot={slotIndex > 0 ? slots[slotIndex - 1] : null}
                      nextSlot={
                        slotIndex < slots.length - 1
                          ? slots[slotIndex + 1]
                          : null
                      }
                      allDaySlots={day.slots}
                      itinerary={itinerary}
                      dayIndex={dayIndex}
                      onSelectOption={onSelectOption}
                      onFillSlotWithActivity={onFillSlotWithActivity}
                    />
                  ) : (
                    /* Filled Slot */
                    <div className="p-3">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          {/* Slot Type Badge */}
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 text-xs font-medium capitalize bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 rounded">
                              {slot.slotType}
                            </span>
                            {hasMultipleOptions && (
                              <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded text-xs">
                                {slot.options.length} options
                              </span>
                            )}
                            {slot.selectedOptionId && (
                              <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                                <Check className="w-3 h-3" />
                              </span>
                            )}
                            {/* Lock indicator */}
                            {slot.isLocked && (
                              <span className="flex items-center gap-1 text-xs text-red-500 dark:text-red-400">
                                <Lock className="w-3 h-3" />
                              </span>
                            )}
                          </div>

                          {/* Activity Name */}
                          <h4 className="font-medium text-gray-900 dark:text-white">
                            {selectedOption?.activity.name}
                          </h4>

                          {/* Location */}
                          {selectedOption?.activity.place?.neighborhood && (
                            <div className="flex items-center gap-1 mt-1 text-sm text-gray-500 dark:text-gray-400">
                              <MapPin className="w-3 h-3" />
                              <span>
                                {selectedOption.activity.place.neighborhood}
                              </span>
                            </div>
                          )}

                          {/* Duration */}
                          {selectedOption?.activity.duration && (
                            <div className="flex items-center gap-1 mt-1 text-xs text-gray-400 dark:text-gray-500">
                              <Clock className="w-3 h-3" />
                              <span>
                                {selectedOption.activity.duration} min
                              </span>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex items-center gap-1">
                          {/* Lock/Unlock Button */}
                          <button
                            onClick={() => {
                              onToggleLock?.(dayIndex, slot.slotId);
                            }}
                            className={cn(
                              "p-1.5 rounded-md transition-colors",
                              slot.isLocked
                                ? "bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400"
                                : "hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-400"
                            )}
                            title={
                              slot.isLocked
                                ? "Unlock slot"
                                : "Lock slot (prevent changes)"
                            }
                          >
                            {slot.isLocked ? (
                              <Lock className="w-4 h-4" />
                            ) : (
                              <Unlock className="w-4 h-4" />
                            )}
                          </button>

                          {/* Clear Slot Button */}
                          <button
                            onClick={() => {
                              onClearSlot?.(dayIndex, slot.slotId);
                            }}
                            className="p-1.5 hover:bg-red-50 dark:hover:bg-red-900/20 text-gray-400 hover:text-red-500 rounded-md transition-colors"
                            title="Clear slot (make it free time)"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>

                          {/* Toggle options */}
                          {hasMultipleOptions && (
                            <button
                              onClick={() =>
                                setExpandedSlot(isExpanded ? null : slot.slotId)
                              }
                              className={cn(
                                "px-2 py-1 text-xs rounded-md transition-colors",
                                isExpanded
                                  ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                                  : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
                              )}
                            >
                              {isExpanded ? "Hide" : "Options"}
                            </button>
                          )}

                          {/* Move to Day Menu */}
                          <div className="relative">
                            <button
                              onClick={() =>
                                setShowMoveMenu(
                                  showMoveMenu === slot.slotId
                                    ? null
                                    : slot.slotId
                                )
                              }
                              className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-md transition-colors"
                              title="Move to another day"
                            >
                              <ChevronRight className="w-4 h-4 text-gray-400" />
                            </button>

                            {showMoveMenu === slot.slotId && (
                              <div className="absolute right-0 top-full mt-1 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 z-50 min-w-[140px]">
                                <div className="p-2 border-b border-gray-200 dark:border-gray-700 text-xs font-medium text-gray-500 dark:text-gray-400">
                                  Move to Day
                                </div>
                                {availableDays
                                  .filter((d) => d.index !== dayIndex)
                                  .map((d) => (
                                    <button
                                      key={d.index}
                                      onClick={() => {
                                        onMoveSlotToDay(
                                          dayIndex,
                                          slot.slotId,
                                          d.index
                                        );
                                        setShowMoveMenu(null);
                                      }}
                                      className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                                    >
                                      {d.label}
                                    </button>
                                  ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>

                      {/* Options List (expanded) */}
                      <AnimatePresence>
                        {isExpanded && hasMultipleOptions && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }}
                            animate={{ height: "auto", opacity: 1 }}
                            exit={{ height: 0, opacity: 0 }}
                            className="overflow-hidden mt-3 pt-3 border-t border-gray-100 dark:border-gray-700"
                          >
                            <p className="text-xs text-gray-500 dark:text-gray-400 mb-2">
                              Click to select:
                            </p>
                            <div className="space-y-2">
                              {slot.options.map((option, index) => {
                                const isSelected =
                                  option.id === slot.selectedOptionId ||
                                  (index === 0 && !slot.selectedOptionId);
                                return (
                                  <div
                                    key={option.id}
                                    className={cn(
                                      "flex items-center justify-between p-2 rounded-lg border transition-all cursor-pointer",
                                      isSelected
                                        ? "border-purple-300 bg-purple-50 dark:border-purple-600 dark:bg-purple-900/20"
                                        : "border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800 hover:border-purple-200 dark:hover:border-purple-700"
                                    )}
                                    onClick={() =>
                                      onSelectOption(slot.slotId, option.id)
                                    }
                                  >
                                    <div className="flex-1">
                                      <div className="flex items-center gap-2">
                                        {isSelected && (
                                          <Check className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                                        )}
                                        <span
                                          className={cn(
                                            "font-medium text-sm",
                                            isSelected
                                              ? "text-purple-700 dark:text-purple-300"
                                              : "text-gray-700 dark:text-gray-300"
                                          )}
                                        >
                                          {option.activity.name}
                                        </span>
                                        <span className="text-xs text-gray-400">
                                          #{option.rank}
                                        </span>
                                      </div>
                                      {option.activity.place?.neighborhood && (
                                        <p className="text-xs text-gray-500 dark:text-gray-400 ml-6">
                                          {option.activity.place.neighborhood}
                                        </p>
                                      )}
                                    </div>

                                    {/* Delete option button */}
                                    {slot.options.length > 1 &&
                                      onDeleteOption && (
                                        <button
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            onDeleteOption(
                                              slot.slotId,
                                              option.id
                                            );
                                          }}
                                          className="p-1 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
                                          title="Remove this option"
                                        >
                                          <span className="text-xs">✕</span>
                                        </button>
                                      )}
                                  </div>
                                );
                              })}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* Commute back to Hotel after Last Activity */}
        {day.commuteToHotel &&
          day.accommodation &&
          slots.length > 0 &&
          (() => {
            // Get last activity's coordinates for Google Maps link
            const lastSlotWithActivity = [...slots]
              .reverse()
              .find((s) => s.options.length > 0);
            const lastActivity =
              lastSlotWithActivity?.options.find(
                (o) => o.id === lastSlotWithActivity.selectedOptionId
              ) || lastSlotWithActivity?.options[0];
            const lastActivityCoords =
              lastActivity?.activity?.place?.coordinates;
            const hotelCoords = day.accommodation.coordinates;

            const googleMapsUrl =
              lastActivityCoords && hotelCoords
                ? generateGoogleMapsDirectionsUrl(
                    lastActivityCoords,
                    hotelCoords,
                    day.commuteToHotel.method
                  )
                : null;

            return (
              <div className="flex items-center gap-2 py-2 pl-16 mt-2">
                <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-lg text-xs">
                  <span className="font-medium text-amber-800 dark:text-amber-300">
                    Last Activity
                  </span>
                  <span className="mx-2 text-amber-400">→</span>
                  <span className="text-lg">🏨</span>
                  <div className="flex flex-col">
                    <span className="font-medium text-amber-800 dark:text-amber-300">
                      To: {day.accommodation.name}
                    </span>
                    <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 mt-0.5">
                      <span>
                        {COMMUTE_ICONS[day.commuteToHotel.method] || "🚶"}
                      </span>
                      <span>{day.commuteToHotel.duration} min</span>
                      {day.commuteToHotel.distance && (
                        <span>
                          • {(day.commuteToHotel.distance / 1000).toFixed(1)}km
                        </span>
                      )}
                      {day.commuteToHotel.trainLines &&
                        day.commuteToHotel.trainLines.length > 0 && (
                          <span className="text-purple-500 dark:text-purple-400">
                            {day.commuteToHotel.trainLines.join(" → ")}
                          </span>
                        )}
                    </div>
                  </div>
                  {googleMapsUrl && (
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="ml-2 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-800/40 transition-colors flex items-center gap-1"
                      title="Open directions in Google Maps"
                    >
                      <span className="text-sm">🗺️</span>
                      <span className="font-medium">Directions</span>
                    </a>
                  )}
                </div>
              </div>
            );
          })()}
      </div>
    </div>
  );
}

// ============================================
// FREE TIME SLOT CARD
// ============================================
// Shows when a slot is empty (free time) and allows users to fill it
// with suggested activities from the same cluster or nearby locations

interface FreeTimeSlotCardProps {
  slot: SlotWithOptions;
  slotIndex: number;
  previousSlot: SlotWithOptions | null;
  nextSlot: SlotWithOptions | null;
  allDaySlots: SlotWithOptions[];
  itinerary?: StructuredItineraryData;
  dayIndex: number;
  onSelectOption: (slotId: string, optionId: string) => void;
  onFillSlotWithActivity?: (
    dayIndex: number,
    slotId: string,
    activity: {
      name: string;
      category?: string;
      duration?: number;
      icon?: string;
    }
  ) => void;
}

// Activity suggestions based on slot type / time of day
const ACTIVITY_SUGGESTIONS: Record<
  string,
  Array<{
    id: string;
    name: string;
    category: string;
    duration: number;
    icon: string;
  }>
> = {
  morning: [
    {
      id: "morning-temple",
      name: "Visit a local temple or shrine",
      category: "Culture",
      duration: 60,
      icon: "⛩️",
    },
    {
      id: "morning-walk",
      name: "Morning walk in the park",
      category: "Nature",
      duration: 45,
      icon: "🌳",
    },
    {
      id: "morning-market",
      name: "Explore local morning market",
      category: "Shopping",
      duration: 90,
      icon: "🛒",
    },
    {
      id: "morning-museum",
      name: "Museum visit",
      category: "Culture",
      duration: 120,
      icon: "🏛️",
    },
  ],
  breakfast: [
    {
      id: "breakfast-cafe",
      name: "Cozy café breakfast",
      category: "Food",
      duration: 45,
      icon: "☕",
    },
    {
      id: "breakfast-local",
      name: "Traditional local breakfast",
      category: "Food",
      duration: 60,
      icon: "🍳",
    },
    {
      id: "breakfast-bakery",
      name: "Artisan bakery",
      category: "Food",
      duration: 30,
      icon: "🥐",
    },
  ],
  lunch: [
    {
      id: "lunch-local",
      name: "Local restaurant",
      category: "Food",
      duration: 60,
      icon: "🍜",
    },
    {
      id: "lunch-street",
      name: "Street food adventure",
      category: "Food",
      duration: 45,
      icon: "🥡",
    },
    {
      id: "lunch-upscale",
      name: "Fine dining experience",
      category: "Food",
      duration: 90,
      icon: "🍽️",
    },
  ],
  afternoon: [
    {
      id: "afternoon-garden",
      name: "Visit a garden",
      category: "Nature",
      duration: 90,
      icon: "🌸",
    },
    {
      id: "afternoon-shopping",
      name: "Shopping district",
      category: "Shopping",
      duration: 120,
      icon: "🛍️",
    },
    {
      id: "afternoon-workshop",
      name: "Cultural workshop",
      category: "Experience",
      duration: 120,
      icon: "🎨",
    },
    {
      id: "afternoon-viewpoint",
      name: "Scenic viewpoint",
      category: "Sightseeing",
      duration: 60,
      icon: "🏞️",
    },
  ],
  dinner: [
    {
      id: "dinner-traditional",
      name: "Traditional dinner",
      category: "Food",
      duration: 90,
      icon: "🍱",
    },
    {
      id: "dinner-izakaya",
      name: "Izakaya / pub experience",
      category: "Food",
      duration: 120,
      icon: "🍶",
    },
    {
      id: "dinner-fusion",
      name: "Modern fusion restaurant",
      category: "Food",
      duration: 90,
      icon: "🍴",
    },
  ],
  evening: [
    {
      id: "evening-nightlife",
      name: "Night district exploration",
      category: "Entertainment",
      duration: 120,
      icon: "🌃",
    },
    {
      id: "evening-show",
      name: "Traditional performance",
      category: "Culture",
      duration: 90,
      icon: "🎭",
    },
    {
      id: "evening-bar",
      name: "Rooftop bar",
      category: "Entertainment",
      duration: 60,
      icon: "🍸",
    },
    {
      id: "evening-walk",
      name: "Night walk",
      category: "Sightseeing",
      duration: 45,
      icon: "🌙",
    },
  ],
};

function FreeTimeSlotCard({
  slot,
  slotIndex,
  previousSlot,
  nextSlot,
  allDaySlots,
  itinerary,
  dayIndex,
  onSelectOption,
  onFillSlotWithActivity,
}: FreeTimeSlotCardProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedSuggestion, setSelectedSuggestion] = useState<string | null>(
    null
  );

  // Get suggestions based on slot type
  const staticSuggestions =
    ACTIVITY_SUGGESTIONS[slot.slotType] || ACTIVITY_SUGGESTIONS.afternoon;

  // Calculate available duration for this slot
  const startMinutes = parseTimeToMinutes(slot.timeRange.start);
  const endMinutes = parseTimeToMinutes(slot.timeRange.end);
  const availableMinutes = endMinutes - startMinutes;

  // Get context from nearby slots
  const prevActivity = previousSlot?.options.find(
    (o) => o.id === previousSlot.selectedOptionId
  )?.activity;
  const nextActivity = nextSlot?.options.find(
    (o) => o.id === nextSlot.selectedOptionId
  )?.activity;

  // Calculate nearby activities from the same cluster or close locations
  const nearbyActivities = useMemo(() => {
    if (!itinerary || !allDaySlots) return [];

    const activities: Array<{
      option: (typeof allDaySlots)[0]["options"][0];
      fromSlot: (typeof allDaySlots)[0];
      distance: number;
      source: "same-day" | "other-day" | "cluster";
    }> = [];

    // Get reference coordinates from previous or next slot
    let refCoords: { lat: number; lng: number } | null = null;
    if (prevActivity?.place?.coordinates) {
      refCoords = prevActivity.place.coordinates;
    } else if (nextActivity?.place?.coordinates) {
      refCoords = nextActivity.place.coordinates;
    }

    if (!refCoords) return [];

    // Find activities from other slots on the same day (non-selected options)
    for (const daySlot of allDaySlots) {
      if (daySlot.slotId === slot.slotId) continue; // Skip current slot
      if (isFreeTimeSlot(daySlot)) continue; // Skip free slots

      for (const option of daySlot.options) {
        // Skip the selected option - only suggest non-selected alternatives
        if (option.id === daySlot.selectedOptionId) continue;

        const coords = option.activity?.place?.coordinates;
        if (!coords) continue;

        const distance = haversineDistance(
          refCoords.lat,
          refCoords.lng,
          coords.lat,
          coords.lng
        );

        // Only include activities within 2km
        if (distance <= 2000) {
          activities.push({
            option,
            fromSlot: daySlot,
            distance,
            source: "same-day",
          });
        }
      }
    }

    // Find activities from other days in the same cluster
    if (itinerary) {
      for (let di = 0; di < itinerary.days.length; di++) {
        if (di === dayIndex) continue; // Skip current day

        for (const daySlot of itinerary.days[di].slots) {
          if (isFreeTimeSlot(daySlot)) continue;

          for (const option of daySlot.options) {
            const coords = option.activity?.place?.coordinates;
            if (!coords) continue;

            const distance = haversineDistance(
              refCoords.lat,
              refCoords.lng,
              coords.lat,
              coords.lng
            );

            // Only include activities within 1.5km (tighter for other days)
            if (distance <= 1500) {
              activities.push({
                option,
                fromSlot: daySlot,
                distance,
                source: "other-day",
              });
            }
          }
        }
      }
    }

    // Sort by distance and limit to 5
    return activities.sort((a, b) => a.distance - b.distance).slice(0, 5);
  }, [
    itinerary,
    allDaySlots,
    dayIndex,
    slot.slotId,
    prevActivity,
    nextActivity,
  ]);

  // Filter static suggestions that fit in the available time
  const fitSuggestions = staticSuggestions.filter(
    (s) => s.duration <= availableMinutes
  );

  const handleSelectNearbyActivity = (
    activity: (typeof nearbyActivities)[0]
  ) => {
    setSelectedSuggestion(activity.option.id);

    if (onFillSlotWithActivity) {
      // Extract activity details and pass to handler
      onFillSlotWithActivity(dayIndex, slot.slotId, {
        name: activity.option.activity?.name || "Activity",
        category: activity.option.activity?.category,
        duration: activity.option.activity?.duration,
      });
    }

    setShowSuggestions(false);
    setSelectedSuggestion(null);
  };

  const handleSelectSuggestion = (
    suggestion: (typeof staticSuggestions)[0]
  ) => {
    setSelectedSuggestion(suggestion.id);

    if (onFillSlotWithActivity) {
      // Use the proper handler to add activity to slot
      onFillSlotWithActivity(dayIndex, slot.slotId, {
        name: suggestion.name,
        category: suggestion.category,
        duration: suggestion.duration,
        icon: suggestion.icon,
      });
    }

    setShowSuggestions(false);
    setSelectedSuggestion(null);
  };

  return (
    <div className="p-4 flex flex-col gap-3">
      {/* Free Time Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400">
          <Clock className="w-4 h-4" />
          <span className="text-sm font-medium capitalize">
            {slot.slotType} • Free Time
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            ({availableMinutes} min available)
          </span>
        </div>
      </div>

      {/* Context info */}
      {(prevActivity || nextActivity) && (
        <div className="text-xs text-gray-400 dark:text-gray-500">
          {prevActivity && (
            <span>
              After: <span className="text-gray-600">{prevActivity.name}</span>
            </span>
          )}
          {prevActivity && nextActivity && <span className="mx-2">•</span>}
          {nextActivity && (
            <span>
              Before:{" "}
              <span className="text-gray-600 dark:text-gray-400">
                {nextActivity.name}
              </span>
            </span>
          )}
        </div>
      )}

      {!showSuggestions ? (
        /* Fill Slot Button */
        <button
          onClick={() => setShowSuggestions(true)}
          className="w-full py-3 px-4 border-2 border-dashed border-purple-300 dark:border-purple-700 rounded-lg text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/20 transition-colors flex items-center justify-center gap-2 group"
        >
          <span className="text-lg group-hover:scale-110 transition-transform">
            +
          </span>
          <span className="font-medium">Fill this slot</span>
        </button>
      ) : (
        /* Suggestions Panel */
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Fill with nearby activity:
            </span>
            <button
              onClick={() => setShowSuggestions(false)}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              Cancel
            </button>
          </div>

          {/* Nearby Activities from Cluster */}
          {nearbyActivities.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-purple-600 dark:text-purple-400">
                  📍 Nearby options ({nearbyActivities.length})
                </span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              </div>
              <div className="grid grid-cols-1 gap-2">
                {nearbyActivities.map((item) => (
                  <button
                    key={item.option.id}
                    onClick={() => handleSelectNearbyActivity(item)}
                    disabled={selectedSuggestion === item.option.id}
                    className={cn(
                      "flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                      selectedSuggestion === item.option.id
                        ? "border-purple-400 bg-purple-50 dark:bg-purple-900/30 dark:border-purple-600"
                        : "border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700 hover:bg-purple-50/50 dark:hover:bg-purple-900/10"
                    )}
                  >
                    <div className="text-2xl">
                      {item.option.activity?.category === "restaurant"
                        ? "🍽️"
                        : item.option.activity?.category === "temple"
                        ? "⛩️"
                        : item.option.activity?.category === "museum"
                        ? "🏛️"
                        : item.option.activity?.category === "park"
                        ? "🌳"
                        : item.option.activity?.category === "shopping"
                        ? "🛍️"
                        : "📍"}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-900 dark:text-white truncate">
                        {item.option.activity?.name}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                        <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded capitalize">
                          {item.option.activity?.category || "Activity"}
                        </span>
                        <span>{(item.distance / 1000).toFixed(1)}km away</span>
                        {item.source === "other-day" && (
                          <span className="text-amber-500">from other day</span>
                        )}
                      </div>
                      {item.option.activity?.place?.neighborhood && (
                        <div className="text-xs text-gray-400 mt-0.5">
                          {item.option.activity.place.neighborhood}
                        </div>
                      )}
                    </div>
                    {selectedSuggestion === item.option.id ? (
                      <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                        <Check className="w-3 h-3 text-white" />
                      </div>
                    ) : (
                      <ChevronRight className="w-4 h-4 text-gray-400" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Static Suggestions Fallback */}
          {nearbyActivities.length === 0 && (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                  💡 Suggested activities
                </span>
                <div className="flex-1 h-px bg-gray-200 dark:bg-gray-700" />
              </div>
              <div className="grid grid-cols-1 gap-2">
                {fitSuggestions.length > 0 ? (
                  fitSuggestions.map((suggestion) => (
                    <button
                      key={suggestion.id}
                      onClick={() => handleSelectSuggestion(suggestion)}
                      disabled={selectedSuggestion === suggestion.id}
                      className={cn(
                        "flex items-center gap-3 p-3 rounded-lg border transition-all text-left",
                        selectedSuggestion === suggestion.id
                          ? "border-purple-400 bg-purple-50 dark:bg-purple-900/30 dark:border-purple-600"
                          : "border-gray-200 dark:border-gray-700 hover:border-purple-300 dark:hover:border-purple-700 hover:bg-purple-50/50 dark:hover:bg-purple-900/10"
                      )}
                    >
                      <span className="text-2xl">{suggestion.icon}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm text-gray-900 dark:text-white truncate">
                          {suggestion.name}
                        </div>
                        <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                          <span className="px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                            {suggestion.category}
                          </span>
                          <span>{suggestion.duration} min</span>
                        </div>
                      </div>
                      {selectedSuggestion === suggestion.id ? (
                        <div className="w-5 h-5 rounded-full bg-purple-500 flex items-center justify-center">
                          <Check className="w-3 h-3 text-white" />
                        </div>
                      ) : (
                        <ChevronRight className="w-4 h-4 text-gray-400" />
                      )}
                    </button>
                  ))
                ) : (
                  <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
                    No activities fit in the available {availableMinutes} min
                    slot.
                    <button
                      onClick={() => setShowSuggestions(false)}
                      className="block mx-auto mt-2 text-purple-600 dark:text-purple-400 hover:underline"
                    >
                      Keep as free time
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </motion.div>
      )}
    </div>
  );
}

// ============================================
// EMPTY SLOT PLACEHOLDER (Legacy - kept for reference)
// ============================================

interface EmptySlotProps {
  slot: SlotWithOptions;
}

function EmptySlotPlaceholder({ slot }: EmptySlotProps) {
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

// ============================================
// DAY CONTENT (shared between tabbed and list)
// ============================================

interface DayContentProps {
  day: DayWithOptions;
  itinerary: StructuredItineraryData;
  onSelectOption: (slotId: string, optionId: string) => void;
  showMap?: boolean;
}

function DayContent({
  day,
  itinerary,
  onSelectOption,
  showMap = true,
}: DayContentProps) {
  const [mapVisible, setMapVisible] = useState(showMap);

  return (
    <motion.div
      key={day.dayNumber}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Day Header */}
      <div className="mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-2xl">📅</span>
            <div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white">
                Day {day.dayNumber}: {day.title}
              </h3>
              <div className="flex items-center gap-3 text-sm text-gray-500 dark:text-gray-400">
                <span>{day.date}</span>
                <span className="flex items-center gap-1">
                  <MapPin className="w-3 h-3" />
                  {day.city}
                </span>
              </div>
            </div>
          </div>

          {/* Map Toggle Button */}
          <button
            onClick={() => setMapVisible(!mapVisible)}
            className={cn(
              "flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors",
              mapVisible
                ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
            )}
          >
            <MapPin className="w-4 h-4" />
            {mapVisible ? "Hide Map" : "Show Map"}
          </button>
        </div>
      </div>

      {/* Map View */}
      <AnimatePresence>
        {mapVisible && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mb-6"
          >
            <ItineraryMap
              itinerary={itinerary}
              activeDayNumber={day.dayNumber}
              height="350px"
              showRoute={true}
              className="shadow-lg"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Time Slots */}
      <div className="space-y-2">
        {day.slots.map((slot, index) => {
          // Get previous slot's activity coordinates for commute directions
          const prevSlot = index > 0 ? day.slots[index - 1] : null;
          const prevActivityCoords =
            prevSlot && prevSlot.options.length > 0
              ? (
                  prevSlot.options.find(
                    (o) => o.id === prevSlot.selectedOptionId
                  ) || prevSlot.options[0]
                )?.activity?.place?.coordinates
              : undefined;

          return (
            <SlotOptions
              key={slot.slotId}
              slot={slot}
              onSelectOption={onSelectOption}
              isFirst={index === 0}
              prevActivityCoords={prevActivityCoords}
            />
          );
        })}
      </div>
    </motion.div>
  );
}

// ============================================
// EXPORTS
// ============================================

export default UnifiedItineraryView;
