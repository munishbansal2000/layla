/**
 * Itinerary Remediation Service
 *
 * Provides automatic fixes for common itinerary issues:
 * - Remove impossible slots (before arrival / after departure)
 * - Remove cross-day duplicates
 * - Fix slot behaviors (travel, meal, anchor)
 * - Flag meals with long commutes for nearby replacement
 * - Flag empty slots for activity suggestion
 * - Recalculate slot IDs after modifications
 */

import type {
  StructuredItineraryData,
  SlotWithOptions,
  ActivityOption,
} from "@/types/structured-itinerary";

// ============================================
// DEBUG LOGGING
// ============================================

const DEBUG = process.env.NODE_ENV === "development" || process.env.DEBUG_REMEDIATION === "true";

function debugLog(message: string, ...args: unknown[]): void {
  if (DEBUG) {
    console.log(`[remediation] ${message}`, ...args);
  }
}

// ============================================
// TYPES
// ============================================

export interface RemediationChange {
  type: string;
  day: number;
  slot: string | null;
  reason: string;
}

export interface RemediationResult {
  itinerary: StructuredItineraryData;
  changes: RemediationChange[];
}

export interface FlightConstraints {
  arrivalFlightTime?: string; // HH:mm
  departureFlightTime?: string; // HH:mm
}

export interface RemediationOptions {
  addArrivalCoordinates?: boolean;
  remediateInvalidCommutes?: boolean;
  removeImpossibleSlots?: boolean;
  removeCrossDayDuplicates?: boolean;
  fixTransferBehavior?: boolean;
  fixMealBehavior?: boolean;
  fixAnchorBehavior?: boolean;
  flagMealLongCommute?: boolean;
  flagEmptySlots?: boolean;
  recalculateSlotIds?: boolean;
  commuteThresholdMinutes?: number;
}

const DEFAULT_OPTIONS: RemediationOptions = {
  addArrivalCoordinates: true,
  remediateInvalidCommutes: true,
  removeImpossibleSlots: true,
  removeCrossDayDuplicates: true,
  fixTransferBehavior: true,
  fixMealBehavior: true,
  fixAnchorBehavior: true,
  flagMealLongCommute: true,
  flagEmptySlots: true,
  recalculateSlotIds: true,
  commuteThresholdMinutes: 30,
};

// ============================================
// UTILITIES
// ============================================

function parseTime(timeStr: string | undefined): number | null {
  if (!timeStr) return null;
  const parts = timeStr.split(":");
  const hours = parseInt(parts[0], 10);
  const mins = parseInt(parts[1] || "0", 10);
  return hours * 60 + mins;
}

function getActivity(slot: SlotWithOptions): ActivityOption | null {
  if (!slot.options || slot.options.length === 0) return null;
  // Respect selectedOptionId if set, otherwise use first option
  const selectedId = slot.selectedOptionId;
  if (selectedId) {
    const found = slot.options.find((o: ActivityOption) => o.id === selectedId);
    if (found) return found;
  }
  return slot.options[0];
}

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

// ============================================
// VALIDATION FUNCTIONS (detect issues without fixing)
// ============================================

/**
 * Validate commute data for unrealistic values
 * - Commutes > 4 hours are suspicious
 * - Commutes after city transitions should use arrival coordinates
 */
function validateCommuteData(itinerary: StructuredItineraryData): RemediationChange[] {
  const issues: RemediationChange[] = [];
  const MAX_REASONABLE_COMMUTE_MINS = 240; // 4 hours

  for (const day of itinerary.days) {
    let previousSlotWasTravel = false;

    for (let i = 0; i < day.slots.length; i++) {
      const slot = day.slots[i];
      const commute = slot.commuteFromPrevious;

      // Check if previous slot was a travel/transport slot (city transition)
      if (i > 0) {
        const prevSlot = day.slots[i - 1];
        const prevActivity = getActivity(prevSlot);
        previousSlotWasTravel =
          prevSlot.behavior === "travel" ||
          prevActivity?.activity?.category === "transport" ||
          (prevActivity?.activity?.name?.toLowerCase().includes("shinkansen") ?? false);
      }

      if (commute && commute.duration > MAX_REASONABLE_COMMUTE_MINS) {
        const reason = previousSlotWasTravel
          ? `Commute ${commute.duration}min after travel slot - likely using wrong origin coordinates (departure instead of arrival)`
          : `Unrealistic commute duration: ${commute.duration}min (${Math.round(commute.duration / 60)}h)`;

        issues.push({
          type: "INVALID_COMMUTE_DATA",
          day: day.dayNumber,
          slot: slot.slotId,
          reason,
        });
      }
    }
  }

  return issues;
}

