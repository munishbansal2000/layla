// ============================================
// REALISTIC FIXTURE DATA
// ============================================
// Fixtures based on real API response structures from OpenAI, Yelp, and Google Places
// These represent what actual API calls would return for a Tokyo trip

import {
  CoreActivity,
  RestaurantActivity,
  ScoredActivity,
  WeatherForecast,
  TravelerComposition,
  TripMode,
  PaceMode,
  BudgetLevel,
} from "@/types/activity-suggestion";
import { DaySchedule, ScheduledActivity } from "../../schedule-builder";
import { GeneratedItinerary } from "../../itinerary-orchestrator";

// ============================================
// REALISTIC TOKYO ACTIVITIES (Based on Real Places)
// ============================================

export const TOKYO_ACTIVITIES: CoreActivity[] = [
  {
    id: "tokyo-sensoji-001",
    entityIds: {
      internalId: "sensoji-temple-asakusa",
      googlePlaceId: "ChIJ8T1GpMGOGGARDYGSgpooDWw",
      yelpId: undefined,
    },
    source: "ai-generated",
    name: "Senso-ji Temple",
    description: "Tokyo's oldest and most significant Buddhist temple, featuring the iconic Kaminarimon gate with its giant red lantern. The approach through Nakamise shopping street offers traditional snacks and souvenirs.",
    category: "temple",
    localTip: "Visit before 6am to experience the temple grounds in peaceful solitude. The lanterns are lit at dusk, creating magical photo opportunities.",
    location: { lat: 35.7148, lng: 139.7967 },
    address: {
      formatted: "2-3-1 Asakusa, Taito City, Tokyo 111-0032",
      city: "Tokyo",
      country: "Japan",
      neighborhood: "Asakusa",
      postalCode: "111-0032",
    },
    neighborhood: "Asakusa",
    bestTimeOfDay: ["morning", "evening"],
    recommendedDuration: 90,
    requiresBooking: false,
    isFree: true,
    familyFriendly: true,
    soloFriendly: true,
    groupFriendly: true,
    isOutdoor: true,
    weatherSensitive: true,
    rating: 4.7,
    reviewCount: 48932,
    imageUrl: "https://images.unsplash.com/photo-sensoji-temple.jpg",
    tags: ["temple", "historic", "free", "photography", "cultural"],
    confidence: 0.98,
  },
  {
    id: "tokyo-meiji-002",
    entityIds: {
      internalId: "meiji-shrine-shibuya",
      googlePlaceId: "ChIJy06hQMeMGGARhNbHgseJ0Yk",
    },
    source: "ai-generated",
    name: "Meiji Shrine",
    description: "A serene Shinto shrine dedicated to Emperor Meiji and Empress Shoken, set within a 170-acre forest. The towering torii gates and peaceful walking paths offer a spiritual retreat from the city.",
    category: "shrine",
    localTip: "Write your wish on an ema (wooden plaque) and hang it near the main shrine. On weekends, you might witness a traditional Shinto wedding procession.",
    location: { lat: 35.6764, lng: 139.6993 },
    address: {
      formatted: "1-1 Yoyogikamizonocho, Shibuya City, Tokyo 151-8557",
      city: "Tokyo",
      country: "Japan",
      neighborhood: "Harajuku",
      postalCode: "151-8557",
    },
    neighborhood: "Harajuku",
    bestTimeOfDay: ["morning", "afternoon"],
    recommendedDuration: 75,
    requiresBooking: false,
    isFree: true,
    familyFriendly: true,
    soloFriendly: true,
    groupFriendly: true,
    isOutdoor: true,
    weatherSensitive: true,
    rating: 4.6,
    reviewCount: 32156,
    imageUrl: "https://images.unsplash.com/photo-meiji-shrine.jpg",
    tags: ["shrine", "nature", "free", "spiritual", "historic"],
    confidence: 0.97,
  },
  {
    id: "tokyo-teamlab-003",
    entityIds: {
      internalId: "teamlab-borderless-odaiba",
      googlePlaceId: "ChIJLRBRVQXyGGARR_Ekg6iAdGc",
    },
    source: "ai-generated",
    name: "teamLab Borderless",
    description: "An immersive digital art museum where artworks move out of rooms, communicate with each other, and form one borderless world. A truly unique experience that blends technology and art.",
    category: "museum",
    localTip: "Wear white or light colors to become part of the art. Book tickets at least 2 weeks in advance, especially for weekends. The Tea House is worth the extra wait.",
    location: { lat: 35.6268, lng: 139.7839 },
    address: {
      formatted: "Azabudai Hills, 1-2-4 Azabudai, Minato City, Tokyo",
      city: "Tokyo",
      country: "Japan",
      neighborhood: "Azabudai",
      postalCode: "106-0041",
    },
    neighborhood: "Azabudai",
    bestTimeOfDay: ["afternoon", "evening"],
    recommendedDuration: 180,
    requiresBooking: true,
    isFree: false,
    estimatedCost: { amount: 3800, currency: "JPY" },
    familyFriendly: true,
    soloFriendly: true,
    groupFriendly: true,
    isOutdoor: false,
    weatherSensitive: false,
    rating: 4.8,
    reviewCount: 28743,
    imageUrl: "https://images.unsplash.com/photo-teamlab.jpg",
    tags: ["art", "interactive", "photography", "indoor", "must-see"],
    confidence: 0.96,
  },
  {
    id: "tokyo-shibuya-crossing-004",
    entityIds: {
      internalId: "shibuya-crossing",
      googlePlaceId: "ChIJy5Nn7xyMGGARFxLfIJNbg7U",
    },
    source: "ai-generated",
    name: "Shibuya Crossing",
    description: "The world's busiest pedestrian crossing, where up to 3,000 people cross at once during peak times. An iconic symbol of Tokyo's organized chaos and urban energy.",
    category: "landmark",
    localTip: "For the best photos, head to the Starbucks on the 2nd floor of the QFRONT building or the rooftop of Shibuya Sky. Cross the intersection yourself during the evening rush for the full experience.",
    location: { lat: 35.6595, lng: 139.7004 },
    address: {
      formatted: "2-2-1 Dogenzaka, Shibuya City, Tokyo",
      city: "Tokyo",
      country: "Japan",
      neighborhood: "Shibuya",
      postalCode: "150-0043",
    },
    neighborhood: "Shibuya",
    bestTimeOfDay: ["afternoon", "evening"],
    recommendedDuration: 30,
    requiresBooking: false,
    isFree: true,
    familyFriendly: true,
    soloFriendly: true,
    groupFriendly: true,
    isOutdoor: true,
    weatherSensitive: true,
    rating: 4.5,
    reviewCount: 65432,
    imageUrl: "https://images.unsplash.com/photo-shibuya-crossing.jpg",
    tags: ["landmark", "free", "photography", "iconic", "urban"],
    confidence: 0.99,
  },
  {
    id: "tokyo-tsukiji-005",
    entityIds: {
      internalId: "tsukiji-outer-market",
      googlePlaceId: "ChIJAULOvNeLGGAR0nJx_KPsTdE",
    },
    source: "ai-generated",
    name: "Tsukiji Outer Market",
    description: "A bustling marketplace with over 400 shops selling fresh seafood, produce, kitchen tools, and street food. Famous for tamagoyaki (Japanese omelet), fresh sashimi, and grilled scallops.",
    category: "market",
    localTip: "Arrive before 9am for the freshest selection. Try the specialty shops: Yamazaki for tamagoyaki, Tsukiji Sushiko for affordable sushi. Most stalls close by 2pm.",
    location: { lat: 35.6654, lng: 139.7707 },
    address: {
      formatted: "4-16-2 Tsukiji, Chuo City, Tokyo 104-0045",
      city: "Tokyo",
      country: "Japan",
      neighborhood: "Tsukiji",
      postalCode: "104-0045",
    },
    neighborhood: "Tsukiji",
    bestTimeOfDay: ["morning"],
    recommendedDuration: 120,
    requiresBooking: false,
    isFree: true,
    estimatedCost: { amount: 2000, currency: "JPY" }, // For food purchases
    familyFriendly: true,
    soloFriendly: true,
    groupFriendly: true,
    isOutdoor: true,
    weatherSensitive: true,
    rating: 4.6,
    reviewCount: 42156,
    imageUrl: "https://images.unsplash.com/photo-tsukiji.jpg",
    tags: ["food", "market", "seafood", "local", "morning"],
    confidence: 0.97,
  },
  {
    id: "tokyo-skytree-006",
    entityIds: {
      internalId: "tokyo-skytree",
      googlePlaceId: "ChIJ35ov0dCOGGARKvdDH7NPHX0",
    },
    source: "ai-generated",
    name: "Tokyo Skytree",
    description: "At 634 meters, the world's tallest broadcasting tower offers panoramic views from two observation decks. On clear days, you can see Mount Fuji in the distance.",
    category: "viewpoint",
    localTip: "Visit on a weekday evening for shorter lines and stunning sunset views. The Tembo Galleria (450m) is worth the extra ticket for the spiral ramp experience.",
    location: { lat: 35.7101, lng: 139.8107 },
    address: {
      formatted: "1-1-2 Oshiage, Sumida City, Tokyo 131-0045",
      city: "Tokyo",
      country: "Japan",
      neighborhood: "Oshiage",
      postalCode: "131-0045",
    },
    neighborhood: "Oshiage",
    bestTimeOfDay: ["afternoon", "evening"],
    recommendedDuration: 90,
    requiresBooking: true,
    isFree: false,
    estimatedCost: { amount: 3100, currency: "JPY" },
    familyFriendly: true,
    soloFriendly: true,
    groupFriendly: true,
    isOutdoor: false,
    weatherSensitive: false,
    rating: 4.5,
    reviewCount: 54321,
    imageUrl: "https://images.unsplash.com/photo-skytree.jpg",
    tags: ["viewpoint", "landmark", "photography", "indoor", "observation"],
    confidence: 0.98,
  },
  {
    id: "tokyo-harajuku-007",
    entityIds: {
      internalId: "takeshita-street-harajuku",
      googlePlaceId: "ChIJi8mnO4yMGGAR1i-4_3RHvlI",
    },
    source: "ai-generated",
    name: "Takeshita Street",
    description: "Tokyo's epicenter of youth culture and fashion. This narrow pedestrian street is packed with quirky boutiques, crepe shops, and colorful fashion stores showcasing Harajuku's unique style.",
    category: "shopping",
    localTip: "Visit on a weekday afternoon to avoid the weekend crush. Don't miss the Marion Crepes and the vintage stores in the side alleys.",
    location: { lat: 35.6702, lng: 139.7026 },
    address: {
      formatted: "1-17 Jingumae, Shibuya City, Tokyo 150-0001",
      city: "Tokyo",
      country: "Japan",
      neighborhood: "Harajuku",
      postalCode: "150-0001",
    },
    neighborhood: "Harajuku",
    bestTimeOfDay: ["afternoon"],
    recommendedDuration: 90,
    requiresBooking: false,
    isFree: true,
    familyFriendly: true,
    soloFriendly: true,
    groupFriendly: true,
    isOutdoor: true,
    weatherSensitive: true,
    rating: 4.3,
    reviewCount: 38765,
    imageUrl: "https://images.unsplash.com/photo-takeshita.jpg",
    tags: ["shopping", "fashion", "youth-culture", "free", "food"],
    confidence: 0.96,
  },
  {
    id: "tokyo-ueno-008",
    entityIds: {
      internalId: "ueno-park",
      googlePlaceId: "ChIJ7WMBMtyPGGARU2RGE4VKqIw",
    },
    source: "ai-generated",
    name: "Ueno Park & Zoo",
    description: "Tokyo's most famous park, home to major museums, Shinobazu Pond, and Japan's first zoo. Perfect for a leisurely half-day exploring nature, culture, and wildlife.",
    category: "park",
    localTip: "Start with the Tokyo National Museum in the morning, then have lunch at one of the park's cafes before visiting the zoo. The giant pandas are a highlight!",
    location: { lat: 35.7146, lng: 139.7732 },
    address: {
      formatted: "Uenokoen, Taito City, Tokyo 110-0007",
      city: "Tokyo",
      country: "Japan",
      neighborhood: "Ueno",
      postalCode: "110-0007",
    },
    neighborhood: "Ueno",
    bestTimeOfDay: ["morning", "afternoon"],
    recommendedDuration: 180,
    requiresBooking: false,
    isFree: true, // Park is free, zoo/museums have fees
    estimatedCost: { amount: 600, currency: "JPY" },
    familyFriendly: true,
    soloFriendly: true,
    groupFriendly: true,
    isOutdoor: true,
    weatherSensitive: true,
    rating: 4.6,
    reviewCount: 41234,
    imageUrl: "https://images.unsplash.com/photo-ueno.jpg",
    tags: ["park", "nature", "zoo", "museums", "family"],
    confidence: 0.97,
  },
  {
    id: "tokyo-golden-gai-009",
    entityIds: {
      internalId: "golden-gai-shinjuku",
      googlePlaceId: "ChIJJTZFH1qMGGARqTBQ-T_rqS0",
    },
    source: "ai-generated",
    name: "Shinjuku Golden Gai",
    description: "A maze of six narrow alleys with over 200 tiny bars, each seating only 6-12 people. A nostalgic remnant of post-war Tokyo with incredible atmosphere and character.",
    category: "nightlife",
    localTip: "Many bars have cover charges (¥500-1500). Some are regulars-only, so look for signs welcoming tourists. Each bar has its own theme and personality.",
    location: { lat: 35.6938, lng: 139.7033 },
    address: {
      formatted: "1 Chome Kabukicho, Shinjuku City, Tokyo 160-0021",
      city: "Tokyo",
      country: "Japan",
      neighborhood: "Shinjuku",
      postalCode: "160-0021",
    },
    neighborhood: "Shinjuku",
    bestTimeOfDay: ["evening", "night"],
    recommendedDuration: 120,
    requiresBooking: false,
    isFree: false,
    estimatedCost: { amount: 3000, currency: "JPY" },
    familyFriendly: false,
    soloFriendly: true,
    groupFriendly: false, // Bars are tiny
    isOutdoor: false,
    weatherSensitive: false,
    rating: 4.4,
    reviewCount: 23456,
    imageUrl: "https://images.unsplash.com/photo-golden-gai.jpg",
    tags: ["nightlife", "bars", "historic", "unique", "local"],
    confidence: 0.94,
  },
  {
    id: "tokyo-imperial-palace-010",
    entityIds: {
      internalId: "imperial-palace-tokyo",
      googlePlaceId: "ChIJF-855MuLGGAR5vCa2wR0HZA",
    },
    source: "ai-generated",
    name: "Imperial Palace East Gardens",
    description: "The former site of Edo Castle, now beautiful public gardens with remnants of the castle's stone walls and moats. A peaceful oasis in the heart of Tokyo.",
    category: "garden",
    localTip: "Free entry but closed Mondays and Fridays. The Ninomaru Garden is the most beautiful section. Pick up a free plastic token at the entrance.",
    location: { lat: 35.6852, lng: 139.7528 },
    address: {
      formatted: "1-1 Chiyoda, Chiyoda City, Tokyo 100-8111",
      city: "Tokyo",
      country: "Japan",
      neighborhood: "Chiyoda",
      postalCode: "100-8111",
    },
    neighborhood: "Chiyoda",
    bestTimeOfDay: ["morning", "afternoon"],
    recommendedDuration: 90,
    requiresBooking: false,
    isFree: true,
    familyFriendly: true,
    soloFriendly: true,
    groupFriendly: true,
    isOutdoor: true,
    weatherSensitive: true,
    rating: 4.5,
    reviewCount: 29876,
    imageUrl: "https://images.unsplash.com/photo-imperial-palace.jpg",
    tags: ["garden", "historic", "free", "peaceful", "nature"],
    confidence: 0.97,
  },
];

