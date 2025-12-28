/**
 * Japan-Specific Services Integration
 *
 * Specialized services for Japan travel planning including:
 * - Train routing (JR, Metro, private lines)
 * - Restaurant discovery (Tabelog ratings, Gurunavi)
 * - Seasonal events (Sakura, Momiji forecasts)
 * - Convenience info (Konbini, coin lockers, IC cards)
 * - Cultural experiences (Onsen, temples, festivals)
 *
 * API Sources:
 * - Tokyo Metro Open Data: https://developer.tokyometroapp.jp/
 * - Gurunavi: https://api.gnavi.co.jp/api/
 * - Hot Pepper: https://webservice.recruit.co.jp/
 * - Rakuten Travel: https://webservice.rakuten.co.jp/
 * - JMA Weather: https://www.jma.go.jp/
 */

import { getOrFetch, cacheKey, CACHE_TTL, CACHE_NS, setCache, getCache } from "./cache";

// ============================================
// API CONFIGURATION
// ============================================

// Gurunavi API (Restaurant search - FREE tier: 1000 req/day)
// Register at: https://api.gnavi.co.jp/api/
const GURUNAVI_API_KEY = process.env.GURUNAVI_API_KEY || "";
const GURUNAVI_URL = "https://api.gnavi.co.jp/RestSearchAPI/v3/";

// Hot Pepper Gourmet API (Restaurant booking - FREE)
// Register at: https://webservice.recruit.co.jp/register/
const HOTPEPPER_API_KEY = process.env.HOTPEPPER_API_KEY || "";
const HOTPEPPER_URL = "https://webservice.recruit.co.jp/hotpepper/gourmet/v1/";

// Rakuten Travel API (Hotels & Ryokan - FREE)
// Register at: https://webservice.rakuten.co.jp/
const RAKUTEN_API_KEY = process.env.RAKUTEN_API_KEY || "";
const RAKUTEN_APP_ID = process.env.RAKUTEN_APP_ID || "";
const RAKUTEN_TRAVEL_URL = "https://app.rakuten.co.jp/services/api/Travel/";

// Tokyo Metro Open Data API (FREE)
// Register at: https://developer.tokyometroapp.jp/
const TOKYO_METRO_API_KEY = process.env.TOKYO_METRO_API_KEY || "";
const TOKYO_METRO_URL = "https://api.tokyometroapp.jp/api/v2";

// ============================================
// TYPES
// ============================================

export interface JapanRestaurant {
  id: string;
  name: string;
  nameKana?: string;
  category: string;
  address: string;
  station?: string;
  walkingMinutes?: number;
  phone?: string;
  budget: {
    lunch?: string;
    dinner?: string;
    average?: number;
  };
  rating?: {
    tabelog?: number; // 3.0-5.0 scale, 3.5+ is good
    gurunavi?: number;
  };
  openingHours?: string;
  holidays?: string;
  smoking?: "no_smoking" | "smoking" | "separated" | "unknown";
  englishMenu?: boolean;
  cardAccepted?: boolean;
  reservationRequired?: boolean;
  images?: string[];
  url?: string;
  features?: string[];
  location?: { lat: number; lng: number };
}

export interface TrainRoute {
  departureStation: string;
  arrivalStation: string;
  departureTime: string;
  arrivalTime: string;
  duration: number; // minutes
  transfers: number;
  fare: {
    regular: number;
    ic: number; // IC card fare (usually slightly cheaper)
  };
  lines: TrainLeg[];
  notes?: string[];
}

export interface TrainLeg {
  line: string;
  lineColor?: string;
  direction: string;
  departureStation: string;
  departureTime: string;
  arrivalStation: string;
  arrivalTime: string;
  duration: number;
  platform?: string;
  trainType?: string; // Local, Rapid, Express, Ltd. Express
  carRecommendation?: string;
}

export interface SakuraForecast {
  region: string;
  city: string;
  spot?: string;
  bloomDate: string; // First bloom
  fullBloomDate: string; // Peak
  petalFallDate?: string;
  currentStatus: SakuraStatus;
  lastUpdated: string;
}

export type SakuraStatus =
  | "not_yet"
  | "budding"
  | "blooming"
  | "full_bloom"
  | "falling"
  | "ended";

