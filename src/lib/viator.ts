// ============================================
// VIATOR API INTEGRATION
// Partner API for tours, activities, and experiences
// Docs: https://docs.viator.com/partner-api/
// ============================================

import {
  findViatorReplayMatch,
  logViatorRequest,
  createViatorLogEntry,
} from "./viator-logger";

const VIATOR_API_KEY = process.env.VIATOR_API_KEY!;
const VIATOR_ENV = process.env.VIATOR_ENV || "sandbox";

// API Mode: "test" (use cache/replay) or "prod" (always call API)
// Defaults to same as AI_MODE for consistency
const VIATOR_MODE = process.env.VIATOR_MODE || process.env.AI_MODE || "prod";

// Cache duration in milliseconds (default: 24 hours)
const VIATOR_CACHE_MAX_AGE_MS = parseInt(process.env.VIATOR_CACHE_MAX_AGE_MS || String(24 * 60 * 60 * 1000));

// Base URLs for sandbox and production
const BASE_URLS = {
  sandbox: "https://api.sandbox.viator.com/partner",
  production: "https://api.viator.com/partner",
} as const;

const BASE_URL = BASE_URLS[VIATOR_ENV as keyof typeof BASE_URLS] || BASE_URLS.sandbox;

/**
 * Check if we're in test/cache mode
 */
export function isViatorTestMode(): boolean {
  const mode = VIATOR_MODE.toLowerCase();
  return mode === "test" || mode === "development" || mode === "dev";
}

/**
 * Get current Viator mode info
 */
export function getViatorModeInfo(): {
  mode: string;
  env: string;
  cacheEnabled: boolean;
  cacheMaxAgeMs: number;
} {
  return {
    mode: VIATOR_MODE,
    env: VIATOR_ENV,
    cacheEnabled: isViatorTestMode(),
    cacheMaxAgeMs: VIATOR_CACHE_MAX_AGE_MS,
  };
}

// ============================================
// TYPES
// ============================================

// ---- Destination Types ----

export interface ViatorCoordinates {
  latitude: number;
  longitude: number;
}

export interface ViatorDestination {
  destinationId: number;
  destinationName: string;
  destinationType: string;
  parentId?: number;
  lookupId: string;
  timeZone?: string;
  defaultCurrencyCode?: string;
  iataCode?: string;
  coordinates?: ViatorCoordinates;
}

// ---- Image Types ----

export interface ViatorImageVariant {
  url: string;
  width: number;
  height: number;
}

export interface ViatorImage {
  imageSource: "SUPPLIER_PROVIDED" | "TRAVELER_SUBMITTED" | string;
  caption?: string;
  isCover?: boolean;
  variants: ViatorImageVariant[];
}

// ---- Review Types ----

export interface ViatorReviewSource {
  provider: "VIATOR" | "TRIPADVISOR" | string;
  totalCount: number;
  averageRating: number;
}

export interface ViatorReviews {
  sources?: ViatorReviewSource[];
  totalReviews: number;
  combinedAverageRating: number;
}

// ---- Duration Types ----

export interface ViatorDuration {
  fixedDurationInMinutes?: number;
  variableDurationFromMinutes?: number;
  variableDurationToMinutes?: number;
}

// ---- Pricing Types ----

export interface ViatorPricingSummary {
  fromPrice: number;
  fromPriceBeforeDiscount?: number;
}

export interface ViatorPricing {
  summary: ViatorPricingSummary;
  currency: string;
}

// ---- Destination Reference Types ----

export interface ViatorDestinationRef {
  ref: string;
  primary: boolean;
}

// ---- Translation Types ----

export interface ViatorTranslationInfo {
  containsMachineTranslatedText: boolean;
  translationSource: "ORIGINAL" | "MACHINE" | string;
}

// ---- Tag Types ----

export interface ViatorTag {
  tagId: number;
  tagName: string;
}

// ---- Product Flags ----

export type ViatorProductFlag =
  | "FREE_CANCELLATION"
  | "PRIVATE_TOUR"
  | "LIKELY_TO_SELL_OUT"
  | "NEW_ON_VIATOR"
  | "SKIP_THE_LINE"
  | "SPECIAL_OFFER"
  | string;

// ---- Main Product Type ----

