/**
 * Constraint Validation Engine
 *
 * Validates itinerary changes against the 7-layer constraint model:
 * 1. Temporal: Activity fits within slot time
 * 2. Travel: Enough time to commute between activities
 * 3. Clustering: Prefer keeping cluster activities together
 * 4. Dependencies: Respect must-before/after relationships
 * 5. Pacing: Don't overload days with walking
 * 6. Fragility: Weather-sensitive outdoor activities, crowd times
 * 7. Cross-day: Intercity travel, hotel check-in/out times
 */

import type {
  StructuredItineraryData,
  SlotWithOptions,
  DayWithOptions,
  ActivityOption,
  SlotBehavior,
  SlotDependency,
} from "@/types/structured-itinerary";

import type {
  ConstraintLayer,
  ConstraintViolation,
  ConstraintAnalysis,
  AutoAdjustment,
  ItineraryIntent,
  SlotLocation,
  ActivityLocation,
} from "@/types/itinerary-chat";

// ============================================
// CONFIGURATION
// ============================================

export interface ConstraintEngineConfig {
  /** If true, treat warnings as errors */
  strictMode: boolean;
  /** If true, auto-adjust flexible items to resolve conflicts */
  autoAdjust: boolean;
  /** If true, prefer cluster-preserving moves */
  respectClusters: boolean;
  /** If true, check weather sensitivity */
  weatherAware: boolean;
  /** Maximum walking distance per day in meters */
  maxDailyWalkingDistance: number;
  /** Minimum buffer between activities in minutes */
  minActivityBuffer: number;
}

