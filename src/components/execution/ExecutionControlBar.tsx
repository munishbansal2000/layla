"use client";

import React, { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Play,
  Pause,
  Square,
  FastForward,
  Clock,
  MapPin,
  AlertTriangle,
  Zap,
  ChevronDown,
  ChevronUp,
  Coffee,
  Timer,
  SkipForward,
  Navigation,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

// ============================================
// TYPES
// ============================================

export type ExecutionPhase = "idle" | "running" | "paused" | "completed";

export type ScenarioType =
  | "late_wakeup"
  | "delayed_departure"
  | "slow_activity"
  | "booking_risk";

export interface SimulatedTime {
  current: Date;
  speed: number;
}

export interface ExecutionState {
  phase: ExecutionPhase;
  currentActivityId: string | null;
  currentActivityName: string | null;
  delayMinutes: number;
  completedActivities: number;
  totalActivities: number;
  simulatedTime: SimulatedTime;
}

// ============================================
// SPEED OPTIONS
// ============================================

const SPEED_OPTIONS = [
  { value: 1, label: "1x" },
  { value: 10, label: "10x" },
  { value: 30, label: "30x" },
  { value: 60, label: "60x" },
  { value: 120, label: "120x" },
];

// ============================================
// SCENARIO BUTTONS
// ============================================

const SCENARIO_TRIGGERS: Array<{
  id: ScenarioType;
  label: string;
  icon: React.ElementType;
  description: string;
  color: string;
}> = [
  {
    id: "late_wakeup",
    label: "Late Wakeup",
    icon: Coffee,
    description: "Simulate waking up 45 min late",
    color: "text-orange-600 bg-orange-100 dark:bg-orange-900/30",
  },
  {
    id: "delayed_departure",
    label: "Delayed Departure",
    icon: Timer,
    description: "Didn't leave on time for next activity",
    color: "text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30",
  },
  {
    id: "slow_activity",
    label: "Slow Activity",
    icon: Clock,
    description: "Current activity taking longer than planned",
    color: "text-blue-600 bg-blue-100 dark:bg-blue-900/30",
  },
  {
    id: "booking_risk",
    label: "Booking at Risk",
    icon: AlertTriangle,
    description: "May miss timed reservation",
    color: "text-red-600 bg-red-100 dark:bg-red-900/30",
  },
];

// ============================================
// EXECUTION CONTROL BAR COMPONENT
// ============================================

interface ExecutionControlBarProps {
  state: ExecutionState;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onSpeedChange: (speed: number) => void;
  onTriggerScenario: (scenario: ScenarioType) => void;
  onSkipActivity?: () => void;
  onExtendActivity?: () => void;
  className?: string;
  compact?: boolean;
}

export function ExecutionControlBar({
  state,
  onStart,
  onPause,
  onResume,
  onStop,
  onSpeedChange,
  onTriggerScenario,
  onSkipActivity,
  onExtendActivity,
  className,
  compact = false,
}: ExecutionControlBarProps) {
  const [showScenarios, setShowScenarios] = useState(false);
  const [showSpeedOptions, setShowSpeedOptions] = useState(false);

  const isRunning = state.phase === "running";
  const isPaused = state.phase === "paused";
  const isIdle = state.phase === "idle";
  const isCompleted = state.phase === "completed";

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const progressPercentage =
    state.totalActivities > 0
      ? (state.completedActivities / state.totalActivities) * 100
      : 0;

  if (compact) {
    return (
      <CompactExecutionBar
        state={state}
        onStart={onStart}
        onPause={onPause}
        onResume={onResume}
        onStop={onStop}
        className={className}
      />
    );
  }

  return (
    <div
      className={cn(
        "bg-gray-900 border border-gray-700 rounded-xl overflow-hidden",
        className
      )}
    >
      {/* Main Control Row */}
      <div className="px-4 py-3 flex items-center gap-4">
        {/* Playback Controls */}
        <div className="flex items-center gap-2">
          {isIdle ? (
            <Button
              variant="primary"
              size="sm"
              onClick={onStart}
              leftIcon={<Play className="h-4 w-4" />}
            >
              Start Day
            </Button>
          ) : isCompleted ? (
            <Button
              variant="outline"
              size="sm"
              onClick={onStart}
              leftIcon={<Play className="h-4 w-4" />}
            >
              Restart
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                size="sm"
                onClick={isPaused ? onResume : onPause}
                className="text-white hover:bg-gray-800"
              >
                {isPaused ? (
                  <Play className="h-4 w-4" />
                ) : (
                  <Pause className="h-4 w-4" />
                )}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={onStop}
                className="text-white hover:bg-gray-800"
              >
                <Square className="h-4 w-4" />
              </Button>
            </>
          )}
        </div>

        {/* Time Display */}
        <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-800 rounded-lg">
          <Clock className="h-4 w-4 text-gray-400" />
          <span className="font-mono text-lg text-white">
            {formatTime(state.simulatedTime.current)}
          </span>
          {state.delayMinutes > 0 && (
            <span className="text-sm text-orange-400 font-medium">
              +{state.delayMinutes}m
            </span>
          )}
        </div>

        {/* Speed Control */}
        <div className="relative">
          <button
            onClick={() => setShowSpeedOptions(!showSpeedOptions)}
            className="flex items-center gap-1 px-3 py-1.5 bg-gray-800 rounded-lg text-gray-300 hover:text-white transition-colors"
          >
            <FastForward className="h-4 w-4" />
            <span className="text-sm font-medium">
              {state.simulatedTime.speed}x
            </span>
            <ChevronDown className="h-3 w-3" />
          </button>

          <AnimatePresence>
            {showSpeedOptions && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="absolute top-full left-0 mt-1 bg-gray-800 border border-gray-700 rounded-lg shadow-lg overflow-hidden z-10"
              >
                {SPEED_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    onClick={() => {
                      onSpeedChange(option.value);
                      setShowSpeedOptions(false);
                    }}
                    className={cn(
                      "w-full px-4 py-2 text-left text-sm hover:bg-gray-700",
                      state.simulatedTime.speed === option.value
                        ? "text-purple-400 bg-gray-700"
                        : "text-gray-300"
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Progress */}
        <div className="flex-1 flex items-center gap-3">
          <div className="flex-1 h-2 bg-gray-800 rounded-full overflow-hidden">
            <motion.div
              className="h-full bg-purple-600"
              initial={{ width: 0 }}
              animate={{ width: `${progressPercentage}%` }}
              transition={{ duration: 0.3 }}
            />
          </div>
          <span className="text-sm text-gray-400 whitespace-nowrap">
            {state.completedActivities}/{state.totalActivities}
          </span>
        </div>

        {/* Current Activity */}
        {state.currentActivityName && (
          <div className="flex items-center gap-2 px-3 py-1.5 bg-purple-900/30 border border-purple-700 rounded-lg">
            <Navigation className="h-4 w-4 text-purple-400" />
            <span className="text-sm text-purple-300 max-w-[150px] truncate">
              {state.currentActivityName}
            </span>
          </div>
        )}

        {/* Quick Actions */}
        {(isRunning || isPaused) && (
          <div className="flex items-center gap-1">
            {onSkipActivity && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onSkipActivity}
                className="text-gray-400 hover:text-white"
                title="Skip current activity"
              >
                <SkipForward className="h-4 w-4" />
              </Button>
            )}
            {onExtendActivity && (
              <Button
                variant="ghost"
                size="sm"
                onClick={onExtendActivity}
                className="text-gray-400 hover:text-white"
                title="Extend current activity"
              >
                <Timer className="h-4 w-4" />
              </Button>
            )}
          </div>
        )}

        {/* Scenario Trigger */}
        {(isRunning || isPaused) && (
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowScenarios(!showScenarios)}
            leftIcon={<Zap className="h-4 w-4" />}
            rightIcon={
              showScenarios ? (
                <ChevronUp className="h-3 w-3" />
              ) : (
                <ChevronDown className="h-3 w-3" />
              )
            }
            className="border-amber-700 text-amber-400 hover:bg-amber-900/30"
          >
            Trigger
          </Button>
        )}
      </div>

      {/* Scenario Panel */}
      <AnimatePresence>
        {showScenarios && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden border-t border-gray-700"
          >
            <div className="px-4 py-3 bg-gray-800/50">
              <div className="text-xs text-gray-500 mb-2 uppercase tracking-wider">
                Trigger Scenario
              </div>
              <div className="grid grid-cols-4 gap-2">
                {SCENARIO_TRIGGERS.map((scenario) => (
                  <button
                    key={scenario.id}
                    onClick={() => {
                      onTriggerScenario(scenario.id);
                      setShowScenarios(false);
                    }}
                    className={cn(
                      "flex flex-col items-center gap-2 p-3 rounded-lg",
                      "border border-gray-700 hover:border-gray-600",
                      "bg-gray-800 hover:bg-gray-700/50",
                      "transition-colors text-center"
                    )}
                  >
                    <div className={cn("p-2 rounded-lg", scenario.color)}>
                      <scenario.icon className="h-4 w-4" />
                    </div>
                    <span className="text-xs font-medium text-gray-300">
                      {scenario.label}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// COMPACT EXECUTION BAR
// ============================================

interface CompactExecutionBarProps {
  state: ExecutionState;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  className?: string;
}

function CompactExecutionBar({
  state,
  onStart,
  onPause,
  onResume,
  onStop,
  className,
}: CompactExecutionBarProps) {
  const isRunning = state.phase === "running";
  const isPaused = state.phase === "paused";
  const isIdle = state.phase === "idle";
  const isCompleted = state.phase === "completed";

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  };

  const progressPercentage =
    state.totalActivities > 0
      ? (state.completedActivities / state.totalActivities) * 100
      : 0;

  return (
    <div
      className={cn(
        "flex items-center gap-3 px-4 py-2 bg-gray-900 border border-gray-700 rounded-lg",
        className
      )}
    >
      {/* Play/Pause/Stop */}
      {isIdle ? (
        <Button
          variant="primary"
          size="sm"
          onClick={onStart}
          leftIcon={<Play className="h-3 w-3" />}
          className="text-xs"
        >
          Execute
        </Button>
      ) : isCompleted ? (
        <div className="flex items-center gap-1 text-green-400 text-sm">
          <CheckCircle2 className="h-4 w-4" />
          <span>Complete</span>
        </div>
      ) : (
        <div className="flex items-center gap-1">
          <button
            onClick={isPaused ? onResume : onPause}
            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800"
          >
            {isPaused ? (
              <Play className="h-3 w-3" />
            ) : (
              <Pause className="h-3 w-3" />
            )}
          </button>
          <button
            onClick={onStop}
            className="p-1.5 rounded text-gray-400 hover:text-white hover:bg-gray-800"
          >
            <Square className="h-3 w-3" />
          </button>
        </div>
      )}

      {/* Time */}
      <div className="flex items-center gap-1 text-sm">
        <Clock className="h-3 w-3 text-gray-500" />
        <span className="font-mono text-white">
          {formatTime(state.simulatedTime.current)}
        </span>
        {state.delayMinutes > 0 && (
          <span className="text-orange-400 text-xs">
            +{state.delayMinutes}m
          </span>
        )}
      </div>

      {/* Progress */}
      <div className="flex-1 h-1.5 bg-gray-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-purple-600 transition-all"
          style={{ width: `${progressPercentage}%` }}
        />
      </div>

      <span className="text-xs text-gray-500">
        {state.completedActivities}/{state.totalActivities}
      </span>
    </div>
  );
}

// ============================================
// ACTIVITY STATUS INDICATOR
// ============================================

export type ActivityExecutionStatus =
  | "upcoming"
  | "pending"
  | "en_route"
  | "arrived"
  | "in_progress"
  | "completed"
  | "skipped";

interface ActivityStatusIndicatorProps {
  status: ActivityExecutionStatus;
  className?: string;
  showLabel?: boolean;
}

export function ActivityStatusIndicator({
  status,
  className,
  showLabel = false,
}: ActivityStatusIndicatorProps) {
  const config = getActivityStatusConfig(status);

  return (
    <div className={cn("flex items-center gap-1.5", className)}>
      <div className={cn("p-1 rounded-full", config.bgColor)}>
        <config.icon className={cn("h-3 w-3", config.iconColor)} />
      </div>
      {showLabel && (
        <span
          className={cn("text-xs font-medium capitalize", config.textColor)}
        >
          {status.replace("_", " ")}
        </span>
      )}
    </div>
  );
}

function getActivityStatusConfig(status: ActivityExecutionStatus) {
  const configs: Record<
    ActivityExecutionStatus,
    {
      icon: React.ElementType;
      bgColor: string;
      iconColor: string;
      textColor: string;
    }
  > = {
    upcoming: {
      icon: Clock,
      bgColor: "bg-gray-100 dark:bg-gray-800",
      iconColor: "text-gray-500",
      textColor: "text-gray-500",
    },
    pending: {
      icon: Timer,
      bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
      iconColor: "text-yellow-600 dark:text-yellow-400",
      textColor: "text-yellow-600 dark:text-yellow-400",
    },
    en_route: {
      icon: Navigation,
      bgColor: "bg-blue-100 dark:bg-blue-900/30",
      iconColor: "text-blue-600 dark:text-blue-400",
      textColor: "text-blue-600 dark:text-blue-400",
    },
    arrived: {
      icon: MapPin,
      bgColor: "bg-teal-100 dark:bg-teal-900/30",
      iconColor: "text-teal-600 dark:text-teal-400",
      textColor: "text-teal-600 dark:text-teal-400",
    },
    in_progress: {
      icon: Play,
      bgColor: "bg-purple-100 dark:bg-purple-900/30",
      iconColor: "text-purple-600 dark:text-purple-400",
      textColor: "text-purple-600 dark:text-purple-400",
    },
    completed: {
      icon: CheckCircle2,
      bgColor: "bg-green-100 dark:bg-green-900/30",
      iconColor: "text-green-600 dark:text-green-400",
      textColor: "text-green-600 dark:text-green-400",
    },
    skipped: {
      icon: SkipForward,
      bgColor: "bg-gray-100 dark:bg-gray-800",
      iconColor: "text-gray-400",
      textColor: "text-gray-400",
    },
  };

  return configs[status] || configs.upcoming;
}

// ============================================
// EXECUTION MODE TOGGLE
// ============================================

interface ExecutionModeToggleProps {
  isExecutionMode: boolean;
  onToggle: () => void;
  disabled?: boolean;
  className?: string;
}

export function ExecutionModeToggle({
  isExecutionMode,
  onToggle,
  disabled = false,
  className,
}: ExecutionModeToggleProps) {
  return (
    <Button
      variant={isExecutionMode ? "primary" : "outline"}
      size="sm"
      onClick={onToggle}
      disabled={disabled}
      leftIcon={
        isExecutionMode ? (
          <Pause className="h-4 w-4" />
        ) : (
          <Play className="h-4 w-4" />
        )
      }
      className={className}
    >
      {isExecutionMode ? "Exit Execution" : "Execute Day"}
    </Button>
  );
}

// ============================================
// HOOK FOR EXECUTION STATE
// ============================================

export function useExecutionState(initialActivities: number = 0) {
  const [state, setState] = useState<ExecutionState>({
    phase: "idle",
    currentActivityId: null,
    currentActivityName: null,
    delayMinutes: 0,
    completedActivities: 0,
    totalActivities: initialActivities,
    simulatedTime: {
      current: new Date(),
      speed: 1,
    },
  });

  const start = useCallback((startTime?: Date) => {
    setState((prev) => ({
      ...prev,
      phase: "running",
      simulatedTime: {
        ...prev.simulatedTime,
        current: startTime || new Date(),
      },
    }));
  }, []);

  const pause = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: "paused",
    }));
  }, []);

  const resume = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: "running",
    }));
  }, []);

  const stop = useCallback(() => {
    setState((prev) => ({
      ...prev,
      phase: "idle",
      currentActivityId: null,
      currentActivityName: null,
      delayMinutes: 0,
      completedActivities: 0,
    }));
  }, []);

  const setSpeed = useCallback((speed: number) => {
    setState((prev) => ({
      ...prev,
      simulatedTime: {
        ...prev.simulatedTime,
        speed,
      },
    }));
  }, []);

  const updateCurrentActivity = useCallback(
    (activityId: string | null, activityName: string | null) => {
      setState((prev) => ({
        ...prev,
        currentActivityId: activityId,
        currentActivityName: activityName,
      }));
    },
    []
  );

  const addDelay = useCallback((minutes: number) => {
    setState((prev) => ({
      ...prev,
      delayMinutes: prev.delayMinutes + minutes,
    }));
  }, []);

  const completeActivity = useCallback(() => {
    setState((prev) => ({
      ...prev,
      completedActivities: Math.min(
        prev.completedActivities + 1,
        prev.totalActivities
      ),
    }));
  }, []);

  const setTotalActivities = useCallback((count: number) => {
    setState((prev) => ({
      ...prev,
      totalActivities: count,
    }));
  }, []);

  const advanceTime = useCallback((minutes: number) => {
    setState((prev) => ({
      ...prev,
      simulatedTime: {
        ...prev.simulatedTime,
        current: new Date(
          prev.simulatedTime.current.getTime() + minutes * 60 * 1000
        ),
      },
    }));
  }, []);

  // Simulation tick effect
  useEffect(() => {
    if (state.phase !== "running") return;

    const interval = setInterval(() => {
      setState((prev) => ({
        ...prev,
        simulatedTime: {
          ...prev.simulatedTime,
          current: new Date(
            prev.simulatedTime.current.getTime() +
              1000 * prev.simulatedTime.speed
          ),
        },
      }));
    }, 1000);

    return () => clearInterval(interval);
  }, [state.phase]);

  return {
    state,
    start,
    pause,
    resume,
    stop,
    setSpeed,
    updateCurrentActivity,
    addDelay,
    completeActivity,
    setTotalActivities,
    advanceTime,
  };
}

export default ExecutionControlBar;
