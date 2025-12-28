/**
 * Transit Alerts & Real-time Transit Integration
 *
 * Features:
 * - Real-time transit alerts and disruptions
 * - Last train times by city
 * - Transit pass recommendations
 * - Service status updates
 *
 * Providers (in priority order):
 * 1. City-specific APIs (TfL, RATP, Tokyo Metro, etc.)
 * 2. OpenTripPlanner - Free, open source
 * 3. Transitland API - Free tier available
 * 4. Offline data - Static schedules
 *
 * API Docs:
 * - TfL (London): https://api.tfl.gov.uk/
 * - RATP (Paris): https://prim.iledefrance-mobilites.fr/
 * - Tokyo Metro: https://developer.tokyometroapp.jp/
 * - Transitland: https://www.transit.land/documentation
 *
 * Free Transit APIs by City:
 * - Many transit agencies offer free APIs
 * - GTFS data is freely available for most cities
 */

import { getOrFetch, cacheKey, CACHE_TTL, CACHE_NS, setCache, getCache } from "./cache";
import { getRoute, type TravelMode } from "./google-maps";

// Simple route type for alternatives
interface SimpleRoute {
  distance: number;
  duration: number;
  steps: { instruction: string; distance: number; duration: number }[];
}

// API Configuration
const TFL_API_KEY = process.env.TFL_API_KEY || ""; // London - Optional, increases limits
const TRANSITLAND_API_KEY = process.env.TRANSITLAND_API_KEY || ""; // Optional

// API URLs (many are free)
const TFL_URL = "https://api.tfl.gov.uk"; // London - Free
const WMATA_URL = "https://api.wmata.com"; // Washington DC
const MBTA_URL = "https://api-v3.mbta.com"; // Boston - Free
const BART_URL = "https://api.bart.gov"; // San Francisco - Free
const TRANSITLAND_URL = "https://transit.land/api/v2";

// ============================================
// TYPES
// ============================================

export type AlertSeverity = "info" | "warning" | "severe" | "critical";
export type AlertType =
  | "delay"
  | "cancellation"
  | "disruption"
  | "strike"
  | "maintenance"
  | "weather"
  | "emergency"
  | "crowding";

export interface TransitAlert {
  id: string;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  affectedLines: string[];
  affectedStations: string[];
  startTime: string;
  endTime?: string;
  alternatives?: string[];
  url?: string;
  source: string;
}

export interface TransitLine {
  id: string;
  name: string;
  shortName: string;
  type: TransitType;
  color?: string;
  textColor?: string;
  operator: string;
  status: LineStatus;
  alerts: TransitAlert[];
}

export type TransitType = "subway" | "bus" | "train" | "tram" | "ferry" | "cable_car";
export type LineStatus = "normal" | "minor_delays" | "major_delays" | "suspended" | "unknown";

export interface LastTrainInfo {
  line: string;
  direction: string;
  station: string;
  lastDeparture: string;
  isWeekend: boolean;
  notes?: string;
}

export interface TransitStation {
  id: string;
  name: string;
  lines: string[];
  location: { lat: number; lng: number };
  facilities: StationFacility[];
  accessibility: AccessibilityInfo;
}

export type StationFacility =
  | "elevator"
  | "escalator"
  | "restroom"
  | "lockers"
  | "convenience_store"
  | "ticket_machine"
  | "staffed_booth"
  | "wifi";

export interface AccessibilityInfo {
  wheelchairAccessible: boolean;
  hasElevator: boolean;
  hasTactilePaving: boolean;
  hasAudioAnnouncements: boolean;
  notes?: string;
}

export interface StrikeInfo {
  id: string;
  country: string;
  city?: string;
  affectedServices: string[];
  startDate: string;
  endDate?: string;
  description: string;
  impactLevel: "low" | "medium" | "high" | "total";
  alternatives: string[];
  source: string;
}

// ============================================
// CITY-SPECIFIC CONFIGURATIONS
// ============================================

interface CityTransitConfig {
  name: string;
  transitAgency: string;
  apiEndpoint?: string;
  lastTrainApprox: string;
  hasNightService: boolean;
  passRecommendation?: string;
}

