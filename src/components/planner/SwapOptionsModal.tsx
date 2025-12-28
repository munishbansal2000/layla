"use client";

import { useState, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  X,
  Star,
  Clock,
  DollarSign,
  MapPin,
  Sparkles,
  ArrowRight,
  Loader2,
  RefreshCw,
  TrendingUp,
  ChevronDown,
  ChevronUp,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import {
  getScoreColor,
  getScoreBgColor,
  getScoreGradient,
} from "@/hooks/useActivitySelection";
import type { ScoredActivity } from "@/types/activity-suggestion";

// ============================================
// TYPES
// ============================================

export interface SwapOption {
  activity: ScoredActivity;
  reason: string;
  scoreImprovement: number;
}

interface SwapOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSwap: (activity: ScoredActivity) => void;
  currentActivity: ScoredActivity;
  options: SwapOption[];
  isLoading?: boolean;
  onRefresh?: () => void;
  slotLabel?: string;
}

// ============================================
// SWAP OPTIONS MODAL
// ============================================

export function SwapOptionsModal({
  isOpen,
  onClose,
  onSwap,
  currentActivity,
  options,
  isLoading = false,
  onRefresh,
  slotLabel,
}: SwapOptionsModalProps) {
  const [selectedOption, setSelectedOption] = useState<SwapOption | null>(null);
  const [showCurrentDetails, setShowCurrentDetails] = useState(false);

  // Reset selection when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedOption(null);
      setShowCurrentDetails(false);
    }
  }, [isOpen]);

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

  const handleSwap = useCallback(() => {
    if (selectedOption) {
      onSwap(selectedOption.activity);
    }
  }, [selectedOption, onSwap]);

  if (!isOpen) return null;

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
            "overflow-hidden max-h-[85vh] flex flex-col"
          )}
        >
          {/* Header */}
          <div className="flex-shrink-0 px-6 py-4 border-b border-gray-100 dark:border-gray-800">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-xl bg-purple-100 dark:bg-purple-900/30">
                  <RefreshCw className="h-5 w-5 text-purple-600 dark:text-purple-400" />
                </div>
                <div>
                  <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                    Swap Activity
                  </h2>
                  {slotLabel && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {slotLabel}
                    </p>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                {onRefresh && (
                  <button
                    onClick={onRefresh}
                    disabled={isLoading}
                    className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors disabled:opacity-50"
                  >
                    <RefreshCw
                      className={cn("h-4 w-4", isLoading && "animate-spin")}
                    />
                  </button>
                )}
                <button
                  onClick={onClose}
                  className="p-2 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4">
            {/* Current Activity */}
            <div className="mb-4">
              <button
                onClick={() => setShowCurrentDetails(!showCurrentDetails)}
                className="w-full text-left"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                    Current Activity
                  </span>
                  {showCurrentDetails ? (
                    <ChevronUp className="h-4 w-4 text-gray-400" />
                  ) : (
                    <ChevronDown className="h-4 w-4 text-gray-400" />
                  )}
                </div>
                <CurrentActivityCard
                  activity={currentActivity}
                  expanded={showCurrentDetails}
                />
              </button>
            </div>

            {/* Alternatives */}
            <div>
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide">
                  Alternative Options
                </span>
                <span className="text-xs text-gray-400">
                  {options.length} available
                </span>
              </div>

              {isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="h-8 w-8 animate-spin text-purple-500" />
                </div>
              ) : options.length === 0 ? (
                <div className="text-center py-8">
                  <Sparkles className="h-10 w-10 text-gray-300 dark:text-gray-600 mx-auto mb-3" />
                  <p className="text-gray-500 dark:text-gray-400">
                    No alternatives available for this slot
                  </p>
                  {onRefresh && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={onRefresh}
                      className="mt-3"
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Find More Options
                    </Button>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {options.map((option) => (
                    <SwapOptionCard
                      key={option.activity.activity.id}
                      option={option}
                      isSelected={
                        selectedOption?.activity.activity.id ===
                        option.activity.activity.id
                      }
                      onSelect={() => setSelectedOption(option)}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="flex-shrink-0 px-6 py-4 border-t border-gray-100 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center justify-between gap-3">
              <Button
                variant="ghost"
                size="md"
                onClick={onClose}
                leftIcon={<X className="h-4 w-4" />}
              >
                Cancel
              </Button>
              <Button
                variant="primary"
                size="md"
                onClick={handleSwap}
                disabled={!selectedOption}
                rightIcon={<ArrowRight className="h-4 w-4" />}
              >
                Swap Activity
              </Button>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ============================================
// CURRENT ACTIVITY CARD
// ============================================

interface CurrentActivityCardProps {
  activity: ScoredActivity;
  expanded: boolean;
}

function CurrentActivityCard({ activity, expanded }: CurrentActivityCardProps) {
  const score = activity.totalScore || 0;
  const coreActivity = activity.activity;

  return (
    <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
      <div className="flex gap-3">
        {coreActivity.imageUrl && (
          <div className="w-16 h-16 rounded-lg overflow-hidden flex-shrink-0">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coreActivity.imageUrl}
              alt={coreActivity.name}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h4 className="font-medium text-gray-900 dark:text-white truncate">
            {coreActivity.name}
          </h4>
          <div className="flex items-center gap-2 mt-1">
            <div
              className={cn(
                "px-2 py-0.5 rounded-full text-xs font-medium",
                getScoreBgColor(score),
                getScoreColor(score)
              )}
            >
              {score}% match
            </div>
            {coreActivity.recommendedDuration && (
              <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {Math.round(coreActivity.recommendedDuration / 60)}h
              </span>
            )}
          </div>
        </div>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="pt-3 mt-3 border-t border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                {coreActivity.description}
              </p>
              {activity.scoreBreakdown && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <ScoreBreakdownItem
                    label="Interest"
                    value={activity.scoreBreakdown.interestMatch}
                    max={25}
                  />
                  <ScoreBreakdownItem
                    label="Time Fit"
                    value={activity.scoreBreakdown.timeOfDayFit}
                    max={20}
                  />
                  <ScoreBreakdownItem
                    label="Duration"
                    value={activity.scoreBreakdown.durationFit}
                    max={15}
                  />
                  <ScoreBreakdownItem
                    label="Budget"
                    value={activity.scoreBreakdown.budgetMatch}
                    max={15}
                  />
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// SWAP OPTION CARD
// ============================================

interface SwapOptionCardProps {
  option: SwapOption;
  isSelected: boolean;
  onSelect: () => void;
}

function SwapOptionCard({ option, isSelected, onSelect }: SwapOptionCardProps) {
  const { activity: scoredActivity, reason, scoreImprovement } = option;
  const coreActivity = scoredActivity.activity;
  const score = scoredActivity.totalScore || 0;

  return (
    <motion.button
      onClick={onSelect}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
      className={cn(
        "w-full text-left p-3 rounded-xl border transition-all",
        isSelected
          ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20 ring-2 ring-purple-500/20"
          : "border-gray-200 dark:border-gray-700 hover:border-gray-300 dark:hover:border-gray-600"
      )}
    >
      <div className="flex gap-3">
        {coreActivity.imageUrl && (
          <div className="w-20 h-20 rounded-lg overflow-hidden flex-shrink-0 relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={coreActivity.imageUrl}
              alt={coreActivity.name}
              className="w-full h-full object-cover"
            />
            {isSelected && (
              <div className="absolute inset-0 bg-purple-500/20 flex items-center justify-center">
                <Check className="h-6 w-6 text-white drop-shadow" />
              </div>
            )}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <h4 className="font-medium text-gray-900 dark:text-white line-clamp-1">
              {coreActivity.name}
            </h4>
            {scoreImprovement > 0 && (
              <div className="flex items-center gap-1 text-green-600 dark:text-green-400 text-xs font-medium flex-shrink-0">
                <TrendingUp className="h-3 w-3" />+{scoreImprovement}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 mt-1">
            <div
              className={cn(
                "px-2 py-0.5 rounded-full text-xs font-medium",
                getScoreBgColor(score),
                getScoreColor(score)
              )}
            >
              {score}%
            </div>
            {coreActivity.rating && (
              <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-0.5">
                <Star className="h-3 w-3 fill-yellow-500 text-yellow-500" />
                {coreActivity.rating.toFixed(1)}
              </span>
            )}
            {coreActivity.estimatedCost?.amount !== undefined && (
              <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-0.5">
                <DollarSign className="h-3 w-3" />
                {coreActivity.estimatedCost.amount}
              </span>
            )}
          </div>

          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
            {reason || coreActivity.description}
          </p>

          {coreActivity.address?.formatted && (
            <div className="flex items-center gap-1 mt-1.5 text-xs text-gray-400">
              <MapPin className="h-3 w-3" />
              <span className="truncate">{coreActivity.address.formatted}</span>
            </div>
          )}
        </div>
      </div>
    </motion.button>
  );
}

// ============================================
// SCORE BREAKDOWN ITEM
// ============================================

interface ScoreBreakdownItemProps {
  label: string;
  value: number;
  max: number;
}

function ScoreBreakdownItem({ label, value, max }: ScoreBreakdownItemProps) {
  const percentage = (value / max) * 100;

  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-1">
        <span className="text-gray-500 dark:text-gray-400">{label}</span>
        <span className="font-medium text-gray-700 dark:text-gray-300">
          {value}/{max}
        </span>
      </div>
      <div className="h-1.5 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <div
          className={cn(
            "h-full rounded-full bg-gradient-to-r",
            getScoreGradient(percentage)
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}

// Re-export types for convenience
export type { SwapOptionsModalProps };
