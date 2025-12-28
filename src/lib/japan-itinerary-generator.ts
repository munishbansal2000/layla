// ============================================
// Japan Itinerary Generator
// Generates structured itineraries from locally curated Japan POI data
// This is a development service - in production, swap with real API calls
// ============================================

import {
  loadCityData,
  getPaidExperiences,
  getPOIsForTimeSlot,
  calculateDistance,
  estimateTravelTime,
  poiToActivityOption,
  restaurantToActivityOption,
  klookToActivityOption,
  type MustSeePOI,
} from "./japan-data-service";

import type {
  StructuredItineraryData,
  DayWithOptions,
  SlotWithOptions,
  ActivityOption,
  StructuredCommuteInfo,
  CityTransitionInfo,
  AccommodationInfo,
} from "@/types/structured-itinerary";

// ============================================
// Types
// ============================================

export interface JapanItineraryRequest {
  cities: string[];
  startDate: string;
  daysPerCity?: Record<string, number>;
  totalDays?: number;
  pace?: "relaxed" | "moderate" | "packed";
  interests?: string[];
  includeKlookExperiences?: boolean;
}

interface SlotConfig {
  slotType: SlotWithOptions["slotType"];
  timeRange: { start: string; end: string };
  isMeal: boolean;
}

// ============================================
// Slot Configuration
// ============================================

const SLOT_CONFIGS: Record<string, SlotConfig[]> = {
  relaxed: [
    { slotType: "morning", timeRange: { start: "10:00", end: "12:30" }, isMeal: false },
    { slotType: "lunch", timeRange: { start: "12:30", end: "14:00" }, isMeal: true },
    { slotType: "afternoon", timeRange: { start: "14:30", end: "17:30" }, isMeal: false },
    { slotType: "dinner", timeRange: { start: "18:30", end: "20:30" }, isMeal: true },
  ],
  moderate: [
    { slotType: "morning", timeRange: { start: "09:00", end: "12:00" }, isMeal: false },
    { slotType: "lunch", timeRange: { start: "12:00", end: "13:30" }, isMeal: true },
    { slotType: "afternoon", timeRange: { start: "14:00", end: "18:00" }, isMeal: false },
    { slotType: "dinner", timeRange: { start: "19:00", end: "21:00" }, isMeal: true },
    { slotType: "evening", timeRange: { start: "21:00", end: "23:00" }, isMeal: false },
  ],
  packed: [
    { slotType: "morning", timeRange: { start: "08:00", end: "11:00" }, isMeal: false },
    { slotType: "lunch", timeRange: { start: "11:30", end: "12:30" }, isMeal: true },
    { slotType: "afternoon", timeRange: { start: "13:00", end: "17:00" }, isMeal: false },
    { slotType: "dinner", timeRange: { start: "17:30", end: "19:00" }, isMeal: true },
    { slotType: "evening", timeRange: { start: "19:30", end: "22:30" }, isMeal: false },
  ],
};

// ============================================
// City Transition Templates (Shinkansen, etc.)
// ============================================