// ============================================
// REALISTIC TOKYO RESTAURANTS (Based on Real Yelp Data)
// ============================================

export const TOKYO_RESTAURANTS: RestaurantActivity[] = [
  {
    id: "tokyo-ichiran-r001",
    entityIds: {
      internalId: "ichiran-shibuya",
      yelpId: "ichiran-shibuya-tokyo",
      googlePlaceId: "ChIJGaK-SsSLGGARoA_wqYfvCJ0",
    },
    source: "yelp",
    name: "Ichiran Ramen Shibuya",
    description: "Famous tonkotsu ramen chain known for individual booths and customizable noodle orders. The original flavor-concentrated pork bone broth is rich and satisfying.",
    category: "restaurant",
    mealType: ["lunch", "dinner"],
    cuisineTypes: ["Japanese", "Ramen"],
    dietaryOptions: [],
    priceLevel: 2,
    reservationRequired: false,
    hasKidsMenu: false,
    noiseLevel: "quiet",
    location: { lat: 35.6580, lng: 139.6994 },
    address: {
      formatted: "1-22-7 Jinnan, Shibuya City, Tokyo 150-0041",
      city: "Tokyo",
      country: "Japan",
      neighborhood: "Shibuya",
      postalCode: "150-0041",
    },
    neighborhood: "Shibuya",
    bestTimeOfDay: ["afternoon", "evening"],
    recommendedDuration: 45,
    requiresBooking: false,
    isFree: false,
    estimatedCost: { amount: 1500, currency: "JPY" },
    familyFriendly: true,
    soloFriendly: true,
    groupFriendly: false, // Individual booths
    isOutdoor: false,
    weatherSensitive: false,
    rating: 4.3,
    reviewCount: 8765,
    tags: ["ramen", "solo-friendly", "late-night", "quick"],
    confidence: 0.95,
  },
  {
    id: "tokyo-sushisaito-r002",
    entityIds: {
      internalId: "sushi-saito-roppongi",
      yelpId: "sushi-saito-tokyo",
      googlePlaceId: "ChIJN1t_tDeuEmsRUsoyG83frY4",
    },
    source: "yelp",
    name: "Sushi Saito",
    description: "Three Michelin-starred omakase experience by Chef Takashi Saito. Intimate 8-seat counter serving exquisite Edomae-style sushi using the finest seasonal ingredients.",
    category: "restaurant",
    mealType: ["lunch", "dinner"],
    cuisineTypes: ["Japanese", "Sushi", "Omakase"],
    dietaryOptions: [],
    priceLevel: 4,
    reservationRequired: true,
    hasKidsMenu: false,
    noiseLevel: "quiet",
    location: { lat: 35.6632, lng: 139.7393 },
    address: {
      formatted: "First Floor, Ark Hills South Tower, 1-4-5 Roppongi, Minato City",
      city: "Tokyo",
      country: "Japan",
      neighborhood: "Roppongi",
      postalCode: "106-0032",
    },
    neighborhood: "Roppongi",
    bestTimeOfDay: ["evening"],
    recommendedDuration: 90,
    requiresBooking: true,
    isFree: false,
    estimatedCost: { amount: 45000, currency: "JPY" },
    familyFriendly: false,
    soloFriendly: true,
    groupFriendly: false,
    isOutdoor: false,
    weatherSensitive: false,
    rating: 4.9,
    reviewCount: 1234,
    tags: ["michelin", "sushi", "luxury", "omakase", "special-occasion"],
    confidence: 0.98,
  },
  {
    id: "tokyo-afuri-r003",
    entityIds: {
      internalId: "afuri-ebisu",
      yelpId: "afuri-ebisu-tokyo",
      googlePlaceId: "ChIJ8eMyPsWLGGARD8Y8VqVQUCE",
    },
    source: "yelp",
    name: "AFURI Ebisu",
    description: "Light and refreshing yuzu shio ramen featuring a citrus-infused salt broth. A healthier alternative to heavy tonkotsu, with a beautiful presentation.",
    category: "restaurant",
    mealType: ["lunch", "dinner"],
    cuisineTypes: ["Japanese", "Ramen"],
    dietaryOptions: ["vegetarian"],
    priceLevel: 2,
    reservationRequired: false,
    hasKidsMenu: false,
    noiseLevel: "moderate",
    location: { lat: 35.6475, lng: 139.7103 },
    address: {
      formatted: "1-1-7 Ebisu, Shibuya City, Tokyo 150-0013",
      city: "Tokyo",
      country: "Japan",
      neighborhood: "Ebisu",
      postalCode: "150-0013",
    },
    neighborhood: "Ebisu",
    bestTimeOfDay: ["afternoon"],
    recommendedDuration: 45,
    requiresBooking: false,
    isFree: false,
    estimatedCost: { amount: 1200, currency: "JPY" },
    familyFriendly: true,
    soloFriendly: true,
    groupFriendly: true,
    isOutdoor: false,
    weatherSensitive: false,
    rating: 4.4,
    reviewCount: 5432,
    tags: ["ramen", "yuzu", "healthy", "vegetarian-option"],
    confidence: 0.94,
  },
  {
    id: "tokyo-gonpachi-r004",
    entityIds: {
      internalId: "gonpachi-nishiazabu",
      yelpId: "gonpachi-nishiazabu-tokyo",
      googlePlaceId: "ChIJrxNRu7iLGGARuBLxso_VrZ4",
    },
    source: "yelp",
    name: "Gonpachi Nishiazabu",
    description: "The restaurant that inspired the iconic Kill Bill fight scene. Traditional Japanese cuisine featuring soba noodles, robatayaki, and sushi in a stunning rustic interior.",
    category: "restaurant",
    mealType: ["dinner"],
    cuisineTypes: ["Japanese", "Izakaya", "Soba"],
    dietaryOptions: ["vegetarian"],
    priceLevel: 3,
    reservationRequired: true,
    hasKidsMenu: false,
    noiseLevel: "loud",
    location: { lat: 35.6602, lng: 139.7219 },
    address: {
      formatted: "1-13-11 Nishiazabu, Minato City, Tokyo 106-0031",
      city: "Tokyo",
      country: "Japan",
      neighborhood: "Roppongi",
      postalCode: "106-0031",
    },
    neighborhood: "Roppongi",
    bestTimeOfDay: ["evening"],
    recommendedDuration: 120,
    requiresBooking: true,
    isFree: false,
    estimatedCost: { amount: 6000, currency: "JPY" },
    familyFriendly: true,
    soloFriendly: false,
    groupFriendly: true,
    isOutdoor: false,
    weatherSensitive: false,
    rating: 4.2,
    reviewCount: 3210,
    tags: ["famous", "kill-bill", "izakaya", "atmospheric", "group-friendly"],
    confidence: 0.93,
  },
  {
    id: "tokyo-narisawa-r005",
    entityIds: {
      internalId: "narisawa-aoyama",
      yelpId: "narisawa-tokyo",
      googlePlaceId: "ChIJ5TTBUNuLGGAR9HnHF-sPqhQ",
    },
    source: "yelp",
    name: "Narisawa",
    description: "Two Michelin-starred innovative French-Japanese cuisine by Chef Yoshihiro Narisawa. Known for 'Satoyama' cuisine celebrating Japanese nature and sustainability.",
    category: "restaurant",
    mealType: ["lunch", "dinner"],
    cuisineTypes: ["French", "Japanese", "Innovative"],
    dietaryOptions: [],
    priceLevel: 4,
    reservationRequired: true,
    hasKidsMenu: false,
    noiseLevel: "quiet",
    location: { lat: 35.6693, lng: 139.7214 },
    address: {
      formatted: "2-6-15 Minami-Aoyama, Minato City, Tokyo 107-0062",
      city: "Tokyo",
      country: "Japan",
      neighborhood: "Aoyama",
      postalCode: "107-0062",
    },
    neighborhood: "Aoyama",
    bestTimeOfDay: ["evening"],
    recommendedDuration: 180,
    requiresBooking: true,
    isFree: false,
    estimatedCost: { amount: 35000, currency: "JPY" },
    familyFriendly: false,
    soloFriendly: true,
    groupFriendly: true,
    isOutdoor: false,
    weatherSensitive: false,
    rating: 4.8,
    reviewCount: 876,
    tags: ["michelin", "fine-dining", "innovative", "romantic", "special-occasion"],
    confidence: 0.97,
  },
];

