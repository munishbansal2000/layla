/**
 * Google Maps API Integration
 *
 * Provides directions, distance matrix, geocoding, and static maps
 * API Docs: https://developers.google.com/maps/documentation
 *
 * APIs Used:
 * - Directions API: Route planning with steps and polylines
 * - Distance Matrix API: Travel times between multiple origins/destinations
 * - Geocoding API: Address to coordinates conversion
 * - Static Maps API: Map image generation
 *
 * Pricing: Pay-as-you-go
 * - Directions: $5/1000 requests
 * - Distance Matrix: $5/1000 elements
 * - Geocoding: $5/1000 requests
 *
 * Get API key at: https://console.cloud.google.com/apis/credentials
 */

import { cachedGoogleMapsFetch } from "./google-maps-logger";

const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY || "";
const DIRECTIONS_URL = "https://maps.googleapis.com/maps/api/directions/json";
const DISTANCE_MATRIX_URL = "https://maps.googleapis.com/maps/api/distancematrix/json";
const GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json";
const STATIC_MAPS_URL = "https://maps.googleapis.com/maps/api/staticmap";

// ============================================
// TYPES - Directions API
// ============================================

export interface LatLng {
  lat: number;
  lng: number;
}

export interface DirectionsStep {
  distance: {
    text: string;
    value: number; // meters
  };
  duration: {
    text: string;
    value: number; // seconds
  };
  end_location: LatLng;
  start_location: LatLng;
  html_instructions: string;
  travel_mode: TravelMode;
  maneuver?: string;
  polyline: {
    points: string; // encoded polyline
  };
  transit_details?: TransitDetails;
}

export interface TransitDetails {
  arrival_stop: {
    location: LatLng;
    name: string;
  };
  departure_stop: {
    location: LatLng;
    name: string;
  };
  arrival_time: {
    text: string;
    time_zone: string;
    value: number;
  };
  departure_time: {
    text: string;
    time_zone: string;
    value: number;
  };
  headsign: string;
  line: {
    agencies: Array<{
      name: string;
      phone?: string;
      url?: string;
    }>;
    color?: string;
    icon?: string;
    name: string;
    short_name?: string;
    text_color?: string;
    vehicle: {
      icon: string;
      name: string;
      type: string;
    };
  };
  num_stops: number;
}

export interface DirectionsLeg {
  distance: {
    text: string;
    value: number;
  };
  duration: {
    text: string;
    value: number;
  };
  duration_in_traffic?: {
    text: string;
    value: number;
  };
  end_address: string;
  end_location: LatLng;
  start_address: string;
  start_location: LatLng;
  steps: DirectionsStep[];
  arrival_time?: {
    text: string;
    time_zone: string;
    value: number;
  };
  departure_time?: {
    text: string;
    time_zone: string;
    value: number;
  };
}

export interface DirectionsRoute {
  bounds: {
    northeast: LatLng;
    southwest: LatLng;
  };
  copyrights: string;
  legs: DirectionsLeg[];
  overview_polyline: {
    points: string;
  };
  summary: string;
  warnings: string[];
  waypoint_order: number[];
  fare?: {
    currency: string;
    text: string;
    value: number;
  };
}

export interface DirectionsResponse {
  routes: DirectionsRoute[];
  status: DirectionsStatus;
  error_message?: string;
  geocoded_waypoints?: Array<{
    geocoder_status: string;
    place_id: string;
    types: string[];
  }>;
}

export type DirectionsStatus =
  | "OK"
  | "NOT_FOUND"
  | "ZERO_RESULTS"
  | "MAX_WAYPOINTS_EXCEEDED"
  | "MAX_ROUTE_LENGTH_EXCEEDED"
  | "INVALID_REQUEST"
  | "OVER_DAILY_LIMIT"
  | "OVER_QUERY_LIMIT"
  | "REQUEST_DENIED"
  | "UNKNOWN_ERROR";

// ============================================
// TYPES - Distance Matrix API
// ============================================

export interface DistanceMatrixElement {
  distance?: {
    text: string;
    value: number;
  };
  duration?: {
    text: string;
    value: number;
  };
  duration_in_traffic?: {
    text: string;
    value: number;
  };
  fare?: {
    currency: string;
    text: string;
    value: number;
  };
  status: "OK" | "NOT_FOUND" | "ZERO_RESULTS" | "MAX_ROUTE_LENGTH_EXCEEDED";
}