const CITY_TRANSITIONS: Record<string, Record<string, CityTransitionInfo>> = {
  tokyo: {
    kyoto: {
      from: "Tokyo",
      to: "Kyoto",
      method: "shinkansen",
      duration: 135,
      departureTime: "08:00",
      arrivalTime: "10:15",
      trainName: "Nozomi Shinkansen",
      estimatedCost: { amount: 13320, currency: "JPY" },
      departureStation: "Tokyo Station",
      arrivalStation: "Kyoto Station",
    },
    osaka: {
      from: "Tokyo",
      to: "Osaka",
      method: "shinkansen",
      duration: 150,
      departureTime: "08:00",
      arrivalTime: "10:30",
      trainName: "Nozomi Shinkansen",
      estimatedCost: { amount: 13870, currency: "JPY" },
      departureStation: "Tokyo Station",
      arrivalStation: "Shin-Osaka Station",
    },
    hiroshima: {
      from: "Tokyo",
      to: "Hiroshima",
      method: "shinkansen",
      duration: 240,
      departureTime: "08:00",
      arrivalTime: "12:00",
      trainName: "Nozomi Shinkansen",
      estimatedCost: { amount: 18380, currency: "JPY" },
      departureStation: "Tokyo Station",
      arrivalStation: "Hiroshima Station",
    },
  },
  kyoto: {
    osaka: {
      from: "Kyoto",
      to: "Osaka",
      method: "train",
      duration: 30,
      departureTime: "10:00",
      arrivalTime: "10:30",
      trainName: "JR Special Rapid",
      estimatedCost: { amount: 570, currency: "JPY" },
      departureStation: "Kyoto Station",
      arrivalStation: "Osaka Station",
    },
    nara: {
      from: "Kyoto",
      to: "Nara",
      method: "train",
      duration: 45,
      departureTime: "09:00",
      arrivalTime: "09:45",
      trainName: "JR Nara Line",
      estimatedCost: { amount: 720, currency: "JPY" },
      departureStation: "Kyoto Station",
      arrivalStation: "JR Nara Station",
    },
    hiroshima: {
      from: "Kyoto",
      to: "Hiroshima",
      method: "shinkansen",
      duration: 100,
      departureTime: "08:30",
      arrivalTime: "10:10",
      trainName: "Nozomi Shinkansen",
      estimatedCost: { amount: 10580, currency: "JPY" },
      departureStation: "Kyoto Station",
      arrivalStation: "Hiroshima Station",
    },
  },
  osaka: {
    kyoto: {
      from: "Osaka",
      to: "Kyoto",
      method: "train",
      duration: 30,
      departureTime: "10:00",
      arrivalTime: "10:30",
      trainName: "JR Special Rapid",
      estimatedCost: { amount: 570, currency: "JPY" },
      departureStation: "Osaka Station",
      arrivalStation: "Kyoto Station",
    },
    nara: {
      from: "Osaka",
      to: "Nara",
      method: "train",
      duration: 50,
      departureTime: "09:00",
      arrivalTime: "09:50",
      trainName: "Kintetsu Nara Line",
      estimatedCost: { amount: 680, currency: "JPY" },
      departureStation: "Namba Station",
      arrivalStation: "Kintetsu Nara Station",
    },
    hiroshima: {
      from: "Osaka",
      to: "Hiroshima",
      method: "shinkansen",
      duration: 90,
      departureTime: "08:30",
      arrivalTime: "10:00",
      trainName: "Nozomi Shinkansen",
      estimatedCost: { amount: 9890, currency: "JPY" },
      departureStation: "Shin-Osaka Station",
      arrivalStation: "Hiroshima Station",
    },
  },
};

// ============================================
// Default Accommodations
// ============================================

const DEFAULT_ACCOMMODATIONS: Record<string, AccommodationInfo> = {
  tokyo: {
    name: "Shibuya Excel Hotel Tokyu",
    address: "1-12-2 Dogenzaka, Shibuya City, Tokyo",
    neighborhood: "Shibuya",
    coordinates: { lat: 35.6594, lng: 139.6989 },
    checkIn: "15:00",
    checkOut: "11:00",
    type: "hotel",
    rating: 4.3,
  },
  kyoto: {
    name: "Hotel Granvia Kyoto",
    address: "Karasuma-dori Shiokoji-sagaru, Shimogyo-ku, Kyoto",
    neighborhood: "Kyoto Station",
    coordinates: { lat: 34.9853, lng: 135.7585 },
    checkIn: "15:00",
    checkOut: "11:00",
    type: "hotel",
    rating: 4.5,
  },
  osaka: {
    name: "Cross Hotel Osaka",
    address: "2-5-15 Shinsaibashisuji, Chuo-ku, Osaka",
    neighborhood: "Namba",
    coordinates: { lat: 34.6721, lng: 135.5014 },
    checkIn: "15:00",
    checkOut: "11:00",
    type: "hotel",
    rating: 4.4,
  },
  nara: {
    name: "Nara Hotel",
    address: "1096 Takabatake-cho, Nara",
    neighborhood: "Nara Park",
    coordinates: { lat: 34.6784, lng: 135.8405 },
    checkIn: "15:00",
    checkOut: "11:00",
    type: "hotel",
    rating: 4.4,
  },
  hiroshima: {
    name: "Sheraton Grand Hiroshima Hotel",
    address: "12-1 Wakakusacho, Higashi Ward, Hiroshima",
    neighborhood: "Hiroshima Station",
    coordinates: { lat: 34.3980, lng: 132.4755 },
    checkIn: "15:00",
    checkOut: "11:00",
    type: "hotel",
    rating: 4.4,
  },
  hakone: {
    name: "Hakone Kowakien Ten-yu",
    address: "1297 Ninotaira, Hakone, Ashigarashimo District",
    neighborhood: "Hakone",
    coordinates: { lat: 35.2336, lng: 139.0656 },
    checkIn: "15:00",
    checkOut: "11:00",
    type: "ryokan",
    rating: 4.6,
  },
};

