#!/usr/bin/env node

/**
 * E2E Inter-City Transfer Flow Test
 * 
 * Calls the production API endpoint - NO logic duplication
 */

const API_URL = 'http://localhost:3000/api/test/transfer-inference';

const INPUT = {
    hotels: [
        {
            name: 'Park Hyatt Tokyo',
            city: 'Tokyo',
            checkIn: '2024-03-15',
            checkOut: '2024-03-18',
            coordinates: { lat: 35.6855, lng: 139.6906 },
        },
        {
            name: 'Ritz-Carlton Kyoto',
            city: 'Kyoto',
            checkIn: '2024-03-18',
            checkOut: '2024-03-22',
            coordinates: { lat: 35.0159, lng: 135.7724 },
        },
    ],
};

async function runTest() {
    console.log('╔══════════════════════════════════════════════════════════════════════╗');
    console.log('║     E2E INTER-CITY TRANSFER FLOW TEST                                ║');
    console.log('║     Calling production API - NO logic duplication                    ║');
    console.log('╚══════════════════════════════════════════════════════════════════════╝');

    console.log('\n📥 INPUT:');
    console.log(JSON.stringify(INPUT, null, 2));

    console.log('\n📡 Calling API:', API_URL);
    console.log('   (Check server console for detailed API call logs)\n');

    try {
        const response = await fetch(API_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(INPUT),
        });

        const result = await response.json();

        console.log('\n📤 RESPONSE:');
        console.log(JSON.stringify(result, null, 2));

        if (result.success) {
            console.log('\n✅ Test completed successfully!');
            
            // Validate the stations are in correct cities
            const transfers = result.result?.transfers || [];
            const interCity = transfers.find(t => t.type === 'inter_city');
            
            if (interCity?.via?.departure) {
                const depCoords = interCity.via.departure.coordinates;
                console.log(`\n🔍 VALIDATION:`);
                console.log(`   Departure station: ${interCity.via.departure.name}`);
                console.log(`   Coords: ${depCoords?.lat?.toFixed(2)}, ${depCoords?.lng?.toFixed(2)}`);
                
                // Check if in Japan (lat ~35, lng ~139)
                if (depCoords && depCoords.lat > 30 && depCoords.lat < 40 && depCoords.lng > 130 && depCoords.lng < 150) {
                    console.log(`   ✅ Station is in Japan`);
                } else {
                    console.log(`   ❌ ERROR: Station is NOT in Japan!`);
                }
            }
        } else {
            console.log('\n❌ Test failed:', result.error);
        }
    } catch (error) {
        console.error('\n❌ Error calling API:', error.message);
        console.log('\nMake sure the dev server is running: npm run dev');
    }
}

runTest();
