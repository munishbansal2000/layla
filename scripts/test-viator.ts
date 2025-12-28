/**
 * Test script for Viator API integration
 * Run with: npx tsx scripts/test-viator.ts
 *
 * Note: This script reads API key directly for standalone testing.
 * Update the key below or set VIATOR_API_KEY environment variable.
 */

// Read from environment or use the key from .env.local
const VIATOR_API_KEY = process.env.VIATOR_API_KEY || "6e6c1fd8-a776-48c2-b194-25fabe4b94fc";
const VIATOR_ENV = process.env.VIATOR_ENV || "sandbox";

const BASE_URLS = {
  sandbox: "https://api.sandbox.viator.com/partner",
  production: "https://api.viator.com/partner",
} as const;

const BASE_URL = BASE_URLS[VIATOR_ENV as keyof typeof BASE_URLS] || BASE_URLS.sandbox;

async function viatorFetch<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${BASE_URL}${endpoint}`;

  console.log(`🔗 Calling: ${url}`);

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

async function testSearchDestinations() {
  console.log("\n📍 Testing: Search Destinations (Paris)");
  console.log("─".repeat(50));

  const response = await viatorFetch<{ destinations: Array<{ destinationId: number; destinationName: string }> }>(
    "/destinations/search",
    {
      method: "POST",
      body: JSON.stringify({
        searchTerm: "Paris",
        includeDetails: true,
      }),
    }
  );

  if (response.destinations && response.destinations.length > 0) {
    console.log(`✅ Found ${response.destinations.length} destinations`);
    console.log("   Top 3 results:");
    response.destinations.slice(0, 3).forEach((dest, i) => {
      console.log(`   ${i + 1}. ${dest.destinationName} (ID: ${dest.destinationId})`);
    });
    return response.destinations[0].destinationId;
  } else {
    console.log("⚠️  No destinations found");
    return null;
  }
}

async function testSearchProducts(destId: number) {
  console.log("\n🎫 Testing: Search Products (Tours in Paris)");
  console.log("─".repeat(50));

  const response = await viatorFetch<{ products: Array<{ productCode: string; title: string; pricing?: { summary?: { fromPrice: number; currency: string } } }>; totalCount: number }>(
    "/products/search",
    {
      method: "POST",
      body: JSON.stringify({
        filtering: {
          destination: destId.toString(),
        },
        sorting: {
          sort: "TOP_SELLERS",
          order: "DESCENDING",
        },
        pagination: {
          start: 1,
          count: 5,
        },
        currency: "USD",
      }),
    }
  );

  if (response.products && response.products.length > 0) {
    console.log(`✅ Found ${response.totalCount} total products`);
    console.log("   Top 5 results:");
    response.products.slice(0, 5).forEach((product, i) => {
      const price = product.pricing?.summary?.fromPrice;
      const priceStr = price ? `$${price}` : "Price N/A";
      console.log(`   ${i + 1}. ${product.title.substring(0, 60)}...`);
      console.log(`      Code: ${product.productCode} | ${priceStr}`);
    });
    return response.products[0].productCode;
  } else {
    console.log("⚠️  No products found");
    return null;
  }
}

async function testGetProductDetails(productCode: string) {
  console.log("\n📋 Testing: Get Product Details");
  console.log("─".repeat(50));

  const product = await viatorFetch<{ productCode: string; title: string; description?: string; duration?: { fixedDurationInMinutes?: number } }>(
    `/products/${productCode}`
  );

  if (product) {
    console.log(`✅ Product Details Retrieved`);
    console.log(`   Title: ${product.title}`);
    console.log(`   Code: ${product.productCode}`);
    if (product.duration?.fixedDurationInMinutes) {
      const hours = Math.floor(product.duration.fixedDurationInMinutes / 60);
      const mins = product.duration.fixedDurationInMinutes % 60;
      console.log(`   Duration: ${hours}h ${mins}m`);
    }
    if (product.description) {
      console.log(`   Description: ${product.description.substring(0, 100)}...`);
    }
    return true;
  } else {
    console.log("⚠️  Could not fetch product details");
    return false;
  }
}

async function runTests() {
  console.log("═".repeat(50));
  console.log("🧪 VIATOR API INTEGRATION TEST");
  console.log("═".repeat(50));
  console.log(`📡 Environment: ${VIATOR_ENV}`);
  console.log(`🔑 API Key: ${VIATOR_API_KEY ? VIATOR_API_KEY.substring(0, 8) + "..." : "NOT SET"}`);
  console.log(`🌐 Base URL: ${BASE_URL}`);

  if (!VIATOR_API_KEY) {
    console.error("\n❌ ERROR: VIATOR_API_KEY is not set in .env.local");
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  try {
    // Test 1: Search Destinations
    const destId = await testSearchDestinations();
    if (destId) {
      passed++;
    } else {
      failed++;
    }

    // Test 2: Search Products
    if (destId) {
      const productCode = await testSearchProducts(destId);
      if (productCode) {
        passed++;
      } else {
        failed++;
      }

      // Test 3: Get Product Details
      if (productCode) {
        const success = await testGetProductDetails(productCode);
        if (success) {
          passed++;
        } else {
          failed++;
        }
      }
    }

    // Summary
    console.log("\n" + "═".repeat(50));
    console.log("📊 TEST SUMMARY");
    console.log("═".repeat(50));
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);

    if (failed === 0) {
      console.log("\n🎉 All tests passed! Your Viator API integration is working correctly.");
    } else {
      console.log("\n⚠️  Some tests failed. Check the errors above.");
    }

  } catch (error) {
    console.error("\n❌ TEST FAILED WITH ERROR:");
    console.error(error);
    process.exit(1);
  }
}

runTests();
