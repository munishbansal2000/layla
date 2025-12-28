/**
 * Viator Itinerary Enrichment Service
 *
 * This service matches AI-generated itinerary activities with real
 * bookable Viator experiences, adding booking URLs and pricing.
 */

import {
  searchProducts,
  viatorProductToActivity,
  type ViatorProduct,
  type ViatorSearchParams,
} from "./viator";
import type { Activity, DayPlan, Trip } from "@/types";

export interface EnrichedActivity extends Activity {
  viatorMatch?: {
    productCode: string;
    bookingUrl: string;
    price?: {
      amount: number;
      currency: string;
    };
    rating?: number;
    reviewCount?: number;
    matchConfidence: "high" | "medium" | "low";
  };
}

export interface EnrichedDayPlan extends Omit<DayPlan, "items"> {
  items: Array<{
    id: string;
    activity: EnrichedActivity;
    timeSlot: {
      startTime: string;
      endTime: string;
    };
    notes?: string;
    isBooked?: boolean;
    order: number;
  }>;
}

export interface EnrichedTrip extends Omit<Trip, "days"> {
  days: EnrichedDayPlan[];
  viatorEnriched?: boolean;
  enrichedAt?: Date;
}

/**
 * Enrich a trip's activities with Viator bookable experiences
 */
export async function enrichTripWithViator(trip: Trip): Promise<EnrichedTrip> {
  const destination = trip.destination.city;

  // Get all unique activity names from the trip
  const activityNames = new Set<string>();
  trip.days.forEach((day) => {
    day.items.forEach((item) => {
      // Only try to match certain types of activities
      if (shouldMatchWithViator(item.activity)) {
        activityNames.add(item.activity.name);
      }
    });
  });

  // Fetch Viator products for the destination
  let viatorProducts: ViatorProduct[] = [];
  try {
    const searchParams: ViatorSearchParams = {
      destName: destination,
      count: 50, // Get a good pool of activities to match from
      sortOrder: "TRAVELER_RATING",
    };

    const response = await searchProducts(searchParams);
    viatorProducts = response.products;
  } catch (error) {
    console.error("Failed to fetch Viator products:", error);
    // Return trip without enrichment if Viator fails
    return {
      ...trip,
      viatorEnriched: false,
    };
  }

  // Enrich each day's activities
  const enrichedDays: EnrichedDayPlan[] = trip.days.map((day) => ({
    ...day,
    items: day.items.map((item) => ({
      ...item,
      activity: enrichActivityWithViator(item.activity, viatorProducts),
    })),
  }));

  return {
    ...trip,
    days: enrichedDays,
    viatorEnriched: true,
    enrichedAt: new Date(),
  };
}

/**
 * Check if an activity type should be matched with Viator
 */
function shouldMatchWithViator(activity: Activity): boolean {
  // Match attractions, activities, culture, nature - not restaurants/hotels
  const matchableTypes = ["attraction", "activity", "culture", "nature", "shopping"];
  return matchableTypes.includes(activity.type);
}

/**
 * Find the best matching Viator product for an activity
 */
function enrichActivityWithViator(
  activity: Activity,
  viatorProducts: ViatorProduct[]
): EnrichedActivity {
  if (!shouldMatchWithViator(activity)) {
    return activity;
  }

  const match = findBestMatch(activity, viatorProducts);

  if (!match) {
    return activity;
  }

  const converted = viatorProductToActivity(match.product);

  return {
    ...activity,
    bookingUrl: converted.bookingUrl,
    viatorMatch: {
      productCode: match.product.productCode,
      bookingUrl: converted.bookingUrl,
      price: converted.price,
      rating: converted.rating,
      reviewCount: converted.reviewCount,
      matchConfidence: match.confidence,
    },
  };
}

/**
 * Find the best matching Viator product using text similarity
 */