/**
 * Validate that Day 1 activities don't start before arrival
 */
function validateArrivalTiming(
  itinerary: StructuredItineraryData,
  constraints?: FlightConstraints
): RemediationChange[] {
  const issues: RemediationChange[] = [];

  if (!constraints?.arrivalFlightTime || itinerary.days.length === 0) {
    return issues;
  }

  const day1 = itinerary.days[0];
  const arrivalMins = parseTime(constraints.arrivalFlightTime);

  if (arrivalMins === null) return issues;

  // Add 2 hours buffer for customs/immigration/transport
  const earliestReasonableStart = arrivalMins + 120;

  for (const slot of day1.slots) {
    if (slot.behavior === "travel") continue;

    const slotStart = slot.timeRange ? parseTime(slot.timeRange.start) : null;

    if (slotStart !== null && slotStart < arrivalMins) {
      issues.push({
        type: "ACTIVITY_BEFORE_ARRIVAL",
        day: 1,
        slot: slot.slotId,
        reason: `Activity starts at ${slot.timeRange?.start} but flight arrives at ${constraints.arrivalFlightTime}`,
      });
    } else if (slotStart !== null && slotStart < earliestReasonableStart) {
      issues.push({
        type: "ACTIVITY_TOO_SOON_AFTER_ARRIVAL",
        day: 1,
        slot: slot.slotId,
        reason: `Activity at ${slot.timeRange?.start} is only ${slotStart - arrivalMins}min after arrival at ${constraints.arrivalFlightTime} (recommend 2h+ buffer)`,
      });
    }
  }

  return issues;
}

/**
 * Validate city transition slots have arrival coordinates
 */
function validateCityTransitions(itinerary: StructuredItineraryData): RemediationChange[] {
  const issues: RemediationChange[] = [];

  for (const day of itinerary.days) {
    for (const slot of day.slots) {
      const activity = getActivity(slot);
      if (!activity?.activity) continue;

      const activityData = activity.activity;
      const isTransport =
        activityData.category === "transport" ||
        activityData.name?.toLowerCase().includes("shinkansen") ||
        activityData.name?.toLowerCase().includes("bullet train");

      if (isTransport) {
        // Check if this transport has arrival coordinates
        const hasArrivalCoords = (activityData as any).arrivalPlace?.coordinates;

        if (!hasArrivalCoords) {
          issues.push({
            type: "MISSING_ARRIVAL_COORDINATES",
            day: day.dayNumber,
            slot: slot.slotId,
            reason: `Transport "${activityData.name}" missing arrival coordinates - will cause incorrect commute calculations for subsequent activities`,
          });
        }
      }
    }
  }

  return issues;
}

// ============================================
// DISTANCE & COMMUTE CALCULATION UTILITIES
// ============================================

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
function haversineDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth's radius in meters
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
 * Estimate commute duration based on distance and method
 * Returns duration in minutes
 */
function estimateCommuteDuration(distanceMeters: number, method: string): number {
  // Average speeds in meters per minute
  const speeds: Record<string, number> = {
    walk: 80,      // ~5 km/h
    transit: 500,  // ~30 km/h (including wait times)
    taxi: 400,     // ~24 km/h (city traffic)
    drive: 400,    // ~24 km/h (city traffic)
    bus: 300,      // ~18 km/h (with stops)
  };

  const speed = speeds[method] || speeds.transit;
  const baseDuration = distanceMeters / speed;

  // Add buffer for transit (waiting, walking to station, etc.)
  const buffer = method === "transit" ? 10 : method === "walk" ? 0 : 5;

  return Math.round(baseDuration + buffer);
}

/**
 * Determine commute method based on distance
 */
function inferCommuteMethod(distanceMeters: number): string {
  if (distanceMeters < 800) return "walk";        // < 800m = walk
  if (distanceMeters < 3000) return "walk";       // < 3km = still walkable in Japan
  return "transit";                                // > 3km = transit
}

// ============================================
// CITY COORDINATES DATABASE
// Used for adding missing arrival coordinates
// ============================================

