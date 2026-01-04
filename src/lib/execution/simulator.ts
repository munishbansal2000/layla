// ============================================
// ITINERARY EXECUTION SIMULATOR
// ============================================
// Simulates end-to-end execution of an itinerary with random diversions.
// Useful for testing the execution engine and generating realistic scenarios.

import { DayWithOptions, SlotWithOptions, StructuredCommuteInfo } from "@/types/structured-itinerary";
import { Coordinates } from "@/types/activity-suggestion";
import {
  ActivityExecution,
  ExecutionMode,
  Geofence,
  UserLocation,
} from "@/types/execution";
import { createActivityExecution, transitionActivity } from "./activity-lifecycle";
import { createGeofencesForDay, detectGeofenceEvents, calculateDistance } from "./geofence-manager";
import { calculateExtensionImpact } from "./time-extension";
import {
  getSelectedActivity,
  getSlotActivityName,
  getSlotCoordinates,
  getSlotDuration,
  parseTimeToDate
} from "./execution-helpers";

// ============================================
// TYPES
// ============================================

/**
 * Types of diversions that can occur during execution
 */
export type DiversionType =
  | "late_start"           // Traveler starts the day late
  | "extended_stay"        // Stayed longer at an activity than planned
  | "early_departure"      // Left an activity early
  | "skip_activity"        // Skipped an activity entirely
  | "unplanned_stop"       // Made an unplanned stop (cafe, shop, photo op)
  | "got_lost"             // Got lost, wasted time finding the way
  | "slow_commute"         // Commute took longer than expected (traffic, missed train)
  | "fast_commute"         // Commute was faster than expected
  | "weather_delay"        // Weather caused a delay
  | "activity_closed"      // Activity was unexpectedly closed
  | "discovered_gem"       // Found an interesting place nearby
  | "meal_extension"       // Meal took longer than expected
  | "bathroom_break"       // Needed a bathroom break
  | "phone_call"           // Had to take a phone call
  | "souvenir_shopping"    // Stopped for souvenir shopping
  | "energy_low"           // Low energy, needed a rest
  | "perfect_timing";      // Everything went according to plan

/**
 * Configuration for diversion probabilities
 */
export interface DiversionConfig {
  type: DiversionType;
  probability: number;        // 0-1, chance of this happening
  minImpactMinutes: number;   // Minimum time impact
  maxImpactMinutes: number;   // Maximum time impact
  applicableTo?: string[];    // Activity categories this applies to (undefined = all)
  timeOfDayBias?: {           // Higher probability at certain times
    morning?: number;         // Multiplier for morning (before 12:00)
    afternoon?: number;       // Multiplier for afternoon (12:00-17:00)
    evening?: number;         // Multiplier for evening (after 17:00)
  };
}

/**
 * A diversion event that occurred during simulation
 */
export interface DiversionEvent {
  type: DiversionType;
  slotId: string;
  activityName: string;
  occurredAt: Date;
  impactMinutes: number;
  description: string;
}

/**
 * Simulation tick - represents a point in time during simulation
 */
export interface SimulationTick {
  time: Date;
  location: Coordinates;
  currentActivity: ActivityExecution | null;
  mode: ExecutionMode;
  events: SimulationEvent[];
  cumulativeDelay: number;
}

/**
 * Types of simulation events
 */
export type SimulationEventType =
  | "day_started"
  | "activity_started"
  | "activity_completed"
  | "activity_skipped"
  | "commute_started"
  | "commute_completed"
  | "diversion_occurred"
  | "geofence_entered"
  | "geofence_exited"
  | "delay_accumulated"
  | "schedule_adjusted"
  | "day_completed";

/**
 * An event that occurred during simulation
 */
export interface SimulationEvent {
  type: SimulationEventType;
  timestamp: Date;
  details: string;
  data?: Record<string, unknown>;
}

/**
 * Complete simulation result
 */
export interface SimulationResult {
  day: DayWithOptions;
  startTime: Date;
  endTime: Date;
  ticks: SimulationTick[];
  diversions: DiversionEvent[];
  summary: SimulationSummary;
  timeline: string[];
}

/**
 * Summary statistics of the simulation
 */
export interface SimulationSummary {
  plannedDurationMinutes: number;
  actualDurationMinutes: number;
  activitiesPlanned: number;
  activitiesCompleted: number;
  activitiesSkipped: number;
  totalDiversions: number;
  totalDelayMinutes: number;
  totalTimeSavedMinutes: number;
  averageActivityDuration: number;
  longestDelay: DiversionEvent | null;
  mostCommonDiversion: DiversionType | null;
}

/**
 * Simulator configuration
 */
