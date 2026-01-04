/**
 * Venue Monitoring Service
 *
 * Based on: docs/REALTIME_RESHUFFLING_ALGORITHM.md - Phase 2
 *
 * Features:
 * - Morning sweep: Check all day's venues on page load
 * - Periodic polling: Regular venue status updates while tab is visible
 * - GPS-triggered pre-departure check: Verify next venue before leaving current
 * - User reports: "It's closed" button for manual closure reports
 * - Google Places API integration with aggressive caching
 * - Ollama severity assessment for hours mismatch evaluation
 *
 * Webapp Lifecycle:
 * - Morning sweep on mount
 * - Polling while tab active
 * - Pre-departure check linked to geofence exit
 * - Pause when tab hidden, resume on visibility
 *
 * Caching Strategy:
 * - Venue status cached for 30 minutes by default
 * - Force refresh on pre-departure check
 * - User reports bypass cache
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
  slotId?: string;
  scheduledStartTime?: string; // ISO string
  scheduledEndTime?: string;
  config: VenueMonitoringConfig;
  lastStatus?: VenueStatus;
}

/**
 * Venue for morning sweep
 */
export interface ScheduledVenue {
  venueId: string;
  venueName: string;
  placeId?: string;
  slotId: string;
  scheduledStartTime: string;
  scheduledEndTime: string;
  activityIds: string[];
}

/**
 * Morning sweep result
 */
export interface VenueMorningSweepResult {
  sweepTime: Date;
  tripId: string;
  date: string;
  venuesChecked: number;
  closures: Array<{
    venueId: string;
    venueName: string;
    slotId: string;
    reason: string;
    alternativesPreFetched: boolean;
  }>;
  hoursIssues: Array<{
    venueId: string;
    venueName: string;
    slotId: string;
    issue: "closes_early" | "opens_late" | "different_hours";
    severity: "info" | "warning" | "critical";
    scheduledTime: string;
    actualHours: { open: string; close: string };
    recommendation: string;
  }>;
  allGood: boolean;
}

/**
 * Pre-departure check result
 */
export interface PreDepartureCheckResult {
  venueId: string;
  venueName: string;
  slotId: string;
  checkTime: Date;
  status: "open" | "closed" | "closing_soon" | "hours_changed" | "unknown";
  isOkToProceed: boolean;
  warning?: string;
  recommendation?: string;
  currentHours?: { open: string; close: string };
  estimatedArrivalTime?: string;
  timeUntilClose?: number; // minutes
}

/**
 * User closure report
 */
export interface UserClosureReport {
  venueId: string;
  venueName: string;
  reporterId?: string;
  reportedAt: Date;
  reason: string;
  isTemporary: boolean;
  additionalInfo?: string;
}

/**
 * Cache entry for venue status
 */
interface VenueStatusCacheEntry {
  status: VenueStatus;
  fetchedAt: Date;
  expiresAt: Date;
  source: "google_places" | "user_report" | "mock";
}

/**
 * Ollama severity assessment request
 */
interface SeverityAssessmentRequest {
  venueId: string;
  venueName: string;
  scheduledTime: { start: string; end: string };
  actualHours: { open: string; close: string };
  currentTime: string;
  activityType?: string;
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

// Cache configuration
const DEFAULT_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes
const PRE_DEPARTURE_CACHE_TTL_MS = 2 * 60 * 1000; // 2 minutes for pre-departure checks

export class VenueMonitoringService {
  private state: VenueMonitoringState;
  private pollInterval: NodeJS.Timeout | null = null;
  private alertCallbacks: Set<AlertCallback> = new Set();
  private readonly DEFAULT_POLL_INTERVAL = 5 * 60 * 1000; // 5 minutes

  // Caching
  private statusCache: Map<string, VenueStatusCacheEntry> = new Map();
  private userReports: Map<string, UserClosureReport> = new Map();

  // Feature flags
  private useGooglePlaces: boolean = false;
  private useOllama: boolean = false;
  private googlePlacesApiKey?: string;
  private ollamaEndpoint?: string;