const CITY_STATION_COORDINATES: Record<string, { lat: number; lng: number }> = {
  // Japan major stations
  "tokyo station": { lat: 35.6812, lng: 139.7671 },
  "kyoto station": { lat: 34.9858, lng: 135.7588 },
  "osaka station": { lat: 34.7024, lng: 135.4959 },
  "shin-osaka station": { lat: 34.7334, lng: 135.5001 },
  "hiroshima station": { lat: 34.3983, lng: 132.4752 },
  "nagoya station": { lat: 35.1709, lng: 136.8815 },
  "kanazawa station": { lat: 36.5781, lng: 136.6479 },
  "hakone-yumoto station": { lat: 35.2327, lng: 139.1058 },
  "nara station": { lat: 34.6809, lng: 135.8197 },
  // Default city centers
  "tokyo": { lat: 35.6762, lng: 139.6503 },
  "kyoto": { lat: 35.0116, lng: 135.7681 },
  "osaka": { lat: 34.6937, lng: 135.5023 },
  "hiroshima": { lat: 34.3853, lng: 132.4553 },
  "nara": { lat: 34.6851, lng: 135.8048 },
  "hakone": { lat: 35.2324, lng: 139.1069 },
  "kanazawa": { lat: 36.5944, lng: 136.6256 },
  "nagoya": { lat: 35.1815, lng: 136.9066 },
};

function inferArrivalCoordinates(activityName: string): { lat: number; lng: number } | null {
  const nameLower = activityName.toLowerCase();

  // Try to extract destination city from common patterns
  // e.g., "Nozomi Shinkansen to Kyoto" -> "kyoto"
  const toMatch = nameLower.match(/to\s+(\w+)/);
  if (toMatch) {
    const destCity = toMatch[1];
    const stationKey = `${destCity} station`;
    if (CITY_STATION_COORDINATES[stationKey]) {
      return CITY_STATION_COORDINATES[stationKey];
    }
    if (CITY_STATION_COORDINATES[destCity]) {
      return CITY_STATION_COORDINATES[destCity];
    }
  }

  // Try to find any city name in the activity name
  for (const [key, coords] of Object.entries(CITY_STATION_COORDINATES)) {
    if (nameLower.includes(key)) {
      return coords;
    }
  }

  return null;
}

// ============================================
// REMEDIATION FUNCTIONS
// ============================================

/**
 * Add missing arrival coordinates to transport activities
 * This fixes the 878-minute commute issue where commutes are calculated
 * from departure station instead of arrival station
 */
function remediateAddArrivalCoordinates(
  itinerary: StructuredItineraryData
): RemediationResult {
  const changes: RemediationChange[] = [];
  const fixed = deepClone(itinerary);

  for (const day of fixed.days) {
    for (const slot of day.slots) {
      const activity = getActivity(slot);
      if (!activity?.activity) continue;

      const activityData = activity.activity;
      const isTransport =
        activityData.category === "transport" ||
        activityData.name?.toLowerCase().includes("shinkansen") ||
        activityData.name?.toLowerCase().includes("bullet train") ||
        activityData.name?.toLowerCase().includes("train to");

      if (isTransport) {
        const hasArrivalCoords = (activityData as any).arrivalPlace?.coordinates;

        if (!hasArrivalCoords && activityData.name) {
          const inferredCoords = inferArrivalCoordinates(activityData.name);

          if (inferredCoords) {
            // Add arrivalPlace to the activity
            (activityData as any).arrivalPlace = {
              name: `Arrival from ${activityData.name}`,
              address: "",
              neighborhood: "",
              coordinates: inferredCoords,
            };

            changes.push({
              type: "ADDED_ARRIVAL_COORDINATES",
              day: day.dayNumber,
              slot: slot.slotId,
              reason: `Added inferred arrival coordinates for "${activityData.name}" (${inferredCoords.lat.toFixed(4)}, ${inferredCoords.lng.toFixed(4)})`,
            });
          }
        }
      }
    }
  }

  return { itinerary: fixed, changes };
}

/**
 * Fix slots with invalid commute data by recalculating using arrivalPlace coordinates
 * This actually fixes the commute values (not just flagging them)
 * Also fixes day-level commuteFromHotel/commuteToHotel
 */
