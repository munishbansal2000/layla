#!/usr/bin/env node
/**
 * Test Viator API capabilities
 * 
 * Tests:
 * 1. Basic search by destination
 * 2. Search with text/keyword filtering
 * 3. Search by attraction/POI name
 * 4. Search with tags
 * 5. Freetext search endpoint
 * 
 * Run: node scripts/test-viator-api.mjs
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: join(__dirname, "../.env.local") });

const VIATOR_API_KEY = process.env.VIATOR_API_KEY;
const VIATOR_ENV = process.env.VIATOR_ENV || "sandbox";

const BASE_URLS = {
  sandbox: "https://api.sandbox.viator.com/partner",
  production: "https://api.viator.com/partner",
};

const BASE_URL = BASE_URLS[VIATOR_ENV] || BASE_URLS.sandbox;

console.log("=".repeat(60));
console.log("VIATOR API CAPABILITY TEST");
console.log("=".repeat(60));
console.log(`Environment: ${VIATOR_ENV}`);
console.log(`Base URL: ${BASE_URL}`);
console.log(`API Key: ${VIATOR_API_KEY ? VIATOR_API_KEY.substring(0, 8) + "..." : "MISSING"}`);
console.log();

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

// Known destination IDs
const TOKYO_DEST_ID = 334; // Tokyo
const KYOTO_DEST_ID = 332; // Kyoto

// Test POIs
const TEST_POIS = [
  { name: "Senso-ji Temple", city: "Tokyo", destId: TOKYO_DEST_ID },
  { name: "Tokyo Tower", city: "Tokyo", destId: TOKYO_DEST_ID },
  { name: "Fushimi Inari Shrine", city: "Kyoto", destId: KYOTO_DEST_ID },
  { name: "Kinkaku-ji", city: "Kyoto", destId: KYOTO_DEST_ID },
];

// ============================================
// TEST 1: Basic search by destination
// ============================================
async function test1_BasicSearch() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 1: Basic Search by Destination (Tokyo)");
  console.log("=".repeat(60));

  try {
    const response = await viatorFetch("/products/search", {
      method: "POST",
      body: JSON.stringify({
        filtering: {
          destination: TOKYO_DEST_ID.toString(),
        },
        sorting: {
          sort: "TRAVELER_RATING",
          order: "DESCENDING",
        },
        pagination: {
          start: 1,
          count: 5,
        },
        currency: "USD",
      }),
    });

    console.log(`✅ Success! Found ${response.totalCount} products`);
    console.log("\nTop 5 products:");
    response.products?.slice(0, 5).forEach((p, i) => {
      console.log(`  ${i + 1}. ${p.title}`);
      console.log(`     Code: ${p.productCode}`);
      console.log(`     Rating: ${p.reviews?.combinedAverageRating || "N/A"}`);
      console.log(`     Price: $${p.pricing?.summary?.fromPrice || "N/A"}`);
    });

    return response;
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
    return null;
  }
}

// ============================================
// TEST 2: Search with searchText parameter
// ============================================
async function test2_SearchWithText() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 2: Search with searchText parameter");
  console.log("=".repeat(60));

  const searchTerms = ["Senso-ji", "temple tour", "Tokyo Tower"];

  for (const searchTerm of searchTerms) {
    console.log(`\nSearching for: "${searchTerm}"`);

    try {
      // Try with searchText in filtering
      const response = await viatorFetch("/products/search", {
        method: "POST",
        body: JSON.stringify({
          filtering: {
            destination: TOKYO_DEST_ID.toString(),
            searchText: searchTerm, // Try searchText
          },
          sorting: {
            sort: "RELEVANCE", // Try relevance sorting
            order: "DESCENDING",
          },
          pagination: {
            start: 1,
            count: 5,
          },
          currency: "USD",
        }),
      });

      console.log(`  ✅ Found ${response.totalCount} products`);
      if (response.products?.length > 0) {
        console.log(`  Top result: ${response.products[0].title}`);
      }
    } catch (error) {
      console.log(`  ❌ Failed: ${error.message}`);
    }
  }
}

// ============================================
// TEST 3: Search with text filter (alternative)
// ============================================
async function test3_TextFilter() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 3: Search with text/keyword filter variations");
  console.log("=".repeat(60));

  const variations = [
    { name: "text", body: { filtering: { destination: "334", text: "Senso-ji" } } },
    { name: "keyword", body: { filtering: { destination: "334", keyword: "Senso-ji" } } },
    { name: "keywords", body: { filtering: { destination: "334", keywords: ["Senso-ji"] } } },
    { name: "query", body: { filtering: { destination: "334", query: "Senso-ji" } } },
    { name: "searchTerm", body: { filtering: { destination: "334", searchTerm: "Senso-ji" } } },
  ];

  for (const variation of variations) {
    console.log(`\nTrying "${variation.name}" parameter...`);

    try {
      const response = await viatorFetch("/products/search", {
        method: "POST",
        body: JSON.stringify({
          ...variation.body,
          sorting: { sort: "TRAVELER_RATING", order: "DESCENDING" },
          pagination: { start: 1, count: 3 },
          currency: "USD",
        }),
      });

      console.log(`  ✅ Works! Found ${response.totalCount} products`);
      if (response.products?.length > 0) {
        console.log(`  Top: ${response.products[0].title}`);
      }
    } catch (error) {
      console.log(`  ❌ Failed: ${error.message.substring(0, 100)}...`);
    }
  }
}

// ============================================
// TEST 4: Freetext Search endpoint
// ============================================
async function test4_FreetextSearch() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 4: Freetext Search endpoint");
  console.log("=".repeat(60));

  const endpoints = [
    "/products/search/freetext",
    "/search/freetext",
    "/search/products",
  ];

  for (const endpoint of endpoints) {
    console.log(`\nTrying endpoint: ${endpoint}`);

    try {
      const response = await viatorFetch(endpoint, {
        method: "POST",
        body: JSON.stringify({
          searchTerm: "Senso-ji Temple Tokyo",
          destId: TOKYO_DEST_ID,
          currency: "USD",
          count: 5,
        }),
      });

      console.log(`  ✅ Works! Response keys: ${Object.keys(response).join(", ")}`);
      if (response.products) {
        console.log(`  Found ${response.products.length} products`);
      }
    } catch (error) {
      console.log(`  ❌ Failed: ${error.message.substring(0, 80)}...`);
    }
  }
}

// ============================================
// TEST 5: Search with attraction tags
// ============================================
async function test5_TagSearch() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 5: Search with Tags");
  console.log("=".repeat(60));

  // Common Viator tag IDs (may need verification)
  const tagTests = [
    { name: "Temples & Shrines", tags: [21513] },
    { name: "Cultural Tours", tags: [11873] },
    { name: "Historical Tours", tags: [11877] },
    { name: "Walking Tours", tags: [12678] },
    { name: "Skip the Line", tags: [11890] },
  ];

  for (const test of tagTests) {
    console.log(`\nSearching with tag: ${test.name} (${test.tags.join(", ")})`);

    try {
      const response = await viatorFetch("/products/search", {
        method: "POST",
        body: JSON.stringify({
          filtering: {
            destination: TOKYO_DEST_ID.toString(),
            tags: test.tags,
          },
          sorting: { sort: "TRAVELER_RATING", order: "DESCENDING" },
          pagination: { start: 1, count: 3 },
          currency: "USD",
        }),
      });

      console.log(`  ✅ Found ${response.totalCount} products`);
      response.products?.slice(0, 2).forEach((p) => {
        console.log(`    - ${p.title.substring(0, 60)}...`);
      });
    } catch (error) {
      console.log(`  ❌ Failed: ${error.message.substring(0, 80)}...`);
    }
  }
}

// ============================================
// TEST 6: Get available tags
// ============================================
async function test6_GetTags() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 6: Get Available Tags");
  console.log("=".repeat(60));

  const endpoints = [
    "/tags",
    "/taxonomy/tags",
    "/products/tags",
  ];

  for (const endpoint of endpoints) {
    console.log(`\nTrying endpoint: ${endpoint}`);

    try {
      const response = await viatorFetch(endpoint, { method: "GET" });
      console.log(`  ✅ Works! Response: ${JSON.stringify(response).substring(0, 200)}...`);
    } catch (error) {
      console.log(`  ❌ Failed: ${error.message.substring(0, 80)}...`);
    }
  }
}

// ============================================
// TEST 7: Attraction endpoint
// ============================================
async function test7_AttractionSearch() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 7: Attraction/Location endpoints");
  console.log("=".repeat(60));

  const endpoints = [
    { path: "/attractions/search", body: { destId: TOKYO_DEST_ID, searchText: "Senso-ji" } },
    { path: "/locations/search", body: { destId: TOKYO_DEST_ID, searchText: "Senso-ji" } },
    { path: "/attractions", body: { destId: TOKYO_DEST_ID } },
  ];

  for (const endpoint of endpoints) {
    console.log(`\nTrying endpoint: ${endpoint.path}`);

    try {
      const response = await viatorFetch(endpoint.path, {
        method: "POST",
        body: JSON.stringify(endpoint.body),
      });

      console.log(`  ✅ Works! Response keys: ${Object.keys(response).join(", ")}`);
    } catch (error) {
      console.log(`  ❌ Failed: ${error.message.substring(0, 80)}...`);
    }
  }
}

// ============================================
// TEST 8: Product search with location reference
// ============================================
async function test8_LocationReference() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 8: Search with Location/Attraction Reference");
  console.log("=".repeat(60));

  // Try searching with attraction reference
  const variations = [
    { 
      name: "attractionId",
      body: { 
        filtering: { 
          destination: TOKYO_DEST_ID.toString(),
          attractionId: "senso-ji" 
        } 
      } 
    },
    { 
      name: "attractionLatLng",
      body: { 
        filtering: { 
          destination: TOKYO_DEST_ID.toString(),
          // Senso-ji Temple coordinates
          startPoint: { lat: 35.7148, lng: 139.7967 },
          radius: 1000 // 1km
        } 
      } 
    },
    { 
      name: "boundingBox",
      body: { 
        filtering: { 
          destination: TOKYO_DEST_ID.toString(),
          boundingBox: {
            topLeftLat: 35.7200,
            topLeftLng: 139.7900,
            bottomRightLat: 35.7100,
            bottomRightLng: 139.8000
          }
        } 
      } 
    },
  ];

  for (const variation of variations) {
    console.log(`\nTrying "${variation.name}"...`);

    try {
      const response = await viatorFetch("/products/search", {
        method: "POST",
        body: JSON.stringify({
          ...variation.body,
          sorting: { sort: "TRAVELER_RATING", order: "DESCENDING" },
          pagination: { start: 1, count: 3 },
          currency: "USD",
        }),
      });

      console.log(`  ✅ Works! Found ${response.totalCount} products`);
      response.products?.slice(0, 2).forEach((p) => {
        console.log(`    - ${p.title.substring(0, 60)}...`);
      });
    } catch (error) {
      console.log(`  ❌ Failed: ${error.message.substring(0, 100)}...`);
    }
  }
}

// ============================================
// TEST 9: Check full product details for location info
// ============================================
async function test9_ProductDetails() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 9: Check Product Details for Location Info");
  console.log("=".repeat(60));

  // First get a product
  try {
    const searchResponse = await viatorFetch("/products/search", {
      method: "POST",
      body: JSON.stringify({
        filtering: { destination: TOKYO_DEST_ID.toString() },
        sorting: { sort: "TRAVELER_RATING", order: "DESCENDING" },
        pagination: { start: 1, count: 1 },
        currency: "USD",
      }),
    });

    if (searchResponse.products?.length > 0) {
      const productCode = searchResponse.products[0].productCode;
      console.log(`\nGetting details for: ${productCode}`);

      const details = await viatorFetch(`/products/${productCode}`, { method: "GET" });
      
      console.log("\nProduct structure:");
      console.log(`  Title: ${details.title}`);
      console.log(`  Keys: ${Object.keys(details).join(", ")}`);
      
      // Check for location-related fields
      const locationFields = ["itinerary", "locations", "attractions", "startPoint", "endPoint", "meetingPoint"];
      for (const field of locationFields) {
        if (details[field]) {
          console.log(`  ✅ Has "${field}": ${JSON.stringify(details[field]).substring(0, 100)}...`);
        }
      }

      // Check itinerary for POI references
      if (details.itinerary) {
        console.log("\nItinerary structure:");
        console.log(`  Type: ${typeof details.itinerary}`);
        if (Array.isArray(details.itinerary)) {
          details.itinerary.slice(0, 3).forEach((item, i) => {
            console.log(`  Item ${i}: ${JSON.stringify(item).substring(0, 100)}...`);
          });
        } else {
          console.log(`  Content: ${JSON.stringify(details.itinerary).substring(0, 200)}...`);
        }
      }
    }
  } catch (error) {
    console.log(`❌ Failed: ${error.message}`);
  }
}

// ============================================
// TEST 10: Try attractions endpoint directly
// ============================================
async function test10_AttractionsEndpoint() {
  console.log("\n" + "=".repeat(60));
  console.log("TEST 10: Attractions API endpoint");
  console.log("=".repeat(60));

  // Try GET with query params
  try {
    console.log("\nTrying GET /attractions?destId=334...");
    const response = await viatorFetch(`/attractions?destId=${TOKYO_DEST_ID}`, { method: "GET" });
    console.log(`  ✅ Works! Keys: ${Object.keys(response).join(", ")}`);
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message.substring(0, 80)}...`);
  }

  // Try POST
  try {
    console.log("\nTrying POST /attractions...");
    const response = await viatorFetch("/attractions", {
      method: "POST", 
      body: JSON.stringify({ destId: TOKYO_DEST_ID, count: 10 }),
    });
    console.log(`  ✅ Works! Keys: ${Object.keys(response).join(", ")}`);
  } catch (error) {
    console.log(`  ❌ Failed: ${error.message.substring(0, 80)}...`);
  }
}

// ============================================
// RUN ALL TESTS
// ============================================
async function runTests() {
  if (!VIATOR_API_KEY) {
    console.error("❌ VIATOR_API_KEY not set in .env.local");
    process.exit(1);
  }

  await test1_BasicSearch();
  await test2_SearchWithText();
  await test3_TextFilter();
  await test4_FreetextSearch();
  await test5_TagSearch();
  await test6_GetTags();
  await test7_AttractionSearch();
  await test8_LocationReference();
  await test9_ProductDetails();
  await test10_AttractionsEndpoint();

  console.log("\n" + "=".repeat(60));
  console.log("TESTS COMPLETE");
  console.log("=".repeat(60));
}

runTests().catch(console.error);