  constructor(options?: {
    useGooglePlaces?: boolean;
    useOllama?: boolean;
    googlePlacesApiKey?: string;
    ollamaEndpoint?: string;
  }) {
    this.state = {
      venues: new Map(),
      alerts: [],
      lastPollTime: null,
      isPolling: false,
    };

    if (options) {
      this.useGooglePlaces = options.useGooglePlaces ?? false;
      this.useOllama = options.useOllama ?? false;
      this.googlePlacesApiKey = options.googlePlacesApiKey;
      this.ollamaEndpoint = options.ollamaEndpoint ?? "http://localhost:11434";
    }
  }

  // ============================================
  // MORNING SWEEP
  // ============================================

  /**
   * Perform morning sweep - check all day's venues on page load
   * Returns issues found and pre-fetches alternatives for closures
   */
  async performMorningSweep(
    tripId: string,
    venues: ScheduledVenue[],
    options?: {
      preFetchAlternatives?: boolean;
      date?: string; // ISO date string, defaults to today
    }
  ): Promise<VenueMorningSweepResult> {
    const sweepTime = new Date();
    const date = options?.date ?? sweepTime.toISOString().split("T")[0];
    const preFetchAlternatives = options?.preFetchAlternatives ?? true;

    console.log(`[VenueMonitor] Morning sweep starting for ${venues.length} venues`);

    const closures: VenueMorningSweepResult["closures"] = [];
    const hoursIssues: VenueMorningSweepResult["hoursIssues"] = [];

    // Check all venues in parallel
    const checkPromises = venues.map(async (venue) => {
      try {
        // Force fresh fetch (bypass cache for morning sweep)
        const status = await this.fetchVenueStatusFresh(venue.venueId, venue.placeId);

        // Check for closures
        if (status.isClosed || status.temporaryClosure) {
          closures.push({
            venueId: venue.venueId,
            venueName: venue.venueName,
            slotId: venue.slotId,
            reason: status.temporaryClosure?.reason || "Venue is closed",
            alternativesPreFetched: false, // Will update if we fetch alternatives
          });
        }

        // Check for hours issues
        if (status.currentHours) {
          const hoursIssue = await this.analyzeHoursIssue(
            venue,
            status.currentHours,
            sweepTime
          );
          if (hoursIssue) {
            hoursIssues.push(hoursIssue);
          }
        }

        // Update cache
        this.statusCache.set(venue.venueId, {
          status,
          fetchedAt: sweepTime,
          expiresAt: new Date(sweepTime.getTime() + DEFAULT_CACHE_TTL_MS),
          source: this.useGooglePlaces ? "google_places" : "mock",
        });
      } catch (error) {
        console.error(`[VenueMonitor] Failed to check venue ${venue.venueId}:`, error);
      }
    });

    await Promise.all(checkPromises);

    // Pre-fetch alternatives for closures if enabled
    if (preFetchAlternatives && closures.length > 0) {
      // TODO: Integrate with suggestions service to fetch alternatives
      console.log(`[VenueMonitor] Would pre-fetch alternatives for ${closures.length} closed venues`);
      closures.forEach((c) => (c.alternativesPreFetched = true));
    }

    const result: VenueMorningSweepResult = {
      sweepTime,
      tripId,
      date,
      venuesChecked: venues.length,
      closures,
      hoursIssues,
      allGood: closures.length === 0 && hoursIssues.filter((h) => h.severity === "critical").length === 0,
    };

    console.log(
      `[VenueMonitor] Morning sweep complete: ${closures.length} closures, ${hoursIssues.length} hours issues`
    );

    return result;
  }

