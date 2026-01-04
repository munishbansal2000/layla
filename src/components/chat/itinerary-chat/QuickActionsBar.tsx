/**
 * Quick Actions Bar Component
 *
 * Displays a row of quick action buttons for common itinerary operations.
 */

"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { QuickActionsBarProps } from "./types";

export function QuickActionsBar({ actions, onExecute }: QuickActionsBarProps) {
  if (actions.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
      <span className="text-xs text-gray-500 dark:text-gray-400 self-center mr-1">
        Quick actions:
      </span>
      {actions.map((action) => (
        <motion.button
          key={action.id}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={() => onExecute(action.action)}
          className={cn(
            "px-2.5 py-1 text-xs rounded-full transition-colors",
            action.isPrimary
              ? "bg-purple-600 text-white hover:bg-purple-700"
              : "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:border-purple-400"
          )}
          title={action.description}
        >
          {action.label}
        </motion.button>
      ))}
    </div>
  );
}
