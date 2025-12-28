// ============================================
// HOOKS - INDEX
// ============================================
// Central exports for all custom hooks

// Itinerary API Hook
export {
  useItinerary,
  useItineraryList,
  generateItinerary,
  getItinerary,
  updateItinerary,
  deleteItinerary,
  getSwapOptions,
  swapActivity,
  processSwipe,
  lockActivity,
  confirmItinerary,
} from "./useItinerary";
export type {
  ItineraryRequest,
  DayScheduleSlot,
  DaySchedule,
  Itinerary,
  SwapOption,
  GenerateResponse,
} from "./useItinerary";

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
