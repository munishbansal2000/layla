#!/usr/bin/env node

/**
 * Run remediation against a trip JSON file
 * Pure JavaScript implementation - no TypeScript dependencies
 * Usage: node scripts/run-remediation.mjs <tripId>
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(
    import.meta.url));
const projectRoot = path.join(__dirname, '..');

// ============================================
// CITY COORDINATES DATABASE
// Used for adding missing arrival coordinates
// ============================================

const CITY_STATION_COORDINATES = {
    // Japan major stations
    "tokyo station": { lat: 35.6812, lng: 139.7671 },
    "kyoto station": { lat: 34.9858, lng: 135.7588 },
    "osaka station": { lat: 34.7024, lng: 135.4959 },
    "shin-osaka station": { lat: 34.7334, lng: 135.5001 },
    "hiroshima station": { lat: 34.3983, lng: 132.4752 },
    "nagoya station": { lat: 35.1709, lng: 136.8815 },
    "kanazawa station": { lat: 36.5781, lng: 136.6479 },
    "hakone-yumoto station": { lat: 35.2327, lng: 139.1058 },
    "nara station": { lat: 34.6809, lng: 135.8197 },
    // Default city centers
    "tokyo": { lat: 35.6762, lng: 139.6503 },
    "kyoto": { lat: 35.0116, lng: 135.7681 },
    "osaka": { lat: 34.6937, lng: 135.5023 },
    "hiroshima": { lat: 34.3853, lng: 132.4553 },
    "nara": { lat: 34.6851, lng: 135.8048 },
    "hakone": { lat: 35.2324, lng: 139.1069 },
    "kanazawa": { lat: 36.5944, lng: 136.6256 },
    "nagoya": { lat: 35.1815, lng: 136.9066 },
};

function inferArrivalCoordinates(activityName) {
    const nameLower = activityName.toLowerCase();

    // Try to extract destination city from common patterns
    // e.g., "Nozomi Shinkansen to Kyoto" -> "kyoto"
    const toMatch = nameLower.match(/to\s+(\w+)/);
    if (toMatch) {
        const destCity = toMatch[1];
        const stationKey = `${destCity} station`;
        if (CITY_STATION_COORDINATES[stationKey]) {
            return CITY_STATION_COORDINATES[stationKey];
        }
        if (CITY_STATION_COORDINATES[destCity]) {
            return CITY_STATION_COORDINATES[destCity];
        }
    }

    // Try to find any city name in the activity name
    for (const [key, coords] of Object.entries(CITY_STATION_COORDINATES)) {
        if (nameLower.includes(key)) {
            return coords;
        }
    }

    return null;
}

// ============================================
// VALIDATION FUNCTIONS (detect issues without fixing)
// ============================================

/**
 * Validate commute data for unrealistic values
 * - Commutes > 4 hours are suspicious
 * - Commutes after city transitions should use arrival coordinates
 */
function validateCommuteData(itinerary) {
    const issues = [];
    const MAX_REASONABLE_COMMUTE_MINS = 240; // 4 hours

    for (const day of itinerary.days) {
        let previousSlotWasTravel = false;

        for (let i = 0; i < day.slots.length; i++) {
            const slot = day.slots[i];
            const commute = slot.commuteFromPrevious;

            // Check if previous slot was a travel/transport slot (city transition)
            if (i > 0) {
                const prevSlot = day.slots[i - 1];
                const prevActivity = getActivity(prevSlot);
                previousSlotWasTravel =
                    prevSlot.behavior === "travel" ||
                    (prevActivity && prevActivity.activity && prevActivity.activity.category === "transport") ||
                    (prevActivity && prevActivity.activity && prevActivity.activity.name && prevActivity.activity.name.toLowerCase().includes("shinkansen"));
            }

            if (commute && commute.duration > MAX_REASONABLE_COMMUTE_MINS) {
                const reason = previousSlotWasTravel ?
                    `Commute ${commute.duration}min after travel slot - likely using wrong origin coordinates (departure instead of arrival)` :
                    `Unrealistic commute duration: ${commute.duration}min (${Math.round(commute.duration / 60)}h)`;

                issues.push({
                    type: "INVALID_COMMUTE_DATA",
                    day: day.dayNumber,
                    slot: slot.slotId,
                    reason,
                });
            }
        }
    }

    return issues;
}

/**
 * Validate that Day 1 activities don't start before arrival
 */
