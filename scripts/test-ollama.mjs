/**
 * Test script for Ollama integration
 *
 * Usage:
 *   node scripts/test-ollama.mjs
 *
 * Prerequisites:
 *   1. Install Ollama: brew install ollama
 *   2. Start Ollama: ollama serve
 *   3. Pull a model: ollama pull qwen2.5:7b
 */

import OpenAI from "openai";

// Configuration
const OLLAMA_BASE_URL = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
const OLLAMA_MODEL = process.env.OLLAMA_MODEL || "qwen2.5:7b";

console.log("🦙 Ollama Integration Test Suite\n");
console.log("=".repeat(50));
console.log("Base URL:", OLLAMA_BASE_URL);
console.log("Model:", OLLAMA_MODEL);
console.log("=".repeat(50));

// Create OpenAI client pointing to Ollama
const ollama = new OpenAI({
    baseURL: OLLAMA_BASE_URL,
    apiKey: "ollama", // Required but not used
});

// Helper to safely access nested properties
function safeGet(obj, path, defaultVal) {
    const keys = path.split(".");
    let result = obj;
    for (const key of keys) {
        if (result == null) return defaultVal;
        result = result[key];
    }
    return result != null ? result : defaultVal;
}

// ===========================================
// Test 1: Check Ollama Availability
// ===========================================
async function testOllamaHealth() {
    console.log("\n📋 Test 1: Checking Ollama availability...\n");

    try {
        const response = await fetch(OLLAMA_BASE_URL.replace("/v1", "") + "/api/tags");

        if (!response.ok) {
            console.log("❌ Ollama is not responding. Status:", response.status);
            console.log("\n💡 Make sure Ollama is running:");
            console.log("   ollama serve");
            return false;
        }

        const data = await response.json();
        const models = data.models || [];

        console.log("✅ Ollama is running!");
        console.log("\n📦 Available models:");
        if (models.length === 0) {
            console.log("   (no models installed)");
            console.log("\n💡 Pull a model first:");
            console.log("   ollama pull qwen2.5:7b");
            return false;
        }

        models.forEach(m => {
            const size = (m.size / 1024 / 1024 / 1024).toFixed(1);
            const marker = m.name === OLLAMA_MODEL || m.name.startsWith(OLLAMA_MODEL) ? "  ◄ SELECTED" : "";
            console.log(`   - ${m.name} (${size} GB)${marker}`);
        });

        // Check if our model is available
        const hasModel = models.some(m => m.name === OLLAMA_MODEL || m.name.startsWith(OLLAMA_MODEL.split(":")[0]));
        if (!hasModel) {
            console.log(`\n⚠️  Model "${OLLAMA_MODEL}" not found.`);
            console.log("   Pull it with: ollama pull " + OLLAMA_MODEL);
            return false;
        }

        return true;
    } catch (error) {
        console.log("❌ Cannot connect to Ollama:", error.message);
        console.log("\n💡 Start Ollama with: ollama serve");
        return false;
    }
}

// ===========================================
// Test 2: Basic Chat Response
// ===========================================
async function testChatResponse() {
    console.log("\n📋 Test 2: Testing chat response...\n");

    const startTime = Date.now();

    try {
        const response = await ollama.chat.completions.create({
            model: OLLAMA_MODEL,
            messages: [{
                    role: "system",
                    content: "You are a helpful travel planner assistant. Be concise."
                },
                {
                    role: "user",
                    content: "What are 3 must-see attractions in Tokyo?"
                }
            ],
            temperature: 0.7,
            max_tokens: 500,
        });

        const duration = Date.now() - startTime;
        const content = safeGet(response, "choices.0.message.content", "");
        const tokens = safeGet(response, "usage.total_tokens", "N/A");

        console.log("✅ Chat response received!");
        console.log(`   Duration: ${duration}ms`);
        console.log(`   Tokens: ${tokens}`);
        console.log("\n📝 Response:\n");
        console.log(content);

        return { success: true, duration };
    } catch (error) {
        console.log("❌ Chat test failed:", error.message);
        return { success: false, error: error.message };
    }
}

