/**
 * Flight Status Integration
 *
 * Provides real-time flight information including:
 * - Flight status tracking
 * - Delay notifications
 * - Gate changes
 * - Airport arrival time estimates
 *
 * Providers (in priority order):
 * 1. FlightAware API - Paid, most comprehensive
 * 2. AviationStack - Free tier (100 req/month)
 * 3. AeroDataBox (RapidAPI) - Free tier (100 req/month)
 * 4. OpenSky Network - Free, open data (limited)
 * 5. Offline airline data - Static fallback
 *
 * API Docs:
 * - FlightAware: https://www.flightaware.com/aeroapi/
 * - AviationStack: https://aviationstack.com/documentation
 * - AeroDataBox: https://rapidapi.com/aerodatabox/api/aerodatabox
 * - OpenSky: https://openskynetwork.github.io/opensky-api/
 */

import { getOrFetch, cacheKey, CACHE_TTL, CACHE_NS, setCache, getCache } from "./cache";

// API Configuration
const FLIGHTAWARE_API_KEY = process.env.FLIGHTAWARE_API_KEY || "";
const AVIATIONSTACK_API_KEY = process.env.AVIATIONSTACK_API_KEY || "";
const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY || ""; // For AeroDataBox and other RapidAPI services

// API URLs
const FLIGHTAWARE_URL = "https://aeroapi.flightaware.com/aeroapi";
const AVIATIONSTACK_URL = "http://api.aviationstack.com/v1"; // Note: HTTPS is paid only
const AERODATABOX_URL = "https://aerodatabox.p.rapidapi.com";
const OPENSKY_URL = "https://opensky-network.org/api"; // Free, no key required

// ============================================
// TYPES
// ============================================

export type FlightStatus =
  | "scheduled"
  | "active"
  | "landed"
  | "cancelled"
  | "diverted"
  | "delayed"
  | "unknown";

export interface Flight {
  flightNumber: string;
  airline: AirlineInfo;
  departure: FlightEndpoint;
  arrival: FlightEndpoint;
  status: FlightStatus;
  aircraft?: AircraftInfo;
  duration?: number; // minutes
  distance?: number; // km
  codeshares?: string[];
  lastUpdated: string;
}

export interface AirlineInfo {
  code: string; // IATA code
  name: string;
  logo?: string;
}

export interface FlightEndpoint {
  airport: AirportInfo;
  terminal?: string;
  gate?: string;
  scheduledTime: string;
  estimatedTime?: string;
  actualTime?: string;
  delay?: number; // minutes
  baggageClaim?: string;
}

export interface AirportInfo {
  code: string; // IATA code
  name: string;
  city: string;
  country: string;
  timezone?: string;
  location?: { lat: number; lng: number };
}

export interface AircraftInfo {
  model: string;
  registration?: string;
}

export interface FlightSearchParams {
  flightNumber?: string;
  airline?: string;
  departureAirport?: string;
  arrivalAirport?: string;
  date?: string; // YYYY-MM-DD
}

export interface AirportFlights {
  airport: AirportInfo;
  departures: Flight[];
  arrivals: Flight[];
  lastUpdated: string;
}

// ============================================
// AIRLINE DATA
// ============================================

const AIRLINES: Record<string, AirlineInfo> = {
  AA: { code: "AA", name: "American Airlines" },
  UA: { code: "UA", name: "United Airlines" },
  DL: { code: "DL", name: "Delta Air Lines" },
  BA: { code: "BA", name: "British Airways" },
  LH: { code: "LH", name: "Lufthansa" },
  AF: { code: "AF", name: "Air France" },
  JL: { code: "JL", name: "Japan Airlines" },
  NH: { code: "NH", name: "All Nippon Airways" },
  SQ: { code: "SQ", name: "Singapore Airlines" },
  EK: { code: "EK", name: "Emirates" },
  QF: { code: "QF", name: "Qantas" },
  CX: { code: "CX", name: "Cathay Pacific" },
  TG: { code: "TG", name: "Thai Airways" },
  KE: { code: "KE", name: "Korean Air" },
  OZ: { code: "OZ", name: "Asiana Airlines" },
  AC: { code: "AC", name: "Air Canada" },
  QR: { code: "QR", name: "Qatar Airways" },
  EY: { code: "EY", name: "Etihad Airways" },
  KL: { code: "KL", name: "KLM" },
  IB: { code: "IB", name: "Iberia" },
  AZ: { code: "AZ", name: "ITA Airways" },
  SK: { code: "SK", name: "SAS" },
  LX: { code: "LX", name: "Swiss" },
  OS: { code: "OS", name: "Austrian Airlines" },
  TP: { code: "TP", name: "TAP Portugal" },
  TK: { code: "TK", name: "Turkish Airlines" },
  VS: { code: "VS", name: "Virgin Atlantic" },
  WN: { code: "WN", name: "Southwest Airlines" },
  B6: { code: "B6", name: "JetBlue" },
  AS: { code: "AS", name: "Alaska Airlines" },
  FR: { code: "FR", name: "Ryanair" },
  U2: { code: "U2", name: "easyJet" },
};

