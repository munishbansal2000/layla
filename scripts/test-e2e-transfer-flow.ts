#!/usr/bin/env npx ts-node

/**
 * E2E Inter-City Transfer Flow Test
 *
 * Uses ACTUAL production code - no mocking or reimplementation
 * Shows all API calls to OpenStreetMap and OSRM
 */

import { inferTripStructure } from '../src/lib/transfer-inference';
import { getCommuteDuration } from '../src/lib/routing-service';
import type { FlightAnchor, HotelAnchor } from '../src/types/trip-input';

// ============================================
// INPUT DATA
// ============================================

const INPUT_FLIGHTS: FlightAnchor[] = [
  {
    id: 'flight-arrival',
    from: 'SFO',
    to: 'NRT',
    date: '2024-03-15',
    time: '14:30',
    flightNumber: 'JL001',
  },
  {
    id: 'flight-departure',
    from: 'KIX',
    to: 'SFO',
    date: '2024-03-22',
    time: '11:00',
    flightNumber: 'JL002',
  },
];

const INPUT_HOTELS: HotelAnchor[] = [
  {
    id: 'hotel-tokyo',
    name: 'Park Hyatt Tokyo',
    city: 'Tokyo',
    checkIn: '2024-03-15',
    checkOut: '2024-03-18',
    coordinates: { lat: 35.6855, lng: 139.6906 },
  },
  {
    id: 'hotel-kyoto',
    name: 'Ritz-Carlton Kyoto',
    city: 'Kyoto',
    checkIn: '2024-03-18',
    checkOut: '2024-03-22',
    coordinates: { lat: 35.0159, lng: 135.7724 },
  },
];

// ============================================
// MAIN TEST
// ============================================

