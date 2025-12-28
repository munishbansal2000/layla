/**
 * Popular Times & Crowd Prediction Service
 *
 * Provides crowd level predictions and optimal visit timing including:
 * - Real-time busyness estimates
 * - Popular times by hour/day
 * - Wait time predictions
 * - Optimal visit scheduling
 *
 * Data Sources:
 * - Google Places API (popular_times field)
 * - Historical patterns
 * - Event calendars
 */

// ============================================
// TYPES
// ============================================

export type CrowdLevel = "empty" | "not_busy" | "somewhat_busy" | "busy" | "very_busy" | "unknown";

export interface PopularTimes {
  placeId: string;
  placeName: string;
  currentBusyness?: number; // 0-100
  currentCrowdLevel: CrowdLevel;
  isOpen: boolean;
  weeklyPattern: DayPattern[];
  bestTimes: TimeSlotRecommendation[];
  waitTime?: {
    current: number; // minutes
    typical: number;
  };
}

export interface DayPattern {
  dayOfWeek: number; // 0 = Sunday
  dayName: string;
  hourlyBusyness: HourlyBusyness[];
  peakHours: string[];
  quietHours: string[];
}

export interface HourlyBusyness {
  hour: number; // 0-23
  busyness: number; // 0-100
  crowdLevel: CrowdLevel;
  typicalWait?: number; // minutes
}

export interface TimeSlotRecommendation {
  dayOfWeek: number;
  dayName: string;
  timeRange: string; // e.g., "9:00 AM - 11:00 AM"
  crowdLevel: CrowdLevel;
  score: number; // 0-100, higher is better
  reason: string;
}

export interface CrowdPrediction {
  placeId: string;
  timestamp: string;
  predictedBusyness: number;
  crowdLevel: CrowdLevel;
  confidence: number; // 0-1
  factors: string[];
}

export interface VisitOptimization {
  originalTime: string;
  optimizedTime: string;
  expectedCrowdReduction: number; // percentage
  waitTimeSaved: number; // minutes
  tradeoffs?: string[];
}

// ============================================
// ATTRACTION CATEGORY PATTERNS
// ============================================

// Typical busy patterns by attraction type
const CATEGORY_PATTERNS: Record<string, { peakHours: number[]; peakDays: number[] }> = {
  museum: {
    peakHours: [11, 12, 13, 14, 15], // Late morning to afternoon
    peakDays: [0, 6], // Weekends
  },
  restaurant: {
    peakHours: [12, 13, 19, 20], // Lunch and dinner
    peakDays: [5, 6], // Friday, Saturday
  },
  park: {
    peakHours: [10, 11, 14, 15, 16], // Mid-morning and afternoon
    peakDays: [0, 6], // Weekends
  },
  shopping: {
    peakHours: [12, 13, 14, 15, 16, 17], // Afternoon
    peakDays: [6, 0], // Weekend
  },
  temple_shrine: {
    peakHours: [10, 11], // Morning
    peakDays: [0], // Sunday
  },
  nightlife: {
    peakHours: [21, 22, 23, 0, 1], // Late night
    peakDays: [5, 6], // Friday, Saturday
  },
  beach: {
    peakHours: [11, 12, 13, 14, 15], // Midday
    peakDays: [0, 6], // Weekends
  },
  viewpoint: {
    peakHours: [6, 7, 17, 18, 19], // Sunrise and sunset
    peakDays: [0, 6], // Weekends
  },
};

// Seasonal adjustments
const SEASONAL_FACTORS: Record<string, Record<string, number>> = {
  summer: {
    beach: 1.5,
    park: 1.3,
    museum: 0.9,
    indoor: 0.8,
  },
  winter: {
    beach: 0.4,
    park: 0.7,
    museum: 1.2,
    indoor: 1.3,
  },
  holiday: {
    all: 1.5,
  },
};

// ============================================
// DAY NAMES
// ============================================

const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

// ============================================
// CONFIGURATION CHECK
// ============================================

export function isPopularTimesConfigured(): boolean {
  // This service works with fallback patterns even without API
  return true;
}

// ============================================
// POPULAR TIMES FUNCTIONS
// ============================================

