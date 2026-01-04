// ============================================
// HOOKS - INDEX
// ============================================
// Central exports for all custom hooks

// Activity Selection Hook
export {
  useActivitySelection,
  buildSelectionSlots,
  getScoreColor,
  getScoreLabel,
  getScoreBgColor,
  getScoreGradient,
} from "./useActivitySelection";
export type {
  SelectionSlot,
  ScoredActivityOption,
  SelectionSession,
  SwipeHistoryItem,
  UseActivitySelectionOptions,
  UseActivitySelectionReturn,
  BuildSlotsOptions,
} from "./useActivitySelection";

// Reshuffling Hook
export {
  useReshuffling,
} from "./useReshuffling";
export type {
  UseReshufflingOptions,
  UseReshufflingReturn,
  ReshuffleState,
} from "./useReshuffling";

// Weather Hook
export { useWeather, getWeatherForDate } from "./useWeather";

// Itinerary Validation Hook
export { useItineraryValidation } from "./useItineraryValidation";
export type { UseItineraryValidationOptions, UseItineraryValidationReturn } from "./useItineraryValidation";

// Itinerary Chat Hook
export { useItineraryChat } from "./useItineraryChat";
export type { UseItineraryChatOptions, UseItineraryChatReturn } from "./useItineraryChat";