export interface ViatorProduct {
  productCode: string;
  title: string;
  description: string;
  shortDescription?: string;
  duration?: ViatorDuration;
  pricing?: ViatorPricing;
  reviews?: ViatorReviews;
  images?: ViatorImage[];
  confirmationType?: "INSTANT" | "MANUAL" | string;
  itineraryType?: "STANDARD" | "ACTIVITY" | string;
  productUrl?: string;
  destinations?: ViatorDestinationRef[];
  tags?: number[] | ViatorTag[];
  flags?: ViatorProductFlag[];
  translationInfo?: ViatorTranslationInfo;
  bookingInfo?: {
    bookingConfirmationSettings?: {
      confirmationType: string;
    };
  };
}

export interface ViatorSearchParams {
  destId?: number;
  destName?: string;
  startDate?: string;
  endDate?: string;
  currency?: string;
  count?: number;
  start?: number;
  sortOrder?: "PRICE" | "TRAVELER_RATING" | "REVIEW_AVG_RATING" | "ITINERARY_DURATION";
  sortDirection?: "ASCENDING" | "DESCENDING";
  tags?: number[];
}

export interface ViatorSearchResponse {
  products: ViatorProduct[];
  totalCount: number;
  currency: string;
}

// ---- Freetext Search Types ----

export interface ViatorFreetextSearchParams {
  searchTerm: string;
  currency?: string;
  count?: number;
  start?: number;
}

export interface ViatorAttraction {
  id: number;
  name: string;
  primaryDestinationId: number;
  destinationName: string;
  description?: string;
  productsCount: number;
  reviews?: ViatorReviews;
  images?: ViatorImage[];
  url?: string;
}

export interface ViatorFreetextSearchResponse {
  products: {
    results: ViatorProduct[];
    totalCount: number;
  };
  attractions?: {
    results: ViatorAttraction[];
    totalCount: number;
  };
  destinations?: {
    results: ViatorDestination[];
    totalCount: number;
  };
}

export interface ViatorProductDetails extends ViatorProduct {
  overview?: string;
  whatIsIncluded?: string[];
  whatIsExcluded?: string[];
  additionalInfo?: string[];
  cancellationPolicy?: {
    type: string;
    description: string;
    cancelIfBadWeather?: boolean;
    cancelIfInsufficientTravelers?: boolean;
    refundEligibility?: Array<{
      dayRangeMin: number;
      dayRangeMax?: number;
      percentageRefundable: number;
    }>;
  };
  logistics?: {
    start?: Array<{
      location?: {
        ref?: string;
        name?: string;
        address?: string;
      };
      description?: string;
    }>;
    end?: Array<{
      location?: {
        ref?: string;
        name?: string;
        address?: string;
      };
      description?: string;
    }>;
  };
  itinerary?: {
    itineraryType: string;
    itineraryItems?: Array<{
      pointOfInterestLocation?: {
        attractionId?: number;
        location?: {
          name: string;
          address?: string;
        };
      };
      duration?: {
        fixedDurationInMinutes?: number;
      };
      description?: string;
      passByWithoutStopping?: boolean;
    }>;
  };
}

// ============================================
// POPULAR DESTINATION IDs
// Since /destinations/search is not available in production API,
// we use a lookup table for common destinations
// ============================================

const DESTINATION_LOOKUP: Record<string, number> = {
  // Europe
  "paris": 479,
  "london": 737,
  "rome": 511,
  "barcelona": 562,
  "amsterdam": 525,
  "berlin": 547,
  "prague": 563,
  "vienna": 548,
  "lisbon": 538,
  "madrid": 559,
  "dublin": 504,
  "athens": 496,
  "florence": 502,
  "venice": 522,
  "milan": 508,
  "munich": 536,
  "brussels": 546,
  "copenhagen": 553,
  "stockholm": 567,
  "oslo": 560,
  "budapest": 549,
  "warsaw": 574,
  "zurich": 579,
  "geneva": 580,
  "edinburgh": 730,
  "nice": 483,
  "santorini": 497,

  // North America
  "new york": 712,
  "new york city": 712,
  "nyc": 712,
  "los angeles": 645,
  "la": 645,
  "san francisco": 651,
  "las vegas": 684,
  "vegas": 684,
  "miami": 662,
  "chicago": 636,
  "boston": 631,
  "washington dc": 657,
  "washington": 657,
  "seattle": 653,
  "san diego": 650,
  "new orleans": 665,
  "hawaii": 672,
  "honolulu": 672,
  "maui": 673,
  "orlando": 667,
  "toronto": 623,
  "vancouver": 626,
  "montreal": 620,
  "mexico city": 631,
  "cancun": 629,

  // Asia
  "tokyo": 334,
  "kyoto": 332,
  "osaka": 333,
  "bangkok": 343,
  "singapore": 340,
  "hong kong": 326,
  "seoul": 338,
  "taipei": 341,
  "bali": 296,
  "phuket": 345,
  "kuala lumpur": 331,
  "hanoi": 351,
  "ho chi minh": 352,
  "saigon": 352,
  "delhi": 304,
  "new delhi": 304,
  "mumbai": 308,
  "jaipur": 305,
  "beijing": 321,
  "shanghai": 323,

  // Oceania
  "sydney": 357,
  "melbourne": 361,
  "auckland": 377,
  "queenstown": 379,

  // Middle East
  "dubai": 828,
  "abu dhabi": 827,
  "jerusalem": 915,
  "tel aviv": 914,
  "istanbul": 585,
  "cairo": 782,
  "marrakech": 789,

  // South America
  "rio de janeiro": 318,
  "rio": 318,
  "buenos aires": 708,
  "lima": 716,
  "cusco": 715,
  "bogota": 711,
  "cartagena": 710,

  // Caribbean
  "nassau": 4130,
  "san juan": 680,
  "puerto rico": 680,
  "jamaica": 4129,
  "aruba": 4127,
};