// ============================================
// REALISTIC WEATHER FORECASTS
// ============================================

export function createTokyoWeatherForecasts(startDate: string, days: number): WeatherForecast[] {
  const forecasts: WeatherForecast[] = [];
  const start = new Date(startDate);

  // Realistic late-winter Tokyo weather
  const patterns = [
    { condition: "sunny" as const, tempMin: 8, tempMax: 15, precip: 5 },
    { condition: "partly-cloudy" as const, tempMin: 7, tempMax: 13, precip: 15 },
    { condition: "cloudy" as const, tempMin: 6, tempMax: 11, precip: 25 },
    { condition: "rainy" as const, tempMin: 5, tempMax: 10, precip: 80 },
  ];

  for (let i = 0; i < days; i++) {
    const date = new Date(start);
    date.setDate(date.getDate() + i);
    const pattern = patterns[i % patterns.length];

    forecasts.push({
      date: date.toISOString().split("T")[0],
      temperature: {
        min: pattern.tempMin + Math.floor(Math.random() * 3),
        max: pattern.tempMax + Math.floor(Math.random() * 3),
      },
      condition: pattern.condition,
      precipitationProbability: pattern.precip + Math.floor(Math.random() * 10),
      humidity: 50 + Math.floor(Math.random() * 20),
      windSpeed: 5 + Math.floor(Math.random() * 10),
      sunrise: "06:30",
      sunset: "17:45",
    });
  }

  return forecasts;
}

