import { NextRequest, NextResponse } from "next/server";
import type { ApiResponse, Trip, DayPlan } from "@/types";
import { createMockTrip } from "@/data/mock-data";

interface RouteParams {
  params: Promise<{ id: string }>;
}

// GET single trip by ID
export async function GET(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // In production, fetch from database
    const mockTrip = createMockTrip();

    if (mockTrip.id !== id && id !== "trip-1") {
      const response: ApiResponse<null> = {
        success: false,
        error: {
          code: "NOT_FOUND",
          message: "Trip not found",
        },
      };
      return NextResponse.json(response, { status: 404 });
    }

    const response: ApiResponse<{ trip: Trip }> = {
      success: true,
      data: { trip: mockTrip },
    };

    return NextResponse.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: "FETCH_ERROR",
        message: error instanceof Error ? error.message : "Failed to fetch trip",
      },
    };
    return NextResponse.json(response, { status: 500 });
  }
}

// PUT update trip
export async function PUT(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const updates = await request.json();

    // In production, update in database
    const mockTrip = createMockTrip();
    const updatedTrip: Trip = {
      ...mockTrip,
      ...updates,
      id,
      updatedAt: new Date(),
    };

    const response: ApiResponse<{ trip: Trip }> = {
      success: true,
      data: { trip: updatedTrip },
    };

    return NextResponse.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: "UPDATE_ERROR",
        message: error instanceof Error ? error.message : "Failed to update trip",
      },
    };
    return NextResponse.json(response, { status: 500 });
  }
}

// PATCH partial update (for days, items, etc.)
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;
    const { action, data } = await request.json();

    const mockTrip = createMockTrip();
    let updatedTrip = { ...mockTrip, id };

    switch (action) {
      case "updateDay":
        updatedTrip.days = updatedTrip.days.map((day: DayPlan) =>
          day.id === data.dayId ? { ...day, ...data.updates } : day
        );
        break;
      case "addActivity":
        updatedTrip.days = updatedTrip.days.map((day: DayPlan) =>
          day.id === data.dayId
            ? { ...day, items: [...day.items, data.item] }
            : day
        );
        break;
      case "removeActivity":
        updatedTrip.days = updatedTrip.days.map((day: DayPlan) =>
          day.id === data.dayId
            ? { ...day, items: day.items.filter((i) => i.id !== data.itemId) }
            : day
        );
        break;
      case "reorderActivities":
        updatedTrip.days = updatedTrip.days.map((day: DayPlan) =>
          day.id === data.dayId ? { ...day, items: data.items } : day
        );
        break;
      default:
        break;
    }

    updatedTrip.updatedAt = new Date();

    const response: ApiResponse<{ trip: Trip }> = {
      success: true,
      data: { trip: updatedTrip },
    };

    return NextResponse.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: "PATCH_ERROR",
        message: error instanceof Error ? error.message : "Failed to patch trip",
      },
    };
    return NextResponse.json(response, { status: 500 });
  }
}

// DELETE trip
export async function DELETE(request: NextRequest, { params }: RouteParams) {
  try {
    const { id } = await params;

    // In production, delete from database
    console.log(`Deleting trip ${id}`);

    const response: ApiResponse<{ deleted: boolean }> = {
      success: true,
      data: { deleted: true },
    };

    return NextResponse.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: "DELETE_ERROR",
        message: error instanceof Error ? error.message : "Failed to delete trip",
      },
    };
    return NextResponse.json(response, { status: 500 });
  }
}