/**
 * Get destination ID from city name
 * Uses lookup table since /destinations/search is not available in production
 */
function getDestinationIdFromName(cityName: string): number | null {
  const normalized = cityName.toLowerCase().trim();

  // Direct lookup
  if (DESTINATION_LOOKUP[normalized]) {
    return DESTINATION_LOOKUP[normalized];
  }

  // Partial match (e.g., "Paris, France" -> "paris")
  for (const [key, id] of Object.entries(DESTINATION_LOOKUP)) {
    if (normalized.includes(key) || key.includes(normalized)) {
      return id;
    }
  }

  return null;
}

async function viatorFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      "Accept": "application/json;version=2.0",
      "Accept-Language": "en-US",
      "Content-Type": "application/json",
      "exp-api-key": VIATOR_API_KEY,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`Viator API error: ${response.status}`, errorText);
    throw new Error(`Viator API error: ${response.status} - ${errorText}`);
  }

  return response.json();
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Search for destinations by name
 * With caching support in test mode
 */
export async function searchDestinations(query: string): Promise<ViatorDestination[]> {
  const cacheParams = { query };

  // Check cache in test mode
  if (isViatorTestMode()) {
    console.log(`[Viator] Test mode - checking cache for destinations: ${query}`);
    const replayMatch = await findViatorReplayMatch("destinations", cacheParams, VIATOR_CACHE_MAX_AGE_MS);

    if (replayMatch.found && replayMatch.entry) {
      console.log(`[Viator] Cache HIT - returning cached destinations`);
      return (replayMatch.entry.response.data as ViatorDestination[]) || [];
    }
    console.log(`[Viator] Cache MISS - calling API`);
  }

  const startTime = Date.now();

  try {
    const response = await viatorFetch<{ destinations: ViatorDestination[] }>(
      "/destinations/search",
      {
        method: "POST",
        body: JSON.stringify({
          searchTerm: query,
          includeDetails: true,
        }),
      }
    );

    const destinations = response.destinations || [];
    const durationMs = Date.now() - startTime;

    // Log for caching
    const logEntry = createViatorLogEntry(
      "destinations",
      "/destinations/search",
      "POST",
      cacheParams,
      { data: destinations },
      durationMs,
      true,
      undefined,
      { destination: query }
    );
    logViatorRequest(logEntry).catch(console.error);

    return destinations;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    const logEntry = createViatorLogEntry(
      "destinations",
      "/destinations/search",
      "POST",
      cacheParams,
      {},
      durationMs,
      false,
      errorMessage,
      { destination: query }
    );
    logViatorRequest(logEntry).catch(console.error);

    throw error;
  }
}

/**
 * Get destination by ID
 */
export async function getDestination(destinationId: number): Promise<ViatorDestination | null> {
  try {
    const response = await viatorFetch<ViatorDestination>(
      `/destinations/${destinationId}`
    );
    return response;
  } catch {
    return null;
  }
}

/**
 * Search for products/activities
 * With caching support in test mode
 */