const CITY_CONFIGS: Record<string, CityTransitConfig> = {
  tokyo: {
    name: "Tokyo",
    transitAgency: "Tokyo Metro / JR East",
    lastTrainApprox: "23:30-00:30",
    hasNightService: false,
    passRecommendation: "Suica/Pasmo IC card or Tokyo Subway Ticket (24/48/72hr)",
  },
  paris: {
    name: "Paris",
    transitAgency: "RATP",
    apiEndpoint: "https://api-ratp.pierre-music.com/v1",
    lastTrainApprox: "00:30-01:00",
    hasNightService: true,
    passRecommendation: "Navigo Easy or Paris Visite pass",
  },
  london: {
    name: "London",
    transitAgency: "TfL",
    apiEndpoint: "https://api.tfl.gov.uk",
    lastTrainApprox: "00:00-00:30",
    hasNightService: true,
    passRecommendation: "Oyster card or contactless payment",
  },
  nyc: {
    name: "New York City",
    transitAgency: "MTA",
    apiEndpoint: "https://api.mta.info",
    lastTrainApprox: "24hr service",
    hasNightService: true,
    passRecommendation: "OMNY or 7-day unlimited MetroCard",
  },
  berlin: {
    name: "Berlin",
    transitAgency: "BVG / S-Bahn",
    lastTrainApprox: "00:30-01:00",
    hasNightService: true,
    passRecommendation: "Berlin WelcomeCard or day ticket",
  },
  singapore: {
    name: "Singapore",
    transitAgency: "SMRT / SBS Transit",
    lastTrainApprox: "23:30-00:00",
    hasNightService: false,
    passRecommendation: "EZ-Link or Singapore Tourist Pass",
  },
  seoul: {
    name: "Seoul",
    transitAgency: "Seoul Metro",
    lastTrainApprox: "23:30-00:00",
    hasNightService: true,
    passRecommendation: "T-money card or M-Pass",
  },
};

// ============================================
// LAST TRAIN DATABASE
// ============================================

const LAST_TRAIN_DATA: Record<string, LastTrainInfo[]> = {
  tokyo: [
    {
      line: "Yamanote Line",
      direction: "Outer Loop",
      station: "Shinjuku",
      lastDeparture: "00:35",
      isWeekend: false,
    },
    {
      line: "Yamanote Line",
      direction: "Inner Loop",
      station: "Shinjuku",
      lastDeparture: "00:30",
      isWeekend: false,
    },
    {
      line: "Tokyo Metro Ginza",
      direction: "Asakusa",
      station: "Shibuya",
      lastDeparture: "00:01",
      isWeekend: false,
    },
    {
      line: "Tokyo Metro Ginza",
      direction: "Shibuya",
      station: "Asakusa",
      lastDeparture: "00:12",
      isWeekend: false,
    },
  ],
  paris: [
    {
      line: "Métro 1",
      direction: "La Défense",
      station: "Châtelet",
      lastDeparture: "00:40",
      isWeekend: false,
    },
    {
      line: "Métro 1",
      direction: "La Défense",
      station: "Châtelet",
      lastDeparture: "01:40",
      isWeekend: true,
      notes: "Extended hours Fri-Sat nights",
    },
  ],
  london: [
    {
      line: "Victoria Line",
      direction: "Brixton",
      station: "King's Cross",
      lastDeparture: "00:37",
      isWeekend: false,
    },
    {
      line: "Night Tube (Victoria)",
      direction: "Brixton",
      station: "King's Cross",
      lastDeparture: "05:00",
      isWeekend: true,
      notes: "Night Tube runs Fri-Sat nights",
    },
  ],
};

// ============================================
// CONFIGURATION CHECK
// ============================================

export function isTransitAlertsConfigured(): boolean {
  // This service works with or without API keys
  // using fallback data and Google Maps
  return true;
}

// ============================================
// ALERT FUNCTIONS
// ============================================

/**
 * Get current transit alerts for a city
 */
export async function getTransitAlerts(
  city: string,
  options?: {
    severity?: AlertSeverity[];
    types?: AlertType[];
    lines?: string[];
  }
): Promise<TransitAlert[]> {
  const config = CITY_CONFIGS[city.toLowerCase()];
  if (!config) {
    return [];
  }

  let alerts: TransitAlert[] = [];

  // Try city-specific API
  if (config.apiEndpoint) {
    alerts = await fetchCityAlerts(city, config.apiEndpoint);
  }

  // Filter by options
  if (options?.severity) {
    alerts = alerts.filter((a) => options.severity!.includes(a.severity));
  }
  if (options?.types) {
    alerts = alerts.filter((a) => options.types!.includes(a.type));
  }
  if (options?.lines) {
    alerts = alerts.filter((a) => a.affectedLines.some((l) => options.lines!.includes(l)));
  }

  return alerts;
}