function remediateInvalidCommutes(
  itinerary: StructuredItineraryData
): RemediationResult {
  const changes: RemediationChange[] = [];
  const fixed = deepClone(itinerary);
  const MAX_REASONABLE_COMMUTE_MINS = 240; // 4 hours

  for (const day of fixed.days) {
    // Fix day-level commuteFromHotel if unrealistic
    if (day.commuteFromHotel && day.commuteFromHotel.duration > MAX_REASONABLE_COMMUTE_MINS) {
      const originalDuration = day.commuteFromHotel.duration;
      const hotelCoords = day.accommodation?.coordinates;

      // Get first non-transport slot's coordinates
      let firstActivityCoords: { lat: number; lng: number } | null = null;
      for (const slot of day.slots) {
        if (slot.behavior === "travel") continue;
        const activity = getActivity(slot);
        if (activity?.activity?.place?.coordinates) {
          firstActivityCoords = activity.activity.place.coordinates;
          break;
        }
      }

      if (hotelCoords && firstActivityCoords) {
        const distanceMeters = haversineDistance(
          hotelCoords.lat,
          hotelCoords.lng,
          firstActivityCoords.lat,
          firstActivityCoords.lng
        );
        const distanceKm = distanceMeters / 1000;
        const method = inferCommuteMethod(distanceMeters);
        const newDuration = estimateCommuteDuration(distanceMeters, method);

        day.commuteFromHotel = {
          ...day.commuteFromHotel,
          duration: newDuration,
          method: method,
          distance: distanceMeters, // Store in meters to match formatDistance expectations
        };

        changes.push({
          type: "FIXED_DAY_COMMUTE_FROM_HOTEL",
          day: day.dayNumber,
          slot: null,
          reason: `Recalculated commuteFromHotel: ${originalDuration}min → ${newDuration}min (${distanceKm.toFixed(1)}km by ${method})`,
        });
      }
    }

    // Fix day-level commuteToHotel if unrealistic
    if (day.commuteToHotel && day.commuteToHotel.duration > MAX_REASONABLE_COMMUTE_MINS) {
      const originalDuration = day.commuteToHotel.duration;
      const hotelCoords = day.accommodation?.coordinates;

      // Get last non-transport slot's coordinates
      let lastActivityCoords: { lat: number; lng: number } | null = null;
      for (let i = day.slots.length - 1; i >= 0; i--) {
        const slot = day.slots[i];
        if (slot.behavior === "travel") continue;
        const activity = getActivity(slot);
        if (activity?.activity?.place?.coordinates) {
          lastActivityCoords = activity.activity.place.coordinates;
          break;
        }
      }

      if (hotelCoords && lastActivityCoords) {
        const distanceMeters = haversineDistance(
          lastActivityCoords.lat,
          lastActivityCoords.lng,
          hotelCoords.lat,
          hotelCoords.lng
        );
        const distanceKm = distanceMeters / 1000;
        const method = inferCommuteMethod(distanceMeters);
        const newDuration = estimateCommuteDuration(distanceMeters, method);

        day.commuteToHotel = {
          ...day.commuteToHotel,
          duration: newDuration,
          method: method,
          distance: distanceMeters, // Store in meters to match formatDistance expectations
        };

        changes.push({
          type: "FIXED_DAY_COMMUTE_TO_HOTEL",
          day: day.dayNumber,
          slot: null,
          reason: `Recalculated commuteToHotel: ${originalDuration}min → ${newDuration}min (${distanceKm.toFixed(1)}km by ${method})`,
        });
      }
    }

    // Fix slot-level commutes
    for (let i = 0; i < day.slots.length; i++) {
      const slot = day.slots[i];
      const commute = slot.commuteFromPrevious;

      if (commute && commute.duration > MAX_REASONABLE_COMMUTE_MINS) {
        const originalDuration = commute.duration;
        let wasFixed = false;
        let originCoords: { lat: number; lng: number } | null = null;

        // Try to get origin coordinates from previous slot
        if (i > 0) {
          const prevSlot = day.slots[i - 1];
          const prevActivity = getActivity(prevSlot);
          const isTransport =
            prevSlot.behavior === "travel" ||
            prevActivity?.activity?.category === "transport" ||
            (prevActivity?.activity?.name?.toLowerCase().includes("shinkansen") ?? false) ||
            (prevActivity?.activity?.name?.toLowerCase().includes("train") ?? false);

          if (isTransport && prevActivity?.activity) {
            // Use arrivalPlace coordinates if available (this is the destination of the transport)
            const arrivalPlace = (prevActivity.activity as any).arrivalPlace;
            if (arrivalPlace?.coordinates) {
              originCoords = arrivalPlace.coordinates;
              debugLog(`Using arrivalPlace coordinates from "${prevActivity.activity.name}": ${originCoords.lat}, ${originCoords.lng}`);
            }
          } else if (prevActivity?.activity?.place?.coordinates) {
            // For non-transport slots, use their place coordinates
            originCoords = prevActivity.activity.place.coordinates;
          }
        }

        // Get destination coordinates from current slot
        const currentActivity = getActivity(slot);
        const destCoords = currentActivity?.activity?.place?.coordinates;

        // Recalculate commute if we have both coordinates
        if (originCoords && destCoords) {
          const distanceMeters = haversineDistance(
            originCoords.lat,
            originCoords.lng,
            destCoords.lat,
            destCoords.lng
          );
          const distanceKm = distanceMeters / 1000;
          const method = inferCommuteMethod(distanceMeters);
          const newDuration = estimateCommuteDuration(distanceMeters, method);

          // Update the commute data
          slot.commuteFromPrevious = {
            ...commute,
            duration: newDuration,
            method: method,
            distance: distanceMeters, // Store in meters to match formatDistance expectations
          };

          wasFixed = true;

          changes.push({
            type: "FIXED_INVALID_COMMUTE",
            day: day.dayNumber,
            slot: slot.slotId,
            reason: `Recalculated commute: ${originalDuration}min → ${newDuration}min (${distanceKm.toFixed(1)}km by ${method})`,
          });

          // Add metadata to track the fix
          (slot as SlotWithOptions & { metadata?: Record<string, unknown> }).metadata = {
            ...((slot as SlotWithOptions & { metadata?: Record<string, unknown> }).metadata || {}),
            commuteRecalculated: true,
            originalCommute: originalDuration,
            calculatedDistance: distanceKm,
          };
        }

        // If we couldn't fix it, just flag it
        if (!wasFixed) {
          (slot as SlotWithOptions & { metadata?: Record<string, unknown> }).metadata = {
            ...((slot as SlotWithOptions & { metadata?: Record<string, unknown> }).metadata || {}),
            needsCommuteRecalculation: true,
            commuteIssue: "missing_coordinates",
            originalCommute: originalDuration,
          };

          changes.push({
            type: "FLAGGED_INVALID_COMMUTE",
            day: day.dayNumber,
            slot: slot.slotId,
            reason: `Could not recalculate (missing coordinates): ${originalDuration}min exceeds threshold`,
          });
        }
      }
    }
  }

  return { itinerary: fixed, changes };
}

