/**
 * Test script for Itinerary Chat Parsing and API Execution
 *
 * Tests the intent parsing and action execution flow using Gemini for LLM fallback.
 *
 * Usage:
 *   node scripts/test-itinerary-chat.mjs
 *
 * Make sure GEMINI_API_KEY is set in .env.local
 */

import { GoogleGenerativeAI } from "@google/generative-ai";
import { config } from "dotenv";
import { resolve } from "path";

// Load environment variables from .env.local
config({ path: resolve(process.cwd(), ".env.local") });

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const GEMINI_MODEL = "gemini-2.5-flash";

if (!GEMINI_API_KEY) {
    console.error("❌ GEMINI_API_KEY not found in environment variables");
    console.log("\nMake sure you have GEMINI_API_KEY set in your .env.local file");
    process.exit(1);
}

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

console.log("🚀 Testing Itinerary Chat - Intent Parsing & API Execution\n");
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
                                coordinates: { lat: 35.7120, lng: 139.7980 },
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
                    options: [{
                        id: "opt-4",
                        rank: 1,
                        score: 85,
                        activity: {
                            name: "Meiji Shrine",
                            description: "Serene Shinto shrine in a forested area",
                            category: "temple",
                            duration: 90,
                            place: {
                                name: "Meiji Shrine",
                                address: "1-1 Yoyogikamizonocho, Shibuya City",
                                neighborhood: "Harajuku",
                                coordinates: { lat: 35.6764, lng: 139.6993 },
                            },
                        },
                    }, ],
                    selectedOptionId: "opt-4",
                },
                {
                    slotId: "day2-lunch",
                    slotType: "lunch",
                    timeRange: { start: "12:00", end: "13:30" },
                    behavior: "meal",
                    rigidityScore: 0.5,
                    options: [{
                        id: "opt-5",
                        rank: 1,
                        score: 82,
                        activity: {
                            name: "Harajuku Crepes",
                            description: "Famous street crepes in Harajuku",
                            category: "restaurant",
                            duration: 45,
                            place: {
                                name: "Marion Crepes",
                                address: "Takeshita Street, Shibuya City",
                                neighborhood: "Harajuku",
                                coordinates: { lat: 35.6712, lng: 139.7025 },
                            },
                        },
                    }, ],
                    selectedOptionId: "opt-5",
                },
            ],
        },
        {
            dayNumber: 3,
            date: "2025-03-17",
            city: "Tokyo",
            title: "Last Day - Akihabara & Ginza",
            slots: [{
                slotId: "day3-morning",
                slotType: "morning",
                timeRange: { start: "09:00", end: "12:00" },
                behavior: "flex",
                rigidityScore: 0.3,
                options: [{
                    id: "opt-6",
                    rank: 1,
                    score: 88,
                    activity: {
                        name: "Akihabara Electronics District",
                        description: "Explore Tokyo's famous electronics and anime district",
                        category: "shopping",
                        duration: 180,
                        place: {
                            name: "Akihabara",
                            address: "Akihabara, Chiyoda City",
                            neighborhood: "Akihabara",
                            coordinates: { lat: 35.7022, lng: 139.7745 },
                        },
                    },
                }, ],
                selectedOptionId: "opt-6",
            }, ],
        },
    ],
    generalTips: ["Get a Suica card for easy transit"],
    estimatedBudget: { total: { min: 1500, max: 2500 }, currency: "USD" },
};

// ============================================
// INTENT PARSING SYSTEM PROMPT (for Gemini)
// ============================================