export async function searchProducts(params: ViatorSearchParams): Promise<ViatorSearchResponse> {
  // Get destination ID - use lookup table first, then try API as fallback
  let destId = params.destId;

  if (!destId && params.destName) {
    // Try lookup table first (faster and always works)
    destId = getDestinationIdFromName(params.destName) ?? undefined;

    if (!destId) {
      // Fallback: try API (may fail in production)
      try {
        const destinations = await searchDestinations(params.destName);
        if (destinations.length > 0) {
          destId = destinations[0].destinationId;
        }
      } catch (error) {
        console.warn(`[Viator] Destination lookup failed for "${params.destName}", destination not in lookup table`);
      }
    }

    if (!destId) {
      console.warn(`[Viator] Unknown destination: ${params.destName}`);
      return { products: [], totalCount: 0, currency: params.currency || "USD" };
    }
  }

  // Cache params for matching
  const cacheParams = {
    destId,
    destName: params.destName,
    tags: params.tags,
    sortOrder: params.sortOrder,
    count: params.count,
  };

  // Check cache in test mode
  if (isViatorTestMode()) {
    console.log(`[Viator] Test mode - checking cache for products search`);
    const replayMatch = await findViatorReplayMatch("search", cacheParams, VIATOR_CACHE_MAX_AGE_MS);

    if (replayMatch.found && replayMatch.entry) {
      console.log(`[Viator] Cache HIT - returning ${replayMatch.entry.response.totalCount} cached products`);
      return {
        products: (replayMatch.entry.response.products as ViatorProduct[]) || [],
        totalCount: replayMatch.entry.response.totalCount || 0,
        currency: (replayMatch.entry.response.currency as string) || params.currency || "USD",
      };
    }
    console.log(`[Viator] Cache MISS - calling API`);
  }

  const startTime = Date.now();

  const searchBody: Record<string, unknown> = {
    filtering: {
      destination: destId?.toString(),
    },
    sorting: {
      sort: params.sortOrder || "TRAVELER_RATING",
      order: params.sortDirection || "DESCENDING",
    },
    pagination: {
      start: params.start || 1,
      count: params.count || 20,
    },
    currency: params.currency || "USD",
  };

  // Add date filtering if provided
  if (params.startDate || params.endDate) {
    searchBody.filtering = {
      ...searchBody.filtering as object,
      startDate: params.startDate,
      endDate: params.endDate,
    };
  }

  // Add tag filtering if provided
  if (params.tags && params.tags.length > 0) {
    searchBody.filtering = {
      ...searchBody.filtering as object,
      tags: params.tags,
    };
  }

  try {
    const response = await viatorFetch<{
      products: ViatorProduct[];
      totalCount: number;
      currency: string;
    }>("/products/search", {
      method: "POST",
      body: JSON.stringify(searchBody),
    });

    const result = {
      products: response.products || [],
      totalCount: response.totalCount || 0,
      currency: response.currency || params.currency || "USD",
    };

    const durationMs = Date.now() - startTime;

    // Log for caching
    const logEntry = createViatorLogEntry(
      "search",
      "/products/search",
      "POST",
      cacheParams,
      {
        products: result.products,
        totalCount: result.totalCount,
        currency: result.currency,
      },
      durationMs,
      true,
      undefined,
      { destination: params.destName || String(destId) }
    );
    logViatorRequest(logEntry).catch(console.error);

    return result;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    const logEntry = createViatorLogEntry(
      "search",
      "/products/search",
      "POST",
      cacheParams,
      {},
      durationMs,
      false,
      errorMessage,
      { destination: params.destName || String(destId) }
    );
    logViatorRequest(logEntry).catch(console.error);

    throw error;
  }
}

/**
 * Get product details by product code
 */
export async function getProductDetails(productCode: string): Promise<ViatorProductDetails | null> {
  try {
    const response = await viatorFetch<ViatorProductDetails>(
      `/products/${productCode}`
    );
    return response;
  } catch {
    return null;
  }
}

/**
 * Get availability for a product
 */
