/**
 * Push Notification Service
 *
 * Manages push notifications for trip updates, schedule changes,
 * venue closures, and other real-time alerts.
 */

import type {
  PushNotification,
  NotificationType,
  NotificationAction,
  NotificationPreferences,
} from "@/types/multi-city";

// ============================================
// TYPES
// ============================================

export interface NotificationPayload {
  type: NotificationType;
  title: string;
  body: string;
  tripId?: string;
  activityId?: string;
  actionUrl?: string;
  actions?: NotificationAction[];
  icon?: string;
  tag?: string;
  requireInteraction?: boolean;
}

export interface ScheduledNotification {
  id: string;
  payload: NotificationPayload;
  scheduledTime: string;
  tripId: string;
  activityId?: string;
  status: "pending" | "sent" | "cancelled";
}

type NotificationCallback = (notification: PushNotification) => void;

// ============================================
// NOTIFICATION SERVICE
// ============================================

export class NotificationService {
  private notifications: PushNotification[] = [];
  private scheduledNotifications: Map<string, ScheduledNotification> = new Map();
  private callbacks: Set<NotificationCallback> = new Set();
  private preferences: NotificationPreferences;
  private schedulerInterval: NodeJS.Timeout | null = null;

  constructor() {
    this.preferences = this.getDefaultPreferences();
    this.startScheduler();
  }

  /**
   * Get default notification preferences
   */
  private getDefaultPreferences(): NotificationPreferences {
    return {
      enabled: true,
      quietHours: { start: "22:00", end: "08:00" },
      types: {
        schedule_change: true,
        venue_closure: true,
        weather_alert: true,
        transport_delay: true,
        booking_reminder: true,
        check_in_reminder: true,
        activity_starting: true,
        trip_update: true,
      },
      advanceReminder: 30,
    };
  }

  /**
   * Request browser notification permission
   */
  async requestPermission(): Promise<boolean> {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return false;
    }

    if (Notification.permission === "granted") {
      return true;
    }

    if (Notification.permission === "denied") {
      return false;
    }

