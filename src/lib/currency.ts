/**
 * Currency & Exchange Rate Integration
 *
 * Features:
 * - Real-time exchange rates
 * - Currency conversion
 * - Tipping norms by country
 * - Cash vs card recommendations
 *
 * Providers (in priority order):
 * 1. Open Exchange Rates - Paid (1000 req/month free)
 * 2. ExchangeRate-API - Free tier (1500 req/month)
 * 3. Fixer.io - Paid backup
 * 4. Frankfurter API - Free, open source (ECB data)
 * 5. Offline rates - Static fallback data
 *
 * API Docs:
 * - Open Exchange Rates: https://docs.openexchangerates.org/
 * - ExchangeRate-API: https://www.exchangerate-api.com/docs
 * - Frankfurter: https://www.frankfurter.app/docs/
 * - Fixer: https://fixer.io/documentation
 */

import { getOrFetch, cacheKey, CACHE_TTL, CACHE_NS, setCache, getCache } from "./cache";

// API Configuration
const EXCHANGE_RATES_API_KEY = process.env.EXCHANGE_RATES_API_KEY || "";
const FIXER_API_KEY = process.env.FIXER_API_KEY || "";

// API URLs
const OPEN_EXCHANGE_RATES_URL = "https://openexchangerates.org/api";
const EXCHANGERATE_API_URL = "https://v6.exchangerate-api.com/v6";
const FRANKFURTER_URL = "https://api.frankfurter.app"; // Free, no key required
const FIXER_URL = "http://data.fixer.io/api";

// ============================================
// TYPES
// ============================================

export interface ExchangeRate {
  base: string;
  target: string;
  rate: number;
  lastUpdated: string;
  source: string;
}

export interface CurrencyConversion {
  fromCurrency: string;
  toCurrency: string;
  fromAmount: number;
  toAmount: number;
  rate: number;
  lastUpdated: string;
}

export interface CurrencyInfo {
  code: string;
  name: string;
  symbol: string;
  decimalPlaces: number;
  countries: string[];
}

export interface TippingNorm {
  country: string;
  countryCode: string;
  currency: string;
  restaurants: TipGuideline;
  hotels: TipGuideline;
  taxis: TipGuideline;
  tourGuides: TipGuideline;
  other: OtherTipping[];
  notes: string[];
}

export interface TipGuideline {
  expected: boolean;
  amount: string;
  notes?: string;
}

export interface OtherTipping {
  service: string;
  amount: string;
  notes?: string;
}

export interface CashRecommendation {
  country: string;
  cardAcceptance: "widespread" | "common" | "limited" | "rare";
  cashRecommended: boolean;
  typicalDailyNeed: string;
  atmAvailability: "abundant" | "common" | "limited";
  atmTips: string[];
  exchangeTips: string[];
  notes: string[];
}

// ============================================
// CURRENCY DATA
// ============================================

const CURRENCIES: Record<string, CurrencyInfo> = {
  USD: { code: "USD", name: "US Dollar", symbol: "$", decimalPlaces: 2, countries: ["US"] },
  EUR: { code: "EUR", name: "Euro", symbol: "€", decimalPlaces: 2, countries: ["FR", "DE", "IT", "ES", "NL"] },
  GBP: { code: "GBP", name: "British Pound", symbol: "£", decimalPlaces: 2, countries: ["GB"] },
  JPY: { code: "JPY", name: "Japanese Yen", symbol: "¥", decimalPlaces: 0, countries: ["JP"] },
  CNY: { code: "CNY", name: "Chinese Yuan", symbol: "¥", decimalPlaces: 2, countries: ["CN"] },
  KRW: { code: "KRW", name: "South Korean Won", symbol: "₩", decimalPlaces: 0, countries: ["KR"] },
  THB: { code: "THB", name: "Thai Baht", symbol: "฿", decimalPlaces: 2, countries: ["TH"] },
  SGD: { code: "SGD", name: "Singapore Dollar", symbol: "S$", decimalPlaces: 2, countries: ["SG"] },
  AUD: { code: "AUD", name: "Australian Dollar", symbol: "A$", decimalPlaces: 2, countries: ["AU"] },
  CAD: { code: "CAD", name: "Canadian Dollar", symbol: "C$", decimalPlaces: 2, countries: ["CA"] },
  CHF: { code: "CHF", name: "Swiss Franc", symbol: "CHF", decimalPlaces: 2, countries: ["CH"] },
  MXN: { code: "MXN", name: "Mexican Peso", symbol: "$", decimalPlaces: 2, countries: ["MX"] },
  INR: { code: "INR", name: "Indian Rupee", symbol: "₹", decimalPlaces: 2, countries: ["IN"] },
  VND: { code: "VND", name: "Vietnamese Dong", symbol: "₫", decimalPlaces: 0, countries: ["VN"] },
  IDR: { code: "IDR", name: "Indonesian Rupiah", symbol: "Rp", decimalPlaces: 0, countries: ["ID"] },
  MYR: { code: "MYR", name: "Malaysian Ringgit", symbol: "RM", decimalPlaces: 2, countries: ["MY"] },
  PHP: { code: "PHP", name: "Philippine Peso", symbol: "₱", decimalPlaces: 2, countries: ["PH"] },
  TWD: { code: "TWD", name: "New Taiwan Dollar", symbol: "NT$", decimalPlaces: 0, countries: ["TW"] },
  HKD: { code: "HKD", name: "Hong Kong Dollar", symbol: "HK$", decimalPlaces: 2, countries: ["HK"] },
  NZD: { code: "NZD", name: "New Zealand Dollar", symbol: "NZ$", decimalPlaces: 2, countries: ["NZ"] },
};

