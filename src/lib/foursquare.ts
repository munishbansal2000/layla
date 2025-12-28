/**
 * Foursquare Places API Integration
 *
 * Alternative place search provider with rich venue data
 * API Docs: https://location.foursquare.com/developer/reference/places-api-overview
 *
 * Pricing: Free tier - 1000 calls/day (Personal plan)
 * Get API key at: https://foursquare.com/developers/signup
 */

// ============================================
// CONFIGURATION
// ============================================

const FOURSQUARE_API_KEY = process.env.FOURSQUARE_API_KEY || "";
const BASE_URL = "https://places-api.foursquare.com";
const API_VERSION = "2025-06-17";

// In-memory cache
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// ============================================
// TYPES
// ============================================

export interface FoursquareLocation {
  address?: string;
  address_extended?: string;
  admin_region?: string;
  census_block?: string;
  country?: string;
  cross_street?: string;
  dma?: string;
  formatted_address?: string;
  locality?: string;
  neighborhood?: string[];
  po_box?: string;
  post_town?: string;
  postcode?: string;
  region?: string;
}

export interface FoursquareGeocode {
  latitude: number;
  longitude: number;
}

export interface FoursquareCategory {
  id: number;
  name: string;
  short_name?: string;
  plural_name?: string;
  icon: {
    prefix: string;
    suffix: string;
  };
}

export interface FoursquareHours {
  display?: string;
  is_local_holiday?: boolean;
  open_now?: boolean;
  regular?: Array<{
    close: string;
    day: number;
    open: string;
  }>;
}

export interface FoursquarePhoto {
  id: string;
  created_at: string;
  prefix: string;
  suffix: string;
  width: number;
  height: number;
  classifications?: string[];
}

export interface FoursquareTip {
  id: string;
  created_at: string;
  text: string;
  agree_count?: number;
  disagree_count?: number;
  lang?: string;
  photo?: FoursquarePhoto;
}

export interface FoursquarePrice {
  tier: 1 | 2 | 3 | 4;
  message?: string;
  currency?: string;
}

export interface FoursquarePlace {
  fsq_id: string;
  name: string;
  categories: FoursquareCategory[];
  chains?: Array<{ id: string; name: string }>;
  closed_bucket?: "LikelyOpen" | "LikelyClosed" | "VeryLikelyClosed" | "Unsure";
  description?: string;
  distance?: number;
  email?: string;
  fax?: string;
  features?: {
    payment?: {
      credit_cards?: {
        accepts_credit_cards?: boolean;
        amex?: boolean;
        discover?: boolean;
        mastercard?: boolean;
        visa?: boolean;
      };
      digital_wallet?: {
        accepts_nfc?: boolean;
      };
    };
    food_and_drink?: {
      alcohol?: {
        bar_service?: boolean;
        beer?: boolean;
        byo?: boolean;
        cocktails?: boolean;
        full_bar?: boolean;
        wine?: boolean;
      };
      meals?: {
        bar_snacks?: boolean;
        breakfast?: boolean;
        brunch?: boolean;
        dessert?: boolean;
        dinner?: boolean;
        lunch?: boolean;
        happy_hour?: boolean;
        tasting_menu?: boolean;
      };
    };
    services?: {
      delivery?: boolean;
      dine_in?: boolean;
      drive_through?: boolean;
      takeout?: boolean;
    };
    amenities?: {
      atm?: boolean;
      coat_check?: boolean;
      jukebox?: boolean;
      live_music?: boolean;
      outdoor_seating?: boolean;
      parking?: {
        parking?: boolean;
        private_lot?: boolean;
        public_lot?: boolean;
        street_parking?: boolean;
        valet_parking?: boolean;
      };
      private_room?: boolean;
      restroom?: boolean;
      smoking?: boolean;
      wifi?: string;
    };
    attributes?: {
      business_meeting?: string;
      clean?: string;
      crowded?: string;
      dates_popular?: string;
      dressy?: string;
      families_popular?: string;
      good_for_dogs?: string;
      groups_popular?: string;
      noisy?: string;
      quick_bite?: string;
      romantic?: string;
      service_quality?: string;
      trendy?: string;
      value_for_money?: string;
    };
  };
  geocodes?: {
    drop_off?: FoursquareGeocode;
    front_door?: FoursquareGeocode;
    main?: FoursquareGeocode;
    road?: FoursquareGeocode;
    roof?: FoursquareGeocode;
  };
  hours?: FoursquareHours;
  hours_popular?: Array<{
    close: string;
    day: number;
    open: string;
  }>;
  link?: string;
  location?: FoursquareLocation;
  menu?: string;
  photos?: FoursquarePhoto[];
  popularity?: number;
  price?: FoursquarePrice;
  rating?: number;
  related_places?: {
    children?: FoursquarePlace[];
    parent?: FoursquarePlace;
  };
  social_media?: {
    facebook_id?: string;
    instagram?: string;
    twitter?: string;
  };
  stats?: {
    total_photos?: number;
    total_ratings?: number;
    total_tips?: number;
  };
  store_id?: string;
  tastes?: string[];
  tel?: string;
  timezone?: string;
  tips?: FoursquareTip[];
  venue_reality_bucket?: string;
  verified?: boolean;
  website?: string;
}

