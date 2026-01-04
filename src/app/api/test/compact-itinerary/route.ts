/**
 * API Route: Test Compact Itinerary Service
 *
 * Run with: curl http://localhost:3000/api/test/compact-itinerary
 *
 * This tests the compact itinerary service with a family Japan trip
 * and saves output to /output directory.
 */

import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync } from 'fs';
import { join } from 'path';
import { itineraryServiceCompact, compareTokenUsage } from '@/lib/itinerary-service-compact';
import type { ItineraryRequest } from '@/lib/itinerary-service';

// Test request based on user's detailed prompt
const TEST_REQUEST: ItineraryRequest = {
  cities: ['Tokyo', 'Kyoto'],
  startDate: '2026-03-15',
  totalDays: 5,

  daysPerCity: {
    'Tokyo': 3,
    'Kyoto': 2,
  },

  pace: 'relaxed',
  budget: 'moderate',

  travelers: {
    adults: 2,
    children: 2,
    childrenAges: [8, 12],
  },

  interests: ['ramen', 'temples', 'anime', 'art', 'Pokemon', 'gaming'],

  userPreferences: 'Kids are really into Pokemon and gaming. We are vegetarian (no meat, but fish is okay). Budget is moderate but will splurge on special experiences.',

  tripContext: 'Family trip with 2 kids ages 8 and 12',

  arrivalFlightTime: '15:00',
  arrivalAirport: 'NRT',
  departureFlightTime: '10:00',
  departureAirport: 'KIX',

  hotels: [
    {
      name: 'Park Hyatt Tokyo',
      city: 'Tokyo',
      checkIn: '2026-03-15',
      checkOut: '2026-03-18',
      coordinates: { lat: 35.6855, lng: 139.6907 },
    },
    {
      name: 'Ritz-Carlton Kyoto',
      city: 'Kyoto',
      checkIn: '2026-03-18',
      checkOut: '2026-03-20',
      coordinates: { lat: 35.0116, lng: 135.7681 },
    },
  ],

  anchors: [
    {
      name: 'teamLab Planets',
      city: 'Tokyo',
      date: '2026-03-16',
      startTime: '14:00',
      duration: 150,
      category: 'museum',
      notes: 'Pre-booked tickets',
    },
    {
      name: 'Tokyo Sushi Academy - Sushi Making Class',
      city: 'Tokyo',
      date: '2026-03-17',
      startTime: '11:00',
      duration: 180,
      category: 'cultural-experience',
      notes: 'Pre-booked class',
    },
    {
      name: 'Fushimi Inari Sunrise Tour',
      city: 'Kyoto',
      date: '2026-03-19',
      startTime: '05:30',
      duration: 180,
      category: 'shrine',
      notes: 'Pre-booked guided tour',
    },
  ],

  mustHave: [
    'Senso-ji Temple',
    'Arashiyama Bamboo Grove',
    'Nara Deer Park',
    'Nintendo Store',
  ],

  mustAvoid: [
    'crowded tourist traps',
    'sushi restaurants',
    'theme parks',
  ],

  transfers: [
    {
      type: 'airport_arrival',
      date: '2026-03-15',
      fromCity: 'Narita Airport',
      toCity: 'Tokyo',
      mode: 'narita-express',
      duration: 90,
    },
    {
      type: 'inter_city',
      date: '2026-03-18',
      fromCity: 'Tokyo',
      toCity: 'Kyoto',
      mode: 'shinkansen',
      duration: 140,
    },
    {
      type: 'airport_departure',
      date: '2026-03-20',
      fromCity: 'Kyoto',
      toCity: 'Kansai Airport',
      mode: 'haruka-express',
      duration: 75,
    },
  ],

  clusterByNeighborhood: true,
};

export async function GET(request: NextRequest) {
  const outputDir = join(process.cwd(), 'output');

  try {
    console.log('Starting compact itinerary test...');

    // Token savings estimate
    const savings = compareTokenUsage(TEST_REQUEST.totalDays || 5);
    console.log(`Token savings estimate: ${savings.savingsPercent}%`);

    // Generate itinerary
    const startTime = Date.now();
    const result = await itineraryServiceCompact.generate(TEST_REQUEST);
    const duration = Date.now() - startTime;

    console.log(`Generation complete in ${duration}ms`);

    // Save outputs
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

    // Save full result
    const resultPath = join(outputDir, `compact-test-result-${timestamp}.json`);
    writeFileSync(resultPath, JSON.stringify(result, null, 2));

    // Save just itinerary
    const itineraryPath = join(outputDir, `compact-test-itinerary-${timestamp}.json`);
    writeFileSync(itineraryPath, JSON.stringify(result.itinerary, null, 2));

    // Also save to fixed names for easy access
    writeFileSync(join(outputDir, 'compact-test-result-latest.json'), JSON.stringify(result, null, 2));
    writeFileSync(join(outputDir, 'compact-test-itinerary-latest.json'), JSON.stringify(result.itinerary, null, 2));

    // Build validation summary
    const allActivities = result.itinerary.days.flatMap(d =>
      d.slots.flatMap(s => s.options.map(o => o.activity.name.toLowerCase()))
    );

    const anchorCheck = TEST_REQUEST.anchors?.map(anchor => {
      const day = result.itinerary.days.find(d => d.date === anchor.date);
      const found = day?.slots.some(slot =>
        slot.options.some(opt =>
          opt.activity.name.toLowerCase().includes(anchor.name.toLowerCase().split(' ')[0])
        )
      );
      return { name: anchor.name, date: anchor.date, found: !!found };
    }) || [];

    const mustHaveCheck = TEST_REQUEST.mustHave?.map(item => ({
      item,
      found: allActivities.some(name =>
        name.includes(item.toLowerCase().split(' ')[0]) ||
        item.toLowerCase().includes(name.split(' ')[0])
      )
    })) || [];

    const mustAvoidCheck = TEST_REQUEST.mustAvoid?.map(item => ({
      item,
      violated: allActivities.some(name => name.includes(item.toLowerCase()))
    })) || [];

    // Build summary
    const summary = {
      success: true,
      duration: `${duration}ms`,
      tokenSavings: savings,
      metadata: result.metadata,
      validation: {
        anchors: anchorCheck,
        mustHave: mustHaveCheck,
        mustAvoid: mustAvoidCheck,
      },
      daySummary: result.itinerary.days.map(day => ({
        dayNumber: day.dayNumber,
        date: day.date,
        city: day.city,
        title: day.title,
        slots: day.slots.map(slot => ({
          type: slot.slotType,
          time: slot.timeRange,
          activities: slot.options.length,
          first: slot.options[0]?.activity.name || '(empty)',
          behavior: slot.behavior,
        })),
      })),
      outputFiles: {
        result: resultPath,
        itinerary: itineraryPath,
        latestResult: join(outputDir, 'compact-test-result-latest.json'),
        latestItinerary: join(outputDir, 'compact-test-itinerary-latest.json'),
      },
    };

    // Save summary
    writeFileSync(join(outputDir, 'compact-test-summary-latest.json'), JSON.stringify(summary, null, 2));

    return NextResponse.json(summary);

  } catch (error) {
    const errorInfo = {
      success: false,
      error: error instanceof Error ? error.message : String(error),
      stack: error instanceof Error ? error.stack : undefined,
    };

    writeFileSync(join(outputDir, 'compact-test-error.json'), JSON.stringify(errorInfo, null, 2));

    return NextResponse.json(errorInfo, { status: 500 });
  }
}
