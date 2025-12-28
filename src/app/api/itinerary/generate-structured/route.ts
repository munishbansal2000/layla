// ============================================
// POST /api/itinerary/generate-structured
// ============================================
// Generate a structured itinerary with OPTIONS per slot
// using the Phase 1 format (text + JSON with choices)
//
// Phase 2: Now includes place resolution to enrich
// AI-generated places with real coordinates, ratings, photos

import { NextRequest, NextResponse } from "next/server";
// import { generateStructuredItinerary } from "@/lib/openai";
import {
  resolveItineraryPlaces,
  type ResolvedPlace,
} from "@/lib/place-resolver";
import {
  getCommuteDuration,
  isRoutingConfigured,
} from "@/lib/routing-service";
import { validateTripDates } from "@/lib/date-validation";
import type {
  TripContext,
  StructuredItineraryData,
  DayWithOptions,
  SlotWithOptions,
  ActivityOption,
  StructuredCommuteInfo,
} from "@/types/structured-itinerary";

// ============================================
// HARDCODED CACHED RESPONSE FOR DEV
// ============================================
// This is from log_mjovx70q_t8k89k.json - Tokyo 3-day trip
// Remove this and uncomment LLM call when ready

const CACHED_MESSAGE = `Welcome to your delightful 3-day adventure in Tokyo! This itinerary is designed for couples who want to immerse themselves in the vibrant culture and mouthwatering food scene of this incredible city, all while keeping a relaxed pace. You'll explore quaint neighborhoods, visit iconic landmarks, and enjoy some fantastic dining experiences without feeling rushed.

From savoring traditional Japanese cuisine to strolling through beautiful parks, every day brings a new highlight. Whether you're wandering through the historic streets of Asakusa or indulging in delicious ramen in Shinjuku, you'll find plenty of opportunities to connect with each other and the rich culture of Tokyo. Let's dive into your itinerary and get ready for an unforgettable trip! 🍣🌸`;

