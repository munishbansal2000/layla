#!/usr/bin/env node
/**
 * Test Viator API - Deep dive into product itinerary structure
 * 
 * Run: node scripts/test-viator-itinerary.mjs
 */

import dotenv from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
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

console.log("=".repeat(60));
console.log("VIATOR PRODUCT ITINERARY DEEP DIVE");
console.log("=".repeat(60));

async function main() {
  // Get a Senso-ji specific tour
  const searchResponse = await viatorFetch("/products/search", {
    method: "POST",
    body: JSON.stringify({
      filtering: { destination: TOKYO_DEST_ID.toString() },
      sorting: { sort: "TRAVELER_RATING", order: "DESCENDING" },
      pagination: { start: 1, count: 20 },
      currency: "USD",
    }),
  });

  // Find products mentioning specific POIs
  const poiKeywords = ["senso-ji", "sensoji", "asakusa", "tokyo tower", "meiji", "shibuya", "fushimi"];
  
  console.log("\n--- Products with POI names in title ---\n");
  
  const poiProducts = searchResponse.products.filter(p => {
    const title = p.title.toLowerCase();
    return poiKeywords.some(k => title.includes(k));
  });

  console.log(`Found ${poiProducts.length} products with POI references:\n`);

  // Get full details for first 3
  for (const product of poiProducts.slice(0, 3)) {
    console.log(`\n${"=".repeat(60)}`);
    console.log(`PRODUCT: ${product.title}`);
    console.log(`Code: ${product.productCode}`);
    console.log("=".repeat(60));

    try {
      const details = await viatorFetch(`/products/${product.productCode}`, { method: "GET" });
      
      // Check itinerary items for POI references
      if (details.itinerary?.itineraryItems) {
        console.log(`\nITINERARY ITEMS (${details.itinerary.itineraryItems.length} stops):\n`);
        
        details.itinerary.itineraryItems.forEach((item, i) => {
          console.log(`  STOP ${i + 1}:`);
          console.log(`    Description: ${item.description?.substring(0, 80) || "N/A"}...`);
          
          if (item.pointOfInterestLocation) {
            const poi = item.pointOfInterestLocation;
            console.log(`    POI Location:`);
            console.log(`      Reference: ${poi.location?.ref || "N/A"}`);
            console.log(`      Name: ${poi.attractionId || "N/A"}`);
            
            if (poi.location?.coordinates) {
              console.log(`      Lat: ${poi.location.coordinates.latitude}`);
              console.log(`      Lng: ${poi.location.coordinates.longitude}`);
            }
          }
          
          if (item.location) {
            console.log(`    Location: ${JSON.stringify(item.location)}`);
          }
          
          console.log();
        });
      }

      // Check for attractions/locations fields
      if (details.attractions) {
        console.log(`\nATTRACTIONS field: ${JSON.stringify(details.attractions, null, 2)}`);
      }

      if (details.locations) {
        console.log(`\nLOCATIONS field: ${JSON.stringify(details.locations, null, 2)}`);
      }

      // Check logistics
      if (details.logistics) {
        console.log(`\nLOGISTICS:`);
        if (details.logistics.start) {
          console.log(`  Start: ${JSON.stringify(details.logistics.start).substring(0, 200)}`);
        }
        if (details.logistics.end) {
          console.log(`  End: ${JSON.stringify(details.logistics.end).substring(0, 200)}`);
        }
      }

    } catch (error) {
      console.log(`  Error getting details: ${error.message}`);
    }
  }

  // Test searching by freetext with correct endpoint
  console.log("\n\n" + "=".repeat(60));
  console.log("TESTING /search/freetext ENDPOINT");
  console.log("=".repeat(60));

  try {
    const freetextResponse = await viatorFetch("/search/freetext", {
      method: "POST",
      body: JSON.stringify({
        searchTerm: "Senso-ji Temple",
        searchTypes: [{ searchType: "PRODUCTS" }],
        currency: "USD",
        pagination: { start: 1, count: 5 },
      }),
    });

    console.log("\nFreetext search response keys:", Object.keys(freetextResponse));
    console.log("\nFull response:", JSON.stringify(freetextResponse, null, 2).substring(0, 2000));
  } catch (error) {
    console.log(`Freetext search failed: ${error.message}`);
  }

  // Test getting all tags to understand taxonomy
  console.log("\n\n" + "=".repeat(60));
  console.log("VIATOR TAG TAXONOMY");
  console.log("=".repeat(60));

  try {
    const tagsResponse = await viatorFetch("/products/tags", { method: "GET" });
    
    console.log(`\nTotal tags: ${tagsResponse.tags?.length || 0}`);
    
    // Find temple/shrine related tags
    const templeRelatedTags = tagsResponse.tags?.filter(t => {
      const name = (t.allNamesByLocale?.en || "").toLowerCase();
      return name.includes("temple") || 
             name.includes("shrine") || 
             name.includes("religious") ||
             name.includes("spiritual") ||
             name.includes("historical");
    });

    console.log(`\nTemple/Shrine related tags (${templeRelatedTags?.length || 0}):`);
    templeRelatedTags?.slice(0, 20).forEach(t => {
      console.log(`  ${t.tagId}: ${t.allNamesByLocale?.en}`);
    });

    // Find cultural/tour related tags
    const culturalTags = tagsResponse.tags?.filter(t => {
      const name = (t.allNamesByLocale?.en || "").toLowerCase();
      return name.includes("cultural") || 
             name.includes("walking") || 
             name.includes("guided") ||
             name.includes("skip") ||
             name.includes("museum");
    });

    console.log(`\nCultural/Tour related tags (${culturalTags?.length || 0}):`);
    culturalTags?.slice(0, 20).forEach(t => {
      console.log(`  ${t.tagId}: ${t.allNamesByLocale?.en}`);
    });

  } catch (error) {
    console.log(`Tags fetch failed: ${error.message}`);
  }

}

main().catch(console.error);
