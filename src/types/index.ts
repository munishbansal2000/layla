// ============================================
// LAYLA.AI CLONE - UNIFIED DATA SCHEMA / TYPES
// ============================================
// This file re-exports from activity-suggestion.ts and provides
// backward-compatible aliases for the legacy type names.

// Re-export all new types from the activity suggestion system
export * from "./activity-suggestion";

// Re-export structured itinerary types (Phase 1: Options, Places, Commute, Food)
export * from "./structured-itinerary";

// Import types we need for aliases and extensions
import type {
  Coordinates,
  LocalizedAddress,
  CoreActivity,
  RestaurantActivity,
  ScoredActivity,
  ActivityCategory,
  PaceMode,
  TripMode,
  WeatherForecast,
  WeatherCondition,
} from "./activity-suggestion";

// ============================================
// USER TYPES (unchanged)
// ============================================

export interface User {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ============================================
// LOCATION TYPES (unified with Coordinates)
// ============================================

/**
 * Location - extended to be compatible with both old and new systems
 * Now includes optional fields from LocalizedAddress
 */
export interface Location extends Coordinates {
  address?: string;
  city: string;
  country: string;
  placeId?: string;
  neighborhood?: string;
  localScript?: string;
  postalCode?: string;
}

/**
 * Convert Location to Coordinates
 */
export function toCoordinates(location: Location): Coordinates {
  return { lat: location.lat, lng: location.lng };
}

/**
 * Convert Location to LocalizedAddress
 */
export function toLocalizedAddress(location: Location): LocalizedAddress {
  return {
    formatted: location.address || `${location.city}, ${location.country}`,
    city: location.city,
    country: location.country,
    neighborhood: location.neighborhood,
    localScript: location.localScript,
    postalCode: location.postalCode,
  };
}

// ============================================
// ACTIVITY TYPES (aliases for backward compatibility)
// ============================================

/**
 * Legacy ActivityType - maps to new ActivityCategory
 * @deprecated Use ActivityCategory instead
 */
export type ActivityType =
  | "attraction"
  | "restaurant"
  | "hotel"
  | "transport"
  | "activity"
  | "shopping"
  | "nightlife"
  | "nature"
  | "culture"
  | "relaxation";

/**
 * Map legacy ActivityType to new ActivityCategory
 */
export const ACTIVITY_TYPE_TO_CATEGORY: Record<ActivityType, ActivityCategory> = {
  attraction: "landmark",
  restaurant: "market",
  hotel: "landmark",
  transport: "landmark",
  activity: "cultural-experience",
  shopping: "shopping",
  nightlife: "nightlife",
  nature: "nature",
  culture: "museum",
  relaxation: "relaxation",
};

/**
 * Legacy Activity interface - simplified view of CoreActivity
 * Use CoreActivity or ScoredActivity for new code
 */
export interface Activity {
  id: string;
  name: string;
  description: string;
  type: ActivityType;
  location: Location;
  imageUrl?: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: 1 | 2 | 3 | 4;
  duration?: number;
  openingHours?: string;
  website?: string;
  phone?: string;
  tags: string[];
  tips?: string[];
  bookingUrl?: string;
}

// ============================================
// DAY PLAN TYPES (use DaySchedule for new code)
// ============================================

export interface TimeSlot {
  startTime: string;
  endTime: string;
}

export interface ItineraryItem {
  id: string;
  activity: Activity;
  timeSlot: TimeSlot;
  notes?: string;
  isBooked?: boolean;
  order: number;
  // New fields for scoring integration
  score?: number;
  scoreBreakdown?: Record<string, number>;
  alternatives?: Activity[];
}

export interface DayPlan {
  id: string;
  dayNumber: number;
  date: Date;
  title: string;
  items: ItineraryItem[];
  weatherForecast?: WeatherInfo;
  // New fields for schedule integration
  totalScore?: number;
  warnings?: string[];
  neighborhoodsVisited?: string[];
}

// ============================================
// WEATHER TYPES (unified with WeatherForecast)
// ============================================

/**
 * Legacy weather condition type
 */
export type LegacyWeatherCondition =
  | "sunny"
  | "cloudy"
  | "rainy"
  | "snowy"
  | "partly-cloudy"
  | "stormy"
  | "foggy";

/**
 * Map legacy conditions to new WeatherCondition
 */
export const WEATHER_CONDITION_MAP: Record<LegacyWeatherCondition, WeatherCondition> = {
  sunny: "sunny",
  "partly-cloudy": "partly-cloudy",
  cloudy: "cloudy",
  rainy: "rainy",
  snowy: "snowy",
  stormy: "stormy",
  foggy: "foggy",
};

/**
 * Legacy WeatherInfo - use WeatherForecast for new code
 */
export interface WeatherInfo {
  temperature: number;
  tempMin?: number;
  tempMax?: number;
  condition: LegacyWeatherCondition;
  description?: string;
  icon: string;
  humidity?: number;
  windSpeed?: number;
  precipProbability?: number;
}

/**
 * Convert WeatherInfo to WeatherForecast
 */
export function toWeatherForecast(
  info: WeatherInfo,
  date: Date,
  sunrise: string = "06:00",
  sunset: string = "18:00"
): WeatherForecast {
  return {
    date: date.toISOString().split("T")[0],
    condition: WEATHER_CONDITION_MAP[info.condition],
    temperature: {
      min: info.tempMin ?? info.temperature - 5,
      max: info.tempMax ?? info.temperature + 5,
    },
    precipitationProbability: info.precipProbability ?? 0,
    humidity: info.humidity ?? 50,
    windSpeed: info.windSpeed ?? 10,
    sunrise,
    sunset,
  };
}

// ============================================
// TRIP TYPES (unified with new system)
// ============================================

export type TripStatus = "planning" | "confirmed" | "ongoing" | "completed" | "cancelled";

/**
 * Legacy TripPreferences - maps to new types
 * Use TripMode, BudgetLevel, PaceMode for new code
 */
export interface TripPreferences {
  budget: "budget" | "moderate" | "luxury";
  pace: "relaxed" | "moderate" | "packed";
  interests: string[];
  dietaryRestrictions?: string[];
  mobilityNeeds?: string[];
  travelStyle: "adventure" | "cultural" | "relaxation" | "foodie" | "mixed";
  // New unified fields
  tripMode?: TripMode;
}

/**
 * Map legacy pace to new PaceMode
 */
export const PACE_TO_MODE: Record<TripPreferences["pace"], PaceMode> = {
  relaxed: "relaxed",
  moderate: "normal",
  packed: "ambitious",
};

/**
 * Map legacy travelStyle to TripMode
 */
export const TRAVEL_STYLE_TO_TRIP_MODE: Record<TripPreferences["travelStyle"], TripMode> = {
  adventure: "friends",
  cultural: "couples",
  relaxation: "couples",
  foodie: "couples",
  mixed: "couples",
};

/**
 * Trip - the main trip container
 * Now supports both legacy DayPlan[] and new scheduling
 */
export interface Trip {
  id: string;
  userId: string;
  title: string;
  destination: Location;
  startDate: Date;
  endDate: Date;
  days: DayPlan[];
  preferences: TripPreferences;
  status: TripStatus;
  coverImage?: string;
  totalBudget?: number;
  currency: string;
  travelers: number;
  notes?: string;
  sharedWith?: string[];
  createdAt: Date;
  updatedAt: Date;