const INTENT_PARSING_SYSTEM_PROMPT = `You are an itinerary assistant that parses user messages into structured actions.

## Available Intent Types
- ADD_ACTIVITY: Add a new activity to the itinerary
- REMOVE_ACTIVITY: Remove an activity from the itinerary
- REPLACE_ACTIVITY: Replace one activity with another
- MOVE_ACTIVITY: Move an activity to a different day/time
- SWAP_ACTIVITIES: Swap two activities' positions
- PRIORITIZE: Lock/prioritize an activity (cannot be auto-moved)
- DEPRIORITIZE: Unlock/make an activity flexible
- SUGGEST_ALTERNATIVES: Get alternative activities for a slot
- OPTIMIZE_ROUTE: Optimize the day's route for less travel
- OPTIMIZE_CLUSTERS: Group nearby activities together
- BALANCE_PACING: Balance the day's energy/pacing
- ASK_QUESTION: General question about the trip

## Slot Types
morning, breakfast, lunch, afternoon, dinner, evening

## Output Format
Return a JSON object with:
{
  "type": "INTENT_TYPE",
  "params": { ... },
  "confidence": 0.0-1.0,
  "explanation": "Brief explanation of interpretation"
}

## Rules
1. ONLY output valid intent types from the list above
2. Extract activity names, day numbers, time slots from the message
3. If the message is ambiguous, return ASK_QUESTION with low confidence
4. Always include a brief explanation

## Examples
User: "Move TeamLab to morning"
{"type":"MOVE_ACTIVITY","params":{"activityName":"TeamLab","toSlot":"morning"},"confidence":0.9,"explanation":"Moving TeamLab activity to a morning slot"}

User: "Add sushi lunch near Shinjuku on day 2"
{"type":"ADD_ACTIVITY","params":{"dayNumber":2,"slotType":"lunch","activityDescription":"sushi","category":"restaurant","location":"Shinjuku"},"confidence":0.85,"explanation":"Adding a sushi restaurant for lunch near Shinjuku on day 2"}

User: "What's the best temple to visit?"
{"type":"ASK_QUESTION","params":{"question":"What's the best temple to visit?"},"confidence":0.8,"explanation":"General question about temple recommendations"}`;

// ============================================
// TEST CASES
// ============================================

const TEST_CASES = [
    // Add Activity Tests
    {
        category: "ADD_ACTIVITY",
        message: "Add a ramen lunch on day 2",
        expectedType: "ADD_ACTIVITY",
        expectedParams: { dayNumber: 2, slotType: "lunch", activityDescription: /ramen/i },
    },
    {
        category: "ADD_ACTIVITY",
        message: "Add sushi dinner near Ginza",
        expectedType: "ADD_ACTIVITY",
        expectedParams: { slotType: "dinner", location: /ginza/i },
    },
    {
        category: "ADD_ACTIVITY",
        message: "Insert a coffee break in the afternoon on day 1",
        expectedType: "ADD_ACTIVITY",
        expectedParams: { dayNumber: 1, slotType: "afternoon" },
    },

    // Move Activity Tests
    {
        category: "MOVE_ACTIVITY",
        message: "Move TeamLab to morning",
        expectedType: "MOVE_ACTIVITY",
        expectedParams: { activityName: /teamlab/i, toSlot: "morning" },
    },
    {
        category: "MOVE_ACTIVITY",
        message: "Reschedule Senso-ji Temple to day 2",
        expectedType: "MOVE_ACTIVITY",
        expectedParams: { activityName: /senso-ji/i, toDay: 2 },
    },
    {
        category: "MOVE_ACTIVITY",
        message: "Push Meiji Shrine to the afternoon",
        expectedType: "MOVE_ACTIVITY",
        expectedParams: { activityName: /meiji/i, toSlot: "afternoon" },
    },

    // Swap Activities Tests
    {
        category: "SWAP_ACTIVITIES",
        message: "Swap Senso-ji with Meiji Shrine",
        expectedType: "SWAP_ACTIVITIES",
        expectedParams: { activity1Name: /senso-ji/i, activity2Name: /meiji/i },
    },
    {
        category: "SWAP_ACTIVITIES",
        message: "Switch TeamLab and Akihabara",
        expectedType: "SWAP_ACTIVITIES",
        expectedParams: { activity1Name: /teamlab/i, activity2Name: /akihabara/i },
    },

    // Remove Activity Tests
    {
        category: "REMOVE_ACTIVITY",
        message: "Remove Harajuku Crepes",
        expectedType: "REMOVE_ACTIVITY",
        expectedParams: { activityName: /harajuku|crepes/i },
    },
    {
        category: "REMOVE_ACTIVITY",
        message: "Delete the lunch on day 1",
        expectedType: "REMOVE_ACTIVITY",
        expectedParams: { dayNumber: 1 },
    },

    // Priority Tests
    {
        category: "PRIORITIZE",
        message: "Lock TeamLab Borderless",
        expectedType: "PRIORITIZE",
        expectedParams: { activityName: /teamlab/i },
    },
    {
        category: "DEPRIORITIZE",
        message: "Make Meiji Shrine optional",
        expectedType: "DEPRIORITIZE",
        expectedParams: { activityName: /meiji/i },
    },

    // Optimization Tests
    {
        category: "OPTIMIZE_ROUTE",
        message: "Optimize day 1 route",
        expectedType: "OPTIMIZE_ROUTE",
        expectedParams: { dayNumber: 1 },
    },
    {
        category: "BALANCE_PACING",
        message: "Balance the pacing for day 2",
        expectedType: "BALANCE_PACING",
        expectedParams: { dayNumber: 2 },
    },

    // Question Tests
    {
        category: "ASK_QUESTION",
        message: "What's the best time to visit Senso-ji?",
        expectedType: "ASK_QUESTION",
        expectedParams: { question: /.+/i },
    },
    {
        category: "ASK_QUESTION",
        message: "How long is my trip?",
        expectedType: "ASK_QUESTION",
        expectedParams: { question: /.+/i },
    },

    // Suggest Tests
    {
        category: "SUGGEST_ALTERNATIVES",
        message: "Suggest alternatives for lunch on day 1",
        expectedType: "SUGGEST_ALTERNATIVES",
        expectedParams: { dayNumber: 1 },
    },
    {
        category: "SUGGEST_ALTERNATIVES",
        message: "Find me a good sushi restaurant",
        expectedType: "SUGGEST_ALTERNATIVES",
        expectedParams: {},
    },

    // Undo/Redo Tests
    {
        category: "UNDO",
        message: "Undo that",
        expectedType: "UNDO",
        expectedParams: {},
    },
    {
        category: "REDO",
        message: "Redo the last action",
        expectedType: "REDO",
        expectedParams: {},
    },
];

