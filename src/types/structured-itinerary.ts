// ============================================
// STRUCTURED ITINERARY TYPES
// ============================================
// Types for the structured LLM response format
// that enables options, places, commute, and food preferences

// ============================================
// PLACE DATA
// ============================================

export interface PlaceData {
  googlePlaceId?: string;
  name: string;
  address: string;
  neighborhood: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  rating?: number;
  reviewCount?: number;
  photos?: string[];
  openingHours?: string[];
}

// ============================================
// COMMUTE INFO (for structured itinerary)
// ============================================

/**
 * Commute type classification for UI rendering
 */
export type CommuteType =
  | "arrival"           // Airport/station to first hotel (Day 1)
  | "departure"         // Last hotel to airport/station (Final day)
  | "hotel-to-activity" // Morning: hotel to first activity
  | "activity-to-hotel" // Evening: last activity back to hotel
  | "between-activities"// During the day between spots
  | "city-transfer"     // Between cities (includes station/airport transfers)
  | "to-station"        // Hotel to station/airport for city transfer
  | "from-station";     // Station/airport to hotel after city transfer

export interface StructuredCommuteInfo {
  fromPlaceId?: string;
  toPlaceId?: string;
  duration: number; // minutes
  distance: number; // meters
  method: "walk" | "transit" | "taxi" | "drive" | "shinkansen" | "flight" | "bus" | "ferry";
  instructions: string;
  trainLines?: string[];
  cost?: {
    amount: number;
    currency: string;
  };

  // Commute type for UI rendering
  commuteType?: CommuteType;

  // Endpoints for display
  fromName?: string;  // e.g., "Narita Airport", "Hotel Gracery Shinjuku"
  toName?: string;    // e.g., "Hotel Gracery Shinjuku", "Senso-ji Temple"
}

// ============================================
// DIETARY MATCHING
// ============================================

export interface DietaryMatch {
  meetsRequirements: boolean;
  matchedPreferences: string[];
  warnings: string[];
}

// ============================================
// VIATOR TOUR ENHANCEMENTS
// ============================================

/**
 * Enhancement type for categorizing Viator tours
 */
export type ViatorEnhancementType =
  | "skip-the-line"     // Skip queues at popular attractions
  | "guided-tour"       // Professional guide included
  | "audio-guide"       // Self-paced with audio narration
  | "private-tour"      // Exclusive private experience
  | "food-tour"         // Culinary experience
  | "day-trip"          // Full/half day excursion
  | "experience"        // Unique local experience
  | "combo-ticket"      // Multiple attractions bundled
  | "night-tour"        // Evening/night experiences
  | "workshop";         // Hands-on learning experience

/**
 * Viator tour enhancement for an activity
 * Represents an optional paid experience that enhances the base activity
 */
export interface ViatorEnhancement {
  productCode: string;
  title: string;
  description: string;
  enhancementType: ViatorEnhancementType;

  // Pricing
  price: {
    amount: number;
    currency: string;
    originalAmount?: number; // For discounts
  };

  // Duration in minutes
  duration: number;

  // Ratings
  rating?: number;
  reviewCount?: number;

  // Booking
  bookingUrl: string;
  confirmationType: "instant" | "manual";

  // Images
  imageUrl?: string;

  // Why this tour is a good match
  matchReason: string;

  // Flags
  flags: {
    skipTheLine?: boolean;
    freeCancellation?: boolean;
    likelyToSellOut?: boolean;
    newOnViator?: boolean;
    privateOption?: boolean;
  };

  // Best time of day for this tour
  bestTimeOfDay?: "morning" | "afternoon" | "evening" | "flexible";

  // Tags from Viator
  tags?: string[];
}

// ============================================
// ACTIVITY OPTIONS
// ============================================

export interface ActivityOption {
  id: string;
  rank: number;
  score: number;

  activity: {
    name: string;
    description: string;
    category: string;
    duration: number; // minutes

    // Place data for maps (departure/origin location for transport activities)
    place: PlaceData | null;

    // For transport activities: arrival/destination location
    // Used for calculating commutes AFTER the transport activity
    arrivalPlace?: PlaceData;

    // Cost info
    isFree: boolean;
    estimatedCost?: {
      amount: number;
      currency: string;
    };

    // Tags for filtering
    tags: string[];

    // Source of this activity
    source: "ai" | "yelp" | "viator" | "google-places" | "local-data" | "klook" | "osm";

    // Booking URL for paid experiences
    bookingUrl?: string;
  };

  // For restaurants: dietary preference match
  dietaryMatch?: DietaryMatch;

  // Why this was recommended
  matchReasons: string[];
  tradeoffs: string[];