export interface DistanceMatrixRow {
  elements: DistanceMatrixElement[];
}

export interface DistanceMatrixResponse {
  destination_addresses: string[];
  origin_addresses: string[];
  rows: DistanceMatrixRow[];
  status: DirectionsStatus;
  error_message?: string;
}

// ============================================
// TYPES - Geocoding API
// ============================================

export interface GeocodingResult {
  address_components: Array<{
    long_name: string;
    short_name: string;
    types: string[];
  }>;
  formatted_address: string;
  geometry: {
    location: LatLng;
    location_type: "ROOFTOP" | "RANGE_INTERPOLATED" | "GEOMETRIC_CENTER" | "APPROXIMATE";
    viewport: {
      northeast: LatLng;
      southwest: LatLng;
    };
    bounds?: {
      northeast: LatLng;
      southwest: LatLng;
    };
  };
  place_id: string;
  plus_code?: {
    compound_code: string;
    global_code: string;
  };
  types: string[];
}

export interface GeocodingResponse {
  results: GeocodingResult[];
  status: "OK" | "ZERO_RESULTS" | "OVER_DAILY_LIMIT" | "OVER_QUERY_LIMIT" | "REQUEST_DENIED" | "INVALID_REQUEST" | "UNKNOWN_ERROR";
  error_message?: string;
}

// ============================================
// TYPES - Common
// ============================================

export type TravelMode = "driving" | "walking" | "bicycling" | "transit";

export type TrafficModel = "best_guess" | "pessimistic" | "optimistic";

export type TransitMode = "bus" | "subway" | "train" | "tram" | "rail";

export type TransitRoutingPreference = "less_walking" | "fewer_transfers";

export type UnitSystem = "metric" | "imperial";

// ============================================
// TYPES - Simplified for App Use
// ============================================

export interface SimpleRoute {
  distance: number; // meters
  distanceText: string;
  duration: number; // seconds
  durationText: string;
  durationInTraffic?: number;
  durationInTrafficText?: string;
  startAddress: string;
  endAddress: string;
  startLocation: LatLng;
  endLocation: LatLng;
  polyline: string; // encoded
  summary: string;
  steps: SimpleStep[];
  fare?: {
    amount: number;
    currency: string;
    text: string;
  };
  warnings: string[];
}

export interface SimpleStep {
  instruction: string;
  distance: number;
  distanceText: string;
  duration: number;
  durationText: string;
  travelMode: TravelMode;
  maneuver?: string;
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

export interface TravelTime {
  origin: string;
  destination: string;
  distance: number; // meters
  distanceText: string;
  duration: number; // seconds
  durationText: string;
  durationInTraffic?: number;
  durationInTrafficText?: string;
  mode: TravelMode;
}

// ============================================
// CONFIGURATION CHECK
// ============================================

/**
 * Check if Google Maps API is configured
 */
export function isGoogleMapsConfigured(): boolean {
  return !!GOOGLE_MAPS_API_KEY;
}

// ============================================
// DIRECTIONS API
// ============================================

export interface DirectionsParams {
  origin: string | LatLng;
  destination: string | LatLng;
  mode?: TravelMode;
  alternatives?: boolean;
  avoid?: ("tolls" | "highways" | "ferries" | "indoor")[];
  units?: UnitSystem;
  arrival_time?: number; // Unix timestamp
  departure_time?: number | "now";
  traffic_model?: TrafficModel;
  transit_mode?: TransitMode[];
  transit_routing_preference?: TransitRoutingPreference;
  waypoints?: (string | LatLng)[];
  optimize?: boolean;
  language?: string;
  region?: string;
}

/**
 * Get directions between two points
 */
export async function getDirections(params: DirectionsParams): Promise<DirectionsResponse> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error("GOOGLE_MAPS_API_KEY not configured");
  }

  const queryParams: Record<string, string> = {
    key: GOOGLE_MAPS_API_KEY,
    origin: formatLocation(params.origin),
    destination: formatLocation(params.destination),
  };

  if (params.mode) queryParams.mode = params.mode;
  if (params.alternatives) queryParams.alternatives = "true";
  if (params.avoid) queryParams.avoid = params.avoid.join("|");
  if (params.units) queryParams.units = params.units;
  if (params.arrival_time) queryParams.arrival_time = params.arrival_time.toString();
  if (params.departure_time) {
    queryParams.departure_time = params.departure_time === "now" ? "now" : params.departure_time.toString();
  }
  if (params.traffic_model) queryParams.traffic_model = params.traffic_model;
  if (params.transit_mode) queryParams.transit_mode = params.transit_mode.join("|");
  if (params.transit_routing_preference) queryParams.transit_routing_preference = params.transit_routing_preference;
  if (params.waypoints) {
    const waypointsStr = params.waypoints.map(formatLocation).join("|");
    queryParams.waypoints = params.optimize ? `optimize:true|${waypointsStr}` : waypointsStr;
  }
  if (params.language) queryParams.language = params.language;
  if (params.region) queryParams.region = params.region;

  const url = `${DIRECTIONS_URL}?${new URLSearchParams(queryParams)}`;

  return cachedGoogleMapsFetch<DirectionsResponse>("directions", url, queryParams, {
    origin: formatLocation(params.origin),
    destination: formatLocation(params.destination),
  });
}