const CACHED_ITINERARY: StructuredItineraryData = {
  "destination": "Tokyo",
  "country": "Japan",
  "days": [
    {
      "dayNumber": 1,
      "date": "2025-12-27",
      "city": "Tokyo",
      "title": "Cultural Exploration",
      "slots": [
        {
          "slotId": "day1-morning",
          "slotType": "morning",
          "timeRange": { "start": "09:30", "end": "12:00" },
          "options": [
            {
              "id": "opt-1",
              "rank": 1,
              "score": 88,
              "activity": {
                "name": "Senso-ji Temple",
                "description": "Visit Tokyo's oldest temple, Senso-ji, where you'll find stunning architecture and vibrant markets leading up to the temple.",
                "category": "temple",
                "duration": 120,
                "place": {
                  "name": "Senso-ji Temple",
                  "address": "2 Chome-3-1 Asakusa, Taito City, Tokyo",
                  "neighborhood": "Asakusa",
                  "coordinates": { "lat": 35.7116, "lng": 139.7967 }
                },
                "isFree": true,
                "estimatedCost": { "amount": 0, "currency": "USD" },
                "tags": ["cultural", "outdoor", "historical"],
                "source": "ai"
              },
              "matchReasons": [
                "Iconic cultural landmark",
                "Great for photography",
                "Free entry with local shops to explore"
              ],
              "tradeoffs": [
                "Can be crowded, especially on weekends",
                "Limited seating in the area"
              ]
            },
            {
              "id": "opt-2",
              "rank": 2,
              "score": 82,
              "activity": {
                "name": "Ueno Park",
                "description": "Stroll through Ueno Park, known for its museums, cherry blossoms, and serene ponds, making it a perfect morning escape.",
                "category": "park",
                "duration": 120,
                "place": {
                  "name": "Ueno Park",
                  "address": "Uenokoen, Taito City, Tokyo",
                  "neighborhood": "Ueno",
                  "coordinates": { "lat": 35.7138, "lng": 139.7733 }
                },
                "isFree": true,
                "estimatedCost": { "amount": 0, "currency": "USD" },
                "tags": ["outdoor", "relaxing", "nature"],
                "source": "ai"
              },
              "matchReasons": [
                "Perfect for a peaceful morning walk",
                "Art and culture abound with museums nearby",
                "Free to enter with plenty of green space"
              ],
              "tradeoffs": [
                "Some museums may require an entrance fee",
                "Might be chilly in December"
              ]
            }
          ]
        },
        {
          "slotId": "day1-lunch",
          "slotType": "lunch",
          "timeRange": { "start": "12:00", "end": "14:00" },
          "options": [
            {
              "id": "lunch-opt-1",
              "rank": 1,
              "score": 85,
              "activity": {
                "name": "Asakusa Imahan",
                "description": "Enjoy a traditional Japanese lunch featuring sukiyaki, a popular dish with tender beef and fresh vegetables.",
                "category": "restaurant",
                "duration": 60,
                "place": {
                  "name": "Asakusa Imahan",
                  "address": "1-4-2 Asakusa, Taito City, Tokyo",
                  "neighborhood": "Asakusa",
                  "coordinates": { "lat": 35.7115, "lng": 139.7972 }
                },
                "isFree": false,
                "estimatedCost": { "amount": 20, "currency": "USD" },
                "tags": ["traditional", "family-friendly"],
                "source": "ai"
              },
              "matchReasons": [
                "Authentic Japanese cuisine",
                "Close to morning activity",
                "Good for couples"
              ],
              "tradeoffs": [
                "Can be busy during lunch hours"
              ]
            },
            {
              "id": "lunch-opt-2",
              "rank": 2,
              "score": 78,
              "activity": {
                "name": "Naritaya Ramen",
                "description": "Savor a bowl of delicious ramen at Naritaya, known for its rich broth and handmade noodles in a cozy setting.",
                "category": "restaurant",
                "duration": 45,
                "place": {
                  "name": "Naritaya",
                  "address": "1-1-1 Kameido, Koto City, Tokyo",
                  "neighborhood": "Asakusa",
                  "coordinates": { "lat": 35.6812, "lng": 139.7982 }
                },
                "isFree": false,
                "estimatedCost": { "amount": 12, "currency": "USD" },
                "tags": ["casual", "quick-service"],
                "source": "ai"
              },
              "matchReasons": [
                "Budget-friendly option",
                "Quick and delicious"
              ],
              "tradeoffs": [
                "Less formal atmosphere"
              ]
            }
          ]
        },
        {
          "slotId": "day1-afternoon",
          "slotType": "afternoon",
          "timeRange": { "start": "14:00", "end": "18:00" },
          "options": [
            {
              "id": "opt-1",
              "rank": 1,
              "score": 85,
              "activity": {
                "name": "Tokyo National Museum",
                "description": "Explore the vast collection of Japanese art and artifacts at Japan's oldest and largest museum located in Ueno Park.",
                "category": "museum",
                "duration": 120,
                "place": {
                  "name": "Tokyo National Museum",
                  "address": "13-9 Uenokoen, Taito City, Tokyo",
                  "neighborhood": "Ueno",
                  "coordinates": { "lat": 35.7189, "lng": 139.7752 }
                },
                "isFree": false,
                "estimatedCost": { "amount": 6, "currency": "USD" },
                "tags": ["cultural", "indoor", "educational"],
                "source": "ai"
              },
              "matchReasons": [
                "Cultural deep dive into Japan's history",
                "Ideal for a relaxed afternoon",
                "Close to the morning slot for easy travel"
              ],
              "tradeoffs": [
                "Entrance fee applies",
                "Can get crowded on weekends"
              ]
            },
            {
              "id": "opt-2",
              "rank": 2,
              "score": 78,
              "activity": {
                "name": "Yanaka District",
                "description": "Wander through the traditional Yanaka District, known for its old temples, shops, and a glimpse of Tokyo's past.",
                "category": "neighborhood",
                "duration": 120,
                "place": {
                  "name": "Yanaka District",
                  "address": "Yanaka, Taito City, Tokyo",
                  "neighborhood": "Yanaka",
                  "coordinates": { "lat": 35.7337, "lng": 139.7724 }
                },
                "isFree": true,
                "estimatedCost": { "amount": 0, "currency": "USD" },
                "tags": ["cultural", "walking", "historical"],
                "source": "ai"
              },
              "matchReasons": [
                "Charming atmosphere with historic buildings",
                "Perfect for leisurely exploration",
                "Free to explore with local cafes nearby"
              ],
              "tradeoffs": [
                "Limited signage in English",
                "Might require public transport to reach"
              ]
            }
          ]
        },
        {
          "slotId": "day1-dinner",
          "slotType": "dinner",
          "timeRange": { "start": "18:00", "end": "20:00" },
          "options": [
            {
              "id": "dinner-opt-1",
              "rank": 1,
              "score": 85,
              "activity": {
                "name": "Ippudo Ramen",
                "description": "Delight in a bowl of savory tonkotsu ramen at Ippudo, a popular chain known for its rich flavors and cozy atmosphere.",
                "category": "restaurant",
                "duration": 60,
                "place": {
                  "name": "Ippudo Ramen",
                  "address": "1 Chome-6-3 Akasaka, Minato City, Tokyo",
                  "neighborhood": "Akasaka",
                  "coordinates": { "lat": 35.6718, "lng": 139.7366 }
                },
                "isFree": false,
                "estimatedCost": { "amount": 15, "currency": "USD" },
                "tags": ["casual", "popular"],
                "source": "ai"
              },
              "matchReasons": [
                "Famous ramen chain",
                "Perfect end to the day"
              ],
              "tradeoffs": [
                "Popular spot, may have wait times"
              ]
            },
            {
              "id": "dinner-opt-2",
              "rank": 2,
              "score": 80,
              "activity": {
                "name": "Katsu Midori",
                "description": "Savor delicious katsu dishes, including pork and chicken cutlets, at this budget-friendly eatery.",
                "category": "restaurant",
                "duration": 60,
                "place": {
                  "name": "Katsu Midori",
                  "address": "2 Chome-3-1 Shibuya, Shibuya City, Tokyo",
                  "neighborhood": "Shibuya",
                  "coordinates": { "lat": 35.6586, "lng": 139.7013 }
                },
                "isFree": false,
                "estimatedCost": { "amount": 12, "currency": "USD" },
                "tags": ["casual", "family-friendly"],
                "source": "ai"
              },
              "matchReasons": [
                "Budget-friendly option",
                "Hearty Japanese comfort food"
              ],
              "tradeoffs": [
                "Located further from day's activities"
              ]
            }
          ]
        }
      ]
    },
    {
      "dayNumber": 2,
      "date": "2025-12-28",
      "city": "Tokyo",
      "title": "Food and Fun",
      "slots": [
        {
          "slotId": "day2-morning",
          "slotType": "morning",
          "timeRange": { "start": "09:30", "end": "12:00" },
          "options": [
            {
              "id": "opt-1",
              "rank": 1,
              "score": 90,
              "activity": {
                "name": "Tsukiji Outer Market",
                "description": "Explore the bustling Tsukiji Outer Market, filled with fresh seafood and local delicacies to sample and enjoy.",
                "category": "market",
                "duration": 120,
                "place": {
                  "name": "Tsukiji Outer Market",
                  "address": "5 Chome-2-1 Tsukiji, Chuo City, Tokyo",
                  "neighborhood": "Tsukiji",
                  "coordinates": { "lat": 35.6652, "lng": 139.7701 }
                },
                "isFree": true,
                "estimatedCost": { "amount": 0, "currency": "USD" },
                "tags": ["outdoor", "foodie", "local"],
                "source": "ai"
              },
              "matchReasons": [
                "Delicious street food options",
                "Great for food lovers",
                "Free entry with lots to taste"
              ],
              "tradeoffs": [
                "Can be busy, especially in the morning",
                "Limited seating for sampling"
              ]
            },
            {
              "id": "opt-2",
              "rank": 2,
              "score": 80,
              "activity": {
                "name": "Shibuya Scramble Crossing",
                "description": "Experience one of the busiest pedestrian intersections in the world, capturing the energy of Tokyo's bustling atmosphere.",
                "category": "landmark",
                "duration": 60,
                "place": {
                  "name": "Shibuya Scramble Crossing",
                  "address": "Shibuya, Tokyo",
                  "neighborhood": "Shibuya",
                  "coordinates": { "lat": 35.6595, "lng": 139.7004 }
                },
                "isFree": true,
                "estimatedCost": { "amount": 0, "currency": "USD" },
                "tags": ["cultural", "outdoor"],
                "source": "ai"
              },
              "matchReasons": [
                "Iconic Tokyo experience",
                "Perfect for photos",
                "Free to visit and enjoy the hustle"
              ],
              "tradeoffs": [
                "Can be overwhelming due to crowds",
                "No seating or respite nearby"
              ]
            }
          ]
        },
        {
          "slotId": "day2-lunch",
          "slotType": "lunch",
          "timeRange": { "start": "12:00", "end": "14:00" },
          "options": [
            {
              "id": "lunch-opt-1",
              "rank": 1,
              "score": 88,
              "activity": {
                "name": "Uobei Shibuya Dogenzaka",
                "description": "Experience a fun and unique conveyor belt sushi at Uobei, where you can order directly from a tablet.",
                "category": "restaurant",
                "duration": 60,
                "place": {
                  "name": "Uobei Shibuya Dogenzaka",
                  "address": "2 Chome-29-11 Dogenzaka, Shibuya City, Tokyo",
                  "neighborhood": "Shibuya",
                  "coordinates": { "lat": 35.6555, "lng": 139.7004 }
                },
                "isFree": false,
                "estimatedCost": { "amount": 15, "currency": "USD" },
                "tags": ["casual", "fun"],
                "source": "ai"
              },
              "matchReasons": [
                "Interactive dining experience",
                "Fresh sushi at great prices"
              ],
              "tradeoffs": [
                "Can get crowded"
              ]
            },
            {
              "id": "lunch-opt-2",
              "rank": 2,
              "score": 82,
              "activity": {
                "name": "Tendon Tenya",
                "description": "Enjoy a delicious bowl of tempura rice at Tendon Tenya, known for its satisfying and budget-friendly dishes.",
                "category": "restaurant",
                "duration": 45,
                "place": {
                  "name": "Tendon Tenya",
                  "address": "1 Chome-5-1 Shibuya, Shibuya City, Tokyo",
                  "neighborhood": "Shibuya",
                  "coordinates": { "lat": 35.661, "lng": 139.7035 }
                },
                "isFree": false,
                "estimatedCost": { "amount": 10, "currency": "USD" },
                "tags": ["casual", "quick-service"],
                "source": "ai"
              },
              "matchReasons": [
                "Great value for money",
                "Quick and satisfying"
              ],
              "tradeoffs": [
                "Basic restaurant atmosphere"
              ]
            }
          ]
        },
        {
          "slotId": "day2-afternoon",
          "slotType": "afternoon",
          "timeRange": { "start": "14:00", "end": "18:00" },
          "options": [
            {
              "id": "opt-1",
              "rank": 1,
              "score": 87,
              "activity": {
                "name": "Meiji Shrine",
                "description": "A peaceful retreat in the city, visit Meiji Shrine surrounded by lush forests and serene paths, perfect for an afternoon stroll.",
                "category": "temple",
                "duration": 120,
                "place": {
                  "name": "Meiji Shrine",
                  "address": "1-1 Yoyogikamizonocho, Shibuya City, Tokyo",
                  "neighborhood": "Shibuya",
                  "coordinates": { "lat": 35.6764, "lng": 139.6993 }
                },
                "isFree": true,
                "estimatedCost": { "amount": 0, "currency": "USD" },
                "tags": ["cultural", "outdoor", "walking"],
                "source": "ai"
              },
              "matchReasons": [
                "Beautiful setting for relaxation",
                "Cultural significance and tranquility",
                "Free entry with lovely nature walks"
              ],
              "tradeoffs": [
                "Some areas can be slippery in winter",
                "Limited facilities in the shrine area"
              ]
            },
            {
              "id": "opt-2",
              "rank": 2,
              "score": 80,
              "activity": {
                "name": "Shinjuku Gyoen National Garden",
                "description": "Enjoy a leisurely walk in Shinjuku Gyoen, a spacious garden with traditional Japanese landscapes, perfect for a peaceful afternoon.",
                "category": "park",
                "duration": 120,
                "place": {
                  "name": "Shinjuku Gyoen National Garden",
                  "address": "11 Naitomachi, Shinjuku City, Tokyo",
                  "neighborhood": "Shinjuku",
                  "coordinates": { "lat": 35.6842, "lng": 139.7105 }
                },
                "isFree": false,
                "estimatedCost": { "amount": 5, "currency": "USD" },
                "tags": ["outdoor", "relaxing", "nature"],
                "source": "ai"
              },
              "matchReasons": [
                "Beautiful landscapes and seasonal flowers",
                "Great for a slow-paced exploration",
                "Small entrance fee for a lovely experience"
              ],
              "tradeoffs": [
                "May be crowded during peak seasons",
                "Entrance fee applies"
              ]
            }
          ]
        },
        {
          "slotId": "day2-dinner",
          "slotType": "dinner",
          "timeRange": { "start": "18:00", "end": "20:00" },
          "options": [
            {
              "id": "dinner-opt-1",
              "rank": 1,
              "score": 85,
              "activity": {
                "name": "Kushikatsu Tanaka",
                "description": "Enjoy a variety of deep-fried skewers at Kushikatsu Tanaka, offering a fun and casual dining experience.",
                "category": "restaurant",
                "duration": 60,
                "place": {
                  "name": "Kushikatsu Tanaka",
                  "address": "2-7-4 Shinjuku, Shinjuku City, Tokyo",
                  "neighborhood": "Shinjuku",
                  "coordinates": { "lat": 35.6907, "lng": 139.7016 }
                },
                "isFree": false,
                "estimatedCost": { "amount": 15, "currency": "USD" },
                "tags": ["casual", "fun"],
                "source": "ai"
              },
              "matchReasons": [
                "Fun interactive dining",
                "Great variety of options"
              ],
              "tradeoffs": [
                "Fried food may not suit everyone"
              ]
            },
            {
              "id": "dinner-opt-2",
              "rank": 2,
              "score": 78,
              "activity": {
                "name": "Naritaya Shinjuku",
                "description": "Savor delicious ramen at Naritaya, known for its rich flavors and cozy atmosphere, perfect after a day of exploring.",
                "category": "restaurant",
                "duration": 45,
                "place": {
                  "name": "Naritaya Shinjuku",
                  "address": "3 Chome-1-1 Shinjuku, Shinjuku City, Tokyo",
                  "neighborhood": "Shinjuku",
                  "coordinates": { "lat": 35.6895, "lng": 139.7004 }
                },
                "isFree": false,
                "estimatedCost": { "amount": 12, "currency": "USD" },
                "tags": ["casual", "quick-service"],
                "source": "ai"
              },
              "matchReasons": [
                "Comfort food after a long day",
                "Budget-friendly"
              ],
              "tradeoffs": [
                "Simple dining experience"
              ]
            }
          ]
        }
      ]
    },
    {
      "dayNumber": 3,
      "date": "2025-12-29",
      "city": "Tokyo",
      "title": "Tokyo's Charm",
      "slots": [
        {
          "slotId": "day3-morning",
          "slotType": "morning",
          "timeRange": { "start": "09:30", "end": "12:00" },
          "options": [
            {
              "id": "opt-1",
              "rank": 1,
              "score": 88,
              "activity": {
                "name": "Harajuku Takeshita Street",
                "description": "Take a stroll down Takeshita Street, famous for its quirky shops, street food, and vibrant youth culture.",
                "category": "neighborhood",
                "duration": 120,
                "place": {
                  "name": "Takeshita Street",
                  "address": "1 Chome Harajuku, Shibuya City, Tokyo",
                  "neighborhood": "Harajuku",
                  "coordinates": { "lat": 35.67, "lng": 139.7016 }
                },
                "isFree": true,
                "estimatedCost": { "amount": 0, "currency": "USD" },
                "tags": ["cultural", "outdoor", "shopping"],
                "source": "ai"
              },
              "matchReasons": [
                "Colorful and lively atmosphere",
                "Great for unique souvenirs",
                "Free to explore with tasty treats"
              ],
              "tradeoffs": [
                "Can be packed with tourists",
                "Limited seating for street food"
              ]
            },
            {
              "id": "opt-2",
              "rank": 2,
              "score": 80,
              "activity": {
                "name": "Yoyogi Park",
                "description": "Enjoy a leisurely morning in Yoyogi Park, a large and popular park perfect for a relaxing walk or people-watching.",
                "category": "park",
                "duration": 120,
                "place": {
                  "name": "Yoyogi Park",
                  "address": "2-1 Yoyogi Kamizonocho, Shibuya City, Tokyo",
                  "neighborhood": "Shibuya",
                  "coordinates": { "lat": 35.6713, "lng": 139.699 }
                },
                "isFree": true,
                "estimatedCost": { "amount": 0, "currency": "USD" },
                "tags": ["outdoor", "relaxing", "nature"],
                "source": "ai"
              },
              "matchReasons": [
                "Spacious area for a peaceful morning",
                "Great for picnics and leisure",
                "Free entry with scenic views"
              ],
              "tradeoffs": [
                "May be cold in December",
                "Limited facilities within the park"
              ]
            }
          ]
        },
        {
          "slotId": "day3-lunch",
          "slotType": "lunch",
          "timeRange": { "start": "12:00", "end": "14:00" },
          "options": [
            {
              "id": "lunch-opt-1",
              "rank": 1,
              "score": 85,
              "activity": {
                "name": "Katsuya",
                "description": "Savor a delicious katsu meal at Katsuya, known for its crispy cutlets and budget-friendly prices.",
                "category": "restaurant",
                "duration": 45,
                "place": {
                  "name": "Katsuya",
                  "address": "2 Chome-6-3 Shibuya, Shibuya City, Tokyo",
                  "neighborhood": "Shibuya",
                  "coordinates": { "lat": 35.6579, "lng": 139.7039 }
                },
                "isFree": false,
                "estimatedCost": { "amount": 10, "currency": "USD" },
                "tags": ["casual", "quick-service"],
                "source": "ai"
              },
              "matchReasons": [
                "Great value for money",
                "Satisfying Japanese comfort food"
              ],
              "tradeoffs": [
                "Basic chain restaurant"
              ]
            },
            {
              "id": "lunch-opt-2",
              "rank": 2,
              "score": 80,
              "activity": {
                "name": "Coco Ichibanya",
                "description": "Try the famous Japanese curry at Coco Ichibanya, where you can customize your curry dish to your liking.",
                "category": "restaurant",
                "duration": 45,
                "place": {
                  "name": "Coco Ichibanya Shibuya",
                  "address": "1 Chome-19-8 Shibuya, Shibuya City, Tokyo",
                  "neighborhood": "Shibuya",
                  "coordinates": { "lat": 35.6612, "lng": 139.7033 }
                },
                "isFree": false,
                "estimatedCost": { "amount": 10, "currency": "USD" },
                "tags": ["casual", "quick-service"],
                "source": "ai"
              },
              "matchReasons": [
                "Customizable curry options",
                "Consistent quality"
              ],
              "tradeoffs": [
                "Chain restaurant experience"
              ]
            }
          ]
        },
        {
          "slotId": "day3-afternoon",
          "slotType": "afternoon",
          "timeRange": { "start": "14:00", "end": "18:00" },
          "options": [
            {
              "id": "opt-1",
              "rank": 1,
              "score": 85,
              "activity": {
                "name": "Tokyo Tower",
                "description": "Visit the iconic Tokyo Tower, offering panoramic views of the city from its observation deck.",
                "category": "viewpoint",
                "duration": 120,
                "place": {
                  "name": "Tokyo Tower",
                  "address": "4-2-8 Shibakoen, Minato City, Tokyo",
                  "neighborhood": "Minato",
                  "coordinates": { "lat": 35.6586, "lng": 139.7454 }
                },
                "isFree": false,
                "estimatedCost": { "amount": 10, "currency": "USD" },
                "tags": ["cultural", "sightseeing", "indoor"],
                "source": "ai"
              },
              "matchReasons": [
                "Iconic landmark with stunning views",
                "Perfect for a romantic photo op",
                "Great way to wrap up your trip"
              ],
              "tradeoffs": [
                "Entrance fee applies",
                "Can be busy during peak hours"
              ]
            },
            {
              "id": "opt-2",
              "rank": 2,
              "score": 78,
              "activity": {
                "name": "Akihabara Shopping District",
                "description": "Explore the vibrant Akihabara district, a hub for electronics, anime, and quirky shops.",
                "category": "neighborhood",
                "duration": 120,
                "place": {
                  "name": "Akihabara",
                  "address": "Sotokanda, Chiyoda City, Tokyo",
                  "neighborhood": "Akihabara",
                  "coordinates": { "lat": 35.6993, "lng": 139.7745 }
                },
                "isFree": true,
                "estimatedCost": { "amount": 0, "currency": "USD" },
                "tags": ["cultural", "shopping", "quirky"],
                "source": "ai"
              },
              "matchReasons": [
                "Fun and lively atmosphere",
                "Unique shopping experience for souvenirs",
                "Free to explore with plenty to see"
              ],
              "tradeoffs": [
                "Can be overwhelming with crowds",
                "Limited dining options in the area"
              ]
            }
          ]
        },
        {
          "slotId": "day3-dinner",
          "slotType": "dinner",
          "timeRange": { "start": "18:00", "end": "20:00" },
          "options": [
            {
              "id": "dinner-opt-1",
              "rank": 1,
              "score": 88,
              "activity": {
                "name": "Hanbey",
                "description": "Enjoy a casual dinner at Hanbey, a traditional izakaya offering a variety of Japanese dishes and a cozy atmosphere.",
                "category": "restaurant",
                "duration": 90,
                "place": {
                  "name": "Hanbey",
                  "address": "1 Chome-2-14 Shibuya, Shibuya City, Tokyo",
                  "neighborhood": "Shibuya",
                  "coordinates": { "lat": 35.6553, "lng": 139.7039 }
                },
                "isFree": false,
                "estimatedCost": { "amount": 20, "currency": "USD" },
                "tags": ["traditional", "casual"],
                "source": "ai"
              },
              "matchReasons": [
                "Authentic izakaya experience",
                "Perfect way to end the trip"
              ],
              "tradeoffs": [
                "May be crowded in evenings"
              ]
            },
            {
              "id": "dinner-opt-2",
              "rank": 2,
              "score": 82,
              "activity": {
                "name": "Sushi Zanmai",
                "description": "Savor fresh sushi at Sushi Zanmai, a popular chain known for its quality and affordable prices.",
                "category": "restaurant",
                "duration": 60,
                "place": {
                  "name": "Sushi Zanmai",
                  "address": "2-4-1 Tsukiji, Chuo City, Tokyo",
                  "neighborhood": "Tsukiji",
                  "coordinates": { "lat": 35.6655, "lng": 139.7702 }
                },
                "isFree": false,
                "estimatedCost": { "amount": 15, "currency": "USD" },
                "tags": ["casual", "popular"],
                "source": "ai"
              },
              "matchReasons": [
                "Fresh sushi at good prices",
                "Near the Tsukiji area"
              ],
              "tradeoffs": [
                "Chain restaurant"
              ]
            }
          ]
        }
      ]
    }
  ],
  "generalTips": [
    "Get a transit pass for unlimited rides",
    "Most museums are closed on Mondays",
    "December can be chilly, so dress warmly!"
  ],
  "estimatedBudget": {
    "total": { "min": 450, "max": 700 },
    "currency": "USD"
  }
};

