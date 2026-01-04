#!/usr/bin/env node

/**
 * Test Transfer Generation Flow (End-to-End)
 *
 * Tests the complete flow:
 * 1. Transfer inference from cities/flights/hotels
 * 2. OSRM routing for commutes
 * 3. Data structure output
 */

// ============================================
// OSRM CONFIG
// ============================================
const OSRM_BASE_URL = process.env.OSRM_BASE_URL || "https://router.project-osrm.org";

// ============================================
// TEST DATA - Multi-city Japan Trip
// ============================================

const TEST_FLIGHTS = [{
        id: "flight-1",
        type: "arrival",
        from: "SFO",
        to: "NRT",
        date: "2024-03-15",
        time: "14:30",
        flightNumber: "JL001",
    },
    {
        id: "flight-2",
        type: "departure",
        from: "KIX",
        to: "SFO",
        date: "2024-03-22",
        time: "11:00",
        flightNumber: "JL002",
    },
];

const TEST_HOTELS = [{
        id: "hotel-tokyo",
        name: "Park Hyatt Tokyo",
        city: "Tokyo",
        checkIn: "2024-03-15",
        checkOut: "2024-03-18",
        coordinates: { lat: 35.6855, lng: 139.6906 }, // Shinjuku
    },
    {
        id: "hotel-kyoto",
        name: "Ritz-Carlton Kyoto",
        city: "Kyoto",
        checkIn: "2024-03-18",
        checkOut: "2024-03-22",
        coordinates: { lat: 35.0159, lng: 135.7724 }, // Kyoto
    },
];

const TEST_CITIES = ["Tokyo", "Kyoto"];

// Known station coordinates
const STATIONS = {
    "Tokyo Station": { lat: 35.6812, lng: 139.7671 },
    "Kyoto Station": { lat: 34.9857, lng: 135.7580 },
    "Narita Airport": { lat: 35.7720, lng: 140.3929 },
    "Kansai Airport": { lat: 34.4320, lng: 135.2304 },
};

// ============================================
// OSRM ROUTING
// ============================================

async function getOSRMRoute(from, to, profile = "foot") {
    const url = `${OSRM_BASE_URL}/route/v1/${profile}/${from.lng},${from.lat};${to.lng},${to.lat}?overview=false`;

    try {
        const response = await fetch(url, {
            headers: { "User-Agent": "LaylaClone/1.0" },
        });

        if (!response.ok) return null;

        const data = await response.json();
        if (data.code !== "Ok" || !data.routes || data.routes.length === 0) return null;

        return {
            distance: data.routes[0].distance,
            duration: data.routes[0].duration,
        };
    } catch (error) {
        return null;
    }
}

// ============================================
// TRANSFER INFERENCE LOGIC
// ============================================