function validateArrivalTiming(itinerary, constraints) {
    const issues = [];

    if (!constraints || !constraints.arrivalFlightTime || itinerary.days.length === 0) {
        return issues;
    }

    const day1 = itinerary.days[0];
    const arrivalMins = parseTime(constraints.arrivalFlightTime);

    if (arrivalMins === null) return issues;

    // Add 2 hours buffer for customs/immigration/transport
    const earliestReasonableStart = arrivalMins + 120;

    for (const slot of day1.slots) {
        if (slot.behavior === "travel") continue;

        const slotStart = slot.timeRange ? parseTime(slot.timeRange.start) : null;

        if (slotStart !== null && slotStart < arrivalMins) {
            issues.push({
                type: "ACTIVITY_BEFORE_ARRIVAL",
                day: 1,
                slot: slot.slotId,
                reason: `Activity starts at ${slot.timeRange.start} but flight arrives at ${constraints.arrivalFlightTime}`,
            });
        } else if (slotStart !== null && slotStart < earliestReasonableStart) {
            issues.push({
                type: "ACTIVITY_TOO_SOON_AFTER_ARRIVAL",
                day: 1,
                slot: slot.slotId,
                reason: `Activity at ${slot.timeRange.start} is only ${slotStart - arrivalMins}min after arrival at ${constraints.arrivalFlightTime} (recommend 2h+ buffer)`,
            });
        }
    }

    return issues;
}

/**
 * Validate city transition slots have arrival coordinates
 */
function validateCityTransitions(itinerary) {
    const issues = [];

    for (const day of itinerary.days) {
        for (const slot of day.slots) {
            const activity = getActivity(slot);
            if (!activity || !activity.activity) continue;

            const activityData = activity.activity;
            const isTransport =
                activityData.category === "transport" ||
                (activityData.name && activityData.name.toLowerCase().includes("shinkansen")) ||
                (activityData.name && activityData.name.toLowerCase().includes("bullet train"));

            if (isTransport) {
                // Check if this transport has arrival coordinates
                const hasArrivalCoords = activityData.arrivalPlace && activityData.arrivalPlace.coordinates;

                if (!hasArrivalCoords) {
                    issues.push({
                        type: "MISSING_ARRIVAL_COORDINATES",
                        day: day.dayNumber,
                        slot: slot.slotId,
                        reason: `Transport "${activityData.name}" missing arrival coordinates - will cause incorrect commute calculations for subsequent activities`,
                    });
                }
            }
        }
    }

    return issues;
}

// ============================================
// REMEDIATION LOGIC (copied from itinerary-remediation.ts)
// ============================================

function parseTime(timeStr) {
    if (!timeStr) return null;
    const match = timeStr.match(/^(\d{1,2}):(\d{2})$/);
    if (!match) return null;
    return parseInt(match[1], 10) * 60 + parseInt(match[2], 10);
}

function deepClone(obj) {
    return JSON.parse(JSON.stringify(obj));
}

function getActivity(slot) {
    if (!slot.options || slot.options.length === 0) return null;
    const selectedId = slot.selectedOptionId;
    if (selectedId) {
        const found = slot.options.find((o) => o.id === selectedId);
        if (found) return found;
    }
    return slot.options[0];
}

// Remediation: Add missing arrival coordinates
function remediateAddArrivalCoordinates(itinerary) {
    const changes = [];
    const fixed = deepClone(itinerary);

    for (const day of fixed.days) {
        for (const slot of day.slots) {
            const activity = getActivity(slot);
            if (!activity || !activity.activity) continue;

            const activityData = activity.activity;
            const isTransport =
                activityData.category === "transport" ||
                (activityData.name && activityData.name.toLowerCase().includes("shinkansen")) ||
                (activityData.name && activityData.name.toLowerCase().includes("bullet train")) ||
                (activityData.name && activityData.name.toLowerCase().includes("train to"));

            if (isTransport) {
                const hasArrivalCoords = activityData.arrivalPlace && activityData.arrivalPlace.coordinates;

                if (!hasArrivalCoords && activityData.name) {
                    const inferredCoords = inferArrivalCoordinates(activityData.name);

                    if (inferredCoords) {
                        // Add arrivalPlace to the activity
                        activityData.arrivalPlace = {
                            name: `Arrival from ${activityData.name}`,
                            address: "",
                            neighborhood: "",
                            coordinates: inferredCoords,
                        };

                        changes.push({
                            type: "ADDED_ARRIVAL_COORDINATES",
                            day: day.dayNumber,
                            slot: slot.slotId,
                            reason: `Added inferred arrival coordinates for "${activityData.name}" (${inferredCoords.lat.toFixed(4)}, ${inferredCoords.lng.toFixed(4)})`,
                        });
                    }
                }
            }
        }
    }

    return { itinerary: fixed, changes };
}

// ============================================
// DISTANCE & COMMUTE CALCULATION UTILITIES
// ============================================

