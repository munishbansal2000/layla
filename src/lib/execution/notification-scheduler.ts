// ============================================
// NOTIFICATION SCHEDULER
// ============================================
// Schedule and manage notifications during trip execution.
// Implements notification system from EXECUTION_PHASE_DESIGN.md

import {
  ScheduledNotification,
  NotificationType,
  NotificationAction,
} from "@/types/execution";
import { DaySchedule, ScheduledActivity, CommuteInfo } from "@/lib/schedule-builder";

// ============================================
// CONSTANTS
// ============================================

/**
 * Default departure reminder buffer (minutes before commute starts)
 */
export const DEPARTURE_REMINDER_BUFFER = 15;

/**
 * Default activity ending warning (minutes before end)
 */
export const ACTIVITY_ENDING_BUFFER = 10;

/**
 * Notification batching window (minutes)
 */
export const BATCHING_WINDOW = 5;

// ============================================
// NOTIFICATION SCHEDULING
// ============================================

/**
 * Generate a unique notification ID
 */
function generateNotificationId(): string {
  return `notif-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Schedule all notifications for a day
 */
export function scheduleNotificationsForDay(
  schedule: DaySchedule,
  baseDate: Date
): ScheduledNotification[] {
  const notifications: ScheduledNotification[] = [];

  // Morning briefing
  const briefingNotif = createMorningBriefingNotification(schedule, baseDate);
  notifications.push(briefingNotif);

  // Activity-based notifications
  for (let i = 0; i < schedule.slots.length; i++) {
    const slot = schedule.slots[i];
    const nextSlot = i < schedule.slots.length - 1 ? schedule.slots[i + 1] : null;

    // Departure reminder for each activity
    if (slot.commuteFromPrevious) {
      const departureNotif = createDepartureReminder(
        slot,
        slot.commuteFromPrevious.durationMinutes,
        baseDate
      );
      notifications.push(departureNotif);
    }

    // Activity ending notification
    const endingNotif = createActivityEndingNotification(slot, baseDate);
    notifications.push(endingNotif);
  }

  // Day summary notification
  const summaryNotif = createDaySummaryNotification(schedule, baseDate);
  notifications.push(summaryNotif);

  return notifications;
}

// ============================================
// NOTIFICATION CREATORS
// ============================================

/**
 * Create morning briefing notification
 */
export function createMorningBriefingNotification(
  schedule: DaySchedule,
  baseDate: Date
): ScheduledNotification {
  // Schedule for 7:00 AM
  const scheduledTime = new Date(baseDate);
  scheduledTime.setHours(7, 0, 0, 0);

  const firstSlot = schedule.slots[0];
  const firstActivityName = firstSlot?.activity.activity.name ?? "your first activity";

  return {
    id: generateNotificationId(),
    type: "morning_briefing",
    scheduledTime,
    title: `Good morning! Day ${schedule.dayNumber} in ${schedule.city}`,
    body: `${schedule.slots.length} activities planned today. First up: ${firstActivityName}`,
    priority: "normal",
    relatedSlotId: firstSlot?.slotId,
    relatedActivityName: firstActivityName,
    actionRequired: false,
    actions: [
      { id: "view", label: "View Schedule", type: "primary" },
      { id: "snooze", label: "Snooze 30 min", type: "secondary" },
    ],
  };
}

/**
 * Create departure reminder notification
 */
export function createDepartureReminder(
  activity: ScheduledActivity,
  commuteMinutes: number,
  baseDate: Date
): ScheduledNotification {
  // Parse activity start time
  const [hours, minutes] = activity.scheduledStart.split(":").map(Number);
  
  // Calculate departure time (start time - commute - buffer)
  const scheduledTime = new Date(baseDate);
  scheduledTime.setHours(hours, minutes, 0, 0);
  scheduledTime.setMinutes(
    scheduledTime.getMinutes() - commuteMinutes - DEPARTURE_REMINDER_BUFFER
  );

  const activityName = activity.activity.activity.name;
  
  return {
    id: generateNotificationId(),
    type: "departure_reminder",
    scheduledTime,
    title: `Time to head to ${activityName}`,
    body: `${commuteMinutes} min travel. Leave now to arrive on time.`,
    priority: "high",
    relatedSlotId: activity.slotId,
    relatedActivityName: activityName,
    actionRequired: true,
    actions: [
      { id: "navigate", label: "Start Navigation", type: "primary" },
      { id: "delay", label: "Need 5 more min", type: "secondary" },
    ],
  };
}

/**
 * Create activity ending notification
 */
export function createActivityEndingNotification(
  activity: ScheduledActivity,
  baseDate: Date
): ScheduledNotification {
  // Parse activity end time
  const [hours, minutes] = activity.scheduledEnd.split(":").map(Number);
  
  // Schedule 10 min before end
  const scheduledTime = new Date(baseDate);
  scheduledTime.setHours(hours, minutes, 0, 0);
  scheduledTime.setMinutes(scheduledTime.getMinutes() - ACTIVITY_ENDING_BUFFER);

  const activityName = activity.activity.activity.name;
  
  return {
    id: generateNotificationId(),
    type: "activity_ending",
    scheduledTime,
    title: `${ACTIVITY_ENDING_BUFFER} min left at ${activityName}`,
    body: "Time's almost up! Ready to move to the next activity?",
    priority: "normal",
    relatedSlotId: activity.slotId,
    relatedActivityName: activityName,
    actionRequired: false,
    actions: [
      { id: "done", label: "Done, what's next?", type: "primary" },
      { id: "extend", label: "+15 min", type: "secondary" },
      { id: "extend30", label: "+30 min", type: "secondary" },
    ],
  };
}

/**
 * Create day summary notification
 */
export function createDaySummaryNotification(
  schedule: DaySchedule,
  baseDate: Date
): ScheduledNotification {
  // Schedule for 9:00 PM
  const scheduledTime = new Date(baseDate);
  scheduledTime.setHours(21, 0, 0, 0);

  return {
    id: generateNotificationId(),
    type: "day_summary",
    scheduledTime,
    title: `Day ${schedule.dayNumber} Complete! 🎉`,
    body: "Great job today! Tap to see your day summary and tomorrow's preview.",
    priority: "low",
    actionRequired: false,
    actions: [
      { id: "view", label: "View Summary", type: "primary" },
      { id: "dismiss", label: "Dismiss", type: "secondary" },
    ],
  };
}

/**
 * Create running late notification
 */
export function createRunningLateNotification(
  delayMinutes: number,
  affectedActivity: ScheduledActivity,
  baseDate: Date
): ScheduledNotification {
  const activityName = affectedActivity.activity.activity.name;

  return {
    id: generateNotificationId(),
    type: "running_late",
    scheduledTime: new Date(), // Immediate
    title: `Running ${delayMinutes} min behind`,
    body: `Your schedule has been adjusted to keep ${activityName} on time.`,
    priority: "high",
    relatedSlotId: affectedActivity.slotId,
    relatedActivityName: activityName,
    actionRequired: true,
    actions: [
      { id: "accept", label: "Looks good", type: "primary" },
      { id: "options", label: "Other options", type: "secondary" },
      { id: "undo", label: "Undo", type: "destructive" },
    ],
  };
}

/**
 * Create weather change notification
 */
export function createWeatherChangeNotification(
  newCondition: string,
  affectedActivities: string[]
): ScheduledNotification {
  const affected = affectedActivities.length > 0
    ? `This may affect: ${affectedActivities.join(", ")}`
    : "Check your outdoor activities.";

  return {
    id: generateNotificationId(),
    type: "weather_change",
    scheduledTime: new Date(), // Immediate
    title: `Weather Update: ${newCondition}`,
    body: affected,
    priority: "high",
    actionRequired: affectedActivities.length > 0,
    actions: affectedActivities.length > 0
      ? [
          { id: "swap", label: "Swap activities", type: "primary" },
          { id: "keep", label: "Keep as is", type: "secondary" },
        ]
      : undefined,
  };
}

/**
 * Create arrival notification
 */
export function createArrivedNotification(
  activity: ScheduledActivity
): ScheduledNotification {
  const activityName = activity.activity.activity.name;
  
  return {
    id: generateNotificationId(),
    type: "arrived_at_activity",
    scheduledTime: new Date(), // Immediate
    title: `You've arrived at ${activityName}`,
    body: "Ready to start? Tap to check in and see tips.",
    priority: "normal",
    relatedSlotId: activity.slotId,
    relatedActivityName: activityName,
    actionRequired: false,
    actions: [
      { id: "checkin", label: "Start Activity", type: "primary" },
      { id: "tips", label: "View Tips", type: "secondary" },
      { id: "skip", label: "Skip this", type: "destructive" },
    ],
  };
}

