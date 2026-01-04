/**
 * Routing Service
 *
 * Provides commute planning and optimization for trip itineraries.
 * Integrates with OSRM (OpenStreetMap Routing) as primary routing engine,
 * with Google Maps as fallback, and basic distance estimation as final fallback.
 *
 * Features:
 * - Multi-modal routing (walking, transit, driving, taxi)
 * - Travel time estimation between activities
 * - Route optimization for day plans
 * - Family-friendly adjustments (stroller, kids)
 * - Last train warnings
 *
 * Routing Priority:
 * 1. OSRM (OpenStreetMap) - Free, no API key required
 * 2. Google Maps - Requires API key, more accurate for transit
 * 3. Haversine estimation - Fallback when no API available
 */

import {
  isGoogleMapsConfigured,
  getRouteAlternatives,
  getTravelTime,
  getTravelTimes,
  getStaticMapUrl,
  getRouteMapUrl,
  decodePolyline,
  calculateDistance as calculateDistanceGM,
  formatDuration as formatDurationGM,
  formatDistance as formatDistanceGM,
  SimpleRoute,
  TravelTime,
  TravelMode,
  LatLng,
} from "./google-maps";

// ============================================
// OSRM (OpenStreetMap Routing Machine) CONFIG
// ============================================

// Public OSRM demo server (for development/testing)
// For production, consider self-hosting: https://github.com/Project-OSRM/osrm-backend
const OSRM_BASE_URL = process.env.OSRM_BASE_URL || "https://router.project-osrm.org";

// OSRM profile to CommuteMethod mapping
type OSRMProfile = "car" | "bike" | "foot";

interface OSRMRoute {
  distance: number; // meters
  duration: number; // seconds
  geometry: string; // encoded polyline
  legs: Array<{
    distance: number;
    duration: number;
    steps: Array<{
      distance: number;
      duration: number;
      name: string;
      maneuver: {
        type: string;
        modifier?: string;
        location: [number, number];
      };
    }>;
  }>;
}

interface OSRMResponse {
  code: string;
  routes: OSRMRoute[];
  waypoints: Array<{
    name: string;
    location: [number, number];
  }>;
}

/**
 * Check if OSRM is available (always true for public demo server)
 */
export function isOSRMConfigured(): boolean {
  return true;
}

/**
 * Get route from OSRM
 */
async function getOSRMRoute(
  origin: LatLng,
  destination: LatLng,
  profile: OSRMProfile = "foot"
): Promise<OSRMRoute | null> {
  try {
    const url = `${OSRM_BASE_URL}/route/v1/${profile}/${origin.lng},${origin.lat};${destination.lng},${destination.lat}?overview=full&geometries=polyline&steps=true`;

    const response = await fetch(url, {
      headers: {
        "User-Agent": "LaylaClone/1.0 (travel-planning-app)",
      },
    });

    if (!response.ok) {
      console.warn(`[OSRM] HTTP error: ${response.status}`);
      return null;
    }

    const data: OSRMResponse = await response.json();

    if (data.code !== "Ok" || !data.routes?.length) {
      console.warn(`[OSRM] No route found: ${data.code}`);
      return null;
    }

    return data.routes[0];
  } catch (error) {
    console.warn(`[OSRM] Route fetch failed:`, error);
    return null;
  }
}

/**
 * Map CommuteMethod to OSRM profile
 */
function commuteMethodToOSRMProfile(method: CommuteMethod): OSRMProfile {
  switch (method) {
    case "walk":
      return "foot";
    case "bicycle":
      return "bike";
    case "driving":
    case "taxi":
      return "car";
    default:
      return "foot"; // OSRM doesn't support transit, fallback to walking
  }
}

/**
 * Get travel duration from OSRM
 */
async function getOSRMDuration(
  origin: LatLng,
  destination: LatLng,
  method: CommuteMethod
): Promise<number | null> {
  // OSRM doesn't support transit - return null to fallback
  if (method === "transit" || method === "mixed") {
    return null;
  }

  const profile = commuteMethodToOSRMProfile(method);
  const route = await getOSRMRoute(origin, destination, profile);

  if (route) {
    console.log(`[OSRM] Got route: ${route.distance}m, ${route.duration}s`);
    return route.duration;
  }

  return null;
}

// ============================================
// TYPES
// ============================================

export type CommuteMethod = "walk" | "transit" | "taxi" | "driving" | "bicycle" | "mixed";

