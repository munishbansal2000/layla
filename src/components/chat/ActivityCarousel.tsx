"use client";

import { motion } from "framer-motion";
import {
  Clock,
  Star,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useState, useRef } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { BookableActivity } from "@/types";

interface ActivityCarouselProps {
  activities: BookableActivity[];
  destination?: string;
  onAddToItinerary?: (activity: BookableActivity) => void;
}

export function ActivityCarousel({
  activities,
  destination,
  onAddToItinerary,
}: ActivityCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(true);

  const checkScrollability = () => {
    if (scrollRef.current) {
      const { scrollLeft, scrollWidth, clientWidth } = scrollRef.current;
      setCanScrollLeft(scrollLeft > 0);
      setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
    }
  };

  const scroll = (direction: "left" | "right") => {
    if (scrollRef.current) {
      const scrollAmount = 320;
      scrollRef.current.scrollBy({
        left: direction === "left" ? -scrollAmount : scrollAmount,
        behavior: "smooth",
      });
      setTimeout(checkScrollability, 300);
    }
  };

  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h`;
    return `${mins}m`;
  };

  const formatPrice = (price: { amount: number; currency: string }): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: price.currency,
      minimumFractionDigits: 0,
    }).format(price.amount);
  };

  if (activities.length === 0) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full mt-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Badge className="bg-[#FF5533]/10 text-[#FF5533] border-[#FF5533]/20">
            Powered by Viator
          </Badge>
          {destination && (
            <span className="text-sm text-gray-500">
              {activities.length} activities in {destination}
            </span>
          )}
        </div>

        {/* Navigation Arrows */}
        {activities.length > 2 && (
          <div className="flex gap-1">
            <button
              onClick={() => scroll("left")}
              disabled={!canScrollLeft}
              className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={() => scroll("right")}
              disabled={!canScrollRight}
              className="p-1.5 rounded-full bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 disabled:opacity-30 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        )}
      </div>

      {/* Scrollable Cards */}
      <div
        ref={scrollRef}
        onScroll={checkScrollability}
        className="flex gap-4 overflow-x-auto pb-2 scrollbar-hide scroll-smooth"
        style={{ scrollbarWidth: "none", msOverflowStyle: "none" }}
      >
        {activities.map((activity, index) => (
          <motion.div
            key={activity.id}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.1 }}
            className="flex-shrink-0 w-[300px]"
          >
            <Card className="overflow-hidden h-full hover:shadow-lg transition-shadow">
              {/* Image */}
              <div className="relative h-36">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={activity.imageUrl}
                  alt={activity.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "/images/placeholder-activity.jpg";
                  }}
                />
                {activity.price && (
                  <div className="absolute top-2 right-2">
                    <Badge className="bg-white/95 text-gray-900 font-semibold text-xs">
                      From {formatPrice(activity.price)}
                    </Badge>
                  </div>
                )}
              </div>

              {/* Content */}
              <div className="p-3">
                <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100 line-clamp-2 mb-2">
                  {activity.name}
                </h4>

                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-3">
                  {activity.rating && (
                    <span className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                      {activity.rating.toFixed(1)}
                      {activity.reviewCount && (
                        <span className="text-gray-400">
                          ({activity.reviewCount.toLocaleString()})
                        </span>
                      )}
                    </span>
                  )}
                  {activity.duration && (
                    <span className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      {formatDuration(activity.duration)}
                    </span>
                  )}
                </div>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  {onAddToItinerary && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs h-8"
                      onClick={() => onAddToItinerary(activity)}
                    >
                      Add to Trip
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="flex-1 bg-[#FF5533] hover:bg-[#E64A2E] text-white text-xs h-8"
                    onClick={() => window.open(activity.bookingUrl, "_blank")}
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    Book
                  </Button>
                </div>
              </div>
            </Card>
          </motion.div>
        ))}
      </div>
    </motion.div>
  );
}

// Compact version for inline chat display
interface ActivityChipProps {
  activity: BookableActivity;
  onClick?: () => void;
}

export function ActivityChip({ activity, onClick }: ActivityChipProps) {
  return (
    <button
      onClick={onClick || (() => window.open(activity.bookingUrl, "_blank"))}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 text-sm hover:bg-purple-100 dark:hover:bg-purple-900/30 transition-colors"
    >
      <span className="font-medium truncate max-w-[200px]">
        {activity.name}
      </span>
      {activity.price && (
        <Badge
          size="sm"
          className="bg-purple-200 dark:bg-purple-800 text-purple-800 dark:text-purple-200"
        >
          ${activity.price.amount}
        </Badge>
      )}
      <ExternalLink className="w-3 h-3 flex-shrink-0" />
    </button>
  );
}