/**
 * Fetch alerts from city-specific APIs
 */
async function fetchCityAlerts(city: string, _apiEndpoint: string): Promise<TransitAlert[]> {
  // Implementation would vary by city
  // Here's a template for TfL (London)
  if (city.toLowerCase() === "london") {
    return fetchTfLAlerts();
  }

  return [];
}

/**
 * Fetch TfL alerts (London)
 */
async function fetchTfLAlerts(): Promise<TransitAlert[]> {
  try {
    const response = await fetch("https://api.tfl.gov.uk/Line/Mode/tube/Status");
    if (!response.ok) return [];

    const data = await response.json();
    const alerts: TransitAlert[] = [];

    for (const line of data) {
      for (const status of line.lineStatuses || []) {
        if (status.statusSeverity < 10) {
          // Not good service
          alerts.push({
            id: `tfl_${line.id}_${Date.now()}`,
            type: mapTfLSeverityToType(status.statusSeverity),
            severity: mapTfLSeverityToLevel(status.statusSeverity),
            title: `${line.name}: ${status.statusSeverityDescription}`,
            description: status.reason || status.statusSeverityDescription,
            affectedLines: [line.name],
            affectedStations: [],
            startTime: new Date().toISOString(),
            source: "TfL",
          });
        }
      }
    }

    return alerts;
  } catch (error) {
    console.error("TfL API error:", error);
    return [];
  }
}

function mapTfLSeverityToType(severity: number): AlertType {
  if (severity <= 3) return "disruption";
  if (severity <= 6) return "delay";
  return "delay";
}

function mapTfLSeverityToLevel(severity: number): AlertSeverity {
  if (severity <= 3) return "critical";
  if (severity <= 5) return "severe";
  if (severity <= 8) return "warning";
  return "info";
}

// ============================================
// STRIKE INFORMATION
// ============================================

/**
 * Get active or upcoming strikes
 */
export async function getStrikeInfo(
  country: string,
  options?: {
    startDate?: string;
    endDate?: string;
  }
): Promise<StrikeInfo[]> {
  // This would integrate with news APIs or labor union announcements
  // For now, return empty - no known strikes
  const strikes: StrikeInfo[] = [];

  if (options?.startDate) {
    return strikes.filter((s) => s.startDate >= options.startDate!);
  }

  return strikes;
}

/**
 * Check if strikes affect a route
 */
export async function checkRouteForStrikes(
  origin: string,
  destination: string,
  date: string
): Promise<{
  affected: boolean;
  strikes: StrikeInfo[];
  alternatives: string[];
}> {
  // Get route to determine which services it uses
  const route = await getRoute(origin, destination, { mode: "transit" });
  if (!route) {
    return { affected: false, strikes: [], alternatives: [] };
  }

  // Check for strikes affecting those services
  // Implementation would parse route steps for transit lines
  return { affected: false, strikes: [], alternatives: [] };
}

// ============================================
// LAST TRAIN FUNCTIONS
// ============================================

/**
 * Get last train times for a city
 */
export function getLastTrainTimes(
  city: string,
  options?: {
    line?: string;
    station?: string;
    isWeekend?: boolean;
  }
): LastTrainInfo[] {
  const data = LAST_TRAIN_DATA[city.toLowerCase()] || [];

  return data.filter((info) => {
    if (options?.line && !info.line.toLowerCase().includes(options.line.toLowerCase())) {
      return false;
    }
    if (
      options?.station &&
      !info.station.toLowerCase().includes(options.station.toLowerCase())
    ) {
      return false;
    }
    if (options?.isWeekend !== undefined && info.isWeekend !== options.isWeekend) {
      return false;
    }
    return true;
  });
}

/**
 * Check if last train warning needed
 */