/**
 * Calculate distance between two coordinates using Haversine formula
 * Returns distance in meters
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
    const R = 6371000; // Earth's radius in meters
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/**
 * Estimate commute duration based on distance and method
 * Returns duration in minutes
 */
function estimateCommuteDuration(distanceMeters, method) {
    // Average speeds in meters per minute
    const speeds = {
        walk: 80, // ~5 km/h
        transit: 500, // ~30 km/h (including wait times)
        taxi: 400, // ~24 km/h (city traffic)
        drive: 400, // ~24 km/h (city traffic)
        bus: 300, // ~18 km/h (with stops)
    };

    const speed = speeds[method] || speeds.transit;
    const baseDuration = distanceMeters / speed;

    // Add buffer for transit (waiting, walking to station, etc.)
    const buffer = method === "transit" ? 10 : method === "walk" ? 0 : 5;

    return Math.round(baseDuration + buffer);
}

/**
 * Determine commute method based on distance
 */
function inferCommuteMethod(distanceMeters) {
    if (distanceMeters < 800) return "walk"; // < 800m = walk
    if (distanceMeters < 3000) return "walk"; // < 3km = still walkable in Japan
    return "transit"; // > 3km = transit
}

// Remediation: Fix invalid commutes by recalculating using arrivalPlace coordinates
function remediateInvalidCommutes(itinerary) {
    const changes = [];
    const fixed = deepClone(itinerary);
    const MAX_REASONABLE_COMMUTE_MINS = 240; // 4 hours

    for (const day of fixed.days) {
        // Fix day-level commuteFromHotel if unrealistic
        if (day.commuteFromHotel && day.commuteFromHotel.duration > MAX_REASONABLE_COMMUTE_MINS) {
            const originalDuration = day.commuteFromHotel.duration;
            const hotelCoords = day.accommodation && day.accommodation.coordinates;

            // Get first non-transport slot's coordinates
            let firstActivityCoords = null;
            for (const slot of day.slots) {
                if (slot.behavior === "travel") continue;
                const activity = getActivity(slot);
                if (activity && activity.activity && activity.activity.place && activity.activity.place.coordinates) {
                    firstActivityCoords = activity.activity.place.coordinates;
                    break;
                }
            }

            if (hotelCoords && firstActivityCoords) {
                const distanceMeters = haversineDistance(
                    hotelCoords.lat,
                    hotelCoords.lng,
                    firstActivityCoords.lat,
                    firstActivityCoords.lng
                );
                const distanceKm = distanceMeters / 1000;
                const method = inferCommuteMethod(distanceMeters);
                const newDuration = estimateCommuteDuration(distanceMeters, method);

                day.commuteFromHotel = {
                    ...day.commuteFromHotel,
                    duration: newDuration,
                    method: method,
                    distance: distanceMeters, // Store in meters to match formatDistance expectations
                };

                changes.push({
                    type: "FIXED_DAY_COMMUTE_FROM_HOTEL",
                    day: day.dayNumber,
                    slot: null,
                    reason: `Recalculated commuteFromHotel: ${originalDuration}min → ${newDuration}min (${distanceKm.toFixed(1)}km by ${method})`,
                });
            }
        }

        // Fix day-level commuteToHotel if unrealistic
        if (day.commuteToHotel && day.commuteToHotel.duration > MAX_REASONABLE_COMMUTE_MINS) {
            const originalDuration = day.commuteToHotel.duration;
            const hotelCoords = day.accommodation && day.accommodation.coordinates;

            // Get last non-transport slot's coordinates
            let lastActivityCoords = null;
            for (let i = day.slots.length - 1; i >= 0; i--) {
                const slot = day.slots[i];
                if (slot.behavior === "travel") continue;
                const activity = getActivity(slot);
                if (activity && activity.activity && activity.activity.place && activity.activity.place.coordinates) {
                    lastActivityCoords = activity.activity.place.coordinates;
                    break;
                }
            }

            if (hotelCoords && lastActivityCoords) {
                const distanceMeters = haversineDistance(
                    lastActivityCoords.lat,
                    lastActivityCoords.lng,
                    hotelCoords.lat,
                    hotelCoords.lng
                );
                const distanceKm = distanceMeters / 1000;
                const method = inferCommuteMethod(distanceMeters);
                const newDuration = estimateCommuteDuration(distanceMeters, method);

                day.commuteToHotel = {
                    ...day.commuteToHotel,
                    duration: newDuration,
                    method: method,
                    distance: distanceMeters, // Store in meters to match formatDistance expectations
                };

                changes.push({
                    type: "FIXED_DAY_COMMUTE_TO_HOTEL",
                    day: day.dayNumber,
                    slot: null,
                    reason: `Recalculated commuteToHotel: ${originalDuration}min → ${newDuration}min (${distanceKm.toFixed(1)}km by ${method})`,
                });
            }
        }

        // Fix slot-level commutes
        for (let i = 0; i < day.slots.length; i++) {
            const slot = day.slots[i];
            const commute = slot.commuteFromPrevious;

            if (commute && commute.duration > MAX_REASONABLE_COMMUTE_MINS) {
                const originalDuration = commute.duration;
                let wasFixed = false;
                let originCoords = null;

                // Try to get origin coordinates from previous slot
                if (i > 0) {
                    const prevSlot = day.slots[i - 1];
                    const prevActivity = getActivity(prevSlot);
                    const isTransport =
                        prevSlot.behavior === "travel" ||
                        (prevActivity && prevActivity.activity && prevActivity.activity.category === "transport") ||
                        (prevActivity && prevActivity.activity && prevActivity.activity.name && prevActivity.activity.name.toLowerCase().includes("shinkansen")) ||
                        (prevActivity && prevActivity.activity && prevActivity.activity.name && prevActivity.activity.name.toLowerCase().includes("train"));

                    if (isTransport && prevActivity && prevActivity.activity) {
                        // Use arrivalPlace coordinates if available (this is the destination of the transport)
                        const arrivalPlace = prevActivity.activity.arrivalPlace;
                        if (arrivalPlace && arrivalPlace.coordinates) {
                            originCoords = arrivalPlace.coordinates;
                            console.log(`[remediation] Using arrivalPlace coordinates from "${prevActivity.activity.name}": ${originCoords.lat}, ${originCoords.lng}`);
                        }
                    } else if (prevActivity && prevActivity.activity && prevActivity.activity.place && prevActivity.activity.place.coordinates) {
                        // For non-transport slots, use their place coordinates
                        originCoords = prevActivity.activity.place.coordinates;
                    }
                }

                // Get destination coordinates from current slot
                const currentActivity = getActivity(slot);
                const destCoords = currentActivity && currentActivity.activity && currentActivity.activity.place && currentActivity.activity.place.coordinates;

                // Recalculate commute if we have both coordinates
                if (originCoords && destCoords) {
                    const distanceMeters = haversineDistance(
                        originCoords.lat,
                        originCoords.lng,
                        destCoords.lat,
                        destCoords.lng
                    );
                    const distanceKm = distanceMeters / 1000;
                    const method = inferCommuteMethod(distanceMeters);
                    const newDuration = estimateCommuteDuration(distanceMeters, method);

                    // Update the commute data
                    slot.commuteFromPrevious = {
                        ...commute,
                        duration: newDuration,
                        method: method,
                        distance: distanceMeters, // Store in meters to match formatDistance expectations
                    };

                    wasFixed = true;

                    changes.push({
                        type: "FIXED_INVALID_COMMUTE",
                        day: day.dayNumber,
                        slot: slot.slotId,
                        reason: `Recalculated commute: ${originalDuration}min → ${newDuration}min (${distanceKm.toFixed(1)}km by ${method})`,
                    });

                    // Add metadata to track the fix
                    if (!slot.metadata) slot.metadata = {};
                    slot.metadata.commuteRecalculated = true;
                    slot.metadata.originalCommute = originalDuration;
                    slot.metadata.calculatedDistance = distanceKm;
                }

                // If we couldn't fix it, just flag it
                if (!wasFixed) {
                    if (!slot.metadata) slot.metadata = {};
                    slot.metadata.needsCommuteRecalculation = true;
                    slot.metadata.commuteIssue = "missing_coordinates";
                    slot.metadata.originalCommute = originalDuration;

                    changes.push({
                        type: "FLAGGED_INVALID_COMMUTE",
                        day: day.dayNumber,
                        slot: slot.slotId,
                        reason: `Could not recalculate (missing coordinates): ${originalDuration}min exceeds threshold`,
                    });
                }
            }
        }
    }

    return { itinerary: fixed, changes };
}

