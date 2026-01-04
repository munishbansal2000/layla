// ============================================
// SCHEDULE BUILDER SERVICE
// ============================================
// Builds day schedules by allocating activities to time slots,
// calculating commute times, and optimizing geographic flow.
// Implements Phase 4 of the Activity Suggestion Algorithm.

import {
  CoreActivity,
  RestaurantActivity,
  ScoredActivity,
  UserExperienceSettings,
  TimeOfDay,
  MealType,
  TripMode,
  WeatherForecast,
  DayTemplate,
} from "@/types/activity-suggestion";

// ============================================
// TYPES
// ============================================

/**
 * Time slot definition for a day
 */
export interface TimeSlot {
  id: string;
  type: "activity" | "meal" | "commute" | "break" | "free";
  name: string;
  startTime: string; // "HH:MM" format
  endTime: string; // "HH:MM" format
  durationMinutes: number;
  timeOfDay: TimeOfDay;
  mealType?: MealType;
  isFlexible: boolean; // Can be moved/compressed
  isRequired: boolean; // Must be filled (e.g., lunch)
}

/**
 * A scheduled activity within a slot
 */
export interface ScheduledActivity {
  slotId: string;
  activity: ScoredActivity;
  scheduledStart: string; // "HH:MM"
  scheduledEnd: string; // "HH:MM"
  actualDuration: number; // May differ from recommended
  isLocked: boolean; // User confirmed this selection
  alternatives: ScoredActivity[]; // Other options for this slot
  commuteFromPrevious?: CommuteInfo;
  variant?: "short" | "standard" | "extended";
  notes?: string;
}

/**
 * Commute information between activities
 */
export interface CommuteInfo {
  fromActivityId: string;
  toActivityId: string;
  durationMinutes: number;
  distanceMeters: number;
  mode: "walking" | "transit" | "taxi" | "mixed";
  transitDetails?: TransitDetails;
  walkingRoute?: string;
  estimatedCost?: { amount: number; currency: string };
}

/**
 * Transit details for commute
 */
export interface TransitDetails {
  lines: string[];
  transfers: number;
  departureStation?: string;
  arrivalStation?: string;
  lastTrainTime?: string;
}

/**
 * A complete day schedule
 */
export interface DaySchedule {
  date: string; // ISO date
  dayNumber: number; // Day 1, 2, 3...
  city: string;
  dayType: "full" | "arrival" | "departure" | "travel";
  slots: ScheduledActivity[];
  totalActivityTime: number; // minutes
  totalCommuteTime: number; // minutes
  totalCost: { amount: number; currency: string };
  neighborhoodsVisited: string[];
  categoriesCovered: string[];
  weather?: WeatherForecast;
  warnings: ScheduleWarning[];
  paceScore: number; // 0-100, higher = more packed
}

/**
 * Warning about schedule issues
 */
export interface ScheduleWarning {
  type:
    | "overlap"
    | "rush"
    | "long-commute"
    | "weather"
    | "booking-conflict"
    | "pace"
    | "late-night";
  severity: "info" | "warning" | "error";
  message: string;
  affectedSlots?: string[];
  suggestion?: string;
}

/**
 * Full trip schedule
 */
export interface TripSchedule {
  tripId: string;
  destination: string;
  startDate: string;
  endDate: string;
  days: DaySchedule[];
  totalDays: number;
  citiesVisited: string[];
  settings: UserExperienceSettings;
  createdAt: string;
  lastModified: string;
}

/**
 * Request to build a schedule
 */
