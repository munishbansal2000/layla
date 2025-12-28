/**
 * Inter-City Transport Service
 *
 * Provides intelligent routing between cities using multiple transport modes.
 * Integrates with flight, train, and bus APIs for real pricing and availability.
 */

import type {
  CityDestination,
  InterCityLeg,
  InterCityTransportMode,
  FlightOption,
  TrainOption,
  BusOption,
  TransportSearchRequest,
  TransportSearchResult,
  CitySequenceRequest,
  CitySequenceResult,
  TravelerInfo,
  AirportInfo,
  StationInfo,
  CarrierInfo,
} from "@/types/multi-city";

// ============================================
// CONSTANTS
// ============================================

const EARTH_RADIUS_KM = 6371;

// Average speeds for transport modes (km/h)
const TRANSPORT_SPEEDS: Record<InterCityTransportMode, number> = {
  flight: 800,
  train: 200,
  bus: 80,
  ferry: 40,
  car_rental: 100,
  private_transfer: 100,
};

// Base costs per km (USD)
const TRANSPORT_COSTS_PER_KM: Record<InterCityTransportMode, number> = {
  flight: 0.15,
  train: 0.08,
  bus: 0.04,
  ferry: 0.06,
  car_rental: 0.12,
  private_transfer: 0.25,
};

// Fixed costs (USD)
const TRANSPORT_FIXED_COSTS: Record<InterCityTransportMode, number> = {
  flight: 50,
  train: 20,
  bus: 10,
  ferry: 15,
  car_rental: 30,
  private_transfer: 40,
};

// CO2 emissions per km per passenger (kg)
const CARBON_PER_KM: Record<InterCityTransportMode, number> = {
  flight: 0.255,
  train: 0.041,
  bus: 0.089,
  ferry: 0.115,
  car_rental: 0.171,
  private_transfer: 0.171,
};

// Distance thresholds for transport mode recommendations (km)
const MODE_DISTANCE_THRESHOLDS = {
  walkable: 5,
  bus_preferred: 300,
  train_preferred: 800,
  flight_preferred: 1500,
};

// ============================================
// MAJOR AIRPORTS & STATIONS DATABASE
// ============================================

const MAJOR_AIRPORTS: Record<string, AirportInfo[]> = {
  paris: [
    { code: "CDG", name: "Charles de Gaulle", city: "Paris" },
    { code: "ORY", name: "Orly", city: "Paris" },
  ],
  london: [
    { code: "LHR", name: "Heathrow", city: "London" },
    { code: "LGW", name: "Gatwick", city: "London" },
    { code: "STN", name: "Stansted", city: "London" },
  ],
  tokyo: [
    { code: "NRT", name: "Narita", city: "Tokyo" },
    { code: "HND", name: "Haneda", city: "Tokyo" },
  ],
  new_york: [
    { code: "JFK", name: "John F. Kennedy", city: "New York" },
    { code: "EWR", name: "Newark", city: "New York" },
    { code: "LGA", name: "LaGuardia", city: "New York" },
  ],
  barcelona: [{ code: "BCN", name: "El Prat", city: "Barcelona" }],
  rome: [
    { code: "FCO", name: "Fiumicino", city: "Rome" },
    { code: "CIA", name: "Ciampino", city: "Rome" },
  ],
  amsterdam: [{ code: "AMS", name: "Schiphol", city: "Amsterdam" }],
  berlin: [{ code: "BER", name: "Brandenburg", city: "Berlin" }],
  madrid: [{ code: "MAD", name: "Barajas", city: "Madrid" }],
  lisbon: [{ code: "LIS", name: "Humberto Delgado", city: "Lisbon" }],
};