export interface SimulatorConfig {
  /** Speed multiplier for simulation (1 = real-time, 60 = 1 min per second) */
  speedMultiplier: number;
  /** How often to update simulation state (simulated minutes) */
  tickIntervalMinutes: number;
  /** Diversion configurations */
  diversions: DiversionConfig[];
  /** Random seed for reproducibility (optional) */
  seed?: number;
  /** Whether to generate detailed logs */
  verbose: boolean;
  /** Starting location (hotel coordinates) */
  startLocation: Coordinates;
  /** Weather conditions affecting diversions */
  weatherCondition?: "sunny" | "cloudy" | "rainy" | "hot" | "cold";
  /** Day of week (affects some probabilities) */
  dayOfWeek?: number; // 0 = Sunday, 6 = Saturday
  /** Traveler energy level (0-1, affects diversion probability) */
  travelerEnergy?: number;
}

// ============================================
// DEFAULT DIVERSION CONFIGURATIONS
// ============================================

/**
 * Default realistic diversion probabilities
 */
export const DEFAULT_DIVERSIONS: DiversionConfig[] = [
  {
    type: "late_start",
    probability: 0.15,
    minImpactMinutes: 10,
    maxImpactMinutes: 45,
    timeOfDayBias: { morning: 2.0 },
  },
  {
    type: "extended_stay",
    probability: 0.25,
    minImpactMinutes: 10,
    maxImpactMinutes: 30,
    applicableTo: ["museum", "temple", "garden", "viewpoint", "market"],
  },
  {
    type: "early_departure",
    probability: 0.1,
    minImpactMinutes: -20,
    maxImpactMinutes: -5,
  },
  {
    type: "skip_activity",
    probability: 0.05,
    minImpactMinutes: 0,
    maxImpactMinutes: 0,
    timeOfDayBias: { evening: 1.5 },
  },
  {
    type: "unplanned_stop",
    probability: 0.2,
    minImpactMinutes: 5,
    maxImpactMinutes: 20,
    applicableTo: ["neighborhood", "market", "shopping"],
  },
  {
    type: "got_lost",
    probability: 0.08,
    minImpactMinutes: 5,
    maxImpactMinutes: 15,
  },
  {
    type: "slow_commute",
    probability: 0.2,
    minImpactMinutes: 5,
    maxImpactMinutes: 20,
    timeOfDayBias: { morning: 1.3, evening: 1.5 },
  },
  {
    type: "fast_commute",
    probability: 0.15,
    minImpactMinutes: -10,
    maxImpactMinutes: -3,
  },
  {
    type: "weather_delay",
    probability: 0.05,
    minImpactMinutes: 10,
    maxImpactMinutes: 30,
  },
  {
    type: "activity_closed",
    probability: 0.03,
    minImpactMinutes: 0,
    maxImpactMinutes: 0,
  },
  {
    type: "discovered_gem",
    probability: 0.1,
    minImpactMinutes: 15,
    maxImpactMinutes: 45,
    applicableTo: ["neighborhood", "walking-tour"],
  },
  {
    type: "meal_extension",
    probability: 0.3,
    minImpactMinutes: 10,
    maxImpactMinutes: 25,
    applicableTo: ["restaurant", "food", "cafe"],
  },
  {
    type: "bathroom_break",
    probability: 0.15,
    minImpactMinutes: 5,
    maxImpactMinutes: 10,
  },
  {
    type: "phone_call",
    probability: 0.05,
    minImpactMinutes: 5,
    maxImpactMinutes: 15,
  },
  {
    type: "souvenir_shopping",
    probability: 0.15,
    minImpactMinutes: 10,
    maxImpactMinutes: 30,
    applicableTo: ["market", "neighborhood", "shopping"],
    timeOfDayBias: { afternoon: 1.5 },
  },
  {
    type: "energy_low",
    probability: 0.1,
    minImpactMinutes: 15,
    maxImpactMinutes: 30,
    timeOfDayBias: { afternoon: 2.0 },
  },
  {
    type: "perfect_timing",
    probability: 0.3,
    minImpactMinutes: 0,
    maxImpactMinutes: 0,
  },
];

/**
 * Weather-based probability modifiers
 */
