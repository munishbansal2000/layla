import { NextRequest, NextResponse } from "next/server";
import { searchProducts, viatorProductToActivityWithTimeSlots, VIATOR_TAGS } from "@/lib/viator";
import type { ViatorActivitySuggestion } from "@/lib/trip-planning";

export async function POST(request: NextRequest) {
  try {
    const { destination, startDate, endDate, interests, count = 20 } = await request.json();

    if (!destination) {
      return NextResponse.json(
        { success: false, error: "Destination is required" },
        { status: 400 }
      );
    }

    // Map interests to Viator tags
    const tags: number[] = [];
    if (interests && Array.isArray(interests)) {
      for (const interest of interests) {
        const lower = interest.toLowerCase();
        if (lower.includes("food") || lower.includes("dining") || lower.includes("culinary")) {
          tags.push(VIATOR_TAGS.FOOD_TOURS);
        }
        if (lower.includes("art") || lower.includes("museum")) {
          tags.push(VIATOR_TAGS.MUSEUMS);
        }
        if (lower.includes("history") || lower.includes("culture")) {
          tags.push(VIATOR_TAGS.CULTURAL_TOURS);
        }
        if (lower.includes("adventure") || lower.includes("outdoor")) {
          tags.push(VIATOR_TAGS.ADVENTURE);
        }
        if (lower.includes("nature")) {
          tags.push(VIATOR_TAGS.OUTDOOR_ACTIVITIES);
        }
        if (lower.includes("night") || lower.includes("entertainment")) {
          tags.push(VIATOR_TAGS.NIGHTLIFE);
        }
        if (lower.includes("family")) {
          tags.push(VIATOR_TAGS.FAMILY_FRIENDLY);
        }
        if (lower.includes("walk") || lower.includes("tour")) {
          tags.push(VIATOR_TAGS.WALKING_TOURS);
        }
      }
    }

    // Search for activities
    const response = await searchProducts({
      destName: destination,
      startDate,
      endDate,
      count: Math.min(count, 50),
      sortOrder: "TRAVELER_RATING",
      tags: tags.length > 0 ? tags : undefined,
    });

    // Convert to our activity format with time slots
    const activities: ViatorActivitySuggestion[] = response.products.map((product) => {
      const converted = viatorProductToActivityWithTimeSlots(product);
      return {
        id: converted.id,
        name: converted.name,
        description: converted.description,
        imageUrl: converted.imageUrl,
        duration: converted.duration || 120,
        rating: converted.rating,
        reviewCount: converted.reviewCount,
        price: converted.price || { amount: 0, currency: "USD" },
        bookingUrl: converted.bookingUrl,
        viatorProductCode: converted.viatorProductCode,
        tags: converted.tags,
        suggestedTimeSlots: converted.suggestedTimeSlots,
        bestTimeOfDay: converted.bestTimeOfDay,
      };
    });

    // Group activities by type for easier slot matching
    const grouped = {
      morning: activities.filter((a) =>
        a.tags.some((t) =>
          t.toLowerCase().includes("tour") ||
          t.toLowerCase().includes("walk") ||
          t.toLowerCase().includes("museum")
        )
      ),
      food: activities.filter((a) =>
        a.tags.some((t) =>
          t.toLowerCase().includes("food") ||
          t.toLowerCase().includes("culinary") ||
          t.toLowerCase().includes("cooking")
        )
      ),
      afternoon: activities.filter((a) =>
        a.tags.some((t) =>
          t.toLowerCase().includes("attraction") ||
          t.toLowerCase().includes("experience")
        )
      ),
      evening: activities.filter((a) =>
        a.tags.some((t) =>
          t.toLowerCase().includes("night") ||
          t.toLowerCase().includes("show")
        )
      ),
      all: activities,
    };

    return NextResponse.json({
      success: true,
      data: {
        destination,
        totalCount: response.totalCount,
        activities,
        grouped,
      },
    });
  } catch (error) {
    console.error("Trip activities API error:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to fetch activities"
      },
      { status: 500 }
    );
  }
}