export interface MomijiForecast {
  region: string;
  spot: string;
  peakStart: string;
  peakEnd: string;
  currentStatus: "green" | "starting" | "peak" | "ending" | "ended";
  bestViewing: string;
}

export interface Ryokan {
  id: string;
  name: string;
  location: string;
  prefecture: string;
  onsenType?: string[];
  roomTypes: string[];
  meals: {
    breakfast: boolean;
    dinner: boolean;
    kaiseki?: boolean;
  };
  priceRange: {
    min: number;
    max: number;
    currency: "JPY";
  };
  rating?: number;
  features: string[];
  englishSupport: boolean;
  images?: string[];
  bookingUrl?: string;
}

export interface ConvenienceStore {
  brand: "7-eleven" | "lawson" | "familymart" | "ministop" | "other";
  name: string;
  address: string;
  location: { lat: number; lng: number };
  is24Hours: boolean;
  services: ConvenienceService[];
}

export type ConvenienceService =
  | "atm"
  | "wifi"
  | "toilet"
  | "tax_free"
  | "ticket"
  | "copy"
  | "shipping"
  | "eat_in";

export interface CoinLocker {
  station: string;
  location: string;
  sizes: {
    small: { available: number; price: number };
    medium: { available: number; price: number };
    large: { available: number; price: number };
  };
  icCardAccepted: boolean;
  maxDays: number;
}

export interface JRPass {
  name: string;
  type: "nationwide" | "regional";
  duration: number; // days
  price: {
    ordinary: number;
    green: number; // First class
  };
  coverage: string[];
  restrictions: string[];
  worthIt: (tripDetails: { cities: string[]; days: number }) => boolean;
}

// ============================================
// STATION DATABASE (Common stations)
// ============================================

const MAJOR_STATIONS: Record<string, { name: string; lines: string[]; lockers: boolean; englishSupport: boolean }> = {
  tokyo: { name: "Tokyo Station", lines: ["JR", "Marunouchi Line"], lockers: true, englishSupport: true },
  shinjuku: { name: "Shinjuku Station", lines: ["JR", "Metro", "Odakyu", "Keio"], lockers: true, englishSupport: true },
  shibuya: { name: "Shibuya Station", lines: ["JR", "Metro", "Tokyu", "Keio"], lockers: true, englishSupport: true },
  ikebukuro: { name: "Ikebukuro Station", lines: ["JR", "Metro", "Seibu", "Tobu"], lockers: true, englishSupport: true },
  ueno: { name: "Ueno Station", lines: ["JR", "Metro"], lockers: true, englishSupport: true },
  akihabara: { name: "Akihabara Station", lines: ["JR", "Metro"], lockers: true, englishSupport: true },
  kyoto: { name: "Kyoto Station", lines: ["JR", "Kintetsu", "Metro"], lockers: true, englishSupport: true },
  osaka: { name: "Osaka Station", lines: ["JR"], lockers: true, englishSupport: true },
  namba: { name: "Namba Station", lines: ["Nankai", "Metro", "Kintetsu"], lockers: true, englishSupport: true },
  hakata: { name: "Hakata Station", lines: ["JR", "Shinkansen", "Metro"], lockers: true, englishSupport: true },
};

// ============================================
// SAKURA FORECAST DATABASE (2025 predictions)
// ============================================