export interface BuildScheduleRequest {
  destination: string;
  date: string;
  dayNumber: number;
  dayType: "full" | "arrival" | "departure" | "travel";
  activities: ScoredActivity[];
  restaurants: ScoredActivity[];
  settings: UserExperienceSettings;
  weather?: WeatherForecast;
  previousDayEndLocation?: { lat: number; lng: number; name: string };
  template?: DayTemplate;
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Default time slots for different day types
 */
const DEFAULT_FULL_DAY_SLOTS: Omit<TimeSlot, "id">[] = [
  {
    type: "activity",
    name: "Morning Activity",
    startTime: "09:00",
    endTime: "12:00",
    durationMinutes: 180,
    timeOfDay: "morning",
    isFlexible: true,
    isRequired: false,
  },
  {
    type: "meal",
    name: "Lunch",
    startTime: "12:00",
    endTime: "14:00",
    durationMinutes: 90,
    timeOfDay: "afternoon",
    mealType: "lunch",
    isFlexible: true,
    isRequired: true,
  },
  {
    type: "activity",
    name: "Afternoon Activity 1",
    startTime: "14:00",
    endTime: "16:00",
    durationMinutes: 120,
    timeOfDay: "afternoon",
    isFlexible: true,
    isRequired: false,
  },
  {
    type: "activity",
    name: "Afternoon Activity 2",
    startTime: "16:00",
    endTime: "18:00",
    durationMinutes: 120,
    timeOfDay: "afternoon",
    isFlexible: true,
    isRequired: false,
  },
  {
    type: "meal",
    name: "Dinner",
    startTime: "18:30",
    endTime: "20:30",
    durationMinutes: 120,
    timeOfDay: "evening",
    mealType: "dinner",
    isFlexible: true,
    isRequired: true,
  },
  {
    type: "activity",
    name: "Evening Activity",
    startTime: "20:30",
    endTime: "22:00",
    durationMinutes: 90,
    timeOfDay: "evening",
    isFlexible: true,
    isRequired: false,
  },
];

const RELAXED_DAY_SLOTS: Omit<TimeSlot, "id">[] = [
  {
    type: "activity",
    name: "Late Morning Activity",
    startTime: "10:00",
    endTime: "12:30",
    durationMinutes: 150,
    timeOfDay: "morning",
    isFlexible: true,
    isRequired: false,
  },
  {
    type: "meal",
    name: "Lunch",
    startTime: "12:30",
    endTime: "14:30",
    durationMinutes: 120,
    timeOfDay: "afternoon",
    mealType: "lunch",
    isFlexible: true,
    isRequired: true,
  },
  {
    type: "activity",
    name: "Afternoon Activity",
    startTime: "15:00",
    endTime: "17:30",
    durationMinutes: 150,
    timeOfDay: "afternoon",
    isFlexible: true,
    isRequired: false,
  },
  {
    type: "meal",
    name: "Dinner",
    startTime: "18:30",
    endTime: "20:30",
    durationMinutes: 120,
    timeOfDay: "evening",
    mealType: "dinner",
    isFlexible: true,
    isRequired: true,
  },
];

const PACKED_DAY_SLOTS: Omit<TimeSlot, "id">[] = [
  {
    type: "activity",
    name: "Early Morning",
    startTime: "08:00",
    endTime: "10:00",
    durationMinutes: 120,
    timeOfDay: "early-morning",
    isFlexible: false,
    isRequired: false,
  },
  {
    type: "activity",
    name: "Morning Activity 1",
    startTime: "10:00",
    endTime: "11:30",
    durationMinutes: 90,
    timeOfDay: "morning",
    isFlexible: true,
    isRequired: false,
  },
  {
    type: "meal",
    name: "Quick Lunch",
    startTime: "11:30",
    endTime: "12:30",
    durationMinutes: 60,
    timeOfDay: "afternoon",
    mealType: "lunch",
    isFlexible: false,
    isRequired: true,
  },
  {
    type: "activity",
    name: "Afternoon Activity 1",
    startTime: "12:30",
    endTime: "14:30",
    durationMinutes: 120,
    timeOfDay: "afternoon",
    isFlexible: true,
    isRequired: false,
  },
  {
    type: "activity",
    name: "Afternoon Activity 2",
    startTime: "14:30",
    endTime: "16:30",
    durationMinutes: 120,
    timeOfDay: "afternoon",
    isFlexible: true,
    isRequired: false,
  },
  {
    type: "activity",
    name: "Late Afternoon",
    startTime: "16:30",
    endTime: "18:30",
    durationMinutes: 120,
    timeOfDay: "afternoon",
    isFlexible: true,
    isRequired: false,
  },
  {
    type: "meal",
    name: "Dinner",
    startTime: "18:30",
    endTime: "20:00",
    durationMinutes: 90,
    timeOfDay: "evening",
    mealType: "dinner",
    isFlexible: true,
    isRequired: true,
  },
  {
    type: "activity",
    name: "Evening Activity",
    startTime: "20:00",
    endTime: "22:00",
    durationMinutes: 120,
    timeOfDay: "evening",
    isFlexible: true,
    isRequired: false,
  },
  {
    type: "activity",
    name: "Night Activity",
    startTime: "22:00",
    endTime: "23:30",
    durationMinutes: 90,
    timeOfDay: "night",
    isFlexible: true,
    isRequired: false,
  },
];

const ARRIVAL_DAY_SLOTS: Omit<TimeSlot, "id">[] = [
  {
    type: "activity",
    name: "Afternoon Exploration",
    startTime: "15:00",
    endTime: "18:00",
    durationMinutes: 180,
    timeOfDay: "afternoon",
    isFlexible: true,
    isRequired: false,
  },
  {
    type: "meal",
    name: "Dinner",
    startTime: "18:30",
    endTime: "20:30",
    durationMinutes: 120,
    timeOfDay: "evening",
    mealType: "dinner",
    isFlexible: true,
    isRequired: true,
  },
  {
    type: "activity",
    name: "Evening Walk",
    startTime: "20:30",
    endTime: "22:00",
    durationMinutes: 90,
    timeOfDay: "evening",
    isFlexible: true,
    isRequired: false,
  },
];

const DEPARTURE_DAY_SLOTS: Omit<TimeSlot, "id">[] = [
  {
    type: "activity",
    name: "Morning Activity",
    startTime: "09:00",
    endTime: "11:00",
    durationMinutes: 120,
    timeOfDay: "morning",
    isFlexible: true,
    isRequired: false,
  },
  {
    type: "meal",
    name: "Brunch/Lunch",
    startTime: "11:00",
    endTime: "12:30",
    durationMinutes: 90,
    timeOfDay: "morning",
    mealType: "brunch",
    isFlexible: true,
    isRequired: true,
  },
];

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Parse time string to minutes since midnight
 */
function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

/**
 * Convert minutes since midnight to time string
 */
function minutesToTime(minutes: number): string {
  const hours = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return `${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}`;
}

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

/**
 * Parse a date string in "YYYY-MM-DD" format as LOCAL time.
 * Using `new Date("2026-03-15")` interprets as UTC midnight,
 * which causes date shift in timezones behind UTC.
 */
function parseDateLocal(dateStr: string): Date {
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const year = parseInt(parts[0], 10);
    const month = parseInt(parts[1], 10) - 1; // month is 0-indexed
    const day = parseInt(parts[2], 10);
    return new Date(year, month, day, 0, 0, 0, 0);
  }
  // Fallback (may have timezone issues)
  return new Date(dateStr);
}