/**
 * Get simplified route between two points
 */
export async function getRoute(
  origin: string | LatLng,
  destination: string | LatLng,
  options?: {
    mode?: TravelMode;
    departureTime?: number | "now";
    alternatives?: boolean;
    avoid?: ("tolls" | "highways" | "ferries")[];
    language?: string;
  }
): Promise<SimpleRoute | null> {
  try {
    const response = await getDirections({
      origin,
      destination,
      mode: options?.mode || "transit",
      departure_time: options?.departureTime || "now",
      alternatives: options?.alternatives,
      avoid: options?.avoid,
      language: options?.language,
    });

    if (response.status !== "OK" || response.routes.length === 0) {
      console.error("No route found:", response.status, response.error_message);
      return null;
    }

    return directionsToSimpleRoute(response.routes[0]);
  } catch (error) {
    console.error("Failed to get route:", error);
    return null;
  }
}

/**
 * Get multiple route alternatives
 */
export async function getRouteAlternatives(
  origin: string | LatLng,
  destination: string | LatLng,
  options?: {
    modes?: TravelMode[];
    departureTime?: number | "now";
    language?: string;
  }
): Promise<Map<TravelMode, SimpleRoute>> {
  const modes = options?.modes || ["walking", "transit", "driving"];
  const results = new Map<TravelMode, SimpleRoute>();

  await Promise.all(
    modes.map(async (mode) => {
      const route = await getRoute(origin, destination, {
        mode,
        departureTime: options?.departureTime,
        language: options?.language,
      });
      if (route) {
        results.set(mode, route);
      }
    })
  );

  return results;
}

// ============================================
// DISTANCE MATRIX API
// ============================================

export interface DistanceMatrixParams {
  origins: (string | LatLng)[];
  destinations: (string | LatLng)[];
  mode?: TravelMode;
  avoid?: ("tolls" | "highways" | "ferries" | "indoor")[];
  units?: UnitSystem;
  arrival_time?: number;
  departure_time?: number | "now";
  traffic_model?: TrafficModel;
  transit_mode?: TransitMode[];
  transit_routing_preference?: TransitRoutingPreference;
  language?: string;
  region?: string;
}

/**
 * Get distance matrix between multiple origins and destinations
 */
export async function getDistanceMatrix(
  params: DistanceMatrixParams
): Promise<DistanceMatrixResponse> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error("GOOGLE_MAPS_API_KEY not configured");
  }

  const queryParams: Record<string, string> = {
    key: GOOGLE_MAPS_API_KEY,
    origins: params.origins.map(formatLocation).join("|"),
    destinations: params.destinations.map(formatLocation).join("|"),
  };

  if (params.mode) queryParams.mode = params.mode;
  if (params.avoid) queryParams.avoid = params.avoid.join("|");
  if (params.units) queryParams.units = params.units;
  if (params.arrival_time) queryParams.arrival_time = params.arrival_time.toString();
  if (params.departure_time) {
    queryParams.departure_time = params.departure_time === "now" ? "now" : params.departure_time.toString();
  }
  if (params.traffic_model) queryParams.traffic_model = params.traffic_model;
  if (params.transit_mode) queryParams.transit_mode = params.transit_mode.join("|");
  if (params.transit_routing_preference) queryParams.transit_routing_preference = params.transit_routing_preference;
  if (params.language) queryParams.language = params.language;
  if (params.region) queryParams.region = params.region;

  const url = `${DISTANCE_MATRIX_URL}?${new URLSearchParams(queryParams)}`;

  return cachedGoogleMapsFetch<DistanceMatrixResponse>("distance-matrix", url, queryParams);
}

