import { NextRequest, NextResponse } from "next/server";
import {
  searchProducts,
  searchDestinations,
  viatorProductToActivityWithTimeSlots,
  VIATOR_TAGS,
} from "@/lib/viator";
import { validateTripDates } from "@/lib/date-validation";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);

  const destination = searchParams.get("destination");
  const startDate = searchParams.get("startDate");
  const endDate = searchParams.get("endDate");
  const category = searchParams.get("category");
  const sortOrder = searchParams.get("sort") as
    | "PRICE"
    | "TRAVELER_RATING"
    | "REVIEW_AVG_RATING"
    | "ITINERARY_DURATION"
    | null;
  const count = parseInt(searchParams.get("count") || "20");
  const page = parseInt(searchParams.get("page") || "1");

  if (!destination) {
    return NextResponse.json(
      { success: false, error: { code: "MISSING_DESTINATION", message: "Destination is required" } },
      { status: 400 }
    );
  }

  // Validate dates if provided (only future dates allowed)
  if (startDate && endDate) {
    const dateValidation = validateTripDates(startDate, endDate);
    if (!dateValidation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: dateValidation.error!.code,
            message: dateValidation.error!.message,
          },
        },
        { status: 400 }
      );
    }
  }

  try {
    // Map category to Viator tag IDs
    let tags: number[] | undefined;
    if (category) {
      const tagKey = category.toUpperCase().replace(/-/g, "_") as keyof typeof VIATOR_TAGS;
      if (VIATOR_TAGS[tagKey]) {
        tags = [VIATOR_TAGS[tagKey]];
      }
    }

    const response = await searchProducts({
      destName: destination,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      sortOrder: sortOrder || "TRAVELER_RATING",
      count,
      start: (page - 1) * count + 1,
      tags,
    });

    // Convert to app's activity format with time slots
    const activities = response.products.map(viatorProductToActivityWithTimeSlots);

    return NextResponse.json({
      success: true,
      data: {
        activities,
        totalCount: response.totalCount,
        currency: response.currency,
        page,
        pageSize: count,
        totalPages: Math.ceil(response.totalCount / count),
      },
    });
  } catch (error) {
    console.error("Error fetching activities:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VIATOR_API_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch activities",
        },
      },
      { status: 500 }
    );
  }
}

// POST endpoint for more complex searches
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { destination, startDate, endDate, categories, sort, count = 20, page = 1 } = body;

    if (!destination) {
      return NextResponse.json(
        { success: false, error: { code: "MISSING_DESTINATION", message: "Destination is required" } },
        { status: 400 }
      );
    }

    // Validate dates if provided (only future dates allowed)
    if (startDate && endDate) {
      const dateValidation = validateTripDates(startDate, endDate);
      if (!dateValidation.valid) {
        return NextResponse.json(
          {
            success: false,
            error: {
              code: dateValidation.error!.code,
              message: dateValidation.error!.message,
            },
          },
          { status: 400 }
        );
      }
    }

    // Map multiple categories to Viator tag IDs
    let tags: number[] | undefined;
    if (categories && Array.isArray(categories)) {
      tags = categories
        .map((cat: string) => {
          const tagKey = cat.toUpperCase().replace(/-/g, "_") as keyof typeof VIATOR_TAGS;
          return VIATOR_TAGS[tagKey];
        })
        .filter(Boolean);
    }

    const response = await searchProducts({
      destName: destination,
      startDate,
      endDate,
      sortOrder: sort || "TRAVELER_RATING",
      count,
      start: (page - 1) * count + 1,
      tags: tags?.length ? tags : undefined,
    });

    const activities = response.products.map(viatorProductToActivityWithTimeSlots);

    return NextResponse.json({
      success: true,
      data: {
        activities,
        totalCount: response.totalCount,
        currency: response.currency,
        page,
        pageSize: count,
        totalPages: Math.ceil(response.totalCount / count),
      },
    });
  } catch (error) {
    console.error("Error fetching activities:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VIATOR_API_ERROR",
          message: error instanceof Error ? error.message : "Failed to fetch activities",
        },
      },
      { status: 500 }
    );
  }
}

// Search destinations endpoint
export async function OPTIONS(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("q");

  if (!query) {
    return NextResponse.json(
      { success: false, error: { code: "MISSING_QUERY", message: "Search query is required" } },
      { status: 400 }
    );
  }

  try {
    const destinations = await searchDestinations(query);

    return NextResponse.json({
      success: true,
      data: destinations.map((d) => ({
        id: d.destinationId,
        name: d.destinationName,
        type: d.destinationType,
        coordinates: d.coordinates,
      })),
    });
  } catch (error) {
    console.error("Error searching destinations:", error);
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "VIATOR_API_ERROR",
          message: error instanceof Error ? error.message : "Failed to search destinations",
        },
      },
      { status: 500 }
    );
  }
}
