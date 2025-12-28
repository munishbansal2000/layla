import { NextResponse } from "next/server";
import type { ApiResponse, Destination } from "@/types";
import { popularDestinations } from "@/data/mock-data";

export async function GET() {
  try {
    const response: ApiResponse<{ destinations: Destination[] }> = {
      success: true,
      data: { destinations: popularDestinations },
    };

    return NextResponse.json(response);
  } catch (error) {
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: "FETCH_ERROR",
        message: error instanceof Error ? error.message : "Failed to fetch destinations",
      },
    };
    return NextResponse.json(response, { status: 500 });
  }
}