export interface FoursquareSearchResponse {
  results: FoursquarePlace[];
  context?: {
    geo_bounds?: {
      circle?: {
        center: FoursquareGeocode;
        radius: number;
      };
    };
  };
}

export interface FoursquareAutocompleteResult {
  type: "search" | "place" | "geo" | "address";
  text: {
    primary: string;
    secondary?: string;
    highlight?: Array<{ start: number; length: number }>;
  };
  link?: string;
  place?: FoursquarePlace;
  geo?: {
    name: string;
    center: FoursquareGeocode;
    bounds?: {
      ne: FoursquareGeocode;
      sw: FoursquareGeocode;
    };
    cc?: string;
    type?: string;
  };
  address?: {
    address_id: string;
    name: string;
    country: string;
    admin_region?: string;
    po_box?: string;
    locality?: string;
    neighborhood?: string[];
    postcode?: string;
    region?: string;
    street?: string;
    street_number?: string;
  };
}

export interface FoursquareAutocompleteResponse {
  results: FoursquareAutocompleteResult[];
}

// Search parameters
export interface FoursquareSearchParams {
  query?: string;
  ll?: string; // "lat,lng"
  radius?: number; // meters
  categories?: string; // comma-separated category IDs
  chains?: string;
  exclude_chains?: string;
  exclude_all_chains?: boolean;
  fields?: string; // comma-separated field names
  min_price?: 1 | 2 | 3 | 4;
  max_price?: 1 | 2 | 3 | 4;
  open_at?: string; // "YYYY-MM-DDTHH:mm:ss"
  open_now?: boolean;
  ne?: string; // northeast corner "lat,lng"
  sw?: string; // southwest corner "lat,lng"
  near?: string; // Place name
  polygon?: string;
  sort?: "relevance" | "rating" | "distance" | "popularity";
  limit?: number;
  session_token?: string;
}

// Simplified place for app display (matching other integrations)
export interface FSQPlace {
  id: string;
  foursquareId: string;
  name: string;
  description?: string;
  imageUrl?: string;
  images?: string[];
  rating?: number;
  reviewCount?: number;
  priceLevel?: 1 | 2 | 3 | 4;
  types: string[];
  primaryType?: string;
  address: string;
  city?: string;
  country?: string;
  neighborhood?: string;
  phone?: string;
  website?: string;
  coordinates: {
    lat: number;
    lng: number;
  };
  distance?: number;
  isOpenNow?: boolean;
  openingHours?: string;
  features?: {
    delivery?: boolean;
    dineIn?: boolean;
    takeout?: boolean;
    outdoorSeating?: boolean;
    wifi?: boolean;
    liveMusic?: boolean;
    parking?: boolean;
  };
  tastes?: string[];
  tips?: string[];
  popularity?: number;
  source: "foursquare";
}