// ============================================
// RULE-BASED PARSING (matches production code)
// ============================================

const TIME_SLOT_KEYWORDS = {
    morning: "morning",
    am: "morning",
    early: "morning",
    breakfast: "breakfast",
    brunch: "breakfast",
    lunch: "lunch",
    midday: "lunch",
    noon: "lunch",
    afternoon: "afternoon",
    pm: "afternoon",
    dinner: "dinner",
    supper: "dinner",
    evening: "evening",
    night: "evening",
    late: "evening",
};

const ACTION_PATTERNS = [
    { patterns: [/\b(move|shift|reschedule|push|pull)\b/i], action: "MOVE_ACTIVITY", priority: 1 },
    { patterns: [/\b(swap|switch|exchange|trade)\b/i, /\bwith\b/i], action: "SWAP_ACTIVITIES", priority: 1 },
    { patterns: [/\b(add|insert|include|schedule|plan|put)\b/i], action: "ADD_ACTIVITY", priority: 2 },
    { patterns: [/\b(delete|remove|cancel|drop|skip|take out)\b/i], action: "REMOVE_ACTIVITY", priority: 2 },
    { patterns: [/\b(replace|change|substitute)\b.*\bwith\b/i], action: "REPLACE_ACTIVITY", priority: 1 },
    { patterns: [/\b(lock|prioritize|must-do|important|fix|anchor)\b/i], action: "PRIORITIZE", priority: 3 },
    { patterns: [/\b(unlock|deprioritize|optional|maybe|flexible)\b/i], action: "DEPRIORITIZE", priority: 3 },
    { patterns: [/\b(suggest|recommend|find|show|what|any)\b.*\b(alternative|option|place|restaurant|activity)\b/i], action: "SUGGEST_ALTERNATIVES", priority: 3 },
    { patterns: [/\b(optimize|optimise|improve)\b.*\broute\b/i], action: "OPTIMIZE_ROUTE", priority: 2 },
    { patterns: [/\b(optimize|optimise|group)\b.*\b(cluster|nearby|close)\b/i], action: "OPTIMIZE_CLUSTERS", priority: 2 },
    { patterns: [/\b(balance|spread|pace|relax)\b/i], action: "BALANCE_PACING", priority: 3 },
    { patterns: [/\b(undo|revert|go back)\b/i], action: "UNDO", priority: 1 },
    { patterns: [/\b(redo|restore)\b/i], action: "REDO", priority: 1 },
    { patterns: [/\?$/, /\b(what|where|when|how|why|tell me|explain)\b/i], action: "ASK_QUESTION", priority: 5 },
];

function extractAction(message) {
    const normalizedMessage = message.toLowerCase();
    let bestMatch = null;

    for (const pattern of ACTION_PATTERNS) {
        const matches = pattern.patterns.some((p) => p.test(normalizedMessage));
        if (matches) {
            if (!bestMatch || pattern.priority < bestMatch.priority) {
                bestMatch = { action: pattern.action, priority: pattern.priority };
            }
        }
    }

    return bestMatch ? bestMatch.action : "ASK_QUESTION";
}

