/**
 * Test API Endpoint: Mock Venue Status
 *
 * Local development endpoint for testing venue monitoring
 * without hitting Google Places API.
 *
 * Supports:
 * - Configurable mock statuses via query params
 * - Random closures for testing
 * - Simulated hours based on time of day
 */

import { NextRequest, NextResponse } from "next/server";

// Mock venue database for testing
const MOCK_VENUES: Record<
  string,
  {
    name: string;
    isOpen: boolean;
    isClosed: boolean;
    hours: { open: string; close: string };
    temporaryClosure?: { reason: string; until?: string };
  }
> = {
  "venue-1": {
    name: "Tokyo Skytree",
    isOpen: true,
    isClosed: false,
    hours: { open: "09:00", close: "21:00" },
  },
  "venue-2": {
    name: "Senso-ji Temple",
    isOpen: true,
    isClosed: false,
    hours: { open: "06:00", close: "17:00" },
  },
  "venue-3": {
    name: "Test Closed Venue",
    isOpen: false,
    isClosed: true,
    hours: { open: "10:00", close: "18:00" },
    temporaryClosure: { reason: "Under renovation" },
  },
  "venue-4": {
    name: "Meiji Shrine",
    isOpen: true,
    isClosed: false,
    hours: { open: "05:00", close: "18:00" },
  },
  "venue-5": {
    name: "Early Close Test",
    isOpen: true,
    isClosed: false,
    hours: { open: "09:00", close: "14:00" }, // Closes early
  },
  "venue-6": {
    name: "Late Open Test",
    isOpen: true,
    isClosed: false,
    hours: { open: "13:00", close: "22:00" }, // Opens late
  },
};

// Overrides that can be set via POST
let venueOverrides: Map<
  string,
  {
    isClosed?: boolean;
    temporaryClosure?: { reason: string; until?: string };
    hours?: { open: string; close: string };
  }
> = new Map();

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params;
  const searchParams = request.nextUrl.searchParams;

  // Query params for testing
  const forceClosed = searchParams.get("closed") === "true";
  const forceOpen = searchParams.get("open") === "true";
  const randomClosure = searchParams.get("random") === "true";
  const customHoursOpen = searchParams.get("hoursOpen");
  const customHoursClose = searchParams.get("hoursClose");

  // Get base venue data
  const mockVenue = MOCK_VENUES[venueId];
  const override = venueOverrides.get(venueId);

  // Default response for unknown venues
  const now = new Date();
  const hour = now.getHours();
  const dayOfWeek = now.getDay();
  const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

  const defaultHours = {
    open: isWeekend ? "10:00" : "09:00",
    close: isWeekend ? "22:00" : "21:00",
  };

  // Build response
  let status = {
    isOpen: true,
    isClosed: false,
    currentHours: mockVenue?.hours ?? defaultHours,
    temporaryClosure: undefined as { reason: string; until?: string } | undefined,
    lastUpdated: new Date().toISOString(),
  };

  // Apply mock venue data
  if (mockVenue) {
    status.isOpen = mockVenue.isOpen;
    status.isClosed = mockVenue.isClosed;
    status.currentHours = mockVenue.hours;
    status.temporaryClosure = mockVenue.temporaryClosure;
  }

  // Apply overrides
  if (override) {
    if (override.isClosed !== undefined) {
      status.isClosed = override.isClosed;
      status.isOpen = !override.isClosed;
    }
    if (override.temporaryClosure) {
      status.temporaryClosure = override.temporaryClosure;
    }
    if (override.hours) {
      status.currentHours = override.hours;
    }
  }

  // Apply query params (highest priority)
  if (forceClosed) {
    status.isClosed = true;
    status.isOpen = false;
    status.temporaryClosure = { reason: "Forced closed via query param" };
  } else if (forceOpen) {
    status.isClosed = false;
    status.isOpen = true;
    status.temporaryClosure = undefined;
  }

  if (randomClosure && Math.random() < 0.3) {
    status.isClosed = true;
    status.isOpen = false;
    status.temporaryClosure = { reason: "Random closure for testing" };
  }

  if (customHoursOpen || customHoursClose) {
    status.currentHours = {
      open: customHoursOpen ?? status.currentHours.open,
      close: customHoursClose ?? status.currentHours.close,
    };
  }

  // Check if currently open based on hours
  const openHour = parseInt(status.currentHours.open.split(":")[0], 10);
  const closeHour = parseInt(status.currentHours.close.split(":")[0], 10);
  if (!status.isClosed) {
    status.isOpen = hour >= openHour && hour < closeHour;
  }

  return NextResponse.json(status);
}

/**
 * POST to set venue overrides for testing
 *
 * Body:
 * {
 *   isClosed?: boolean,
 *   temporaryClosure?: { reason: string, until?: string },
 *   hours?: { open: string, close: string }
 * }
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params;

  try {
    const body = await request.json();

    venueOverrides.set(venueId, {
      isClosed: body.isClosed,
      temporaryClosure: body.temporaryClosure,
      hours: body.hours,
    });

    return NextResponse.json({
      success: true,
      venueId,
      override: venueOverrides.get(venueId),
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Invalid request body" },
      { status: 400 }
    );
  }
}

/**
 * DELETE to clear venue override
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ venueId: string }> }
) {
  const { venueId } = await params;

  venueOverrides.delete(venueId);

  return NextResponse.json({
    success: true,
    venueId,
    message: "Override cleared",
  });
}
