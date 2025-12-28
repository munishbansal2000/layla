"use client";

import {
  useState,
  useEffect,
  useCallback,
  useMemo,
  forwardRef,
  useImperativeHandle,
} from "react";
import { motion, useMotionValue, useTransform, PanInfo } from "framer-motion";
import {
  Star,
  Clock,
  MapPin,
  DollarSign,
  Heart,
  X,
  Check,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  Sparkles,
  RotateCcw,
  Loader2,
  Navigation,
  Users,
  Footprints,
  Train,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { ViatorActivitySuggestion, TimeSlot } from "@/lib/trip-planning";
import type {
  SwipeAction,
  ScoredActivity,
  TripMode,
  PaceMode,
} from "@/types/activity-suggestion";

// ============================================
// Types
// ============================================

export interface SelectionSlot {
  id: string;
  dayNumber: number;
  date: string;
  timeSlot: TimeSlot;
  options: ScoredActivityOption[];
  selectedOption: ScoredActivityOption | null;
  status: "pending" | "in-progress" | "selected" | "skipped";
}

export interface ScoredActivityOption {
  activity: ViatorActivitySuggestion;
  score: number;
  scoreBreakdown: {
    interestMatch: number;
    timeOfDayFit: number;
    durationFit: number;
    budgetMatch: number;
    locationProximity: number;
    varietyBonus: number;
  };
  explanation: string;
  commuteFromPrevious?: {
    durationMinutes: number;
    method: "walk" | "transit" | "taxi";
    distanceMeters: number;
  };
  warnings?: string[];
  tags: string[];
}

export interface SelectionSession {
  id: string;
  tripId: string;
  slots: SelectionSlot[];
  currentSlotIndex: number;
  currentOptionIndex: number;
  swipeHistory: SwipeHistoryItem[];
  isComplete: boolean;
  stats: {
    totalSlots: number;
    slotsCompleted: number;
    activitiesAccepted: number;
    activitiesSaved: number;
    activitiesRejected: number;
  };
}

interface SwipeHistoryItem {
  slotId: string;
  optionId: string;
  action: SwipeAction;
  timestamp: Date;
}

interface ActivitySelectionFlowProps {
  session: SelectionSession;
  onSwipe: (slotId: string, optionId: string, action: SwipeAction) => void;
  onSlotComplete: (
    slotId: string,
    selectedOption: ScoredActivityOption | null
  ) => void;
  onSessionComplete: (session: SelectionSession) => void;
  onUndo: () => void;
  tripMode: TripMode;
  paceMode: PaceMode;
  hasChildren: boolean;
}

// ============================================
// Main Component
// ============================================

export function ActivitySelectionFlow({
  session,
  onSwipe,
  onSlotComplete,
  onSessionComplete,
  onUndo,
  tripMode,
  paceMode,
  hasChildren,
}: ActivitySelectionFlowProps) {
  const [isAnimating, setIsAnimating] = useState(false);

  const currentSlot = session.slots[session.currentSlotIndex];
  const currentOption = currentSlot?.options[session.currentOptionIndex];
  const remainingOptions = currentSlot
    ? currentSlot.options.length - session.currentOptionIndex
    : 0;

  // Progress calculation
  const progress = useMemo(() => {
    const totalSlots = session.slots.length;
    const completedSlots = session.slots.filter(
      (s) => s.status === "selected" || s.status === "skipped"
    ).length;
    return (completedSlots / totalSlots) * 100;
  }, [session.slots]);

  // Handle swipe action
  const handleSwipe = useCallback(
    (action: SwipeAction) => {
      if (!currentSlot || !currentOption || isAnimating) return;

      setIsAnimating(true);
      onSwipe(currentSlot.id, currentOption.activity.id, action);

      setTimeout(() => {
        setIsAnimating(false);
      }, 300);
    },
    [currentSlot, currentOption, isAnimating, onSwipe]
  );

  // Keyboard controls
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "ArrowLeft":
          handleSwipe("reject");
          break;
        case "ArrowRight":
          handleSwipe("keep");
          break;
        case "ArrowUp":
          handleSwipe("must-do");
          break;
        case "ArrowDown":
          handleSwipe("save-for-later");
          break;
        case "z":
          if (e.ctrlKey || e.metaKey) {
            onUndo();
          }
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleSwipe, onUndo]);

  if (session.isComplete) {
    return (
      <SelectionComplete session={session} onContinue={onSessionComplete} />
    );
  }

  if (!currentSlot || !currentOption) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-purple-500" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-gray-50 dark:bg-gray-900">
      {/* Header with Progress */}
      <SelectionHeader
        session={session}
        currentSlot={currentSlot}
        progress={progress}
        onUndo={onUndo}
      />

      {/* Slot Info Bar */}
      <SlotInfoBar slot={currentSlot} remainingOptions={remainingOptions} />

      {/* Swipeable Card Stack */}
      <div className="flex-1 relative overflow-hidden p-4">
        <SwipeableCardStack
          options={currentSlot.options}
          currentIndex={session.currentOptionIndex}
          onSwipe={handleSwipe}
          tripMode={tripMode}
          hasChildren={hasChildren}
        />
      </div>

      {/* Action Buttons */}
      <ActionButtons
        onReject={() => handleSwipe("reject")}
        onSaveForLater={() => handleSwipe("save-for-later")}
        onAccept={() => handleSwipe("keep")}
        onMustDo={() => handleSwipe("must-do")}
        disabled={isAnimating}
      />

      {/* Instructions */}
      <div className="px-4 py-2 text-center">
        <p className="text-xs text-gray-400">
          Swipe right to add • Left to skip • Up for must-do • Down for later
        </p>
      </div>
    </div>
  );
}