export function checkLastTrainWarning(
  city: string,
  currentTime: Date,
  estimatedArrival: Date,
  destinationStation: string
): {
  warning: boolean;
  message?: string;
  lastTrain?: LastTrainInfo;
  alternatives?: string[];
} {
  const isWeekend = [0, 5, 6].includes(currentTime.getDay());
  const lastTrains = getLastTrainTimes(city, {
    station: destinationStation,
    isWeekend,
  });

  if (lastTrains.length === 0) {
    const config = CITY_CONFIGS[city.toLowerCase()];
    return {
      warning: false,
      message: config
        ? `Last trains typically run ${config.lastTrainApprox}`
        : "Check local schedules for last train times",
    };
  }

  // Find the earliest last train
  const earliestLast = lastTrains.reduce((earliest, current) => {
    const currentTime = parseTime(current.lastDeparture);
    const earliestTime = parseTime(earliest.lastDeparture);
    return currentTime < earliestTime ? current : earliest;
  });

  const lastTrainTime = parseTimeToDate(earliestLast.lastDeparture, currentTime);
  const bufferMinutes = 15; // Give 15 min buffer

  if (estimatedArrival.getTime() > lastTrainTime.getTime() - bufferMinutes * 60 * 1000) {
    const config = CITY_CONFIGS[city.toLowerCase()];
    return {
      warning: true,
      message: `⚠️ Last train on ${earliestLast.line} departs ${earliestLast.station} at ${earliestLast.lastDeparture}`,
      lastTrain: earliestLast,
      alternatives: config?.hasNightService
        ? ["Night bus service available", "Consider taxi/rideshare"]
        : ["No night service - consider taxi/rideshare", "Some areas have night buses"],
    };
  }

  return { warning: false };
}

function parseTime(timeStr: string): number {
  const [hours, minutes] = timeStr.split(":").map(Number);
  return hours * 60 + minutes;
}

function parseTimeToDate(timeStr: string, referenceDate: Date): Date {
  const [hours, minutes] = timeStr.split(":").map(Number);
  const result = new Date(referenceDate);
  result.setHours(hours, minutes, 0, 0);

  // If time is earlier than reference, it's next day
  if (result < referenceDate) {
    result.setDate(result.getDate() + 1);
  }

  return result;
}

// ============================================
// ALTERNATIVE ROUTING
// ============================================

/**
 * Get alternative routes avoiding disrupted services
 */
export async function getAlternativeRoutes(
  origin: string,
  destination: string,
  avoidLines: string[],
  options?: {
    departureTime?: Date;
    maxAlternatives?: number;
  }
): Promise<
  Array<{
    route: SimpleRoute;
    avoidedDisruptions: string[];
    additionalTime: number;
  }>
> {
  const alternatives: Array<{
    route: SimpleRoute;
    avoidedDisruptions: string[];
    additionalTime: number;
  }> = [];

  // Get baseline route
  const baseRoute = await getRoute(origin, destination, {
    mode: "transit",
    departureTime: options?.departureTime?.getTime() || "now",
  });

  if (!baseRoute) return alternatives;

  // Try different modes for alternatives
  const alternativeModes: TravelMode[] = ["walking", "driving"];

  for (const mode of alternativeModes) {
    const altRoute = await getRoute(origin, destination, {
      mode,
      departureTime: options?.departureTime?.getTime() || "now",
    });

    if (altRoute) {
      alternatives.push({
        route: altRoute,
        avoidedDisruptions: avoidLines,
        additionalTime: altRoute.duration - baseRoute.duration,
      });
    }

    if (alternatives.length >= (options?.maxAlternatives || 3)) break;
  }

  return alternatives;
}

// ============================================
// TRANSIT PASS RECOMMENDATIONS
// ============================================

/**
 * Get transit pass recommendation for a city
 */
