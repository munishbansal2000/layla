/**
 * Event styling utilities for chat messages
 */

import {
  MapPin,
  Navigation,
  Clock,
  Timer,
  AlertTriangle,
  Sparkles,
  CloudRain,
  XCircle,
  Info,
  CheckCircle,
  MessageSquare,
} from "lucide-react";
import type { QueuedEvent, QueuedEventAction } from "./types";

/**
 * Get icon for event type
 */
export function getEventIcon(type: QueuedEvent["type"]) {
  switch (type) {
    case "arrival":
      return MapPin;
    case "departure":
      return Navigation;
    case "proximity_alert":
      return MapPin;
    case "activity_starting":
      return Clock;
    case "duration_warning":
      return Timer;
    case "booking_reminder":
    case "last_call":
      return AlertTriangle;
    case "morning_briefing":
    case "day_recap":
      return Sparkles;
    case "weather_alert":
      return CloudRain;
    case "closure_alert":
      return XCircle;
    case "crowd_alert":
      return Info;
    case "transit_delay":
      return Clock;
    case "completion_prompt":
      return CheckCircle;
    case "agent_message":
    default:
      return MessageSquare;
  }
}

/**
 * Get background color based on event priority/type
 */
export function getEventStyle(event: QueuedEvent) {
  if (event.priority === "urgent") {
    return "bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800";
  }
  if (event.priority === "high") {
    return "bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800";
  }
  if (event.type === "arrival" || event.type === "completion_prompt") {
    return "bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800";
  }
  if (event.type === "weather_alert" || event.type === "closure_alert") {
    return "bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800";
  }
  return "bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800";
}

/**
 * Get action button style based on variant
 */
export function getActionButtonStyle(variant?: QueuedEventAction["variant"]) {
  switch (variant) {
    case "primary":
      return "bg-purple-600 text-white hover:bg-purple-700";
    case "danger":
      return "bg-red-600 text-white hover:bg-red-700";
    case "secondary":
    default:
      return "bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-600";
  }
}
