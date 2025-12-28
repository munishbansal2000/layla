"use client";

import { motion } from "framer-motion";
import { Clock, Star, ExternalLink, MapPin, Calendar } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";

interface TimeSlot {
  startTime: string;
  endTime: string;
  label: string;
}

interface BookableActivity {
  id: string;
  name: string;
  description: string;
  type: "activity";
  imageUrl: string;
  rating?: number;
  reviewCount?: number;
  priceLevel: 1 | 2 | 3 | 4;
  duration?: number;
  bookingUrl: string;
  tags: string[];
  viatorProductCode: string;
  price?: {
    amount: number;
    currency: string;
  };
  suggestedTimeSlots?: TimeSlot[];
  bestTimeOfDay?: "morning" | "afternoon" | "evening" | "flexible";
}

interface BookableActivityCardProps {
  activity: BookableActivity;
  onAddToItinerary?: (activity: BookableActivity) => void;
  compact?: boolean;
}

export function BookableActivityCard({
  activity,
  onAddToItinerary,
  compact = false,
}: BookableActivityCardProps) {
  const formatDuration = (minutes: number): string => {
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""}`;
    return `${mins} min`;
  };

  const formatPrice = (price: { amount: number; currency: string }): string => {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: price.currency,
      minimumFractionDigits: 0,
    }).format(price.amount);
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      transition={{ duration: 0.2 }}
    >
      <Card className="group overflow-hidden h-full flex flex-col">
        {/* Image Section */}
        <div className="relative h-48 overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={activity.imageUrl}
            alt={activity.name}
            className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-110"
            onError={(e) => {
              (e.target as HTMLImageElement).src =
                "/images/placeholder-activity.jpg";
            }}
          />

          {/* Price Badge */}
          {activity.price && (
            <div className="absolute top-3 right-3">
              <Badge className="bg-white/90 text-gray-900 font-semibold backdrop-blur-sm">
                From {formatPrice(activity.price)}
              </Badge>
            </div>
          )}

          {/* Viator Badge */}
          <div className="absolute bottom-3 left-3">
            <Badge className="bg-[#FF5533]/90 text-white text-xs">
              Powered by Viator
            </Badge>
          </div>
        </div>

        {/* Content Section */}
        <div className="flex-1 p-4 flex flex-col">
          {/* Title */}
          <h3 className="font-semibold text-gray-900 dark:text-gray-100 line-clamp-2 mb-2">
            {activity.name}
          </h3>

          {/* Rating & Duration */}
          <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400 mb-2">
            {activity.rating && (
              <span className="flex items-center gap-1">
                <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                <span className="font-medium">
                  {activity.rating.toFixed(1)}
                </span>
                {activity.reviewCount && (
                  <span className="text-gray-400">
                    ({activity.reviewCount.toLocaleString()})
                  </span>
                )}
              </span>
            )}
            {activity.duration && (
              <span className="flex items-center gap-1">
                <Clock className="w-4 h-4" />
                {formatDuration(activity.duration)}
              </span>
            )}
          </div>

          {/* Description */}
          {!compact && (
            <p className="text-sm text-gray-500 dark:text-gray-400 line-clamp-2 mb-3">
              {activity.description}
            </p>
          )}

          {/* Tags */}
          {activity.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {activity.tags.slice(0, 3).map((tag) => (
                <Badge
                  key={tag}
                  size="sm"
                  className="bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400"
                >
                  {tag}
                </Badge>
              ))}
            </div>
          )}

          {/* Available Time Slots */}
          {activity.suggestedTimeSlots &&
            activity.suggestedTimeSlots.length > 0 && (
              <div className="mb-3">
                <div className="flex items-center gap-1 text-xs text-gray-500 dark:text-gray-400 mb-1.5">
                  <Calendar className="w-3 h-3" />
                  <span>Available Times</span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {activity.suggestedTimeSlots.slice(0, 4).map((slot, idx) => (
                    <Badge
                      key={idx}
                      size="sm"
                      className="bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800"
                    >
                      {slot.startTime}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

          {/* Spacer to push buttons to bottom */}
          <div className="flex-1" />

          {/* Action Buttons */}
          <div className="flex gap-2 mt-auto pt-3 border-t border-gray-100 dark:border-gray-800">
            {onAddToItinerary && (
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => onAddToItinerary(activity)}
              >
                Add to Trip
              </Button>
            )}
            <Button
              size="sm"
              className={cn(
                "bg-[#FF5533] hover:bg-[#E64A2E] text-white",
                onAddToItinerary ? "" : "flex-1"
              )}
              onClick={() => window.open(activity.bookingUrl, "_blank")}
            >
              <ExternalLink className="w-4 h-4 mr-1" />
              Book Now
            </Button>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}

// Grid component for displaying multiple activities
interface ActivityGridProps {
  activities: BookableActivity[];
  onAddToItinerary?: (activity: BookableActivity) => void;
  loading?: boolean;
  emptyMessage?: string;
}

export function BookableActivityGrid({
  activities,
  onAddToItinerary,
  loading = false,
  emptyMessage = "No activities found",
}: ActivityGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {[...Array(8)].map((_, i) => (
          <Card key={i} className="h-80 animate-pulse">
            <div className="h-48 bg-gray-200 dark:bg-gray-700" />
            <div className="p-4 space-y-3">
              <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
              <div className="h-3 bg-gray-200 dark:bg-gray-700 rounded w-full" />
            </div>
          </Card>
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <div className="text-center py-12">
        <MapPin className="w-12 h-12 mx-auto text-gray-400 mb-4" />
        <p className="text-gray-500 dark:text-gray-400">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
      {activities.map((activity) => (
        <BookableActivityCard
          key={activity.id}
          activity={activity}
          onAddToItinerary={onAddToItinerary}
        />
      ))}
    </div>
  );
}
