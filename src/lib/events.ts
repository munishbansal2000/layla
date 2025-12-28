/**
 * Events & Festivals Integration
 *
 * Features:
 * - Event discovery by location/date
 * - Festival calendars
 * - Event impact assessment
 * - Ticket availability
 *
 * Providers (in priority order):
 * 1. Eventbrite API - Free tier (1000 req/day)
 * 2. Ticketmaster Discovery API - Free tier (5000 req/day)
 * 3. PredictHQ API - Paid (event intelligence)
 * 4. Open data - Wikipedia festivals, government tourism sites
 * 5. Offline database - Major festivals pre-cached
 *
 * API Docs:
 * - Eventbrite: https://www.eventbrite.com/platform/api
 * - Ticketmaster: https://developer.ticketmaster.com/products-and-docs/apis/discovery-api/v2/
 * - PredictHQ: https://docs.predicthq.com/
 */

import { getOrFetch, cacheKey, CACHE_TTL, CACHE_NS, setCache, getCache } from "./cache";

const EVENTBRITE_API_KEY = process.env.EVENTBRITE_API_KEY || "";
const TICKETMASTER_API_KEY = process.env.TICKETMASTER_API_KEY || "";
const PREDICTHQ_API_KEY = process.env.PREDICTHQ_API_KEY || "";

// ============================================
// TYPES
// ============================================

export type EventCategory =
  | "music"
  | "arts"
  | "sports"
  | "food"
  | "festival"
  | "cultural"
  | "nightlife"
  | "family"
  | "business"
  | "outdoor"
  | "holiday"
  | "other";

export interface LocalEvent {
  id: string;
  name: string;
  description: string;
  category: EventCategory;
  startDate: string;
  endDate?: string;
  startTime?: string;
  endTime?: string;
  venue: EventVenue;
  pricing: EventPricing;
  images?: string[];
  ticketUrl?: string;
  source: string;
  popularity?: number; // 0-100
  isFree: boolean;
  isRecurring: boolean;
  tags: string[];
}

export interface EventVenue {
  name: string;
  address: string;
  city: string;
  country: string;
  location?: { lat: number; lng: number };
  capacity?: number;
}

export interface EventPricing {
  isFree: boolean;
  minPrice?: number;
  maxPrice?: number;
  currency?: string;
  priceRange?: string;
}

export interface EventSearchParams {
  location: { lat: number; lng: number } | string;
  startDate?: string;
  endDate?: string;
  categories?: EventCategory[];
  radius?: number; // km
  limit?: number;
  minPopularity?: number;
  isFree?: boolean;
}

export interface FestivalInfo {
  name: string;
  country: string;
  city?: string;
  date: string | { start: string; end: string };
  description: string;
  type: "national" | "religious" | "cultural" | "local";
  isPublicHoliday: boolean;
  traditions?: string[];
  tips?: string[];
}

// ============================================
// FESTIVAL DATABASE
// ============================================