  // ============================================
  // VIATOR TOUR ENHANCEMENTS
  // ============================================
  /**
   * Optional Viator tour enhancements for this activity
   * These are paid experiences that can enhance the base free activity
   * (e.g., skip-the-line tickets, guided tours, audio guides)
   */
  viatorEnhancements?: ViatorEnhancement[];
}

// ============================================
// TIME SLOTS WITH OPTIONS
// ============================================

export type ItinerarySlotType = "morning" | "breakfast" | "lunch" | "afternoon" | "dinner" | "evening";

/**
 * Slot behavior type - determines how the slot can be manipulated
 * - anchor: Fixed time/location, cannot be moved (rigidity=1)
 * - flex: Can be moved within constraints (rigidity=0.3-0.7)
 * - optional: Can be removed or replaced freely (rigidity=0-0.3)
 * - meal: Tied to meal times, some flexibility (rigidity=0.6)
 * - travel: Transit between locations (rigidity=0.8)
 */
export type SlotBehavior = "anchor" | "flex" | "optional" | "meal" | "travel";

/**
 * Dependency constraint between activities
 */
export interface SlotDependency {
  type: "must-before" | "must-after" | "same-day" | "different-day";
  targetSlotId: string;
  reason?: string;
}

/**
 * Cluster represents geographically close activities
 */
export interface ActivityCluster {
  clusterId: string;
  centroidLocation: { lat: number; lng: number };
  activityIds: string[];
  avgIntraClusterDistance: number; // meters
  name?: string; // e.g., "Shinjuku Area", "Shibuya Crossing"
}

/**
 * Replacement option for fallback when activity is removed or weather changes
 */
export interface ReplacementOption {
  id: string;
  activity: ActivityOption["activity"];
  reason: string; // "rainy day alternative", "similar cuisine", "nearby attraction"
  priority: number; // 1 = first choice
}

/**
 * Fragility/risk metadata for an activity
 */
export interface ActivityFragility {
  weatherSensitivity: "none" | "low" | "medium" | "high"; // outdoor = high
  crowdSensitivity: "none" | "low" | "medium" | "high"; // popular spots = high
  bookingRequired: boolean;
  bookingUrl?: string;
  ticketType?: "timed" | "flexible" | "none";
  peakHours?: string[]; // ["11:00-14:00", "18:00-20:00"]
  bestVisitTime?: string; // "early morning" | "sunset" | "evening"
}

export interface SlotWithOptions {
  slotId: string;
  slotType: ItinerarySlotType;
  timeRange: {
    start: string; // "09:00"
    end: string; // "12:00"
  };

  // Multiple ranked options per slot
  options: ActivityOption[];

  // User's selection (null until chosen, optional in initial data)
  selectedOptionId?: string | null;

  // Commute info from previous activity
  commuteFromPrevious?: StructuredCommuteInfo;

  // ============================================
  // SEMANTIC MODEL EXTENSIONS
  // ============================================

  /**
   * Slot behavior type (anchor, flex, optional, meal, travel)
   * Determines how the slot can be manipulated in the UI
   */
  behavior?: SlotBehavior;

  /**
   * Rigidity score (0-1)
   * - 1.0: Completely fixed (anchors, booked tickets)
   * - 0.7-0.9: High priority (key attractions, reservations)
   * - 0.3-0.6: Flexible (can be moved within constraints)
   * - 0.0-0.2: Optional (can be removed or replaced)
   */
  rigidityScore?: number;

  /**
   * Dependencies on other slots (ordering constraints)
   */
  dependencies?: SlotDependency[];

  /**
   * Cluster this activity belongs to (for proximity-based scheduling)
   */
  clusterId?: string;

  /**
   * Replacement pool for fallback activities
   * Used when activity is removed, weather changes, or user wants alternatives
   */
  replacementPool?: ReplacementOption[];

  /**
   * Fragility/risk metadata
   */
  fragility?: ActivityFragility;

  /**
   * Whether this slot is locked by user (cannot be auto-adjusted)
   */
  isLocked?: boolean;

  /**
   * User notes for this slot
   */
  userNotes?: string;
}

// ============================================
// ACCOMMODATION INFO
// ============================================

export interface AccommodationInfo {
  name: string;
  address: string;
  neighborhood?: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  checkIn?: string; // "15:00"
  checkOut?: string; // "11:00"
  type?: "hotel" | "hostel" | "airbnb" | "ryokan" | "resort" | "apartment";
  rating?: number;
  bookingUrl?: string;
}

// ============================================
// CITY TRANSITION INFO (for multi-city trips)
// ============================================

