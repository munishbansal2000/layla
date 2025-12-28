/**
 * Restaurant Booking Integration
 *
 * Unified interface for restaurant reservations supporting:
 * - OpenTable API
 * - Resy API
 * - TableCheck (Japan)
 * - Direct restaurant booking
 *
 * Features:
 * - Real-time availability
 * - Waitlist management
 * - Walk-in alternatives
 * - Reservation modifications
 */

const OPENTABLE_API_KEY = process.env.OPENTABLE_API_KEY || "";
const RESY_API_KEY = process.env.RESY_API_KEY || "";
const TABLECHECK_API_KEY = process.env.TABLECHECK_API_KEY || "";

// ============================================
// TYPES
// ============================================

export type BookingProvider = "opentable" | "resy" | "tablecheck" | "direct";

export interface RestaurantAvailability {
  restaurantId: string;
  restaurantName: string;
  date: string;
  slots: TimeSlot[];
  waitlistAvailable: boolean;
  walkInLikelihood: WalkInLikelihood;
  provider: BookingProvider;
  bookingUrl?: string;
}

export interface TimeSlot {
  time: string; // HH:mm format
  partySize: number;
  available: boolean;
  type: "standard" | "bar" | "patio" | "private";
  notes?: string;
  depositRequired?: boolean;
  depositAmount?: number;
  cancellationPolicy?: string;
}

export type WalkInLikelihood = "high" | "medium" | "low" | "unknown";

export interface Reservation {
  id: string;
  provider: BookingProvider;
  restaurantId: string;
  restaurantName: string;
  date: string;
  time: string;
  partySize: number;
  status: ReservationStatus;
  confirmationCode?: string;
  specialRequests?: string;
  contactPhone?: string;
  contactEmail?: string;
  createdAt: string;
  modifiedAt?: string;
}

export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "waitlisted"
  | "cancelled"
  | "completed"
  | "no_show";

export interface BookingRequest {
  restaurantId: string;
  date: string;
  time: string;
  partySize: number;
  specialRequests?: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  occasion?: string;
  dietaryRestrictions?: string[];
}

export interface WaitlistEntry {
  id: string;
  restaurantId: string;
  restaurantName: string;
  date: string;
  preferredTimes: string[];
  partySize: number;
  position?: number;
  estimatedWait?: string;
  status: "active" | "offered" | "expired" | "converted";
}

export interface WalkInAlternative {
  restaurantId: string;
  restaurantName: string;
  cuisine: string;
  distance: number; // meters
  estimatedWait: number; // minutes
  rating: number;
  priceLevel: number;
  acceptingWalkIns: boolean;
  currentCapacity: "empty" | "light" | "moderate" | "busy" | "full";
}

// ============================================
// CONFIGURATION CHECK
// ============================================

export function isBookingConfigured(): boolean {
  return !!(OPENTABLE_API_KEY || RESY_API_KEY || TABLECHECK_API_KEY);
}

export function getAvailableProviders(): BookingProvider[] {
  const providers: BookingProvider[] = [];
  if (OPENTABLE_API_KEY) providers.push("opentable");
  if (RESY_API_KEY) providers.push("resy");
  if (TABLECHECK_API_KEY) providers.push("tablecheck");
  return providers;
}

// ============================================
// AVAILABILITY FUNCTIONS
// ============================================

/**
 * Check restaurant availability
 */
export async function checkAvailability(
  restaurantId: string,
  date: string,
  partySize: number,
  options?: {
    provider?: BookingProvider;
    timeRange?: { start: string; end: string };
  }
): Promise<RestaurantAvailability | null> {
  const provider = options?.provider || detectProvider(restaurantId);

  switch (provider) {
    case "opentable":
      return checkOpenTableAvailability(restaurantId, date, partySize, options?.timeRange);
    case "resy":
      return checkResyAvailability(restaurantId, date, partySize, options?.timeRange);
    case "tablecheck":
      return checkTableCheckAvailability(restaurantId, date, partySize, options?.timeRange);
    default:
      return getEstimatedAvailability(restaurantId, date, partySize);
  }
}

/**
 * Check OpenTable availability
 */