export interface CommuteOption {
  method: CommuteMethod;
  duration: number; // seconds
  durationText: string;
  distance: number; // meters
  distanceText: string;
  estimatedCost?: {
    amount: number;
    currency: string;
    text: string;
  };
  steps?: CommuteStep[];
  polyline?: string;
  warnings?: string[];
  recommended: boolean;
  reason?: string;
}

export interface CommuteStep {
  instruction: string;
  duration: number;
  durationText: string;
  distance: number;
  distanceText: string;
  mode: CommuteMethod;
  transitInfo?: {
    lineName: string;
    lineShortName?: string;
    vehicleType: string;
    departureStop: string;
    arrivalStop: string;
    departureTime: string;
    arrivalTime: string;
    numStops: number;
    headsign: string;
    lineColor?: string;
  };
}

export interface CommuteRequest {
  origin: LatLng | string;
  destination: LatLng | string;
  departureTime?: Date | "now";
  preferences?: CommutePreferences;
}

export interface CommutePreferences {
  maxWalkingMinutes?: number;
  preferredModes?: CommuteMethod[];
  avoidStairs?: boolean;
  hasStroller?: boolean;
  hasLuggage?: boolean;
  budgetLevel?: "budget" | "moderate" | "luxury";
  walkingSpeed?: "slow" | "normal" | "fast";
}

export interface TripCommuteMatrix {
  locations: Array<{
    id: string;
    name: string;
    coordinates: LatLng;
  }>;
  matrix: TravelTime[][];
  recommendedOrder?: number[];
  totalDuration?: number;
}

export interface DayCommuteSchedule {
  date: string;
  totalCommuteTime: number; // minutes
  totalWalkingTime: number; // minutes
  totalDistance: number; // meters
  commutes: Array<{
    fromActivityId: string;
    toActivityId: string;
    departureTime: string;
    arrivalTime: string;
    options: CommuteOption[];
    selectedOption: CommuteOption;
  }>;
  lastTrainWarning?: {
    line: string;
    lastDeparture: string;
    fromStation: string;
    toStation: string;
  };
}

// ============================================
// CONSTANTS
// ============================================

// Walking speed adjustments (meters per second)
const WALKING_SPEEDS: Record<string, number> = {
  slow: 0.8, // elderly, kids, stroller
  normal: 1.2, // average adult
  fast: 1.5, // active adult
};

// Additional time for various conditions (multipliers)
const TIME_ADJUSTMENTS = {
  withStroller: 1.3,
  withLuggage: 1.2,
  withYoungKids: 1.4,
  avoidStairs: 1.15,
};

// Taxi cost estimates per km (rough averages)
const TAXI_RATES: Record<string, { base: number; perKm: number; currency: string }> = {
  default: { base: 3, perKm: 1.5, currency: "USD" },
  tokyo: { base: 420, perKm: 280, currency: "JPY" },
  paris: { base: 2.6, perKm: 1.1, currency: "EUR" },
  london: { base: 3.2, perKm: 1.8, currency: "GBP" },
  nyc: { base: 2.5, perKm: 2.0, currency: "USD" },
};

// ============================================
// SERVICE CONFIGURATION
// ============================================

/**
 * Check if routing service is available
 */
export function isRoutingConfigured(): boolean {
  return isGoogleMapsConfigured();
}

// ============================================
// COMMUTE FUNCTIONS
// ============================================

/**
 * Get commute options between two points
 */
export async function getCommuteOptions(
  request: CommuteRequest
): Promise<CommuteOption[]> {
  const options: CommuteOption[] = [];
  const prefs = request.preferences || {};

  // Determine which modes to check
  const modesToCheck: TravelMode[] = prefs.preferredModes
    ? mapCommuteModes(prefs.preferredModes)
    : ["walking", "transit", "driving"];

  if (!isGoogleMapsConfigured()) {
    // Fallback: estimate based on straight-line distance
    return getEstimatedCommuteOptions(request);
  }

  // Get routes for all modes in parallel
  const routes = await getRouteAlternatives(
    request.origin,
    request.destination,
    {
      modes: modesToCheck,
      departureTime: request.departureTime === "now" ? "now" : request.departureTime?.getTime(),
    }
  );

  // Convert to commute options
  for (const [mode, route] of routes) {
    const commuteMethod = mapTravelModeToCommute(mode);
    const adjustedDuration = adjustDurationForPreferences(route.duration, prefs);

    options.push({
      method: commuteMethod,
      duration: adjustedDuration,
      durationText: formatDuration(adjustedDuration),
      distance: route.distance,
      distanceText: route.distanceText,
      estimatedCost: mode === "driving" ? estimateTaxiCost(route.distance) : route.fare,
      steps: route.steps.map((step) => ({
        instruction: step.instruction,
        duration: step.duration,
        durationText: step.durationText,
        distance: step.distance,
        distanceText: step.distanceText,
        mode: mapTravelModeToCommute(step.travelMode),
        transitInfo: step.transitInfo,
      })),
      polyline: route.polyline,
      warnings: route.warnings,
      recommended: false,
      reason: undefined,
    });
  }

  // Mark recommended option
  markRecommendedOption(options, prefs);

  return options;
}

