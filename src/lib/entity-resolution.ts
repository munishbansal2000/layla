// ============================================
// ENTITY RESOLUTION SERVICE
// ============================================
// Links AI-generated activities to external APIs (Google Places, Yelp, Viator)
// to get canonical IDs, real-time data, ratings, and booking links.
// Implements Section 1 (Entity Resolution & Grounding) from docs/ACTIVITY_SUGGESTION_ALGORITHM.md

import {
  CoreActivity,
  RestaurantActivity,
  EntityIds,
  ActivityCategory,
} from "@/types/activity-suggestion";
import {
  searchPlacesByText,
  getPlaceDetails,
  GooglePlace,
  TextSearchParams,
} from "./google-places";
import {
  searchBusinesses,
  getBusinessDetails,
  YelpBusiness,
  YelpSearchParams,
} from "./yelp";
import {
  searchProducts,
  getProductDetails,
  ViatorProduct,
  ViatorSearchResponse,
  getProductDuration,
} from "./viator";

// ============================================
// TYPES
// ============================================

/**
 * Grounding status for an activity
 */
export type GroundingStatus = "verified" | "partially-verified" | "unverified" | "ai-generated";

/**
 * Source preference for conflict resolution
 */
export type PreferredSource = "google" | "yelp" | "viator" | "ai" | "merged";

/**
 * Operating hours for a specific day
 */
export interface OperatingHours {
  dayOfWeek: "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday";
  open: string; // "09:00"
  close: string; // "17:00"
  lastEntry?: string; // "16:30" - important for museums
}

/**
 * Holiday exception
 */
export interface HolidayException {
  date: string; // "2025-01-01"
  isOpen: boolean;
  specialHours?: { open: string; close: string };
  note?: string; // "Closed for New Year"
}

/**
 * External references for an activity
 */
export interface ExternalRefs {
  googlePlaceId?: string;
  yelpId?: string;
  viatorProductCode?: string;
  foursquareId?: string;
  osmId?: string;
}

/**
 * Data from Google Places
 */
export interface GooglePlaceData {
  placeId: string;
  name: string;
  formattedAddress: string;
  location: { lat: number; lng: number };
  rating?: number;
  userRatingCount?: number;
  priceLevel?: number;
  openingHours?: OperatingHours[];
  isOpenNow?: boolean;
  photos?: string[];
  types?: string[];
  website?: string;
  phone?: string;
}

/**
 * Data from Yelp
 */
export interface YelpData {
  yelpId: string;
  name: string;
  rating?: number;
  reviewCount?: number;
  priceLevel?: number;
  categories?: string[];
  imageUrl?: string;
  isOpenNow?: boolean;
  phone?: string;
  url?: string;
}

/**
 * Data from Viator
 */
export interface ViatorData {
  productCode: string;
  title: string;
  description?: string;
  rating?: number;
  reviewCount?: number;
  duration?: number; // minutes
  price?: { amount: number; currency: string };
  bookingUrl?: string;
  images?: string[];
}

/**
 * Resolution result with merged data
 */
export interface ResolutionResult {
  entityIds: EntityIds;
  groundingStatus: GroundingStatus;
  preferredSource: PreferredSource;
  lastVerified: string;

  // Merged data
  verifiedName?: string;
  verifiedAddress?: string;
  verifiedLocation?: { lat: number; lng: number };
  verifiedRating?: number;
  verifiedReviewCount?: number;
  operatingHours?: OperatingHours[];
  isOpenNow?: boolean;
  photos?: string[];
  bookingUrl?: string;
  website?: string;
  phone?: string;

  // Source-specific data
  googleData?: GooglePlaceData;
  yelpData?: YelpData;
  viatorData?: ViatorData;

  // Conflicts
  conflicts?: ResolutionConflict[];
  confidence: number; // 0-1
}

/**
 * Conflict between sources
 */
export interface ResolutionConflict {
  field: string;
  sources: { source: PreferredSource; value: unknown }[];
  resolvedValue: unknown;
  resolution: "preferred-source" | "highest-rated" | "most-recent" | "manual";
}

/**
 * Grounded activity with all external data
 */
/**
 * Grounded activity with all external data
 * Uses Omit to avoid lastVerified conflict with CoreActivity
 */
