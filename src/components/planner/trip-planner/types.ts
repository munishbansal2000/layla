import type {
  TripMode,
  PaceMode,
  BudgetMode,
  DietaryOption,
  EnergyLevel,
  WalkingTolerance,
  WeatherCondition,
  NudgeType,
} from "@/types/activity-suggestion";
import type { CommuteMethod } from "@/lib/routing-service";
import type { TimeSlot } from "@/lib/trip-planning";

// ============================================
// Traveler & Preference Settings
// ============================================

export interface TravelerSettings {
  adults: number;
  children: number;
  childrenAges: number[];
  tripMode: TripMode;
  hasSeniors: boolean;
  hasInfants: boolean;
}

export interface PreferenceSettings {
  paceMode: PaceMode;
  budgetMode: BudgetMode;
  walkingTolerance: WalkingTolerance;
  dietaryOptions: DietaryOption[];
  needsAccessibility: boolean;
  rainPlanEnabled: boolean;
}

// ============================================
// Weather Data
// ============================================

export interface WeatherData {
  condition: WeatherCondition;
  temperature: { min: number; max: number };
  precipitationProbability: number;
  humidity: number;
}

// ============================================
// Nudges
// ============================================

export interface Nudge {
  id: string;
  type: NudgeType;
  priority: "critical" | "important" | "info";
  title: string;
  body: string;
  dismissable: boolean;
}

// ============================================
// Commute Display Info
// ============================================

export interface CommuteDisplayInfo {
  fromSlotId: string;
  toSlotId: string;
  durationMinutes: number;
  method: CommuteMethod;
  distanceMeters: number;
  estimatedCost?: { amount: number; currency: string };
}

// ============================================
// Generation Types
// ============================================

export type GenerationStatus = "idle" | "generating" | "complete" | "error";

export interface GeneratedDaySchedule {
  dayNumber: number;
  date: string;
  slots: GeneratedSlot[];
  commutes: CommuteDisplayInfo[];
  totalCommuteMinutes: number;
}

export interface GeneratedSlot {
  id: string;
  startTime: string;
  endTime: string;
  type: "activity" | "meal" | "free";
  activity?: {
    id: string;
    name: string;
    description: string;
    duration: number;
    imageUrl: string;
    rating?: number;
    price?: { amount: number; currency: string };
    bookingUrl?: string;
    neighborhood?: string;
    category?: string;
  };
}

// ============================================
// Time Slot Card Types
// ============================================

export interface SlotActivity {
  id: string;
  name: string;
  description: string;
  duration: number;
  imageUrl: string;
  rating?: number;
  reviewCount?: number;
  price?: { amount: number; currency: string };
  bookingUrl?: string;
  viatorProductCode?: string;
  tags?: string[];
  matchScore?: number;
  bestTimeOfDay?: string;
}

export interface TimeSlotData {
  id: string;
  timeSlot: TimeSlot;
  isPlaceholder: boolean;
  activity?: SlotActivity;
}

// Re-export types from activity-suggestion for convenience
export type { EnergyLevel, PaceMode, BudgetMode, WalkingTolerance, DietaryOption };