async function runTest() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║     E2E INTER-CITY TRANSFER FLOW TEST (Production Code)             ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  // ============================================
  // STEP 1: Show Input
  // ============================================
  console.log('\n\n═══════════════════════════════════════════════════════════════════');
  console.log('  STEP 1: INPUT DATA');
  console.log('═══════════════════════════════════════════════════════════════════');

  console.log('\n📋 Flights:');
  INPUT_FLIGHTS.forEach(f => {
    console.log(`   ✈️  ${f.from} → ${f.to} on ${f.date} at ${f.time}`);
  });

  console.log('\n🏨 Hotels:');
  INPUT_HOTELS.forEach(h => {
    console.log(`   🏨 ${h.name} (${h.city})`);
    console.log(`      Check-in: ${h.checkIn}, Check-out: ${h.checkOut}`);
    console.log(`      Coordinates: ${h.coordinates?.lat}, ${h.coordinates?.lng}`);
  });

  // ============================================
  // STEP 2: Run inferTripStructure (calls OpenStreetMap)
  // ============================================
  console.log('\n\n═══════════════════════════════════════════════════════════════════');
  console.log('  STEP 2: INFER TRIP STRUCTURE (OpenStreetMap Nominatim API)');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log('\n🌐 Calling inferTripStructure()...');
  console.log('   This will call OpenStreetMap Nominatim to look up stations\n');

  const startTime = Date.now();
  const tripStructure = await inferTripStructure(INPUT_FLIGHTS, INPUT_HOTELS, []);
  const inferTime = Date.now() - startTime;

  console.log(`\n⏱️  Inference completed in ${inferTime}ms`);

  // ============================================
  // STEP 3: Show Inferred Transfers
  // ============================================
  console.log('\n\n═══════════════════════════════════════════════════════════════════');
  console.log('  STEP 3: INFERRED TRANSFERS');
  console.log('═══════════════════════════════════════════════════════════════════');

  console.log(`\n📊 Found ${tripStructure.transfers.length} transfers:`);

  for (const transfer of tripStructure.transfers) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📍 Transfer: ${transfer.type}`);
    console.log(`   Date: ${transfer.date}`);
    console.log(`   From: ${transfer.from.name || transfer.from.city} (${transfer.from.type})`);
    console.log(`   To: ${transfer.to.name || transfer.to.city} (${transfer.to.type})`);

    if (transfer.via) {
      console.log(`\n   🚉 Via (from OpenStreetMap lookup):`);
      console.log(`      Departure Station: ${transfer.via.departure.name}`);
      console.log(`         City: ${transfer.via.departure.city}`);
      console.log(`         Coordinates: ${JSON.stringify(transfer.via.departure.coordinates)}`);
      console.log(`      Arrival Station: ${transfer.via.arrival.name}`);
      console.log(`         City: ${transfer.via.arrival.city}`);
      console.log(`         Coordinates: ${JSON.stringify(transfer.via.arrival.coordinates)}`);
      console.log(`      Mode: ${transfer.via.mode}`);
    }

    console.log(`\n   📋 Transfer Options:`);
    transfer.options.forEach(opt => {
      console.log(`      - ${opt.name} (${opt.mode})${opt.recommended ? ' ⭐ Recommended' : ''}`);
    });
  }

  // ============================================
  // STEP 4: Calculate Commutes with OSRM
  // ============================================
  console.log('\n\n═══════════════════════════════════════════════════════════════════');
  console.log('  STEP 4: CALCULATE COMMUTE DURATIONS (OSRM API)');
  console.log('═══════════════════════════════════════════════════════════════════');

  // Find the inter-city transfer
  const interCityTransfer = tripStructure.transfers.find(t => t.type === 'inter_city');

  if (interCityTransfer && interCityTransfer.via) {
    console.log('\n🚶 Calculating commute: Hotel → Station');
    console.log(`   From: ${interCityTransfer.from.name}`);
    console.log(`   To: ${interCityTransfer.via.departure.name}`);

    if (interCityTransfer.from.coordinates && interCityTransfer.via.departure.coordinates) {
      const hotelToStation = await getCommuteDuration(
        interCityTransfer.from.name || interCityTransfer.from.city,
        interCityTransfer.via.departure.name || 'Station',
        'walk',
        {
          originLatLng: interCityTransfer.from.coordinates,
          destLatLng: interCityTransfer.via.departure.coordinates,
        }
      );
      console.log(`   ✅ OSRM Result: ${hotelToStation} minutes`);
    }

    console.log('\n🚶 Calculating commute: Station → Hotel');
    console.log(`   From: ${interCityTransfer.via.arrival.name}`);
    console.log(`   To: ${interCityTransfer.to.name}`);

    if (interCityTransfer.via.arrival.coordinates && interCityTransfer.to.coordinates) {
      const stationToHotel = await getCommuteDuration(
        interCityTransfer.via.arrival.name || 'Station',
        interCityTransfer.to.name || interCityTransfer.to.city,
        'walk',
        {
          originLatLng: interCityTransfer.via.arrival.coordinates,
          destLatLng: interCityTransfer.to.coordinates,
        }
      );
      console.log(`   ✅ OSRM Result: ${stationToHotel} minutes`);
    }
  }

  // ============================================
  // STEP 5: Full Output
  // ============================================
  console.log('\n\n═══════════════════════════════════════════════════════════════════');
  console.log('  STEP 5: FULL TRIP STRUCTURE OUTPUT');
  console.log('═══════════════════════════════════════════════════════════════════');

  console.log('\n📊 Trip Overview:');
  console.log(`   Start: ${tripStructure.startDate}`);
  console.log(`   End: ${tripStructure.endDate}`);
  console.log(`   Total Nights: ${tripStructure.totalNights}`);
  console.log(`   Cities: ${tripStructure.cities.join(' → ')}`);
  console.log(`   Valid: ${tripStructure.isValid ? '✅ Yes' : '❌ No'}`);

  console.log('\n🦵 Legs:');
  tripStructure.legs.forEach((leg, i) => {
    console.log(`   ${i + 1}. ${leg.city}: ${leg.startDate} → ${leg.endDate} (${leg.nights} nights)`);
    if (leg.hotel) {
      console.log(`      Hotel: ${leg.hotel.name}`);
    }
  });

  if (tripStructure.errors.length > 0) {
    console.log('\n❌ Errors:');
    tripStructure.errors.forEach(e => console.log(`   - ${e.message}`));
  }

  if (tripStructure.warnings.length > 0) {
    console.log('\n⚠️ Warnings:');
    tripStructure.warnings.forEach(w => console.log(`   - ${w.message}`));
  }

  // JSON output
  console.log('\n\n═══════════════════════════════════════════════════════════════════');
  console.log('  JSON OUTPUT (Inter-City Transfer Only)');
  console.log('═══════════════════════════════════════════════════════════════════');

  if (interCityTransfer) {
    console.log(JSON.stringify(interCityTransfer, null, 2));
  }

  console.log('\n\n✅ E2E Test Complete!');
}

runTest().catch(console.error);