/**
 * Get travel times between multiple points
 */
export async function getTravelTimes(
  origins: (string | LatLng)[],
  destinations: (string | LatLng)[],
  options?: {
    mode?: TravelMode;
    departureTime?: number | "now";
  }
): Promise<TravelTime[][]> {
  try {
    const response = await getDistanceMatrix({
      origins,
      destinations,
      mode: options?.mode || "transit",
      departure_time: options?.departureTime || "now",
    });

    if (response.status !== "OK") {
      console.error("Distance matrix error:", response.status, response.error_message);
      return [];
    }

    return response.rows.map((row, originIndex) =>
      row.elements.map((element, destIndex) => ({
        origin: response.origin_addresses[originIndex],
        destination: response.destination_addresses[destIndex],
        distance: element.distance?.value || 0,
        distanceText: element.distance?.text || "Unknown",
        duration: element.duration?.value || 0,
        durationText: element.duration?.text || "Unknown",
        durationInTraffic: element.duration_in_traffic?.value,
        durationInTrafficText: element.duration_in_traffic?.text,
        mode: options?.mode || "transit",
      }))
    );
  } catch (error) {
    console.error("Failed to get travel times:", error);
    return [];
  }
}

/**
 * Get travel time between two specific points
 */
export async function getTravelTime(
  origin: string | LatLng,
  destination: string | LatLng,
  options?: {
    mode?: TravelMode;
    departureTime?: number | "now";
  }
): Promise<TravelTime | null> {
  const times = await getTravelTimes([origin], [destination], options);
  return times[0]?.[0] || null;
}

// ============================================
// GEOCODING API
// ============================================

/**
 * Geocode an address to coordinates
 */
export async function geocodeAddress(address: string): Promise<GeocodingResult | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error("GOOGLE_MAPS_API_KEY not configured");
  }

  const queryParams: Record<string, string> = {
    key: GOOGLE_MAPS_API_KEY,
    address,
  };

  const url = `${GEOCODE_URL}?${new URLSearchParams(queryParams)}`;

  try {
    const response = await cachedGoogleMapsFetch<GeocodingResponse>("geocode", url, queryParams);

    if (response.status !== "OK" || response.results.length === 0) {
      console.error("Geocoding error:", response.status, response.error_message);
      return null;
    }

    return response.results[0];
  } catch (error) {
    console.error("Failed to geocode address:", error);
    return null;
  }
}

/**
 * Reverse geocode coordinates to address
 */
export async function reverseGeocode(lat: number, lng: number): Promise<GeocodingResult | null> {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error("GOOGLE_MAPS_API_KEY not configured");
  }

  const queryParams: Record<string, string> = {
    key: GOOGLE_MAPS_API_KEY,
    latlng: `${lat},${lng}`,
  };

  const url = `${GEOCODE_URL}?${new URLSearchParams(queryParams)}`;

  try {
    const response = await cachedGoogleMapsFetch<GeocodingResponse>("reverse-geocode", url, queryParams);

    if (response.status !== "OK" || response.results.length === 0) {
      console.error("Reverse geocoding error:", response.status, response.error_message);
      return null;
    }

    return response.results[0];
  } catch (error) {
    console.error("Failed to reverse geocode:", error);
    return null;
  }
}

/**
 * Get coordinates from address (simplified)
 */
export async function getCoordinates(address: string): Promise<LatLng | null> {
  const result = await geocodeAddress(address);
  return result?.geometry.location || null;
}

/**
 * Get address from coordinates (simplified)
 */
export async function getAddress(lat: number, lng: number): Promise<string | null> {
  const result = await reverseGeocode(lat, lng);
  return result?.formatted_address || null;
}

// ============================================
// STATIC MAPS API
// ============================================

