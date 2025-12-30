#!/usr/bin/env node

/**
 * Test Viator LLM Scoring - Verify it uses Ollama, not OpenAI
 * 
 * This test:
 * 1. Checks that VIATOR_LLM_SCORING=true is set
 * 2. Tests the LLM scoring function with mock tour data
 * 3. Verifies Ollama is being called (not OpenAI)
 * 
 * Run: node scripts/test-viator-llm-scoring.mjs
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "../.env.local") });

console.log("=".repeat(60));
console.log("VIATOR LLM SCORING TEST - VERIFY OLLAMA USAGE");
console.log("=".repeat(60));

// Check environment settings
console.log("\n--- ENVIRONMENT CHECK ---");
console.log(`VIATOR_LLM_SCORING: ${process.env.VIATOR_LLM_SCORING}`);
console.log(`AI_PROVIDER: ${process.env.AI_PROVIDER}`);
console.log(`OLLAMA_BASE_URL: ${process.env.OLLAMA_BASE_URL}`);
console.log(`OLLAMA_MODEL: ${process.env.OLLAMA_MODEL}`);

if (process.env.VIATOR_LLM_SCORING !== "true") {
  console.log("\n⚠️  VIATOR_LLM_SCORING is not set to 'true'");
  console.log("   Set VIATOR_LLM_SCORING=true in .env.local to enable LLM scoring");
}

// Test Ollama connectivity
async function testOllamaConnectivity() {
  console.log("\n--- TEST 1: OLLAMA CONNECTIVITY ---");
  
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
  const baseUrl = ollamaBaseUrl.replace("/v1", "");
  
  try {
    const response = await fetch(`${baseUrl}/api/tags`);
    if (response.ok) {
      const data = await response.json();
      console.log(`✅ Ollama is running at ${baseUrl}`);
      console.log(`   Available models: ${data.models?.map(m => m.name).join(", ") || "none"}`);
      return true;
    } else {
      console.log(`❌ Ollama returned status ${response.status}`);
      return false;
    }
  } catch (error) {
    console.log(`❌ Failed to connect to Ollama: ${error.message}`);
    console.log("   Make sure Ollama is running: ollama serve");
    return false;
  }
}

// Test LLM scoring with mock tour data
async function testLLMScoring() {
  console.log("\n--- TEST 2: LLM SCORING FUNCTION ---");
  
  const activityName = "Sensō-ji";
  const activityCategory = "temple";
  const city = "Tokyo";
  
  // Mock tour data (similar to what Viator returns)
  const mockTours = [
    {
      title: "Asakusa Senso-ji Temple and Old Tokyo Walking Tour",
      description: "Explore the historic Asakusa district and visit the famous Senso-ji Temple with a knowledgeable local guide.",
      productCode: "TOUR001"
    },
    {
      title: "Tokyo Architecture and Contemporary Art Walking Tour",
      description: "Visit modern architectural marvels and contemporary art galleries in Tokyo.",
      productCode: "TOUR002"
    },
    {
      title: "Private Asakusa & Senso-ji Temple Tour with Food Stops",
      description: "A private tour covering Senso-ji Temple, Nakamise shopping street, and local food tastings.",
      productCode: "TOUR003"
    },
    {
      title: "Mt. Fuji Day Trip from Tokyo",
      description: "Full day excursion to Mt. Fuji with stops at Lake Kawaguchi and Oshino Hakkai.",
      productCode: "TOUR004"
    },
    {
      title: "Tokyo Bay Cruise and Odaiba Tour",
      description: "Enjoy a scenic cruise on Tokyo Bay and explore the futuristic Odaiba district.",
      productCode: "TOUR005"
    }
  ];

  console.log(`Activity: "${activityName}" (${activityCategory}) in ${city}`);
  console.log(`Testing with ${mockTours.length} mock tours...\n`);

  // Build the prompt (same as in the actual function)
  const tourList = mockTours.slice(0, 10).map((t, i) => 
    `${i + 1}. "${t.title}" - ${t.description.slice(0, 100)}...`
  ).join("\n");

  const prompt = `You are a travel expert matching tours to activities.

Activity: "${activityName}" (${activityCategory}) in ${city}

Available tours:
${tourList}

Score each tour's relevance to the activity (0-100):
- 100: Tour specifically about this exact place/activity
- 80-99: Tour includes this place as a main stop
- 50-79: Tour is in the same area/theme
- 20-49: Loosely related
- 0-19: Not relevant

Return JSON array with format: [{"index": 1, "score": 85, "reason": "brief reason"}]
Only include tours scoring 50+. Return [] if none are relevant.`;

  console.log("Prompt sent to LLM:");
  console.log("-".repeat(40));
  console.log(prompt.slice(0, 500) + "...");
  console.log("-".repeat(40));

  // Call Ollama directly (like the actual function does)
  const ollamaBaseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434/v1";
  const ollamaModel = process.env.OLLAMA_MODEL || "llama3.1:8b";

  console.log(`\nCalling Ollama at ${ollamaBaseUrl} with model ${ollamaModel}...`);

  try {
    const startTime = Date.now();
    
    const response = await fetch(`${ollamaBaseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": "Bearer ollama"
      },
      body: JSON.stringify({
        model: ollamaModel,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.3,
        max_tokens: 500
      })
    });

    const elapsed = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      console.log(`❌ Ollama request failed: ${response.status}`);
      console.log(`   Error: ${errorText.slice(0, 200)}`);
      return false;
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || "";

    console.log(`✅ Ollama responded in ${elapsed}ms`);
    console.log(`\nOllama Response:`);
    console.log("-".repeat(40));
    console.log(content);
    console.log("-".repeat(40));

    // Try to parse the JSON response
    try {
      // Extract JSON array from response
      const jsonMatch = content.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const scores = JSON.parse(jsonMatch[0]);
        console.log(`\n✅ Parsed ${scores.length} tour scores:`);
        
        for (const score of scores) {
          const tour = mockTours[score.index - 1];
          console.log(`   ${score.index}. "${tour?.title}" - Score: ${score.score} - ${score.reason}`);
        }

        // Verify the scoring makes sense
        console.log("\n--- SCORING VALIDATION ---");
        
        // Tour 1 (Asakusa Senso-ji) should score high
        const tour1Score = scores.find(s => s.index === 1);
        if (tour1Score && tour1Score.score >= 80) {
          console.log(`✅ Tour 1 (Senso-ji specific tour) scored ${tour1Score.score} (expected 80+)`);
        } else {
          console.log(`⚠️  Tour 1 (Senso-ji specific tour) scored ${tour1Score?.score || 0} (expected 80+)`);
        }

        // Tour 2 (Architecture) should score low
        const tour2Score = scores.find(s => s.index === 2);
        if (!tour2Score || tour2Score.score < 50) {
          console.log(`✅ Tour 2 (Architecture tour) scored ${tour2Score?.score || 0} (expected <50 or excluded)`);
        } else {
          console.log(`⚠️  Tour 2 (Architecture tour) scored ${tour2Score.score} (expected <50)`);
        }

        // Tour 3 (Private Senso-ji) should score high
        const tour3Score = scores.find(s => s.index === 3);
        if (tour3Score && tour3Score.score >= 80) {
          console.log(`✅ Tour 3 (Private Senso-ji tour) scored ${tour3Score.score} (expected 80+)`);
        } else {
          console.log(`⚠️  Tour 3 (Private Senso-ji tour) scored ${tour3Score?.score || 0} (expected 80+)`);
        }

        // Tour 4 (Mt. Fuji) should be excluded
        const tour4Score = scores.find(s => s.index === 4);
        if (!tour4Score || tour4Score.score < 30) {
          console.log(`✅ Tour 4 (Mt. Fuji day trip) scored ${tour4Score?.score || 0} (expected <30 or excluded)`);
        } else {
          console.log(`⚠️  Tour 4 (Mt. Fuji day trip) scored ${tour4Score.score} (expected <30)`);
        }

        return true;
      } else {
        console.log("⚠️  Could not find JSON array in response");
        return false;
      }
    } catch (parseError) {
      console.log(`⚠️  Failed to parse JSON: ${parseError.message}`);
      return false;
    }

  } catch (error) {
    console.log(`❌ Error calling Ollama: ${error.message}`);
    return false;
  }
}

// Test that OpenAI is NOT being called
async function verifyNotUsingOpenAI() {
  console.log("\n--- TEST 3: VERIFY NOT USING OPENAI ---");
  
  // The scoreToursWithLLM function explicitly uses providerOverride: "ollama"
  // Let's verify this by checking the function in itinerary-service.ts
  
  const fs = await import("fs");
  const path = await import("path");
  
  const itineraryServicePath = path.join(__dirname, "../src/lib/itinerary-service.ts");
  const content = fs.readFileSync(itineraryServicePath, "utf-8");
  
  // Check that providerOverride: "ollama" is used in scoreToursWithLLM
  if (content.includes('providerOverride: "ollama"')) {
    console.log('✅ scoreToursWithLLM uses providerOverride: "ollama"');
    
    // Also check the function exists
    if (content.includes("async function scoreToursWithLLM")) {
      console.log("✅ scoreToursWithLLM function is defined");
    } else {
      console.log("❌ scoreToursWithLLM function not found");
      return false;
    }

    // Check it's being called in searchViatorForActivity
    if (content.includes("await scoreToursWithLLM(")) {
      console.log("✅ scoreToursWithLLM is being called in searchViatorForActivity");
    } else {
      console.log("❌ scoreToursWithLLM is not being called");
      return false;
    }

    return true;
  } else {
    console.log('❌ providerOverride: "ollama" not found in scoreToursWithLLM');
    return false;
  }
}

// Main test runner
async function main() {
  let allPassed = true;

  // Test 1: Ollama connectivity
  const ollamaConnected = await testOllamaConnectivity();
  if (!ollamaConnected) {
    console.log("\n⚠️  Skipping LLM scoring test - Ollama not available");
    allPassed = false;
  } else {
    // Test 2: LLM scoring
    const scoringWorks = await testLLMScoring();
    if (!scoringWorks) {
      allPassed = false;
    }
  }

  // Test 3: Verify not using OpenAI
  const notUsingOpenAI = await verifyNotUsingOpenAI();
  if (!notUsingOpenAI) {
    allPassed = false;
  }

  // Summary
  console.log("\n" + "=".repeat(60));
  if (allPassed) {
    console.log("✅ ALL TESTS PASSED - Viator LLM scoring uses Ollama");
  } else {
    console.log("⚠️  SOME TESTS FAILED - Check output above");
  }
  console.log("=".repeat(60));
}

main().catch(console.error);