/**
 * Get popular times for a place
 */
export async function getPopularTimes(
  placeId: string,
  placeName: string,
  category?: string
): Promise<PopularTimes> {
  // Try to get from Google Places if available
  // For now, generate based on category patterns
  const pattern = CATEGORY_PATTERNS[category || "museum"] || CATEGORY_PATTERNS.museum;

  const weeklyPattern = generateWeeklyPattern(pattern);
  const currentHour = new Date().getHours();
  const currentDay = new Date().getDay();

  const todayPattern = weeklyPattern[currentDay];
  const currentBusyness = todayPattern?.hourlyBusyness.find(
    (h) => h.hour === currentHour
  )?.busyness;

  return {
    placeId,
    placeName,
    currentBusyness,
    currentCrowdLevel: busynessToCrowdLevel(currentBusyness || 0),
    isOpen: true, // Would need hours data
    weeklyPattern,
    bestTimes: findBestTimes(weeklyPattern),
  };
}

/**
 * Generate weekly pattern from category
 */
function generateWeeklyPattern(
  pattern: { peakHours: number[]; peakDays: number[] }
): DayPattern[] {
  return DAY_NAMES.map((dayName, dayIndex) => {
    const isPeakDay = pattern.peakDays.includes(dayIndex);
    const dayMultiplier = isPeakDay ? 1.3 : 1.0;

    const hourlyBusyness: HourlyBusyness[] = [];
    const peakHours: string[] = [];
    const quietHours: string[] = [];

    for (let hour = 0; hour < 24; hour++) {
      const isPeakHour = pattern.peakHours.includes(hour);
      let busyness = 20; // Base level

      if (hour >= 6 && hour <= 22) {
        // Open hours
        if (isPeakHour) {
          busyness = 70 + Math.random() * 20;
        } else if (hour >= 9 && hour <= 18) {
          busyness = 40 + Math.random() * 20;
        } else {
          busyness = 25 + Math.random() * 15;
        }
      } else {
        busyness = 5; // Closed/very quiet
      }

      busyness = Math.min(100, busyness * dayMultiplier);
      const crowdLevel = busynessToCrowdLevel(busyness);

      hourlyBusyness.push({
        hour,
        busyness: Math.round(busyness),
        crowdLevel,
      });

      const hourStr = formatHour(hour);
      if (busyness >= 70) {
        peakHours.push(hourStr);
      } else if (busyness <= 30 && hour >= 6 && hour <= 22) {
        quietHours.push(hourStr);
      }
    }

    return {
      dayOfWeek: dayIndex,
      dayName,
      hourlyBusyness,
      peakHours,
      quietHours,
    };
  });
}

/**
 * Find best times to visit
 */
function findBestTimes(weeklyPattern: DayPattern[]): TimeSlotRecommendation[] {
  const recommendations: TimeSlotRecommendation[] = [];

  for (const day of weeklyPattern) {
    // Find the best 2-hour windows
    let bestWindow = { start: 9, score: 0 };

    for (let startHour = 8; startHour <= 18; startHour++) {
      const hours = day.hourlyBusyness.filter(
        (h) => h.hour >= startHour && h.hour < startHour + 2
      );

      if (hours.length === 2) {
        const avgBusyness = (hours[0].busyness + hours[1].busyness) / 2;
        const score = 100 - avgBusyness;

        if (score > bestWindow.score) {
          bestWindow = { start: startHour, score };
        }
      }
    }

    if (bestWindow.score > 50) {
      recommendations.push({
        dayOfWeek: day.dayOfWeek,
        dayName: day.dayName,
        timeRange: `${formatHour(bestWindow.start)} - ${formatHour(bestWindow.start + 2)}`,
        crowdLevel: busynessToCrowdLevel(100 - bestWindow.score),
        score: Math.round(bestWindow.score),
        reason: bestWindow.score > 70 ? "Typically very quiet" : "Less crowded than usual",
      });
    }
  }

  return recommendations.sort((a, b) => b.score - a.score).slice(0, 3);
}

// ============================================
// CROWD PREDICTION FUNCTIONS
// ============================================