export interface StaticMapParams {
  center?: string | LatLng;
  zoom?: number;
  size: { width: number; height: number };
  scale?: 1 | 2;
  format?: "png" | "png8" | "png32" | "gif" | "jpg" | "jpg-baseline";
  maptype?: "roadmap" | "satellite" | "terrain" | "hybrid";
  language?: string;
  region?: string;
  markers?: StaticMapMarker[];
  path?: StaticMapPath;
  style?: string[];
}

export interface StaticMapMarker {
  color?: string;
  size?: "tiny" | "small" | "mid";
  label?: string;
  icon?: string;
  locations: (string | LatLng)[];
}

export interface StaticMapPath {
  weight?: number;
  color?: string;
  fillcolor?: string;
  geodesic?: boolean;
  points?: (string | LatLng)[]; // Optional if using enc
  enc?: string; // encoded polyline - if provided, points is not required
}

/**
 * Generate static map URL
 */
export function getStaticMapUrl(params: StaticMapParams): string {
  if (!GOOGLE_MAPS_API_KEY) {
    throw new Error("GOOGLE_MAPS_API_KEY not configured");
  }

  const queryParams: Record<string, string> = {
    key: GOOGLE_MAPS_API_KEY,
    size: `${params.size.width}x${params.size.height}`,
  };

  if (params.center) queryParams.center = formatLocation(params.center);
  if (params.zoom) queryParams.zoom = params.zoom.toString();
  if (params.scale) queryParams.scale = params.scale.toString();
  if (params.format) queryParams.format = params.format;
  if (params.maptype) queryParams.maptype = params.maptype;
  if (params.language) queryParams.language = params.language;
  if (params.region) queryParams.region = params.region;

  // Add markers
  if (params.markers) {
    params.markers.forEach((marker, index) => {
      const markerParts: string[] = [];
      if (marker.color) markerParts.push(`color:${marker.color}`);
      if (marker.size) markerParts.push(`size:${marker.size}`);
      if (marker.label) markerParts.push(`label:${marker.label}`);
      if (marker.icon) markerParts.push(`icon:${marker.icon}`);
      markerParts.push(...marker.locations.map(formatLocation));
      queryParams[`markers${index > 0 ? index : ""}`] = markerParts.join("|");
    });
  }

  // Add path
  if (params.path) {
    const pathParts: string[] = [];
    if (params.path.weight) pathParts.push(`weight:${params.path.weight}`);
    if (params.path.color) pathParts.push(`color:${params.path.color}`);
    if (params.path.fillcolor) pathParts.push(`fillcolor:${params.path.fillcolor}`);
    if (params.path.geodesic) pathParts.push("geodesic:true");
    if (params.path.enc) {
      pathParts.push(`enc:${params.path.enc}`);
    } else if (params.path.points) {
      pathParts.push(...params.path.points.map(formatLocation));
    }
    queryParams.path = pathParts.join("|");
  }

  // Add styles
  if (params.style) {
    params.style.forEach((style, index) => {
      queryParams[`style${index > 0 ? index : ""}`] = style;
    });
  }

  return `${STATIC_MAPS_URL}?${new URLSearchParams(queryParams)}`;
}

/**
 * Generate a route map URL
 */
