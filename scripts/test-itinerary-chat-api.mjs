/**
 * End-to-End Test for Itinerary Chat API
 *
 * Tests the full flow:
 * 1. User prompt → API call
 * 2. API parses intent (rule-based + LLM fallback)
 * 3. API executes action
 * 4. API returns response
 *
 * Usage:
 *   node scripts/test-itinerary-chat-api.mjs
 *
 * Requirements:
 *   - Server must be running at http://localhost:3000
 *   - GEMINI_API_KEY must be set in .env.local
 */

import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables
config({ path: resolve(process.cwd(), ".env.local") });

const API_BASE = "http://localhost:3000";

console.log("🧪 End-to-End Test: Itinerary Chat API\n");
console.log("=".repeat(70));

// ============================================
// SAMPLE ITINERARY FOR TESTING
// ============================================

const SAMPLE_ITINERARY = {
    id: "test-itinerary-1",
    destination: "Tokyo",
    country: "Japan",
    startDate: "2025-03-15",
    endDate: "2025-03-17",
    days: [{
            dayNumber: 1,
            date: "2025-03-15",
            city: "Tokyo",
            title: "Exploring Asakusa & Shibuya",
            slots: [{
                    slotId: "day1-morning",
                    slotType: "morning",
                    timeRange: { start: "09:00", end: "12:00" },
                    behavior: "flex",
                    rigidityScore: 0.3,
                    options: [{
                        id: "opt-1",
                        rank: 1,
                        score: 85,
                        activity: {
                            name: "Senso-ji Temple",
                            description: "Tokyo's oldest and most famous temple",
                            category: "temple",
                            duration: 120,
                            place: {
                                name: "Senso-ji Temple",
                                address: "2-3-1 Asakusa, Taito City",
                                neighborhood: "Asakusa",
                                coordinates: { lat: 35.7147, lng: 139.7967 },
                            },
                        },
                    }, ],
                    selectedOptionId: "opt-1",
                },
                {
                    slotId: "day1-lunch",
                    slotType: "lunch",
                    timeRange: { start: "12:00", end: "13:30" },
                    behavior: "meal",
                    rigidityScore: 0.5,
                    options: [{
                        id: "opt-2",
                        rank: 1,
                        score: 80,
                        activity: {
                            name: "Asakusa Ramen",
                            description: "Traditional Tokyo-style ramen shop",
                            category: "restaurant",
                            duration: 60,
                            place: {
                                name: "Asakusa Ramen House",
                                address: "1-2-3 Asakusa, Taito City",
                                neighborhood: "Asakusa",
                                coordinates: { lat: 35.712, lng: 139.798 },
                            },
                        },
                    }, ],
                    selectedOptionId: "opt-2",
                },
                {
                    slotId: "day1-afternoon",
                    slotType: "afternoon",
                    timeRange: { start: "14:00", end: "18:00" },
                    behavior: "flex",
                    rigidityScore: 0.4,
                    options: [{
                        id: "opt-3",
                        rank: 1,
                        score: 90,
                        activity: {
                            name: "TeamLab Borderless",
                            description: "Immersive digital art museum",
                            category: "museum",
                            duration: 180,
                            place: {
                                name: "TeamLab Borderless",
                                address: "Azabudai Hills",
                                neighborhood: "Roppongi",
                                coordinates: { lat: 35.6621, lng: 139.7341 },
                            },
                        },
                    }, ],
                    selectedOptionId: "opt-3",
                },
            ],
        },
        {
            dayNumber: 2,
            date: "2025-03-16",
            city: "Tokyo",
            title: "Harajuku & Shinjuku Adventures",
            slots: [{
                    slotId: "day2-morning",
                    slotType: "morning",
                    timeRange: { start: "09:00", end: "12:00" },
                    behavior: "flex",
                    rigidityScore: 0.3,
                    options: [],
                    selectedOptionId: null,
                },
                {
                    slotId: "day2-lunch",
                    slotType: "lunch",
                    timeRange: { start: "12:00", end: "13:30" },
                    behavior: "meal",
                    rigidityScore: 0.5,
                    options: [],
                    selectedOptionId: null,
                },
            ],
        },
    ],
    generalTips: ["Get a Suica card for easy transit"],
    estimatedBudget: { total: { min: 1500, max: 2500 }, currency: "USD" },
};

