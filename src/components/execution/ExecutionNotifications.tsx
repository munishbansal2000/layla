"use client";

import React, { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import {
  X,
  Clock,
  AlertTriangle,
  MapPin,
  Bell,
  CheckCircle2,
  SkipForward,
  Coffee,
  CloudRain,
  Timer,
  Navigation,
  Zap,
} from "lucide-react";

// ============================================
// NOTIFICATION TYPES
// ============================================

export type ExecutionNotificationType =
  | "delay_warning"
  | "arrival_detected"
  | "departure_reminder"
  | "activity_starting"
  | "activity_ending"
  | "running_late"
  | "skip_suggestion"
  | "extension_available"
  | "booking_at_risk"
  | "geofence_entered"
  | "geofence_exited"
  | "scenario_trigger"
  | "info";

export interface ExecutionNotification {
  id: string;
  type: ExecutionNotificationType;
  title: string;
  message: string;
  timestamp: Date;
  activityName?: string;
  slotId?: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  autoDismiss?: boolean;
  priority?: "low" | "normal" | "high" | "urgent";
}

// ============================================
// NOTIFICATION ITEM
// ============================================

interface NotificationItemProps {
  notification: ExecutionNotification;
  onDismiss: (id: string) => void;
}

function NotificationItem({ notification, onDismiss }: NotificationItemProps) {
  const { id, type, title, message, actionLabel, onAction, secondaryActionLabel, onSecondaryAction, priority } = notification;

  useEffect(() => {
    if (notification.autoDismiss !== false) {
      const delay = priority === "urgent" ? 10000 : priority === "high" ? 7000 : 5000;
      const timer = setTimeout(() => onDismiss(id), delay);
      return () => clearTimeout(timer);
    }
  }, [id, notification.autoDismiss, priority, onDismiss]);

  const config = getNotificationConfig(type, priority);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: 300, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 300, scale: 0.95 }}
      transition={{ type: "spring", damping: 25, stiffness: 300 }}
      className={cn(
        "relative w-80 overflow-hidden",
        "bg-white dark:bg-gray-900 rounded-xl shadow-lg",
        "border-l-4",
        config.borderColor
      )}
    >
      <div className="p-4">
        <div className="flex items-start gap-3">
          <div className={cn("p-2 rounded-lg", config.bgColor)}>
            <config.icon className={cn("h-4 w-4", config.iconColor)} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                {title}
              </h4>
              <button
                onClick={() => onDismiss(id)}
                className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 dark:hover:bg-gray-800"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
              {message}
            </p>
            
            {(actionLabel || secondaryActionLabel) && (
              <div className="mt-3 flex items-center gap-2">
                {actionLabel && onAction && (
                  <button
                    onClick={() => {
                      onAction();
                      onDismiss(id);
                    }}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-lg",
                      "bg-purple-600 text-white hover:bg-purple-700",
                      "transition-colors"
                    )}
                  >
                    {actionLabel}
                  </button>
                )}
                {secondaryActionLabel && onSecondaryAction && (
                  <button
                    onClick={() => {
                      onSecondaryAction();
                      onDismiss(id);
                    }}
                    className={cn(
                      "px-3 py-1.5 text-xs font-medium rounded-lg",
                      "text-gray-600 dark:text-gray-400",
                      "hover:bg-gray-100 dark:hover:bg-gray-800",
                      "transition-colors"
                    )}
                  >
                    {secondaryActionLabel}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ============================================
// NOTIFICATION FEED
// ============================================

interface ExecutionNotificationFeedProps {
  notifications: ExecutionNotification[];
  onDismiss: (id: string) => void;
  position?: "top-right" | "bottom-right" | "top-left" | "bottom-left";
}

export function ExecutionNotificationFeed({
  notifications,
  onDismiss,
  position = "top-right",
}: ExecutionNotificationFeedProps) {
  const positionClasses = {
    "top-right": "top-4 right-4",
    "bottom-right": "bottom-4 right-4",
    "top-left": "top-4 left-4",
    "bottom-left": "bottom-4 left-4",
  };

  return (
    <div className={cn("fixed z-50 flex flex-col gap-3", positionClasses[position])}>
      <AnimatePresence mode="popLayout">
        {notifications.slice(0, 5).map((notification) => (
          <NotificationItem
            key={notification.id}
            notification={notification}
            onDismiss={onDismiss}
          />
        ))}
      </AnimatePresence>
    </div>
  );
}

// ============================================
// NOTIFICATION EVENT LOG
// ============================================

interface EventLogProps {
  events: ExecutionNotification[];
  maxHeight?: string;
}

export function ExecutionEventLog({ events, maxHeight = "300px" }: EventLogProps) {
  return (
    <div 
      className="bg-gray-900 rounded-xl border border-gray-700 overflow-hidden"
      style={{ maxHeight }}
    >
      <div className="px-4 py-2 bg-gray-800 border-b border-gray-700 flex items-center gap-2">
        <Bell className="h-4 w-4 text-gray-400" />
        <span className="text-sm font-medium text-gray-200">Event Log</span>
        <span className="ml-auto text-xs text-gray-500">{events.length} events</span>
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: `calc(${maxHeight} - 40px)` }}>
        {events.length === 0 ? (
          <div className="p-4 text-center text-sm text-gray-500">
            No events yet. Start the simulation to see events.
          </div>
        ) : (
          <div className="divide-y divide-gray-800">
            {events.map((event) => {
              const config = getNotificationConfig(event.type, event.priority);
              return (
                <div key={event.id} className="px-4 py-2 hover:bg-gray-800/50">
                  <div className="flex items-start gap-3">
                    <config.icon className={cn("h-4 w-4 mt-0.5", config.iconColor)} />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-sm font-medium text-gray-200">{event.title}</span>
                        <span className="text-xs text-gray-500">
                          {event.timestamp.toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                            hour12: false,
                          })}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 truncate">{event.message}</p>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getNotificationConfig(type: ExecutionNotificationType, priority?: string) {
  const configs: Record<ExecutionNotificationType, {
    icon: React.ElementType;
    bgColor: string;
    iconColor: string;
    borderColor: string;
  }> = {
    delay_warning: {
      icon: Clock,
      bgColor: "bg-orange-100 dark:bg-orange-900/30",
      iconColor: "text-orange-600 dark:text-orange-400",
      borderColor: "border-orange-500",
    },
    arrival_detected: {
      icon: MapPin,
      bgColor: "bg-green-100 dark:bg-green-900/30",
      iconColor: "text-green-600 dark:text-green-400",
      borderColor: "border-green-500",
    },
    departure_reminder: {
      icon: Navigation,
      bgColor: "bg-blue-100 dark:bg-blue-900/30",
      iconColor: "text-blue-600 dark:text-blue-400",
      borderColor: "border-blue-500",
    },
    activity_starting: {
      icon: Bell,
      bgColor: "bg-purple-100 dark:bg-purple-900/30",
      iconColor: "text-purple-600 dark:text-purple-400",
      borderColor: "border-purple-500",
    },
    activity_ending: {
      icon: Timer,
      bgColor: "bg-yellow-100 dark:bg-yellow-900/30",
      iconColor: "text-yellow-600 dark:text-yellow-400",
      borderColor: "border-yellow-500",
    },
    running_late: {
      icon: AlertTriangle,
      bgColor: "bg-red-100 dark:bg-red-900/30",
      iconColor: "text-red-600 dark:text-red-400",
      borderColor: "border-red-500",
    },
    skip_suggestion: {
      icon: SkipForward,
      bgColor: "bg-orange-100 dark:bg-orange-900/30",
      iconColor: "text-orange-600 dark:text-orange-400",
      borderColor: "border-orange-500",
    },
    extension_available: {
      icon: Clock,
      bgColor: "bg-indigo-100 dark:bg-indigo-900/30",
      iconColor: "text-indigo-600 dark:text-indigo-400",
      borderColor: "border-indigo-500",
    },
    booking_at_risk: {
      icon: AlertTriangle,
      bgColor: "bg-red-100 dark:bg-red-900/30",
      iconColor: "text-red-600 dark:text-red-400",
      borderColor: "border-red-500",
    },
    geofence_entered: {
      icon: MapPin,
      bgColor: "bg-teal-100 dark:bg-teal-900/30",
      iconColor: "text-teal-600 dark:text-teal-400",
      borderColor: "border-teal-500",
    },
    geofence_exited: {
      icon: Navigation,
      bgColor: "bg-gray-100 dark:bg-gray-800",
      iconColor: "text-gray-600 dark:text-gray-400",
      borderColor: "border-gray-500",
    },
    scenario_trigger: {
      icon: Zap,
      bgColor: "bg-amber-100 dark:bg-amber-900/30",
      iconColor: "text-amber-600 dark:text-amber-400",
      borderColor: "border-amber-500",
    },
    info: {
      icon: Bell,
      bgColor: "bg-blue-100 dark:bg-blue-900/30",
      iconColor: "text-blue-600 dark:text-blue-400",
      borderColor: "border-blue-500",
    },
  };

  return configs[type] || configs.info;
}

// ============================================
// HOOK FOR MANAGING NOTIFICATIONS
// ============================================

export function useExecutionNotifications() {
  const [notifications, setNotifications] = useState<ExecutionNotification[]>([]);
  const [eventLog, setEventLog] = useState<ExecutionNotification[]>([]);

  const addNotification = useCallback((notification: Omit<ExecutionNotification, "id" | "timestamp">) => {
    const newNotification: ExecutionNotification = {
      ...notification,
      id: `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
    };
    
    setNotifications((prev) => [newNotification, ...prev]);
    setEventLog((prev) => [newNotification, ...prev]);
    
    return newNotification.id;
  }, []);

  const dismissNotification = useCallback((id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  const clearEventLog = useCallback(() => {
    setEventLog([]);
  }, []);

  return {
    notifications,
    eventLog,
    addNotification,
    dismissNotification,
    clearAllNotifications,
    clearEventLog,
  };
}

export default ExecutionNotificationFeed;
