/**
 * Multi-City Orchestrator Service
 *
 * Generates and manages multi-city trip itineraries with
 * intelligent city sequencing, transport optimization, and
 * per-city activity planning.
 */

import type {
  MultiCityTrip,
  CityDestination,
  CityStop,
  InterCityLeg,
  CityItinerary,
  CityDaySchedule,
  MultiCityPreferences,
  TravelerInfo,
  MultiCityTripStats,
  CitySequenceRequest,
  CitySequenceResult,
} from "@/types/multi-city";
import {
  searchTransportOptions,
  optimizeCitySequence,
  estimateTravelTime,
} from "./inter-city-transport";
import type { LatLng } from "@/lib/google-maps";

// ============================================
// TYPES
// ============================================

export interface MultiCityGenerationRequest {
  cities: CityDestination[];
  startDate: string;
  endDate: string;
  startCity?: CityDestination; // Origin city (where trip starts)
  endCity?: CityDestination; // Final city (where trip ends)
  travelers: TravelerInfo;
  preferences: MultiCityPreferences;
  returnToStart?: boolean;
}

export interface MultiCityGenerationResult {
  success: boolean;
  trip?: MultiCityTrip;
  warnings?: string[];
  error?: string;
}

interface CityNightsAllocation {
  city: CityDestination;
  nights: number;
  arrivalDate: string;
  departureDate: string;
}

// ============================================
// MULTI-CITY ORCHESTRATOR
// ============================================

