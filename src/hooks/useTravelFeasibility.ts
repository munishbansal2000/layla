/**
 * Travel Feasibility Hook
 *
 * Provides travel time feasibility checking for activity moves.
 * Calculates if there's enough time for commute between activities.
 */

import { useCallback } from 'react';
import type { SlotWithOptions, ActivityOption } from '@/types/structured-itinerary';

export interface TravelFeasibilityResult {
  feasible: boolean;
  travelToTarget: number;      // minutes to get TO the target location
  travelFromTarget: number;    // minutes to get FROM the target location
  totalTravelTime: number;     // total additional travel time
  availableGap: number;        // available time gap in minutes
  warnings: string[];
  suggestedBuffer?: number;    // suggested additional buffer time
  travelMethod: 'walk' | 'transit' | 'taxi' | 'drive';
}

export interface TravelFeasibilityOptions {
  precedingSlot?: SlotWithOptions;
  followingSlot?: SlotWithOptions;
  targetSlot: SlotWithOptions;
  activityToMove: ActivityOption;
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
 * Estimate travel time based on distance and method
 */
function estimateTravelTime(
  distanceMeters: number
): { minutes: number; method: 'walk' | 'transit' | 'taxi' | 'drive' } {
  // Walking: ~5 km/h = 83 m/min
  // Transit: ~20 km/h = 333 m/min (including wait times)
  // Taxi/Drive: ~30 km/h = 500 m/min (urban traffic)

  if (distanceMeters <= 1000) {
    // Under 1km: walk
    return {
      minutes: Math.ceil(distanceMeters / 83),
      method: 'walk'
    };
  } else if (distanceMeters <= 5000) {
    // 1-5km: transit or walk
    const walkTime = Math.ceil(distanceMeters / 83);
    const transitTime = Math.ceil(distanceMeters / 333) + 10; // +10 for wait

    if (transitTime < walkTime) {
      return { minutes: transitTime, method: 'transit' };
    }
    return { minutes: walkTime, method: 'walk' };
  } else {
    // Over 5km: transit or taxi
    const transitTime = Math.ceil(distanceMeters / 333) + 15; // +15 for wait/transfer
    return { minutes: transitTime, method: 'transit' };
  }
}

/**
 * Parse time string "HH:MM" to minutes since midnight
 */
function parseTimeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}

/**
 * Get coordinates from a slot's selected activity
 */
function getSlotCoordinates(slot: SlotWithOptions): { lat: number; lng: number } | null {
  const selectedOption = slot.options.find(o => o.id === slot.selectedOptionId) || slot.options[0];
  if (!selectedOption?.activity?.place?.coordinates) {
    return null;
  }
  return selectedOption.activity.place.coordinates;
}

