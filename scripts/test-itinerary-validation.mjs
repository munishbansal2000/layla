#!/usr/bin/env node

/**
 * Test Script: Itinerary Validation
 *
 * Runs various validation checks on itinerary JSON fixtures:
 * 1. Temporal consistency (slots don't overlap, logical ordering)
 * 2. Flight constraint validation (no slots before arrival, after departure)
 * 3. Geographic consistency (activities in same city as day)
 * 4. Transfer slot validation (correct positioning, times)
 * 5. Hotel commute validation (hotel exists for days with commute)
 * 6. Slot behavior validation (anchors, meals, travel)
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(
    import.meta.url));

// ============================================
// LOAD FIXTURES
// ============================================

const fixtures = [{
        name: "test-itinerary-with-transfers",
        path: path.join(__dirname, "../src/fixtures/test-itinerary-with-transfers.json"),
        flightConstraints: {
            arrivalFlightTime: "15:00",
            departureFlightTime: "10:00",
        },
    },
    {
        name: "test-itinerary",
        path: path.join(__dirname, "../src/fixtures/test-itinerary.json"),
        flightConstraints: null,
    },
];

// ============================================
// VALIDATION UTILITIES
// ============================================

function parseTime(timeStr) {
    if (!timeStr) return null;
    const parts = timeStr.split(":");
    const hours = parseInt(parts[0], 10);
    const mins = parseInt(parts[1] || "0", 10);
    return hours * 60 + mins;
}

function formatTime(mins) {
    const hours = Math.floor(mins / 60);
    const minutes = mins % 60;
    return hours.toString().padStart(2, "0") + ":" + minutes.toString().padStart(2, "0");
}

function getActivityName(slot) {
    if (!slot.options || slot.options.length === 0) return slot.slotType;
    const opt = slot.options[0];
    if (!opt.activity) return slot.slotType;
    return opt.activity.name || slot.slotType;
}

function getActivityCoords(slot) {
    if (!slot.options || slot.options.length === 0) return null;
    const opt = slot.options[0];
    if (!opt.activity || !opt.activity.place) return null;
    return opt.activity.place.coordinates;
}

function getActivity(slot) {
    if (!slot.options || slot.options.length === 0) return null;
    return slot.options[0];
}

// ============================================
// VALIDATION CHECKS
// ============================================

function checkTemporalConsistency(itinerary) {
    const issues = [];

    for (const day of itinerary.days) {
        let previousEnd = null;
        let previousSlot = null;

        for (const slot of day.slots) {
            const start = slot.timeRange ? parseTime(slot.timeRange.start) : null;
            const end = slot.timeRange ? parseTime(slot.timeRange.end) : null;

            if (start === null || end === null) {
                issues.push({
                    type: "MISSING_TIME",
                    severity: "warning",
                    day: day.dayNumber,
                    slot: slot.slotId,
                    message: "Slot \"" + slot.slotId + "\" has missing time range",
                });
                continue;
            }

            if (start >= end) {
                issues.push({
                    type: "INVALID_TIME_RANGE",
                    severity: "error",
                    day: day.dayNumber,
                    slot: slot.slotId,
                    message: "Slot \"" + slot.slotId + "\" has invalid time range (" + slot.timeRange.start + " - " + slot.timeRange.end + ")",
                });
            }

            if (previousEnd !== null && start < previousEnd) {
                issues.push({
                    type: "OVERLAPPING_SLOTS",
                    severity: "warning",
                    day: day.dayNumber,
                    slot: slot.slotId,
                    message: "Slot \"" + slot.slotId + "\" (" + slot.timeRange.start + ") overlaps with \"" + previousSlot.slotId + "\" (ends " + previousSlot.timeRange.end + ")",
                });
            }

            previousEnd = end;
            previousSlot = slot;
        }
    }

    return issues;
}

function checkFlightConstraints(itinerary, constraints) {
    const issues = [];

    if (!constraints) return issues;

    const arrivalFlightTime = constraints.arrivalFlightTime;
    const departureFlightTime = constraints.departureFlightTime;

    // Check Day 1 - no activities before arrival
    if (arrivalFlightTime && itinerary.days.length > 0) {
        const day1 = itinerary.days[0];
        const arrivalMins = parseTime(arrivalFlightTime);
        const earliestActivityMins = arrivalMins + 120;

        for (const slot of day1.slots) {
            if (slot.behavior === "travel") continue;

            const slotEnd = slot.timeRange ? parseTime(slot.timeRange.end) : null;
            if (slotEnd !== null && slotEnd <= earliestActivityMins) {
                const activityName = getActivityName(slot);
                const startTime = slot.timeRange ? slot.timeRange.start : "??";
                const endTime = slot.timeRange ? slot.timeRange.end : "??";
                issues.push({
                    type: "IMPOSSIBLE_SLOT_BEFORE_ARRIVAL",
                    severity: "error",
                    day: day1.dayNumber,
                    slot: slot.slotId,
                    message: "Slot \"" + slot.slotType + "\" (" + startTime + "-" + endTime + ") with \"" + activityName + "\" ends BEFORE arrival (" + arrivalFlightTime + " + 2h = " + formatTime(earliestActivityMins) + ")",
                });
            }
        }
    }

    // Check last day
    if (departureFlightTime && itinerary.days.length > 0) {
        const lastDay = itinerary.days[itinerary.days.length - 1];
        const departureMins = parseTime(departureFlightTime);
        const latestActivityMins = departureMins - 180;

        for (const slot of lastDay.slots) {
            if (slot.behavior === "travel") continue;

            const slotStart = slot.timeRange ? parseTime(slot.timeRange.start) : null;
            if (slotStart !== null && slotStart >= latestActivityMins) {
                const activityName = getActivityName(slot);
                const startTime = slot.timeRange ? slot.timeRange.start : "??";
                const endTime = slot.timeRange ? slot.timeRange.end : "??";
                issues.push({
                    type: "IMPOSSIBLE_SLOT_AFTER_DEPARTURE",
                    severity: "error",
                    day: lastDay.dayNumber,
                    slot: slot.slotId,
                    message: "Slot \"" + slot.slotType + "\" (" + startTime + "-" + endTime + ") with \"" + activityName + "\" starts AFTER departure prep (" + departureFlightTime + " - 3h = " + formatTime(latestActivityMins) + ")",
                });
            }
        }
    }

    return issues;
}

function checkGeographicConsistency(itinerary) {
    const issues = [];

    const cityCenters = {
        Tokyo: { lat: 35.6762, lng: 139.6503, radius: 30 },
        Kyoto: { lat: 35.0116, lng: 135.7681, radius: 20 },
        Osaka: { lat: 34.6937, lng: 135.5023, radius: 20 },
        Nara: { lat: 34.6851, lng: 135.8048, radius: 15 },
        Hiroshima: { lat: 34.3853, lng: 132.4553, radius: 20 },
    };

    function haversineDistance(lat1, lng1, lat2, lng2) {
        const R = 6371;
        const dLat = ((lat2 - lat1) * Math.PI) / 180;
        const dLng = ((lng2 - lng1) * Math.PI) / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLng / 2) * Math.sin(dLng / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    for (const day of itinerary.days) {
        const cityCenter = cityCenters[day.city];
        if (!cityCenter) continue;

        for (const slot of day.slots) {
            if (slot.behavior === "travel") continue;

            const activity = getActivity(slot);
            const coords = activity && activity.activity && activity.activity.place ?
                activity.activity.place.coordinates : null;

            if (coords && coords.lat !== 0 && coords.lng !== 0) {
                const distance = haversineDistance(cityCenter.lat, cityCenter.lng, coords.lat, coords.lng);

                if (distance > cityCenter.radius) {
                    issues.push({
                        type: "ACTIVITY_FAR_FROM_CITY",
                        severity: "warning",
                        day: day.dayNumber,
                        slot: slot.slotId,
                        message: "\"" + activity.activity.name + "\" is " + distance.toFixed(1) + "km from " + day.city + " center (max: " + cityCenter.radius + "km)",
                    });
                }
            }
        }
    }

    return issues;
}

function checkTransferSlots(itinerary) {
    const issues = [];

    for (const day of itinerary.days) {
        for (let i = 0; i < day.slots.length; i++) {
            const slot = day.slots[i];
            const activity = getActivity(slot);

            if (!activity || !activity.activity) continue;

            const activityData = activity.activity;
            const isTransportCategory = activityData.category === "transport";
            const name = activityData.name || "";
            const nameLower = name.toLowerCase();
            const nameIndicatesTransfer = nameLower.includes("transfer") ||
                nameLower.includes("shinkansen") ||
                nameLower.includes("airport");

            if (isTransportCategory || nameIndicatesTransfer) {
                if (slot.behavior !== "travel") {
                    issues.push({
                        type: "MISSING_TRAVEL_BEHAVIOR",
                        severity: "warning",
                        day: day.dayNumber,
                        slot: slot.slotId,
                        message: "Transport slot \"" + name + "\" should have behavior: \"travel\" (has: \"" + slot.behavior + "\")",
                    });
                }
            }
        }
    }

    return issues;
}

function checkHotelCommute(itinerary) {
    const issues = [];

    for (const day of itinerary.days) {
        if (day.commuteFromHotel) {
            if (!day.accommodation) {
                issues.push({
                    type: "COMMUTE_WITHOUT_HOTEL",
                    severity: "error",
                    day: day.dayNumber,
                    slot: null,
                    message: "Day " + day.dayNumber + " has commuteFromHotel but no accommodation data",
                });
            }

            if (day.commuteFromHotel.distance > 50000) {
                issues.push({
                    type: "UNREASONABLE_COMMUTE_DISTANCE",
                    severity: "warning",
                    day: day.dayNumber,
                    slot: null,
                    message: "commuteFromHotel distance is " + (day.commuteFromHotel.distance / 1000).toFixed(1) + "km - too far",
                });
            }
        }

        if (day.commuteToHotel) {
            if (!day.accommodation) {
                issues.push({
                    type: "COMMUTE_WITHOUT_HOTEL",
                    severity: "error",
                    day: day.dayNumber,
                    slot: null,
                    message: "Day " + day.dayNumber + " has commuteToHotel but no accommodation data",
                });
            }

            if (day.commuteToHotel.distance > 50000) {
                issues.push({
                    type: "UNREASONABLE_COMMUTE_DISTANCE",
                    severity: "warning",
                    day: day.dayNumber,
                    slot: null,
                    message: "commuteToHotel distance is " + (day.commuteToHotel.distance / 1000).toFixed(1) + "km - too far",
                });
            }
        }

        if (day.accommodation) {
            const coords = day.accommodation.coordinates;
            if (!coords || (coords.lat === 0 && coords.lng === 0)) {
                issues.push({
                    type: "MISSING_HOTEL_COORDINATES",
                    severity: "warning",
                    day: day.dayNumber,
                    slot: null,
                    message: "Accommodation \"" + day.accommodation.name + "\" has missing/zero coordinates",
                });
            }
        }
    }

    return issues;
}

function checkSlotBehaviors(itinerary) {
    const issues = [];

    for (const day of itinerary.days) {
        for (const slot of day.slots) {
            const activity = getActivity(slot);
            const activityData = activity && activity.activity ? activity.activity : null;

            if (slot.slotType === "lunch" || slot.slotType === "dinner" || slot.slotType === "breakfast") {
                if (slot.behavior && slot.behavior !== "meal" && slot.behavior !== "travel") {
                    issues.push({
                        type: "INCORRECT_MEAL_BEHAVIOR",
                        severity: "info",
                        day: day.dayNumber,
                        slot: slot.slotId,
                        message: "Meal slot \"" + slot.slotType + "\" has behavior: \"" + slot.behavior + "\" (expected: \"meal\")",
                    });
                }
            }

            if (activityData && activityData.tags) {
                const tags = activityData.tags;
                if (tags.includes("pre-booked") || tags.includes("anchor")) {
                    if (slot.behavior !== "anchor") {
                        issues.push({
                            type: "MISSING_ANCHOR_BEHAVIOR",
                            severity: "warning",
                            day: day.dayNumber,
                            slot: slot.slotId,
                            message: "Pre-booked activity \"" + activityData.name + "\" should have behavior: \"anchor\"",
                        });
                    }
                }
            }
        }
    }

    return issues;
}

function checkSlotCommutes(itinerary) {
    const issues = [];

    for (const day of itinerary.days) {
        for (let i = 1; i < day.slots.length; i++) {
            const currSlot = day.slots[i];

            if (currSlot.commuteFromPrevious && currSlot.commuteFromPrevious.duration > 120) {
                issues.push({
                    type: "LONG_COMMUTE",
                    severity: "warning",
                    day: day.dayNumber,
                    slot: currSlot.slotId,
                    message: "Commute to \"" + currSlot.slotId + "\" takes " + currSlot.commuteFromPrevious.duration + " mins - very long!",
                });
            }
        }
    }

    return issues;
}

function checkDayConsistency(itinerary) {
    const issues = [];

    for (const day of itinerary.days) {
        const slots = day.slots || [];

        // Check minimum slots per day (at least 2 meaningful activities)
        const meaningfulSlots = slots.filter(function(s) {
            return s.behavior !== "travel" && s.slotType !== "free-time";
        });

        if (meaningfulSlots.length < 2) {
            issues.push({
                type: "SPARSE_DAY",
                severity: "warning",
                day: day.dayNumber,
                slot: null,
                message: "Day " + day.dayNumber + " has only " + meaningfulSlots.length + " meaningful activities (expected at least 2)",
            });
        }

        // Check for reasonable day structure (morning → lunch → afternoon → dinner pattern)
        const slotTypes = slots.map(function(s) { return s.slotType ? s.slotType.toLowerCase() : ""; });

        // Check if lunch exists between morning and afternoon activities
        const hasMorning = slotTypes.some(function(t) { return t.includes("morning"); });
        const hasAfternoon = slotTypes.some(function(t) { return t.includes("afternoon"); });
        const hasLunch = slotTypes.some(function(t) { return t === "lunch"; });

        if (hasMorning && hasAfternoon && !hasLunch) {
            issues.push({
                type: "MISSING_MEAL",
                severity: "info",
                day: day.dayNumber,
                slot: null,
                message: "Day " + day.dayNumber + " has morning and afternoon but no lunch slot",
            });
        }

        // Check time coverage - not too early start, not too late end
        if (slots.length > 0) {
            const firstSlot = slots[0];
            const lastSlot = slots[slots.length - 1];

            const firstStart = firstSlot.timeRange ? parseTime(firstSlot.timeRange.start) : null;
            const lastEnd = lastSlot.timeRange ? parseTime(lastSlot.timeRange.end) : null;

            if (firstStart !== null && firstStart < 6 * 60) { // Before 6 AM
                issues.push({
                    type: "VERY_EARLY_START",
                    severity: "warning",
                    day: day.dayNumber,
                    slot: firstSlot.slotId,
                    message: "Day starts very early at " + firstSlot.timeRange.start,
                });
            }

            if (lastEnd !== null && lastEnd > 23 * 60) { // After 11 PM
                issues.push({
                    type: "VERY_LATE_END",
                    severity: "warning",
                    day: day.dayNumber,
                    slot: lastSlot.slotId,
                    message: "Day ends very late at " + lastSlot.timeRange.end,
                });
            }
        }
    }

    return issues;
}

function checkAnchorsPresent(itinerary, expectedAnchors) {
    const issues = [];

    if (!expectedAnchors || expectedAnchors.length === 0) {
        return issues; // No anchors to validate
    }

    // Collect all activities marked as anchors
    const foundAnchors = [];

    for (const day of itinerary.days) {
        for (const slot of day.slots) {
            if (slot.behavior === "anchor") {
                const activity = getActivity(slot);
                if (activity && activity.activity) {
                    foundAnchors.push({
                        day: day.dayNumber,
                        slot: slot.slotId,
                        name: activity.activity.name,
                        date: day.date,
                    });
                }
            }
        }
    }

    // Check each expected anchor is present
    for (const expected of expectedAnchors) {
        const found = foundAnchors.find(function(a) {
            const nameMatch = a.name && expected.name &&
                a.name.toLowerCase().includes(expected.name.toLowerCase());
            const dateMatch = !expected.date || a.date === expected.date;
            return nameMatch && dateMatch;
        });

        if (!found) {
            issues.push({
                type: "MISSING_ANCHOR",
                severity: "error",
                day: null,
                slot: null,
                message: "Expected anchor \"" + expected.name + "\" not found in itinerary" +
                    (expected.date ? " for date " + expected.date : ""),
            });
        }
    }

    // Check anchors have correct behavior set
    for (const day of itinerary.days) {
        for (const slot of day.slots) {
            const activity = getActivity(slot);
            if (!activity || !activity.activity) continue;

            const tags = activity.activity.tags || [];
            const isPreBooked = tags.includes("pre-booked") || tags.includes("anchor");

            if (isPreBooked && slot.behavior !== "anchor") {
                issues.push({
                    type: "ANCHOR_WRONG_BEHAVIOR",
                    severity: "error",
                    day: day.dayNumber,
                    slot: slot.slotId,
                    message: "Pre-booked \"" + activity.activity.name + "\" has behavior \"" +
                        slot.behavior + "\" instead of \"anchor\"",
                });
            }
        }
    }

    return issues;
}

function checkMealPlacement(itinerary) {
    const issues = [];

    for (const day of itinerary.days) {
        const slots = day.slots || [];

        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            const slotType = slot.slotType ? slot.slotType.toLowerCase() : "";

            if (slotType !== "lunch" && slotType !== "dinner" && slotType !== "breakfast") {
                continue;
            }

            // Check commute TO meal
            if (slot.commuteFromPrevious && slot.commuteFromPrevious.duration > 30) {
                issues.push({
                    type: "MEAL_LONG_COMMUTE_TO",
                    severity: "warning",
                    day: day.dayNumber,
                    slot: slot.slotId,
                    message: slotType + " requires " + slot.commuteFromPrevious.duration +
                        " min commute from previous activity (ideally < 30 min)",
                });
            }

            // Check commute FROM meal (next slot's commuteFromPrevious)
            if (i < slots.length - 1) {
                const nextSlot = slots[i + 1];
                if (nextSlot.commuteFromPrevious && nextSlot.commuteFromPrevious.duration > 30) {
                    issues.push({
                        type: "MEAL_LONG_COMMUTE_FROM",
                        severity: "warning",
                        day: day.dayNumber,
                        slot: slot.slotId,
                        message: slotType + " causes " + nextSlot.commuteFromPrevious.duration +
                            " min commute to next activity (ideally < 30 min)",
                    });
                }
            }

            // Check if meal is near start or end of day (good for logistics)
            const isNearStart = i <= 1;
            const isNearEnd = i >= slots.length - 2;
            const isMiddle = !isNearStart && !isNearEnd;

            // Breakfast should be near start, dinner near end
            if (slotType === "breakfast" && !isNearStart) {
                issues.push({
                    type: "BREAKFAST_NOT_EARLY",
                    severity: "info",
                    day: day.dayNumber,
                    slot: slot.slotId,
                    message: "Breakfast is slot " + (i + 1) + " of " + slots.length + " (expected near start)",
                });
            }

            if (slotType === "dinner" && !isNearEnd && slots.length > 3) {
                issues.push({
                    type: "DINNER_NOT_LATE",
                    severity: "info",
                    day: day.dayNumber,
                    slot: slot.slotId,
                    message: "Dinner is slot " + (i + 1) + " of " + slots.length + " (expected near end)",
                });
            }
        }
    }

    return issues;
}

function checkMealPreferences(itinerary, preferences) {
    const issues = [];

    if (!preferences) return issues;

    const dietaryRestrictions = preferences.dietary || [];
    const cuisinePrefs = preferences.cuisines || [];

    for (const day of itinerary.days) {
        for (const slot of day.slots) {
            const slotType = slot.slotType ? slot.slotType.toLowerCase() : "";
            if (slotType !== "lunch" && slotType !== "dinner" && slotType !== "breakfast") {
                continue;
            }

            const activity = getActivity(slot);
            if (!activity || !activity.activity) continue;

            const activityData = activity.activity;
            const tags = activityData.tags || [];
            const cuisineType = activityData.cuisineType || activityData.cuisine || "";
            const name = activityData.name || "";

            // Check dietary restrictions
            for (const restriction of dietaryRestrictions) {
                const restrictionLower = restriction.toLowerCase();

                // Check if venue might violate restriction
                if (restrictionLower === "vegetarian" || restrictionLower === "vegan") {
                    const meatKeywords = ["steak", "bbq", "barbecue", "yakiniku", "wagyu", "pork", "tonkatsu"];
                    const hasMeat = meatKeywords.some(function(kw) {
                        return name.toLowerCase().includes(kw);
                    });

                    if (hasMeat) {
                        issues.push({
                            type: "DIETARY_VIOLATION",
                            severity: "error",
                            day: day.dayNumber,
                            slot: slot.slotId,
                            message: "\"" + name + "\" may not accommodate " + restriction + " dietary requirement",
                        });
                    }
                }

                if (restrictionLower === "halal") {
                    const nonHalalKeywords = ["pork", "tonkatsu", "ramen"]; // Many ramen have pork broth
                    const hasNonHalal = nonHalalKeywords.some(function(kw) {
                        return name.toLowerCase().includes(kw);
                    });

                    if (hasNonHalal && !tags.includes("halal")) {
                        issues.push({
                            type: "DIETARY_VIOLATION",
                            severity: "warning",
                            day: day.dayNumber,
                            slot: slot.slotId,
                            message: "\"" + name + "\" may not be halal - verify before booking",
                        });
                    }
                }
            }

            // Check cuisine preferences are being met (at least some days)
            if (cuisinePrefs.length > 0 && cuisineType) {
                const matchesPref = cuisinePrefs.some(function(pref) {
                    return cuisineType.toLowerCase().includes(pref.toLowerCase()) ||
                        pref.toLowerCase().includes(cuisineType.toLowerCase());
                });

                // This is just info - we don't require every meal to match
                if (!matchesPref) {
                    issues.push({
                        type: "CUISINE_MISMATCH",
                        severity: "info",
                        day: day.dayNumber,
                        slot: slot.slotId,
                        message: "\"" + name + "\" (" + cuisineType + ") doesn't match preferred cuisines: " +
                            cuisinePrefs.join(", "),
                    });
                }
            }
        }
    }

    return issues;
}

function checkCrossDayDuplicates(itinerary) {
    const issues = [];
    const seenActivities = new Map(); // name -> { day, slot }

    for (const day of itinerary.days) {
        for (const slot of day.slots) {
            const activity = getActivity(slot);
            if (!activity || !activity.activity) continue;

            const activityData = activity.activity;
            const name = activityData.name;
            const placeId = activityData.place ? activityData.place.placeId : null;

            if (!name) continue;

            // Use placeId if available, otherwise normalize name
            const key = placeId || name.toLowerCase().trim();

            if (seenActivities.has(key)) {
                const previous = seenActivities.get(key);
                issues.push({
                    type: "CROSS_DAY_DUPLICATE",
                    severity: "warning",
                    day: day.dayNumber,
                    slot: slot.slotId,
                    message: "\"" + name + "\" appears on both Day " + previous.day +
                        " (" + previous.slot + ") and Day " + day.dayNumber + " (" + slot.slotId + ")",
                });
            } else {
                seenActivities.set(key, { day: day.dayNumber, slot: slot.slotId });
            }
        }
    }

    return issues;
}

function checkEmptySlots(itinerary) {
    const issues = [];

    for (const day of itinerary.days) {
        for (const slot of day.slots) {
            const hasOptions = slot.options && slot.options.length > 0;
            const hasActivity = hasOptions && slot.options[0].activity;

            if (!hasActivity) {
                issues.push({
                    type: "EMPTY_SLOT",
                    severity: "warning",
                    day: day.dayNumber,
                    slot: slot.slotId,
                    message: "Slot \"" + slot.slotId + "\" (" + slot.slotType + ") has no activity assigned",
                });
            }
        }
    }

    return issues;
}

// ============================================
// REMEDIATION FUNCTIONS
// ============================================

function remediateRemoveImpossibleSlots(itinerary, constraints) {
    if (!constraints) return { itinerary, changes: [] };

    const changes = [];
    const arrivalFlightTime = constraints.arrivalFlightTime;
    const departureFlightTime = constraints.departureFlightTime;

    // Deep clone itinerary
    const fixed = JSON.parse(JSON.stringify(itinerary));

    // Day 1: Remove slots that end before arrival + 2h
    if (arrivalFlightTime && fixed.days.length > 0) {
        const day1 = fixed.days[0];
        const arrivalMins = parseTime(arrivalFlightTime);
        const earliestActivityMins = arrivalMins + 120;

        const originalCount = day1.slots.length;
        day1.slots = day1.slots.filter(function(slot) {
            if (slot.behavior === "travel") return true;

            const slotEnd = slot.timeRange ? parseTime(slot.timeRange.end) : null;
            if (slotEnd !== null && slotEnd <= earliestActivityMins) {
                changes.push({
                    type: "REMOVED_IMPOSSIBLE_SLOT",
                    day: day1.dayNumber,
                    slot: slot.slotId,
                    reason: "Slot ends before arrival (" + arrivalFlightTime + " + 2h)",
                });
                return false;
            }
            return true;
        });
    }

    // Last day: Remove slots that start after departure - 3h
    if (departureFlightTime && fixed.days.length > 0) {
        const lastDay = fixed.days[fixed.days.length - 1];
        const departureMins = parseTime(departureFlightTime);
        const latestActivityMins = departureMins - 180;

        lastDay.slots = lastDay.slots.filter(function(slot) {
            if (slot.behavior === "travel") return true;

            const slotStart = slot.timeRange ? parseTime(slot.timeRange.start) : null;
            if (slotStart !== null && slotStart >= latestActivityMins) {
                changes.push({
                    type: "REMOVED_IMPOSSIBLE_SLOT",
                    day: lastDay.dayNumber,
                    slot: slot.slotId,
                    reason: "Slot starts after departure prep (" + departureFlightTime + " - 3h)",
                });
                return false;
            }
            return true;
        });
    }

    return { itinerary: fixed, changes };
}

function remediateFixTransferSlotBehavior(itinerary) {
    const changes = [];
    const fixed = JSON.parse(JSON.stringify(itinerary));

    for (const day of fixed.days) {
        for (const slot of day.slots) {
            const activity = getActivity(slot);
            if (!activity || !activity.activity) continue;

            const activityData = activity.activity;
            const isTransportCategory = activityData.category === "transport";
            const name = activityData.name || "";
            const nameLower = name.toLowerCase();
            const nameIndicatesTransfer = nameLower.includes("transfer") ||
                nameLower.includes("shinkansen") ||
                nameLower.includes("airport") ||
                nameLower.includes("train") ||
                nameLower.includes("bus") ||
                nameLower.includes("taxi");

            if ((isTransportCategory || nameIndicatesTransfer) && slot.behavior !== "travel") {
                const oldBehavior = slot.behavior;
                slot.behavior = "travel";
                changes.push({
                    type: "FIXED_TRANSFER_BEHAVIOR",
                    day: day.dayNumber,
                    slot: slot.slotId,
                    reason: "Changed behavior from \"" + oldBehavior + "\" to \"travel\" for \"" + name + "\"",
                });
            }
        }
    }

    return { itinerary: fixed, changes };
}

function remediateFixMealSlotBehavior(itinerary) {
    const changes = [];
    const fixed = JSON.parse(JSON.stringify(itinerary));

    for (const day of fixed.days) {
        for (const slot of day.slots) {
            const slotType = slot.slotType ? slot.slotType.toLowerCase() : "";
            const isMealSlot = slotType === "lunch" || slotType === "dinner" || slotType === "breakfast";

            if (isMealSlot && slot.behavior !== "meal" && slot.behavior !== "travel") {
                const oldBehavior = slot.behavior;
                slot.behavior = "meal";
                changes.push({
                    type: "FIXED_MEAL_BEHAVIOR",
                    day: day.dayNumber,
                    slot: slot.slotId,
                    reason: "Changed behavior from \"" + (oldBehavior || "undefined") + "\" to \"meal\" for \"" + slot.slotType + "\"",
                });
            }
        }
    }

    return { itinerary: fixed, changes };
}

function remediateFixAnchorBehavior(itinerary) {
    const changes = [];
    const fixed = JSON.parse(JSON.stringify(itinerary));

    for (const day of fixed.days) {
        for (const slot of day.slots) {
            const activity = getActivity(slot);
            if (!activity || !activity.activity) continue;

            const activityData = activity.activity;
            const tags = activityData.tags || [];
            const isPreBooked = tags.includes("pre-booked") || tags.includes("anchor");

            if (isPreBooked && slot.behavior !== "anchor") {
                const oldBehavior = slot.behavior;
                slot.behavior = "anchor";
                changes.push({
                    type: "FIXED_ANCHOR_BEHAVIOR",
                    day: day.dayNumber,
                    slot: slot.slotId,
                    reason: "Changed behavior from \"" + (oldBehavior || "undefined") + "\" to \"anchor\" for pre-booked \"" + activityData.name + "\"",
                });
            }
        }
    }

    return { itinerary: fixed, changes };
}

function remediateRecalculateSlotIds(itinerary) {
    const changes = [];
    const fixed = JSON.parse(JSON.stringify(itinerary));

    for (const day of fixed.days) {
        for (let i = 0; i < day.slots.length; i++) {
            const slot = day.slots[i];
            const expectedId = "d" + day.dayNumber + "-slot-" + (i + 1);
            if (slot.slotId !== expectedId) {
                const oldId = slot.slotId;
                slot.slotId = expectedId;
                changes.push({
                    type: "FIXED_SLOT_ID",
                    day: day.dayNumber,
                    slot: expectedId,
                    reason: "Renumbered slot from \"" + oldId + "\" to \"" + expectedId + "\"",
                });
            }
        }
    }

    return { itinerary: fixed, changes };
}

function remediateCrossDayDuplicates(itinerary) {
    const changes = [];
    const fixed = JSON.parse(JSON.stringify(itinerary));
    const seenActivities = new Map(); // key -> { day, slotIndex }

    for (let dayIndex = 0; dayIndex < fixed.days.length; dayIndex++) {
        const day = fixed.days[dayIndex];
        const slotsToRemove = [];

        for (let slotIndex = 0; slotIndex < day.slots.length; slotIndex++) {
            const slot = day.slots[slotIndex];
            const activity = getActivity(slot);
            if (!activity || !activity.activity) continue;

            const activityData = activity.activity;
            const name = activityData.name;
            const placeId = activityData.place ? activityData.place.placeId : null;

            if (!name) continue;

            // Use placeId if available, otherwise normalize name
            const key = placeId || name.toLowerCase().trim();

            if (seenActivities.has(key)) {
                const previous = seenActivities.get(key);
                // Remove the duplicate from the later day
                slotsToRemove.push(slotIndex);
                changes.push({
                    type: "REMOVED_DUPLICATE",
                    day: day.dayNumber,
                    slot: slot.slotId,
                    reason: "Removed duplicate \"" + name + "\" (already on Day " + previous.day + ")",
                });
            } else {
                seenActivities.set(key, { day: day.dayNumber, slotIndex: slotIndex });
            }
        }

        // Remove slots in reverse order to maintain indices
        for (let i = slotsToRemove.length - 1; i >= 0; i--) {
            day.slots.splice(slotsToRemove[i], 1);
        }
    }

    return { itinerary: fixed, changes };
}

function remediateMealLongCommute(itinerary) {
    const changes = [];
    const fixed = JSON.parse(JSON.stringify(itinerary));
    const COMMUTE_THRESHOLD = 30; // minutes

    for (const day of fixed.days) {
        const slots = day.slots || [];

        for (let i = 0; i < slots.length; i++) {
            const slot = slots[i];
            const slotType = slot.slotType ? slot.slotType.toLowerCase() : "";

            if (slotType !== "lunch" && slotType !== "dinner" && slotType !== "breakfast") {
                continue;
            }

            // Check if this meal has a long commute TO it
            if (slot.commuteFromPrevious && slot.commuteFromPrevious.duration > COMMUTE_THRESHOLD && i > 0) {
                const prevSlot = slots[i - 1];
                const prevActivity = getActivity(prevSlot);

                if (prevActivity && prevActivity.activity && prevActivity.activity.place) {
                    const prevCoords = prevActivity.activity.place.coordinates;

                    // Mark this meal slot as needing a nearby replacement
                    if (!slot.metadata) slot.metadata = {};
                    slot.metadata.needsNearbyReplacement = true;
                    slot.metadata.searchNearCoordinates = prevCoords;
                    slot.metadata.reason = "Long commute from previous activity (" + slot.commuteFromPrevious.duration + " min)";

                    changes.push({
                        type: "FLAGGED_MEAL_FOR_NEARBY_SEARCH",
                        day: day.dayNumber,
                        slot: slot.slotId,
                        reason: slotType + " flagged for nearby search (commute: " + slot.commuteFromPrevious.duration + " min from \"" + (prevActivity.activity.name || "previous") + "\")",
                    });
                }
            }

            // Check if this meal has a long commute FROM it (next slot)
            if (i < slots.length - 1) {
                const nextSlot = slots[i + 1];
                if (nextSlot.commuteFromPrevious && nextSlot.commuteFromPrevious.duration > COMMUTE_THRESHOLD) {
                    const nextActivity = getActivity(nextSlot);

                    if (nextActivity && nextActivity.activity && nextActivity.activity.place) {
                        const nextCoords = nextActivity.activity.place.coordinates;

                        // Mark this meal slot as needing a nearby replacement
                        if (!slot.metadata) slot.metadata = {};
                        slot.metadata.needsNearbyReplacement = true;
                        slot.metadata.searchNearCoordinates = nextCoords;
                        slot.metadata.reason = "Long commute to next activity (" + nextSlot.commuteFromPrevious.duration + " min)";

                        changes.push({
                            type: "FLAGGED_MEAL_FOR_NEARBY_SEARCH",
                            day: day.dayNumber,
                            slot: slot.slotId,
                            reason: slotType + " flagged for nearby search (commute: " + nextSlot.commuteFromPrevious.duration + " min to \"" + (nextActivity.activity.name || "next") + "\")",
                        });
                    }
                }
            }
        }
    }

    return { itinerary: fixed, changes };
}

function remediateEmptySlots(itinerary) {
    const changes = [];
    const fixed = JSON.parse(JSON.stringify(itinerary));

    for (const day of fixed.days) {
        for (const slot of day.slots) {
            const hasOptions = slot.options && slot.options.length > 0;
            const hasActivity = hasOptions && slot.options[0].activity;

            if (!hasActivity) {
                // Mark slot as needing to be filled
                if (!slot.metadata) slot.metadata = {};
                slot.metadata.needsActivity = true;
                slot.metadata.suggestedCategory = getMealCategory(slot.slotType) || "attraction";

                changes.push({
                    type: "FLAGGED_EMPTY_SLOT",
                    day: day.dayNumber,
                    slot: slot.slotId,
                    reason: "Empty slot \"" + slot.slotType + "\" flagged for activity suggestion",
                });
            }
        }
    }

    return { itinerary: fixed, changes };
}

function getMealCategory(slotType) {
    if (!slotType) return null;
    const lower = slotType.toLowerCase();
    if (lower === "lunch" || lower === "dinner" || lower === "breakfast") {
        return "restaurant";
    }
    return null;
}

function runAllRemediations(itinerary, constraints) {
    let current = itinerary;
    let allChanges = [];

    // 1. Remove impossible slots first
    const r1 = remediateRemoveImpossibleSlots(current, constraints);
    current = r1.itinerary;
    allChanges = allChanges.concat(r1.changes);

    // 2. Remove cross-day duplicates
    const r2 = remediateCrossDayDuplicates(current);
    current = r2.itinerary;
    allChanges = allChanges.concat(r2.changes);

    // 3. Fix transfer slot behaviors
    const r3 = remediateFixTransferSlotBehavior(current);
    current = r3.itinerary;
    allChanges = allChanges.concat(r3.changes);

    // 4. Fix meal slot behaviors
    const r4 = remediateFixMealSlotBehavior(current);
    current = r4.itinerary;
    allChanges = allChanges.concat(r4.changes);

    // 5. Fix anchor behaviors
    const r5 = remediateFixAnchorBehavior(current);
    current = r5.itinerary;
    allChanges = allChanges.concat(r5.changes);

    // 6. Flag meals with long commutes for nearby replacement
    const r6 = remediateMealLongCommute(current);
    current = r6.itinerary;
    allChanges = allChanges.concat(r6.changes);

    // 7. Flag empty slots for activity suggestion
    const r7 = remediateEmptySlots(current);
    current = r7.itinerary;
    allChanges = allChanges.concat(r7.changes);

    // 8. Recalculate slot IDs after removals
    const r8 = remediateRecalculateSlotIds(current);
    current = r8.itinerary;
    allChanges = allChanges.concat(r8.changes);

    return { itinerary: current, changes: allChanges };
}

// ============================================
// RUN ALL CHECKS
// ============================================

function runValidation(itinerary, fixtureName, constraints, validationOptions) {
    const options = validationOptions || {};

    console.log("\n" + "=".repeat(60));
    console.log("📋 Validating: " + fixtureName);
    console.log("=".repeat(60));
    console.log("Days: " + (itinerary.days ? itinerary.days.length : 0));
    console.log("Destination: " + (itinerary.destination || "Unknown"));
    if (constraints) {
        console.log("Flight constraints: arrival=" + constraints.arrivalFlightTime + ", departure=" + constraints.departureFlightTime);
    }

    const allIssues = [];

    const checks = [
        { name: "Temporal Consistency", fn: function() { return checkTemporalConsistency(itinerary); } },
        { name: "Flight Constraints", fn: function() { return checkFlightConstraints(itinerary, constraints); } },
        { name: "Day Consistency", fn: function() { return checkDayConsistency(itinerary); } },
        { name: "Geographic Consistency", fn: function() { return checkGeographicConsistency(itinerary); } },
        { name: "Transfer Slots", fn: function() { return checkTransferSlots(itinerary); } },
        { name: "Hotel Commute", fn: function() { return checkHotelCommute(itinerary); } },
        { name: "Slot Behaviors", fn: function() { return checkSlotBehaviors(itinerary); } },
        { name: "Slot Commutes", fn: function() { return checkSlotCommutes(itinerary); } },
        { name: "Anchors Present", fn: function() { return checkAnchorsPresent(itinerary, options.expectedAnchors); } },
        { name: "Meal Placement", fn: function() { return checkMealPlacement(itinerary); } },
        { name: "Meal Preferences", fn: function() { return checkMealPreferences(itinerary, options.mealPreferences); } },
        { name: "Cross-Day Duplicates", fn: function() { return checkCrossDayDuplicates(itinerary); } },
        { name: "Empty Slots", fn: function() { return checkEmptySlots(itinerary); } },
    ];

    for (const check of checks) {
        const issues = check.fn();
        if (issues.length > 0) {
            console.log("\n🔍 " + check.name + ": " + issues.length + " issue(s)");
            for (const issue of issues) {
                const icon = issue.severity === "error" ? "❌" : issue.severity === "warning" ? "⚠️" : "ℹ️";
                const slotInfo = issue.slot ? ", " + issue.slot : "";
                console.log("   " + icon + " [Day " + issue.day + slotInfo + "] " + issue.message);
            }
            allIssues.push(...issues);
        } else {
            console.log("\n✅ " + check.name + ": OK");
        }
    }

    const errorCount = allIssues.filter(function(i) { return i.severity === "error"; }).length;
    const warningCount = allIssues.filter(function(i) { return i.severity === "warning"; }).length;
    const infoCount = allIssues.filter(function(i) { return i.severity === "info"; }).length;

    console.log("\n" + "─".repeat(60));
    console.log("Summary: " + errorCount + " errors, " + warningCount + " warnings, " + infoCount + " info");

    return { errors: errorCount, warnings: warningCount, info: infoCount, issues: allIssues };
}

// ============================================
// MAIN
// ============================================

async function main() {
    const args = process.argv.slice(2);
    const shouldFix = args.includes("--fix");
    const shouldSave = args.includes("--save");

    console.log("🧪 Itinerary Validation Test Suite");
    console.log("===================================");
    if (shouldFix) {
        console.log("🔧 FIX MODE ENABLED - will apply remediations");
    }
    if (shouldSave) {
        console.log("💾 SAVE MODE ENABLED - will save fixed files");
    }
    console.log("");

    const results = [];

    for (const fixture of fixtures) {
        try {
            const content = fs.readFileSync(fixture.path, "utf-8");
            const itinerary = JSON.parse(content);

            // First, run validation on original
            const result = runValidation(itinerary, fixture.name, fixture.flightConstraints);
            results.push({
                fixture: fixture.name,
                path: fixture.path,
                errors: result.errors,
                warnings: result.warnings,
                info: result.info,
                issues: result.issues,
                originalItinerary: itinerary,
                constraints: fixture.flightConstraints
            });
        } catch (error) {
            console.log("\n❌ Error loading " + fixture.name + ": " + error.message);
            results.push({ fixture: fixture.name, errors: 1, warnings: 0, info: 0, issues: [] });
        }
    }

    // If --fix flag provided, apply remediations
    if (shouldFix) {
        console.log("\n\n" + "═".repeat(60));
        console.log("🔧 APPLYING REMEDIATIONS");
        console.log("═".repeat(60));

        for (const result of results) {
            if (!result.originalItinerary) continue;
            if (result.errors === 0 && result.warnings === 0) {
                console.log("\n✅ " + result.fixture + ": No issues to fix");
                continue;
            }

            console.log("\n📋 Fixing: " + result.fixture);
            const remediation = runAllRemediations(result.originalItinerary, result.constraints);

            if (remediation.changes.length === 0) {
                console.log("   No automatic fixes available");
                continue;
            }

            console.log("   Applied " + remediation.changes.length + " fix(es):");
            for (const change of remediation.changes) {
                console.log("   ✓ [" + change.type + "] Day " + change.day + ", " + change.slot + ": " + change.reason);
            }

            result.fixedItinerary = remediation.itinerary;
            result.changes = remediation.changes;

            // Re-validate fixed itinerary
            console.log("\n   Re-validating after fixes...");
            const revalidation = runValidation(remediation.itinerary, result.fixture + " (fixed)", result.constraints);
            result.fixedErrors = revalidation.errors;
            result.fixedWarnings = revalidation.warnings;
        }
    }

    // If --save flag provided, save fixed files
    if (shouldFix && shouldSave) {
        console.log("\n\n" + "═".repeat(60));
        console.log("💾 SAVING FIXED FILES");
        console.log("═".repeat(60));

        for (const result of results) {
            if (!result.fixedItinerary) continue;

            const fixedPath = result.path.replace(".json", "-fixed.json");
            try {
                fs.writeFileSync(fixedPath, JSON.stringify(result.fixedItinerary, null, 2));
                console.log("\n✅ Saved: " + fixedPath);
            } catch (error) {
                console.log("\n❌ Error saving " + fixedPath + ": " + error.message);
            }
        }
    }

    console.log("\n\n" + "═".repeat(60));
    console.log("🏁 FINAL SUMMARY");
    console.log("═".repeat(60));

    let totalErrors = 0;
    let totalWarnings = 0;

    for (const result of results) {
        const status = result.errors > 0 ? "❌ FAIL" : result.warnings > 0 ? "⚠️ WARN" : "✅ PASS";
        let line = status + " " + result.fixture + ": " + result.errors + " errors, " + result.warnings + " warnings";

        if (shouldFix && result.fixedErrors !== undefined) {
            const fixedStatus = result.fixedErrors > 0 ? "❌" : result.fixedWarnings > 0 ? "⚠️" : "✅";
            line += " → " + fixedStatus + " " + result.fixedErrors + " errors, " + result.fixedWarnings + " warnings after fix";
        }

        console.log(line);
        totalErrors += result.errors;
        totalWarnings += result.warnings;
    }

    console.log("\nTotal: " + totalErrors + " errors, " + totalWarnings + " warnings across " + results.length + " fixtures");

    if (shouldFix && shouldSave) {
        console.log("\n💡 Fixed files saved with -fixed.json suffix");
    } else if (shouldFix && !shouldSave) {
        console.log("\n💡 Run with --fix --save to save fixed files");
    } else {
        console.log("\n💡 Run with --fix to apply automatic remediations");
    }

    process.exit(totalErrors > 0 ? 1 : 0);
}

main();