export interface GroundedActivity extends Omit<CoreActivity, 'lastVerified'> {
  externalRefs: ExternalRefs;
  groundingStatus: GroundingStatus;
  preferredSource: PreferredSource;
  lastVerified: string; // ISO string format for serialization
  resolvedOperatingHours?: OperatingHours[];
  holidayExceptions?: HolidayException[];
  requiresTimedEntry?: boolean;
  advanceBookingDays?: number;
  likelyToSellOut?: boolean;
  viatorEnhancements?: ViatorEnhancement[];
}

/**
 * Grounded restaurant activity
 */
export interface GroundedRestaurantActivity extends Omit<RestaurantActivity, 'lastVerified' | 'category'> {
  category: 'restaurant';
  externalRefs: ExternalRefs;
  groundingStatus: GroundingStatus;
  preferredSource: PreferredSource;
  lastVerified: string;
  resolvedOperatingHours?: OperatingHours[];
  holidayExceptions?: HolidayException[];
  viatorEnhancements?: ViatorEnhancement[];
}

/**
 * Union type for any grounded activity
 */
export type AnyGroundedActivity = GroundedActivity | GroundedRestaurantActivity;

/**
 * Viator enhancement option
 */
export interface ViatorEnhancement {
  productCode: string;
  title: string;
  type: "skip-the-line" | "guided-tour" | "private" | "combo" | "ticket";
  price: { amount: number; currency: string };
  duration?: number;
  rating?: number;
  bookingUrl: string;
}

/**
 * Resolution request
 */
export interface ResolutionRequest {
  activity: CoreActivity | RestaurantActivity;
  resolveGoogle?: boolean;
  resolveYelp?: boolean;
  resolveViator?: boolean;
  forceRefresh?: boolean;
}

/**
 * Batch resolution result
 */
export interface BatchResolutionResult {
  resolved: AnyGroundedActivity[];
  failed: { activity: CoreActivity | RestaurantActivity; error: string }[];
  stats: {
    total: number;
    verified: number;
    partiallyVerified: number;
    unverified: number;
    cached: number;
  };
}

// ============================================
// CONSTANTS
// ============================================

/**
 * Category to Google Places type mapping
 */
const CATEGORY_TO_GOOGLE_TYPES: Record<ActivityCategory, string[]> = {
  temple: ["hindu_temple", "buddhist_temple", "place_of_worship"],
  shrine: ["place_of_worship"],
  museum: ["museum", "art_gallery"],
  park: ["park", "national_park"],
  garden: ["park"],
  landmark: ["tourist_attraction", "landmark"],
  neighborhood: ["neighborhood", "locality"],
  market: ["market", "shopping_mall"],
  shopping: ["shopping_mall", "store"],
  entertainment: ["amusement_park", "movie_theater", "night_club"],
  nature: ["natural_feature", "park"],
  viewpoint: ["tourist_attraction"],
  "cultural-experience": ["cultural_center", "performing_arts_theater"],
  "food-tour": ["restaurant", "food"],
  "walking-tour": ["tourist_attraction"],
  "day-trip": ["tourist_attraction"],
  nightlife: ["night_club", "bar"],
  relaxation: ["spa", "wellness_center"],
  adventure: ["amusement_park", "tourist_attraction"],
  "family-activity": ["amusement_park", "zoo", "aquarium"],
  "photo-spot": ["tourist_attraction"],
};

/**
 * Category to Yelp category mapping
 */
const CATEGORY_TO_YELP: Record<string, string> = {
  temple: "religiousorgs",
  shrine: "religiousorgs",
  museum: "museums",
  park: "parks",
  garden: "gardens",
  landmark: "landmarks",
  market: "publicmarkets",
  shopping: "shopping",
  entertainment: "arts",
  nightlife: "nightlife",
  relaxation: "spas",
};

/**
 * Fuzzy match threshold for name comparison
 */
const NAME_MATCH_THRESHOLD = 0.7;

/**
 * Maximum distance for location matching (meters)
 */
const LOCATION_MATCH_DISTANCE = 500;

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Calculate string similarity (Levenshtein distance normalized)
 */
