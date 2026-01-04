// ============================================
// TRIP INPUT TYPES
// ============================================
// Types for the trip planning input system with flights and hotels as anchors
// Supports multi-stop itineraries with inferred transfers

// ============================================
// CORE INPUT TYPES
// ============================================

export type BudgetTier = 'budget' | 'moderate' | 'luxury' | 'ultra';

export interface TravelerInfo {
  adults: number;
  children?: { age: number }[];
  infants?: number;
}

export interface TripInput {
  // Natural language prompt describing the trip
  prompt: string;

  // Budget preference
  budgetTier: BudgetTier;

  // Traveler composition
  travelers: TravelerInfo;

  // User's existing bookings (anchors)
  flights: FlightAnchor[];
  hotels: HotelAnchor[];
  activities: ActivityAnchor[];  // Booked tours, reservations, shows, etc.

  // User can also pre-fill transfers they've booked
  transfers: TransferAnchor[];

  // Optional interests parsed from prompt or explicitly set
  interests?: string[];

  // Must-haves and deal-breakers (unbooked wishes)
  mustHave?: string[];
  mustAvoid?: string[];
}

// ============================================
// FLIGHT ANCHOR
// ============================================

export interface FlightAnchor {
  id: string;
  from: string;              // Airport code (e.g., "SFO") or city name
  to: string;                // Airport code (e.g., "NRT") or city name
  date: string;              // ISO date (YYYY-MM-DD)
  time?: string;             // Local time (HH:mm) - arrival for inbound, departure for outbound
  flightNumber?: string;     // Optional flight number (e.g., "JL 001")
  airline?: string;          // Optional airline name
  confirmationNumber?: string;
}

// ============================================
// HOTEL ANCHOR
// ============================================

export interface HotelAnchor {
  id: string;
  city: string;
  checkIn: string;           // ISO date (YYYY-MM-DD)
  checkOut: string;          // ISO date (YYYY-MM-DD)
  name?: string;             // Hotel name
  address?: string;          // Street address
  coordinates?: {
    lat: number;
    lng: number;
  };
  confirmationNumber?: string;
  roomType?: string;
}

// ============================================
// ACTIVITY ANCHOR (Booked tours, reservations, shows)
// ============================================

export type ActivityAnchorCategory =
  | 'tour'              // Guided tour, walking tour, day trip
  | 'experience'        // teamLab, cooking class, workshop
  | 'show'              // Theater, concert, cabaret
  | 'restaurant'        // Restaurant reservation
  | 'attraction'        // Theme park, museum with timed entry
  | 'transport'         // Booked train (e.g., Shinkansen with seat)
  | 'other';

export interface ActivityAnchor {
  id: string;
  name: string;                    // e.g., "teamLab Planets", "Sukiyabashi Jiro"
  category: ActivityAnchorCategory;
  city: string;                    // City where activity takes place
  date: string;                    // ISO date (YYYY-MM-DD)
  startTime?: string;              // HH:mm - when activity starts
  endTime?: string;                // HH:mm - when activity ends (optional, can be estimated)
  duration?: number;               // Duration in minutes (if endTime not specified)
  address?: string;                // Venue address
  coordinates?: {
    lat: number;
    lng: number;
  };
  confirmationNumber?: string;
  bookingUrl?: string;             // Link to booking confirmation
  notes?: string;                  // Any special notes (e.g., "arrive 30 min early")
  isFlexible?: boolean;            // If true, time can be adjusted slightly
}

// ============================================
// TRANSFER TYPES
// ============================================

export type TransferMode =
  | 'train'
  | 'shinkansen'
  | 'bus'
  | 'flight'
  | 'taxi'
  | 'private_car'
  | 'ferry'
  | 'subway'
  | 'walk'
  | 'rental_car';

export interface TransferAnchor {
  id: string;
  mode: TransferMode;
  from: TransferEndpoint;
  to: TransferEndpoint;
  date: string;              // ISO date
  departureTime?: string;    // HH:mm
  arrivalTime?: string;      // HH:mm
  name?: string;             // e.g., "Narita Express", "Shinkansen Nozomi"
  confirmationNumber?: string;
  notes?: string;
}