/**
 * Get estimated commute options (fallback when Google Maps unavailable)
 */
async function getEstimatedCommuteOptions(
  request: CommuteRequest
): Promise<CommuteOption[]> {
  const options: CommuteOption[] = [];

  // Calculate straight-line distance
  const distance = await calculateDistanceBetween(request.origin, request.destination);
  if (!distance) return options;

  const prefs = request.preferences || {};

  // Walking option (if reasonable distance)
  if (distance <= 3000) {
    const walkSpeed = WALKING_SPEEDS[prefs.walkingSpeed || "normal"];
    let walkDuration = distance / walkSpeed;
    walkDuration = adjustDurationForPreferences(walkDuration, prefs);

    options.push({
      method: "walk",
      duration: walkDuration,
      durationText: formatDuration(walkDuration),
      distance: distance,
      distanceText: formatDistanceGM(distance),
      recommended: distance <= 1000,
      reason: distance <= 1000 ? "Short walking distance" : undefined,
    });
  }

  // Transit option
  const transitDuration = estimateTransitDuration(distance);
  options.push({
    method: "transit",
    duration: transitDuration,
    durationText: formatDuration(transitDuration),
    distance: distance * 1.3, // Transit routes are typically longer
    distanceText: formatDistanceGM(distance * 1.3),
    recommended: distance > 1000 && distance <= 10000,
    reason: distance > 1000 && distance <= 10000 ? "Best for medium distances" : undefined,
  });

  // Taxi option
  const taxiDuration = estimateDrivingDuration(distance);
  options.push({
    method: "taxi",
    duration: taxiDuration,
    durationText: formatDuration(taxiDuration),
    distance: distance * 1.2,
    distanceText: formatDistanceGM(distance * 1.2),
    estimatedCost: estimateTaxiCost(distance * 1.2),
    recommended: distance > 10000,
    reason: distance > 10000 ? "Fastest for long distances" : undefined,
  });

  return options;
}

/**
 * Get travel time between two points
 *
 * Routing Priority:
 * 1. OSRM (OpenStreetMap) - Free, no API key required (walk, bike, drive)
 * 2. Google Maps - More accurate for transit, requires API key
 * 3. Haversine estimation - Fallback when no API available
 */
export async function getCommuteDuration(
  origin: LatLng | string,
  destination: LatLng | string,
  mode: CommuteMethod = "transit",
  preferences?: CommutePreferences
): Promise<number | null> {
  // Convert string addresses to LatLng if needed
  const originLatLng = typeof origin === "string" ? null : origin;
  const destLatLng = typeof destination === "string" ? null : destination;

  // 1. Try OSRM first (free, no API key needed) - works for walk, bike, drive
  if (originLatLng && destLatLng && mode !== "transit" && mode !== "mixed") {
    console.log(`[RoutingService] Trying OSRM first for ${mode}...`);
    const osrmDuration = await getOSRMDuration(originLatLng, destLatLng, mode);

    if (osrmDuration !== null) {
      console.log(`[RoutingService] OSRM succeeded: ${osrmDuration}s`);
      return adjustDurationForPreferences(osrmDuration, preferences || {});
    }
    console.log(`[RoutingService] OSRM failed, trying next provider...`);
  }

  // 2. Try Google Maps (required for transit, optional for other modes)
  if (isGoogleMapsConfigured()) {
    console.log(`[RoutingService] Trying Google Maps...`);
    const travelTime = await getTravelTime(origin, destination, {
      mode: mapCommuteToTravelMode(mode),
      departureTime: "now",
    });

    if (travelTime) {
      console.log(`[RoutingService] Google Maps succeeded: ${travelTime.duration}s`);
      return adjustDurationForPreferences(travelTime.duration, preferences || {});
    }
    console.log(`[RoutingService] Google Maps failed, using estimation...`);
  }

  // 3. Fallback: Haversine distance-based estimation
  console.log(`[RoutingService] Using Haversine estimation fallback...`);
  const distance = await calculateDistanceBetween(origin, destination);
  if (!distance) return null;

  let estimatedDuration: number;
  switch (mode) {
    case "walk":
      estimatedDuration = distance / WALKING_SPEEDS[preferences?.walkingSpeed || "normal"];
      break;
    case "transit":
      estimatedDuration = estimateTransitDuration(distance);
      break;
    case "taxi":
    case "driving":
      estimatedDuration = estimateDrivingDuration(distance);
      break;
    case "bicycle":
      estimatedDuration = (distance / 1000) * (3600 / 15); // ~15 km/h average
      break;
    default:
      estimatedDuration = estimateTransitDuration(distance);
  }

  return adjustDurationForPreferences(estimatedDuration, preferences || {});
}

