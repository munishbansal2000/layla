/**
 * Google Places API Integration (New API v2)
 *
 * Provides place search, details, and photo retrieval for trip destinations
 * API Docs: https://developers.google.com/maps/documentation/places/web-service/overview
 *
 * Pricing: Pay-as-you-go, $17/1000 requests for basic data
 * Get API key at: https://console.cloud.google.com/apis/credentials
 */

import { cachedGooglePlacesPost } from "./google-places-logger";

const GOOGLE_PLACES_API_KEY = process.env.GOOGLE_PLACES_API_KEY || "";
const BASE_URL = "https://places.googleapis.com/v1";

// ============================================
// TYPES - Google Places API v2 (New)
// ============================================

export interface GooglePlaceLocation {
  latitude: number;
  longitude: number;
}

export interface GooglePlaceDisplayName {
  text: string;
  languageCode: string;
}

export interface GooglePlaceOpeningHours {
  openNow?: boolean;
  periods?: Array<{
    open: { day: number; hour: number; minute: number };
    close?: { day: number; hour: number; minute: number };
  }>;
  weekdayDescriptions?: string[];
}

export interface GooglePlacePhoto {
  name: string;
  widthPx: number;
  heightPx: number;
  authorAttributions: Array<{
    displayName: string;
    uri: string;
    photoUri: string;
  }>;
}

export interface GooglePlaceReview {
  name: string;
  relativePublishTimeDescription: string;
  rating: number;
  text: {
    text: string;
    languageCode: string;
  };
  originalText?: {
    text: string;
    languageCode: string;
  };
  authorAttribution: {
    displayName: string;
    uri: string;
    photoUri: string;
  };
  publishTime: string;
}

export interface GooglePlaceAccessibility {
  wheelchairAccessibleParking?: boolean;
  wheelchairAccessibleEntrance?: boolean;
  wheelchairAccessibleRestroom?: boolean;
  wheelchairAccessibleSeating?: boolean;
}

export interface GooglePlace {
  id: string;
  name?: string; // Resource name (not display name)
  displayName: GooglePlaceDisplayName;
  formattedAddress: string;
  addressComponents?: Array<{
    longText: string;
    shortText: string;
    types: string[];
    languageCode: string;
  }>;
  location: GooglePlaceLocation;
  viewport?: {
    low: GooglePlaceLocation;
    high: GooglePlaceLocation;
  };
  types: string[];
  primaryType?: string;
  primaryTypeDisplayName?: GooglePlaceDisplayName;
  rating?: number;
  userRatingCount?: number;
  priceLevel?:
    | "PRICE_LEVEL_UNSPECIFIED"
    | "PRICE_LEVEL_FREE"
    | "PRICE_LEVEL_INEXPENSIVE"
    | "PRICE_LEVEL_MODERATE"
    | "PRICE_LEVEL_EXPENSIVE"
    | "PRICE_LEVEL_VERY_EXPENSIVE";
  regularOpeningHours?: GooglePlaceOpeningHours;
  currentOpeningHours?: GooglePlaceOpeningHours;
  photos?: GooglePlacePhoto[];
  editorialSummary?: {
    text: string;
    languageCode: string;
  };
  websiteUri?: string;
  nationalPhoneNumber?: string;
  internationalPhoneNumber?: string;
  reviews?: GooglePlaceReview[];
  accessibilityOptions?: GooglePlaceAccessibility;
  parkingOptions?: {
    freeParkingLot?: boolean;
    paidParkingLot?: boolean;
    freeStreetParking?: boolean;
    paidStreetParking?: boolean;
    valetParking?: boolean;
    freeGarageParking?: boolean;
    paidGarageParking?: boolean;
  };
  paymentOptions?: {
    acceptsCreditCards?: boolean;
    acceptsDebitCards?: boolean;
    acceptsCashOnly?: boolean;
    acceptsNfc?: boolean;
  };
  delivery?: boolean;
  dineIn?: boolean;
  takeout?: boolean;
  reservable?: boolean;
  servesBreakfast?: boolean;
  servesLunch?: boolean;
  servesDinner?: boolean;
  servesBrunch?: boolean;
  servesVegetarianFood?: boolean;
  outdoorSeating?: boolean;
  liveMusic?: boolean;
  menuForChildren?: boolean;
  goodForChildren?: boolean;
  goodForGroups?: boolean;
  goodForWatchingSports?: boolean;
  utcOffsetMinutes?: number;
}

// Search response types
export interface TextSearchResponse {
  places: GooglePlace[];
  nextPageToken?: string;
}

