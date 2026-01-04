"use client";

import { cn } from "@/lib/utils";
import type { BudgetTier } from "@/types/trip-input";
import type { BudgetSelectorProps } from "./types";

const BUDGET_TIERS: { value: BudgetTier; label: string; icon: string }[] = [
  { value: "budget", label: "$", icon: "$" },
  { value: "moderate", label: "$$", icon: "$$" },
  { value: "luxury", label: "$$$", icon: "$$$" },
  { value: "ultra", label: "$$$$", icon: "$$$$" },
];

export function BudgetSelector({ value, onChange }: BudgetSelectorProps) {
  return (
    <div className="flex gap-1">
      {BUDGET_TIERS.map((tier) => (
        <button
          key={tier.value}
          onClick={() => onChange(tier.value)}
          className={cn(
            "px-3 py-1.5 text-sm rounded-full transition-all",
            value === tier.value
              ? "bg-purple-600 text-white"
              : "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
          )}
        >
          {tier.label}
        </button>
      ))}
    </div>
  );
}