const SAKURA_FORECASTS_2025: SakuraForecast[] = [
  { region: "Tokyo", city: "Tokyo", spot: "Ueno Park", bloomDate: "2025-03-20", fullBloomDate: "2025-03-27", currentStatus: "not_yet", lastUpdated: "2024-12-27" },
  { region: "Tokyo", city: "Tokyo", spot: "Meguro River", bloomDate: "2025-03-22", fullBloomDate: "2025-03-29", currentStatus: "not_yet", lastUpdated: "2024-12-27" },
  { region: "Tokyo", city: "Tokyo", spot: "Shinjuku Gyoen", bloomDate: "2025-03-21", fullBloomDate: "2025-03-28", currentStatus: "not_yet", lastUpdated: "2024-12-27" },
  { region: "Kyoto", city: "Kyoto", spot: "Maruyama Park", bloomDate: "2025-03-25", fullBloomDate: "2025-04-01", currentStatus: "not_yet", lastUpdated: "2024-12-27" },
  { region: "Kyoto", city: "Kyoto", spot: "Philosopher's Path", bloomDate: "2025-03-27", fullBloomDate: "2025-04-03", currentStatus: "not_yet", lastUpdated: "2024-12-27" },
  { region: "Osaka", city: "Osaka", spot: "Osaka Castle", bloomDate: "2025-03-24", fullBloomDate: "2025-03-31", currentStatus: "not_yet", lastUpdated: "2024-12-27" },
  { region: "Nara", city: "Nara", spot: "Nara Park", bloomDate: "2025-03-26", fullBloomDate: "2025-04-02", currentStatus: "not_yet", lastUpdated: "2024-12-27" },
  { region: "Hiroshima", city: "Hiroshima", spot: "Peace Memorial Park", bloomDate: "2025-03-23", fullBloomDate: "2025-03-30", currentStatus: "not_yet", lastUpdated: "2024-12-27" },
  { region: "Hokkaido", city: "Sapporo", spot: "Maruyama Park", bloomDate: "2025-04-28", fullBloomDate: "2025-05-03", currentStatus: "not_yet", lastUpdated: "2024-12-27" },
  { region: "Tohoku", city: "Sendai", spot: "Tsutsujigaoka Park", bloomDate: "2025-04-08", fullBloomDate: "2025-04-13", currentStatus: "not_yet", lastUpdated: "2024-12-27" },
];

// ============================================
// JR PASS OPTIONS
// ============================================

const JR_PASSES: JRPass[] = [
  {
    name: "JR Pass (7 days)",
    type: "nationwide",
    duration: 7,
    price: { ordinary: 50000, green: 70000 },
    coverage: ["All JR lines nationwide", "Most Shinkansen (except Nozomi/Mizuho)"],
    restrictions: ["Cannot use Nozomi or Mizuho Shinkansen", "Must be tourist visa holder"],
    worthIt: ({ cities, days }) => days >= 5 && cities.length >= 3,
  },
  {
    name: "JR Pass (14 days)",
    type: "nationwide",
    duration: 14,
    price: { ordinary: 80000, green: 110000 },
    coverage: ["All JR lines nationwide", "Most Shinkansen (except Nozomi/Mizuho)"],
    restrictions: ["Cannot use Nozomi or Mizuho Shinkansen", "Must be tourist visa holder"],
    worthIt: ({ cities, days }) => days >= 10 && cities.length >= 4,
  },
  {
    name: "JR Pass (21 days)",
    type: "nationwide",
    duration: 21,
    price: { ordinary: 100000, green: 140000 },
    coverage: ["All JR lines nationwide", "Most Shinkansen (except Nozomi/Mizuho)"],
    restrictions: ["Cannot use Nozomi or Mizuho Shinkansen", "Must be tourist visa holder"],
    worthIt: ({ cities, days }) => days >= 17 && cities.length >= 5,
  },
  {
    name: "JR West Kansai Pass (1 day)",
    type: "regional",
    duration: 1,
    price: { ordinary: 2400, green: 0 },
    coverage: ["JR lines in Kansai (Osaka, Kyoto, Kobe, Nara)"],
    restrictions: ["Kansai area only", "No Shinkansen"],
    worthIt: ({ cities }) => cities.some(c => ["osaka", "kyoto", "kobe", "nara"].includes(c.toLowerCase())),
  },
  {
    name: "JR Kansai Wide Pass (5 days)",
    type: "regional",
    duration: 5,
    price: { ordinary: 12000, green: 0 },
    coverage: ["Kansai region including Himeji, Okayama, Kinosaki Onsen"],
    restrictions: ["Limited to Kansai wide area"],
    worthIt: ({ cities }) => cities.some(c => ["himeji", "okayama", "kinosaki"].includes(c.toLowerCase())),
  },
];

// ============================================
// CONFIGURATION CHECK
// ============================================

export function isJapanServicesConfigured(): boolean {
  return !!(GURUNAVI_API_KEY || HOTPEPPER_API_KEY || RAKUTEN_API_KEY);
}

// ============================================
// RESTAURANT SEARCH
// ============================================

/**
 * Search for restaurants in Japan using Gurunavi
 */
