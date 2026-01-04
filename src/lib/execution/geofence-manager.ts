// ============================================
// GEOFENCE MANAGER
// ============================================
// Create and manage geofences for activity detection.
// Implements geofencing from EXECUTION_PHASE_DESIGN.md

import {
  Geofence,
  GeofenceType,
  GeofenceEvent,
  UserLocation,
} from "@/types/execution";
import { Coordinates } from "@/types/activity-suggestion";
import { DayWithOptions, SlotWithOptions } from "@/types/structured-itinerary";
import { getSelectedActivity } from "./execution-helpers";

// ============================================
// CONSTANTS
// ============================================

/**
 * Default radius for activity geofences (meters)
 */
export const DEFAULT_ACTIVITY_RADIUS = 150;

/**
 * Default radius for hotel geofences (meters)
 */
export const DEFAULT_HOTEL_RADIUS = 250;

/**
 * Default radius for transit station geofences (meters)
 */
export const DEFAULT_TRANSIT_RADIUS = 100;

/**
 * Earth's radius in meters (for distance calculations)
 */
const EARTH_RADIUS_METERS = 6371000;

// ============================================
// GEOFENCE CREATION
// ============================================

/**
 * Generate a unique geofence ID
 */
function generateGeofenceId(): string {
  return `geo-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create geofences for all activities in a day
 */
export function createGeofencesForDay(day: DayWithOptions): Geofence[] {
  const geofences: Geofence[] = [];

  for (const slot of day.slots) {
    const geofence = createSlotGeofence(slot);
    if (geofence) {
      geofences.push(geofence);
    }
  }

  return geofences;
}

/**
 * Create a geofence for a single slot (using selected activity)
 */
export function createSlotGeofence(
  slot: SlotWithOptions
): Geofence | null {
  const activity = getSelectedActivity(slot);

  if (!activity?.activity.place?.coordinates) {
    return null;
  }

  const coords = activity.activity.place.coordinates;

  return {
    id: generateGeofenceId(),
    type: "activity",
    center: {
      lat: coords.lat,
      lng: coords.lng,
    },
    radius: DEFAULT_ACTIVITY_RADIUS,
    activitySlotId: slot.slotId,
    activityName: activity.activity.name,
  };
}

/**
 * Create a geofence for a hotel/accommodation
 */
export function createHotelGeofence(
  hotelName: string,
  coordinates: Coordinates
): Geofence {
  return {
    id: generateGeofenceId(),
    type: "hotel",
    center: coordinates,
    radius: DEFAULT_HOTEL_RADIUS,
    activityName: hotelName,
  };
}

/**
 * Create a geofence for a transit station
 */
export function createTransitGeofence(
  stationName: string,
  coordinates: Coordinates
): Geofence {
  return {
    id: generateGeofenceId(),
    type: "transit_station",
    center: coordinates,
    radius: DEFAULT_TRANSIT_RADIUS,
    activityName: stationName,
  };
}

/**
 * Create a custom geofence
 */
export function createCustomGeofence(
  name: string,
  coordinates: Coordinates,
  radius: number
): Geofence {
  return {
    id: generateGeofenceId(),
    type: "custom",
    center: coordinates,
    radius,
    activityName: name,
  };
}

// ============================================
// DISTANCE CALCULATIONS
// ============================================

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
export function calculateDistance(
  point1: Coordinates,
  point2: Coordinates
): number {
  const lat1Rad = toRadians(point1.lat);
  const lat2Rad = toRadians(point2.lat);
  const deltaLat = toRadians(point2.lat - point1.lat);
  const deltaLng = toRadians(point2.lng - point1.lng);

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_METERS * c;
}

/**
 * Convert degrees to radians
 */
function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Calculate distance from a location to a geofence center
 */
export function calculateDistanceToGeofence(
  location: Coordinates,
  geofence: Geofence
): number {
  return calculateDistance(location, geofence.center);
}

/**
 * Calculate distance to geofence edge (negative if inside)
 */
export function calculateDistanceToGeofenceEdge(
  location: Coordinates,
  geofence: Geofence
): number {
  const distanceToCenter = calculateDistance(location, geofence.center);
  return distanceToCenter - geofence.radius;
}

// ============================================
// GEOFENCE DETECTION
// ============================================

/**
 * Check if a location is inside a geofence
 */
export function isInsideGeofence(
  location: Coordinates,
  geofence: Geofence
): boolean {
  const distance = calculateDistance(location, geofence.center);
  return distance <= geofence.radius;
}

/**
 * Find the nearest geofence to a location
 */
export function findNearestGeofence(
  location: Coordinates,
  geofences: Geofence[]
): Geofence | null {
  if (geofences.length === 0) {
    return null;
  }

  let nearest: Geofence | null = null;
  let nearestDistance = Infinity;

  for (const geofence of geofences) {
    const distance = calculateDistance(location, geofence.center);
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = geofence;
    }
  }

  return nearest;
}

/**
 * Find all geofences that contain a location
 */
export function findContainingGeofences(
  location: Coordinates,
  geofences: Geofence[]
): Geofence[] {
  return geofences.filter((geofence) => isInsideGeofence(location, geofence));
}

/**
 * Detect geofence enter/exit events based on location change
 */
export function detectGeofenceEvents(
  previousLocation: Coordinates | null,
  currentLocation: Coordinates,
  geofences: Geofence[]
): { entered: Geofence[]; exited: Geofence[] } {
  const currentlyInside = new Set(
    findContainingGeofences(currentLocation, geofences).map((g) => g.id)
  );

  const previouslyInside = previousLocation
    ? new Set(
        findContainingGeofences(previousLocation, geofences).map((g) => g.id)
      )
    : new Set<string>();

  const entered: Geofence[] = [];
  const exited: Geofence[] = [];

  for (const geofence of geofences) {
    const wasInside = previouslyInside.has(geofence.id);
    const isInside = currentlyInside.has(geofence.id);

    if (!wasInside && isInside) {
      entered.push(geofence);
    } else if (wasInside && !isInside) {
      exited.push(geofence);
    }
  }

  return { entered, exited };
}

/**
 * Create a GeofenceEvent object
 */
export function createGeofenceEvent(
  type: "enter" | "exit" | "dwell",
  geofence: Geofence,
  dwellDuration?: number
): GeofenceEvent {
  return {
    type,
    geofenceId: geofence.id,
    geofence,
    timestamp: new Date(),
    dwellDuration,
  };
}

// ============================================
// DWELL DETECTION
// ============================================

interface DwellTracker {
  geofenceId: string;
  enteredAt: Date;
  lastSeenAt: Date;
}

/**
 * Track dwell time in geofences
 */
export class GeofenceDwellTracker {
  private dwellTrackers: Map<string, DwellTracker> = new Map();
  private dwellThreshold: number; // seconds

  constructor(dwellThresholdSeconds: number = 600) {
    // Default: 10 minutes
    this.dwellThreshold = dwellThresholdSeconds;
  }

  /**
   * Update tracking with new location
   */
  updateLocation(
    location: Coordinates,
    geofences: Geofence[]
  ): GeofenceEvent[] {
    const events: GeofenceEvent[] = [];
    const now = new Date();
    const currentlyInside = findContainingGeofences(location, geofences);

    // Update dwell trackers for geofences we're in
    for (const geofence of currentlyInside) {
      const existing = this.dwellTrackers.get(geofence.id);

      if (existing) {
        // Already tracking - update last seen
        existing.lastSeenAt = now;

        // Check if we've crossed the dwell threshold
        const dwellSeconds =
          (now.getTime() - existing.enteredAt.getTime()) / 1000;

        if (dwellSeconds >= this.dwellThreshold) {
          // Emit dwell event (only once per threshold crossing)
          const expectedCrossing =
            existing.enteredAt.getTime() + this.dwellThreshold * 1000;
          const lastUpdate = existing.lastSeenAt.getTime();

          if (lastUpdate < expectedCrossing && now.getTime() >= expectedCrossing) {
            events.push(createGeofenceEvent("dwell", geofence, dwellSeconds));
          }
        }
      } else {
        // Start tracking
        this.dwellTrackers.set(geofence.id, {
          geofenceId: geofence.id,
          enteredAt: now,
          lastSeenAt: now,
        });
      }
    }

    // Remove trackers for geofences we've left
    const currentIds = new Set(currentlyInside.map((g) => g.id));
    for (const [id] of this.dwellTrackers) {
      if (!currentIds.has(id)) {
        this.dwellTrackers.delete(id);
      }
    }

    return events;
  }

  /**
   * Get current dwell time for a geofence
   */
  getDwellTime(geofenceId: string): number | null {
    const tracker = this.dwellTrackers.get(geofenceId);
    if (!tracker) {
      return null;
    }
    return (Date.now() - tracker.enteredAt.getTime()) / 1000;
  }

  /**
   * Reset all tracking
   */
  reset(): void {
    this.dwellTrackers.clear();
  }
}

// ============================================
// GEOFENCE PROXIMITY
// ============================================

/**
 * Get geofences sorted by distance from location
 */
export function getGeofencesByDistance(
  location: Coordinates,
  geofences: Geofence[]
): { geofence: Geofence; distance: number }[] {
  return geofences
    .map((geofence) => ({
      geofence,
      distance: calculateDistance(location, geofence.center),
    }))
    .sort((a, b) => a.distance - b.distance);
}

/**
 * Get geofences within a certain distance
 */
export function getNearbyGeofences(
  location: Coordinates,
  geofences: Geofence[],
  maxDistance: number
): Geofence[] {
  return geofences.filter((geofence) => {
    const distance = calculateDistance(location, geofence.center);
    return distance <= maxDistance;
  });
}

/**
 * Check if user is heading toward a geofence
 */
export function isHeadingToward(
  currentLocation: Coordinates,
  previousLocation: Coordinates,
  geofence: Geofence
): boolean {
  const previousDistance = calculateDistance(previousLocation, geofence.center);
  const currentDistance = calculateDistance(currentLocation, geofence.center);

  // Heading toward if current distance is less than previous
  return currentDistance < previousDistance;
}

/**
 * Estimate time to reach a geofence based on current speed
 */
export function estimateTimeToGeofence(
  currentLocation: Coordinates,
  geofence: Geofence,
  speedMetersPerSecond: number
): number | null {
  if (speedMetersPerSecond <= 0) {
    return null;
  }

  const distance = calculateDistance(currentLocation, geofence.center);
  const distanceToEdge = Math.max(0, distance - geofence.radius);

  return distanceToEdge / speedMetersPerSecond; // seconds
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get the geofence for a specific activity slot
 */
export function getGeofenceBySlotId(
  slotId: string,
  geofences: Geofence[]
): Geofence | null {
  return geofences.find((g) => g.activitySlotId === slotId) || null;
}

/**
 * Filter geofences by type
 */
export function filterGeofencesByType(
  geofences: Geofence[],
  type: GeofenceType
): Geofence[] {
  return geofences.filter((g) => g.type === type);
}

/**
 * Merge overlapping geofences (for optimization)
 */
export function mergeOverlappingGeofences(geofences: Geofence[]): Geofence[] {
  // Simple implementation - could be enhanced with clustering
  const merged: Geofence[] = [];

  for (const geofence of geofences) {
    let wasMerged = false;

    for (const existing of merged) {
      const distance = calculateDistance(geofence.center, existing.center);
      const combinedRadius = geofence.radius + existing.radius;

      // If geofences overlap significantly (more than 50%)
      if (distance < combinedRadius * 0.5) {
        // Expand the existing geofence to encompass both
        existing.radius = Math.max(existing.radius, distance + geofence.radius);
        wasMerged = true;
        break;
      }
    }

    if (!wasMerged) {
      merged.push({ ...geofence });
    }
  }

  return merged;
}

/**
 * Create a bounding box that contains all geofences
 */
export function getGeofencesBoundingBox(geofences: Geofence[]): {
  north: number;
  south: number;
  east: number;
  west: number;
} | null {
  if (geofences.length === 0) {
    return null;
  }

  let north = -90;
  let south = 90;
  let east = -180;
  let west = 180;

  for (const geofence of geofences) {
    const { lat, lng } = geofence.center;
    const radiusDegrees = geofence.radius / 111000; // Rough conversion

    north = Math.max(north, lat + radiusDegrees);
    south = Math.min(south, lat - radiusDegrees);
    east = Math.max(east, lng + radiusDegrees);
    west = Math.min(west, lng - radiusDegrees);
  }

  return { north, south, east, west };
}