/**
 * Create booking reminder notification
 */
export function createBookingReminderNotification(
  activity: ScheduledActivity,
  minutesBefore: number = 60,
  baseDate: Date
): ScheduledNotification {
  const [hours, minutes] = activity.scheduledStart.split(":").map(Number);
  
  const scheduledTime = new Date(baseDate);
  scheduledTime.setHours(hours, minutes, 0, 0);
  scheduledTime.setMinutes(scheduledTime.getMinutes() - minutesBefore);

  const activityName = activity.activity.activity.name;

  return {
    id: generateNotificationId(),
    type: "booking_reminder",
    scheduledTime,
    title: `Booking reminder: ${activityName}`,
    body: `Your reservation is at ${activity.scheduledStart}. Don't forget your confirmation!`,
    priority: "high",
    relatedSlotId: activity.slotId,
    relatedActivityName: activityName,
    actionRequired: false,
    actions: [
      { id: "confirm", label: "Got it", type: "primary" },
      { id: "details", label: "View Details", type: "secondary" },
    ],
  };
}

// ============================================
// NOTIFICATION FILTERING
// ============================================

/**
 * Filter notifications by quiet hours
 */
export function filterByQuietHours(
  notifications: ScheduledNotification[],
  quietStart: string,
  quietEnd: string
): ScheduledNotification[] {
  const [quietStartHours, quietStartMinutes] = quietStart.split(":").map(Number);
  const [quietEndHours, quietEndMinutes] = quietEnd.split(":").map(Number);

  return notifications.filter((notification) => {
    const hours = notification.scheduledTime.getHours();
    const minutes = notification.scheduledTime.getMinutes();
    const notifMinutes = hours * 60 + minutes;

    const quietStartMins = quietStartHours * 60 + quietStartMinutes;
    const quietEndMins = quietEndHours * 60 + quietEndMinutes;

    // Handle overnight quiet hours (e.g., 22:00 - 08:00)
    if (quietStartMins > quietEndMins) {
      // Overnight: filter if after start OR before end
      const inQuietHours = notifMinutes >= quietStartMins || notifMinutes < quietEndMins;
      
      // Allow urgent notifications even in quiet hours
      if (inQuietHours && notification.priority !== "urgent") {
        return false;
      }
    } else {
      // Same day: filter if between start and end
      const inQuietHours = notifMinutes >= quietStartMins && notifMinutes < quietEndMins;
      
      if (inQuietHours && notification.priority !== "urgent") {
        return false;
      }
    }

    return true;
  });
}

