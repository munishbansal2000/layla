/**
 * Test script to verify Ollama generates parseable itineraries
 *
 * Usage:
 *   node scripts/test-ollama-itinerary.mjs
 *
 * This tests the FULL integration: Ollama -> Parser -> Valid Itinerary
 */

import OpenAI from "openai";

// Configuration
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b";

console.log("🦙 Ollama Itinerary Generation Test\n");
console.log("=".repeat(50));
console.log("Model:", OLLAMA_MODEL);
console.log("=".repeat(50));

const ollama = new OpenAI({
    baseURL: OLLAMA_BASE_URL,
    apiKey: "ollama",
});

// ============================================
// INLINE PARSER (same logic as structured-itinerary-parser.ts)
// ============================================

function tryRepairJson(jsonStr) {
    let repaired = jsonStr;
    repaired = repaired.replace(/,(\s*[}\]])/g, '$1');
    repaired = repaired.replace(/,+(\s*[}\]])/g, '$1');

    const openBraces = (repaired.match(/\{/g) || []).length;
    const closeBraces = (repaired.match(/\}/g) || []).length;
    for (let i = 0; i < openBraces - closeBraces; i++) {
        repaired += '}';
    }

    const openBrackets = (repaired.match(/\[/g) || []).length;
    const closeBrackets = (repaired.match(/\]/g) || []).length;
    for (let i = 0; i < openBrackets - closeBrackets; i++) {
        repaired += ']';
    }

    return repaired;
}

function parseStructuredResponse(llmResponse) {
    // Try to extract text portion
    const textMatch = llmResponse.match(/---TEXT---([\s\S]*?)---END_TEXT---/i);
    const message = textMatch ? textMatch[1].trim() : extractFallbackMessage(llmResponse);

    // Try to extract JSON portion
    const jsonMatch = llmResponse.match(/---JSON---([\s\S]*?)---END_JSON---/i);

    if (jsonMatch) {
        try {
            const rawJson = jsonMatch[1].trim();
            const parsed = JSON.parse(rawJson);
            return { success: true, message, itinerary: parsed, method: "markers" };
        } catch (e) {
            // Try with repair
            try {
                const repaired = tryRepairJson(jsonMatch[1].trim());
                const parsed = JSON.parse(repaired);
                return { success: true, message, itinerary: parsed, method: "markers+repair" };
            } catch {
                // Continue to fallback
            }
        }
    }

    // Try markdown code block
    const codeBlockMatch = llmResponse.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (codeBlockMatch) {
        try {
            const repaired = tryRepairJson(codeBlockMatch[1].trim());
            const parsed = JSON.parse(repaired);
            if (isValidItinerary(parsed)) {
                return { success: true, message, itinerary: parsed, method: "code-block" };
            }
        } catch {
            // Continue to next method
        }
    }

    // Try raw JSON extraction
    const jsonObjectMatch = llmResponse.match(/\{[\s\S]*"days"\s*:\s*\[[\s\S]*\]/);
    if (jsonObjectMatch) {
        try {
            const repaired = tryRepairJson(jsonObjectMatch[0]);
            const parsed = JSON.parse(repaired);
            if (isValidItinerary(parsed)) {
                return { success: true, message, itinerary: parsed, method: "raw-json" };
            }
        } catch {
            // Failed
        }
    }

    return { success: false, message, error: "Failed to parse JSON", raw: llmResponse.slice(0, 500) };
}

function extractFallbackMessage(response) {
    const jsonStart = response.indexOf("{");
    if (jsonStart > 50) {
        return response.substring(0, jsonStart).trim();
    }
    if (response.trim().startsWith("{")) {
        return "Here's your personalized itinerary!";
    }
    return response.slice(0, 200);
}

function isValidItinerary(data) {
    if (!data || typeof data !== "object") return false;
    if (typeof data.destination !== "string") return false;
    if (!Array.isArray(data.days)) return false;
    if (data.days.length === 0) return false;
    const firstDay = data.days[0];
    if (typeof firstDay.dayNumber !== "number") return false;
    if (!Array.isArray(firstDay.slots)) return false;
    return true;
}

// ============================================
// SYSTEM PROMPTS (from openai.ts)
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
            },
            {
              "id": "opt-2",
              "rank": 2,
              "score": 78,
              "activity": { ... second option ... },
              "matchReasons": [...],
              "tradeoffs": [...]
            }
          ]
        },
        {
          "slotId": "day1-lunch",
          "slotType": "lunch",
          "timeRange": { "start": "12:00", "end": "14:00" },
          "options": [ ... restaurant options ... ]
        }
      ]
    }
  ],
  "generalTips": [
    "Get a transit pass for unlimited rides",
    "Most museums are closed on Mondays"
  ],
  "estimatedBudget": {
    "total": { "min": 500, "max": 800 },
    "currency": "USD"
  }
}
---END_JSON---

RULES:
1. Provide 2-3 ranked OPTIONS per slot
2. Use REAL venue names with approximate coordinates
3. slotType values: "morning", "lunch", "afternoon", "dinner", "evening"
4. Include matchReasons and tradeoffs for each option`;

// ============================================
// TEST FUNCTION
// ============================================

async function testItineraryGeneration() {
    console.log("\n📋 Generating a 2-day Tokyo itinerary...\n");

    const userPrompt = `Create a 2-day structured itinerary for Tokyo, Japan.

