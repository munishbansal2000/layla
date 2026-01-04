/**
 * Hook for managing itinerary undo/redo history
 */

import { useState, useCallback } from "react";
import type { StructuredItineraryData } from "@/types/structured-itinerary";
import type { HistoryEntry } from "@/utils/itinerary-validation";
import { formatTimeAgo } from "@/utils/itinerary-helpers";

const MAX_HISTORY_SIZE = 10;

interface UseItineraryHistoryReturn {
  history: HistoryEntry[];
  redoStack: HistoryEntry[];
  saveToHistory: (description: string, itinerary: StructuredItineraryData) => void;
  undo: (currentItinerary: StructuredItineraryData) => StructuredItineraryData | null;
  redo: (currentItinerary: StructuredItineraryData) => StructuredItineraryData | null;
  clearHistory: () => void;
  canUndo: boolean;
  canRedo: boolean;
  lastChange: HistoryEntry | null;
  formatTimeAgo: (timestamp: number) => string;
}

export function useItineraryHistory(): UseItineraryHistoryReturn {
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [redoStack, setRedoStack] = useState<HistoryEntry[]>([]);

  const saveToHistory = useCallback(
    (description: string, itinerary: StructuredItineraryData) => {
      setHistory((prev) => [
        ...prev.slice(-(MAX_HISTORY_SIZE - 1)),
        {
          timestamp: Date.now(),
          itinerary: JSON.parse(JSON.stringify(itinerary)),
          description,
        },
      ]);
      // Clear redo stack when new changes are made
      setRedoStack([]);
    },
    []
  );

  const undo = useCallback(
    (currentItinerary: StructuredItineraryData): StructuredItineraryData | null => {
      if (history.length === 0) return null;

      const lastEntry = history[history.length - 1];

      // Save current state to redo stack
      setRedoStack((prev) => [
        ...prev.slice(-(MAX_HISTORY_SIZE - 1)),
        {
          timestamp: Date.now(),
          itinerary: JSON.parse(JSON.stringify(currentItinerary)),
          description: `Undo: ${lastEntry.description}`,
        },
      ]);

      // Remove from history
      setHistory((prev) => prev.slice(0, -1));

      return lastEntry.itinerary;
    },
    [history]
  );

  const redo = useCallback(
    (currentItinerary: StructuredItineraryData): StructuredItineraryData | null => {
      if (redoStack.length === 0) return null;

      const lastRedo = redoStack[redoStack.length - 1];

      // Save current state to history
      setHistory((prev) => [
        ...prev.slice(-(MAX_HISTORY_SIZE - 1)),
        {
          timestamp: Date.now(),
          itinerary: JSON.parse(JSON.stringify(currentItinerary)),
          description: `Redo: ${lastRedo.description}`,
        },
      ]);

      // Remove from redo stack
      setRedoStack((prev) => prev.slice(0, -1));

      return lastRedo.itinerary;
    },
    [redoStack]
  );

  const clearHistory = useCallback(() => {
    setHistory([]);
    setRedoStack([]);
  }, []);

  return {
    history,
    redoStack,
    saveToHistory,
    undo,
    redo,
    clearHistory,
    canUndo: history.length > 0,
    canRedo: redoStack.length > 0,
    lastChange: history.length > 0 ? history[history.length - 1] : null,
    formatTimeAgo,
  };
}