export class MultiCityOrchestrator {
  /**
   * Generate a complete multi-city trip
   */
  async generateMultiCityTrip(
    request: MultiCityGenerationRequest
  ): Promise<MultiCityGenerationResult> {
    const warnings: string[] = [];

    try {
      // 1. Validate request
      const validation = this.validateRequest(request);
      if (!validation.valid) {
        return { success: false, error: validation.error };
      }

      // 2. Optimize city sequence
      const sequenceResult = await this.optimizeSequence(request);
      if (!sequenceResult.optimalOrder.length) {
        return { success: false, error: "Failed to optimize city sequence" };
      }

      // 3. Allocate nights per city
      const allocation = this.allocateNights(
        sequenceResult.optimalOrder,
        request.startDate,
        request.endDate,
        request.preferences
      );

      // 4. Build city stops
      const stops = this.buildCityStops(allocation, request.returnToStart);

      // 5. Plan inter-city transport
      const transitions = await this.planTransitions(
        stops,
        request.travelers,
        request.preferences
      );

      // 6. Generate per-city itineraries
      const cityItineraries = await this.generateCityItineraries(
        stops,
        transitions,
        request.travelers,
        request.preferences
      );

      // 7. Calculate trip statistics
      const stats = this.calculateTripStats(stops, transitions, cityItineraries);

      // 8. Build final trip
      const trip: MultiCityTrip = {
        id: `mct_${Date.now()}`,
        name: this.generateTripName(stops),
        status: "planned",
        createdAt: new Date().toISOString(),
        lastModifiedAt: new Date().toISOString(),
        travelers: request.travelers,
        preferences: request.preferences,
        stops,
        transitions,
        cityItineraries,
        stats,
      };

      return { success: true, trip, warnings };
    } catch (error) {
      console.error("Multi-city trip generation failed:", error);
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  /**
   * Validate generation request
   */
  private validateRequest(
    request: MultiCityGenerationRequest
  ): { valid: boolean; error?: string } {
    if (!request.cities || request.cities.length < 2) {
      return { valid: false, error: "At least 2 cities are required" };
    }

    const startDate = new Date(request.startDate);
    const endDate = new Date(request.endDate);
    const totalDays = Math.ceil(
      (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24)
    );

    if (totalDays < request.cities.length) {
      return {
        valid: false,
        error: `Trip is too short for ${request.cities.length} cities`,
      };
    }

    if (totalDays > 60) {
      return { valid: false, error: "Trip cannot exceed 60 days" };
    }

    return { valid: true };
  }

  /**
   * Optimize city visiting sequence using TSP
   */
  private async optimizeSequence(
    request: MultiCityGenerationRequest
  ): Promise<CitySequenceResult> {
    const startCity = request.startCity || request.cities[0];
    const endCity = request.returnToStart ? startCity : request.endCity;

    const sequenceRequest: CitySequenceRequest = {
      cities: request.cities,
      startCity,
      endCity,
      startDate: request.startDate,
      endDate: request.endDate,
      preferences: request.preferences,
    };

    return optimizeCitySequence(sequenceRequest);
  }

  /**
   * Allocate nights to each city based on preferences
   */
  private allocateNights(
    orderedCities: CityDestination[],
    startDate: string,
    endDate: string,
    preferences: MultiCityPreferences
  ): CityNightsAllocation[] {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const totalNights = Math.ceil(
      (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)
    );

    // Account for travel days between cities
    const travelDays = orderedCities.length - 1;
    const availableNights = Math.max(0, totalNights - travelDays);

    // Distribute nights based on city importance/size
    const cityScores = orderedCities.map((city) =>
      this.calculateCityScore(city, preferences)
    );
    const totalScore = cityScores.reduce((sum, s) => sum + s, 0);

    const allocations: CityNightsAllocation[] = [];
    let currentDate = new Date(startDate);

    orderedCities.forEach((city, index) => {
      // Calculate proportional nights
      let nights = Math.round(
        (cityScores[index] / totalScore) * availableNights
      );

      // Enforce min/max constraints
      nights = Math.max(preferences.minNightsPerCity, nights);
      nights = Math.min(preferences.maxNightsPerCity, nights);

      // Ensure at least 1 night per city
      nights = Math.max(1, nights);

      const arrivalDate = new Date(currentDate);
      const departureDate = new Date(currentDate);
      departureDate.setDate(departureDate.getDate() + nights);

      allocations.push({
        city,
        nights,
        arrivalDate: arrivalDate.toISOString().split("T")[0],
        departureDate: departureDate.toISOString().split("T")[0],
      });

      // Move current date (add 1 for travel day)
      currentDate = new Date(departureDate);
      if (index < orderedCities.length - 1) {
        currentDate.setDate(currentDate.getDate() + 1);
      }
    });

    return allocations;
  }

  /**
   * Calculate city score for night allocation
   */
  private calculateCityScore(
    city: CityDestination,
    _preferences: MultiCityPreferences
  ): number {
    // Base score of 1
    let score = 1;

    // Major capitals/cities get higher scores
    const majorCities = [
      "Tokyo",
      "Paris",
      "London",
      "New York",
      "Rome",
      "Barcelona",
      "Sydney",
      "Los Angeles",
      "Berlin",
      "Amsterdam",
      "Bangkok",
      "Singapore",
    ];

    if (majorCities.includes(city.name)) {
      score += 0.5;
    }

    return score;
  }

  /**
   * Build city stops from allocation
   */
  private buildCityStops(
    allocations: CityNightsAllocation[],
    returnToStart?: boolean
  ): CityStop[] {
    return allocations.map((alloc, index) => ({
      id: `stop_${index}_${alloc.city.id}`,
      city: alloc.city,
      arrivalDate: alloc.arrivalDate,
      departureDate: alloc.departureDate,
      nights: alloc.nights,
      isOrigin: index === 0,
      isFinalDestination:
        index === allocations.length - 1 && !returnToStart,
      order: index,
    }));
  }

  /**
   * Plan transport between cities
   */
  private async planTransitions(
    stops: CityStop[],
    travelers: TravelerInfo,
    preferences: MultiCityPreferences
  ): Promise<InterCityLeg[]> {
    const transitions: InterCityLeg[] = [];

    for (let i = 0; i < stops.length - 1; i++) {
      const fromStop = stops[i];
      const toStop = stops[i + 1];

      // Search for transport options
      const options = await searchTransportOptions({
        fromCity: fromStop.city,
        toCity: toStop.city,
        departureDate: fromStop.departureDate,
        travelers,
        preferredModes: preferences.preferredTransport,
        directOnly: preferences.preferDirectFlights,
      });

      // Select best option (recommended or cheapest)
      const bestOption = options.recommended || options.cheapest || options.options[0];

      if (bestOption) {
        transitions.push({
          ...bestOption,
          id: `transition_${i}`,
        });
      } else {
        // Create placeholder if no options found
        const travelTime = estimateTravelTime(fromStop.city, toStop.city, "flight");
        transitions.push({
          id: `transition_${i}`,
          fromCity: fromStop.city,
          toCity: toStop.city,
          transportMode: "flight",
          departureTime: `${fromStop.departureDate}T09:00:00`,
          arrivalTime: `${toStop.arrivalDate}T${Math.floor(9 + travelTime / 60)
            .toString()
            .padStart(2, "0")}:00:00`,
          durationMinutes: travelTime,
        });
      }
    }

    return transitions;
  }

  /**
   * Generate per-city itineraries
   */
  private async generateCityItineraries(
    stops: CityStop[],
    transitions: InterCityLeg[],
    _travelers: TravelerInfo,
    _preferences: MultiCityPreferences
  ): Promise<Map<string, CityItinerary>> {
    const cityItineraries = new Map<string, CityItinerary>();

    for (const stop of stops) {
      const days: CityDaySchedule[] = [];
      const arrivalDate = new Date(stop.arrivalDate);

      for (let dayNum = 0; dayNum <= stop.nights; dayNum++) {
        const currentDate = new Date(arrivalDate);
        currentDate.setDate(arrivalDate.getDate() + dayNum);

        const isArrivalDay = dayNum === 0;
        const isDepartureDay = dayNum === stop.nights;

        // Find relevant transitions
        const arrivalTransition = transitions.find(
          (t) => t.toCity.id === stop.city.id
        );
        const departureTransition = transitions.find(
          (t) => t.fromCity.id === stop.city.id
        );

        // Determine available hours
        let startHour = "09:00";
        let endHour = "21:00";

        if (isArrivalDay && arrivalTransition) {
          const arrivalTime = new Date(arrivalTransition.arrivalTime);
          startHour = `${Math.min(
            18,
            arrivalTime.getHours() + 2
          )
            .toString()
            .padStart(2, "0")}:00`;
        }

        if (isDepartureDay && departureTransition) {
          const departureTime = new Date(departureTransition.departureTime);
          endHour = `${Math.max(9, departureTime.getHours() - 2)
            .toString()
            .padStart(2, "0")}:00`;
        }

        days.push({
          date: currentDate.toISOString().split("T")[0],
          dayNumber: dayNum + 1,
          dayType: isArrivalDay
            ? "arrival"
            : isDepartureDay
              ? "departure"
              : "full",
          availableHours: { start: startHour, end: endHour },
          activities: [], // Will be populated by activity service
          meals: [],
        });
      }

      cityItineraries.set(stop.city.id, {
        cityId: stop.city.id,
        cityName: stop.city.name,
        startDate: stop.arrivalDate,
        endDate: stop.departureDate,
        days,
      });
    }

    return cityItineraries;
  }

  /**
   * Calculate trip statistics
   */
  private calculateTripStats(
    stops: CityStop[],
    transitions: InterCityLeg[],
    cityItineraries: Map<string, CityItinerary>
  ): MultiCityTripStats {
    const totalNights = stops.reduce((sum, s) => sum + s.nights, 0);

    const totalFlightTime = transitions
      .filter((t) => t.transportMode === "flight")
      .reduce((sum, t) => sum + t.durationMinutes, 0);

    const totalTrainTime = transitions
      .filter((t) => t.transportMode === "train")
      .reduce((sum, t) => sum + t.durationMinutes, 0);

    const totalTransitTime = transitions.reduce(
      (sum, t) => sum + t.durationMinutes,
      0
    );

    const totalActivities = Array.from(cityItineraries.values()).reduce(
      (sum, itin) =>
        sum + itin.days.reduce((daySum, d) => daySum + d.activities.length, 0),
      0
    );

    const estimatedTransportCost = transitions.reduce(
      (sum, t) => sum + (t.price?.amount || 0),
      0
    );

    const countriesVisited = [...new Set(stops.map((s) => s.city.countryCode))];

    const timezones = [...new Set(stops.map((s) => s.city.timezone))];

    const carbonFootprint = transitions.reduce(
      (sum, t) => sum + (t.carbonFootprint?.kgCO2 || 0),
      0
    );

    return {
      totalDays: totalNights + 1,
      totalCities: stops.length,
      totalNights,
      totalFlightTime,
      totalTrainTime,
      totalTransitTime,
      totalActivities,
      estimatedTotalCost: { amount: estimatedTransportCost, currency: "USD" },
      carbonFootprint: { kgCO2: carbonFootprint },
      countriesVisited,
      timezonesTraversed: timezones.length,
    };
  }

  /**
   * Generate trip name
   */
  private generateTripName(stops: CityStop[]): string {
    if (stops.length <= 3) {
      return stops.map((s) => s.city.name).join(" → ");
    }
    return `${stops[0].city.name} → ${stops.length - 2} cities → ${
      stops[stops.length - 1].city.name
    }`;
  }

  // ============================================
  // TRIP MODIFICATION METHODS
  // ============================================

  /**
   * Add a city to an existing trip
   */
  async addCity(
    trip: MultiCityTrip,
    city: CityDestination,
    afterStopIndex: number,
    nights: number
  ): Promise<MultiCityGenerationResult> {
    try {
      const newStops = [...trip.stops];
      const insertIndex = afterStopIndex + 1;

      // Calculate dates
      const prevStop = newStops[afterStopIndex];
      const arrivalDate = new Date(prevStop.departureDate);
      arrivalDate.setDate(arrivalDate.getDate() + 1);

      const departureDate = new Date(arrivalDate);
      departureDate.setDate(departureDate.getDate() + nights);

      // Create new stop
      const newStop: CityStop = {
        id: `stop_${Date.now()}_${city.id}`,
        city,
        arrivalDate: arrivalDate.toISOString().split("T")[0],
        departureDate: departureDate.toISOString().split("T")[0],
        nights,
        isOrigin: false,
        isFinalDestination: insertIndex === newStops.length,
        order: insertIndex,
      };

      // Insert stop
      newStops.splice(insertIndex, 0, newStop);

      // Update orders and dates for subsequent stops
      for (let i = insertIndex + 1; i < newStops.length; i++) {
        newStops[i].order = i;
        const newArrival = new Date(newStops[i - 1].departureDate);
        newArrival.setDate(newArrival.getDate() + 1);
        const newDeparture = new Date(newArrival);
        newDeparture.setDate(newDeparture.getDate() + newStops[i].nights);

        newStops[i].arrivalDate = newArrival.toISOString().split("T")[0];
        newStops[i].departureDate = newDeparture.toISOString().split("T")[0];
      }

      // Recalculate transitions
      const transitions = await this.planTransitions(
        newStops,
        trip.travelers,
        trip.preferences
      );

      // Generate itinerary for new city
      const newCityItinerary = await this.generateCityItineraries(
        [newStop],
        transitions,
        trip.travelers,
        trip.preferences
      );

      const updatedItineraries = new Map(trip.cityItineraries);
      newCityItinerary.forEach((value, key) => {
        updatedItineraries.set(key, value);
      });

      // Calculate new stats
      const stats = this.calculateTripStats(
        newStops,
        transitions,
        updatedItineraries
      );

      const updatedTrip: MultiCityTrip = {
        ...trip,
        stops: newStops,
        transitions,
        cityItineraries: updatedItineraries,
        stats,
        lastModifiedAt: new Date().toISOString(),
      };

      return { success: true, trip: updatedTrip };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to add city",
      };
    }
  }

  /**
   * Remove a city from an existing trip
   */
  async removeCity(
    trip: MultiCityTrip,
    stopIndex: number
  ): Promise<MultiCityGenerationResult> {
    if (trip.stops.length <= 2) {
      return {
        success: false,
        error: "Cannot remove city - trip must have at least 2 cities",
      };
    }

    try {
      const removedCity = trip.stops[stopIndex];
      const newStops = trip.stops.filter((_, i) => i !== stopIndex);

      // Update orders
      newStops.forEach((stop, i) => {
        stop.order = i;
        stop.isOrigin = i === 0;
        stop.isFinalDestination = i === newStops.length - 1;
      });

      // Recalculate transitions
      const transitions = await this.planTransitions(
        newStops,
        trip.travelers,
        trip.preferences
      );

      // Remove city itinerary
      const updatedItineraries = new Map(trip.cityItineraries);
      updatedItineraries.delete(removedCity.city.id);

      const stats = this.calculateTripStats(
        newStops,
        transitions,
        updatedItineraries
      );

      const updatedTrip: MultiCityTrip = {
        ...trip,
        stops: newStops,
        transitions,
        cityItineraries: updatedItineraries,
        stats,
        lastModifiedAt: new Date().toISOString(),
      };

      return { success: true, trip: updatedTrip };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Failed to remove city",
      };
    }
  }