// Remediation: Remove impossible slots
function remediateRemoveImpossibleSlots(itinerary, constraints) {
    if (!constraints) return { itinerary, changes: [] };

    const changes = [];
    const fixed = deepClone(itinerary);

    if (constraints.arrivalFlightTime && fixed.days.length > 0) {
        const day1 = fixed.days[0];
        const arrivalMins = parseTime(constraints.arrivalFlightTime);
        if (arrivalMins !== null) {
            const earliestActivityMins = arrivalMins + 120;
            day1.slots = day1.slots.filter((slot) => {
                if (slot.behavior === "travel") return true;
                const slotEnd = slot.timeRange ? parseTime(slot.timeRange.end) : null;
                if (slotEnd !== null && slotEnd <= earliestActivityMins) {
                    changes.push({
                        type: "REMOVED_IMPOSSIBLE_SLOT",
                        day: day1.dayNumber,
                        slot: slot.slotId,
                        reason: `Slot ends before arrival (${constraints.arrivalFlightTime} + 2h)`,
                    });
                    return false;
                }
                return true;
            });
        }
    }

    if (constraints.departureFlightTime && fixed.days.length > 0) {
        const lastDay = fixed.days[fixed.days.length - 1];
        const departureMins = parseTime(constraints.departureFlightTime);
        if (departureMins !== null) {
            const latestActivityMins = departureMins - 180;
            lastDay.slots = lastDay.slots.filter((slot) => {
                if (slot.behavior === "travel") return true;
                const slotStart = slot.timeRange ? parseTime(slot.timeRange.start) : null;
                if (slotStart !== null && slotStart >= latestActivityMins) {
                    changes.push({
                        type: "REMOVED_IMPOSSIBLE_SLOT",
                        day: lastDay.dayNumber,
                        slot: slot.slotId,
                        reason: `Slot starts after departure prep (${constraints.departureFlightTime} - 3h)`,
                    });
                    return false;
                }
                return true;
            });
        }
    }

    return { itinerary: fixed, changes };
}