export interface CityTransitionInfo {
  from: string;
  to: string;
  method: "shinkansen" | "train" | "bus" | "flight" | "car" | "ferry";
  duration: number; // minutes
  departureTime: string;
  arrivalTime: string;
  trainName?: string;
  flightNumber?: string;
  estimatedCost?: {
    amount: number;
    currency: string;
  };
  departureStation?: string;
  arrivalStation?: string;

  // Commute from origin hotel to departure station
  commuteToStation?: StructuredCommuteInfo;

  // Commute from arrival station to destination hotel
  commuteFromStation?: StructuredCommuteInfo;
}

// ============================================
// DAY WITH OPTIONS
// ============================================

export interface DayWithOptions {
  dayNumber: number;
  date: string; // "2025-01-18"
  city: string;
  title: string;
  slots: SlotWithOptions[];
  cityTransition?: CityTransitionInfo;

  // Accommodation for this day (hotel, hostel, etc.)
  accommodation?: AccommodationInfo;

  // Commute from hotel to first activity of the day
  commuteFromHotel?: StructuredCommuteInfo;

  // Commute from last activity back to hotel
  commuteToHotel?: StructuredCommuteInfo;
}

// ============================================
// STRUCTURED ITINERARY RESPONSE
// ============================================

export interface StructuredItineraryData {
  /** Unique trip ID for execution and cross-page sync (e.g., "tokyo-A3F2") */
  tripId?: string;
  destination: string;
  country?: string;
  days: DayWithOptions[];
  generalTips?: string[];
  packingList?: string[];
  estimatedBudget?: {
    total: { min: number; max: number };
    currency: string;
    breakdown?: {
      activities?: { min: number; max: number };
      food?: { min: number; max: number };
      transport?: { min: number; max: number };
    };
  };

  // ============================================
  // ARRIVAL/DEPARTURE INFO
  // ============================================

  /** Arrival details (airport/station arrival on first day) */
  arrival?: {
    port: string;          // e.g., "Narita International Airport (NRT)"
    portType: "airport" | "station" | "port";
    arrivalTime?: string;  // e.g., "14:00"
    flightNumber?: string;
    trainName?: string;
    /** Commute from arrival port to first hotel */
    commuteToHotel?: StructuredCommuteInfo;
  };

  /** Departure details (departure from last day) */
  departure?: {
    port: string;          // e.g., "Kansai International Airport (KIX)"
    portType: "airport" | "station" | "port";
    departureTime?: string; // e.g., "18:00"
    flightNumber?: string;
    trainName?: string;
    /** Commute from last hotel to departure port */
    commuteFromHotel?: StructuredCommuteInfo;
  };
}

export interface ItineraryResponseMetadata {
  generatedAt: string;
  hasPlaces: boolean;
  hasCommute: boolean;
  hasFoodPreferences: boolean;
  totalDays: number;
  totalSlots: number;
  totalOptions: number;
}

export interface StructuredItineraryResponse {
  // Text response for chat display
  message: string;

  // Structured data for UI components
  itinerary: StructuredItineraryData | null;

  // Metadata about the response
  metadata: ItineraryResponseMetadata;

  // Parse errors if any
  parseError?: string;
}

// ============================================
// LLM RAW RESPONSE FORMAT
// ============================================
// This is the format we expect from the LLM before parsing

export interface LLMItineraryResponse {
  destination: string;
  country?: string;
  days: LLMDay[];
  generalTips?: string[];
  estimatedBudget?: {
    total: { min: number; max: number };
    currency: string;
  };
}

export interface LLMDay {
  dayNumber: number;
  date: string;
  city: string;
  title: string;
  slots: LLMSlot[];
}

export interface LLMSlot {
  slotId: string;
  slotType: ItinerarySlotType;
  timeRange: { start: string; end: string };
  options: LLMActivityOption[];
}

export interface LLMActivityOption {
  id: string;
  rank: number;
  score: number;
  activity: {
    name: string;
    description: string;
    category: string;
    duration: number;
    place?: {
      name: string;
      address: string;
      neighborhood: string;
      coordinates?: { lat: number; lng: number };
    };
    isFree: boolean;
    estimatedCost?: { amount: number; currency: string };
    tags: string[];
    source: "ai" | "yelp" | "viator" | "google-places";
  };
  matchReasons: string[];
  tradeoffs: string[];
}

// ============================================
// UTILITY TYPES
// ============================================

export interface TripContext {
  destination: string;
  startDate: string;
  endDate: string;
  travelers: {
    adults: number;
    children: number;
    childrenAges?: number[];
  };
  budget: "budget" | "moderate" | "luxury";
  pace: "relaxed" | "moderate" | "packed";
  interests: string[];
  dietaryRestrictions?: string[];
  tripMode?: string;
}
