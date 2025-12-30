#!/usr/bin/env node

/**
 * Test script for generating itinerary JSONs using Ollama
 * with flights, hotels, and activities as anchor constraints
 *
 * Usage:
 *   node scripts/test-ollama-with-anchors.mjs
 *
 * Requires Ollama running locally with a model like qwen2.5:7b or llama3.1
 */

import OpenAI from "openai";
import fs from "fs/promises";
import path from "path";

// ===========================================
// Configuration
// ===========================================

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b";

const ollama = new OpenAI({
    baseURL: OLLAMA_BASE_URL,
    apiKey: "ollama",
});

// ===========================================
// Sample Test Inputs with Anchors
// ===========================================

const TEST_INPUTS = [{
        name: "Tokyo Weekend with teamLab",
        input: {
            prompt: "Weekend trip to Tokyo, love art and ramen",
            budgetTier: "moderate",
            travelers: { adults: 2, children: 0 },
            flights: [{
                    id: "flight-1",
                    from: "SFO",
                    to: "NRT",
                    date: "2025-03-14",
                    time: "11:00",
                    flightNumber: "JL001"
                },
                {
                    id: "flight-2",
                    from: "NRT",
                    to: "SFO",
                    date: "2025-03-17",
                    time: "17:00",
                    flightNumber: "JL002"
                }
            ],
            hotels: [{
                id: "hotel-1",
                city: "Tokyo",
                name: "Shibuya Excel Hotel Tokyu",
                checkIn: "2025-03-14",
                checkOut: "2025-03-17",
                address: "1-12-2 Dogenzaka, Shibuya"
            }],
            activities: [{
                id: "activity-1",
                name: "teamLab Planets",
                category: "experience",
                city: "Tokyo",
                date: "2025-03-15",
                startTime: "14:00",
                duration: 120,
                confirmationNumber: "TLP-123456",
                notes: "Arrive 30 minutes early"
            }],
            mustHave: ["Shibuya Crossing", "ramen", "Meiji Shrine"],
            mustAvoid: ["crowded tourist traps"]
        }
    },
    {
        name: "Japan Multi-City with Shinkansen",
        input: {
            prompt: "10-day Japan trip covering Tokyo, Kyoto, and Osaka. Love temples, food, and traditional culture.",
            budgetTier: "luxury",
            travelers: { adults: 2, children: 0 },
            flights: [{
                    id: "flight-1",
                    from: "LAX",
                    to: "NRT",
                    date: "2025-04-15",
                    time: "13:00",
                    flightNumber: "NH105"
                },
                {
                    id: "flight-2",
                    from: "KIX",
                    to: "LAX",
                    date: "2025-04-25",
                    time: "11:00",
                    flightNumber: "NH106"
                }
            ],
            hotels: [{
                    id: "hotel-1",
                    city: "Tokyo",
                    name: "Park Hyatt Tokyo",
                    checkIn: "2025-04-15",
                    checkOut: "2025-04-19",
                    address: "3-7-1-2 Nishi Shinjuku"
                },
                {
                    id: "hotel-2",
                    city: "Kyoto",
                    name: "The Ritz-Carlton Kyoto",
                    checkIn: "2025-04-19",
                    checkOut: "2025-04-23",
                    address: "Kamogawa Nijo-Ohashi Hotori"
                },
                {
                    id: "hotel-3",
                    city: "Osaka",
                    name: "Conrad Osaka",
                    checkIn: "2025-04-23",
                    checkOut: "2025-04-25",
                    address: "3-2-4 Nakanoshima, Kita-ku"
                }
            ],
            activities: [{
                    id: "activity-1",
                    name: "Kaiseki Dinner at Kikunoi",
                    category: "restaurant",
                    city: "Kyoto",
                    date: "2025-04-20",
                    startTime: "19:00",
                    duration: 150,
                    confirmationNumber: "KK-789",
                    notes: "Michelin 3-star, dress code smart casual"
                },
                {
                    id: "activity-2",
                    name: "Fushimi Inari Shrine Early Morning Tour",
                    category: "tour",
                    city: "Kyoto",
                    date: "2025-04-21",
                    startTime: "06:00",
                    duration: 180,
                    notes: "Private guide, beat the crowds"
                }
            ],
            mustHave: ["Senso-ji", "Arashiyama Bamboo Grove", "Osaka street food", "Golden Pavilion"],
            mustAvoid: ["chain restaurants", "overly touristy areas"]
        }
    },
    {
        name: "Quick Kyoto Temple Run",
        input: {
            prompt: "3 days in Kyoto focused on temples, zen gardens, and traditional tea",
            budgetTier: "moderate",
            travelers: { adults: 1, children: 0 },
            flights: [],
            hotels: [{
                id: "hotel-1",
                city: "Kyoto",
                name: "Hotel Granvia Kyoto",
                checkIn: "2025-05-10",
                checkOut: "2025-05-13",
                address: "Karasuma-dori Shiokoji-sagaru, Shimogyo-ku"
            }],
            activities: [{
                id: "activity-1",
                name: "Tea Ceremony Experience",
                category: "experience",
                city: "Kyoto",
                date: "2025-05-11",
                startTime: "10:00",
                duration: 90,
                notes: "Traditional tea house in Gion"
            }],
            mustHave: ["Kinkaku-ji", "Ryoan-ji rock garden", "Gion district"],
            mustAvoid: []
        }
    }
];