function findBestMatch(
  activity: Activity,
  products: ViatorProduct[]
): { product: ViatorProduct; confidence: "high" | "medium" | "low" } | null {
  const activityName = activity.name.toLowerCase();
  const activityTags = activity.tags.map((t) => t.toLowerCase());

  let bestMatch: ViatorProduct | null = null;
  let bestScore = 0;

  for (const product of products) {
    const productTitle = product.title.toLowerCase();
    const productDescription = product.description?.toLowerCase() || "";
    const productTags = product.tags
      ? product.tags.map((t) => {
          if (typeof t === "number") return String(t);
          if (typeof t === "object" && t !== null && "tagName" in t) return t.tagName.toLowerCase();
          return String(t);
        })
      : [];

    let score = 0;

    // Exact name match (high weight)
    if (productTitle.includes(activityName) || activityName.includes(productTitle)) {
      score += 50;
    }

    // Word overlap in names
    const activityWords = activityName.split(/\s+/).filter((w) => w.length > 3);
    const productWords = productTitle.split(/\s+/).filter((w) => w.length > 3);

    for (const word of activityWords) {
      if (productWords.some((pw) => pw.includes(word) || word.includes(pw))) {
        score += 10;
      }
    }

    // Tag overlap
    for (const tag of activityTags) {
      if (productTags.some((pt) => pt.includes(tag) || tag.includes(pt))) {
        score += 5;
      }
    }

    // Description keyword match
    const keywordsToMatch = extractKeywords(activityName);
    for (const keyword of keywordsToMatch) {
      if (productTitle.includes(keyword) || productDescription.includes(keyword)) {
        score += 8;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = product;
    }
  }

  if (!bestMatch || bestScore < 15) {
    return null;
  }

  // Determine confidence level
  let confidence: "high" | "medium" | "low";
  if (bestScore >= 50) {
    confidence = "high";
  } else if (bestScore >= 30) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  return { product: bestMatch, confidence };
}

/**
 * Extract meaningful keywords from an activity name
 */
function extractKeywords(name: string): string[] {
  const stopWords = [
    "the", "a", "an", "at", "in", "on", "to", "for", "of", "and", "or", "visit", "tour", "trip"
  ];

  return name
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 3 && !stopWords.includes(word));
}

/**
 * Get Viator suggestions for a specific activity
 * Use this when user wants to see booking options for a specific activity
 */
export async function getViatorSuggestionsForActivity(
  activity: Activity,
  destination: string,
  count: number = 5
): Promise<ReturnType<typeof viatorProductToActivity>[]> {
  try {
    const searchParams: ViatorSearchParams = {
      destName: destination,
      count,
      sortOrder: "TRAVELER_RATING",
    };

    // Map activity type to Viator tags
    const typeToTag: Record<string, number> = {
      attraction: 12061, // ATTRACTIONS
      culture: 12065,    // CULTURAL_TOURS
      nature: 11919,     // OUTDOOR_ACTIVITIES
      activity: 11889,   // TOURS
    };

    if (typeToTag[activity.type]) {
      searchParams.tags = [typeToTag[activity.type]];
    }

    const response = await searchProducts(searchParams);

    // Score and sort by relevance to the specific activity
    const scored = response.products.map((product) => {
      const match = findBestMatch(activity, [product]);
      return {
        product,
        score: match ? (match.confidence === "high" ? 3 : match.confidence === "medium" ? 2 : 1) : 0,
      };
    });

    scored.sort((a, b) => b.score - a.score);

    return scored.slice(0, count).map((s) => viatorProductToActivity(s.product));
  } catch (error) {
    console.error("Failed to get Viator suggestions:", error);
    return [];
  }
}

/**
 * Enrich a single activity with Viator (for on-demand enrichment)
 */
export async function enrichSingleActivity(
  activity: Activity,
  destination: string
): Promise<EnrichedActivity> {
  try {
    const suggestions = await getViatorSuggestionsForActivity(activity, destination, 1);

    if (suggestions.length === 0) {
      return activity;
    }

    const bestMatch = suggestions[0];

    return {
      ...activity,
      bookingUrl: bestMatch.bookingUrl,
      viatorMatch: {
        productCode: bestMatch.viatorProductCode,
        bookingUrl: bestMatch.bookingUrl,
        price: bestMatch.price,
        rating: bestMatch.rating,
        reviewCount: bestMatch.reviewCount,
        matchConfidence: "medium",
      },
    };
  } catch (error) {
    console.error("Failed to enrich activity:", error);
    return activity;
  }
}
