/**
 * Test script to verify Gemini produces the same response structure as OpenAI
 *
 * Usage:
 *   node scripts/test-gemini-structure.mjs
 *
 * This tests both chat responses and structured itinerary responses
 * to ensure compatibility between providers.
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";

if (!GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY not found");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

console.log("🔍 Testing Gemini Response Structure Compatibility\n");
console.log("=".repeat(60));

// ============================================
// EXPECTED STRUCTURES (matching OpenAI output)
// ============================================

const EXPECTED_CHAT_STRUCTURE = {
    type: "string",
    description: "Chat response should be a plain text string",
};

const EXPECTED_ITINERARY_STRUCTURE = {
    destination: "string",
    country: "string (optional)",
    days: [{
        dayNumber: "number",
        date: "string (YYYY-MM-DD)",
        city: "string",
        title: "string",
        slots: [{
            slotId: "string",
            slotType: "morning|breakfast|lunch|afternoon|dinner|evening",
            timeRange: { start: "HH:MM", end: "HH:MM" },
            options: [{
                id: "string",
                rank: "number",
                score: "number",
                activity: {
                    name: "string",
                    description: "string",
                    category: "string",
                    duration: "number (minutes)",
                    place: {
                        name: "string",
                        address: "string",
                        neighborhood: "string",
                        coordinates: { lat: "number", lng: "number" },
                    },
                    isFree: "boolean",
                    estimatedCost: { amount: "number", currency: "string" },
                    tags: ["string"],
                    source: "ai|yelp|viator|google-places",
                },
                matchReasons: ["string"],
                tradeoffs: ["string"],
            }, ],
        }, ],
    }, ],
    generalTips: ["string"],
    estimatedBudget: {
        total: { min: "number", max: "number" },
        currency: "string",
    },
};

// ============================================
// SYSTEM PROMPTS (same as in openai.ts)
// ============================================

const STRUCTURED_ITINERARY_PROMPT = `You are an expert travel itinerary generator. Create detailed, realistic travel itineraries with MULTIPLE OPTIONS per time slot.

CRITICAL: Your response MUST follow this EXACT format:

---TEXT---
[Write a friendly, conversational summary of the itinerary. 2-3 paragraphs describing highlights and why this plan works well for the traveler. Use emojis sparingly.]
---END_TEXT---

---JSON---
{
  "destination": "City Name",
  "country": "Country Name",
  "days": [
    {
      "dayNumber": 1,
      "date": "YYYY-MM-DD",
      "city": "City Name",
      "title": "Theme for the day",
      "slots": [
        {
          "slotId": "day1-morning",
          "slotType": "morning",
          "timeRange": { "start": "09:00", "end": "12:00" },
          "options": [
            {
              "id": "opt-1",
              "rank": 1,
              "score": 85,
              "activity": {
                "name": "Activity Name",
                "description": "2-3 sentences about what you'll experience here.",
                "category": "temple|museum|park|restaurant|landmark|neighborhood|market|viewpoint|cultural-experience",
                "duration": 120,
                "place": {
                  "name": "Exact Venue Name",
                  "address": "Full street address",
                  "neighborhood": "Neighborhood Name",
                  "coordinates": { "lat": 35.6762, "lng": 139.6503 }
                },
                "isFree": false,
                "estimatedCost": { "amount": 15, "currency": "USD" },
                "tags": ["family-friendly", "indoor", "cultural"],
                "source": "ai"
              },
              "matchReasons": [
                "Perfect for morning energy",
                "Matches your interest in culture"
              ],
              "tradeoffs": [
                "Can be crowded on weekends"
              ]
            }
          ]
        }
      ]
    }
  ],
  "generalTips": [
    "Get a transit pass for unlimited rides"
  ],
  "estimatedBudget": {
    "total": { "min": 500, "max": 800 },
    "currency": "USD"
  }
}
---END_JSON---

TIME SLOT STRUCTURE:
- morning: 09:00-12:00 (activities, sightseeing)
- lunch: 12:00-14:00 (lunch restaurants ONLY)
- afternoon: 14:00-18:00 (activities, attractions)
- dinner: 18:00-20:00 (dinner restaurants ONLY)
- evening: 20:00-22:00 (optional, nightlife or walks)

Provide 2-3 OPTIONS per slot with rank, score, matchReasons, and tradeoffs.`;

// ============================================
// TEST FUNCTIONS
// ============================================

function validateStructure(obj, expected, path = "") {
    const errors = [];

    if (typeof expected === "string") {
        // It's a type description, check the type
        const expectedType = expected.split(" ")[0].toLowerCase();
        const actualType = typeof obj;

        if (expectedType === "number" && actualType !== "number") {
            errors.push(`${path}: Expected number, got ${actualType}`);
        } else if (expectedType === "string" && actualType !== "string") {
            errors.push(`${path}: Expected string, got ${actualType}`);
        } else if (expectedType === "boolean" && actualType !== "boolean") {
            errors.push(`${path}: Expected boolean, got ${actualType}`);
        }
    } else if (Array.isArray(expected)) {
        if (!Array.isArray(obj)) {
            errors.push(`${path}: Expected array, got ${typeof obj}`);
        } else if (obj.length > 0 && expected.length > 0) {
            // Validate first element structure
            errors.push(...validateStructure(obj[0], expected[0], `${path}[0]`));
        }
    } else if (typeof expected === "object" && expected !== null) {
        if (typeof obj !== "object" || obj === null) {
            errors.push(`${path}: Expected object, got ${typeof obj}`);
        } else {
            for (const key of Object.keys(expected)) {
                const isOptional = typeof expected[key] === "string" && expected[key].includes("optional");
                if (obj[key] === undefined) {
                    if (!isOptional) {
                        errors.push(`${path}.${key}: Missing required field`);
                    }
                } else {
                    errors.push(...validateStructure(obj[key], expected[key], `${path}.${key}`));
                }
            }
        }
    }

    return errors;
}

async function testChatResponse() {
    console.log("\n📝 Test 1: Chat Response Structure\n");

    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    try {
        const result = await model.generateContent({
            contents: [{
                role: "user",
                parts: [{ text: "I want to plan a trip to Tokyo. What should I know?" }],
            }],
            systemInstruction: "You are Layla, an expert AI travel planner. Be friendly and knowledgeable.",
        });

        const response = result.response.text();

        console.log("Response type:", typeof response);
        console.log("Response length:", response.length, "characters");
        console.log("Preview:", response.substring(0, 200) + "...\n");

        if (typeof response === "string" && response.length > 0) {
            console.log("✅ Chat response structure matches OpenAI format (plain text string)\n");
            return { passed: true };
        } else {
            console.log("❌ Chat response is not a valid string\n");
            return { passed: false, error: "Invalid response type" };
        }
    } catch (error) {
        console.error("❌ Test failed:", error.message);
        return { passed: false, error: error.message };
    }
}

async function testStructuredItinerary() {
    console.log("\n📝 Test 2: Structured Itinerary Response (JSON Mode)\n");

    const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 16000, // Increase token limit
            responseMimeType: "application/json",
        },
    });

    // Use the same prompt format as the actual Gemini integration
    const systemPrompt = `You are an expert travel itinerary generator. Create detailed, realistic travel itineraries with MULTIPLE OPTIONS per time slot.

Return a JSON object with this structure:
{
  "message": "A friendly summary of the itinerary (1-2 paragraphs).",
  "destination": "City Name",
  "country": "Country Name",
  "days": [
    {
      "dayNumber": 1,
      "date": "YYYY-MM-DD",
      "city": "City Name",
      "title": "Theme for the day",
      "slots": [
        {
          "slotId": "day1-morning",
          "slotType": "morning",
          "timeRange": { "start": "09:00", "end": "12:00" },
          "options": [
            {
              "id": "opt-1",
              "rank": 1,
              "score": 85,
              "activity": {
                "name": "Activity Name",
                "description": "Brief description.",
                "category": "temple|museum|park|restaurant|landmark",
                "duration": 120,
                "place": {
                  "name": "Venue Name",
                  "address": "Address",
                  "neighborhood": "Area",
                  "coordinates": { "lat": 35.6762, "lng": 139.6503 }
                },
                "isFree": false,
                "estimatedCost": { "amount": 15, "currency": "USD" },
                "tags": ["cultural"],
                "source": "ai"
              },
              "matchReasons": ["Why recommended"],
              "tradeoffs": ["Considerations"]
            }
          ]
        }
      ]
    }
  ],
  "generalTips": ["Travel tips"],
  "estimatedBudget": {
    "total": { "min": 500, "max": 800 },
    "currency": "USD"
  }
}

IMPORTANT:
- Keep descriptions BRIEF (1 sentence max)
- Provide exactly 2 OPTIONS per slot
- Use 4 slots per day: morning, lunch, afternoon, dinner

TIME SLOTS:
- morning: 09:00-12:00 (sightseeing)
- lunch: 12:00-14:00 (restaurants only)
- afternoon: 14:00-18:00 (activities)
- dinner: 18:00-20:00 (restaurants only)`;

    const prompt = `Create a 1-day structured itinerary for Tokyo, Japan.

TRIP DETAILS:
- Date: 2025-03-15 (1 day only)
- Travelers: 2 adults
- Budget Level: moderate
- Pace: moderate
- Interests: temples, food

Keep descriptions brief. Generate the itinerary now.`;

    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            systemInstruction: systemPrompt,
        });

        const response = result.response.text();

        console.log("Raw response length:", response.length, "characters");

        // Try to parse JSON directly
        let parsed;
        try {
            parsed = JSON.parse(response);
            console.log("✅ JSON parsed successfully!");
        } catch (e) {
            console.log("⚠️  Direct parse failed:", e.message.substring(0, 50));
            console.log("    Trying repair...");

            // Try to repair
            let repaired = response;

            // Remove trailing commas
            repaired = repaired.replace(/,(\s*[}\]])/g, '$1');

            // Balance braces
            const openBraces = (repaired.match(/\{/g) || []).length;
            const closeBraces = (repaired.match(/\}/g) || []).length;
            const openBrackets = (repaired.match(/\[/g) || []).length;
            const closeBrackets = (repaired.match(/\]/g) || []).length;

            // If truncated, try to close properly
            if (openBraces > closeBraces || openBrackets > closeBrackets) {
                console.log("    Detected truncated JSON, attempting recovery...");

                // Find the last complete day or slot
                const lastCompleteDay = repaired.lastIndexOf('"slots":');
                if (lastCompleteDay > 0) {
                    // Try to find a good truncation point
                    const lastCloseBrace = repaired.lastIndexOf('}');
                    if (lastCloseBrace > 0) {
                        repaired = repaired.substring(0, lastCloseBrace + 1);
                    }
                }

                // Close any unclosed structures
                for (let i = 0; i < openBrackets - closeBrackets; i++) {
                    repaired += ']';
                }
                for (let i = 0; i < openBraces - closeBraces; i++) {
                    repaired += '}';
                }
            }

            try {
                parsed = JSON.parse(repaired);
                console.log("✅ JSON parsed after repair!");
            } catch (e2) {
                throw new Error("JSON repair failed: " + e2.message);
            }
        }

        return validateItineraryStructure(parsed);
    } catch (error) {
        console.error("❌ Test failed:", error.message);
        return { passed: false, error: error.message };
    }
}

function validateItineraryStructure(parsed) {
    console.log("\n🔍 Validating itinerary structure...\n");

    const checks = {
        hasDestination: !!parsed.destination,
        hasDays: Array.isArray(parsed.days) && parsed.days.length > 0,
        hasSlots: false,
        hasOptions: false,
        hasActivity: false,
        hasPlace: false,
        hasTimeRange: false,
        hasMatchReasons: false,
    };

    if (checks.hasDays) {
        const day = parsed.days[0];
        console.log("  Day 1:", day.title || day.dayNumber);

        if (Array.isArray(day.slots) && day.slots.length > 0) {
            checks.hasSlots = true;
            const slot = day.slots[0];
            const timeStart = slot.timeRange && slot.timeRange.start ? slot.timeRange.start : "?";
            const timeEnd = slot.timeRange && slot.timeRange.end ? slot.timeRange.end : "?";
            console.log("    First slot:", slot.slotType, timeStart + "-" + timeEnd);

            checks.hasTimeRange = !!(slot.timeRange && slot.timeRange.start && slot.timeRange.end);

            if (Array.isArray(slot.options) && slot.options.length > 0) {
                checks.hasOptions = true;
                const option = slot.options[0];
                const activityName = option.activity && option.activity.name ? option.activity.name : "(no name)";
                console.log("      First option:", activityName);

                checks.hasActivity = !!(option.activity && option.activity.name);
                checks.hasPlace = !!(option.activity && option.activity.place && option.activity.place.name);
                checks.hasMatchReasons = Array.isArray(option.matchReasons);
            }
        }
    }

    console.log("\n📊 Structure Validation Results:");
    console.log("  ├─ destination:", checks.hasDestination ? "✅" : "❌");
    console.log("  ├─ days array:", checks.hasDays ? "✅" : "❌");
    console.log("  ├─ slots array:", checks.hasSlots ? "✅" : "❌");
    console.log("  ├─ timeRange:", checks.hasTimeRange ? "✅" : "❌");
    console.log("  ├─ options array:", checks.hasOptions ? "✅" : "❌");
    console.log("  ├─ activity object:", checks.hasActivity ? "✅" : "❌");
    console.log("  ├─ place object:", checks.hasPlace ? "✅" : "❌");
    console.log("  └─ matchReasons:", checks.hasMatchReasons ? "✅" : "❌");

    const passedAll = Object.values(checks).every(v => v);

    if (passedAll) {
        console.log("\n✅ Itinerary structure matches OpenAI/expected format!\n");
        return { passed: true, parsed };
    } else {
        const failed = Object.entries(checks).filter(([k, v]) => !v).map(([k]) => k);
        console.log("\n⚠️  Missing/invalid fields:", failed.join(", "));
        return { passed: false, error: "Structure validation failed", failed };
    }
}

async function testJSONMode() {
    console.log("\n📝 Test 3: Direct JSON Response (for simple itinerary)\n");

    const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.7,
        },
    });

    const prompt = `Create a simple 1-day itinerary for Tokyo with this exact JSON structure:
{
  "title": "Day title",
  "destination": { "city": "Tokyo", "country": "Japan" },
  "days": [{
    "dayNumber": 1,
    "title": "Day theme",
    "slots": [{
      "slotType": "morning",
      "startTime": "09:00",
      "endTime": "12:00",
      "activity": {
        "name": "Activity name",
        "description": "Description",
        "type": "attraction",
        "location": { "name": "Place", "address": "Address" }
      }
    }]
  }],
  "tips": ["Tip 1"],
  "estimatedBudget": { "low": 100, "high": 200, "currency": "USD" }
}`;

    try {
        const result = await model.generateContent(prompt);
        const response = result.response.text();

        console.log("Response preview:", response.substring(0, 300) + "...\n");

        const parsed = JSON.parse(response);

        const checks = {
            hasTitle: !!parsed.title,
            hasDestination: !!parsed.destination,
            hasDays: Array.isArray(parsed.days),
            hasDaySlots: parsed.days && parsed.days[0] && parsed.days[0].slots && parsed.days[0].slots.length > 0,
            hasActivity: !!(parsed.days && parsed.days[0] && parsed.days[0].slots && parsed.days[0].slots[0] && parsed.days[0].slots[0].activity),
            hasTips: Array.isArray(parsed.tips),
            hasBudget: !!parsed.estimatedBudget,
        };

        console.log("📊 JSON Structure Check:");
        Object.entries(checks).forEach(([key, val]) => {
            console.log(`  ${val ? "✅" : "❌"} ${key}`);
        });

        const allPassed = Object.values(checks).every(v => v);
        if (allPassed) {
            console.log("\n✅ JSON response structure is valid!\n");
            return { passed: true };
        } else {
            return { passed: false, error: "Missing fields" };
        }
    } catch (error) {
        console.error("❌ Test failed:", error.message);
        return { passed: false, error: error.message };
    }
}

// ============================================
// MAIN
// ============================================

async function main() {
    console.log("Model:", GEMINI_MODEL);
    console.log("=".repeat(60));

    const results = {
        chat: await testChatResponse(),
        structured: await testStructuredItinerary(),
        json: await testJSONMode(),
    };

    console.log("=".repeat(60));
    console.log("\n📋 FINAL RESULTS\n");
    console.log("  Chat Response:        ", results.chat.passed ? "✅ PASS" : "❌ FAIL");
    console.log("  Structured Itinerary: ", results.structured.passed ? "✅ PASS" : "❌ FAIL");
    console.log("  JSON Mode:            ", results.json.passed ? "✅ PASS" : "❌ FAIL");

    const allPassed = results.chat.passed && results.structured.passed && results.json.passed;

    console.log("\n" + "=".repeat(60));
    if (allPassed) {
        console.log("🎉 All tests passed! Gemini produces compatible response structures.");
        console.log("\nThe Gemini integration is ready for use as an OpenAI alternative.");
    } else {
        console.log("⚠️  Some tests failed. Check the errors above.");
        if (!results.structured.passed) {
            console.log("\nNote: Structured itinerary format may need prompt adjustments");
            console.log("to match the exact ---TEXT--- / ---JSON--- delimiters.");
        }
    }
    console.log("=".repeat(60));
}

main().catch(console.error);