/**
 * Predict crowd levels for a future time
 */
export function predictCrowdLevel(
  category: string,
  targetTime: Date,
  options?: {
    isHoliday?: boolean;
    hasEvent?: boolean;
    weather?: "sunny" | "rainy" | "cold";
  }
): CrowdPrediction {
  const pattern = CATEGORY_PATTERNS[category] || CATEGORY_PATTERNS.museum;
  const hour = targetTime.getHours();
  const day = targetTime.getDay();

  let busyness = 30; // Base
  const factors: string[] = [];

  // Time of day factor
  if (pattern.peakHours.includes(hour)) {
    busyness += 35;
    factors.push("Peak hours");
  }

  // Day of week factor
  if (pattern.peakDays.includes(day)) {
    busyness += 20;
    factors.push("Weekend/peak day");
  }

  // Holiday factor
  if (options?.isHoliday) {
    busyness *= 1.4;
    factors.push("Holiday period");
  }

  // Event factor
  if (options?.hasEvent) {
    busyness *= 1.3;
    factors.push("Special event nearby");
  }

  // Weather factor
  if (options?.weather === "rainy") {
    if (["beach", "park", "viewpoint"].includes(category)) {
      busyness *= 0.5;
      factors.push("Rain reducing outdoor crowds");
    } else {
      busyness *= 1.2;
      factors.push("Rain driving visitors indoors");
    }
  }

  busyness = Math.min(100, Math.max(0, busyness));

  return {
    placeId: "",
    timestamp: targetTime.toISOString(),
    predictedBusyness: Math.round(busyness),
    crowdLevel: busynessToCrowdLevel(busyness),
    confidence: options?.isHoliday || options?.hasEvent ? 0.6 : 0.75,
    factors,
  };
}

/**
 * Get real-time crowd estimate
 */
export async function getCurrentCrowdLevel(
  placeId: string,
  category?: string
): Promise<{
  crowdLevel: CrowdLevel;
  busyness: number;
  waitTime?: number;
  lastUpdated: string;
}> {
  // In production, this would call Google Places API or other real-time sources
  const now = new Date();
  const prediction = predictCrowdLevel(category || "museum", now);

  return {
    crowdLevel: prediction.crowdLevel,
    busyness: prediction.predictedBusyness,
    waitTime: prediction.predictedBusyness > 70 ? 15 + Math.round(prediction.predictedBusyness / 5) : undefined,
    lastUpdated: now.toISOString(),
  };
}

// ============================================
// VISIT OPTIMIZATION
// ============================================

/**
 * Optimize visit time for less crowds
 */
export function optimizeVisitTime(
  category: string,
  preferredTime: Date,
  options?: {
    flexibilityHours?: number; // How flexible the time is
    preferMorning?: boolean;
    avoidMealtimes?: boolean;
  }
): VisitOptimization {
  const flexibility = options?.flexibilityHours || 2;
  const originalPrediction = predictCrowdLevel(category, preferredTime);

  let bestTime = preferredTime;
  let bestBusyness = originalPrediction.predictedBusyness;

  // Check times within flexibility window
  for (let offset = -flexibility; offset <= flexibility; offset += 0.5) {
    const candidateTime = new Date(preferredTime.getTime() + offset * 60 * 60 * 1000);
    const hour = candidateTime.getHours();

    // Skip if outside reasonable hours
    if (hour < 8 || hour > 20) continue;

    // Skip mealtimes if requested
    if (options?.avoidMealtimes && [12, 13, 18, 19].includes(hour)) continue;

    // Apply morning preference
    const morningBonus = options?.preferMorning && hour < 12 ? 5 : 0;

    const prediction = predictCrowdLevel(category, candidateTime);
    const adjustedBusyness = prediction.predictedBusyness - morningBonus;

    if (adjustedBusyness < bestBusyness) {
      bestBusyness = adjustedBusyness;
      bestTime = candidateTime;
    }
  }

  const reduction = originalPrediction.predictedBusyness - bestBusyness;
  const tradeoffs: string[] = [];

  if (bestTime.getHours() < 10) {
    tradeoffs.push("Earlier start required");
  }
  if (bestTime.getHours() !== preferredTime.getHours()) {
    tradeoffs.push("Schedule adjustment needed");
  }

  return {
    originalTime: preferredTime.toISOString(),
    optimizedTime: bestTime.toISOString(),
    expectedCrowdReduction: Math.round(reduction),
    waitTimeSaved: Math.round(reduction / 3), // Rough estimate
    tradeoffs: tradeoffs.length > 0 ? tradeoffs : undefined,
  };
}

