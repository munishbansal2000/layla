#!/usr/bin/env node

/**
 * End-to-End Itinerary Generation Flow Test
 *
 * Tests the complete pipeline:
 * 1. Convert user prompt to request structure using Ollama
 * 2. Infer transfers from structure
 * 3. Create ChatGPT prompt with constraints
 * 4. Check cache
 * 5. Generate response JSON using LLM
 * 6. Post-process (inject transfers, anchors)
 * 7. Verify the result
 *
 * Usage:
 *   node scripts/test-e2e-itinerary-flow.mjs
 *   node scripts/test-e2e-itinerary-flow.mjs --skip-cache
 *   node scripts/test-e2e-itinerary-flow.mjs --dry-run
 */

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";

// ===========================================
// Configuration
// ===========================================

const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b";
const OPENAI_MODEL = process.env.OPENAI_MODEL || "gpt-4o-mini";
const CACHE_DIR = "output/.cache";
const OUTPUT_DIR = "output";

const args = process.argv.slice(2);
const SKIP_CACHE = args.includes("--skip-cache");
const DRY_RUN = args.includes("--dry-run");

// ===========================================
// Test Prompts (Natural Language User Input)
// ===========================================

const TEST_PROMPTS = [{
        name: "Family Japan Trip with Kids",
        userPrompt: `5 days in Japan for 2 adults and 2 kids (ages 8 and 12), starting March 15 2026.
We're flying from SFO to Tokyo Narita on March 15, arriving at 3pm.
Return flight from Kyoto on March 20 at 10am.

We have a hotel booked in Tokyo from March 15-18 at Park Hyatt Tokyo, then moving to Kyoto at Ritz-Carlton from March 18-20.

We already booked:
- teamLab Planets on March 16 at 2pm
- Sushi-making class at Tokyo Sushi Academy on March 17 at 11am
- Fushimi Inari sunrise tour on March 19 at 5:30am

We love ramen, temples, anime, and art. The kids are really into Pokemon and gaming.
We're vegetarian so no meat, but fish is okay.
Budget is moderate but we'll splurge on special experiences.
Keep the pace relaxed since we're traveling with kids.

Must visit: Senso-ji Temple, Arashiyama Bamboo Grove, Nara Deer Park, Nintendo Store
Please avoid: crowded tourist traps, any sushi restaurants (we don't like raw fish), theme parks`,
        expectedCities: ["Tokyo", "Kyoto"],
        expectedDays: 5,
        expectedAnchors: ["teamLab Planets", "Tokyo Sushi Academy", "Fushimi Inari"],
        expectedTransfers: ["airport_arrival", "inter_city", "airport_departure"],
        // Additional validations for this specific test
        expectedMustHave: ["Senso-ji", "Arashiyama", "Nara", "Nintendo"],
        expectedMustAvoid: ["sushi restaurant", "theme park"],
        dietaryRestrictions: ["vegetarian", "pescatarian"],
    },
    {
        name: "Simple Tokyo Trip",
        userPrompt: `5 days in Tokyo for 2 adults. Flying from SFO on March 15, returning March 20.
We love food, anime, and technology. Moderate budget.`,
        expectedCities: ["Tokyo"],
        expectedDays: 5,
    },
    {
        name: "Multi-City Japan with Anchors",
        userPrompt: `10 day trip to Japan visiting Tokyo (4 days), Kyoto (4 days), and Osaka (2 days).
Flying into Tokyo NRT on April 15 at 2:30pm, departing Osaka KIX on April 25 at 11am.

We have these bookings:
- Hotel: Park Hyatt Tokyo, April 15-19
- Hotel: Ritz Carlton Kyoto, April 19-23
- Hotel: Conrad Osaka, April 23-25
- Activity: teamLab Planets on April 16 at 2pm
- Activity: Fushimi Inari sunrise tour on April 20 at 6am (in Kyoto)
- Restaurant: Kaiseki dinner at Kikunoi on April 21 at 7pm

2 adults, luxury budget. Love temples, traditional culture, and high-end food.
Must visit: Golden Pavilion, Arashiyama Bamboo Grove, Osaka Castle
Avoid: tourist traps, chain restaurants`,
        expectedCities: ["Tokyo", "Kyoto", "Osaka"],
        expectedDays: 10,
        expectedAnchors: ["teamLab Planets", "Fushimi Inari", "Kaiseki", "Kikunoi"],
        expectedTransfers: ["airport_arrival", "inter_city", "inter_city", "airport_departure"],
    },
    {
        name: "Quick Kyoto Weekend",
        userPrompt: `Weekend in Kyoto, 3 days. Already in Japan (no flights needed).
Staying at Hotel Granvia Kyoto from May 10-13.
Want to do a tea ceremony on May 11 at 10am.
Solo traveler, interested in zen gardens and temples.`,
        expectedCities: ["Kyoto"],
        expectedDays: 3,
        expectedAnchors: ["tea ceremony"],
    },
];