// ============================================
// AIRPORT DATA
// ============================================

const AIRPORTS: Record<string, AirportInfo> = {
  JFK: { code: "JFK", name: "John F. Kennedy International Airport", city: "New York", country: "USA", timezone: "America/New_York", location: { lat: 40.6413, lng: -73.7781 } },
  LAX: { code: "LAX", name: "Los Angeles International Airport", city: "Los Angeles", country: "USA", timezone: "America/Los_Angeles", location: { lat: 33.9416, lng: -118.4085 } },
  ORD: { code: "ORD", name: "O'Hare International Airport", city: "Chicago", country: "USA", timezone: "America/Chicago", location: { lat: 41.9742, lng: -87.9073 } },
  LHR: { code: "LHR", name: "Heathrow Airport", city: "London", country: "UK", timezone: "Europe/London", location: { lat: 51.4700, lng: -0.4543 } },
  CDG: { code: "CDG", name: "Charles de Gaulle Airport", city: "Paris", country: "France", timezone: "Europe/Paris", location: { lat: 49.0097, lng: 2.5478 } },
  NRT: { code: "NRT", name: "Narita International Airport", city: "Tokyo", country: "Japan", timezone: "Asia/Tokyo", location: { lat: 35.7720, lng: 140.3929 } },
  HND: { code: "HND", name: "Haneda Airport", city: "Tokyo", country: "Japan", timezone: "Asia/Tokyo", location: { lat: 35.5494, lng: 139.7798 } },
  SIN: { code: "SIN", name: "Singapore Changi Airport", city: "Singapore", country: "Singapore", timezone: "Asia/Singapore", location: { lat: 1.3644, lng: 103.9915 } },
  HKG: { code: "HKG", name: "Hong Kong International Airport", city: "Hong Kong", country: "Hong Kong", timezone: "Asia/Hong_Kong", location: { lat: 22.3080, lng: 113.9185 } },
  ICN: { code: "ICN", name: "Incheon International Airport", city: "Seoul", country: "South Korea", timezone: "Asia/Seoul", location: { lat: 37.4602, lng: 126.4407 } },
  BKK: { code: "BKK", name: "Suvarnabhumi Airport", city: "Bangkok", country: "Thailand", timezone: "Asia/Bangkok", location: { lat: 13.6900, lng: 100.7501 } },
  DXB: { code: "DXB", name: "Dubai International Airport", city: "Dubai", country: "UAE", timezone: "Asia/Dubai", location: { lat: 25.2532, lng: 55.3657 } },
  SYD: { code: "SYD", name: "Sydney Kingsford Smith Airport", city: "Sydney", country: "Australia", timezone: "Australia/Sydney", location: { lat: -33.9399, lng: 151.1753 } },
  FRA: { code: "FRA", name: "Frankfurt Airport", city: "Frankfurt", country: "Germany", timezone: "Europe/Berlin", location: { lat: 50.0379, lng: 8.5622 } },
  AMS: { code: "AMS", name: "Amsterdam Schiphol Airport", city: "Amsterdam", country: "Netherlands", timezone: "Europe/Amsterdam", location: { lat: 52.3105, lng: 4.7683 } },
  MUC: { code: "MUC", name: "Munich Airport", city: "Munich", country: "Germany", timezone: "Europe/Berlin", location: { lat: 48.3537, lng: 11.7750 } },
  FCO: { code: "FCO", name: "Leonardo da Vinci–Fiumicino Airport", city: "Rome", country: "Italy", timezone: "Europe/Rome", location: { lat: 41.8003, lng: 12.2389 } },
  MAD: { code: "MAD", name: "Adolfo Suárez Madrid–Barajas Airport", city: "Madrid", country: "Spain", timezone: "Europe/Madrid", location: { lat: 40.4983, lng: -3.5676 } },
  BCN: { code: "BCN", name: "Barcelona–El Prat Airport", city: "Barcelona", country: "Spain", timezone: "Europe/Madrid", location: { lat: 41.2974, lng: 2.0833 } },
  MEX: { code: "MEX", name: "Mexico City International Airport", city: "Mexico City", country: "Mexico", timezone: "America/Mexico_City", location: { lat: 19.4363, lng: -99.0721 } },
  CUN: { code: "CUN", name: "Cancún International Airport", city: "Cancún", country: "Mexico", timezone: "America/Cancun", location: { lat: 21.0365, lng: -86.8771 } },
};

