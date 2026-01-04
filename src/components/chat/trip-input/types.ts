/**
 * Types for TripInputPanel components
 */

import type {
  TripInput,
  FlightAnchor,
  HotelAnchor,
  ActivityAnchor,
  BudgetTier,
  DerivedTripStructure,
} from "@/types/trip-input";
import type { ParsedTripInput } from "@/lib/trip-input-parser";
import type {
  ValidationIssue,
  SemanticValidationResult,
} from "@/lib/anchor-validation";

// ============================================
// COMPONENT PROPS
// ============================================

export interface TripInputPanelProps {
  onStartPlanning: (input: TripInput, structure: DerivedTripStructure) => void;
  isLoading?: boolean;
  className?: string;
}

export interface FlightAnchorInputProps {
  flight: FlightAnchor;
  onChange: (flight: FlightAnchor) => void;
  onRemove: () => void;
  index: number;
}

export interface HotelAnchorInputProps {
  hotel: HotelAnchor;
  onChange: (hotel: HotelAnchor) => void;
  onRemove: () => void;
  index: number;
}

export interface ActivityAnchorInputProps {
  activity: ActivityAnchor;
  onChange: (activity: ActivityAnchor) => void;
  onRemove: () => void;
  index: number;
}

export interface BudgetSelectorProps {
  value: BudgetTier;
  onChange: (tier: BudgetTier) => void;
}

export interface TripTimelinePreviewProps {
  structure: DerivedTripStructure;
}

// ============================================
// STATE TYPES
// ============================================

export interface ParseState {
  isParsing: boolean;
  parsed: ParsedTripInput | null;
  error: string | null;
  timing: { parseMs: number; totalMs: number } | null;
}

export interface UserClarifications {
  daysPerCity: Record<string, number>;
  startDate: string;
  endDate: string;
  totalDays: number;
  pace: "relaxed" | "moderate" | "packed";
  confirmedFields: Set<string>;
}

export interface AISuggestions {
  daysPerCity: Record<string, number>;
  startDate: string;
  endDate: string;
  totalDays: number;
  pace: "relaxed" | "moderate" | "packed";
}

export interface ItineraryState {
  isGenerating: boolean;
  generated: boolean;
  error: string | null;
}

export interface ValidationState {
  isValidating: boolean;
  clientIssues: ValidationIssue[];
  semanticResult: SemanticValidationResult | null;
  lastValidated: Date | null;
}

// ============================================
// REQUEST TYPES
// ============================================

export interface PreBookedActivity {
  name: string;
  date: string;
  time?: string;
  city?: string;
  duration?: number;
  category?: string;
  confirmationNumber?: string;
  notes?: string;
}

export interface JapanItineraryRequest {
  cities: string[];
  startDate: string;
  daysPerCity?: Record<string, number>;
  totalDays?: number;
  pace?: "relaxed" | "moderate" | "packed";
  interests?: string[];
  includeKlookExperiences?: boolean;
  preBookedActivities?: PreBookedActivity[];
  mustHave?: string[];
  mustAvoid?: string[];
}

// ============================================
// BUTTON STATE
// ============================================

export interface ButtonState {
  label: string;
  disabled: boolean;
  icon: "loading" | "sparkles" | "info" | "error";
}
