/**
 * Venue Monitoring Service
 *
 * Polls venue status and detects closures, hours changes,
 * and other real-time updates that may affect the itinerary.
 */

import type {
  VenueMonitoringConfig,
  VenueStatus,
  VenueAlert,
} from "@/types/multi-city";

// ============================================
// TYPES
// ============================================

export interface MonitoredVenue {
  venueId: string;
  venueName: string;
  placeId?: string;
  tripId: string;
  activityIds: string[];
  config: VenueMonitoringConfig;
  lastStatus?: VenueStatus;
}

export interface VenueMonitoringState {
  venues: Map<string, MonitoredVenue>;
  alerts: VenueAlert[];
  lastPollTime: string | null;
  isPolling: boolean;
}

export interface VenueCheckResult {
  venueId: string;
  hasChanged: boolean;
  previousStatus?: VenueStatus;
  currentStatus: VenueStatus;
  alerts: VenueAlert[];
}

type AlertCallback = (alert: VenueAlert) => void;

// ============================================
// VENUE MONITORING SERVICE
// ============================================

export class VenueMonitoringService {
  private state: VenueMonitoringState;
  private pollInterval: NodeJS.Timeout | null = null;
  private alertCallbacks: Set<AlertCallback> = new Set();
  private readonly DEFAULT_POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

  constructor() {
    this.state = {
      venues: new Map(),
      alerts: [],
      lastPollTime: null,
      isPolling: false,
    };
  }

  /**
   * Start monitoring a venue
   */
  addVenue(venue: MonitoredVenue): void {
    this.state.venues.set(venue.venueId, venue);

    // Start polling if not already started
    if (!this.pollInterval && this.state.venues.size > 0) {
      this.startPolling();
    }
  }

  /**
   * Stop monitoring a venue
   */
  removeVenue(venueId: string): void {
    this.state.venues.delete(venueId);

    // Stop polling if no venues left
    if (this.state.venues.size === 0 && this.pollInterval) {
      this.stopPolling();
    }
  }

  /**
   * Start monitoring all venues for a trip
   */
  monitorTrip(
    tripId: string,
    venues: Array<{
      venueId: string;
      venueName: string;
      placeId?: string;
      activityIds: string[];
    }>
  ): void {
    for (const venue of venues) {
      this.addVenue({
        ...venue,
        tripId,
        config: {
          venueId: venue.venueId,
          venueName: venue.venueName,
          checkInterval: 5,
          notifyOnClosure: true,
          notifyOnHoursChange: true,
        },
      });
    }
  }

  /**
   * Stop monitoring all venues for a trip
   */
  unmonitorTrip(tripId: string): void {
    const venuesToRemove: string[] = [];
    this.state.venues.forEach((venue, id) => {
      if (venue.tripId === tripId) {
        venuesToRemove.push(id);
      }
    });
    venuesToRemove.forEach((id) => this.removeVenue(id));
  }

  /**
   * Subscribe to alerts
   */
  onAlert(callback: AlertCallback): () => void {
    this.alertCallbacks.add(callback);
    return () => this.alertCallbacks.delete(callback);
  }

  /**
   * Get current alerts
   */
  getAlerts(): VenueAlert[] {
    return [...this.state.alerts];
  }

  /**
   * Dismiss an alert
   */
  dismissAlert(alertId: string): void {
    this.state.alerts = this.state.alerts.filter((a) => a.id !== alertId);
  }

  /**
   * Start polling for venue updates
   */
  private startPolling(): void {
    if (this.pollInterval) return;

    this.pollInterval = setInterval(
      () => this.pollVenues(),
      this.DEFAULT_POLL_INTERVAL
    );

    // Run initial poll
    this.pollVenues();
  }

  /**
   * Stop polling
   */
  private stopPolling(): void {
    if (this.pollInterval) {
      clearInterval(this.pollInterval);
      this.pollInterval = null;
    }
  }