TRIP DETAILS:
- Dates: 2024-04-15 to 2024-04-16 (2 days)
- Travelers: 2 adults
- Budget Level: moderate
- Pace: moderate
- Interests: culture, food, temples

REQUIREMENTS:
1. Generate 2 complete days
2. Each day needs: morning, lunch, afternoon, dinner slots
3. Provide 2 ranked OPTIONS for each slot
4. Include REAL venue names with coordinates

Generate the itinerary now in the exact format specified (---TEXT---, ---JSON---).`;

    const startTime = Date.now();

    try {
        const response = await ollama.chat.completions.create({
            model: OLLAMA_MODEL,
            messages: [
                { role: "system", content: STRUCTURED_ITINERARY_PROMPT },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 8000,
        });

        const duration = Date.now() - startTime;
        const content = response.choices && response.choices[0] && response.choices[0].message ?
            response.choices[0].message.content :
            "";

        console.log(`✅ Response received in ${(duration / 1000).toFixed(1)}s`);
        console.log(`   Response length: ${content.length} chars\n`);

        // Parse the response
        console.log("📊 Parsing response...\n");
        const result = parseStructuredResponse(content);

        if (result.success) {
            console.log("✅ PARSE SUCCESSFUL!");
            console.log(`   Parse method: ${result.method}`);
            console.log(`\n📝 Message preview:`);
            console.log(`   ${result.message.slice(0, 200)}${result.message.length > 200 ? "..." : ""}`);

            const itinerary = result.itinerary;
            console.log(`\n📊 Itinerary Structure:`);
            console.log(`   Destination: ${itinerary.destination}`);
            console.log(`   Country: ${itinerary.country || "N/A"}`);
            console.log(`   Days: ${itinerary.days ? itinerary.days.length : 0}`);
            console.log(`   Tips: ${itinerary.generalTips ? itinerary.generalTips.length : 0}`);

            if (itinerary.estimatedBudget) {
                const budget = itinerary.estimatedBudget;
                const total = budget.total;
                console.log(`   Budget: ${total.min}-${total.max} ${budget.currency}`);
            }

            // Validate structure
            let totalSlots = 0;
            let totalOptions = 0;
            let hasCoordinates = false;

            console.log("\n📅 Day-by-day breakdown:");
            if (itinerary.days) {
                itinerary.days.forEach((day, dayIdx) => {
                    console.log(`\n   Day ${day.dayNumber}: ${day.title || "Untitled"}`);
                    if (day.slots) {
                        day.slots.forEach((slot) => {
                            totalSlots++;
                            const optCount = slot.options ? slot.options.length : 0;
                            totalOptions += optCount;

                            const timeRange = slot.timeRange ?
                                `${slot.timeRange.start}-${slot.timeRange.end}` :
                                "N/A";

                            console.log(`     • ${slot.slotType} (${timeRange}): ${optCount} options`);

                            if (slot.options) {
                                slot.options.forEach((opt, optIdx) => {
                                    const activity = opt.activity || {};
                                    const name = activity.name || "Unknown";
                                    const score = opt.score || "N/A";
                                    const place = activity.place;
                                    let coordInfo = "";

                                    if (place && place.coordinates && place.coordinates.lat) {
                                        hasCoordinates = true;
                                        coordInfo = ` @ ${place.coordinates.lat.toFixed(4)}, ${place.coordinates.lng.toFixed(4)}`;
                                    }

                                    console.log(`       ${optIdx + 1}. ${name} (score: ${score})${coordInfo}`);
                                });
                            }
                        });
                    }
                });
            }

            console.log("\n" + "=".repeat(50));
            console.log("📊 VALIDATION SUMMARY");
            console.log("=".repeat(50));
            console.log(`   ✅ Parse successful: ${result.method}`);
            console.log(`   ✅ Total days: ${itinerary.days ? itinerary.days.length : 0}`);
            console.log(`   ✅ Total slots: ${totalSlots}`);
            console.log(`   ✅ Total options: ${totalOptions}`);
            console.log(`   ${hasCoordinates ? "✅" : "⚠️"} Has coordinates: ${hasCoordinates}`);
            console.log(`   ✅ Valid itinerary structure: ${isValidItinerary(itinerary)}`);

            if (itinerary.days && itinerary.days.length >= 2 && totalSlots >= 6 && totalOptions >= 10) {
                console.log("\n🎉 SUCCESS! Ollama generated a valid, parseable itinerary!\n");
                console.log("The itinerary can be used by your app.");
            } else {
                console.log("\n⚠️ Itinerary parsed but may be incomplete.");
                console.log("Expected: 2+ days, 6+ slots, 10+ options");
            }

        } else {
            console.log("❌ PARSE FAILED");
            console.log(`   Error: ${result.error}`);
            console.log("\n📝 Raw response preview:");
            console.log(result.raw || content.slice(0, 800));
        }

    } catch (error) {
        console.log("❌ Request failed:", error.message);
    }
}

// Run the test
testItineraryGeneration().catch(console.error);