function calculateStringSimilarity(str1: string, str2: string): number {
  const s1 = str1.toLowerCase().trim();
  const s2 = str2.toLowerCase().trim();

  if (s1 === s2) return 1;
  if (s1.length === 0 || s2.length === 0) return 0;

  // Quick check for substring match
  if (s1.includes(s2) || s2.includes(s1)) return 0.9;

  // Levenshtein distance
  const matrix: number[][] = [];
  for (let i = 0; i <= s1.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= s2.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= s1.length; i++) {
    for (let j = 1; j <= s2.length; j++) {
      if (s1[i - 1] === s2[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  const maxLen = Math.max(s1.length, s2.length);
  return 1 - matrix[s1.length][s2.length] / maxLen;
}

/**
 * Calculate distance between two coordinates (Haversine)
 */
function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371e3;
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lng2 - lng1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Check if two activities match
 */
function isMatch(
  activity: CoreActivity | RestaurantActivity,
  candidateName: string,
  candidateLat: number,
  candidateLng: number
): { matches: boolean; confidence: number } {
  // Name similarity
  const nameSimilarity = calculateStringSimilarity(activity.name, candidateName);

  // Location distance
  const distance = calculateDistance(
    activity.location.lat,
    activity.location.lng,
    candidateLat,
    candidateLng
  );

  // Match if name is similar AND location is close
  if (nameSimilarity >= NAME_MATCH_THRESHOLD && distance <= LOCATION_MATCH_DISTANCE) {
    const confidence = (nameSimilarity + (1 - distance / LOCATION_MATCH_DISTANCE)) / 2;
    return { matches: true, confidence };
  }

  // Strong name match with distant location might still be valid
  if (nameSimilarity >= 0.9 && distance <= 2000) {
    return { matches: true, confidence: nameSimilarity * 0.8 };
  }

  return { matches: false, confidence: 0 };
}

/**
 * Convert Google opening hours to our format
 */
function convertGoogleHours(place: GooglePlace): OperatingHours[] {
  if (!place.currentOpeningHours?.periods) return [];

  const dayNames: OperatingHours["dayOfWeek"][] = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];

  return place.currentOpeningHours.periods.map((period) => ({
    dayOfWeek: dayNames[period.open.day],
    open: `${String(period.open.hour).padStart(2, "0")}:${String(period.open.minute).padStart(2, "0")}`,
    close: period.close
      ? `${String(period.close.hour).padStart(2, "0")}:${String(period.close.minute).padStart(2, "0")}`
      : "23:59",
  }));
}

/**
 * Convert Yelp hours to our format
 */
function convertYelpHours(business: YelpBusiness): OperatingHours[] {
  if (!business.hours?.[0]?.open) return [];

  const dayNames: OperatingHours["dayOfWeek"][] = [
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
    "sunday",
  ];

  return business.hours[0].open.map((h) => ({
    dayOfWeek: dayNames[h.day],
    open: `${h.start.slice(0, 2)}:${h.start.slice(2)}`,
    close: `${h.end.slice(0, 2)}:${h.end.slice(2)}`,
  }));
}

// ============================================
// GOOGLE PLACES RESOLUTION
// ============================================

/**
 * Resolve activity against Google Places
 */
async function resolveWithGoogle(
  activity: CoreActivity | RestaurantActivity
): Promise<GooglePlaceData | null> {
  try {
    // Search by name and location
    const searchQuery = `${activity.name} ${activity.address?.city || ""}`;
    const searchParams: TextSearchParams = {
      textQuery: searchQuery,
      maxResultCount: 5,
      locationBias: {
        circle: {
          center: { latitude: activity.location.lat, longitude: activity.location.lng },
          radius: 2000,
        },
      },
    };
    const response = await searchPlacesByText(searchParams);
    const results = response.places || [];

    if (results.length === 0) return null;

    // Find best match
    let bestMatch: GooglePlace | null = null;
    let bestConfidence = 0;

    for (const place of results) {
      const { matches, confidence } = isMatch(
        activity,
        place.displayName.text,
        place.location.latitude,
        place.location.longitude
      );

      if (matches && confidence > bestConfidence) {
        bestMatch = place;
        bestConfidence = confidence;
      }
    }

    if (!bestMatch) return null;

    // Get full details
    const details = await getPlaceDetails(bestMatch.id);
    const place = details || bestMatch;

    return {
      placeId: place.id,
      name: place.displayName.text,
      formattedAddress: place.formattedAddress,
      location: {
        lat: place.location.latitude,
        lng: place.location.longitude,
      },
      rating: place.rating,
      userRatingCount: place.userRatingCount,
      priceLevel: place.priceLevel
        ? ["PRICE_LEVEL_FREE", "PRICE_LEVEL_INEXPENSIVE", "PRICE_LEVEL_MODERATE", "PRICE_LEVEL_EXPENSIVE", "PRICE_LEVEL_VERY_EXPENSIVE"].indexOf(place.priceLevel)
        : undefined,
      openingHours: convertGoogleHours(place),
      isOpenNow: place.currentOpeningHours?.openNow,
      photos: place.photos?.slice(0, 5).map((p) => p.name),
      types: place.types,
      website: place.websiteUri,
      phone: place.nationalPhoneNumber,
    };
  } catch (error) {
    console.error("Google Places resolution error:", error);
    return null;
  }
}

// ============================================
// YELP RESOLUTION
// ============================================

/**
 * Resolve activity against Yelp
 */
async function resolveWithYelp(
  activity: CoreActivity | RestaurantActivity
): Promise<YelpData | null> {
  try {
    const category = (activity as CoreActivity).category;
    const yelpCategory = CATEGORY_TO_YELP[category] || "";

    const params: YelpSearchParams = {
      term: activity.name,
      latitude: activity.location.lat,
      longitude: activity.location.lng,
      radius: 2000,
      limit: 5,
      categories: yelpCategory,
    };

    const results = await searchBusinesses(params);

    if (!results.businesses || results.businesses.length === 0) return null;

    // Find best match
    let bestMatch: YelpBusiness | null = null;
    let bestConfidence = 0;

    for (const business of results.businesses) {
      const { matches, confidence } = isMatch(
        activity,
        business.name,
        business.coordinates.latitude,
        business.coordinates.longitude
      );

      if (matches && confidence > bestConfidence) {
        bestMatch = business;
        bestConfidence = confidence;
      }
    }

    if (!bestMatch) return null;

    // Get full details
    const details = await getBusinessDetails(bestMatch.id);
    const business = details || bestMatch;

    return {
      yelpId: business.id,
      name: business.name,
      rating: business.rating,
      reviewCount: business.review_count,
      priceLevel: business.price?.length,
      categories: business.categories?.map((c) => c.title),
      imageUrl: business.image_url,
      isOpenNow: business.hours?.[0]?.is_open_now,
      phone: business.display_phone,
      url: business.url,
    };
  } catch (error) {
    console.error("Yelp resolution error:", error);
    return null;
  }
}

// ============================================
// VIATOR RESOLUTION
// ============================================

/**
 * Resolve activity against Viator
 */
async function resolveWithViator(
  activity: CoreActivity | RestaurantActivity
): Promise<ViatorData | null> {
  try {
    // Search for products matching the activity
    const response: ViatorSearchResponse = await searchProducts({
      destName: activity.address?.city || "",
      count: 10,
      sortOrder: "TRAVELER_RATING",
    });

    if (!response.products || response.products.length === 0) return null;

    // Find best match
    let bestMatch: ViatorProduct | null = null;
    let bestConfidence = 0;

    for (const product of response.products) {
      const nameSimilarity = calculateStringSimilarity(activity.name, product.title);

      if (nameSimilarity >= 0.6 && nameSimilarity > bestConfidence) {
        bestMatch = product;
        bestConfidence = nameSimilarity;
      }
    }

    if (!bestMatch) return null;

    // Get full details
    const details = await getProductDetails(bestMatch.productCode);
    const product = details || bestMatch;

    // Parse duration using Viator helper
    const durationMinutes = getProductDuration(product) ?? undefined;

    return {
      productCode: product.productCode,
      title: product.title,
      description: product.description,
      rating: product.reviews?.combinedAverageRating,
      reviewCount: product.reviews?.totalReviews,
      duration: durationMinutes,
      price: product.pricing?.summary?.fromPrice
        ? {
            amount: product.pricing.summary.fromPrice,
            currency: product.pricing.currency || "USD",
          }
        : undefined,
      bookingUrl: product.productUrl,
      images: product.images?.slice(0, 5).map((img) => img.variants?.[0]?.url).filter(Boolean) as string[],
    };
  } catch (error) {
    console.error("Viator resolution error:", error);
    return null;
  }
}

// ============================================
// CONFLICT RESOLUTION
// ============================================

/**
 * Merge data from multiple sources with conflict resolution
 */
function mergeSourceData(
  googleData: GooglePlaceData | null,
  yelpData: YelpData | null,
  viatorData: ViatorData | null
): {
  merged: Partial<ResolutionResult>;
  conflicts: ResolutionConflict[];
  preferredSource: PreferredSource;
} {
  const conflicts: ResolutionConflict[] = [];
  const merged: Partial<ResolutionResult> = {};

  // Determine preferred source (Google > Yelp > Viator for location data)
  let preferredSource: PreferredSource = "ai";
  if (googleData) preferredSource = "google";
  else if (yelpData) preferredSource = "yelp";
  else if (viatorData) preferredSource = "viator";

  // Merge name (prefer Google)
  if (googleData?.name) {
    merged.verifiedName = googleData.name;
  } else if (yelpData?.name) {
    merged.verifiedName = yelpData.name;
  } else if (viatorData?.title) {
    merged.verifiedName = viatorData.title;
  }

  // Merge address (prefer Google)
  if (googleData?.formattedAddress) {
    merged.verifiedAddress = googleData.formattedAddress;
  }

  // Merge location (prefer Google)
  if (googleData?.location) {
    merged.verifiedLocation = googleData.location;
  }

  // Merge rating with conflict detection
  const ratings: { source: PreferredSource; value: number }[] = [];
  if (googleData?.rating) ratings.push({ source: "google", value: googleData.rating });
  if (yelpData?.rating) ratings.push({ source: "yelp", value: yelpData.rating });
  if (viatorData?.rating) ratings.push({ source: "viator", value: viatorData.rating });

  if (ratings.length > 0) {
    // Use weighted average if multiple sources
    if (ratings.length > 1) {
      const avgRating =
        ratings.reduce((sum, r) => sum + r.value, 0) / ratings.length;
      merged.verifiedRating = Math.round(avgRating * 10) / 10;

      // Check for significant discrepancy
      const maxDiff = Math.max(...ratings.map((r) => Math.abs(r.value - avgRating)));
      if (maxDiff > 0.5) {
        conflicts.push({
          field: "rating",
          sources: ratings.map((r) => ({ source: r.source, value: r.value })),
          resolvedValue: merged.verifiedRating,
          resolution: "highest-rated",
        });
      }
    } else {
      merged.verifiedRating = ratings[0].value;
    }
  }

  // Merge review count (sum all sources)
  const reviewCounts: number[] = [];
  if (googleData?.userRatingCount) reviewCounts.push(googleData.userRatingCount);
  if (yelpData?.reviewCount) reviewCounts.push(yelpData.reviewCount);
  if (viatorData?.reviewCount) reviewCounts.push(viatorData.reviewCount);
  if (reviewCounts.length > 0) {
    merged.verifiedReviewCount = Math.max(...reviewCounts);
  }

  // Merge operating hours (prefer Google)
  if (googleData?.openingHours && googleData.openingHours.length > 0) {
    merged.operatingHours = googleData.openingHours;
  }

  // Merge isOpenNow (prefer Google)
  merged.isOpenNow = googleData?.isOpenNow ?? yelpData?.isOpenNow;

  // Merge photos (combine from all sources)
  const allPhotos: string[] = [];
  if (googleData?.photos) allPhotos.push(...googleData.photos);
  if (yelpData?.imageUrl) allPhotos.push(yelpData.imageUrl);
  if (viatorData?.images) allPhotos.push(...viatorData.images);
  if (allPhotos.length > 0) {
    merged.photos = [...new Set(allPhotos)].slice(0, 10);
  }

  // Merge booking URL (Viator only)
  if (viatorData?.bookingUrl) {
    merged.bookingUrl = viatorData.bookingUrl;
  }

  // Merge website (Google preferred)
  merged.website = googleData?.website;

  // Merge phone (Google preferred)
  merged.phone = googleData?.phone || yelpData?.phone;

  return { merged, conflicts, preferredSource };
}

// ============================================
// MAIN RESOLUTION FUNCTIONS
// ============================================

/**
 * Resolve a single activity
 */
export async function resolveActivity(
  request: ResolutionRequest
): Promise<ResolutionResult> {
  const {
    activity,
    resolveGoogle = true,
    resolveYelp = true,
    resolveViator = true,
  } = request;

  // Resolve with each source in parallel
  const [googleData, yelpData, viatorData] = await Promise.all([
    resolveGoogle ? resolveWithGoogle(activity) : Promise.resolve(null),
    resolveYelp ? resolveWithYelp(activity) : Promise.resolve(null),
    resolveViator ? resolveWithViator(activity) : Promise.resolve(null),
  ]);

  // Merge data
  const { merged, conflicts, preferredSource } = mergeSourceData(
    googleData,
    yelpData,
    viatorData
  );

  // Determine grounding status
  let groundingStatus: GroundingStatus = "ai-generated";
  let confidence = 0;

  if (googleData && yelpData) {
    groundingStatus = "verified";
    confidence = 0.95;
  } else if (googleData || yelpData) {
    groundingStatus = "partially-verified";
    confidence = 0.75;
  } else if (viatorData) {
    groundingStatus = "partially-verified";
    confidence = 0.6;
  } else {
    groundingStatus = "unverified";
    confidence = 0.3;
  }

  // Build entity IDs
  const entityIds: EntityIds = {
    internalId: activity.id,
    googlePlaceId: googleData?.placeId,
    yelpId: yelpData?.yelpId,
    viatorProductCode: viatorData?.productCode,
  };

  return {
    entityIds,
    groundingStatus,
    preferredSource,
    lastVerified: new Date().toISOString(),
    ...merged,
    googleData: googleData || undefined,
    yelpData: yelpData || undefined,
    viatorData: viatorData || undefined,
    conflicts: conflicts.length > 0 ? conflicts : undefined,
    confidence,
  };
}

/**
 * Resolve multiple activities in batch
 */
export async function resolveActivitiesBatch(
  activities: (CoreActivity | RestaurantActivity)[],
  options?: {
    resolveGoogle?: boolean;
    resolveYelp?: boolean;
    resolveViator?: boolean;
    concurrency?: number;
  }
): Promise<BatchResolutionResult> {
  const {
    resolveGoogle = true,
    resolveYelp = true,
    resolveViator = true,
    concurrency = 5,
  } = options || {};

  const resolved: AnyGroundedActivity[] = [];
  const failed: { activity: CoreActivity | RestaurantActivity; error: string }[] = [];
  const stats = {
    total: activities.length,
    verified: 0,
    partiallyVerified: 0,
    unverified: 0,
    cached: 0,
  };

  // Process in batches for rate limiting
  for (let i = 0; i < activities.length; i += concurrency) {
    const batch = activities.slice(i, i + concurrency);

    const results = await Promise.allSettled(
      batch.map((activity) =>
        resolveActivity({
          activity,
          resolveGoogle,
          resolveYelp,
          resolveViator,
        })
      )
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      const activity = batch[j];

      if (result.status === "fulfilled") {
        const resolution = result.value;

        // Create grounded activity - handle lastVerified type conversion
        const { lastVerified: _origLastVerified, ...activityWithoutLastVerified } = activity;
        const grounded: AnyGroundedActivity = {
          ...activityWithoutLastVerified,
          externalRefs: {
            googlePlaceId: resolution.entityIds.googlePlaceId,
            yelpId: resolution.entityIds.yelpId,
            viatorProductCode: resolution.entityIds.viatorProductCode,
          },
          groundingStatus: resolution.groundingStatus,
          preferredSource: resolution.preferredSource,
          lastVerified: resolution.lastVerified,
          resolvedOperatingHours: resolution.operatingHours,
          // Update with verified data if available
          name: resolution.verifiedName || activity.name,
          rating: resolution.verifiedRating || activity.rating,
        } as AnyGroundedActivity;

        // Add Viator enhancements if available
        if (resolution.viatorData) {
          grounded.viatorEnhancements = [
            {
              productCode: resolution.viatorData.productCode,
              title: resolution.viatorData.title,
              type: "ticket",
              price: resolution.viatorData.price || { amount: 0, currency: "USD" },
              duration: resolution.viatorData.duration,
              rating: resolution.viatorData.rating,
              bookingUrl: resolution.viatorData.bookingUrl || "",
            },
          ];
        }

        resolved.push(grounded);

        // Update stats
        if (resolution.groundingStatus === "verified") stats.verified++;
        else if (resolution.groundingStatus === "partially-verified")
          stats.partiallyVerified++;
        else stats.unverified++;
      } else {
        failed.push({
          activity,
          error: result.reason?.message || "Unknown error",
        });
      }
    }

    // Small delay between batches for rate limiting
    if (i + concurrency < activities.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return { resolved, failed, stats };
}

// ============================================
// VIATOR ENHANCEMENT FUNCTIONS
// ============================================

/**
 * Find Viator enhancements for an activity
 */
export async function findViatorEnhancements(
  activity: CoreActivity | RestaurantActivity
): Promise<ViatorEnhancement[]> {
  try {
    const response: ViatorSearchResponse = await searchProducts({
      destName: activity.address?.city || "",
      count: 10,
      sortOrder: "TRAVELER_RATING",
    });

    if (!response.products || response.products.length === 0) return [];

    const enhancements: ViatorEnhancement[] = [];

    for (const product of response.products) {
      // Determine enhancement type from title/tags
      let type: ViatorEnhancement["type"] = "ticket";
      const title = product.title.toLowerCase();

      if (title.includes("skip the line") || title.includes("skip-the-line")) {
        type = "skip-the-line";
      } else if (title.includes("guided") || title.includes("tour")) {
        type = "guided-tour";
      } else if (title.includes("private")) {
        type = "private";
      } else if (title.includes("combo") || title.includes("package")) {
        type = "combo";
      }

      enhancements.push({
        productCode: product.productCode,
        title: product.title,
        type,
        price: product.pricing?.summary?.fromPrice
          ? {
              amount: product.pricing.summary.fromPrice,
              currency: product.pricing.currency || "USD",
            }
          : { amount: 0, currency: "USD" },
        rating: product.reviews?.combinedAverageRating,
        bookingUrl: product.productUrl || "",
      });
    }

    return enhancements.slice(0, 5);
  } catch (error) {
    console.error("Viator enhancement search error:", error);
    return [];
  }
}

// ============================================
// OPENING HOURS UTILITIES
// ============================================

/**
 * Check if activity is open at a specific time
 */
export function isOpenAt(
  hours: OperatingHours[],
  date: Date,
  holidayExceptions?: HolidayException[]
): { isOpen: boolean; opensAt?: string; closesAt?: string; note?: string } {
  // Check holiday exceptions first
  const dateStr = date.toISOString().split("T")[0];
  const holiday = holidayExceptions?.find((h) => h.date === dateStr);

  if (holiday) {
    if (!holiday.isOpen) {
      return { isOpen: false, note: holiday.note || "Closed for holiday" };
    }
    if (holiday.specialHours) {
      const currentTime = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
      const isOpen =
        currentTime >= holiday.specialHours.open &&
        currentTime < holiday.specialHours.close;
      return {
        isOpen,
        opensAt: holiday.specialHours.open,
        closesAt: holiday.specialHours.close,
        note: holiday.note,
      };
    }
  }

  // Check regular hours
  const dayNames: OperatingHours["dayOfWeek"][] = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const dayOfWeek = dayNames[date.getDay()];
  const dayHours = hours.find((h) => h.dayOfWeek === dayOfWeek);

  if (!dayHours) {
    return { isOpen: false, note: "Closed on this day" };
  }

  const currentTime = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
  const isOpen = currentTime >= dayHours.open && currentTime < dayHours.close;

  return {
    isOpen,
    opensAt: dayHours.open,
    closesAt: dayHours.close,
  };
}

/**
 * Get closing time for slot validation
 */
export function getClosingTime(
  hours: OperatingHours[],
  date: Date
): string | null {
  const dayNames: OperatingHours["dayOfWeek"][] = [
    "sunday",
    "monday",
    "tuesday",
    "wednesday",
    "thursday",
    "friday",
    "saturday",
  ];
  const dayOfWeek = dayNames[date.getDay()];
  const dayHours = hours.find((h) => h.dayOfWeek === dayOfWeek);

  return dayHours?.close || null;
}

/**
 * Check if activity will be open during slot
 */
export function willBeOpenDuringSlot(
  hours: OperatingHours[],
  slotStart: Date,
  slotEnd: Date,
  holidayExceptions?: HolidayException[]
): {
  feasible: boolean;
  warning?: string;
  lastEntry?: string;
} {
  const openCheck = isOpenAt(hours, slotStart, holidayExceptions);

  if (!openCheck.isOpen) {
    return {
      feasible: false,
      warning: `Activity is closed at ${slotStart.toLocaleTimeString()}. ${openCheck.note || `Opens at ${openCheck.opensAt}`}`,
    };
  }

  // Check if slot end is after closing
  if (openCheck.closesAt) {
    const slotEndTime = `${String(slotEnd.getHours()).padStart(2, "0")}:${String(slotEnd.getMinutes()).padStart(2, "0")}`;

    if (slotEndTime > openCheck.closesAt) {
      return {
        feasible: true,
        warning: `Activity closes at ${openCheck.closesAt}. Plan to arrive early.`,
        lastEntry: openCheck.closesAt,
      };
    }
  }

  return { feasible: true };
}

// ============================================
// ENTITY RESOLUTION SERVICE CLASS
// ============================================

export class EntityResolutionService {
  private cache: Map<string, ResolutionResult> = new Map();
  private cacheMaxAge: number = 24 * 60 * 60 * 1000; // 24 hours

  constructor(options?: { cacheMaxAge?: number }) {
    if (options?.cacheMaxAge) {
      this.cacheMaxAge = options.cacheMaxAge;
    }
  }

  /**
   * Resolve a single activity with caching
   */
  async resolve(
    activity: CoreActivity | RestaurantActivity,
    options?: {
      resolveGoogle?: boolean;
      resolveYelp?: boolean;
      resolveViator?: boolean;
      forceRefresh?: boolean;
    }
  ): Promise<ResolutionResult> {
    const cacheKey = activity.id;

    // Check cache
    if (!options?.forceRefresh && this.cache.has(cacheKey)) {
      const cached = this.cache.get(cacheKey)!;
      const age = Date.now() - new Date(cached.lastVerified).getTime();
      if (age < this.cacheMaxAge) {
        return cached;
      }
    }

    // Resolve
    const result = await resolveActivity({
      activity,
      ...options,
    });

    // Cache result
    this.cache.set(cacheKey, result);

    return result;
  }

  /**
   * Resolve multiple activities
   */
  async resolveBatch(
    activities: (CoreActivity | RestaurantActivity)[],
    options?: {
      resolveGoogle?: boolean;
      resolveYelp?: boolean;
      resolveViator?: boolean;
      concurrency?: number;
    }
  ): Promise<BatchResolutionResult> {
    return resolveActivitiesBatch(activities, options);
  }

  /**
   * Get Viator enhancements for an activity
   */
  async getEnhancements(
    activity: CoreActivity | RestaurantActivity
  ): Promise<ViatorEnhancement[]> {
    return findViatorEnhancements(activity);
  }

  /**
   * Check if activity is open
   */
  checkOpenStatus(
    activity: AnyGroundedActivity,
    date: Date = new Date()
  ): ReturnType<typeof isOpenAt> {
    if (!activity.resolvedOperatingHours) {
      return { isOpen: true, note: "Hours not verified" };
    }
    return isOpenAt(activity.resolvedOperatingHours, date, activity.holidayExceptions);
  }

  /**
   * Validate slot against operating hours
   */
  validateSlot(
    activity: AnyGroundedActivity,
    slotStart: Date,
    slotEnd: Date
  ): ReturnType<typeof willBeOpenDuringSlot> {
    if (!activity.resolvedOperatingHours) {
      return { feasible: true, warning: "Operating hours not verified" };
    }
    return willBeOpenDuringSlot(
      activity.resolvedOperatingHours,
      slotStart,
      slotEnd,
      activity.holidayExceptions
    );
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this.cache.clear();
  }

  /**
   * Get cache stats
   */
  getCacheStats(): { size: number; maxAge: number } {
    return {
      size: this.cache.size,
      maxAge: this.cacheMaxAge,
    };
  }
}

// ============================================
// FACTORY FUNCTIONS
// ============================================

/**
 * Create entity resolution service
 */
export function createEntityResolutionService(options?: {
  cacheMaxAge?: number;
}): EntityResolutionService {
  return new EntityResolutionService(options);
}

// ============================================
// EXPORTS
// ============================================

export {
  resolveWithGoogle,
  resolveWithYelp,
  resolveWithViator,
  mergeSourceData,
  calculateStringSimilarity,
  convertGoogleHours,
  convertYelpHours,
  CATEGORY_TO_GOOGLE_TYPES,
  CATEGORY_TO_YELP,
};

export default EntityResolutionService;