    const permission = await Notification.requestPermission();
    return permission === "granted";
  }

  /**
   * Check if notifications are supported and permitted
   */
  canNotify(): boolean {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return false;
    }
    return Notification.permission === "granted" && this.preferences.enabled;
  }

  /**
   * Update notification preferences
   */
  updatePreferences(prefs: Partial<NotificationPreferences>): void {
    this.preferences = { ...this.preferences, ...prefs };
  }

  /**
   * Get current preferences
   */
  getPreferences(): NotificationPreferences {
    return { ...this.preferences };
  }

  /**
   * Send an immediate notification
   */
  async send(payload: NotificationPayload): Promise<PushNotification | null> {
    // Check if this notification type is enabled
    if (!this.preferences.types[payload.type]) {
      return null;
    }

    // Check quiet hours
    if (this.isQuietHours()) {
      return null;
    }

    const notification: PushNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      icon: payload.icon || this.getIconForType(payload.type),
      timestamp: new Date().toISOString(),
      tripId: payload.tripId,
      activityId: payload.activityId,
      actionUrl: payload.actionUrl,
      actions: payload.actions,
      read: false,
      dismissed: false,
    };

    // Add to history
    this.notifications.unshift(notification);

    // Keep only last 100 notifications
    if (this.notifications.length > 100) {
      this.notifications = this.notifications.slice(0, 100);
    }

    // Send browser notification
    if (this.canNotify()) {
      await this.sendBrowserNotification(notification);
    }

    // Notify callbacks
    this.callbacks.forEach((cb) => cb(notification));

    return notification;
  }

  /**
   * Schedule a notification for later
   */
  schedule(
    payload: NotificationPayload,
    scheduledTime: string,
    tripId: string,
    activityId?: string
  ): string {
    const scheduled: ScheduledNotification = {
      id: `scheduled_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      payload,
      scheduledTime,
      tripId,
      activityId,
      status: "pending",
    };

    this.scheduledNotifications.set(scheduled.id, scheduled);
    return scheduled.id;
  }

  /**
   * Cancel a scheduled notification
   */
  cancelScheduled(id: string): boolean {
    const scheduled = this.scheduledNotifications.get(id);
    if (scheduled && scheduled.status === "pending") {
      scheduled.status = "cancelled";
      return true;
    }
    return false;
  }

  /**
   * Cancel all scheduled notifications for an activity
   */
  cancelForActivity(activityId: string): void {
    this.scheduledNotifications.forEach((scheduled) => {
      if (scheduled.activityId === activityId && scheduled.status === "pending") {
        scheduled.status = "cancelled";
      }
    });
  }

  /**
   * Cancel all scheduled notifications for a trip
   */
  cancelForTrip(tripId: string): void {
    this.scheduledNotifications.forEach((scheduled) => {
      if (scheduled.tripId === tripId && scheduled.status === "pending") {
        scheduled.status = "cancelled";
      }
    });
  }

  /**
   * Schedule activity reminders for a trip
   */
  scheduleActivityReminders(
    tripId: string,
    activities: Array<{
      id: string;
      name: string;
      startTime: string;
      location?: string;
    }>
  ): string[] {
    const scheduledIds: string[] = [];

    for (const activity of activities) {
      const activityTime = new Date(activity.startTime);
      const reminderTime = new Date(
        activityTime.getTime() - this.preferences.advanceReminder * 60 * 1000
      );

      // Only schedule if reminder is in the future
      if (reminderTime > new Date()) {
        const id = this.schedule(
          {
            type: "activity_starting",
            title: "Activity Starting Soon",
            body: `${activity.name} starts in ${this.preferences.advanceReminder} minutes`,
            tripId,
            activityId: activity.id,
            icon: "⏰",
          },
          reminderTime.toISOString(),
          tripId,
          activity.id
        );
        scheduledIds.push(id);
      }
    }

    return scheduledIds;
  }

  /**
   * Get notification history
   */
  getNotifications(): PushNotification[] {
    return [...this.notifications];
  }

  /**
   * Get unread notifications
   */
  getUnreadNotifications(): PushNotification[] {
    return this.notifications.filter((n) => !n.read && !n.dismissed);
  }

  /**
   * Get unread count
   */
  getUnreadCount(): number {
    return this.notifications.filter((n) => !n.read && !n.dismissed).length;
  }

  /**
   * Mark notification as read
   */
  markAsRead(id: string): void {
    const notification = this.notifications.find((n) => n.id === id);
    if (notification) {
      notification.read = true;
    }
  }

  /**
   * Mark all notifications as read
   */
  markAllAsRead(): void {
    this.notifications.forEach((n) => {
      n.read = true;
    });
  }

  /**
   * Dismiss a notification
   */
  dismiss(id: string): void {
    const notification = this.notifications.find((n) => n.id === id);
    if (notification) {
      notification.dismissed = true;
    }
  }

  /**
   * Subscribe to notification events
   */
  onNotification(callback: NotificationCallback): () => void {
    this.callbacks.add(callback);
    return () => this.callbacks.delete(callback);
  }

  /**
   * Send browser notification
   */
  private async sendBrowserNotification(
    notification: PushNotification
  ): Promise<void> {
    if (typeof window === "undefined" || !("Notification" in window)) {
      return;
    }

    const options: NotificationOptions = {
      body: notification.body,
      icon: notification.icon,
      tag: notification.id,
      requireInteraction: false,
    };

    const browserNotif = new Notification(notification.title, options);

    browserNotif.onclick = () => {
      window.focus();
      if (notification.actionUrl) {
        window.location.href = notification.actionUrl;
      }
      browserNotif.close();
      this.markAsRead(notification.id);
    };
  }

  /**
   * Check if current time is within quiet hours
   */
  private isQuietHours(): boolean {
    if (!this.preferences.quietHours) return false;

    const now = new Date();
    const currentTime = `${now.getHours().toString().padStart(2, "0")}:${now.getMinutes().toString().padStart(2, "0")}`;

    const { start, end } = this.preferences.quietHours;

    // Handle overnight quiet hours (e.g., 22:00 - 08:00)
    if (start > end) {
      return currentTime >= start || currentTime < end;
    }

    return currentTime >= start && currentTime < end;
  }

  /**
   * Get icon for notification type
   */
  private getIconForType(type: NotificationType): string {
    const icons: Record<NotificationType, string> = {
      schedule_change: "🔄",
      venue_closure: "🚫",
      weather_alert: "🌧️",
      transport_delay: "⏳",
      booking_reminder: "📝",
      check_in_reminder: "🏨",
      activity_starting: "⏰",
      trip_update: "📍",
    };
    return icons[type];
  }

  /**
   * Start the scheduler for scheduled notifications
   */
  private startScheduler(): void {
    if (this.schedulerInterval) return;

    this.schedulerInterval = setInterval(
      () => this.processScheduledNotifications(),
      30 * 1000 // Check every 30 seconds
    );
  }

  /**
   * Stop the scheduler
   */
  private stopScheduler(): void {
    if (this.schedulerInterval) {
      clearInterval(this.schedulerInterval);
      this.schedulerInterval = null;
    }
  }

  /**
   * Process scheduled notifications
   */
  private async processScheduledNotifications(): Promise<void> {
    const now = new Date();

    for (const [id, scheduled] of this.scheduledNotifications.entries()) {
      if (scheduled.status !== "pending") continue;

      const scheduledTime = new Date(scheduled.scheduledTime);
      if (scheduledTime <= now) {
        await this.send(scheduled.payload);
        scheduled.status = "sent";
      }
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopScheduler();
    this.notifications = [];
    this.scheduledNotifications.clear();
    this.callbacks.clear();
  }

  // ============================================
  // CONVENIENCE METHODS FOR COMMON NOTIFICATIONS
  // ============================================

  /**
   * Notify about schedule change
   */
  notifyScheduleChange(
    tripId: string,
    changes: string[],
    actionUrl?: string
  ): Promise<PushNotification | null> {
    return this.send({
      type: "schedule_change",
      title: "Schedule Updated",
      body:
        changes.length === 1
          ? changes[0]
          : `${changes.length} changes made to your itinerary`,
      tripId,
      actionUrl,
    });
  }

  /**
   * Notify about venue closure
   */
  notifyVenueClosure(
    tripId: string,
    venueName: string,
    activityId: string,
    alternativeAvailable: boolean
  ): Promise<PushNotification | null> {
    return this.send({
      type: "venue_closure",
      title: "Venue Closed",
      body: alternativeAvailable
        ? `${venueName} is closed. We've found alternatives for you.`
        : `${venueName} is closed. Please review your schedule.`,
      tripId,
      activityId,
      actions: alternativeAvailable
        ? [{ id: "view", label: "View Alternatives", action: "view_alternatives" }]
        : undefined,
    });
  }

  /**
   * Notify about weather alert
   */
  notifyWeatherAlert(
    tripId: string,
    condition: string,
    affectedActivities: number
  ): Promise<PushNotification | null> {
    return this.send({
      type: "weather_alert",
      title: "Weather Alert",
      body: `${condition} expected. ${affectedActivities} outdoor ${affectedActivities === 1 ? "activity" : "activities"} may be affected.`,
      tripId,
    });
  }

  /**
   * Notify about transport delay
   */
  notifyTransportDelay(
    tripId: string,
    transportType: string,
    delayMinutes: number
  ): Promise<PushNotification | null> {
    return this.send({
      type: "transport_delay",
      title: "Transport Delay",
      body: `Your ${transportType} is delayed by ${delayMinutes} minutes.`,
      tripId,
    });
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let serviceInstance: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (!serviceInstance) {
    serviceInstance = new NotificationService();
  }
  return serviceInstance;
}

