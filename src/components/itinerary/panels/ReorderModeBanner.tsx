/**
 * Reorder Mode Banner Component
 *
 * Displays a banner when drag-and-drop reorder mode is active.
 */

"use client";

import { motion } from "framer-motion";
import { GripVertical } from "lucide-react";

export function ReorderModeBanner() {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      className="mb-4 p-3 bg-purple-50 dark:bg-purple-900/20 rounded-lg flex items-center gap-2"
    >
      <GripVertical className="w-5 h-5 text-purple-500" />
      <div>
        <p className="text-sm font-medium text-purple-700 dark:text-purple-300">
          Drag & Drop Mode
        </p>
        <p className="text-xs text-purple-600 dark:text-purple-400">
          Drag days or activities to reorder. Click &quot;Done&quot; when
          finished.
        </p>
      </div>
    </motion.div>
  );
}
