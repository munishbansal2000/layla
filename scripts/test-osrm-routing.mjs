#!/usr/bin/env node

/**
 * Test OSRM Routing Service
 *
 * Tests that OSRM (OpenStreetMap Routing Machine) is working as the primary
 * routing engine for walk/bike/drive routes.
 */

// Test coordinates (Tokyo area)
const TOKYO_STATION = { lat: 35.6812, lng: 139.7671 };
const SENSO_JI = { lat: 35.7148, lng: 139.7967 };
const SHIBUYA_CROSSING = { lat: 35.6595, lng: 139.7004 };
const MEIJI_SHRINE = { lat: 35.6764, lng: 139.6993 };

// OSRM public demo server
const OSRM_BASE_URL = process.env.OSRM_BASE_URL || "https://router.project-osrm.org";

async function testOSRMRoute(from, to, profile = "foot") {
    const url = `${OSRM_BASE_URL}/route/v1/${profile}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=polyline&steps=true`;

    console.log(`\n🔍 Testing OSRM ${profile} route...`);
    console.log(`   URL: ${url.substring(0, 80)}...`);

    try {
        const start = Date.now();
        const response = await fetch(url, {
            headers: {
                "User-Agent": "LaylaClone/1.0 (travel-planning-app)",
            },
        });
        const elapsed = Date.now() - start;

        if (!response.ok) {
            console.log(`   ❌ HTTP Error: ${response.status}`);
            return null;
        }

        const data = await response.json();

        if (data.code !== "Ok" || !data.routes || data.routes.length === 0) {
            console.log(`   ❌ No route found: ${data.code}`);
            return null;
        }

        const route = data.routes[0];
        const distanceKm = (route.distance / 1000).toFixed(2);
        const durationMin = Math.round(route.duration / 60);
        const legs = route.legs || [];
        const steps = legs.length > 0 && legs[0].steps ? legs[0].steps.length : 0;

        console.log(`   ✅ Success! (${elapsed}ms)`);
        console.log(`   📏 Distance: ${distanceKm} km`);
        console.log(`   ⏱️  Duration: ${durationMin} min`);
        console.log(`   🗺️  Steps: ${steps}`);

        return route;
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
        return null;
    }
}

async function runTests() {
    console.log("═══════════════════════════════════════════════════════════");
    console.log("  OSRM (OpenStreetMap Routing Machine) Test");
    console.log("═══════════════════════════════════════════════════════════");
    console.log(`\n📍 OSRM Server: ${OSRM_BASE_URL}`);

    // Test 1: Walking route (Tokyo Station → Senso-ji Temple)
    console.log("\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("TEST 1: Walking Route (Tokyo Station → Senso-ji Temple)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const walkRoute = await testOSRMRoute(TOKYO_STATION, SENSO_JI, "foot");

    // Test 2: Driving route (Shibuya → Meiji Shrine)
    console.log("\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("TEST 2: Driving Route (Shibuya Crossing → Meiji Shrine)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const driveRoute = await testOSRMRoute(SHIBUYA_CROSSING, MEIJI_SHRINE, "car");

    // Test 3: Cycling route (Senso-ji → Shibuya)
    console.log("\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("TEST 3: Cycling Route (Senso-ji → Shibuya Crossing)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const bikeRoute = await testOSRMRoute(SENSO_JI, SHIBUYA_CROSSING, "bike");

    // Test 4: Short walking distance (nearby locations)
    console.log("\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    console.log("TEST 4: Short Walk (Shibuya → nearby 500m)");
    console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
    const shortWalk = await testOSRMRoute(
        SHIBUYA_CROSSING, { lat: 35.6610, lng: 139.7050 }, // ~500m away
        "foot"
    );

    // Summary
    console.log("\n\n═══════════════════════════════════════════════════════════");
    console.log("  TEST SUMMARY");
    console.log("═══════════════════════════════════════════════════════════");

    const results = [
        { name: "Walking (Tokyo → Senso-ji)", success: !!walkRoute },
        { name: "Driving (Shibuya → Meiji)", success: !!driveRoute },
        { name: "Cycling (Senso-ji → Shibuya)", success: !!bikeRoute },
        { name: "Short Walk (~500m)", success: !!shortWalk },
    ];

    results.forEach(r => {
        console.log(`  ${r.success ? "✅" : "❌"} ${r.name}`);
    });

    const passed = results.filter(r => r.success).length;
    const total = results.length;

    console.log(`\n  Result: ${passed}/${total} tests passed`);

    if (passed === total) {
        console.log("\n  🎉 OSRM routing is working correctly!");
        console.log("  📝 Routes will use OSRM first, then fall back to Google Maps for transit.");
    } else {
        console.log("\n  ⚠️  Some tests failed. Check OSRM server availability.");
    }

    console.log("\n═══════════════════════════════════════════════════════════\n");
}

runTests().catch(console.error);