// Remediation: Remove cross-day duplicates
function remediateCrossDayDuplicates(itinerary) {
    const changes = [];
    const fixed = deepClone(itinerary);
    const seenActivities = new Map();

    for (let dayIndex = 0; dayIndex < fixed.days.length; dayIndex++) {
        const day = fixed.days[dayIndex];
        const slotsToRemove = [];

        for (let slotIndex = 0; slotIndex < day.slots.length; slotIndex++) {
            const slot = day.slots[slotIndex];
            const activity = getActivity(slot);
            if (!activity || !activity.activity) continue;

            const activityData = activity.activity;
            const name = activityData.name;
            const placeId = activityData.place && activityData.place.googlePlaceId;

            if (!name) continue;

            const key = placeId || name.toLowerCase().trim();

            if (seenActivities.has(key)) {
                const first = seenActivities.get(key);
                changes.push({
                    type: "REMOVED_DUPLICATE",
                    day: day.dayNumber,
                    slot: slot.slotId,
                    reason: `Duplicate of activity on Day ${first.day} (${name})`,
                });
                slotsToRemove.push(slotIndex);
            } else {
                seenActivities.set(key, { day: day.dayNumber, slotIndex });
            }
        }

        for (let i = slotsToRemove.length - 1; i >= 0; i--) {
            day.slots.splice(slotsToRemove[i], 1);
        }
    }

    return { itinerary: fixed, changes };
}

// Remediation: Fix transfer behavior
function remediateFixTransferBehavior(itinerary) {
    const changes = [];
    const fixed = deepClone(itinerary);

    const transportKeywords = ["shinkansen", "train", "bus", "airport", "transfer", "taxi", "metro", "subway"];

    for (const day of fixed.days) {
        for (const slot of day.slots) {
            if (slot.behavior === "travel") continue;

            const activity = getActivity(slot);
            if (!activity || !activity.activity) continue;

            const activityData = activity.activity;
            const isTransport =
                activityData.category === "transport" ||
                activityData.category === "transfer" ||
                transportKeywords.some((kw) => activityData.name && activityData.name.toLowerCase().includes(kw));

            if (isTransport && slot.behavior !== "travel") {
                slot.behavior = "travel";
                changes.push({
                    type: "FIXED_TRANSFER_BEHAVIOR",
                    day: day.dayNumber,
                    slot: slot.slotId,
                    reason: `Set behavior to travel for transport activity: ${activityData.name}`,
                });
            }
        }
    }

    return { itinerary: fixed, changes };
}

// Remediation: Fix meal behavior
function remediateFixMealBehavior(itinerary) {
    const changes = [];
    const fixed = deepClone(itinerary);

    const mealSlotTypes = ["breakfast", "lunch", "dinner", "brunch"];

    for (const day of fixed.days) {
        for (const slot of day.slots) {
            if (slot.behavior === "travel") continue;

            const isMealSlot = mealSlotTypes.includes(slot.slotType && slot.slotType.toLowerCase());

            if (isMealSlot && slot.behavior !== "meal") {
                slot.behavior = "meal";
                changes.push({
                    type: "FIXED_MEAL_BEHAVIOR",
                    day: day.dayNumber,
                    slot: slot.slotId,
                    reason: `Set behavior to meal for ${slot.slotType} slot`,
                });
            }
        }
    }

    return { itinerary: fixed, changes };
}