const MAJOR_TRAIN_STATIONS: Record<string, StationInfo[]> = {
  paris: [
    { code: "FRPNO", name: "Gare du Nord", city: "Paris" },
    { code: "FRPLY", name: "Gare de Lyon", city: "Paris" },
    { code: "FRPMO", name: "Gare Montparnasse", city: "Paris" },
  ],
  london: [
    { code: "GBSTP", name: "St Pancras International", city: "London" },
    { code: "GBKGX", name: "King's Cross", city: "London" },
    { code: "GBEUS", name: "Euston", city: "London" },
  ],
  tokyo: [
    { code: "JPTYO", name: "Tokyo Station", city: "Tokyo" },
    { code: "JPSNJ", name: "Shinagawa", city: "Tokyo" },
  ],
  barcelona: [{ code: "ESBCN", name: "Sants", city: "Barcelona" }],
  amsterdam: [{ code: "NLAMS", name: "Amsterdam Centraal", city: "Amsterdam" }],
  berlin: [{ code: "DEBER", name: "Berlin Hauptbahnhof", city: "Berlin" }],
  madrid: [{ code: "ESMAD", name: "Atocha", city: "Madrid" }],
  rome: [{ code: "ITROM", name: "Roma Termini", city: "Rome" }],
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Calculate distance between two coordinates using Haversine formula
 */
function calculateDistance(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) *
      Math.cos(toRadians(lat2)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
}

function toRadians(degrees: number): number {
  return degrees * (Math.PI / 180);
}

/**
 * Generate unique ID
 */
function generateId(): string {
  return `leg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Format duration as human-readable string
 */
function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins}m`;
  if (mins === 0) return `${hours}h`;
  return `${hours}h ${mins}m`;
}

/**
 * Add minutes to a datetime string
 */
function addMinutes(datetime: string, minutes: number): string {
  const date = new Date(datetime);
  date.setMinutes(date.getMinutes() + minutes);
  return date.toISOString();
}

/**
 * Get city key for lookups
 */
function getCityKey(city: CityDestination | string): string {
  const name = typeof city === "string" ? city : city.name;
  return name.toLowerCase().replace(/[^a-z]/g, "_");
}

// ============================================
// TRANSPORT ESTIMATION
// ============================================

/**
 * Estimate travel time between cities
 */
export function estimateTravelTime(
  fromCity: CityDestination,
  toCity: CityDestination,
  mode: InterCityTransportMode
): number {
  const distance = calculateDistance(
    fromCity.coordinates.lat,
    fromCity.coordinates.lng,
    toCity.coordinates.lat,
    toCity.coordinates.lng
  );

  const baseTime = (distance / TRANSPORT_SPEEDS[mode]) * 60; // minutes

  // Add overhead for each mode
  switch (mode) {
    case "flight":
      return Math.round(baseTime + 180); // 3hr airport time
    case "train":
      return Math.round(baseTime + 30); // 30min station time
    case "bus":
      return Math.round(baseTime + 20);
    case "ferry":
      return Math.round(baseTime + 60);
    default:
      return Math.round(baseTime);
  }
}

/**
 * Estimate cost for transport
 */
export function estimateCost(
  fromCity: CityDestination,
  toCity: CityDestination,
  mode: InterCityTransportMode,
  travelers: TravelerInfo
): { amount: number; currency: string } {
  const distance = calculateDistance(
    fromCity.coordinates.lat,
    fromCity.coordinates.lng,
    toCity.coordinates.lat,
    toCity.coordinates.lng
  );

  const passengerCount = travelers.adults + travelers.children;
  const baseCost =
    TRANSPORT_FIXED_COSTS[mode] + distance * TRANSPORT_COSTS_PER_KM[mode];

  return {
    amount: Math.round(baseCost * passengerCount),
    currency: "USD",
  };
}

/**
 * Calculate carbon footprint
 */
export function calculateCarbonFootprint(
  fromCity: CityDestination,
  toCity: CityDestination,
  mode: InterCityTransportMode,
  travelers: TravelerInfo
): { kgCO2: number } {
  const distance = calculateDistance(
    fromCity.coordinates.lat,
    fromCity.coordinates.lng,
    toCity.coordinates.lat,
    toCity.coordinates.lng
  );

  const passengerCount = travelers.adults + travelers.children + travelers.infants;
  const kgCO2 = distance * CARBON_PER_KM[mode] * passengerCount;

  return { kgCO2: Math.round(kgCO2 * 10) / 10 };
}

// ============================================
// TRANSPORT OPTIONS GENERATION
// ============================================

/**
 * Get recommended transport modes for a city pair
 */
export function getRecommendedModes(
  fromCity: CityDestination,
  toCity: CityDestination
): InterCityTransportMode[] {
  const distance = calculateDistance(
    fromCity.coordinates.lat,
    fromCity.coordinates.lng,
    toCity.coordinates.lat,
    toCity.coordinates.lng
  );

  const modes: InterCityTransportMode[] = [];

  if (distance <= MODE_DISTANCE_THRESHOLDS.bus_preferred) {
    modes.push("bus", "train", "car_rental");
  } else if (distance <= MODE_DISTANCE_THRESHOLDS.train_preferred) {
    modes.push("train", "bus", "flight");
  } else if (distance <= MODE_DISTANCE_THRESHOLDS.flight_preferred) {
    modes.push("train", "flight");
  } else {
    modes.push("flight");
  }

  return modes;
}

/**
 * Generate flight option
 */
function generateFlightOption(
  fromCity: CityDestination,
  toCity: CityDestination,
  departureTime: string,
  travelers: TravelerInfo
): FlightOption | null {
  const fromAirports = MAJOR_AIRPORTS[getCityKey(fromCity)];
  const toAirports = MAJOR_AIRPORTS[getCityKey(toCity)];

  if (!fromAirports?.length || !toAirports?.length) {
    return null;
  }

  const departureAirport = fromAirports[0];
  const arrivalAirport = toAirports[0];
  const durationMinutes = estimateTravelTime(fromCity, toCity, "flight");
  const arrivalTime = addMinutes(departureTime, durationMinutes);
  const cost = estimateCost(fromCity, toCity, "flight", travelers);
  const carbon = calculateCarbonFootprint(fromCity, toCity, "flight", travelers);

  const carrier: CarrierInfo = {
    name: "Sample Airlines",
    code: "SA",
    type: "airline",
  };

  return {
    id: generateId(),
    fromCity,
    toCity,
    transportMode: "flight",
    departureTime,
    arrivalTime,
    durationMinutes,
    flightNumber: `SA${Math.floor(1000 + Math.random() * 9000)}`,
    departureAirport,
    arrivalAirport,
    stops: 0,
    carrier,
    price: cost,
    carbonFootprint: carbon,
  };
}

/**
 * Generate train option
 */
function generateTrainOption(
  fromCity: CityDestination,
  toCity: CityDestination,
  departureTime: string,
  travelers: TravelerInfo
): TrainOption | null {
  const fromStations = MAJOR_TRAIN_STATIONS[getCityKey(fromCity)];
  const toStations = MAJOR_TRAIN_STATIONS[getCityKey(toCity)];

  if (!fromStations?.length || !toStations?.length) {
    return null;
  }

  const departureStation = fromStations[0];
  const arrivalStation = toStations[0];
  const durationMinutes = estimateTravelTime(fromCity, toCity, "train");
  const arrivalTime = addMinutes(departureTime, durationMinutes);
  const cost = estimateCost(fromCity, toCity, "train", travelers);
  const carbon = calculateCarbonFootprint(fromCity, toCity, "train", travelers);

  const carrier: CarrierInfo = {
    name: "Rail Europe",
    code: "RE",
    type: "rail_operator",
  };

  return {
    id: generateId(),
    fromCity,
    toCity,
    transportMode: "train",
    departureTime,
    arrivalTime,
    durationMinutes,
    trainNumber: `RE${Math.floor(100 + Math.random() * 900)}`,
    trainType: durationMinutes > 180 ? "high_speed" : "intercity",
    departureStation,
    arrivalStation,
    carrier,
    price: cost,
    carbonFootprint: carbon,
    amenities: {
      wifi: true,
      powerOutlets: true,
      diningCar: durationMinutes > 120,
      quietCar: true,
      accessibility: true,
    },
  };
}

/**
 * Generate bus option
 */
function generateBusOption(
  fromCity: CityDestination,
  toCity: CityDestination,
  departureTime: string,
  travelers: TravelerInfo
): BusOption | null {
  const durationMinutes = estimateTravelTime(fromCity, toCity, "bus");

  // Don't offer bus for very long distances
  if (durationMinutes > 600) {
    return null;
  }

  const arrivalTime = addMinutes(departureTime, durationMinutes);
  const cost = estimateCost(fromCity, toCity, "bus", travelers);
  const carbon = calculateCarbonFootprint(fromCity, toCity, "bus", travelers);

  const carrier: CarrierInfo = {
    name: "FlixBus",
    code: "FLX",
    type: "bus_company",
  };

  return {
    id: generateId(),
    fromCity,
    toCity,
    transportMode: "bus",
    departureTime,
    arrivalTime,
    durationMinutes,
    busNumber: `FLX${Math.floor(100 + Math.random() * 900)}`,
    busType: durationMinutes > 300 ? "overnight" : "express",
    departureTerminal: `${fromCity.name} Central Bus Station`,
    arrivalTerminal: `${toCity.name} Central Bus Station`,
    carrier,
    price: cost,
    carbonFootprint: carbon,
    amenities: {
      wifi: true,
      powerOutlets: true,
      restroom: true,
      recliningSeats: true,
      entertainment: false,
    },
  };
}

// ============================================
// MAIN SEARCH FUNCTION
// ============================================

/**
 * Search for transport options between cities
 */
export async function searchTransportOptions(
  request: TransportSearchRequest
): Promise<TransportSearchResult> {
  const fromCity =
    typeof request.fromCity === "string"
      ? createCityFromName(request.fromCity)
      : request.fromCity;
  const toCity =
    typeof request.toCity === "string"
      ? createCityFromName(request.toCity)
      : request.toCity;

  const departureTime = `${request.departureDate}T09:00:00Z`;
  const options: InterCityLeg[] = [];

  // Get preferred modes or use recommendations
  const modes =
    request.preferredModes || getRecommendedModes(fromCity, toCity);

  // Generate options for each mode
  for (const mode of modes) {
    let option: InterCityLeg | null = null;

    switch (mode) {
      case "flight":
        option = generateFlightOption(
          fromCity,
          toCity,
          departureTime,
          request.travelers
        );
        break;
      case "train":
        option = generateTrainOption(
          fromCity,
          toCity,
          departureTime,
          request.travelers
        );
        break;
      case "bus":
        option = generateBusOption(
          fromCity,
          toCity,
          departureTime,
          request.travelers
        );
        break;
      default:
        option = generateGenericOption(
          fromCity,
          toCity,
          departureTime,
          request.travelers,
          mode
        );
    }

    if (option) {
      // Apply filters
      if (request.maxPrice && option.price) {
        if (option.price.amount > request.maxPrice.amount) {
          continue;
        }
      }
      if (request.maxDuration && option.durationMinutes > request.maxDuration) {
        continue;
      }

      options.push(option);
    }
  }

  // Sort and select best options
  const sortedByPrice = [...options].sort(
    (a, b) => (a.price?.amount || 0) - (b.price?.amount || 0)
  );
  const sortedByDuration = [...options].sort(
    (a, b) => a.durationMinutes - b.durationMinutes
  );

  return {
    request,
    options,
    cheapest: sortedByPrice[0] || null,
    fastest: sortedByDuration[0] || null,
    recommended: selectRecommended(options, request),
    searchedAt: new Date().toISOString(),
  };
}

/**
 * Generate a generic transport option
 */
function generateGenericOption(
  fromCity: CityDestination,
  toCity: CityDestination,
  departureTime: string,
  travelers: TravelerInfo,
  mode: InterCityTransportMode
): InterCityLeg {
  const durationMinutes = estimateTravelTime(fromCity, toCity, mode);
  const arrivalTime = addMinutes(departureTime, durationMinutes);
  const cost = estimateCost(fromCity, toCity, mode, travelers);
  const carbon = calculateCarbonFootprint(fromCity, toCity, mode, travelers);

  return {
    id: generateId(),
    fromCity,
    toCity,
    transportMode: mode,
    departureTime,
    arrivalTime,
    durationMinutes,
    price: cost,
    carbonFootprint: carbon,
  };
}

/**
 * Select the recommended option based on preferences
 */
function selectRecommended(
  options: InterCityLeg[],
  request: TransportSearchRequest
): InterCityLeg | null {
  if (options.length === 0) return null;

  // Score each option
  const scored = options.map((option) => {
    let score = 100;

    // Prefer eco-friendly options
    if (option.carbonFootprint) {
      score -= option.carbonFootprint.kgCO2 * 0.5;
    }

    // Balance cost and time
    if (option.price) {
      score -= option.price.amount * 0.1;
    }
    score -= option.durationMinutes * 0.05;

    // Prefer trains for medium distances
    if (option.transportMode === "train" && option.durationMinutes < 300) {
      score += 20;
    }

    return { option, score };
  });

  scored.sort((a, b) => b.score - a.score);
  return scored[0].option;
}

/**
 * Create a basic city destination from name
 */
function createCityFromName(name: string): CityDestination {
  const cities: Record<string, Partial<CityDestination>> = {
    paris: {
      coordinates: { lat: 48.8566, lng: 2.3522 },
      country: "France",
      countryCode: "FR",
      timezone: "Europe/Paris",
      currency: "EUR",
    },
    london: {
      coordinates: { lat: 51.5074, lng: -0.1278 },
      country: "United Kingdom",
      countryCode: "GB",
      timezone: "Europe/London",
      currency: "GBP",
    },
    barcelona: {
      coordinates: { lat: 41.3851, lng: 2.1734 },
      country: "Spain",
      countryCode: "ES",
      timezone: "Europe/Madrid",
      currency: "EUR",
    },
    amsterdam: {
      coordinates: { lat: 52.3676, lng: 4.9041 },
      country: "Netherlands",
      countryCode: "NL",
      timezone: "Europe/Amsterdam",
      currency: "EUR",
    },
    berlin: {
      coordinates: { lat: 52.52, lng: 13.405 },
      country: "Germany",
      countryCode: "DE",
      timezone: "Europe/Berlin",
      currency: "EUR",
    },
    rome: {
      coordinates: { lat: 41.9028, lng: 12.4964 },
      country: "Italy",
      countryCode: "IT",
      timezone: "Europe/Rome",
      currency: "EUR",
    },
    tokyo: {
      coordinates: { lat: 35.6762, lng: 139.6503 },
      country: "Japan",
      countryCode: "JP",
      timezone: "Asia/Tokyo",
      currency: "JPY",
    },
    new_york: {
      coordinates: { lat: 40.7128, lng: -74.006 },
      country: "United States",
      countryCode: "US",
      timezone: "America/New_York",
      currency: "USD",
    },
  };

  const key = name.toLowerCase().replace(/[^a-z]/g, "_");
  const cityData = cities[key] || {
    coordinates: { lat: 0, lng: 0 },
    country: "Unknown",
    countryCode: "XX",
    timezone: "UTC",
    currency: "USD",
  };

  return {
    id: `city_${key}`,
    name,
    ...cityData,
    language: "en",
  } as CityDestination;
}

// ============================================
// CITY SEQUENCING / TSP SOLVER
// ============================================

/**
 * Find optimal city visit order (Traveling Salesman approximation)
 */
export async function optimizeCitySequence(
  request: CitySequenceRequest
): Promise<CitySequenceResult> {
  const { cities, startCity, endCity, preferences } = request;

  // Calculate distance matrix
  const n = cities.length;
  const distances: number[][] = Array(n)
    .fill(null)
    .map(() => Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j) {
        distances[i][j] = calculateDistance(
          cities[i].coordinates.lat,
          cities[i].coordinates.lng,
          cities[j].coordinates.lat,
          cities[j].coordinates.lng
        );
      }
    }
  }

  // Find start and end indices
  const startIdx = cities.findIndex((c) => c.id === startCity.id);
  const endIdx = endCity ? cities.findIndex((c) => c.id === endCity.id) : startIdx;

  // Nearest neighbor heuristic
  const optimalOrder = nearestNeighborTSP(distances, startIdx, endIdx, n);
  const orderedCities = optimalOrder.map((idx) => cities[idx]);

  // Calculate total travel time and cost
  let totalTravelTime = 0;
  let totalCost = 0;
  const transitions: InterCityLeg[] = [];

  for (let i = 0; i < orderedCities.length - 1; i++) {
    const fromCity = orderedCities[i];
    const toCity = orderedCities[i + 1];
    const mode = getRecommendedModes(fromCity, toCity)[0];

    totalTravelTime += estimateTravelTime(fromCity, toCity, mode);
    const cost = estimateCost(fromCity, toCity, mode, { adults: 2, children: 0, infants: 0 });
    totalCost += cost.amount;

    transitions.push(
      generateGenericOption(
        fromCity,
        toCity,
        `${request.startDate}T09:00:00Z`,
        { adults: 2, children: 0, infants: 0 },
        mode
      )
    );
  }

  // Suggest nights per city
  const totalDays = Math.ceil(
    (new Date(request.endDate).getTime() - new Date(request.startDate).getTime()) /
      (1000 * 60 * 60 * 24)
  );
  const daysForTravel = Math.ceil(totalTravelTime / (60 * 24)); // days spent traveling
  const daysForCities = totalDays - daysForTravel;
  const nightsPerCity = Math.max(
    preferences.minNightsPerCity,
    Math.floor(daysForCities / orderedCities.length)
  );

  const suggestedNights = new Map<string, number>();
  orderedCities.forEach((city) => {
    suggestedNights.set(city.id, nightsPerCity);
  });

  return {
    optimalOrder: orderedCities,
    totalTravelTime,
    totalTravelCost: { amount: totalCost, currency: "USD" },
    suggestedNights,
    transitions,
  };
}