export interface TransferEndpoint {
  type: 'airport' | 'hotel' | 'station' | 'port' | 'city' | 'other';
  code?: string;             // Airport/station code
  name?: string;             // Location name
  city: string;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

// ============================================
// INFERRED TRANSFER (System Generated)
// ============================================

export type TransferType =
  | 'airport_arrival'        // Airport → First hotel
  | 'airport_departure'      // Last hotel → Airport
  | 'inter_city'             // Between cities
  | 'same_city'              // Hotel change within same city
  | 'mid_trip_flight';       // Flight during the trip

export type TransferStatus =
  | 'needs_input'            // User needs to specify
  | 'suggested'              // System has suggestions
  | 'booked'                 // User has this booked
  | 'conflict';              // There's a problem

export interface TransferOption {
  id: string;
  mode: TransferMode;
  name?: string;             // e.g., "Narita Express", "Shinkansen Nozomi"
  duration?: number;         // minutes - calculated dynamically by routing service
  cost?: {
    amount: number;
    currency: string;
  };
  frequency?: string;        // e.g., "Every 30 min"
  recommended?: boolean;
  bookingUrl?: string;
  notes?: string;
}

export interface InferredTransfer {
  id: string;
  type: TransferType;

  from: TransferEndpoint;
  to: TransferEndpoint;

  // For inter-city transfers: intermediate waypoints (station/airport)
  via?: {
    departure: TransferEndpoint;  // e.g., Tokyo Station
    arrival: TransferEndpoint;    // e.g., Kyoto Station
    mode: TransferMode;           // e.g., 'shinkansen'
  };

  date: string;              // ISO date
  earliestDeparture?: string; // e.g., hotel checkout time
  latestArrival?: string;     // e.g., flight departure, hotel checkin

  // Time window for this transfer
  timeWindow?: {
    notBefore: string;       // HH:mm
    notAfter: string;        // HH:mm
  };

  // System-suggested options
  options: TransferOption[];

  // User's selection (if any)
  selected?: TransferAnchor;

  // Commute breakdown for multi-leg transfers
  commuteToStation?: {
    duration: number;        // minutes
    distance: number;        // meters
    mode: TransferMode;
  };
  mainTransport?: {
    duration: number;        // minutes
    mode: TransferMode;
    fromStation: string;
    toStation: string;
  };
  commuteFromStation?: {
    duration: number;        // minutes
    distance: number;        // meters
    mode: TransferMode;
  };
  totalDuration?: number;    // Total time in minutes

  // Status
  status: TransferStatus;
  conflict?: string;         // Error message if status is 'conflict'
  warning?: string;          // Warning message (non-blocking)
}

// ============================================
// TRIP LEG (Derived from anchors)
// ============================================

export interface TripLeg {
  id: string;
  city: string;
  country?: string;
  startDate: string;
  endDate: string;
  nights: number;

  // Associated anchors
  hotel?: HotelAnchor;
  arrivalFlight?: FlightAnchor;
  arrivalTransfer?: InferredTransfer;
  departureFlight?: FlightAnchor;
  departureTransfer?: InferredTransfer;

  // Validation
  hasConflict: boolean;
  conflictMessage?: string;
}

// ============================================
// DERIVED TRIP STRUCTURE
// ============================================

export interface DerivedTripStructure {
  // Trip overview
  startDate: string;
  endDate: string;
  totalNights: number;
  cities: string[];

  // Legs in order
  legs: TripLeg[];

  // All transfers (inferred + user-provided)
  transfers: InferredTransfer[];