// Remediation: Fix anchor behavior
function remediateFixAnchorBehavior(itinerary) {
    const changes = [];
    const fixed = deepClone(itinerary);

    const anchorTags = ["pre-booked", "booked", "reserved", "anchor", "confirmed", "ticket"];

    for (const day of fixed.days) {
        for (const slot of day.slots) {
            if (slot.behavior === "anchor") continue;

            const activity = getActivity(slot);
            if (!activity || !activity.activity) continue;

            const tags = activity.activity.tags || [];
            const hasAnchorTag = tags.some((tag) => anchorTags.includes(tag.toLowerCase()));

            if (hasAnchorTag) {
                slot.behavior = "anchor";
                changes.push({
                    type: "FIXED_ANCHOR_BEHAVIOR",
                    day: day.dayNumber,
                    slot: slot.slotId,
                    reason: `Set behavior to anchor for pre-booked activity: ${activity.activity.name}`,
                });
            }
        }
    }

    return { itinerary: fixed, changes };
}

// Remediation: Flag meals with long commutes
function remediateMealLongCommute(itinerary, maxCommuteMins = 30) {
    const changes = [];
    const fixed = deepClone(itinerary);

    const mealSlotTypes = ["breakfast", "lunch", "dinner", "brunch"];

    for (const day of fixed.days) {
        for (let i = 0; i < day.slots.length; i++) {
            const slot = day.slots[i];
            const isMealSlot = mealSlotTypes.includes(slot.slotType && slot.slotType.toLowerCase());

            if (!isMealSlot) continue;

            // Check commute from previous
            if (slot.commuteFromPrevious && slot.commuteFromPrevious.duration > maxCommuteMins) {
                if (!slot.metadata) slot.metadata = {};
                slot.metadata.needsNearbySearch = true;
                slot.metadata.commuteIssue = "long_commute_from_previous";
                changes.push({
                    type: "FLAGGED_MEAL_FOR_NEARBY_SEARCH",
                    day: day.dayNumber,
                    slot: slot.slotId,
                    reason: `${slot.slotType} has ${slot.commuteFromPrevious.duration}min commute from previous (>${maxCommuteMins}min)`,
                });
            }

            // Check commute to next
            if (i + 1 < day.slots.length) {
                const nextSlot = day.slots[i + 1];
                if (nextSlot.commuteFromPrevious && nextSlot.commuteFromPrevious.duration > maxCommuteMins) {
                    if (!slot.metadata) slot.metadata = {};
                    slot.metadata.needsNearbySearch = true;
                    slot.metadata.commuteIssue = "long_commute_to_next";
                    changes.push({
                        type: "FLAGGED_MEAL_FOR_NEARBY_SEARCH",
                        day: day.dayNumber,
                        slot: slot.slotId,
                        reason: `${slot.slotType} has ${nextSlot.commuteFromPrevious.duration}min commute to next activity (>${maxCommuteMins}min)`,
                    });
                }
            }
        }
    }

    return { itinerary: fixed, changes };
}

// Remediation: Flag empty slots
function remediateEmptySlots(itinerary) {
    const changes = [];
    const fixed = deepClone(itinerary);

    const mealSlotTypes = ["breakfast", "lunch", "dinner", "brunch"];

    for (const day of fixed.days) {
        for (const slot of day.slots) {
            const isEmpty = !slot.options || slot.options.length === 0;

            if (isEmpty) {
                if (!slot.metadata) slot.metadata = {};
                slot.metadata.needsFilling = true;

                const isMealSlot = mealSlotTypes.includes(slot.slotType && slot.slotType.toLowerCase());
                slot.metadata.suggestedCategory = isMealSlot ? "restaurant" : "attraction";

                changes.push({
                    type: "FLAGGED_EMPTY_SLOT",
                    day: day.dayNumber,
                    slot: slot.slotId,
                    reason: `Empty ${slot.slotType} slot needs activity suggestions`,
                });
            }
        }
    }

    return { itinerary: fixed, changes };
}

// Remediation: Recalculate slot IDs
function remediateRecalculateSlotIds(itinerary) {
    const changes = [];
    const fixed = deepClone(itinerary);

    for (const day of fixed.days) {
        for (let i = 0; i < day.slots.length; i++) {
            const slot = day.slots[i];
            const expectedId = `d${day.dayNumber}-slot-${i + 1}`;

            if (slot.slotId !== expectedId) {
                changes.push({
                    type: "FIXED_SLOT_ID",
                    day: day.dayNumber,
                    slot: slot.slotId,
                    reason: `Renamed slot from ${slot.slotId} to ${expectedId}`,
                });
                slot.slotId = expectedId;
            }
        }
    }

    return { itinerary: fixed, changes };
}