const DEFAULT_CONFIG: ConstraintEngineConfig = {
  strictMode: false,
  autoAdjust: true,
  respectClusters: true,
  weatherAware: true,
  maxDailyWalkingDistance: 15000, // 15km
  minActivityBuffer: 15, // 15 minutes
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Parse time string to minutes from midnight
 */
export function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Format minutes to time string
 */
export function formatMinutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

/**
 * Calculate haversine distance between two coordinates in meters
 */
export function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Get the selected activity from a slot
 */
export function getSelectedActivity(slot: SlotWithOptions): ActivityOption | null {
  if (!slot.options || slot.options.length === 0) return null;
  const selectedId = slot.selectedOptionId;
  return slot.options.find((o) => o.id === selectedId) || slot.options[0] || null;
}

/**
 * Find activity by name (fuzzy match)
 */
export function findActivityByName(
  itinerary: StructuredItineraryData,
  name: string
): ActivityLocation | null {
  const normalizedName = name.toLowerCase();

  for (let dayIndex = 0; dayIndex < itinerary.days.length; dayIndex++) {
    const day = itinerary.days[dayIndex];
    for (let slotIndex = 0; slotIndex < day.slots.length; slotIndex++) {
      const slot = day.slots[slotIndex];
      for (let optionIndex = 0; optionIndex < slot.options.length; optionIndex++) {
        const option = slot.options[optionIndex];
        const activityName = option.activity?.name?.toLowerCase() || "";

        // Exact match
        if (activityName === normalizedName) {
          return { dayIndex, slotIndex, slotId: slot.slotId, slot, optionIndex, option };
        }

        // Partial match
        if (activityName.includes(normalizedName) || normalizedName.includes(activityName)) {
          return { dayIndex, slotIndex, slotId: slot.slotId, slot, optionIndex, option };
        }
      }
    }
  }

  return null;
}

/**
 * Find slot by ID
 */
export function findSlotById(
  itinerary: StructuredItineraryData,
  slotId: string
): SlotLocation | null {
  for (let dayIndex = 0; dayIndex < itinerary.days.length; dayIndex++) {
    const day = itinerary.days[dayIndex];
    for (let slotIndex = 0; slotIndex < day.slots.length; slotIndex++) {
      const slot = day.slots[slotIndex];
      if (slot.slotId === slotId) {
        return { dayIndex, slotIndex, slotId, slot };
      }
    }
  }
  return null;
}

/**
 * Calculate rigidity score for a slot
 */
export function calculateRigidity(slot: SlotWithOptions): number {
  // If explicitly set, use that
  if (slot.rigidityScore !== undefined) {
    return slot.rigidityScore;
  }

  // Infer from behavior
  const behavior = slot.behavior || inferBehavior(slot);
  switch (behavior) {
    case "anchor":
      return 1.0;
    case "travel":
      return 0.9;
    case "meal":
      return 0.6;
    case "flex":
      return 0.4;
    case "optional":
      return 0.2;
    default:
      return 0.5;
  }
}

/**
 * Infer slot behavior from context
 */
export function inferBehavior(slot: SlotWithOptions): SlotBehavior {
  if (slot.isLocked) return "anchor";

  const slotType = slot.slotType;
  if (slotType === "breakfast" || slotType === "lunch" || slotType === "dinner") {
    return "meal";
  }

  const activity = getSelectedActivity(slot);
  if (!activity) return "optional";

  // Check for booking requirements
  const fragility = slot.fragility;
  if (fragility?.bookingRequired) {
    return "anchor";
  }

  return "flex";
}

// ============================================
// CONSTRAINT VALIDATORS
// ============================================

/**
 * Layer 1: Temporal Constraints
 * Check if activity fits within slot time window
 */
export function validateTemporalConstraints(
  slot: SlotWithOptions,
  activity: ActivityOption
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  if (!slot.timeRange || !activity.activity?.duration) {
    return violations;
  }

  const slotStart = parseTimeToMinutes(slot.timeRange.start);
  const slotEnd = parseTimeToMinutes(slot.timeRange.end);
  const slotDuration = slotEnd - slotStart;
  const activityDuration = activity.activity.duration;

  if (activityDuration > slotDuration) {
    violations.push({
      layer: "temporal",
      severity: "warning",
      message: `Activity "${activity.activity.name}" (${activityDuration}min) exceeds slot duration (${slotDuration}min)`,
      affectedSlotId: slot.slotId,
      resolution: `Consider extending the slot or shortening the activity`,
    });
  }

  return violations;
}

/**
 * Layer 2: Travel Constraints
 * Check if there's enough time to travel between consecutive activities
 */
export function validateTravelConstraints(
  day: DayWithOptions,
  config: ConstraintEngineConfig
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];
  const slots = day.slots;

  for (let i = 1; i < slots.length; i++) {
    const prevSlot = slots[i - 1];
    const currSlot = slots[i];
    const commute = currSlot.commuteFromPrevious;

    if (commute) {
      // Check if there's a gap between slots for travel
      const prevEnd = parseTimeToMinutes(prevSlot.timeRange.end);
      const currStart = parseTimeToMinutes(currSlot.timeRange.start);
      const gapMinutes = currStart - prevEnd;

      if (commute.duration > gapMinutes) {
        violations.push({
          layer: "travel",
          severity: "error",
          message: `Not enough time to travel from "${getSelectedActivity(prevSlot)?.activity?.name}" to "${getSelectedActivity(currSlot)?.activity?.name}" (need ${commute.duration}min, have ${gapMinutes}min)`,
          affectedSlotId: currSlot.slotId,
          resolution: `Add a ${commute.duration - gapMinutes}min buffer or adjust timing`,
        });
      }
    }

    // Check for minimum buffer
    const prevEnd = parseTimeToMinutes(prevSlot.timeRange.end);
    const currStart = parseTimeToMinutes(currSlot.timeRange.start);
    const gap = currStart - prevEnd;

    if (gap < config.minActivityBuffer && gap >= 0) {
      violations.push({
        layer: "travel",
        severity: "info",
        message: `Tight transition (${gap}min) between activities`,
        affectedSlotId: currSlot.slotId,
      });
    }
  }

  return violations;
}