export async function searchJapanRestaurants(
  location: string | { lat: number; lng: number },
  options?: {
    category?: string;
    budget?: { min?: number; max?: number };
    englishMenu?: boolean;
    currentlyOpen?: boolean;
    limit?: number;
  }
): Promise<JapanRestaurant[]> {
  // Try Gurunavi first
  if (GURUNAVI_API_KEY) {
    const restaurants = await searchGurunavi(location, options);
    if (restaurants.length > 0) return restaurants;
  }

  // Try Hot Pepper as fallback
  if (HOTPEPPER_API_KEY) {
    return searchHotPepper(location, options);
  }

  // Return curated list as fallback
  return getCuratedRestaurants(typeof location === "string" ? location : "tokyo");
}

/**
 * Search Gurunavi API
 */
async function searchGurunavi(
  location: string | { lat: number; lng: number },
  options?: {
    category?: string;
    budget?: { min?: number; max?: number };
    limit?: number;
  }
): Promise<JapanRestaurant[]> {
  try {
    const params = new URLSearchParams({
      keyid: GURUNAVI_API_KEY,
      hit_per_page: (options?.limit || 20).toString(),
    });

    if (typeof location === "string") {
      params.set("freeword", location);
    } else {
      params.set("latitude", location.lat.toString());
      params.set("longitude", location.lng.toString());
      params.set("range", "3"); // 1km radius
    }

    if (options?.category) {
      params.set("category_l", options.category);
    }

    const response = await fetch(`${GURUNAVI_URL}?${params}`);
    if (!response.ok) return [];

    const data = await response.json();

    return (data.rest || []).map((r: Record<string, unknown>) => mapGurunaviRestaurant(r));
  } catch (error) {
    console.error("Gurunavi API error:", error);
    return [];
  }
}

/**
 * Search Hot Pepper API
 */
async function searchHotPepper(
  location: string | { lat: number; lng: number },
  options?: {
    category?: string;
    budget?: { min?: number; max?: number };
    limit?: number;
  }
): Promise<JapanRestaurant[]> {
  try {
    const params = new URLSearchParams({
      key: HOTPEPPER_API_KEY,
      format: "json",
      count: (options?.limit || 20).toString(),
    });

    if (typeof location === "string") {
      params.set("keyword", location);
    } else {
      params.set("lat", location.lat.toString());
      params.set("lng", location.lng.toString());
      params.set("range", "3");
    }

    const response = await fetch(`${HOTPEPPER_URL}?${params}`);
    if (!response.ok) return [];

    const data = await response.json();

    return (data.results?.shop || []).map((r: Record<string, unknown>) => mapHotPepperRestaurant(r));
  } catch (error) {
    console.error("Hot Pepper API error:", error);
    return [];
  }
}

// ============================================
// SAKURA FORECAST
// ============================================

/**
 * Get sakura (cherry blossom) forecasts
 */
export function getSakuraForecast(options?: {
  region?: string;
  city?: string;
}): SakuraForecast[] {
  let forecasts = [...SAKURA_FORECASTS_2025];

  if (options?.region) {
    forecasts = forecasts.filter(f =>
      f.region.toLowerCase() === options.region!.toLowerCase()
    );
  }

  if (options?.city) {
    forecasts = forecasts.filter(f =>
      f.city.toLowerCase().includes(options.city!.toLowerCase())
    );
  }

  return forecasts;
}

/**
 * Check if sakura will be visible during trip dates
 */
export function checkSakuraDuringTrip(
  tripStart: string,
  tripEnd: string,
  city?: string
): {
  willSeeSakura: boolean;
  bestSpots: SakuraForecast[];
  recommendation: string;
} {
  const start = new Date(tripStart);
  const end = new Date(tripEnd);

  const relevantForecasts = city
    ? getSakuraForecast({ city })
    : SAKURA_FORECASTS_2025;

  const visibleSpots = relevantForecasts.filter(forecast => {
    const bloom = new Date(forecast.bloomDate);
    const fullBloom = new Date(forecast.fullBloomDate);
    const petalsEnd = forecast.petalFallDate
      ? new Date(forecast.petalFallDate)
      : new Date(fullBloom.getTime() + 7 * 24 * 60 * 60 * 1000);

    return start <= petalsEnd && end >= bloom;
  });

  const peakSpots = visibleSpots.filter(forecast => {
    const fullBloom = new Date(forecast.fullBloomDate);
    return start <= fullBloom && end >= fullBloom;
  });

  let recommendation = "";
  if (peakSpots.length > 0) {
    recommendation = `🌸 Perfect timing! You'll catch peak bloom at ${peakSpots.map(s => s.spot).join(", ")}.`;
  } else if (visibleSpots.length > 0) {
    recommendation = `🌸 You'll see cherry blossoms, though not at peak. Best spots: ${visibleSpots.map(s => s.spot).join(", ")}.`;
  } else {
    recommendation = "Cherry blossom season doesn't overlap with your trip dates. Consider late March to early May for sakura.";
  }

  return {
    willSeeSakura: visibleSpots.length > 0,
    bestSpots: peakSpots.length > 0 ? peakSpots : visibleSpots,
    recommendation,
  };
}

