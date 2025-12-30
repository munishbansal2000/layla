"use client";

import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Ticket,
  Clock,
  Star,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  Sparkles,
  Users,
  Zap,
  Shield,
  Tag,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  ViatorEnhancement,
  ViatorEnhancementType,
} from "@/types/structured-itinerary";

// ============================================
// ENHANCEMENT TYPE STYLING
// ============================================

const enhancementTypeConfig: Record<
  ViatorEnhancementType,
  { label: string; icon: React.ReactNode; color: string; bgColor: string }
> = {
  "skip-the-line": {
    label: "Skip the Line",
    icon: <Zap className="w-3 h-3" />,
    color: "text-amber-600 dark:text-amber-400",
    bgColor: "bg-amber-100 dark:bg-amber-900/30",
  },
  "guided-tour": {
    label: "Guided Tour",
    icon: <Users className="w-3 h-3" />,
    color: "text-blue-600 dark:text-blue-400",
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
  },
  "audio-guide": {
    label: "Audio Guide",
    icon: <Sparkles className="w-3 h-3" />,
    color: "text-purple-600 dark:text-purple-400",
    bgColor: "bg-purple-100 dark:bg-purple-900/30",
  },
  "private-tour": {
    label: "Private Tour",
    icon: <Shield className="w-3 h-3" />,
    color: "text-indigo-600 dark:text-indigo-400",
    bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
  },
  "food-tour": {
    label: "Food Tour",
    icon: <Sparkles className="w-3 h-3" />,
    color: "text-orange-600 dark:text-orange-400",
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
  },
  "day-trip": {
    label: "Day Trip",
    icon: <Clock className="w-3 h-3" />,
    color: "text-teal-600 dark:text-teal-400",
    bgColor: "bg-teal-100 dark:bg-teal-900/30",
  },
  experience: {
    label: "Experience",
    icon: <Sparkles className="w-3 h-3" />,
    color: "text-pink-600 dark:text-pink-400",
    bgColor: "bg-pink-100 dark:bg-pink-900/30",
  },
  "combo-ticket": {
    label: "Combo Ticket",
    icon: <Tag className="w-3 h-3" />,
    color: "text-green-600 dark:text-green-400",
    bgColor: "bg-green-100 dark:bg-green-900/30",
  },
  "night-tour": {
    label: "Night Tour",
    icon: <Sparkles className="w-3 h-3" />,
    color: "text-violet-600 dark:text-violet-400",
    bgColor: "bg-violet-100 dark:bg-violet-900/30",
  },
  workshop: {
    label: "Workshop",
    icon: <Users className="w-3 h-3" />,
    color: "text-rose-600 dark:text-rose-400",
    bgColor: "bg-rose-100 dark:bg-rose-900/30",
  },
};

// ============================================
// UTILITY FUNCTIONS
// ============================================