export interface NearbySearchResponse {
  places: GooglePlace[];
}

export interface PlaceDetailsResponse extends GooglePlace {}

export interface AutocompleteResponse {
  suggestions: Array<{
    placePrediction?: {
      placeId: string;
      text: {
        text: string;
        matches?: Array<{ startOffset: number; endOffset: number }>;
      };
      structuredFormat: {
        mainText: { text: string };
        secondaryText?: { text: string };
      };
      types?: string[];
    };
  }>;
}

// Search parameters
export interface TextSearchParams {
  textQuery: string;
  locationBias?: {
    circle?: {
      center: GooglePlaceLocation;
      radius: number; // meters
    };
    rectangle?: {
      low: GooglePlaceLocation;
      high: GooglePlaceLocation;
    };
  };
  locationRestriction?: {
    rectangle: {
      low: GooglePlaceLocation;
      high: GooglePlaceLocation;
    };
  };
  includedType?: string;
  minRating?: number;
  openNow?: boolean;
  priceLevels?: string[];
  languageCode?: string;
  regionCode?: string;
  strictTypeFiltering?: boolean;
  maxResultCount?: number;
  pageToken?: string;
}

export interface NearbySearchParams {
  locationRestriction: {
    circle: {
      center: GooglePlaceLocation;
      radius: number;
    };
  };
  includedTypes?: string[];
  excludedTypes?: string[];
  includedPrimaryTypes?: string[];
  excludedPrimaryTypes?: string[];
  languageCode?: string;
  regionCode?: string;
  maxResultCount?: number;
  rankPreference?: "DISTANCE" | "POPULARITY";
}

export interface AutocompleteParams {
  input: string;
  locationBias?: {
    circle?: {
      center: GooglePlaceLocation;
      radius: number;
    };
    rectangle?: {
      low: GooglePlaceLocation;
      high: GooglePlaceLocation;
    };
  };
  locationRestriction?: {
    circle?: {
      center: GooglePlaceLocation;
      radius: number;
    };
    rectangle?: {
      low: GooglePlaceLocation;
      high: GooglePlaceLocation;
    };
  };
  includedPrimaryTypes?: string[];
  includedRegionCodes?: string[];
  languageCode?: string;
  regionCode?: string;
  origin?: GooglePlaceLocation;
  sessionToken?: string;
}

// Simplified place for app display
export interface Place {
  id: string;
  googlePlaceId: string;
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
  isOpenNow?: boolean;
  openingHours?: string[];
  accessibility?: {
    wheelchairAccessible: boolean;
    wheelchairParking: boolean;
    wheelchairRestroom: boolean;
  };
  features?: {
    delivery?: boolean;
    dineIn?: boolean;
    takeout?: boolean;
    reservable?: boolean;
    outdoorSeating?: boolean;
    servesVegetarianFood?: boolean;
    menuForChildren?: boolean;
    goodForChildren?: boolean;
    goodForGroups?: boolean;
  };
}

// ============================================
// PLACE TYPE MAPPINGS
// ============================================

export const PLACE_TYPES = {
  // Food & Drink
  restaurant: "restaurant",
  cafe: "cafe",
  bar: "bar",
  bakery: "bakery",
  meal_delivery: "meal_delivery",
  meal_takeaway: "meal_takeaway",

  // Tourism & Entertainment
  tourist_attraction: "tourist_attraction",
  museum: "museum",
  art_gallery: "art_gallery",
  aquarium: "aquarium",
  zoo: "zoo",
  amusement_park: "amusement_park",
  bowling_alley: "bowling_alley",
  movie_theater: "movie_theater",
  night_club: "night_club",
  casino: "casino",

  // Nature & Outdoors
  park: "park",
  campground: "campground",
  rv_park: "rv_park",

  // Shopping
  shopping_mall: "shopping_mall",
  department_store: "department_store",
  supermarket: "supermarket",
  convenience_store: "convenience_store",
  clothing_store: "clothing_store",
  book_store: "book_store",
  jewelry_store: "jewelry_store",

  // Services
  spa: "spa",
  gym: "gym",
  hair_care: "hair_care",
  beauty_salon: "beauty_salon",

  // Religious
  church: "church",
  hindu_temple: "hindu_temple",
  mosque: "mosque",
  synagogue: "synagogue",

  // Landmarks
  city_hall: "city_hall",
  courthouse: "courthouse",
  embassy: "embassy",
  library: "library",
  local_government_office: "local_government_office",
  post_office: "post_office",
  university: "university",
} as const;

