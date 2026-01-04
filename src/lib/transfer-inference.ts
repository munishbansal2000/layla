// ============================================
// TRANSFER INFERENCE ENGINE
// ============================================
// Infers required transfers from flights and hotels anchors
// Detects conflicts and suggests transfer options

import type {
  FlightAnchor,
  HotelAnchor,
  InferredTransfer,
  TransferEndpoint,
  TransferOption,
  TripLeg,
  DerivedTripStructure,
  TripValidationError,
  TripValidationWarning,
  TransferAnchor,
  TransferMode,
} from '@/types/trip-input';
import {
  generateTransferId,
  generateLegId,
} from '@/types/trip-input';
import { searchNominatim } from './openstreetmap';

// Cache for station lookups to avoid repeated API calls
const stationCache = new Map<string, { name: string; coordinates: { lat: number; lng: number } } | null>();

// ============================================
// OPENSTREETMAP STATION LOOKUP
// ============================================

/**
 * Find the main train station for a city using OpenStreetMap/Nominatim
 */
async function findMainStation(city: string): Promise<{ name: string; coordinates: { lat: number; lng: number } } | null> {
  // Check cache first
  const cacheKey = city.toLowerCase();
  if (stationCache.has(cacheKey)) {
    console.log(`[TransferInference] Cache hit for ${city}`);
    return stationCache.get(cacheKey) || null;
  }

  // Try multiple query formats - include "railway" and city name for better results
  const queries = [
    `${city} railway station`,   // Most specific - "Tokyo railway station"
    `${city} Station railway`,   // Alternative - helps filter non-railway results
    `${city} central station`,   // Works for European cities
  ];

  for (const query of queries) {
    try {
      console.log(`[TransferInference] Query: "${query}"`);
      const results = await searchNominatim({
        q: query,
        limit: 10,  // Get more results to filter
      });

      console.log(`[TransferInference] Got ${results.length} results`);

      // Log all results for debugging
      results.forEach((r, i) => {
        const resultCity = r.address?.city || r.address?.town || r.address?.county || 'N/A';
        console.log(`[TransferInference]   [${i}] type=${r.type} class=${r.class} city=${resultCity} display=${r.display_name.substring(0, 60)}`);
      });

      // Look for railway station results
      // Since we search with city name in query (e.g., "Tokyo railway station"),
      // the first railway station result should be correct
      const stationResult = results.find(r => {
        // Must be a railway-related type
        const isRailway =
          r.type === 'station' ||
          r.type === 'railway' ||
          r.type === 'train_station' ||
          r.class === 'railway' ||
          (r.extratags && r.extratags.train === 'yes');

        console.log(`[TransferInference]   Checking: type=${r.type} class=${r.class} isRailway=${isRailway} (${r.display_name.substring(0, 40)})`);

        return isRailway;
      });

      if (stationResult) {
        const station = {
          name: stationResult.namedetails?.['name:en'] ||
                stationResult.namedetails?.name ||
                stationResult.display_name.split(',')[0],
          coordinates: {
            lat: parseFloat(stationResult.lat),
            lng: parseFloat(stationResult.lon),
          },
        };
        stationCache.set(cacheKey, station);
        console.log(`[TransferInference] ✅ Found station for ${city}: ${station.name} at ${station.coordinates.lat}, ${station.coordinates.lng}`);
        return station;
      }
    } catch (error) {
      console.warn(`[TransferInference] Query "${query}" failed:`, error);
    }
  }

  // Fallback: just use city name + "Station"
  console.log(`[TransferInference] ❌ No station found for ${city}, using fallback`);
  stationCache.set(cacheKey, null);
  return null;
}

/**
 * Find airport by code using OpenStreetMap/Nominatim
 */