/**
 * Layer 3: Clustering Constraints
 * Check if geographically close activities are scheduled together
 */
export function validateClusteringConstraints(
  day: DayWithOptions,
  config: ConstraintEngineConfig
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  if (!config.respectClusters) return violations;

  const slots = day.slots;

  // Check if activities in different clusters are mixed
  const clusterSequence: (string | undefined)[] = [];
  for (const slot of slots) {
    clusterSequence.push(slot.clusterId);
  }

  // Detect cluster fragmentation (e.g., A, B, A pattern)
  for (let i = 2; i < clusterSequence.length; i++) {
    if (
      clusterSequence[i] &&
      clusterSequence[i] === clusterSequence[i - 2] &&
      clusterSequence[i] !== clusterSequence[i - 1]
    ) {
      violations.push({
        layer: "clustering",
        severity: "warning",
        message: `Activities in cluster "${clusterSequence[i]}" are fragmented - consider grouping them`,
        affectedSlotId: slots[i].slotId,
        resolution: `Move "${getSelectedActivity(slots[i - 1])?.activity?.name}" to group cluster activities`,
      });
    }
  }

  return violations;
}

/**
 * Layer 4: Dependency Constraints
 * Check must-before/after relationships
 */
export function validateDependencyConstraints(
  itinerary: StructuredItineraryData
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  // Build a map of slot positions
  const slotPositions = new Map<string, { dayIndex: number; slotIndex: number }>();
  for (let dayIndex = 0; dayIndex < itinerary.days.length; dayIndex++) {
    const day = itinerary.days[dayIndex];
    for (let slotIndex = 0; slotIndex < day.slots.length; slotIndex++) {
      const slot = day.slots[slotIndex];
      slotPositions.set(slot.slotId, { dayIndex, slotIndex });
    }
  }

  // Check dependencies
  for (const day of itinerary.days) {
    for (const slot of day.slots) {
      if (!slot.dependencies) continue;

      for (const dep of slot.dependencies) {
        const targetPos = slotPositions.get(dep.targetSlotId);
        const currentPos = slotPositions.get(slot.slotId);

        if (!targetPos || !currentPos) continue;

        const targetGlobalIndex = targetPos.dayIndex * 100 + targetPos.slotIndex;
        const currentGlobalIndex = currentPos.dayIndex * 100 + currentPos.slotIndex;

        if (dep.type === "must-before" && currentGlobalIndex >= targetGlobalIndex) {
          violations.push({
            layer: "dependencies",
            severity: "error",
            message: `"${getSelectedActivity(slot)?.activity?.name}" must come before its dependent activity`,
            affectedSlotId: slot.slotId,
            resolution: dep.reason || "Reorder activities to satisfy dependency",
          });
        }

        if (dep.type === "must-after" && currentGlobalIndex <= targetGlobalIndex) {
          violations.push({
            layer: "dependencies",
            severity: "error",
            message: `"${getSelectedActivity(slot)?.activity?.name}" must come after its dependent activity`,
            affectedSlotId: slot.slotId,
            resolution: dep.reason || "Reorder activities to satisfy dependency",
          });
        }

        if (dep.type === "same-day" && targetPos.dayIndex !== currentPos.dayIndex) {
          violations.push({
            layer: "dependencies",
            severity: "error",
            message: `"${getSelectedActivity(slot)?.activity?.name}" must be on the same day as its dependent activity`,
            affectedSlotId: slot.slotId,
          });
        }

        if (dep.type === "different-day" && targetPos.dayIndex === currentPos.dayIndex) {
          violations.push({
            layer: "dependencies",
            severity: "warning",
            message: `"${getSelectedActivity(slot)?.activity?.name}" should be on a different day`,
            affectedSlotId: slot.slotId,
          });
        }
      }
    }
  }

  return violations;
}

/**
 * Layer 5: Pacing Constraints
 * Check for overloaded days and fatigue
 */