// ============================================
// Selection Header
// ============================================

interface SelectionHeaderProps {
  session: SelectionSession;
  currentSlot: SelectionSlot;
  progress: number;
  onUndo: () => void;
}

function SelectionHeader({
  session,
  currentSlot,
  progress,
  onUndo,
}: SelectionHeaderProps) {
  return (
    <div className="flex-shrink-0 p-4 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Day {currentSlot.dayNumber}
          </h2>
          <p className="text-xs text-gray-500">
            {new Date(currentSlot.date).toLocaleDateString("en-US", {
              weekday: "long",
              month: "short",
              day: "numeric",
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onUndo}
            disabled={session.swipeHistory.length === 0}
          >
            <RotateCcw className="w-4 h-4" />
          </Button>
          <div className="text-right">
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              {session.stats.slotsCompleted}/{session.stats.totalSlots}
            </span>
            <p className="text-xs text-gray-500">slots filled</p>
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
        <motion.div
          className="h-full bg-gradient-to-r from-purple-500 to-pink-500"
          initial={{ width: 0 }}
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.3 }}
        />
      </div>
    </div>
  );
}

// ============================================
// Slot Info Bar
// ============================================

interface SlotInfoBarProps {
  slot: SelectionSlot;
  remainingOptions: number;
}

function SlotInfoBar({ slot, remainingOptions }: SlotInfoBarProps) {
  return (
    <div className="flex-shrink-0 px-4 py-2 bg-purple-50 dark:bg-purple-900/20 border-b border-purple-100 dark:border-purple-800/30">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className="w-4 h-4 text-purple-600 dark:text-purple-400" />
          <span className="text-sm font-medium text-purple-700 dark:text-purple-300">
            {slot.timeSlot.label}
          </span>
          <span className="text-xs text-purple-500">
            {slot.timeSlot.startTime} - {slot.timeSlot.endTime}
          </span>
        </div>
        <div className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400">
          <span>{remainingOptions} options left</span>
        </div>
      </div>
    </div>
  );
}

// ============================================
// Swipeable Card Stack
// ============================================

interface SwipeableCardStackProps {
  options: ScoredActivityOption[];
  currentIndex: number;
  onSwipe: (action: SwipeAction) => void;
  tripMode: TripMode;
  hasChildren: boolean;
}