// ===========================================
// Test 3: JSON Response (Itinerary Format)
// ===========================================
async function testJsonResponse() {
    console.log("\n📋 Test 3: Testing JSON response format...\n");

    const startTime = Date.now();

    const systemPrompt = `You are an expert travel itinerary generator.
You MUST respond with valid JSON only, no markdown, no code blocks, just pure JSON.

The JSON structure should be:
{
  "title": "Trip title",
  "destination": { "city": "City", "country": "Country" },
  "days": [
    {
      "dayNumber": 1,
      "title": "Day theme",
      "slots": [
        {
          "slotType": "morning",
          "startTime": "09:00",
          "endTime": "12:00",
          "activity": {
            "name": "Activity name",
            "description": "Brief description",
            "type": "attraction",
            "duration": 120
          }
        }
      ]
    }
  ],
  "generalTips": ["Tip 1", "Tip 2"]
}`;

    const userPrompt = `Create a simple 1-day itinerary for Tokyo, Japan.
Include just 2 time slots: morning and afternoon.
Respond with valid JSON only.`;

    try {
        const response = await ollama.chat.completions.create({
            model: OLLAMA_MODEL,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 2000,
        });

        const duration = Date.now() - startTime;
        const content = safeGet(response, "choices.0.message.content", "");

        console.log(`   Duration: ${duration}ms`);
        console.log(`   Response length: ${content.length || 0} chars`);

        // Try to parse as JSON
        let parsed;
        try {
            // Extract JSON if wrapped in markdown
            let jsonContent = content;
            const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
            if (codeBlockMatch) {
                jsonContent = codeBlockMatch[1].trim();
            }

            // Try to extract JSON object
            const jsonMatch = jsonContent.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                jsonContent = jsonMatch[0];
            }

            parsed = JSON.parse(jsonContent);
            console.log("✅ Valid JSON response!");
            console.log("\n📊 Parsed structure:");
            console.log(`   - Title: ${parsed.title || "N/A"}`);
            console.log(`   - Destination: ${safeGet(parsed, "destination.city", "N/A")}, ${safeGet(parsed, "destination.country", "N/A")}`);
            console.log(`   - Days: ${(parsed.days && parsed.days.length) || 0}`);

            if (parsed.days && parsed.days[0]) {
                const slots = parsed.days[0].slots || [];
                console.log(`   - Day 1 slots: ${slots.length}`);
                slots.forEach((slot, i) => {
                    console.log(`     ${i+1}. ${slot.slotType}: ${safeGet(slot, "activity.name", "N/A")}`);
                });
            }

            console.log(`   - Tips: ${(parsed.generalTips && parsed.generalTips.length) || 0}`);

            return { success: true, duration, parsed };
        } catch (parseError) {
            console.log("⚠️  JSON parsing failed:", parseError.message);
            console.log("\n📝 Raw response:\n");
            console.log(content.slice(0, 500) + (content.length > 500 ? "..." : ""));
            return { success: false, duration, error: "JSON parse failed" };
        }
    } catch (error) {
        console.log("❌ JSON test failed:", error.message);
        return { success: false, error: error.message };
    }
}