export function validatePacingConstraints(
  day: DayWithOptions,
  config: ConstraintEngineConfig
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  // Calculate total walking distance for the day
  let totalWalkingDistance = 0;
  let consecutiveWalkingActivities = 0;
  let totalActivityMinutes = 0;

  for (const slot of day.slots) {
    const activity = getSelectedActivity(slot);
    if (activity?.activity?.duration) {
      totalActivityMinutes += activity.activity.duration;
    }

    const commute = slot.commuteFromPrevious;
    if (commute) {
      if (commute.method === "walk") {
        totalWalkingDistance += commute.distance;
        consecutiveWalkingActivities++;
      } else {
        consecutiveWalkingActivities = 0;
      }
    }
  }

  if (totalWalkingDistance > config.maxDailyWalkingDistance) {
    violations.push({
      layer: "pacing",
      severity: "warning",
      message: `Day ${day.dayNumber} has ${(totalWalkingDistance / 1000).toFixed(1)}km of walking (limit: ${(config.maxDailyWalkingDistance / 1000).toFixed(1)}km)`,
      resolution: "Consider using transit for some segments or reducing activities",
    });
  }

  if (consecutiveWalkingActivities >= 4) {
    violations.push({
      layer: "pacing",
      severity: "info",
      message: `${consecutiveWalkingActivities} consecutive walking segments - consider adding a rest break`,
    });
  }

  // Check if day is too packed (more than 10 hours of activities)
  if (totalActivityMinutes > 600) {
    violations.push({
      layer: "pacing",
      severity: "warning",
      message: `Day ${day.dayNumber} has ${Math.round(totalActivityMinutes / 60)} hours of activities - may be exhausting`,
      resolution: "Consider moving some activities to another day",
    });
  }

  return violations;
}

/**
 * Layer 6: Fragility Constraints
 * Check weather sensitivity, crowd times, booking requirements
 */
export function validateFragilityConstraints(
  slot: SlotWithOptions,
  config: ConstraintEngineConfig
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  if (!config.weatherAware) return violations;

  const fragility = slot.fragility;
  if (!fragility) return violations;

  const activity = getSelectedActivity(slot);
  const activityName = activity?.activity?.name || "Activity";

  // Weather sensitivity
  if (fragility.weatherSensitivity === "high") {
    violations.push({
      layer: "fragility",
      severity: "info",
      message: `"${activityName}" is weather-sensitive (outdoor activity)`,
      affectedSlotId: slot.slotId,
      resolution: "Have an indoor backup plan ready",
    });
  }

  // Crowd sensitivity
  if (fragility.crowdSensitivity === "high") {
    const slotTime = slot.timeRange?.start;
    const peakHours = fragility.peakHours || [];
    const isInPeakHour = peakHours.some((peak) => {
      const [start, end] = peak.split("-");
      const slotMins = slotTime ? parseTimeToMinutes(slotTime) : 0;
      return slotMins >= parseTimeToMinutes(start) && slotMins <= parseTimeToMinutes(end);
    });

    if (isInPeakHour) {
      violations.push({
        layer: "fragility",
        severity: "warning",
        message: `"${activityName}" is scheduled during peak hours - expect crowds`,
        affectedSlotId: slot.slotId,
        resolution: fragility.bestVisitTime
          ? `Consider visiting during ${fragility.bestVisitTime}`
          : "Consider an earlier or later time",
      });
    }
  }

  // Booking requirement
  if (fragility.bookingRequired && !slot.isLocked) {
    violations.push({
      layer: "fragility",
      severity: "warning",
      message: `"${activityName}" requires advance booking`,
      affectedSlotId: slot.slotId,
      resolution: fragility.bookingUrl
        ? `Book at: ${fragility.bookingUrl}`
        : "Check for booking options",
    });
  }

  return violations;
}

/**
 * Layer 7: Cross-day Constraints
 * Check intercity travel, hotel check-in/out
 */
