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
} from '@/types/trip-input';
import {
  generateTransferId,
  generateLegId,
} from '@/types/trip-input';

// ============================================
// MAIN INFERENCE FUNCTION
// ============================================

export function inferTripStructure(
  flights: FlightAnchor[],
  hotels: HotelAnchor[],
  existingTransfers: TransferAnchor[] = []
): DerivedTripStructure {
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
      // Ground transfer needed
      const transfer = inferInterCityTransfer(fromLeg, toLeg, existingTransfers);
      transfers.push(transfer);

      fromLeg.departureTransfer = transfer;
      toLeg.arrivalTransfer = transfer;
    }
  }

  // 3. Last hotel → Departure airport
  if (departureFlight && legs.length > 0 && departureFlight !== arrivalFlight) {
    const lastLeg = legs[legs.length - 1];
    const transfer = inferDepartureTransfer(lastLeg, departureFlight, existingTransfers);
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
): InferredTransfer {
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

  // Check for city mismatch
  const hasMismatch = !isCityMatch(airportCity, hotelCity);

  return {
    id: generateTransferId(),
    type: 'airport_departure',
    from,
    to,
    date: flight.date,
    earliestDeparture: '06:00', // Hotel checkout usually morning
    latestArrival: flight.time ? subtractTime(flight.time, 180) : '15:00', // 3 hours before flight
    options: hasMismatch ? [] : getTransferOptions(from, to, hotelCity),
    selected: existing,
    status: existing ? 'booked' : hasMismatch ? 'conflict' : 'suggested',
    conflict: hasMismatch
      ? `Last hotel is in ${hotelCity} but flight departs from ${flight.from} (${airportCity})`
      : undefined,
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

function inferInterCityTransfer(
  fromLeg: TripLeg,
  toLeg: TripLeg,
  existingTransfers: TransferAnchor[]
): InferredTransfer {
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

  return {
    id: generateTransferId(),
    type: isSameCity ? 'same_city' : 'inter_city',
    from,
    to,
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
// UTILITY FUNCTIONS
// ============================================

function calculateNights(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  return Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24));
}

function subtractTime(time: string, minutes: number): string {
  const [hours, mins] = time.split(':').map(Number);
  const totalMinutes = hours * 60 + mins - minutes;
  const newHours = Math.floor(totalMinutes / 60);
  const newMins = totalMinutes % 60;
  return `${String(newHours).padStart(2, '0')}:${String(newMins).padStart(2, '0')}`;
}

// City extraction from airport code (simplified - would use real data in production)
const AIRPORT_TO_CITY: Record<string, string> = {
  'NRT': 'Tokyo',
  'HND': 'Tokyo',
  'KIX': 'Osaka',
  'ITM': 'Osaka',
  'NGO': 'Nagoya',
  'FUK': 'Fukuoka',
  'CTS': 'Sapporo',
  'OKA': 'Okinawa',
  'CDG': 'Paris',
  'ORY': 'Paris',
  'LHR': 'London',
  'LGW': 'London',
  'STN': 'London',
  'JFK': 'New York',
  'EWR': 'New York',
  'LGA': 'New York',
  'LAX': 'Los Angeles',
  'SFO': 'San Francisco',
  'SEA': 'Seattle',
  'ORD': 'Chicago',
  'BOS': 'Boston',
  'MIA': 'Miami',
  'FCO': 'Rome',
  'MXP': 'Milan',
  'BCN': 'Barcelona',
  'MAD': 'Madrid',
  'AMS': 'Amsterdam',
  'FRA': 'Frankfurt',
  'MUC': 'Munich',
  'ZRH': 'Zurich',
  'VIE': 'Vienna',
  'SIN': 'Singapore',
  'HKG': 'Hong Kong',
  'ICN': 'Seoul',
  'PEK': 'Beijing',
  'PVG': 'Shanghai',
  'BKK': 'Bangkok',
  'SYD': 'Sydney',
  'MEL': 'Melbourne',
};

const AIRPORT_NAMES: Record<string, string> = {
  'NRT': 'Narita International Airport',
  'HND': 'Haneda Airport',
  'KIX': 'Kansai International Airport',
  'ITM': 'Itami Airport',
  'CDG': 'Charles de Gaulle Airport',
  'ORY': 'Orly Airport',
  'LHR': 'Heathrow Airport',
  'JFK': 'John F. Kennedy International Airport',
  'LAX': 'Los Angeles International Airport',
  'SFO': 'San Francisco International Airport',
};

function extractCityFromAirportCode(code: string): string {
  return AIRPORT_TO_CITY[code.toUpperCase()] || code;
}

function getAirportName(code: string): string {
  return AIRPORT_NAMES[code.toUpperCase()] || `${code} Airport`;
}

function isCityMatch(city1: string, city2: string): boolean {
  return city1.toLowerCase() === city2.toLowerCase();
}

// ============================================
// TRANSFER OPTIONS (would be API-driven in production)
// ============================================

function getTransferOptions(
  from: TransferEndpoint,
  to: TransferEndpoint,
  city: string
): TransferOption[] {
  // Japan-specific options
  if (['Tokyo', 'Osaka', 'Kyoto', 'Nagoya'].includes(city)) {
    if (from.type === 'airport' || to.type === 'airport') {
      return getJapanAirportTransferOptions(from, to);
    }
  }

  // Default options
  return [
    {
      id: 'taxi',
      mode: 'taxi',
      name: 'Taxi/Rideshare',
      duration: 45,
      cost: { amount: 50, currency: 'USD' },
      recommended: false,
    },
    {
      id: 'shuttle',
      mode: 'bus',
      name: 'Airport Shuttle',
      duration: 60,
      cost: { amount: 15, currency: 'USD' },
      recommended: true,
    },
  ];
}

function getJapanAirportTransferOptions(
  from: TransferEndpoint,
  to: TransferEndpoint
): TransferOption[] {
  const isNarita = from.code === 'NRT' || to.code === 'NRT';
  const isHaneda = from.code === 'HND' || to.code === 'HND';
  const isKansai = from.code === 'KIX' || to.code === 'KIX';

  if (isNarita) {
    return [
      {
        id: 'nex',
        mode: 'train',
        name: 'Narita Express (N\'EX)',
        duration: 60,
        cost: { amount: 3250, currency: 'JPY' },
        frequency: 'Every 30-60 min',
        recommended: true,
        bookingUrl: 'https://www.jreast.co.jp/e/nex/',
      },
      {
        id: 'limousine',
        mode: 'bus',
        name: 'Airport Limousine Bus',
        duration: 85,
        cost: { amount: 3200, currency: 'JPY' },
        frequency: 'Every 20 min',
        bookingUrl: 'https://www.limousinebus.co.jp/en/',
      },
      {
        id: 'skyliner',
        mode: 'train',
        name: 'Keisei Skyliner',
        duration: 45,
        cost: { amount: 2520, currency: 'JPY' },
        frequency: 'Every 20-40 min',
        notes: 'To Ueno/Nippori stations',
      },
      {
        id: 'private',
        mode: 'private_car',
        name: 'Private Transfer',
        duration: 90,
        cost: { amount: 25000, currency: 'JPY' },
        notes: 'Door-to-door service',
      },
    ];
  }

  if (isHaneda) {
    return [
      {
        id: 'monorail',
        mode: 'train',
        name: 'Tokyo Monorail',
        duration: 25,
        cost: { amount: 500, currency: 'JPY' },
        frequency: 'Every 4 min',
        recommended: true,
      },
      {
        id: 'keikyu',
        mode: 'train',
        name: 'Keikyu Line',
        duration: 20,
        cost: { amount: 300, currency: 'JPY' },
        frequency: 'Every 10 min',
      },
      {
        id: 'limousine',
        mode: 'bus',
        name: 'Airport Limousine Bus',
        duration: 45,
        cost: { amount: 1300, currency: 'JPY' },
      },
    ];
  }

  if (isKansai) {
    return [
      {
        id: 'haruka',
        mode: 'train',
        name: 'Haruka Express',
        duration: 75,
        cost: { amount: 2900, currency: 'JPY' },
        frequency: 'Every 30 min',
        recommended: true,
        notes: 'Direct to Kyoto',
      },
      {
        id: 'nankai',
        mode: 'train',
        name: 'Nankai Rapi:t',
        duration: 40,
        cost: { amount: 1450, currency: 'JPY' },
        frequency: 'Every 30 min',
        notes: 'To Namba (Osaka)',
      },
      {
        id: 'limousine',
        mode: 'bus',
        name: 'Airport Limousine Bus',
        duration: 60,
        cost: { amount: 1600, currency: 'JPY' },
      },
    ];
  }

  return [];
}

function getSameCityTransferOptions(
  from: TransferEndpoint,
  to: TransferEndpoint
): TransferOption[] {
  return [
    {
      id: 'taxi',
      mode: 'taxi',
      name: 'Taxi',
      duration: 20,
      cost: { amount: 2000, currency: 'JPY' },
      recommended: true,
    },
    {
      id: 'subway',
      mode: 'subway',
      name: 'Subway/Metro',
      duration: 30,
      cost: { amount: 300, currency: 'JPY' },
    },
  ];
}

function getInterCityTransferOptions(
  fromCity: string,
  toCity: string
): TransferOption[] {
  // Japan intercity
  const japanCities = ['Tokyo', 'Osaka', 'Kyoto', 'Nagoya', 'Hiroshima', 'Fukuoka'];
  if (japanCities.includes(fromCity) && japanCities.includes(toCity)) {
    return [
      {
        id: 'shinkansen',
        mode: 'shinkansen',
        name: 'Shinkansen (Bullet Train)',
        duration: getShinkansenDuration(fromCity, toCity),
        cost: { amount: getShinkansenPrice(fromCity, toCity), currency: 'JPY' },
        recommended: true,
        bookingUrl: 'https://www.jrailpass.com/',
      },
      {
        id: 'highway-bus',
        mode: 'bus',
        name: 'Highway Bus',
        duration: getShinkansenDuration(fromCity, toCity) * 3,
        cost: { amount: Math.round(getShinkansenPrice(fromCity, toCity) * 0.3), currency: 'JPY' },
        notes: 'Budget option, overnight available',
      },
    ];
  }

  // Default options
  return [
    {
      id: 'train',
      mode: 'train',
      name: 'Train',
      duration: 180,
      recommended: true,
    },
    {
      id: 'bus',
      mode: 'bus',
      name: 'Bus',
      duration: 300,
    },
    {
      id: 'rental',
      mode: 'rental_car',
      name: 'Rental Car',
      duration: 240,
      notes: 'Self-drive option',
    },
  ];
}

function getShinkansenDuration(from: string, to: string): number {
  const routes: Record<string, number> = {
    'Tokyo-Osaka': 135,
    'Tokyo-Kyoto': 135,
    'Tokyo-Nagoya': 100,
    'Tokyo-Hiroshima': 240,
    'Tokyo-Fukuoka': 300,
    'Osaka-Kyoto': 15,
    'Osaka-Hiroshima': 90,
    'Kyoto-Hiroshima': 100,
  };

  const key = [from, to].sort().join('-');
  return routes[key] || 180;
}

function getShinkansenPrice(from: string, to: string): number {
  const routes: Record<string, number> = {
    'Tokyo-Osaka': 13870,
    'Tokyo-Kyoto': 13320,
    'Tokyo-Nagoya': 10560,
    'Tokyo-Hiroshima': 18380,
    'Tokyo-Fukuoka': 22220,
    'Osaka-Kyoto': 560,
    'Osaka-Hiroshima': 10240,
    'Kyoto-Hiroshima': 10890,
  };

  const key = [from, to].sort().join('-');
  return routes[key] || 10000;
}