function inferTransfersFromTripData(flights, hotels, cities) {
    const transfers = [];

    // Sort hotels by check-in
    const sortedHotels = [...hotels].sort((a, b) => a.checkIn.localeCompare(b.checkIn));

    // Sort flights by date
    const sortedFlights = [...flights].sort((a, b) => a.date.localeCompare(b.date));

    const arrivalFlight = sortedFlights.find(f => f.type === "arrival") || sortedFlights[0];
    const departureFlight = sortedFlights.find(f => f.type === "departure") || sortedFlights[sortedFlights.length - 1];

    console.log("\n📋 Parsed Trip Structure:");
    console.log(`   Arrival: ${arrivalFlight.from} → ${arrivalFlight.to} on ${arrivalFlight.date}`);
    console.log(`   Departure: ${departureFlight.from} → ${departureFlight.to} on ${departureFlight.date}`);
    console.log(`   Hotels: ${sortedHotels.map(h => `${h.city} (${h.checkIn} to ${h.checkOut})`).join(" → ")}`);

  // 1. Airport Arrival → First Hotel
  if (arrivalFlight && sortedHotels.length > 0) {
    const firstHotel = sortedHotels[0];
    const airportCity = getAirportCity(arrivalFlight.to);

    transfers.push({
      id: `transfer-arrival`,
      type: "airport_arrival",
      date: arrivalFlight.date,
      from: {
        type: "airport",
        code: arrivalFlight.to,
        city: airportCity,
        name: getAirportName(arrivalFlight.to),
        coordinates: STATIONS[getAirportName(arrivalFlight.to)] || null,
      },
      to: {
        type: "hotel",
        name: firstHotel.name,
        city: firstHotel.city,
        coordinates: firstHotel.coordinates,
      },
      mode: "train",
      description: `${getAirportName(arrivalFlight.to)} → ${firstHotel.name}`,
    });
  }

  // 2. Inter-city transfers between hotels
  for (let i = 0; i < sortedHotels.length - 1; i++) {
    const fromHotel = sortedHotels[i];
    const toHotel = sortedHotels[i + 1];

    const isSameCity = fromHotel.city.toLowerCase() === toHotel.city.toLowerCase();

    if (!isSameCity) {
      // This is the KEY scenario: hotel → station → train → station → hotel
      transfers.push({
        id: `transfer-intercity-${i}`,
        type: "inter_city",
        date: fromHotel.checkOut,
        from: {
          type: "hotel",
          name: fromHotel.name,
          city: fromHotel.city,
          coordinates: fromHotel.coordinates,
        },
        via: {
          departure: {
            type: "station",
            name: `${fromHotel.city} Station`,
            city: fromHotel.city,
            coordinates: STATIONS[`${fromHotel.city} Station`] || null,
          },
          arrival: {
            type: "station",
            name: `${toHotel.city} Station`,
            city: toHotel.city,
            coordinates: STATIONS[`${toHotel.city} Station`] || null,
          },
          mode: "shinkansen",
        },
        to: {
          type: "hotel",
          name: toHotel.name,
          city: toHotel.city,
          coordinates: toHotel.coordinates,
        },
        description: `${fromHotel.city} → ${toHotel.city} via Shinkansen`,
      });
    } else {
      // Same city hotel change
      transfers.push({
        id: `transfer-samecity-${i}`,
        type: "same_city",
        date: fromHotel.checkOut,
        from: {
          type: "hotel",
          name: fromHotel.name,
          city: fromHotel.city,
          coordinates: fromHotel.coordinates,
        },
        to: {
          type: "hotel",
          name: toHotel.name,
          city: toHotel.city,
          coordinates: toHotel.coordinates,
        },
        mode: "taxi",
        description: `Hotel change within ${fromHotel.city}`,
      });
    }
  }

  // 3. Last Hotel → Departure Airport
  if (departureFlight && sortedHotels.length > 0) {
    const lastHotel = sortedHotels[sortedHotels.length - 1];
    const airportCity = getAirportCity(departureFlight.from);
    const hotelCity = lastHotel.city;

    // Check if we need inter-city transfer to reach departure airport
    if (airportCity.toLowerCase() !== hotelCity.toLowerCase()) {
      // Need to travel to different city for flight
      transfers.push({
        id: `transfer-departure-intercity`,
        type: "inter_city_to_airport",
        date: departureFlight.date,
        from: {
          type: "hotel",
          name: lastHotel.name,
          city: lastHotel.city,
          coordinates: lastHotel.coordinates,
        },
        via: {
          departure: {
            type: "station",
            name: `${lastHotel.city} Station`,
            city: lastHotel.city,
            coordinates: STATIONS[`${lastHotel.city} Station`] || null,
          },
          arrival: {
            type: "station",
            name: `${airportCity} Station (or direct to airport)`,
            city: airportCity,
          },
          mode: "train",
        },
        to: {
          type: "airport",
          code: departureFlight.from,
          city: airportCity,
          name: getAirportName(departureFlight.from),
          coordinates: STATIONS[getAirportName(departureFlight.from)] || null,
        },
        description: `${lastHotel.name} → ${lastHotel.city} Station → ${getAirportName(departureFlight.from)}`,
      });
    } else {
      // Same city - direct to airport
      transfers.push({
        id: `transfer-departure`,
        type: "airport_departure",
        date: departureFlight.date,
        from: {
          type: "hotel",
          name: lastHotel.name,
          city: lastHotel.city,
          coordinates: lastHotel.coordinates,
        },
        to: {
          type: "airport",
          code: departureFlight.from,
          city: airportCity,
          name: getAirportName(departureFlight.from),
          coordinates: STATIONS[getAirportName(departureFlight.from)] || null,
        },
        mode: "train",
        description: `${lastHotel.name} → ${getAirportName(departureFlight.from)}`,
      });
    }
  }

  return transfers;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getAirportCity(code) {
  const mapping = {
    "NRT": "Tokyo", "HND": "Tokyo",
    "KIX": "Osaka", "ITM": "Osaka",
    "NGO": "Nagoya", "FUK": "Fukuoka",
  };
  return mapping[code] || code;
}

function getAirportName(code) {
  const mapping = {
    "NRT": "Narita Airport", "HND": "Haneda Airport",
    "KIX": "Kansai Airport", "ITM": "Itami Airport",
  };
  return mapping[code] || `${code} Airport`;
}

// ============================================
// CALCULATE COMMUTES FOR TRANSFERS
// ============================================

async function calculateTransferCommutes(transfers) {
  console.log("\n\n🚶 Calculating commute times using OSRM...");

  for (const transfer of transfers) {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📍 ${transfer.description}`);
    console.log(`   Type: ${transfer.type}`);
    console.log(`   Date: ${transfer.date}`);

    // Calculate leg commutes based on transfer type
    if (transfer.type === "inter_city" || transfer.type === "inter_city_to_airport") {
      // Multi-leg transfer: hotel → station → train → station → hotel/airport

      // Leg 1: Hotel → Departure Station
      if (transfer.from.coordinates && transfer.via?.departure?.coordinates) {
        const leg1 = await getOSRMRoute(
          transfer.from.coordinates,
          transfer.via.departure.coordinates,
          "foot"
        );
        if (leg1) {
          transfer.commute_to_station = {
            duration_min: Math.round(leg1.duration / 60),
            distance_m: Math.round(leg1.distance),
            mode: "walk",
          };
          console.log(`   ✅ Hotel → Station: ${transfer.commute_to_station.duration_min} min (${(leg1.distance/1000).toFixed(1)} km walk)`);
        } else {
          console.log(`   ⚠️  Hotel → Station: Could not calculate (missing coords)`);
        }
      }

      // Leg 2: Main transport (Shinkansen/train) - use estimated time
      const mainTransportDuration = getEstimatedTransportTime(
        transfer.from.city,
        transfer.to.city || transfer.via?.arrival?.city,
        transfer.via?.mode || "train"
      );
      transfer.main_transport = {
        duration_min: mainTransportDuration,
        mode: transfer.via?.mode || "train",
        from_station: transfer.via?.departure?.name,
        to_station: transfer.via?.arrival?.name,
      };
      console.log(`   🚄 ${transfer.via?.mode || "Train"}: ${mainTransportDuration} min (${transfer.via?.departure?.name} → ${transfer.via?.arrival?.name})`);

      // Leg 3: Arrival Station → Destination
      if (transfer.via?.arrival?.coordinates && transfer.to.coordinates) {
        const leg3 = await getOSRMRoute(
          transfer.via.arrival.coordinates,
          transfer.to.coordinates,
          "foot"
        );
        if (leg3) {
          transfer.commute_from_station = {
            duration_min: Math.round(leg3.duration / 60),
            distance_m: Math.round(leg3.distance),
            mode: "walk",
          };
          console.log(`   ✅ Station → Destination: ${transfer.commute_from_station.duration_min} min (${(leg3.distance/1000).toFixed(1)} km walk)`);
        }
      }

      // Total time
      const totalMin = (transfer.commute_to_station?.duration_min || 15) +
                       transfer.main_transport.duration_min +
                       (transfer.commute_from_station?.duration_min || 15);
      transfer.total_duration_min = totalMin;
      console.log(`   ⏱️  TOTAL: ${totalMin} min (${Math.round(totalMin/60*10)/10} hours)`);

    } else if (transfer.type === "airport_arrival" || transfer.type === "airport_departure") {
      // Airport transfer
      if (transfer.from.coordinates && transfer.to.coordinates) {
        // For airport transfers, use driving (represents train/bus time roughly)
        const route = await getOSRMRoute(
          transfer.from.coordinates,
          transfer.to.coordinates,
          "car"
        );
        if (route) {
          // Airport transfers typically take longer due to check-in, etc.
          const airportOverhead = transfer.type === "airport_departure" ? 30 : 15; // extra time at airport
          transfer.commute = {
            duration_min: Math.round(route.duration / 60) + airportOverhead,
            distance_m: Math.round(route.distance),
            mode: "train",
            note: `Includes ${airportOverhead} min airport time`,
          };
          console.log(`   ✅ Duration: ${transfer.commute.duration_min} min (${(route.distance/1000).toFixed(1)} km + ${airportOverhead} min airport time)`);
        }
      } else {
        // Fallback estimation
        transfer.commute = {
          duration_min: transfer.type === "airport_arrival" ? 75 : 90,
          mode: "train",
          note: "Estimated (coordinates not available)",
        };
        console.log(`   ⚠️  Duration: ${transfer.commute.duration_min} min (estimated)`);
      }

      transfer.total_duration_min = transfer.commute.duration_min;
    }
  }

  return transfers;
}

function getEstimatedTransportTime(fromCity, toCity, mode) {
  const routes = {
    "Tokyo-Kyoto": { shinkansen: 135, train: 240 },
    "Tokyo-Osaka": { shinkansen: 150, train: 270 },
    "Kyoto-Osaka": { shinkansen: 15, train: 45 },
    "Osaka-Kyoto": { shinkansen: 15, train: 45 },
  };

  const key = `${fromCity}-${toCity}`;
  const reverseKey = `${toCity}-${fromCity}`;

  const durations = routes[key] || routes[reverseKey];
  if (durations) {
    return durations[mode] || durations.shinkansen || 120;
  }

  return 120; // Default 2 hours
}

// ============================================
// MAIN TEST
// ============================================

async function runTest() {
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log("  TRANSFER GENERATION TEST (End-to-End)");
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log(`\n🌐 OSRM Server: ${OSRM_BASE_URL}`);

  console.log("\n\n📥 INPUT DATA:");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\nFlights:");
  TEST_FLIGHTS.forEach(f => {
    console.log(`  ✈️  ${f.from} → ${f.to} on ${f.date} at ${f.time} (${f.type})`);
  });
  console.log("\nHotels:");
  TEST_HOTELS.forEach(h => {
    console.log(`  🏨 ${h.name} (${h.city}): ${h.checkIn} → ${h.checkOut}`);
  });
  console.log("\nCities:", TEST_CITIES.join(" → "));

  // Step 1: Infer transfers
  console.log("\n\n═══════════════════════════════════════════════════════════════════");
  console.log("  STEP 1: INFER TRANSFERS");
  console.log("═══════════════════════════════════════════════════════════════════");

  const transfers = inferTransfersFromTripData(TEST_FLIGHTS, TEST_HOTELS, TEST_CITIES);

  console.log(`\n📊 Inferred ${transfers.length} transfers:`);
  transfers.forEach((t, i) => {
    console.log(`  ${i + 1}. [${t.type}] ${t.description}`);
  });

  // Step 2: Calculate commutes
  console.log("\n\n═══════════════════════════════════════════════════════════════════");
  console.log("  STEP 2: CALCULATE COMMUTES (OSRM)");
  console.log("═══════════════════════════════════════════════════════════════════");

  const enrichedTransfers = await calculateTransferCommutes(transfers);

  // Step 3: Summary
  console.log("\n\n═══════════════════════════════════════════════════════════════════");
  console.log("  STEP 3: FINAL TRANSFER DATA");
  console.log("═══════════════════════════════════════════════════════════════════");

  console.log("\n📋 Your ideal flow: hotel → airport/station → plane/train → hotel → next activity\n");

  enrichedTransfers.forEach((t, i) => {
    console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`TRANSFER ${i + 1}: ${t.description}`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

    if (t.type === "inter_city" || t.type === "inter_city_to_airport") {
      console.log("\n  BREAKDOWN (Your ideal flow ✅):");
      console.log(`  ┌─────────────────────────────────────────────────────`);
      console.log(`  │ 1. 🏨 Checkout: ${t.from.name}`);
      console.log(`  │    ↓`);
      console.log(`  │ 2. 🚶 Walk/Taxi to Station: ${t.commute_to_station?.duration_min || '~15'} min`);
      console.log(`  │    ↓`);
      console.log(`  │ 3. 🚉 ${t.via?.departure?.name || 'Station'}`);
      console.log(`  │    ↓`);
      console.log(`  │ 4. 🚄 ${t.main_transport?.mode || 'Train'}: ${t.main_transport?.duration_min} min`);
      console.log(`  │    ↓`);
      console.log(`  │ 5. 🚉 ${t.via?.arrival?.name || 'Station'}`);
      console.log(`  │    ↓`);
      console.log(`  │ 6. 🚶 Walk/Taxi to Destination: ${t.commute_from_station?.duration_min || '~15'} min`);
      console.log(`  │    ↓`);
      console.log(`  │ 7. ${t.to.type === 'hotel' ? '🏨 Check-in' : '✈️ Airport'}: ${t.to.name}`);
      console.log(`  └─────────────────────────────────────────────────────`);
    } else {
      console.log(`\n  From: ${t.from.name} (${t.from.type})`);
      console.log(`  To: ${t.to.name} (${t.to.type})`);
      console.log(`  Mode: ${t.mode || t.commute?.mode || 'transit'}`);
    }

    console.log(`\n  ⏱️  TOTAL TIME: ${t.total_duration_min} minutes`);
  });

  // JSON output
  console.log("\n\n═══════════════════════════════════════════════════════════════════");
  console.log("  JSON OUTPUT (for data storage)");
  console.log("═══════════════════════════════════════════════════════════════════");
  console.log(JSON.stringify(enrichedTransfers, null, 2));

  console.log("\n\n✅ Test complete!");
}

runTest().catch(console.error);