// Main remediation function
function remediateItinerary(itinerary, constraints, options = {}) {
    const {
        addArrivalCoordinates = true,
            remediateInvalidCommutes: fixInvalidCommutes = true,
            removeImpossibleSlots = true,
            removeDuplicates = true,
            fixTransferBehavior = true,
            fixMealBehavior = true,
            fixAnchorBehavior = true,
            flagMealLongCommute = true,
            flagEmptySlots = true,
            recalculateSlotIds = true,
            maxMealCommuteMins = 30,
    } = options;

    let current = itinerary;
    let allChanges = [];

    const remediations = [
        // Run first: Add missing arrival coordinates (fixes commute calculation issues)
        { name: "addArrivalCoordinates", fn: () => remediateAddArrivalCoordinates(current), enabled: addArrivalCoordinates },
        { name: "removeImpossibleSlots", fn: () => remediateRemoveImpossibleSlots(current, constraints), enabled: removeImpossibleSlots },
        { name: "removeDuplicates", fn: () => remediateCrossDayDuplicates(current), enabled: removeDuplicates },
        { name: "fixTransferBehavior", fn: () => remediateFixTransferBehavior(current), enabled: fixTransferBehavior },
        { name: "fixMealBehavior", fn: () => remediateFixMealBehavior(current), enabled: fixMealBehavior },
        { name: "fixAnchorBehavior", fn: () => remediateFixAnchorBehavior(current), enabled: fixAnchorBehavior },
        { name: "flagMealLongCommute", fn: () => remediateMealLongCommute(current, maxMealCommuteMins), enabled: flagMealLongCommute },
        { name: "flagEmptySlots", fn: () => remediateEmptySlots(current), enabled: flagEmptySlots },
        // Run near end: Flag invalid commutes for recalculation
        { name: "flagInvalidCommutes", fn: () => remediateInvalidCommutes(current), enabled: fixInvalidCommutes },
        { name: "recalculateSlotIds", fn: () => remediateRecalculateSlotIds(current), enabled: recalculateSlotIds },
    ];

    for (const { name, fn, enabled }
        of remediations) {
        if (enabled) {
            const result = fn();
            current = result.itinerary;
            allChanges = allChanges.concat(result.changes);
        }
    }

    return { itinerary: current, changes: allChanges };
}

// ============================================
// MAIN SCRIPT
// ============================================