const WEATHER_MODIFIERS: Record<string, Record<DiversionType, number>> = {
  sunny: {
    extended_stay: 1.2,
    discovered_gem: 1.3,
    energy_low: 0.8,
    weather_delay: 0.1,
    perfect_timing: 1.2,
  } as Record<DiversionType, number>,
  rainy: {
    extended_stay: 0.7,
    weather_delay: 3.0,
    skip_activity: 1.5,
    unplanned_stop: 1.3,
    energy_low: 1.3,
  } as Record<DiversionType, number>,
  hot: {
    energy_low: 2.0,
    bathroom_break: 1.5,
    slow_commute: 1.3,
    extended_stay: 0.8,
  } as Record<DiversionType, number>,
  cold: {
    fast_commute: 1.3,
    early_departure: 1.5,
    unplanned_stop: 0.7,
  } as Record<DiversionType, number>,
  cloudy: {} as Record<DiversionType, number>,
};

// ============================================
// RANDOM NUMBER GENERATOR
// ============================================

/**
 * Seeded random number generator for reproducibility
 */
class SeededRandom {
  private seed: number;

  constructor(seed?: number) {
    this.seed = seed ?? Math.random() * 2147483647;
  }

  next(): number {
    this.seed = (this.seed * 16807) % 2147483647;
    return (this.seed - 1) / 2147483646;
  }

  nextInt(min: number, max: number): number {
    return Math.floor(this.next() * (max - min + 1)) + min;
  }

  pick<T>(array: T[]): T {
    return array[Math.floor(this.next() * array.length)];
  }
}

// ============================================
// ITINERARY SIMULATOR
// ============================================

/**
 * Main simulator class for executing itineraries with diversions
 */
export class ItinerarySimulator {
  private config: SimulatorConfig;
  private random: SeededRandom;
  private activities: Map<string, ActivityExecution>;
  private geofences: Geofence[];
  private currentLocation: Coordinates;
  private previousLocation: Coordinates | null;
  private currentTime: Date;
  private mode: ExecutionMode;
  private ticks: SimulationTick[];
  private diversions: DiversionEvent[];
  private timeline: string[];
  private cumulativeDelay: number;

  constructor(config: Partial<SimulatorConfig> = {}) {
    this.config = {
      speedMultiplier: 60,
      tickIntervalMinutes: 5,
      diversions: DEFAULT_DIVERSIONS,
      verbose: true,
      startLocation: { lat: 35.6762, lng: 139.6503 }, // Tokyo
      ...config,
    };

    this.random = new SeededRandom(this.config.seed);
    this.activities = new Map();
    this.geofences = [];
    this.currentLocation = this.config.startLocation;
    this.previousLocation = null;
    this.currentTime = new Date();
    this.mode = "idle";
    this.ticks = [];
    this.diversions = [];
    this.timeline = [];
    this.cumulativeDelay = 0;
  }

  /**
   * Run a complete simulation of a day
   */
  async simulate(day: DayWithOptions): Promise<SimulationResult> {
    const city = day.city || "Unknown";

    this.log(`\n${"=".repeat(60)}`);
    this.log(`🎬 STARTING SIMULATION: ${city} - Day ${day.dayNumber}`);
    this.log(`${"=".repeat(60)}\n`);

    // Initialize
    const baseDate = new Date(day.date);
    this.currentTime = parseTimeToDate(day.slots[0]?.timeRange.start || "09:00", baseDate);
    this.activities = new Map();
    this.geofences = createGeofencesForDay(day);
    this.ticks = [];
    this.diversions = [];
    this.timeline = [];
    this.cumulativeDelay = 0;
    this.mode = "active";

    // Initialize activity executions
    for (const slot of day.slots) {
      const execution = createActivityExecution(slot.slotId, slot, baseDate);
      this.activities.set(slot.slotId, execution);
    }

    // Check for late start diversion
    const lateStartDiversion = this.checkForDiversion("late_start", day.slots[0], "morning");
    if (lateStartDiversion) {
      this.applyDiversion(lateStartDiversion);
    }

    this.recordEvent("day_started", `Day started at ${this.formatTime(this.currentTime)}`);

    // Process each activity
    for (let i = 0; i < day.slots.length; i++) {
      const slot = day.slots[i];
      const execution = this.activities.get(slot.slotId)!;

      // Skip if already handled (e.g., activity_closed)
      if (execution.state === "skipped") {
        continue;
      }

      // Check for activity closed
      const closedDiversion = this.checkForDiversion("activity_closed", slot, this.getTimeOfDay());
      if (closedDiversion) {
        this.applyDiversion(closedDiversion);
        transitionActivity(execution, "external_trigger");
        execution.state = "skipped";
        this.activities.set(slot.slotId, execution);
        this.recordEvent("activity_skipped", `${getSlotActivityName(slot)} was closed! 🚫`);
        continue;
      }

      // Check for skip activity
      const skipDiversion = this.checkForDiversion("skip_activity", slot, this.getTimeOfDay());
      if (skipDiversion) {
        this.applyDiversion(skipDiversion);
        execution.state = "skipped";
        execution.skipReason = skipDiversion.description;
        this.activities.set(slot.slotId, execution);
        this.recordEvent("activity_skipped", `Skipped: ${getSlotActivityName(slot)}`);
        continue;
      }

      // Simulate commute to activity
      await this.simulateCommute(slot, i === 0);

      // Simulate the activity
      await this.simulateActivity(slot, execution);
    }

    // Complete the day
    this.mode = "winding_down";
    this.recordEvent("day_completed", `Day completed at ${this.formatTime(this.currentTime)}`);

    // Calculate summary
    const summary = this.calculateSummary(day);

    this.log(`\n${"=".repeat(60)}`);
    this.log(`✅ SIMULATION COMPLETE`);
    this.log(`${"=".repeat(60)}`);
    this.printSummary(summary);

    return {
      day,
      startTime: parseTimeToDate(day.slots[0]?.timeRange.start || "09:00", baseDate),
      endTime: this.currentTime,
      ticks: this.ticks,
      diversions: this.diversions,
      summary,
      timeline: this.timeline,
    };
  }