function formatPrice(price: { amount: number; currency: string }): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: price.currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price.amount);
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} min`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (mins === 0) {
    return `${hours}h`;
  }
  return `${hours}h ${mins}m`;
}

// ============================================
// SINGLE ENHANCEMENT CARD
// ============================================

interface ViatorEnhancementCardProps {
  enhancement: ViatorEnhancement;
  compact?: boolean;
  onBook?: (enhancement: ViatorEnhancement) => void;
}

export function ViatorEnhancementCard({
  enhancement,
  compact = false,
  onBook,
}: ViatorEnhancementCardProps) {
  const typeConfig =
    enhancementTypeConfig[enhancement.enhancementType] ||
    enhancementTypeConfig.experience;

  const handleBook = () => {
    if (onBook) {
      onBook(enhancement);
    } else {
      window.open(enhancement.bookingUrl, "_blank", "noopener,noreferrer");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={cn(
        "group relative rounded-lg border border-gray-200 dark:border-gray-700",
        "bg-white dark:bg-gray-800/50",
        "hover:border-[#FF5533]/50 hover:shadow-md",
        "transition-all duration-200",
        compact ? "p-2" : "p-3"
      )}
    >
      <div className="flex gap-3">
        {/* Image */}
        {!compact && enhancement.imageUrl && (
          <div className="w-20 h-20 flex-shrink-0 rounded-md overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={enhancement.imageUrl}
              alt={enhancement.title}
              className="w-full h-full object-cover"
            />
          </div>
        )}

        {/* Content */}
        <div className="flex-1 min-w-0">
          {/* Header Row */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              {/* Type Badge */}
              <div className="flex items-center gap-1.5 mb-1">
                <span
                  className={cn(
                    "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium",
                    typeConfig.bgColor,
                    typeConfig.color
                  )}
                >
                  {typeConfig.icon}
                  {typeConfig.label}
                </span>

                {/* Flags */}
                {enhancement.flags.skipTheLine && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                    <Zap className="w-2.5 h-2.5" />
                    Fast
                  </span>
                )}
                {enhancement.flags.likelyToSellOut && (
                  <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">
                    <AlertCircle className="w-2.5 h-2.5" />
                    Popular
                  </span>
                )}
              </div>

              {/* Title */}
              <h4
                className={cn(
                  "font-medium text-gray-900 dark:text-gray-100",
                  compact ? "text-sm line-clamp-1" : "text-sm line-clamp-2"
                )}
              >
                {enhancement.title}
              </h4>

              {/* Meta Info */}
              <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-gray-500 dark:text-gray-400">
                <span className="flex items-center gap-0.5">
                  <Clock className="w-3 h-3" />
                  {formatDuration(enhancement.duration)}
                </span>

                {enhancement.rating && (
                  <span className="flex items-center gap-0.5">
                    <Star className="w-3 h-3 fill-yellow-400 text-yellow-400" />
                    {enhancement.rating.toFixed(1)}
                    {enhancement.reviewCount && (
                      <span className="text-gray-400">
                        ({enhancement.reviewCount.toLocaleString()})
                      </span>
                    )}
                  </span>
                )}

                {enhancement.flags.freeCancellation && (
                  <span className="text-green-600 dark:text-green-400">
                    Free cancellation
                  </span>
                )}
              </div>

              {/* Match Reason */}
              {!compact && enhancement.matchReason && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-1">
                  {enhancement.matchReason}
                </p>
              )}
            </div>

            {/* Price & Book Button */}
            <div className="flex flex-col items-end gap-1">
              <div className="text-right">
                {enhancement.price.originalAmount &&
                  enhancement.price.originalAmount >
                    enhancement.price.amount && (
                    <span className="text-xs text-gray-400 line-through mr-1">
                      {formatPrice({
                        amount: enhancement.price.originalAmount,
                        currency: enhancement.price.currency,
                      })}
                    </span>
                  )}
                <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                  {formatPrice(enhancement.price)}
                </span>
              </div>

              <button
                onClick={handleBook}
                className={cn(
                  "inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium",
                  "bg-[#FF5533] hover:bg-[#E64A2E] text-white",
                  "transition-colors duration-150"
                )}
              >
                <Ticket className="w-3 h-3" />
                Book
                <ExternalLink className="w-2.5 h-2.5" />
              </button>
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================
// ENHANCEMENT LIST (Collapsible)
// ============================================

interface ViatorEnhancementListProps {
  enhancements: ViatorEnhancement[];
  activityName: string;
  defaultExpanded?: boolean;
  maxVisible?: number;
  onBook?: (enhancement: ViatorEnhancement) => void;
}

export function ViatorEnhancementList({
  enhancements,
  activityName,
  defaultExpanded = false,
  maxVisible = 2,
  onBook,
}: ViatorEnhancementListProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);

  if (!enhancements || enhancements.length === 0) {
    return null;
  }

  const visibleEnhancements = isExpanded
    ? enhancements
    : enhancements.slice(0, maxVisible);
  const hasMore = enhancements.length > maxVisible;

  return (
    <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-1.5">
          <div className="flex items-center justify-center w-5 h-5 rounded bg-[#FF5533]/10">
            <Ticket className="w-3 h-3 text-[#FF5533]" />
          </div>
          <span className="text-xs font-medium text-gray-600 dark:text-gray-400">
            Enhance your visit
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            ({enhancements.length}{" "}
            {enhancements.length === 1 ? "tour" : "tours"})
          </span>
        </div>

        {hasMore && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="flex items-center gap-0.5 text-xs text-[#FF5533] hover:text-[#E64A2E] font-medium transition-colors"
          >
            {isExpanded ? (
              <>
                Show less
                <ChevronUp className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                Show all
                <ChevronDown className="w-3.5 h-3.5" />
              </>
            )}
          </button>
        )}
      </div>

      {/* Enhancement Cards */}
      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {visibleEnhancements.map((enhancement, index) => (
            <ViatorEnhancementCard
              key={enhancement.productCode}
              enhancement={enhancement}
              compact={index > 0}
              onBook={onBook}
            />
          ))}
        </AnimatePresence>
      </div>

      {/* Viator Attribution */}
      <div className="flex items-center justify-center gap-1 mt-2 pt-2">
        <span className="text-[10px] text-gray-400 dark:text-gray-500">
          Powered by
        </span>
        <span className="text-[10px] font-semibold text-[#FF5533]">Viator</span>
      </div>
    </div>
  );
}

// ============================================
// COMPACT ENHANCEMENT BADGE (for card headers)
// ============================================

interface ViatorEnhancementBadgeProps {
  count: number;
  onClick?: () => void;
}

export function ViatorEnhancementBadge({
  count,
  onClick,
}: ViatorEnhancementBadgeProps) {
  if (count === 0) return null;

  return (
    <button
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-xs font-medium",
        "bg-[#FF5533]/10 text-[#FF5533] hover:bg-[#FF5533]/20",
        "transition-colors duration-150"
      )}
    >
      <Ticket className="w-3 h-3" />
      {count} {count === 1 ? "tour" : "tours"}
    </button>
  );
}

// ============================================
// INLINE ENHANCEMENT PREVIEW (for slot cards)
// ============================================

interface ViatorEnhancementPreviewProps {
  enhancements: ViatorEnhancement[];
  onViewAll?: () => void;
}

export function ViatorEnhancementPreview({
  enhancements,
  onViewAll,
}: ViatorEnhancementPreviewProps) {
  if (!enhancements || enhancements.length === 0) {
    return null;
  }

  const firstEnhancement = enhancements[0];
  const typeConfig =
    enhancementTypeConfig[firstEnhancement.enhancementType] ||
    enhancementTypeConfig.experience;

  return (
    <div
      className={cn(
        "flex items-center gap-2 px-2 py-1.5 rounded-md",
        "bg-gradient-to-r from-[#FF5533]/5 to-transparent",
        "border border-[#FF5533]/20",
        "cursor-pointer hover:border-[#FF5533]/40 transition-colors"
      )}
      onClick={onViewAll}
    >
      <div className="flex items-center justify-center w-6 h-6 rounded bg-[#FF5533]/10">
        <Ticket className="w-3.5 h-3.5 text-[#FF5533]" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span
            className={cn(
              "inline-flex items-center gap-0.5 text-[10px] font-medium",
              typeConfig.color
            )}
          >
            {typeConfig.icon}
            {typeConfig.label}
          </span>
          {enhancements.length > 1 && (
            <span className="text-[10px] text-gray-400">
              +{enhancements.length - 1} more
            </span>
          )}
        </div>
        <p className="text-xs text-gray-600 dark:text-gray-400 truncate">
          From {formatPrice(firstEnhancement.price)}
        </p>
      </div>

      <ChevronDown className="w-4 h-4 text-gray-400" />
    </div>
  );
}

export default ViatorEnhancementCard;
