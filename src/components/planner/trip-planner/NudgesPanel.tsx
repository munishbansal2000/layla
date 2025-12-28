"use client";

import { motion } from "framer-motion";
import { AlertTriangle, Info, X } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Nudge } from "./types";

interface NudgesPanelProps {
  nudges: Nudge[];
  onDismiss: (id: string) => void;
}

export function NudgesPanel({ nudges, onDismiss }: NudgesPanelProps) {
  const getPriorityStyles = (priority: Nudge["priority"]) => {
    switch (priority) {
      case "critical":
        return "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800";
      case "important":
        return "bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800";
      default:
        return "bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800";
    }
  };

  const getPriorityIcon = (priority: Nudge["priority"]) => {
    switch (priority) {
      case "critical":
        return <AlertTriangle className="w-4 h-4 text-red-500" />;
      case "important":
        return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
      default:
        return <Info className="w-4 h-4 text-blue-500" />;
    }
  };

  if (nudges.length === 0) {
    return null;
  }

  return (
    <div className="flex-shrink-0 p-2 space-y-2 border-b border-gray-200 dark:border-gray-700">
      {nudges.map((nudge) => (
        <motion.div
          key={nudge.id}
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          className={cn(
            "p-2 rounded-lg border flex items-start gap-2",
            getPriorityStyles(nudge.priority)
          )}
        >
          {getPriorityIcon(nudge.priority)}
          <div className="flex-1 min-w-0">
            <p className="text-xs font-medium text-gray-900 dark:text-white">
              {nudge.title}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-400">
              {nudge.body}
            </p>
          </div>
          {nudge.dismissable && (
            <button
              onClick={() => onDismiss(nudge.id)}
              className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </motion.div>
      ))}
    </div>
  );
}