export type PlaceType = keyof typeof PLACE_TYPES;

// ============================================
// API FUNCTIONS
// ============================================

/**
 * Check if Google Places API is configured
 */
export function isGooglePlacesConfigured(): boolean {
  return !!GOOGLE_PLACES_API_KEY;
}

/**
 * Text search for places (most flexible search)
 */
export async function searchPlacesByText(
  params: TextSearchParams
): Promise<TextSearchResponse> {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error("GOOGLE_PLACES_API_KEY not configured");
  }

  const requestBody: Record<string, unknown> = {
    textQuery: params.textQuery,
  };

  if (params.locationBias) requestBody.locationBias = params.locationBias;
  if (params.locationRestriction) requestBody.locationRestriction = params.locationRestriction;
  if (params.includedType) requestBody.includedType = params.includedType;
  if (params.minRating) requestBody.minRating = params.minRating;
  if (params.openNow !== undefined) requestBody.openNow = params.openNow;
  if (params.priceLevels) requestBody.priceLevels = params.priceLevels;
  if (params.languageCode) requestBody.languageCode = params.languageCode;
  if (params.regionCode) requestBody.regionCode = params.regionCode;
  if (params.maxResultCount) requestBody.maxResultCount = params.maxResultCount;
  if (params.pageToken) requestBody.pageToken = params.pageToken;

  return cachedGooglePlacesPost<TextSearchResponse>(
    "text-search",
    `${BASE_URL}/places:searchText`,
    requestBody,
    GOOGLE_PLACES_API_KEY,
    { location: params.textQuery }
  );
}

/**
 * Nearby search for places around a location
 */
export async function searchPlacesNearby(
  params: NearbySearchParams
): Promise<NearbySearchResponse> {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error("GOOGLE_PLACES_API_KEY not configured");
  }

  const requestBody: Record<string, unknown> = {
    locationRestriction: params.locationRestriction,
  };

  if (params.includedTypes) requestBody.includedTypes = params.includedTypes;
  if (params.excludedTypes) requestBody.excludedTypes = params.excludedTypes;
  if (params.includedPrimaryTypes) requestBody.includedPrimaryTypes = params.includedPrimaryTypes;
  if (params.excludedPrimaryTypes) requestBody.excludedPrimaryTypes = params.excludedPrimaryTypes;
  if (params.languageCode) requestBody.languageCode = params.languageCode;
  if (params.regionCode) requestBody.regionCode = params.regionCode;
  if (params.maxResultCount) requestBody.maxResultCount = params.maxResultCount;
  if (params.rankPreference) requestBody.rankPreference = params.rankPreference;

  const { center } = params.locationRestriction.circle;

  return cachedGooglePlacesPost<NearbySearchResponse>(
    "nearby-search",
    `${BASE_URL}/places:searchNearby`,
    requestBody,
    GOOGLE_PLACES_API_KEY,
    { location: `${center.latitude},${center.longitude}` }
  );
}

/**
 * Get detailed information about a specific place
 */
export async function getPlaceDetails(placeId: string): Promise<GooglePlace | null> {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error("GOOGLE_PLACES_API_KEY not configured");
  }

  const url = `${BASE_URL}/places/${placeId}`;

  try {
    const response = await fetch(url, {
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": GOOGLE_PLACES_API_KEY,
        "X-Goog-FieldMask":
          "id,displayName,formattedAddress,location,types,rating,userRatingCount,priceLevel,regularOpeningHours,currentOpeningHours,photos,primaryType,primaryTypeDisplayName,editorialSummary,websiteUri,nationalPhoneNumber,internationalPhoneNumber,reviews,accessibilityOptions,parkingOptions,paymentOptions,delivery,dineIn,takeout,reservable,servesBreakfast,servesLunch,servesDinner,servesVegetarianFood,outdoorSeating,menuForChildren,goodForChildren,goodForGroups",
      },
    });

    if (!response.ok) {
      console.error("Google Places API error:", response.status);
      return null;
    }

    return response.json();
  } catch (error) {
    console.error("Google Places details error:", error);
    return null;
  }
}

/**
 * Autocomplete for place search
 */