  /**
   * Reorder cities in the trip
   */
  async reorderCities(
    trip: MultiCityTrip,
    fromIndex: number,
    toIndex: number
  ): Promise<MultiCityGenerationResult> {
    try {
      const newStops = [...trip.stops];
      const [movedStop] = newStops.splice(fromIndex, 1);
      newStops.splice(toIndex, 0, movedStop);

      // Update orders and flags
      newStops.forEach((stop, i) => {
        stop.order = i;
        stop.isOrigin = i === 0;
        stop.isFinalDestination = i === newStops.length - 1;
      });

      // Recalculate dates
      let currentDate = new Date(trip.stops[0].arrivalDate);
      newStops.forEach((stop, i) => {
        stop.arrivalDate = currentDate.toISOString().split("T")[0];
        const departure = new Date(currentDate);
        departure.setDate(departure.getDate() + stop.nights);
        stop.departureDate = departure.toISOString().split("T")[0];

        if (i < newStops.length - 1) {
          currentDate = new Date(departure);
          currentDate.setDate(currentDate.getDate() + 1); // Travel day
        }
      });

      // Recalculate transitions
      const transitions = await this.planTransitions(
        newStops,
        trip.travelers,
        trip.preferences
      );

      const stats = this.calculateTripStats(
        newStops,
        transitions,
        trip.cityItineraries
      );

      const updatedTrip: MultiCityTrip = {
        ...trip,
        stops: newStops,
        transitions,
        stats,
        lastModifiedAt: new Date().toISOString(),
      };

      return { success: true, trip: updatedTrip };
    } catch (error) {
      return {
        success: false,
        error:
          error instanceof Error ? error.message : "Failed to reorder cities",
      };
    }
  }
}