  /**
   * Simulate commute to an activity
   */
  private async simulateCommute(slot: SlotWithOptions, isFirst: boolean): Promise<void> {
    const commute = slot.commuteFromPrevious;
    let commuteTime = commute?.duration ?? 0;

    if (commuteTime === 0 && !isFirst) {
      commuteTime = 10; // Default 10 min if not specified
    }

    if (commuteTime === 0) {
      return;
    }

    const activityName = getSlotActivityName(slot);
    this.recordEvent("commute_started", `🚶 Heading to ${activityName} (${commuteTime} min)`);

    // Check for commute diversions
    const slowCommute = this.checkForDiversion("slow_commute", slot, this.getTimeOfDay());
    const fastCommute = this.checkForDiversion("fast_commute", slot, this.getTimeOfDay());
    const gotLost = this.checkForDiversion("got_lost", slot, this.getTimeOfDay());

    if (gotLost) {
      this.applyDiversion(gotLost);
      commuteTime += gotLost.impactMinutes;
    } else if (slowCommute) {
      this.applyDiversion(slowCommute);
      commuteTime += slowCommute.impactMinutes;
    } else if (fastCommute) {
      this.applyDiversion(fastCommute);
      commuteTime += fastCommute.impactMinutes;
    }

    // Advance time
    this.advanceTime(commuteTime);

    // Update location (interpolate to activity location)
    const activityCoords = getSlotCoordinates(slot);
    if (activityCoords) {
      this.previousLocation = this.currentLocation;
      this.currentLocation = activityCoords;

      // Check geofence events
      const { entered } = detectGeofenceEvents(
        this.previousLocation,
        this.currentLocation,
        this.geofences
      );

      for (const geofence of entered) {
        this.recordEvent("geofence_entered", `📍 Arrived at ${geofence.activityName || "location"}`, {
          geofenceId: geofence.id,
        });
      }
    }

    this.recordEvent("commute_completed", `Arrived at ${activityName}`);
    this.recordTick(slot.slotId);
  }

  /**
   * Simulate an activity
   */
  private async simulateActivity(
    slot: SlotWithOptions,
    execution: ActivityExecution
  ): Promise<void> {
    const activityName = getSlotActivityName(slot);
    const plannedDuration = getSlotDuration(slot);

    // Transition to in_progress
    execution.state = "in_progress";
    execution.actualStart = new Date(this.currentTime);
    this.activities.set(slot.slotId, execution);

    this.recordEvent("activity_started", `🎯 Started: ${activityName} (planned: ${plannedDuration} min)`);

    let actualDuration = plannedDuration;
    const activity = getSelectedActivity(slot);
    const tags = activity?.activity.tags || [];
    const timeOfDay = this.getTimeOfDay();

    // Check for various diversions during the activity
    const diversionsToCheck: DiversionType[] = [
      "extended_stay",
      "early_departure",
      "unplanned_stop",
      "discovered_gem",
      "meal_extension",
      "bathroom_break",
      "phone_call",
      "souvenir_shopping",
      "energy_low",
      "weather_delay",
    ];

    for (const diversionType of diversionsToCheck) {
      const diversion = this.checkForDiversion(diversionType, slot, timeOfDay);
      if (diversion) {
        this.applyDiversion(diversion);
        actualDuration += diversion.impactMinutes;

        // Energy low might cause early departure from subsequent activities
        if (diversionType === "energy_low") {
          if (this.config.travelerEnergy !== undefined) {
            this.config.travelerEnergy = Math.max(0, this.config.travelerEnergy - 0.2);
          }
        }
      }
    }

    // Ensure minimum duration
    actualDuration = Math.max(10, actualDuration);

    // Advance time for the activity
    this.advanceTime(actualDuration);

    // Complete the activity
    execution.state = "completed";
    execution.actualEnd = new Date(this.currentTime);
    this.activities.set(slot.slotId, execution);

    const actualDurationStr = actualDuration !== plannedDuration
      ? ` (actual: ${actualDuration} min, ${actualDuration > plannedDuration ? "+" : ""}${actualDuration - plannedDuration})`
      : "";

    this.recordEvent(
      "activity_completed",
      `✅ Completed: ${activityName}${actualDurationStr}`
    );

    this.recordTick(slot.slotId);
  }