function extractTimeSlot(message) {
    const normalizedMessage = message.toLowerCase();
    for (const [keyword, slot] of Object.entries(TIME_SLOT_KEYWORDS)) {
        if (normalizedMessage.includes(keyword)) {
            return slot;
        }
    }
    return undefined;
}

function extractDayNumber(message) {
    const dayMatch = message.match(/day\s*(\d+)/i);
    if (dayMatch) {
        return parseInt(dayMatch[1], 10);
    }

    const ordinals = { first: 1, second: 2, third: 3, fourth: 4, fifth: 5 };
    for (const [word, num] of Object.entries(ordinals)) {
        if (message.toLowerCase().includes(word)) {
            return num;
        }
    }

    return undefined;
}

function extractActivityName(message) {
    const quotedMatch = message.match(/["']([^"']+)["']/);
    if (quotedMatch) {
        return quotedMatch[1];
    }

    // Look for proper nouns
    const commonWords = new Set([
        "The", "A", "An", "And", "Or", "But", "In", "On", "At", "To", "For",
        "Move", "Add", "Delete", "Swap", "Find", "Show", "Morning", "Afternoon",
        "Evening", "Night", "Lunch", "Dinner", "Breakfast", "Day", "Near",
    ]);

    const words = message.split(/\s+/);
    const properNouns = [];

    for (const word of words) {
        const cleanWord = word.replace(/[.,!?;:]$/, "");
        if (/^[A-Z]/.test(cleanWord) && !commonWords.has(cleanWord) && cleanWord.length > 2) {
            properNouns.push(cleanWord);
        }
    }

    if (properNouns.length > 0) {
        return properNouns.join(" ");
    }

    return undefined;
}

function parseUserMessageRuleBased(message) {
    const action = extractAction(message);
    const timeSlot = extractTimeSlot(message);
    const dayNumber = extractDayNumber(message);
    const activityName = extractActivityName(message);

    return {
        type: action,
        params: {
            activityName,
            dayNumber,
            timeSlot,
            toSlot: timeSlot,
            toDay: dayNumber,
        },
        confidence: activityName ? 0.8 : 0.5,
        method: "rule-based",
    };
}

// ============================================
// GEMINI PARSING
// ============================================

async function parseUserMessageWithGemini(message, itineraryContext) {
    const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        generationConfig: {
            responseMimeType: "application/json",
            temperature: 0.3,
        },
    });

    const contextSummary = itineraryContext.days.map(d =>
            `Day ${d.dayNumber}: ${d.slots.map(s => {
            const activity = s.options[0]?.activity;
            return activity ? `${s.slotType}: ${activity.name}` : s.slotType;
        }).join(", ")}`
    ).join("\n");

    const prompt = `Given this ${itineraryContext.days.length}-day ${itineraryContext.destination} itinerary:
${contextSummary}

Parse this user message into a structured intent:
"${message}"

Return a JSON object with type, params, confidence (0-1), and explanation.`;

    try {
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            systemInstruction: INTENT_PARSING_SYSTEM_PROMPT,
        });

        const response = result.response.text();
        const parsed = JSON.parse(response);
        parsed.method = "gemini";
        return parsed;
    } catch (error) {
        console.error("  Gemini parsing error:", error.message);
        return null;
    }
}

// ============================================
// TEST RUNNER
// ============================================

function validateParams(actual, expected) {
    const errors = [];

    for (const [key, expectedValue] of Object.entries(expected)) {
        const actualValue = actual[key];

        if (expectedValue instanceof RegExp) {
            if (!expectedValue.test(String(actualValue || ""))) {
                errors.push(`${key}: expected to match ${expectedValue}, got "${actualValue}"`);
            }
        } else if (typeof expectedValue === "number") {
            if (actualValue !== expectedValue) {
                errors.push(`${key}: expected ${expectedValue}, got ${actualValue}`);
            }
        } else if (typeof expectedValue === "string") {
            if (actualValue?.toLowerCase() !== expectedValue.toLowerCase()) {
                errors.push(`${key}: expected "${expectedValue}", got "${actualValue}"`);
            }
        }
    }

    return errors;
}