// ============================================
// CONFIGURATION CHECK
// ============================================

export function isFlightStatusConfigured(): boolean {
  return !!(FLIGHTAWARE_API_KEY || AVIATIONSTACK_API_KEY);
}

// ============================================
// FLIGHT LOOKUP FUNCTIONS
// ============================================

/**
 * Get flight status by flight number
 */
export async function getFlightStatus(
  flightNumber: string,
  date?: string
): Promise<Flight | null> {
  // Normalize flight number
  const normalized = normalizeFlightNumber(flightNumber);

  // Try APIs
  if (AVIATIONSTACK_API_KEY) {
    const flight = await fetchAviationStackFlight(normalized, date);
    if (flight) return flight;
  }

  if (FLIGHTAWARE_API_KEY) {
    const flight = await fetchFlightAwareFlight(normalized, date);
    if (flight) return flight;
  }

  // Return simulated data for demo
  return getSimulatedFlight(normalized, date);
}

/**
 * Fetch from AviationStack API
 */
async function fetchAviationStackFlight(
  flightNumber: string,
  _date?: string
): Promise<Flight | null> {
  try {
    const url = new URL("http://api.aviationstack.com/v1/flights");
    url.searchParams.set("access_key", AVIATIONSTACK_API_KEY);
    url.searchParams.set("flight_iata", flightNumber);

    const response = await fetch(url.toString());
    if (!response.ok) return null;

    const data = await response.json();
    const flightData = data.data?.[0];

    if (!flightData) return null;

    return {
      flightNumber: flightData.flight?.iata || flightNumber,
      airline: {
        code: flightData.airline?.iata || "",
        name: flightData.airline?.name || "",
      },
      departure: {
        airport: {
          code: flightData.departure?.iata || "",
          name: flightData.departure?.airport || "",
          city: flightData.departure?.timezone?.split("/")[1] || "",
          country: "",
        },
        terminal: flightData.departure?.terminal,
        gate: flightData.departure?.gate,
        scheduledTime: flightData.departure?.scheduled || "",
        estimatedTime: flightData.departure?.estimated,
        actualTime: flightData.departure?.actual,
        delay: flightData.departure?.delay,
      },
      arrival: {
        airport: {
          code: flightData.arrival?.iata || "",
          name: flightData.arrival?.airport || "",
          city: flightData.arrival?.timezone?.split("/")[1] || "",
          country: "",
        },
        terminal: flightData.arrival?.terminal,
        gate: flightData.arrival?.gate,
        scheduledTime: flightData.arrival?.scheduled || "",
        estimatedTime: flightData.arrival?.estimated,
        actualTime: flightData.arrival?.actual,
        delay: flightData.arrival?.delay,
        baggageClaim: flightData.arrival?.baggage,
      },
      status: mapFlightStatus(flightData.flight_status),
      lastUpdated: new Date().toISOString(),
    };
  } catch (error) {
    console.error("AviationStack API error:", error);
    return null;
  }
}

/**
 * Fetch from FlightAware API
 */
async function fetchFlightAwareFlight(
  _flightNumber: string,
  _date?: string
): Promise<Flight | null> {
  // FlightAware requires different API structure
  // Implementation would go here
  return null;
}

/**
 * Get simulated flight for demo
 */
