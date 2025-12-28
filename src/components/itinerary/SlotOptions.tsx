"use client";

import React, { useState, useCallback } from "react";
import {
  motion,
  AnimatePresence,
  useMotionValue,
  useTransform,
  PanInfo,
} from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Clock,
  DollarSign,
  Star,
  Check,
  X,
  Bookmark,
  Layers,
  CreditCard,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  SlotWithOptions,
  ActivityOption,
  StructuredCommuteInfo,
} from "@/types/structured-itinerary";

// ============================================
// SLOT OPTIONS - Main Container
// ============================================

interface SlotOptionsProps {
  slot: SlotWithOptions;
  onSelectOption: (slotId: string, optionId: string) => void;
  isFirst?: boolean;
  prevActivityCoords?: { lat: number; lng: number };
}

export function SlotOptions({
  slot,
  onSelectOption,
  isFirst,
  prevActivityCoords,
}: SlotOptionsProps) {
  const [currentCardIndex, setCurrentCardIndex] = useState(0);

  const slotTypeLabels: Record<string, { label: string; icon: string }> = {
    morning: { label: "Morning", icon: "🌅" },
    breakfast: { label: "Breakfast", icon: "🥐" },
    lunch: { label: "Lunch", icon: "🍽️" },
    afternoon: { label: "Afternoon", icon: "☀️" },
    dinner: { label: "Dinner", icon: "🍷" },
    evening: { label: "Evening", icon: "🌙" },
  };

  const slotInfo = slotTypeLabels[slot.slotType] || {
    label: slot.slotType,
    icon: "📍",
  };

  const handleSelect = useCallback(
    (optionId: string) => {
      onSelectOption(slot.slotId, optionId);
    },
    [onSelectOption, slot.slotId]
  );

  const handleNavigate = useCallback(
    (direction: "prev" | "next") => {
      setCurrentCardIndex((prev) => {
        if (direction === "prev") return Math.max(0, prev - 1);
        return Math.min(slot.options.length - 1, prev + 1);
      });
    },
    [slot.options.length]
  );

  const totalOptions = slot.options.length;
  const currentOption = slot.options[currentCardIndex];
  const isSelected = currentOption?.id === slot.selectedOptionId;

  // Get current activity coordinates for commute directions
  const currentActivityCoords = currentOption?.activity?.place?.coordinates;

  return (
    <div className="slot-container mb-4">
      {/* Commute Block (if not first slot) */}
      {!isFirst && slot.commuteFromPrevious && (
        <CommuteBlock
          commute={slot.commuteFromPrevious}
          fromCoords={prevActivityCoords}
          toCoords={currentActivityCoords}
        />
      )}

      {/* Slot Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <span>{slotInfo.icon}</span>
          <span className="font-medium">{slotInfo.label}</span>
          <span className="text-gray-400">
            {slot.timeRange.start} - {slot.timeRange.end}
          </span>
        </div>

        {/* Card Counter */}
        {totalOptions > 1 && (
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded-full">
            {currentCardIndex + 1} / {totalOptions}
          </span>
        )}
      </div>

      {/* Carousel View - Always On */}
      {currentOption && (
        <SwipeCarousel
          options={slot.options}
          currentIndex={currentCardIndex}
          selectedOptionId={slot.selectedOptionId}
          onNavigate={handleNavigate}
          onSelect={handleSelect}
        />
      )}
    </div>
  );
}

// ============================================
// SWIPE CAROUSEL - Always-on carousel for options
// ============================================

interface SwipeCarouselProps {
  options: ActivityOption[];
  currentIndex: number;
  selectedOptionId?: string | null;
  onNavigate: (direction: "prev" | "next") => void;
  onSelect: (optionId: string) => void;
}

