"use client";

import { motion } from "framer-motion";
import {
  Star,
  MapPin,
  Phone,
  ExternalLink,
  Utensils,
  Navigation,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import type { Restaurant } from "@/lib/yelp";
import { formatDistance, getPriceDisplay } from "@/lib/yelp";

interface RestaurantCardProps {
  restaurant: Restaurant;
  variant?: "compact" | "full" | "horizontal";
  onSelect?: (restaurant: Restaurant) => void;
  className?: string;
}

export function RestaurantCard({
  restaurant,
  variant = "full",
  onSelect,
  className = "",
}: RestaurantCardProps) {
  const handleOpenYelp = () => {
    window.open(restaurant.url, "_blank", "noopener,noreferrer");
  };

  if (variant === "compact") {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        whileHover={{ scale: 1.02 }}
        onClick={() => onSelect?.(restaurant)}
        className={`bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-3 cursor-pointer hover:shadow-md transition-all ${className}`}
      >
        <div className="flex items-center gap-3">
          {restaurant.imageUrl && (
            <img
              src={restaurant.imageUrl}
              alt={restaurant.name}
              className="w-12 h-12 rounded-lg object-cover"
            />
          )}
          <div className="flex-1 min-w-0">
            <h4 className="font-medium text-gray-900 dark:text-gray-100 truncate">
              {restaurant.name}
            </h4>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span className="flex items-center">
                <Star className="w-3 h-3 text-yellow-500 mr-0.5 fill-current" />
                {restaurant.rating}
              </span>
              <span className="text-green-600">
                {getPriceDisplay(restaurant.priceLevel)}
              </span>
              {restaurant.distance && (
                <span>{formatDistance(restaurant.distance)}</span>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  if (variant === "horizontal") {
    return (
      <motion.div
        initial={{ opacity: 0, x: -10 }}
        animate={{ opacity: 1, x: 0 }}
        className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden hover:shadow-lg transition-shadow ${className}`}
      >
        <div className="flex">
          {restaurant.imageUrl && (
            <div className="relative w-32 flex-shrink-0">
              <img
                src={restaurant.imageUrl}
                alt={restaurant.name}
                className="w-full h-full object-cover"
              />
              {restaurant.isOpenNow !== undefined && (
                <div
                  className={`absolute top-2 left-2 px-2 py-0.5 rounded-full text-xs font-medium ${
                    restaurant.isOpenNow
                      ? "bg-green-500 text-white"
                      : "bg-red-500 text-white"
                  }`}
                >
                  {restaurant.isOpenNow ? "Open" : "Closed"}
                </div>
              )}
            </div>
          )}
          <div className="flex-1 p-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-semibold text-gray-900 dark:text-gray-100">
                  {restaurant.name}
                </h3>
                <div className="flex items-center gap-2 mt-1">
                  <span className="flex items-center text-sm">
                    <Star className="w-4 h-4 text-yellow-500 mr-0.5 fill-current" />
                    {restaurant.rating}
                  </span>
                  <span className="text-sm text-gray-400">
                    ({restaurant.reviewCount})
                  </span>
                  <span className="text-sm text-green-600 font-medium">
                    {getPriceDisplay(restaurant.priceLevel)}
                  </span>
                </div>
              </div>
              {restaurant.distance && (
                <span className="text-sm text-gray-500">
                  {formatDistance(restaurant.distance)}
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-1 mt-2">
              {restaurant.cuisine.slice(0, 3).map((c, i) => (
                <Badge key={i} variant="default" size="sm">
                  {c}
                </Badge>
              ))}
            </div>

            <div className="flex items-center gap-3 mt-3">
              <Button
                variant="primary"
                size="sm"
                onClick={handleOpenYelp}
                rightIcon={<ExternalLink className="w-3 h-3" />}
              >
                View on Yelp
              </Button>
              {onSelect && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onSelect(restaurant)}
                >
                  Add to Trip
                </Button>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Full variant
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4 }}
      className={`bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden shadow-sm hover:shadow-xl transition-all ${className}`}
    >
      {/* Image */}
      <div className="relative h-48">
        {restaurant.imageUrl ? (
          <img
            src={restaurant.imageUrl}
            alt={restaurant.name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-orange-400 to-red-500 flex items-center justify-center">
            <Utensils className="w-16 h-16 text-white/50" />
          </div>
        )}

        {/* Overlay badges */}
        <div className="absolute top-3 left-3 right-3 flex justify-between items-start">
          <div className="flex flex-wrap gap-1">
            {restaurant.isOpenNow !== undefined && (
              <span
                className={`px-2 py-1 rounded-full text-xs font-medium ${
                  restaurant.isOpenNow
                    ? "bg-green-500 text-white"
                    : "bg-red-500 text-white"
                }`}
              >
                {restaurant.isOpenNow ? "Open Now" : "Closed"}
              </span>
            )}
            {restaurant.transactions.includes("delivery") && (
              <span className="px-2 py-1 rounded-full text-xs font-medium bg-blue-500 text-white">
                Delivery
              </span>
            )}
          </div>
          <span className="px-2 py-1 rounded-full text-sm font-bold bg-white/90 text-green-600">
            {getPriceDisplay(restaurant.priceLevel)}
          </span>
        </div>

        {/* Distance badge */}
        {restaurant.distance && (
          <div className="absolute bottom-3 right-3">
            <span className="flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-black/60 text-white">
              <Navigation className="w-3 h-3" />
              {formatDistance(restaurant.distance)}
            </span>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="font-bold text-lg text-gray-900 dark:text-gray-100 line-clamp-1">
            {restaurant.name}
          </h3>
          <div className="flex items-center ml-2 flex-shrink-0">
            <Star className="w-5 h-5 text-yellow-500 fill-current" />
            <span className="ml-1 font-semibold text-gray-900 dark:text-gray-100">
              {restaurant.rating}
            </span>
            <span className="ml-1 text-sm text-gray-500">
              ({restaurant.reviewCount})
            </span>
          </div>
        </div>

        {/* Cuisine tags */}
        <div className="flex flex-wrap gap-1 mb-3">
          {restaurant.cuisine.slice(0, 3).map((c, i) => (
            <Badge key={i} variant="default" size="sm">
              {c}
            </Badge>
          ))}
          {restaurant.cuisine.length > 3 && (
            <Badge variant="default" size="sm">
              +{restaurant.cuisine.length - 3}
            </Badge>
          )}
        </div>

        {/* Address */}
        <div className="flex items-start gap-2 text-sm text-gray-600 dark:text-gray-400 mb-2">
          <MapPin className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span className="line-clamp-2">
            {restaurant.address}, {restaurant.city}
          </span>
        </div>

        {/* Phone */}
        {restaurant.phone && (
          <div className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400 mb-4">
            <Phone className="w-4 h-4" />
            <span>{restaurant.phone}</span>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2">
          <Button
            variant="primary"
            size="sm"
            className="flex-1"
            onClick={handleOpenYelp}
            rightIcon={<ExternalLink className="w-3 h-3" />}
          >
            View on Yelp
          </Button>
          {onSelect && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onSelect(restaurant)}
            >
              Add
            </Button>
          )}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Restaurant carousel for displaying in chat/itinerary
 */
export function RestaurantCarousel({
  restaurants,
  onSelect,
}: {
  restaurants: Restaurant[];
  onSelect?: (restaurant: Restaurant) => void;
}) {
  if (restaurants.length === 0) {
    return null;
  }

  return (
    <div className="py-4">
      <div className="flex gap-4 overflow-x-auto pb-4 scrollbar-hide">
        {restaurants.map((restaurant) => (
          <div key={restaurant.id} className="flex-shrink-0 w-72">
            <RestaurantCard
              restaurant={restaurant}
              variant="full"
              onSelect={onSelect}
            />
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Compact restaurant list for sidebars
 */
export function RestaurantList({
  restaurants,
  onSelect,
}: {
  restaurants: Restaurant[];
  onSelect?: (restaurant: Restaurant) => void;
}) {
  return (
    <div className="space-y-2">
      {restaurants.map((restaurant) => (
        <RestaurantCard
          key={restaurant.id}
          restaurant={restaurant}
          variant="compact"
          onSelect={onSelect}
        />
      ))}
    </div>
  );
}
