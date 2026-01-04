#!/usr/bin/env node

/**
 * Test Script: Compact Itinerary Service
 *
 * Tests the compact JSON format for itinerary generation.
 * Saves outputs to /output directory for validation.
 *
 * Usage: node scripts/test-compact-family-japan.mjs
 */

import { writeFileSync, readFileSync, mkdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(
    import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');
const outputDir = join(projectRoot, 'output');

// Load .env.local
function loadEnv() {
    const envPath = join(projectRoot, '.env.local');
    if (existsSync(envPath)) {
        const content = readFileSync(envPath, 'utf-8');
        for (const line of content.split('\n')) {
            const trimmed = line.trim();
            if (trimmed && !trimmed.startsWith('#')) {
                const eqIdx = trimmed.indexOf('=');
                if (eqIdx > 0) {
                    const key = trimmed.slice(0, eqIdx).trim();
                    let value = trimmed.slice(eqIdx + 1).trim();
                    if ((value.startsWith('"') && value.endsWith('"')) ||
                        (value.startsWith("'") && value.endsWith("'"))) {
                        value = value.slice(1, -1);
                    }
                    if (!process.env[key]) {
                        process.env[key] = value;
                    }
                }
            }
        }
    }
}

loadEnv();

// Ensure output directory exists
try {
    mkdirSync(outputDir, { recursive: true });
} catch (e) {}

// ============================================
// TEST REQUEST (Family Japan Trip)
// ============================================

const TEST_REQUEST = {
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

    hotels: [{
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

    anchors: [{
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

    transfers: [{
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

// ============================================
// COMPACT PROMPT (matches itineraryGenerationCompact)
// ============================================

const COMPACT_SYSTEM_PROMPT = `You are an expert travel itinerary generator. Generate COMPACT itineraries using minimal JSON.

CRITICAL: Use this token-efficient format to reduce response size by 50-60%.

Return JSON with this COMPACT structure:
{
  "dest": "Tokyo",
  "days": [
    {
      "c": "Tokyo",
      "t": "Shibuya & Harajuku",
      "m": [
        ["Meiji Jingu", "shrine", 90, 35.6764, 139.6993, "Harajuku"],
        ["Yoyogi Park", "park", 60, 35.6715, 139.6950, "Shibuya"]
      ],
      "a": [
        ["teamLab Borderless", "museum", 150, 35.6249, 139.7772, "Odaiba"],
        ["Shibuya Crossing", "landmark", 45, 35.6595, 139.7004, "Shibuya"]
      ],
      "e": [
        ["Shibuya Sky", "viewpoint", 60, 35.6584, 139.7022, "Shibuya"]
      ]
    }
  ],
  "tips": ["Get a Suica card", "JR Pass for Shinkansen"]
}

COMPACT FORMAT RULES:
- "dest": destination country or region
- "c": city name for the day
- "t": day title/theme
- SLOT KEYS: m=morning, a=afternoon, e=evening (SKIP lunch/dinner - filled automatically)
- ACTIVITY ARRAY FORMAT: [name, category, duration_mins, lat, lng, neighborhood]
  * name: Real venue name (string)
  * category: temple|shrine|museum|park|landmark|market|viewpoint|neighborhood|cultural-experience
  * duration: minutes (number)
  * lat/lng: coordinates (numbers, NOT array)
  * neighborhood: area name (string)
- 2-3 activities per slot (first = recommended, rest = alternatives)
- "tips": array of 3-5 travel tips

WHAT TO SKIP:
- NO descriptions (UI will generate from category)
- NO matchReasons/tradeoffs (derived from context)
- NO ids/ranks/scores (derived from array position)
- NO isFree/tags/source (inferred from category)
- NO lunch/dinner slots (filled by restaurant API)
- NO slotId/timeRange/behavior (derived from slot key)
- NO estimatedBudget (calculated separately)

GEOGRAPHIC CLUSTERING (CRITICAL):
- Each day should focus on 1-2 adjacent neighborhoods
- Morning and afternoon activities should be in the same area
- All alternatives within a slot should be nearby each other
- Don't zig-zag across the city

PACE ADJUSTMENTS:
- relaxed: 2 activities per slot, skip evening
- moderate: 2-3 activities per slot
- packed: 3 activities per slot, include evening

CONSTRAINT HANDLING:
- MUST-HAVE: Include as first activity in appropriate slot
- MUST-AVOID: Never include
- ANCHORS: Include with exact timing (will be injected by post-processor)`;

// ============================================
// BUILD USER PROMPT
// ============================================

function buildUserPrompt(request) {
    const travelerInfo = request.travelers ?
        `${request.travelers.adults}A${request.travelers.children ? `+${request.travelers.children}C (ages ${request.travelers.childrenAges.join(', ')})` : ''}`
    : '2A';

  let constraintsSection = '';
  if (request.mustHave?.length > 0) {
    constraintsSection += `\nMUST-HAVE (include as first activity): ${request.mustHave.join(', ')}`;
  }
  if (request.mustAvoid?.length > 0) {
    constraintsSection += `\nMUST-AVOID (never include): ${request.mustAvoid.join(', ')}`;
  }
  if (request.anchors?.length > 0) {
    const anchorList = request.anchors.map(a => `${a.name} (${a.city}, ${a.date} @ ${a.startTime})`).join('; ');
    constraintsSection += `\nPRE-BOOKED (fixed times): ${anchorList}`;
  }

  let flightInfo = '';
  if (request.arrivalFlightTime) {
    flightInfo += `Arrival: ${request.arrivalFlightTime} at ${request.arrivalAirport} (Day 1 starts late). `;
  }
  if (request.departureFlightTime) {
    flightInfo += `Departure: ${request.departureFlightTime} from ${request.departureAirport} (Last day ends early). `;
  }

  const interCityTransfers = request.transfers?.filter(t => t.type === 'inter_city') || [];
  const transferInfo = interCityTransfers.length > 0
    ? `Transfers: ${interCityTransfers.map(t => `${t.fromCity}→${t.toCity} on ${t.date}`).join('; ')}`
    : '';

  return `Generate ${request.totalDays}-day Japan itinerary.

CITIES: ${request.cities.join(', ')}
START: ${request.startDate}
DAYS/CITY: ${JSON.stringify(request.daysPerCity)}
PACE: ${request.pace} | TRAVELERS: ${travelerInfo} | BUDGET: ${request.budget}
INTERESTS: ${request.interests.join(', ')}
PREFS: ${request.userPreferences}
CONTEXT: ${request.tripContext}
${flightInfo}
${transferInfo}
${constraintsSection}

Return COMPACT JSON only. No markdown, no explanation.`;
}

// ============================================
// OPENAI API CALL
// ============================================

async function callOpenAI(systemPrompt, userPrompt) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not set');
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 8000,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`OpenAI API error: ${response.status} - ${error}`);
  }

  const data = await response.json();
  return {
    content: data.choices[0].message.content,
    usage: data.usage,
  };
}

// ============================================
// PARSE COMPACT RESPONSE
// ============================================

function parseCompactResponse(response) {
  let content = response;

  // Extract JSON from markdown if present
  const codeBlockMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (codeBlockMatch) {
    content = codeBlockMatch[1].trim();
  } else {
    const firstBrace = content.indexOf('{');
    const lastBrace = content.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      content = content.substring(firstBrace, lastBrace + 1);
    }
  }

  content = content.replace(/,(\s*[}\]])/g, '$1');
  return JSON.parse(content);
}

// ============================================
// EXPAND COMPACT TO FULL FORMAT
// ============================================

function expandCompactItinerary(compact, cities, startDate, numDays) {
  const days = [];
  let currentDate = new Date(startDate);

  const getDefaultTimeRange = (slotType) => {
    const ranges = {
      morning: { start: '09:00', end: '12:00' },
      lunch: { start: '12:00', end: '14:00' },
      afternoon: { start: '14:00', end: '18:00' },
      dinner: { start: '18:00', end: '20:00' },
      evening: { start: '20:00', end: '22:00' },
    };
    return ranges[slotType] || { start: '09:00', end: '12:00' };
  };

  const generateDescription = (category) => {
    const descriptions = {
      temple: 'Historic Buddhist temple known for its beautiful architecture.',
      shrine: 'Traditional Shinto shrine offering a peaceful cultural experience.',
      museum: 'Fascinating museum with exhibits showcasing art and culture.',
      park: 'Beautiful park perfect for a relaxing stroll.',
      landmark: 'Iconic landmark and must-see for visitors.',
      market: 'Vibrant market offering local goods and street food.',
      viewpoint: 'Stunning viewpoint with panoramic city views.',
      neighborhood: 'Charming neighborhood with unique character.',
      'cultural-experience': 'Immersive hands-on cultural experience.',
    };
    return descriptions[category] || `Popular ${category} worth visiting.`;
  };

  const expandSlot = (slotType, activities, dayNumber) => {
    const options = activities.map((act, index) => {
      const [name, category, duration, lat, lng, neighborhood] = act;
      return {
        id: `opt-day${dayNumber}-${slotType}-${index + 1}`,
        rank: index + 1,
        score: 85 - index * 5,
        activity: {
          name,
          description: generateDescription(category),
          category,
          duration,
          place: {
            name,
            address: '',
            neighborhood,
            coordinates: { lat, lng },
            photos: [],
          },
          isFree: ['park', 'neighborhood', 'market', 'landmark'].includes(category),
          tags: [category],
          source: 'ai',
        },
        matchReasons: [`Recommended for ${slotType}`],
        tradeoffs: [],
      };
    });

    return {
      slotId: `day${dayNumber}-${slotType}`,
      slotType,
      timeRange: getDefaultTimeRange(slotType),
      options,
      behavior: 'flex',
    };
  };

  const createEmptySlot = (slotType, dayNumber) => ({
    slotId: `day${dayNumber}-${slotType}`,
    slotType,
    timeRange: getDefaultTimeRange(slotType),
    options: [],
    behavior: slotType === 'lunch' || slotType === 'dinner' ? 'meal' : 'flex',
  });

  for (let i = 0; i < numDays; i++) {
    const compactDay = compact.days[i];
    const dateStr = currentDate.toISOString().split('T')[0];

    let cityForDay = cities[0];
    if (compactDay?.c) {
      cityForDay = compactDay.c;
    }

    const slots = [];

    // Morning
    if (compactDay?.m && compactDay.m.length > 0) {
      slots.push(expandSlot('morning', compactDay.m, i + 1));
    } else {
      slots.push(createEmptySlot('morning', i + 1));
    }

    // Lunch (empty)
    slots.push(createEmptySlot('lunch', i + 1));

    // Afternoon
    if (compactDay?.a && compactDay.a.length > 0) {
      slots.push(expandSlot('afternoon', compactDay.a, i + 1));
    } else {
      slots.push(createEmptySlot('afternoon', i + 1));
    }

    // Dinner (empty)
    slots.push(createEmptySlot('dinner', i + 1));

    // Evening (optional)
    if (compactDay?.e && compactDay.e.length > 0) {
      slots.push(expandSlot('evening', compactDay.e, i + 1));
    }

    days.push({
      dayNumber: i + 1,
      date: dateStr,
      city: cityForDay,
      title: compactDay?.t || `Day ${i + 1} in ${cityForDay}`,
      slots,
    });

    currentDate.setDate(currentDate.getDate() + 1);
  }

  return {
    destination: compact.dest || cities.join(', '),
    country: 'Japan',
    days,
    generalTips: compact.tips || ['Get a JR Pass', 'Use IC card for transit'],
    estimatedBudget: { total: { min: 50000, max: 100000 }, currency: 'JPY' },
  };
}

// ============================================
// MAIN TEST
// ============================================

async function runTest() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║     COMPACT ITINERARY TEST: Family Japan Trip                        ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');

  // Save request
  const requestPath = join(outputDir, 'compact-test-request.json');
  writeFileSync(requestPath, JSON.stringify(TEST_REQUEST, null, 2));
  console.log(`\n📋 Request saved to: ${requestPath}`);

  // Show trip details
  console.log('\n═══════════════════════════════════════════════════════════════════');
  console.log('  TRIP DETAILS');
  console.log('═══════════════════════════════════════════════════════════════════');
  console.log(`  📅 ${TEST_REQUEST.totalDays} days: ${TEST_REQUEST.startDate}`);
  console.log(`  🗾 Cities: ${TEST_REQUEST.cities.join(' → ')}`);
  console.log(`  👨‍👩‍👧‍👦 Travelers: ${TEST_REQUEST.travelers.adults} adults + ${TEST_REQUEST.travelers.children} kids`);
  console.log(`  🎯 Pace: ${TEST_REQUEST.pace}`);
  console.log(`  ✈️  Arrival: ${TEST_REQUEST.arrivalFlightTime} @ ${TEST_REQUEST.arrivalAirport}`);
  console.log(`  ✈️  Departure: ${TEST_REQUEST.departureFlightTime} @ ${TEST_REQUEST.departureAirport}`);
  console.log(`  📌 Anchors: ${TEST_REQUEST.anchors.map(a => a.name).join(', ')}`);
  console.log(`  ✅ Must-have: ${TEST_REQUEST.mustHave.join(', ')}`);
  console.log(`  ❌ Must-avoid: ${TEST_REQUEST.mustAvoid.join(', ')}`);

  // Build prompts
  const userPrompt = buildUserPrompt(TEST_REQUEST);

  // Save prompts
  const promptPath = join(outputDir, 'compact-test-prompt.txt');
  writeFileSync(promptPath, `=== SYSTEM PROMPT ===\n${COMPACT_SYSTEM_PROMPT}\n\n=== USER PROMPT ===\n${userPrompt}`);
  console.log(`\n📝 Prompts saved to: ${promptPath}`);

  // Check API key
  if (!process.env.OPENAI_API_KEY) {
    console.log('\n⚠️  OPENAI_API_KEY not set. Saving prompts only.');
    console.log('   Set the key and re-run to generate itinerary.');
    return;
  }

  // Call OpenAI
  console.log('\n⏳ Calling OpenAI API...');
  const startTime = Date.now();

  try {
    const response = await callOpenAI(COMPACT_SYSTEM_PROMPT, userPrompt);
    const duration = Date.now() - startTime;

    console.log(`\n✅ API Response received in ${duration}ms`);
    console.log(`   Tokens used: ${response.usage.total_tokens} (prompt: ${response.usage.prompt_tokens}, completion: ${response.usage.completion_tokens})`);

    // Save raw response
    const rawPath = join(outputDir, 'compact-test-raw-response.json');
    writeFileSync(rawPath, JSON.stringify({ content: response.content, usage: response.usage }, null, 2));
    console.log(`   Raw response saved to: ${rawPath}`);

    // Parse compact format
    const compactData = parseCompactResponse(response.content);

    // Save compact data
    const compactPath = join(outputDir, 'compact-test-compact-data.json');
    writeFileSync(compactPath, JSON.stringify(compactData, null, 2));
    console.log(`   Compact data saved to: ${compactPath}`);

    // Expand to full format
    const fullItinerary = expandCompactItinerary(
      compactData,
      TEST_REQUEST.cities,
      TEST_REQUEST.startDate,
      TEST_REQUEST.totalDays
    );

    // Save full itinerary
    const fullPath = join(outputDir, 'compact-test-itinerary.json');
    writeFileSync(fullPath, JSON.stringify(fullItinerary, null, 2));
    console.log(`   Full itinerary saved to: ${fullPath}`);

    // Print summary
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('  ITINERARY SUMMARY');
    console.log('═══════════════════════════════════════════════════════════════════');

    for (const day of fullItinerary.days) {
      console.log(`\nDAY ${day.dayNumber} (${day.date}) - ${day.city}`);
      console.log(`  "${day.title}"`);

      for (const slot of day.slots) {
        const time = slot.timeRange ? `${slot.timeRange.start}-${slot.timeRange.end}` : '';
        const count = slot.options.length;

        if (count === 0) {
          console.log(`  [${slot.slotType.toUpperCase().padEnd(9)}] ${time} (restaurant API will fill)`);
        } else {
          const first = slot.options[0].activity.name;
          console.log(`  [${slot.slotType.toUpperCase().padEnd(9)}] ${time} ${first}${count > 1 ? ` (+${count-1} alts)` : ''}`);
        }
      }
    }

    // Validation
    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('  VALIDATION');
    console.log('═══════════════════════════════════════════════════════════════════');

    const allActivities = fullItinerary.days.flatMap(d =>
      d.slots.flatMap(s => s.options.map(o => o.activity.name.toLowerCase()))
    );

    console.log('\n📌 Anchors:');
    for (const anchor of TEST_REQUEST.anchors) {
      const found = allActivities.some(name =>
        name.includes(anchor.name.toLowerCase().split(' ')[0])
      );
      console.log(`   ${found ? '✅' : '❌'} ${anchor.name}`);
    }

    console.log('\n✅ Must-Have:');
    for (const item of TEST_REQUEST.mustHave) {
      const found = allActivities.some(name =>
        name.includes(item.toLowerCase().split(' ')[0]) ||
        item.toLowerCase().includes(name.split(' ')[0])
      );
      console.log(`   ${found ? '✅' : '❌'} ${item}`);
    }

    console.log('\n❌ Must-Avoid:');
    for (const item of TEST_REQUEST.mustAvoid) {
      const found = allActivities.some(name => name.includes(item.toLowerCase()));
      console.log(`   ${!found ? '✅' : '⚠️ FOUND'} ${item}`);
    }

    console.log('\n💡 Travel Tips:');
    for (const tip of fullItinerary.generalTips) {
      console.log(`   • ${tip}`);
    }

    // Final summary
    const summary = {
      success: true,
      duration: `${duration}ms`,
      tokensUsed: response.usage.total_tokens,
      days: fullItinerary.days.length,
      slots: fullItinerary.days.reduce((sum, d) => sum + d.slots.length, 0),
      activities: allActivities.length,
    };

    const summaryPath = join(outputDir, 'compact-test-summary.json');
    writeFileSync(summaryPath, JSON.stringify(summary, null, 2));

    console.log('\n═══════════════════════════════════════════════════════════════════');
    console.log('  FINAL RESULTS');
    console.log('═══════════════════════════════════════════════════════════════════');
    console.log(`\n   ⏱️  Duration: ${summary.duration}`);
    console.log(`   🎯 Tokens used: ${summary.tokensUsed}`);
    console.log(`   📅 Days: ${summary.days}`);
    console.log(`   📍 Total activities: ${summary.activities}`);

    console.log('\n✅ Test complete! Output files:');
    console.log(`   • ${requestPath}`);
    console.log(`   • ${promptPath}`);
    console.log(`   • ${rawPath}`);
    console.log(`   • ${compactPath}`);
    console.log(`   • ${fullPath}`);
    console.log(`   • ${summaryPath}`);

  } catch (error) {
    console.error('\n❌ ERROR:', error.message);

    const errorPath = join(outputDir, 'compact-test-error.json');
    writeFileSync(errorPath, JSON.stringify({
      error: error.message,
      stack: error.stack,
    }, null, 2));
    console.log(`   Error saved to: ${errorPath}`);
  }
}

runTest().catch(console.error);
