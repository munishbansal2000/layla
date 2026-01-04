#!/usr/bin/env node

/**
 * Test script for the Trip Input Parser
 *
 * Tests parsing unstructured natural language trip requests
 * into structured TripInput format using Ollama
 *
 * Usage:
 *   node scripts/test-input-parser.mjs
 *   node scripts/test-input-parser.mjs "your custom trip request"
 */

import OpenAI from "openai";

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
// Test Inputs - Various natural language formats
// ===========================================

const TEST_INPUTS = [{
        name: "Simple trip with dates",
        input: "2 weeks in Japan with my wife, April 15-30, we love ramen and temples",
        expected: {
            destinations: ["Japan"],
            travelers: { adults: 2 },
            interests: ["ramen", "temples"],
        }
    },
    {
        name: "Trip with booked activity",
        input: "Planning a Tokyo trip March 10-15 for 2 people. Already booked teamLab Planets for March 12 at 2pm. Interested in art and street food.",
        expected: {
            destinations: ["Tokyo"],
            activities: [{ name: "teamLab Planets", date: "March 12", time: "2pm" }],
            interests: ["art", "street food"],
        }
    },
    {
        name: "Family trip with children",
        input: "Family vacation to Kyoto, 2 adults and 2 kids ages 8 and 12, June 1-7, moderate budget, prefer relaxed pace",
        expected: {
            destinations: ["Kyoto"],
            travelers: { adults: 2, children: 2, childrenAges: [8, 12] },
            budget: "moderate",
            pace: "relaxed",
        }
    },
    {
        name: "Multi-city with flights",
        input: "Flying from SFO to Tokyo on JAL April 10, then going to Kyoto and Osaka, flying back from Osaka April 25. Luxury budget, must see Golden Pavilion and Fushimi Inari.",
        expected: {
            destinations: ["Tokyo", "Kyoto", "Osaka"],
            flights: [
                { from: "SFO", to: "Tokyo", date: "April 10" },
                { from: "Osaka", to: "SFO", date: "April 25" }
            ],
            mustHave: ["Golden Pavilion", "Fushimi Inari"],
            budget: "luxury",
        }
    },
    {
        name: "Trip with hotel and preferences",
        input: "Staying at Park Hyatt Tokyo from March 5-10, want to avoid crowded tourist spots, interested in local izakayas and hidden gems. Don't like raw fish.",
        expected: {
            hotels: [{ name: "Park Hyatt Tokyo", city: "Tokyo" }],
            mustAvoid: ["crowded tourist spots", "raw fish"],
            interests: ["izakayas", "hidden gems"],
        }
    },
    {
        name: "Complex trip with multiple anchors",
        input: "10-day trip to Japan, Tokyo April 15-19 at Conrad, then Shinkansen to Kyoto staying at Ritz-Carlton April 19-23, then Osaka April 23-25. Already have dinner reservation at Kikunoi in Kyoto on April 20 at 7pm and teamLab tickets for April 16 at 3pm. Love temples, traditional culture, but skip the overcrowded Shibuya crossing. Ultra luxury budget.",
        expected: {
            destinations: ["Japan", "Tokyo", "Kyoto", "Osaka"],
            hotels: [
                { name: "Conrad", city: "Tokyo" },
                { name: "Ritz-Carlton", city: "Kyoto" },
            ],
            activities: [
                { name: "Kikunoi dinner", city: "Kyoto", date: "April 20", time: "7pm" },
                { name: "teamLab", city: "Tokyo", date: "April 16", time: "3pm" },
            ],
            interests: ["temples", "traditional culture"],
            mustAvoid: ["overcrowded Shibuya crossing"],
            budget: "ultra",
        }
    }
];

// ===========================================
// System Prompt (same as trip-input-parser.ts)
// ===========================================

const INPUT_PARSER_SYSTEM_PROMPT = `You are a travel planning assistant that extracts structured information from natural language trip requests.

Your task is to parse user input and extract travel-related entities. Be thorough but don't invent information that isn't mentioned.

EXTRACTION RULES:
1. Destinations: Extract cities, countries, or regions mentioned
2. Dates: Look for specific dates, date ranges, months, or durations like "2 weeks"
3. Travelers: Count adults, children, and note any ages mentioned
4. Flights: Extract any mentioned flights with airports, dates, times, airlines
5. Hotels: Extract any mentioned accommodations with names, cities, check-in/out dates
6. Activities: Extract any pre-booked activities, tours, reservations, shows
7. Interests: Extract hobbies, preferences like "love ramen", "interested in temples"
8. Must-Have: Specific places or experiences they MUST do
9. Must-Avoid: Things they explicitly want to avoid
10. Budget: Look for budget indicators (budget, moderate, luxury, "not too expensive")
11. Pace: Look for pace indicators (relaxed, packed, "take it easy", "see everything")

IMPORTANT:
- Only extract what is EXPLICITLY mentioned
- For ambiguous items, add them to clarifications
- Use null for missing dates/times rather than guessing
- Convert relative dates to ISO format if a reference date is available
- Normalize airport codes (e.g., "San Francisco" → "SFO", "Narita" → "NRT")

Respond with ONLY valid JSON, no markdown or explanation.`;