/**
 * Calculate distance between two coordinates (Haversine formula)
 */
function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // Distance in meters
}

/**
 * Estimate commute time based on distance and mode
 */
function estimateCommuteTime(
  distanceMeters: number,
  mode: "walking" | "transit" | "taxi" | "mixed"
): number {
  // Walking: ~80m/min (4.8 km/h)
  // Transit: ~200m/min (12 km/h average including wait)
  // Taxi: ~400m/min (24 km/h in city traffic)

  switch (mode) {
    case "walking":
      return Math.ceil(distanceMeters / 80);
    case "transit":
      return Math.ceil(distanceMeters / 200) + 10; // +10 min for wait/transfer
    case "taxi":
      return Math.ceil(distanceMeters / 400) + 5; // +5 min for pickup
    case "mixed":
      return Math.ceil(distanceMeters / 150) + 5;
    default:
      return Math.ceil(distanceMeters / 100);
  }
}

/**
 * Determine best commute mode based on distance and settings
 */
function determineCommuteMode(
  distanceMeters: number,
  settings: UserExperienceSettings
): "walking" | "transit" | "taxi" | "mixed" {
  const maxWalkMeters = (settings.pace?.maxWalkMinutes || 20) * 80;

  if (distanceMeters <= maxWalkMeters) {
    return "walking";
  }

  const preference = settings.commutePreference || "balanced";

  // "scenic" preference favors walking even for longer distances
  if (preference === "scenic" && distanceMeters <= maxWalkMeters * 1.5) {
    return "walking";
  }

  // "shortest" preference uses fastest transport
  if (preference === "shortest") {
    return distanceMeters > 3000 ? "taxi" : "transit";
  }

  // "balanced" preference uses mix of transit and walking
  return distanceMeters > 5000 ? "transit" : "mixed";
}

// ============================================
// SLOT GENERATION
// ============================================

/**
 * Get time slots for a day based on pace and day type
 */
function getTimeSlotsForDay(
  settings: UserExperienceSettings,
  dayType: "full" | "arrival" | "departure" | "travel"
): TimeSlot[] {
  let baseSlots: Omit<TimeSlot, "id">[];

  // Select base slots based on day type
  switch (dayType) {
    case "arrival":
      baseSlots = ARRIVAL_DAY_SLOTS;
      break;
    case "departure":
      baseSlots = DEPARTURE_DAY_SLOTS;
      break;
    case "travel":
      return []; // No activities on travel days
    case "full":
    default:
      // Select based on pace
      const pace = settings.pace?.mode || "normal";
      switch (pace) {
        case "relaxed":
          baseSlots = RELAXED_DAY_SLOTS;
          break;
        case "ambitious":
          baseSlots = PACKED_DAY_SLOTS;
          break;
        default:
          baseSlots = DEFAULT_FULL_DAY_SLOTS;
      }
  }

  // Adjust start time based on settings
  const dayStart = settings.pace?.dayStart || "09:00";
  const dayEnd = settings.pace?.dayEnd || "21:00";
  const dayStartMinutes = timeToMinutes(dayStart);
  const dayEndMinutes = timeToMinutes(dayEnd);

  // Filter and adjust slots to fit within day bounds
  return baseSlots
    .map((slot, index) => ({
      ...slot,
      id: `slot-${index}-${generateId()}`,
    }))
    .filter((slot) => {
      const slotStart = timeToMinutes(slot.startTime);
      const slotEnd = timeToMinutes(slot.endTime);
      return slotStart >= dayStartMinutes && slotEnd <= dayEndMinutes;
    });
}

/**
 * Adjust slots for trip mode
 */
function adjustSlotsForTripMode(
  slots: TimeSlot[],
  tripMode: TripMode
): TimeSlot[] {
  switch (tripMode) {
    case "family":
      // Earlier end time, longer breaks
      return slots.filter((s) => timeToMinutes(s.endTime) <= timeToMinutes("21:00"));

    case "honeymoon":
    case "babymoon":
      // Later start, fewer activities
      return slots
        .filter((s) => timeToMinutes(s.startTime) >= timeToMinutes("10:00"))
        .slice(0, -1); // Remove last evening slot

    case "friends":
    case "guys-trip":
    case "girls-trip":
      // Later nights OK
      return slots;

    default:
      return slots;
  }
}

// ============================================
// ACTIVITY ALLOCATION
// ============================================

/**
 * Find best activity for a time slot
 */
