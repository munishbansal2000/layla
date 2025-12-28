/**
 * OpenStreetMap / Nominatim / Overpass API Integration
 *
 * Free, open-source alternative for place search and geocoding
 * APIs Used:
 * - Nominatim: Geocoding and reverse geocoding (https://nominatim.org/)
 * - Overpass: POI and complex queries (https://overpass-api.de/)
 *
 * Rate Limits: 1 request/second for Nominatim
 * No API key required, but attribution is required
 */

// ============================================
// CONFIGURATION
// ============================================

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
const OVERPASS_BASE_URL = "https://overpass-api.de/api/interpreter";

// User-Agent is required by Nominatim's usage policy
const USER_AGENT = "LaylaClone/1.0 (travel-planning-app)";

// Rate limiting - Nominatim requires max 1 request/second
let lastRequestTime = 0;
const MIN_REQUEST_INTERVAL = 1100; // 1.1 seconds to be safe

// In-memory cache
const cache = new Map<string, { data: unknown; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

// ============================================
// TYPES
// ============================================

export interface NominatimPlace {
  place_id: number;
  licence: string;
  osm_type: "node" | "way" | "relation";
  osm_id: number;
  lat: string;
  lon: string;
  display_name: string;
  class: string;
  type: string;
  importance: number;
  icon?: string;
  address?: NominatimAddress;
  boundingbox: [string, string, string, string];
  extratags?: {
    website?: string;
    phone?: string;
    opening_hours?: string;
    cuisine?: string;
    wheelchair?: string;
    [key: string]: string | undefined;
  };
  namedetails?: {
    name?: string;
    "name:en"?: string;
    "name:local"?: string;
    [key: string]: string | undefined;
  };
}

export interface NominatimAddress {
  house_number?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;
  county?: string;
  state?: string;
  postcode?: string;
  country?: string;
  country_code?: string;
}

export interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: {
    name?: string;
    "name:en"?: string;
    amenity?: string;
    tourism?: string;
    shop?: string;
    leisure?: string;
    historic?: string;
    natural?: string;
    cuisine?: string;
    opening_hours?: string;
    phone?: string;
    website?: string;
    wheelchair?: string;
    "addr:street"?: string;
    "addr:housenumber"?: string;
    "addr:city"?: string;
    "addr:postcode"?: string;
    [key: string]: string | undefined;
  };
}

export interface OverpassResponse {
  version: number;
  generator: string;
  osm3s: {
    timestamp_osm_base: string;
    copyright: string;
  };
  elements: OverpassElement[];
}

// Search parameters
export interface NominatimSearchParams {
  q?: string; // Free-form query
  street?: string;
  city?: string;
  county?: string;
  state?: string;
  country?: string;
  postalcode?: string;
  format?: "json" | "jsonv2" | "geojson" | "geocodejson";
  addressdetails?: 1 | 0;
  extratags?: 1 | 0;
  namedetails?: 1 | 0;
  limit?: number;
  viewbox?: string; // <x1>,<y1>,<x2>,<y2>
  bounded?: 1 | 0;
  countrycodes?: string;
  exclude_place_ids?: string;
  dedupe?: 1 | 0;
}

export interface OverpassSearchParams {
  lat: number;
  lng: number;
  radius: number; // meters
  types: OSMPlaceType[];
  limit?: number;
}

// Simplified place for app display (matching Google Places format)
export interface OSMPlace {
  id: string;
  osmId: string;
  osmType: string;
  name: string;
  description?: string;
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
  openingHours?: string;
  accessibility?: {
    wheelchairAccessible: boolean;
  };
  cuisine?: string[];
  source: "openstreetmap";
}

// ============================================
// OSM PLACE TYPE MAPPINGS
// ============================================

export type OSMPlaceType =
  | "restaurant"
  | "cafe"
  | "bar"
  | "pub"
  | "fast_food"
  | "bakery"
  | "museum"
  | "gallery"
  | "theatre"
  | "cinema"
  | "park"
  | "garden"
  | "playground"
  | "attraction"
  | "viewpoint"
  | "artwork"
  | "zoo"
  | "aquarium"
  | "theme_park"
  | "hotel"
  | "hostel"
  | "guest_house"
  | "marketplace"
  | "supermarket"
  | "mall"
  | "place_of_worship"
  | "temple"
  | "church"
  | "mosque"
  | "synagogue"
  | "castle"
  | "monument"
  | "memorial"
  | "archaeological_site"
  | "ruins"
  | "spa"
  | "nightclub";