/**
 * Remove slots that occur before arrival (Day 1) or after departure (last day)
 */
function remediateRemoveImpossibleSlots(
  itinerary: StructuredItineraryData,
  constraints?: FlightConstraints
): RemediationResult {
  if (!constraints) return { itinerary, changes: [] };

  const changes: RemediationChange[] = [];
  const fixed = deepClone(itinerary);

  // Day 1: Remove slots that end before arrival + 2h
  if (constraints.arrivalFlightTime && fixed.days.length > 0) {
    const day1 = fixed.days[0];
    const arrivalMins = parseTime(constraints.arrivalFlightTime);
    if (arrivalMins !== null) {
      const earliestActivityMins = arrivalMins + 120;

      day1.slots = day1.slots.filter((slot) => {
        if (slot.behavior === "travel") return true;

        const slotEnd = slot.timeRange ? parseTime(slot.timeRange.end) : null;
        if (slotEnd !== null && slotEnd <= earliestActivityMins) {
          changes.push({
            type: "REMOVED_IMPOSSIBLE_SLOT",
            day: day1.dayNumber,
            slot: slot.slotId,
            reason: `Slot ends before arrival (${constraints.arrivalFlightTime} + 2h)`,
          });
          return false;
        }
        return true;
      });
    }
  }

  // Last day: Remove slots that start after departure - 3h
  if (constraints.departureFlightTime && fixed.days.length > 0) {
    const lastDay = fixed.days[fixed.days.length - 1];
    const departureMins = parseTime(constraints.departureFlightTime);
    if (departureMins !== null) {
      const latestActivityMins = departureMins - 180;

      lastDay.slots = lastDay.slots.filter((slot) => {
        if (slot.behavior === "travel") return true;

        const slotStart = slot.timeRange ? parseTime(slot.timeRange.start) : null;
        if (slotStart !== null && slotStart >= latestActivityMins) {
          changes.push({
            type: "REMOVED_IMPOSSIBLE_SLOT",
            day: lastDay.dayNumber,
            slot: slot.slotId,
            reason: `Slot starts after departure prep (${constraints.departureFlightTime} - 3h)`,
          });
          return false;
        }
        return true;
      });
    }
  }

  return { itinerary: fixed, changes };
}

/**
 * Remove duplicate activities from later days (keep first occurrence)
 */