// ===========================================
// System Prompt for Itinerary Generation
// ===========================================

const SYSTEM_PROMPT = `You are an expert travel planner. Generate detailed day-by-day itineraries in JSON format.

CRITICAL REQUIREMENTS:
1. RESPECT ALL ANCHORS - flights, hotels, and booked activities are FIXED and cannot be changed
2. Plan activities AROUND the anchors, not conflicting with them
3. Consider travel time between locations
4. Include breakfast, lunch, and dinner for each day
5. Match the budget tier in your recommendations
6. Include coordinates for all places (use realistic approximate coordinates)
7. Provide 2-4 options per time slot with ranking

Your response must be ONLY valid JSON, no markdown, no explanation text.`;

// ===========================================
// Build Prompt with Anchors
// ===========================================

function buildPromptWithAnchors(testInput) {
    const { input } = testInput;

    // Calculate trip dates from hotels or flights
    let startDate, endDate;
    if (input.hotels.length > 0) {
        startDate = input.hotels[0].checkIn;
        endDate = input.hotels[input.hotels.length - 1].checkOut;
    } else if (input.flights.length > 0) {
        startDate = input.flights[0].date;
        endDate = input.flights[input.flights.length - 1].date;
    }

    const startDateObj = new Date(startDate);
    const endDateObj = new Date(endDate);
    const numberOfDays = Math.ceil((endDateObj - startDateObj) / (1000 * 60 * 60 * 24)) + 1;

    // Extract cities from hotels
    const cities = [...new Set(input.hotels.map(h => h.city))];

    let prompt = `Create a ${numberOfDays}-day travel itinerary.

USER REQUEST: "${input.prompt}"

TRIP DETAILS:
- Dates: ${startDate} to ${endDate} (${numberOfDays} days)
- Cities: ${cities.join(", ")}
- Travelers: ${input.travelers.adults} adults${input.travelers.children > 0 ? `, ${input.travelers.children} children` : ""}
- Budget: ${input.budgetTier}
`;

  // Add flight anchors
  if (input.flights.length > 0) {
    prompt += `\n⚓ FLIGHT ANCHORS (FIXED - plan around these):\n`;
    for (const flight of input.flights) {
      prompt += `- ${flight.date} ${flight.time || ""}: ${flight.from} → ${flight.to}${flight.flightNumber ? ` (${flight.flightNumber})` : ""}\n`;
    }
  }

  // Add hotel anchors
  if (input.hotels.length > 0) {
    prompt += `\n⚓ HOTEL ANCHORS (FIXED - base activities from these locations):\n`;
    for (const hotel of input.hotels) {
      prompt += `- ${hotel.city}: ${hotel.name} (${hotel.checkIn} to ${hotel.checkOut})\n`;
      if (hotel.address) prompt += `  Address: ${hotel.address}\n`;
    }
  }

  // Add activity anchors
  if (input.activities.length > 0) {
    prompt += `\n⚓ BOOKED ACTIVITY ANCHORS (FIXED - schedule other activities around these):\n`;
    for (const activity of input.activities) {
      prompt += `- ${activity.date} ${activity.startTime}: ${activity.name} in ${activity.city}`;
      if (activity.duration) prompt += ` (${activity.duration} min)`;
      if (activity.notes) prompt += `\n  Note: ${activity.notes}`;
      prompt += "\n";
    }
  }

  // Add preferences
  if (input.mustHave?.length > 0) {
    prompt += `\n✅ MUST INCLUDE: ${input.mustHave.join(", ")}\n`;
  }
  if (input.mustAvoid?.length > 0) {
    prompt += `\n❌ MUST AVOID: ${input.mustAvoid.join(", ")}\n`;
  }

  // Add output format
  prompt += `
OUTPUT FORMAT:
Generate a JSON object with this exact structure:
{
  "destination": "Main destination",
  "country": "Country name",
  "tripType": "single-city" or "multi-city",
  "cities": ["City1", "City2"],
  "accommodations": {
    "CityName": {
      "name": "Hotel name",
      "address": "Full address",
      "neighborhood": "Neighborhood",
      "coordinates": { "lat": 35.6762, "lng": 139.6503 },
      "checkIn": "15:00",
      "checkOut": "11:00",
      "type": "hotel",
      "rating": 4.5
    }
  },
  "days": [
    {
      "dayNumber": 1,
      "date": "2025-03-14",
      "city": "Tokyo",
      "title": "Day theme/title",
      "accommodation": { ...hotel info for this night... },
      "commuteFromHotel": { "duration": 20, "distance": 2000, "method": "transit", "instructions": "..." },
      "commuteToHotel": { "duration": 15, "distance": 1500, "method": "walk", "instructions": "..." },
      "slots": [
        {
          "slotId": "day1-morning",
          "slotType": "morning",
          "timeRange": { "start": "09:00", "end": "12:00" },
          "options": [
            {
              "id": "opt-1-1",
              "rank": 1,
              "score": 90,
              "activity": {
                "name": "Activity name",
                "description": "Description",
                "category": "temple|restaurant|attraction|shopping|nature|nightlife|activity",
                "duration": 90,
                "place": {
                  "name": "Venue name",
                  "address": "Full address",
                  "neighborhood": "Area",
                  "coordinates": { "lat": 35.6762, "lng": 139.6503 },
                  "rating": 4.5,
                  "reviewCount": 1000
                },
                "isFree": true,
                "estimatedCost": { "amount": 1000, "currency": "JPY" },
                "tags": ["cultural", "outdoor"],
                "source": "ai"
              },
              "matchReasons": ["Reason 1", "Reason 2"],
              "tradeoffs": ["Tradeoff 1"]
            }
          ],
          "selectedOptionId": null,
          "commuteFromPrevious": null
        }
      ]
    }
  ],
  "generalTips": ["Tip 1", "Tip 2"],
  "estimatedBudget": {
    "total": { "min": 100000, "max": 200000 },
    "currency": "JPY",
    "breakdown": {
      "activities": { "min": 20000, "max": 40000 },
      "food": { "min": 40000, "max": 80000 },
      "transport": { "min": 30000, "max": 60000 }
    }
  }
}

IMPORTANT:
- For booked activities, include them as the ONLY option in their time slot with rank 1 and score 100
- Use realistic coordinates for Japan (Tokyo: ~35.68, 139.69; Kyoto: ~35.01, 135.77; Osaka: ~34.69, 135.50)
- Include commute info between activities
- Slot types: morning, breakfast, lunch, afternoon, dinner, evening

Generate the complete itinerary now. Respond with ONLY the JSON, no other text.`;

  return prompt;
}