  /**
   * Check if a diversion should occur
   */
  private checkForDiversion(
    type: DiversionType,
    slot: SlotWithOptions,
    timeOfDay: "morning" | "afternoon" | "evening"
  ): DiversionEvent | null {
    const config = this.config.diversions.find((d) => d.type === type);
    if (!config) return null;

    const activity = getSelectedActivity(slot);
    const activityName = getSlotActivityName(slot);

    // Check category applicability
    if (config.applicableTo && config.applicableTo.length > 0) {
      const tags = activity?.activity.tags || [];
      const name = activityName.toLowerCase();
      const matches = config.applicableTo.some(
        (cat) => tags.some(tag => tag.toLowerCase().includes(cat)) || name.includes(cat)
      );
      if (!matches) return null;
    }

    // Calculate probability with modifiers
    let probability = config.probability;

    // Time of day bias
    if (config.timeOfDayBias) {
      const bias = config.timeOfDayBias[timeOfDay];
      if (bias) {
        probability *= bias;
      }
    }

    // Weather modifier
    if (this.config.weatherCondition) {
      const weatherMods = WEATHER_MODIFIERS[this.config.weatherCondition];
      if (weatherMods && weatherMods[type]) {
        probability *= weatherMods[type];
      }
    }

    // Energy modifier (low energy increases negative diversions)
    if (this.config.travelerEnergy !== undefined) {
      if (["energy_low", "skip_activity", "early_departure"].includes(type)) {
        probability *= 2 - this.config.travelerEnergy;
      } else if (["extended_stay", "discovered_gem"].includes(type)) {
        probability *= this.config.travelerEnergy;
      }
    }

    // Roll for diversion
    if (this.random.next() > probability) {
      return null;
    }

    // Calculate impact
    const impactMinutes = this.random.nextInt(
      config.minImpactMinutes,
      config.maxImpactMinutes
    );

    // Generate description
    const description = this.generateDiversionDescription(type, slot, impactMinutes);

    return {
      type,
      slotId: slot.slotId,
      activityName,
      occurredAt: new Date(this.currentTime),
      impactMinutes,
      description,
    };
  }

  /**
   * Apply a diversion event
   */
  private applyDiversion(diversion: DiversionEvent): void {
    this.diversions.push(diversion);

    if (diversion.impactMinutes > 0) {
      this.cumulativeDelay += diversion.impactMinutes;
    }

    const impact = diversion.impactMinutes > 0
      ? `+${diversion.impactMinutes} min`
      : diversion.impactMinutes < 0
        ? `${diversion.impactMinutes} min`
        : "no time impact";

    this.recordEvent("diversion_occurred", `⚡ ${diversion.description} (${impact})`, {
      diversionType: diversion.type,
      impactMinutes: diversion.impactMinutes,
    });

    if (this.cumulativeDelay > 0) {
      this.recordEvent("delay_accumulated", `⏱️ Running ${this.cumulativeDelay} min behind schedule`);
    }
  }