// ===========================================
// Step 1: Parse User Prompt with Ollama
// ===========================================

const PARSE_SYSTEM_PROMPT = `You are a travel data extraction assistant. Parse the user's travel description and extract structured data.

Output JSON with this exact structure:
{
  "prompt": "Brief summary of the trip",
  "budgetTier": "budget" | "moderate" | "luxury",
  "travelers": { "adults": number, "children": [] },
  "flights": [
    { "id": "flight-1", "from": "AIRPORT_CODE", "to": "AIRPORT_CODE", "date": "YYYY-MM-DD", "time": "HH:mm", "flightNumber": "optional" }
  ],
  "hotels": [
    { "id": "hotel-1", "name": "Hotel Name", "city": "City", "checkIn": "YYYY-MM-DD", "checkOut": "YYYY-MM-DD", "address": "optional" }
  ],
  "activities": [
    { "id": "activity-1", "name": "Activity Name", "city": "City", "date": "YYYY-MM-DD", "startTime": "HH:mm", "duration": minutes, "category": "experience|restaurant|tour", "notes": "optional" }
  ],
  "interests": ["interest1", "interest2"],
  "mustHave": ["place1", "place2"],
  "mustAvoid": ["thing1", "thing2"]
}

IMPORTANT:
- Use real airport codes (NRT, HND, KIX, etc.)
- Convert relative dates to absolute dates (assume current year)
- Extract ALL mentioned bookings, flights, hotels, and activities
- If time not specified, make reasonable guesses based on activity type
- Infer cities from hotels and activities
- Output ONLY valid JSON, no markdown or explanation`;