/**
 * Get commute matrix between multiple locations
 */
export async function getCommuteMatrix(
  locations: Array<{ id: string; name: string; coordinates: LatLng }>,
  options?: {
    mode?: CommuteMethod;
    departureTime?: Date | "now";
  }
): Promise<TripCommuteMatrix> {
  const coordinates = locations.map((l) => l.coordinates);

  if (!isGoogleMapsConfigured()) {
    // Fallback: calculate using straight-line distances
    return getEstimatedCommuteMatrix(locations);
  }

  const mode = mapCommuteToTravelMode(options?.mode || "transit");
  const matrix = await getTravelTimes(coordinates, coordinates, {
    mode,
    departureTime: options?.departureTime === "now" ? "now" : options?.departureTime?.getTime(),
  });

  return {
    locations,
    matrix,
    recommendedOrder: optimizeVisitOrder(locations.length, matrix),
    totalDuration: calculateTotalTravelTime(locations.length, matrix),
  };
}

/**
 * Get estimated commute matrix (fallback)
 */
async function getEstimatedCommuteMatrix(
  locations: Array<{ id: string; name: string; coordinates: LatLng }>
): Promise<TripCommuteMatrix> {
  const matrix: TravelTime[][] = [];

  for (let i = 0; i < locations.length; i++) {
    const row: TravelTime[] = [];
    for (let j = 0; j < locations.length; j++) {
      const distance = calculateDistanceGM(
        locations[i].coordinates,
        locations[j].coordinates
      );
      const duration = estimateTransitDuration(distance);

      row.push({
        origin: locations[i].name,
        destination: locations[j].name,
        distance,
        distanceText: formatDistanceGM(distance),
        duration,
        durationText: formatDuration(duration),
        mode: "transit",
      });
    }
    matrix.push(row);
  }

  return {
    locations,
    matrix,
    recommendedOrder: optimizeVisitOrder(locations.length, matrix),
    totalDuration: calculateTotalTravelTime(locations.length, matrix),
  };
}

/**
 * Calculate total day commute schedule
 */
export async function calculateDayCommutes(
  activities: Array<{
    id: string;
    name: string;
    coordinates: LatLng;
    startTime: string;
    endTime: string;
  }>,
  preferences?: CommutePreferences
): Promise<DayCommuteSchedule> {
  const commutes: DayCommuteSchedule["commutes"] = [];
  let totalCommuteTime = 0;
  let totalWalkingTime = 0;
  let totalDistance = 0;

  for (let i = 0; i < activities.length - 1; i++) {
    const from = activities[i];
    const to = activities[i + 1];

    const options = await getCommuteOptions({
      origin: from.coordinates,
      destination: to.coordinates,
      preferences,
    });

    const selected = options.find((o) => o.recommended) || options[0];

    if (selected) {
      totalCommuteTime += selected.duration / 60;
      totalDistance += selected.distance;
      if (selected.method === "walk") {
        totalWalkingTime += selected.duration / 60;
      }

      commutes.push({
        fromActivityId: from.id,
        toActivityId: to.id,
        departureTime: from.endTime,
        arrivalTime: calculateArrivalTime(from.endTime, selected.duration),
        options,
        selectedOption: selected,
      });
    }
  }

  return {
    date: activities[0]?.startTime.split("T")[0] || new Date().toISOString().split("T")[0],
    totalCommuteTime: Math.round(totalCommuteTime),
    totalWalkingTime: Math.round(totalWalkingTime),
    totalDistance,
    commutes,
  };
}