const MAJOR_FESTIVALS: Record<string, FestivalInfo[]> = {
  JP: [
    {
      name: "Cherry Blossom Season (Hanami)",
      country: "Japan",
      date: { start: "2025-03-20", end: "2025-05-10" },
      description: "Cherry blossom viewing season - dates vary by region",
      type: "cultural",
      isPublicHoliday: false,
      traditions: ["Picnics under cherry trees", "Night viewing (yozakura)"],
      tips: ["Peak times vary - check sakura forecasts", "Popular spots get very crowded"],
    },
    {
      name: "Golden Week",
      country: "Japan",
      date: { start: "2025-04-29", end: "2025-05-05" },
      description: "Japan's longest holiday period with multiple national holidays",
      type: "national",
      isPublicHoliday: true,
      tips: [
        "Extremely crowded everywhere",
        "Book accommodation months in advance",
        "Expect higher prices",
      ],
    },
    {
      name: "Gion Matsuri",
      country: "Japan",
      city: "Kyoto",
      date: { start: "2025-07-01", end: "2025-07-31" },
      description: "Kyoto's biggest festival with elaborate float processions",
      type: "cultural",
      isPublicHoliday: false,
      traditions: ["Yamaboko floats", "Street food stalls", "Yukata wearing"],
      tips: ["Main procession on July 17", "Book Kyoto hotels early"],
    },
    {
      name: "Obon",
      country: "Japan",
      date: { start: "2025-08-13", end: "2025-08-16" },
      description: "Buddhist festival honoring ancestors",
      type: "religious",
      isPublicHoliday: false,
      traditions: ["Bon Odori dancing", "Floating lanterns", "Visiting graves"],
      tips: ["Many Japanese travel home", "Transport very busy"],
    },
  ],
  FR: [
    {
      name: "Bastille Day",
      country: "France",
      date: "2025-07-14",
      description: "French National Day with fireworks and military parade",
      type: "national",
      isPublicHoliday: true,
      traditions: ["Military parade on Champs-Élysées", "Fireworks at Eiffel Tower"],
      tips: ["Arrive very early for good viewing spots", "Metro extremely crowded"],
    },
    {
      name: "Fête de la Musique",
      country: "France",
      date: "2025-06-21",
      description: "Nationwide music festival with free concerts everywhere",
      type: "cultural",
      isPublicHoliday: false,
      traditions: ["Street performances", "All music genres"],
      tips: ["Amazing atmosphere throughout Paris", "Public transport runs late"],
    },
    {
      name: "Tour de France",
      country: "France",
      date: { start: "2025-07-05", end: "2025-07-27" },
      description: "World's most famous cycling race",
      type: "cultural",
      isPublicHoliday: false,
      tips: ["Route varies yearly", "Final stage on Champs-Élysées"],
    },
  ],
  TH: [
    {
      name: "Songkran (Thai New Year)",
      country: "Thailand",
      date: { start: "2025-04-13", end: "2025-04-15" },
      description: "Thai New Year water festival",
      type: "national",
      isPublicHoliday: true,
      traditions: ["Water fights", "Temple visits", "Paying respect to elders"],
      tips: ["Everything gets wet!", "Protect electronics", "Join the water fun!"],
    },
    {
      name: "Loy Krathong",
      country: "Thailand",
      date: "2025-11-05",
      description: "Festival of lights with floating lanterns and kratongs",
      type: "cultural",
      isPublicHoliday: false,
      traditions: ["Floating decorated baskets", "Sky lanterns", "Fireworks"],
      tips: ["Best in Chiang Mai or Sukhothai", "Book early"],
    },
    {
      name: "Yi Peng Lantern Festival",
      country: "Thailand",
      city: "Chiang Mai",
      date: "2025-11-05",
      description: "Mass sky lantern release in Chiang Mai",
      type: "cultural",
      isPublicHoliday: false,
      traditions: ["Thousands of sky lanterns", "Temple ceremonies"],
      tips: ["Book organized event for best experience", "Very popular - reserve early"],
    },
  ],
  MX: [
    {
      name: "Day of the Dead (Día de los Muertos)",
      country: "Mexico",
      date: { start: "2025-10-31", end: "2025-11-02" },
      description: "Celebration honoring deceased loved ones",
      type: "cultural",
      isPublicHoliday: true,
      traditions: ["Ofrendas (altars)", "Cemetery visits", "Skull decorations"],
      tips: ["Best in Oaxaca or Mexico City", "Very colorful and celebratory"],
    },
    {
      name: "Independence Day",
      country: "Mexico",
      date: "2025-09-16",
      description: "Mexican Independence Day celebrations",
      type: "national",
      isPublicHoliday: true,
      traditions: ["El Grito ceremony", "Parades", "Fireworks"],
      tips: ["Main celebration night of Sept 15", "Zócalo in Mexico City gets packed"],
    },
  ],
};

// ============================================
// CONFIGURATION CHECK
// ============================================

