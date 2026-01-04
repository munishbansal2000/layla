/**
 * Clarification Panel Component
 *
 * Displays clarifying questions with option buttons for the user to answer.
 */

"use client";

import { motion } from "framer-motion";
import { Button } from "@/components/ui/Button";
import type { ClarificationPanelProps } from "./types";

export function ClarificationPanel({
  question,
  onAnswer,
}: ClarificationPanelProps) {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="px-4 py-3 bg-blue-50 dark:bg-blue-900/20 border-t border-blue-200 dark:border-blue-800"
    >
      <p className="text-sm text-blue-800 dark:text-blue-200 mb-2">
        {question.question}
      </p>
      <div className="flex flex-wrap gap-2">
        {question.options.map((option, i) => (
          <Button
            key={i}
            variant="secondary"
            size="sm"
            onClick={() => onAnswer(option.value)}
            className="text-xs"
          >
            {option.label}
          </Button>
        ))}
      </div>
    </motion.div>
  );
}
