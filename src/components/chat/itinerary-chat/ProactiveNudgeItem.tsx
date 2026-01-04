/**
 * Proactive Nudge Item Component
 *
 * Displays a single proactive suggestion or alert.
 */

"use client";

import { motion } from "framer-motion";
import { Lightbulb, AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ProactiveNudgeItemProps } from "./types";

export function ProactiveNudgeItem({
  nudge,
  index,
  onDismiss,
  onExecute,
}: ProactiveNudgeItemProps) {
  const iconMap = {
    pacing: Lightbulb,
    weather: AlertTriangle,
    cluster: Info,
    conflict: AlertTriangle,
    booking: Info,
  };
  const Icon = iconMap[nudge.type] || Lightbulb;

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className={cn(
        "flex items-start gap-2 p-2.5 rounded-lg text-xs",
        nudge.type === "conflict" || nudge.type === "weather"
          ? "bg-amber-50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200"
          : "bg-purple-50 dark:bg-purple-900/20 text-purple-800 dark:text-purple-200"
      )}
    >
      <Icon className="w-4 h-4 flex-shrink-0 mt-0.5" />
      <div className="flex-1">
        <p>{nudge.message}</p>
        {nudge.suggestedAction && onExecute && (
          <button
            onClick={() => onExecute(nudge.suggestedAction)}
            className="mt-1 text-[10px] underline hover:no-underline"
          >
            Apply suggestion
          </button>
        )}
      </div>
      <button
        onClick={() => onDismiss(index)}
        className="text-gray-400 hover:text-gray-600"
      >
        <X className="w-3 h-3" />
      </button>
    </motion.div>
  );
}