// DEV MODE FLAG - Always use cached Tokyo response for testing
// Set to false to use real LLM generation
const USE_CACHED_RESPONSE = true;

import type { StructuredItineraryResponse } from "@/types/structured-itinerary";

// ============================================
// GENERATE FUNCTION (always uses Tokyo cache for testing)
// ============================================

async function generateStructuredItinerary(
  _context: TripContext
): Promise<StructuredItineraryResponse> {
  // Always use cached Tokyo response for testing
  console.log("[API] Using CACHED Tokyo response (dev mode)");

  // Calculate metadata from cached data
  const totalDays = CACHED_ITINERARY.days.length;
  const totalSlots = CACHED_ITINERARY.days.reduce(
    (sum: number, day: DayWithOptions) => sum + day.slots.length,
    0
  );
  const totalOptions = CACHED_ITINERARY.days.reduce(
    (sum: number, day: DayWithOptions) =>
      sum + day.slots.reduce((s: number, slot: SlotWithOptions) => s + slot.options.length, 0),
    0
  );

  return {
    message: CACHED_MESSAGE,
    itinerary: CACHED_ITINERARY,
    metadata: {
      generatedAt: new Date().toISOString(),
      hasPlaces: true,
      hasCommute: false,
      hasFoodPreferences: false,
      totalDays,
      totalSlots,
      totalOptions,
    },
  };
}