export function validateCrossDayConstraints(
  itinerary: StructuredItineraryData
): ConstraintViolation[] {
  const violations: ConstraintViolation[] = [];

  for (let i = 0; i < itinerary.days.length; i++) {
    const day = itinerary.days[i];

    // Check city transition
    if (day.cityTransition) {
      const transition = day.cityTransition;
      const departureTime = parseTimeToMinutes(transition.departureTime);

      // Find activities before departure
      const activitiesBeforeDeparture = day.slots.filter((slot) => {
        const slotEnd = parseTimeToMinutes(slot.timeRange.end);
        return slotEnd <= departureTime;
      });

      // Check if there's enough buffer before departure
      if (activitiesBeforeDeparture.length > 0) {
        const lastSlot = activitiesBeforeDeparture[activitiesBeforeDeparture.length - 1];
        const lastEnd = parseTimeToMinutes(lastSlot.timeRange.end);
        const buffer = departureTime - lastEnd;

        // Need at least 30 minutes buffer before intercity travel
        if (buffer < 30 && transition.commuteToStation) {
          violations.push({
            layer: "cross-day",
            severity: "warning",
            message: `Only ${buffer}min before ${transition.trainName || "intercity travel"} departure - may be tight`,
            resolution: "Allow more buffer time before departure",
          });
        }
      }
    }

    // Check accommodation check-in/out times
    if (day.accommodation) {
      const accommodation = day.accommodation;

      if (accommodation.checkIn) {
        const checkInTime = parseTimeToMinutes(accommodation.checkIn);
        // Check if there are activities scheduled before check-in for first day in a city
        const isFirstDayInCity =
          i === 0 || itinerary.days[i - 1].city !== day.city;

        if (isFirstDayInCity) {
          const activitiesBeforeCheckIn = day.slots.filter((slot) => {
            const slotEnd = parseTimeToMinutes(slot.timeRange.end);
            return slotEnd > checkInTime;
          });

          // This is actually fine - just informational
        }
      }
    }
  }

  return violations;
}

// ============================================
// MAIN CONSTRAINT ENGINE
// ============================================

export class ConstraintEngine {
  private config: ConstraintEngineConfig;