// ===========================================
// Extract JSON from Response
// ===========================================

function extractJsonFromResponse(content) {
  // Try to find JSON in code blocks
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    return codeBlockMatch[1].trim();
  }

  // Try to find JSON between braces
  const jsonMatch = content.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  return content.trim();
}

// ===========================================
// Repair Common JSON Issues
// ===========================================

function repairJson(jsonStr) {
  let repaired = jsonStr.trim();

  // Remove trailing commas before } or ]
  repaired = repaired.replace(/,(\s*[}\]])/g, "$1");

  // Balance braces
  const openBraces = (repaired.match(/\{/g) || []).length;
  const closeBraces = (repaired.match(/\}/g) || []).length;
  for (let i = 0; i < openBraces - closeBraces; i++) {
    repaired += "}";
  }

  const openBrackets = (repaired.match(/\[/g) || []).length;
  const closeBrackets = (repaired.match(/\]/g) || []).length;
  for (let i = 0; i < openBrackets - closeBrackets; i++) {
    repaired += "]";
  }

  return repaired;
}

// ===========================================
// Generate Itinerary
// ===========================================

async function generateItinerary(testInput) {
  console.log(`\n${"=".repeat(60)}`);
  console.log(`📍 Generating: ${testInput.name}`);
  console.log(`${"=".repeat(60)}`);

  const prompt = buildPromptWithAnchors(testInput);
  console.log("\n📝 Prompt preview (first 500 chars):");
  console.log(prompt.substring(0, 500) + "...\n");

  const startTime = Date.now();

  try {
    console.log(`🤖 Calling Ollama (${OLLAMA_MODEL})...`);

    const response = await ollama.chat.completions.create({
      model: OLLAMA_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: prompt }
      ],
      temperature: 0.7,
      max_tokens: 8000,
    });

    const content = response.choices[0]?.message?.content;
    const durationMs = Date.now() - startTime;

    console.log(`✅ Response received in ${(durationMs / 1000).toFixed(1)}s`);
    console.log(`📊 Tokens: ${response.usage?.total_tokens || "N/A"}`);

    if (!content) {
      throw new Error("No content in response");
    }

    // Extract and parse JSON
    const jsonContent = extractJsonFromResponse(content);
    const repairedJson = repairJson(jsonContent);

    let itinerary;
    try {
      itinerary = JSON.parse(repairedJson);
    } catch (parseError) {
      console.log("\n⚠️ JSON parse error, saving raw response for debugging...");
      const debugPath = `output/debug-${testInput.name.replace(/\s+/g, "-").toLowerCase()}.txt`;
      await fs.mkdir("output", { recursive: true });
      await fs.writeFile(debugPath, content);
      console.log(`   Saved to: ${debugPath}`);
      throw parseError;
    }

    // Validate structure
    console.log("\n📋 Itinerary Summary:");
    console.log(`   Destination: ${itinerary.destination || "N/A"}`);
    console.log(`   Days: ${itinerary.days?.length || 0}`);
    console.log(`   Cities: ${itinerary.cities?.join(", ") || "N/A"}`);

    if (itinerary.days?.length > 0) {
      let totalSlots = 0;
      let totalOptions = 0;
      for (const day of itinerary.days) {
        totalSlots += day.slots?.length || 0;
        for (const slot of day.slots || []) {
          totalOptions += slot.options?.length || 0;
        }
      }
      console.log(`   Total Slots: ${totalSlots}`);
      console.log(`   Total Options: ${totalOptions}`);
    }

    // Save to file
    const outputDir = "output";
    await fs.mkdir(outputDir, { recursive: true });
    const filename = `itinerary-${testInput.name.replace(/\s+/g, "-").toLowerCase()}.json`;
    const outputPath = path.join(outputDir, filename);
    await fs.writeFile(outputPath, JSON.stringify(itinerary, null, 2));
    console.log(`\n💾 Saved to: ${outputPath}`);

    return { success: true, itinerary, outputPath };

  } catch (error) {
    console.error(`\n❌ Error: ${error.message}`);
    return { success: false, error: error.message };
  }
}