export function useTravelFeasibility() {
  /**
   * Check if moving an activity to a target slot is feasible
   * considering travel times to and from adjacent activities
   */
  const checkMoveFeasibility = useCallback((
    options: TravelFeasibilityOptions
  ): TravelFeasibilityResult => {
    const { precedingSlot, followingSlot, targetSlot, activityToMove } = options;

    const warnings: string[] = [];
    let travelToTarget = 0;
    let travelFromTarget = 0;
    let travelMethod: 'walk' | 'transit' | 'taxi' | 'drive' = 'walk';

    // Get coordinates of the activity being moved
    const activityCoords = activityToMove.activity?.place?.coordinates;

    if (!activityCoords) {
      return {
        feasible: true, // Can't validate without coordinates
        travelToTarget: 15, // Default buffer
        travelFromTarget: 15,
        totalTravelTime: 30,
        availableGap: 60, // Assume reasonable gap
        warnings: ['Cannot calculate exact travel time - location data missing'],
        travelMethod: 'walk'
      };
    }

    // Calculate travel time FROM preceding activity TO the moved activity
    if (precedingSlot) {
      const precedingCoords = getSlotCoordinates(precedingSlot);
      if (precedingCoords) {
        const distance = haversineDistance(
          precedingCoords.lat,
          precedingCoords.lng,
          activityCoords.lat,
          activityCoords.lng
        );
        const travel = estimateTravelTime(distance);
        travelToTarget = travel.minutes;
        travelMethod = travel.method;

        if (distance > 10000) {
          warnings.push(`Long travel distance: ${(distance / 1000).toFixed(1)}km from previous activity`);
        }
      }
    }

    // Calculate travel time FROM the moved activity TO the following activity
    if (followingSlot) {
      const followingCoords = getSlotCoordinates(followingSlot);
      if (followingCoords) {
        const distance = haversineDistance(
          activityCoords.lat,
          activityCoords.lng,
          followingCoords.lat,
          followingCoords.lng
        );
        const travel = estimateTravelTime(distance);
        travelFromTarget = travel.minutes;

        if (travel.method !== 'walk') {
          travelMethod = travel.method;
        }

        if (distance > 10000) {
          warnings.push(`Long travel distance: ${(distance / 1000).toFixed(1)}km to next activity`);
        }
      }
    }

    // Calculate available time gap
    const activityDuration = activityToMove.activity?.duration || 60;
    const slotStart = parseTimeToMinutes(targetSlot.timeRange.start);
    const slotEnd = parseTimeToMinutes(targetSlot.timeRange.end);
    const availableGap = slotEnd - slotStart;

    // Check if activity + travel times fit
    const totalTimeNeeded = activityDuration + travelToTarget + travelFromTarget;
    const feasible = totalTimeNeeded <= availableGap + 30; // Allow 30 min flexibility

    if (!feasible) {
      warnings.push(
        `Activity (${activityDuration}min) + travel (${travelToTarget + travelFromTarget}min) = ${totalTimeNeeded}min, but only ${availableGap}min available`
      );
    }

    // Suggest buffer if tight schedule
    const suggestedBuffer = totalTimeNeeded > availableGap
      ? totalTimeNeeded - availableGap + 15
      : undefined;

    return {
      feasible,
      travelToTarget,
      travelFromTarget,
      totalTravelTime: travelToTarget + travelFromTarget,
      availableGap,
      warnings,
      suggestedBuffer,
      travelMethod
    };
  }, []);

  /**
   * Check feasibility of swapping two activities
   */
  const checkSwapFeasibility = useCallback((
    slot1: SlotWithOptions,
    slot2: SlotWithOptions,
    allSlots: SlotWithOptions[]
  ): { feasible: boolean; warnings: string[] } => {
    const warnings: string[] = [];

    // Get indices
    const idx1 = allSlots.findIndex(s => s.slotId === slot1.slotId);
    const idx2 = allSlots.findIndex(s => s.slotId === slot2.slotId);

    if (idx1 === -1 || idx2 === -1) {
      return { feasible: false, warnings: ['Slots not found'] };
    }

    // Get activities
    const activity1 = slot1.options.find(o => o.id === slot1.selectedOptionId) || slot1.options[0];
    const activity2 = slot2.options.find(o => o.id === slot2.selectedOptionId) || slot2.options[0];

    if (!activity1 || !activity2) {
      return { feasible: true, warnings: [] }; // Can't validate without activities
    }

    // Check if activity1 fits in slot2's time range
    const slot2Duration = parseTimeToMinutes(slot2.timeRange.end) - parseTimeToMinutes(slot2.timeRange.start);
    if (activity1.activity?.duration && activity1.activity.duration > slot2Duration + 30) {
      warnings.push(`${activity1.activity.name} may be too long for the target time slot`);
    }

    // Check if activity2 fits in slot1's time range
    const slot1Duration = parseTimeToMinutes(slot1.timeRange.end) - parseTimeToMinutes(slot1.timeRange.start);
    if (activity2.activity?.duration && activity2.activity.duration > slot1Duration + 30) {
      warnings.push(`${activity2.activity.name} may be too long for the target time slot`);
    }

    return {
      feasible: warnings.length === 0,
      warnings
    };
  }, []);

  /**
   * Calculate optimal commute times for a sequence of slots
   */
  const calculateOptimalCommutes = useCallback((
    slots: SlotWithOptions[]
  ): { slotId: string; commute: { duration: number; method: string; distance: number } }[] => {
    const results: { slotId: string; commute: { duration: number; method: string; distance: number } }[] = [];

    for (let i = 1; i < slots.length; i++) {
      const prevSlot = slots[i - 1];
      const currSlot = slots[i];

      const prevCoords = getSlotCoordinates(prevSlot);
      const currCoords = getSlotCoordinates(currSlot);

      if (prevCoords && currCoords) {
        const distance = haversineDistance(
          prevCoords.lat,
          prevCoords.lng,
          currCoords.lat,
          currCoords.lng
        );
        const travel = estimateTravelTime(distance);

        results.push({
          slotId: currSlot.slotId,
          commute: {
            duration: travel.minutes,
            method: travel.method,
            distance: Math.round(distance)
          }
        });
      } else {
        // Default commute if coordinates missing
        results.push({
          slotId: currSlot.slotId,
          commute: {
            duration: 15,
            method: 'walk',
            distance: 1000
          }
        });
      }
    }

    return results;
  }, []);

  return {
    checkMoveFeasibility,
    checkSwapFeasibility,
    calculateOptimalCommutes
  };
}

export default useTravelFeasibility;