// ============================================
// General Tips by City
// ============================================

const JAPAN_TIPS: string[] = [
  "Get a JR Pass for the Shinkansen and JR trains - saves money on Tokyo-Kyoto-Osaka route",
  "Get a Suica or ICOCA card for easy transit payments",
  "Download Google Maps offline for each city",
  "Most shops accept credit cards, but keep ¥10,000-20,000 cash for small vendors",
  "Temple visits are best in early morning to avoid crowds",
  "Many restaurants are cash-only, especially traditional ones",
  "Convenience stores (7-Eleven, Lawson, FamilyMart) have great food and ATMs",
  "Shoes off before entering traditional spaces - wear easy slip-on shoes",
  "Trash cans are rare - carry a small bag for your waste",
  "Tipping is not customary and can be considered rude",
];

// ============================================
// Itinerary Generation
// ============================================

/**
 * Generate a complete Japan itinerary from local data
 */
export async function generateJapanItinerary(
  request: JapanItineraryRequest
): Promise<StructuredItineraryData> {
  const {
    cities,
    startDate,
    daysPerCity,
    totalDays,
    pace = "moderate",
    // interests = [], // TODO: Use interests for activity prioritization
    includeKlookExperiences = true,
  } = request;

  // Calculate days per city
  const cityDays: Record<string, number> = daysPerCity || {};
  if (!daysPerCity && totalDays) {
    const daysEach = Math.floor(totalDays / cities.length);
    const remainder = totalDays % cities.length;
    cities.forEach((city, i) => {
      cityDays[city.toLowerCase()] = daysEach + (i < remainder ? 1 : 0);
    });
  }

  // Default to 2 days per city if not specified
  cities.forEach((city) => {
    if (!cityDays[city.toLowerCase()]) {
      cityDays[city.toLowerCase()] = 2;
    }
  });

  const allDays: DayWithOptions[] = [];
  let currentDate = new Date(startDate);
  let dayNumber = 1;
  const usedPOIs = new Set<string>();

  for (let cityIndex = 0; cityIndex < cities.length; cityIndex++) {
    const city = cities[cityIndex];
    const cityKey = city.toLowerCase();
    const numDays = cityDays[cityKey];
    const isFirstCity = cityIndex === 0;
    const previousCity = cityIndex > 0 ? cities[cityIndex - 1].toLowerCase() : null;

    // Load city data
    const cityData = await loadCityData(city);
    const klookActivities = includeKlookExperiences ? await getPaidExperiences(city, { limit: 20, minRating: 4.0 }) : [];

    for (let d = 0; d < numDays; d++) {
      const isTransitionDay = d === 0 && !isFirstCity && previousCity;
      const dateStr = currentDate.toISOString().split("T")[0];

      // Get city transition if this is the first day in a new city
      let cityTransition: CityTransitionInfo | undefined;
      if (isTransitionDay && previousCity) {
        cityTransition = CITY_TRANSITIONS[previousCity]?.[cityKey];
      }

      // Generate slots for this day
      const slotConfigs = SLOT_CONFIGS[pace];
      const slots: SlotWithOptions[] = [];

      // If transition day, add transit slot
      if (cityTransition) {
        slots.push({
          slotId: `day${dayNumber}-transit`,
          slotType: "morning",
          timeRange: {
            start: cityTransition.departureTime,
            end: cityTransition.arrivalTime,
          },
          options: [
            {
              id: `opt-${dayNumber}-transit`,
              rank: 1,
              score: 100,
              activity: {
                name: `${cityTransition.trainName} to ${cityTransition.to}`,
                description: `Travel from ${cityTransition.from} to ${cityTransition.to} via ${cityTransition.trainName}`,
                category: "transport",
                duration: cityTransition.duration,
                place: {
                  name: cityTransition.departureStation || "",
                  address: cityTransition.departureStation || "",
                  neighborhood: cityTransition.from,
                  coordinates: DEFAULT_ACCOMMODATIONS[previousCity!]?.coordinates || { lat: 0, lng: 0 },
                  rating: undefined,
                  reviewCount: undefined,
                },
                isFree: false,
                estimatedCost: cityTransition.estimatedCost,
                tags: ["transport", "shinkansen", "scenic"],
                source: "local-data",
              },
              matchReasons: ["Fastest way to travel", "Iconic Japanese experience"],
              tradeoffs: [],
            },
          ],
          selectedOptionId: `opt-${dayNumber}-transit`,
          behavior: "travel",
          rigidityScore: 1.0,
        });
      }

      // Generate activity/meal slots
      let previousCoordinates = DEFAULT_ACCOMMODATIONS[cityKey]?.coordinates;

      for (const slotConfig of slotConfigs) {
        // Skip morning slot if transition day (already has transit)
        if (isTransitionDay && cityTransition && slotConfig.slotType === "morning") {
          continue;
        }

        const slotId = `day${dayNumber}-${slotConfig.slotType}`;
        const options: ActivityOption[] = [];

        if (slotConfig.isMeal) {
          // Get restaurants
          const { restaurants } = await getPOIsForTimeSlot(city, slotConfig.slotType);
          const availableRestaurants = restaurants.filter((r) => !usedPOIs.has(r.id));

          for (let i = 0; i < Math.min(3, availableRestaurants.length); i++) {
            options.push(restaurantToActivityOption(availableRestaurants[i], i + 1));
          }
        } else {
          // Get attractions
          const { attractions } = await getPOIsForTimeSlot(city, slotConfig.slotType);
          const availableAttractions = attractions.filter((a) => !usedPOIs.has(a.id));

          // Add top attractions as options
          for (let i = 0; i < Math.min(2, availableAttractions.length); i++) {
            const poi = availableAttractions[i];
            options.push(poiToActivityOption(poi, i + 1));
            if (i === 0) usedPOIs.add(poi.id); // Mark first option as used
          }

          // Add a Klook experience as an alternative if available
          if (klookActivities.length > 0 && options.length < 3) {
            const unusedKlook = klookActivities.find((k) => !usedPOIs.has(k.id));
            if (unusedKlook) {
              options.push(klookToActivityOption(unusedKlook, options.length + 1));
            }
          }
        }

        // Calculate commute from previous activity
        let commuteFromPrevious: StructuredCommuteInfo | undefined;
        if (previousCoordinates && options.length > 0 && options[0].activity.place?.coordinates) {
          const coords = options[0].activity.place.coordinates;
          if (coords.lat !== 0 && coords.lng !== 0) {
            const distance = calculateDistance(previousCoordinates, coords);
            const method = distance > 2000 ? "transit" : "walk";
            const duration = estimateTravelTime(distance, method);

            commuteFromPrevious = {
              duration,
              distance: Math.round(distance),
              method,
              instructions: method === "walk"
                ? `Walk ${Math.round(distance / 100) / 10} km`
                : `Take transit (${Math.round(distance / 1000)} km)`,
            };

            previousCoordinates = coords;
          }
        }

        if (options.length > 0) {
          slots.push({
            slotId,
            slotType: slotConfig.slotType,
            timeRange: slotConfig.timeRange,
            options,
            selectedOptionId: null,
            commuteFromPrevious,
            behavior: slotConfig.isMeal ? "meal" : "flex",
            rigidityScore: slotConfig.isMeal ? 0.6 : 0.4,
          });
        }
      }

      // Create day title
      const dayTitle = generateDayTitle(cityData.mustSee.overall, usedPOIs, d + 1, numDays, !!cityTransition);

      allDays.push({
        dayNumber,
        date: dateStr,
        city: cityData.city,
        title: dayTitle,
        slots,
        cityTransition,
        accommodation: DEFAULT_ACCOMMODATIONS[cityKey],
      });

      currentDate.setDate(currentDate.getDate() + 1);
      dayNumber++;
    }
  }

  // Calculate estimated budget
  const estimatedBudget = calculateBudget(allDays);

  return {
    destination: "Japan",
    country: "Japan",
    days: allDays,
    generalTips: JAPAN_TIPS,
    estimatedBudget,
  };
}