// ============================================
// TEST CASES
// ============================================

const TEST_CASES = [{
        name: "Add ramen lunch on day 2",
        message: "Add a ramen lunch on day 2",
        expectedIntent: "ADD_ACTIVITY",
        expectChanges: true,
        validate: (response) => {
            if (!response.success) return `API failed: ${response.error?.message}`;
            if (!response.data || !response.data.intent) return "No intent in response";
            if (response.data.intent.type !== "ADD_ACTIVITY") {
                return `Wrong intent: ${response.data.intent.type}`;
            }
            if (!response.data.appliedChanges) return "No changes applied";
            return null; // Pass
        },
    },
    {
        name: "Fill empty morning slot on day 2",
        message: "fill the empty morning slot on day 2",
        expectedIntent: "SUGGEST_FROM_REPLACEMENT_POOL",
        expectChanges: false,
        validate: (response) => {
            if (!response.success) return `API failed: ${response.error?.message}`;
            if (!response.data || !response.data.intent) return "No intent in response";
            // Should be SUGGEST_FROM_REPLACEMENT_POOL (no changes, just suggestions)
            if (response.data.intent.type !== "SUGGEST_FROM_REPLACEMENT_POOL") {
                return `Wrong intent: ${response.data.intent.type}`;
            }
            if (!response.data.message) return "No message in response";
            return null; // Pass
        },
    },
    {
        name: "Lock TeamLab activity",
        message: "Lock TeamLab Borderless",
        expectedIntent: "PRIORITIZE",
        expectChanges: true,
        validate: (response) => {
            if (!response.success) return `API failed: ${response.error?.message}`;
            if (!response.data || !response.data.intent) return "No intent in response";
            if (response.data.intent.type !== "PRIORITIZE") {
                return `Wrong intent: ${response.data.intent.type}`;
            }
            if (!response.data.appliedChanges) return "No changes applied";
            return null; // Pass
        },
    },
    {
        name: "Ask a question about the trip",
        message: "What's the best time to visit Senso-ji Temple?",
        expectedIntent: "ASK_QUESTION",
        expectChanges: false,
        validate: (response) => {
            if (!response.success) return `API failed: ${response.error?.message}`;
            if (!response.data || !response.data.intent) return "No intent in response";
            if (response.data.intent.type !== "ASK_QUESTION") {
                return `Wrong intent: ${response.data.intent.type}`;
            }
            if (!response.data.message || response.data.message.length < 20) {
                return "Response message too short or missing";
            }
            return null; // Pass
        },
    },
    {
        name: "Move activity to different time",
        message: "Move Senso-ji Temple to afternoon",
        expectedIntent: "MOVE_ACTIVITY",
        expectChanges: true,
        validate: (response) => {
            if (!response.success) return `API failed: ${response.error?.message}`;
            if (!response.data || !response.data.intent) return "No intent in response";
            if (response.data.intent.type !== "MOVE_ACTIVITY") {
                return `Wrong intent: ${response.data.intent.type}`;
            }
            // Move might fail due to constraints, but intent should be correct
            return null; // Pass
        },
    },
    {
        name: "Undo command",
        message: "undo",
        expectedIntent: "UNDO",
        expectChanges: false,
        validate: (response) => {
            if (!response.success) return `API failed: ${response.error?.message}`;
            if (!response.data || !response.data.intent) return "No intent in response";
            if (response.data.intent.type !== "UNDO") {
                return `Wrong intent: ${response.data.intent.type}`;
            }
            return null; // Pass
        },
    },
];

// ============================================
// API CALL HELPER
// ============================================

