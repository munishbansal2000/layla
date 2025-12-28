import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse, Trip } from "@/types";
import { createMockTrip } from "@/data/mock-data";

// GET all trips
export async function GET() {
  try {
    // In production, this would fetch from a database
    const trips = [createMockTrip()];

    const response: ApiResponse<{ trips: Trip[] }> = {
      success: true,
      data: { trips },
    };

    return NextResponse.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: "FETCH_ERROR",
        message: error instanceof Error ? error.message : "Failed to fetch trips",
      },
    };
    return NextResponse.json(response, { status: 500 });
  }
}

// POST create a new trip
export async function POST(request: NextRequest) {
  try {
    const tripData = await request.json();

    // In production, this would save to a database
    const newTrip: Trip = {
      ...tripData,
      id: `trip-${Date.now()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const response: ApiResponse<{ trip: Trip }> = {
      success: true,
      data: { trip: newTrip },
    };

    return NextResponse.json(response, { status: 201 });
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: "CREATE_ERROR",
        message: error instanceof Error ? error.message : "Failed to create trip",
      },
    };
    return NextResponse.json(response, { status: 500 });
  }
}