/**
 * Generate a title for the day based on activities
 */
function generateDayTitle(
  mustSee: MustSeePOI[],
  usedPOIs: Set<string>,
  dayInCity: number,
  totalDaysInCity: number,
  isTransitionDay: boolean
): string {
  if (isTransitionDay) {
    return "Travel Day & Exploration";
  }

  if (dayInCity === 1 && totalDaysInCity > 1) {
    return "Arrival & First Impressions";
  }

  if (dayInCity === totalDaysInCity) {
    return "Final Exploration";
  }

  // Get neighborhoods from used POIs
  const neighborhoods = new Set<string>();
  for (const poi of mustSee) {
    if (usedPOIs.has(poi.id) && poi.neighborhood) {
      neighborhoods.add(poi.neighborhood);
    }
  }

  if (neighborhoods.size > 0) {
    const areas = Array.from(neighborhoods).slice(0, 2);
    return `Exploring ${areas.join(" & ")}`;
  }

  return `Day ${dayInCity} Discoveries`;
}

/**
 * Calculate estimated budget from itinerary
 */
function calculateBudget(days: DayWithOptions[]): StructuredItineraryData["estimatedBudget"] {
  let activitiesMin = 0;
  let activitiesMax = 0;
  let foodMin = 0;
  let foodMax = 0;
  let transportMin = 0;
  let transportMax = 0;

  for (const day of days) {
    // Add city transition costs
    if (day.cityTransition?.estimatedCost) {
      transportMin += day.cityTransition.estimatedCost.amount;
      transportMax += day.cityTransition.estimatedCost.amount;
    }

    for (const slot of day.slots) {
      const option = slot.options[0];
      if (!option) continue;

      const cost = option.activity.estimatedCost?.amount || 0;
      const isMeal = slot.slotType === "lunch" || slot.slotType === "dinner" || slot.slotType === "breakfast";

      if (option.activity.category === "transport") {
        transportMin += cost;
        transportMax += cost;
      } else if (isMeal) {
        foodMin += cost * 0.8;
        foodMax += cost * 1.5;
      } else {
        if (!option.activity.isFree) {
          activitiesMin += cost;
          activitiesMax += cost * 1.2;
        }
      }

      // Add commute costs
      if (slot.commuteFromPrevious?.cost) {
        transportMin += slot.commuteFromPrevious.cost.amount;
        transportMax += slot.commuteFromPrevious.cost.amount;
      }
    }
  }

  // Add daily transit estimate (IC card usage)
  const dailyTransit = 1000; // ~¥1000/day for local transit
  transportMin += days.length * dailyTransit * 0.8;
  transportMax += days.length * dailyTransit * 1.2;

  // Add accommodation estimate
  const accommodationPerNight = { min: 8000, max: 20000 };
  const nights = Math.max(0, days.length - 1);
  const accommodationMin = nights * accommodationPerNight.min;
  const accommodationMax = nights * accommodationPerNight.max;

  return {
    total: {
      min: Math.round(activitiesMin + foodMin + transportMin + accommodationMin),
      max: Math.round(activitiesMax + foodMax + transportMax + accommodationMax),
    },
    currency: "JPY",
    breakdown: {
      activities: { min: Math.round(activitiesMin), max: Math.round(activitiesMax) },
      food: { min: Math.round(foodMin), max: Math.round(foodMax) },
      transport: { min: Math.round(transportMin), max: Math.round(transportMax) },
    },
  };
}