export function getRouteMapUrl(
  route: SimpleRoute,
  options?: {
    width?: number;
    height?: number;
    pathColor?: string;
    startMarkerColor?: string;
    endMarkerColor?: string;
  }
): string {
  return getStaticMapUrl({
    size: {
      width: options?.width || 600,
      height: options?.height || 400,
    },
    path: {
      enc: route.polyline,
      color: options?.pathColor || "0x4285F4",
      weight: 4,
    },
    markers: [
      {
        color: options?.startMarkerColor || "green",
        label: "A",
        locations: [route.startLocation],
      },
      {
        color: options?.endMarkerColor || "red",
        label: "B",
        locations: [route.endLocation],
      },
    ],
  });
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Format location for API requests
 */
function formatLocation(location: string | LatLng): string {
  if (typeof location === "string") {
    return location;
  }
  return `${location.lat},${location.lng}`;
}

/**
 * Convert DirectionsRoute to SimpleRoute
 */
function directionsToSimpleRoute(route: DirectionsRoute): SimpleRoute {
  const leg = route.legs[0];

  return {
    distance: leg.distance.value,
    distanceText: leg.distance.text,
    duration: leg.duration.value,
    durationText: leg.duration.text,
    durationInTraffic: leg.duration_in_traffic?.value,
    durationInTrafficText: leg.duration_in_traffic?.text,
    startAddress: leg.start_address,
    endAddress: leg.end_address,
    startLocation: leg.start_location,
    endLocation: leg.end_location,
    polyline: route.overview_polyline.points,
    summary: route.summary,
    steps: leg.steps.map(stepToSimpleStep),
    fare: route.fare
      ? {
          amount: route.fare.value,
          currency: route.fare.currency,
          text: route.fare.text,
        }
      : undefined,
    warnings: route.warnings,
  };
}

/**
 * Convert DirectionsStep to SimpleStep
 */
function stepToSimpleStep(step: DirectionsStep): SimpleStep {
  return {
    instruction: stripHtml(step.html_instructions),
    distance: step.distance.value,
    distanceText: step.distance.text,
    duration: step.duration.value,
    durationText: step.duration.text,
    travelMode: step.travel_mode.toLowerCase() as TravelMode,
    maneuver: step.maneuver,
    transitInfo: step.transit_details
      ? {
          lineName: step.transit_details.line.name,
          lineShortName: step.transit_details.line.short_name,
          vehicleType: step.transit_details.line.vehicle.type,
          departureStop: step.transit_details.departure_stop.name,
          arrivalStop: step.transit_details.arrival_stop.name,
          departureTime: step.transit_details.departure_time.text,
          arrivalTime: step.transit_details.arrival_time.text,
          numStops: step.transit_details.num_stops,
          headsign: step.transit_details.headsign,
          lineColor: step.transit_details.line.color,
        }
      : undefined,
  };
}

/**
 * Strip HTML tags from instruction text
 */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, "").replace(/&nbsp;/g, " ");
}

/**
 * Decode encoded polyline
 */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    let shift = 0;
    let result = 0;
    let byte: number;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlat = result & 1 ? ~(result >> 1) : result >> 1;
    lat += dlat;

    shift = 0;
    result = 0;

    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    const dlng = result & 1 ? ~(result >> 1) : result >> 1;
    lng += dlng;

    points.push({
      lat: lat / 1e5,
      lng: lng / 1e5,
    });
  }

  return points;
}

/**
 * Encode polyline from points
 */
export function encodePolyline(points: LatLng[]): string {
  let encoded = "";
  let prevLat = 0;
  let prevLng = 0;

  for (const point of points) {
    const lat = Math.round(point.lat * 1e5);
    const lng = Math.round(point.lng * 1e5);

    encoded += encodeNumber(lat - prevLat);
    encoded += encodeNumber(lng - prevLng);

    prevLat = lat;
    prevLng = lng;
  }

  return encoded;
}

function encodeNumber(num: number): string {
  let encoded = "";
  let value = num < 0 ? ~(num << 1) : num << 1;

  while (value >= 0x20) {
    encoded += String.fromCharCode((0x20 | (value & 0x1f)) + 63);
    value >>= 5;
  }

  encoded += String.fromCharCode(value + 63);
  return encoded;
}

/**
 * Calculate distance between two points (Haversine formula)
 */
export function calculateDistance(point1: LatLng, point2: LatLng): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((point2.lat - point1.lat) * Math.PI) / 180;
  const dLng = ((point2.lng - point1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((point1.lat * Math.PI) / 180) *
      Math.cos((point2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Format duration for display
 */
export function formatDuration(seconds: number): string {
  if (seconds < 60) {
    return `${seconds} sec`;
  }
  if (seconds < 3600) {
    const minutes = Math.round(seconds / 60);
    return `${minutes} min`;
  }
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.round((seconds % 3600) / 60);
  return minutes > 0 ? `${hours} hr ${minutes} min` : `${hours} hr`;
}

/**
 * Format distance for display
 */
export function formatDistance(meters: number, units: UnitSystem = "metric"): string {
  if (units === "imperial") {
    const feet = meters * 3.28084;
    if (feet < 1000) {
      return `${Math.round(feet)} ft`;
    }
    const miles = meters / 1609.344;
    return `${miles.toFixed(1)} mi`;
  }

  if (meters < 1000) {
    return `${Math.round(meters)} m`;
  }
  return `${(meters / 1000).toFixed(1)} km`;
}