async function findAirport(airportCode: string): Promise<{ name: string; coordinates: { lat: number; lng: number } } | null> {
  const cacheKey = `airport-${airportCode.toUpperCase()}`;
  if (stationCache.has(cacheKey)) {
    return stationCache.get(cacheKey) || null;
  }

  try {
    const results = await searchNominatim({
      q: `${airportCode} airport`,
      limit: 3,
    });

    const airportResult = results.find(r =>
      r.type === 'aerodrome' ||
      r.class === 'aeroway' ||
      r.display_name.toLowerCase().includes('airport') ||
      r.display_name.toLowerCase().includes('空港')
    ) || results[0];

    if (airportResult) {
      const airport = {
        name: airportResult.namedetails?.['name:en'] ||
              airportResult.namedetails?.name ||
              airportResult.display_name.split(',')[0],
        coordinates: {
          lat: parseFloat(airportResult.lat),
          lng: parseFloat(airportResult.lon),
        },
      };
      stationCache.set(cacheKey, airport);
      console.log(`[TransferInference] Found airport ${airportCode}: ${airport.name}`);
      return airport;
    }
  } catch (error) {
    console.warn(`[TransferInference] Failed to find airport ${airportCode}:`, error);
  }

  stationCache.set(cacheKey, null);
  return null;
}

// ============================================
// MAIN INFERENCE FUNCTION
// ============================================

