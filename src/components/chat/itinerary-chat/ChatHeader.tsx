/**
 * Chat Header Component
 *
 * Displays the chat panel header with undo/redo buttons.
 */

"use client";

import { MessageSquare, Undo2, Redo2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatHeaderProps } from "./types";

export function ChatHeader({
  canUndo,
  canRedo,
  onUndo,
  onRedo,
}: ChatHeaderProps) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-purple-600" />
        <h3 className="text-sm font-medium text-gray-900 dark:text-gray-100">
          Itinerary Assistant
        </h3>
      </div>
      <div className="flex items-center gap-1">
        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={cn(
            "p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
            !canUndo && "opacity-40 cursor-not-allowed"
          )}
          title="Undo"
        >
          <Undo2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        </button>
        <button
          onClick={onRedo}
          disabled={!canRedo}
          className={cn(
            "p-1.5 rounded hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors",
            !canRedo && "opacity-40 cursor-not-allowed"
          )}
          title="Redo"
        >
          <Redo2 className="w-4 h-4 text-gray-600 dark:text-gray-400" />
        </button>
      </div>
    </div>
  );
}