// Fallback exchange rates (approximate, used when API unavailable)
const FALLBACK_RATES: Record<string, number> = {
  EUR: 0.92,
  GBP: 0.79,
  JPY: 149.0,
  CNY: 7.24,
  KRW: 1320.0,
  THB: 35.0,
  SGD: 1.34,
  AUD: 1.53,
  CAD: 1.36,
  CHF: 0.88,
  MXN: 17.2,
  INR: 83.0,
  VND: 24500.0,
  IDR: 15700.0,
  MYR: 4.72,
  PHP: 56.0,
  TWD: 31.5,
  HKD: 7.82,
  NZD: 1.63,
};

// ============================================
// TIPPING DATA
// ============================================

const TIPPING_NORMS: Record<string, TippingNorm> = {
  JP: {
    country: "Japan",
    countryCode: "JP",
    currency: "JPY",
    restaurants: {
      expected: false,
      amount: "Not expected",
      notes: "Tipping can be seen as rude or confusing",
    },
    hotels: {
      expected: false,
      amount: "Not expected",
      notes: "Leave room as you found it as a courtesy",
    },
    taxis: {
      expected: false,
      amount: "Not expected",
      notes: "Drivers may refuse tips",
    },
    tourGuides: {
      expected: false,
      amount: "Not expected",
      notes: "A small gift is more appropriate if desired",
    },
    other: [],
    notes: [
      "Tipping is not part of Japanese culture",
      "Excellent service is considered standard",
      "If you must tip, use an envelope and present with both hands",
    ],
  },
  US: {
    country: "United States",
    countryCode: "US",
    currency: "USD",
    restaurants: {
      expected: true,
      amount: "15-20% of bill",
      notes: "20% for good service, 15% for average",
    },
    hotels: {
      expected: true,
      amount: "$2-5 per night housekeeping, $1-2 per bag bellhop",
    },
    taxis: {
      expected: true,
      amount: "15-20% of fare",
    },
    tourGuides: {
      expected: true,
      amount: "$10-20 per day for guides, $5-10 for drivers",
    },
    other: [
      { service: "Bartenders", amount: "$1-2 per drink or 15-20% of tab" },
      { service: "Valets", amount: "$2-5 when car is returned" },
      { service: "Hair/Spa", amount: "15-20% of service" },
    ],
    notes: [
      "Tips are a significant part of service workers' income",
      "Not tipping is considered very rude",
      "Some restaurants add automatic gratuity for large groups",
    ],
  },
  FR: {
    country: "France",
    countryCode: "FR",
    currency: "EUR",
    restaurants: {
      expected: false,
      amount: "Service included, round up for good service",
      notes: "Service compris means tip is included in prices",
    },
    hotels: {
      expected: false,
      amount: "€1-2 per bag for bellhop, €1-2/day housekeeping optional",
    },
    taxis: {
      expected: false,
      amount: "Round up to nearest euro",
    },
    tourGuides: {
      expected: true,
      amount: "€5-10 for half day, €10-20 for full day",
    },
    other: [],
    notes: [
      "Service charge is included by law",
      "Leaving small change is appreciated but not required",
      "Don't feel obligated to tip like in the US",
    ],
  },
  TH: {
    country: "Thailand",
    countryCode: "TH",
    currency: "THB",
    restaurants: {
      expected: false,
      amount: "Round up or leave small change",
      notes: "Higher-end restaurants: 10% if service charge not included",
    },
    hotels: {
      expected: true,
      amount: "฿20-50 per bag, ฿20-50/day housekeeping",
    },
    taxis: {
      expected: false,
      amount: "Round up to nearest ฿10-20",
    },
    tourGuides: {
      expected: true,
      amount: "฿100-300 per day for guides",
    },
    other: [
      { service: "Massage/Spa", amount: "฿50-100 or 10% of service" },
    ],
    notes: [
      "Tipping is not traditionally Thai but has become common in tourist areas",
      "Small tips are appreciated but not expected",
      "Always tip in cash, not on card",
    ],
  },
  MX: {
    country: "Mexico",
    countryCode: "MX",
    currency: "MXN",
    restaurants: {
      expected: true,
      amount: "10-15% of bill",
      notes: "Check if service charge (propina) is already included",
    },
    hotels: {
      expected: true,
      amount: "MXN$20-50 per bag, MXN$20-50/day housekeeping",
    },
    taxis: {
      expected: false,
      amount: "Round up or tip MXN$10-20",
    },
    tourGuides: {
      expected: true,
      amount: "MXN$100-200 per day",
    },
    other: [
      { service: "Gas station attendants", amount: "MXN$10-20" },
      { service: "Grocery baggers", amount: "MXN$5-10" },
    ],
    notes: [
      "Tipping in US dollars is also accepted",
      "Many service workers depend on tips",
      "Check bills for included gratuity",
    ],
  },
};

