/**
 * Event Message Bubble Component
 *
 * Interactive message bubble for execution events with action buttons.
 */

"use client";

import { motion } from "framer-motion";
import { SkipForward, Timer, Navigation } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  getEventIcon,
  getEventStyle,
  getActionButtonStyle,
} from "./event-utils";
import type { EventMessageBubbleProps } from "./types";

export function EventMessageBubble({
  event,
  onAction,
  formattedTime,
}: EventMessageBubbleProps) {
  const Icon = getEventIcon(event.type);
  const styleClass = getEventStyle(event);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="flex gap-2 mb-3"
    >
      {/* Avatar */}
      <div className="w-8 h-8 rounded-full bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center text-white text-sm font-medium flex-shrink-0">
        L
      </div>

      {/* Event Card */}
      <div
        className={cn("max-w-[85%] rounded-2xl px-4 py-3 border", styleClass)}
      >
        {/* Header */}
        <div className="flex items-center gap-2 mb-2">
          <Icon className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          <span className="font-medium text-sm text-gray-900 dark:text-gray-100">
            {event.title}
          </span>
        </div>

        {/* Message */}
        <p className="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
          {event.message}
        </p>

        {/* Tip */}
        {event.tip && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-2 italic">
            💡 {event.tip}
          </p>
        )}

        {/* Action Buttons */}
        {event.actions && event.actions.length > 0 && onAction && (
          <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t border-gray-200 dark:border-gray-600">
            {event.actions.map((action) => (
              <motion.button
                key={action.id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => onAction(action)}
                className={cn(
                  "px-3 py-1.5 text-xs rounded-lg font-medium transition-colors",
                  getActionButtonStyle(action.variant)
                )}
              >
                {action.type === "skip" && (
                  <SkipForward className="w-3 h-3 inline mr-1" />
                )}
                {action.type === "extend" && (
                  <Timer className="w-3 h-3 inline mr-1" />
                )}
                {action.type === "navigate" && (
                  <Navigation className="w-3 h-3 inline mr-1" />
                )}
                {action.label}
              </motion.button>
            ))}
          </div>
        )}

        {/* Timestamp */}
        <div className="text-xs mt-2 opacity-60 text-left">{formattedTime}</div>
      </div>
    </motion.div>
  );
}