// ============================================
// REALISTIC TRAVELER PROFILES
// ============================================

export const TRAVELER_PROFILES = {
  couples: {
    mode: "couples" as TripMode,
    adults: 2,
    children: 0,
    infants: 0,
    needsKidFriendly: false,
    needsRomantic: true,
    needsAccessible: false,
    allowsAdultVenues: true,
    prefersSocialSpots: false,
  } as TravelerComposition,

  family: {
    mode: "family" as TripMode,
    adults: 2,
    children: 2,
    infants: 0,
    childrenAges: [8, 12],
    needsKidFriendly: true,
    needsRomantic: false,
    needsAccessible: false,
    allowsAdultVenues: false,
    prefersSocialSpots: false,
  } as TravelerComposition,

  solo: {
    mode: "solo" as TripMode,
    adults: 1,
    children: 0,
    infants: 0,
    needsKidFriendly: false,
    needsRomantic: false,
    needsAccessible: false,
    allowsAdultVenues: true,
    prefersSocialSpots: true,
  } as TravelerComposition,

  friends: {
    mode: "friends" as TripMode,
    adults: 4,
    children: 0,
    infants: 0,
    needsKidFriendly: false,
    needsRomantic: false,
    needsAccessible: false,
    allowsAdultVenues: true,
    prefersSocialSpots: true,
  } as TravelerComposition,
};

