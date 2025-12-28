"use client";

import { motion } from "framer-motion";
import { Battery, BatteryLow, BatteryMedium, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type { EnergyLevel } from "./types";

// ============================================
// Energy Check-In Bar
// ============================================

interface EnergyCheckInBarProps {
  energyLevel: EnergyLevel;
  onCheckIn: () => void;
}

export function EnergyCheckInBar({
  energyLevel,
  onCheckIn,
}: EnergyCheckInBarProps) {
  const getEnergyIcon = () => {
    switch (energyLevel) {
      case "high":
        return <Battery className="w-4 h-4 text-green-500" />;
      case "okay":
        return <BatteryMedium className="w-4 h-4 text-yellow-500" />;
      case "low":
        return <BatteryLow className="w-4 h-4 text-red-500" />;
    }
  };

  const getEnergyLabel = () => {
    switch (energyLevel) {
      case "high":
        return "Feeling energetic";
      case "okay":
        return "Doing okay";
      case "low":
        return "Getting tired";
    }
  };

  return (
    <button
      onClick={onCheckIn}
      className="flex-shrink-0 mx-4 my-2 p-2 bg-gradient-to-r from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 rounded-lg flex items-center justify-between hover:opacity-80 transition-opacity"
    >
      <div className="flex items-center gap-2">
        {getEnergyIcon()}
        <span className="text-xs text-gray-600 dark:text-gray-400">
          {getEnergyLabel()}
        </span>
      </div>
      <div className="flex items-center gap-1 text-xs text-purple-600 dark:text-purple-400">
        <RefreshCw className="w-3 h-3" />
        Update
      </div>
    </button>
  );
}

// ============================================
// Energy Check-In Modal
// ============================================

interface EnergyCheckInModalProps {
  currentLevel: EnergyLevel;
  onSubmit: (level: EnergyLevel) => void;
  onClose: () => void;
}

export function EnergyCheckInModal({
  currentLevel,
  onSubmit,
  onClose,
}: EnergyCheckInModalProps) {
  const energyLevels: {
    value: EnergyLevel;
    label: string;
    emoji: string;
    description: string;
  }[] = [
    {
      value: "high",
      label: "Energetic",
      emoji: "⚡",
      description: "Ready for more adventures!",
    },
    {
      value: "okay",
      label: "Okay",
      emoji: "😊",
      description: "Can continue at moderate pace",
    },
    {
      value: "low",
      label: "Tired",
      emoji: "😴",
      description: "Need to slow down or rest",
    },
  ];

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        className="bg-white dark:bg-gray-800 rounded-xl p-4 w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
          How are you feeling?
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          We&apos;ll adjust your remaining activities accordingly
        </p>

        <div className="space-y-2">
          {energyLevels.map((level) => (
            <button
              key={level.value}
              onClick={() => onSubmit(level.value)}
              className={cn(
                "w-full p-3 rounded-lg flex items-center gap-3 transition-colors",
                currentLevel === level.value
                  ? "bg-purple-100 dark:bg-purple-900/30 border-2 border-purple-500"
                  : "bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 border-2 border-transparent"
              )}
            >
              <span className="text-2xl">{level.emoji}</span>
              <div className="text-left">
                <span className="text-sm font-medium text-gray-900 dark:text-white block">
                  {level.label}
                </span>
                <span className="text-xs text-gray-500">
                  {level.description}
                </span>
              </div>
            </button>
          ))}
        </div>

        <Button
          variant="ghost"
          size="sm"
          className="w-full mt-4"
          onClick={onClose}
        >
          Cancel
        </Button>
      </motion.div>
    </motion.div>
  );
}