function findBestActivityForSlot(
  slot: TimeSlot,
  availableActivities: ScoredActivity[],
  usedActivityIds: Set<string>,
  usedCategories: Set<string>,
  previousNeighborhood?: string
): { best: ScoredActivity | null; alternatives: ScoredActivity[] } {
  // Filter activities that haven't been used
  let candidates = availableActivities.filter(
    (a) => !usedActivityIds.has(a.activity.id)
  );

  // For meal slots, filter to restaurants only (restaurants have mealType property)
  if (slot.type === "meal" && slot.mealType) {
    candidates = candidates.filter((a) => {
      const activity = a.activity as RestaurantActivity;
      return (
        activity.mealType !== undefined &&
        activity.mealType.includes(slot.mealType!)
      );
    });
  } else {
    // For activity slots, exclude restaurants (activities without mealType)
    candidates = candidates.filter(
      (a) => (a.activity as RestaurantActivity).mealType === undefined
    );
  }

  // Filter by time of day fit
  candidates = candidates.filter((a) =>
    a.activity.bestTimeOfDay.includes(slot.timeOfDay)
  );

  // Filter by duration fit (activity should fit in slot)
  candidates = candidates.filter(
    (a) => a.activity.recommendedDuration <= slot.durationMinutes + 30 // Allow 30min overflow
  );

  // Boost score for activities in same neighborhood (reduce commute)
  if (previousNeighborhood) {
    candidates = candidates.map((a) => ({
      ...a,
      totalScore:
        a.totalScore +
        (a.activity.neighborhood === previousNeighborhood ? 10 : 0),
    }));
  }

  // Penalize repeat categories
  candidates = candidates.map((a) => ({
    ...a,
    totalScore:
      a.totalScore -
      (usedCategories.has((a.activity as CoreActivity).category) ? 5 : 0),
  }));

  // Sort by adjusted score
  candidates.sort((a, b) => b.totalScore - a.totalScore);

  // Return best and alternatives
  return {
    best: candidates[0] || null,
    alternatives: candidates.slice(1, 4),
  };
}

/**
 * Calculate commute between two activities
 */
function calculateCommute(
  fromActivity: CoreActivity | RestaurantActivity,
  toActivity: CoreActivity | RestaurantActivity,
  settings: UserExperienceSettings
): CommuteInfo {
  const from = fromActivity.location;
  const to = toActivity.location;

  // Calculate distance
  const distance = calculateDistance(from.lat, from.lng, to.lat, to.lng);

  // Determine mode
  const mode = determineCommuteMode(distance, settings);

  // Estimate time
  const duration = estimateCommuteTime(distance, mode);

  return {
    fromActivityId: fromActivity.id,
    toActivityId: toActivity.id,
    durationMinutes: duration,
    distanceMeters: Math.round(distance),
    mode,
    walkingRoute:
      mode === "walking"
        ? `Walk from ${fromActivity.neighborhood} to ${toActivity.neighborhood}`
        : undefined,
  };
}

// ============================================
// GEOGRAPHIC OPTIMIZATION
// ============================================

interface ActivityWithLocation {
  activity: ScoredActivity;
  slot: TimeSlot;
}

/**
 * Optimize activity order to minimize commute times
 */
function optimizeGeographicFlow(
  scheduled: ScheduledActivity[],
  _settings: UserExperienceSettings
): ScheduledActivity[] {
  if (scheduled.length <= 2) return scheduled;

  // Extract activities with their assigned slots
  const items: ActivityWithLocation[] = scheduled.map((s, i) => ({
    activity: s.activity,
    slot: {
      id: s.slotId,
      type: "activity",
      name: "",
      startTime: s.scheduledStart,
      endTime: s.scheduledEnd,
      durationMinutes: s.actualDuration,
      timeOfDay: "morning" as TimeOfDay,
      isFlexible: true,
      isRequired: false,
    },
  }));

  // Group by neighborhood
  const neighborhoodGroups = new Map<string, ActivityWithLocation[]>();
  for (const item of items) {
    const neighborhood = item.activity.activity.neighborhood || "unknown";
    if (!neighborhoodGroups.has(neighborhood)) {
      neighborhoodGroups.set(neighborhood, []);
    }
    neighborhoodGroups.get(neighborhood)!.push(item);
  }

  // If activities are clustered in neighborhoods, try to group them
  if (neighborhoodGroups.size > 1 && neighborhoodGroups.size < items.length) {
    // Check if we can swap activities to reduce commute
    // This is a simplified optimization - full solution would use TSP algorithm
    const optimized: ScheduledActivity[] = [];
    let currentNeighborhood = items[0]?.activity.activity.neighborhood;

    // Greedy: pick nearest neighborhood next
    const usedItems = new Set<number>();

    for (let _i = 0; _i < items.length; _i++) {
      let bestIdx = -1;
      let bestDistance = Infinity;

      for (let j = 0; j < items.length; j++) {
        if (usedItems.has(j)) continue;

        const item = items[j];
        // Prefer same neighborhood
        if (item.activity.activity.neighborhood === currentNeighborhood) {
          bestIdx = j;
          break;
        }

        // Calculate distance to find nearest
        if (optimized.length > 0) {
          const prev = optimized[optimized.length - 1].activity.activity;
          const curr = item.activity.activity;
          const dist = calculateDistance(
            prev.location.lat,
            prev.location.lng,
            curr.location.lat,
            curr.location.lng
          );
          if (dist < bestDistance) {
            bestDistance = dist;
            bestIdx = j;
          }
        } else {
          bestIdx = j;
          break;
        }
      }

      if (bestIdx >= 0) {
        usedItems.add(bestIdx);
        const item = items[bestIdx];
        currentNeighborhood = item.activity.activity.neighborhood;
        optimized.push(scheduled[bestIdx]);
      }
    }

    // Reassign times to match slot order
    return reassignTimes(optimized, scheduled);
  }

  return scheduled;
}