// ============================================
// CASH RECOMMENDATIONS
// ============================================

const CASH_RECOMMENDATIONS: Record<string, CashRecommendation> = {
  JP: {
    country: "Japan",
    cardAcceptance: "limited",
    cashRecommended: true,
    typicalDailyNeed: "¥10,000-20,000",
    atmAvailability: "common",
    atmTips: [
      "7-Eleven and Japan Post ATMs accept foreign cards",
      "Many regular bank ATMs don't accept foreign cards",
      "ATMs often have operating hours (not 24/7)",
    ],
    exchangeTips: [
      "Airport exchange rates are competitive",
      "Major train stations have exchange counters",
      "Avoid hotel exchanges (poor rates)",
    ],
    notes: [
      "Japan remains a cash-heavy society",
      "Small shops, restaurants, and transit often cash-only",
      "IC cards (Suica/Pasmo) widely accepted for transit and convenience stores",
    ],
  },
  FR: {
    country: "France",
    cardAcceptance: "widespread",
    cashRecommended: false,
    typicalDailyNeed: "€50-100",
    atmAvailability: "abundant",
    atmTips: [
      "Look for ATMs with Visa/Mastercard logos",
      "Bank ATMs usually have lower fees than standalone",
      "Decline dynamic currency conversion at ATM",
    ],
    exchangeTips: [
      "Use ATMs rather than exchange offices",
      "Airport exchanges have poor rates",
      "Banks offer better rates than exchange bureaus",
    ],
    notes: [
      "Cards accepted almost everywhere",
      "Contactless payments common",
      "Some small markets may prefer cash",
    ],
  },
  TH: {
    country: "Thailand",
    cardAcceptance: "common",
    cashRecommended: true,
    typicalDailyNeed: "฿1,000-3,000",
    atmAvailability: "abundant",
    atmTips: [
      "Thai ATMs charge ฿220 fee per withdrawal",
      "Withdraw larger amounts to minimize fees",
      "Decline currency conversion at ATM",
    ],
    exchangeTips: [
      "SuperRich and similar exchanges offer best rates",
      "Avoid hotel and airport exchanges",
      "Bring clean, new USD bills for best exchange",
    ],
    notes: [
      "Street food and local markets are cash only",
      "Major establishments accept cards",
      "7-Elevens accept cards with minimum purchase",
    ],
  },
};

// ============================================
// CONFIGURATION CHECK
// ============================================

export function isCurrencyConfigured(): boolean {
  return !!(EXCHANGE_RATES_API_KEY || FIXER_API_KEY) || true; // Has fallback
}

// ============================================
// EXCHANGE RATE FUNCTIONS
// ============================================

/**
 * Get exchange rate between two currencies with caching
 */
export async function getExchangeRate(
  from: string,
  to: string
): Promise<ExchangeRate> {
  const key = cacheKey(CACHE_NS.CURRENCY, "rate", from, to);

  // Check cache first
  const cached = getCache<ExchangeRate>(key);
  if (cached) {
    return cached;
  }

  // Try providers in order
  let rate: ExchangeRate | null = null;

  // 1. Try Open Exchange Rates (paid)
  if (EXCHANGE_RATES_API_KEY && !rate) {
    rate = await fetchOpenExchangeRate(from, to);
  }

  // 2. Try Frankfurter (free, no key required)
  if (!rate) {
    rate = await fetchFrankfurterRate(from, to);
  }

  // 3. Try Fixer (paid backup)
  if (FIXER_API_KEY && !rate) {
    rate = await fetchFixerRate(from, to);
  }

  // 4. Fallback to offline rates
  if (!rate) {
    rate = getOfflineExchangeRate(from, to);
  }

  // Cache the result
  setCache(key, rate, { ttlMs: CACHE_TTL.EXCHANGE_RATES });

  return rate;
}

