/**
 * Multi-City Trip Types
 *
 * Complete type system for multi-destination travel planning.
 * Supports intelligent routing between cities with various transport modes.
 */

import type { LatLng } from "@/lib/google-maps";

// ============================================
// CORE TYPES
// ============================================

/**
 * A city/destination in a multi-city trip
 */
export interface CityDestination {
  id: string;
  name: string;
  country: string;
  countryCode: string;
  coordinates: LatLng;
  timezone: string;
  currency: string;
  language: string;
  airportCodes?: string[];
  trainStationCodes?: string[];
  imageUrl?: string;
}

/**
 * A stop at a specific city
 */
export interface CityStop {
  id: string;
  city: CityDestination;
  arrivalDate: string; // ISO date
  departureDate: string; // ISO date
  nights: number;
  isOrigin: boolean;
  isFinalDestination: boolean;
  order: number;
  accommodation?: AccommodationInfo;
}

/**
 * Accommodation information for a city stop
 */
export interface AccommodationInfo {
  id: string;
  name: string;
  type: "hotel" | "hostel" | "apartment" | "resort" | "other";
  address: string;
  coordinates: LatLng;
  checkInTime: string;
  checkOutTime: string;
  bookingUrl?: string;
  confirmationCode?: string;
  price?: { amount: number; currency: string };
}

// ============================================
// INTER-CITY TRANSPORT
// ============================================

export type InterCityTransportMode =
  | "flight"
  | "train"
  | "bus"
  | "ferry"
  | "car_rental"
  | "private_transfer";

export interface InterCityLeg {
  id: string;
  fromCity: CityDestination;
  toCity: CityDestination;
  transportMode: InterCityTransportMode;
  departureTime: string; // ISO datetime
  arrivalTime: string; // ISO datetime
  durationMinutes: number;
  carrier?: CarrierInfo;
  booking?: TransportBooking;
  segments?: TransportSegment[];
  price?: { amount: number; currency: string };
  carbonFootprint?: { kgCO2: number };
}

export interface CarrierInfo {
  name: string;
  code: string;
  logo?: string;
  type: "airline" | "rail_operator" | "bus_company" | "ferry_company" | "car_rental";
}

export interface TransportBooking {
  confirmationCode: string;
  bookingUrl?: string;
  ticketUrl?: string;
  seatInfo?: string;
  class?: "economy" | "premium_economy" | "business" | "first";
  baggageAllowance?: string;
  cancellationPolicy?: string;
}

export interface TransportSegment {
  id: string;
  segmentNumber: number;
  departureLocation: string;
  departureCode: string;
  departureTime: string;
  arrivalLocation: string;
  arrivalCode: string;
  arrivalTime: string;
  durationMinutes: number;
  vehicleNumber?: string; // Flight number, train number, etc.
  vehicleType?: string;
  operatingCarrier?: string;
  layoverMinutes?: number; // Time until next segment
}

// ============================================
// FLIGHT-SPECIFIC TYPES
// ============================================

export interface FlightOption extends InterCityLeg {
  transportMode: "flight";
  flightNumber: string;
  departureAirport: AirportInfo;
  arrivalAirport: AirportInfo;
  aircraft?: string;
  stops: number;
  layovers?: LayoverInfo[];
}

export interface AirportInfo {
  code: string;
  name: string;
  city: string;
  terminal?: string;
  gate?: string;
}

export interface LayoverInfo {
  airport: AirportInfo;
  durationMinutes: number;
  changeTerminal: boolean;
}

// ============================================
// TRAIN-SPECIFIC TYPES
// ============================================

export interface TrainOption extends InterCityLeg {
  transportMode: "train";
  trainNumber: string;
  trainType: "high_speed" | "intercity" | "regional" | "overnight" | "scenic";
  departureStation: StationInfo;
  arrivalStation: StationInfo;
  amenities?: TrainAmenities;
}

export interface StationInfo {
  code: string;
  name: string;
  city: string;
  platform?: string;
}

