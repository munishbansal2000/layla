/**
 * Test endpoint for transfer inference
 * Calls production code directly and returns debug info
 */

import { NextResponse } from 'next/server';
import { inferTripStructure } from '@/lib/transfer-inference';
import type { HotelAnchor } from '@/types/trip-input';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { hotels } = body;

    // Convert to HotelAnchors
    const hotelAnchors: HotelAnchor[] = hotels.map((h: {
      name: string;
      city: string;
      checkIn: string;
      checkOut: string;
      coordinates: { lat: number; lng: number };
    }, i: number) => ({
      id: `hotel-${i}`,
      type: 'hotel' as const,
      name: h.name,
      city: h.city,
      checkIn: h.checkIn,
      checkOut: h.checkOut,
      coordinates: h.coordinates,
    }));

    console.log('='.repeat(70));
    console.log('TEST TRANSFER INFERENCE - Using Production Code');
    console.log('='.repeat(70));
    console.log('Input hotels:', JSON.stringify(hotelAnchors, null, 2));

    // Call production code
    const result = await inferTripStructure([], hotelAnchors);

    console.log('='.repeat(70));
    console.log('Result:');
    console.log(JSON.stringify(result, null, 2));
    console.log('='.repeat(70));

    return NextResponse.json({
      success: true,
      input: { hotels: hotelAnchors },
      result,
    });
  } catch (error) {
    console.error('Transfer inference test error:', error);
    return NextResponse.json(
      { success: false, error: String(error) },
      { status: 500 }
    );
  }
}