export function getTransitPassRecommendation(
  city: string,
  tripDuration: number, // days
  options?: {
    includeAirportTransfer?: boolean;
    frequentRider?: boolean;
  }
): {
  recommendation: string;
  estimatedCost?: string;
  purchaseLocations: string[];
  tips: string[];
} {
  const config = CITY_CONFIGS[city.toLowerCase()];

  const baseRecommendations: Record<
    string,
    {
      recommendation: string;
      estimatedCost?: string;
      purchaseLocations: string[];
      tips: string[];
    }
  > = {
    tokyo: {
      recommendation:
        tripDuration <= 3
          ? "Tokyo Subway Ticket (72-hour)"
          : "Suica/Pasmo IC Card (rechargeable)",
      estimatedCost: tripDuration <= 3 ? "¥1,500" : "¥2,000 deposit + fares",
      purchaseLocations: [
        "Airport arrival halls",
        "Major train stations (Shinjuku, Tokyo, Shibuya)",
        "Convenience stores (7-Eleven, Lawson)",
      ],
      tips: [
        "IC cards work on JR, Metro, buses, and even convenience stores",
        "Subway ticket doesn't cover JR lines",
        "Get IC card for flexibility",
      ],
    },
    paris: {
      recommendation:
        tripDuration <= 3
          ? "Paris Visite pass (zones 1-3)"
          : "Navigo Easy with carnets",
      estimatedCost: tripDuration <= 3 ? "€29-41 for 3 days" : "€2 card + €16.90/10 tickets",
      purchaseLocations: [
        "CDG/Orly airport stations",
        "Major Metro stations",
        "RATP ticket windows",
      ],
      tips: [
        "Zone 1-3 covers central Paris and most attractions",
        "Zone 1-5 needed for Versailles and airports",
        "Paris Visite includes unlimited travel",
      ],
    },
    london: {
      recommendation: "Contactless payment or Oyster card",
      estimatedCost: "Daily cap ~£8.10 (zones 1-2)",
      purchaseLocations: [
        "Heathrow Express stations",
        "Any Tube station",
        "Oyster ticket shops",
      ],
      tips: [
        "Contactless has same fares as Oyster",
        "Daily/weekly caps prevent overpaying",
        "Avoid buying single tickets (2x the price)",
      ],
    },
  };

  const cityRec = baseRecommendations[city.toLowerCase()];

  if (!cityRec) {
    return {
      recommendation:
        config?.passRecommendation || "Check local transit authority for visitor passes",
      purchaseLocations: ["Airport", "Central train station", "Tourist information centers"],
      tips: [
        "Buy passes at official locations to avoid scams",
        "Keep receipts for any deposits",
      ],
    };
  }

  // Add airport transfer tip if needed
  if (options?.includeAirportTransfer) {
    cityRec.tips.push("Check if pass covers airport transfer or buy separate ticket");
  }

  return cityRec;
}

// ============================================
// LINE STATUS
// ============================================

/**
 * Get status of transit lines in a city
 */
export async function getLineStatus(city: string): Promise<TransitLine[]> {
  const alerts = await getTransitAlerts(city);

  // Group alerts by line
  const lineAlerts = new Map<string, TransitAlert[]>();
  for (const alert of alerts) {
    for (const line of alert.affectedLines) {
      const existing = lineAlerts.get(line) || [];
      existing.push(alert);
      lineAlerts.set(line, existing);
    }
  }

  // Convert to TransitLine objects
  const lines: TransitLine[] = [];
  for (const [lineName, lineAlertsList] of lineAlerts) {
    const worstSeverity = lineAlertsList.reduce((worst, alert) => {
      const severityOrder: AlertSeverity[] = ["info", "warning", "severe", "critical"];
      return severityOrder.indexOf(alert.severity) > severityOrder.indexOf(worst)
        ? alert.severity
        : worst;
    }, "info" as AlertSeverity);

    lines.push({
      id: lineName.toLowerCase().replace(/\s+/g, "-"),
      name: lineName,
      shortName: lineName,
      type: "subway",
      operator: CITY_CONFIGS[city.toLowerCase()]?.transitAgency || "Unknown",
      status: mapSeverityToStatus(worstSeverity),
      alerts: lineAlertsList,
    });
  }

  return lines;
}

function mapSeverityToStatus(severity: AlertSeverity): LineStatus {
  switch (severity) {
    case "critical":
      return "suspended";
    case "severe":
      return "major_delays";
    case "warning":
      return "minor_delays";
    default:
      return "normal";
  }
}

export default {
  getTransitAlerts,
  getStrikeInfo,
  checkRouteForStrikes,
  getLastTrainTimes,
  checkLastTrainWarning,
  getAlternativeRoutes,
  getTransitPassRecommendation,
  getLineStatus,
  isTransitAlertsConfigured,
  CITY_CONFIGS,
};