async function parseUserPromptWithOllama(userPrompt) {
    console.log("\n📝 Step 1: Parsing user prompt with Ollama...");
    console.log(`   Model: ${OLLAMA_MODEL}`);
    console.log(`   Prompt: "${userPrompt.substring(0, 100)}..."`);

    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages: [
                { role: "system", content: PARSE_SYSTEM_PROMPT },
                { role: "user", content: userPrompt },
            ],
            stream: false,
            options: {
                temperature: 0.3,
                num_predict: 4000,
            },
        }),
    });

    if (!response.ok) {
        throw new Error(`Ollama request failed: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const content = data.message ? .content || "";

    console.log(`   ✅ Response received (${content.length} chars)`);

    // Extract JSON from response
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error("No JSON found in Ollama response");
    }

    const parsed = JSON.parse(jsonMatch[0]);
    console.log(`   ✅ Parsed successfully:`);
    console.log(`      - Flights: ${parsed.flights?.length || 0}`);
    console.log(`      - Hotels: ${parsed.hotels?.length || 0}`);
    console.log(`      - Activities: ${parsed.activities?.length || 0}`);
    console.log(`      - Interests: ${parsed.interests?.join(", ") || "none"}`);

    return parsed;
}

// ===========================================
// Step 2: Infer Transfers
// ===========================================

function inferTransfers(parsedInput) {
    console.log("\n🚄 Step 2: Inferring transfers from structure...");

    const transfers = [];
    const { flights, hotels } = parsedInput;

    // Sort hotels by check-in
    const sortedHotels = [...(hotels || [])].sort((a, b) =>
        a.checkIn.localeCompare(b.checkIn)
    );

    // Sort flights by date
    const sortedFlights = [...(flights || [])].sort((a, b) =>
        a.date.localeCompare(b.date)
    );

    // Airport arrival transfer (first flight)
    if (sortedFlights.length > 0) {
        const arrivalFlight = sortedFlights[0];
        const firstHotel = sortedHotels[0];

        if (arrivalFlight.to) {
            transfers.push({
                type: "airport_arrival",
                date: arrivalFlight.date,
                fromCity: getAirportCity(arrivalFlight.to),
                toCity: firstHotel ? .city || getAirportCity(arrivalFlight.to),
                mode: getTransferMode(arrivalFlight.to, firstHotel ? .city),
                duration: getTransferDuration(arrivalFlight.to, firstHotel ? .city),
            });
            console.log(`   ✅ Airport arrival: ${arrivalFlight.to} → ${firstHotel?.city || "hotel"}`);
        }
    }

    // Inter-city transfers (between hotels)
    for (let i = 0; i < sortedHotels.length - 1; i++) {
        const fromHotel = sortedHotels[i];
        const toHotel = sortedHotels[i + 1];

        if (fromHotel.city !== toHotel.city) {
            transfers.push({
                type: "inter_city",
                date: fromHotel.checkOut,
                fromCity: fromHotel.city,
                toCity: toHotel.city,
                mode: "shinkansen",
                duration: getShinkansenDuration(fromHotel.city, toHotel.city),
            });
            console.log(`   ✅ Inter-city: ${fromHotel.city} → ${toHotel.city} (Shinkansen)`);
        }
    }

    // Airport departure transfer (last flight)
    if (sortedFlights.length > 0) {
        const departureFlight = sortedFlights[sortedFlights.length - 1];
        const lastHotel = sortedHotels[sortedHotels.length - 1];

        if (departureFlight.from) {
            transfers.push({
                type: "airport_departure",
                date: departureFlight.date,
                fromCity: lastHotel ? .city || getAirportCity(departureFlight.from),
                toCity: getAirportCity(departureFlight.from),
                mode: getTransferMode(departureFlight.from, lastHotel ? .city),
                duration: getTransferDuration(departureFlight.from, lastHotel ? .city),
            });
            console.log(`   ✅ Airport departure: ${lastHotel?.city || "hotel"} → ${departureFlight.from}`);
        }
    }

    console.log(`   📊 Total transfers inferred: ${transfers.length}`);
    return transfers;
}

// Helper functions for transfer inference
const AIRPORT_CITIES = {
    NRT: "Tokyo",
    HND: "Tokyo",
    KIX: "Osaka",
    ITM: "Osaka",
    NGO: "Nagoya",
    FUK: "Fukuoka",
    CTS: "Sapporo",
};

function getAirportCity(code) {
    return AIRPORT_CITIES[code] || code;
}

function getTransferMode(airportCode, city) {
    if (airportCode === "NRT") return "train"; // Narita Express
    if (airportCode === "HND") return "train"; // Monorail
    if (airportCode === "KIX") return "train"; // Haruka
    return "train";
}

function getTransferDuration(airportCode, city) {
    if (airportCode === "NRT") return 60; // Narita Express ~1h
    if (airportCode === "HND") return 25; // Monorail ~25min
    if (airportCode === "KIX") return 75; // Haruka ~75min
    return 60;
}

const SHINKANSEN_DURATIONS = {
    "Tokyo-Kyoto": 135,
    "Kyoto-Tokyo": 135,
    "Tokyo-Osaka": 150,
    "Osaka-Tokyo": 150,
    "Kyoto-Osaka": 15,
    "Osaka-Kyoto": 15,
    "Tokyo-Hiroshima": 240,
    "Hiroshima-Tokyo": 240,
};

function getShinkansenDuration(from, to) {
    return SHINKANSEN_DURATIONS[`${from}-${to}`] || 120;
}

// ===========================================
// Step 3: Build ChatGPT Request
// ===========================================

function buildItineraryRequest(parsedInput, transfers) {
    console.log("\n📦 Step 3: Building ChatGPT request...");

    const { flights, hotels, activities, interests, mustHave, mustAvoid, budgetTier, travelers } = parsedInput;

    // Extract cities from hotels
    const cities = [...new Set((hotels || []).map(h => h.city))];

    // Calculate dates
    let startDate, endDate, totalDays;
    if (hotels ? .length > 0) {
        startDate = hotels[0].checkIn;
        endDate = hotels[hotels.length - 1].checkOut;
        const start = new Date(startDate);
        const end = new Date(endDate);
        totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    } else if (flights ? .length >= 2) {
        startDate = flights[0].date;
        endDate = flights[flights.length - 1].date;
        const start = new Date(startDate);
        const end = new Date(endDate);
        totalDays = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
    }

    // Convert activities to anchors
    const anchors = (activities || []).map(a => ({
        name: a.name,
        city: a.city,
        date: a.date,
        startTime: a.startTime,
        duration: a.duration,
        category: a.category,
        notes: a.notes,
        isFlexible: false,
    }));

    // Flight time info
    const arrivalFlight = flights ? .[0];
    const departureFlight = flights ? .[flights ? .length - 1];

    const request = {
        cities,
        startDate,
        totalDays,
        pace: "moderate",
        interests: interests || [],
        travelers: travelers || { adults: 2, children: 0 },
        budget: budgetTier || "moderate",
        mustHave: mustHave || [],
        mustAvoid: mustAvoid || [],
        anchors,
        arrivalFlightTime: arrivalFlight ? .time,
        departureFlightTime: departureFlight ? .time,
        arrivalAirport: arrivalFlight ? .to,
        departureAirport: departureFlight ? .from,
        transfers,
        clusterByNeighborhood: true,
    };

    console.log(`   ✅ Request built:`);
    console.log(`      - Cities: ${cities.join(", ")}`);
    console.log(`      - Dates: ${startDate} to ${endDate} (${totalDays} days)`);
    console.log(`      - Anchors: ${anchors.length}`);
    console.log(`      - Transfers: ${transfers.length}`);
    console.log(`      - Arrival: ${arrivalFlight?.time || "N/A"} at ${arrivalFlight?.to || "N/A"}`);
    console.log(`      - Departure: ${departureFlight?.time || "N/A"} from ${departureFlight?.from || "N/A"}`);

    return request;
}

// ===========================================
// Step 4: Check Cache
// ===========================================

function getCacheKey(request) {
    const key = JSON.stringify({
        cities: request.cities,
        startDate: request.startDate,
        totalDays: request.totalDays,
        anchors: request.anchors ? .map(a => a.name),
        transfers: request.transfers ? .length,
    });
    return crypto.createHash("md5").update(key).digest("hex").substring(0, 12);
}

async function checkCache(cacheKey) {
    if (SKIP_CACHE) {
        console.log("\n🗂️  Step 4: Skipping cache (--skip-cache flag)");
        return null;
    }

    console.log("\n🗂️  Step 4: Checking cache...");
    console.log(`   Cache key: ${cacheKey}`);

    try {
        const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
        const cacheContent = await fs.readFile(cachePath, "utf-8");
        const cached = JSON.parse(cacheContent);

        const cacheAge = Date.now() - cached.timestamp;
        const cacheAgeHours = (cacheAge / (1000 * 60 * 60)).toFixed(1);

        console.log(`   ✅ Cache HIT! (${cacheAgeHours}h old)`);
        return cached.itinerary;
    } catch {
        console.log(`   ❌ Cache MISS`);
        return null;
    }
}

async function saveToCache(cacheKey, itinerary) {
    try {
        await fs.mkdir(CACHE_DIR, { recursive: true });
        const cachePath = path.join(CACHE_DIR, `${cacheKey}.json`);
        await fs.writeFile(cachePath, JSON.stringify({
            timestamp: Date.now(),
            itinerary,
        }, null, 2));
        console.log(`   💾 Saved to cache: ${cachePath}`);
    } catch (error) {
        console.warn(`   ⚠️ Failed to save cache: ${error.message}`);
    }
}

// ===========================================
// Step 5: Generate Itinerary with OpenAI/Ollama
// ===========================================

async function generateItinerary(request) {
    console.log("\n🤖 Step 5: Generating itinerary with LLM...");

    if (DRY_RUN) {
        console.log("   [DRY RUN] Skipping actual LLM call");
        return createMockItinerary(request);
    }

    // For this test, we'll call the local API endpoint
    const apiUrl = "http://localhost:3000/api/itinerary/generate-structured";

    console.log(`   API: ${apiUrl}`);
    console.log(`   Sending request...`);

    try {
        const response = await fetch(apiUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                destination: request.cities.join(", ") + ", Japan",
                cities: request.cities,
                startDate: request.startDate,
                endDate: calculateEndDate(request.startDate, request.totalDays),
                pace: request.pace,
                travelers: request.travelers,
                budget: request.budget,
                interests: request.interests,
                mustHave: request.mustHave,
                mustAvoid: request.mustAvoid,
                anchors: request.anchors,
                arrivalFlightTime: request.arrivalFlightTime,
                departureFlightTime: request.departureFlightTime,
                arrivalAirport: request.arrivalAirport,
                departureAirport: request.departureAirport,
                transfers: request.transfers,
                clusterByNeighborhood: request.clusterByNeighborhood,
            }),
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API error ${response.status}: ${errorText}`);
        }

        const data = await response.json();

        if (!data.success || !data.data ? .itinerary) {
            throw new Error(data.error ? .message || "No itinerary in response");
        }

        console.log(`   ✅ Itinerary generated!`);
        return data.data.itinerary;

    } catch (error) {
        console.error(`   ❌ API call failed: ${error.message}`);
        console.log(`   📝 Falling back to direct Ollama call...`);
        return generateWithOllama(request);
    }
}

