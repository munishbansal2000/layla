/**
 * Yelp Fusion API Integration
 *
 * Provides restaurant and business search for trip destinations
 * API Docs: https://docs.developer.yelp.com/docs/fusion-intro
 *
 * Free tier: 500 calls/day
 * Get API key at: https://www.yelp.com/developers/v3/manage_app
 */

import { cachedYelpFetch } from "./yelp-logger";

const YELP_API_KEY = process.env.YELP_API_KEY!;
const BASE_URL = "https://api.yelp.com/v3";

/**
 * Check if Yelp API is configured
 */
export function isYelpConfigured(): boolean {
  return !!process.env.YELP_API_KEY;
}

// ============================================
// TYPES
// ============================================

export interface YelpLocation {
  address1: string;
  address2?: string;
  address3?: string;
  city: string;
  zip_code: string;
  country: string;
  state: string;
  display_address: string[];
}

export interface YelpCoordinates {
  latitude: number;
  longitude: number;
}

export interface YelpCategory {
  alias: string;
  title: string;
}

export interface YelpHours {
  open: Array<{
    is_overnight: boolean;
    start: string;
    end: string;
    day: number;
  }>;
  hours_type: string;
  is_open_now: boolean;
}

export interface YelpBusiness {
  id: string;
  alias: string;
  name: string;
  image_url: string;
  is_closed: boolean;
  url: string;
  review_count: number;
  categories: YelpCategory[];
  rating: number;
  coordinates: YelpCoordinates;
  transactions: string[];
  price?: string; // $, $$, $$$, $$$$
  location: YelpLocation;
  phone: string;
  display_phone: string;
  distance?: number; // in meters
  hours?: YelpHours[];
  photos?: string[];
  is_claimed?: boolean;
}

export interface YelpSearchResponse {
  businesses: YelpBusiness[];
  total: number;
  region: {
    center: YelpCoordinates;
  };
}

export interface YelpReview {
  id: string;
  url: string;
  text: string;
  rating: number;
  time_created: string;
  user: {
    id: string;
    profile_url: string;
    image_url: string;
    name: string;
  };
}

export interface YelpReviewsResponse {
  reviews: YelpReview[];
  total: number;
  possible_languages: string[];
}

// Search parameters
export interface YelpSearchParams {
  term?: string; // Search term (e.g., "italian", "sushi", "breakfast")
  location?: string; // Location (e.g., "Paris, France")
  latitude?: number;
  longitude?: number;
  radius?: number; // Search radius in meters (max 40000)
  categories?: string; // Category filter (e.g., "restaurants,bars")
  locale?: string;
  limit?: number; // Max 50
  offset?: number;
  sort_by?: "best_match" | "rating" | "review_count" | "distance";
  price?: string; // Price filter: "1", "2", "3", "4" or combinations like "1,2"
  open_now?: boolean;
  open_at?: number; // Unix timestamp
  attributes?: string; // e.g., "hot_and_new,reservation"
}

// Simplified restaurant for app display
export interface Restaurant {
  id: string;
  name: string;
  imageUrl: string;
  rating: number;
  reviewCount: number;
  priceLevel: 1 | 2 | 3 | 4;
  cuisine: string[];
  address: string;
  city: string;
  phone: string;
  distance?: number;
  coordinates: {
    lat: number;
    lng: number;
  };
  url: string;
  isOpenNow?: boolean;
  transactions: string[]; // delivery, pickup, reservation
}

// ============================================
// API HELPERS
// ============================================

/**
 * Make authenticated Yelp API request with caching
 */
async function fetchYelpAPI<T>(
  endpoint: string,
  params?: Record<string, string>,
  cacheInfo?: { type: "search" | "business" | "reviews"; location?: string }
): Promise<T> {
  if (!YELP_API_KEY) {
    throw new Error("YELP_API_KEY not configured");
  }

  return cachedYelpFetch<T>(
    cacheInfo?.type || "search",
    `${BASE_URL}${endpoint}`,
    params || {},
    YELP_API_KEY,
    { location: cacheInfo?.location }
  );
}

// ============================================
// SEARCH FUNCTIONS
// ============================================

