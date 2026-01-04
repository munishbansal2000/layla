"use client";

import React, { useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  X,
  Clock,
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  SkipForward,
  Timer,
  Calendar,
  Shield,
  Coffee,
  Shuffle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { Button } from "@/components/ui/Button";

// ============================================
// DECISION TYPES
// ============================================

export type DecisionType =
  | "late_start"
  | "delayed_departure"
  | "activity_extension"
  | "skip_activity"
  | "reshuffle_needed"
  | "booking_at_risk";

export interface DecisionOption {
  id: string;
  label: string;
  description: string;
  icon: React.ElementType;
  impact?: string;
  recommended?: boolean;
  destructive?: boolean;
}

export interface DecisionContext {
  type: DecisionType;
  title: string;
  description: string;
  currentTime: string;
  delayMinutes?: number;
  activityName?: string;
  slotId?: string;
  options: DecisionOption[];
  bookingAtRisk?: {
    name: string;
    time: string;
    buffer: number;
  };
  impacts?: {
    activitiesAffected: string[];
    timeSaved: number;
  };
}

// ============================================
// DECISION MODAL
// ============================================

interface ExecutionDecisionModalProps {
  isOpen: boolean;
  decision: DecisionContext | null;
  onSelect: (optionId: string) => void;
  onDismiss: () => void;
  isProcessing?: boolean;
}

export function ExecutionDecisionModal({
  isOpen,
  decision,
  onSelect,
  onDismiss,
  isProcessing = false,
}: ExecutionDecisionModalProps) {
  const [selectedOption, setSelectedOption] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);

  const handleConfirm = useCallback(() => {
    if (selectedOption) {
      onSelect(selectedOption);
    }
  }, [selectedOption, onSelect]);

  if (!isOpen || !decision) return null;

  const config = getDecisionConfig(decision.type);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center"
      >
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onDismiss}
          className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        />

        {/* Modal */}
        <motion.div
          initial={{ opacity: 0, y: 100, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 100, scale: 0.95 }}
          transition={{ type: "spring", damping: 25, stiffness: 300 }}
          className={cn(
            "relative w-full max-w-lg mx-4 mb-4 sm:mb-0",
            "bg-white dark:bg-gray-900 rounded-2xl shadow-2xl",
            "border border-gray-200 dark:border-gray-700",
            "overflow-hidden"
          )}
        >
          {/* Header */}
          <div
            className={cn(
              "px-6 py-4 border-b border-gray-100 dark:border-gray-800",
              config.headerBg
            )}
          >
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className={cn("p-2 rounded-xl", config.iconBg)}>
                  <config.icon className={cn("h-5 w-5", config.iconColor)} />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {decision.title}
                  </h2>
                  <div className="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
                    <Clock className="h-3.5 w-3.5" />
                    <span>{decision.currentTime}</span>
                    {decision.delayMinutes && decision.delayMinutes > 0 && (
                      <span className="text-orange-600 dark:text-orange-400 font-medium">
                        +{decision.delayMinutes} min behind
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <button
                onClick={onDismiss}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Description */}
          <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {decision.description}
            </p>
          </div>

          {/* Booking Warning */}
          {decision.bookingAtRisk && (
            <div className="mx-6 mt-4 p-3 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-red-600 dark:text-red-400" />
                <span className="text-sm font-medium text-red-700 dark:text-red-300">
                  Booking at Risk
                </span>
              </div>
              <p className="mt-1 text-xs text-red-600 dark:text-red-400">
                {decision.bookingAtRisk.name} at {decision.bookingAtRisk.time} —
                only {decision.bookingAtRisk.buffer} min buffer remaining
              </p>
            </div>
          )}

          {/* Options */}
          <div className="px-6 py-4 space-y-3">
            <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400">
              What would you like to do?
            </h3>

            {decision.options.map((option) => (
              <motion.button
                key={option.id}
                onClick={() => setSelectedOption(option.id)}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.99 }}
                className={cn(
                  "w-full text-left p-4 rounded-xl border-2 transition-all",
                  selectedOption === option.id
                    ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                    : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600",
                  option.destructive &&
                    selectedOption === option.id &&
                    "border-red-500 bg-red-50 dark:bg-red-900/20"
                )}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={cn(
                      "p-2 rounded-lg",
                      selectedOption === option.id
                        ? option.destructive
                          ? "bg-red-100 dark:bg-red-900/30"
                          : "bg-purple-100 dark:bg-purple-900/30"
                        : "bg-gray-100 dark:bg-gray-800"
                    )}
                  >
                    <option.icon
                      className={cn(
                        "h-4 w-4",
                        selectedOption === option.id
                          ? option.destructive
                            ? "text-red-600 dark:text-red-400"
                            : "text-purple-600 dark:text-purple-400"
                          : "text-gray-600 dark:text-gray-400"
                      )}
                    />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-gray-900 dark:text-white">
                        {option.label}
                      </span>
                      <div className="flex items-center gap-2">
                        {option.recommended && (
                          <span className="px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
                            Recommended
                          </span>
                        )}
                        {selectedOption === option.id && (
                          <CheckCircle2 className="h-5 w-5 text-purple-600" />
                        )}
                      </div>
                    </div>
                    <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                      {option.description}
                    </p>
                    {option.impact && (
                      <p className="mt-1 text-xs text-gray-400 dark:text-gray-500">
                        {option.impact}
                      </p>
                    )}
                  </div>
                </div>
              </motion.button>
            ))}
          </div>

          {/* Impact Details */}
          {decision.impacts &&
            decision.impacts.activitiesAffected.length > 0 && (
              <div className="px-6 pb-4">
                <button
                  onClick={() => setShowDetails(!showDetails)}
                  className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors"
                >
                  {showDetails ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                  <span>
                    {showDetails ? "Hide" : "Show"} impact on{" "}
                    {decision.impacts.activitiesAffected.length} activit
                    {decision.impacts.activitiesAffected.length === 1
                      ? "y"
                      : "ies"}
                  </span>
                </button>

                <AnimatePresence>
                  {showDetails && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="mt-3 space-y-2">
                        {decision.impacts.activitiesAffected.map(
                          (activity, index) => (
                            <div
                              key={index}
                              className="flex items-center gap-2 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 text-sm"
                            >
                              <ArrowRight className="h-3 w-3 text-gray-400" />
                              <span className="text-gray-700 dark:text-gray-300">
                                {activity}
                              </span>
                            </div>
                          )
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="ghost"
                size="md"
                onClick={onDismiss}
                disabled={isProcessing}
              >
                Dismiss
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleConfirm}
                disabled={!selectedOption || isProcessing}
                isLoading={isProcessing}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                Confirm
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ============================================
// QUICK ACTION BAR
// ============================================

interface QuickAction {
  id: string;
  label: string;
  icon: React.ElementType;
  color: string;
}

interface QuickActionBarProps {
  actions: QuickAction[];
  onAction: (actionId: string) => void;
  disabled?: boolean;
}

export function QuickActionBar({
  actions,
  onAction,
  disabled,
}: QuickActionBarProps) {
  return (
    <div className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-800 rounded-xl">
      {actions.map((action) => (
        <motion.button
          key={action.id}
          onClick={() => onAction(action.id)}
          disabled={disabled}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg",
            "text-sm font-medium transition-colors",
            disabled
              ? "opacity-50 cursor-not-allowed"
              : "hover:bg-white dark:hover:bg-gray-700",
            action.color
          )}
        >
          <action.icon className="h-4 w-4" />
          <span>{action.label}</span>
        </motion.button>
      ))}
    </div>
  );
}

// ============================================
// PRESET DECISIONS
// ============================================

export function createLateWakeupDecision(
  currentTime: string,
  delayMinutes: number,
  breakfastName: string,
  nextActivityName: string,
  hasBooking: boolean,
  bookingInfo?: { name: string; time: string; buffer: number }
): DecisionContext {
  return {
    type: "late_start",
    title: "Late Start Detected",
    description: `You're running ${delayMinutes} minutes behind schedule. Let's figure out the best way to get back on track.`,
    currentTime,
    delayMinutes,
    activityName: breakfastName,
    options: [
      {
        id: "skip_breakfast",
        label: "Skip Breakfast",
        description: `Skip ${breakfastName} and head straight to ${nextActivityName}`,
        icon: SkipForward,
        impact: `Saves ~${delayMinutes} min, back on schedule`,
        recommended: true,
      },
      {
        id: "quick_breakfast",
        label: "Quick 15-min Breakfast",
        description: "Grab something quick and adjust the rest of the day",
        icon: Coffee,
        impact: `Still ${Math.max(0, delayMinutes - 30)} min behind`,
      },
      {
        id: "keep_schedule",
        label: "Keep Original Schedule",
        description: "Proceed with breakfast as planned, reshuffle later",
        icon: Calendar,
        impact: `${delayMinutes} min delay will cascade`,
        destructive: hasBooking,
      },
    ],
    bookingAtRisk: hasBooking ? bookingInfo : undefined,
  };
}

export function createDelayedDepartureDecision(
  currentTime: string,
  delayMinutes: number,
  currentActivity: string,
  nextActivity: string,
  hasBooking: boolean,
  bookingInfo?: { name: string; time: string; buffer: number }
): DecisionContext {
  return {
    type: "delayed_departure",
    title: "Delayed Departure",
    description: `You're still at ${currentActivity} but should have left for ${nextActivity} ${delayMinutes} minutes ago.`,
    currentTime,
    delayMinutes,
    activityName: currentActivity,
    options: [
      {
        id: "leave_now",
        label: "Leave Now",
        description: `Head to ${nextActivity} immediately`,
        icon: ArrowRight,
        impact: `Arrive ${delayMinutes} min late`,
        recommended: !hasBooking,
      },
      {
        id: "take_taxi",
        label: "Take a Taxi Instead",
        description: "Faster commute to make up time",
        icon: Timer,
        impact: "May recover some time",
        recommended: hasBooking,
      },
      {
        id: "skip_next",
        label: `Skip ${nextActivity}`,
        description: "Skip the next activity and catch up with the schedule",
        icon: SkipForward,
        impact: "Back on schedule after this",
      },
      {
        id: "reshuffle",
        label: "Reshuffle Day",
        description: "Reorganize remaining activities optimally",
        icon: Shuffle,
        impact: "AI will suggest best arrangement",
      },
    ],
    bookingAtRisk: hasBooking ? bookingInfo : undefined,
  };
}

export function createExtensionDecision(
  currentTime: string,
  activityName: string,
  extensionOptions: number[],
  impacts: string[]
): DecisionContext {
  return {
    type: "activity_extension",
    title: "Extend Current Activity?",
    description: `You seem to be enjoying ${activityName}. Would you like to stay longer?`,
    currentTime,
    activityName,
    options: extensionOptions.map((mins, index) => ({
      id: `extend_${mins}`,
      label: `+${mins} minutes`,
      description: `Stay ${mins} more minutes at ${activityName}`,
      icon: Clock,
      impact: impacts[index] || `Affects later activities`,
      recommended: index === 0,
    })),
  };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getDecisionConfig(type: DecisionType) {
  const configs: Record<
    DecisionType,
    {
      icon: React.ElementType;
      iconBg: string;
      iconColor: string;
      headerBg: string;
    }
  > = {
    late_start: {
      icon: Clock,
      iconBg: "bg-orange-100 dark:bg-orange-900/30",
      iconColor: "text-orange-600 dark:text-orange-400",
      headerBg: "",
    },
    delayed_departure: {
      icon: Timer,
      iconBg: "bg-yellow-100 dark:bg-yellow-900/30",
      iconColor: "text-yellow-600 dark:text-yellow-400",
      headerBg: "",
    },
    activity_extension: {
      icon: Clock,
      iconBg: "bg-blue-100 dark:bg-blue-900/30",
      iconColor: "text-blue-600 dark:text-blue-400",
      headerBg: "",
    },
    skip_activity: {
      icon: SkipForward,
      iconBg: "bg-purple-100 dark:bg-purple-900/30",
      iconColor: "text-purple-600 dark:text-purple-400",
      headerBg: "",
    },
    reshuffle_needed: {
      icon: Shuffle,
      iconBg: "bg-indigo-100 dark:bg-indigo-900/30",
      iconColor: "text-indigo-600 dark:text-indigo-400",
      headerBg: "",
    },
    booking_at_risk: {
      icon: AlertTriangle,
      iconBg: "bg-red-100 dark:bg-red-900/30",
      iconColor: "text-red-600 dark:text-red-400",
      headerBg: "bg-red-50 dark:bg-red-900/10",
    },
  };

  return configs[type] || configs.late_start;
}

// ============================================
// HOOK FOR DECISION MANAGEMENT
// ============================================

export function useExecutionDecisions() {
  const [currentDecision, setCurrentDecision] =
    useState<DecisionContext | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [decisionHistory, setDecisionHistory] = useState<
    Array<{
      decision: DecisionContext;
      selectedOption: string;
      timestamp: Date;
    }>
  >([]);

  const showDecision = useCallback((decision: DecisionContext) => {
    setCurrentDecision(decision);
  }, []);

  const handleSelect = useCallback(
    async (
      optionId: string,
      onConfirm?: (optionId: string) => Promise<void>
    ) => {
      if (!currentDecision) return;

      setIsProcessing(true);
      try {
        if (onConfirm) {
          await onConfirm(optionId);
        }

        setDecisionHistory((prev) => [
          {
            decision: currentDecision,
            selectedOption: optionId,
            timestamp: new Date(),
          },
          ...prev,
        ]);

        setCurrentDecision(null);
      } finally {
        setIsProcessing(false);
      }
    },
    [currentDecision]
  );

  const dismissDecision = useCallback(() => {
    setCurrentDecision(null);
  }, []);

  return {
    currentDecision,
    isProcessing,
    decisionHistory,
    showDecision,
    handleSelect,
    dismissDecision,
  };
}

export default ExecutionDecisionModal;