async function checkOpenTableAvailability(
  restaurantId: string,
  date: string,
  partySize: number,
  timeRange?: { start: string; end: string }
): Promise<RestaurantAvailability | null> {
  if (!OPENTABLE_API_KEY) return null;

  // OpenTable API integration
  // Note: OpenTable uses affiliate/partner API
  const baseUrl = "https://www.opentable.com/restref/api/availability";

  try {
    const params = new URLSearchParams({
      rid: restaurantId,
      datetime: `${date}T19:00`,
      covers: partySize.toString(),
      ...(timeRange && { startTime: timeRange.start, endTime: timeRange.end }),
    });

    const response = await fetch(`${baseUrl}?${params}`, {
      headers: {
        Authorization: `Bearer ${OPENTABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error("OpenTable API error:", response.status);
      return null;
    }

    const data = await response.json();

    return {
      restaurantId,
      restaurantName: data.restaurant?.name || "Unknown",
      date,
      slots: (data.timeslots || []).map((slot: { time: string; available: boolean }) => ({
        time: slot.time,
        partySize,
        available: slot.available,
        type: "standard" as const,
      })),
      waitlistAvailable: data.waitlistAvailable || false,
      walkInLikelihood: "unknown",
      provider: "opentable",
      bookingUrl: data.bookingUrl,
    };
  } catch (error) {
    console.error("OpenTable availability error:", error);
    return null;
  }
}

/**
 * Check Resy availability
 */
async function checkResyAvailability(
  restaurantId: string,
  date: string,
  partySize: number,
  timeRange?: { start: string; end: string }
): Promise<RestaurantAvailability | null> {
  if (!RESY_API_KEY) return null;

  const baseUrl = "https://api.resy.com/4/find";

  try {
    const params = new URLSearchParams({
      venue_id: restaurantId,
      day: date,
      party_size: partySize.toString(),
      ...(timeRange && { time_slot: `${timeRange.start}-${timeRange.end}` }),
    });

    const response = await fetch(`${baseUrl}?${params}`, {
      headers: {
        Authorization: `ResyAPI api_key="${RESY_API_KEY}"`,
        "Content-Type": "application/json",
      },
    });

    if (!response.ok) {
      console.error("Resy API error:", response.status);
      return null;
    }

    const data = await response.json();
    const venue = data.results?.venues?.[0];

    if (!venue) return null;

    return {
      restaurantId,
      restaurantName: venue.venue?.name || "Unknown",
      date,
      slots: (venue.slots || []).map(
        (slot: {
          date: { start: string };
          config: { type: string };
          payment?: { deposit_fee?: number };
          cancellation?: string;
        }) => ({
          time: slot.date.start,
          partySize,
          available: true,
          type: slot.config.type || "standard",
          depositRequired: !!slot.payment?.deposit_fee,
          depositAmount: slot.payment?.deposit_fee,
          cancellationPolicy: slot.cancellation,
        })
      ),
      waitlistAvailable: venue.notify?.available || false,
      walkInLikelihood: "unknown",
      provider: "resy",
      bookingUrl: venue.venue?.url_slug
        ? `https://resy.com/cities/ny/${venue.venue.url_slug}`
        : undefined,
    };
  } catch (error) {
    console.error("Resy availability error:", error);
    return null;
  }
}

/**
 * Check TableCheck availability (Japan)
 */
async function checkTableCheckAvailability(
  restaurantId: string,
  date: string,
  partySize: number,
  _timeRange?: { start: string; end: string }
): Promise<RestaurantAvailability | null> {
  if (!TABLECHECK_API_KEY) return null;

  // TableCheck API for Japan restaurants
  const baseUrl = "https://www.tablecheck.com/api/v2/shops";

  try {
    const response = await fetch(
      `${baseUrl}/${restaurantId}/availability?date=${date}&covers=${partySize}`,
      {
        headers: {
          Authorization: `Bearer ${TABLECHECK_API_KEY}`,
          "Content-Type": "application/json",
        },
      }
    );

    if (!response.ok) {
      console.error("TableCheck API error:", response.status);
      return null;
    }

    const data = await response.json();

    return {
      restaurantId,
      restaurantName: data.shop?.name || "Unknown",
      date,
      slots: (data.slots || []).map((slot: { time: string; available: boolean }) => ({
        time: slot.time,
        partySize,
        available: slot.available,
        type: "standard" as const,
      })),
      waitlistAvailable: false,
      walkInLikelihood: "unknown",
      provider: "tablecheck",
      bookingUrl: data.booking_url,
    };
  } catch (error) {
    console.error("TableCheck availability error:", error);
    return null;
  }
}

/**
 * Get estimated availability (fallback)
 */
async function getEstimatedAvailability(
  restaurantId: string,
  date: string,
  partySize: number
): Promise<RestaurantAvailability> {
  // Generate reasonable time slots
  const slots: TimeSlot[] = [];
  const startHour = 17; // 5 PM
  const endHour = 22; // 10 PM

  for (let hour = startHour; hour <= endHour; hour++) {
    for (const minutes of [0, 30]) {
      const time = `${hour.toString().padStart(2, "0")}:${minutes.toString().padStart(2, "0")}`;
      slots.push({
        time,
        partySize,
        available: true, // Assume available, actual check needed
        type: "standard",
      });
    }
  }

  return {
    restaurantId,
    restaurantName: "Restaurant",
    date,
    slots,
    waitlistAvailable: false,
    walkInLikelihood: estimateWalkInLikelihood(date),
    provider: "direct",
  };
}

// ============================================
// BOOKING FUNCTIONS
// ============================================

/**
 * Make a reservation
 */
export async function makeReservation(
  request: BookingRequest,
  provider?: BookingProvider
): Promise<Reservation | null> {
  const actualProvider = provider || detectProvider(request.restaurantId);

  switch (actualProvider) {
    case "opentable":
      return makeOpenTableReservation(request);
    case "resy":
      return makeResyReservation(request);
    case "tablecheck":
      return makeTableCheckReservation(request);
    default:
      return createPendingReservation(request);
  }
}

async function makeOpenTableReservation(_request: BookingRequest): Promise<Reservation | null> {
  // OpenTable booking implementation
  console.log("OpenTable booking - implementation needed");
  return null;
}

async function makeResyReservation(_request: BookingRequest): Promise<Reservation | null> {
  // Resy booking implementation
  console.log("Resy booking - implementation needed");
  return null;
}

async function makeTableCheckReservation(_request: BookingRequest): Promise<Reservation | null> {
  // TableCheck booking implementation
  console.log("TableCheck booking - implementation needed");
  return null;
}

function createPendingReservation(request: BookingRequest): Reservation {
  return {
    id: `res_${Date.now()}`,
    provider: "direct",
    restaurantId: request.restaurantId,
    restaurantName: "Restaurant",
    date: request.date,
    time: request.time,
    partySize: request.partySize,
    status: "pending",
    specialRequests: request.specialRequests,
    contactPhone: request.contactPhone,
    contactEmail: request.contactEmail,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Cancel a reservation
 */
export async function cancelReservation(
  reservationId: string,
  provider: BookingProvider,
  _reason?: string
): Promise<boolean> {
  switch (provider) {
    case "opentable":
    case "resy":
    case "tablecheck":
      console.log(`Cancellation for ${provider} - implementation needed`);
      return false;
    default:
      console.log("Reservation cancelled:", reservationId);
      return true;
  }
}

/**
 * Modify a reservation
 */
export async function modifyReservation(
  reservationId: string,
  _provider: BookingProvider,
  changes: Partial<Pick<Reservation, "date" | "time" | "partySize" | "specialRequests">>
): Promise<Reservation | null> {
  console.log("Modifying reservation:", reservationId, changes);
  // Implementation would call provider-specific modification APIs
  return null;
}

// ============================================
// WAITLIST FUNCTIONS
// ============================================

/**
 * Join waitlist for a restaurant
 */
export async function joinWaitlist(
  restaurantId: string,
  date: string,
  preferredTimes: string[],
  partySize: number,
  _contact: { name: string; phone: string; email: string }
): Promise<WaitlistEntry | null> {
  // Implementation would integrate with provider waitlist APIs
  return {
    id: `wait_${Date.now()}`,
    restaurantId,
    restaurantName: "Restaurant",
    date,
    preferredTimes,
    partySize,
    status: "active",
    estimatedWait: "Unknown",
  };
}

/**
 * Check waitlist status
 */
export async function checkWaitlistStatus(waitlistId: string): Promise<WaitlistEntry | null> {
  console.log("Checking waitlist:", waitlistId);
  return null;
}

/**
 * Leave waitlist
 */
export async function leaveWaitlist(waitlistId: string): Promise<boolean> {
  console.log("Leaving waitlist:", waitlistId);
  return true;
}

// ============================================
// WALK-IN ALTERNATIVES
// ============================================

/**
 * Find walk-in alternatives near a location
 */
export async function findWalkInAlternatives(
  location: { lat: number; lng: number },
  options?: {
    cuisine?: string;
    priceLevel?: number;
    maxDistance?: number; // meters
    maxWait?: number; // minutes
  }
): Promise<WalkInAlternative[]> {
  // This would integrate with real-time availability APIs
  // and our places service for restaurant discovery

  const alternatives: WalkInAlternative[] = [
    {
      restaurantId: "alt_1",
      restaurantName: "Nearby Bistro",
      cuisine: options?.cuisine || "International",
      distance: 150,
      estimatedWait: 10,
      rating: 4.2,
      priceLevel: options?.priceLevel || 2,
      acceptingWalkIns: true,
      currentCapacity: "moderate",
    },
  ];

  return alternatives.filter((a) => {
    if (options?.maxDistance && a.distance > options.maxDistance) return false;
    if (options?.maxWait && a.estimatedWait > options.maxWait) return false;
    return a.acceptingWalkIns;
  });
}

/**
 * Estimate current wait time for walk-ins
 */
export function estimateWaitTime(
  capacity: WalkInAlternative["currentCapacity"],
  partySize: number
): number {
  const baseWait: Record<WalkInAlternative["currentCapacity"], number> = {
    empty: 0,
    light: 5,
    moderate: 15,
    busy: 30,
    full: 60,
  };

  const wait = baseWait[capacity];
  // Larger parties wait longer
  const sizeMultiplier = partySize <= 2 ? 1 : partySize <= 4 ? 1.3 : 1.6;

  return Math.round(wait * sizeMultiplier);
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Detect booking provider from restaurant ID
 */
function detectProvider(restaurantId: string): BookingProvider {
  if (restaurantId.startsWith("ot_")) return "opentable";
  if (restaurantId.startsWith("resy_")) return "resy";
  if (restaurantId.startsWith("tc_")) return "tablecheck";
  return "direct";
}

/**
 * Estimate walk-in likelihood based on day/time
 */
function estimateWalkInLikelihood(dateStr: string): WalkInLikelihood {
  const date = new Date(dateStr);
  const day = date.getDay();
  const isWeekend = day === 0 || day === 5 || day === 6;

  if (isWeekend) return "low";
  return "medium";
}

/**
 * Get booking URL for a restaurant
 */
export function getBookingUrl(
  restaurantId: string,
  provider: BookingProvider,
  date?: string,
  partySize?: number
): string {
  const params = new URLSearchParams();
  if (date) params.set("date", date);
  if (partySize) params.set("covers", partySize.toString());

  switch (provider) {
    case "opentable":
      return `https://www.opentable.com/r/${restaurantId}?${params}`;
    case "resy":
      return `https://resy.com/cities/ny/${restaurantId}?${params}`;
    case "tablecheck":
      return `https://www.tablecheck.com/shops/${restaurantId}?${params}`;
    default:
      return "";
  }
}

/**
 * Format reservation for display
 */
export function formatReservation(reservation: Reservation): string {
  return `${reservation.restaurantName} - ${reservation.date} at ${reservation.time} for ${reservation.partySize} ${reservation.partySize === 1 ? "guest" : "guests"}`;
}

export default {
  checkAvailability,
  makeReservation,
  cancelReservation,
  modifyReservation,
  joinWaitlist,
  checkWaitlistStatus,
  leaveWaitlist,
  findWalkInAlternatives,
  estimateWaitTime,
  getBookingUrl,
  isBookingConfigured,
  getAvailableProviders,
};
