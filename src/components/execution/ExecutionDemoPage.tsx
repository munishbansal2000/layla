"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Play,
  Pause,
  RotateCcw,
  FastForward,
  Clock,
  MapPin,
  CheckCircle2,
  SkipForward,
  AlertTriangle,
  Coffee,
  Navigation,
  Timer,
  Zap,
  ChevronRight,
  Calendar,
  BedDouble,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { DayWithOptions, SlotWithOptions, StructuredCommuteInfo } from "@/types/structured-itinerary";
import { ActivityExecution, ActivityState, Geofence } from "@/types/execution";
import { getExecutionEngine, resetExecutionEngine, EngineEvent } from "@/lib/execution/execution-engine";
import { getSlotActivityName, getSlotDuration, getSlotCoordinates } from "@/lib/execution/execution-helpers";
import { useExecution } from "@/hooks/useExecution";
import {
  ExecutionNotificationFeed,
  ExecutionEventLog,
  useExecutionNotifications,
  ExecutionNotification,
} from "./ExecutionNotifications";
import {
  ExecutionDecisionModal,
  useExecutionDecisions,
  createLateWakeupDecision,
  createDelayedDepartureDecision,
  DecisionContext,
} from "./ExecutionDecisionModal";

// ============================================
// TYPES
// ============================================

interface SimulationState {
  isRunning: boolean;
  isPaused: boolean;
  simulatedTime: Date;
  speed: number; // 1 = real-time, 60 = 1 min per second, etc.
  scenario: ScenarioType | null;
}

type ScenarioType = 
  | "normal"
  | "late_wakeup"
  | "delayed_departure"
  | "slow_activity"
  | "booking_risk";

interface ScenarioConfig {
  id: ScenarioType;
  name: string;
  description: string;
  icon: React.ElementType;
  color: string;
}

// ============================================
// SAMPLE DATA
// ============================================

function createSampleTokyoDay(): DayWithOptions {
  const optionId = () => `opt-${Math.random().toString(36).substr(2, 9)}`;
  const slotIdGen = () => `slot-${Math.random().toString(36).substr(2, 9)}`;

  const createSlot = (
    name: string,
    tags: string[],
    lat: number,
    lng: number,
    startTime: string,
    endTime: string,
    slotType: "morning" | "afternoon" | "evening" | "breakfast" | "lunch" | "dinner" = "afternoon",
    commuteMinutes?: number,
    isBooked: boolean = false
  ): SlotWithOptions => {
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
      slotId: slotIdGen(),
      slotType,
      timeRange: { start: startTime, end: endTime },
      behavior: isBooked ? "anchor" : "flex",
      isLocked: isBooked,
      fragility: {
        weatherSensitivity: tags.includes("outdoor") ? "high" : "low",
        crowdSensitivity: "medium",
        bookingRequired: isBooked,
        ticketType: isBooked ? "timed" : undefined,
      },
      options: [{
        id: optionId(),
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
            address: `${name}, Tokyo`,
            neighborhood: "Tokyo",
          },
          source: "ai",
        },
        matchReasons: ["Great choice!"],
        tradeoffs: [],
      }],
      commuteFromPrevious: commute,
    };
  };

  return {
    dayNumber: 1,
    date: new Date().toISOString().split("T")[0],
    city: "Tokyo",
    title: "Classic Tokyo Day",
    slots: [
      createSlot("Hotel Breakfast", ["food", "breakfast"], 35.6762, 139.7503, "08:00", "08:45", "breakfast"),
      createSlot("Senso-ji Temple", ["temple", "cultural", "outdoor"], 35.7147, 139.7966, "09:15", "10:45", "morning", 25),
      createSlot("Nakamise Shopping", ["market", "shopping"], 35.7126, 139.7966, "11:00", "11:45", "morning", 5),
      createSlot("Ramen Lunch", ["restaurant", "food"], 35.7100, 139.7950, "12:00", "12:45", "lunch", 10),
      createSlot("teamLab Borderless", ["museum", "art", "indoor", "timed-entry"], 35.6265, 139.7824, "14:00", "16:00", "afternoon", 45, true),
      createSlot("Shibuya Crossing", ["viewpoint", "outdoor"], 35.6595, 139.7004, "16:30", "17:15", "afternoon", 20),
      createSlot("Shibuya Shopping", ["shopping"], 35.6598, 139.7010, "17:30", "18:30", "evening", 5),
      createSlot("Izakaya Dinner", ["restaurant", "food", "dinner"], 35.6612, 139.7050, "19:00", "20:30", "dinner", 15),
    ],
  };
}

