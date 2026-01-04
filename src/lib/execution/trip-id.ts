/**
 * Trip ID Generation and Management
 *
 * Generates unique, descriptive trip IDs for connecting
 * the trip page with the execution simulator.
 *
 * Format: {destination}-{startDate}-{partySize}p-{days}d-{code}
 * Example: tokyo-0118-2p-5d-A3F2
 */

export interface TripIdParams {
  destination: string;
  startDate?: string;      // "2025-01-18" format
  partySize?: number;      // Total travelers
  tripDays?: number;       // Length of trip in days
}

/**
 * Generate a descriptive trip ID
 * Format: {destination}-{MMDD}-{partySize}p-{days}d-{code}
 * Example: tokyo-0118-2p-5d-A3F2
 */
export function generateTripId(params: TripIdParams | string): string {
  // Handle legacy string-only calls
  if (typeof params === "string") {
    params = { destination: params };
  }

  const { destination, startDate, partySize, tripDays } = params;

  // Destination prefix (lowercase, letters only, max 8 chars)
  const destPrefix = destination
    ? destination.toLowerCase().replace(/[^a-z]/g, '').slice(0, 8)
    : 'trip';

  // Date part (MMDD format)
  let datePart = '';
  if (startDate) {
    const date = new Date(startDate);
    if (!isNaN(date.getTime())) {
      const month = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      datePart = `${month}${day}`;
    }
  }

  // Party size part
  const partySizePart = partySize ? `${partySize}p` : '';

  // Trip length part
  const tripDaysPart = tripDays ? `${tripDays}d` : '';

  // Generate 4 character alphanumeric code
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }

  // Build the ID with available parts
  const parts = [destPrefix];
  if (datePart) parts.push(datePart);
  if (partySizePart) parts.push(partySizePart);
  if (tripDaysPart) parts.push(tripDaysPart);
  parts.push(code);

  return parts.join('-');
}

/**
 * Validate a trip ID format
 * Supports both old format (prefix-CODE) and new format (prefix-MMDD-Xp-Xd-CODE)
 */
export function isValidTripId(tripId: string): boolean {
  // New format: destination-MMDD-Xp-Xd-CODE
  const newFormat = /^[a-z]{1,8}-\d{4}-\d+p-\d+d-[A-Z0-9]{4}$/;
  // Old format: prefix-CODE
  const oldFormat = /^[a-z]{1,8}-[A-Z0-9]{4}$/;
  // Partial formats (some parts optional)
  const partialFormat = /^[a-z]{1,8}(-\d{4})?(-\d+p)?(-\d+d)?-[A-Z0-9]{4}$/;

  return newFormat.test(tripId) || oldFormat.test(tripId) || partialFormat.test(tripId);
}

/**
 * Parse a trip ID to extract its components
 */
export function parseTripId(tripId: string): {
  destination: string;
  date?: { month: number; day: number };
  partySize?: number;
  tripDays?: number;
  code: string;
} | null {
  const parts = tripId.split('-');
  if (parts.length < 2) return null;

  const destination = parts[0];
  const code = parts[parts.length - 1];

  let date: { month: number; day: number } | undefined;
  let partySize: number | undefined;
  let tripDays: number | undefined;

  for (let i = 1; i < parts.length - 1; i++) {
    const part = parts[i];

    // Check for date (4 digits)
    if (/^\d{4}$/.test(part)) {
      date = {
        month: parseInt(part.slice(0, 2), 10),
        day: parseInt(part.slice(2, 4), 10),
      };
    }
    // Check for party size (Xp)
    else if (/^\d+p$/.test(part)) {
      partySize = parseInt(part.slice(0, -1), 10);
    }
    // Check for trip days (Xd)
    else if (/^\d+d$/.test(part)) {
      tripDays = parseInt(part.slice(0, -1), 10);
    }
  }

  return { destination, date, partySize, tripDays, code };
}

/**
 * Storage key for persisting trip IDs
 */
const TRIP_ID_STORAGE_KEY = 'layla_current_trip_id';

/**
 * Store the current trip ID in localStorage
 */
export function storeCurrentTripId(tripId: string): void {
  if (typeof window !== 'undefined') {
    localStorage.setItem(TRIP_ID_STORAGE_KEY, tripId);
  }
}

/**
 * Get the current trip ID from localStorage
 */
export function getCurrentTripId(): string | null {
  if (typeof window !== 'undefined') {
    return localStorage.getItem(TRIP_ID_STORAGE_KEY);
  }
  return null;
}

/**
 * Clear the current trip ID from localStorage
 */
export function clearCurrentTripId(): void {
  if (typeof window !== 'undefined') {
    localStorage.removeItem(TRIP_ID_STORAGE_KEY);
  }
}