  /**
   * Poll all monitored venues
   */
  private async pollVenues(): Promise<void> {
    if (this.state.isPolling) return;

    this.state.isPolling = true;
    this.state.lastPollTime = new Date().toISOString();

    try {
      const checkPromises = Array.from(this.state.venues.values()).map(
        (venue) => this.checkVenue(venue)
      );

      const results = await Promise.all(checkPromises);

      // Process results and emit alerts
      for (const result of results) {
        if (result.hasChanged && result.alerts.length > 0) {
          this.state.alerts.push(...result.alerts);

          // Notify callbacks
          for (const alert of result.alerts) {
            this.alertCallbacks.forEach((cb) => cb(alert));
          }
        }

        // Update venue status
        const venue = this.state.venues.get(result.venueId);
        if (venue) {
          venue.lastStatus = result.currentStatus;
          venue.config.lastChecked = new Date().toISOString();
          venue.config.currentStatus = result.currentStatus;
        }
      }
    } finally {
      this.state.isPolling = false;
    }
  }

  /**
   * Check a single venue for updates
   */
  private async checkVenue(venue: MonitoredVenue): Promise<VenueCheckResult> {
    const alerts: VenueAlert[] = [];

    try {
      const currentStatus = await this.fetchVenueStatus(venue);

      // Check for changes
      const previousStatus = venue.lastStatus;
      let hasChanged = false;

      if (previousStatus) {
        // Check for closure
        if (!previousStatus.isClosed && currentStatus.isClosed) {
          hasChanged = true;
          if (venue.config.notifyOnClosure) {
            alerts.push(this.createAlert(venue, "closure", currentStatus));
          }
        }

        // Check for reopening
        if (previousStatus.isClosed && !currentStatus.isClosed) {
          hasChanged = true;
          alerts.push(this.createAlert(venue, "reopening", currentStatus));
        }

        // Check for temporary closure
        if (
          !previousStatus.temporaryClosure &&
          currentStatus.temporaryClosure
        ) {
          hasChanged = true;
          if (venue.config.notifyOnClosure) {
            alerts.push(
              this.createAlert(venue, "temporary_closure", currentStatus)
            );
          }
        }

        // Check for hours change
        if (this.hoursChanged(previousStatus, currentStatus)) {
          hasChanged = true;
          if (venue.config.notifyOnHoursChange) {
            alerts.push(this.createAlert(venue, "hours_change", currentStatus));
          }
        }
      }

      return {
        venueId: venue.venueId,
        hasChanged,
        previousStatus,
        currentStatus,
        alerts,
      };
    } catch (error) {
      console.error(`Failed to check venue ${venue.venueId}:`, error);
      return {
        venueId: venue.venueId,
        hasChanged: false,
        currentStatus: {
          isOpen: true,
          isClosed: false,
          lastUpdated: new Date().toISOString(),
        },
        alerts: [],
      };
    }
  }