// ============================================
// PLACE RESOLUTION OPTIONS
// ============================================

interface PlaceResolutionConfig {
  enabled: boolean;
  skipExpensiveProviders: boolean; // Skip Google to save cost
  minConfidence: number;
}

const PLACE_RESOLUTION_CONFIG: PlaceResolutionConfig = {
  enabled: true, // Set to false to disable place resolution
  skipExpensiveProviders: true, // Use free providers first
  minConfidence: 0.5,
};

// ============================================
// ENRICH ITINERARY WITH RESOLVED PLACES
// ============================================

async function enrichItineraryWithResolvedPlaces(
  itinerary: StructuredItineraryData
): Promise<{
  enriched: StructuredItineraryData;
  stats: {
    totalPlaces: number;
    resolved: number;
    failed: number;
    providers: Record<string, number>;
    avgConfidence: number;
    totalDuration: number;
  };
}> {
  if (!PLACE_RESOLUTION_CONFIG.enabled) {
    return {
      enriched: itinerary,
      stats: {
        totalPlaces: 0,
        resolved: 0,
        failed: 0,
        providers: {},
        avgConfidence: 0,
        totalDuration: 0,
      },
    };
  }

  console.log("[API] Resolving places for itinerary...");
  const startTime = Date.now();

  // Resolve all places
  const resolutions = await resolveItineraryPlaces(itinerary, {
    skipExpensiveProviders: PLACE_RESOLUTION_CONFIG.skipExpensiveProviders,
    minConfidence: PLACE_RESOLUTION_CONFIG.minConfidence,
  });

  // Build a lookup map for quick access
  const resolutionMap = new Map<string, ResolvedPlace>();
  const providers: Record<string, number> = {};
  let totalConfidence = 0;
  let resolvedCount = 0;

  for (const res of resolutions) {
    const key = `${res.dayNumber}-${res.slotId}-${res.optionId}`;
    if (res.resolution.resolved) {
      resolutionMap.set(key, res.resolution.resolved);
      resolvedCount++;
      totalConfidence += res.resolution.resolved.confidence;

      // Track provider usage
      const provider = res.resolution.provider;
      providers[provider] = (providers[provider] || 0) + 1;
    }
  }

  // Create enriched itinerary by updating place data
  const enrichedDays: DayWithOptions[] = itinerary.days.map((day) => ({
    ...day,
    slots: day.slots.map((slot) => ({
      ...slot,
      options: slot.options.map((option) => {
        const key = `${day.dayNumber}-${slot.slotId}-${option.id}`;
        const resolved = resolutionMap.get(key);

        if (resolved) {
          // Merge resolved place data into the option
          return {
            ...option,
            activity: {
              ...option.activity,
              place: {
                ...option.activity.place,
                name: resolved.name,
                address: resolved.address,
                neighborhood: resolved.neighborhood,
                coordinates: resolved.coordinates,
                rating: resolved.rating,
                reviewCount: resolved.reviewCount,
                photos: resolved.photos,
                openingHours: resolved.openingHours,
                googlePlaceId: resolved.googlePlaceId,
              },
              // Update source to reflect resolution
              source: resolved.source as ActivityOption["activity"]["source"],
            },
          } as ActivityOption;
        }

        return option;
      }),
    })),
  }));

  const totalDuration = Date.now() - startTime;
  const totalPlaces = resolutions.length;
  const failed = totalPlaces - resolvedCount;
  const avgConfidence = resolvedCount > 0 ? totalConfidence / resolvedCount : 0;

  console.log(
    `[API] Place resolution complete: ${resolvedCount}/${totalPlaces} resolved in ${totalDuration}ms`
  );
  console.log(`[API] Provider breakdown:`, providers);

  return {
    enriched: {
      ...itinerary,
      days: enrichedDays,
    },
    stats: {
      totalPlaces,
      resolved: resolvedCount,
      failed,
      providers,
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      totalDuration,
    },
  };
}