export async function inferTripStructure(
  flights: FlightAnchor[],
  hotels: HotelAnchor[],
  existingTransfers: TransferAnchor[] = []
): Promise<DerivedTripStructure> {
  const errors: TripValidationError[] = [];
  const warnings: TripValidationWarning[] = [];

  // Sort hotels by check-in date
  const sortedHotels = [...hotels].sort((a, b) =>
    a.checkIn.localeCompare(b.checkIn)
  );

  // Sort flights by date
  const sortedFlights = [...flights].sort((a, b) =>
    a.date.localeCompare(b.date)
  );

  // Identify arrival and departure flights
  const arrivalFlight = sortedFlights.length > 0 ? sortedFlights[0] : undefined;
  const departureFlight = sortedFlights.length > 0 ? sortedFlights[sortedFlights.length - 1] : undefined;
  const midTripFlights = sortedFlights.slice(1, -1);

  // Build trip legs from hotels
  const legs: TripLeg[] = sortedHotels.map((hotel, index) => {
    const nights = calculateNights(hotel.checkIn, hotel.checkOut);

    return {
      id: generateLegId(),
      city: hotel.city,
      startDate: hotel.checkIn,
      endDate: hotel.checkOut,
      nights,
      hotel,
      hasConflict: false,
    };
  });

  // If no hotels but we have flights, create legs from flights
  if (legs.length === 0 && sortedFlights.length >= 2) {
    const legCity = extractCityFromAirportCode(arrivalFlight!.to);
    legs.push({
      id: generateLegId(),
      city: legCity,
      startDate: arrivalFlight!.date,
      endDate: departureFlight!.date,
      nights: calculateNights(arrivalFlight!.date, departureFlight!.date),
      hasConflict: false,
    });
  }

  // Infer transfers
  const transfers: InferredTransfer[] = [];

  // 1. Airport arrival → First hotel
  if (arrivalFlight && legs.length > 0) {
    const firstLeg = legs[0];
    const transfer = inferArrivalTransfer(arrivalFlight, firstLeg, existingTransfers);
    transfers.push(transfer);
    firstLeg.arrivalFlight = arrivalFlight;
    firstLeg.arrivalTransfer = transfer;

    // Check for conflicts
    if (transfer.status === 'conflict') {
      errors.push({
        type: 'mismatch',
        message: transfer.conflict || 'Airport location mismatch',
        legId: firstLeg.id,
        transferId: transfer.id,
      });
      firstLeg.hasConflict = true;
      firstLeg.conflictMessage = transfer.conflict;
    }
  }

  // 2. Inter-city/hotel transfers
  for (let i = 0; i < legs.length - 1; i++) {
    const fromLeg = legs[i];
    const toLeg = legs[i + 1];

    // Check for gap in dates
    if (fromLeg.endDate !== toLeg.startDate) {
      const gapDays = calculateNights(fromLeg.endDate, toLeg.startDate);
      if (gapDays > 0) {
        warnings.push({
          type: 'long_transfer',
          message: `${gapDays} day gap between ${fromLeg.city} checkout and ${toLeg.city} check-in`,
          legId: fromLeg.id,
        });
      } else if (gapDays < 0) {
        errors.push({
          type: 'overlap',
          message: `Hotels in ${fromLeg.city} and ${toLeg.city} have overlapping dates`,
          legId: fromLeg.id,
        });
        fromLeg.hasConflict = true;
      }
    }

    // Check if there's a mid-trip flight for this segment
    const connectingFlight = midTripFlights.find(f =>
      f.date === fromLeg.endDate &&
      isCityMatch(extractCityFromAirportCode(f.from), fromLeg.city)
    );

    if (connectingFlight) {
      // Flight covers this - add airport transfers on both ends
      const toAirportTransfer = inferToAirportTransfer(fromLeg, connectingFlight, existingTransfers);
      const fromAirportTransfer = inferFromAirportTransfer(connectingFlight, toLeg, existingTransfers);

      transfers.push(toAirportTransfer);
      transfers.push(fromAirportTransfer);

      fromLeg.departureFlight = connectingFlight;
      fromLeg.departureTransfer = toAirportTransfer;
      toLeg.arrivalFlight = connectingFlight;
      toLeg.arrivalTransfer = fromAirportTransfer;
    } else {
      // Ground transfer needed - use async lookup for stations
      const transfer = await inferInterCityTransfer(fromLeg, toLeg, existingTransfers);
      transfers.push(transfer);

      fromLeg.departureTransfer = transfer;
      toLeg.arrivalTransfer = transfer;
    }
  }

  // 3. Last hotel → Departure airport
  if (departureFlight && legs.length > 0 && departureFlight !== arrivalFlight) {
    const lastLeg = legs[legs.length - 1];
    const transfer = inferDepartureTransfer(lastLeg, departureFlight, existingTransfers);

    // Handle array of transfers (when inter-city + airport transfer needed)
    if (Array.isArray(transfer)) {
      transfers.push(...transfer);
      lastLeg.departureFlight = departureFlight;
      lastLeg.departureTransfer = transfer[0]; // Inter-city transfer first

      // Add warning about needing inter-city transfer
      if (transfer[0].warning) {
        warnings.push({
          type: 'long_transfer',
          message: transfer[0].warning,
          legId: lastLeg.id,
        });
      }
    } else {
      transfers.push(transfer);
      lastLeg.departureFlight = departureFlight;
      lastLeg.departureTransfer = transfer;

      // Check for conflicts
      if (transfer.status === 'conflict') {
        errors.push({
          type: 'mismatch',
          message: transfer.conflict || 'Airport location mismatch',
          legId: lastLeg.id,
          transferId: transfer.id,
        });
        lastLeg.hasConflict = true;
        lastLeg.conflictMessage = transfer.conflict;
      }
    }
  }

  // Derive trip dates
  const startDate = legs.length > 0
    ? legs[0].startDate
    : arrivalFlight?.date || '';
  const endDate = legs.length > 0
    ? legs[legs.length - 1].endDate
    : departureFlight?.date || '';

  const totalNights = startDate && endDate
    ? calculateNights(startDate, endDate)
    : 0;

  const cities = [...new Set(legs.map(l => l.city))];

  return {
    startDate,
    endDate,
    totalNights,
    cities,
    legs,
    transfers,
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================
// TRANSFER INFERENCE HELPERS
// ============================================

function inferArrivalTransfer(
  flight: FlightAnchor,
  firstLeg: TripLeg,
  existingTransfers: TransferAnchor[]
): InferredTransfer {
  const airportCity = extractCityFromAirportCode(flight.to);
  const hotelCity = firstLeg.city;

  // Check for existing booked transfer
  const existing = existingTransfers.find(t =>
    t.from.type === 'airport' &&
    t.date === flight.date
  );

  const from: TransferEndpoint = {
    type: 'airport',
    code: flight.to,
    city: airportCity,
    name: getAirportName(flight.to),
  };

  const to: TransferEndpoint = {
    type: 'hotel',
    name: firstLeg.hotel?.name,
    city: hotelCity,
    coordinates: firstLeg.hotel?.coordinates,
  };

  // Check for city mismatch
  const hasMismatch = !isCityMatch(airportCity, hotelCity);

  return {
    id: generateTransferId(),
    type: 'airport_arrival',
    from,
    to,
    date: flight.date,
    earliestDeparture: flight.time,
    latestArrival: '23:59', // Hotel check-in usually flexible
    options: hasMismatch ? [] : getTransferOptions(from, to, hotelCity),
    selected: existing,
    status: existing ? 'booked' : hasMismatch ? 'conflict' : 'suggested',
    conflict: hasMismatch
      ? `Flight arrives at ${flight.to} (${airportCity}) but first hotel is in ${hotelCity}`
      : undefined,
  };
}

function inferDepartureTransfer(
  lastLeg: TripLeg,
  flight: FlightAnchor,
  existingTransfers: TransferAnchor[]
): InferredTransfer | InferredTransfer[] {
  const airportCity = extractCityFromAirportCode(flight.from);
  const hotelCity = lastLeg.city;

  // Check for existing booked transfer
  const existing = existingTransfers.find(t =>
    t.to.type === 'airport' &&
    t.date === flight.date
  );

  const from: TransferEndpoint = {
    type: 'hotel',
    name: lastLeg.hotel?.name,
    city: hotelCity,
    coordinates: lastLeg.hotel?.coordinates,
  };

  const to: TransferEndpoint = {
    type: 'airport',
    code: flight.from,
    city: airportCity,
    name: getAirportName(flight.from),
  };

  // Check for city mismatch - this is NOT a conflict, just requires inter-city transfer
  const hasMismatch = !isCityMatch(airportCity, hotelCity);

  if (hasMismatch) {
    // Need TWO transfers: inter-city (hotel → departure city) + airport (city → airport)
    const interCityTransfer: InferredTransfer = {
      id: generateTransferId(),
      type: 'inter_city',
      from,
      to: {
        type: 'city',
        city: airportCity,
        name: `${airportCity} area`,
      },
      date: flight.date,
      earliestDeparture: '06:00', // Early morning to catch flight
      latestArrival: flight.time ? subtractTime(flight.time, 240) : '12:00', // 4 hours before flight
      options: getInterCityTransferOptions(hotelCity, airportCity),
      status: 'needs_input',
      warning: `Need to travel from ${hotelCity} to ${airportCity} for departure flight`,
    };

    const airportTransfer: InferredTransfer = {
      id: generateTransferId(),
      type: 'airport_departure',
      from: {
        type: 'city',
        city: airportCity,
        name: `${airportCity} station`,
      },
      to,
      date: flight.date,
      earliestDeparture: flight.time ? subtractTime(flight.time, 180) : '09:00',
      latestArrival: flight.time ? subtractTime(flight.time, 120) : '15:00', // 2 hours before flight
      options: getTransferOptions({ type: 'city', city: airportCity }, to, airportCity),
      selected: existing,
      status: existing ? 'booked' : 'suggested',
    };

    return [interCityTransfer, airportTransfer];
  }

  // Same city - single airport transfer
  return {
    id: generateTransferId(),
    type: 'airport_departure',
    from,
    to,
    date: flight.date,
    earliestDeparture: '06:00', // Hotel checkout usually morning
    latestArrival: flight.time ? subtractTime(flight.time, 180) : '15:00', // 3 hours before flight
    options: getTransferOptions(from, to, hotelCity),
    selected: existing,
    status: existing ? 'booked' : 'suggested',
    warning: !hasMismatch && flight.time
      ? `Flight departs at ${flight.time}. Plan to leave hotel by ${subtractTime(flight.time, 180)}`
      : undefined,
  };
}

function inferToAirportTransfer(
  fromLeg: TripLeg,
  flight: FlightAnchor,
  existingTransfers: TransferAnchor[]
): InferredTransfer {
  const from: TransferEndpoint = {
    type: 'hotel',
    name: fromLeg.hotel?.name,
    city: fromLeg.city,
    coordinates: fromLeg.hotel?.coordinates,
  };

  const to: TransferEndpoint = {
    type: 'airport',
    code: flight.from,
    city: extractCityFromAirportCode(flight.from),
    name: getAirportName(flight.from),
  };

  const existing = existingTransfers.find(t =>
    t.to.type === 'airport' &&
    t.to.code === flight.from &&
    t.date === flight.date
  );

  return {
    id: generateTransferId(),
    type: 'mid_trip_flight',
    from,
    to,
    date: flight.date,
    earliestDeparture: '06:00',
    latestArrival: flight.time ? subtractTime(flight.time, 120) : undefined,
    options: getTransferOptions(from, to, fromLeg.city),
    selected: existing,
    status: existing ? 'booked' : 'suggested',
  };
}

function inferFromAirportTransfer(
  flight: FlightAnchor,
  toLeg: TripLeg,
  existingTransfers: TransferAnchor[]
): InferredTransfer {
  const from: TransferEndpoint = {
    type: 'airport',
    code: flight.to,
    city: extractCityFromAirportCode(flight.to),
    name: getAirportName(flight.to),
  };

  const to: TransferEndpoint = {
    type: 'hotel',
    name: toLeg.hotel?.name,
    city: toLeg.city,
    coordinates: toLeg.hotel?.coordinates,
  };

  const existing = existingTransfers.find(t =>
    t.from.type === 'airport' &&
    t.from.code === flight.to &&
    t.date === flight.date
  );

  return {
    id: generateTransferId(),
    type: 'mid_trip_flight',
    from,
    to,
    date: flight.date,
    earliestDeparture: flight.time,
    options: getTransferOptions(from, to, toLeg.city),
    selected: existing,
    status: existing ? 'booked' : 'suggested',
  };
}

async function inferInterCityTransfer(
  fromLeg: TripLeg,
  toLeg: TripLeg,
  existingTransfers: TransferAnchor[]
): Promise<InferredTransfer> {
  const isSameCity = isCityMatch(fromLeg.city, toLeg.city);

  const from: TransferEndpoint = {
    type: 'hotel',
    name: fromLeg.hotel?.name,
    city: fromLeg.city,
    coordinates: fromLeg.hotel?.coordinates,
  };

  const to: TransferEndpoint = {
    type: 'hotel',
    name: toLeg.hotel?.name,
    city: toLeg.city,
    coordinates: toLeg.hotel?.coordinates,
  };

  const existing = existingTransfers.find(t =>
    t.from.city === fromLeg.city &&
    t.to.city === toLeg.city &&
    t.date === fromLeg.endDate
  );

  // For inter-city transfers, look up stations from OpenStreetMap
  let via = undefined;
  if (!isSameCity) {
    // Look up stations in parallel
    const [departureStation, arrivalStation] = await Promise.all([
      findMainStation(fromLeg.city),
      findMainStation(toLeg.city),
    ]);

    via = {
      departure: {
        type: 'station' as const,
        name: departureStation?.name || `${fromLeg.city} Station`,
        city: fromLeg.city,
        coordinates: departureStation?.coordinates,
      },
      arrival: {
        type: 'station' as const,
        name: arrivalStation?.name || `${toLeg.city} Station`,
        city: toLeg.city,
        coordinates: arrivalStation?.coordinates,
      },
      mode: getInterCityTransportMode(fromLeg.city, toLeg.city),
    };
  }

  return {
    id: generateTransferId(),
    type: isSameCity ? 'same_city' : 'inter_city',
    from,
    to,
    via,
    date: fromLeg.endDate,
    earliestDeparture: '10:00', // After checkout
    latestArrival: '15:00', // Before check-in
    options: isSameCity
      ? getSameCityTransferOptions(from, to)
      : getInterCityTransferOptions(fromLeg.city, toLeg.city),
    selected: existing,
    status: existing ? 'booked' : 'needs_input',
  };
}

// ============================================
// STATION/TRANSPORT HELPERS
// ============================================
// Note: Station lookups are now done dynamically via OpenStreetMap/Nominatim
// using the findMainStation() and findAirport() async functions defined above

// Cache for city country lookups
const cityCountryCache = new Map<string, string | null>();

/**
 * Look up what country a city is in using OpenStreetMap
 */
async function getCityCountry(city: string): Promise<string | null> {
  const cacheKey = city.toLowerCase();
  if (cityCountryCache.has(cacheKey)) {
    return cityCountryCache.get(cacheKey) || null;
  }

  try {
    const results = await searchNominatim({
      q: city,
      limit: 1,
      addressdetails: 1,
    });

    if (results[0]?.address?.country) {
      const country = results[0].address.country;
      cityCountryCache.set(cacheKey, country);
      console.log(`[TransferInference] ${city} is in ${country}`);
      return country;
    }
  } catch (error) {
    console.warn(`[TransferInference] Failed to lookup country for ${city}:`, error);
  }

  cityCountryCache.set(cacheKey, null);
  return null;
}

/**
 * Get the appropriate inter-city transport mode by looking up countries
 */
async function getInterCityTransportModeAsync(fromCity: string, toCity: string): Promise<TransferMode> {
  // Look up countries in parallel
  const [fromCountry, toCountry] = await Promise.all([
    getCityCountry(fromCity),
    getCityCountry(toCity),
  ]);

  // Japan - use Shinkansen
  if (fromCountry === 'Japan' && toCountry === 'Japan') {
    return 'shinkansen';
  }

  // China - high speed rail
  if (fromCountry === 'China' && toCountry === 'China') {
    return 'train';
  }

  // European countries with high-speed rail
  const hsrCountries = ['France', 'Germany', 'Spain', 'Italy', 'United Kingdom', 'Belgium', 'Netherlands', 'Switzerland', 'Austria'];
  if (fromCountry && toCountry && hsrCountries.includes(fromCountry) && hsrCountries.includes(toCountry)) {
    return 'train';
  }

  // Default to train
  return 'train';
}

// Synchronous fallback (uses cached country data if available)
function getInterCityTransportMode(fromCity: string, toCity: string): TransferMode {
  const fromCountry = cityCountryCache.get(fromCity.toLowerCase());
  const toCountry = cityCountryCache.get(toCity.toLowerCase());

  if (fromCountry === 'Japan' && toCountry === 'Japan') {
    return 'shinkansen';
  }

  return 'train';
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Parse a date string in "YYYY-MM-DD" format as LOCAL time.
 * Using `new Date("2026-03-15")` interprets as UTC midnight,
 * which causes date shift in timezones behind UTC.
 */
function parseDateLocal(dateStr: string): Date {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // month is 0-indexed
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day, 0, 0, 0, 0);
  }
  // Fallback (may have timezone issues)
  return new Date(dateStr);
}

function calculateNights(startDate: string, endDate: string): number {
  const start = parseDateLocal(startDate);
  const end = parseDateLocal(endDate);
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function subtractTime(time: string, minutes: number): string {
  const [hours, mins] = time.split(':').map(Number);
  const totalMinutes = hours * 60 + mins - minutes;
  const newHours = Math.floor(totalMinutes / 60);
  const newMins = totalMinutes % 60;
  return `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`;
}

// ============================================
// AIRPORT LOOKUP (OpenStreetMap + Cache)
// ============================================

// Cache for airport lookups - populated by async functions
const airportCache = new Map<string, { city: string; name: string; coordinates?: { lat: number; lng: number } }>();

/**
 * Look up airport info from OpenStreetMap
 */
async function lookupAirport(code: string): Promise<{ city: string; name: string; coordinates?: { lat: number; lng: number } }> {
  const upperCode = code.toUpperCase();

  // Check cache first
  if (airportCache.has(upperCode)) {
    return airportCache.get(upperCode)!;
  }

  try {
    const results = await searchNominatim({
      q: `${upperCode} international airport`,
      limit: 5,
    });

    const airportResult = results.find(r =>
      r.type === 'aerodrome' ||
      r.class === 'aeroway' ||
      r.display_name.toLowerCase().includes('airport') ||
      r.display_name.toLowerCase().includes('空港')
    ) || results[0];

    if (airportResult) {
      const info = {
        city: airportResult.address?.city ||
              airportResult.address?.town ||
              airportResult.address?.county ||
              upperCode,
        name: airportResult.namedetails?.['name:en'] ||
              airportResult.namedetails?.name ||
              airportResult.display_name.split(',')[0],
        coordinates: {
          lat: parseFloat(airportResult.lat),
          lng: parseFloat(airportResult.lon),
        },
      };
      airportCache.set(upperCode, info);
      console.log(`[TransferInference] Looked up airport ${upperCode}: ${info.name} in ${info.city}`);
      return info;
    }
  } catch (error) {
    console.warn(`[TransferInference] Failed to lookup airport ${upperCode}:`, error);
  }

  // Fallback - cache it to avoid repeated failed lookups
  const fallback = { city: upperCode, name: `${upperCode} Airport` };
  airportCache.set(upperCode, fallback);
  return fallback;
}

// Synchronous versions that use cache (call async version first to populate)
function extractCityFromAirportCode(code: string): string {
  const cached = airportCache.get(code.toUpperCase());
  return cached?.city || code;
}

function getAirportName(code: string): string {
  const cached = airportCache.get(code.toUpperCase());
  return cached?.name || `${code} Airport`;
}

function isCityMatch(city1: string, city2: string): boolean {
  return city1.toLowerCase() === city2.toLowerCase();
}

// ============================================
// TRANSFER OPTIONS (Dynamic - no hardcoded durations)
// ============================================

// Transport modes that are generally available
const TRANSPORT_MODES = {
  airport: ['train', 'bus', 'taxi', 'private_car'] as const,
  city: ['taxi', 'subway', 'bus', 'walk'] as const,
  intercity: ['train', 'bus', 'rental_car'] as const,
};

/**
 * Get transfer options - returns mode types only
 * Durations are calculated separately by routing service
 */
function getTransferOptions(
  from: TransferEndpoint,
  to: TransferEndpoint,
  _city: string
): TransferOption[] {
  if (from.type === 'airport' || to.type === 'airport') {
    return TRANSPORT_MODES.airport.map(mode => ({
      id: mode,
      mode: mode,
      name: getModeName(mode),
      recommended: mode === 'train',
    }));
  }

  return TRANSPORT_MODES.city.map(mode => ({
    id: mode,
    mode: mode,
    name: getModeName(mode),
    recommended: mode === 'taxi',
  }));
}

function getSameCityTransferOptions(
  _from: TransferEndpoint,
  _to: TransferEndpoint
): TransferOption[] {
  return TRANSPORT_MODES.city.map(mode => ({
    id: mode,
    mode: mode,
    name: getModeName(mode),
    recommended: mode === 'taxi',
  }));
}

function getInterCityTransferOptions(
  _fromCity: string,
  _toCity: string
): TransferOption[] {
  return TRANSPORT_MODES.intercity.map(mode => ({
    id: mode,
    mode: mode,
    name: getModeName(mode),
    recommended: mode === 'train',
  }));
}

/**
 * Get human-readable name for transport mode
 */
function getModeName(mode: string): string {
  const names: Record<string, string> = {
    train: 'Train',
    bus: 'Bus',
    taxi: 'Taxi/Rideshare',
    private_car: 'Private Transfer',
    subway: 'Subway/Metro',
    walk: 'Walk',
    rental_car: 'Rental Car',
    shinkansen: 'High-Speed Rail',
  };
  return names[mode] || mode;
}

// ============================================
// TRAVEL TIME ESTIMATION (via distance calculation)
// ============================================

/**
 * Estimate travel time between cities using OpenStreetMap geocoding and distance
 */
async function estimateTravelTime(fromCity: string, toCity: string, mode: string): Promise<number> {
  try {
    // Get coordinates for both cities
    const [fromResults, toResults] = await Promise.all([
      searchNominatim({ q: fromCity, limit: 1 }),
      searchNominatim({ q: toCity, limit: 1 }),
    ]);

    if (fromResults[0] && toResults[0]) {
      const fromLat = parseFloat(fromResults[0].lat);
      const fromLng = parseFloat(fromResults[0].lon);
      const toLat = parseFloat(toResults[0].lat);
      const toLng = parseFloat(toResults[0].lon);

      // Calculate distance using Haversine formula
      const distance = haversineDistance(fromLat, fromLng, toLat, toLng);

      // Estimate time based on mode
      const speeds: Record<string, number> = {
        shinkansen: 250, // km/h average
        train: 150,
        bus: 80,
        car: 100,
      };

      const speed = speeds[mode] || 100;
      const timeHours = distance / speed;
      const timeMinutes = Math.round(timeHours * 60);

      // Add buffer for boarding, stops, etc.
      const buffer = mode === 'shinkansen' ? 15 : mode === 'train' ? 30 : 45;

      return timeMinutes + buffer;
    }
  } catch (error) {
    console.warn(`[TransferInference] Failed to estimate travel time:`, error);
  }

  // Fallback estimates
  const fallbacks: Record<string, number> = {
    shinkansen: 120,
    train: 180,
    bus: 300,
    car: 240,
  };

  return fallbacks[mode] || 180;
}

/**
 * Calculate distance between two coordinates using Haversine formula
 */
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371; // Earth's radius in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