/**
 * Reassign times after reordering
 */
function reassignTimes(
  optimized: ScheduledActivity[],
  original: ScheduledActivity[]
): ScheduledActivity[] {
  return optimized.map((activity, idx) => ({
    ...activity,
    slotId: original[idx].slotId,
    scheduledStart: original[idx].scheduledStart,
    scheduledEnd: original[idx].scheduledEnd,
  }));
}

// ============================================
// SCHEDULE VALIDATION
// ============================================

/**
 * Generate warnings for schedule issues
 */
function generateWarnings(
  schedule: ScheduledActivity[],
  settings: UserExperienceSettings,
  weather?: WeatherForecast
): ScheduleWarning[] {
  const warnings: ScheduleWarning[] = [];

  // Check for overlaps
  for (let i = 0; i < schedule.length - 1; i++) {
    const current = schedule[i];
    const next = schedule[i + 1];

    const currentEnd = timeToMinutes(current.scheduledEnd);
    const nextStart = timeToMinutes(next.scheduledStart);
    const commuteTime = next.commuteFromPrevious?.durationMinutes || 0;

    if (currentEnd + commuteTime > nextStart) {
      warnings.push({
        type: "overlap",
        severity: "warning",
        message: `Not enough time between ${current.activity.activity.name} and ${next.activity.activity.name}`,
        affectedSlots: [current.slotId, next.slotId],
        suggestion: `Consider shortening ${current.activity.activity.name} or starting ${next.activity.activity.name} later`,
      });
    }

    // Check for rushed transitions
    const buffer = nextStart - currentEnd - commuteTime;
    if (buffer < 10 && buffer >= 0) {
      warnings.push({
        type: "rush",
        severity: "info",
        message: `Tight transition (${buffer} min buffer) between activities`,
        affectedSlots: [current.slotId, next.slotId],
      });
    }
  }

  // Check for long commutes
  for (const item of schedule) {
    if (item.commuteFromPrevious && item.commuteFromPrevious.durationMinutes > 45) {
      warnings.push({
        type: "long-commute",
        severity: "warning",
        message: `Long commute (${item.commuteFromPrevious.durationMinutes} min) to ${item.activity.activity.name}`,
        affectedSlots: [item.slotId],
        suggestion: "Consider reordering activities or using faster transport",
      });
    }
  }

  // Check weather for outdoor activities
  if (weather) {
    const isRainy = weather.condition.toLowerCase().includes("rain");
    const temp = typeof weather.temperature === "number"
      ? weather.temperature
      : weather.temperature.max;
    const isTooHot = temp > 35;
    const isTooCold = temp < 5;

    for (const item of schedule) {
      const activity = item.activity.activity;
      if (activity.isOutdoor && activity.weatherSensitive) {
        if (isRainy) {
          warnings.push({
            type: "weather",
            severity: "warning",
            message: `${activity.name} is outdoor and rain is expected`,
            affectedSlots: [item.slotId],
            suggestion: "Have a backup indoor activity ready",
          });
        }
        if (isTooHot || isTooCold) {
          warnings.push({
            type: "weather",
            severity: "info",
            message: `Extreme temperature (${temp}°C) for outdoor activity`,
            affectedSlots: [item.slotId],
          });
        }
      }
    }
  }

  // Check pace
  const totalActivityTime = schedule.reduce(
    (sum, s) => sum + s.actualDuration,
    0
  );
  const _totalCommuteTime = schedule.reduce(
    (sum, s) => sum + (s.commuteFromPrevious?.durationMinutes || 0),
    0
  );
  const paceMode = settings.pace?.mode || "normal";

  if (paceMode === "relaxed" && totalActivityTime > 360) {
    warnings.push({
      type: "pace",
      severity: "warning",
      message: "Schedule may be too packed for relaxed pace preference",
      suggestion: "Consider removing one activity",
    });
  }

  // Check for late night activities with family
  if (settings.tripMode === "family" || settings.tripMode === "multi-generational") {
    for (const item of schedule) {
      const endMinutes = timeToMinutes(item.scheduledEnd);
      if (endMinutes > timeToMinutes("21:00")) {
        warnings.push({
          type: "late-night",
          severity: "info",
          message: `${item.activity.activity.name} ends late for a family trip`,
          affectedSlots: [item.slotId],
        });
      }
    }
  }

  return warnings;
}

/**
 * Calculate pace score (0-100)
 */