export interface TrainAmenities {
  wifi: boolean;
  powerOutlets: boolean;
  diningCar: boolean;
  quietCar: boolean;
  accessibility: boolean;
  sleeper?: boolean;
}

// ============================================
// BUS-SPECIFIC TYPES
// ============================================

export interface BusOption extends InterCityLeg {
  transportMode: "bus";
  busNumber?: string;
  busType: "express" | "standard" | "luxury" | "overnight";
  departureTerminal: string;
  arrivalTerminal: string;
  amenities?: BusAmenities;
}

export interface BusAmenities {
  wifi: boolean;
  powerOutlets: boolean;
  restroom: boolean;
  recliningSeats: boolean;
  entertainment: boolean;
}

// ============================================
// MULTI-CITY ITINERARY
// ============================================

export interface MultiCityTrip {
  id: string;
  name: string;
  status: "draft" | "planned" | "booked" | "in_progress" | "completed";
  createdAt: string;
  lastModifiedAt: string;

  // Trip configuration
  travelers: TravelerInfo;
  preferences: MultiCityPreferences;

  // Cities and transport
  stops: CityStop[];
  transitions: InterCityLeg[];

  // Per-city itineraries
  cityItineraries: Map<string, CityItinerary>; // cityId -> itinerary

  // Aggregated stats
  stats: MultiCityTripStats;
}

export interface TravelerInfo {
  adults: number;
  children: number;
  infants: number;
  childrenAges?: number[];
}

export interface MultiCityPreferences {
  // Transport preferences
  preferredTransport: InterCityTransportMode[];
  maxFlightDuration?: number; // minutes
  maxLayoverDuration?: number; // minutes
  preferDirectFlights: boolean;
  preferDaytimeTravel: boolean;

  // Accommodation
  accommodationType: ("hotel" | "hostel" | "apartment" | "resort")[];
  minAccommodationRating?: number;

  // Budget
  totalBudget?: { amount: number; currency: string };
  transportBudgetPercent?: number;

  // Pace
  minNightsPerCity: number;
  maxNightsPerCity: number;
  preferSlowTravel: boolean;

  // Special requirements
  requireAccessibility: boolean;
  dietaryRestrictions?: string[];
  visaRequired?: string[]; // Country codes requiring visa
}

export interface CityItinerary {
  cityId: string;
  cityName: string;
  startDate: string;
  endDate: string;
  days: CityDaySchedule[];
  totalCost?: { amount: number; currency: string };
}

export interface CityDaySchedule {
  date: string;
  dayNumber: number;
  dayType: "full" | "arrival" | "departure" | "travel";
  availableHours: { start: string; end: string };
  activities: CityActivity[];
  meals: MealSlot[];
}

export interface CityActivity {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  category: string;
  location: LatLng;
  address: string;
  neighborhood: string;
  price?: { amount: number; currency: string };
  bookingRequired: boolean;
  bookingUrl?: string;
}

export interface MealSlot {
  id: string;
  type: "breakfast" | "lunch" | "dinner" | "snack";
  time: string;
  venue?: {
    name: string;
    cuisine: string;
    address: string;
    priceLevel: number;
  };
}

export interface MultiCityTripStats {
  totalDays: number;
  totalCities: number;
  totalNights: number;
  totalFlightTime: number; // minutes
  totalTrainTime: number;
  totalTransitTime: number;
  totalActivities: number;
  estimatedTotalCost: { amount: number; currency: string };
  carbonFootprint: { kgCO2: number };
  countriesVisited: string[];
  timezonesTraversed: number;
}

// ============================================
// TRANSPORT SEARCH & OPTIONS
// ============================================

export interface TransportSearchRequest {
  fromCity: string | CityDestination;
  toCity: string | CityDestination;
  departureDate: string; // ISO date
  returnDate?: string; // For round trips
  travelers: TravelerInfo;
  preferredModes?: InterCityTransportMode[];
  maxPrice?: { amount: number; currency: string };
  maxDuration?: number; // minutes
  departureTimeRange?: { earliest: string; latest: string };
  arrivalTimeRange?: { earliest: string; latest: string };
  directOnly?: boolean;
}