// ============================================
// ADD COMMUTE INFO TO ITINERARY
// ============================================

interface CommuteConfig {
  enabled: boolean;
  defaultMethod: "walk" | "transit" | "taxi" | "drive";
}

const COMMUTE_CONFIG: CommuteConfig = {
  enabled: true,
  defaultMethod: "transit",
};

/**
 * Calculate and add commute information between consecutive slots
 */
async function addCommuteToItinerary(
  itinerary: StructuredItineraryData
): Promise<{
  enriched: StructuredItineraryData;
  stats: {
    totalCommutes: number;
    calculated: number;
    estimated: number;
    totalDuration: number;
  };
}> {
  if (!COMMUTE_CONFIG.enabled) {
    return {
      enriched: itinerary,
      stats: {
        totalCommutes: 0,
        calculated: 0,
        estimated: 0,
        totalDuration: 0,
      },
    };
  }

  console.log("[API] Adding commute information to itinerary...");
  const startTime = Date.now();

  let calculatedCount = 0;
  let estimatedCount = 0;

  const enrichedDays: DayWithOptions[] = [];

  for (const day of itinerary.days) {
    const enrichedSlots: SlotWithOptions[] = [];

    for (let i = 0; i < day.slots.length; i++) {
      const currentSlot = day.slots[i];

      if (i === 0) {
        // First slot has no previous activity
        enrichedSlots.push(currentSlot);
        continue;
      }

      const prevSlot = day.slots[i - 1];

      // Get coordinates from the selected or top-ranked option
      const prevOption = prevSlot.selectedOptionId
        ? prevSlot.options.find((o) => o.id === prevSlot.selectedOptionId)
        : prevSlot.options[0];
      const currentOption = currentSlot.selectedOptionId
        ? currentSlot.options.find((o) => o.id === currentSlot.selectedOptionId)
        : currentSlot.options[0];

      const prevCoords = prevOption?.activity.place?.coordinates;
      const currentCoords = currentOption?.activity.place?.coordinates;

      let commuteInfo: StructuredCommuteInfo | undefined;

      if (
        prevCoords &&
        currentCoords &&
        prevCoords.lat !== 0 &&
        currentCoords.lat !== 0
      ) {
        try {
          // Try to get actual commute duration using routing service
          if (isRoutingConfigured()) {
            // Map our config method to routing service method
            const routingMethod = COMMUTE_CONFIG.defaultMethod === "drive" ? "driving" : COMMUTE_CONFIG.defaultMethod;
            const duration = await getCommuteDuration(
              prevCoords,
              currentCoords,
              routingMethod
            );

            if (duration) {
              commuteInfo = {
                fromPlaceId: prevOption?.activity.place?.googlePlaceId,
                toPlaceId: currentOption?.activity.place?.googlePlaceId,
                duration: Math.round(duration / 60), // Convert seconds to minutes
                distance: estimateDistance(prevCoords, currentCoords),
                method: COMMUTE_CONFIG.defaultMethod,
                instructions: `${prevOption?.activity.place?.neighborhood || "Previous location"} → ${currentOption?.activity.place?.neighborhood || "Next location"}`,
              };
              calculatedCount++;
            }
          }

          // Fallback: estimate based on distance
          if (!commuteInfo) {
            const distance = estimateDistance(prevCoords, currentCoords);
            const estimatedDuration = estimateDuration(distance, COMMUTE_CONFIG.defaultMethod);

            commuteInfo = {
              fromPlaceId: prevOption?.activity.place?.googlePlaceId,
              toPlaceId: currentOption?.activity.place?.googlePlaceId,
              duration: estimatedDuration,
              distance,
              method: distance < 1000 ? "walk" : COMMUTE_CONFIG.defaultMethod,
              instructions: `${prevOption?.activity.place?.neighborhood || "Previous location"} → ${currentOption?.activity.place?.neighborhood || "Next location"} (~${estimatedDuration} min)`,
            };
            estimatedCount++;
          }
        } catch (error) {
          console.warn(`[API] Failed to calculate commute for slot ${i}:`, error);
          // Use estimate as fallback
          const distance = estimateDistance(prevCoords, currentCoords);
          const estimatedDuration = estimateDuration(distance, COMMUTE_CONFIG.defaultMethod);

          commuteInfo = {
            duration: estimatedDuration,
            distance,
            method: distance < 1000 ? "walk" : COMMUTE_CONFIG.defaultMethod,
            instructions: `~${estimatedDuration} min`,
          };
          estimatedCount++;
        }
      } else {
        // No coordinates available, use a default estimate based on slot types
        const defaultDurations: Record<string, number> = {
          morning: 15,
          lunch: 10,
          afternoon: 20,
          dinner: 15,
          evening: 15,
        };

        commuteInfo = {
          duration: defaultDurations[currentSlot.slotType] || 15,
          distance: 2000, // Assume ~2km
          method: "transit",
          instructions: "Travel to next activity",
        };
        estimatedCount++;
      }

      enrichedSlots.push({
        ...currentSlot,
        commuteFromPrevious: commuteInfo,
      });
    }

    enrichedDays.push({
      ...day,
      slots: enrichedSlots,
    });
  }

  const totalDuration = Date.now() - startTime;
  const totalCommutes = calculatedCount + estimatedCount;

  console.log(
    `[API] Commute calculation complete: ${totalCommutes} commutes (${calculatedCount} calculated, ${estimatedCount} estimated) in ${totalDuration}ms`
  );

  return {
    enriched: {
      ...itinerary,
      days: enrichedDays,
    },
    stats: {
      totalCommutes,
      calculated: calculatedCount,
      estimated: estimatedCount,
      totalDuration,
    },
  };
}