function calculatePaceScore(
  schedule: ScheduledActivity[],
  dayType: "full" | "arrival" | "departure" | "travel"
): number {
  if (dayType !== "full" || schedule.length === 0) return 50;

  const totalActivityTime = schedule.reduce(
    (sum, s) => sum + s.actualDuration,
    0
  );
  const totalCommuteTime = schedule.reduce(
    (sum, s) => sum + (s.commuteFromPrevious?.durationMinutes || 0),
    0
  );

  // Calculate based on activity density
  // Relaxed: ~300 min activities, Packed: ~600+ min
  const baseScore = Math.min(100, (totalActivityTime / 600) * 100);

  // Penalize heavy commute
  const commutePenalty = Math.min(20, (totalCommuteTime / 120) * 20);

  return Math.round(Math.max(0, baseScore - commutePenalty));
}

// ============================================
// MAIN SCHEDULE BUILDER CLASS
// ============================================

export class ScheduleBuilder {
  private settings: UserExperienceSettings;

  constructor(settings: UserExperienceSettings) {
    this.settings = settings;
  }

  /**
   * Build a day schedule
   */
  buildDaySchedule(request: BuildScheduleRequest): DaySchedule {
    const {
      destination,
      date,
      dayNumber,
      dayType,
      activities,
      restaurants,
      weather,
      previousDayEndLocation,
    } = request;

    // Get time slots for the day
    let slots = getTimeSlotsForDay(this.settings, dayType);
    slots = adjustSlotsForTripMode(slots, this.settings.tripMode);

    // Combine activities and restaurants for allocation
    const allActivities = [...activities, ...restaurants];

    // Track used activities and categories
    const usedActivityIds = new Set<string>();
    const usedCategories = new Set<string>();

    // Build schedule by filling slots
    const scheduledActivities: ScheduledActivity[] = [];
    let previousNeighborhood = previousDayEndLocation?.name;

    for (const slot of slots) {
      const { best, alternatives } = findBestActivityForSlot(
        slot,
        allActivities,
        usedActivityIds,
        usedCategories,
        previousNeighborhood
      );

      if (best) {
        usedActivityIds.add(best.activity.id);
        usedCategories.add((best.activity as CoreActivity).category);

        // Calculate commute from previous
        let commuteFromPrevious: CommuteInfo | undefined;
        if (scheduledActivities.length > 0) {
          const previousActivity =
            scheduledActivities[scheduledActivities.length - 1].activity.activity;
          commuteFromPrevious = calculateCommute(
            previousActivity,
            best.activity,
            this.settings
          );
        }

        // Calculate actual duration (may be compressed to fit)
        const availableTime =
          timeToMinutes(slot.endTime) -
          timeToMinutes(slot.startTime) -
          (commuteFromPrevious?.durationMinutes || 0);
        const actualDuration = Math.min(
          best.activity.recommendedDuration,
          availableTime
        );

        // Calculate scheduled times accounting for commute
        const startMinutes =
          timeToMinutes(slot.startTime) +
          (commuteFromPrevious?.durationMinutes || 0);
        const endMinutes = startMinutes + actualDuration;

        scheduledActivities.push({
          slotId: slot.id,
          activity: best,
          scheduledStart: minutesToTime(startMinutes),
          scheduledEnd: minutesToTime(endMinutes),
          actualDuration,
          isLocked: false,
          alternatives,
          commuteFromPrevious,
        });

        previousNeighborhood = best.activity.neighborhood;
      }
    }

    // Optimize geographic flow
    const optimizedSchedule = optimizeGeographicFlow(
      scheduledActivities,
      this.settings
    );

    // Recalculate commutes after optimization
    for (let i = 1; i < optimizedSchedule.length; i++) {
      const prev = optimizedSchedule[i - 1].activity.activity;
      const curr = optimizedSchedule[i].activity.activity;
      optimizedSchedule[i].commuteFromPrevious = calculateCommute(
        prev,
        curr,
        this.settings
      );
    }

    // Generate warnings
    const warnings = generateWarnings(optimizedSchedule, this.settings, weather);

    // Calculate totals
    const totalActivityTime = optimizedSchedule.reduce(
      (sum, s) => sum + s.actualDuration,
      0
    );
    const totalCommuteTime = optimizedSchedule.reduce(
      (sum, s) => sum + (s.commuteFromPrevious?.durationMinutes || 0),
      0
    );

    // Calculate total cost
    const totalCost = optimizedSchedule.reduce(
      (sum, s) => {
        const cost = s.activity.activity.estimatedCost;
        if (cost) {
          return {
            amount: sum.amount + cost.amount,
            currency: cost.currency, // Assume same currency
          };
        }
        return sum;
      },
      { amount: 0, currency: "USD" }
    );

    // Collect neighborhoods and categories
    const neighborhoodsVisited = [
      ...new Set(optimizedSchedule.map((s) => s.activity.activity.neighborhood)),
    ];
    const categoriesCovered = [
      ...new Set(
        optimizedSchedule.map((s) => (s.activity.activity as CoreActivity).category)
      ),
    ];

    return {
      date,
      dayNumber,
      city: destination,
      dayType,
      slots: optimizedSchedule,
      totalActivityTime,
      totalCommuteTime,
      totalCost,
      neighborhoodsVisited,
      categoriesCovered,
      weather,
      warnings,
      paceScore: calculatePaceScore(optimizedSchedule, dayType),
    };
  }