function calculateEndDate(startDate, totalDays) {
    const start = new Date(startDate);
    start.setDate(start.getDate() + totalDays - 1);
    return start.toISOString().split("T")[0];
}

function createMockItinerary(request) {
    return {
        destination: request.cities.join(", ") + ", Japan",
        country: "Japan",
        days: Array.from({ length: request.totalDays }, (_, i) => ({
            dayNumber: i + 1,
            date: calculateEndDate(request.startDate, i + 1),
            city: request.cities[Math.floor(i * request.cities.length / request.totalDays)] || request.cities[0],
            title: `[DRY RUN] Day ${i + 1}`,
            slots: [{
                slotId: `day${i + 1}-morning`,
                slotType: "morning",
                timeRange: { start: "09:00", end: "12:00" },
                options: [{
                    id: `opt-${i}-1`,
                    rank: 1,
                    score: 80,
                    activity: {
                        name: "[DRY RUN] Mock Activity",
                        description: "Mock activity for dry run",
                        category: "attraction",
                        duration: 120,
                        place: { name: "Mock Place", address: "", neighborhood: "", coordinates: { lat: 35.68, lng: 139.75 }, photos: [] },
                        isFree: true,
                        tags: [],
                        source: "ai",
                    },
                    matchReasons: ["DRY RUN"],
                    tradeoffs: [],
                }],
            }, ],
        })),
        generalTips: ["[DRY RUN] This is a mock itinerary"],
        estimatedBudget: { total: { min: 0, max: 0 }, currency: "JPY" },
    };
}

