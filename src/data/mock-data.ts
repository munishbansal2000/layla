import type { Trip, Activity, Destination, ChatMessage } from "@/types";
import { generateFutureTripDates } from "@/lib/date-validation";

// Generate dynamic future dates for mock data
// This ensures mock data always uses valid future dates
const getMockTripDates = () => {
  const { startDate, endDate } = generateFutureTripDates(5);
  const start = new Date(startDate);

  return {
    startDate: start,
    endDate: new Date(endDate),
    day1: start,
    day2: new Date(new Date(start).setDate(start.getDate() + 1)),
    day3: new Date(new Date(start).setDate(start.getDate() + 2)),
    day4: new Date(new Date(start).setDate(start.getDate() + 3)),
    day5: new Date(new Date(start).setDate(start.getDate() + 4)),
  };
};

export const popularDestinations: Destination[] = [
  {
    id: "1",
    name: "Paris",
    country: "France",
    imageUrl: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800",
    description: "The City of Light beckons with its iconic landmarks and romantic ambiance",
    tags: ["romantic", "culture", "food", "art"],
    averageBudget: 200,
    bestTimeToVisit: ["April", "May", "September", "October"],
    popularActivities: ["Eiffel Tower", "Louvre Museum", "Seine River Cruise"],
  },
  {
    id: "2",
    name: "Tokyo",
    country: "Japan",
    imageUrl: "https://images.unsplash.com/photo-1540959733332-eab4deabeeaf?w=800",
    description: "A mesmerizing blend of ultramodern and traditional",
    tags: ["culture", "food", "technology", "temples"],
    averageBudget: 150,
    bestTimeToVisit: ["March", "April", "October", "November"],
    popularActivities: ["Shibuya Crossing", "Senso-ji Temple", "Tsukiji Market"],
  },
  {
    id: "3",
    name: "Bali",
    country: "Indonesia",
    imageUrl: "https://images.unsplash.com/photo-1537996194471-e657df975ab4?w=800",
    description: "Tropical paradise with stunning beaches and spiritual retreats",
    tags: ["beach", "relaxation", "spiritual", "nature"],
    averageBudget: 80,
    bestTimeToVisit: ["April", "May", "June", "September"],
    popularActivities: ["Rice Terraces", "Temple Tours", "Beach Clubs"],
  },
  {
    id: "4",
    name: "New York",
    country: "USA",
    imageUrl: "https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=800",
    description: "The city that never sleeps offers endless entertainment",
    tags: ["urban", "culture", "shopping", "food"],
    averageBudget: 250,
    bestTimeToVisit: ["April", "May", "September", "October"],
    popularActivities: ["Central Park", "Broadway Shows", "Statue of Liberty"],
  },
  {
    id: "5",
    name: "Barcelona",
    country: "Spain",
    imageUrl: "https://images.unsplash.com/photo-1583422409516-2895a77efded?w=800",
    description: "Vibrant city with stunning architecture and Mediterranean vibes",
    tags: ["beach", "architecture", "food", "nightlife"],
    averageBudget: 120,
    bestTimeToVisit: ["May", "June", "September", "October"],
    popularActivities: ["Sagrada Familia", "La Rambla", "Park Güell"],
  },
  {
    id: "6",
    name: "Santorini",
    country: "Greece",
    imageUrl: "https://images.unsplash.com/photo-1570077188670-e3a8d69ac5ff?w=800",
    description: "Iconic white-washed buildings with stunning sunsets",
    tags: ["romantic", "beach", "luxury", "views"],
    averageBudget: 180,
    bestTimeToVisit: ["April", "May", "September", "October"],
    popularActivities: ["Oia Sunset", "Wine Tasting", "Caldera Cruise"],
  },
];