// ===========================================
// Parse Trip Input
// ===========================================

function buildParserPrompt(userInput, referenceDate) {
    const today = referenceDate || new Date().toISOString().split("T")[0];

    return `Parse the following trip request and extract all travel-related information.

TODAY'S DATE (for reference): ${today}

USER INPUT:
"${userInput}"

Extract and return a JSON object with this structure:
{
  "destinations": ["City1", "Country1"],
  "dates": {
    "start": "2025-04-15" or null,
    "end": "2025-04-30" or null,
    "duration": "2 weeks" or null
  },
  "travelers": {
    "adults": 2,
    "children": 0,
    "childrenAges": [],
    "description": "couple" or "family" or "solo" or null
  },
  "flights": [
    {
      "from": "SFO",
      "to": "NRT",
      "date": "2025-04-15",
      "time": "11:00" or null,
      "airline": "JAL" or null,
      "flightNumber": "JL001" or null
    }
  ],
  "hotels": [
    {
      "name": "Park Hyatt Tokyo" or null,
      "city": "Tokyo",
      "checkIn": "2025-04-15",
      "checkOut": "2025-04-20",
      "address": null
    }
  ],
  "activities": [
    {
      "name": "teamLab Planets",
      "city": "Tokyo",
      "date": "2025-04-16",
      "time": "14:00",
      "duration": 120,
      "category": "experience",
      "confirmationNumber": null,
      "notes": "arrive 30 min early"
    }
  ],
  "interests": ["ramen", "temples", "art"],
  "mustHave": ["Fushimi Inari", "Golden Pavilion"],
  "mustAvoid": ["crowded tourist areas"],
  "budget": "moderate",
  "pace": "relaxed",
  "travelStyle": "cultural",
  "confidence": 0.85,
  "clarifications": ["Exact dates not specified, using April as mentioned"]
}

Rules for categories:
- activity categories: "tour", "experience", "show", "restaurant", "attraction", "transport", "other"
- budget values: "budget", "moderate", "luxury", "ultra"
- pace values: "relaxed", "moderate", "packed"

Return ONLY the JSON object.`;
}

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

async function parseTripInput(userInput, referenceDate) {
    const prompt = buildParserPrompt(userInput, referenceDate);

    try {
        const response = await ollama.chat.completions.create({
            model: OLLAMA_MODEL,
            messages: [
                { role: "system", content: INPUT_PARSER_SYSTEM_PROMPT },
                { role: "user", content: prompt },
            ],
            temperature: 0.3,
            max_tokens: 2000,
        });

        const choice = response.choices[0];
        const content = choice && choice.message && choice.message.content;

        if (!content) {
            throw new Error("No response from LLM");
        }

        const jsonContent = extractJsonFromResponse(content);
        return JSON.parse(jsonContent);
    } catch (error) {
        return { error: error.message };
    }
}

// ===========================================
// Test Runner
// ===========================================

