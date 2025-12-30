/**
 * Itinerary Badge Components
 *
 * Reusable badge components for displaying slot metadata
 * like rigidity, behavior type, clusters, and fragility warnings.
 */

"use client";

import { cn } from "@/lib/utils";
import type { SlotWithOptions } from "@/types/structured-itinerary";
import {
  calculateRigidityScore,
  inferSlotBehavior,
  getSlotBehaviorVisuals,
} from "@/utils/semantic-model";

// ============================================
// RIGIDITY INDICATOR
// ============================================

interface RigidityIndicatorProps {
  score: number;
}

export function RigidityIndicator({ score }: RigidityIndicatorProps) {
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

// ============================================
// SLOT BEHAVIOR BADGE
// ============================================

interface SlotBehaviorBadgeProps {
  slot: SlotWithOptions;
  showRigidity?: boolean;
}

export function SlotBehaviorBadge({
  slot,
  showRigidity = false,
}: SlotBehaviorBadgeProps) {
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

// ============================================
// CLUSTER BADGE
// ============================================

interface ClusterBadgeProps {
  clusterName: string;
}

export function ClusterBadge({ clusterName }: ClusterBadgeProps) {
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

// ============================================
// FRAGILITY BADGE
// ============================================

interface FragilityBadgeProps {
  slot: SlotWithOptions;
}

export function FragilityBadge({ slot }: FragilityBadgeProps) {
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