/**
 * Nearest neighbor TSP approximation
 */
function nearestNeighborTSP(
  distances: number[][],
  startIdx: number,
  endIdx: number,
  n: number
): number[] {
  const visited = new Set<number>();
  const path: number[] = [startIdx];
  visited.add(startIdx);

  let current = startIdx;

  while (path.length < n) {
    let nearestDist = Infinity;
    let nearestIdx = -1;

    for (let i = 0; i < n; i++) {
      if (!visited.has(i)) {
        // If we need to end at a specific city, don't visit it until last
        if (i === endIdx && path.length < n - 1) continue;

        if (distances[current][i] < nearestDist) {
          nearestDist = distances[current][i];
          nearestIdx = i;
        }
      }
    }

    if (nearestIdx >= 0) {
      path.push(nearestIdx);
      visited.add(nearestIdx);
      current = nearestIdx;
    } else {
      break;
    }
  }

  // Ensure end city is last if specified
  if (endIdx !== startIdx && !visited.has(endIdx)) {
    path.push(endIdx);
  }

  return path;
}

// ============================================
// EXPORTS
// ============================================

export {
  calculateDistance,
  formatDuration,
  getCityKey,
  createCityFromName,
  MAJOR_AIRPORTS,
  MAJOR_TRAIN_STATIONS,
};