async function runTest(testCase) {
    console.log(`\n${"─".repeat(60)}`);
    console.log(`📝 Test: ${testCase.name}`);
    console.log(`${"─".repeat(60)}`);
    console.log(`\n📥 Input:\n   "${testCase.input}"\n`);

    // Use current date as reference (or override with REFERENCE_DATE env var)
    const referenceDate = process.env.REFERENCE_DATE || new Date().toISOString().split("T")[0];
    console.log(`📅 Reference Date: ${referenceDate}`);

    const startTime = Date.now();
    const result = await parseTripInput(testCase.input, referenceDate);
    const durationMs = Date.now() - startTime;

    if (result.error) {
        console.log(`❌ Error: ${result.error}`);
        return { success: false, name: testCase.name };
    }

    console.log(`⏱️  Parsed in ${(durationMs / 1000).toFixed(1)}s`);
    console.log(`\n📤 Extracted:`);

    // Show key extractions
    if (result.destinations && result.destinations.length > 0) {
        console.log(`   🌍 Destinations: ${result.destinations.join(", ")}`);
    }
    if (result.dates && (result.dates.start || result.dates.end || result.dates.duration)) {
        const dateStr = result.dates.start && result.dates.end ?
            `${result.dates.start} to ${result.dates.end}` :
            result.dates.duration || "Not specified";
        console.log(`   📅 Dates: ${dateStr}`);
    }
    if (result.travelers) {
        let travelerStr = `${result.travelers.adults || 0} adults`;
        if (result.travelers.children) {
            travelerStr += `, ${result.travelers.children} children`;
            if (result.travelers.childrenAges && result.travelers.childrenAges.length > 0) {
                travelerStr += ` (ages ${result.travelers.childrenAges.join(", ")})`;
            }
        }
        console.log(`   👥 Travelers: ${travelerStr}`);
    }
    if (result.flights && result.flights.length > 0) {
        console.log(`   ✈️  Flights:`);
        result.flights.forEach(f => {
                    console.log(`      ${f.from || "?"} → ${f.to || "?"} on ${f.date || "?"}${f.airline ? ` (${f.airline})` : ""}`);
    });
  }
  if (result.hotels && result.hotels.length > 0) {
    console.log(`   🏨 Hotels:`);
    result.hotels.forEach(h => {
      console.log(`      ${h.name || "Unknown"} in ${h.city || "?"} (${h.checkIn || "?"} to ${h.checkOut || "?"})`);
    });
  }
  if (result.activities && result.activities.length > 0) {
    console.log(`   🎭 Booked Activities:`);
    result.activities.forEach(a => {
      console.log(`      ${a.name} in ${a.city || "?"} on ${a.date || "?"} at ${a.time || "?"}`);
    });
  }
  if (result.interests && result.interests.length > 0) {
    console.log(`   ❤️  Interests: ${result.interests.join(", ")}`);
  }
  if (result.mustHave && result.mustHave.length > 0) {
    console.log(`   ✅ Must-Have: ${result.mustHave.join(", ")}`);
  }
  if (result.mustAvoid && result.mustAvoid.length > 0) {
    console.log(`   ❌ Must-Avoid: ${result.mustAvoid.join(", ")}`);
  }
  if (result.budget) {
    console.log(`   💰 Budget: ${result.budget}`);
  }
  if (result.pace) {
    console.log(`   🚶 Pace: ${result.pace}`);
  }
  if (result.confidence) {
    console.log(`   📊 Confidence: ${(result.confidence * 100).toFixed(0)}%`);
  }
  if (result.clarifications && result.clarifications.length > 0) {
    console.log(`   ⚠️  Clarifications needed:`);
    result.clarifications.forEach(c => console.log(`      - ${c}`));
  }

  return { success: true, name: testCase.name, result };
}

async function checkOllamaHealth() {
  console.log("🔍 Checking Ollama availability...");

  try {
    const response = await fetch(`${OLLAMA_BASE_URL.replace("/v1", "")}/api/tags`);

    if (!response.ok) {
      console.error(`❌ Ollama returned status ${response.status}`);
      return false;
    }

    const data = await response.json();
    const models = data.models ? data.models.map(m => m.name) : [];

    console.log(`✅ Ollama is running`);
    console.log(`📦 Available models: ${models.join(", ") || "none"}`);

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
║  Trip Input Parser Test                                  ║
║  Converting natural language to structured TripInput     ║
╚══════════════════════════════════════════════════════════╝
`);

  console.log(`Configuration:`);
  console.log(`  OLLAMA_BASE_URL: ${OLLAMA_BASE_URL}`);
  console.log(`  OLLAMA_MODEL: ${OLLAMA_MODEL}`);
  console.log("");

  const isHealthy = await checkOllamaHealth();
  if (!isHealthy) {
    process.exit(1);
  }

  // Check for custom input from command line
  const customInput = process.argv.slice(2).join(" ");

  if (customInput) {
    console.log(`\n🎯 Parsing custom input...`);
    await runTest({ name: "Custom Input", input: customInput, expected: {} });
  } else {
    console.log(`\n🎯 Running ${TEST_INPUTS.length} test cases...`);

    const results = [];
    for (const testCase of TEST_INPUTS) {
      const result = await runTest(testCase);
      results.push(result);
    }

    // Summary
    console.log(`\n${"═".repeat(60)}`);
    console.log("📊 RESULTS SUMMARY");
    console.log(`${"═".repeat(60)}`);

    const successCount = results.filter(r => r.success).length;
    results.forEach(r => {
      console.log(`${r.success ? "✅" : "❌"} ${r.name}`);
    });

    console.log(`\n${successCount}/${results.length} tests passed`);
  }
}

main().catch(console.error);