// Map OSM types to Overpass query tags
const OSM_TYPE_QUERIES: Record<OSMPlaceType, string> = {
  restaurant: '["amenity"="restaurant"]',
  cafe: '["amenity"="cafe"]',
  bar: '["amenity"="bar"]',
  pub: '["amenity"="pub"]',
  fast_food: '["amenity"="fast_food"]',
  bakery: '["shop"="bakery"]',
  museum: '["tourism"="museum"]',
  gallery: '["tourism"="gallery"]',
  theatre: '["amenity"="theatre"]',
  cinema: '["amenity"="cinema"]',
  park: '["leisure"="park"]',
  garden: '["leisure"="garden"]',
  playground: '["leisure"="playground"]',
  attraction: '["tourism"="attraction"]',
  viewpoint: '["tourism"="viewpoint"]',
  artwork: '["tourism"="artwork"]',
  zoo: '["tourism"="zoo"]',
  aquarium: '["tourism"="aquarium"]',
  theme_park: '["tourism"="theme_park"]',
  hotel: '["tourism"="hotel"]',
  hostel: '["tourism"="hostel"]',
  guest_house: '["tourism"="guest_house"]',
  marketplace: '["amenity"="marketplace"]',
  supermarket: '["shop"="supermarket"]',
  mall: '["shop"="mall"]',
  place_of_worship: '["amenity"="place_of_worship"]',
  temple: '["amenity"="place_of_worship"]["religion"="buddhist"]',
  church: '["amenity"="place_of_worship"]["religion"="christian"]',
  mosque: '["amenity"="place_of_worship"]["religion"="muslim"]',
  synagogue: '["amenity"="place_of_worship"]["religion"="jewish"]',
  castle: '["historic"="castle"]',
  monument: '["historic"="monument"]',
  memorial: '["historic"="memorial"]',
  archaeological_site: '["historic"="archaeological_site"]',
  ruins: '["historic"="ruins"]',
  spa: '["amenity"="spa"]',
  nightclub: '["amenity"="nightclub"]',
};

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Rate limiter for Nominatim API
 */
async function rateLimit(): Promise<void> {
  const now = Date.now();
  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_REQUEST_INTERVAL) {
    await new Promise((resolve) => setTimeout(resolve, MIN_REQUEST_INTERVAL - timeSinceLastRequest));
  }

  lastRequestTime = Date.now();
}

/**
 * Generate cache key
 */
function getCacheKey(type: string, params: object): string {
  const paramsRecord = params as Record<string, unknown>;
  const sortedParams = Object.keys(paramsRecord)
    .sort()
    .map((key) => `${key}=${JSON.stringify(paramsRecord[key])}`)
    .join("&");
  return `osm:${type}:${sortedParams}`;
}

/**
 * Get from cache
 */
function getFromCache<T>(key: string): T | null {
  const cached = cache.get(key);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    console.log(`[OSM Cache] Hit: ${key.substring(0, 50)}...`);
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

// ============================================
// NOMINATIM API FUNCTIONS
// ============================================

/**
 * Search for places using Nominatim
 */
export async function searchNominatim(params: NominatimSearchParams): Promise<NominatimPlace[]> {
  const cacheKey = getCacheKey("nominatim-search", params);
  const cached = getFromCache<NominatimPlace[]>(cacheKey);
  if (cached) return cached;

  await rateLimit();

  const queryParams = new URLSearchParams();
  if (params.q) queryParams.set("q", params.q);
  if (params.street) queryParams.set("street", params.street);
  if (params.city) queryParams.set("city", params.city);
  if (params.county) queryParams.set("county", params.county);
  if (params.state) queryParams.set("state", params.state);
  if (params.country) queryParams.set("country", params.country);
  if (params.postalcode) queryParams.set("postalcode", params.postalcode);
  queryParams.set("format", params.format || "jsonv2");
  queryParams.set("addressdetails", (params.addressdetails ?? 1).toString());
  queryParams.set("extratags", (params.extratags ?? 1).toString());
  queryParams.set("namedetails", (params.namedetails ?? 1).toString());
  queryParams.set("limit", (params.limit || 10).toString());
  if (params.viewbox) queryParams.set("viewbox", params.viewbox);
  if (params.bounded) queryParams.set("bounded", params.bounded.toString());
  if (params.countrycodes) queryParams.set("countrycodes", params.countrycodes);

  try {
    const response = await fetch(`${NOMINATIM_BASE_URL}/search?${queryParams}`, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`);
    }

    const data: NominatimPlace[] = await response.json();
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error("Nominatim search error:", error);
    return [];
  }
}

/**
 * Reverse geocode coordinates to address
 */
export async function reverseGeocode(
  lat: number,
  lng: number
): Promise<NominatimPlace | null> {
  const cacheKey = getCacheKey("nominatim-reverse", { lat, lng });
  const cached = getFromCache<NominatimPlace>(cacheKey);
  if (cached) return cached;

  await rateLimit();

  const queryParams = new URLSearchParams({
    lat: lat.toString(),
    lon: lng.toString(),
    format: "jsonv2",
    addressdetails: "1",
    extratags: "1",
    namedetails: "1",
  });

  try {
    const response = await fetch(`${NOMINATIM_BASE_URL}/reverse?${queryParams}`, {
      headers: {
        "User-Agent": USER_AGENT,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Nominatim API error: ${response.status}`);
    }

    const data: NominatimPlace = await response.json();
    setCache(cacheKey, data);
    return data;
  } catch (error) {
    console.error("Nominatim reverse geocode error:", error);
    return null;
  }
}

