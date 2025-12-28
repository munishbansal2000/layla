"use client";

import React, { useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  X,
  Clock,
  AlertTriangle,
  ArrowRight,
  Undo2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Zap,
  Coffee,
  SkipForward,
  Shuffle,
  Calendar,
  Shield,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { StatusBadge } from "./StatusBadge";
import type {
  ReshuffleResult,
  ReshuffleStrategy,
  ScheduleChange,
  ImpactAnalysis,
  TriggerEvent,
} from "@/types/reshuffling";

// ============================================
// RESHUFFLE MODAL COMPONENT
// ============================================

interface ReshuffleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onApply: (result: ReshuffleResult) => void;
  onReject: () => void;
  trigger: TriggerEvent | null;
  impact: ImpactAnalysis | null;
  suggestedResult: ReshuffleResult | null;
  alternatives: ReshuffleResult[];
  autoApplyCountdown?: number | null;
  isProcessing?: boolean;
}

export function ReshuffleModal({
  isOpen,
  onClose,
  onApply,
  onReject,
  trigger,
  impact,
  suggestedResult,
  alternatives,
  autoApplyCountdown,
  isProcessing = false,
}: ReshuffleModalProps) {
  const [showDetails, setShowDetails] = React.useState(false);
  const [selectedAlternative, setSelectedAlternative] = React.useState<
    number | null
  >(null);

  // Get the currently selected result
  const currentResult =
    selectedAlternative !== null
      ? alternatives[selectedAlternative]
      : suggestedResult;

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };

    document.addEventListener("keydown", handleEscape);
    return () => document.removeEventListener("keydown", handleEscape);
  }, [isOpen, onClose]);

  // Handle apply
  const handleApply = useCallback(() => {
    if (currentResult) {
      onApply(currentResult);
    }
  }, [currentResult, onApply]);

  if (!isOpen || !suggestedResult) return null;

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
          onClick={onClose}
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
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
          <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-orange-100 dark:bg-orange-900/30">
                  <AlertTriangle className="h-5 w-5 text-orange-600 dark:text-orange-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Schedule Adjustment Needed
                  </h2>
                  {trigger && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {getTriggerDescription(trigger)}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
          </div>

          {/* Impact Summary */}
          {impact && (
            <div className="px-6 py-3 bg-gray-50 dark:bg-gray-800/50 border-b border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between text-sm">
                <span className="text-gray-600 dark:text-gray-400">
                  {impact.summary}
                </span>
                <StatusBadge
                  status={
                    impact.urgency === "immediate"
                      ? "critical"
                      : impact.urgency === "within_hour"
                      ? "needs_attention"
                      : "minor_delay"
                  }
                  size="sm"
                />
              </div>
            </div>
          )}

          {/* Suggested Action */}
          <div className="px-6 py-4">
            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                Suggested Action
              </h3>
              <StrategyCard
                strategy={currentResult?.strategy || suggestedResult.strategy}
                explanation={
                  currentResult?.explanation || suggestedResult.explanation
                }
                timeSaved={
                  currentResult?.timeSavedMinutes ||
                  suggestedResult.timeSavedMinutes
                }
                activitiesAffected={
                  currentResult?.activitiesAffected ||
                  suggestedResult.activitiesAffected
                }
                bookingsProtected={
                  currentResult?.bookingsProtected ||
                  suggestedResult.bookingsProtected
                }
                isSelected={true}
              />
            </div>

            {/* Changes Preview */}
            {currentResult && currentResult.changes.length > 0 && (
              <div className="mb-4">
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
                    {showDetails ? "Hide" : "Show"}{" "}
                    {currentResult.changes.length} change
                    {currentResult.changes.length !== 1 ? "s" : ""}
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
                        {currentResult.changes.map((change) => (
                          <ChangeItem key={change.id} change={change} />
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}

            {/* Alternatives */}
            {alternatives.length > 0 && (
              <div className="mb-4">
                <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-2">
                  Other Options
                </h3>
                <div className="space-y-2">
                  {alternatives.map((alt, index) => (
                    <motion.button
                      key={alt.id}
                      onClick={() =>
                        setSelectedAlternative(
                          selectedAlternative === index ? null : index
                        )
                      }
                      whileHover={{ scale: 1.01 }}
                      whileTap={{ scale: 0.99 }}
                      className={cn(
                        "w-full text-left p-3 rounded-xl border transition-all",
                        selectedAlternative === index
                          ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
                          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <StrategyIcon strategy={alt.strategy} size="sm" />
                          <span className="text-sm font-medium text-gray-900 dark:text-white">
                            {getStrategyLabel(alt.strategy)}
                          </span>
                        </div>
                        {selectedAlternative === index && (
                          <CheckCircle2 className="h-4 w-4 text-purple-600" />
                        )}
                      </div>
                      <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 line-clamp-1">
                        {alt.explanation}
                      </p>
                    </motion.button>
                  ))}
                </div>
              </div>
            )}

            {/* Auto-apply countdown */}
            {autoApplyCountdown !== undefined &&
              autoApplyCountdown !== null &&
              autoApplyCountdown > 0 && (
                <div className="mb-4 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800">
                  <div className="flex items-center gap-2 text-sm text-blue-700 dark:text-blue-400">
                    <Clock className="h-4 w-4" />
                    <span>
                      Auto-applying in {autoApplyCountdown} second
                      {autoApplyCountdown !== 1 ? "s" : ""}...
                    </span>
                  </div>
                </div>
              )}
          </div>

          {/* Footer */}
          <div className="px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="ghost"
                size="md"
                onClick={onReject}
                disabled={isProcessing}
                leftIcon={<X className="h-4 w-4" />}
              >
                Keep Original
              </Button>
              <div className="flex items-center gap-2">
                {currentResult?.canUndo && (
                  <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                    <Undo2 className="h-3 w-3" />
                    <span>Can undo</span>
                  </div>
                )}
                <Button
                  variant="primary"
                  size="md"
                  onClick={handleApply}
                  isLoading={isProcessing}
                  rightIcon={<ArrowRight className="h-4 w-4" />}
                >
                  Apply Changes
                </Button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ============================================
// STRATEGY CARD
// ============================================

interface StrategyCardProps {
  strategy: ReshuffleStrategy;
  explanation: string;
  timeSaved?: number;
  activitiesAffected?: number;
  bookingsProtected?: number;
  isSelected?: boolean;
  onClick?: () => void;
}

function StrategyCard({
  strategy,
  explanation,
  timeSaved,
  activitiesAffected,
  bookingsProtected,
  isSelected = false,
  onClick,
}: StrategyCardProps) {
  return (
    <motion.div
      onClick={onClick}
      whileHover={onClick ? { scale: 1.01 } : {}}
      whileTap={onClick ? { scale: 0.99 } : {}}
      className={cn(
        "p-4 rounded-xl border transition-all",
        isSelected
          ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
          : "border-gray-200 dark:border-gray-700",
        onClick &&
          "cursor-pointer hover:border-gray-300 dark:hover:border-gray-600"
      )}
    >
      <div className="flex items-start gap-3">
        <StrategyIcon strategy={strategy} size="md" />
        <div className="flex-1">
          <h4 className="font-medium text-gray-900 dark:text-white">
            {getStrategyLabel(strategy)}
          </h4>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            {explanation}
          </p>

          {/* Metrics */}
          <div className="mt-3 flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
            {timeSaved !== undefined && timeSaved > 0 && (
              <div className="flex items-center gap-1">
                <Clock className="h-3 w-3" />
                <span>{timeSaved} min saved</span>
              </div>
            )}
            {activitiesAffected !== undefined && activitiesAffected > 0 && (
              <div className="flex items-center gap-1">
                <Shuffle className="h-3 w-3" />
                <span>{activitiesAffected} changes</span>
              </div>
            )}
            {bookingsProtected !== undefined && bookingsProtected > 0 && (
              <div className="flex items-center gap-1 text-green-600 dark:text-green-400">
                <Shield className="h-3 w-3" />
                <span>
                  {bookingsProtected} booking{bookingsProtected > 1 ? "s" : ""}{" "}
                  protected
                </span>
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================
// STRATEGY ICON
// ============================================

interface StrategyIconProps {
  strategy: ReshuffleStrategy;
  size?: "sm" | "md" | "lg";
}

function StrategyIcon({ strategy, size = "md" }: StrategyIconProps) {
  const sizeClasses = {
    sm: "p-1.5 rounded-lg",
    md: "p-2 rounded-xl",
    lg: "p-3 rounded-2xl",
  };

  const iconSizes = {
    sm: "h-4 w-4",
    md: "h-5 w-5",
    lg: "h-6 w-6",
  };

  const config = strategyConfig[strategy] || strategyConfig.no_action;
  const Icon = config.icon;

  return (
    <div className={cn(sizeClasses[size], config.bgColor)}>
      <Icon className={cn(iconSizes[size], config.iconColor)} />
    </div>
  );
}

// ============================================
// CHANGE ITEM
// ============================================

interface ChangeItemProps {
  change: ScheduleChange;
}

function ChangeItem({ change }: ChangeItemProps) {
  const getChangeIcon = () => {
    switch (change.type) {
      case "time_shift":
        return <Clock className="h-4 w-4 text-blue-500" />;
      case "duration_change":
        return <Clock className="h-4 w-4 text-yellow-500" />;
      case "activity_removed":
        return <SkipForward className="h-4 w-4 text-red-500" />;
      case "activity_added":
        return <Zap className="h-4 w-4 text-green-500" />;
      case "order_swap":
        return <Shuffle className="h-4 w-4 text-purple-500" />;
      default:
        return <ArrowRight className="h-4 w-4 text-gray-500" />;
    }
  };

  return (
    <div className="flex items-start gap-3 p-2 rounded-lg bg-gray-50 dark:bg-gray-800/50">
      <div className="mt-0.5">{getChangeIcon()}</div>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-gray-900 dark:text-white truncate">
          {change.activityName}
        </div>
        <div className="text-xs text-gray-500 dark:text-gray-400">
          {change.description}
        </div>
        {change.before.startTime && change.after.startTime && (
          <div className="mt-1 flex items-center gap-2 text-xs">
            <span className="text-gray-400 line-through">
              {change.before.startTime}
            </span>
            <ArrowRight className="h-3 w-3 text-gray-400" />
            <span className="text-gray-900 dark:text-white font-medium">
              {change.after.startTime}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// HELPER FUNCTIONS & CONFIG
// ============================================

const strategyConfig: Record<
  ReshuffleStrategy,
  {
    label: string;
    icon: React.ElementType;
    bgColor: string;
    iconColor: string;
  }
> = {
  compress_buffer: {
    label: "Compress Buffers",
    icon: Clock,
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    iconColor: "text-blue-600 dark:text-blue-400",
  },
  shorten_activity: {
    label: "Shorten Activity",
    icon: Clock,
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    iconColor: "text-yellow-600 dark:text-yellow-400",
  },
  skip_activity: {
    label: "Skip Activity",
    icon: SkipForward,
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    iconColor: "text-orange-600 dark:text-orange-400",
  },
  swap_order: {
    label: "Swap Order",
    icon: Shuffle,
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
    iconColor: "text-purple-600 dark:text-purple-400",
  },
  replace_activity: {
    label: "Replace Activity",
    icon: Shuffle,
    bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
    iconColor: "text-indigo-600 dark:text-indigo-400",
  },
  split_group: {
    label: "Split Group",
    icon: Shuffle,
    bgColor: "bg-pink-100 dark:bg-pink-900/30",
    iconColor: "text-pink-600 dark:text-pink-400",
  },
  defer_to_tomorrow: {
    label: "Move to Tomorrow",
    icon: Calendar,
    bgColor: "bg-teal-100 dark:bg-teal-900/30",
    iconColor: "text-teal-600 dark:text-teal-400",
  },
  cancel_gracefully: {
    label: "Cancel Gracefully",
    icon: X,
    bgColor: "bg-gray-100 dark:bg-gray-800",
    iconColor: "text-gray-600 dark:text-gray-400",
  },
  emergency_reroute: {
    label: "Clear Schedule",
    icon: Coffee,
    bgColor: "bg-red-100 dark:bg-red-900/30",
    iconColor: "text-red-600 dark:text-red-400",
  },
  no_action: {
    label: "No Changes",
    icon: CheckCircle2,
    bgColor: "bg-green-100 dark:bg-green-900/30",
    iconColor: "text-green-600 dark:text-green-400",
  },
};

function getStrategyLabel(strategy: ReshuffleStrategy): string {
  return strategyConfig[strategy]?.label || "Unknown Strategy";
}

function getTriggerDescription(trigger: TriggerEvent): string {
  switch (trigger.type) {
    case "running_late":
      return trigger.context.delayMinutes
        ? `Running ${trigger.context.delayMinutes} minutes late`
        : "Running behind schedule";
    case "weather_change":
      return "Weather conditions have changed";
    case "closure":
      return trigger.context.closureContext?.venueName
        ? `${trigger.context.closureContext.venueName} is closed`
        : "A venue is unexpectedly closed";
    case "transport_delay":
      return "Transportation delay detected";
    case "user_state":
      return getUserStateDescription(trigger.context.userState);
    case "user_request":
      return trigger.context.userMessage || "Schedule adjustment requested";
    default:
      return "Schedule needs adjustment";
  }
}

function getUserStateDescription(state?: string): string {
  switch (state) {
    case "slight_tired":
      return "Feeling a bit tired";
    case "very_tired":
      return "Feeling exhausted";
    case "need_break":
      return "Need a break";
    case "done_for_day":
      return "Ready to call it a day";
    case "sick":
      return "Not feeling well";
    case "energized":
      return "Feeling energized";
    default:
      return "Schedule adjustment needed";
  }
}

// ============================================
// EXPORTS
// ============================================

export { StrategyCard, StrategyIcon, ChangeItem };
export { getStrategyLabel, getTriggerDescription, strategyConfig };