// ============================================
// CATEGORY MAPPINGS
// ============================================

export const FOURSQUARE_CATEGORIES = {
  // Food & Drink
  restaurant: "13065",
  cafe: "13032",
  bar: "13003",
  bakery: "13002",
  fast_food: "13145",
  coffee: "13035",
  pizza: "13064",
  sushi: "13274",
  seafood: "13338",
  italian: "13236",
  mexican: "13303",
  chinese: "13099",
  japanese: "13263",
  thai: "13352",
  indian: "13199",
  french: "13148",
  american: "13068",
  vegetarian: "13377",
  vegan: "13377",

  // Tourism & Entertainment
  tourist_attraction: "16000",
  museum: "10027",
  art_gallery: "10004",
  theater: "10024",
  cinema: "10025",
  aquarium: "10001",
  zoo: "10056",
  amusement_park: "10002",
  casino: "10011",
  nightclub: "10032",
  concert_hall: "10012",

  // Nature & Outdoors
  park: "16032",
  garden: "16019",
  beach: "16003",
  hiking_trail: "16027",
  nature_preserve: "16029",
  scenic_lookout: "16046",

  // Shopping
  shopping_mall: "17114",
  department_store: "17047",
  clothing_store: "17031",
  bookstore: "17018",
  market: "17069",
  supermarket: "17141",

  // Services
  spa: "11108",
  gym: "18021",
  salon: "11062",

  // Religious
  church: "12071",
  temple: "12119",
  mosque: "12090",
  synagogue: "12115",

  // Landmarks
  monument: "16026",
  historic_site: "16020",
  castle: "16007",
} as const;

export type FoursquareCategoryType = keyof typeof FOURSQUARE_CATEGORIES;

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Generate cache key
 */
function getCacheKey(type: string, params: object): string {
  const paramsRecord = params as Record<string, unknown>;
  const sortedParams = Object.keys(paramsRecord)
    .sort()
    .map((key) => `${key}=${JSON.stringify(paramsRecord[key])}`)
    .join("&");
  return `fsq:${type}:${sortedParams}`;
}

/**
 * Get from cache
 */
function getFromCache<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[Foursquare Cache] Hit: ${key.substring(0, 50)}...`);
    return cached.data as T;
  }
  return null;
}

/**
 * Set cache
 */
function setCache(key: string, data: unknown): void {
  cache.set(key, { data, timestamp: Date.now() });
}

/**
 * Build photo URL from Foursquare photo object
 */
export function buildPhotoUrl(photo: FoursquarePhoto, size: string = "300x300"): string {
  return `${photo.prefix}${size}${photo.suffix}`;
}

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Check if Foursquare API is configured
 */
export function isFoursquareConfigured(): boolean {
  return !!FOURSQUARE_API_KEY;
}

/**
 * Search for places
 */
export async function searchFoursquarePlaces(
  params: FoursquareSearchParams
): Promise<FoursquareSearchResponse> {
  if (!FOURSQUARE_API_KEY) {
    throw new Error("FOURSQUARE_API_KEY not configured");
  }

  const cacheKey = getCacheKey("search", params);
  const cached = getFromCache<FoursquareSearchResponse>(cacheKey);
  if (cached) return cached;

  const queryParams = new URLSearchParams();

  if (params.query) queryParams.set("query", params.query);
  if (params.ll) queryParams.set("ll", params.ll);
  if (params.radius) queryParams.set("radius", params.radius.toString());
  if (params.categories) queryParams.set("categories", params.categories);
  if (params.chains) queryParams.set("chains", params.chains);
  if (params.exclude_chains) queryParams.set("exclude_chains", params.exclude_chains);
  if (params.exclude_all_chains) queryParams.set("exclude_all_chains", "true");
  if (params.fields) queryParams.set("fields", params.fields);
  if (params.min_price) queryParams.set("min_price", params.min_price.toString());
  if (params.max_price) queryParams.set("max_price", params.max_price.toString());
  if (params.open_at) queryParams.set("open_at", params.open_at);
  if (params.open_now) queryParams.set("open_now", "true");
  if (params.ne) queryParams.set("ne", params.ne);
  if (params.sw) queryParams.set("sw", params.sw);
  if (params.near) queryParams.set("near", params.near);
  if (params.polygon) queryParams.set("polygon", params.polygon);
  if (params.sort) queryParams.set("sort", params.sort);
  if (params.limit) queryParams.set("limit", params.limit.toString());

  // Set default fields if not specified (only free fields to avoid credit usage)
  if (!params.fields) {
    queryParams.set(
      "fields",
      "fsq_place_id,name,categories,location,geocodes,distance,hours,tel,website,description"
    );
  }

  try {
    const response = await fetch(`${BASE_URL}/places/search?${queryParams}`, {
      headers: {
        Authorization: `Bearer ${FOURSQUARE_API_KEY}`,
        Accept: "application/json",
        "X-Places-Api-Version": API_VERSION,
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Foursquare API error: ${response.status} - ${errorText}`);
    }

    const data: FoursquareSearchResponse = await response.json();
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error("Foursquare search error:", error);
    return { results: [] };
  }
}

