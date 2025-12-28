"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star,
  Clock,
  DollarSign,
  MapPin,
  Sparkles,
  ChevronDown,
  ChevronUp,
  Lock,
  Unlock,
  RefreshCw,
  Heart,
  ExternalLink,
  Users,
  Ticket,
  Utensils,
  Sun,
  Cloud,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import {
  getScoreColor,
  getScoreLabel,
  getScoreBgColor,
  getScoreGradient,
} from "@/hooks/useActivitySelection";
import type { ScoredActivity } from "@/types/activity-suggestion";

// ============================================
// TYPES
// ============================================

interface ActivityScoreCardProps {
  activity: ScoredActivity;
  variant?: "default" | "compact" | "detailed";
  isLocked?: boolean;
  showSwapButton?: boolean;
  showLockButton?: boolean;
  showBookButton?: boolean;
  onSwap?: () => void;
  onLock?: (locked: boolean) => void;
  onBook?: () => void;
  onClick?: () => void;
  className?: string;
}

// ============================================
// MAIN COMPONENT
// ============================================

export function ActivityScoreCard({
  activity,
  variant = "default",
  isLocked = false,
  showSwapButton = false,
  showLockButton = false,
  showBookButton = false,
  onSwap,
  onLock,
  onBook,
  onClick,
  className,
}: ActivityScoreCardProps) {
  const [showDetails, setShowDetails] = useState(false);
  const score = activity.totalScore || 0;
  const coreActivity = activity.activity;

  if (variant === "compact") {
    return (
      <CompactCard
        activity={activity}
        isLocked={isLocked}
        onClick={onClick}
        className={className}
      />
    );
  }

  if (variant === "detailed") {
    return (
      <DetailedCard
        activity={activity}
        isLocked={isLocked}
        showSwapButton={showSwapButton}
        showLockButton={showLockButton}
        showBookButton={showBookButton}
        onSwap={onSwap}
        onLock={onLock}
        onBook={onBook}
        onClick={onClick}
        className={className}
      />
    );
  }

  return (
    <motion.div
      onClick={onClick}
      whileHover={onClick ? { scale: 1.01 } : {}}
      className={cn(
        "bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden",
        onClick && "cursor-pointer",
        isLocked && "ring-2 ring-purple-500/50",
        className
      )}
    >
      {/* Header with Image */}
      <div className="relative h-40">
        {coreActivity.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coreActivity.imageUrl}
            alt={coreActivity.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 flex items-center justify-center">
            <Sparkles className="h-12 w-12 text-purple-400" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

        {/* Score Badge */}
        <div className="absolute top-3 right-3">
          <ScoreBadge score={score} />
        </div>

        {/* Locked Badge */}
        {isLocked && (
          <div className="absolute top-3 left-3 px-2 py-1 bg-purple-500 text-white rounded-full text-xs font-medium flex items-center gap-1">
            <Lock className="h-3 w-3" />
            Locked
          </div>
        )}

        {/* Category Tags */}
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-1">
          {coreActivity.tags?.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 bg-white/80 dark:bg-gray-800/80 text-gray-700 dark:text-gray-300 text-xs rounded-full"
            >
              {tag}
            </span>
          ))}
          {coreActivity.requiresBooking && (
            <span className="px-2 py-0.5 bg-green-500 text-white text-xs rounded-full flex items-center gap-1">
              <Ticket className="h-3 w-3" />
              Bookable
            </span>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="p-4">
        <h3 className="font-semibold text-gray-900 dark:text-white line-clamp-1">
          {coreActivity.name}
        </h3>

        {/* Quick Stats */}
        <div className="flex items-center gap-3 mt-2 text-sm">
          {coreActivity.rating && (
            <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
              <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
              <span>{coreActivity.rating.toFixed(1)}</span>
              {coreActivity.reviewCount && (
                <span className="text-gray-400">
                  ({coreActivity.reviewCount})
                </span>
              )}
            </div>
          )}
          {coreActivity.recommendedDuration && (
            <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
              <Clock className="h-4 w-4" />
              <span>{formatDuration(coreActivity.recommendedDuration)}</span>
            </div>
          )}
          {coreActivity.estimatedCost?.amount !== undefined && (
            <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
              <DollarSign className="h-4 w-4" />
              <span>
                {coreActivity.isFree
                  ? "Free"
                  : `${coreActivity.estimatedCost.amount}`}
              </span>
            </div>
          )}
        </div>

        {/* Description */}
        <p className="mt-2 text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
          {coreActivity.description}
        </p>

        {/* Score Explanation */}
        {activity.explanation && (
          <div className="mt-3 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
            <p className="text-xs text-gray-600 dark:text-gray-400">
              <Sparkles className="h-3 w-3 inline mr-1 text-purple-500" />
              {activity.explanation}
            </p>
          </div>
        )}

        {/* Expandable Details */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setShowDetails(!showDetails);
          }}
          className="mt-3 flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400 hover:text-purple-700 dark:hover:text-purple-300"
        >
          {showDetails ? (
            <>
              <ChevronUp className="h-3 w-3" />
              Hide score breakdown
            </>
          ) : (
            <>
              <ChevronDown className="h-3 w-3" />
              Show score breakdown
            </>
          )}
        </button>

        <AnimatePresence>
          {showDetails && activity.scoreBreakdown && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <ScoreBreakdown breakdown={activity.scoreBreakdown} />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Action Buttons */}
        {(showSwapButton || showLockButton || showBookButton) && (
          <div className="mt-4 flex items-center gap-2">
            {showSwapButton && (
              <Button
                variant="ghost"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onSwap?.();
                }}
                leftIcon={<RefreshCw className="h-4 w-4" />}
              >
                Swap
              </Button>
            )}
            {showLockButton && (
              <Button
                variant={isLocked ? "primary" : "ghost"}
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onLock?.(!isLocked);
                }}
                leftIcon={
                  isLocked ? (
                    <Lock className="h-4 w-4" />
                  ) : (
                    <Unlock className="h-4 w-4" />
                  )
                }
              >
                {isLocked ? "Locked" : "Lock"}
              </Button>
            )}
            {showBookButton && coreActivity.requiresBooking && (
              <Button
                variant="primary"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onBook?.();
                }}
                leftIcon={<Ticket className="h-4 w-4" />}
              >
                Book
              </Button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ============================================