  /**
   * Generate a human-readable description for a diversion
   */
  private generateDiversionDescription(
    type: DiversionType,
    slot: SlotWithOptions,
    impactMinutes: number
  ): string {
    const name = getSlotActivityName(slot);
    const absMinutes = Math.abs(impactMinutes);

    const descriptions: Record<DiversionType, string[]> = {
      late_start: [
        "Overslept and got a late start",
        "Had trouble finding breakfast, started late",
        "Took extra time getting ready",
        "Hotel checkout took longer than expected",
      ],
      extended_stay: [
        `Got engrossed at ${name}, stayed ${absMinutes} min longer`,
        `${name} was amazing, couldn't leave!`,
        `Found a hidden corner at ${name} worth exploring`,
        `Met a friendly local at ${name}, great conversation`,
      ],
      early_departure: [
        `${name} wasn't as interesting as expected, left early`,
        `Finished exploring ${name} quickly`,
        `The crowd at ${name} was too much, left early`,
      ],
      skip_activity: [
        `Decided to skip ${name} - not feeling it today`,
        `Too tired to visit ${name}`,
        `Queue at ${name} was too long, skipped it`,
      ],
      unplanned_stop: [
        "Stopped at a cute café for a quick coffee",
        "Found an interesting shop, had to check it out",
        "Spotted a great photo opportunity, stopped for pictures",
        "Grabbed a quick snack from a street vendor",
      ],
      got_lost: [
        "Got confused at the station, took wrong exit",
        "Google Maps led us astray for a bit",
        "Wandered into wrong neighborhood, had to backtrack",
        "Couldn't find the entrance, walked around the block",
      ],
      slow_commute: [
        "Train was delayed",
        "Just missed the train, had to wait for next one",
        "Walking took longer than expected - steep hills!",
        "Got stuck in pedestrian traffic",
      ],
      fast_commute: [
        "Train came immediately, perfect timing!",
        "Found a shortcut through the backstreets",
        "Walking was faster than expected - downhill!",
      ],
      weather_delay: [
        "Had to wait for the rain to stop",
        "Took shelter from sudden downpour",
        "Strong winds slowed us down",
      ],
      activity_closed: [
        `${name} was unexpectedly closed today`,
        `${name} closed early for a private event`,
        `Arrived to find ${name} under renovation`,
      ],
      discovered_gem: [
        "Discovered an amazing hidden temple nearby",
        "Found a beautiful garden that wasn't on the itinerary",
        "Stumbled upon a local festival happening nearby",
        "A local recommended a secret viewpoint - had to check it out",
      ],
      meal_extension: [
        "The food was so good, ordered seconds",
        "Service was slow but food was worth the wait",
        "Got into a great conversation with the chef",
        "Had to try multiple dishes, couldn't resist",
      ],
      bathroom_break: [
        "Quick bathroom break",
        "Needed to freshen up",
      ],
      phone_call: [
        "Had to take an important call from home",
        "Friend called with an urgent question",
      ],
      souvenir_shopping: [
        "Couldn't resist the souvenir shop",
        "Found the perfect gift, spent time choosing",
        "Had to buy some local snacks to bring home",
      ],
      energy_low: [
        "Feeling tired, took a rest break",
        "Needed to sit down and recharge",
        "Stopped for an energy drink and snack",
        "Found a bench with a nice view, took a breather",
      ],
      perfect_timing: [
        "Everything went smoothly, perfect timing!",
      ],
    };

    const options = descriptions[type] || [`${type} occurred`];
    return this.random.pick(options);
  }

  /**
   * Get current time of day
   */
  private getTimeOfDay(): "morning" | "afternoon" | "evening" {
    const hours = this.currentTime.getHours();
    if (hours < 12) return "morning";
    if (hours < 17) return "afternoon";
    return "evening";
  }

  /**
   * Advance simulation time
   */
  private advanceTime(minutes: number): void {
    this.currentTime = new Date(this.currentTime.getTime() + minutes * 60 * 1000);
  }