// ============================================
// JR PASS RECOMMENDATIONS
// ============================================

/**
 * Get JR Pass recommendations based on itinerary
 */
export function getJRPassRecommendation(
  cities: string[],
  tripDays: number
): {
  recommended: JRPass | null;
  savings: number;
  alternatives: JRPass[];
  explanation: string;
} {
  const tripDetails = { cities, days: tripDays };

  // Check which passes are worth it
  const worthyPasses = JR_PASSES.filter(pass => pass.worthIt(tripDetails));

  if (worthyPasses.length === 0) {
    return {
      recommended: null,
      savings: 0,
      alternatives: [],
      explanation: "Based on your itinerary, individual tickets may be more cost-effective than a JR Pass.",
    };
  }

  // Sort by value (nationwide > regional, longer duration if trip is long)
  const sorted = worthyPasses.sort((a, b) => {
    if (a.type !== b.type) return a.type === "nationwide" ? -1 : 1;
    return a.duration - b.duration;
  });

  const recommended = sorted[0];

  // Estimate savings (rough calculation)
  const estimatedRegularCost = estimateTrainCost(cities);
  const savings = Math.max(0, estimatedRegularCost - recommended.price.ordinary);

  return {
    recommended,
    savings,
    alternatives: sorted.slice(1),
    explanation: `The ${recommended.name} (¥${recommended.price.ordinary.toLocaleString()}) is recommended. Estimated savings: ¥${savings.toLocaleString()}.`,
  };
}

/**
 * Estimate train costs between cities (rough calculation)
 */
function estimateTrainCost(cities: string[]): number {
  const routeCosts: Record<string, number> = {
    "tokyo-kyoto": 13320,
    "tokyo-osaka": 13870,
    "tokyo-hiroshima": 18380,
    "tokyo-fukuoka": 22220,
    "kyoto-osaka": 560,
    "kyoto-nara": 720,
    "osaka-nara": 800,
    "osaka-hiroshima": 10430,
    "osaka-fukuoka": 15310,
  };

  let total = 0;
  for (let i = 0; i < cities.length - 1; i++) {
    const route = `${cities[i].toLowerCase()}-${cities[i + 1].toLowerCase()}`;
    const reverseRoute = `${cities[i + 1].toLowerCase()}-${cities[i].toLowerCase()}`;
    total += routeCosts[route] || routeCosts[reverseRoute] || 5000;
  }

  return total;
}

// ============================================
// CONVENIENCE SERVICES
// ============================================

/**
 * Get Japan travel essentials checklist
 */
export function getJapanTravelChecklist(): Array<{
  item: string;
  priority: "essential" | "recommended" | "optional";
  where: string;
  tip: string;
}> {
  return [
    {
      item: "IC Card (Suica/Pasmo)",
      priority: "essential",
      where: "Airport or major train stations",
      tip: "Works on trains, buses, convenience stores, and vending machines",
    },
    {
      item: "Pocket WiFi / SIM Card",
      priority: "essential",
      where: "Airport pickup counters or pre-order online",
      tip: "Japan Travel SIM, Sakura Mobile, or rent pocket WiFi (200-500¥/day)",
    },
    {
      item: "Cash (Yen)",
      priority: "essential",
      where: "Airport exchange or 7-Eleven ATM",
      tip: "Japan is still cash-heavy. Carry ¥10,000-20,000 for daily expenses",
    },
    {
      item: "JR Pass (if applicable)",
      priority: "recommended",
      where: "Must purchase before arrival, exchange at JR counter",
      tip: "Only worth it for long-distance travel between multiple cities",
    },
    {
      item: "Translation App",
      priority: "recommended",
      where: "Download before trip",
      tip: "Google Translate with offline Japanese + camera translation",
    },
    {
      item: "Coin Locker Coins",
      priority: "optional",
      where: "Keep ¥100 coins handy",
      tip: "Most lockers accept IC cards now, but coins are backup",
    },
    {
      item: "Tax-Free Passport",
      priority: "optional",
      where: "Just use your passport at stores with Tax-Free signs",
      tip: "Save 10% on purchases over ¥5,000 at participating stores",
    },
  ];
}