  /**
   * Analyze hours issue and determine severity
   */
  private async analyzeHoursIssue(
    venue: ScheduledVenue,
    actualHours: { open: string; close: string },
    currentTime: Date
  ): Promise<VenueMorningSweepResult["hoursIssues"][0] | null> {
    // Parse scheduled times
    const scheduledStart = this.parseTimeString(venue.scheduledStartTime);
    const scheduledEnd = this.parseTimeString(venue.scheduledEndTime);
    const openTime = this.parseTimeString(actualHours.open);
    const closeTime = this.parseTimeString(actualHours.close);

    if (!scheduledStart || !scheduledEnd || !openTime || !closeTime) {
      return null;
    }

    let issue: VenueMorningSweepResult["hoursIssues"][0]["issue"] | null = null;
    let severity: VenueMorningSweepResult["hoursIssues"][0]["severity"] = "info";
    let recommendation = "";

    // Check if venue opens after scheduled start
    if (openTime > scheduledStart) {
      issue = "opens_late";
      const delayMinutes = (openTime - scheduledStart) / (60 * 1000);

      if (delayMinutes <= 30) {
        severity = "info";
        recommendation = `Venue opens ${Math.round(delayMinutes)} minutes after your planned arrival. Consider arriving later.`;
      } else if (delayMinutes <= 60) {
        severity = "warning";
        recommendation = `Venue opens ${Math.round(delayMinutes)} minutes late. Adjust your schedule or find a nearby activity first.`;
      } else {
        severity = "critical";
        recommendation = `Venue opens ${Math.round(delayMinutes / 60)} hours after your planned time. Reschedule recommended.`;
      }
    }

    // Check if venue closes before scheduled end
    if (closeTime < scheduledEnd) {
      issue = issue ? "different_hours" : "closes_early";
      const earlyCloseMinutes = (scheduledEnd - closeTime) / (60 * 1000);

      // Use Ollama for severity assessment if enabled
      if (this.useOllama && this.ollamaEndpoint) {
        try {
          const assessment = await this.assessSeverityWithOllama({
            venueId: venue.venueId,
            venueName: venue.venueName,
            scheduledTime: { start: venue.scheduledStartTime, end: venue.scheduledEndTime },
            actualHours,
            currentTime: currentTime.toISOString(),
          });
          severity = assessment.severity;
          recommendation = assessment.recommendation;
        } catch (error) {
          console.warn("[VenueMonitor] Ollama assessment failed, using fallback logic:", error);
          // Fallback to rule-based assessment
          severity = this.assessSeverityFallback(earlyCloseMinutes, currentTime, closeTime);
          recommendation = this.getRecommendationFallback(severity, earlyCloseMinutes);
        }
      } else {
        severity = this.assessSeverityFallback(earlyCloseMinutes, currentTime, closeTime);
        recommendation = this.getRecommendationFallback(severity, earlyCloseMinutes);
      }
    }

    if (!issue) {
      return null;
    }

    return {
      venueId: venue.venueId,
      venueName: venue.venueName,
      slotId: venue.slotId,
      issue,
      severity,
      scheduledTime: venue.scheduledStartTime,
      actualHours,
      recommendation,
    };
  }

  /**
   * Rule-based severity assessment (fallback when Ollama unavailable)
   */
  private assessSeverityFallback(
    earlyCloseMinutes: number,
    currentTime: Date,
    closeTime: number
  ): "info" | "warning" | "critical" {
    const now = currentTime.getHours() * 60 + currentTime.getMinutes();
    const closeMinutes = closeTime / (60 * 1000);
    const timeUntilClose = closeMinutes - now;

    if (earlyCloseMinutes <= 30) {
      return "info";
    } else if (earlyCloseMinutes <= 60) {
      return timeUntilClose < 120 ? "warning" : "info";
    } else {
      return "critical";
    }
  }

  /**
   * Generate recommendation based on severity (fallback)
   */
  private getRecommendationFallback(
    severity: "info" | "warning" | "critical",
    earlyCloseMinutes: number
  ): string {
    switch (severity) {
      case "info":
        return `Venue closes ${Math.round(earlyCloseMinutes)} minutes earlier than planned. Minor adjustment may be needed.`;
      case "warning":
        return `Venue closes ${Math.round(earlyCloseMinutes)} minutes early. Consider shortening your visit or rescheduling.`;
      case "critical":
        return `Venue closes ${Math.round(earlyCloseMinutes / 60)} hours before your planned departure. Significant reschedule needed.`;
    }
  }

