"use client";

/**
 * Main Trip Page - Unified Trip Planning Experience
 *
 * Access at: http://localhost:3000/trip
 *
 * This is the production-like unified trip planning page that combines:
 * - Trip input (flights, hotels, preferences)
 * - Itinerary viewing and editing with chat
 * - Day execution with real-time simulation
 */

import { TripApp } from "@/components/trip";

export default function TripPage() {
  return <TripApp />;
}
