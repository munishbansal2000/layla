/**
 * Semantic Model Utilities
 *
 * Functions for calculating rigidity scores, inferring slot behaviors,
 * managing activity clusters, and checking dependency violations.
 */

import type {
  SlotWithOptions,
  SlotBehavior,
  SlotDependency,
  ActivityCluster,
} from "@/types/structured-itinerary";

// ============================================
// TYPES
// ============================================

export interface ValidationIssue {
  type: "error" | "warning" | "info";
  dayNumber?: number;
  slotId?: string;
  message: string;
  details?: string;
}

export interface SlotBehaviorVisuals {
  icon: string;
  color: string;
  bgColor: string;
  borderColor: string;
  label: string;
}

// ============================================
// RIGIDITY & BEHAVIOR
// ============================================

/**
 * Calculate rigidity score for a slot based on its properties
 * Higher score = more fixed (anchors, booked tickets)
 * Lower score = more flexible (optional activities)
 */
export function calculateRigidityScore(slot: SlotWithOptions): number {
  if (slot.rigidityScore !== undefined) {
    return slot.rigidityScore;
  }

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

  let score = 0.5;

  if (slot.isLocked) {
    score = 1.0;
  } else if (slot.fragility?.bookingRequired) {
    score = 0.9;
  } else if (
    slot.slotType === "breakfast" ||
    slot.slotType === "lunch" ||
    slot.slotType === "dinner"
  ) {
    score = 0.6;
  } else if (slot.options.length === 0) {
    score = 0.0;
  }

  return score;
}

/**
 * Infer slot behavior from its properties
 */
export function inferSlotBehavior(slot: SlotWithOptions): SlotBehavior {
  if (slot.behavior) {
    return slot.behavior;
  }

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
export function getSlotBehaviorVisuals(
  behavior: SlotBehavior
): SlotBehaviorVisuals {
  const visuals: Record<SlotBehavior, SlotBehaviorVisuals> = {
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

// ============================================
// CLUSTERING
// ============================================

/**
 * Haversine distance between two points in meters
 */
export function haversineDistance(
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
 * Calculate clusters from activity locations
 * Groups activities within 1km radius
 */
export function calculateClusters(slots: SlotWithOptions[]): ActivityCluster[] {
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
        avgIntraClusterDistance: clusterRadius / 2,
        name: selectedOption.activity.place.neighborhood || undefined,
      });
    }
  }

  return clusters;
}

// ============================================
// DEPENDENCY VALIDATION
// ============================================

/**
 * Check for dependency violations between slots
 */
export function checkDependencyViolations(
  slots: SlotWithOptions[],
  dependencies: SlotDependency[]
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];

  for (const dep of dependencies) {
    const sourceSlotIndex = slots.findIndex(
      (s) => s.slotId === dep.targetSlotId
    );
    if (sourceSlotIndex === -1) continue;

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