// COMPACT CARD
// ============================================

interface CompactCardProps {
  activity: ScoredActivity;
  isLocked?: boolean;
  onClick?: () => void;
  className?: string;
}

function CompactCard({
  activity,
  isLocked,
  onClick,
  className,
}: CompactCardProps) {
  const score = activity.totalScore || 0;
  const coreActivity = activity.activity;

  return (
    <motion.div
      onClick={onClick}
      whileHover={onClick ? { scale: 1.02 } : {}}
      whileTap={onClick ? { scale: 0.98 } : {}}
      className={cn(
        "flex items-center gap-3 p-3 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700",
        onClick && "cursor-pointer",
        isLocked && "ring-2 ring-purple-500/50",
        className
      )}
    >
      {/* Thumbnail */}
      <div className="w-14 h-14 rounded-lg overflow-hidden flex-shrink-0">
        {coreActivity.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coreActivity.imageUrl}
            alt={coreActivity.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 flex items-center justify-center">
            <Sparkles className="h-6 w-6 text-purple-400" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <h4 className="font-medium text-gray-900 dark:text-white truncate">
            {coreActivity.name}
          </h4>
          {isLocked && (
            <Lock className="h-3 w-3 text-purple-500 flex-shrink-0" />
          )}
        </div>
        <div className="flex items-center gap-2 mt-1">
          <div
            className={cn(
              "px-1.5 py-0.5 rounded text-xs font-medium",
              getScoreBgColor(score),
              getScoreColor(score)
            )}
          >
            {score}%
          </div>
          {coreActivity.recommendedDuration && (
            <span className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-0.5">
              <Clock className="h-3 w-3" />
              {formatDuration(coreActivity.recommendedDuration)}
            </span>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================
// DETAILED CARD
// ============================================

interface DetailedCardProps {
  activity: ScoredActivity;
  isLocked?: boolean;
  showSwapButton?: boolean;
  showLockButton?: boolean;
  showBookButton?: boolean;
  onSwap?: () => void;
  onLock?: (locked: boolean) => void;
  onBook?: () => void;
  onClick?: () => void;
  className?: string;
}

function DetailedCard({
  activity,
  isLocked,
  showSwapButton,
  showLockButton,
  showBookButton,
  onSwap,
  onLock,
  onBook,
  onClick,
  className,
}: DetailedCardProps) {
  const score = activity.totalScore || 0;
  const coreActivity = activity.activity;

  return (
    <motion.div
      onClick={onClick}
      className={cn(
        "bg-white dark:bg-gray-800 rounded-2xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-lg",
        onClick && "cursor-pointer",
        isLocked && "ring-2 ring-purple-500/50",
        className
      )}
    >
      {/* Hero Image */}
      <div className="relative h-56">
        {coreActivity.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={coreActivity.imageUrl}
            alt={coreActivity.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-purple-100 to-pink-100 dark:from-purple-900/30 dark:to-pink-900/30 flex items-center justify-center">
            <Sparkles className="h-16 w-16 text-purple-400" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />

        {/* Top badges */}
        <div className="absolute top-4 left-4 right-4 flex items-start justify-between">
          <div className="flex flex-wrap gap-2">
            {isLocked && (
              <span className="px-2 py-1 bg-purple-500 text-white rounded-full text-xs font-medium flex items-center gap-1">
                <Lock className="h-3 w-3" />
                Locked
              </span>
            )}
            {coreActivity.requiresBooking && (
              <span className="px-2 py-1 bg-green-500 text-white rounded-full text-xs font-medium flex items-center gap-1">
                <Ticket className="h-3 w-3" />
                Bookable
              </span>
            )}
          </div>
          <ScoreBadge score={score} size="lg" />
        </div>

        {/* Bottom info */}
        <div className="absolute bottom-4 left-4 right-4">
          <h2 className="text-xl font-bold text-white mb-2">
            {coreActivity.name}
          </h2>
          <div className="flex items-center flex-wrap gap-3 text-sm text-white/80">
            {coreActivity.rating && (
              <div className="flex items-center gap-1">
                <Star className="h-4 w-4 fill-yellow-500 text-yellow-500" />
                <span className="font-medium text-white">
                  {coreActivity.rating.toFixed(1)}
                </span>
                {coreActivity.reviewCount && (
                  <span>({coreActivity.reviewCount} reviews)</span>
                )}
              </div>
            )}
            {coreActivity.recommendedDuration && (
              <div className="flex items-center gap-1">
                <Clock className="h-4 w-4" />
                <span>{formatDuration(coreActivity.recommendedDuration)}</span>
              </div>
            )}
            {coreActivity.estimatedCost?.amount !== undefined && (
              <div className="flex items-center gap-1">
                <DollarSign className="h-4 w-4" />
                <span>
                  {coreActivity.isFree
                    ? "Free"
                    : `${coreActivity.estimatedCost.amount} ${
                        coreActivity.estimatedCost.currency || "USD"
                      }`}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="p-5">
        {/* Description */}
        <p className="text-gray-600 dark:text-gray-400 leading-relaxed">
          {coreActivity.description}
        </p>

        {/* Location */}
        {coreActivity.address?.formatted && (
          <div className="mt-4 flex items-start gap-2 text-sm text-gray-500 dark:text-gray-400">
            <MapPin className="h-4 w-4 flex-shrink-0 mt-0.5" />
            <span>{coreActivity.address.formatted}</span>
          </div>
        )}

        {/* Tags */}
        {coreActivity.tags && coreActivity.tags.length > 0 && (
          <div className="mt-4 flex flex-wrap gap-2">
            {coreActivity.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Score Breakdown */}
        {activity.scoreBreakdown && (
          <div className="mt-5 p-4 bg-gray-50 dark:bg-gray-700/50 rounded-xl">
            <div className="flex items-center justify-between mb-3">
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                Score Breakdown
              </span>
              <span className={cn("text-sm font-medium", getScoreColor(score))}>
                {getScoreLabel(score)}
              </span>
            </div>
            <ScoreBreakdown breakdown={activity.scoreBreakdown} />
            {activity.explanation && (
              <p className="mt-3 text-xs text-gray-600 dark:text-gray-400 italic">
                &ldquo;{activity.explanation}&rdquo;
              </p>
            )}
          </div>
        )}

        {/* Action Buttons */}
        {(showSwapButton || showLockButton || showBookButton) && (
          <div className="mt-5 flex items-center gap-3">
            {showBookButton && coreActivity.requiresBooking && (
              <Button
                variant="primary"
                size="md"
                className="flex-1"
                onClick={(e) => {
                  e.stopPropagation();
                  onBook?.();
                }}
                leftIcon={<Ticket className="h-4 w-4" />}
              >
                Book Now
              </Button>
            )}
            {showSwapButton && (
              <Button
                variant="outline"
                size="md"
                onClick={(e) => {
                  e.stopPropagation();
                  onSwap?.();
                }}
                leftIcon={<RefreshCw className="h-4 w-4" />}
              >
                Swap
              </Button>
            )}
            {showLockButton && (
              <Button
                variant={isLocked ? "primary" : "outline"}
                size="md"
                onClick={(e) => {
                  e.stopPropagation();
                  onLock?.(!isLocked);
                }}
                leftIcon={
                  isLocked ? (
                    <Lock className="h-4 w-4" />
                  ) : (
                    <Unlock className="h-4 w-4" />
                  )
                }
              >
                {isLocked ? "Unlock" : "Lock"}
              </Button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

// ============================================
// SCORE BADGE
// ============================================

interface ScoreBadgeProps {
  score: number;
  size?: "sm" | "md" | "lg";
}

function ScoreBadge({ score, size = "md" }: ScoreBadgeProps) {
  const sizeClasses = {
    sm: "h-8 w-8 text-xs",
    md: "h-10 w-10 text-sm",
    lg: "h-12 w-12 text-base",
  };

  return (
    <div
      className={cn(
        "rounded-full flex items-center justify-center font-bold text-white shadow-lg",
        "bg-gradient-to-br",
        getScoreGradient(score),
        sizeClasses[size]
      )}
    >
      {score}
    </div>
  );
}

// ============================================
// SCORE BREAKDOWN
// ============================================

interface ScoreBreakdownProps {
  breakdown: {
    interestMatch: number;
    timeOfDayFit: number;
    durationFit: number;
    budgetMatch: number;
    weather?: number;
    variety?: number;
    rating?: number;
  };
}

function ScoreBreakdown({ breakdown }: ScoreBreakdownProps) {
  const items = [
    {
      label: "Interest Match",
      value: breakdown.interestMatch,
      max: 25,
      icon: Heart,
    },
    { label: "Time Fit", value: breakdown.timeOfDayFit, max: 20, icon: Clock },
    {
      label: "Duration Fit",
      value: breakdown.durationFit,
      max: 15,
      icon: Clock,
    },
    {
      label: "Budget Match",
      value: breakdown.budgetMatch,
      max: 15,
      icon: DollarSign,
    },
    ...(breakdown.weather !== undefined
      ? [{ label: "Weather", value: breakdown.weather, max: 10, icon: Sun }]
      : []),
    ...(breakdown.variety !== undefined
      ? [
          {
            label: "Variety",
            value: breakdown.variety,
            max: 10,
            icon: Sparkles,
          },
        ]
      : []),
    ...(breakdown.rating !== undefined
      ? [{ label: "Rating", value: breakdown.rating, max: 5, icon: Star }]
      : []),
  ];

  return (
    <div className="mt-3 space-y-2">
      {items.map(({ label, value, max, icon: Icon }) => (
        <div key={label} className="flex items-center gap-2">
          <Icon className="h-3 w-3 text-gray-400 flex-shrink-0" />
          <div className="flex-1">
            <div className="flex items-center justify-between text-xs mb-0.5">
              <span className="text-gray-600 dark:text-gray-400">{label}</span>
              <span className="font-medium text-gray-700 dark:text-gray-300">
                {value}/{max}
              </span>
            </div>
            <div className="h-1.5 bg-gray-200 dark:bg-gray-600 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${(value / max) * 100}%` }}
                transition={{ duration: 0.5, delay: 0.1 }}
                className={cn(
                  "h-full rounded-full bg-gradient-to-r",
                  getScoreGradient((value / max) * 100)
                )}
              />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================
// HELPERS
// ============================================

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

// ============================================
// EXPORTS
// ============================================

export { ScoreBadge, ScoreBreakdown, CompactCard, DetailedCard };
export type { ActivityScoreCardProps };