function remediateCrossDayDuplicates(
  itinerary: StructuredItineraryData
): RemediationResult {
  const changes: RemediationChange[] = [];
  const fixed = deepClone(itinerary);
  const seenActivities = new Map<string, { day: number; slotIndex: number }>();

  for (let dayIndex = 0; dayIndex < fixed.days.length; dayIndex++) {
    const day = fixed.days[dayIndex];
    const slotsToRemove: number[] = [];

    for (let slotIndex = 0; slotIndex < day.slots.length; slotIndex++) {
      const slot = day.slots[slotIndex];
      const activity = getActivity(slot);
      if (!activity?.activity) continue;

      const activityData = activity.activity;
      const name = activityData.name;
      const placeId = activityData.place?.googlePlaceId;

      if (!name) continue;

      // Use placeId if available, otherwise normalize name
      const key = placeId || name.toLowerCase().trim();

      if (seenActivities.has(key)) {
        const previous = seenActivities.get(key)!;
        slotsToRemove.push(slotIndex);
        changes.push({
          type: "REMOVED_DUPLICATE",
          day: day.dayNumber,
          slot: slot.slotId,
          reason: `Removed duplicate "${name}" (already on Day ${previous.day})`,
        });
      } else {
        seenActivities.set(key, { day: day.dayNumber, slotIndex });
      }
    }

    // Remove slots in reverse order to maintain indices
    for (let i = slotsToRemove.length - 1; i >= 0; i--) {
      day.slots.splice(slotsToRemove[i], 1);
    }
  }

  return { itinerary: fixed, changes };
}

/**
 * Set behavior: "travel" on transport/transfer slots
 */
function remediateFixTransferBehavior(
  itinerary: StructuredItineraryData
): RemediationResult {
  const changes: RemediationChange[] = [];
  const fixed = deepClone(itinerary);

  for (const day of fixed.days) {
    for (const slot of day.slots) {
      const activity = getActivity(slot);
      if (!activity?.activity) continue;

      const activityData = activity.activity;
      const isTransportCategory = activityData.category === "transport";
      const name = activityData.name || "";
      const nameLower = name.toLowerCase();
      const nameIndicatesTransfer =
        nameLower.includes("transfer") ||
        nameLower.includes("shinkansen") ||
        nameLower.includes("airport") ||
        nameLower.includes("train") ||
        nameLower.includes("bus") ||
        nameLower.includes("taxi");

      if ((isTransportCategory || nameIndicatesTransfer) && slot.behavior !== "travel") {
        const oldBehavior = slot.behavior;
        slot.behavior = "travel";
        changes.push({
          type: "FIXED_TRANSFER_BEHAVIOR",
          day: day.dayNumber,
          slot: slot.slotId,
          reason: `Changed behavior from "${oldBehavior}" to "travel" for "${name}"`,
        });
      }
    }
  }

  return { itinerary: fixed, changes };
}

/**
 * Set behavior: "meal" on lunch/dinner/breakfast slots
 */
function remediateFixMealBehavior(
  itinerary: StructuredItineraryData
): RemediationResult {
  const changes: RemediationChange[] = [];
  const fixed = deepClone(itinerary);

  for (const day of fixed.days) {
    for (const slot of day.slots) {
      const slotType = slot.slotType?.toLowerCase() || "";
      const isMealSlot = slotType === "lunch" || slotType === "dinner" || slotType === "breakfast";

      if (isMealSlot && slot.behavior !== "meal" && slot.behavior !== "travel") {
        const oldBehavior = slot.behavior;
        slot.behavior = "meal";
        changes.push({
          type: "FIXED_MEAL_BEHAVIOR",
          day: day.dayNumber,
          slot: slot.slotId,
          reason: `Changed behavior from "${oldBehavior || "undefined"}" to "meal" for "${slot.slotType}"`,
        });
      }
    }
  }

  return { itinerary: fixed, changes };
}

/**
 * Set behavior: "anchor" on pre-booked activities
 */
function remediateFixAnchorBehavior(
  itinerary: StructuredItineraryData
): RemediationResult {
  const changes: RemediationChange[] = [];
  const fixed = deepClone(itinerary);

  for (const day of fixed.days) {
    for (const slot of day.slots) {
      const activity = getActivity(slot);
      if (!activity?.activity) continue;

      const activityData = activity.activity;
      const tags = activityData.tags || [];
      const isPreBooked = tags.includes("pre-booked") || tags.includes("anchor");

      if (isPreBooked && slot.behavior !== "anchor") {
        const oldBehavior = slot.behavior;
        slot.behavior = "anchor";
        changes.push({
          type: "FIXED_ANCHOR_BEHAVIOR",
          day: day.dayNumber,
          slot: slot.slotId,
          reason: `Changed behavior from "${oldBehavior || "undefined"}" to "anchor" for pre-booked "${activityData.name}"`,
        });
      }
    }
  }

  return { itinerary: fixed, changes };
}

/**
 * Flag meals with long commutes for nearby replacement
 */