/**
 * Geocode an address to coordinates
 */
export async function geocodeAddress(
  address: string,
  country?: string
): Promise<{ lat: number; lng: number } | null> {
  const results = await searchNominatim({
    q: address,
    countrycodes: country,
    limit: 1,
  });

  if (results.length > 0) {
    return {
      lat: parseFloat(results[0].lat),
      lng: parseFloat(results[0].lon),
    };
  }

  return null;
}

// ============================================
// OVERPASS API FUNCTIONS
// ============================================

/**
 * Build Overpass QL query for nearby places
 */
function buildOverpassQuery(params: OverpassSearchParams): string {
  const { lat, lng, radius, types, limit } = params;

  // Build type filters
  const typeFilters = types
    .map((type) => OSM_TYPE_QUERIES[type])
    .filter(Boolean)
    .map(
      (query) => `
      node${query}(around:${radius},${lat},${lng});
      way${query}(around:${radius},${lat},${lng});
      relation${query}(around:${radius},${lat},${lng});
    `
    )
    .join("");

  return `
    [out:json][timeout:25];
    (
      ${typeFilters}
    );
    out center ${limit || 50};
  `;
}

/**
 * Search for places using Overpass API
 */
export async function searchOverpass(params: OverpassSearchParams): Promise<OverpassElement[]> {
  const cacheKey = getCacheKey("overpass", params);
  const cached = getFromCache<OverpassElement[]>(cacheKey);
  if (cached) return cached;

  const query = buildOverpassQuery(params);

  try {
    const response = await fetch(OVERPASS_BASE_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        "User-Agent": USER_AGENT,
      },
      body: `data=${encodeURIComponent(query)}`,
    });

    if (!response.ok) {
      throw new Error(`Overpass API error: ${response.status}`);
    }

    const data: OverpassResponse = await response.json();
    setCache(cacheKey, data.elements);
    return data.elements;
  } catch (error) {
    console.error("Overpass search error:", error);
    return [];
  }
}

// ============================================
// HIGH-LEVEL SEARCH FUNCTIONS
// ============================================

/**
 * Search for places in a destination using OSM
 */
export async function searchOSMPlaces(
  destination: string,
  options?: {
    types?: OSMPlaceType[];
    limit?: number;
  }
): Promise<OSMPlace[]> {
  try {
    // First, geocode the destination to get coordinates
    const coords = await geocodeAddress(destination);
    if (!coords) {
      console.error("Could not geocode destination:", destination);
      return [];
    }

    // Then search for places nearby using Overpass
    const elements = await searchOverpass({
      lat: coords.lat,
      lng: coords.lng,
      radius: 10000, // 10km radius
      types: options?.types || ["attraction", "museum", "park", "monument", "viewpoint"],
      limit: options?.limit || 20,
    });

    return elements.map(overpassElementToOSMPlace).filter((p): p is OSMPlace => p !== null);
  } catch (error) {
    console.error("OSM places search error:", error);
    return [];
  }
}

/**
 * Search for restaurants in a destination using OSM
 */
export async function searchOSMRestaurants(
  destination: string,
  options?: {
    cuisine?: string;
    limit?: number;
  }
): Promise<OSMPlace[]> {
  try {
    // Geocode destination
    const coords = await geocodeAddress(destination);
    if (!coords) {
      console.error("Could not geocode destination:", destination);
      return [];
    }

    // Search for restaurants
    const elements = await searchOverpass({
      lat: coords.lat,
      lng: coords.lng,
      radius: 5000, // 5km radius
      types: ["restaurant", "cafe", "bar", "fast_food"],
      limit: options?.limit || 20,
    });

    let places = elements.map(overpassElementToOSMPlace).filter((p): p is OSMPlace => p !== null);

    // Filter by cuisine if specified
    if (options?.cuisine) {
      const cuisineLower = options.cuisine.toLowerCase();
      places = places.filter(
        (p) =>
          p.cuisine?.some((c) => c.toLowerCase().includes(cuisineLower)) ||
          p.name.toLowerCase().includes(cuisineLower)
      );
    }

    return places;
  } catch (error) {
    console.error("OSM restaurants search error:", error);
    return [];
  }
}

