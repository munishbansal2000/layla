"use client";

import React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  Clock,
  AlertTriangle,
  AlertCircle,
  CheckCircle2,
  Zap,
} from "lucide-react";
import type { ScheduleStatus } from "@/types/reshuffling";

// ============================================
// STATUS BADGE COMPONENT
// ============================================

interface StatusBadgeProps {
  status: ScheduleStatus;
  delayMinutes?: number;
  showIcon?: boolean;
  showLabel?: boolean;
  size?: "sm" | "md" | "lg";
  animate?: boolean;
  onClick?: () => void;
  className?: string;
}

const statusConfig: Record<
  ScheduleStatus,
  {
    label: string;
    icon: React.ElementType;
    bgColor: string;
    textColor: string;
    borderColor: string;
    pulseColor: string;
  }
> = {
  on_track: {
    label: "On Track",
    icon: CheckCircle2,
    bgColor: "bg-green-100 dark:bg-green-900/30",
    textColor: "text-green-700 dark:text-green-400",
    borderColor: "border-green-200 dark:border-green-800",
    pulseColor: "bg-green-400",
  },
  minor_delay: {
    label: "Slight Delay",
    icon: Clock,
    bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
    textColor: "text-yellow-700 dark:text-yellow-400",
    borderColor: "border-yellow-200 dark:border-yellow-800",
    pulseColor: "bg-yellow-400",
  },
  needs_attention: {
    label: "Needs Attention",
    icon: AlertTriangle,
    bgColor: "bg-orange-100 dark:bg-orange-900/30",
    textColor: "text-orange-700 dark:text-orange-400",
    borderColor: "border-orange-200 dark:border-orange-800",
    pulseColor: "bg-orange-400",
  },
  critical: {
    label: "Critical",
    icon: AlertCircle,
    bgColor: "bg-red-100 dark:bg-red-900/30",
    textColor: "text-red-700 dark:text-red-400",
    borderColor: "border-red-200 dark:border-red-800",
    pulseColor: "bg-red-400",
  },
};

const sizeConfig = {
  sm: {
    padding: "px-2 py-0.5",
    text: "text-xs",
    icon: "h-3 w-3",
    gap: "gap-1",
  },
  md: {
    padding: "px-2.5 py-1",
    text: "text-sm",
    icon: "h-4 w-4",
    gap: "gap-1.5",
  },
  lg: {
    padding: "px-3 py-1.5",
    text: "text-base",
    icon: "h-5 w-5",
    gap: "gap-2",
  },
};

export function StatusBadge({
  status,
  delayMinutes,
  showIcon = true,
  showLabel = true,
  size = "md",
  animate = true,
  onClick,
  className,
}: StatusBadgeProps) {
  const config = statusConfig[status];
  const sizeStyles = sizeConfig[size];
  const Icon = config.icon;

  const shouldPulse =
    animate && (status === "needs_attention" || status === "critical");

  return (
    <motion.button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={onClick ? { scale: 1.05 } : {}}
      whileTap={onClick ? { scale: 0.95 } : {}}
      className={cn(
        "inline-flex items-center font-medium rounded-full border",
        "transition-all duration-200",
        config.bgColor,
        config.textColor,
        config.borderColor,
        sizeStyles.padding,
        sizeStyles.text,
        sizeStyles.gap,
        onClick && "cursor-pointer hover:shadow-md",
        !onClick && "cursor-default",
        className
      )}
    >
      {/* Pulse indicator for urgent statuses */}
      {shouldPulse && (
        <span className="relative flex h-2 w-2">
          <span
            className={cn(
              "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
              config.pulseColor
            )}
          />
          <span
            className={cn(
              "relative inline-flex rounded-full h-2 w-2",
              config.pulseColor
            )}
          />
        </span>
      )}

      {showIcon && <Icon className={sizeStyles.icon} />}

      {showLabel && (
        <span>
          {config.label}
          {delayMinutes && delayMinutes > 0 && ` (${delayMinutes}min)`}
        </span>
      )}
    </motion.button>
  );
}