export function isEventsConfigured(): boolean {
  return !!(EVENTBRITE_API_KEY || TICKETMASTER_API_KEY || PREDICTHQ_API_KEY);
}

// ============================================
// EVENT SEARCH FUNCTIONS
// ============================================

/**
 * Search for local events
 */
export async function searchEvents(
  params: EventSearchParams
): Promise<LocalEvent[]> {
  const allEvents: LocalEvent[] = [];

  // Try multiple sources
  if (EVENTBRITE_API_KEY) {
    const events = await searchEventbrite(params);
    allEvents.push(...events);
  }

  if (TICKETMASTER_API_KEY) {
    const events = await searchTicketmaster(params);
    allEvents.push(...events);
  }

  // Always include local festival data
  const festivals = getUpcomingFestivals(params);
  allEvents.push(...festivals);

  // Deduplicate and sort
  const unique = deduplicateEvents(allEvents);
  return unique.slice(0, params.limit || 20);
}

/**
 * Search Eventbrite
 */
async function searchEventbrite(params: EventSearchParams): Promise<LocalEvent[]> {
  try {
    const url = new URL("https://www.eventbriteapi.com/v3/events/search/");

    if (typeof params.location === "string") {
      url.searchParams.set("location.address", params.location);
    } else {
      url.searchParams.set("location.latitude", params.location.lat.toString());
      url.searchParams.set("location.longitude", params.location.lng.toString());
    }

    if (params.startDate) url.searchParams.set("start_date.range_start", params.startDate);
    if (params.endDate) url.searchParams.set("start_date.range_end", params.endDate);
    if (params.radius) url.searchParams.set("location.within", `${params.radius}km`);

    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${EVENTBRITE_API_KEY}` },
    });

    if (!response.ok) return [];

    const data = await response.json();
    return (data.events || []).map(mapEventbriteEvent);
  } catch (error) {
    console.error("Eventbrite API error:", error);
    return [];
  }
}

/**
 * Search Ticketmaster
 */
async function searchTicketmaster(params: EventSearchParams): Promise<LocalEvent[]> {
  try {
    const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
    url.searchParams.set("apikey", TICKETMASTER_API_KEY);

    if (typeof params.location !== "string") {
      url.searchParams.set("latlong", `${params.location.lat},${params.location.lng}`);
    }

    if (params.radius) url.searchParams.set("radius", params.radius.toString());
    if (params.startDate) url.searchParams.set("startDateTime", `${params.startDate}T00:00:00Z`);
    if (params.endDate) url.searchParams.set("endDateTime", `${params.endDate}T23:59:59Z`);

    const response = await fetch(url.toString());
    if (!response.ok) return [];

    const data = await response.json();
    return (data._embedded?.events || []).map(mapTicketmasterEvent);
  } catch (error) {
    console.error("Ticketmaster API error:", error);
    return [];
  }
}

// ============================================
// FESTIVAL FUNCTIONS
// ============================================

/**
 * Get festivals for a country
 */
export function getFestivals(countryCode: string): FestivalInfo[] {
  return MAJOR_FESTIVALS[countryCode.toUpperCase()] || [];
}

/**
 * Get upcoming festivals matching search params
 */
function getUpcomingFestivals(params: EventSearchParams): LocalEvent[] {
  const events: LocalEvent[] = [];
  const now = new Date();
  const startDate = params.startDate ? new Date(params.startDate) : now;
  const endDate = params.endDate ? new Date(params.endDate) : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  for (const [_countryCode, festivals] of Object.entries(MAJOR_FESTIVALS)) {
    for (const festival of festivals) {
      const festivalStart = typeof festival.date === "string"
        ? new Date(festival.date)
        : new Date(festival.date.start);
      const festivalEnd = typeof festival.date === "string"
        ? new Date(festival.date)
        : new Date(festival.date.end);

      // Check if festival overlaps with search date range
      if (festivalEnd >= startDate && festivalStart <= endDate) {
        events.push({
          id: `festival_${festival.name.toLowerCase().replace(/\s+/g, "_")}`,
          name: festival.name,
          description: festival.description,
          category: festival.type === "cultural" ? "festival" : "cultural",
          startDate: festivalStart.toISOString(),
          endDate: festivalEnd.toISOString(),
          venue: {
            name: festival.city || "Various locations",
            address: "",
            city: festival.city || "",
            country: festival.country,
          },
          pricing: { isFree: true },
          isFree: true,
          isRecurring: true,
          source: "Local Database",
          tags: festival.traditions || [],
        });
      }
    }
  }

  return events;
}

/**
 * Get festivals happening during a trip
 */
export function getFestivalsDuringTrip(
  countryCode: string,
  startDate: string,
  endDate: string
): FestivalInfo[] {
  const festivals = getFestivals(countryCode);
  const tripStart = new Date(startDate);
  const tripEnd = new Date(endDate);

  return festivals.filter((festival) => {
    const festivalStart = typeof festival.date === "string"
      ? new Date(festival.date)
      : new Date(festival.date.start);
    const festivalEnd = typeof festival.date === "string"
      ? new Date(festival.date)
      : new Date(festival.date.end);

    return festivalEnd >= tripStart && festivalStart <= tripEnd;
  });
}

/**
 * Get events by category
 */
export async function getEventsByCategory(
  location: { lat: number; lng: number } | string,
  category: EventCategory,
  options?: {
    startDate?: string;
    endDate?: string;
    limit?: number;
  }
): Promise<LocalEvent[]> {
  const events = await searchEvents({
    location,
    categories: [category],
    startDate: options?.startDate,
    endDate: options?.endDate,
    limit: options?.limit,
  });

  return events;
}

// ============================================
// IMPACT ASSESSMENT
// ============================================

/**
 * Check if events will impact travel
 */
export function assessEventImpact(
  events: LocalEvent[],
  tripDates: { start: string; end: string }
): {
  highImpact: LocalEvent[];
  mediumImpact: LocalEvent[];
  lowImpact: LocalEvent[];
  tips: string[];
} {
  const highImpact: LocalEvent[] = [];
  const mediumImpact: LocalEvent[] = [];
  const lowImpact: LocalEvent[] = [];
  const tips: string[] = [];

  for (const event of events) {
    // Festivals and major events have high impact
    if (event.category === "festival" || (event.popularity && event.popularity > 80)) {
      highImpact.push(event);
      tips.push(`${event.name} may cause crowding and higher prices`);
    } else if (event.category === "sports" || event.category === "music") {
      mediumImpact.push(event);
    } else {
      lowImpact.push(event);
    }
  }

  if (highImpact.length > 0) {
    tips.push("Book accommodation well in advance");
    tips.push("Expect higher prices during major events");
    tips.push("Plan for longer travel times");
  }

  return { highImpact, mediumImpact, lowImpact, tips };
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Map Eventbrite event to our format
 */
function mapEventbriteEvent(event: Record<string, unknown>): LocalEvent {
  const e = event as {
    id: string;
    name: { text: string };
    description: { text: string };
    start: { local: string };
    end?: { local: string };
    venue?: { name: string; address?: { localized_address_display: string; city: string; country: string; latitude: string; longitude: string } };
    is_free: boolean;
    ticket_availability?: { minimum_ticket_price?: { value: number; currency: string }; maximum_ticket_price?: { value: number; currency: string } };
    url: string;
  };

  return {
    id: `eb_${e.id}`,
    name: e.name?.text || "Unknown Event",
    description: e.description?.text || "",
    category: "other",
    startDate: e.start?.local || "",
    endDate: e.end?.local,
    venue: {
      name: e.venue?.name || "TBD",
      address: e.venue?.address?.localized_address_display || "",
      city: e.venue?.address?.city || "",
      country: e.venue?.address?.country || "",
      location: e.venue?.address?.latitude
        ? { lat: parseFloat(e.venue.address.latitude), lng: parseFloat(e.venue.address.longitude) }
        : undefined,
    },
    pricing: {
      isFree: e.is_free,
      minPrice: e.ticket_availability?.minimum_ticket_price?.value,
      maxPrice: e.ticket_availability?.maximum_ticket_price?.value,
      currency: e.ticket_availability?.minimum_ticket_price?.currency,
    },
    ticketUrl: e.url,
    source: "Eventbrite",
    isFree: e.is_free,
    isRecurring: false,
    tags: [],
  };
}

/**
 * Map Ticketmaster event to our format
 */
function mapTicketmasterEvent(event: Record<string, unknown>): LocalEvent {
  const e = event as {
    id: string;
    name: string;
    info?: string;
    dates?: { start?: { localDate: string; localTime: string }; end?: { localDate: string } };
    _embedded?: { venues?: Array<{ name: string; address?: { line1: string }; city?: { name: string }; country?: { name: string }; location?: { latitude: string; longitude: string } }> };
    priceRanges?: Array<{ min: number; max: number; currency: string }>;
    url: string;
    classifications?: Array<{ segment?: { name: string } }>;
  };

  const venue = e._embedded?.venues?.[0];
  const priceRange = e.priceRanges?.[0];

  return {
    id: `tm_${e.id}`,
    name: e.name || "Unknown Event",
    description: e.info || "",
    category: mapTicketmasterCategory(e.classifications?.[0]?.segment?.name),
    startDate: e.dates?.start?.localDate || "",
    startTime: e.dates?.start?.localTime,
    endDate: e.dates?.end?.localDate,
    venue: {
      name: venue?.name || "TBD",
      address: venue?.address?.line1 || "",
      city: venue?.city?.name || "",
      country: venue?.country?.name || "",
      location: venue?.location
        ? { lat: parseFloat(venue.location.latitude), lng: parseFloat(venue.location.longitude) }
        : undefined,
    },
    pricing: {
      isFree: !priceRange,
      minPrice: priceRange?.min,
      maxPrice: priceRange?.max,
      currency: priceRange?.currency,
      priceRange: priceRange ? `${priceRange.currency}${priceRange.min}-${priceRange.max}` : undefined,
    },
    ticketUrl: e.url,
    source: "Ticketmaster",
    isFree: !priceRange,
    isRecurring: false,
    tags: [],
  };
}

/**
 * Map Ticketmaster category
 */
function mapTicketmasterCategory(segment?: string): EventCategory {
  const categoryMap: Record<string, EventCategory> = {
    Music: "music",
    Sports: "sports",
    "Arts & Theatre": "arts",
    Film: "arts",
    Miscellaneous: "other",
  };

  return categoryMap[segment || ""] || "other";
}

/**
 * Deduplicate events by name similarity
 */
function deduplicateEvents(events: LocalEvent[]): LocalEvent[] {
  const seen = new Map<string, LocalEvent>();

  for (const event of events) {
    const key = event.name.toLowerCase().replace(/[^a-z0-9]/g, "");
    if (!seen.has(key)) {
      seen.set(key, event);
    }
  }

  return Array.from(seen.values());
}

/**
 * Format event date range
 */
export function formatEventDateRange(event: LocalEvent): string {
  const start = new Date(event.startDate);
  const end = event.endDate ? new Date(event.endDate) : null;

  const formatDate = (d: Date) =>
    d.toLocaleDateString("en-US", { month: "short", day: "numeric" });

  if (!end || start.toDateString() === end.toDateString()) {
    return formatDate(start);
  }

  return `${formatDate(start)} - ${formatDate(end)}`;
}

export default {
  searchEvents,
  getFestivals,
  getFestivalsDuringTrip,
  getEventsByCategory,
  assessEventImpact,
  formatEventDateRange,
  isEventsConfigured,
};