/**
 * Search for businesses (restaurants, cafes, bars, etc.)
 */
export async function searchBusinesses(
  params: YelpSearchParams
): Promise<YelpSearchResponse> {
  const queryParams: Record<string, string> = {};

  if (params.term) queryParams.term = params.term;
  if (params.location) queryParams.location = params.location;
  if (params.latitude) queryParams.latitude = params.latitude.toString();
  if (params.longitude) queryParams.longitude = params.longitude.toString();
  if (params.radius) queryParams.radius = Math.min(params.radius, 40000).toString();
  if (params.categories) queryParams.categories = params.categories;
  if (params.locale) queryParams.locale = params.locale;
  if (params.limit) queryParams.limit = Math.min(params.limit, 50).toString();
  if (params.offset) queryParams.offset = params.offset.toString();
  if (params.sort_by) queryParams.sort_by = params.sort_by;
  if (params.price) queryParams.price = params.price;
  if (params.open_now !== undefined) queryParams.open_now = params.open_now.toString();
  if (params.open_at) queryParams.open_at = params.open_at.toString();
  if (params.attributes) queryParams.attributes = params.attributes;

  return fetchYelpAPI<YelpSearchResponse>("/businesses/search", queryParams, {
    type: "search",
    location: params.location,
  });
}

/**
 * Search specifically for restaurants
 */
export async function searchRestaurants(
  location: string,
  options?: {
    cuisine?: string;
    priceLevel?: (1 | 2 | 3 | 4)[];
    sortBy?: "best_match" | "rating" | "review_count" | "distance";
    limit?: number;
    offset?: number;
    openNow?: boolean;
  }
): Promise<Restaurant[]> {
  const params: YelpSearchParams = {
    location,
    categories: "restaurants",
    limit: options?.limit || 20,
    offset: options?.offset || 0,
    sort_by: options?.sortBy || "best_match",
    open_now: options?.openNow,
  };

  if (options?.cuisine) {
    params.term = options.cuisine;
  }

  if (options?.priceLevel && options.priceLevel.length > 0) {
    params.price = options.priceLevel.join(",");
  }

  try {
    const response = await searchBusinesses(params);
    return response.businesses.map(yelpBusinessToRestaurant);
  } catch (error) {
    console.error("Yelp restaurant search error:", error);
    return [];
  }
}

/**
 * Search for restaurants near coordinates
 */
export async function searchRestaurantsNearby(
  lat: number,
  lon: number,
  options?: {
    cuisine?: string;
    radius?: number; // meters, max 40000
    priceLevel?: (1 | 2 | 3 | 4)[];
    sortBy?: "best_match" | "rating" | "review_count" | "distance";
    limit?: number;
    openNow?: boolean;
  }
): Promise<Restaurant[]> {
  const params: YelpSearchParams = {
    latitude: lat,
    longitude: lon,
    categories: "restaurants",
    radius: options?.radius || 5000, // 5km default
    limit: options?.limit || 20,
    sort_by: options?.sortBy || "distance",
    open_now: options?.openNow,
  };

  if (options?.cuisine) {
    params.term = options.cuisine;
  }

  if (options?.priceLevel && options.priceLevel.length > 0) {
    params.price = options.priceLevel.join(",");
  }

  try {
    const response = await searchBusinesses(params);
    return response.businesses.map(yelpBusinessToRestaurant);
  } catch (error) {
    console.error("Yelp nearby search error:", error);
    return [];
  }
}

/**
 * Get business details by ID
 */
export async function getBusinessDetails(businessId: string): Promise<YelpBusiness | null> {
  try {
    return await fetchYelpAPI<YelpBusiness>(`/businesses/${businessId}`, undefined, {
      type: "business",
    });
  } catch (error) {
    console.error("Yelp business details error:", error);
    return null;
  }
}

/**
 * Get reviews for a business
 */
export async function getBusinessReviews(
  businessId: string,
  locale?: string
): Promise<YelpReview[]> {
  try {
    const params: Record<string, string> = {};
    if (locale) params.locale = locale;

    const response = await fetchYelpAPI<YelpReviewsResponse>(
      `/businesses/${businessId}/reviews`,
      params,
      { type: "reviews" }
    );
    return response.reviews;
  } catch (error) {
    console.error("Yelp reviews error:", error);
    return [];
  }
}