// ============================================
// COMPLETE FIXTURE ITINERARY
// ============================================

export function createRealisticTokyoItinerary(
  tripMode: TripMode = "couples",
  pace: PaceMode = "normal",
  budget: BudgetLevel = "moderate"
): GeneratedItinerary {
  const startDate = "2025-02-15";
  const endDate = "2025-02-18";
  const days = 4;

  // Score all activities
  const scoredActivities: ScoredActivity[] = [...TOKYO_ACTIVITIES, ...TOKYO_RESTAURANTS].map(
    (activity) => ({
      activity,
      totalScore: 75 + Math.floor(Math.random() * 20),
      scoreBreakdown: {
        interestMatch: 20 + Math.floor(Math.random() * 5),
        timeOfDayFit: 15 + Math.floor(Math.random() * 5),
        durationFit: 12 + Math.floor(Math.random() * 3),
        budgetMatch: 12 + Math.floor(Math.random() * 3),
        weatherFit: 8 + Math.floor(Math.random() * 2),
        varietyBonus: 8 + Math.floor(Math.random() * 2),
        ratingBonus: 4 + Math.floor(Math.random() * 1),
        modeAdjustment: tripMode === "couples" && "romanticRating" in activity ? 5 : 0,
      },
      explanation: `Selected for ${tripMode} travelers based on ${activity.category} interest`,
      confidence: 0.9 + Math.random() * 0.08,
    })
  );

  // Sort by score
  scoredActivities.sort((a, b) => b.totalScore - a.totalScore);

  // Build day schedules
  const daySchedules: DaySchedule[] = [];
  let activityIndex = 0;

  for (let d = 0; d < days; d++) {
    const date = new Date(startDate);
    date.setDate(date.getDate() + d);
    const dateStr = date.toISOString().split("T")[0];

    const slots: ScheduledActivity[] = [];
    const slotsPerDay = d === 0 || d === days - 1 ? 3 : 4; // Fewer on arrival/departure

    const times = ["09:00", "12:00", "15:00", "18:30"];
    const endTimes = ["11:00", "14:00", "17:30", "21:00"];

    for (let s = 0; s < slotsPerDay && activityIndex < scoredActivities.length; s++) {
      const scored = scoredActivities[activityIndex];
      activityIndex++;

      slots.push({
        slotId: `${dateStr}-slot-${s}`,
        activity: scored,
        scheduledStart: times[s],
        scheduledEnd: endTimes[s],
        actualDuration: scored.activity.recommendedDuration,
        isLocked: false,
        alternatives: scoredActivities.slice(activityIndex, activityIndex + 3),
      });
    }

    daySchedules.push({
      date: dateStr,
      dayNumber: d + 1,
      city: "Tokyo",
      dayType: d === 0 ? "arrival" : d === days - 1 ? "departure" : "full",
      slots,
      totalActivityTime: slots.reduce((sum, s) => sum + s.actualDuration, 0),
      totalCommuteTime: slots.length * 20,
      totalCost: {
        amount: slots.reduce((sum, s) => sum + (s.activity.activity.estimatedCost?.amount || 0), 0),
        currency: "JPY",
      },
      neighborhoodsVisited: [...new Set(slots.map((s) => s.activity.activity.neighborhood).filter(Boolean))],
      categoriesCovered: [...new Set(slots.map((s) => s.activity.activity.category))],
      warnings: [],
      paceScore: pace === "relaxed" ? 60 : pace === "ambitious" ? 85 : 75,
    });
  }

  return {
    id: `tokyo-${tripMode}-${Date.now()}`,
    status: "draft",
    destination: {
      name: "Tokyo",
      coordinates: { lat: 35.6762, lng: 139.6503 },
      country: "Japan",
    },
    dateRange: {
      start: startDate,
      end: endDate,
      totalDays: days,
    },
    tripMode,
    pace,
    budget,
    days: daySchedules,
    activityPool: [...TOKYO_ACTIVITIES, ...TOKYO_RESTAURANTS],
    scoredActivities,
    swipeQueue: scoredActivities.slice(activityIndex, activityIndex + 8),
    keptActivities: [],
    rejectedActivities: [],
    savedForLater: [],
    stats: {
      totalActivities: TOKYO_ACTIVITIES.length,
      totalMeals: TOKYO_RESTAURANTS.length,
      estimatedCost: {
        min: 50000,
        max: 120000,
        currency: "JPY",
      },
      freeActivities: TOKYO_ACTIVITIES.filter((a) => a.isFree).length,
      averageScore: Math.round(
        scoredActivities.reduce((sum, s) => sum + s.totalScore, 0) / scoredActivities.length
      ),
      neighborhoods: ["Asakusa", "Shibuya", "Shinjuku", "Harajuku", "Roppongi", "Ueno"],
      categories: {
        temple: 1,
        shrine: 1,
        museum: 1,
        landmark: 1,
        market: 1,
        viewpoint: 1,
        shopping: 1,
        park: 1,
        nightlife: 1,
        garden: 1,
        restaurant: 5,
      },
    },
    generatedAt: new Date().toISOString(),
    lastModifiedAt: new Date().toISOString(),
  };
}