export interface TransportSearchResult {
  request: TransportSearchRequest;
  options: InterCityLeg[];
  cheapest: InterCityLeg | null;
  fastest: InterCityLeg | null;
  recommended: InterCityLeg | null;
  searchedAt: string;
}

// ============================================
// CITY SEQUENCING & OPTIMIZATION
// ============================================

export interface CitySequenceRequest {
  cities: CityDestination[];
  startCity: CityDestination;
  endCity?: CityDestination; // If different from start (one-way)
  startDate: string;
  endDate: string;
  preferences: MultiCityPreferences;
}

export interface CitySequenceResult {
  optimalOrder: CityDestination[];
  totalTravelTime: number; // minutes
  totalTravelCost: { amount: number; currency: string };
  suggestedNights: Map<string, number>; // cityId -> nights
  transitions: InterCityLeg[];
  alternativeOrders?: CitySequenceAlternative[];
}

export interface CitySequenceAlternative {
  order: CityDestination[];
  reason: string;
  travelTimeDiff: number; // vs optimal
  costDiff: { amount: number; currency: string };
}

// ============================================
// DAY REORDERING TYPES
// ============================================

export interface DayReorderRequest {
  tripId: string;
  fromIndex: number;
  toIndex: number;
}

export interface DaySwapRequest {
  tripId: string;
  dayIndex1: number;
  dayIndex2: number;
}

export interface CrossDayMoveRequest {
  tripId: string;
  activityId: string;
  sourceDayIndex: number;
  sourceSlotId: string;
  targetDayIndex: number;
  targetSlotId: string;
}

export interface ReorderResult {
  success: boolean;
  updatedDays: CityDaySchedule[];
  affectedCommutes: string[]; // IDs of commutes that need recalculation
  warnings?: string[];
  error?: string;
}

// ============================================
// VENUE MONITORING
// ============================================

export interface VenueMonitoringConfig {
  venueId: string;
  venueName: string;
  checkInterval: number; // minutes
  notifyOnClosure: boolean;
  notifyOnHoursChange: boolean;
  lastChecked?: string;
  currentStatus?: VenueStatus;
}

export interface VenueStatus {
  isOpen: boolean;
  isClosed: boolean;
  currentHours?: { open: string; close: string };
  nextOpening?: string;
  temporaryClosure?: {
    reason: string;
    until?: string;
  };
  lastUpdated: string;
}

export interface VenueAlert {
  id: string;
  venueId: string;
  venueName: string;
  alertType: "closure" | "hours_change" | "temporary_closure" | "reopening";
  message: string;
  severity: "info" | "warning" | "critical";
  timestamp: string;
  affectedActivities: string[]; // Activity IDs
  suggestedAction?: string;
}

// ============================================
// PUSH NOTIFICATIONS
// ============================================

export type NotificationType =
  | "schedule_change"
  | "venue_closure"
  | "weather_alert"
  | "transport_delay"
  | "booking_reminder"
  | "check_in_reminder"
  | "activity_starting"
  | "trip_update";

export interface PushNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  icon?: string;
  timestamp: string;
  tripId?: string;
  activityId?: string;
  actionUrl?: string;
  actions?: NotificationAction[];
  read: boolean;
  dismissed: boolean;
}

export interface NotificationAction {
  id: string;
  label: string;
  action: string; // URL or action identifier
  primary?: boolean;
}

export interface NotificationPreferences {
  enabled: boolean;
  quietHours?: { start: string; end: string };
  types: {
    schedule_change: boolean;
    venue_closure: boolean;
    weather_alert: boolean;
    transport_delay: boolean;
    booking_reminder: boolean;
    check_in_reminder: boolean;
    activity_starting: boolean;
    trip_update: boolean;
  };
  advanceReminder: number; // minutes before activity
}

// All types are already exported via their interface/type declarations above
