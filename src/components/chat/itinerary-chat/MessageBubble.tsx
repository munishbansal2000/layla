/**
 * Message Bubble Component
 *
 * Displays a single chat message with appropriate styling for user, assistant, and system messages.
 */

"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Info, CheckCircle, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { EventMessageBubble } from "./EventMessageBubble";
import type {
  MessageBubbleProps,
  ConstraintAnalysisDisplayProps,
} from "./types";

export function MessageBubble({ message, onEventAction }: MessageBubbleProps) {
  const isUser = message.role === "user";
  const isSystem = message.role === "system";

  // Format timestamp for client-side only rendering
  const [formattedTime, setFormattedTime] = useState<string>("");

  useEffect(() => {
    setFormattedTime(
      new Date(message.timestamp).toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      })
    );
  }, [message.timestamp]);

  // If this is an execution event with actions, render the interactive event bubble
  if (message.executionEvent && onEventAction) {
    return (
      <EventMessageBubble
        event={message.executionEvent}
        onAction={(action) => onEventAction(message.executionEvent!, action)}
        formattedTime={formattedTime}
      />
    );
  }

  if (isSystem) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex justify-center my-2"
      >
        <div className="px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-700 text-xs text-gray-600 dark:text-gray-300 flex items-center gap-1.5">
          <Info className="w-3 h-3" />
          {message.content}
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className={cn(
        "flex gap-2 mb-3",
        isUser ? "flex-row-reverse" : "flex-row"
      )}
    >
      {/* Avatar */}
      <div
        className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 text-white text-sm font-medium",
          isUser
            ? "bg-purple-600"
            : "bg-gradient-to-br from-purple-500 to-pink-500"
        )}
      >
        {isUser ? "U" : "L"}
      </div>

      {/* Message Content */}
      <div
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5",
          isUser
            ? "bg-purple-600 text-white"
            : "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 shadow-sm border border-gray-100 dark:border-gray-700"
        )}
      >
        <div className="whitespace-pre-wrap text-sm leading-relaxed">
          {message.content}
        </div>

        {/* Constraint Analysis */}
        {message.constraintAnalysis && (
          <ConstraintAnalysisDisplay analysis={message.constraintAnalysis} />
        )}

        {/* Applied Changes Badge */}
        {message.appliedChanges && (
          <div className="flex items-center gap-1 mt-2 text-xs text-green-600 dark:text-green-400">
            <CheckCircle className="w-3 h-3" />
            Changes applied
          </div>
        )}

        {/* Timestamp */}
        <div
          className={cn(
            "text-xs mt-1.5 opacity-60",
            isUser ? "text-right" : "text-left"
          )}
        >
          {formattedTime}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Constraint Analysis Display
 */
function ConstraintAnalysisDisplay({
  analysis,
}: ConstraintAnalysisDisplayProps) {
  if (!analysis) return null;

  const { violations, autoAdjustments } = analysis;
  if (violations.length === 0 && autoAdjustments.length === 0) return null;

  return (
    <div className="mt-2 pt-2 border-t border-gray-200 dark:border-gray-600">
      {/* Violations */}
      {violations.length > 0 && (
        <div className="space-y-1">
          {violations.map((v, i) => (
            <div
              key={i}
              className={cn(
                "text-xs flex items-start gap-1.5 p-1.5 rounded",
                v.severity === "error" &&
                  "bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300",
                v.severity === "warning" &&
                  "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300",
                v.severity === "info" &&
                  "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300"
              )}
            >
              <AlertTriangle className="w-3 h-3 flex-shrink-0 mt-0.5" />
              <div>
                <span className="font-medium capitalize">{v.layer}:</span>{" "}
                {v.message}
                {v.resolution && (
                  <span className="block text-[10px] opacity-80 mt-0.5">
                    💡 {v.resolution}
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Auto-adjustments */}
      {autoAdjustments.length > 0 && (
        <div className="mt-1.5 text-xs text-gray-600 dark:text-gray-400">
          <span className="font-medium">Auto-adjusted:</span>
          <ul className="list-disc list-inside mt-0.5">
            {autoAdjustments.map((adj, i) => (
              <li key={i}>{adj.adjustment}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