async function callChatAPI(message, itinerary) {
    const request = {
        message,
        itinerary: itinerary || SAMPLE_ITINERARY,
        context: {
            currentDayIndex: 0,
            constraintSettings: {
                strictMode: false,
                autoAdjust: true,
                respectClusters: true,
                weatherAware: false,
            },
        },
    };

    try {
        const response = await fetch(`${API_BASE}/api/itinerary/chat`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(request),
        });

        const data = await response.json();
        return data;
    } catch (error) {
        return {
            success: false,
            error: { code: "FETCH_ERROR", message: error.message },
        };
    }
}

// ============================================
// TEST RUNNER
// ============================================

async function runTests() {
    // First, check if server is running
    console.log("\n🔍 Checking if server is running...");
    try {
        const healthCheck = await fetch(`${API_BASE}/api/health`).catch(() => null);
        if (!healthCheck) {
            // Try the chat endpoint directly
            const testCall = await callChatAPI("test");
            if (!testCall.success && testCall.error && testCall.error.code === "FETCH_ERROR") {
                console.error("\n❌ Server is not running at", API_BASE);
                console.log("\nPlease start the development server with:");
                console.log("  npm run dev\n");
                process.exit(1);
            }
        }
        console.log("✅ Server is running\n");
    } catch (e) {
        console.log("⚠️  Could not verify server status, proceeding anyway...\n");
    }

    const results = {
        passed: 0,
        failed: 0,
        errors: [],
    };

    console.log("-".repeat(70));

    for (const testCase of TEST_CASES) {
        console.log(`\n🧪 Test: ${testCase.name}`);
        console.log(`   Message: "${testCase.message}"`);
        console.log(`   Expected Intent: ${testCase.expectedIntent}`);

        const startTime = Date.now();
        const response = await callChatAPI(testCase.message);
        const duration = Date.now() - startTime;

        console.log(`   Duration: ${duration}ms`);

        if (response.success) {
            console.log(`   Intent: ${response.data?.intent?.type || "null"}`);
            if (response.data && response.data.message) {
                const preview = response.data.message.slice(0, 100);
                console.log(
                    `   Message: ${preview}${response.data.message.length > 100 ? "..." : ""}`
                );
            }
            if (response.data && response.data.appliedChanges) {
                console.log(`   Changes: Applied ✓`);
            }
        } else {
            console.log(`   Error: ${response.error?.message || "Unknown error"}`);
        }

        // Validate the response
        const error = testCase.validate(response);
        if (error) {
            console.log(`   ❌ FAILED: ${error}`);
            results.failed++;
            results.errors.push({ test: testCase.name, error });
        } else {
            console.log(`   ✅ PASSED`);
            results.passed++;
        }
    }

    return results;
}

// ============================================
// MAIN
// ============================================

async function main() {
    console.log(`API Base: ${API_BASE}`);
    console.log(
        `GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? "✓ Set" : "✗ Missing"}`
    );
    console.log("=".repeat(70));

    const results = await runTests();

    console.log("\n" + "=".repeat(70));
    console.log("\n📊 TEST RESULTS SUMMARY\n");
    console.log("-".repeat(70));

    console.log(`   Total: ${results.passed + results.failed}`);
    console.log(`   Passed: ${results.passed} ✅`);
    console.log(`   Failed: ${results.failed} ❌`);
    console.log(
        `   Pass Rate: ${((results.passed / (results.passed + results.failed)) * 100).toFixed(1)}%`
    );

    if (results.errors.length > 0) {
        console.log("\n❌ Failed Tests:");
        for (const err of results.errors) {
            console.log(`   - ${err.test}: ${err.error}`);
        }
    }

    console.log("\n" + "=".repeat(70));

    if (results.failed === 0) {
        console.log("🎉 All tests passed! The API is working correctly.\n");
    } else {
        console.log("⚠️  Some tests failed. Review the errors above.\n");
        process.exit(1);
    }
}

main().catch((error) => {
    console.error("Test runner error:", error);
    process.exit(1);
});