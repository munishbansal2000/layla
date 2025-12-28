"use client";

import { motion } from "framer-motion";
import {
  Star,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  MapPin,
} from "lucide-react";
import { useState, useRef } from "react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import type { BookableRestaurant } from "@/types";

interface RestaurantCarouselProps {
  restaurants: BookableRestaurant[];
  destination?: string;
  onAddToItinerary?: (restaurant: BookableRestaurant) => void;
}

// Cuisine emoji mapping
const cuisineEmojis: Record<string, string> = {
  italian: "🍕",
  french: "🥐",
  japanese: "🍣",
  sushi: "🍣",
  chinese: "🥡",
  mexican: "🌮",
  indian: "🍛",
  thai: "🍜",
  vietnamese: "🍲",
  korean: "🍱",
  american: "🍔",
  burgers: "🍔",
  pizza: "🍕",
  seafood: "🦐",
  mediterranean: "🥙",
  greek: "🥗",
  spanish: "🥘",
  steakhouse: "🥩",
  barbecue: "🍖",
  bbq: "🍖",
  bakery: "🥖",
  cafe: "☕",
  coffee: "☕",
  dessert: "🍰",
  ice_cream: "🍦",
  breakfast: "🥞",
  brunch: "🥞",
  vegetarian: "🥗",
  vegan: "🥬",
  default: "🍽️",
};

export function RestaurantCarousel({
  restaurants,
  destination,
  onAddToItinerary,
}: RestaurantCarouselProps) {
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

  const getCuisineEmoji = (categories: string[]): string => {
    for (const category of categories) {
      const normalizedCategory = category.toLowerCase().replace(/\s+/g, "_");
      if (cuisineEmojis[normalizedCategory]) {
        return cuisineEmojis[normalizedCategory];
      }
    }
    return cuisineEmojis.default;
  };

  const formatPriceLevel = (priceLevel: number): string => {
    return "$".repeat(priceLevel);
  };

  if (restaurants.length === 0) {
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
          <Badge className="bg-[#D32323]/10 text-[#D32323] border-[#D32323]/20">
            Powered by Yelp
          </Badge>
          {destination && (
            <span className="text-sm text-gray-500">
              {restaurants.length} restaurants in {destination}
            </span>
          )}
        </div>

        {/* Navigation Arrows */}
        {restaurants.length > 2 && (
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
        {restaurants.map((restaurant, index) => (
          <motion.div
            key={restaurant.id}
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
                  src={restaurant.imageUrl}
                  alt={restaurant.name}
                  className="w-full h-full object-cover"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src =
                      "/images/placeholder-restaurant.jpg";
                  }}
                />
                <div className="absolute top-2 right-2">
                  <Badge className="bg-white/95 text-gray-900 font-semibold text-xs">
                    {formatPriceLevel(restaurant.priceLevel)}
                  </Badge>
                </div>
                <div className="absolute top-2 left-2">
                  <span className="text-2xl">
                    {getCuisineEmoji(restaurant.categories)}
                  </span>
                </div>
              </div>

              {/* Content */}
              <div className="p-3">
                <h4 className="font-medium text-sm text-gray-900 dark:text-gray-100 line-clamp-2 mb-1">
                  {restaurant.name}
                </h4>

                <p className="text-xs text-gray-500 mb-2">
                  {restaurant.categories.slice(0, 2).join(" · ")}
                </p>

                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mb-2">
                  {restaurant.rating && (
                    <span className="flex items-center gap-1">
                      <Star className="w-3.5 h-3.5 fill-yellow-400 text-yellow-400" />
                      {restaurant.rating.toFixed(1)}
                      {restaurant.reviewCount && (
                        <span className="text-gray-400">
                          ({restaurant.reviewCount.toLocaleString()})
                        </span>
                      )}
                    </span>
                  )}
                  {restaurant.distance && (
                    <span className="flex items-center gap-1 text-gray-400">
                      <MapPin className="w-3 h-3" />
                      {restaurant.distance}
                    </span>
                  )}
                </div>

                <p className="text-xs text-gray-500 line-clamp-1 mb-3 flex items-center gap-1">
                  <MapPin className="w-3 h-3 flex-shrink-0" />
                  {restaurant.address}
                </p>

                {/* Action Buttons */}
                <div className="flex gap-2">
                  {onAddToItinerary && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="flex-1 text-xs h-8"
                      onClick={() => onAddToItinerary(restaurant)}
                    >
                      Add to Trip
                    </Button>
                  )}
                  <Button
                    size="sm"
                    className="flex-1 bg-[#D32323] hover:bg-[#B31F1F] text-white text-xs h-8"
                    onClick={() => window.open(restaurant.url, "_blank")}
                  >
                    <ExternalLink className="w-3 h-3 mr-1" />
                    View
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
interface RestaurantChipProps {
  restaurant: BookableRestaurant;
  onClick?: () => void;
}

export function RestaurantChip({ restaurant, onClick }: RestaurantChipProps) {
  return (
    <button
      onClick={onClick || (() => window.open(restaurant.url, "_blank"))}
      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300 text-sm hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
    >
      <span className="font-medium truncate max-w-[200px]">
        {restaurant.name}
      </span>
      {restaurant.rating && (
        <Badge
          size="sm"
          className="bg-red-200 dark:bg-red-800 text-red-800 dark:text-red-200"
        >
          ⭐ {restaurant.rating}
        </Badge>
      )}
      <ExternalLink className="w-3 h-3 flex-shrink-0" />
    </button>
  );
}