/**
 * Reorder activities to minimize crowds
 */
export function optimizeActivityOrder(
  activities: Array<{
    id: string;
    name: string;
    category: string;
    preferredTime?: Date;
    duration: number; // minutes
  }>,
  startTime: Date
): Array<{
  activity: (typeof activities)[0];
  suggestedTime: Date;
  expectedCrowdLevel: CrowdLevel;
  reason: string;
}> {
  const result: Array<{
    activity: (typeof activities)[0];
    suggestedTime: Date;
    expectedCrowdLevel: CrowdLevel;
    reason: string;
  }> = [];

  let currentTime = new Date(startTime);

  // Sort activities by their optimal timing
  const sortedActivities = [...activities].sort((a, b) => {
    const aPeaks = CATEGORY_PATTERNS[a.category]?.peakHours || [12];
    const bPeaks = CATEGORY_PATTERNS[b.category]?.peakHours || [12];

    // Activities with early peaks should go first
    const aEarliest = Math.min(...aPeaks);
    const bEarliest = Math.min(...bPeaks);

    return bEarliest - aEarliest; // Reverse: schedule earlier-peaking venues later
  });

  for (const activity of sortedActivities) {
    const prediction = predictCrowdLevel(activity.category, currentTime);

    let reason = "Scheduled in sequence";
    if (prediction.crowdLevel === "not_busy" || prediction.crowdLevel === "empty") {
      reason = "Optimal time for this venue type";
    } else if (prediction.crowdLevel === "busy" || prediction.crowdLevel === "very_busy") {
      reason = "Expect moderate crowds at this time";
    }

    result.push({
      activity,
      suggestedTime: new Date(currentTime),
      expectedCrowdLevel: prediction.crowdLevel,
      reason,
    });

    // Add activity duration + 15 min buffer
    currentTime = new Date(currentTime.getTime() + (activity.duration + 15) * 60 * 1000);
  }

  return result;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert busyness score to crowd level
 */
function busynessToCrowdLevel(busyness: number): CrowdLevel {
  if (busyness <= 10) return "empty";
  if (busyness <= 30) return "not_busy";
  if (busyness <= 50) return "somewhat_busy";
  if (busyness <= 75) return "busy";
  return "very_busy";
}

/**
 * Format hour for display
 */
function formatHour(hour: number): string {
  if (hour === 0) return "12:00 AM";
  if (hour === 12) return "12:00 PM";
  if (hour < 12) return `${hour}:00 AM`;
  return `${hour - 12}:00 PM`;
}

/**
 * Get crowd level description
 */
export function getCrowdLevelDescription(level: CrowdLevel): string {
  switch (level) {
    case "empty":
      return "Empty - no wait expected";
    case "not_busy":
      return "Not busy - minimal wait";
    case "somewhat_busy":
      return "Somewhat busy - short waits possible";
    case "busy":
      return "Busy - expect moderate waits";
    case "very_busy":
      return "Very busy - long waits likely";
    default:
      return "Unknown";
  }
}

/**
 * Get crowd icon
 */
export function getCrowdIcon(level: CrowdLevel): string {
  switch (level) {
    case "empty":
      return "🟢";
    case "not_busy":
      return "🟢";
    case "somewhat_busy":
      return "🟡";
    case "busy":
      return "🟠";
    case "very_busy":
      return "🔴";
    default:
      return "⚪";
  }
}

export default {
  getPopularTimes,
  predictCrowdLevel,
  getCurrentCrowdLevel,
  optimizeVisitTime,
  optimizeActivityOrder,
  getCrowdLevelDescription,
  getCrowdIcon,
  isPopularTimesConfigured,
};