export async function getProductAvailability(
  productCode: string,
  startDate: string,
  _endDate: string,
  travelers: number = 2
): Promise<unknown> {
  const response = await viatorFetch(
    `/availability/check`,
    {
      method: "POST",
      body: JSON.stringify({
        productCode,
        travelDate: startDate,
        // Note: Actual implementation may vary based on API version
        paxMix: [
          {
            ageBand: "ADULT",
            numberOfTravelers: travelers,
          },
        ],
      }),
    }
  );

  return response;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Get the best image URL from a product
 */
export function getProductImageUrl(product: ViatorProduct, preferredWidth: number = 800): string {
  if (!product.images || product.images.length === 0) {
    return "/images/placeholder-activity.jpg";
  }

  // Find cover image or use first image
  const coverImage = product.images.find((img) => img.isCover) || product.images[0];

  if (!coverImage.variants || coverImage.variants.length === 0) {
    return coverImage.imageSource || "/images/placeholder-activity.jpg";
  }

  // Find variant closest to preferred width
  const sortedVariants = [...coverImage.variants].sort(
    (a, b) => Math.abs(a.width - preferredWidth) - Math.abs(b.width - preferredWidth)
  );

  return sortedVariants[0]?.url || coverImage.imageSource || "/images/placeholder-activity.jpg";
}

/**
 * Get product duration in minutes
 */
export function getProductDuration(product: ViatorProduct): number | null {
  if (!product.duration) return null;

  if (product.duration.fixedDurationInMinutes) {
    return product.duration.fixedDurationInMinutes;
  }

  if (product.duration.variableDurationFromMinutes) {
    return product.duration.variableDurationFromMinutes;
  }

  return null;
}

/**
 * Format duration for display
 */
export function formatProductDuration(product: ViatorProduct): string {
  if (!product.duration) return "Duration varies";

  const { fixedDurationInMinutes, variableDurationFromMinutes, variableDurationToMinutes } =
    product.duration;

  if (fixedDurationInMinutes) {
    const hours = Math.floor(fixedDurationInMinutes / 60);
    const mins = fixedDurationInMinutes % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours} hour${hours > 1 ? "s" : ""}`;
    return `${mins} min`;
  }

  if (variableDurationFromMinutes && variableDurationToMinutes) {
    const fromHours = Math.floor(variableDurationFromMinutes / 60);
    const toHours = Math.floor(variableDurationToMinutes / 60);
    return `${fromHours}-${toHours} hours`;
  }

  return "Duration varies";
}

/**
 * Generate booking URL for a product
 * Uses the productUrl from API response when available
 */
export function getBookingUrl(product: ViatorProduct): string {
  // Use the productUrl from API if available (includes affiliate tracking)
  if (product.productUrl) {
    return product.productUrl;
  }
  // Fallback: construct a basic URL (may not work for all products)
  return `https://www.viator.com/tours/${product.productCode}`;
}

/**
 * Convert Viator product to your app's Activity type
 */
export function viatorProductToActivity(product: ViatorProduct): {
  id: string;
  name: string;
  description: string;
  type: "activity";
  imageUrl: string;
  rating: number | undefined;
  reviewCount: number | undefined;
  priceLevel: 1 | 2 | 3 | 4;
  duration: number | undefined;
  bookingUrl: string;
  tags: string[];
  viatorProductCode: string;
  price?: {
    amount: number;
    currency: string;
  };
} {
  const price = product.pricing?.summary?.fromPrice || 0;

  // Determine price level based on actual price
  let priceLevel: 1 | 2 | 3 | 4 = 1;
  if (price > 200) priceLevel = 4;
  else if (price > 100) priceLevel = 3;
  else if (price > 50) priceLevel = 2;

  return {
    id: product.productCode,
    name: product.title,
    description: product.shortDescription || product.description || "",
    type: "activity",
    imageUrl: getProductImageUrl(product),
    rating: product.reviews?.combinedAverageRating,
    reviewCount: product.reviews?.totalReviews,
    priceLevel,
    duration: getProductDuration(product) || undefined,
    bookingUrl: getBookingUrl(product),
    tags: Array.isArray(product.tags)
      ? getTagNames(
          product.tags.map((t) => {
            if (typeof t === "number") return t;
            if (typeof t === "object" && t !== null && "tagId" in t) return t.tagId;
            return 0;
          }).filter((id) => id > 0)
        )
      : [],
    viatorProductCode: product.productCode,
    price: product.pricing?.summary
      ? {
          amount: product.pricing.summary.fromPrice,
          currency: product.pricing.currency,
        }
      : undefined,
  };
}

// ============================================
// TIME SLOT GENERATION
// Generate logical time slots based on activity duration and type
// ============================================

export interface TimeSlot {
  startTime: string;  // "09:00"
  endTime: string;    // "12:00"
  label: string;      // "Morning"
}

export interface ActivityWithTimeSlots {
  id: string;
  name: string;
  description: string;
  type: "activity";
  imageUrl: string;
  rating: number | undefined;
  reviewCount: number | undefined;
  priceLevel: 1 | 2 | 3 | 4;
  duration: number | undefined;
  bookingUrl: string;
  tags: string[];
  viatorProductCode: string;
  price?: {
    amount: number;
    currency: string;
  };
  suggestedTimeSlots: TimeSlot[];
  bestTimeOfDay: "morning" | "afternoon" | "evening" | "flexible";
}

/**
 * Determine best time of day based on activity tags and title
 */
function determineBestTimeOfDay(
  tags: string[],
  title: string,
  duration: number | undefined
): "morning" | "afternoon" | "evening" | "flexible" {
  const titleLower = title.toLowerCase();
  const tagsLower = tags.map(t => t.toLowerCase());

  // Evening/Night activities
  if (
    tagsLower.some(t => t.includes("night") || t.includes("evening") || t.includes("sunset")) ||
    titleLower.includes("night") ||
    titleLower.includes("evening") ||
    titleLower.includes("sunset") ||
    titleLower.includes("dinner") ||
    titleLower.includes("cabaret") ||
    titleLower.includes("show")
  ) {
    return "evening";
  }

  // Morning activities (sunrise, early access)
  if (
    tagsLower.some(t => t.includes("sunrise") || t.includes("early") || t.includes("morning")) ||
    titleLower.includes("sunrise") ||
    titleLower.includes("early access") ||
    titleLower.includes("morning") ||
    titleLower.includes("breakfast")
  ) {
    return "morning";
  }

  // Full day tours typically start in morning
  if (duration && duration >= 360) { // 6+ hours
    return "morning";
  }

  // Museums, walking tours - morning or afternoon
  if (
    tagsLower.some(t => t.includes("museum") || t.includes("walking") || t.includes("city tour"))
  ) {
    return "morning"; // Default to morning for these
  }

  // Food tours - can be lunch or dinner
  if (tagsLower.some(t => t.includes("food") || t.includes("culinary"))) {
    return "afternoon"; // Default to lunch time
  }

  return "flexible";
}

/**
 * Add minutes to a time string
 */
function addMinutesToTime(time: string, minutes: number): string {
  const [hours, mins] = time.split(":").map(Number);
  const totalMinutes = hours * 60 + mins + minutes;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMins = totalMinutes % 60;
  return `${String(newHours).padStart(2, "0")}:${String(newMins).padStart(2, "0")}`;
}

/**
 * Get time label for a given hour
 */
function getTimeLabel(hour: number): string {
  if (hour >= 5 && hour < 12) return "Morning";
  if (hour >= 12 && hour < 17) return "Afternoon";
  if (hour >= 17 && hour < 21) return "Evening";
  return "Night";
}

/**
 * Generate suggested time slots for an activity
 */
export function generateTimeSlots(
  durationMinutes: number | undefined,
  tags: string[],
  title: string
): TimeSlot[] {
  const duration = durationMinutes || 120; // Default 2 hours
  const bestTime = determineBestTimeOfDay(tags, title, duration);
  const slots: TimeSlot[] = [];

  // Select appropriate start times based on best time of day
  let startTimes: string[] = [];

  switch (bestTime) {
    case "morning":
      // Morning activities: pick 2-3 morning slots
      if (duration >= 360) {
        // Full day: early start
        startTimes = ["08:00", "08:30", "09:00"];
      } else {
        startTimes = ["09:00", "09:30", "10:00", "10:30"];
      }
      break;

    case "afternoon":
      startTimes = ["12:00", "13:00", "14:00", "15:00"];
      break;

    case "evening":
      if (title.toLowerCase().includes("sunset")) {
        startTimes = ["17:00", "17:30", "18:00", "18:30"];
      } else if (title.toLowerCase().includes("dinner") || title.toLowerCase().includes("show")) {
        startTimes = ["19:00", "19:30", "20:00", "20:30"];
      } else {
        startTimes = ["18:00", "18:30", "19:00", "19:30"];
      }
      break;

    case "flexible":
    default:
      // Offer morning and afternoon options
      if (duration <= 180) { // 3 hours or less
        startTimes = ["09:00", "10:00", "14:00", "15:00"];
      } else {
        startTimes = ["09:00", "09:30", "14:00"];
      }
      break;
  }

  // Generate slots from start times
  for (const startTime of startTimes) {
    const endTime = addMinutesToTime(startTime, duration);
    const hour = parseInt(startTime.split(":")[0]);

    slots.push({
      startTime,
      endTime,
      label: getTimeLabel(hour),
    });
  }

  return slots;
}

/**
 * Pick a single recommended time slot for itinerary building
 */
export function getRecommendedTimeSlot(
  durationMinutes: number | undefined,
  tags: string[],
  title: string,
  preferredTimeOfDay?: "morning" | "afternoon" | "evening"
): TimeSlot {
  const duration = durationMinutes || 120;
  const bestTime = preferredTimeOfDay || determineBestTimeOfDay(tags, title, duration);

  let startTime: string;

  switch (bestTime) {
    case "morning":
      startTime = duration >= 360 ? "08:30" : "09:30";
      break;
    case "afternoon":
      startTime = "14:00";
      break;
    case "evening":
      startTime = title.toLowerCase().includes("dinner") ? "19:30" : "18:00";
      break;
    default:
      startTime = "10:00";
  }

  const endTime = addMinutesToTime(startTime, duration);
  const hour = parseInt(startTime.split(":")[0]);

  return {
    startTime,
    endTime,
    label: getTimeLabel(hour),
  };
}

/**
 * Convert Viator product to Activity with time slots
 */
export function viatorProductToActivityWithTimeSlots(product: ViatorProduct): ActivityWithTimeSlots {
  const baseActivity = viatorProductToActivity(product);
  const duration = baseActivity.duration;
  const tags = baseActivity.tags;

  const suggestedTimeSlots = generateTimeSlots(duration, tags, product.title);
  const bestTimeOfDay = determineBestTimeOfDay(tags, product.title, duration);

  return {
    ...baseActivity,
    suggestedTimeSlots,
    bestTimeOfDay,
  };
}

export const VIATOR_TAGS = {
  TOURS: 11889,
  DAY_TRIPS: 11894,
  CULTURAL_TOURS: 12065,
  FOOD_TOURS: 12066,
  WALKING_TOURS: 11916,
  OUTDOOR_ACTIVITIES: 11919,
  WATER_SPORTS: 11920,
  MUSEUMS: 12062,
  ATTRACTIONS: 12061,
  NIGHTLIFE: 11901,
  ADVENTURE: 11917,
  FAMILY_FRIENDLY: 11899,
} as const;

// ============================================
// FREETEXT SEARCH - POI-specific search
// ============================================

/**
 * Search for products using freetext search (POI-specific)
 * This is the recommended method for finding tours related to specific attractions
 */
export async function searchProductsFreetext(
  params: ViatorFreetextSearchParams
): Promise<ViatorFreetextSearchResponse> {
  const cacheParams = {
    searchTerm: params.searchTerm,
    count: params.count,
  };

  // Check cache in test mode
  if (isViatorTestMode()) {
    console.log(`[Viator] Test mode - checking cache for freetext: "${params.searchTerm}"`);
    const replayMatch = await findViatorReplayMatch("freetext", cacheParams, VIATOR_CACHE_MAX_AGE_MS);

    if (replayMatch.found && replayMatch.entry) {
      console.log(`[Viator] Cache HIT - returning cached freetext results`);
      return replayMatch.entry.response as ViatorFreetextSearchResponse;
    }
    console.log(`[Viator] Cache MISS - calling API`);
  }

  const startTime = Date.now();

  try {
    const response = await viatorFetch<ViatorFreetextSearchResponse>(
      "/search/freetext",
      {
        method: "POST",
        body: JSON.stringify({
          searchTerm: params.searchTerm,
          searchTypes: [
            { searchType: "PRODUCTS", pagination: { start: params.start || 1, count: params.count || 10 } },
          ],
          currency: params.currency || "USD",
        }),
      }
    );

    const durationMs = Date.now() - startTime;

    // Log for caching
    const logEntry = createViatorLogEntry(
      "freetext",
      "/search/freetext",
      "POST",
      cacheParams,
      response,
      durationMs,
      true,
      undefined,
      { searchTerm: params.searchTerm }
    );
    logViatorRequest(logEntry).catch(console.error);

    return response;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    const logEntry = createViatorLogEntry(
      "freetext",
      "/search/freetext",
      "POST",
      cacheParams,
      {},
      durationMs,
      false,
      errorMessage,
      { searchTerm: params.searchTerm }
    );
    logViatorRequest(logEntry).catch(console.error);

    throw error;
  }
}

/**
 * Search for attractions (POIs) using freetext search
 * Returns attraction entities with IDs that can be used to find related products
 */
export async function searchAttractions(
  searchTerm: string,
  count: number = 5
): Promise<ViatorAttraction[]> {
  const cacheParams = { searchTerm, count, type: "attractions" };

  // Check cache in test mode
  if (isViatorTestMode()) {
    console.log(`[Viator] Test mode - checking cache for attractions: "${searchTerm}"`);
    const replayMatch = await findViatorReplayMatch("attractions", cacheParams, VIATOR_CACHE_MAX_AGE_MS);

    if (replayMatch.found && replayMatch.entry) {
      console.log(`[Viator] Cache HIT - returning cached attractions`);
      return (replayMatch.entry.response.attractions as ViatorAttraction[]) || [];
    }
    console.log(`[Viator] Cache MISS - calling API`);
  }

  const startTime = Date.now();

  try {
    const response = await viatorFetch<{
      attractions?: { results: ViatorAttraction[]; totalCount: number };
    }>("/search/freetext", {
      method: "POST",
      body: JSON.stringify({
        searchTerm,
        searchTypes: [
          { searchType: "ATTRACTIONS", pagination: { start: 1, count } },
        ],
        currency: "USD",
      }),
    });

    const attractions = response.attractions?.results || [];
    const durationMs = Date.now() - startTime;

    // Log for caching
    const logEntry = createViatorLogEntry(
      "attractions",
      "/search/freetext",
      "POST",
      cacheParams,
      { attractions },
      durationMs,
      true,
      undefined,
      { searchTerm }
    );
    logViatorRequest(logEntry).catch(console.error);

    return attractions;
  } catch (error) {
    const durationMs = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : "Unknown error";

    const logEntry = createViatorLogEntry(
      "attractions",
      "/search/freetext",
      "POST",
      cacheParams,
      {},
      durationMs,
      false,
      errorMessage,
      { searchTerm }
    );
    logViatorRequest(logEntry).catch(console.error);

    throw error;
  }
}

// ============================================
// TAG ID TO NAME MAPPING
// Maps numeric Viator tag IDs to human-readable names
// ============================================

const TAG_ID_TO_NAME: Record<number, string> = {
  // Main Categories
  11889: "Tours",
  11894: "Day Trips",
  11916: "Walking Tours",
  11917: "Adventure",
  11919: "Outdoor Activities",
  11920: "Water Sports",
  11899: "Family Friendly",
  11901: "Nightlife",
  11937: "Shore Excursions",
  11941: "Sightseeing",
  11930: "Nature & Wildlife",
  12061: "Attractions",
  12062: "Museums",
  12065: "Cultural Tours",
  12066: "Food & Drink",
  12035: "City Tours",

  // Experience Types
  21737: "Private Tours",
  21733: "Small Group",
  21972: "Hiking",
  21911: "Photography Tours",
  21912: "Romantic",
  21913: "Luxury",
  22046: "Desert Tours",
  22048: "Mountain Tours",
  22049: "Beach & Sun",
  22050: "Island Tours",

  // Activities
  11921: "Snorkeling",
  11922: "Scuba Diving",
  11923: "Surfing",
  11924: "Kayaking",
  11925: "Sailing",
  11926: "Fishing",
  11927: "Cycling",
  11928: "Golf",
  11929: "Spa & Wellness",
  11931: "Wildlife Watching",
  11932: "Bird Watching",
  11933: "Whale Watching",
  11934: "Dolphin Watching",
  11935: "Safari",
  11936: "Zoo & Aquarium",
  11938: "Cruises",
  11939: "Boat Tours",
  11940: "Helicopter Tours",
  11942: "Segway Tours",
  11943: "Bike Tours",
  11944: "Bus Tours",
  11945: "Train Tours",

  // Food & Drink
  12067: "Wine Tasting",
  12068: "Beer Tasting",
  12069: "Cooking Classes",
  12070: "Market Tours",
  12071: "Coffee & Tea",
  12072: "Street Food",
  12073: "Dinner Shows",

  // Entertainment
  11902: "Shows & Concerts",
  11903: "Theater",
  11904: "Cabaret",
  11905: "Comedy Shows",
  11906: "Live Music",
  11907: "Sporting Events",
  11908: "Theme Parks",
  11909: "Water Parks",

  // Cultural
  12063: "Historical Tours",
  12064: "Art Tours",
  12074: "Religious Sites",
  12075: "Architecture Tours",
  12076: "Ghost Tours",
  12077: "Literary Tours",
  12078: "Movie Tours",

  // Special Interest
  21914: "Skip the Line",
  21915: "Early Access",
  21916: "After Hours",
  21917: "VIP Access",
  21918: "Behind the Scenes",

  // Duration/Time
  21919: "Half Day",
  21920: "Full Day",
  21921: "Multi-Day",
  21922: "Evening",
  21923: "Morning",
  21924: "Afternoon",

  // Specific categories from API responses
  367659: "Experiences",
  367661: "Desert Adventures",
  367662: "Water Adventures",
  367663: "Air Adventures",
  367664: "Land Adventures",
};

/**
 * Convert a tag ID to a human-readable name
 * Returns the ID as a string if no mapping exists
 */
export function getTagName(tagId: number): string {
  return TAG_ID_TO_NAME[tagId] || String(tagId);
}

/**
 * Convert an array of tag IDs to human-readable names
 * Filters out unknown tags and returns unique names
 */
export function getTagNames(tagIds: number[]): string[] {
  const names = tagIds
    .map((id) => TAG_ID_TO_NAME[id])
    .filter((name): name is string => name !== undefined);

  // Return unique names only
  return [...new Set(names)];
}