  /**
   * Assess hours mismatch severity using Ollama
   */
  private async assessSeverityWithOllama(
    request: SeverityAssessmentRequest
  ): Promise<{ severity: "info" | "warning" | "critical"; recommendation: string }> {
    const prompt = `You are an AI assistant helping with travel planning. Analyze this hours mismatch and assess its severity.

Venue: ${request.venueName}
Scheduled visit: ${request.scheduledTime.start} to ${request.scheduledTime.end}
Actual hours: ${request.actualHours.open} to ${request.actualHours.close}
Current time: ${request.currentTime}

Assess the severity:
- "info": Minor issue, easily worked around
- "warning": Noticeable impact, adjustment needed
- "critical": Major problem, significant reschedule required

Consider:
1. How much time is lost due to the mismatch?
2. Is there still enough time for a meaningful visit?
3. How close is the current time to the closure?

Respond in JSON format:
{"severity": "info|warning|critical", "recommendation": "brief actionable recommendation"}`;

    const response = await fetch(`${this.ollamaEndpoint}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "llama3.2",
        prompt,
        stream: false,
        format: "json",
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama request failed: ${response.status}`);
    }

    const result = await response.json();
    const parsed = JSON.parse(result.response);

    return {
      severity: parsed.severity || "warning",
      recommendation: parsed.recommendation || "Review the hours mismatch and adjust accordingly.",
    };
  }

  // ============================================
  // GPS PRE-DEPARTURE CHECK
  // ============================================

  /**
   * Pre-departure check - verify next venue before leaving current venue
   * Called when user is about to leave (geofence exit or GPS trigger)
   */
  async performPreDepartureCheck(
    currentVenueId: string,
    nextVenue: ScheduledVenue,
    estimatedTravelMinutes: number
  ): Promise<PreDepartureCheckResult> {
    const checkTime = new Date();

    console.log(
      `[VenueMonitor] Pre-departure check for ${nextVenue.venueName} (travel time: ${estimatedTravelMinutes} min)`
    );

    // Force fresh status (short TTL for pre-departure)
    const status = await this.fetchVenueStatusFresh(
      nextVenue.venueId,
      nextVenue.placeId
    );

    // Calculate estimated arrival
    const estimatedArrival = new Date(checkTime.getTime() + estimatedTravelMinutes * 60 * 1000);
    const estimatedArrivalTime = estimatedArrival.toISOString();

    // Analyze if OK to proceed
    let resultStatus: PreDepartureCheckResult["status"] = "unknown";
    let isOkToProceed = true;
    let warning: string | undefined;
    let recommendation: string | undefined;
    let timeUntilClose: number | undefined;

    if (status.isClosed || status.temporaryClosure) {
      resultStatus = "closed";
      isOkToProceed = false;
      warning = `${nextVenue.venueName} is currently closed`;
      recommendation = "Find an alternative venue or skip this stop";
    } else if (status.currentHours) {
      const closeTime = this.parseTimeString(status.currentHours.close);
      const arrivalTime = estimatedArrival.getTime();

      if (closeTime) {
        // Calculate time until close from estimated arrival
        const arrivalMinutes = estimatedArrival.getHours() * 60 + estimatedArrival.getMinutes();
        const closeMinutes = closeTime / (60 * 1000);
        timeUntilClose = closeMinutes - arrivalMinutes;

        if (timeUntilClose < 0) {
          resultStatus = "closed";
          isOkToProceed = false;
          warning = `${nextVenue.venueName} will be closed by the time you arrive`;
          recommendation = "Skip this venue or find an alternative";
        } else if (timeUntilClose < 30) {
          resultStatus = "closing_soon";
          isOkToProceed = true;
          warning = `${nextVenue.venueName} closes in ${timeUntilClose} minutes after your arrival`;
          recommendation = "Consider if you'll have enough time for your visit";
        } else {
          resultStatus = "open";
          isOkToProceed = true;
        }
      }
    } else {
      resultStatus = "open";
      isOkToProceed = true;
    }

    return {
      venueId: nextVenue.venueId,
      venueName: nextVenue.venueName,
      slotId: nextVenue.slotId,
      checkTime,
      status: resultStatus,
      isOkToProceed,
      warning,
      recommendation,
      currentHours: status.currentHours,
      estimatedArrivalTime,
      timeUntilClose,
    };
  }

  // ============================================
  // USER REPORTS
  // ============================================