const SCENARIOS: ScenarioConfig[] = [
  {
    id: "normal",
    name: "Normal Day",
    description: "Everything goes according to plan",
    icon: CheckCircle2,
    color: "text-green-600",
  },
  {
    id: "late_wakeup",
    name: "Late Wake Up",
    description: "Overslept by 45 minutes",
    icon: BedDouble,
    color: "text-orange-600",
  },
  {
    id: "delayed_departure",
    name: "Delayed Departure",
    description: "Got stuck at hotel, 30 min late leaving",
    icon: Clock,
    color: "text-yellow-600",
  },
  {
    id: "slow_activity",
    name: "Extended Stay",
    description: "Loving the temple, want to stay longer",
    icon: Timer,
    color: "text-blue-600",
  },
  {
    id: "booking_risk",
    name: "Booking at Risk",
    description: "Running late, might miss teamLab booking",
    icon: AlertTriangle,
    color: "text-red-600",
  },
];

// ============================================
// LIVE TIMELINE COMPONENT
// ============================================

interface LiveTimelineProps {
  day: DayWithOptions;
  simulatedTime: Date;
  activityStates: Map<string, ActivityExecution>;
  currentSlotId: string | null;
  delayMinutes: number;
}

function LiveTimeline({ day, simulatedTime, activityStates, currentSlotId, delayMinutes }: LiveTimelineProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-4 py-3 bg-gray-50 dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-gray-500" />
          <span className="font-medium text-gray-900 dark:text-white">Day Timeline</span>
        </div>
        {delayMinutes !== 0 && (
          <span className={cn(
            "text-sm font-medium px-2 py-0.5 rounded-full",
            delayMinutes > 0 
              ? "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400"
              : "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
          )}>
            {delayMinutes > 0 ? `+${delayMinutes} min behind` : `${Math.abs(delayMinutes)} min ahead`}
          </span>
        )}
      </div>
      
      <div className="p-4 space-y-1">
        {day.slots.map((slot, index) => {
          const execution = activityStates.get(slot.slotId);
          const state = execution?.state || "upcoming";
          const isCurrent = slot.slotId === currentSlotId;
          const name = getSlotActivityName(slot);
          const duration = getSlotDuration(slot);
          const commute = slot.commuteFromPrevious?.duration || 0;
          const isBooked = slot.fragility?.bookingRequired;
          
          return (
            <React.Fragment key={slot.slotId}>
              {/* Commute indicator */}
              {commute > 0 && (
                <div className="flex items-center gap-2 py-1 pl-6">
                  <Navigation className="h-3 w-3 text-gray-400" />
                  <span className="text-xs text-gray-500">{commute} min commute</span>
                </div>
              )}
              
              {/* Activity */}
              <motion.div
                layout
                className={cn(
                  "flex items-center gap-3 p-3 rounded-lg transition-all",
                  isCurrent && "ring-2 ring-purple-500 bg-purple-50 dark:bg-purple-900/20",
                  !isCurrent && getStateBgColor(state)
                )}
              >
                <div className={cn(
                  "w-8 h-8 rounded-full flex items-center justify-center",
                  getStateIconBg(state)
                )}>
                  {getStateIcon(state)}
                </div>
                
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className={cn(
                      "font-medium truncate",
                      state === "skipped" && "line-through text-gray-400"
                    )}>
                      {name}
                    </span>
                    {isBooked && (
                      <span className="px-1.5 py-0.5 text-xs font-medium rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                        BOOKED
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <span>{slot.timeRange.start} - {slot.timeRange.end}</span>
                    <span>•</span>
                    <span>{duration} min</span>
                    {execution?.extendedBy && (
                      <>
                        <span>•</span>
                        <span className="text-orange-600">+{execution.extendedBy} min</span>
                      </>
                    )}
                  </div>
                </div>
                
                <div className="text-right">
                  <span className={cn(
                    "text-xs font-medium px-2 py-1 rounded-full",
                    getStateBadgeColor(state)
                  )}>
                    {getStateLabel(state)}
                  </span>
                </div>
              </motion.div>
            </React.Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ============================================
// SIMULATION CONTROLS
// ============================================

interface SimulationControlsProps {
  state: SimulationState;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onReset: () => void;
  onSpeedChange: (speed: number) => void;
  onScenarioSelect: (scenario: ScenarioType) => void;
}

function SimulationControls({
  state,
  onStart,
  onPause,
  onResume,
  onReset,
  onSpeedChange,
  onScenarioSelect,
}: SimulationControlsProps) {
  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      {/* Time Display */}
      <div className="flex items-center justify-center gap-4 mb-4">
        <Clock className="h-6 w-6 text-purple-600" />
        <span className="text-3xl font-mono font-bold text-gray-900 dark:text-white">
          {state.simulatedTime.toLocaleTimeString("en-US", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
            hour12: false,
          })}
        </span>
        <span className={cn(
          "text-sm font-medium px-2 py-1 rounded-full",
          state.isRunning ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-600"
        )}>
          {state.speed}x speed
        </span>
      </div>
      
      {/* Playback Controls */}
      <div className="flex items-center justify-center gap-2 mb-4">
        {!state.isRunning ? (
          <Button onClick={onStart} variant="primary" leftIcon={<Play className="h-4 w-4" />}>
            Start Day
          </Button>
        ) : state.isPaused ? (
          <Button onClick={onResume} variant="primary" leftIcon={<Play className="h-4 w-4" />}>
            Resume
          </Button>
        ) : (
          <Button onClick={onPause} variant="secondary" leftIcon={<Pause className="h-4 w-4" />}>
            Pause
          </Button>
        )}
        
        <Button onClick={onReset} variant="ghost" leftIcon={<RotateCcw className="h-4 w-4" />}>
          Reset
        </Button>
      </div>
      
      {/* Speed Controls */}
      <div className="flex items-center justify-center gap-2 mb-4">
        <span className="text-sm text-gray-500">Speed:</span>
        {[1, 10, 30, 60, 120].map((speed) => (
          <button
            key={speed}
            onClick={() => onSpeedChange(speed)}
            className={cn(
              "px-2 py-1 text-sm font-medium rounded",
              state.speed === speed
                ? "bg-purple-600 text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300"
            )}
          >
            {speed}x
          </button>
        ))}
      </div>
      
      {/* Scenario Triggers */}
      <div className="border-t border-gray-200 dark:border-gray-700 pt-4">
        <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
          <Zap className="h-4 w-4" />
          Trigger Scenario
        </h3>
        <div className="grid grid-cols-2 gap-2">
          {SCENARIOS.map((scenario) => (
            <button
              key={scenario.id}
              onClick={() => onScenarioSelect(scenario.id)}
              disabled={!state.isRunning}
              className={cn(
                "flex items-center gap-2 p-2 rounded-lg text-left transition-all",
                "border border-gray-200 dark:border-gray-700",
                state.scenario === scenario.id
                  ? "ring-2 ring-purple-500 bg-purple-50 dark:bg-purple-900/20"
                  : "hover:bg-gray-50 dark:hover:bg-gray-800",
                !state.isRunning && "opacity-50 cursor-not-allowed"
              )}
            >
              <scenario.icon className={cn("h-4 w-4", scenario.color)} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {scenario.name}
                </div>
                <div className="text-xs text-gray-500 truncate">{scenario.description}</div>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ============================================
// MAIN DEMO PAGE
// ============================================

export function ExecutionDemoPage() {
  // Sample day data
  const [day] = useState<DayWithOptions>(() => createSampleTokyoDay());
  
  // Simulation state
  const [simState, setSimState] = useState<SimulationState>({
    isRunning: false,
    isPaused: false,
    simulatedTime: new Date(new Date().setHours(7, 55, 0, 0)), // Start at 7:55 AM
    speed: 60,
    scenario: null,
  });
  
  // Activity states tracked separately for UI
  const [activityStates, setActivityStates] = useState<Map<string, ActivityExecution>>(new Map());
  const [currentSlotId, setCurrentSlotId] = useState<string | null>(null);
  const [delayMinutes, setDelayMinutes] = useState(0);
  
  // Notifications and decisions
  const { notifications, eventLog, addNotification, dismissNotification, clearEventLog } = useExecutionNotifications();
  const { currentDecision, showDecision, handleSelect, dismissDecision, isProcessing } = useExecutionDecisions();
  
  // Execution engine
  const execution = useExecution();
  
  // Simulation interval ref
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Start simulation
  const handleStart = useCallback(() => {
    resetExecutionEngine();
    const engine = getExecutionEngine();
    engine.start("demo-trip", day);
    
    setSimState(prev => ({
      ...prev,
      isRunning: true,
      isPaused: false,
      simulatedTime: new Date(new Date().setHours(7, 55, 0, 0)),
    }));
    
    setActivityStates(engine.getAllActivities());
    clearEventLog();
    
    addNotification({
      type: "info",
      title: "Day Started",
      message: "Your Tokyo adventure begins! First up: Hotel Breakfast at 8:00 AM",
      priority: "normal",
    });
  }, [day, addNotification, clearEventLog]);
  
  // Pause simulation
  const handlePause = useCallback(() => {
    setSimState(prev => ({ ...prev, isPaused: true }));
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);
  
  // Resume simulation
  const handleResume = useCallback(() => {
    setSimState(prev => ({ ...prev, isPaused: false }));
  }, []);
  
  // Reset simulation
  const handleReset = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    resetExecutionEngine();
    setSimState({
      isRunning: false,
      isPaused: false,
      simulatedTime: new Date(new Date().setHours(7, 55, 0, 0)),
      speed: 60,
      scenario: null,
    });
    setActivityStates(new Map());
    setCurrentSlotId(null);
    setDelayMinutes(0);
    clearEventLog();
  }, [clearEventLog]);
  
  // Speed change
  const handleSpeedChange = useCallback((speed: number) => {
    setSimState(prev => ({ ...prev, speed }));
  }, []);
  
  // Scenario triggers
  const handleScenarioSelect = useCallback((scenario: ScenarioType) => {
    setSimState(prev => ({ ...prev, scenario }));
    
    const currentTimeStr = simState.simulatedTime.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    
    switch (scenario) {
      case "late_wakeup": {
        const decision = createLateWakeupDecision(
          currentTimeStr,
          45,
          "Hotel Breakfast",
          "Senso-ji Temple",
          true,
          { name: "teamLab Borderless", time: "14:00", buffer: 15 }
        );
        showDecision(decision);
        addNotification({
          type: "scenario_trigger",
          title: "😴 Late Wake Up!",
          message: "You overslept by 45 minutes. It's now 8:45 AM and you should have started breakfast at 8:00.",
          priority: "urgent",
          autoDismiss: false,
        });
        setDelayMinutes(45);
        break;
      }
      
      case "delayed_departure": {
        const decision = createDelayedDepartureDecision(
          currentTimeStr,
          30,
          "Hotel",
          "Senso-ji Temple",
          true,
          { name: "teamLab Borderless", time: "14:00", buffer: 30 }
        );
        showDecision(decision);
        addNotification({
          type: "scenario_trigger",
          title: "📞 Delayed Departure",
          message: "Phone call ran long. You're still at the hotel but should have left 30 minutes ago.",
          priority: "high",
          autoDismiss: false,
        });
        setDelayMinutes(30);
        break;
      }
      
      case "slow_activity": {
        addNotification({
          type: "extension_available",
          title: "⏰ Want to Stay Longer?",
          message: "You seem to be enjoying Senso-ji Temple. Would you like to extend by 15-30 minutes?",
          priority: "normal",
          actionLabel: "+15 min",
          onAction: () => {
            setDelayMinutes(prev => prev + 15);
            addNotification({
              type: "info",
              title: "Extended Stay",
              message: "Staying 15 more minutes at Senso-ji Temple. Schedule adjusted.",
            });
          },
          secondaryActionLabel: "+30 min",
          onSecondaryAction: () => {
            setDelayMinutes(prev => prev + 30);
            addNotification({
              type: "delay_warning",
              title: "Schedule Impact",
              message: "30 min extension may require skipping Nakamise Shopping to stay on track.",
            });
          },
        });
        break;
      }
      
      case "booking_risk": {
        addNotification({
          type: "booking_at_risk",
          title: "⚠️ Booking at Risk!",
          message: "teamLab Borderless at 14:00 is at risk! You have only 20 minutes buffer left.",
          priority: "urgent",
          autoDismiss: false,
          actionLabel: "Take Taxi",
          onAction: () => {
            addNotification({
              type: "info",
              title: "Taxi Called",
              message: "Taking a taxi to save 20 minutes. Booking should be safe now.",
            });
            setDelayMinutes(prev => Math.max(0, prev - 20));
          },
          secondaryActionLabel: "Skip Next Activity",
          onSecondaryAction: () => {
            addNotification({
              type: "info",
              title: "Activity Skipped",
              message: "Skipping Shibuya Crossing to ensure teamLab booking is safe.",
            });
            setDelayMinutes(0);
          },
        });
        setDelayMinutes(40);
        break;
      }
    }
  }, [simState.simulatedTime, showDecision, addNotification]);
  
  // Handle decision selection
  const onDecisionSelect = useCallback((optionId: string) => {
    handleSelect(optionId, async (id) => {
      const engine = getExecutionEngine();
      
      switch (id) {
        case "skip_breakfast":
          // Skip breakfast
          const breakfastSlot = day.slots[0];
          engine.skipActivity(breakfastSlot.slotId, "Overslept - skipping to stay on schedule");
          setDelayMinutes(0);
          addNotification({
            type: "info",
            title: "Breakfast Skipped",
            message: "Heading straight to Senso-ji Temple. Grab coffee on the way!",
          });
          break;
          
        case "quick_breakfast":
          setDelayMinutes(15);
          addNotification({
            type: "info",
            title: "Quick Breakfast",
            message: "15-minute quick breakfast. Still 15 min behind but manageable.",
          });
          break;
          
        case "leave_now":
          addNotification({
            type: "departure_reminder",
            title: "Leaving Now",
            message: "Heading to the next activity. Running a bit late but should be fine.",
          });
          break;
          
        case "take_taxi":
          setDelayMinutes(prev => Math.max(0, prev - 20));
          addNotification({
            type: "info",
            title: "Taxi Called",
            message: "Taking a taxi to make up time. Should recover ~20 minutes.",
          });
          break;
          
        case "skip_next":
          addNotification({
            type: "info",
            title: "Activity Skipped",
            message: "Skipping next activity to get back on schedule.",
          });
          setDelayMinutes(0);
          break;
          
        case "reshuffle":
          addNotification({
            type: "info",
            title: "Reshuffling Day",
            message: "AI is reorganizing your remaining activities for the best experience.",
          });
          setDelayMinutes(0);
          break;
      }
      
      setActivityStates(engine.getAllActivities());
    });
  }, [handleSelect, day, addNotification]);
  
  // Simulation tick - advance time
  useEffect(() => {
    if (!simState.isRunning || simState.isPaused) return;
    
    intervalRef.current = setInterval(() => {
      setSimState(prev => {
        const newTime = new Date(prev.simulatedTime.getTime() + 1000 * prev.speed);
        return { ...prev, simulatedTime: newTime };
      });
    }, 1000);
    
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [simState.isRunning, simState.isPaused, simState.speed]);
  
  // Check for time-based events
  useEffect(() => {
    if (!simState.isRunning) return;
    
    const engine = getExecutionEngine();
    const currentHour = simState.simulatedTime.getHours();
    const currentMinute = simState.simulatedTime.getMinutes();
    const timeString = `${String(currentHour).padStart(2, "0")}:${String(currentMinute).padStart(2, "0")}`;
    
    // Check each slot for time-based notifications
    day.slots.forEach((slot, index) => {
      const [startHour, startMinute] = slot.timeRange.start.split(":").map(Number);
      const scheduledStart = startHour * 60 + startMinute;
      const currentMinutes = currentHour * 60 + currentMinute;
      
      // 15 minutes before activity starts
      if (currentMinutes === scheduledStart - 15 && !simState.scenario) {
        const name = getSlotActivityName(slot);
        addNotification({
          type: "departure_reminder",
          title: "Time to Leave",
          message: `${name} starts in 15 minutes. Start heading there now!`,
        });
      }
      
      // Activity starting
      if (timeString === slot.timeRange.start && !simState.scenario) {
        const name = getSlotActivityName(slot);
        addNotification({
          type: "activity_starting",
          title: "Activity Starting",
          message: `${name} is starting now. Have a great time!`,
        });
        setCurrentSlotId(slot.slotId);
      }
    });
    
    setActivityStates(engine.getAllActivities());
  }, [simState.simulatedTime, simState.isRunning, simState.scenario, day, addNotification]);
  
  return (
    <div className="min-h-screen bg-gray-100 dark:bg-gray-950 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
            Execution Engine Demo
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            Simulate real-world scenarios like late wake up, delayed departure, and activity reshuffling
          </p>
        </div>
        
        {/* Main Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column - Timeline */}
          <div className="lg:col-span-2 space-y-6">
            <LiveTimeline
              day={day}
              simulatedTime={simState.simulatedTime}
              activityStates={activityStates}
              currentSlotId={currentSlotId}
              delayMinutes={delayMinutes}
            />
          </div>
          
          {/* Right Column - Controls & Log */}
          <div className="space-y-6">
            <SimulationControls
              state={simState}
              onStart={handleStart}
              onPause={handlePause}
              onResume={handleResume}
              onReset={handleReset}
              onSpeedChange={handleSpeedChange}
              onScenarioSelect={handleScenarioSelect}
            />
            
            <ExecutionEventLog events={eventLog} maxHeight="400px" />
          </div>
        </div>
      </div>
      
      {/* Notification Feed */}
      <ExecutionNotificationFeed
        notifications={notifications}
        onDismiss={dismissNotification}
        position="top-right"
      />
      
      {/* Decision Modal */}
      <ExecutionDecisionModal
        isOpen={!!currentDecision}
        decision={currentDecision}
        onSelect={onDecisionSelect}
        onDismiss={dismissDecision}
        isProcessing={isProcessing}
      />
    </div>
  );
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getStateIcon(state: ActivityState): React.ReactNode {
  switch (state) {
    case "completed": return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    case "in_progress": return <Play className="h-4 w-4 text-purple-600" />;
    case "skipped": return <SkipForward className="h-4 w-4 text-gray-400" />;
    case "pending": return <Clock className="h-4 w-4 text-yellow-600" />;
    case "en_route": return <Navigation className="h-4 w-4 text-blue-600" />;
    case "extended": return <Timer className="h-4 w-4 text-orange-600" />;
    default: return <Clock className="h-4 w-4 text-gray-400" />;
  }
}

function getStateIconBg(state: ActivityState): string {
  switch (state) {
    case "completed": return "bg-green-100 dark:bg-green-900/30";
    case "in_progress": return "bg-purple-100 dark:bg-purple-900/30";
    case "skipped": return "bg-gray-100 dark:bg-gray-800";
    case "pending": return "bg-yellow-100 dark:bg-yellow-900/30";
    case "en_route": return "bg-blue-100 dark:bg-blue-900/30";
    case "extended": return "bg-orange-100 dark:bg-orange-900/30";
    default: return "bg-gray-100 dark:bg-gray-800";
  }
}

function getStateBgColor(state: ActivityState): string {
  switch (state) {
    case "completed": return "bg-green-50 dark:bg-green-900/10";
    case "skipped": return "bg-gray-50 dark:bg-gray-800/50";
    default: return "";
  }
}

function getStateBadgeColor(state: ActivityState): string {
  switch (state) {
    case "completed": return "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400";
    case "in_progress": return "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400";
    case "skipped": return "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400";
    case "pending": return "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400";
    case "en_route": return "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400";
    case "extended": return "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400";
    default: return "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400";
  }
}

function getStateLabel(state: ActivityState): string {
  const labels: Record<ActivityState, string> = {
    upcoming: "Upcoming",
    pending: "Starting Soon",
    en_route: "En Route",
    arrived: "Arrived",
    in_progress: "In Progress",
    extended: "Extended",
    completed: "Done",
    skipped: "Skipped",
    deferred: "Deferred",
    replaced: "Replaced",
  };
  return labels[state];
}

export default ExecutionDemoPage;