function remediateMealLongCommute(
  itinerary: StructuredItineraryData,
  commuteThreshold: number = 30
): RemediationResult {
  const changes: RemediationChange[] = [];
  const fixed = deepClone(itinerary);

  for (const day of fixed.days) {
    const slots = day.slots || [];

    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      const slotType = slot.slotType?.toLowerCase() || "";

      if (slotType !== "lunch" && slotType !== "dinner" && slotType !== "breakfast") {
        continue;
      }

      // Check if this meal has a long commute TO it
      if (slot.commuteFromPrevious && slot.commuteFromPrevious.duration > commuteThreshold && i > 0) {
        const prevSlot = slots[i - 1];
        const prevActivity = getActivity(prevSlot);

        if (prevActivity?.activity?.place?.coordinates) {
          const prevCoords = prevActivity.activity.place.coordinates;

          // Add metadata for nearby search
          (slot as SlotWithOptions & { metadata?: Record<string, unknown> }).metadata = {
            ...((slot as SlotWithOptions & { metadata?: Record<string, unknown> }).metadata || {}),
            needsNearbyReplacement: true,
            searchNearCoordinates: prevCoords,
            reason: `Long commute from previous activity (${slot.commuteFromPrevious.duration} min)`,
          };

          changes.push({
            type: "FLAGGED_MEAL_FOR_NEARBY_SEARCH",
            day: day.dayNumber,
            slot: slot.slotId,
            reason: `${slotType} flagged for nearby search (commute: ${slot.commuteFromPrevious.duration} min)`,
          });
        }
      }

      // Check if this meal has a long commute FROM it
      if (i < slots.length - 1) {
        const nextSlot = slots[i + 1];
        if (nextSlot.commuteFromPrevious && nextSlot.commuteFromPrevious.duration > commuteThreshold) {
          const nextActivity = getActivity(nextSlot);

          if (nextActivity?.activity?.place?.coordinates) {
            const nextCoords = nextActivity.activity.place.coordinates;

            (slot as SlotWithOptions & { metadata?: Record<string, unknown> }).metadata = {
              ...((slot as SlotWithOptions & { metadata?: Record<string, unknown> }).metadata || {}),
              needsNearbyReplacement: true,
              searchNearCoordinates: nextCoords,
              reason: `Long commute to next activity (${nextSlot.commuteFromPrevious.duration} min)`,
            };

            changes.push({
              type: "FLAGGED_MEAL_FOR_NEARBY_SEARCH",
              day: day.dayNumber,
              slot: slot.slotId,
              reason: `${slotType} flagged for nearby search (commute: ${nextSlot.commuteFromPrevious.duration} min to next)`,
            });
          }
        }
      }
    }
  }

  return { itinerary: fixed, changes };
}

/**
 * Flag empty slots for activity suggestion
 */
function remediateEmptySlots(
  itinerary: StructuredItineraryData
): RemediationResult {
  const changes: RemediationChange[] = [];
  const fixed = deepClone(itinerary);

  for (const day of fixed.days) {
    for (const slot of day.slots) {
      const hasOptions = slot.options && slot.options.length > 0;
      const hasActivity = hasOptions && slot.options[0]?.activity;

      if (!hasActivity) {
        const slotType = slot.slotType?.toLowerCase() || "";
        const isMeal = slotType === "lunch" || slotType === "dinner" || slotType === "breakfast";

        (slot as SlotWithOptions & { metadata?: Record<string, unknown> }).metadata = {
          ...((slot as SlotWithOptions & { metadata?: Record<string, unknown> }).metadata || {}),
          needsActivity: true,
          suggestedCategory: isMeal ? "restaurant" : "attraction",
        };

        changes.push({
          type: "FLAGGED_EMPTY_SLOT",
          day: day.dayNumber,
          slot: slot.slotId,
          reason: `Empty slot "${slot.slotType}" flagged for activity suggestion`,
        });
      }
    }
  }

  return { itinerary: fixed, changes };
}

/**
 * Recalculate slot IDs after modifications
 */
function remediateRecalculateSlotIds(
  itinerary: StructuredItineraryData
): RemediationResult {
  const changes: RemediationChange[] = [];
  const fixed = deepClone(itinerary);

  for (const day of fixed.days) {
    for (let i = 0; i < day.slots.length; i++) {
      const slot = day.slots[i];
      const expectedId = `d${day.dayNumber}-slot-${i + 1}`;
      if (slot.slotId !== expectedId) {
        const oldId = slot.slotId;
        slot.slotId = expectedId;
        changes.push({
          type: "FIXED_SLOT_ID",
          day: day.dayNumber,
          slot: expectedId,
          reason: `Renumbered slot from "${oldId}" to "${expectedId}"`,
        });
      }
    }
  }

  return { itinerary: fixed, changes };
}