// ============================================
// REACT HOOK
// ============================================

import { useState, useEffect, useCallback } from "react";

export function useNotifications() {
  const [notifications, setNotifications] = useState<PushNotification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [preferences, setPreferences] = useState<NotificationPreferences>(
    getNotificationService().getPreferences()
  );

  useEffect(() => {
    const service = getNotificationService();

    // Subscribe to new notifications
    const unsubscribe = service.onNotification((notification) => {
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount(service.getUnreadCount());
    });

    // Set initial state
    setNotifications(service.getNotifications());
    setUnreadCount(service.getUnreadCount());

    return () => {
      unsubscribe();
    };
  }, []);

  const requestPermission = useCallback(async () => {
    const service = getNotificationService();
    return await service.requestPermission();
  }, []);

  const markAsRead = useCallback((id: string) => {
    const service = getNotificationService();
    service.markAsRead(id);
    setNotifications(service.getNotifications());
    setUnreadCount(service.getUnreadCount());
  }, []);

  const markAllAsRead = useCallback(() => {
    const service = getNotificationService();
    service.markAllAsRead();
    setNotifications(service.getNotifications());
    setUnreadCount(0);
  }, []);

  const dismiss = useCallback((id: string) => {
    const service = getNotificationService();
    service.dismiss(id);
    setNotifications(service.getNotifications());
  }, []);

  const updatePreferences = useCallback(
    (prefs: Partial<NotificationPreferences>) => {
      const service = getNotificationService();
      service.updatePreferences(prefs);
      setPreferences(service.getPreferences());
    },
    []
  );

  const send = useCallback(async (payload: NotificationPayload) => {
    const service = getNotificationService();
    return await service.send(payload);
  }, []);

  return {
    notifications,
    unreadCount,
    preferences,
    requestPermission,
    markAsRead,
    markAllAsRead,
    dismiss,
    updatePreferences,
    send,
  };
}

// ============================================
// EXPORTS
// ============================================

// All types and classes are exported via their inline declarations above
