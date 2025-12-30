/**
 * Test the full trip input → itinerary generation flow
 * Including pre-booked activities (teamLab)
 */

const INPUT = "10 days in Japan with my wife, starting april 15th, Tokyo and Kyoto. Already booked teamLab for April 17 at 2pm. Love ramen and temples!";

async function testFullFlow() {
    console.log("=".repeat(80));
    console.log("STEP 1: Parse Input with LLM");
    console.log("=".repeat(80));
    console.log("\nInput:", INPUT);
    console.log("\n");

    // Step 1: Parse the input
    const parseResponse = await fetch("http://localhost:3000/api/trip-input/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: INPUT, quickValidate: true }),
    });

    const parseData = await parseResponse.json();

    if (!parseData.success) {
        console.error("❌ Parse failed:", parseData.error);
        return;
    }

    const timing = parseData.timing;
    console.log("✅ Parsed successfully in", timing ? timing.parseMs : "?", "ms\n");
    console.log("📋 Extracted Entities:");
    console.log(JSON.stringify(parseData.data.parsed.extractedEntities, null, 2));

    console.log("\n📋 Trip Input (flights, hotels, activities):");
    console.log(JSON.stringify(parseData.data.parsed.tripInput, null, 2));

    console.log("\n📋 Intent:");
    console.log(JSON.stringify(parseData.data.parsed.intent, null, 2));

    console.log("\n📋 Clarifications needed:");
    console.log(parseData.data.parsed.clarifications);

    console.log("\n📋 Conflicts:");
    console.log(parseData.data.parsed.conflicts);

    // Step 2: Generate itinerary
    console.log("\n" + "=".repeat(80));
    console.log("STEP 2: Generate Itinerary");
    console.log("=".repeat(80));

    const parsed = parseData.data.parsed;
    const destinations = parsed.extractedEntities.destinations || [];
    const dates = parsed.extractedEntities.dates;
    const interests = parsed.extractedEntities.interests || [];

    // Convert extracted activities to pre-booked activities format
    const preBookedActivities = [];
    if (parsed.extractedEntities.activities) {
        for (const activity of parsed.extractedEntities.activities) {
            if (activity.name && activity.date) {
                preBookedActivities.push({
                    name: activity.name,
                    date: activity.date,
                    time: activity.time,
                    category: activity.category,
                });
            }
        }
    }

    // Build the request
    const itineraryRequest = {
        cities: destinations,
        startDate: dates && dates.start ? dates.start : "2025-04-15",
        totalDays: 10,
        pace: parsed.intent && parsed.intent.pace ? parsed.intent.pace : "moderate",
        interests: interests,
        includeKlookExperiences: true,
        preBookedActivities: preBookedActivities.length > 0 ? preBookedActivities : undefined,
    };

    console.log("\n📤 Itinerary Request:");
    console.log(JSON.stringify(itineraryRequest, null, 2));

    const itineraryResponse = await fetch("http://localhost:3000/api/japan-itinerary", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(itineraryRequest),
    });

    const itineraryData = await itineraryResponse.json();

    if (!itineraryData.success) {
        console.error("❌ Itinerary generation failed:", itineraryData.error);
        return;
    }

    console.log("\n✅ Itinerary generated successfully!\n");
    console.log("📋 Metadata:");
    console.log(JSON.stringify(itineraryData.data.metadata, null, 2));

    console.log("\n" + "=".repeat(80));
    console.log("GENERATED ITINERARY");
    console.log("=".repeat(80));

    const itinerary = itineraryData.data.itinerary;
    console.log("\n🗾 " + itinerary.destination);
    console.log("📅 " + itinerary.days.length + " days");
    console.log("🏙️ Cities: " + itinerary.days.map(d => d.city).filter((v, i, a) => a.indexOf(v) === i).join(" → "));

    // Show each day
    for (const day of itinerary.days) {
        console.log("\n" + "─".repeat(60));
        console.log("📅 Day " + day.dayNumber + ": " + day.city + " - " + day.date);
        console.log("   " + (day.title || "No title"));
        console.log("─".repeat(60));

        for (const slot of day.slots) {
            const option = slot.options[0];
            if (!option) continue;

            // Check if this is a pre-booked/locked activity
            const tags = option.activity.tags || [];
            const isLocked = option.isLocked || tags.includes("pre-booked");

            let icon = "📍";
            if (slot.slotType === "meal") icon = "🍜";
            else if (slot.slotType === "attraction") icon = "🏛️";
            else if (slot.slotType === "experience") icon = "🎭";
            else if (slot.slotType === "transport") icon = "🚃";
            else if (slot.slotType === "accommodation") icon = "🏨";

            const lockIcon = isLocked ? "🔒 " : "";
            const time = slot.timeRange && slot.timeRange.start ? slot.timeRange.start : (slot.startTime || "??:??");
            const name = option.activity.name;

            console.log("   " + time + " " + lockIcon + icon + " " + name);
            if (isLocked) {
                const reasons = option.matchReasons || [];
                console.log("         └─ PRE-BOOKED - " + reasons.join(", "));
            }
            if (option.activity.description && !isLocked) {
                console.log("         └─ " + option.activity.description.substring(0, 60) + "...");
            }
        }
    }

    // Find and highlight the pre-booked activity
    console.log("\n" + "=".repeat(80));
    console.log("🔒 PRE-BOOKED ACTIVITIES CHECK");
    console.log("=".repeat(80));

    let foundPrebooked = false;
    for (const day of itinerary.days) {
        for (const slot of day.slots) {
            for (const option of slot.options) {
                const tags = option.activity.tags || [];
                if (option.isLocked || tags.includes("pre-booked")) {
                    foundPrebooked = true;
                    console.log("\n✅ Found pre-booked activity on Day " + day.dayNumber + " (" + day.date + "):");
                    console.log("   Name: " + option.activity.name);
                    const slotTime = slot.timeRange && slot.timeRange.start ? slot.timeRange.start : "Not specified";
                    console.log("   Time: " + slotTime);
                    console.log("   Tags: " + tags.join(", "));
                    const reasons = option.matchReasons || [];
                    console.log("   Match reasons: " + reasons.join(", "));
                }
            }
        }
    }

    if (!foundPrebooked) {
        console.log("\n⚠️ No pre-booked activities found in the itinerary.");
        console.log("   Expected: teamLab on April 17 at 2pm");
    }

    // Save the full itinerary to a file for inspection
    const fs = await
    import ("fs");
    fs.writeFileSync(
        "output/generated-itinerary-test.json",
        JSON.stringify(itineraryData.data.itinerary, null, 2)
    );
    console.log("\n\n💾 Full itinerary saved to output/generated-itinerary-test.json");
}

testFullFlow().catch(console.error);