/**
 * Test script to debug the suggestions duplicate filtering
 * Run with: node scripts/test-suggestions-filter.mjs
 */

import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(
    import.meta.url));

// Load the test itinerary
const testItinerary = JSON.parse(
    readFileSync(join(__dirname, "../src/fixtures/test-itinerary.json"), "utf-8")
);

// Normalization function (same as in the component - handles diacritical marks)
function normalizeName(name) {
    return name
        .normalize("NFD") // Decompose Unicode characters (ō → o + combining macron)
        .replace(/[\u0300-\u036f]/g, "") // Remove diacritical marks (accents, macrons, etc.)
        .toLowerCase()
        .replace(/[-\s]+/g, "") // Remove hyphens and spaces
        .replace(/temple|shrine|museum|park|garden|station/gi, "") // Remove common suffixes
        .trim();
}

console.log("=".repeat(60));
console.log("Testing Suggestions Duplicate Filter");
console.log("=".repeat(60));

// Step 1: Extract all activity names from the itinerary
console.log("\n📋 Step 1: Activities in the itinerary:");
console.log("-".repeat(40));

const excludeNames = [];
const excludeIds = [];

for (const day of testItinerary.days) {
    console.log(`\nDay ${day.dayNumber} (${day.city}):`);
    for (const slot of day.slots) {
        for (const opt of slot.options) {
            if (opt.id) excludeIds.push(opt.id);
            if (opt.activity && opt.activity.name) {
                const original = opt.activity.name;
                const lowercase = original.toLowerCase();
                const normalized = normalizeName(original);

                excludeNames.push(lowercase);
                excludeNames.push(normalized);

                console.log(`  - "${original}"`);
                console.log(`    └─ lowercase: "${lowercase}"`);
                console.log(`    └─ normalized: "${normalized}"`);
            }
        }
    }
}

console.log("\n📝 Step 2: All exclude names collected:");
console.log("-".repeat(40));
console.log("Unique exclude names:", [...new Set(excludeNames)]);

// Step 3: Test against sample API suggestion names
console.log("\n🔍 Step 3: Testing filter against sample suggestion names:");
console.log("-".repeat(40));

const testSuggestions = [
    "Senso-ji Temple",
    "Sensoji Temple",
    "Senso ji",
    "Sensoji",
    "Sensō-ji", // With macron over 'o' - this is what the API returns
    "Sensō-ji Temple",
    "Tokyo Skytree",
    "Meiji Shrine",
    "Shibuya Crossing",
    "Tsukiji Outer Market",
    "teamLab Borderless",
    "TeamLab Planets",
    "Fushimi Inari Shrine",
    "Kinkaku-ji Temple",
    "Arashiyama Bamboo Grove",
];

for (const suggestionName of testSuggestions) {
    const lowercase = suggestionName.toLowerCase();
    const normalized = normalizeName(suggestionName);

    const matchesLowercase = excludeNames.includes(lowercase);
    const matchesNormalized = excludeNames.includes(normalized);
    const shouldFilter = matchesLowercase || matchesNormalized;

    const status = shouldFilter ? "❌ FILTERED" : "✅ ALLOWED";

    console.log(`\n${status}: "${suggestionName}"`);
    console.log(`  lowercase: "${lowercase}" → ${matchesLowercase ? "MATCH" : "no match"}`);
    console.log(`  normalized: "${normalized}" → ${matchesNormalized ? "MATCH" : "no match"}`);
}

// Step 4: Call the actual suggestions API
console.log("\n🌐 Step 4: Calling suggestions API:");
console.log("-".repeat(40));

async function testApi() {
    try {
        const response = await fetch("http://localhost:3000/api/japan-itinerary/suggestions", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                city: "tokyo",
                slotType: "morning",
                coordinates: { lat: 35.7148, lng: 139.7967 }, // Near Asakusa
                maxDistance: 2000,
                limit: 10,
                includeKlook: false,
                excludeIds,
                excludeNames,
            }),
        });

        const data = await response.json();

        if (data.success) {
            console.log(`\nAPI returned ${data.data.suggestions.length} suggestions:`);
            for (const suggestion of data.data.suggestions) {
                const name = suggestion.activity.name;
                const normalized = normalizeName(name);
                const wouldBeFiltered = excludeNames.includes(name.toLowerCase()) ||
                    excludeNames.includes(normalized);

                console.log(`  - "${name}" (${suggestion.activity.category})`);
                console.log(`    normalized: "${normalized}"`);
                console.log(`    in excludeNames: ${wouldBeFiltered ? "YES - should have been filtered!" : "no"}`);
            }
        } else {
            console.log("API Error:", data.error);
        }
    } catch (error) {
        console.log("Failed to call API (is the dev server running?):", error.message);
    }
}

await testApi();

console.log("\n" + "=".repeat(60));
console.log("Test complete!");
console.log("=".repeat(60));