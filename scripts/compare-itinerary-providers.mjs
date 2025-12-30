#!/usr/bin/env node
/**
 * Compare Itinerary Providers
 * 
 * Generates the same itinerary using both DATA and LLM providers
 * and compares the results side by side.
 * 
 * Usage:
 *   node scripts/compare-itinerary-providers.mjs
 *   node scripts/compare-itinerary-providers.mjs --cities "Tokyo,Kyoto" --days 4
 */

import dotenv from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, resolve } from 'path';
import fs from 'fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables
dotenv.config({ path: resolve(__dirname, '../.env.local') });

// Parse command line arguments
const args = process.argv.slice(2);
const getArg = (name, defaultValue) => {
  const index = args.indexOf(`--${name}`);
  return index !== -1 && args[index + 1] ? args[index + 1] : defaultValue;
};

const cities = getArg('cities', 'Tokyo').split(',').map(c => c.trim());
const totalDays = parseInt(getArg('days', '3'), 10);
const pace = getArg('pace', 'moderate');
const aiProvider = getArg('ai', 'gemini'); // openai, gemini, or ollama

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║          ITINERARY PROVIDER COMPARISON                        ║');
console.log('╚════════════════════════════════════════════════════════════════╝');
console.log();
console.log(`📍 Cities: ${cities.join(', ')}`);
console.log(`📅 Days: ${totalDays}`);
console.log(`🏃 Pace: ${pace}`);
console.log(`🤖 AI Provider: ${aiProvider}`);
console.log();

// Create the request
const request = {
  cities,
  startDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0], // 1 week from now
  totalDays,
  pace,
  interests: ['culture', 'food', 'nature'],
};

async function generateWithProvider(provider) {
  // Set environment for the provider
  process.env.ITINERARY_PROVIDER = provider;
  if (provider === 'llm') {
    process.env.ITINERARY_AI_PROVIDER = aiProvider;
  }
  
  // Dynamic import to pick up env changes
  const { generate } = await import('../src/lib/itinerary-service.ts');
  
  const startTime = Date.now();
  const result = await generate(request);
  const duration = Date.now() - startTime;
  
  return { result, duration };
}

function summarizeItinerary(response) {
  const { itinerary, metadata } = response;
  
  const summary = {
    destination: itinerary.destination,
    days: itinerary.days.length,
    totalSlots: metadata.totalSlots,
    totalOptions: metadata.totalOptions,
    source: metadata.source,
    dayBreakdown: [],
  };
  
  for (const day of itinerary.days) {
    const dayInfo = {
      dayNumber: day.dayNumber,
      city: day.city,
      title: day.title,
      slots: [],
    };
    
    for (const slot of day.slots) {
      const selectedOption = slot.options.find(o => o.id === slot.selectedOptionId) || slot.options[0];
      dayInfo.slots.push({
        type: slot.slotType,
        time: `${slot.timeRange.start}-${slot.timeRange.end}`,
        activity: selectedOption?.activity?.name || '(empty)',
        category: selectedOption?.activity?.category || '-',
        optionCount: slot.options.length,
        hasCoordinates: !!(selectedOption?.activity?.place?.coordinates?.lat),
      });
    }
    
    summary.dayBreakdown.push(dayInfo);
  }
  
  return summary;
}

function printDaySideBySide(dataDay, llmDay) {
  console.log(`\n  ┌─────────────────────────────────────┬─────────────────────────────────────┐`);
  console.log(`  │ DATA: ${(dataDay?.title || 'N/A').substring(0, 28).padEnd(28)} │ LLM: ${(llmDay?.title || 'N/A').substring(0, 29).padEnd(29)} │`);
  console.log(`  ├─────────────────────────────────────┼─────────────────────────────────────┤`);
  
  const maxSlots = Math.max(dataDay?.slots?.length || 0, llmDay?.slots?.length || 0);
  
  for (let i = 0; i < maxSlots; i++) {
    const dataSlot = dataDay?.slots?.[i];
    const llmSlot = llmDay?.slots?.[i];
    
    const dataLine = dataSlot 
      ? `${dataSlot.type.padEnd(9)} ${dataSlot.activity.substring(0, 24).padEnd(24)}`
      : ''.padEnd(35);
    const llmLine = llmSlot
      ? `${llmSlot.type.padEnd(9)} ${llmSlot.activity.substring(0, 24).padEnd(24)}`
      : ''.padEnd(35);
    
    console.log(`  │ ${dataLine} │ ${llmLine} │`);
  }
  
  console.log(`  └─────────────────────────────────────┴─────────────────────────────────────┘`);
}