  constructor(config: Partial<ConstraintEngineConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Validate an entire itinerary against all constraint layers
   */
  validateItinerary(itinerary: StructuredItineraryData): ConstraintAnalysis {
    const allViolations: ConstraintViolation[] = [];
    const affectedLayers = new Set<ConstraintLayer>();

    // Layer 4 & 7: Itinerary-level constraints
    const dependencyViolations = validateDependencyConstraints(itinerary);
    const crossDayViolations = validateCrossDayConstraints(itinerary);

    allViolations.push(...dependencyViolations, ...crossDayViolations);

    if (dependencyViolations.length > 0) affectedLayers.add("dependencies");
    if (crossDayViolations.length > 0) affectedLayers.add("cross-day");

    // Day-level constraints
    for (const day of itinerary.days) {
      // Layer 2: Travel
      const travelViolations = validateTravelConstraints(day, this.config);
      allViolations.push(...travelViolations);
      if (travelViolations.length > 0) affectedLayers.add("travel");

      // Layer 3: Clustering
      const clusterViolations = validateClusteringConstraints(day, this.config);
      allViolations.push(...clusterViolations);
      if (clusterViolations.length > 0) affectedLayers.add("clustering");

      // Layer 5: Pacing
      const pacingViolations = validatePacingConstraints(day, this.config);
      allViolations.push(...pacingViolations);
      if (pacingViolations.length > 0) affectedLayers.add("pacing");

      // Slot-level constraints
      for (const slot of day.slots) {
        const activity = getSelectedActivity(slot);

        if (activity) {
          // Layer 1: Temporal
          const temporalViolations = validateTemporalConstraints(slot, activity);
          allViolations.push(...temporalViolations);
          if (temporalViolations.length > 0) affectedLayers.add("temporal");
        }

        // Layer 6: Fragility
        const fragilityViolations = validateFragilityConstraints(slot, this.config);
        allViolations.push(...fragilityViolations);
        if (fragilityViolations.length > 0) affectedLayers.add("fragility");
      }
    }

    // Determine feasibility
    const hasErrors = allViolations.some((v) => v.severity === "error");
    const hasWarnings = allViolations.some((v) => v.severity === "warning");
    const feasible = this.config.strictMode ? !hasErrors && !hasWarnings : !hasErrors;

    return {
      feasible,
      affectedLayers: Array.from(affectedLayers),
      violations: allViolations,
      autoAdjustments: [],
    };
  }

  /**
   * Validate a specific change before applying it
   */
  validateChange(
    itinerary: StructuredItineraryData,
    intent: ItineraryIntent
  ): ConstraintAnalysis {
    // For now, just validate the whole itinerary
    // In a more sophisticated implementation, we would simulate the change first
    return this.validateItinerary(itinerary);
  }

  /**
   * Check if a slot can be moved to a target location
   */
  canMoveSlot(
    itinerary: StructuredItineraryData,
    sourceSlotId: string,
    targetDayIndex: number,
    targetSlotIndex?: number
  ): ConstraintAnalysis {
    const sourceLocation = findSlotById(itinerary, sourceSlotId);

    if (!sourceLocation) {
      return {
        feasible: false,
        affectedLayers: [],
        violations: [
          {
            layer: "temporal",
            severity: "error",
            message: `Slot ${sourceSlotId} not found`,
          },
        ],
        autoAdjustments: [],
      };
    }

    const slot = sourceLocation.slot;
    const rigidity = calculateRigidity(slot);

    // Check if slot is locked
    if (slot.isLocked || rigidity >= 0.95) {
      return {
        feasible: false,
        affectedLayers: ["temporal"],
        violations: [
          {
            layer: "temporal",
            severity: "error",
            message: `"${getSelectedActivity(slot)?.activity?.name}" is locked and cannot be moved`,
            affectedSlotId: sourceSlotId,
            resolution: "Unlock the activity first if you want to move it",
          },
        ],
        autoAdjustments: [],
      };
    }

    // Check booking requirements
    const fragility = slot.fragility;
    if (fragility?.bookingRequired && fragility.ticketType === "timed") {
      return {
        feasible: false,
        affectedLayers: ["fragility"],
        violations: [
          {
            layer: "fragility",
            severity: "error",
            message: `"${getSelectedActivity(slot)?.activity?.name}" has a timed ticket and cannot be moved without rebooking`,
            affectedSlotId: sourceSlotId,
            resolution: "Check if your booking can be changed, or keep this time",
          },
        ],
        autoAdjustments: [],
      };
    }

    // Validate target day exists
    if (targetDayIndex < 0 || targetDayIndex >= itinerary.days.length) {
      return {
        feasible: false,
        affectedLayers: ["temporal"],
        violations: [
          {
            layer: "temporal",
            severity: "error",
            message: `Day ${targetDayIndex + 1} does not exist`,
          },
        ],
        autoAdjustments: [],
      };
    }

    // For now, allow the move with potential warnings
    return {
      feasible: true,
      affectedLayers: [],
      violations: [],
      autoAdjustments: [],
    };
  }

  /**
   * Get configuration
   */
  getConfig(): ConstraintEngineConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<ConstraintEngineConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let engineInstance: ConstraintEngine | null = null;

export function getConstraintEngine(config?: Partial<ConstraintEngineConfig>): ConstraintEngine {
  if (!engineInstance) {
    engineInstance = new ConstraintEngine(config);
  }
  return engineInstance;
}

export function createConstraintEngine(config?: Partial<ConstraintEngineConfig>): ConstraintEngine {
  return new ConstraintEngine(config);
}