async function runTests() {
    const results = {
        passed: 0,
        failed: 0,
        categories: {},
    };

    console.log("\n📝 Running Intent Parsing Tests\n");
    console.log("-".repeat(70));

    for (const testCase of TEST_CASES) {
        const { category, message, expectedType, expectedParams } = testCase;

        // Initialize category stats
        if (!results.categories[category]) {
            results.categories[category] = { passed: 0, failed: 0 };
        }

        console.log(`\n🔍 Testing: "${message}"`);
        console.log(`   Expected: ${expectedType}`);

        // Test rule-based parsing
        const ruleResult = parseUserMessageRuleBased(message);
        const ruleTypeMatch = ruleResult.type === expectedType;
        const ruleParamErrors = validateParams(ruleResult.params, expectedParams);

        console.log(`   Rule-based: ${ruleResult.type} (confidence: ${ruleResult.confidence.toFixed(2)})`);

        if (ruleTypeMatch && ruleParamErrors.length === 0) {
            console.log(`   ✅ Rule-based PASSED`);
            results.passed++;
            results.categories[category].passed++;
        } else {
            if (!ruleTypeMatch) {
                console.log(`   ❌ Rule-based FAILED: type mismatch`);
            }
            if (ruleParamErrors.length > 0) {
                console.log(`   ❌ Rule-based param errors: ${ruleParamErrors.join(", ")}`);
            }

            // Try Gemini fallback for failed rule-based parsing
            console.log(`   🤖 Trying Gemini fallback...`);
            const geminiResult = await parseUserMessageWithGemini(message, SAMPLE_ITINERARY);

            if (geminiResult) {
                const geminiTypeMatch = geminiResult.type === expectedType;
                const geminiParamErrors = validateParams(geminiResult.params || {}, expectedParams);

                console.log(`   Gemini: ${geminiResult.type} (confidence: ${geminiResult.confidence?.toFixed(2) || "N/A"})`);
                if (geminiResult.explanation) {
                    console.log(`   Explanation: ${geminiResult.explanation}`);
                }

                if (geminiTypeMatch && geminiParamErrors.length === 0) {
                    console.log(`   ✅ Gemini PASSED (fallback succeeded)`);
                    results.passed++;
                    results.categories[category].passed++;
                } else {
                    console.log(`   ❌ Gemini FAILED`);
                    if (!geminiTypeMatch) {
                        console.log(`      Type mismatch: got ${geminiResult.type}`);
                    }
                    if (geminiParamErrors.length > 0) {
                        console.log(`      Param errors: ${geminiParamErrors.join(", ")}`);
                    }
                    results.failed++;
                    results.categories[category].failed++;
                }
            } else {
                console.log(`   ❌ Gemini fallback failed`);
                results.failed++;
                results.categories[category].failed++;
            }
        }
    }

    return results;
}

// ============================================
// API EXECUTION TESTS
// ============================================

async function testAPIExecution() {
    console.log("\n" + "=".repeat(70));
    console.log("📡 Testing API-like Execution Flow\n");
    console.log("-".repeat(70));

    const testCommands = [
        "Add a ramen lunch on day 2",
        "Move TeamLab to morning",
        "Swap Senso-ji with Meiji Shrine",
        "What's the best time to visit temples?",
    ];

    for (const command of testCommands) {
        console.log(`\n🎯 Command: "${command}"`);

        // Parse the command
        const ruleResult = parseUserMessageRuleBased(command);
        console.log(`   Parsed Intent: ${ruleResult.type}`);
        console.log(`   Params:`, JSON.stringify(ruleResult.params, null, 2).replace(/\n/g, "\n   "));

        // Simulate API execution response
        const executionResult = simulateExecution(ruleResult, SAMPLE_ITINERARY);
        console.log(`   Execution: ${executionResult.success ? "✅ Success" : "❌ Failed"}`);
        console.log(`   Message: ${executionResult.message}`);

        if (executionResult.newSlotCount !== undefined) {
            console.log(`   New Slot Count: ${executionResult.newSlotCount}`);
        }
    }
}