  /**
   * Build a full trip schedule
   */
  async buildTripSchedule(
    tripId: string,
    destination: string,
    startDate: string,
    endDate: string,
    activitiesByCity: Map<string, ScoredActivity[]>,
    restaurantsByCity: Map<string, ScoredActivity[]>,
    weatherByDate?: Map<string, WeatherForecast>
  ): Promise<TripSchedule> {
    // Parse dates as local time to avoid timezone shift issues
    const start = parseDateLocal(startDate);
    const end = parseDateLocal(endDate);
    const numDays =
      Math.ceil((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)) + 1;

    const days: DaySchedule[] = [];
    const cities = destination.split(",").map((c) => c.trim());
    const mainCity = cities[0];

    for (let i = 0; i < numDays; i++) {
      const currentDate = new Date(start);
      currentDate.setDate(currentDate.getDate() + i);
      const dateStr = currentDate.toISOString().split("T")[0];

      // Determine day type
      let dayType: "full" | "arrival" | "departure" | "travel" = "full";
      if (i === 0) dayType = "arrival";
      if (i === numDays - 1) dayType = "departure";

      // Get activities and restaurants for this city
      const cityActivities = activitiesByCity.get(mainCity) || [];
      const cityRestaurants = restaurantsByCity.get(mainCity) || [];

      // Filter out already-used activities from previous days
      const usedIds = new Set(
        days.flatMap((d) => d.slots.map((s) => s.activity.activity.id))
      );
      const availableActivities = cityActivities.filter(
        (a) => !usedIds.has(a.activity.id)
      );
      const availableRestaurants = cityRestaurants.filter(
        (r) => !usedIds.has(r.activity.id)
      );

      // Get weather for this date
      const weather = weatherByDate?.get(dateStr);

      // Get previous day's end location
      const previousDayEndLocation =
        i > 0 && days[i - 1].slots.length > 0
          ? {
              lat: days[i - 1].slots[days[i - 1].slots.length - 1].activity
                .activity.location.lat,
              lng: days[i - 1].slots[days[i - 1].slots.length - 1].activity
                .activity.location.lng,
              name: days[i - 1].slots[days[i - 1].slots.length - 1].activity
                .activity.neighborhood,
            }
          : undefined;

      // Build day schedule
      const daySchedule = this.buildDaySchedule({
        destination: mainCity,
        date: dateStr,
        dayNumber: i + 1,
        dayType,
        activities: availableActivities,
        restaurants: availableRestaurants,
        settings: this.settings,
        weather,
        previousDayEndLocation,
      });

      days.push(daySchedule);
    }

    return {
      tripId,
      destination,
      startDate,
      endDate,
      days,
      totalDays: numDays,
      citiesVisited: cities,
      settings: this.settings,
      createdAt: new Date().toISOString(),
      lastModified: new Date().toISOString(),
    };
  }

  /**
   * Swap an activity in a slot
   */
  swapActivity(
    schedule: DaySchedule,
    slotId: string,
    newActivity: ScoredActivity
  ): DaySchedule {
    const slotIndex = schedule.slots.findIndex((s) => s.slotId === slotId);
    if (slotIndex === -1) return schedule;

    const slot = schedule.slots[slotIndex];
    const oldAlternatives = [slot.activity, ...slot.alternatives].filter(
      (a) => a.activity.id !== newActivity.activity.id
    );

    // Update the slot with new activity
    const updatedSlot: ScheduledActivity = {
      ...slot,
      activity: newActivity,
      alternatives: oldAlternatives.slice(0, 3),
      isLocked: false,
    };

    // Recalculate commute from previous
    if (slotIndex > 0) {
      const prevActivity = schedule.slots[slotIndex - 1].activity.activity;
      updatedSlot.commuteFromPrevious = calculateCommute(
        prevActivity,
        newActivity.activity,
        this.settings
      );
    }

    // Update schedule
    const updatedSlots = [...schedule.slots];
    updatedSlots[slotIndex] = updatedSlot;

    // Recalculate commute to next
    if (slotIndex < updatedSlots.length - 1) {
      const nextSlot = updatedSlots[slotIndex + 1];
      nextSlot.commuteFromPrevious = calculateCommute(
        newActivity.activity,
        nextSlot.activity.activity,
        this.settings
      );
    }

    // Regenerate warnings
    const warnings = generateWarnings(updatedSlots, this.settings, schedule.weather);

    // Recalculate totals
    const totalActivityTime = updatedSlots.reduce(
      (sum, s) => sum + s.actualDuration,
      0
    );
    const totalCommuteTime = updatedSlots.reduce(
      (sum, s) => sum + (s.commuteFromPrevious?.durationMinutes || 0),
      0
    );

    return {
      ...schedule,
      slots: updatedSlots,
      warnings,
      totalActivityTime,
      totalCommuteTime,
      neighborhoodsVisited: [
        ...new Set(updatedSlots.map((s) => s.activity.activity.neighborhood)),
      ],
      categoriesCovered: [
        ...new Set(
          updatedSlots.map((s) => (s.activity.activity as CoreActivity).category)
        ),
      ],
      paceScore: calculatePaceScore(updatedSlots, schedule.dayType),
    };
  }