// ============================================
// COMPACT STATUS INDICATOR
// ============================================

interface StatusIndicatorProps {
  status: ScheduleStatus;
  className?: string;
}

export function StatusIndicator({ status, className }: StatusIndicatorProps) {
  const config = statusConfig[status];
  const shouldPulse = status === "needs_attention" || status === "critical";

  return (
    <span className={cn("relative flex h-3 w-3", className)}>
      {shouldPulse && (
        <span
          className={cn(
            "animate-ping absolute inline-flex h-full w-full rounded-full opacity-75",
            config.pulseColor
          )}
        />
      )}
      <span
        className={cn(
          "relative inline-flex rounded-full h-3 w-3",
          config.pulseColor
        )}
      />
    </span>
  );
}

// ============================================
// DELAY BADGE
// ============================================

interface DelayBadgeProps {
  delayMinutes: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function DelayBadge({
  delayMinutes,
  size = "md",
  className,
}: DelayBadgeProps) {
  const sizeStyles = sizeConfig[size];

  // Determine severity
  let bgColor = "bg-yellow-100 dark:bg-yellow-900/30";
  let textColor = "text-yellow-700 dark:text-yellow-400";

  if (delayMinutes > 30) {
    bgColor = "bg-orange-100 dark:bg-orange-900/30";
    textColor = "text-orange-700 dark:text-orange-400";
  }

  if (delayMinutes > 60) {
    bgColor = "bg-red-100 dark:bg-red-900/30";
    textColor = "text-red-700 dark:text-red-400";
  }

  return (
    <AnimatePresence>
      {delayMinutes > 0 && (
        <motion.span
          initial={{ opacity: 0, x: -10 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -10 }}
          className={cn(
            "inline-flex items-center font-medium rounded-full",
            bgColor,
            textColor,
            sizeStyles.padding,
            sizeStyles.text,
            sizeStyles.gap,
            className
          )}
        >
          <Clock className={sizeStyles.icon} />
          <span>+{delayMinutes} min</span>
        </motion.span>
      )}
    </AnimatePresence>
  );
}

// ============================================
// ACTIVITY STATUS BADGE
// ============================================

type ActivityStatus = "upcoming" | "in_progress" | "completed" | "skipped";

interface ActivityStatusBadgeProps {
  status: ActivityStatus;
  size?: "sm" | "md";
  className?: string;
}

const activityStatusConfig: Record<
  ActivityStatus,
  {
    label: string;
    icon: React.ElementType;
    bgColor: string;
    textColor: string;
  }
> = {
  upcoming: {
    label: "Upcoming",
    icon: Clock,
    bgColor: "bg-gray-100 dark:bg-gray-800",
    textColor: "text-gray-600 dark:text-gray-400",
  },
  in_progress: {
    label: "In Progress",
    icon: Zap,
    bgColor: "bg-blue-100 dark:bg-blue-900/30",
    textColor: "text-blue-700 dark:text-blue-400",
  },
  completed: {
    label: "Completed",
    icon: CheckCircle2,
    bgColor: "bg-green-100 dark:bg-green-900/30",
    textColor: "text-green-700 dark:text-green-400",
  },
  skipped: {
    label: "Skipped",
    icon: AlertCircle,
    bgColor: "bg-gray-100 dark:bg-gray-800",
    textColor: "text-gray-500 dark:text-gray-500",
  },
};

export function ActivityStatusBadge({
  status,
  size = "sm",
  className,
}: ActivityStatusBadgeProps) {
  const config = activityStatusConfig[status];
  const sizeStyles = sizeConfig[size];
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center font-medium rounded-full",
        config.bgColor,
        config.textColor,
        sizeStyles.padding,
        sizeStyles.text,
        sizeStyles.gap,
        className
      )}
    >
      <Icon className={sizeStyles.icon} />
      <span>{config.label}</span>
    </span>
  );
}

// ============================================
// EXPORTS
// ============================================

export { statusConfig, sizeConfig };
export type { StatusBadgeProps, ActivityStatus };