  /**
   * Fetch venue status from Google Places API or mock
   */
  private async fetchVenueStatus(venue: MonitoredVenue): Promise<VenueStatus> {
    // In production, this would call Google Places API
    // For now, return simulated status based on time

    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    // Simulate typical venue hours
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const typicalOpen = isWeekend ? 10 : 9;
    const typicalClose = isWeekend ? 22 : 21;

    const isOpen = hour >= typicalOpen && hour < typicalClose;

    // Simulate random closures (1% chance)
    const randomClosure = Math.random() < 0.01;

    return {
      isOpen: isOpen && !randomClosure,
      isClosed: randomClosure,
      currentHours: {
        open: `${typicalOpen.toString().padStart(2, "0")}:00`,
        close: `${typicalClose.toString().padStart(2, "0")}:00`,
      },
      nextOpening: isOpen
        ? undefined
        : `${now.toISOString().split("T")[0]}T${typicalOpen.toString().padStart(2, "0")}:00:00`,
      temporaryClosure: randomClosure
        ? {
            reason: "Unexpected closure",
            until: undefined,
          }
        : undefined,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Check if hours changed between statuses
   */
  private hoursChanged(prev: VenueStatus, curr: VenueStatus): boolean {
    if (!prev.currentHours && !curr.currentHours) return false;
    if (!prev.currentHours || !curr.currentHours) return true;

    return (
      prev.currentHours.open !== curr.currentHours.open ||
      prev.currentHours.close !== curr.currentHours.close
    );
  }

  /**
   * Create an alert
   */
  private createAlert(
    venue: MonitoredVenue,
    type: VenueAlert["alertType"],
    status: VenueStatus
  ): VenueAlert {
    const messages: Record<VenueAlert["alertType"], string> = {
      closure: `${venue.venueName} is now closed`,
      hours_change: `${venue.venueName} has changed its hours`,
      temporary_closure: `${venue.venueName} is temporarily closed: ${status.temporaryClosure?.reason || "Unknown reason"}`,
      reopening: `${venue.venueName} is now open again`,
    };

    const severities: Record<VenueAlert["alertType"], VenueAlert["severity"]> = {
      closure: "critical",
      hours_change: "warning",
      temporary_closure: "critical",
      reopening: "info",
    };

    const suggestedActions: Record<VenueAlert["alertType"], string> = {
      closure: "Consider finding an alternative venue",
      hours_change: "Check if your planned visit time is still valid",
      temporary_closure: "Wait for reopening or find an alternative",
      reopening: "Your original plan can proceed",
    };

    return {
      id: `alert_${Date.now()}_${venue.venueId}`,
      venueId: venue.venueId,
      venueName: venue.venueName,
      alertType: type,
      message: messages[type],
      severity: severities[type],
      timestamp: new Date().toISOString(),
      affectedActivities: venue.activityIds,
      suggestedAction: suggestedActions[type],
    };
  }

  /**
   * Get monitoring state
   */
  getState(): VenueMonitoringState {
    return {
      ...this.state,
      venues: new Map(this.state.venues),
      alerts: [...this.state.alerts],
    };
  }

  /**
   * Force a poll now
   */
  async pollNow(): Promise<VenueCheckResult[]> {
    const results: VenueCheckResult[] = [];
    for (const venue of this.state.venues.values()) {
      const result = await this.checkVenue(venue);
      results.push(result);
    }
    return results;
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopPolling();
    this.state.venues.clear();
    this.state.alerts = [];
    this.alertCallbacks.clear();
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let serviceInstance: VenueMonitoringService | null = null;

export function getVenueMonitoringService(): VenueMonitoringService {
  if (!serviceInstance) {
    serviceInstance = new VenueMonitoringService();
  }
  return serviceInstance;
}

// ============================================
// REACT HOOK
// ============================================

import { useState, useEffect, useCallback } from "react";

export function useVenueMonitoring(tripId?: string) {
  const [alerts, setAlerts] = useState<VenueAlert[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);

  useEffect(() => {
    const service = getVenueMonitoringService();

    // Subscribe to alerts
    const unsubscribe = service.onAlert((alert) => {
      setAlerts((prev) => [...prev, alert]);
    });

    // Set initial alerts
    setAlerts(service.getAlerts());
    setIsMonitoring(service.getState().isPolling);

    return () => {
      unsubscribe();
    };
  }, []);

  const startMonitoring = useCallback(
    (
      venues: Array<{
        venueId: string;
        venueName: string;
        placeId?: string;
        activityIds: string[];
      }>
    ) => {
      if (!tripId) return;

      const service = getVenueMonitoringService();
      service.monitorTrip(tripId, venues);
      setIsMonitoring(true);
    },
    [tripId]
  );

  const stopMonitoring = useCallback(() => {
    if (!tripId) return;

    const service = getVenueMonitoringService();
    service.unmonitorTrip(tripId);
    setIsMonitoring(false);
  }, [tripId]);

  const dismissAlert = useCallback((alertId: string) => {
    const service = getVenueMonitoringService();
    service.dismissAlert(alertId);
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }, []);

  const refreshNow = useCallback(async () => {
    const service = getVenueMonitoringService();
    await service.pollNow();
    setAlerts(service.getAlerts());
  }, []);

  return {
    alerts,
    isMonitoring,
    startMonitoring,
    stopMonitoring,
    dismissAlert,
    refreshNow,
  };
}

// ============================================
// EXPORTS
// ============================================

// All classes are exported via their class declarations above