export async function autocompletePlaces(
  params: AutocompleteParams
): Promise<AutocompleteResponse> {
  if (!GOOGLE_PLACES_API_KEY) {
    throw new Error("GOOGLE_PLACES_API_KEY not configured");
  }

  const requestBody: Record<string, unknown> = {
    input: params.input,
  };

  if (params.locationBias) requestBody.locationBias = params.locationBias;
  if (params.locationRestriction) requestBody.locationRestriction = params.locationRestriction;
  if (params.includedPrimaryTypes) requestBody.includedPrimaryTypes = params.includedPrimaryTypes;
  if (params.includedRegionCodes) requestBody.includedRegionCodes = params.includedRegionCodes;
  if (params.languageCode) requestBody.languageCode = params.languageCode;
  if (params.regionCode) requestBody.regionCode = params.regionCode;
  if (params.origin) requestBody.origin = params.origin;
  if (params.sessionToken) requestBody.sessionToken = params.sessionToken;

  return cachedGooglePlacesPost<AutocompleteResponse>(
    "autocomplete",
    `${BASE_URL}/places:autocomplete`,
    requestBody,
    GOOGLE_PLACES_API_KEY,
    { location: params.input }
  );
}

/**
 * Get photo URL for a place photo
 */
export function getPhotoUrl(
  photoName: string,
  maxWidth: number = 400,
  maxHeight: number = 400
): string {
  if (!GOOGLE_PLACES_API_KEY) return "";
  return `${BASE_URL}/${photoName}/media?maxWidthPx=${maxWidth}&maxHeightPx=${maxHeight}&key=${GOOGLE_PLACES_API_KEY}`;
}

// ============================================
// HIGH-LEVEL SEARCH FUNCTIONS
// ============================================

/**
 * Search for attractions/activities in a destination
 */
export async function searchAttractions(
  destination: string,
  options?: {
    types?: string[];
    maxResults?: number;
    language?: string;
    minRating?: number;
  }
): Promise<Place[]> {
  try {
    const response = await searchPlacesByText({
      textQuery: `attractions in ${destination}`,
      includedType: options?.types?.[0] || "tourist_attraction",
      maxResultCount: options?.maxResults || 20,
      languageCode: options?.language || "en",
      minRating: options?.minRating,
    });

    return response.places?.map(googlePlaceToPlace) || [];
  } catch (error) {
    console.error("Google Places attractions search error:", error);
    return [];
  }
}

/**
 * Search for restaurants in a destination
 */
export async function searchGoogleRestaurants(
  destination: string,
  options?: {
    cuisine?: string;
    priceLevels?: (1 | 2 | 3 | 4)[];
    openNow?: boolean;
    maxResults?: number;
    language?: string;
    minRating?: number;
  }
): Promise<Place[]> {
  try {
    const query = options?.cuisine
      ? `${options.cuisine} restaurants in ${destination}`
      : `restaurants in ${destination}`;

    const priceLevels = options?.priceLevels?.map((level) => {
      switch (level) {
        case 1:
          return "PRICE_LEVEL_INEXPENSIVE";
        case 2:
          return "PRICE_LEVEL_MODERATE";
        case 3:
          return "PRICE_LEVEL_EXPENSIVE";
        case 4:
          return "PRICE_LEVEL_VERY_EXPENSIVE";
        default:
          return "PRICE_LEVEL_MODERATE";
      }
    });

    const response = await searchPlacesByText({
      textQuery: query,
      includedType: "restaurant",
      priceLevels,
      openNow: options?.openNow,
      maxResultCount: options?.maxResults || 20,
      languageCode: options?.language || "en",
      minRating: options?.minRating,
    });

    return response.places?.map(googlePlaceToPlace) || [];
  } catch (error) {
    console.error("Google Places restaurants search error:", error);
    return [];
  }
}

/**
 * Search for places near coordinates
 */
export async function searchNearbyPlaces(
  lat: number,
  lng: number,
  options?: {
    types?: string[];
    radius?: number;
    maxResults?: number;
    language?: string;
    rankBy?: "DISTANCE" | "POPULARITY";
  }
): Promise<Place[]> {
  try {
    const response = await searchPlacesNearby({
      locationRestriction: {
        circle: {
          center: { latitude: lat, longitude: lng },
          radius: options?.radius || 5000,
        },
      },
      includedTypes: options?.types || ["tourist_attraction", "museum", "park"],
      maxResultCount: options?.maxResults || 20,
      languageCode: options?.language || "en",
      rankPreference: options?.rankBy || "POPULARITY",
    });

    return response.places?.map(googlePlaceToPlace) || [];
  } catch (error) {
    console.error("Google Places nearby search error:", error);
    return [];
  }
}

/**
 * Search for places by category
 */