/**
 * Get place details by ID
 */
export async function getFoursquarePlaceDetails(
  fsqId: string
): Promise<FoursquarePlace | null> {
  if (!FOURSQUARE_API_KEY) {
    throw new Error("FOURSQUARE_API_KEY not configured");
  }

  const cacheKey = getCacheKey("details", { fsqId });
  const cached = getFromCache<FoursquarePlace>(cacheKey);
  if (cached) return cached;

  const fields =
    "fsq_id,name,categories,location,geocodes,hours,photos,rating,price,description,tel,website,features,tastes,tips,popularity,stats,social_media,menu,verified";

  try {
    const response = await fetch(`${BASE_URL}/places/${fsqId}?fields=${fields}`, {
      headers: {
        Authorization: FOURSQUARE_API_KEY,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error("Foursquare details error:", response.status);
      return null;
    }

    const data: FoursquarePlace = await response.json();
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error("Foursquare place details error:", error);
    return null;
  }
}

/**
 * Get place photos
 */
export async function getFoursquarePhotos(
  fsqId: string,
  limit: number = 10
): Promise<FoursquarePhoto[]> {
  if (!FOURSQUARE_API_KEY) {
    throw new Error("FOURSQUARE_API_KEY not configured");
  }

  const cacheKey = getCacheKey("photos", { fsqId, limit });
  const cached = getFromCache<FoursquarePhoto[]>(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(`${BASE_URL}/places/${fsqId}/photos?limit=${limit}`, {
      headers: {
        Authorization: FOURSQUARE_API_KEY,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error("Foursquare photos error:", response.status);
      return [];
    }

    const data: FoursquarePhoto[] = await response.json();
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error("Foursquare photos error:", error);
    return [];
  }
}

/**
 * Get place tips
 */
export async function getFoursquareTips(
  fsqId: string,
  limit: number = 5
): Promise<FoursquareTip[]> {
  if (!FOURSQUARE_API_KEY) {
    throw new Error("FOURSQUARE_API_KEY not configured");
  }

  const cacheKey = getCacheKey("tips", { fsqId, limit });
  const cached = getFromCache<FoursquareTip[]>(cacheKey);
  if (cached) return cached;

  try {
    const response = await fetch(`${BASE_URL}/places/${fsqId}/tips?limit=${limit}`, {
      headers: {
        Authorization: FOURSQUARE_API_KEY,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      console.error("Foursquare tips error:", response.status);
      return [];
    }

    const data: FoursquareTip[] = await response.json();
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error("Foursquare tips error:", error);
    return [];
  }
}

/**
 * Autocomplete search
 */
export async function autocompleteFoursquare(
  query: string,
  options?: {
    ll?: string;
    radius?: number;
    types?: string; // "place", "address", "search", "geo"
    limit?: number;
  }
): Promise<FoursquareAutocompleteResponse> {
  if (!FOURSQUARE_API_KEY) {
    throw new Error("FOURSQUARE_API_KEY not configured");
  }

  const cacheKey = getCacheKey("autocomplete", { query, ...options });
  const cached = getFromCache<FoursquareAutocompleteResponse>(cacheKey);
  if (cached) return cached;

  const queryParams = new URLSearchParams({ query });
  if (options?.ll) queryParams.set("ll", options.ll);
  if (options?.radius) queryParams.set("radius", options.radius.toString());
  if (options?.types) queryParams.set("types", options.types);
  if (options?.limit) queryParams.set("limit", options.limit.toString());

  try {
    const response = await fetch(`${BASE_URL}/autocomplete?${queryParams}`, {
      headers: {
        Authorization: FOURSQUARE_API_KEY,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Foursquare autocomplete error: ${response.status}`);
    }

    const data: FoursquareAutocompleteResponse = await response.json();
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error("Foursquare autocomplete error:", error);
    return { results: [] };
  }
}

// ============================================
// HIGH-LEVEL SEARCH FUNCTIONS
// ============================================

/**
 * Search for attractions in a destination
 */
export async function searchFSQAttractions(
  destination: string,
  options?: {
    categories?: FoursquareCategoryType[];
    maxResults?: number;
    minRating?: number;
  }
): Promise<FSQPlace[]> {
  try {
    const categoryIds =
      options?.categories?.map((cat) => FOURSQUARE_CATEGORIES[cat]).join(",") ||
      `${FOURSQUARE_CATEGORIES.tourist_attraction},${FOURSQUARE_CATEGORIES.museum},${FOURSQUARE_CATEGORIES.monument}`;

    const response = await searchFoursquarePlaces({
      near: destination,
      categories: categoryIds,
      limit: options?.maxResults || 20,
      sort: "popularity",
    });

    let places = response.results.map(foursquareToFSQPlace);

    if (options?.minRating) {
      places = places.filter((p) => (p.rating ?? 0) >= options.minRating!);
    }

    return places;
  } catch (error) {
    console.error("Foursquare attractions search error:", error);
    return [];
  }
}

/**
 * Search for restaurants in a destination
 */
export async function searchFSQRestaurants(
  destination: string,
  options?: {
    cuisine?: FoursquareCategoryType;
    priceLevels?: (1 | 2 | 3 | 4)[];
    openNow?: boolean;
    maxResults?: number;
    sortBy?: "relevance" | "rating" | "distance" | "popularity";
  }
): Promise<FSQPlace[]> {
  try {
    const categoryId = options?.cuisine
      ? FOURSQUARE_CATEGORIES[options.cuisine]
      : FOURSQUARE_CATEGORIES.restaurant;

    const response = await searchFoursquarePlaces({
      near: destination,
      categories: categoryId,
      min_price: options?.priceLevels ? Math.min(...options.priceLevels) as 1 | 2 | 3 | 4 : undefined,
      max_price: options?.priceLevels ? Math.max(...options.priceLevels) as 1 | 2 | 3 | 4 : undefined,
      open_now: options?.openNow,
      limit: options?.maxResults || 20,
      sort: options?.sortBy || "popularity",
    });

    return response.results.map(foursquareToFSQPlace);
  } catch (error) {
    console.error("Foursquare restaurants search error:", error);
    return [];
  }
}

/**
 * Search for places near coordinates
 */
export async function searchFSQNearby(
  lat: number,
  lng: number,
  options?: {
    categories?: FoursquareCategoryType[];
    radius?: number;
    maxResults?: number;
    sortBy?: "relevance" | "rating" | "distance" | "popularity";
  }
): Promise<FSQPlace[]> {
  try {
    const categoryIds = options?.categories
      ?.map((cat) => FOURSQUARE_CATEGORIES[cat])
      .join(",");

    const response = await searchFoursquarePlaces({
      ll: `${lat},${lng}`,
      radius: options?.radius || 5000,
      categories: categoryIds,
      limit: options?.maxResults || 20,
      sort: options?.sortBy || "distance",
    });

    return response.results.map(foursquareToFSQPlace);
  } catch (error) {
    console.error("Foursquare nearby search error:", error);
    return [];
  }
}

/**
 * Search for places by category
 */
export async function searchFSQByCategory(
  destination: string,
  category: FoursquareCategoryType,
  options?: {
    maxResults?: number;
    sortBy?: "relevance" | "rating" | "distance" | "popularity";
  }
): Promise<FSQPlace[]> {
  try {
    const response = await searchFoursquarePlaces({
      near: destination,
      categories: FOURSQUARE_CATEGORIES[category],
      limit: options?.maxResults || 20,
      sort: options?.sortBy || "popularity",
    });

    return response.results.map(foursquareToFSQPlace);
  } catch (error) {
    console.error(`Foursquare ${category} search error:`, error);
    return [];
  }
}

// ============================================
// CONVERSION FUNCTIONS
// ============================================

/**
 * Convert Foursquare place to simplified FSQPlace
 */
export function foursquareToFSQPlace(place: FoursquarePlace): FSQPlace {
  const mainGeocode = place.geocodes?.main;
  const photoUrls = place.photos?.map((p) => buildPhotoUrl(p, "original")) || [];

  return {
    id: `fsq_${place.fsq_id}`,
    foursquareId: place.fsq_id,
    name: place.name,
    description: place.description,
    imageUrl: photoUrls[0],
    images: photoUrls.length > 0 ? photoUrls : undefined,
    rating: place.rating,
    reviewCount: place.stats?.total_ratings,
    priceLevel: place.price?.tier,
    types: place.categories.map((c) => c.name),
    primaryType: place.categories[0]?.name,
    address: place.location?.formatted_address || place.location?.address || "",
    city: place.location?.locality,
    country: place.location?.country,
    neighborhood: place.location?.neighborhood?.[0],
    phone: place.tel,
    website: place.website,
    coordinates: {
      lat: mainGeocode?.latitude || 0,
      lng: mainGeocode?.longitude || 0,
    },
    distance: place.distance,
    isOpenNow: place.hours?.open_now,
    openingHours: place.hours?.display,
    features: {
      delivery: place.features?.services?.delivery,
      dineIn: place.features?.services?.dine_in,
      takeout: place.features?.services?.takeout,
      outdoorSeating: place.features?.amenities?.outdoor_seating,
      wifi: !!place.features?.amenities?.wifi,
      liveMusic: place.features?.amenities?.live_music,
      parking: place.features?.amenities?.parking?.parking,
    },
    tastes: place.tastes,
    tips: place.tips?.map((t) => t.text),
    popularity: place.popularity,
    source: "foursquare",
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Format distance for display
 */
export function formatDistance(meters: number): string {
  if (meters < 1000) {
    return `${Math.round(meters)}m`;
  }
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * Get price level display string
 */
export function getPriceDisplay(tier: 1 | 2 | 3 | 4): string {
  return "$".repeat(tier);
}

/**
 * Get rating display
 */
export function getRatingDisplay(rating: number): string {
  return `${rating.toFixed(1)}/10`;
}

/**
 * Get cache statistics
 */
export function getFoursquareCacheStats(): {
  size: number;
  entries: string[];
} {
  return {
    size: cache.size,
    entries: Array.from(cache.keys()),
  };
}

/**
 * Clear cache
 */
export function clearFoursquareCache(): void {
  cache.clear();
}