  /**
   * Format a Date to a time string
   */
  private formatTime(date: Date): string {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  /**
   * Record a simulation event
   */
  private recordEvent(
    type: SimulationEventType,
    details: string,
    data?: Record<string, unknown>
  ): void {
    const event: SimulationEvent = {
      type,
      timestamp: new Date(this.currentTime),
      details,
      data,
    };

    this.timeline.push(`[${this.formatTime(this.currentTime)}] ${details}`);

    if (this.config.verbose) {
      this.log(`[${this.formatTime(this.currentTime)}] ${details}`);
    }
  }

  /**
   * Record a simulation tick
   */
  private recordTick(currentSlotId: string | null): void {
    const currentActivity = currentSlotId
      ? this.activities.get(currentSlotId) || null
      : null;

    this.ticks.push({
      time: new Date(this.currentTime),
      location: { ...this.currentLocation },
      currentActivity,
      mode: this.mode,
      events: [],
      cumulativeDelay: this.cumulativeDelay,
    });
  }

  /**
   * Calculate simulation summary
   */
  private calculateSummary(day: DayWithOptions): SimulationSummary {
    // Calculate total planned time from slots
    const totalActivityTime = day.slots.reduce((sum, slot) => sum + getSlotDuration(slot), 0);
    const totalCommuteTime = day.slots.reduce(
      (sum, slot) => sum + (slot.commuteFromPrevious?.duration || 0),
      0
    );
    const plannedDuration = totalActivityTime + totalCommuteTime;

    const firstSlot = day.slots[0];
    const plannedStart = parseTimeToDate(firstSlot?.timeRange.start || "09:00", new Date(day.date));
    const actualDuration = Math.round(
      (this.currentTime.getTime() - plannedStart.getTime()) / (1000 * 60)
    );

    let activitiesCompleted = 0;
    let activitiesSkipped = 0;
    let totalActivityDuration = 0;

    for (const execution of this.activities.values()) {
      if (execution.state === "completed") {
        activitiesCompleted++;
        if (execution.actualStart && execution.actualEnd) {
          totalActivityDuration +=
            (execution.actualEnd.getTime() - execution.actualStart.getTime()) / (1000 * 60);
        }
      } else if (execution.state === "skipped") {
        activitiesSkipped++;
      }
    }

    // Count diversions by type
    const diversionCounts = new Map<DiversionType, number>();
    for (const diversion of this.diversions) {
      const count = diversionCounts.get(diversion.type) || 0;
      diversionCounts.set(diversion.type, count + 1);
    }

    // Find most common
    let mostCommonDiversion: DiversionType | null = null;
    let maxCount = 0;
    for (const [type, count] of diversionCounts) {
      if (count > maxCount) {
        maxCount = count;
        mostCommonDiversion = type;
      }
    }

    // Find longest delay
    let longestDelay: DiversionEvent | null = null;
    for (const diversion of this.diversions) {
      if (!longestDelay || diversion.impactMinutes > longestDelay.impactMinutes) {
        longestDelay = diversion;
      }
    }

    // Calculate time saved (negative diversions)
    const timeSaved = this.diversions
      .filter((d) => d.impactMinutes < 0)
      .reduce((sum, d) => sum + Math.abs(d.impactMinutes), 0);

    return {
      plannedDurationMinutes: plannedDuration,
      actualDurationMinutes: actualDuration,
      activitiesPlanned: day.slots.length,
      activitiesCompleted,
      activitiesSkipped,
      totalDiversions: this.diversions.length,
      totalDelayMinutes: this.cumulativeDelay,
      totalTimeSavedMinutes: timeSaved,
      averageActivityDuration:
        activitiesCompleted > 0
          ? Math.round(totalActivityDuration / activitiesCompleted)
          : 0,
      longestDelay,
      mostCommonDiversion,
    };
  }

  /**
   * Print summary to console
   */
  private printSummary(summary: SimulationSummary): void {
    this.log(`\n📊 SIMULATION SUMMARY`);
    this.log(`${"─".repeat(40)}`);
    this.log(`Activities: ${summary.activitiesCompleted}/${summary.activitiesPlanned} completed`);
    if (summary.activitiesSkipped > 0) {
      this.log(`            ${summary.activitiesSkipped} skipped`);
    }
    this.log(`Duration:   ${summary.actualDurationMinutes} min (planned: ${summary.plannedDurationMinutes} min)`);
    this.log(`Diversions: ${summary.totalDiversions} events`);
    this.log(`Delays:     +${summary.totalDelayMinutes} min total`);
    if (summary.totalTimeSavedMinutes > 0) {
      this.log(`Time Saved: -${summary.totalTimeSavedMinutes} min`);
    }
    if (summary.longestDelay) {
      this.log(`Longest:    "${summary.longestDelay.description}" (+${summary.longestDelay.impactMinutes} min)`);
    }
    if (summary.mostCommonDiversion) {
      this.log(`Most Common: ${summary.mostCommonDiversion}`);
    }
    this.log(`${"─".repeat(40)}\n`);
  }

  /**
   * Log a message (respects verbose setting)
   */
  private log(message: string): void {
    console.log(message);
  }
}

// ============================================
// CONVENIENCE FUNCTIONS
// ============================================

/**
 * Run a quick simulation with default settings
 */
export async function runSimulation(
  day: DayWithOptions,
  config?: Partial<SimulatorConfig>
): Promise<SimulationResult> {
  const simulator = new ItinerarySimulator(config);
  return simulator.simulate(day);
}

/**
 * Run multiple simulations and aggregate results
 */
export async function runMultipleSimulations(
  day: DayWithOptions,
  runs: number = 10,
  baseConfig?: Partial<SimulatorConfig>
): Promise<{
  results: SimulationResult[];
  aggregated: {
    avgDuration: number;
    avgDiversions: number;
    avgDelay: number;
    completionRate: number;
    mostCommonDiversions: { type: DiversionType; count: number }[];
  };
}> {
  const results: SimulationResult[] = [];

  for (let i = 0; i < runs; i++) {
    const config = {
      ...baseConfig,
      seed: (baseConfig?.seed || 0) + i,
      verbose: false,
    };

    const simulator = new ItinerarySimulator(config);
    const result = await simulator.simulate(day);
    results.push(result);
  }

  // Aggregate statistics
  const totalDuration = results.reduce((sum, r) => sum + r.summary.actualDurationMinutes, 0);
  const totalDiversions = results.reduce((sum, r) => sum + r.summary.totalDiversions, 0);
  const totalDelay = results.reduce((sum, r) => sum + r.summary.totalDelayMinutes, 0);
  const totalCompleted = results.reduce((sum, r) => sum + r.summary.activitiesCompleted, 0);
  const totalPlanned = results.reduce((sum, r) => sum + r.summary.activitiesPlanned, 0);

  // Count diversions by type
  const diversionCounts = new Map<DiversionType, number>();
  for (const result of results) {
    for (const diversion of result.diversions) {
      const count = diversionCounts.get(diversion.type) || 0;
      diversionCounts.set(diversion.type, count + 1);
    }
  }

  const mostCommonDiversions = Array.from(diversionCounts.entries())
    .map(([type, count]) => ({ type, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    results,
    aggregated: {
      avgDuration: Math.round(totalDuration / runs),
      avgDiversions: Math.round((totalDiversions / runs) * 10) / 10,
      avgDelay: Math.round(totalDelay / runs),
      completionRate: Math.round((totalCompleted / totalPlanned) * 100),
      mostCommonDiversions,
    },
  };
}

/**
 * Generate a sample day for testing
 */
export function generateSampleDay(city: string = "Tokyo"): DayWithOptions {
  const baseId = () => `slot-${Math.random().toString(36).substr(2, 9)}`;
  const optionId = () => `opt-${Math.random().toString(36).substr(2, 9)}`;

  const createSlot = (
    name: string,
    tags: string[],
    lat: number,
    lng: number,
    startTime: string,
    endTime: string,
    slotType: "morning" | "afternoon" | "evening" | "breakfast" | "lunch" | "dinner" = "afternoon",
    commuteMinutes?: number
  ): SlotWithOptions => {
    const id = optionId();
    const duration = Math.round(
      ((parseInt(endTime.split(":")[0]) * 60 + parseInt(endTime.split(":")[1])) -
       (parseInt(startTime.split(":")[0]) * 60 + parseInt(startTime.split(":")[1])))
    );

    const commute: StructuredCommuteInfo | undefined = commuteMinutes ? {
      method: "walk",
      duration: commuteMinutes,
      distance: commuteMinutes * 80,
      instructions: `Walk to ${name}`,
    } : undefined;

    return {
      slotId: baseId(),
      slotType,
      timeRange: { start: startTime, end: endTime },
      behavior: "flex",
      fragility: {
        weatherSensitivity: tags.includes("outdoor") ? "high" : "low",
        crowdSensitivity: "medium",
        bookingRequired: false,
      },
      options: [{
        id,
        rank: 1,
        score: 0.9,
        activity: {
          name,
          description: `Visit ${name}`,
          category: tags[0] || "attraction",
          duration,
          tags,
          isFree: false,
          place: {
            name,
            coordinates: { lat, lng },
            address: `${name}, ${city}`,
            neighborhood: city,
          },
          source: "ai",
        },
        matchReasons: ["Great choice!"],
        tradeoffs: [],
      }],
      commuteFromPrevious: commute,
    };
  };

  const slots: SlotWithOptions[] = [
    createSlot("Senso-ji Temple", ["temple", "cultural", "outdoor"], 35.7147, 139.7966, "09:00", "10:30", "morning"),
    createSlot("Nakamise Shopping Street", ["market", "shopping"], 35.7126, 139.7966, "10:45", "11:30", "afternoon", 5),
    createSlot("Asakusa Lunch", ["restaurant", "food"], 35.7100, 139.7950, "11:45", "12:45", "lunch", 10),
    createSlot("Tokyo Skytree", ["viewpoint", "attraction"], 35.7101, 139.8107, "13:00", "14:30", "afternoon", 15),
    createSlot("Ueno Park", ["park", "nature", "outdoor"], 35.7146, 139.7732, "15:00", "16:00", "afternoon", 20),
    createSlot("Tokyo National Museum", ["museum", "cultural"], 35.7189, 139.7765, "16:15", "17:45", "afternoon", 10),
    createSlot("Dinner in Shibuya", ["restaurant", "food"], 35.6580, 139.7016, "18:30", "20:00", "dinner", 30),
  ];

  return {
    dayNumber: 1,
    date: new Date().toISOString().split("T")[0],
    city,
    title: "Classic Tokyo Exploration",
    slots,
  };
}
