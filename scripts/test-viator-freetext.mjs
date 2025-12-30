#!/usr/bin/env node

/**
 * Test Viator Freetext Search - the POI-specific search capability
 *
 * Run: node scripts/test-viator-freetext.mjs
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(
    import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "../.env.local") });

const VIATOR_API_KEY = process.env.VIATOR_API_KEY;
const BASE_URL = "https://api.viator.com/partner";

async function viatorFetch(endpoint, options = {}) {
    const url = `${BASE_URL}${endpoint}`;

    const response = await fetch(url, {
        ...options,
        headers: {
            "Accept": "application/json;version=2.0",
            "Accept-Language": "en-US",
            "Content-Type": "application/json",
            "exp-api-key": VIATOR_API_KEY,
            ...options.headers,
        },
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Viator API error: ${response.status} - ${errorText}`);
    }

    return response.json();
}

const TOKYO_DEST_ID = 334;
const KYOTO_DEST_ID = 332;

console.log("=".repeat(60));
console.log("VIATOR FREETEXT SEARCH TEST");
console.log("=".repeat(60));

const testPOIs = [
    { name: "Senso-ji Temple", city: "Tokyo", destId: TOKYO_DEST_ID },
    { name: "Tokyo Tower", city: "Tokyo", destId: TOKYO_DEST_ID },
    { name: "Fushimi Inari Shrine", city: "Kyoto", destId: KYOTO_DEST_ID },
    { name: "Kinkaku-ji Golden Pavilion", city: "Kyoto", destId: KYOTO_DEST_ID },
    { name: "Arashiyama Bamboo Grove", city: "Kyoto", destId: KYOTO_DEST_ID },
];

async function main() {
    // Test 1: Freetext search with proper pagination
    console.log("\n--- TEST 1: Freetext Search with Proper Pagination ---\n");

    for (const poi of testPOIs) {
        console.log(`\nSearching: "${poi.name}" in ${poi.city}`);

        try {
            const response = await viatorFetch("/search/freetext", {
                method: "POST",
                body: JSON.stringify({
                    searchTerm: poi.name,
                    searchTypes: [
                        { searchType: "PRODUCTS", pagination: { start: 1, count: 5 } },
                    ],
                    currency: "USD",
                }),
            });

            console.log(`  Response keys: ${Object.keys(response).join(", ")}`);

            if (response.products && response.products.results) {
                console.log(`  ✅ Found ${response.products.totalCount} products`);
                response.products.results.slice(0, 3).forEach((p, i) => {
                    console.log(`    ${i + 1}. ${p.title}`);
                    console.log(`       Price: $${p.pricing?.summary?.fromPrice || "N/A"}`);
                });
            } else if (response.products) {
                console.log(`  Products structure: ${JSON.stringify(response.products).substring(0, 200)}`);
            }

            // Check for attractions/destinations in response
            if (response.destinations) {
                console.log(`  Destinations: ${JSON.stringify(response.destinations).substring(0, 200)}`);
            }
            if (response.attractions) {
                console.log(`  Attractions: ${JSON.stringify(response.attractions).substring(0, 200)}`);
            }

        } catch (error) {
            console.log(`  ❌ Failed: ${error.message.substring(0, 100)}`);
        }
    }

    // Test 2: Search with destination filter
    console.log("\n\n--- TEST 2: Freetext with Destination Filter ---\n");

    try {
        const response = await viatorFetch("/search/freetext", {
            method: "POST",
            body: JSON.stringify({
                searchTerm: "temple tour",
                destId: KYOTO_DEST_ID, // Try adding destination
                searchTypes: [
                    { searchType: "PRODUCTS", pagination: { start: 1, count: 5 } },
                ],
                currency: "USD",
            }),
        });

        console.log(`Response keys: ${Object.keys(response).join(", ")}`);
        if (response.products && response.products.results) {
            console.log(`✅ Found ${response.products.totalCount} products`);
            response.products.results.slice(0, 3).forEach((p, i) => {
                console.log(`  ${i + 1}. ${p.title}`);
            });
        }
    } catch (error) {
        console.log(`❌ Failed: ${error.message.substring(0, 150)}`);
    }

    // Test 3: Search for ATTRACTIONS type
    console.log("\n\n--- TEST 3: Search for ATTRACTIONS type ---\n");

    try {
        const response = await viatorFetch("/search/freetext", {
            method: "POST",
            body: JSON.stringify({
                searchTerm: "Senso-ji",
                searchTypes: [
                    { searchType: "ATTRACTIONS", pagination: { start: 1, count: 5 } },
                ],
                currency: "USD",
            }),
        });

        console.log(`Response keys: ${Object.keys(response).join(", ")}`);
        console.log(`Full response: ${JSON.stringify(response, null, 2)}`);
    } catch (error) {
        console.log(`❌ Failed: ${error.message.substring(0, 150)}`);
    }

    // Test 4: Search for both PRODUCTS and DESTINATIONS
    console.log("\n\n--- TEST 4: Multi-type Search ---\n");

    try {
        const response = await viatorFetch("/search/freetext", {
            method: "POST",
            body: JSON.stringify({
                searchTerm: "Tokyo temple",
                searchTypes: [
                    { searchType: "PRODUCTS", pagination: { start: 1, count: 5 } },
                    { searchType: "DESTINATIONS", pagination: { start: 1, count: 5 } },
                ],
                currency: "USD",
            }),
        });

        console.log(`Response keys: ${Object.keys(response).join(", ")}`);

        if (response.products && response.products.results) {
            console.log(`\nProducts (${response.products.totalCount}):`);
            response.products.results.slice(0, 3).forEach((p, i) => {
                console.log(`  ${i + 1}. ${p.title}`);
            });
        }

        if (response.destinations && response.destinations.results) {
            console.log(`\nDestinations (${response.destinations.totalCount}):`);
            response.destinations.results.slice(0, 3).forEach((d, i) => {
                console.log(`  ${i + 1}. ${d.destinationName} (ID: ${d.destinationId})`);
            });
        }
    } catch (error) {
        console.log(`❌ Failed: ${error.message.substring(0, 150)}`);
    }

    // Test 5: Compare freetext vs regular product search
    console.log("\n\n--- TEST 5: Compare Freetext vs Product Search ---\n");

    const searchTerm = "Fushimi Inari";

    // Regular product search (keyword matching)
    console.log(`Searching for: "${searchTerm}"\n`);

    try {
        // Method 1: Regular product search
        const regularResponse = await viatorFetch("/products/search", {
            method: "POST",
            body: JSON.stringify({
                filtering: { destination: KYOTO_DEST_ID.toString() },
                sorting: { sort: "TRAVELER_RATING", order: "DESCENDING" },
                pagination: { start: 1, count: 50 },
                currency: "USD",
            }),
        });

        // Filter by keyword
        const matchingProducts = regularResponse.products.filter(p =>
            p.title.toLowerCase().includes(searchTerm.toLowerCase())
        );

        console.log(`Regular search + filter: Found ${matchingProducts.length} matching products`);
        matchingProducts.slice(0, 3).forEach((p, i) => {
            console.log(`  ${i + 1}. ${p.title}`);
        });

        // Method 2: Freetext search
        const freetextResponse = await viatorFetch("/search/freetext", {
            method: "POST",
            body: JSON.stringify({
                searchTerm: searchTerm,
                searchTypes: [
                    { searchType: "PRODUCTS", pagination: { start: 1, count: 10 } },
                ],
                currency: "USD",
            }),
        });

        if (freetextResponse.products && freetextResponse.products.results) {
            console.log(`\nFreetext search: Found ${freetextResponse.products.totalCount} products`);
            freetextResponse.products.results.slice(0, 3).forEach((p, i) => {
                console.log(`  ${i + 1}. ${p.title}`);
            });
        }

    } catch (error) {
        console.log(`❌ Failed: ${error.message}`);
    }

    console.log("\n" + "=".repeat(60));
    console.log("TESTS COMPLETE");
    console.log("=".repeat(60));
}

main().catch(console.error);