async function generateWithOllama(request) {
    // Fallback to direct Ollama call if API is not available
    const prompt = buildOllamaPrompt(request);

    const response = await fetch(`${OLLAMA_BASE_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            model: OLLAMA_MODEL,
            messages: [
                { role: "system", content: "You are an expert travel planner. Generate JSON itineraries only." },
                { role: "user", content: prompt },
            ],
            stream: false,
            options: { temperature: 0.7, num_predict: 8000 },
        }),
    });

    const data = await response.json();
    const content = data.message ? .content || "";
    const jsonMatch = content.match(/\{[\s\S]*\}/);

    if (!jsonMatch) {
        throw new Error("No JSON in Ollama response");
    }

    return JSON.parse(jsonMatch[0]);
}

function buildOllamaPrompt(request) {
    return `Generate a ${request.totalDays}-day Japan itinerary.

Cities: ${request.cities.join(", ")}
Start: ${request.startDate}
Budget: ${request.budget}
Pace: ${request.pace}
${request.arrivalFlightTime ? `Arrival: ${request.arrivalFlightTime} at ${request.arrivalAirport}` : ""}
${request.departureFlightTime ? `Departure: ${request.departureFlightTime} from ${request.departureAirport}` : ""}

${request.anchors?.length > 0 ? `ANCHORS (fixed times):
${request.anchors.map(a => `- ${a.name} on ${a.date} at ${a.startTime}`).join("\n")}` : ""}

${request.transfers?.length > 0 ? `TRANSFERS:
${request.transfers.map(t => `- ${t.date}: ${t.fromCity} → ${t.toCity} (${t.mode})`).join("\n")}` : ""}

Return JSON with: { destination, days: [{ dayNumber, date, city, slots: [{ slotId, slotType, options }] }] }`;
}

// ===========================================
// Step 6: Verify Result
// ===========================================

function verifyItinerary(itinerary, expectedData) {
  console.log("\n✅ Step 6: Verifying itinerary...");

  const issues = [];
  const checks = [];

  // Check days count
  const actualDays = itinerary.days?.length || 0;
  if (expectedData.expectedDays && actualDays !== expectedData.expectedDays) {
    issues.push(`Days mismatch: expected ${expectedData.expectedDays}, got ${actualDays}`);
  } else {
    checks.push(`✓ Days: ${actualDays}`);
  }

  // Check cities
  const actualCities = [...new Set(itinerary.days?.map(d => d.city) || [])];
  if (expectedData.expectedCities) {
    const missingCities = expectedData.expectedCities.filter(c => !actualCities.includes(c));
    if (missingCities.length > 0) {
      issues.push(`Missing cities: ${missingCities.join(", ")}`);
    } else {
      checks.push(`✓ Cities: ${actualCities.join(", ")}`);
    }
  }

  // Check anchors
  if (expectedData.expectedAnchors) {
    const allActivityNames = [];
    for (const day of itinerary.days || []) {
      for (const slot of day.slots || []) {
        for (const opt of slot.options || []) {
          if (opt.activity?.name) {
            allActivityNames.push(opt.activity.name.toLowerCase());
          }
        }
      }
    }

    for (const anchor of expectedData.expectedAnchors) {
      const found = allActivityNames.some(name => name.includes(anchor.toLowerCase()));
      if (!found) {
        issues.push(`Anchor not found: "${anchor}"`);
      } else {
        checks.push(`✓ Anchor: ${anchor}`);
      }
    }
  }

  // Check transfer slots
  if (expectedData.expectedTransfers) {
    const transferSlots = [];
    for (const day of itinerary.days || []) {
      for (const slot of day.slots || []) {
        const activity = slot.options?.[0]?.activity;
        if (activity?.category === "transport" ||
            activity?.name?.includes("Transfer") ||
            activity?.name?.includes("Shinkansen") ||
            slot.behavior === "travel") {
          transferSlots.push(slot);
        }
      }
    }

    if (transferSlots.length >= expectedData.expectedTransfers.length) {
      checks.push(`✓ Transfer slots: ${transferSlots.length}`);
    } else {
      issues.push(`Transfer slots: expected ${expectedData.expectedTransfers.length}, got ${transferSlots.length}`);
    }
  }

  // Check slot structure
  let totalSlots = 0;
  let emptySlots = 0;
  for (const day of itinerary.days || []) {
    for (const slot of day.slots || []) {
      totalSlots++;
      if (!slot.options || slot.options.length === 0) {
        emptySlots++;
      }
    }
  }

  checks.push(`✓ Total slots: ${totalSlots}`);
  if (emptySlots > 0) {
    issues.push(`Empty slots: ${emptySlots}`);
  }

  // Print results
  for (const check of checks) {
    console.log(`   ${check}`);
  }

  if (issues.length > 0) {
    console.log(`\n   ⚠️ Issues found:`);
    for (const issue of issues) {
      console.log(`      - ${issue}`);
    }
    return { passed: false, issues, checks };
  }

  console.log(`\n   ✅ All checks passed!`);
  return { passed: true, issues: [], checks };
}

// ===========================================
// Run Single Test
// ===========================================

async function runTest(testData) {
  console.log(`\n${"=".repeat(70)}`);
  console.log(`📍 TEST: ${testData.name}`);
  console.log(`${"=".repeat(70)}`);

  const startTime = Date.now();

  try {
    // Step 1: Parse with Ollama
    const parsedInput = await parseUserPromptWithOllama(testData.userPrompt);

    // Step 2: Infer transfers
    const transfers = inferTransfers(parsedInput);

    // Step 3: Build request
    const request = buildItineraryRequest(parsedInput, transfers);

    // Step 4: Check cache
    const cacheKey = getCacheKey(request);
    let itinerary = await checkCache(cacheKey);

    // Step 5: Generate if not cached
    if (!itinerary) {
      itinerary = await generateItinerary(request);
      await saveToCache(cacheKey, itinerary);
    }

    // Step 6: Verify
    const verification = verifyItinerary(itinerary, testData);

    // Save output
    await fs.mkdir(OUTPUT_DIR, { recursive: true });
    const outputPath = path.join(OUTPUT_DIR, `e2e-${testData.name.replace(/\s+/g, "-").toLowerCase()}.json`);
    await fs.writeFile(outputPath, JSON.stringify({
      test: testData.name,
      request,
      itinerary,
      verification,
      duration: Date.now() - startTime,
    }, null, 2));
    console.log(`\n💾 Saved: ${outputPath}`);

    return {
      name: testData.name,
      passed: verification.passed,
      duration: Date.now() - startTime,
      issues: verification.issues,
    };

  } catch (error) {
    console.error(`\n❌ Test failed: ${error.message}`);
    return {
      name: testData.name,
      passed: false,
      duration: Date.now() - startTime,
      error: error.message,
    };
  }
}

// ===========================================
// Health Checks
// ===========================================

async function checkOllamaHealth() {
  try {
    const response = await fetch(`${OLLAMA_BASE_URL}/api/tags`);
    if (!response.ok) return false;
    const data = await response.json();
    console.log(`✅ Ollama is running (models: ${data.models?.length || 0})`);
    return true;
  } catch {
    console.error("❌ Ollama is not running. Start with: ollama serve");
    return false;
  }
}

async function checkApiHealth() {
  try {
    const response = await fetch("http://localhost:3000/api/health", { method: "GET" });
    if (response.ok) {
      console.log("✅ Local API is running");
      return true;
    }
  } catch {}
  console.log("⚠️ Local API not running. Will use Ollama fallback.");
  return false;
}

// ===========================================
// Main
// ===========================================

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║  End-to-End Itinerary Generation Flow Test                                ║
║  1. Parse user prompt (Ollama) → 2. Infer transfers → 3. Build request    ║
║  4. Check cache → 5. Generate (ChatGPT/Ollama) → 6. Verify result         ║
╚═══════════════════════════════════════════════════════════════════════════╝
`);

  console.log("Configuration:");
  console.log(`  OLLAMA_BASE_URL: ${OLLAMA_BASE_URL}`);
  console.log(`  OLLAMA_MODEL: ${OLLAMA_MODEL}`);
  console.log(`  SKIP_CACHE: ${SKIP_CACHE}`);
  console.log(`  DRY_RUN: ${DRY_RUN}`);
  console.log("");

  // Health checks
  const ollamaOk = await checkOllamaHealth();
  if (!ollamaOk && !DRY_RUN) {
    process.exit(1);
  }

  await checkApiHealth();

  // Determine which tests to run
  const testIndex = args.find(a => !a.startsWith("--"));
  const testsToRun = testIndex !== undefined
    ? [TEST_PROMPTS[parseInt(testIndex)]]
    : TEST_PROMPTS;

  if (testIndex !== undefined) {
    console.log(`\n🎯 Running test #${testIndex}: ${testsToRun[0]?.name || "Unknown"}`);
  } else {
    console.log(`\n🎯 Running all ${TEST_PROMPTS.length} tests`);
  }

  // Run tests
  const results = [];
  for (const testData of testsToRun) {
    if (!testData) {
      console.error(`❌ Test not found`);
      continue;
    }
    const result = await runTest(testData);
    results.push(result);
  }

  // Summary
  console.log(`\n${"=".repeat(70)}`);
  console.log("📊 RESULTS SUMMARY");
  console.log(`${"=".repeat(70)}`);

  for (const result of results) {
    const status = result.passed ? "✅ PASS" : "❌ FAIL";
    const duration = (result.duration / 1000).toFixed(1);
    console.log(`${status} ${result.name} (${duration}s)`);
    if (result.error) {
      console.log(`   Error: ${result.error}`);
    }
    if (result.issues?.length > 0) {
      for (const issue of result.issues) {
        console.log(`   - ${issue}`);
      }
    }
  }

  const passed = results.filter(r => r.passed).length;
  const total = results.length;
  console.log(`\n${passed}/${total} tests passed`);

  process.exit(passed === total ? 0 : 1);
}

main().catch(console.error);