/**
 * Get etiquette tips for Japan
 */
export function getJapanEtiquetteTips(): Array<{
  situation: string;
  do: string;
  dont: string;
  tip: string;
}> {
  return [
    {
      situation: "Trains",
      do: "Stand in line at platform markings, let people exit first",
      dont: "Talk on phone, eat, or block doors",
      tip: "Priority seats are for elderly, pregnant, disabled - give up if needed",
    },
    {
      situation: "Temples & Shrines",
      do: "Bow slightly at torii gates, wash hands at temizuya",
      dont: "Step on thresholds, point at sacred objects",
      tip: "At shrines: bow twice, clap twice, bow once. At temples: just bow.",
    },
    {
      situation: "Restaurants",
      do: "Say 'itadakimasu' before eating, 'gochisousama' after",
      dont: "Tip (it's not done), stick chopsticks upright in rice",
      tip: "Slurping noodles is not just OK, it's expected!",
    },
    {
      situation: "Onsen (Hot Springs)",
      do: "Wash thoroughly before entering, enter naked",
      dont: "Bring towel into water, have visible tattoos (many ban)",
      tip: "Small towel can go on head while bathing. Some onsen are tattoo-friendly.",
    },
    {
      situation: "Walking",
      do: "Walk on the left side (Tokyo) or right (Osaka)",
      dont: "Eat while walking, smoke outside designated areas",
      tip: "Exception: Convenience store parking lots are OK for quick snacks",
    },
    {
      situation: "Business Cards",
      do: "Receive with both hands, study it briefly, place carefully",
      dont: "Write on it, put in back pocket",
      tip: "Not common for tourists, but useful to know for business travelers",
    },
  ];
}

/**
 * Get useful Japanese phrases for travelers
 */
