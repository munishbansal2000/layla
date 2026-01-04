// ============================================
// PLANNER COMPONENTS - INDEX
// ============================================
// Central exports for all planner-related components

// Activity Selection Flow
export {
  ActivitySelectionFlow,
  useSelectionSession,
} from "./ActivitySelectionFlow";
export type {
  SelectionSlot,
  ScoredActivityOption,
  SelectionSession,
  SwipeHistoryItem,
  ActivitySelectionFlowProps,
} from "./ActivitySelectionFlow";

// Activity Score Card
export {
  ActivityScoreCard,
  ScoreBadge,
  ScoreBreakdown,
  CompactCard,
  DetailedCard,
} from "./ActivityScoreCard";
export type { ActivityScoreCardProps } from "./ActivityScoreCard";

// Swap Options Modal
export { SwapOptionsModal } from "./SwapOptionsModal";
export type { SwapOptionsModalProps, SwapOption } from "./SwapOptionsModal";

// NOTE: TripPlannerPane has been deprecated and moved to _archive.
// Use TripApp from '@/components/trip' instead for unified trip planning.

// Trip Planner Sub-components (extracted for reusability)
export {
  TripHeader,
  CollapsibleSection,
  TravelerSettingsPanel,
  PreferencesPanel,
  DietaryAccessibilityPanel,
  NudgesPanel,
  EnergyCheckInBar,
  EnergyCheckInModal,
  DaySelector,
  TimeSlotCard,
  ActivitySuggestionCard,
  CommuteCard,
  ParsedItineraryView,
} from "./trip-planner";

// Trip Planner Types (exported for external use)
export type {
  TravelerSettings,
  PreferenceSettings,
  WeatherData,
  Nudge,
  CommuteDisplayInfo,
  GenerationStatus,
  GeneratedDaySchedule,
  GeneratedSlot,
  SlotActivity,
  TimeSlotData,
} from "./trip-planner";
