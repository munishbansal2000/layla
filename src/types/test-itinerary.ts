// ============================================
// Test Itinerary Types
// Multi-city trip itinerary with slots and options
// ============================================

export interface TestItineraryCoordinates {
  lat: number;
  lng: number;
}

export interface TestItineraryPlace {
  name: string;
  address: string;
  neighborhood: string;
  coordinates: TestItineraryCoordinates;
  rating: number;
  reviewCount: number;
}

export interface TestItineraryCost {
  amount: number;
  currency: string;
}

export interface TestItineraryActivity {
  name: string;
  description: string;
  category: string;
  duration: number;
  place: TestItineraryPlace;
  isFree: boolean;
  estimatedCost?: TestItineraryCost;
  tags: string[];
  source: string;
}

export interface TestItineraryOption {
  id: string;
  rank: number;
  score: number;
  activity: TestItineraryActivity;
  matchReasons: string[];
  tradeoffs: string[];
}

export interface TestItineraryCommute {
  duration: number;
  distance: number;
  method: "walk" | "transit" | "drive";
  instructions: string;
  trainLines?: string[];
}

export interface TestItinerarySlot {
  slotId: string;
  slotType: "morning" | "lunch" | "afternoon" | "dinner" | "evening";
  timeRange: { start: string; end: string };
  options: TestItineraryOption[];
  selectedOptionId: string | null;
  commuteFromPrevious?: TestItineraryCommute | null;
}

export interface TestItineraryCityTransition {
  from: string;
  to: string;
  method: string;
  duration: number;
  departureTime: string;
  arrivalTime: string;
  trainName: string;
  estimatedCost: TestItineraryCost;
  departureStation: string;
  arrivalStation: string;
}

export interface TestItineraryDay {
  dayNumber: number;
  date: string;
  city: string;
  title: string;
  slots: TestItinerarySlot[];
  cityTransition?: TestItineraryCityTransition;
}

export interface TestItineraryBudgetBreakdown {
  activities: { min: number; max: number };
  food: { min: number; max: number };
  transport: { min: number; max: number };
  accommodation: { min: number; max: number };
}

export interface TestItineraryBudget {
  total: { min: number; max: number };
  currency: string;
  breakdown: TestItineraryBudgetBreakdown;
}

export interface TestItinerary {
  destination: string;
  country: string;
  tripType: string;
  cities: string[];
  days: TestItineraryDay[];
  generalTips: string[];
  estimatedBudget: TestItineraryBudget;
  validationRules?: {
    maxActivitiesPerDay: number;
    minBreakBetweenActivities: number;
    maxCommuteTimePerDay: number;
    requiredSlotTypes: string[];
  };
}