/**
 * Fetch rate from Open Exchange Rates API
 */
async function fetchOpenExchangeRate(
  from: string,
  to: string
): Promise<ExchangeRate | null> {
  try {
    const response = await fetch(
      `${OPEN_EXCHANGE_RATES_URL}/latest.json?app_id=${EXCHANGE_RATES_API_KEY}&base=USD`
    );

    if (!response.ok) return null;

    const data = await response.json();
    const fromRate = from === "USD" ? 1 : data.rates[from];
    const toRate = to === "USD" ? 1 : data.rates[to];

    if (!fromRate || !toRate) return null;

    return {
      base: from,
      target: to,
      rate: toRate / fromRate,
      lastUpdated: new Date().toISOString(),
      source: "Open Exchange Rates",
    };
  } catch {
    return null;
  }
}

/**
 * Fetch rate from Frankfurter API (free, European Central Bank data)
 * https://www.frankfurter.app/docs/
 */
async function fetchFrankfurterRate(
  from: string,
  to: string
): Promise<ExchangeRate | null> {
  try {
    const response = await fetch(
      `${FRANKFURTER_URL}/latest?from=${from}&to=${to}`
    );

    if (!response.ok) return null;

    const data = await response.json();

    if (!data.rates || !data.rates[to]) return null;

    return {
      base: from,
      target: to,
      rate: data.rates[to],
      lastUpdated: data.date,
      source: "Frankfurter (ECB)",
    };
  } catch {
    return null;
  }
}

/**
 * Fetch rate from Fixer API
 */
async function fetchFixerRate(
  from: string,
  to: string
): Promise<ExchangeRate | null> {
  try {
    // Fixer free tier only supports EUR as base
    const response = await fetch(
      `${FIXER_URL}/latest?access_key=${FIXER_API_KEY}&base=EUR&symbols=${from},${to}`
    );

    if (!response.ok) return null;

    const data = await response.json();

    if (!data.success || !data.rates) return null;

    const fromRate = from === "EUR" ? 1 : data.rates[from];
    const toRate = to === "EUR" ? 1 : data.rates[to];

    if (!fromRate || !toRate) return null;

    return {
      base: from,
      target: to,
      rate: toRate / fromRate,
      lastUpdated: data.date,
      source: "Fixer.io",
    };
  } catch {
    return null;
  }
}

/**
 * Get offline exchange rate
 */
function getOfflineExchangeRate(from: string, to: string): ExchangeRate {
  // Convert via USD
  const fromUSD = from === "USD" ? 1 : 1 / (FALLBACK_RATES[from] || 1);
  const toUSD = to === "USD" ? 1 : FALLBACK_RATES[to] || 1;
  const rate = fromUSD * toUSD;

  return {
    base: from,
    target: to,
    rate,
    lastUpdated: "Offline rates (may be outdated)",
    source: "Cached",
  };
}

/**
 * Convert currency amount
 */
export async function convertCurrency(
  amount: number,
  from: string,
  to: string
): Promise<CurrencyConversion> {
  const exchangeRate = await getExchangeRate(from, to);

  const toAmount = amount * exchangeRate.rate;
  const currency = CURRENCIES[to];
  const roundedAmount = currency
    ? Math.round(toAmount * Math.pow(10, currency.decimalPlaces)) /
      Math.pow(10, currency.decimalPlaces)
    : Math.round(toAmount * 100) / 100;

  return {
    fromCurrency: from,
    toCurrency: to,
    fromAmount: amount,
    toAmount: roundedAmount,
    rate: exchangeRate.rate,
    lastUpdated: exchangeRate.lastUpdated,
  };
}

/**
 * Format currency for display
 */
export function formatCurrency(
  amount: number,
  currencyCode: string,
  options?: {
    showSymbol?: boolean;
    showCode?: boolean;
    locale?: string;
  }
): string {
  const currency = CURRENCIES[currencyCode];
  const decimalPlaces = currency?.decimalPlaces ?? 2;
  const symbol = currency?.symbol || currencyCode;

  const formattedNumber = amount.toLocaleString(options?.locale || "en-US", {
    minimumFractionDigits: decimalPlaces,
    maximumFractionDigits: decimalPlaces,
  });

  if (options?.showCode) {
    return `${formattedNumber} ${currencyCode}`;
  }
  if (options?.showSymbol !== false) {
    return `${symbol}${formattedNumber}`;
  }
  return formattedNumber;
}

