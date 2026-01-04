/**
 * Types for the Unified Itinerary View
 */

import type {
  StructuredItineraryData,
  DayWithOptions,
  SlotWithOptions,
} from "@/types/structured-itinerary";

export type ViewMode = "tabbed" | "list";

export type ActivityStatus =
  | "upcoming"
  | "pending"
  | "in_progress"
  | "completed"
  | "skipped"
  | "en_route"
  | "arrived";

/**
 * Execution context passed from TripApp when in execution mode
 */
export interface ItineraryExecutionContext {
  isExecuting: boolean;
  currentSlotId: string | null;
  lockedSlotIds: Set<string>;
  activityStatuses: Map<string, ActivityStatus>;
  currentTime: Date;
}

/**
 * Props for the UnifiedItineraryView component
 */
export interface UnifiedItineraryViewProps {
  itinerary: StructuredItineraryData;
  onItineraryChange?: (updated: StructuredItineraryData) => void;
  className?: string;
  defaultViewMode?: ViewMode;
  enableReordering?: boolean;
  autoExpandSlotId?: string;
  onAutoExpandHandled?: () => void;
  executionContext?: ItineraryExecutionContext;
}

/**
 * Validation issue displayed in the impact panel
 */
export interface ValidationIssue {
  type: "error" | "warning" | "info";
  message: string;
  details?: string;
  slotId?: string;
  dayNumber?: number;
}

/**
 * Activity data for filling a free slot
 */
export interface FillSlotActivityData {
  name: string;
  category?: string;
  duration?: number;
  icon?: string;
  place?: {
    name: string;
    neighborhood?: string;
    rating?: number;
    coordinates?: { lat: number; lng: number };
  };
}

/**
 * Day metrics for pacing analysis
 */
export interface DayMetrics {
  dayNumber: number;
  totalWalkingDistance: number;
  totalCommuteTime: number;
  activityCount: number;
  intensityScore: number;
}

/**
 * Slot handlers passed to child components
 */
export interface SlotHandlers {
  onSelectOption: (slotId: string, optionId: string) => void;
  onClearSlot: (dayIndex: number, slotId: string) => void;
  onToggleLock: (dayIndex: number, slotId: string) => void;
  onFillSlotWithActivity: (
    dayIndex: number,
    slotId: string,
    activity: FillSlotActivityData
  ) => void;
  onDeleteOption: (slotId: string, optionId: string) => void;
}

/**
 * Reorder handlers for drag-and-drop
 */
export interface ReorderHandlers {
  onDaysReorder: (newDays: DayWithOptions[]) => void;
  onSlotsReorder: (dayIndex: number, newSlots: SlotWithOptions[]) => void;
  onMoveSlotToDay: (
    sourceDayIndex: number,
    slotId: string,
    targetDayIndex: number
  ) => void;
}

/**
 * Health status indicator
 */
export type HealthStatus = "excellent" | "good" | "fair" | "poor";