export function getTravelerPhrases(): Array<{
  english: string;
  japanese: string;
  romaji: string;
  situation: string;
}> {
  return [
    { english: "Thank you", japanese: "ありがとうございます", romaji: "Arigatou gozaimasu", situation: "Everywhere" },
    { english: "Excuse me / Sorry", japanese: "すみません", romaji: "Sumimasen", situation: "Getting attention, apologizing" },
    { english: "I don't understand", japanese: "わかりません", romaji: "Wakarimasen", situation: "When confused" },
    { english: "Do you speak English?", japanese: "英語を話せますか？", romaji: "Eigo wo hanasemasu ka?", situation: "Seeking help" },
    { english: "Where is...?", japanese: "...はどこですか？", romaji: "...wa doko desu ka?", situation: "Directions" },
    { english: "How much?", japanese: "いくらですか？", romaji: "Ikura desu ka?", situation: "Shopping" },
    { english: "This please", japanese: "これください", romaji: "Kore kudasai", situation: "Ordering/Shopping" },
    { english: "Check please", japanese: "お会計お願いします", romaji: "Okaikei onegaishimasu", situation: "Restaurants" },
    { english: "Delicious!", japanese: "おいしい！", romaji: "Oishii!", situation: "Complimenting food" },
    { english: "Help!", japanese: "助けて！", romaji: "Tasukete!", situation: "Emergency" },
    { english: "I have an allergy", japanese: "アレルギーがあります", romaji: "Arerugii ga arimasu", situation: "Restaurants" },
    { english: "No [ingredient] please", japanese: "[材料]抜きでお願いします", romaji: "[zairyou] nuki de onegaishimasu", situation: "Dietary restrictions" },
  ];
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function mapGurunaviRestaurant(r: Record<string, unknown>): JapanRestaurant {
  const restaurant = r as {
    id: string;
    name: string;
    name_kana?: string;
    category: string;
    address: string;
    access?: { station?: string; walk?: string };
    tel?: string;
    budget?: string;
    opentime?: string;
    holiday?: string;
    image_url?: { shop_image1?: string };
    url?: string;
    latitude?: string;
    longitude?: string;
  };

  return {
    id: restaurant.id,
    name: restaurant.name,
    nameKana: restaurant.name_kana,
    category: restaurant.category || "Japanese",
    address: restaurant.address,
    station: restaurant.access?.station,
    walkingMinutes: restaurant.access?.walk ? parseInt(restaurant.access.walk) : undefined,
    phone: restaurant.tel,
    budget: { dinner: restaurant.budget },
    openingHours: restaurant.opentime,
    holidays: restaurant.holiday,
    images: restaurant.image_url?.shop_image1 ? [restaurant.image_url.shop_image1] : undefined,
    url: restaurant.url,
    location: restaurant.latitude && restaurant.longitude
      ? { lat: parseFloat(restaurant.latitude), lng: parseFloat(restaurant.longitude) }
      : undefined,
  };
}

function mapHotPepperRestaurant(r: Record<string, unknown>): JapanRestaurant {
  const restaurant = r as {
    id: string;
    name: string;
    genre?: { name: string };
    address: string;
    station_name?: string;
    mobile_access?: string;
    budget?: { name: string; average: string };
    open?: string;
    close?: string;
    non_smoking?: string;
    card?: string;
    english?: string;
    photo?: { pc?: { l?: string } };
    urls?: { pc?: string };
    lat?: number;
    lng?: number;
  };

  return {
    id: restaurant.id,
    name: restaurant.name,
    category: restaurant.genre?.name || "Japanese",
    address: restaurant.address,
    station: restaurant.station_name,
    budget: {
      dinner: restaurant.budget?.name,
      average: restaurant.budget?.average ? parseInt(restaurant.budget.average) : undefined,
    },
    openingHours: restaurant.open,
    smoking: restaurant.non_smoking === "全面禁煙" ? "no_smoking" : "unknown",
    cardAccepted: restaurant.card === "利用可",
    englishMenu: restaurant.english === "あり",
    images: restaurant.photo?.pc?.l ? [restaurant.photo.pc.l] : undefined,
    url: restaurant.urls?.pc,
    location: restaurant.lat && restaurant.lng
      ? { lat: restaurant.lat, lng: restaurant.lng }
      : undefined,
  };
}

function getCuratedRestaurants(area: string): JapanRestaurant[] {
  const curated: Record<string, JapanRestaurant[]> = {
    tokyo: [
      {
        id: "curated_1",
        name: "Ichiran Shibuya",
        category: "Ramen",
        address: "Shibuya, Tokyo",
        station: "Shibuya",
        walkingMinutes: 3,
        budget: { average: 1000 },
        rating: { tabelog: 3.52 },
        englishMenu: true,
        features: ["Solo dining booths", "24 hours", "Customizable ramen"],
      },
      {
        id: "curated_2",
        name: "Tsukiji Sushidai",
        category: "Sushi",
        address: "Toyosu Market, Tokyo",
        station: "Shijo-mae",
        walkingMinutes: 5,
        budget: { average: 4000 },
        rating: { tabelog: 3.95 },
        reservationRequired: true,
        features: ["Omakase", "Fresh from market"],
      },
    ],
    kyoto: [
      {
        id: "curated_3",
        name: "Nishiki Market",
        category: "Market/Street Food",
        address: "Nakagyo-ku, Kyoto",
        station: "Karasuma",
        walkingMinutes: 5,
        budget: { average: 2000 },
        features: ["Food stalls", "Local specialties", "Matcha sweets"],
      },
    ],
  };

  return curated[area.toLowerCase()] || [];
}

// ============================================
// EXPORTS
// ============================================

export default {
  searchJapanRestaurants,
  getSakuraForecast,
  checkSakuraDuringTrip,
  getJRPassRecommendation,
  getJapanTravelChecklist,
  getJapanEtiquetteTips,
  getTravelerPhrases,
  isJapanServicesConfigured,
  MAJOR_STATIONS,
  JR_PASSES,
};