// ===========================================
// Check Ollama Health
// ===========================================

async function checkOllamaHealth() {
  console.log("🔍 Checking Ollama availability...");

  try {
    const response = await fetch(`${OLLAMA_BASE_URL.replace("/v1", "")}/api/tags`);

    if (!response.ok) {
      console.error(`❌ Ollama returned status ${response.status}`);
      return false;
    }

    const data = await response.json();
    const models = data.models?.map(m => m.name) || [];

    console.log(`✅ Ollama is running`);
    console.log(`📦 Available models: ${models.join(", ") || "none"}`);

    if (!models.some(m => m.includes(OLLAMA_MODEL.split(":")[0]))) {
      console.warn(`⚠️ Model "${OLLAMA_MODEL}" not found. Available: ${models.join(", ")}`);
      console.warn(`   Try: ollama pull ${OLLAMA_MODEL}`);
    }

    return true;
  } catch (error) {
    console.error(`❌ Cannot connect to Ollama: ${error.message}`);
    console.error(`   Make sure Ollama is running: ollama serve`);
    return false;
  }
}

// ===========================================
// Main
// ===========================================

async function main() {
  console.log(`
╔══════════════════════════════════════════════════════════╗
║  Ollama Itinerary Generator Test                         ║
║  Testing with flights, hotels, and activities as anchors ║
╚══════════════════════════════════════════════════════════╝
`);

  console.log(`Configuration:`);
  console.log(`  OLLAMA_BASE_URL: ${OLLAMA_BASE_URL}`);
  console.log(`  OLLAMA_MODEL: ${OLLAMA_MODEL}`);
  console.log("");

  // Check Ollama health
  const isHealthy = await checkOllamaHealth();
  if (!isHealthy) {
    process.exit(1);
  }

  // Parse command line args
  const args = process.argv.slice(2);
  const testIndex = args.length > 0 ? parseInt(args[0]) : null;

  const testsToRun = testIndex !== null
    ? [TEST_INPUTS[testIndex]]
    : TEST_INPUTS;

  if (testIndex !== null) {
    console.log(`\n🎯 Running test #${testIndex}: ${testsToRun[0]?.name || "Unknown"}`);
  } else {
    console.log(`\n🎯 Running all ${TEST_INPUTS.length} tests`);
  }

  // Run tests
  const results = [];
  for (let i = 0; i < testsToRun.length; i++) {
    const testInput = testsToRun[i];
    if (!testInput) {
      console.error(`❌ Test #${testIndex} not found`);
      continue;
    }
    const result = await generateItinerary(testInput);
    results.push({ name: testInput.name, ...result });
  }

  // Summary
  console.log(`\n${"=".repeat(60)}`);
  console.log("📊 RESULTS SUMMARY");
  console.log(`${"=".repeat(60)}`);

  for (const result of results) {
    const status = result.success ? "✅" : "❌";
    console.log(`${status} ${result.name}`);
    if (result.success && result.outputPath) {
      console.log(`   → ${result.outputPath}`);
    }
    if (!result.success && result.error) {
      console.log(`   → Error: ${result.error}`);
    }
  }

  const successCount = results.filter(r => r.success).length;
  console.log(`\n${successCount}/${results.length} tests passed`);
}

main().catch(console.error);