async function main() {
  try {
    // Generate with DATA provider
    console.log('━'.repeat(70));
    console.log('🗃️  Generating with DATA provider...');
    console.log('━'.repeat(70));
    
    const dataResult = await generateWithProvider('data');
    const dataSummary = summarizeItinerary(dataResult.result);
    
    console.log(`✅ Generated in ${dataResult.duration}ms`);
    console.log(`   Source: ${dataSummary.source}`);
    console.log(`   Days: ${dataSummary.days}, Slots: ${dataSummary.totalSlots}, Options: ${dataSummary.totalOptions}`);
    
    // Generate with LLM provider
    console.log();
    console.log('━'.repeat(70));
    console.log(`🤖 Generating with LLM provider (${aiProvider})...`);
    console.log('━'.repeat(70));
    
    const llmResult = await generateWithProvider('llm');
    const llmSummary = summarizeItinerary(llmResult.result);
    
    console.log(`✅ Generated in ${llmResult.duration}ms`);
    console.log(`   Source: ${llmSummary.source}`);
    console.log(`   Days: ${llmSummary.days}, Slots: ${llmSummary.totalSlots}, Options: ${llmSummary.totalOptions}`);
    
    // Side-by-side comparison
    console.log();
    console.log('═'.repeat(70));
    console.log('📊 SIDE-BY-SIDE COMPARISON');
    console.log('═'.repeat(70));
    
    console.log(`
  ┌───────────────────────────────────────────────────────────────────┐
  │                        SUMMARY                                    │
  ├───────────────────┬────────────────────┬──────────────────────────┤
  │ Metric            │ DATA Provider      │ LLM Provider             │
  ├───────────────────┼────────────────────┼──────────────────────────┤
  │ Generation Time   │ ${String(dataResult.duration + 'ms').padEnd(18)} │ ${String(llmResult.duration + 'ms').padEnd(24)} │
  │ Total Slots       │ ${String(dataSummary.totalSlots).padEnd(18)} │ ${String(llmSummary.totalSlots).padEnd(24)} │
  │ Total Options     │ ${String(dataSummary.totalOptions).padEnd(18)} │ ${String(llmSummary.totalOptions).padEnd(24)} │
  │ Source            │ ${dataSummary.source.padEnd(18)} │ ${llmSummary.source.padEnd(24)} │
  └───────────────────┴────────────────────┴──────────────────────────┘`);
    
    // Day-by-day comparison
    console.log('\n📅 DAY-BY-DAY COMPARISON:');
    
    const maxDays = Math.max(dataSummary.dayBreakdown.length, llmSummary.dayBreakdown.length);
    for (let i = 0; i < maxDays; i++) {
      console.log(`\n  Day ${i + 1}:`);
      printDaySideBySide(dataSummary.dayBreakdown[i], llmSummary.dayBreakdown[i]);
    }
    
    // Save full results to files
    const outputDir = resolve(__dirname, '../output');
    await fs.mkdir(outputDir, { recursive: true });
    
    await fs.writeFile(
      resolve(outputDir, 'comparison-data-provider.json'),
      JSON.stringify(dataResult.result, null, 2)
    );
    await fs.writeFile(
      resolve(outputDir, 'comparison-llm-provider.json'),
      JSON.stringify(llmResult.result, null, 2)
    );
    
    console.log();
    console.log('━'.repeat(70));
    console.log('💾 Full results saved to:');
    console.log('   - output/comparison-data-provider.json');
    console.log('   - output/comparison-llm-provider.json');
    console.log('━'.repeat(70));
    
    // Key differences analysis
    console.log();
    console.log('═'.repeat(70));
    console.log('🔍 KEY DIFFERENCES');
    console.log('═'.repeat(70));
    
    // Check for coordinate coverage
    let dataWithCoords = 0, llmWithCoords = 0;
    let dataTotal = 0, llmTotal = 0;
    
    for (const day of dataSummary.dayBreakdown) {
      for (const slot of day.slots) {
        dataTotal++;
        if (slot.hasCoordinates) dataWithCoords++;
      }
    }
    for (const day of llmSummary.dayBreakdown) {
      for (const slot of day.slots) {
        llmTotal++;
        if (slot.hasCoordinates) llmWithCoords++;
      }
    }
    
    console.log(`
  📍 Coordinate Coverage:
     DATA: ${dataWithCoords}/${dataTotal} slots have coordinates (${Math.round(dataWithCoords/dataTotal*100)}%)
     LLM:  ${llmWithCoords}/${llmTotal} slots have coordinates (${Math.round(llmWithCoords/llmTotal*100)}%)
  
  ⚡ Speed:
     DATA is ${Math.round(llmResult.duration / dataResult.duration)}x faster than LLM
  
  🎯 Recommendations:
     - Use DATA for: Fast generation, verified POI data, consistent results
     - Use LLM for: Personalized trips, natural language preferences, creative suggestions
`);
    
  } catch (error) {
    console.error('❌ Error:', error);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