// ============================================
// MAIN REMEDIATION FUNCTION
// ============================================

/**
 * Run all remediations on an itinerary
 */
export function remediateItinerary(
  itinerary: StructuredItineraryData,
  constraints?: FlightConstraints,
  options: RemediationOptions = {}
): RemediationResult {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let current = itinerary;
  let allChanges: RemediationChange[] = [];

  debugLog("Starting itinerary remediation...");

  // 1. Add missing arrival coordinates (run first to fix commute calculation issues)
  if (opts.addArrivalCoordinates) {
    const r = remediateAddArrivalCoordinates(current);
    current = r.itinerary;
    allChanges = allChanges.concat(r.changes);
    if (r.changes.length > 0) {
      debugLog(`Added ${r.changes.length} arrival coordinates`);
    }
  }

  // 2. Remove impossible slots
  if (opts.removeImpossibleSlots) {
    const r = remediateRemoveImpossibleSlots(current, constraints);
    current = r.itinerary;
    allChanges = allChanges.concat(r.changes);
    if (r.changes.length > 0) {
      debugLog(`Removed ${r.changes.length} impossible slots`);
    }
  }

  // 2. Remove cross-day duplicates
  if (opts.removeCrossDayDuplicates) {
    const r = remediateCrossDayDuplicates(current);
    current = r.itinerary;
    allChanges = allChanges.concat(r.changes);
    if (r.changes.length > 0) {
      debugLog(`Removed ${r.changes.length} cross-day duplicates`);
    }
  }

  // 3. Fix transfer slot behaviors
  if (opts.fixTransferBehavior) {
    const r = remediateFixTransferBehavior(current);
    current = r.itinerary;
    allChanges = allChanges.concat(r.changes);
    if (r.changes.length > 0) {
      debugLog(`Fixed ${r.changes.length} transfer behaviors`);
    }
  }

  // 4. Fix meal slot behaviors
  if (opts.fixMealBehavior) {
    const r = remediateFixMealBehavior(current);
    current = r.itinerary;
    allChanges = allChanges.concat(r.changes);
    if (r.changes.length > 0) {
      debugLog(`Fixed ${r.changes.length} meal behaviors`);
    }
  }

  // 5. Fix anchor behaviors
  if (opts.fixAnchorBehavior) {
    const r = remediateFixAnchorBehavior(current);
    current = r.itinerary;
    allChanges = allChanges.concat(r.changes);
    if (r.changes.length > 0) {
      debugLog(`Fixed ${r.changes.length} anchor behaviors`);
    }
  }

  // 6. Flag meals with long commutes
  if (opts.flagMealLongCommute) {
    const r = remediateMealLongCommute(current, opts.commuteThresholdMinutes);
    current = r.itinerary;
    allChanges = allChanges.concat(r.changes);
    if (r.changes.length > 0) {
      debugLog(`Flagged ${r.changes.length} meals for nearby search`);
    }
  }

  // 7. Flag empty slots
  if (opts.flagEmptySlots) {
    const r = remediateEmptySlots(current);
    current = r.itinerary;
    allChanges = allChanges.concat(r.changes);
    if (r.changes.length > 0) {
      debugLog(`Flagged ${r.changes.length} empty slots`);
    }
  }

  // 8. Flag invalid commutes for recalculation
  if (opts.remediateInvalidCommutes) {
    const r = remediateInvalidCommutes(current);
    current = r.itinerary;
    allChanges = allChanges.concat(r.changes);
    if (r.changes.length > 0) {
      debugLog(`Flagged ${r.changes.length} invalid commutes for recalculation`);
    }
  }

  // 9. Recalculate slot IDs (always run last)
  if (opts.recalculateSlotIds) {
    const r = remediateRecalculateSlotIds(current);
    current = r.itinerary;
    allChanges = allChanges.concat(r.changes);
    if (r.changes.length > 0) {
      debugLog(`Renumbered ${r.changes.length} slot IDs`);
    }
  }

  debugLog(`Complete. Total changes: ${allChanges.length}`);

  return { itinerary: current, changes: allChanges };
}

// Export individual remediation functions for selective use
export {
  remediateRemoveImpossibleSlots,
  remediateCrossDayDuplicates,
  remediateFixTransferBehavior,
  remediateFixMealBehavior,
  remediateFixAnchorBehavior,
  remediateMealLongCommute,
  remediateEmptySlots,
  remediateRecalculateSlotIds,
  // Validation functions (detect issues without fixing)
  validateCommuteData,
  validateArrivalTiming,
  validateCityTransitions,
};