async function runRemediation() {
    const tripId = process.argv[2] || 'japan-0314-4p-6d-FY0C';
    const tripPath = path.join(projectRoot, 'data', 'trips', `${tripId}.json`);

    console.log('='.repeat(60));
    console.log('ITINERARY REMEDIATION REPORT');
    console.log('='.repeat(60));
    console.log(`Trip ID: ${tripId}`);
    console.log(`File: ${tripPath}`);
    console.log('');

    // Load the trip JSON
    if (!fs.existsSync(tripPath)) {
        console.error(`❌ Trip file not found: ${tripPath}`);
        process.exit(1);
    }

    const tripData = JSON.parse(fs.readFileSync(tripPath, 'utf-8'));
    console.log(`✅ Loaded trip: ${tripData.destination}`);
    console.log(`   Days: ${tripData.days ? tripData.days.length : 0}`);
    console.log(`   Total slots: ${tripData.days ? tripData.days.reduce((sum, d) => sum + (d.slots ? d.slots.length : 0), 0) : 0}`);
    console.log('');

    console.log('-'.repeat(60));
    console.log('RUNNING VALIDATIONS (detect issues)...');
    console.log('-'.repeat(60));
    console.log('');

    // User-provided flight constraints
    const flightConstraints = {
        arrivalFlightTime: "15:00", // User arrives at 3pm on Day 1
        departureFlightTime: "10:00", // User departs at 10am on last day
    };

    // Run validations
    const validationIssues = [];

    // 1. Validate commute data
    const commuteIssues = validateCommuteData(tripData);
    validationIssues.push(...commuteIssues);

    // 2. Validate arrival timing
    const arrivalIssues = validateArrivalTiming(tripData, flightConstraints);
    validationIssues.push(...arrivalIssues);

    // 3. Validate city transitions
    const transitionIssues = validateCityTransitions(tripData);
    validationIssues.push(...transitionIssues);

    if (validationIssues.length > 0) {
        console.log(`⚠️  Found ${validationIssues.length} validation issues:\n`);

        // Group by type
        const issuesByType = {};
        for (const issue of validationIssues) {
            if (!issuesByType[issue.type]) {
                issuesByType[issue.type] = [];
            }
            issuesByType[issue.type].push(issue);
        }

        for (const [type, issues] of Object.entries(issuesByType)) {
            console.log(`🚨 ${type} (${issues.length})`);
            for (const issue of issues) {
                console.log(`   [Day ${issue.day}, ${issue.slot}] ${issue.reason}`);
            }
            console.log('');
        }
    } else {
        console.log('✅ No validation issues found!\n');
    }

    console.log('-'.repeat(60));
    console.log('RUNNING ALGORITHMIC REMEDIATION...');
    console.log('-'.repeat(60));

    // Run remediation WITH CONSTRAINTS
    const result = remediateItinerary(tripData, flightConstraints);

    // Report changes
    console.log('');
    console.log(`Total changes made: ${result.changes.length}`);
    console.log('');

    // Group changes by type
    const changesByType = {};
    for (const change of result.changes) {
        if (!changesByType[change.type]) {
            changesByType[change.type] = [];
        }
        changesByType[change.type].push(change);
    }

    if (result.changes.length === 0) {
        console.log('✨ No issues found! Itinerary is already consistent.');
    } else {
        // Print summary by type
        console.log('CHANGES BY TYPE:');
        console.log('-'.repeat(40));
        for (const [type, changes] of Object.entries(changesByType)) {
            console.log(`\n📌 ${type} (${changes.length})`);
            for (const change of changes) {
                const dayInfo = change.day ? `Day ${change.day}` : '';
                const slotInfo = change.slot ? `Slot: ${change.slot}` : '';
                const location = [dayInfo, slotInfo].filter(Boolean).join(', ');
                console.log(`   ${location ? `[${location}]` : ''} ${change.reason || ''}`);
      }
    }

    // Print detailed changes
    console.log('\n');
    console.log('='.repeat(60));
    console.log('DETAILED CHANGES:');
    console.log('='.repeat(60));

    for (let i = 0; i < Math.min(result.changes.length, 50); i++) {
      const change = result.changes[i];
      console.log(`\n${i + 1}. ${change.type}`);
      console.log(`   Day: ${change.day || 'N/A'}`);
      console.log(`   Slot: ${change.slot || 'N/A'}`);
      console.log(`   Reason: ${change.reason || 'N/A'}`);
    }

    if (result.changes.length > 50) {
      console.log(`\n... and ${result.changes.length - 50} more changes`);
    }
  }

  // Summary stats
  console.log('\n');
  console.log('='.repeat(60));
  console.log('SUMMARY STATISTICS:');
  console.log('='.repeat(60));

  const originalSlotCount = tripData.days ? tripData.days.reduce((sum, d) => sum + (d.slots ? d.slots.length : 0), 0) : 0;
  const remediatedSlotCount = result.itinerary.days ? result.itinerary.days.reduce((sum, d) => sum + (d.slots ? d.slots.length : 0), 0) : 0;

  console.log(`Original slots: ${originalSlotCount}`);
  console.log(`After remediation: ${remediatedSlotCount}`);
  console.log(`Slots removed: ${originalSlotCount - remediatedSlotCount}`);
  console.log(`Total fixes applied: ${result.changes.length}`);

  // Count behaviors
  const behaviors = { anchor: 0, meal: 0, travel: 0, flex: 0, other: 0 };
  for (const day of result.itinerary.days || []) {
    for (const slot of day.slots || []) {
      const b = slot.behavior || 'other';
      if (behaviors[b] !== undefined) {
        behaviors[b]++;
      } else {
        behaviors.other++;
      }
    }
  }

  console.log('\nSlot behaviors after remediation:');
  for (const [behavior, count] of Object.entries(behaviors)) {
    if (count > 0) {
      console.log(`   ${behavior}: ${count}`);
    }
  }

  // Change summary table
  console.log('\nChanges by type:');
  for (const [type, changes] of Object.entries(changesByType)) {
    console.log(`   ${type}: ${changes.length}`);
  }

  // Save remediated itinerary
  const outputPath = path.join(projectRoot, 'output', `${tripId}-remediated.json`);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, JSON.stringify(result.itinerary, null, 2));
  console.log(`\n✅ Remediated itinerary saved to: ${outputPath}`);

  // Save changes report
  const reportPath = path.join(projectRoot, 'output', `${tripId}-remediation-report.json`);
  fs.writeFileSync(reportPath, JSON.stringify({
    tripId,
    timestamp: new Date().toISOString(),
    originalSlotCount,
    remediatedSlotCount,
    totalChanges: result.changes.length,
    changesByType: Object.fromEntries(
      Object.entries(changesByType).map(([k, v]) => [k, v.length])
    ),
    changes: result.changes
  }, null, 2));
  console.log(`✅ Remediation report saved to: ${reportPath}`);
}

runRemediation().catch(err => {
  console.error('Error running remediation:', err);
  process.exit(1);
});