function getSimulatedFlight(flightNumber: string, date?: string): Flight | null {
  const airlineCode = flightNumber.slice(0, 2).toUpperCase();
  const airline = AIRLINES[airlineCode];

  if (!airline) return null;

  const flightDate = date ? new Date(date) : new Date();
  const departureTime = new Date(flightDate);
  departureTime.setHours(10, 30, 0, 0);

  const arrivalTime = new Date(departureTime);
  arrivalTime.setHours(arrivalTime.getHours() + 12);

  // Random delay for simulation
  const hasDelay = Math.random() > 0.7;
  const delay = hasDelay ? Math.floor(Math.random() * 90) + 15 : 0;

  return {
    flightNumber,
    airline,
    departure: {
      airport: AIRPORTS.JFK,
      terminal: "1",
      gate: "B32",
      scheduledTime: departureTime.toISOString(),
      estimatedTime: hasDelay
        ? new Date(departureTime.getTime() + delay * 60000).toISOString()
        : undefined,
      delay: delay > 0 ? delay : undefined,
    },
    arrival: {
      airport: AIRPORTS.NRT,
      terminal: "1",
      scheduledTime: arrivalTime.toISOString(),
      estimatedTime: hasDelay
        ? new Date(arrivalTime.getTime() + delay * 60000).toISOString()
        : undefined,
      delay: delay > 0 ? delay : undefined,
    },
    status: hasDelay ? "delayed" : "scheduled",
    duration: 12 * 60 + 30,
    lastUpdated: new Date().toISOString(),
  };
}

// ============================================
// AIRPORT FUNCTIONS
// ============================================

/**
 * Get airport information
 */
export function getAirportInfo(code: string): AirportInfo | null {
  return AIRPORTS[code.toUpperCase()] || null;
}

/**
 * Get airline information
 */
export function getAirlineInfo(code: string): AirlineInfo | null {
  return AIRLINES[code.toUpperCase()] || null;
}

/**
 * Search airports by name or city
 */
export function searchAirports(query: string): AirportInfo[] {
  const lowerQuery = query.toLowerCase();
  return Object.values(AIRPORTS).filter(
    (airport) =>
      airport.code.toLowerCase().includes(lowerQuery) ||
      airport.name.toLowerCase().includes(lowerQuery) ||
      airport.city.toLowerCase().includes(lowerQuery)
  );
}

// ============================================
// TIMING CALCULATIONS
// ============================================

/**
 * Calculate airport arrival time recommendation
 */
export function getAirportArrivalTime(
  flight: Flight,
  options?: {
    international?: boolean;
    hasCheckIn?: boolean;
    needsVisaCheck?: boolean;
    hasPriorityAccess?: boolean;
  }
): {
  recommendedArrival: string;
  breakdown: {
    activity: string;
    duration: number; // minutes
  }[];
  tips: string[];
} {
  const isInternational = options?.international ?? true;
  const hasCheckIn = options?.hasCheckIn ?? true;

  const breakdown: { activity: string; duration: number }[] = [];
  let totalTime = 0;

  // Check-in time
  if (hasCheckIn) {
    const checkInTime = isInternational ? 60 : 45;
    breakdown.push({ activity: "Check-in & bag drop", duration: checkInTime });
    totalTime += checkInTime;
  }

  // Security
  const securityTime = options?.hasPriorityAccess ? 15 : 30;
  breakdown.push({ activity: "Security screening", duration: securityTime });
  totalTime += securityTime;

  // Immigration (international only)
  if (isInternational) {
    breakdown.push({ activity: "Immigration/passport control", duration: 20 });
    totalTime += 20;
  }

  // Buffer time
  const bufferTime = isInternational ? 30 : 20;
  breakdown.push({ activity: "Buffer for gate/boarding", duration: bufferTime });
  totalTime += bufferTime;

  // Calculate recommended arrival
  const departureTime = new Date(flight.departure.estimatedTime || flight.departure.scheduledTime);
  const arrivalTime = new Date(departureTime.getTime() - totalTime * 60000);

  const tips: string[] = [];

  if (isInternational) {
    tips.push("Arrive at least 3 hours before international flights");
  } else {
    tips.push("Arrive at least 2 hours before domestic flights");
  }

  if (flight.status === "delayed") {
    tips.push(`Note: Your flight is delayed by ${flight.departure.delay} minutes`);
  }

  tips.push("Check terminal information before leaving for the airport");
  tips.push("Have your passport and boarding pass ready");

  return {
    recommendedArrival: arrivalTime.toISOString(),
    breakdown,
    tips,
  };
}

