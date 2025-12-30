#!/usr/bin/env node

/**
 * Test script for the suggestions API
 * Run with: node scripts/test-free-slot-suggestions.mjs
 *
 * Make sure dev server is running: npm run dev
 */

const BASE_URL = 'http://localhost:3000';

async function testSuggestionsAPI() {
    console.log('🧪 Testing FreeTimeSlotCard API flow\n');
    console.log('='.repeat(50));

    // Test 1: Basic API call (like the component does)
    console.log('\n📡 Test 1: Basic suggestions API call');
    console.log('-'.repeat(50));

    const requestBody = {
        city: 'tokyo',
        slotType: 'afternoon',
        coordinates: { lat: 35.6762, lng: 139.6503 }, // Shibuya area
        maxDistance: 2000,
        limit: 6,
        excludeNames: ['meiji shrine', 'sensoji temple'],
    };

    console.log('Request:', JSON.stringify(requestBody, null, 2));

    try {
        const response = await fetch(`${BASE_URL}/api/japan-itinerary/suggestions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(requestBody),
        });

        const data = await response.json();

        console.log('\nResponse status:', response.status);
        console.log('Response success:', data.success);

        if (data.success && data.data && data.data.suggestions) {
            console.log(`\n✅ Got ${data.data.suggestions.length} suggestions:\n`);

            data.data.suggestions.forEach((s, i) => {
                console.log(`${i + 1}. ${s.activity.name}`);
                console.log(`   Category: ${s.activity.category}`);
                console.log(`   Duration: ${s.activity.duration} min`);
                console.log(`   Distance: ${s.distance ? (s.distance / 1000).toFixed(1) + 'km' : 'N/A'}`);
                console.log(`   Neighborhood: ${s.activity.place?.neighborhood || 'N/A'}`);
                console.log(`   Ticket: ${s.ticketRequirement || 'free'}`);
                console.log('');
            });

            console.log('Metadata:', JSON.stringify(data.data.metadata, null, 2));
        } else {
            console.log('\n❌ API failed:', data.error || 'Unknown error');
            console.log('Full response:', JSON.stringify(data, null, 2));
        }
    } catch (error) {
        console.error('\n❌ Fetch error:', error.message);
        console.log('\n⚠️  Make sure the dev server is running: npm run dev');
    }

    // Test 2: Different slot types
    console.log('\n' + '='.repeat(50));
    console.log('\n📡 Test 2: Different slot types');
    console.log('-'.repeat(50));

    const slotTypes = ['morning', 'lunch', 'afternoon', 'dinner', 'evening'];

    for (const slotType of slotTypes) {
        try {
            const response = await fetch(`${BASE_URL}/api/japan-itinerary/suggestions`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    city: 'kyoto',
                    slotType,
                    limit: 3,
                }),
            });

            const data = await response.json();

            if (data.success && data.data && data.data.suggestions) {
                console.log(`\n${slotType.toUpperCase()}: ${data.data.suggestions.length} suggestions`);
                data.data.suggestions.slice(0, 2).forEach(s => {
                    console.log(`  - ${s.activity.name} (${s.activity.category})`);
                });
            } else {
                console.log(`\n${slotType.toUpperCase()}: ❌ Failed - ${data.error}`);
            }
        } catch (error) {
            console.log(`\n${slotType.toUpperCase()}: ❌ Error - ${error.message}`);
        }
    }

    // Test 3: Without coordinates (fallback behavior)
    console.log('\n' + '='.repeat(50));
    console.log('\n📡 Test 3: Without coordinates');
    console.log('-'.repeat(50));

    try {
        const response = await fetch(`${BASE_URL}/api/japan-itinerary/suggestions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                city: 'osaka',
                slotType: 'afternoon',
                limit: 5,
                // No coordinates - should still work
            }),
        });

        const data = await response.json();

        if (data.success && data.data && data.data.suggestions) {
            console.log(`\n✅ Got ${data.data.suggestions.length} suggestions without coordinates`);
            data.data.suggestions.forEach(s => {
                console.log(`  - ${s.activity.name}`);
            });
        } else {
            console.log('\n❌ Failed:', data.error);
        }
    } catch (error) {
        console.error('\n❌ Error:', error.message);
    }

    console.log('\n' + '='.repeat(50));
    console.log('\n✅ Test complete!\n');
}

testSuggestionsAPI();