/**
 * Batch nearby notifications into combined notifications
 */
export function batchNearbyNotifications(
  notifications: ScheduledNotification[],
  windowMinutes: number = BATCHING_WINDOW
): ScheduledNotification[] {
  if (notifications.length <= 1) {
    return notifications;
  }

  // Sort by scheduled time
  const sorted = [...notifications].sort(
    (a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime()
  );

  const batched: ScheduledNotification[] = [];
  let currentBatch: ScheduledNotification[] = [sorted[0]];

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i];
    const batchStart = currentBatch[0];

    const diffMinutes =
      (current.scheduledTime.getTime() - batchStart.scheduledTime.getTime()) / 60000;

    if (diffMinutes <= windowMinutes) {
      currentBatch.push(current);
    } else {
      // Process current batch
      if (currentBatch.length === 1) {
        batched.push(currentBatch[0]);
      } else {
        batched.push(combineNotifications(currentBatch));
      }
      currentBatch = [current];
    }
  }

  // Process final batch
  if (currentBatch.length === 1) {
    batched.push(currentBatch[0]);
  } else {
    batched.push(combineNotifications(currentBatch));
  }

  return batched;
}

/**
 * Combine multiple notifications into one
 */
function combineNotifications(notifications: ScheduledNotification[]): ScheduledNotification {
  // Use the highest priority
  const priorities: Record<string, number> = {
    urgent: 4,
    high: 3,
    normal: 2,
    low: 1,
  };

  const sorted = [...notifications].sort(
    (a, b) => priorities[b.priority] - priorities[a.priority]
  );

  const highest = sorted[0];
  const others = sorted.slice(1);

  return {
    ...highest,
    id: generateNotificationId(),
    body: `${highest.body}${others.length > 0 ? ` (+${others.length} more)` : ""}`,
  };
}