/**
 * Estimate distance between two coordinates using Haversine formula
 */
function estimateDistance(
  from: { lat: number; lng: number },
  to: { lat: number; lng: number }
): number {
  const R = 6371000; // Earth's radius in meters
  const dLat = ((to.lat - from.lat) * Math.PI) / 180;
  const dLng = ((to.lng - from.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((from.lat * Math.PI) / 180) *
      Math.cos((to.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Estimate travel duration based on distance and method
 */
function estimateDuration(
  distanceMeters: number,
  method: "walk" | "transit" | "taxi" | "drive"
): number {
  // Average speeds in km/h
  const speeds: Record<string, number> = {
    walk: 4.5, // ~4.5 km/h walking speed
    transit: 25, // ~25 km/h including wait times
    taxi: 30, // ~30 km/h in city traffic
    drive: 30,
  };

  const speedKmh = speeds[method] || 20;
  const distanceKm = distanceMeters / 1000;
  const durationHours = distanceKm / speedKmh;
  const durationMinutes = Math.round(durationHours * 60);

  // Add wait time for transit
  if (method === "transit") {
    return Math.max(durationMinutes + 5, 10); // At least 10 min for transit
  }

  // Minimum 5 minutes for any trip
  return Math.max(durationMinutes, 5);
}

// ============================================
// REQUEST VALIDATION
// ============================================

interface GenerateStructuredRequest {
  destination: string;
  startDate: string;
  endDate: string;
  travelers: {
    adults: number;
    children?: number;
    childrenAges?: number[];
  };
  budget?: "budget" | "moderate" | "luxury";
  pace?: "relaxed" | "moderate" | "packed";
  interests?: string[];
  dietaryRestrictions?: string[];
  tripMode?: string;
}

function validateRequest(
  body: unknown
): { valid: true; data: TripContext } | { valid: false; error: string } {
  if (!body || typeof body !== "object") {
    return { valid: false, error: "Request body is required" };
  }

  const req = body as GenerateStructuredRequest;

  if (!req.destination || typeof req.destination !== "string") {
    return { valid: false, error: "Destination is required" };
  }

  if (!req.startDate || !req.endDate) {
    return { valid: false, error: "Start and end dates are required" };
  }

  // Validate dates using centralized validation (ensures future dates only)
  const dateValidation = validateTripDates(req.startDate, req.endDate);
  if (!dateValidation.valid) {
    return { valid: false, error: dateValidation.error!.message };
  }

  // Build validated request
  const data: TripContext = {
    destination: req.destination,
    startDate: req.startDate,
    endDate: req.endDate,
    travelers: {
      adults: req.travelers?.adults ?? 2,
      children: req.travelers?.children ?? 0,
      childrenAges: req.travelers?.childrenAges,
    },
    budget: req.budget || "moderate",
    pace: req.pace || "moderate",
    interests: req.interests || [],
    dietaryRestrictions: req.dietaryRestrictions,
    tripMode: req.tripMode,
  };

  return { valid: true, data };
}

// ============================================
// ROUTE HANDLER
// ============================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate request
    const validation = validateRequest(body);
    if (!validation.valid) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "INVALID_REQUEST", message: validation.error },
        },
        { status: 400 }
      );
    }

    console.log("[API] Generating structured itinerary for:", validation.data.destination);

    // Generate the structured itinerary
    const result = await generateStructuredItinerary(validation.data);

    // Check for errors
    if (result.parseError && !result.itinerary) {
      console.error("[API] Itinerary generation failed:", result.parseError);
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "GENERATION_ERROR",
            message: result.parseError,
            fallbackMessage: result.message,
          },
        },
        { status: 500 }
      );
    }

    // Phase 2: Enrich itinerary with resolved place data
    let finalItinerary = result.itinerary;
    let placeResolutionStats = null;
    let commuteStats = null;

    if (result.itinerary && PLACE_RESOLUTION_CONFIG.enabled) {
      try {
        const enrichmentResult = await enrichItineraryWithResolvedPlaces(result.itinerary);
        finalItinerary = enrichmentResult.enriched;
        placeResolutionStats = enrichmentResult.stats;
      } catch (enrichError) {
        console.error("[API] Place resolution failed (continuing with AI data):", enrichError);
        // Continue with original itinerary if place resolution fails
      }
    }

    // Phase 3: Add commute information between activities
    if (finalItinerary && COMMUTE_CONFIG.enabled) {
      try {
        const commuteResult = await addCommuteToItinerary(finalItinerary);
        finalItinerary = commuteResult.enriched;
        commuteStats = commuteResult.stats;
      } catch (commuteError) {
        console.error("[API] Commute calculation failed (continuing without commute data):", commuteError);
        // Continue without commute data if calculation fails
      }
    }

    // Return success response
    return NextResponse.json({
      success: true,
      data: {
        message: result.message,
        itinerary: finalItinerary,
        metadata: {
          ...result.metadata,
          hasCommute: commuteStats ? commuteStats.totalCommutes > 0 : false,
          placeResolution: placeResolutionStats,
          commuteCalculation: commuteStats,
        },
      },
    });
  } catch (error) {
    console.error("[API] Error generating structured itinerary:", error);

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "GENERATION_ERROR",
          message: error instanceof Error ? error.message : "Failed to generate itinerary",
        },
      },
      { status: 500 }
    );
  }
}

// ============================================
// GET - Check API status
// ============================================

export async function GET() {
  return NextResponse.json({
    success: true,
    data: {
      endpoint: "/api/itinerary/generate-structured",
      description: "Generate structured itineraries with multiple options per time slot",
      version: "1.0.0",
      features: [
        "Multiple ranked options per slot",
        "Place data with coordinates",
        "Dietary restriction filtering",
        "Match reasons and tradeoffs",
      ],
      exampleRequest: {
        destination: "Tokyo, Japan",
        startDate: "2025-03-15",
        endDate: "2025-03-20",
        travelers: { adults: 2, children: 1, childrenAges: [8] },
        budget: "moderate",
        pace: "moderate",
        interests: ["food", "culture", "anime"],
        dietaryRestrictions: ["vegetarian"],
        tripMode: "family",
      },
    },
  });
}