  /**
   * Lock/unlock an activity
   */
  toggleLock(schedule: DaySchedule, slotId: string): DaySchedule {
    const updatedSlots = schedule.slots.map((s) =>
      s.slotId === slotId ? { ...s, isLocked: !s.isLocked } : s
    );

    return {
      ...schedule,
      slots: updatedSlots,
    };
  }

  /**
   * Remove an activity from a slot
   */
  removeActivity(schedule: DaySchedule, slotId: string): DaySchedule {
    const updatedSlots = schedule.slots.filter((s) => s.slotId !== slotId);

    // Recalculate commutes after removal
    for (let i = 1; i < updatedSlots.length; i++) {
      const prev = updatedSlots[i - 1].activity.activity;
      const curr = updatedSlots[i].activity.activity;
      updatedSlots[i].commuteFromPrevious = calculateCommute(
        prev,
        curr,
        this.settings
      );
    }

    const warnings = generateWarnings(updatedSlots, this.settings, schedule.weather);

    return {
      ...schedule,
      slots: updatedSlots,
      warnings,
      totalActivityTime: updatedSlots.reduce(
        (sum, s) => sum + s.actualDuration,
        0
      ),
      totalCommuteTime: updatedSlots.reduce(
        (sum, s) => sum + (s.commuteFromPrevious?.durationMinutes || 0),
        0
      ),
      paceScore: calculatePaceScore(updatedSlots, schedule.dayType),
    };
  }

  /**
   * Apply a day template
   */
  applyTemplate(
    schedule: DaySchedule,
    template: DayTemplate,
    activities: ScoredActivity[],
    restaurants: ScoredActivity[]
  ): DaySchedule {
    const allActivities = [...activities, ...restaurants];
    const scheduledActivities: ScheduledActivity[] = [];

    for (const templateSlot of template.slots) {
      // Find matching activity by ID or category
      let matchingActivity: ScoredActivity | undefined;

      if (templateSlot.activityId) {
        matchingActivity = allActivities.find(
          (a) => a.activity.id === templateSlot.activityId
        );
      } else if (templateSlot.activityCategory) {
        matchingActivity = allActivities.find(
          (a) => (a.activity as CoreActivity).category === templateSlot.activityCategory
        );
      }

      if (matchingActivity) {
        const startMinutes = timeToMinutes(templateSlot.time);
        const endMinutes = startMinutes + templateSlot.duration;

        // Calculate commute
        let commute: CommuteInfo | undefined;
        if (scheduledActivities.length > 0) {
          const prev = scheduledActivities[scheduledActivities.length - 1].activity.activity;
          commute = calculateCommute(prev, matchingActivity.activity, this.settings);
        }

        scheduledActivities.push({
          slotId: `template-slot-${scheduledActivities.length}`,
          activity: matchingActivity,
          scheduledStart: templateSlot.time,
          scheduledEnd: minutesToTime(endMinutes),
          actualDuration: templateSlot.duration,
          isLocked: false,
          alternatives: [],
          commuteFromPrevious: commute,
          notes: templateSlot.notes,
        });
      }
    }

    const warnings = generateWarnings(scheduledActivities, this.settings, schedule.weather);

    return {
      ...schedule,
      slots: scheduledActivities,
      warnings,
      totalActivityTime: scheduledActivities.reduce(
        (sum, s) => sum + s.actualDuration,
        0
      ),
      totalCommuteTime: scheduledActivities.reduce(
        (sum, s) => sum + (s.commuteFromPrevious?.durationMinutes || 0),
        0
      ),
      neighborhoodsVisited: [
        ...new Set(scheduledActivities.map((s) => s.activity.activity.neighborhood)),
      ],
      categoriesCovered: [
        ...new Set(
          scheduledActivities.map((s) => (s.activity.activity as CoreActivity).category)
        ),
      ],
      paceScore: calculatePaceScore(scheduledActivities, schedule.dayType),
    };
  }
}

// ============================================
// FACTORY FUNCTIONS
// ============================================

/**
 * Create a schedule builder
 */
export function createScheduleBuilder(
  settings: UserExperienceSettings
): ScheduleBuilder {
  return new ScheduleBuilder(settings);
}

/**
 * Quick build for a single day
 */
export function buildQuickDaySchedule(
  destination: string,
  date: string,
  activities: ScoredActivity[],
  restaurants: ScoredActivity[],
  settings: UserExperienceSettings
): DaySchedule {
  const builder = createScheduleBuilder(settings);
  return builder.buildDaySchedule({
    destination,
    date,
    dayNumber: 1,
    dayType: "full",
    activities,
    restaurants,
    settings,
  });
}

// ============================================
// EXPORTS
// ============================================

export {
  getTimeSlotsForDay,
  adjustSlotsForTripMode,
  calculateCommute,
  generateWarnings,
  calculatePaceScore,
  timeToMinutes,
  minutesToTime,
};

export default ScheduleBuilder;
