#!/usr/bin/env node

/**
 * Itinerary Execution Simulator CLI
 *
 * Simulates a day of travel with random diversions to test the execution engine.
 *
 * Usage:
 *   npx tsx scripts/run-simulation.ts [options]
 *
 * Options:
 *   --city <name>       City for sample schedule (default: Tokyo)
 *   --runs <number>     Number of simulation runs (default: 1)
 *   --seed <number>     Random seed for reproducibility
 *   --weather <type>    Weather condition: sunny, cloudy, rainy, hot, cold
 *   --energy <0-1>      Traveler energy level (default: 1.0)
 *   --quiet             Suppress detailed logs
 *   --json              Output results as JSON
 */

// Note: This script uses dynamic imports to work with ESM modules
async function main() {
  const args = process.argv.slice(2);

  // Parse arguments
  const options = {
    city: 'Tokyo',
    runs: 1,
    seed: undefined as number | undefined,
    weather: undefined as 'sunny' | 'cloudy' | 'rainy' | 'hot' | 'cold' | undefined,
    energy: 1.0,
    quiet: false,
    json: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const nextArg = args[i + 1];

    switch (arg) {
      case '--city':
        options.city = nextArg;
        i++;
        break;
      case '--runs':
        options.runs = parseInt(nextArg, 10);
        i++;
        break;
      case '--seed':
        options.seed = parseInt(nextArg, 10);
        i++;
        break;
      case '--weather':
        options.weather = nextArg as typeof options.weather;
        i++;
        break;
      case '--energy':
        options.energy = parseFloat(nextArg);
        i++;
        break;
      case '--quiet':
        options.quiet = true;
        break;
      case '--json':
        options.json = true;
        break;
      case '--help':
      case '-h':
        console.log(`
Itinerary Execution Simulator

Simulates a day of travel with random diversions to test the execution engine.

Usage:
  npx tsx scripts/run-simulation.ts [options]

Options:
  --city <name>       City for sample schedule (default: Tokyo)
  --runs <number>     Number of simulation runs (default: 1)
  --seed <number>     Random seed for reproducibility
  --weather <type>    Weather condition: sunny, cloudy, rainy, hot, cold
  --energy <0-1>      Traveler energy level (default: 1.0)
  --quiet             Suppress detailed logs
  --json              Output results as JSON
  --help, -h          Show this help message

Examples:
  npx tsx scripts/run-simulation.ts
  npx tsx scripts/run-simulation.ts --weather rainy --energy 0.7
  npx tsx scripts/run-simulation.ts --runs 10 --quiet --json
  npx tsx scripts/run-simulation.ts --seed 12345 --city Kyoto
        `);
        process.exit(0);
    }
  }

  // Dynamic import the simulator
  const {
    ItinerarySimulator,
    generateSampleDay,
    runMultipleSimulations
  } = await import('../src/lib/execution/simulator');

  // Import helpers for display
  const { getSelectedActivity, getSlotDuration } = await import('../src/lib/execution/execution-helpers');

  // Generate sample day
  const day = generateSampleDay(options.city);

  // Calculate totals for display
  const totalActivityTime = day.slots.reduce((sum, slot) => sum + getSlotDuration(slot), 0);
  const totalCommuteTime = day.slots.reduce(
    (sum, slot) => sum + (slot.commuteFromPrevious?.duration || 0),
    0
  );

  if (!options.quiet && !options.json) {
    console.log('\n📅 SAMPLE ITINERARY');
    console.log('─'.repeat(60));
    console.log(`City: ${day.city}`);
    console.log(`Date: ${day.date}`);
    console.log(`Activities: ${day.slots.length}`);
    console.log(`Total Time: ${totalActivityTime + totalCommuteTime} min`);
    console.log('');
    console.log('Schedule:');
    for (const slot of day.slots) {
      const activity = getSelectedActivity(slot);
      const activityName = activity?.activity.name || 'Unknown';
      console.log(`  ${slot.timeRange.start}-${slot.timeRange.end}: ${activityName}`);
      if (slot.commuteFromPrevious) {
        console.log(`    └─ 🚶 ${slot.commuteFromPrevious.duration} min ${slot.commuteFromPrevious.method}`);
      }
    }
    console.log('─'.repeat(60));
  }

  // Get starting location from first activity
  const firstActivity = getSelectedActivity(day.slots[0]);
  const startLocation = firstActivity?.activity.place?.coordinates || { lat: 35.6762, lng: 139.6503 };

  const simulatorConfig = {
    seed: options.seed,
    weatherCondition: options.weather,
    travelerEnergy: options.energy,
    verbose: !options.quiet && !options.json,
    startLocation,
  };

  if (options.runs === 1) {
    // Single run
    const simulator = new ItinerarySimulator(simulatorConfig);
    const result = await simulator.simulate(day);

    if (options.json) {
      console.log(JSON.stringify({
        config: options,
        day: {
          city: day.city,
          date: day.date,
          activities: day.slots.length,
        },
        summary: result.summary,
        diversions: result.diversions.map(d => ({
          type: d.type,
          activity: d.activityName,
          impact: d.impactMinutes,
          description: d.description,
        })),
        timeline: result.timeline,
      }, null, 2));
    }
  } else {
    // Multiple runs
    if (!options.quiet && !options.json) {
      console.log(`\n🔄 Running ${options.runs} simulations...\n`);
    }

    const { results, aggregated } = await runMultipleSimulations(
      day,
      options.runs,
      simulatorConfig
    );

    if (options.json) {
      console.log(JSON.stringify({
        config: options,
        day: {
          city: day.city,
          date: day.date,
          activities: day.slots.length,
        },
        runs: options.runs,
        aggregated,
      }, null, 2));
    } else {
      console.log('\n📊 AGGREGATED RESULTS');
      console.log('─'.repeat(60));
      console.log(`Runs: ${options.runs}`);
      console.log(`Avg Duration: ${aggregated.avgDuration} min`);
      console.log(`Avg Diversions: ${aggregated.avgDiversions} per run`);
      console.log(`Avg Delay: ${aggregated.avgDelay} min`);
      console.log(`Completion Rate: ${aggregated.completionRate}%`);
      console.log('');
      console.log('Most Common Diversions:');
      for (const d of aggregated.mostCommonDiversions) {
        console.log(`  ${d.type}: ${d.count} times`);
      }
      console.log('─'.repeat(60));
    }
  }
}

main().catch(console.error);
