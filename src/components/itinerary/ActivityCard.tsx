"use client";

import { motion } from "framer-motion";
import {
  Clock,
  MapPin,
  Star,
  Trash2,
  GripVertical,
  ExternalLink,
  Ticket,
} from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { cn, formatDuration, getPriceLabel } from "@/lib/utils";
import type { ItineraryItem } from "@/types";

// Extended activity type with Viator match
interface EnrichedActivity {
  id: string;
  name: string;
  description: string;
  type: string;
  location: {
    lat: number;
    lng: number;
    address?: string;
    city: string;
    country: string;
  };
  imageUrl?: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: 1 | 2 | 3 | 4;
  duration?: number;
  bookingUrl?: string;
  tags: string[];
  viatorMatch?: {
    productCode: string;
    bookingUrl: string;
    price?: {
      amount: number;
      currency: string;
    };
    rating?: number;
    reviewCount?: number;
    matchConfidence: "high" | "medium" | "low";
  };
}

interface ActivityCardProps {
  item: ItineraryItem & { activity: EnrichedActivity };
  onRemove?: () => void;
  isDragging?: boolean;
  compact?: boolean;
}

export function ActivityCard({
  item,
  onRemove,
  isDragging = false,
  compact = false,
}: ActivityCardProps) {
  const { activity, timeSlot } = item;
  const viatorMatch = activity.viatorMatch;

  const typeColors: Record<string, string> = {
    attraction:
      "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    restaurant:
      "bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400",
    hotel:
      "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400",
    activity:
      "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    culture: "bg-pink-100 text-pink-700 dark:bg-pink-900/30 dark:text-pink-400",
    nature:
      "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    shopping:
      "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    nightlife:
      "bg-violet-100 text-violet-700 dark:bg-violet-900/30 dark:text-violet-400",
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
      layout
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      className={cn(isDragging && "z-50")}
    >
      <Card
        className={cn(
          "group relative overflow-hidden transition-all duration-200",
          isDragging && "shadow-xl ring-2 ring-purple-500",
          viatorMatch && "ring-1 ring-green-200 dark:ring-green-800"
        )}
      >
        <div className="flex">
          <div className="flex items-center px-2 bg-gray-50 dark:bg-gray-800/50 cursor-grab active:cursor-grabbing">
            <GripVertical className="w-4 h-4 text-gray-400" />
          </div>

          {!compact && activity.imageUrl && (
            <div className="w-32 h-32 flex-shrink-0">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={activity.imageUrl}
                alt={activity.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}

          <div className="flex-1 p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <Badge
                    className={cn(
                      "capitalize",
                      typeColors[activity.type] || typeColors.activity
                    )}
                    size="sm"
                  >
                    {activity.type}
                  </Badge>
                  {activity.priceLevel && (
                    <span className="text-xs text-gray-500 dark:text-gray-400">
                      {getPriceLabel(activity.priceLevel)}
                    </span>
                  )}
                  {viatorMatch && (
                    <Badge
                      size="sm"
                      className={cn(
                        "text-xs",
                        viatorMatch.matchConfidence === "high"
                          ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                          : viatorMatch.matchConfidence === "medium"
                          ? "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400"
                          : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                      )}
                    >
                      <Ticket className="w-3 h-3 mr-1" />
                      Bookable
                    </Badge>
                  )}
                </div>

                <h3 className="font-semibold text-gray-900 dark:text-gray-100 truncate">
                  {activity.name}
                </h3>

                {!compact && (
                  <p className="text-sm text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                    {activity.description}
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-3 mt-2 text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    {timeSlot.startTime} - {timeSlot.endTime}
                  </span>
                  {activity.duration && (
                    <span>{formatDuration(activity.duration)}</span>
                  )}
                  {(viatorMatch?.rating || activity.rating) && (
                    <span className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                      {(viatorMatch?.rating || activity.rating)?.toFixed(1)}
                      {viatorMatch?.reviewCount && (
                        <span className="text-gray-400">
                          ({viatorMatch.reviewCount.toLocaleString()})
                        </span>
                      )}
                    </span>
                  )}
                </div>

                {!compact && (
                  <div className="flex items-center gap-1 mt-2 text-xs text-gray-400 dark:text-gray-500">
                    <MapPin className="w-3.5 h-3.5" />
                    <span className="truncate">
                      {activity.location.address || activity.location.city}
                    </span>
                  </div>
                )}

                {/* Viator Booking Section */}
                {viatorMatch && (
                  <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                    {viatorMatch.price && (
                      <span className="text-sm font-semibold text-gray-900 dark:text-gray-100">
                        From {formatPrice(viatorMatch.price)}
                      </span>
                    )}
                    <Button
                      size="sm"
                      className="ml-auto bg-[#FF5533] hover:bg-[#E64A2E] text-white text-xs"
                      onClick={() =>
                        window.open(viatorMatch.bookingUrl, "_blank")
                      }
                    >
                      <Ticket className="w-3.5 h-3.5 mr-1" />
                      Book on Viator
                    </Button>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-1">
                {activity.bookingUrl && !viatorMatch && (
                  <button
                    onClick={() => window.open(activity.bookingUrl, "_blank")}
                    className="p-1.5 text-gray-400 hover:text-purple-600 dark:hover:text-purple-400 transition-colors"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                )}
                {onRemove && (
                  <button
                    onClick={onRemove}
                    className="p-1.5 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors opacity-0 group-hover:opacity-100"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      </Card>
    </motion.div>
  );
}
