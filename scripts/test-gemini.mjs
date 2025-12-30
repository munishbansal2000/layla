/**
 * Test script for Google Gemini integration
 *
 * Usage:
 *   node scripts/test-gemini.mjs
 *
 * Make sure GEMINI_API_KEY is set in .env.local
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), ".env.local") });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY not found in environment variables");
    console.log("\nMake sure you have GEMINI_API_KEY set in your .env.local file");
    process.exit(1);
}

console.log("🚀 Testing Google Gemini Integration\n");
console.log("API Key:", GEMINI_API_KEY.substring(0, 10) + "..." + GEMINI_API_KEY.substring(GEMINI_API_KEY.length - 4));
console.log("");

const MODELS_TO_TRY = [
    "gemini-2.0-flash",
    "gemini-2.5-flash",
    "gemini-flash-latest",
    "gemini-2.0-flash-lite",
];

async function listAvailableModels() {
    console.log("📋 Checking available models...\n");

    try {
        const response = await fetch(
            "https://generativelanguage.googleapis.com/v1beta/models?key=" + GEMINI_API_KEY
        );
        const data = await response.json();

        if (data.error) {
            console.error("❌ API Error:", data.error.message);
            console.log("\n💡 This usually means the API key is invalid or expired.");
            console.log("   Get a new key from: https://aistudio.google.com/app/apikey\n");
            return [];
        }

        console.log("Available models for generateContent:");
        const allModels = data.models || [];
        const models = allModels.filter(function(m) {
            return m.supportedGenerationMethods && m.supportedGenerationMethods.includes("generateContent");
        });
        models.forEach(function(m) {
            console.log("  ✓ " + m.name.replace("models/", "") + " (" + m.displayName + ")");
        });
        console.log("");
        return models.map(function(m) { return m.name.replace("models/", ""); });
    } catch (error) {
        console.error("❌ Failed to list models:", error.message);
        return [];
    }
}

async function findWorkingModel(genAI) {
    console.log("🔍 Finding a working model...\n");

    for (const modelName of MODELS_TO_TRY) {
        try {
            console.log("  Trying: " + modelName + "...");
            const model = genAI.getGenerativeModel({ model: modelName });
            const result = await model.generateContent("Hello, respond with just OK");
            const text = result.response.text();
            console.log("  ✅ " + modelName + " works!\n");
            return modelName;
        } catch (error) {
            console.log("  ❌ " + modelName + ": " + error.message.substring(0, 60) + "...");
        }
    }
    return null;
}

async function testGeminiChat(workingModel) {
    console.log("📝 Test 1: Basic Chat Response\n");

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: workingModel });

    try {
        const startTime = Date.now();

        const result = await model.generateContent({
            contents: [{
                role: "user",
                parts: [{ text: "I want to plan a 3-day trip to Tokyo. What are the must-see attractions? Keep it brief." }]
            }],
            systemInstruction: "You are Layla, an expert AI travel planner. Be friendly and knowledgeable.",
        });

        const response = result.response;
        const text = response.text();
        const duration = Date.now() - startTime;

        console.log("✅ Chat Response Received!");
        console.log("⏱️  Duration: " + duration + "ms");
        const tokens = response.usageMetadata ? response.usageMetadata.totalTokenCount : "N/A";
        console.log("📊 Tokens: " + tokens);
        console.log("\n--- Response Preview (first 500 chars) ---");
        console.log(text.substring(0, 500) + (text.length > 500 ? "..." : ""));
        console.log("-------------------------------------------\n");

        return true;
    } catch (error) {
        console.error("❌ Chat Test Failed:", error.message);
        return false;
    }
}

async function testGeminiJSON(workingModel) {
    console.log("📝 Test 2: JSON Response (Structured Output)\n");

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({
        model: workingModel,
        generationConfig: {
            responseMimeType: "application/json",
        },
    });

    try {
        const startTime = Date.now();

        const prompt = "Create a simple 1-day itinerary for Tokyo with 3 activities. Return as JSON with destination and activities array.";

        const result = await model.generateContent(prompt);
        const response = result.response;
        const text = response.text();
        const duration = Date.now() - startTime;

        const parsed = JSON.parse(text);

        console.log("✅ JSON Response Received & Parsed!");
        console.log("⏱️  Duration: " + duration + "ms");
        console.log("\n--- Parsed Response ---");
        console.log(JSON.stringify(parsed, null, 2));
        console.log("-----------------------\n");

        return true;
    } catch (error) {
        console.error("❌ JSON Test Failed:", error.message);
        return false;
    }
}

async function main() {
    console.log("==================================================");
    console.log("  Google Gemini Integration Test Suite");
    console.log("==================================================");
    console.log("");

    const availableModels = await listAvailableModels();

    if (availableModels.length === 0) {
        console.log("⚠️  Could not list models. The API key may be invalid.\n");
        console.log("Please ensure your GEMINI_API_KEY is valid.");
        console.log("Get a new key from: https://aistudio.google.com/app/apikey\n");
        process.exit(1);
    }

    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const workingModel = await findWorkingModel(genAI);

    if (!workingModel) {
        console.log("⚠️  Could not find a working model.\n");
        process.exit(1);
    }

    console.log("Using model: " + workingModel + "\n");
    console.log("--------------------------------------------------\n");

    const chatResult = await testGeminiChat(workingModel);
    const jsonResult = await testGeminiJSON(workingModel);

    console.log("==================================================");
    console.log("  Test Results Summary");
    console.log("==================================================");
    console.log("");
    console.log("  Working Model:    " + workingModel);
    console.log("  Chat Response:    " + (chatResult ? "✅ PASS" : "❌ FAIL"));
    console.log("  JSON Response:    " + (jsonResult ? "✅ PASS" : "❌ FAIL"));
    console.log("");

    if (chatResult && jsonResult) {
        console.log("🎉 All tests passed! Gemini integration is working.\n");
        console.log("To use Gemini instead of OpenAI, set in your .env.local:");
        console.log("  AI_PROVIDER=gemini");
    } else {
        console.log("⚠️  Some tests failed. Please check the errors above.\n");
        process.exit(1);
    }
}

main().catch(console.error);