  // New unified fields
  tripMode?: TripMode;
  activityPool?: (CoreActivity | RestaurantActivity)[];
  scoredActivities?: ScoredActivity[];
}

// Chat Types
export type MessageRole = 'user' | 'assistant' | 'system';

export type MessageType = 'text' | 'itinerary_preview' | 'activity_suggestion' | 'loading';

// Bookable activity from Viator
export interface BookableActivity {
  id: string;
  name: string;
  description: string;
  type: "activity";
  imageUrl: string;
  rating?: number;
  reviewCount?: number;
  priceLevel: 1 | 2 | 3 | 4;
  duration?: number;
  bookingUrl: string;
  tags: string[];
  viatorProductCode: string;
  price?: {
    amount: number;
    currency: string;
  };
}

// Restaurant from Yelp
export interface BookableRestaurant {
  id: string;
  name: string;
  description: string;
  cuisine: string;
  imageUrl: string;
  rating?: number;
  reviewCount?: number;
  priceLevel: 1 | 2 | 3 | 4;
  address: string;
  distance?: string;
  url: string;
  phone?: string;
  categories: string[];
  isOpen?: boolean;
  coordinates?: {
    lat: number;
    lng: number;
  };
}

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  type: MessageType;
  timestamp: Date;
  metadata?: {
    tripId?: string;
    activities?: Activity[];
    bookableActivities?: BookableActivity[];
    bookableRestaurants?: BookableRestaurant[];
    destination?: string;
    suggestions?: string[];
    // Structured itinerary data (Phase 1: Options, Places, Commute, Food)
    structuredItinerary?: import("./structured-itinerary").StructuredItineraryData;
    structuredItineraryMetadata?: import("./structured-itinerary").ItineraryResponseMetadata;
  };
}

export interface Conversation {
  id: string;
  tripId?: string;
  messages: ChatMessage[];
  createdAt: Date;
  updatedAt: Date;
}

// Search & Filter Types
export interface SearchFilters {
  destination?: string;
  startDate?: Date;
  endDate?: Date;
  travelers?: number;
  budget?: TripPreferences['budget'];
  interests?: string[];
}

// API Response Types
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
  };
}

// AI Generation Types
export interface GenerateTripRequest {
  destination: string;
  startDate: string;
  endDate: string;
  travelers: number;
  preferences: Partial<TripPreferences>;
  additionalNotes?: string;
}

export interface GenerateTripResponse {
  trip: Trip;
  conversation: Conversation;
}

// Suggestion Types
export interface Destination {
  id: string;
  name: string;
  country: string;
  imageUrl: string;
  description: string;
  tags: string[];
  averageBudget: number;
  bestTimeToVisit: string[];
  popularActivities: string[];
}