/**
 * Get notifications that should fire within a time window
 */
export function getUpcomingNotifications(
  notifications: ScheduledNotification[],
  currentTime: Date,
  windowMinutes: number
): ScheduledNotification[] {
  const windowEnd = new Date(currentTime);
  windowEnd.setMinutes(windowEnd.getMinutes() + windowMinutes);

  return notifications.filter((notification) => {
    const time = notification.scheduledTime;
    return time >= currentTime && time <= windowEnd && !notification.dismissed;
  });
}

/**
 * Get notifications that are due now
 */
export function getDueNotifications(
  notifications: ScheduledNotification[],
  currentTime: Date
): ScheduledNotification[] {
  return notifications.filter((notification) => {
    return notification.scheduledTime <= currentTime && !notification.dismissed;
  });
}

// ============================================
// NOTIFICATION PRIORITY
// ============================================

/**
 * Sort notifications by priority
 */
export function sortByPriority(
  notifications: ScheduledNotification[]
): ScheduledNotification[] {
  const priorities: Record<string, number> = {
    urgent: 4,
    high: 3,
    normal: 2,
    low: 1,
  };

  return [...notifications].sort(
    (a, b) => priorities[b.priority] - priorities[a.priority]
  );
}

/**
 * Check if notification should override quiet hours
 */
export function shouldOverrideQuietHours(notification: ScheduledNotification): boolean {
  const urgentTypes: NotificationType[] = [
    "running_late",
    "closure_detected",
    "weather_change",
    "booking_reminder",
  ];

  return (
    notification.priority === "urgent" ||
    urgentTypes.includes(notification.type)
  );
}

// ============================================
// NOTIFICATION EXPIRATION
// ============================================

/**
 * Set auto-expiration for a notification
 */
export function setAutoExpiration(
  notification: ScheduledNotification,
  expirationMinutes: number
): ScheduledNotification {
  const autoExpireAt = new Date(notification.scheduledTime);
  autoExpireAt.setMinutes(autoExpireAt.getMinutes() + expirationMinutes);

  return {
    ...notification,
    autoExpireAt,
  };
}

/**
 * Check if notification has expired
 */
export function isNotificationExpired(
  notification: ScheduledNotification,
  currentTime: Date
): boolean {
  if (notification.dismissed) {
    return true;
  }

  if (notification.autoExpireAt) {
    return currentTime > notification.autoExpireAt;
  }

  return false;
}

/**
 * Filter out expired notifications
 */
export function filterExpiredNotifications(
  notifications: ScheduledNotification[],
  currentTime: Date
): ScheduledNotification[] {
  return notifications.filter(
    (notification) => !isNotificationExpired(notification, currentTime)
  );
}
