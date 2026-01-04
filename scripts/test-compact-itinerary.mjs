#!/usr/bin/env node

/**
 * Test Script: Compare Token Usage Between Standard and Compact Formats
 *
 * This script compares the itinerary-service (standard) vs itinerary-service-compact
 * to measure token savings.
 *
 * Usage:
 *   node scripts/test-compact-itinerary.mjs
 *
 * Environment Variables:
 *   ITINERARY_FORMAT=compact|standard  - Switch between formats
 *   LLM_DRY_RUN=true                   - Skip actual API calls
 *   OPENAI_API_KEY=...                 - Required for real API calls
 */

import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(
    import.meta.url);
const __dirname = dirname(__filename);

// Set up module path aliases
process.chdir(join(__dirname, '..'));

// Test configuration
const TEST_REQUEST = {
    cities: ['Tokyo', 'Kyoto'],
    startDate: '2025-04-01',
    totalDays: 5,
    pace: 'moderate',
    interests: ['culture', 'food', 'temples'],
    travelers: { adults: 2 },
    budget: 'moderate',
};

async function main() {
    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║     COMPACT vs STANDARD ITINERARY FORMAT COMPARISON           ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    // Load the compact service
    const { itineraryServiceCompact, compareTokenUsage } = await
    import ('../src/lib/itinerary-service-compact.ts');

    // Show estimated token savings
    console.log('📊 ESTIMATED TOKEN SAVINGS\n');
    console.log('┌─────────┬────────────────┬────────────────┬──────────┐');
    console.log('│  Days   │    Standard    │    Compact     │  Savings │');
    console.log('├─────────┼────────────────┼────────────────┼──────────┤');

    for (const days of[3, 5, 7, 10, 14]) {
        const { standardEstimate, compactEstimate, savingsPercent } = compareTokenUsage(days);
        console.log(
            `│  ${String(days).padStart(2)}     │  ${String(standardEstimate).padStart(10)}   │  ${String(compactEstimate).padStart(10)}   │   ${String(savingsPercent).padStart(2)}%    │`
        );
    }

    console.log('└─────────┴────────────────┴────────────────┴──────────┘\n');

    // Check if we should run the actual test
    const isDryRun = process.env.LLM_DRY_RUN === 'true';
    const hasApiKey = !!process.env.OPENAI_API_KEY;

    if (!hasApiKey && !isDryRun) {
        console.log('⚠️  No OPENAI_API_KEY found. Running in DRY RUN mode.\n');
        process.env.LLM_DRY_RUN = 'true';
    }

    console.log('🧪 RUNNING COMPACT FORMAT TEST\n');
    console.log(`Request: ${TEST_REQUEST.totalDays} days in ${TEST_REQUEST.cities.join(', ')}`);
    console.log(`Pace: ${TEST_REQUEST.pace}, Budget: ${TEST_REQUEST.budget}`);
    console.log(`Travelers: ${TEST_REQUEST.travelers.adults} adults`);
    console.log(`Interests: ${TEST_REQUEST.interests.join(', ')}\n`);

    try {
        const startTime = Date.now();
        const result = await itineraryServiceCompact.generate(TEST_REQUEST);
        const duration = Date.now() - startTime;

        console.log('\n✅ GENERATION COMPLETE\n');
        console.log(`Duration: ${duration}ms`);
        console.log(`Source: ${result.metadata.source}`);
        console.log(`Total Days: ${result.metadata.totalDays}`);
        console.log(`Total Slots: ${result.metadata.totalSlots}`);
        console.log(`Total Options: ${result.metadata.totalOptions}`);
        console.log(`Cities: ${result.metadata.cities.join(', ')}`);

        if (result.message) {
            console.log(`\nMessage: ${result.message}`);
        }

        // Show sample day
        console.log('\n📅 SAMPLE DAY (Day 1)\n');
        const day1 = result.itinerary.days[0];
        if (day1) {
            console.log(`  Title: ${day1.title}`);
            console.log(`  City: ${day1.city}`);
            console.log(`  Date: ${day1.date}`);
            console.log(`  Slots: ${day1.slots.length}`);

            for (const slot of day1.slots) {
                const optCount = slot.options.length;
                const firstOpt = slot.options[0];
                console.log(`\n  [${slot.slotType.toUpperCase()}] ${slot.timeRange?.start}-${slot.timeRange?.end}`);
                if (optCount === 0) {
                    console.log(`    (empty - will be filled by restaurant service)`);
                } else {
                    console.log(`    ${firstOpt.activity.name} (${firstOpt.activity.category})`);
                    if (optCount > 1) {
                        console.log(`    + ${optCount - 1} alternatives`);
                    }
                }
            }
        }

        // Show tips
        console.log('\n💡 TRAVEL TIPS\n');
        for (const tip of result.itinerary.generalTips ? .slice(0, 3) || []) {
            console.log(`  • ${tip}`);
        }

    } catch (error) {
        console.error('❌ ERROR:', error.message);
        if (error.stack) {
            console.error('\nStack trace:', error.stack);
        }
    }

    console.log('\n' + '═'.repeat(68));
    console.log('\n📝 HOW TO SWITCH FORMATS:\n');
    console.log('  Standard format (current default):');
    console.log('    ITINERARY_FORMAT=standard');
    console.log('\n  Compact format (token-efficient):');
    console.log('    ITINERARY_FORMAT=compact');
    console.log('\n  Add to .env.local to persist the setting.\n');
}

main().catch(console.error);
