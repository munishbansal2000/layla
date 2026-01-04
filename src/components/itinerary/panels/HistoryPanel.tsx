/**
 * History Panel Component
 *
 * Displays the change history timeline with undo capabilities.
 */

"use client";

import { motion } from "framer-motion";
import { Undo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { HistoryEntry } from "@/utils/itinerary-validation";

interface HistoryPanelProps {
  history: HistoryEntry[];
  onUndo: () => void;
  onClearHistory: () => void;
  onClose: () => void;
  formatTimeAgo: (timestamp: number) => string;
}

export function HistoryPanel({
  history,
  onUndo,
  onClearHistory,
  onClose,
  formatTimeAgo,
}: HistoryPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="mb-4"
    >
      <div className="p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <Undo2 className="w-4 h-4 text-purple-500" />
            Change History
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        {/* History Timeline */}
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {history
            .slice()
            .reverse()
            .map((entry, index) => {
              const isLatest = index === 0;
              const timeAgo = formatTimeAgo(entry.timestamp);

              return (
                <HistoryEntryItem
                  key={entry.timestamp}
                  entry={entry}
                  isLatest={isLatest}
                  timeAgo={timeAgo}
                  onUndo={onUndo}
                />
              );
            })}
        </div>

        {/* Clear History */}
        {history.length > 0 && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 flex justify-between items-center">
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {history.length} change{history.length !== 1 ? "s" : ""} recorded
            </span>
            <button
              onClick={onClearHistory}
              className="text-xs text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
            >
              Clear history
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Individual history entry item
 */
function HistoryEntryItem({
  entry,
  isLatest,
  timeAgo,
  onUndo,
}: {
  entry: HistoryEntry;
  isLatest: boolean;
  timeAgo: string;
  onUndo: () => void;
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-3 p-2 rounded-lg",
        isLatest
          ? "bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-700"
          : "bg-gray-50 dark:bg-gray-900/50"
      )}
    >
      <div
        className={cn(
          "w-2 h-2 rounded-full flex-shrink-0",
          isLatest ? "bg-purple-500" : "bg-gray-300 dark:bg-gray-600"
        )}
      />
      <div className="flex-1 min-w-0">
        <span
          className={cn(
            "text-sm",
            isLatest
              ? "text-purple-700 dark:text-purple-300 font-medium"
              : "text-gray-600 dark:text-gray-400"
          )}
        >
          {entry.description}
        </span>
      </div>
      <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
        {timeAgo}
      </span>
      {isLatest && (
        <button
          onClick={onUndo}
          className="px-2 py-1 text-xs bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 rounded hover:bg-purple-200 dark:hover:bg-purple-800/30 transition-colors"
        >
          Undo
        </button>
      )}
    </div>
  );
}