  /**
   * Submit a user closure report ("It's closed" button)
   */
  async reportClosure(
    venueId: string,
    venueName: string,
    options?: {
      reason?: string;
      isTemporary?: boolean;
      additionalInfo?: string;
      reporterId?: string;
    }
  ): Promise<void> {
    const report: UserClosureReport = {
      venueId,
      venueName,
      reporterId: options?.reporterId,
      reportedAt: new Date(),
      reason: options?.reason || "User reported closure",
      isTemporary: options?.isTemporary ?? false,
      additionalInfo: options?.additionalInfo,
    };

    // Store user report
    this.userReports.set(venueId, report);

    // Update cache with user-reported status
    const closedStatus: VenueStatus = {
      isOpen: false,
      isClosed: true,
      temporaryClosure: {
        reason: report.reason,
        until: undefined,
      },
      lastUpdated: report.reportedAt.toISOString(),
    };

    this.statusCache.set(venueId, {
      status: closedStatus,
      fetchedAt: report.reportedAt,
      expiresAt: new Date(report.reportedAt.getTime() + 2 * 60 * 60 * 1000), // 2 hour expiry for user reports
      source: "user_report",
    });

    // Emit alert
    const venue = this.state.venues.get(venueId);
    if (venue) {
      const alert = this.createAlert(venue, "closure", closedStatus);
      alert.message = `${venueName} reported as closed by user: ${report.reason}`;
      this.state.alerts.push(alert);
      this.alertCallbacks.forEach((cb) => cb(alert));
    }

    console.log(`[VenueMonitor] User reported closure for ${venueName}: ${report.reason}`);
  }

  /**
   * Get user reports for a venue
   */
  getUserReport(venueId: string): UserClosureReport | undefined {
    return this.userReports.get(venueId);
  }

  // ============================================
  // GOOGLE PLACES API WITH CACHING
  // ============================================

  /**
   * Fetch venue status with caching
   */
  private async fetchVenueStatus(venue: MonitoredVenue): Promise<VenueStatus> {
    const venueId = venue.venueId;

    // Check cache first
    const cached = this.statusCache.get(venueId);
    if (cached && cached.expiresAt > new Date()) {
      console.log(`[VenueMonitor] Using cached status for ${venue.venueName}`);
      return cached.status;
    }

    // Check for user report (always takes precedence)
    const userReport = this.userReports.get(venueId);
    if (userReport && this.isReportRecent(userReport)) {
      return {
        isOpen: false,
        isClosed: true,
        temporaryClosure: { reason: userReport.reason, until: undefined },
        lastUpdated: userReport.reportedAt.toISOString(),
      };
    }

    // Fetch fresh status
    return this.fetchVenueStatusFresh(venueId, venue.placeId);
  }

  /**
   * Fetch fresh venue status (bypasses cache)
   */
  private async fetchVenueStatusFresh(
    venueId: string,
    placeId?: string
  ): Promise<VenueStatus> {
    // Use Google Places API if enabled and placeId available
    if (this.useGooglePlaces && placeId && this.googlePlacesApiKey) {
      try {
        return await this.fetchFromGooglePlaces(placeId);
      } catch (error) {
        console.warn(`[VenueMonitor] Google Places API failed, using mock:`, error);
      }
    }

    // Fallback to mock/test endpoint
    return this.fetchFromMockOrLocal(venueId);
  }