// ============================================
// STATIC MAP GENERATION
// ============================================

/**
 * Generate a map URL showing a route
 */
export function generateRouteMapUrl(
  route: SimpleRoute,
  options?: {
    width?: number;
    height?: number;
  }
): string {
  return getRouteMapUrl(route, options);
}

/**
 * Generate a map URL showing multiple locations
 */
export function generateLocationsMapUrl(
  locations: Array<{ coordinates: LatLng; label?: string; color?: string }>,
  options?: {
    width?: number;
    height?: number;
    mapType?: "roadmap" | "satellite" | "terrain" | "hybrid";
  }
): string {
  return getStaticMapUrl({
    size: {
      width: options?.width || 600,
      height: options?.height || 400,
    },
    maptype: options?.mapType || "roadmap",
    markers: locations.map((loc, index) => ({
      color: loc.color || "red",
      label: loc.label || String.fromCharCode(65 + index), // A, B, C...
      locations: [loc.coordinates],
    })),
  });
}

/**
 * Generate a day itinerary map
 */
export function generateDayMapUrl(
  activities: Array<{
    coordinates: LatLng;
    name: string;
    order: number;
  }>,
  options?: {
    width?: number;
    height?: number;
    showPath?: boolean;
  }
): string {
  const markers = activities.map((activity) => ({
    color: "blue",
    label: activity.order.toString(),
    locations: [activity.coordinates] as LatLng[],
  }));

  const params: Parameters<typeof getStaticMapUrl>[0] = {
    size: {
      width: options?.width || 600,
      height: options?.height || 400,
    },
    markers,
  };

  // Add path connecting all locations
  if (options?.showPath && activities.length > 1) {
    params.path = {
      color: "0x4285F4",
      weight: 3,
      points: activities
        .sort((a, b) => a.order - b.order)
        .map((a) => a.coordinates),
    };
  }

  return getStaticMapUrl(params);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Calculate distance between two points
 */
async function calculateDistanceBetween(
  origin: LatLng | string,
  destination: LatLng | string
): Promise<number | null> {
  // If both are LatLng objects, calculate directly
  if (typeof origin !== "string" && typeof destination !== "string") {
    return calculateDistanceGM(origin, destination);
  }

  // If strings, we'd need to geocode - for now return null
  // In a full implementation, you'd use geocoding here
  return null;
}

/**
 * Adjust duration based on user preferences
 */
function adjustDurationForPreferences(
  duration: number,
  prefs: CommutePreferences
): number {
  let adjusted = duration;

  if (prefs.hasStroller) {
    adjusted *= TIME_ADJUSTMENTS.withStroller;
  }
  if (prefs.hasLuggage) {
    adjusted *= TIME_ADJUSTMENTS.withLuggage;
  }
  if (prefs.avoidStairs) {
    adjusted *= TIME_ADJUSTMENTS.avoidStairs;
  }
  if (prefs.walkingSpeed === "slow") {
    adjusted *= 1.3;
  } else if (prefs.walkingSpeed === "fast") {
    adjusted *= 0.85;
  }

  return Math.round(adjusted);
}

/**
 * Estimate transit duration from distance
 */
function estimateTransitDuration(distanceMeters: number): number {
  // Assume average transit speed of 25 km/h including wait times
  const baseTime = (distanceMeters / 1000) * (3600 / 25);
  // Add 5 minutes for wait time
  return baseTime + 300;
}

/**
 * Estimate driving duration from distance
 */
function estimateDrivingDuration(distanceMeters: number): number {
  // Assume average city driving speed of 30 km/h
  return (distanceMeters / 1000) * (3600 / 30);
}

/**
 * Estimate taxi cost
 */
function estimateTaxiCost(
  distanceMeters: number,
  city?: string
): { amount: number; currency: string; text: string } {
  const rates = TAXI_RATES[city?.toLowerCase() || "default"] || TAXI_RATES.default;
  const distanceKm = distanceMeters / 1000;
  const amount = rates.base + distanceKm * rates.perKm;

  return {
    amount: Math.round(amount * 100) / 100,
    currency: rates.currency,
    text: `${rates.currency} ${amount.toFixed(2)}`,
  };
}

/**
 * Mark the recommended commute option
 */
function markRecommendedOption(
  options: CommuteOption[],
  prefs: CommutePreferences
): void {
  if (options.length === 0) return;

  // Find the best option based on preferences
  let recommended: CommuteOption | null = null;
  let reason = "";

  // Check for short walking distance
  const walkOption = options.find((o) => o.method === "walk");
  if (walkOption && walkOption.duration <= (prefs.maxWalkingMinutes || 15) * 60) {
    recommended = walkOption;
    reason = "Short, pleasant walk";
  }

  // If budget-conscious, prefer transit
  if (!recommended && prefs.budgetLevel === "budget") {
    const transitOption = options.find((o) => o.method === "transit");
    if (transitOption) {
      recommended = transitOption;
      reason = "Most economical option";
    }
  }

  // If luxury, might prefer taxi for convenience
  if (!recommended && prefs.budgetLevel === "luxury") {
    const taxiOption = options.find((o) => o.method === "taxi" || o.method === "driving");
    if (taxiOption) {
      recommended = taxiOption;
      reason = "Most convenient option";
    }
  }

  // Default: pick the best balance of time and cost
  if (!recommended) {
    // Prefer transit for medium distances
    const transitOption = options.find((o) => o.method === "transit");
    if (transitOption && transitOption.duration <= 45 * 60) {
      recommended = transitOption;
      reason = "Good balance of time and cost";
    } else {
      // Pick the fastest
      recommended = options.reduce((best, current) =>
        current.duration < best.duration ? current : best
      );
      reason = "Fastest route";
    }
  }

  if (recommended) {
    recommended.recommended = true;
    recommended.reason = reason;
  }
}

/**
 * Optimize visit order for minimum travel time (simple greedy algorithm)
 */
function optimizeVisitOrder(
  numLocations: number,
  matrix: TravelTime[][]
): number[] {
  if (numLocations <= 2) return Array.from({ length: numLocations }, (_, i) => i);

  const visited = new Set<number>();
  const order: number[] = [0]; // Start from first location
  visited.add(0);

  while (order.length < numLocations) {
    const current = order[order.length - 1];
    let bestNext = -1;
    let bestDuration = Infinity;

    for (let i = 0; i < numLocations; i++) {
      if (!visited.has(i)) {
        const duration = matrix[current]?.[i]?.duration || Infinity;
        if (duration < bestDuration) {
          bestDuration = duration;
          bestNext = i;
        }
      }
    }

    if (bestNext >= 0) {
      order.push(bestNext);
      visited.add(bestNext);
    } else {
      break;
    }
  }

  return order;
}

/**
 * Calculate total travel time for a given order
 */
function calculateTotalTravelTime(
  numLocations: number,
  matrix: TravelTime[][]
): number {
  let total = 0;
  for (let i = 0; i < numLocations - 1; i++) {
    total += matrix[i]?.[i + 1]?.duration || 0;
  }
  return total;
}

/**
 * Calculate arrival time from departure and duration
 */
function calculateArrivalTime(departureTime: string, durationSeconds: number): string {
  const departure = new Date(departureTime);
  const arrival = new Date(departure.getTime() + durationSeconds * 1000);
  return arrival.toISOString();
}

/**
 * Map CommuteMethod to TravelMode
 */
function mapCommuteToTravelMode(method: CommuteMethod): TravelMode {
  switch (method) {
    case "walk":
      return "walking";
    case "transit":
      return "transit";
    case "taxi":
    case "driving":
      return "driving";
    case "bicycle":
      return "bicycling";
    default:
      return "transit";
  }
}

/**
 * Map TravelMode to CommuteMethod
 */
function mapTravelModeToCommute(mode: TravelMode): CommuteMethod {
  switch (mode) {
    case "walking":
      return "walk";
    case "transit":
      return "transit";
    case "driving":
      return "driving";
    case "bicycling":
      return "bicycle";
    default:
      return "transit";
  }
}

/**
 * Map array of CommuteMethods to TravelModes
 */
function mapCommuteModes(methods: CommuteMethod[]): TravelMode[] {
  return methods.map(mapCommuteToTravelMode);
}

/**
 * Format duration for display
 */
function formatDuration(seconds: number): string {
  return formatDurationGM(seconds);
}

// ============================================
// EXPORTS
// ============================================

export {
  decodePolyline,
  calculateDistanceGM as calculateDistance,
  formatDurationGM as formatDuration_util,
  formatDistanceGM as formatDistance_util,
};
