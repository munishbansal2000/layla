/**
 * Itinerary Header Component
 *
 * Displays the itinerary title, stats, and control buttons.
 */

"use client";

import {
  Calendar,
  Wallet,
  GripVertical,
  List,
  LayoutGrid,
  Undo2,
  MapPin,
  AlertTriangle,
  AlertCircle,
  Info,
  Shield,
  ShieldAlert,
  ShieldCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { StructuredItineraryData } from "@/types/structured-itinerary";
import type { ViewMode, HealthStatus, ValidationIssue } from "../types";
import type { HistoryEntry } from "@/utils/itinerary-validation";

interface ItineraryHeaderProps {
  itinerary: StructuredItineraryData;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  isReorderMode: boolean;
  onReorderModeChange: (enabled: boolean) => void;
  enableReordering: boolean;
  showStickyMap: boolean;
  onShowStickyMapChange: (show: boolean) => void;
  showImpactPanel: boolean;
  onShowImpactPanelChange: (show: boolean) => void;
  showHistoryPanel: boolean;
  onShowHistoryPanelChange: (show: boolean) => void;
  history: HistoryEntry[];
  onUndo: () => void;
  validationIssues: ValidationIssue[];
  healthScore?: number;
  healthStatus?: HealthStatus;
  healthSummary?: string;
  topIssues?: string[];
}

export function ItineraryHeader({
  itinerary,
  viewMode,
  onViewModeChange,
  isReorderMode,
  onReorderModeChange,
  enableReordering,
  showStickyMap,
  onShowStickyMapChange,
  showImpactPanel,
  onShowImpactPanelChange,
  showHistoryPanel,
  onShowHistoryPanelChange,
  history,
  onUndo,
  validationIssues,
  healthScore,
  healthStatus,
  healthSummary,
  topIssues = [],
}: ItineraryHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            {itinerary.destination}
          </h2>
          {itinerary.country && (
            <p className="text-gray-500 dark:text-gray-400">
              {itinerary.country}
            </p>
          )}
        </div>

        {/* View Mode Toggle & Controls */}
        <div className="flex items-center gap-2">
          {/* Health Score Badge */}
          {healthStatus && (
            <HealthBadge
              score={healthScore}
              status={healthStatus}
              summary={healthSummary}
              topIssues={topIssues}
            />
          )}

          {/* Undo Button */}
          {history.length > 0 && (
            <div className="flex items-center gap-1">
              <button
                onClick={onUndo}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 rounded-lg text-sm font-medium hover:bg-gray-200 dark:hover:bg-gray-700 transition-all"
                title={`Undo: ${history[history.length - 1]?.description}`}
              >
                <Undo2 className="w-4 h-4" />
                Undo
              </button>
              <button
                onClick={() => onShowHistoryPanelChange(!showHistoryPanel)}
                className={cn(
                  "flex items-center gap-1 px-2 py-1.5 rounded-lg text-sm transition-all",
                  showHistoryPanel
                    ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                    : "bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
                )}
                title="View change history"
              >
                <span className="text-xs">{history.length}</span>
              </button>
            </div>
          )}

          {/* Sticky Map Toggle (only in list mode) */}
          {viewMode === "list" && (
            <button
              onClick={() => onShowStickyMapChange(!showStickyMap)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                showStickyMap
                  ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              )}
            >
              <MapPin className="w-4 h-4" />
              Map
            </button>
          )}

          {/* Impact Panel Toggle */}
          {validationIssues.length > 0 && (
            <button
              onClick={() => onShowImpactPanelChange(!showImpactPanel)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                validationIssues.some((i) => i.type === "error")
                  ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
                  : validationIssues.some((i) => i.type === "warning")
                  ? "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
              )}
            >
              {validationIssues.some((i) => i.type === "error") ? (
                <AlertCircle className="w-4 h-4" />
              ) : validationIssues.some((i) => i.type === "warning") ? (
                <AlertTriangle className="w-4 h-4" />
              ) : (
                <Info className="w-4 h-4" />
              )}
              {validationIssues.length}{" "}
              {validationIssues.length === 1 ? "issue" : "issues"}
            </button>
          )}

          {/* View Mode Toggle */}
          <ViewModeToggle viewMode={viewMode} onChange={onViewModeChange} />

          {/* Reorder Toggle (only in list mode) */}
          {enableReordering && viewMode === "list" && (
            <button
              onClick={() => onReorderModeChange(!isReorderMode)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all",
                isReorderMode
                  ? "bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-700"
              )}
            >
              <GripVertical className="w-4 h-4" />
              {isReorderMode ? "Done" : "Reorder"}
            </button>
          )}
        </div>
      </div>

      {/* Stats */}
      <div className="flex flex-wrap items-center gap-4 mt-3 text-sm text-gray-600 dark:text-gray-400">
        <span className="flex items-center gap-1">
          <Calendar className="w-4 h-4" />
          {itinerary.days.length} days
        </span>
        {itinerary.estimatedBudget && (
          <span className="flex items-center gap-1">
            <Wallet className="w-4 h-4" />${itinerary.estimatedBudget.total.min}{" "}
            - ${itinerary.estimatedBudget.total.max}
          </span>
        )}
      </div>
    </div>
  );
}

/**
 * Health score badge component
 */
function HealthBadge({
  score,
  status,
  summary,
  topIssues,
}: {
  score?: number;
  status: HealthStatus;
  summary?: string;
  topIssues: string[];
}) {
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium",
        status === "excellent" &&
          "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300",
        status === "good" &&
          "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300",
        status === "fair" &&
          "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300",
        status === "poor" &&
          "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300"
      )}
      title={`${summary || ""}${
        topIssues.length > 0 ? `\n• ${topIssues.join("\n• ")}` : ""
      }`}
    >
      {status === "excellent" && <ShieldCheck className="w-4 h-4" />}
      {status === "good" && <Shield className="w-4 h-4" />}
      {status === "fair" && <ShieldAlert className="w-4 h-4" />}
      {status === "poor" && <AlertCircle className="w-4 h-4" />}
      <span>{score}</span>
    </div>
  );
}

/**
 * View mode toggle component
 */
function ViewModeToggle({
  viewMode,
  onChange,
}: {
  viewMode: ViewMode;
  onChange: (mode: ViewMode) => void;
}) {
  return (
    <div className="flex bg-gray-100 dark:bg-gray-800 rounded-lg p-1">
      <button
        onClick={() => onChange("tabbed")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
          viewMode === "tabbed"
            ? "bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm"
            : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        )}
      >
        <LayoutGrid className="w-4 h-4" />
        Tabs
      </button>
      <button
        onClick={() => onChange("list")}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-all",
          viewMode === "list"
            ? "bg-white dark:bg-gray-700 text-purple-600 dark:text-purple-400 shadow-sm"
            : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        )}
      >
        <List className="w-4 h-4" />
        List
      </button>
    </div>
  );
}
