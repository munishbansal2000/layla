#!/usr/bin/env node

/**
 * Test OpenStreetMap/Nominatim API Responses
 * Shows raw responses from OpenStreetMap for different query types
 */

const NOMINATIM_BASE_URL = "https://nominatim.openstreetmap.org";
const USER_AGENT = "LaylaClone/1.0 (travel-planning-app)";

// Rate limiting - 1 request per second for Nominatim
async function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function searchNominatim(query) {
    const params = new URLSearchParams({
        q: query,
        format: 'jsonv2',
        addressdetails: '1',
        extratags: '1',
        namedetails: '1',
        limit: '3',
    });

    const response = await fetch(`${NOMINATIM_BASE_URL}/search?${params}`, {
        headers: {
            'User-Agent': USER_AGENT,
            'Accept': 'application/json',
        },
    });

    if (!response.ok) {
        throw new Error(`Nominatim error: ${response.status}`);
    }

    return response.json();
}

function printResponse(title, results) {
    console.log('\n' + '═'.repeat(70));
    console.log(`  ${title}`);
    console.log('═'.repeat(70));

    if (results.length === 0) {
        console.log('  No results found');
        return;
    }

    results.forEach((r, i) => {
        console.log(`\n  Result ${i + 1}:`);
        console.log(`  ─────────────────────────────────────────────────────────────────`);
        console.log(`  display_name: ${r.display_name}`);
        console.log(`  type: ${r.type}, class: ${r.class}`);
        console.log(`  lat: ${r.lat}, lon: ${r.lon}`);

        if (r.namedetails) {
            console.log(`  namedetails:`);
            if (r.namedetails.name) console.log(`    name: ${r.namedetails.name}`);
            if (r.namedetails['name:en']) console.log(`    name:en: ${r.namedetails['name:en']}`);
            if (r.namedetails['name:ja']) console.log(`    name:ja: ${r.namedetails['name:ja']}`);
        }

        if (r.address) {
            console.log(`  address:`);
            if (r.address.city) console.log(`    city: ${r.address.city}`);
            if (r.address.town) console.log(`    town: ${r.address.town}`);
            if (r.address.county) console.log(`    county: ${r.address.county}`);
            if (r.address.state) console.log(`    state: ${r.address.state}`);
            if (r.address.country) console.log(`    country: ${r.address.country}`);
        }

        if (r.extratags && Object.keys(r.extratags).length > 0) {
            console.log(`  extratags:`);
            const tags = Object.entries(r.extratags).slice(0, 5);
            tags.forEach(([k, v]) => console.log(`    ${k}: ${v}`));
            if (Object.keys(r.extratags).length > 5) {
                console.log(`    ... and ${Object.keys(r.extratags).length - 5} more tags`);
            }
        }
    });
}

async function runTests() {
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║           OpenStreetMap/Nominatim API Response Examples              ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');

    // Test 1: Train Station lookup - DIFFERENT QUERY FORMATS
    console.log('\n\n🚉 TRAIN STATION LOOKUPS - Testing Query Formats');
    console.log('━'.repeat(70));

    // Try different query formats to find what works
    let results = await searchNominatim('Tokyo Station Japan');
    printResponse('Query: "Tokyo Station Japan"', results);
    await delay(1100);

    results = await searchNominatim('東京駅'); // Japanese: Tokyo Station
    printResponse('Query: "東京駅" (Tokyo Station in Japanese)', results);
    await delay(1100);

    results = await searchNominatim('Kyoto Station Japan railway');
    printResponse('Query: "Kyoto Station Japan railway"', results);
    await delay(1100);

    results = await searchNominatim('京都駅'); // Japanese: Kyoto Station
    printResponse('Query: "京都駅" (Kyoto Station in Japanese)', results);
    await delay(1100);

    results = await searchNominatim('Gare de Lyon Paris');
    printResponse('Query: "Gare de Lyon Paris"', results);
    await delay(1100);

    results = await searchNominatim('Paris Gare du Nord');
    printResponse('Query: "Paris Gare du Nord"', results);
    await delay(1100);

    // Test 2: Airport lookup
    console.log('\n\n✈️  AIRPORT LOOKUPS');
    console.log('━'.repeat(70));

    results = await searchNominatim('Narita Airport');
    printResponse('Query: "Narita Airport"', results);
    await delay(1100);

    results = await searchNominatim('成田空港'); // Japanese: Narita Airport
    printResponse('Query: "成田空港" (Narita Airport in Japanese)', results);
    await delay(1100);

    results = await searchNominatim('Kansai International Airport');
    printResponse('Query: "Kansai International Airport"', results);
    await delay(1100);

    // Test 3: City country lookup
    console.log('\n\n🌍 CITY COUNTRY LOOKUPS');
    console.log('━'.repeat(70));

    results = await searchNominatim('Tokyo Japan');
    printResponse('Query: "Tokyo Japan" (to get country)', results);
    await delay(1100);

    results = await searchNominatim('Kanazawa Japan');
    printResponse('Query: "Kanazawa Japan"', results);
    await delay(1100);

    // Test 4: Station with city name format
    console.log('\n\n🏙️  STATION WITH CITY NAME FORMAT');
    console.log('━'.repeat(70));

    results = await searchNominatim('Kanazawa Station');
    printResponse('Query: "Kanazawa Station"', results);
    await delay(1100);

    results = await searchNominatim('金沢駅'); // Japanese: Kanazawa Station
    printResponse('Query: "金沢駅" (Kanazawa Station in Japanese)', results);
    await delay(1100);

    results = await searchNominatim('Porto São Bento station');
    printResponse('Query: "Porto São Bento station"', results);
    await delay(1100);

    console.log('\n\n✅ All queries complete!');
    console.log('\n📋 FINDINGS:');
    console.log('  - "main train station X" does NOT work');
    console.log('  - "X Station" or "X Station Japan" works better');
    console.log('  - Japanese names (東京駅) work well for Japan');
    console.log('  - Specific station names (Gare de Lyon) work best');
}

runTests().catch(console.error);