// ============================================
// SINGLETON INSTANCE
// ============================================

let orchestratorInstance: MultiCityOrchestrator | null = null;

export function getMultiCityOrchestrator(): MultiCityOrchestrator {
  if (!orchestratorInstance) {
    orchestratorInstance = new MultiCityOrchestrator();
  }
  return orchestratorInstance;
}

// ============================================
// POPULAR DESTINATIONS DATABASE
// ============================================

export const POPULAR_DESTINATIONS: CityDestination[] = [
  {
    id: "tokyo",
    name: "Tokyo",
    country: "Japan",
    countryCode: "JP",
    coordinates: { lat: 35.6762, lng: 139.6503 },
    timezone: "Asia/Tokyo",
    currency: "JPY",
    language: "Japanese",
    airportCodes: ["NRT", "HND"],
    trainStationCodes: ["TYO"],
    imageUrl: "/images/cities/tokyo.jpg",
  },
  {
    id: "paris",
    name: "Paris",
    country: "France",
    countryCode: "FR",
    coordinates: { lat: 48.8566, lng: 2.3522 },
    timezone: "Europe/Paris",
    currency: "EUR",
    language: "French",
    airportCodes: ["CDG", "ORY"],
    trainStationCodes: ["PAR"],
    imageUrl: "/images/cities/paris.jpg",
  },
  {
    id: "london",
    name: "London",
    country: "United Kingdom",
    countryCode: "GB",
    coordinates: { lat: 51.5074, lng: -0.1278 },
    timezone: "Europe/London",
    currency: "GBP",
    language: "English",
    airportCodes: ["LHR", "LGW", "STN"],
    trainStationCodes: ["STP", "KGX"],
    imageUrl: "/images/cities/london.jpg",
  },
  {
    id: "rome",
    name: "Rome",
    country: "Italy",
    countryCode: "IT",
    coordinates: { lat: 41.9028, lng: 12.4964 },
    timezone: "Europe/Rome",
    currency: "EUR",
    language: "Italian",
    airportCodes: ["FCO"],
    trainStationCodes: ["ROM"],
    imageUrl: "/images/cities/rome.jpg",
  },
  {
    id: "barcelona",
    name: "Barcelona",
    country: "Spain",
    countryCode: "ES",
    coordinates: { lat: 41.3874, lng: 2.1686 },
    timezone: "Europe/Madrid",
    currency: "EUR",
    language: "Spanish",
    airportCodes: ["BCN"],
    trainStationCodes: ["BCS"],
    imageUrl: "/images/cities/barcelona.jpg",
  },
  {
    id: "amsterdam",
    name: "Amsterdam",
    country: "Netherlands",
    countryCode: "NL",
    coordinates: { lat: 52.3676, lng: 4.9041 },
    timezone: "Europe/Amsterdam",
    currency: "EUR",
    language: "Dutch",
    airportCodes: ["AMS"],
    trainStationCodes: ["AMS"],
    imageUrl: "/images/cities/amsterdam.jpg",
  },
  {
    id: "bangkok",
    name: "Bangkok",
    country: "Thailand",
    countryCode: "TH",
    coordinates: { lat: 13.7563, lng: 100.5018 },
    timezone: "Asia/Bangkok",
    currency: "THB",
    language: "Thai",
    airportCodes: ["BKK", "DMK"],
    trainStationCodes: ["BKK"],
    imageUrl: "/images/cities/bangkok.jpg",
  },
  {
    id: "singapore",
    name: "Singapore",
    country: "Singapore",
    countryCode: "SG",
    coordinates: { lat: 1.3521, lng: 103.8198 },
    timezone: "Asia/Singapore",
    currency: "SGD",
    language: "English",
    airportCodes: ["SIN"],
    trainStationCodes: [],
    imageUrl: "/images/cities/singapore.jpg",
  },
  {
    id: "sydney",
    name: "Sydney",
    country: "Australia",
    countryCode: "AU",
    coordinates: { lat: -33.8688, lng: 151.2093 },
    timezone: "Australia/Sydney",
    currency: "AUD",
    language: "English",
    airportCodes: ["SYD"],
    trainStationCodes: ["SYD"],
    imageUrl: "/images/cities/sydney.jpg",
  },
  {
    id: "newyork",
    name: "New York",
    country: "United States",
    countryCode: "US",
    coordinates: { lat: 40.7128, lng: -74.006 },
    timezone: "America/New_York",
    currency: "USD",
    language: "English",
    airportCodes: ["JFK", "LGA", "EWR"],
    trainStationCodes: ["NYP"],
    imageUrl: "/images/cities/newyork.jpg",
  },
];

// ============================================
// EXPORTS
// ============================================

// All classes are exported via their class declarations above