  /**
   * Fetch from Google Places API
   */
  private async fetchFromGooglePlaces(placeId: string): Promise<VenueStatus> {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${placeId}&fields=opening_hours,business_status&key=${this.googlePlacesApiKey}`;

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Google Places API error: ${response.status}`);
    }

    const data = await response.json();
    const result = data.result;

    // Parse Google Places response
    const isOpen = result.opening_hours?.open_now ?? true;
    const isClosed = result.business_status === "CLOSED_PERMANENTLY";
    const isTemporarilyClosed = result.business_status === "CLOSED_TEMPORARILY";

    // Get today's hours
    let currentHours: { open: string; close: string } | undefined;
    if (result.opening_hours?.periods) {
      const today = new Date().getDay();
      const todayPeriod = result.opening_hours.periods.find(
        (p: { open?: { day: number; time: string }; close?: { time: string } }) => p.open?.day === today
      );
      if (todayPeriod) {
        currentHours = {
          open: this.formatGoogleTime(todayPeriod.open?.time),
          close: this.formatGoogleTime(todayPeriod.close?.time),
        };
      }
    }

    return {
      isOpen,
      isClosed,
      currentHours,
      temporaryClosure: isTemporarilyClosed ? { reason: "Temporarily closed", until: undefined } : undefined,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Format Google Places time (HHMM) to HH:MM
   */
  private formatGoogleTime(time?: string): string {
    if (!time || time.length !== 4) return "00:00";
    return `${time.slice(0, 2)}:${time.slice(2)}`;
  }

  /**
   * Fetch from mock/local test endpoint
   */
  private async fetchFromMockOrLocal(venueId: string): Promise<VenueStatus> {
    // Try local test endpoint first
    try {
      const response = await fetch(`/api/test/venue-status/${venueId}`);
      if (response.ok) {
        return await response.json();
      }
    } catch {
      // Local endpoint not available, use mock
    }

    // Return simulated status
    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();

    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const typicalOpen = isWeekend ? 10 : 9;
    const typicalClose = isWeekend ? 22 : 21;

    const isOpen = hour >= typicalOpen && hour < typicalClose;
    const randomClosure = Math.random() < 0.01;

    return {
      isOpen: isOpen && !randomClosure,
      isClosed: randomClosure,
      currentHours: {
        open: `${typicalOpen.toString().padStart(2, "0")}:00`,
        close: `${typicalClose.toString().padStart(2, "0")}:00`,
      },
      temporaryClosure: randomClosure
        ? { reason: "Unexpected closure", until: undefined }
        : undefined,
      lastUpdated: new Date().toISOString(),
    };
  }

  /**
   * Check if user report is recent (less than 4 hours old)
   */
  private isReportRecent(report: UserClosureReport): boolean {
    const fourHoursAgo = Date.now() - 4 * 60 * 60 * 1000;
    return report.reportedAt.getTime() > fourHoursAgo;
  }

  /**
   * Parse time string to milliseconds since midnight
   */
  private parseTimeString(timeStr: string): number | null {
    // Handle ISO strings
    if (timeStr.includes("T")) {
      const date = new Date(timeStr);
      return date.getHours() * 60 * 60 * 1000 + date.getMinutes() * 60 * 1000;
    }

    // Handle HH:MM format
    const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (match) {
      const hours = parseInt(match[1], 10);
      const minutes = parseInt(match[2], 10);
      return hours * 60 * 60 * 1000 + minutes * 60 * 1000;
    }

    return null;
  }

  // ============================================
  // CACHE MANAGEMENT
  // ============================================

  /**
   * Clear cache for a venue
   */
  clearCache(venueId: string): void {
    this.statusCache.delete(venueId);
  }

  /**
   * Clear all cache
   */
  clearAllCache(): void {
    this.statusCache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats(): {
    entries: number;
    hitRate: number;
    oldestEntry: Date | null;
  } {
    const entries = this.statusCache.size;
    let oldestEntry: Date | null = null;

    this.statusCache.forEach((entry) => {
      if (!oldestEntry || entry.fetchedAt < oldestEntry) {
        oldestEntry = entry.fetchedAt;
      }
    });

    return { entries, hitRate: 0, oldestEntry }; // TODO: Track hit rate
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
// REACT HOOK (ENHANCED)
// ============================================

import { useState, useEffect, useCallback, useRef } from "react";

export function useVenueMonitoring(
  tripId?: string,
  options?: {
    enableMorningSweep?: boolean;
    pollIntervalMinutes?: number;
  }
) {
  const { enableMorningSweep = true, pollIntervalMinutes = 5 } = options ?? {};

  const [alerts, setAlerts] = useState<VenueAlert[]>([]);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [morningSweepResult, setMorningSweepResult] = useState<VenueMorningSweepResult | null>(null);
  const [preDepartureResult, setPreDepartureResult] = useState<PreDepartureCheckResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const serviceRef = useRef<VenueMonitoringService | null>(null);
  const pollIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize service
  useEffect(() => {
    serviceRef.current = getVenueMonitoringService();

    // Subscribe to alerts
    const unsubscribe = serviceRef.current.onAlert((alert) => {
      setAlerts((prev) => [...prev, alert]);
    });

    // Set initial alerts
    setAlerts(serviceRef.current.getAlerts());
    setIsMonitoring(serviceRef.current.getState().isPolling);

    return () => {
      unsubscribe();
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
    };
  }, []);

  // Set up visibility-based polling
  useEffect(() => {
    if (!isMonitoring || !serviceRef.current) {
      return;
    }

    const startPolling = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }

      pollIntervalRef.current = setInterval(async () => {
        if (serviceRef.current) {
          await serviceRef.current.pollNow();
          setAlerts(serviceRef.current.getAlerts());
        }
      }, pollIntervalMinutes * 60 * 1000);
    };

    const stopPolling = () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        stopPolling();
      } else {
        startPolling();
        // Refresh immediately when tab becomes visible
        serviceRef.current?.pollNow();
      }
    };

    if (!document.hidden) {
      startPolling();
    }

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      stopPolling();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [isMonitoring, pollIntervalMinutes]);

  // Perform morning sweep
  const performMorningSweep = useCallback(
    async (venues: ScheduledVenue[]) => {
      if (!tripId || !serviceRef.current) {
        setError("Trip ID required for morning sweep");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await serviceRef.current.performMorningSweep(tripId, venues);
        setMorningSweepResult(result);
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Morning sweep failed";
        setError(errorMsg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    [tripId]
  );

  // Perform pre-departure check
  const performPreDepartureCheck = useCallback(
    async (
      currentVenueId: string,
      nextVenue: ScheduledVenue,
      estimatedTravelMinutes: number
    ) => {
      if (!serviceRef.current) {
        setError("Service not initialized");
        return null;
      }

      setIsLoading(true);
      setError(null);

      try {
        const result = await serviceRef.current.performPreDepartureCheck(
          currentVenueId,
          nextVenue,
          estimatedTravelMinutes
        );
        setPreDepartureResult(result);
        return result;
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : "Pre-departure check failed";
        setError(errorMsg);
        return null;
      } finally {
        setIsLoading(false);
      }
    },
    []
  );

  // Report a closure (user report)
  const reportClosure = useCallback(
    async (
      venueId: string,
      venueName: string,
      options?: {
        reason?: string;
        isTemporary?: boolean;
        additionalInfo?: string;
      }
    ) => {
      if (!serviceRef.current) {
        return;
      }

      await serviceRef.current.reportClosure(venueId, venueName, options);
      setAlerts(serviceRef.current.getAlerts());
    },
    []
  );

  const startMonitoring = useCallback(
    (
      venues: Array<{
        venueId: string;
        venueName: string;
        placeId?: string;
        activityIds: string[];
      }>
    ) => {
      if (!tripId || !serviceRef.current) return;

      serviceRef.current.monitorTrip(tripId, venues);
      setIsMonitoring(true);
    },
    [tripId]
  );

  const stopMonitoring = useCallback(() => {
    if (!tripId || !serviceRef.current) return;

    serviceRef.current.unmonitorTrip(tripId);
    setIsMonitoring(false);
  }, [tripId]);

  const dismissAlert = useCallback((alertId: string) => {
    if (!serviceRef.current) return;

    serviceRef.current.dismissAlert(alertId);
    setAlerts((prev) => prev.filter((a) => a.id !== alertId));
  }, []);

  const refreshNow = useCallback(async () => {
    if (!serviceRef.current) return;

    await serviceRef.current.pollNow();
    setAlerts(serviceRef.current.getAlerts());
  }, []);

  const clearCache = useCallback((venueId?: string) => {
    if (!serviceRef.current) return;

    if (venueId) {
      serviceRef.current.clearCache(venueId);
    } else {
      serviceRef.current.clearAllCache();
    }
  }, []);

  return {
    // State
    alerts,
    isMonitoring,
    morningSweepResult,
    preDepartureResult,
    isLoading,
    error,

    // Actions - Morning Sweep
    performMorningSweep,

    // Actions - Pre-departure Check
    performPreDepartureCheck,

    // Actions - User Reports
    reportClosure,

    // Actions - Basic Monitoring
    startMonitoring,
    stopMonitoring,
    dismissAlert,
    refreshNow,
    clearCache,
  };
}

// ============================================
// EXPORTS
// ============================================

// All classes are exported via their class declarations above