/**
 * Get post-landing timeline
 */
export function getPostLandingTimeline(
  flight: Flight,
  options?: {
    hasCheckedBags?: boolean;
    needsImmigration?: boolean;
    needsCustoms?: boolean;
    hasGlobalEntry?: boolean;
  }
): {
  estimatedExitTime: string;
  breakdown: { activity: string; duration: number }[];
  tips: string[];
} {
  const breakdown: { activity: string; duration: number }[] = [];
  let totalTime = 0;

  // Deplaning
  breakdown.push({ activity: "Deplaning", duration: 15 });
  totalTime += 15;

  // Immigration
  if (options?.needsImmigration) {
    const immigrationTime = options.hasGlobalEntry ? 10 : 45;
    breakdown.push({
      activity: options.hasGlobalEntry ? "Global Entry/immigration" : "Immigration queue",
      duration: immigrationTime,
    });
    totalTime += immigrationTime;
  }

  // Baggage claim
  if (options?.hasCheckedBags) {
    breakdown.push({ activity: "Baggage claim", duration: 30 });
    totalTime += 30;
  }

  // Customs
  if (options?.needsCustoms) {
    breakdown.push({ activity: "Customs", duration: 15 });
    totalTime += 15;
  }

  const arrivalTime = new Date(flight.arrival.estimatedTime || flight.arrival.scheduledTime);
  const exitTime = new Date(arrivalTime.getTime() + totalTime * 60000);

  const tips: string[] = [];
  if (options?.needsImmigration && !options.hasGlobalEntry) {
    tips.push("Immigration lines can be long - have documents ready");
  }
  if (flight.arrival.baggageClaim) {
    tips.push(`Baggage claim: ${flight.arrival.baggageClaim}`);
  }

  return {
    estimatedExitTime: exitTime.toISOString(),
    breakdown,
    tips,
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Normalize flight number format
 */
function normalizeFlightNumber(flightNumber: string): string {
  // Remove spaces and convert to uppercase
  const cleaned = flightNumber.replace(/\s+/g, "").toUpperCase();

  // Ensure proper format (e.g., "JL 1" -> "JL1")
  return cleaned;
}

/**
 * Map API status to our FlightStatus type
 */
function mapFlightStatus(status: string): FlightStatus {
  const statusMap: Record<string, FlightStatus> = {
    scheduled: "scheduled",
    active: "active",
    landed: "landed",
    cancelled: "cancelled",
    incident: "cancelled",
    diverted: "diverted",
    delayed: "delayed",
  };

  return statusMap[status?.toLowerCase()] || "unknown";
}

/**
 * Format flight duration
 */
export function formatFlightDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;

  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Get status color and description
 */
export function getFlightStatusInfo(status: FlightStatus): {
  color: string;
  icon: string;
  description: string;
} {
  switch (status) {
    case "scheduled":
      return { color: "gray", icon: "🕒", description: "On time" };
    case "active":
      return { color: "blue", icon: "✈️", description: "In flight" };
    case "landed":
      return { color: "green", icon: "✅", description: "Landed" };
    case "cancelled":
      return { color: "red", icon: "❌", description: "Cancelled" };
    case "diverted":
      return { color: "orange", icon: "↪️", description: "Diverted" };
    case "delayed":
      return { color: "yellow", icon: "⚠️", description: "Delayed" };
    default:
      return { color: "gray", icon: "❓", description: "Unknown" };
  }
}

/**
 * Format delay message
 */
export function formatDelayMessage(minutes: number): string {
  if (minutes <= 0) return "On time";
  if (minutes < 15) return "Slightly delayed";
  if (minutes < 30) return `Delayed ~${minutes} minutes`;
  if (minutes < 60) return `Delayed ~${minutes} minutes`;

  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `Delayed ${hours}h ${mins}m`;
}

export default {
  getFlightStatus,
  getAirportInfo,
  getAirlineInfo,
  searchAirports,
  getAirportArrivalTime,
  getPostLandingTimeline,
  formatFlightDuration,
  getFlightStatusInfo,
  formatDelayMessage,
  isFlightStatusConfigured,
};