// ============================================
// CURRENCY INFO FUNCTIONS
// ============================================

/**
 * Get currency for a country
 */
export function getCountryCurrency(countryCode: string): CurrencyInfo | null {
  for (const [, currency] of Object.entries(CURRENCIES)) {
    if (currency.countries.includes(countryCode.toUpperCase())) {
      return currency;
    }
  }
  return null;
}

/**
 * Get currency info
 */
export function getCurrencyInfo(currencyCode: string): CurrencyInfo | null {
  return CURRENCIES[currencyCode.toUpperCase()] || null;
}

// ============================================
// TIPPING FUNCTIONS
// ============================================

/**
 * Get tipping norms for a country
 */
export function getTippingNorms(countryCode: string): TippingNorm | null {
  return TIPPING_NORMS[countryCode.toUpperCase()] || null;
}

/**
 * Calculate tip amount
 */
export function calculateTip(
  billAmount: number,
  countryCode: string,
  serviceType: "restaurants" | "hotels" | "taxis" | "tourGuides",
  serviceLevel: "poor" | "average" | "good" | "excellent" = "good"
): {
  tipAmount: number;
  tipPercentage: number;
  isExpected: boolean;
  notes: string;
} {
  const norms = getTippingNorms(countryCode);

  if (!norms || !norms[serviceType]?.expected) {
    return {
      tipAmount: 0,
      tipPercentage: 0,
      isExpected: false,
      notes: norms?.[serviceType]?.notes || "Tipping not customary",
    };
  }

  // Parse percentage from amount string
  const amountStr = norms[serviceType].amount;
  const percentMatch = amountStr.match(/(\d+)-?(\d+)?%/);

  if (percentMatch) {
    const minPercent = parseInt(percentMatch[1]);
    const maxPercent = percentMatch[2] ? parseInt(percentMatch[2]) : minPercent;

    let percentage: number;
    switch (serviceLevel) {
      case "poor":
        percentage = minPercent;
        break;
      case "average":
        percentage = minPercent;
        break;
      case "good":
        percentage = (minPercent + maxPercent) / 2;
        break;
      case "excellent":
        percentage = maxPercent;
        break;
    }

    return {
      tipAmount: Math.round(billAmount * (percentage / 100) * 100) / 100,
      tipPercentage: percentage,
      isExpected: true,
      notes: norms[serviceType].notes || amountStr,
    };
  }

  return {
    tipAmount: 0,
    tipPercentage: 0,
    isExpected: true,
    notes: amountStr,
  };
}

// ============================================
// CASH RECOMMENDATION FUNCTIONS
// ============================================

/**
 * Get cash recommendations for a country
 */
export function getCashRecommendation(countryCode: string): CashRecommendation | null {
  return CASH_RECOMMENDATIONS[countryCode.toUpperCase()] || null;
}

/**
 * Get payment tips for a country
 */
export function getPaymentTips(countryCode: string): string[] {
  const rec = getCashRecommendation(countryCode);
  if (!rec) {
    return [
      "Research card acceptance before traveling",
      "Carry some local currency for emergencies",
      "Notify your bank of travel plans",
    ];
  }

  const tips: string[] = [];

  if (rec.cashRecommended) {
    tips.push(`Cash is recommended. Typical daily need: ${rec.typicalDailyNeed}`);
  } else {
    tips.push("Cards are widely accepted");
  }

  tips.push(...rec.atmTips.slice(0, 2));
  tips.push(...rec.notes.slice(0, 2));

  return tips;
}

// ============================================
// QUICK CONVERSION
// ============================================

/**
 * Quick convert with common tourist amounts
 */
export async function getQuickConversions(
  from: string,
  to: string
): Promise<Array<{ amount: number; converted: string }>> {
  const amounts = [1, 5, 10, 20, 50, 100, 500, 1000];
  const conversions: Array<{ amount: number; converted: string }> = [];

  const rate = await getExchangeRate(from, to);

  for (const amount of amounts) {
    const converted = amount * rate.rate;
    conversions.push({
      amount,
      converted: formatCurrency(converted, to),
    });
  }

  return conversions;
}

export default {
  getExchangeRate,
  convertCurrency,
  formatCurrency,
  getCountryCurrency,
  getCurrencyInfo,
  getTippingNorms,
  calculateTip,
  getCashRecommendation,
  getPaymentTips,
  getQuickConversions,
  isCurrencyConfigured,
};