function SwipeCarousel({
  options,
  currentIndex,
  selectedOptionId,
  onNavigate,
  onSelect,
}: SwipeCarouselProps) {
  const currentOption = options[currentIndex];
  const totalOptions = options.length;
  const isSelected = currentOption?.id === selectedOptionId;

  if (!currentOption) return null;

  return (
    <div className="relative">
      {/* Carousel Container */}
      <div className="relative flex items-center gap-2">
        {/* Left Arrow */}
        <button
          onClick={() => onNavigate("prev")}
          disabled={currentIndex <= 0}
          className={cn(
            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all z-10",
            currentIndex > 0
              ? "bg-white dark:bg-gray-700 shadow-md hover:shadow-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
              : "bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed"
          )}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Card Display Area */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentOption.id}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.2 }}
            >
              <CarouselActivityCard
                option={currentOption}
                isSelected={isSelected}
                onSelect={() => onSelect(currentOption.id)}
              />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right Arrow */}
        <button
          onClick={() => onNavigate("next")}
          disabled={currentIndex >= totalOptions - 1}
          className={cn(
            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all z-10",
            currentIndex < totalOptions - 1
              ? "bg-white dark:bg-gray-700 shadow-md hover:shadow-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
              : "bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed"
          )}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Progress Dots */}
      {totalOptions > 1 && (
        <div className="flex items-center justify-center gap-1.5 mt-3">
          {options.map((opt, idx) => (
            <button
              key={opt.id}
              onClick={() => {
                const diff = idx - currentIndex;
                if (diff > 0) {
                  for (let i = 0; i < diff; i++) onNavigate("next");
                } else if (diff < 0) {
                  for (let i = 0; i < -diff; i++) onNavigate("prev");
                }
              }}
              className={cn(
                "h-2 rounded-full transition-all",
                idx === currentIndex
                  ? "bg-purple-500 w-6"
                  : opt.id === selectedOptionId
                  ? "bg-green-400 w-2"
                  : "bg-gray-300 dark:bg-gray-600 w-2 hover:bg-gray-400"
              )}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================
// SWIPE CARD STACK (Carousel-style) - Legacy
// ============================================

interface SwipeCardStackProps {
  options: ActivityOption[];
  currentIndex: number;
  onSwipe: (action: "keep" | "reject" | "save") => void;
  onClose: () => void;
}

function SwipeCardStack({
  options,
  currentIndex: initialIndex,
  onSwipe,
  onClose,
}: SwipeCardStackProps) {
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const alternatives = options.slice(1); // Skip the main selection
  const totalCards = alternatives.length;
  const currentOption = alternatives[currentIndex - 1]; // -1 because index starts from 1

  const goToPrevious = () => {
    if (currentIndex > 1) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const goToNext = () => {
    if (currentIndex < totalCards) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handleAction = (action: "keep" | "reject" | "save") => {
    if (action === "keep") {
      onSwipe("keep");
    } else if (action === "reject") {
      // Move to next card or exit if at end
      if (currentIndex < totalCards) {
        setCurrentIndex(currentIndex + 1);
      } else {
        onClose();
      }
    } else if (action === "save") {
      // Save for later (bookmark), move to next
      if (currentIndex < totalCards) {
        setCurrentIndex(currentIndex + 1);
      } else {
        onClose();
      }
    }
  };

  if (!currentOption) {
    return (
      <div className="relative bg-gray-50 dark:bg-gray-800/50 rounded-xl p-8">
        <button
          onClick={onClose}
          className="absolute top-2 right-2 z-30 w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
        >
          <X className="w-4 h-4" />
        </button>
        <div className="flex items-center justify-center h-[200px] text-gray-500">
          <div className="text-center">
            <Layers className="w-12 h-12 mx-auto mb-2 text-gray-300" />
            <p>No more alternatives</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="relative bg-gradient-to-br from-purple-50 to-blue-50 dark:from-gray-800 dark:to-gray-900 rounded-xl p-4 shadow-lg">
      {/* Header: Close button and counter */}
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <CreditCard className="w-4 h-4 text-purple-500" />
          <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Browse Alternatives
          </span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {currentIndex} / {totalCards}
          </span>
          <button
            onClick={onClose}
            className="w-7 h-7 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Carousel Container */}
      <div className="relative flex items-center gap-2">
        {/* Left Arrow */}
        <button
          onClick={goToPrevious}
          disabled={currentIndex <= 1}
          className={cn(
            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all",
            currentIndex > 1
              ? "bg-white dark:bg-gray-700 shadow-md hover:shadow-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
              : "bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed"
          )}
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        {/* Card Display Area */}
        <div className="flex-1 overflow-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentOption.id}
              initial={{ opacity: 0, x: 50 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -50 }}
              transition={{ duration: 0.2 }}
            >
              <CarouselActivityCard option={currentOption} />
            </motion.div>
          </AnimatePresence>
        </div>

        {/* Right Arrow */}
        <button
          onClick={goToNext}
          disabled={currentIndex >= totalCards}
          className={cn(
            "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all",
            currentIndex < totalCards
              ? "bg-white dark:bg-gray-700 shadow-md hover:shadow-lg text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-600"
              : "bg-gray-100 dark:bg-gray-800 text-gray-300 dark:text-gray-600 cursor-not-allowed"
          )}
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center justify-center gap-4 mt-4">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleAction("reject")}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 font-medium shadow-md hover:shadow-lg transition-shadow"
        >
          <X className="w-4 h-4" />
          <span>Skip</span>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleAction("save")}
          className="flex items-center gap-2 px-4 py-2 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 font-medium shadow-md hover:shadow-lg transition-shadow"
        >
          <Bookmark className="w-4 h-4" />
          <span>Save</span>
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={() => handleAction("keep")}
          className="flex items-center gap-2 px-5 py-2 rounded-full bg-green-500 dark:bg-green-600 text-white font-medium shadow-md hover:shadow-lg transition-shadow"
        >
          <Check className="w-4 h-4" />
          <span>Select</span>
        </motion.button>
      </div>

      {/* Progress Dots */}
      <div className="flex items-center justify-center gap-1 mt-3">
        {alternatives.map((_, idx) => (
          <button
            key={idx}
            onClick={() => setCurrentIndex(idx + 1)}
            className={cn(
              "w-2 h-2 rounded-full transition-all",
              idx + 1 === currentIndex
                ? "bg-purple-500 w-4"
                : "bg-gray-300 dark:bg-gray-600 hover:bg-gray-400"
            )}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================
// CAROUSEL ACTIVITY CARD (with image)
// ============================================

interface CarouselActivityCardProps {
  option: ActivityOption;
  isSelected?: boolean;
  onSelect?: () => void;
}

// Category-based placeholder images from Unsplash
const categoryImages: Record<string, string> = {
  restaurant:
    "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400&h=250&fit=crop",
  cafe: "https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400&h=250&fit=crop",
  temple:
    "https://images.unsplash.com/photo-1545569341-9eb8b30979d9?w=400&h=250&fit=crop",
  shrine:
    "https://images.unsplash.com/photo-1478436127897-769e1b3f0f36?w=400&h=250&fit=crop",
  museum:
    "https://images.unsplash.com/photo-1554907984-15263bfd63bd?w=400&h=250&fit=crop",
  park: "https://images.unsplash.com/photo-1519331379826-f10be5486c6f?w=400&h=250&fit=crop",
  garden:
    "https://images.unsplash.com/photo-1585320806297-9794b3e4eeae?w=400&h=250&fit=crop",
  market:
    "https://images.unsplash.com/photo-1555529669-e69e7aa0ba9a?w=400&h=250&fit=crop",
  shopping:
    "https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400&h=250&fit=crop",
  nightlife:
    "https://images.unsplash.com/photo-1516450360452-9312f5e86fc7?w=400&h=250&fit=crop",
  bar: "https://images.unsplash.com/photo-1572116469696-31de0f17cc34?w=400&h=250&fit=crop",
  landmark:
    "https://images.unsplash.com/photo-1480796927426-f609979314bd?w=400&h=250&fit=crop",
  attraction:
    "https://images.unsplash.com/photo-1493976040374-85c8e12f0c0e?w=400&h=250&fit=crop",
  tour: "https://images.unsplash.com/photo-1469854523086-cc02fe5d8800?w=400&h=250&fit=crop",
  activity:
    "https://images.unsplash.com/photo-1530789253388-582c481c54b0?w=400&h=250&fit=crop",
  default:
    "https://images.unsplash.com/photo-1488646953014-85cb44e25828?w=400&h=250&fit=crop",
};

function getPlaceholderImage(category: string): string {
  const lowerCat = category.toLowerCase();
  for (const [key, url] of Object.entries(categoryImages)) {
    if (lowerCat.includes(key)) return url;
  }
  return categoryImages.default;
}

function CarouselActivityCard({
  option,
  isSelected,
  onSelect,
}: CarouselActivityCardProps) {
  const { activity, matchReasons, score, rank } = option;

  // Get image: use place photos if available, otherwise use category placeholder
  const imageUrl =
    activity.place?.photos?.[0] || getPlaceholderImage(activity.category);

  return (
    <div
      className={cn(
        "bg-white dark:bg-gray-800 rounded-xl shadow-md overflow-hidden border-2 transition-all",
        isSelected
          ? "border-green-500 ring-2 ring-green-200 dark:ring-green-800"
          : "border-gray-200 dark:border-gray-700"
      )}
    >
      {/* Image Section */}
      <div className="relative h-36 overflow-hidden">
        <img
          src={imageUrl}
          alt={activity.name}
          className="w-full h-full object-cover"
          onError={(e) => {
            (e.target as HTMLImageElement).src = categoryImages.default;
          }}
        />
        {/* Gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />

        {/* Selected badge */}
        {isSelected && (
          <div className="absolute top-3 left-3 px-2 py-1 text-xs font-bold bg-green-500 text-white rounded-full shadow flex items-center gap-1">
            <Check className="w-3 h-3" />
            Selected
          </div>
        )}

        {/* Score badge on image */}
        <div
          className={cn(
            "absolute top-3 right-3 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shadow-lg",
            score >= 80
              ? "bg-green-500 text-white"
              : score >= 60
              ? "bg-yellow-500 text-white"
              : "bg-gray-500 text-white"
          )}
        >
          {score}
        </div>

        {/* Rank badge */}
        {rank <= 3 && !isSelected && (
          <div className="absolute top-3 left-3 px-2 py-1 text-xs font-bold bg-yellow-400 text-yellow-900 rounded-full shadow">
            #{rank}
          </div>
        )}

        {/* Title overlay on image */}
        <div className="absolute bottom-0 left-0 right-0 p-3">
          <h4 className="font-bold text-white text-base drop-shadow-lg line-clamp-1">
            {activity.name}
          </h4>
          <div className="flex items-center gap-2 text-white/90 text-xs mt-0.5">
            {activity.place?.neighborhood && (
              <span className="flex items-center gap-1">
                <MapPin className="w-3 h-3" />
                {activity.place.neighborhood}
              </span>
            )}
            {activity.place?.rating && (
              <span className="flex items-center gap-1">
                <Star className="w-3 h-3 text-yellow-400 fill-yellow-400" />
                {activity.place.rating}
                {activity.place.reviewCount && (
                  <span>({activity.place.reviewCount.toLocaleString()})</span>
                )}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Content Section */}
      <div className="p-3">
        {/* Description */}
        <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-2 mb-2">
          {activity.description}
        </p>

        {/* Meta Row: Duration, Cost, Tags */}
        <div className="flex items-center gap-2 flex-wrap mb-3">
          <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300">
            <Clock className="w-3 h-3" />
            {activity.duration} min
          </span>

          {activity.isFree ? (
            <span className="px-2 py-0.5 text-xs font-medium bg-green-100 text-green-700 rounded-full">
              FREE
            </span>
          ) : (
            activity.estimatedCost && (
              <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300">
                <DollarSign className="w-3 h-3" />~
                {activity.estimatedCost.amount}{" "}
                {activity.estimatedCost.currency}
              </span>
            )
          )}

          {activity.tags.slice(0, 2).map((tag) => (
            <span
              key={tag}
              className="px-2 py-0.5 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>

        {/* Match Reasons */}
        {matchReasons.length > 0 && (
          <div className="mb-3">
            {matchReasons.slice(0, 2).map((reason, i) => (
              <div
                key={i}
                className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400"
              >
                <Check className="w-3 h-3" />
                {reason}
              </div>
            ))}
          </div>
        )}

        {/* Select Button */}
        <button
          onClick={onSelect}
          className={cn(
            "w-full py-2 rounded-lg font-medium text-sm transition-all",
            isSelected
              ? "bg-green-500 text-white"
              : "bg-purple-600 hover:bg-purple-700 text-white"
          )}
        >
          {isSelected ? (
            <span className="flex items-center justify-center gap-1">
              <Check className="w-4 h-4" />
              Selected
            </span>
          ) : (
            "Select This Option"
          )}
        </button>
      </div>
    </div>
  );
}

// ============================================
// SWIPEABLE ACTIVITY CARD
// ============================================

interface SwipeableActivityCardProps {
  option: ActivityOption;
  isTop: boolean;
  stackIndex: number;
  onSwipe: (action: "keep" | "reject" | "save") => void;
}

function SwipeableActivityCard({
  option,
  isTop,
  stackIndex,
  onSwipe,
}: SwipeableActivityCardProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotate = useTransform(x, [-200, 200], [-15, 15]);
  const opacity = useTransform(
    x,
    [-200, -100, 0, 100, 200],
    [0.5, 1, 1, 1, 0.5]
  );

  // Swipe indicators
  const keepOpacity = useTransform(x, [0, 100], [0, 1]);
  const rejectOpacity = useTransform(x, [-100, 0], [1, 0]);

  const handleDragEnd = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    const swipeThreshold = 100;
    const velocityThreshold = 500;
    const { offset, velocity } = info;

    if (
      Math.abs(offset.x) > swipeThreshold ||
      Math.abs(velocity.x) > velocityThreshold
    ) {
      if (offset.x > 0) {
        onSwipe("keep");
      } else {
        onSwipe("reject");
      }
      return;
    }

    // Vertical swipe for save
    if (offset.y < -swipeThreshold || velocity.y < -velocityThreshold) {
      onSwipe("save");
    }
  };

  const { activity, matchReasons, score, rank } = option;

  return (
    <motion.div
      className={cn(
        "absolute inset-0",
        isTop ? "z-20" : `z-${10 - stackIndex}`
      )}
      style={{
        x: isTop ? x : 0,
        y: isTop ? y : 0,
        rotate: isTop ? rotate : 0,
        scale: 1 - stackIndex * 0.05,
        opacity: isTop ? opacity : 0.8 - stackIndex * 0.2,
        top: stackIndex * 8,
      }}
      drag={isTop}
      dragConstraints={{ left: 0, right: 0, top: 0, bottom: 0 }}
      dragElastic={0.8}
      onDragEnd={isTop ? handleDragEnd : undefined}
      whileTap={{ cursor: "grabbing" }}
    >
      <div className="h-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Swipe Indicators */}
        {isTop && (
          <>
            <motion.div
              className="absolute top-4 left-4 z-30 px-3 py-1 bg-green-500 text-white font-bold text-sm rounded-lg rotate-[-10deg]"
              style={{ opacity: keepOpacity }}
            >
              SELECT ✓
            </motion.div>
            <motion.div
              className="absolute top-4 right-4 z-30 px-3 py-1 bg-red-500 text-white font-bold text-sm rounded-lg rotate-[10deg]"
              style={{ opacity: rejectOpacity }}
            >
              SKIP ✗
            </motion.div>
          </>
        )}

        {/* Card Content */}
        <div className="p-4 h-full flex flex-col">
          {/* Header */}
          <div className="flex items-start justify-between gap-2 mb-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                  {activity.name}
                </h4>
                {rank <= 2 && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full flex-shrink-0">
                    {rank === 1 ? "Top Pick" : "#2"}
                  </span>
                )}
              </div>

              {/* Location & Duration */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
                {activity.place?.neighborhood && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {activity.place.neighborhood}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {activity.duration} min
                </span>
                {activity.place?.rating && (
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                    {activity.place.rating}
                    {activity.place.reviewCount && (
                      <span className="text-gray-400">
                        ({activity.place.reviewCount})
                      </span>
                    )}
                  </span>
                )}
              </div>
            </div>

            {/* Score Badge */}
            <div
              className={cn(
                "flex-shrink-0 w-12 h-12 rounded-full flex items-center justify-center text-sm font-bold",
                score >= 80
                  ? "bg-green-100 text-green-700"
                  : score >= 60
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-gray-100 text-gray-600"
              )}
            >
              {score}
            </div>
          </div>

          {/* Description */}
          <p className="text-sm text-gray-600 dark:text-gray-300 line-clamp-3 mb-3">
            {activity.description}
          </p>

          {/* Cost */}
          <div className="flex items-center gap-2 mb-3">
            {activity.isFree ? (
              <span className="px-2 py-1 text-xs font-medium bg-green-100 text-green-700 rounded-full">
                FREE
              </span>
            ) : (
              activity.estimatedCost && (
                <span className="flex items-center gap-1 px-2 py-1 text-xs bg-gray-100 dark:bg-gray-700 rounded-full text-gray-600 dark:text-gray-300">
                  <DollarSign className="w-3 h-3" />~
                  {activity.estimatedCost.amount}{" "}
                  {activity.estimatedCost.currency}
                </span>
              )
            )}
          </div>

          {/* Tags */}
          {activity.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {activity.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Match Reasons */}
          {matchReasons.length > 0 && (
            <div className="mt-auto space-y-1">
              {matchReasons.slice(0, 2).map((reason, i) => (
                <div
                  key={i}
                  className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400"
                >
                  <Check className="w-3 h-3" />
                  {reason}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================
// ACTIVITY OPTION CARD
// ============================================

interface ActivityOptionCardProps {
  option: ActivityOption;
  isSelected?: boolean;
  isCompact?: boolean;
  onSelect: () => void;
}

export function ActivityOptionCard({
  option,
  isSelected,
  isCompact,
  onSelect,
}: ActivityOptionCardProps) {
  const { activity, matchReasons, tradeoffs, dietaryMatch, score, rank } =
    option;

  return (
    <motion.div
      whileHover={{ scale: 1.01 }}
      className={cn(
        "rounded-xl border transition-all cursor-pointer",
        isSelected
          ? "border-purple-500 bg-purple-50 dark:bg-purple-900/20"
          : "border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800",
        isCompact ? "p-3" : "p-4"
      )}
      onClick={onSelect}
    >
      <div className="flex gap-4">
        {/* Left: Content */}
        <div className="flex-1 min-w-0">
          {/* Header */}
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <h4
                  className={cn(
                    "font-semibold text-gray-900 dark:text-white truncate",
                    isCompact ? "text-sm" : "text-base"
                  )}
                >
                  {activity.name}
                </h4>
                {rank === 1 && !isCompact && (
                  <span className="px-2 py-0.5 text-xs font-medium bg-yellow-100 text-yellow-800 rounded-full">
                    Top Pick
                  </span>
                )}
              </div>

              {/* Location & Duration */}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-xs text-gray-500 dark:text-gray-400">
                {activity.place?.neighborhood && (
                  <span className="flex items-center gap-1">
                    <MapPin className="w-3 h-3" />
                    {activity.place.neighborhood}
                  </span>
                )}
                <span className="flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {activity.duration} min
                </span>
                <span className="flex items-center gap-1">
                  {activity.isFree ? (
                    <span className="text-green-600 font-medium">FREE</span>
                  ) : activity.estimatedCost ? (
                    <>
                      <DollarSign className="w-3 h-3" />~
                      {activity.estimatedCost.currency === "USD" ? "$" : ""}
                      {activity.estimatedCost.amount}
                    </>
                  ) : null}
                </span>
                {activity.place?.rating && (
                  <span className="flex items-center gap-1">
                    <Star className="w-3 h-3 text-yellow-500" />
                    {activity.place.rating}
                  </span>
                )}
              </div>
            </div>

            {/* Score Badge */}
            {!isCompact && (
              <div
                className={cn(
                  "flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold",
                  score >= 80
                    ? "bg-green-100 text-green-700"
                    : score >= 60
                    ? "bg-yellow-100 text-yellow-700"
                    : "bg-gray-100 text-gray-600"
                )}
              >
                {score}
              </div>
            )}
          </div>

          {/* Description */}
          {!isCompact && (
            <p className="mt-2 text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
              {activity.description}
            </p>
          )}

          {/* Tags */}
          {!isCompact && activity.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {activity.tags.slice(0, 4).map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}

          {/* Dietary Match Badge */}
          {dietaryMatch && (
            <DietaryBadge match={dietaryMatch} compact={isCompact} />
          )}

          {/* Match Reasons & Tradeoffs (only for expanded view) */}
          {!isCompact && (
            <div className="mt-3 space-y-2">
              {matchReasons.length > 0 && (
                <div className="space-y-1">
                  {matchReasons.slice(0, 3).map((reason, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400"
                    >
                      <Check className="w-3 h-3" />
                      {reason}
                    </div>
                  ))}
                </div>
              )}

              {tradeoffs.length > 0 && (
                <div className="space-y-1">
                  {tradeoffs.slice(0, 2).map((tradeoff, i) => (
                    <div
                      key={i}
                      className="text-xs text-amber-600 dark:text-amber-400"
                    >
                      ⚠️ {tradeoff}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right: Selection indicator */}
        <div className="flex-shrink-0 flex items-center">
          <div
            className={cn(
              "w-6 h-6 rounded-full border-2 flex items-center justify-center",
              isSelected
                ? "border-purple-500 bg-purple-500"
                : "border-gray-300 dark:border-gray-600"
            )}
          >
            {isSelected && <Check className="w-4 h-4 text-white" />}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================
// DIETARY BADGE
// ============================================

interface DietaryBadgeProps {
  match: NonNullable<ActivityOption["dietaryMatch"]>;
  compact?: boolean;
}

function DietaryBadge({ match, compact }: DietaryBadgeProps) {
  if (!match.meetsRequirements && match.warnings.length === 0) {
    return null;
  }

  return (
    <div className={cn("flex items-center gap-1 mt-2", compact && "mt-1")}>
      {match.meetsRequirements ? (
        <span className="flex items-center gap-1 px-2 py-0.5 text-xs bg-green-100 text-green-700 rounded-full">
          <Check className="w-3 h-3" />
          Dietary OK
        </span>
      ) : null}
      {match.warnings.length > 0 && (
        <span className="px-2 py-0.5 text-xs bg-amber-100 text-amber-700 rounded-full">
          ⚠️ {match.warnings[0]}
        </span>
      )}
    </div>
  );
}

// ============================================
// COMMUTE BLOCK
// ============================================

// Google Maps travel mode mapping
const GOOGLE_MAPS_TRAVEL_MODE: Record<string, string> = {
  walk: "walking",
  transit: "transit",
  taxi: "driving",
  drive: "driving",
};

function generateGoogleMapsDirectionsUrl(
  origin: { lat: number; lng: number } | string,
  destination: { lat: number; lng: number } | string,
  travelMode: string = "transit"
): string {
  const originStr =
    typeof origin === "string"
      ? encodeURIComponent(origin)
      : `${origin.lat},${origin.lng}`;
  const destStr =
    typeof destination === "string"
      ? encodeURIComponent(destination)
      : `${destination.lat},${destination.lng}`;
  const mode = GOOGLE_MAPS_TRAVEL_MODE[travelMode] || "transit";

  return `https://www.google.com/maps/dir/?api=1&origin=${originStr}&destination=${destStr}&travelmode=${mode}`;
}

interface CommuteBlockProps {
  commute: StructuredCommuteInfo;
  fromCoords?: { lat: number; lng: number };
  toCoords?: { lat: number; lng: number };
}

export function CommuteBlock({
  commute,
  fromCoords,
  toCoords,
}: CommuteBlockProps) {
  const methodIcons: Record<string, string> = {
    walk: "🚶",
    transit: "🚃",
    taxi: "🚕",
    drive: "🚗",
  };

  const icon = methodIcons[commute.method] || "🚶";

  const googleMapsUrl =
    fromCoords && toCoords
      ? generateGoogleMapsDirectionsUrl(fromCoords, toCoords, commute.method)
      : null;

  return (
    <div className="flex items-center gap-2 py-2 px-3 my-2 bg-gray-50 dark:bg-gray-800/50 rounded-lg">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 flex items-center justify-center text-lg">
        {icon}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 text-sm">
          <span className="font-medium text-gray-700 dark:text-gray-300">
            {commute.duration} min
          </span>
          <span className="text-gray-400">•</span>
          <span className="text-gray-500 dark:text-gray-400 capitalize">
            {commute.method}
          </span>
          {commute.trainLines && commute.trainLines.length > 0 && (
            <>
              <span className="text-gray-400">•</span>
              <span className="text-xs text-gray-500 truncate">
                {commute.trainLines.join(", ")}
              </span>
            </>
          )}
        </div>
        {commute.instructions && (
          <p className="text-xs text-gray-400 truncate">
            {commute.instructions}
          </p>
        )}
      </div>
      {commute.cost && (
        <div className="flex-shrink-0 text-xs text-gray-500">
          ~{commute.cost.currency === "USD" ? "$" : ""}
          {commute.cost.amount}
        </div>
      )}
      {googleMapsUrl && (
        <a
          href={googleMapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex-shrink-0 px-2 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded hover:bg-blue-200 dark:hover:bg-blue-800/40 transition-colors text-xs"
          title="Open directions in Google Maps"
        >
          🗺️ Directions
        </a>
      )}
    </div>
  );
}

// ============================================
// EXPORTS
// ============================================

export default SlotOptions;
