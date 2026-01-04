/**
 * Change Preview Panel Component
 *
 * Displays a preview of proposed changes with confirm/reject buttons.
 */

"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { CheckCircle, XCircle, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/Button";
import type { ChangePreviewPanelProps } from "./types";

export function ChangePreviewPanel({
  preview,
  onConfirm,
  onReject,
}: ChangePreviewPanelProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20 border-t border-amber-200 dark:border-amber-800"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Proposed Changes
          </p>
          <p className="text-xs text-amber-700 dark:text-amber-300 mt-0.5">
            {preview.description}
          </p>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-amber-600 hover:text-amber-700"
        >
          <ChevronDown
            className={cn(
              "w-4 h-4 transition-transform",
              expanded && "rotate-180"
            )}
          />
        </button>
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-2 pt-2 border-t border-amber-200 dark:border-amber-700 text-xs"
          >
            <div className="grid grid-cols-2 gap-2 text-amber-800 dark:text-amber-200">
              <div>
                <span className="font-medium">Before:</span>
                <p className="mt-0.5 opacity-80">{preview.beforeSummary}</p>
              </div>
              <div>
                <span className="font-medium">After:</span>
                <p className="mt-0.5 opacity-80">{preview.afterSummary}</p>
              </div>
            </div>
            <div className="mt-2 flex items-center gap-3 text-[10px] text-amber-600 dark:text-amber-400">
              <span>
                Travel time: {preview.impact.travelTimeChange > 0 ? "+" : ""}
                {preview.impact.travelTimeChange}min
              </span>
              <span>Risk: {preview.impact.riskLevel}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="flex gap-2 mt-3">
        <Button
          variant="primary"
          size="sm"
          onClick={onConfirm}
          className="flex-1 text-xs"
        >
          <CheckCircle className="w-3 h-3 mr-1" />
          Apply Changes
        </Button>
        <Button
          variant="secondary"
          size="sm"
          onClick={onReject}
          className="text-xs"
        >
          <XCircle className="w-3 h-3 mr-1" />
          Discard
        </Button>
      </div>
    </motion.div>
  );
}
