/**
 * Impact Panel Component
 *
 * Displays validation issues and impact analysis for itinerary changes.
 */

"use client";

import { motion } from "framer-motion";
import {
  Clock,
  Calendar,
  Check,
  AlertTriangle,
  AlertCircle,
  Info,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { ValidationIssue } from "../types";

interface ImpactData {
  totalCommuteChange: number;
  affectedDays: number[];
}

interface ImpactPanelProps {
  validationIssues: ValidationIssue[];
  impact: ImpactData | null;
  onClose: () => void;
}

export function ImpactPanel({
  validationIssues,
  impact,
  onClose,
}: ImpactPanelProps) {
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
            <AlertTriangle className="w-4 h-4 text-amber-500" />
            Validation & Impact
          </h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            ✕
          </button>
        </div>

        {/* Impact Summary */}
        {impact && (
          <div className="mb-4 p-3 bg-gray-50 dark:bg-gray-900/50 rounded-lg">
            <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Changes from Original
            </h4>
            <div className="flex flex-wrap gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-400" />
                <span
                  className={cn(
                    impact.totalCommuteChange > 0
                      ? "text-red-600 dark:text-red-400"
                      : impact.totalCommuteChange < 0
                      ? "text-green-600 dark:text-green-400"
                      : "text-gray-600 dark:text-gray-400"
                  )}
                >
                  Commute: {impact.totalCommuteChange > 0 ? "+" : ""}
                  {impact.totalCommuteChange} min
                </span>
              </div>
              {impact.affectedDays.length > 0 && (
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-gray-400" />
                  <span className="text-gray-600 dark:text-gray-400">
                    {impact.affectedDays.length} days affected
                  </span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Validation Issues List */}
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {validationIssues.length === 0 ? (
            <div className="text-center py-4 text-gray-500 dark:text-gray-400">
              <Check className="w-6 h-6 mx-auto mb-2 text-green-500" />
              <p className="text-sm">No issues found!</p>
            </div>
          ) : (
            validationIssues.map((issue, index) => (
              <ValidationIssueItem key={index} issue={issue} />
            ))
          )}
        </div>
      </div>
    </motion.div>
  );
}

/**
 * Individual validation issue item
 */
function ValidationIssueItem({ issue }: { issue: ValidationIssue }) {
  return (
    <div
      className={cn(
        "p-3 rounded-lg flex items-start gap-3",
        issue.type === "error" &&
          "bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800",
        issue.type === "warning" &&
          "bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800",
        issue.type === "info" &&
          "bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800"
      )}
    >
      {issue.type === "error" && (
        <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
      )}
      {issue.type === "warning" && (
        <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
      )}
      {issue.type === "info" && (
        <Info className="w-4 h-4 text-blue-500 flex-shrink-0 mt-0.5" />
      )}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "font-medium text-sm",
              issue.type === "error" && "text-red-700 dark:text-red-300",
              issue.type === "warning" && "text-amber-700 dark:text-amber-300",
              issue.type === "info" && "text-blue-700 dark:text-blue-300"
            )}
          >
            {issue.message}
          </span>
          {issue.dayNumber && (
            <span className="text-xs px-1.5 py-0.5 bg-white dark:bg-gray-800 rounded text-gray-500 dark:text-gray-400">
              Day {issue.dayNumber}
            </span>
          )}
        </div>
        {issue.details && (
          <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
            {issue.details}
          </p>
        )}
      </div>
    </div>
  );
}