  // Validation
  isValid: boolean;
  errors: TripValidationError[];
  warnings: TripValidationWarning[];
}

export interface TripValidationError {
  type: 'gap' | 'overlap' | 'mismatch' | 'missing';
  message: string;
  legId?: string;
  transferId?: string;
}

export interface TripValidationWarning {
  type: 'tight_connection' | 'long_transfer' | 'late_arrival' | 'early_departure';
  message: string;
  legId?: string;
  transferId?: string;
}

// ============================================
// AIRPORT UTILITY TYPES
// ============================================

export interface AirportInfo {
  code: string;
  name: string;
  city: string;
  country: string;
  coordinates: {
    lat: number;
    lng: number;
  };
}

// Common airport codes for major cities
export const MAJOR_AIRPORTS: Record<string, AirportInfo[]> = {
  'Tokyo': [
    { code: 'NRT', name: 'Narita International', city: 'Tokyo', country: 'Japan', coordinates: { lat: 35.7647, lng: 140.3864 } },
    { code: 'HND', name: 'Haneda', city: 'Tokyo', country: 'Japan', coordinates: { lat: 35.5494, lng: 139.7798 } },
  ],
  'Osaka': [
    { code: 'KIX', name: 'Kansai International', city: 'Osaka', country: 'Japan', coordinates: { lat: 34.4320, lng: 135.2304 } },
    { code: 'ITM', name: 'Itami (Osaka International)', city: 'Osaka', country: 'Japan', coordinates: { lat: 34.7855, lng: 135.4380 } },
  ],
  'Paris': [
    { code: 'CDG', name: 'Charles de Gaulle', city: 'Paris', country: 'France', coordinates: { lat: 49.0097, lng: 2.5479 } },
    { code: 'ORY', name: 'Orly', city: 'Paris', country: 'France', coordinates: { lat: 48.7262, lng: 2.3652 } },
  ],
  'London': [
    { code: 'LHR', name: 'Heathrow', city: 'London', country: 'United Kingdom', coordinates: { lat: 51.4700, lng: -0.4543 } },
    { code: 'LGW', name: 'Gatwick', city: 'London', country: 'United Kingdom', coordinates: { lat: 51.1537, lng: -0.1821 } },
    { code: 'STN', name: 'Stansted', city: 'London', country: 'United Kingdom', coordinates: { lat: 51.8850, lng: 0.2350 } },
  ],
  'New York': [
    { code: 'JFK', name: 'John F. Kennedy', city: 'New York', country: 'United States', coordinates: { lat: 40.6413, lng: -73.7781 } },
    { code: 'EWR', name: 'Newark Liberty', city: 'New York', country: 'United States', coordinates: { lat: 40.6895, lng: -74.1745 } },
    { code: 'LGA', name: 'LaGuardia', city: 'New York', country: 'United States', coordinates: { lat: 40.7769, lng: -73.8740 } },
  ],
};

// ============================================
// HELPER FUNCTIONS FOR ID GENERATION
// ============================================

export function generateFlightId(): string {
  return `flight-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function generateHotelId(): string {
  return `hotel-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function generateTransferId(): string {
  return `transfer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function generateLegId(): string {
  return `leg-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

// ============================================
// DEFAULT/EMPTY CREATORS
// ============================================

export function generateActivityId(): string {
  return `activity-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

export function createEmptyTripInput(): TripInput {
  return {
    prompt: '',
    budgetTier: 'moderate',
    travelers: { adults: 2 },
    flights: [],
    hotels: [],
    activities: [],
    transfers: [],
  };
}

export function createEmptyFlightAnchor(): FlightAnchor {
  return {
    id: generateFlightId(),
    from: '',
    to: '',
    date: '',
  };
}

export function createEmptyHotelAnchor(): HotelAnchor {
  return {
    id: generateHotelId(),
    city: '',
    checkIn: '',
    checkOut: '',
  };
}

export function createEmptyActivityAnchor(): ActivityAnchor {
  return {
    id: generateActivityId(),
    name: '',
    category: 'experience',
    city: '',
    date: '',
  };
}

// ============================================
// ACTIVITY CATEGORY DISPLAY INFO
// ============================================

export const ACTIVITY_CATEGORY_INFO: Record<ActivityAnchorCategory, { label: string; emoji: string }> = {
  tour: { label: 'Tour', emoji: '🚶' },
  experience: { label: 'Experience', emoji: '🎭' },
  show: { label: 'Show', emoji: '🎪' },
  restaurant: { label: 'Restaurant', emoji: '🍽️' },
  attraction: { label: 'Attraction', emoji: '🎢' },
  transport: { label: 'Transport', emoji: '🚄' },
  other: { label: 'Other', emoji: '📌' },
};