function SwipeableCardStack({
  options,
  currentIndex,
  onSwipe,
  tripMode,
  hasChildren,
}: SwipeableCardStackProps) {
  // Show up to 3 cards stacked
  const visibleCards = options.slice(currentIndex, currentIndex + 3);

  return (
    <div className="relative h-full">
      {visibleCards.map((option, index) => (
        <SwipeableCard
          key={option.activity.id}
          option={option}
          isTop={index === 0}
          stackIndex={index}
          onSwipe={onSwipe}
          tripMode={tripMode}
          hasChildren={hasChildren}
        />
      ))}

      {visibleCards.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="text-center">
            <Sparkles className="w-12 h-12 text-purple-300 mx-auto mb-3" />
            <p className="text-gray-500">No more options for this slot</p>
            <p className="text-xs text-gray-400 mt-1">
              Move to the next time slot
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================
// Swipeable Card Component
// ============================================

interface SwipeableCardProps {
  option: ScoredActivityOption;
  isTop: boolean;
  stackIndex: number;
  onSwipe: (action: SwipeAction) => void;
  tripMode: TripMode;
  hasChildren: boolean;
}

function SwipeableCard({
  option,
  isTop,
  stackIndex,
  onSwipe,
  tripMode,
  hasChildren,
}: SwipeableCardProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  const rotate = useTransform(x, [-200, 200], [-25, 25]);
  const opacity = useTransform(
    x,
    [-200, -100, 0, 100, 200],
    [0.5, 1, 1, 1, 0.5]
  );

  // Swipe indicators
  const likeOpacity = useTransform(x, [0, 100], [0, 1]);
  const nopeOpacity = useTransform(x, [-100, 0], [1, 0]);
  const superLikeOpacity = useTransform(y, [-100, 0], [1, 0]);
  const saveLaterOpacity = useTransform(y, [0, 100], [0, 1]);

  const handleDragEnd = (
    _event: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    const swipeThreshold = 100;
    const velocityThreshold = 500;

    const { offset, velocity } = info;

    // Horizontal swipe
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

    // Vertical swipe
    if (
      Math.abs(offset.y) > swipeThreshold ||
      Math.abs(velocity.y) > velocityThreshold
    ) {
      if (offset.y < 0) {
        onSwipe("must-do");
      } else {
        onSwipe("save-for-later");
      }
      return;
    }
  };

  const { activity } = option;
  const isFamilyFriendly = activity.tags?.some(
    (t) => t.toLowerCase().includes("family") || t.toLowerCase().includes("kid")
  );

  return (
    <motion.div
      className={cn(
        "absolute inset-0",
        isTop ? "z-10" : `z-${10 - stackIndex}`
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
      dragElastic={1}
      onDragEnd={isTop ? handleDragEnd : undefined}
      whileTap={{ cursor: "grabbing" }}
    >
      <div className="h-full bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-200 dark:border-gray-700">
        {/* Swipe Indicators */}
        {isTop && (
          <>
            {/* Like (Right) */}
            <motion.div
              className="absolute top-8 left-8 z-20 px-4 py-2 bg-green-500 text-white font-bold text-xl rounded-lg rotate-[-15deg] border-4 border-green-600"
              style={{ opacity: likeOpacity }}
            >
              ADD ✓
            </motion.div>

            {/* Nope (Left) */}
            <motion.div
              className="absolute top-8 right-8 z-20 px-4 py-2 bg-red-500 text-white font-bold text-xl rounded-lg rotate-[15deg] border-4 border-red-600"
              style={{ opacity: nopeOpacity }}
            >
              SKIP ✗
            </motion.div>

            {/* Super Like (Up) */}
            <motion.div
              className="absolute bottom-24 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-purple-500 text-white font-bold text-xl rounded-lg border-4 border-purple-600"
              style={{ opacity: superLikeOpacity }}
            >
              MUST DO ⭐
            </motion.div>

            {/* Save for Later (Down) */}
            <motion.div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 z-20 px-4 py-2 bg-blue-500 text-white font-bold text-xl rounded-lg border-4 border-blue-600"
              style={{ opacity: saveLaterOpacity }}
            >
              SAVE 📌
            </motion.div>
          </>
        )}

        {/* Activity Image */}
        <div className="relative h-48">
          <img
            src={activity.imageUrl || "/placeholder-activity.jpg"}
            alt={activity.name}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />

          {/* Score Badge */}
          <div className="absolute top-3 right-3 px-2 py-1 bg-white/90 dark:bg-gray-800/90 rounded-full flex items-center gap-1">
            <Sparkles className="w-3 h-3 text-purple-500" />
            <span className="text-xs font-medium text-gray-900 dark:text-white">
              {option.score}% match
            </span>
          </div>

          {/* Tags */}
          <div className="absolute bottom-3 left-3 flex flex-wrap gap-1">
            {hasChildren && isFamilyFriendly && (
              <span className="px-2 py-0.5 bg-green-500 text-white text-xs rounded-full">
                👨‍👩‍👧 Family
              </span>
            )}
            {activity.price?.amount === 0 && (
              <span className="px-2 py-0.5 bg-emerald-500 text-white text-xs rounded-full">
                FREE
              </span>
            )}
            {option.tags.slice(0, 2).map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 bg-white/80 text-gray-700 text-xs rounded-full"
              >
                {tag}
              </span>
            ))}
          </div>
        </div>

        {/* Activity Details */}
        <div className="p-4 space-y-3">
          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white line-clamp-1">
              {activity.name}
            </h3>
            <p className="text-sm text-gray-500 line-clamp-2 mt-1">
              {activity.description}
            </p>
          </div>

          {/* Quick Stats */}
          <div className="flex items-center gap-4 text-sm">
            {activity.rating && (
              <div className="flex items-center gap-1">
                <Star className="w-4 h-4 text-yellow-500 fill-yellow-500" />
                <span className="font-medium text-gray-900 dark:text-white">
                  {activity.rating.toFixed(1)}
                </span>
                {activity.reviewCount && (
                  <span className="text-gray-400">
                    ({activity.reviewCount})
                  </span>
                )}
              </div>
            )}
            <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
              <Clock className="w-4 h-4" />
              <span>{Math.round(activity.duration / 60)}h</span>
            </div>
            <div className="flex items-center gap-1 text-gray-600 dark:text-gray-400">
              <DollarSign className="w-4 h-4" />
              <span>${activity.price?.amount || 0}</span>
            </div>
          </div>

          {/* Commute from Previous */}
          {option.commuteFromPrevious && (
            <div className="flex items-center gap-2 p-2 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              {option.commuteFromPrevious.method === "walk" ? (
                <Footprints className="w-4 h-4 text-green-500" />
              ) : option.commuteFromPrevious.method === "transit" ? (
                <Train className="w-4 h-4 text-blue-500" />
              ) : (
                <Navigation className="w-4 h-4 text-purple-500" />
              )}
              <span className="text-xs text-gray-600 dark:text-gray-400">
                {option.commuteFromPrevious.durationMinutes} min from previous •{" "}
                {(option.commuteFromPrevious.distanceMeters / 1000).toFixed(1)}
                km
              </span>
            </div>
          )}

          {/* Score Breakdown */}
          <div className="space-y-1">
            <p className="text-xs font-medium text-gray-500">
              Why this matches:
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
              {option.explanation}
            </p>
          </div>

          {/* Warnings */}
          {option.warnings && option.warnings.length > 0 && (
            <div className="flex items-start gap-2 p-2 bg-yellow-50 dark:bg-yellow-900/20 rounded-lg">
              <Info className="w-4 h-4 text-yellow-600 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-yellow-700 dark:text-yellow-300">
                {option.warnings[0]}
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

// ============================================
// Action Buttons
// ============================================

interface ActionButtonsProps {
  onReject: () => void;
  onSaveForLater: () => void;
  onAccept: () => void;
  onMustDo: () => void;
  disabled: boolean;
}

function ActionButtons({
  onReject,
  onSaveForLater,
  onAccept,
  onMustDo,
  disabled,
}: ActionButtonsProps) {
  return (
    <div className="flex-shrink-0 px-4 py-4 bg-white dark:bg-gray-800 border-t border-gray-200 dark:border-gray-700">
      <div className="flex items-center justify-center gap-4">
        {/* Reject */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onReject}
          disabled={disabled}
          className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-900/30 text-red-500 flex items-center justify-center shadow-lg disabled:opacity-50"
        >
          <X className="w-7 h-7" />
        </motion.button>

        {/* Save for Later */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onSaveForLater}
          disabled={disabled}
          className="w-12 h-12 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-500 flex items-center justify-center shadow-lg disabled:opacity-50"
        >
          <Bookmark className="w-5 h-5" />
        </motion.button>

        {/* Must Do */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onMustDo}
          disabled={disabled}
          className="w-12 h-12 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-500 flex items-center justify-center shadow-lg disabled:opacity-50"
        >
          <Star className="w-5 h-5 fill-current" />
        </motion.button>

        {/* Accept */}
        <motion.button
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onAccept}
          disabled={disabled}
          className="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 text-green-500 flex items-center justify-center shadow-lg disabled:opacity-50"
        >
          <Check className="w-7 h-7" />
        </motion.button>
      </div>

      {/* Button Labels */}
      <div className="flex items-center justify-center gap-4 mt-2">
        <span className="text-[10px] text-gray-400 w-14 text-center">Skip</span>
        <span className="text-[10px] text-gray-400 w-12 text-center">
          Later
        </span>
        <span className="text-[10px] text-gray-400 w-12 text-center">
          Must Do
        </span>
        <span className="text-[10px] text-gray-400 w-14 text-center">Add</span>
      </div>
    </div>
  );
}

// ============================================
// Selection Complete Screen
// ============================================

interface SelectionCompleteProps {
  session: SelectionSession;
  onContinue: (session: SelectionSession) => void;
}

function SelectionComplete({ session, onContinue }: SelectionCompleteProps) {
  const { stats } = session;

  const handleContinue = () => {
    onContinue(session);
  };

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="h-full flex flex-col items-center justify-center p-8 bg-gradient-to-b from-purple-50 to-white dark:from-purple-900/20 dark:to-gray-900"
    >
      <motion.div
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{ delay: 0.2, type: "spring" }}
        className="w-24 h-24 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center mb-6"
      >
        <Sparkles className="w-12 h-12 text-white" />
      </motion.div>

      <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
        All Set! 🎉
      </h2>
      <p className="text-gray-500 text-center mb-8">
        Your itinerary is ready to go
      </p>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-4 mb-8 w-full max-w-xs">
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center shadow-sm">
          <p className="text-3xl font-bold text-purple-600">
            {stats.activitiesAccepted}
          </p>
          <p className="text-xs text-gray-500">Activities Added</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center shadow-sm">
          <p className="text-3xl font-bold text-blue-600">
            {stats.activitiesSaved}
          </p>
          <p className="text-xs text-gray-500">Saved for Later</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center shadow-sm">
          <p className="text-3xl font-bold text-green-600">
            {stats.slotsCompleted}
          </p>
          <p className="text-xs text-gray-500">Time Slots</p>
        </div>
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 text-center shadow-sm">
          <p className="text-3xl font-bold text-gray-600">
            {stats.totalSlots - stats.slotsCompleted}
          </p>
          <p className="text-xs text-gray-500">Free Slots</p>
        </div>
      </div>

      <Button variant="primary" size="lg" onClick={handleContinue}>
        <Sparkles className="w-5 h-5 mr-2" />
        View My Itinerary
      </Button>
    </motion.div>
  );
}

// ============================================
// Selection Session Hook
// ============================================

export function useSelectionSession(
  slots: SelectionSlot[],
  onPlanUpdate: (updatedSlots: SelectionSlot[]) => void
) {
  const [session, setSession] = useState<SelectionSession>(() => ({
    id: `session-${Date.now()}`,
    tripId: "",
    slots,
    currentSlotIndex: 0,
    currentOptionIndex: 0,
    swipeHistory: [],
    isComplete: false,
    stats: {
      totalSlots: slots.length,
      slotsCompleted: 0,
      activitiesAccepted: 0,
      activitiesSaved: 0,
      activitiesRejected: 0,
    },
  }));

  // Reset session when slots change (e.g., when entering swipe mode)
  useEffect(() => {
    if (slots.length > 0) {
      setSession({
        id: `session-${Date.now()}`,
        tripId: "",
        slots,
        currentSlotIndex: 0,
        currentOptionIndex: 0,
        swipeHistory: [],
        isComplete: false,
        stats: {
          totalSlots: slots.length,
          slotsCompleted: 0,
          activitiesAccepted: 0,
          activitiesSaved: 0,
          activitiesRejected: 0,
        },
      });
    }
  }, [slots]);

  // Handle swipe action
  const handleSwipe = useCallback(
    (slotId: string, optionId: string, action: SwipeAction) => {
      setSession((prev) => {
        const currentSlot = prev.slots[prev.currentSlotIndex];
        const currentOption = currentSlot?.options[prev.currentOptionIndex];

        if (!currentSlot || !currentOption) return prev;

        // Add to history
        const historyItem: SwipeHistoryItem = {
          slotId,
          optionId,
          action,
          timestamp: new Date(),
        };

        const newHistory = [...prev.swipeHistory, historyItem];

        // Update stats
        const newStats = { ...prev.stats };
        switch (action) {
          case "keep":
            newStats.activitiesAccepted++;
            break;
          case "must-do":
            newStats.activitiesAccepted++;
            break;
          case "save-for-later":
            newStats.activitiesSaved++;
            break;
          case "reject":
            newStats.activitiesRejected++;
            break;
        }

        // Determine next state
        let newSlotIndex = prev.currentSlotIndex;
        let newOptionIndex = prev.currentOptionIndex;
        let newSlots = [...prev.slots];
        let isComplete = false;

        if (action === "keep" || action === "must-do") {
          // Activity selected - move to next slot
          newSlots[prev.currentSlotIndex] = {
            ...currentSlot,
            selectedOption: currentOption,
            status: "selected",
          };
          newStats.slotsCompleted++;
          newSlotIndex++;
          newOptionIndex = 0;

          // Trigger plan update for dynamic rescoring
          setTimeout(() => onPlanUpdate(newSlots), 0);
        } else if (action === "save-for-later") {
          // Skip this option, continue with next
          newOptionIndex++;
          if (newOptionIndex >= currentSlot.options.length) {
            // No more options for this slot
            newSlots[prev.currentSlotIndex] = {
              ...currentSlot,
              status: "skipped",
            };
            newStats.slotsCompleted++;
            newSlotIndex++;
            newOptionIndex = 0;
          }
        } else {
          // Rejected - move to next option
          newOptionIndex++;
          if (newOptionIndex >= currentSlot.options.length) {
            // No more options for this slot
            newSlots[prev.currentSlotIndex] = {
              ...currentSlot,
              status: "skipped",
            };
            newStats.slotsCompleted++;
            newSlotIndex++;
            newOptionIndex = 0;
          }
        }

        // Check if session is complete
        if (newSlotIndex >= prev.slots.length) {
          isComplete = true;
        }

        return {
          ...prev,
          slots: newSlots,
          currentSlotIndex: newSlotIndex,
          currentOptionIndex: newOptionIndex,
          swipeHistory: newHistory,
          isComplete,
          stats: newStats,
        };
      });
    },
    [onPlanUpdate]
  );

  // Handle undo
  const handleUndo = useCallback(() => {
    setSession((prev) => {
      if (prev.swipeHistory.length === 0) return prev;

      const lastAction = prev.swipeHistory[prev.swipeHistory.length - 1];
      const newHistory = prev.swipeHistory.slice(0, -1);

      // Find the slot that was affected
      const affectedSlotIndex = prev.slots.findIndex(
        (s) => s.id === lastAction.slotId
      );

      if (affectedSlotIndex === -1) return prev;

      // Revert the slot
      const newSlots = [...prev.slots];
      newSlots[affectedSlotIndex] = {
        ...newSlots[affectedSlotIndex],
        selectedOption: null,
        status: "in-progress",
      };

      // Revert stats
      const newStats = { ...prev.stats };
      switch (lastAction.action) {
        case "keep":
        case "must-do":
          newStats.activitiesAccepted--;
          newStats.slotsCompleted--;
          break;
        case "save-for-later":
          newStats.activitiesSaved--;
          if (prev.slots[affectedSlotIndex].status === "skipped") {
            newStats.slotsCompleted--;
          }
          break;
        case "reject":
          newStats.activitiesRejected--;
          if (prev.slots[affectedSlotIndex].status === "skipped") {
            newStats.slotsCompleted--;
          }
          break;
      }

      // Find the option index for the affected option
      const optionIndex = newSlots[affectedSlotIndex].options.findIndex(
        (o) => o.activity.id === lastAction.optionId
      );

      return {
        ...prev,
        slots: newSlots,
        currentSlotIndex: affectedSlotIndex,
        currentOptionIndex: optionIndex >= 0 ? optionIndex : 0,
        swipeHistory: newHistory,
        isComplete: false,
        stats: newStats,
      };
    });
  }, []);

  // Handle slot complete
  const handleSlotComplete = useCallback(
    (slotId: string, selectedOption: ScoredActivityOption | null) => {
      setSession((prev) => {
        const slotIndex = prev.slots.findIndex((s) => s.id === slotId);
        if (slotIndex === -1) return prev;

        const newSlots = [...prev.slots];
        newSlots[slotIndex] = {
          ...newSlots[slotIndex],
          selectedOption,
          status: selectedOption ? "selected" : "skipped",
        };

        return {
          ...prev,
          slots: newSlots,
        };
      });
    },
    []
  );

  // Handle session complete
  const handleSessionComplete = useCallback(() => {
    // Return the final selection
    return session.slots.map((slot) => ({
      slotId: slot.id,
      selectedActivity: slot.selectedOption?.activity || null,
    }));
  }, [session.slots]);

  return {
    session,
    handleSwipe,
    handleUndo,
    handleSlotComplete,
    handleSessionComplete,
  };
}

// ============================================
// Exports
// ============================================

export type { SwipeHistoryItem, ActivitySelectionFlowProps };
