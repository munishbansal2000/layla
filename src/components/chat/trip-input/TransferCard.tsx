"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  ChevronDown,
  ChevronUp,
  Train,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { InferredTransfer, TransferOption } from "@/types/trip-input";

interface TransferCardProps {
  transfer: InferredTransfer;
}

interface TransferOptionRowProps {
  option: TransferOption;
}

function TransferOptionRow({ option }: TransferOptionRowProps) {
  return (
    <div
      className={cn(
        "flex items-center justify-between p-2 rounded text-xs",
        option.recommended
          ? "bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800"
          : "bg-white dark:bg-gray-700"
      )}
    >
      <div className="flex items-center gap-2">
        <Train className="w-3 h-3 text-gray-500" />
        <div>
          <div className="font-medium">{option.name}</div>
          <div className="text-gray-500">{option.duration} min</div>
        </div>
      </div>
      <div className="text-right">
        {option.cost && (
          <div className="font-medium">
            {option.cost.currency === "JPY" ? "¥" : "$"}
            {option.cost.amount.toLocaleString()}
          </div>
        )}
        {option.recommended && (
          <div className="text-purple-600 text-[10px]">Recommended</div>
        )}
      </div>
    </div>
  );
}

export function TransferCard({ transfer }: TransferCardProps) {
  const [expanded, setExpanded] = useState(false);

  const statusIcon = {
    needs_input: <AlertTriangle className="w-4 h-4 text-amber-500" />,
    suggested: <Clock className="w-4 h-4 text-blue-500" />,
    booked: <CheckCircle className="w-4 h-4 text-green-500" />,
    conflict: <AlertTriangle className="w-4 h-4 text-red-500" />,
  };

  return (
    <div
      className={cn(
        "p-3 rounded-lg border text-sm",
        transfer.status === "conflict"
          ? "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800"
          : transfer.status === "booked"
          ? "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800"
          : "bg-gray-50 dark:bg-gray-800 border-gray-200 dark:border-gray-700"
      )}
    >
      <div className="flex items-center gap-2">
        {statusIcon[transfer.status]}
        <div className="flex-1">
          <div className="font-medium">
            {transfer.from.city} → {transfer.to.city}
          </div>
          <div className="text-xs text-gray-500">
            {transfer.from.name || transfer.from.type} to{" "}
            {transfer.to.name || transfer.to.type}
          </div>
        </div>
        {transfer.options.length > 0 && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="p-1 text-gray-400 hover:text-gray-600"
          >
            {expanded ? (
              <ChevronUp className="w-4 h-4" />
            ) : (
              <ChevronDown className="w-4 h-4" />
            )}
          </button>
        )}
      </div>

      {transfer.conflict && (
        <div className="mt-2 text-xs text-red-600 dark:text-red-400">
          ⚠️ {transfer.conflict}
        </div>
      )}

      {expanded && transfer.options.length > 0 && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-3 space-y-2"
        >
          {transfer.options.map((option) => (
            <TransferOptionRow key={option.id} option={option} />
          ))}
        </motion.div>
      )}
    </div>
  );
}