export const sampleActivities: Activity[] = [
  {
    id: "act-1",
    name: "Eiffel Tower Visit",
    description: "Iconic iron lattice tower offering panoramic city views from multiple observation decks.",
    type: "attraction",
    location: {
      lat: 48.8584,
      lng: 2.2945,
      city: "Paris",
      country: "France",
      address: "Champ de Mars, 5 Avenue Anatole France",
    },
    imageUrl: "https://images.unsplash.com/photo-1511739001486-6bfe10ce65f4?w=800",
    rating: 4.7,
    reviewCount: 125000,
    priceLevel: 2,
    duration: 120,
    openingHours: "9:00 AM - 11:45 PM",
    tags: ["landmark", "views", "iconic"],
    tips: ["Book tickets online in advance", "Visit at sunset for best photos"],
  },
  {
    id: "act-2",
    name: "Le Comptoir du Panthéon",
    description: "Classic French bistro serving traditional cuisine in a charming setting.",
    type: "restaurant",
    location: {
      lat: 48.8462,
      lng: 2.3458,
      city: "Paris",
      country: "France",
      address: "10 Rue Soufflot",
    },
    imageUrl: "https://images.unsplash.com/photo-1414235077428-338989a2e8c0?w=800",
    rating: 4.5,
    reviewCount: 3200,
    priceLevel: 3,
    duration: 90,
    openingHours: "12:00 PM - 11:00 PM",
    tags: ["french", "bistro", "romantic"],
    tips: ["Try the duck confit", "Make reservations for dinner"],
  },
  {
    id: "act-3",
    name: "Louvre Museum",
    description: "World's largest art museum, home to the Mona Lisa and thousands of masterpieces.",
    type: "culture",
    location: {
      lat: 48.8606,
      lng: 2.3376,
      city: "Paris",
      country: "France",
      address: "Rue de Rivoli",
    },
    imageUrl: "https://images.unsplash.com/photo-1499426600726-7f914b61d7c3?w=800",
    rating: 4.8,
    reviewCount: 180000,
    priceLevel: 2,
    duration: 240,
    openingHours: "9:00 AM - 6:00 PM",
    tags: ["museum", "art", "history"],
    tips: ["Enter through the underground mall entrance to avoid lines", "Don't miss the Egyptian antiquities"],
  },
];

export const createMockTrip = (): Trip => {
  const dates = getMockTripDates();

  return {
    id: "trip-1",
    userId: "user-1",
    title: "Paris Adventure",
    destination: {
      lat: 48.8566,
      lng: 2.3522,
      city: "Paris",
      country: "France",
    },
    startDate: dates.startDate,
    endDate: dates.endDate,
    days: [
      {
        id: "day-1",
        dayNumber: 1,
        date: dates.day1,
        title: "Arrival & First Impressions",
        items: [
          {
            id: "item-1",
            activity: sampleActivities[0],
            timeSlot: { startTime: "14:00", endTime: "16:00" },
            order: 0,
          },
          {
            id: "item-2",
            activity: sampleActivities[1],
            timeSlot: { startTime: "19:00", endTime: "21:00" },
            order: 1,
          },
        ],
        weatherForecast: { temperature: 22, condition: "sunny", icon: "☀️" },
      },
      {
        id: "day-2",
        dayNumber: 2,
        date: dates.day2,
        title: "Art & Culture Day",
        items: [
          {
            id: "item-3",
            activity: sampleActivities[2],
            timeSlot: { startTime: "09:00", endTime: "13:00" },
            order: 0,
          },
        ],
        weatherForecast: { temperature: 24, condition: "partly-cloudy", icon: "⛅" },
      },
      {
        id: "day-3",
        dayNumber: 3,
        date: dates.day3,
        title: "Montmartre & Local Gems",
        items: [],
        weatherForecast: { temperature: 21, condition: "cloudy", icon: "☁️" },
      },
      {
        id: "day-4",
        dayNumber: 4,
        date: dates.day4,
        title: "Day Trip to Versailles",
        items: [],
        weatherForecast: { temperature: 23, condition: "sunny", icon: "☀️" },
      },
      {
        id: "day-5",
        dayNumber: 5,
        date: dates.day5,
        title: "Departure Day",
        items: [],
        weatherForecast: { temperature: 20, condition: "sunny", icon: "☀️" },
      },
    ],
    preferences: {
      budget: "moderate",
      pace: "moderate",
      interests: ["culture", "food", "art"],
      travelStyle: "cultural",
    },
    status: "planning",
    coverImage: "https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=800",
    totalBudget: 3000,
    currency: "USD",
    travelers: 2,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
};

// Use a stable timestamp for initial message to avoid hydration mismatch
const INITIAL_MESSAGE_TIMESTAMP = new Date("2024-01-01T00:00:00Z");

export const initialMessages: ChatMessage[] = [
  {
    id: "msg-1",
    role: "assistant",
    content: "Hi! I'm Layla, your AI travel planner. Where would you like to go? Tell me about your dream trip! ✈️",
    type: "text",
    timestamp: INITIAL_MESSAGE_TIMESTAMP,
  },
];

export const suggestedPrompts = [
  "Plan a romantic week in Paris",
  "5-day adventure in Tokyo for foodies",
  "Family-friendly trip to Barcelona",
  "Relaxing beach vacation in Bali",
  "Cultural exploration of Rome",
  "Weekend getaway to New York",
];