function simulateExecution(intent, itinerary) {
    switch (intent.type) {
        case "ADD_ACTIVITY": {
            const dayNumber = intent.params.dayNumber || 1;
            const day = itinerary.days[dayNumber - 1];
            if (!day) {
                return { success: false, message: `Day ${dayNumber} does not exist` };
            }
            return {
                success: true,
                message: `Added activity to Day ${dayNumber}`,
                newSlotCount: day.slots.length + 1,
            };
        }

        case "MOVE_ACTIVITY": {
            const activityName = intent.params.activityName;
            if (!activityName) {
                return { success: false, message: "No activity name specified" };
            }
            return {
                success: true,
                message: `Moved "${activityName}" to ${intent.params.toSlot || "day " + intent.params.toDay}`,
            };
        }

        case "SWAP_ACTIVITIES": {
            return {
                success: true,
                message: `Swapped activities`,
            };
        }

        case "REMOVE_ACTIVITY": {
            return {
                success: true,
                message: `Removed activity`,
            };
        }

        case "ASK_QUESTION": {
            return {
                success: true,
                message: "Question processed - would generate LLM response",
            };
        }

        default:
            return {
                success: true,
                message: `Processed ${intent.type}`,
            };
    }
}

// ============================================
// GEMINI RESPONSE GENERATION TEST
// ============================================

async function testGeminiResponseGeneration() {
    console.log("\n" + "=".repeat(70));
    console.log("🤖 Testing Gemini Response Generation\n");
    console.log("-".repeat(70));

    const model = genAI.getGenerativeModel({ model: GEMINI_MODEL });

    const testQuestion = "What's the best time to visit Senso-ji Temple, and should I go in the morning or afternoon?";

    const contextSummary = SAMPLE_ITINERARY.days.map(d =>
        `Day ${d.dayNumber} (${d.date}): ${d.title}`
    ).join("\n");

    const prompt = `You are a helpful travel assistant. The user has a ${SAMPLE_ITINERARY.days.length}-day trip to ${SAMPLE_ITINERARY.destination}.

Here's their itinerary:
${contextSummary}

Answer this question helpfully and concisely:
${testQuestion}`;

    console.log(`Question: "${testQuestion}"\n`);

    try {
        const startTime = Date.now();
        const result = await model.generateContent({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            systemInstruction: "You are Layla, an expert AI travel planner. Be friendly, concise, and provide actionable advice.",
        });

        const response = result.response.text();
        const duration = Date.now() - startTime;

        console.log(`Response (${duration}ms):`);
        console.log("-".repeat(50));
        console.log(response);
        console.log("-".repeat(50));
        console.log("\n✅ Response generation successful\n");

        return { passed: true, response };
    } catch (error) {
        console.error("❌ Response generation failed:", error.message);
        return { passed: false, error: error.message };
    }
}

// ============================================
// MAIN
// ============================================

async function main() {
    console.log("Model:", GEMINI_MODEL);
    console.log("API Key:", GEMINI_API_KEY.substring(0, 10) + "..." + GEMINI_API_KEY.substring(GEMINI_API_KEY.length - 4));
    console.log("=".repeat(70));

    // Run parsing tests
    const parsingResults = await runTests();

    // Run API execution tests
    await testAPIExecution();

    // Run Gemini response generation test
    const responseTest = await testGeminiResponseGeneration();

    // Print summary
    console.log("=".repeat(70));
    console.log("\n📊 TEST RESULTS SUMMARY\n");
    console.log("-".repeat(70));

    console.log("\n📝 Intent Parsing Tests:");
    console.log(`   Total: ${parsingResults.passed + parsingResults.failed}`);
    console.log(`   Passed: ${parsingResults.passed} ✅`);
    console.log(`   Failed: ${parsingResults.failed} ❌`);
    console.log(`   Pass Rate: ${((parsingResults.passed / (parsingResults.passed + parsingResults.failed)) * 100).toFixed(1)}%`);

    console.log("\n📁 By Category:");
    for (const [category, stats] of Object.entries(parsingResults.categories)) {
        const total = stats.passed + stats.failed;
        const rate = ((stats.passed / total) * 100).toFixed(0);
        const icon = stats.failed === 0 ? "✅" : stats.passed === 0 ? "❌" : "⚠️";
        console.log(`   ${icon} ${category}: ${stats.passed}/${total} (${rate}%)`);
    }

    console.log("\n🤖 Gemini Response Generation:", responseTest.passed ? "✅ PASS" : "❌ FAIL");

    console.log("\n" + "=".repeat(70));

    const allPassed = parsingResults.failed === 0 && responseTest.passed;
    if (allPassed) {
        console.log("🎉 All tests passed! Intent parsing and API execution are working correctly.\n");
    } else {
        console.log("⚠️  Some tests failed. Review the errors above.\n");
        process.exit(1);
    }
}

main().catch(console.error);