export async function searchPlacesByCategory(
  destination: string,
  category: PlaceType,
  options?: {
    maxResults?: number;
    language?: string;
    minRating?: number;
  }
): Promise<Place[]> {
  try {
    const response = await searchPlacesByText({
      textQuery: `${category.replace(/_/g, " ")} in ${destination}`,
      includedType: PLACE_TYPES[category],
      maxResultCount: options?.maxResults || 20,
      languageCode: options?.language || "en",
      minRating: options?.minRating,
    });

    return response.places?.map(googlePlaceToPlace) || [];
  } catch (error) {
    console.error(`Google Places ${category} search error:`, error);
    return [];
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Convert Google price level to numeric
 */
function priceLevelToNumber(
  priceLevel?: GooglePlace["priceLevel"]
): 1 | 2 | 3 | 4 | undefined {
  switch (priceLevel) {
    case "PRICE_LEVEL_FREE":
    case "PRICE_LEVEL_INEXPENSIVE":
      return 1;
    case "PRICE_LEVEL_MODERATE":
      return 2;
    case "PRICE_LEVEL_EXPENSIVE":
      return 3;
    case "PRICE_LEVEL_VERY_EXPENSIVE":
      return 4;
    default:
      return undefined;
  }
}

/**
 * Extract city from address components
 */
function extractCity(place: GooglePlace): string | undefined {
  const cityComponent = place.addressComponents?.find(
    (c) => c.types.includes("locality") || c.types.includes("administrative_area_level_1")
  );
  return cityComponent?.longText;
}

/**
 * Extract country from address components
 */
function extractCountry(place: GooglePlace): string | undefined {
  const countryComponent = place.addressComponents?.find((c) => c.types.includes("country"));
  return countryComponent?.longText;
}

/**
 * Extract neighborhood from address components
 */
function extractNeighborhood(place: GooglePlace): string | undefined {
  const neighborhoodComponent = place.addressComponents?.find(
    (c) => c.types.includes("neighborhood") || c.types.includes("sublocality")
  );
  return neighborhoodComponent?.longText;
}

/**
 * Convert Google Place to simplified Place
 */
export function googlePlaceToPlace(googlePlace: GooglePlace): Place {
  const photoUrl = googlePlace.photos?.[0]
    ? getPhotoUrl(googlePlace.photos[0].name)
    : undefined;

  const imageUrls = googlePlace.photos?.map((p) => getPhotoUrl(p.name)) || [];

  return {
    id: `gp_${googlePlace.id}`,
    googlePlaceId: googlePlace.id,
    name: googlePlace.displayName.text,
    description: googlePlace.editorialSummary?.text,
    imageUrl: photoUrl,
    images: imageUrls.length > 0 ? imageUrls : undefined,
    rating: googlePlace.rating,
    reviewCount: googlePlace.userRatingCount,
    priceLevel: priceLevelToNumber(googlePlace.priceLevel),
    types: googlePlace.types,
    primaryType: googlePlace.primaryType,
    address: googlePlace.formattedAddress,
    city: extractCity(googlePlace),
    country: extractCountry(googlePlace),
    neighborhood: extractNeighborhood(googlePlace),
    phone: googlePlace.nationalPhoneNumber || googlePlace.internationalPhoneNumber,
    website: googlePlace.websiteUri,
    coordinates: {
      lat: googlePlace.location.latitude,
      lng: googlePlace.location.longitude,
    },
    isOpenNow: googlePlace.currentOpeningHours?.openNow ?? googlePlace.regularOpeningHours?.openNow,
    openingHours: googlePlace.regularOpeningHours?.weekdayDescriptions,
    accessibility: googlePlace.accessibilityOptions
      ? {
          wheelchairAccessible: googlePlace.accessibilityOptions.wheelchairAccessibleEntrance ?? false,
          wheelchairParking: googlePlace.accessibilityOptions.wheelchairAccessibleParking ?? false,
          wheelchairRestroom: googlePlace.accessibilityOptions.wheelchairAccessibleRestroom ?? false,
        }
      : undefined,
    features: {
      delivery: googlePlace.delivery,
      dineIn: googlePlace.dineIn,
      takeout: googlePlace.takeout,
      reservable: googlePlace.reservable,
      outdoorSeating: googlePlace.outdoorSeating,
      servesVegetarianFood: googlePlace.servesVegetarianFood,
      menuForChildren: googlePlace.menuForChildren,
      goodForChildren: googlePlace.goodForChildren,
      goodForGroups: googlePlace.goodForGroups,
    },
  };
}

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
 * Calculate distance between two coordinates (Haversine formula)
 */
export function calculateDistance(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}