/**
 * Search for places near coordinates using OSM
 */
export async function searchOSMNearby(
  lat: number,
  lng: number,
  options?: {
    types?: OSMPlaceType[];
    radius?: number;
    limit?: number;
  }
): Promise<OSMPlace[]> {
  try {
    const elements = await searchOverpass({
      lat,
      lng,
      radius: options?.radius || 2000,
      types: options?.types || ["attraction", "museum", "park", "restaurant", "cafe"],
      limit: options?.limit || 20,
    });

    return elements.map(overpassElementToOSMPlace).filter((p): p is OSMPlace => p !== null);
  } catch (error) {
    console.error("OSM nearby search error:", error);
    return [];
  }
}

// ============================================
// CONVERSION FUNCTIONS
// ============================================

/**
 * Convert Overpass element to OSMPlace
 */
function overpassElementToOSMPlace(element: OverpassElement): OSMPlace | null {
  const tags = element.tags || {};
  const name = tags["name:en"] || tags.name;

  if (!name) return null;

  // Get coordinates
  const lat = element.lat ?? element.center?.lat;
  const lon = element.lon ?? element.center?.lon;

  if (lat === undefined || lon === undefined) return null;

  // Determine types
  const types: string[] = [];
  if (tags.amenity) types.push(tags.amenity);
  if (tags.tourism) types.push(tags.tourism);
  if (tags.leisure) types.push(tags.leisure);
  if (tags.historic) types.push(tags.historic);
  if (tags.shop) types.push(tags.shop);

  // Build address
  const addressParts: string[] = [];
  if (tags["addr:housenumber"] && tags["addr:street"]) {
    addressParts.push(`${tags["addr:housenumber"]} ${tags["addr:street"]}`);
  } else if (tags["addr:street"]) {
    addressParts.push(tags["addr:street"]);
  }
  if (tags["addr:city"]) addressParts.push(tags["addr:city"]);
  if (tags["addr:postcode"]) addressParts.push(tags["addr:postcode"]);

  // Parse cuisine
  const cuisine = tags.cuisine?.split(";").map((c) => c.trim()) || undefined;

  return {
    id: `osm_${element.type}_${element.id}`,
    osmId: element.id.toString(),
    osmType: element.type,
    name,
    types,
    primaryType: types[0],
    address: addressParts.join(", ") || "Address not available",
    city: tags["addr:city"],
    phone: tags.phone,
    website: tags.website,
    coordinates: {
      lat,
      lng: lon,
    },
    openingHours: tags.opening_hours,
    accessibility: {
      wheelchairAccessible: tags.wheelchair === "yes" || tags.wheelchair === "limited",
    },
    cuisine,
    source: "openstreetmap",
  };
}

/**
 * Convert Nominatim place to OSMPlace
 */
export function nominatimToOSMPlace(place: NominatimPlace): OSMPlace {
  const types: string[] = [place.type];
  if (place.class !== place.type) types.push(place.class);

  const name = place.namedetails?.["name:en"] || place.namedetails?.name || place.display_name.split(",")[0];

  return {
    id: `osm_${place.osm_type}_${place.osm_id}`,
    osmId: place.osm_id.toString(),
    osmType: place.osm_type,
    name,
    types,
    primaryType: place.type,
    address: place.display_name,
    city: place.address?.city || place.address?.town || place.address?.village,
    country: place.address?.country,
    neighborhood: place.address?.neighbourhood || place.address?.suburb,
    phone: place.extratags?.phone,
    website: place.extratags?.website,
    coordinates: {
      lat: parseFloat(place.lat),
      lng: parseFloat(place.lon),
    },
    openingHours: place.extratags?.opening_hours,
    accessibility: {
      wheelchairAccessible: place.extratags?.wheelchair === "yes",
    },
    cuisine: place.extratags?.cuisine?.split(";").map((c) => c.trim()),
    source: "openstreetmap",
  };
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Check if OpenStreetMap is available (always true, no API key needed)
 */
export function isOSMConfigured(): boolean {
  return true;
}

/**
 * Get cache statistics
 */
export function getOSMCacheStats(): {
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
export function clearOSMCache(): void {
  cache.clear();
}