// ===========================================
// Test 4: Structured Itinerary Format
// ===========================================
async function testStructuredItinerary() {
    console.log("\n📋 Test 4: Testing structured itinerary format (with options)...\n");

    const startTime = Date.now();

    const systemPrompt = `You are an expert travel itinerary generator. Create itineraries with MULTIPLE OPTIONS per time slot.

Your response MUST follow this EXACT format:

---TEXT---
[Write a friendly 2-3 paragraph summary describing the itinerary highlights]
---END_TEXT---

---JSON---
{
  "destination": "City Name",
  "country": "Country Name",
  "days": [
    {
      "dayNumber": 1,
      "date": "2024-03-15",
      "city": "City Name",
      "title": "Day theme",
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
                "description": "Description",
                "category": "temple",
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
              "matchReasons": ["Reason 1"],
              "tradeoffs": ["Tradeoff 1"]
            }
          ]
        }
      ]
    }
  ],
  "generalTips": ["Tip 1"],
  "estimatedBudget": { "total": { "min": 100, "max": 200 }, "currency": "USD" }
}
---END_JSON---`;

    const userPrompt = `Create a 1-day structured itinerary for Tokyo, Japan.
Include morning and lunch slots only.
Provide 2 options per slot.
Use the exact format with ---TEXT--- and ---JSON--- markers.`;

    try {
        const response = await ollama.chat.completions.create({
            model: OLLAMA_MODEL,
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ],
            temperature: 0.7,
            max_tokens: 4000,
        });

        const duration = Date.now() - startTime;
        const content = safeGet(response, "choices.0.message.content", "");

        console.log(`   Duration: ${duration}ms`);
        console.log(`   Response length: ${content.length || 0} chars`);

        // Check for text marker
        const hasTextMarker = content.includes("---TEXT---") && content.includes("---END_TEXT---");
        const hasJsonMarker = content.includes("---JSON---") && content.includes("---END_JSON---");

        console.log(`   Has TEXT markers: ${hasTextMarker ? "✅" : "❌"}`);
        console.log(`   Has JSON markers: ${hasJsonMarker ? "✅" : "❌"}`);

        if (hasTextMarker && hasJsonMarker) {
            // Extract text
            const textMatch = content.match(/---TEXT---\s*([\s\S]*?)\s*---END_TEXT---/);
            const text = textMatch ? textMatch[1].trim() : "";
            console.log(`   Text length: ${text.length} chars`);

            // Extract and parse JSON
            const jsonMatch = content.match(/---JSON---\s*([\s\S]*?)\s*---END_JSON---/);
            if (jsonMatch) {
                try {
                    const parsed = JSON.parse(jsonMatch[1].trim());
                    console.log("\n✅ Successfully parsed structured response!");
                    console.log("\n📝 Text preview:");
                    console.log("   " + text.slice(0, 200) + (text.length > 200 ? "..." : ""));
                    console.log("\n📊 JSON structure:");
                    console.log(`   - Destination: ${parsed.destination}`);
                    console.log(`   - Days: ${(parsed.days && parsed.days.length) || 0}`);

                    if (parsed.days && parsed.days[0] && parsed.days[0].slots) {
                        console.log(`   - Slots in Day 1: ${parsed.days[0].slots.length}`);
                        parsed.days[0].slots.forEach((slot) => {
                            const optCount = (slot.options && slot.options.length) || 0;
                            console.log(`     • ${slot.slotType}: ${optCount} options`);
                            if (slot.options) {
                                slot.options.forEach((opt, i) => {
                                    const name = safeGet(opt, "activity.name", "N/A");
                                    console.log(`       ${i+1}. ${name} (score: ${opt.score || "N/A"})`);
                                });
                            }
                        });
                    }

                    return { success: true, duration, hasMarkers: true };
                } catch (parseError) {
                    console.log("⚠️  JSON parsing failed:", parseError.message);
                    return { success: false, duration, error: "JSON parse failed" };
                }
            }
        } else {
            console.log("\n⚠️  Response doesn't have expected markers.");
            console.log("\n📝 Raw response preview:\n");
            console.log(content.slice(0, 600) + (content.length > 600 ? "..." : ""));
            return { success: false, duration, error: "Missing markers" };
        }
    } catch (error) {
        console.log("❌ Structured itinerary test failed:", error.message);
        return { success: false, error: error.message };
    }
}

// ===========================================
// Run All Tests
// ===========================================
async function runTests() {
    console.log("\n");

    // Test 1: Health check
    const isHealthy = await testOllamaHealth();
    if (!isHealthy) {
        console.log("\n" + "=".repeat(50));
        console.log("❌ Cannot proceed - Ollama is not available");
        console.log("=".repeat(50));
        process.exit(1);
    }

    // Test 2: Basic chat
    const chatResult = await testChatResponse();

    // Test 3: JSON response
    const jsonResult = await testJsonResponse();

    // Test 4: Structured itinerary
    const structuredResult = await testStructuredItinerary();

    // Summary
    console.log("\n" + "=".repeat(50));
    console.log("📊 TEST SUMMARY");
    console.log("=".repeat(50));
    console.log(`1. Ollama Health:       ✅ Available`);
    console.log(`2. Chat Response:       ${chatResult.success ? "✅ Passed" : "❌ Failed"} (${chatResult.duration || "N/A"}ms)`);
    console.log(`3. JSON Response:       ${jsonResult.success ? "✅ Passed" : "❌ Failed"} (${jsonResult.duration || "N/A"}ms)`);
    console.log(`4. Structured Itinerary: ${structuredResult.success ? "✅ Passed" : "⚠️ Partial"} (${structuredResult.duration || "N/A"}ms)`);

    const allPassed = chatResult.success && jsonResult.success && structuredResult.success;

    if (allPassed) {
        console.log("\n🎉 All tests passed! Ollama integration is working.\n");
        console.log("To use Ollama instead of OpenAI, add to your .env.local:");
        console.log("  AI_PROVIDER=ollama");
        console.log(`  OLLAMA_MODEL=${OLLAMA_MODEL}`);
    } else if (chatResult.success && jsonResult.success) {
        console.log("\n⚠️  Basic tests passed, but structured format needs improvement.");
        console.log("   The model may not follow the marker format exactly.");
        console.log("   Consider using a larger model like llama3.1:8b for better results.");
    } else {
        console.log("\n❌ Some tests failed. Check the output above for details.");
    }

    console.log("\n");
}

runTests().catch(console.error);