// ============================================
// CUISINE CATEGORIES
// ============================================

export const CUISINE_CATEGORIES = [
  { alias: "italian", title: "Italian", emoji: "🍝" },
  { alias: "french", title: "French", emoji: "🥐" },
  { alias: "japanese", title: "Japanese", emoji: "🍣" },
  { alias: "chinese", title: "Chinese", emoji: "🥡" },
  { alias: "mexican", title: "Mexican", emoji: "🌮" },
  { alias: "indian", title: "Indian", emoji: "🍛" },
  { alias: "thai", title: "Thai", emoji: "🍜" },
  { alias: "mediterranean", title: "Mediterranean", emoji: "🫒" },
  { alias: "american", title: "American", emoji: "🍔" },
  { alias: "seafood", title: "Seafood", emoji: "🦞" },
  { alias: "steakhouses", title: "Steakhouse", emoji: "🥩" },
  { alias: "pizza", title: "Pizza", emoji: "🍕" },
  { alias: "sushi", title: "Sushi", emoji: "🍱" },
  { alias: "breakfast_brunch", title: "Breakfast & Brunch", emoji: "🥞" },
  { alias: "cafes", title: "Cafes", emoji: "☕" },
  { alias: "bakeries", title: "Bakeries", emoji: "🥖" },
  { alias: "desserts", title: "Desserts", emoji: "🍰" },
  { alias: "vegan", title: "Vegan", emoji: "🥗" },
  { alias: "vegetarian", title: "Vegetarian", emoji: "🥬" },
  { alias: "wine_bars", title: "Wine Bars", emoji: "🍷" },
  { alias: "cocktailbars", title: "Cocktail Bars", emoji: "🍸" },
] as const;

export type CuisineType = (typeof CUISINE_CATEGORIES)[number]["alias"];

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert Yelp price string to numeric level
 */
function priceToPriceLevel(price?: string): 1 | 2 | 3 | 4 {
  if (!price) return 2;
  return Math.min(price.length, 4) as 1 | 2 | 3 | 4;
}

/**
 * Convert Yelp business to simplified Restaurant
 */
export function yelpBusinessToRestaurant(business: YelpBusiness): Restaurant {
  return {
    id: business.id,
    name: business.name,
    imageUrl: business.image_url || "/images/placeholder-restaurant.jpg",
    rating: business.rating,
    reviewCount: business.review_count,
    priceLevel: priceToPriceLevel(business.price),
    cuisine: business.categories.map((c) => c.title),
    address: business.location.address1 || business.location.display_address[0] || "",
    city: business.location.city,
    phone: business.display_phone,
    distance: business.distance,
    coordinates: {
      lat: business.coordinates.latitude,
      lng: business.coordinates.longitude,
    },
    url: business.url,
    isOpenNow: business.hours?.[0]?.is_open_now,
    transactions: business.transactions,
  };
}

/**
 * Format distance for display
 */
export function formatDistance(meters?: number): string {
  if (!meters) return "";
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * Get price level display string
 */
export function getPriceDisplay(level: 1 | 2 | 3 | 4): string {
  return "$".repeat(level);
}

/**
 * Get rating display with stars
 */
export function getRatingDisplay(rating: number): string {
  const fullStars = Math.floor(rating);
  const halfStar = rating % 1 >= 0.5;
  return "★".repeat(fullStars) + (halfStar ? "½" : "") + "☆".repeat(5 - fullStars - (halfStar ? 1 : 0));
}

/**
 * Filter restaurants by meal time
 */
export function getRestaurantsForMealTime(
  restaurants: Restaurant[],
  _mealTime: "breakfast" | "lunch" | "dinner"
): Restaurant[] {
  // This is a simple filter - in production you'd want to check actual hours
  // For now, just return all restaurants as they're all valid options
  return restaurants;
}

/**
 * Get cuisine emoji
 */
export function getCuisineEmoji(cuisineAlias: string): string {
  const cuisine = CUISINE_CATEGORIES.find((c) => c.alias === cuisineAlias);
  return cuisine?.emoji || "🍽️";
}
