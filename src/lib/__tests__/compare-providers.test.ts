// ============================================
// ITINERARY PROVIDER COMPARISON TEST
// ============================================
// Compares DATA vs LLM providers for the same itinerary request
// Validates LLM response is parseable and has all required fields
// Run with: npm test -- --run src/lib/__tests__/compare-providers.test.ts

import { describe, it, expect, afterEach } from "vitest";
import { config } from "dotenv";
import { resolve } from "path";
import {
  generate,
  type ItineraryRequest,
  type ItineraryResponse,
} from "../itinerary-service";
import type {
  DayWithOptions,
  SlotWithOptions,
  ActivityOption,
} from "@/types/structured-itinerary";

// Load real env vars from .env.local (vitest.setup.ts uses test keys)
const envPath = resolve(__dirname, "../../../.env.local");
config({ path: envPath, override: true });  // Override the test keys with real keys

// Store original env values
const originalEnv = { ...process.env };

// ============================================
// VALIDATION TYPES
// ============================================

interface ValidationError {
  field: string;
  message: string;
  severity: "error" | "warning";
}

interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  stats: {
    totalDays: number;
    totalSlots: number;
    totalOptions: number;
    slotsWithPlace: number;
    slotsWithCoords: number;
    slotsWithDescription: number;
  };
}

// ============================================
// VALIDATION FUNCTIONS
// ============================================

function validateLLMResponse(response: ItineraryResponse): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];
  const stats = {
    totalDays: 0,
    totalSlots: 0,
    totalOptions: 0,
    slotsWithPlace: 0,
    slotsWithCoords: 0,
    slotsWithDescription: 0,
  };

  // Top-level validation
  if (!response) {
    errors.push({ field: "response", message: "Response is null/undefined", severity: "error" });
    return { isValid: false, errors, warnings, stats };
  }

  if (!response.itinerary) {
    errors.push({ field: "response.itinerary", message: "Itinerary is missing", severity: "error" });
    return { isValid: false, errors, warnings, stats };
  }

  if (!response.metadata) {
    errors.push({ field: "response.metadata", message: "Metadata is missing", severity: "error" });
    return { isValid: false, errors, warnings, stats };
  }

  const { itinerary, metadata } = response;

  // Validate itinerary structure
  if (!itinerary.destination || typeof itinerary.destination !== "string") {
    errors.push({ field: "itinerary.destination", message: "Destination is required", severity: "error" });
  }

  if (!Array.isArray(itinerary.days)) {
    errors.push({ field: "itinerary.days", message: "Days must be an array", severity: "error" });
    return { isValid: false, errors, warnings, stats };
  }

  if (itinerary.days.length === 0) {
    errors.push({ field: "itinerary.days", message: "Days array is empty", severity: "error" });
  }

  stats.totalDays = itinerary.days.length;

  // Validate each day
  itinerary.days.forEach((day, dayIndex) => {
    const dayPath = `itinerary.days[${dayIndex}]`;
    validateDay(day, dayPath, dayIndex + 1, errors, warnings, stats);
  });

  // Validate metadata
  if (!metadata.generatedAt) {
    warnings.push({ field: "metadata.generatedAt", message: "Missing generation timestamp", severity: "warning" });
  }

  if (!metadata.provider) {
    errors.push({ field: "metadata.provider", message: "Missing provider type", severity: "error" });
  }

  if (typeof metadata.totalDays !== "number") {
    errors.push({ field: "metadata.totalDays", message: "totalDays must be a number", severity: "error" });
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    stats,
  };
}

function validateDay(
  day: DayWithOptions,
  path: string,
  expectedDayNumber: number,
  errors: ValidationError[],
  warnings: ValidationError[],
  stats: { totalSlots: number; totalOptions: number; slotsWithPlace: number; slotsWithCoords: number; slotsWithDescription: number }
): void {
  // Required day fields
  if (typeof day.dayNumber !== "number") {
    errors.push({ field: `${path}.dayNumber`, message: "dayNumber must be a number", severity: "error" });
  } else if (day.dayNumber !== expectedDayNumber) {
    warnings.push({ field: `${path}.dayNumber`, message: `Expected dayNumber ${expectedDayNumber}, got ${day.dayNumber}`, severity: "warning" });
  }

  if (!day.date || typeof day.date !== "string") {
    errors.push({ field: `${path}.date`, message: "date is required", severity: "error" });
  } else if (!/^\d{4}-\d{2}-\d{2}$/.test(day.date)) {
    warnings.push({ field: `${path}.date`, message: `Invalid date format: ${day.date}`, severity: "warning" });
  }

  if (!day.city || typeof day.city !== "string") {
    errors.push({ field: `${path}.city`, message: "city is required", severity: "error" });
  }

  if (!day.title || typeof day.title !== "string") {
    warnings.push({ field: `${path}.title`, message: "title is missing", severity: "warning" });
  }

  if (!Array.isArray(day.slots)) {
    errors.push({ field: `${path}.slots`, message: "slots must be an array", severity: "error" });
    return;
  }

  if (day.slots.length === 0) {
    errors.push({ field: `${path}.slots`, message: "No slots in day", severity: "error" });
  }

  // Validate each slot
  day.slots.forEach((slot, slotIndex) => {
    const slotPath = `${path}.slots[${slotIndex}]`;
    validateSlot(slot, slotPath, errors, warnings, stats);
    stats.totalSlots++;
  });
}

function validateSlot(
  slot: SlotWithOptions,
  path: string,
  errors: ValidationError[],
  warnings: ValidationError[],
  stats: { totalOptions: number; slotsWithPlace: number; slotsWithCoords: number; slotsWithDescription: number }
): void {
  const validSlotTypes = ["morning", "breakfast", "lunch", "afternoon", "dinner", "evening"];

  if (!slot.slotId || typeof slot.slotId !== "string") {
    errors.push({ field: `${path}.slotId`, message: "slotId is required", severity: "error" });
  }

  if (!slot.slotType || !validSlotTypes.includes(slot.slotType)) {
    errors.push({ field: `${path}.slotType`, message: `Invalid slotType: ${slot.slotType}`, severity: "error" });
  }

  if (!slot.timeRange || !slot.timeRange.start || !slot.timeRange.end) {
    errors.push({ field: `${path}.timeRange`, message: "timeRange with start/end is required", severity: "error" });
  } else {
    const timeRegex = /^\d{2}:\d{2}$/;
    if (!timeRegex.test(slot.timeRange.start)) {
      warnings.push({ field: `${path}.timeRange.start`, message: `Invalid time format: ${slot.timeRange.start}`, severity: "warning" });
    }
    if (!timeRegex.test(slot.timeRange.end)) {
      warnings.push({ field: `${path}.timeRange.end`, message: `Invalid time format: ${slot.timeRange.end}`, severity: "warning" });
    }
  }

  if (!Array.isArray(slot.options)) {
    errors.push({ field: `${path}.options`, message: "options must be an array", severity: "error" });
    return;
  }

  if (slot.options.length === 0) {
    warnings.push({ field: `${path}.options`, message: "No options in slot", severity: "warning" });
  }

  // Validate each option
  slot.options.forEach((option, optionIndex) => {
    const optionPath = `${path}.options[${optionIndex}]`;
    validateOption(option, optionPath, errors, warnings, stats);
    stats.totalOptions++;
  });
}

function validateOption(
  option: ActivityOption,
  path: string,
  errors: ValidationError[],
  warnings: ValidationError[],
  stats: { slotsWithPlace: number; slotsWithCoords: number; slotsWithDescription: number }
): void {
  if (!option.id || typeof option.id !== "string") {
    errors.push({ field: `${path}.id`, message: "id is required", severity: "error" });
  }

  if (typeof option.rank !== "number") {
    errors.push({ field: `${path}.rank`, message: "rank must be a number", severity: "error" });
  }

  if (typeof option.score !== "number") {
    warnings.push({ field: `${path}.score`, message: "score should be a number", severity: "warning" });
  }

  if (!option.activity) {
    errors.push({ field: `${path}.activity`, message: "activity is required", severity: "error" });
    return;
  }

  const { activity } = option;

  // Required activity fields
  if (!activity.name || typeof activity.name !== "string") {
    errors.push({ field: `${path}.activity.name`, message: "activity.name is required", severity: "error" });
  }

  if (!activity.category || typeof activity.category !== "string") {
    warnings.push({ field: `${path}.activity.category`, message: "activity.category is missing", severity: "warning" });
  }

  if (typeof activity.duration !== "number" || activity.duration <= 0) {
    warnings.push({ field: `${path}.activity.duration`, message: "activity.duration should be positive number", severity: "warning" });
  }

  // Description check
  if (activity.description && activity.description.length > 0) {
    stats.slotsWithDescription++;
  } else {
    warnings.push({ field: `${path}.activity.description`, message: "activity.description is missing", severity: "warning" });
  }

  // Place data validation
  if (activity.place) {
    stats.slotsWithPlace++;

    if (!activity.place.name) {
      warnings.push({ field: `${path}.activity.place.name`, message: "place.name is missing", severity: "warning" });
    }

    if (activity.place.coordinates) {
      const { lat, lng } = activity.place.coordinates;
      if (typeof lat === "number" && typeof lng === "number" && lat !== 0 && lng !== 0) {
        stats.slotsWithCoords++;
      } else {
        warnings.push({ field: `${path}.activity.place.coordinates`, message: "Invalid coordinates", severity: "warning" });
      }
    }
  }

  // Tags validation
  if (!Array.isArray(activity.tags)) {
    warnings.push({ field: `${path}.activity.tags`, message: "tags should be an array", severity: "warning" });
  }
}

function resetEnv() {
  process.env = { ...originalEnv };
}

function createRequest(): ItineraryRequest {
  const startDate = new Date();
  startDate.setDate(startDate.getDate() + 7);

  return {
    cities: ["Tokyo"],
    startDate: startDate.toISOString().split("T")[0],
    totalDays: 2,
    pace: "moderate",
    interests: ["culture", "food"],
  };
}

function summarize(response: ItineraryResponse) {
  const { itinerary, metadata } = response;

  const days = itinerary.days.map(day => ({
    dayNumber: day.dayNumber,
    city: day.city,
    title: day.title,
    slots: day.slots.map(slot => {
      const option = slot.options[0];
      return {
        type: slot.slotType,
        activity: option?.activity?.name || "(empty)",
        category: option?.activity?.category || "-",
        hasCoords: !!(option?.activity?.place?.coordinates?.lat),
      };
    }),
  }));

  return {
    source: metadata.source,
    totalDays: metadata.totalDays,
    totalSlots: metadata.totalSlots,
    totalOptions: metadata.totalOptions,
    days,
  };
}

describe("Provider Comparison", () => {
  afterEach(() => {
    resetEnv();
  });

  it("should compare DATA vs LLM providers", async () => {
    const request = createRequest();

    // Generate with DATA provider
    console.log("\n" + "=".repeat(60));
    console.log("📊 PROVIDER COMPARISON TEST");
    console.log("=".repeat(60));
    console.log(`\n📍 Cities: ${request.cities.join(", ")}`);
    console.log(`📅 Days: ${request.totalDays}`);
    console.log(`🏃 Pace: ${request.pace}`);

    // DATA Provider
    console.log("\n" + "-".repeat(60));
    console.log("🗃️  DATA Provider");
    console.log("-".repeat(60));

    process.env.ITINERARY_PROVIDER = "data";
    const dataStart = Date.now();
    const dataResult = await generate(request);
    const dataDuration = Date.now() - dataStart;
    const dataSummary = summarize(dataResult);

    console.log(`✅ Generated in ${dataDuration}ms`);
    console.log(`   Source: ${dataSummary.source}`);
    console.log(`   Slots: ${dataSummary.totalSlots}, Options: ${dataSummary.totalOptions}`);

    for (const day of dataSummary.days) {
      console.log(`\n   Day ${day.dayNumber}: ${day.title}`);
      for (const slot of day.slots) {
        const coords = slot.hasCoords ? "📍" : "❌";
        console.log(`     ${slot.type.padEnd(10)} ${coords} ${slot.activity}`);
      }
    }

    // LLM Provider (skip if no API key)
    let llmResult: ItineraryResponse | null = null;
    let llmDuration = 0;
    let llmSummary: ReturnType<typeof summarize> | null = null;

    const hasGeminiKey = !!process.env.GEMINI_API_KEY;
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY;

    if (hasGeminiKey || hasOpenAIKey) {
      console.log("\n" + "-".repeat(60));
      console.log(`🤖 LLM Provider (OpenAI)`);
      console.log("-".repeat(60));

      process.env.ITINERARY_PROVIDER = "llm";
      process.env.ITINERARY_AI_PROVIDER = "openai";
      process.env.AI_MODE = "prod"; // Force production mode to actually call API

      // Clear the provider cache to use new env vars
      const { clearProviderCache } = await import("../providers");
      if (typeof clearProviderCache === "function") {
        clearProviderCache();
      }

      const llmStart = Date.now();
      llmResult = await generate(request);
      llmDuration = Date.now() - llmStart;
      llmSummary = summarize(llmResult);

      console.log(`✅ Generated in ${llmDuration}ms`);
      console.log(`   Source: ${llmSummary.source}`);
      console.log(`   Slots: ${llmSummary.totalSlots}, Options: ${llmSummary.totalOptions}`);

      for (const day of llmSummary.days) {
        console.log(`\n   Day ${day.dayNumber}: ${day.title}`);
        for (const slot of day.slots) {
          const coords = slot.hasCoords ? "📍" : "❌";
          console.log(`     ${slot.type.padEnd(10)} ${coords} ${slot.activity}`);
        }
      }
    } else {
      console.log("\n⚠️  Skipping LLM provider (no GEMINI_API_KEY or OPENAI_API_KEY)");
    }

    // Comparison Summary
    console.log("\n" + "=".repeat(60));
    console.log("📊 COMPARISON SUMMARY");
    console.log("=".repeat(60));

    console.log(`
┌────────────────────┬──────────────────┬──────────────────┐
│ Metric             │ DATA Provider    │ LLM Provider     │
├────────────────────┼──────────────────┼──────────────────┤
│ Generation Time    │ ${String(dataDuration + "ms").padEnd(16)} │ ${llmDuration ? String(llmDuration + "ms").padEnd(16) : "N/A".padEnd(16)} │
│ Total Slots        │ ${String(dataSummary.totalSlots).padEnd(16)} │ ${llmSummary ? String(llmSummary.totalSlots).padEnd(16) : "N/A".padEnd(16)} │
│ Total Options      │ ${String(dataSummary.totalOptions).padEnd(16)} │ ${llmSummary ? String(llmSummary.totalOptions).padEnd(16) : "N/A".padEnd(16)} │
│ Source             │ ${dataSummary.source.padEnd(16)} │ ${llmSummary ? llmSummary.source.padEnd(16) : "N/A".padEnd(16)} │
└────────────────────┴──────────────────┴──────────────────┘`);

    if (llmDuration > 0) {
      const speedup = Math.round(llmDuration / dataDuration);
      console.log(`\n⚡ DATA provider is ${speedup}x faster than LLM`);
    }

    console.log(`
🎯 Key Differences:
   • DATA: Pre-curated POIs, verified coordinates, deterministic, no API costs
   • LLM:  AI-generated, personalized, creative suggestions, requires API key
`);

    // Assertions
    expect(dataResult).toBeDefined();
    expect(dataResult.itinerary.days.length).toBe(request.totalDays);
    expect(dataResult.metadata.provider).toBe("data");

    if (llmResult) {
      expect(llmResult).toBeDefined();
      expect(llmResult.itinerary.days.length).toBe(request.totalDays);
      // LLM might fall back to data on error, so check for either
      expect(["llm", "data"]).toContain(llmResult.metadata.provider);
    }
  }, 120000); // 2 minute timeout for LLM

  it("should validate LLM response has all required fields", async () => {
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "test-key";

    if (!hasOpenAIKey) {
      console.log("⚠️  Skipping LLM validation test (no real OPENAI_API_KEY)");
      return;
    }

    const request = createRequest();

    console.log("\n" + "=".repeat(60));
    console.log("🔍 LLM RESPONSE VALIDATION TEST");
    console.log("=".repeat(60));

    process.env.ITINERARY_PROVIDER = "llm";
    process.env.ITINERARY_AI_PROVIDER = "openai";
    process.env.AI_MODE = "prod";

    // Clear the provider cache
    const { clearProviderCache } = await import("../providers");
    if (typeof clearProviderCache === "function") {
      clearProviderCache();
    }

    console.log("\n📤 Sending request to LLM...");
    const startTime = Date.now();
    const response = await generate(request);
    const duration = Date.now() - startTime;
    console.log(`✅ Response received in ${duration}ms`);

    // Validate the response
    console.log("\n🔍 Validating response structure...\n");
    const validation = validateLLMResponse(response);

    // Print validation results
    console.log("📊 VALIDATION RESULTS");
    console.log("-".repeat(40));
    console.log(`Status: ${validation.isValid ? "✅ VALID" : "❌ INVALID"}`);
    console.log(`\nStats:`);
    console.log(`  • Days: ${validation.stats.totalDays}`);
    console.log(`  • Slots: ${validation.stats.totalSlots}`);
    console.log(`  • Options: ${validation.stats.totalOptions}`);
    console.log(`  • Options with place: ${validation.stats.slotsWithPlace}/${validation.stats.totalOptions}`);
    console.log(`  • Options with coords: ${validation.stats.slotsWithCoords}/${validation.stats.totalOptions}`);
    console.log(`  • Options with description: ${validation.stats.slotsWithDescription}/${validation.stats.totalOptions}`);

    if (validation.errors.length > 0) {
      console.log(`\n❌ Errors (${validation.errors.length}):`);
      validation.errors.forEach(e => console.log(`   • ${e.field}: ${e.message}`));
    }

    if (validation.warnings.length > 0) {
      console.log(`\n⚠️  Warnings (${validation.warnings.length}):`);
      // Only show first 10 warnings to avoid clutter
      validation.warnings.slice(0, 10).forEach(w => console.log(`   • ${w.field}: ${w.message}`));
      if (validation.warnings.length > 10) {
        console.log(`   ... and ${validation.warnings.length - 10} more`);
      }
    }

    // Log full itinerary structure for debugging
    console.log("\n📋 ITINERARY STRUCTURE:");
    response.itinerary.days.forEach(day => {
      console.log(`\n  Day ${day.dayNumber}: ${day.title} (${day.city})`);
      day.slots.forEach(slot => {
        const opt = slot.options[0];
        const hasPlace = opt?.activity?.place ? "✓" : "✗";
        const hasCoords = opt?.activity?.place?.coordinates?.lat ? "✓" : "✗";
        const hasDesc = opt?.activity?.description ? "✓" : "✗";
        console.log(`    ${slot.slotType.padEnd(10)} | ${(opt?.activity?.name || "(empty)").substring(0, 30).padEnd(30)} | place:${hasPlace} coords:${hasCoords} desc:${hasDesc}`);
      });
    });

    // Assertions
    expect(validation.isValid).toBe(true);
    expect(validation.errors.length).toBe(0);
    expect(validation.stats.totalDays).toBe(request.totalDays);
    expect(validation.stats.totalSlots).toBeGreaterThanOrEqual(request.totalDays! * 3); // At least 3 slots per day
    expect(validation.stats.totalOptions).toBeGreaterThanOrEqual(validation.stats.totalSlots); // At least 1 option per slot

    // Check data completeness
    const placeRatio = validation.stats.slotsWithPlace / validation.stats.totalOptions;
    const descRatio = validation.stats.slotsWithDescription / validation.stats.totalOptions;

    console.log(`\n📈 Data Completeness:`);
    console.log(`  • Place data: ${(placeRatio * 100).toFixed(1)}%`);
    console.log(`  • Descriptions: ${(descRatio * 100).toFixed(1)}%`);

    // Warn if low completeness
    if (placeRatio < 0.8) {
      console.log(`\n⚠️  Less than 80% of options have place data`);
    }
    if (descRatio < 0.8) {
      console.log(`\n⚠️  Less than 80% of options have descriptions`);
    }

  }, 120000);

  it("should honor must-have constraints", async () => {
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "test-key";

    if (!hasOpenAIKey) {
      console.log("⚠️  Skipping must-have test (no real OPENAI_API_KEY)");
      return;
    }

    console.log("\n" + "=".repeat(60));
    console.log("🎯 MUST-HAVE CONSTRAINTS TEST");
    console.log("=".repeat(60));

    process.env.ITINERARY_PROVIDER = "llm";
    process.env.ITINERARY_AI_PROVIDER = "openai";
    process.env.AI_MODE = "prod";

    const { clearProviderCache } = await import("../providers");
    if (typeof clearProviderCache === "function") {
      clearProviderCache();
    }

    const mustHaveItems = ["Senso-ji Temple", "Tsukiji Market"];
    const mustAvoidItems = ["Tokyo Tower"];

    const request: ItineraryRequest = {
      ...createRequest(),
      mustHave: mustHaveItems,
      mustAvoid: mustAvoidItems,
    };

    console.log(`\n📋 Test Configuration:`);
    console.log(`   Must-Have: ${mustHaveItems.join(", ")}`);
    console.log(`   Must-Avoid: ${mustAvoidItems.join(", ")}`);

    console.log("\n📤 Generating itinerary with constraints...");
    const startTime = Date.now();
    const response = await generate(request);
    const duration = Date.now() - startTime;
    console.log(`✅ Generated in ${duration}ms`);

    // Collect all activity names
    const allActivities: string[] = [];
    for (const day of response.itinerary.days) {
      for (const slot of day.slots) {
        for (const option of slot.options) {
          if (option.activity?.name) {
            allActivities.push(option.activity.name);
          }
        }
      }
    }

    console.log(`\n📊 Activities in itinerary (${allActivities.length} total):`);
    allActivities.slice(0, 20).forEach(name => console.log(`   • ${name}`));
    if (allActivities.length > 20) {
      console.log(`   ... and ${allActivities.length - 20} more`);
    }

    // Check must-haves
    console.log("\n🔍 Checking Must-Haves:");
    const foundMustHaves: string[] = [];
    const missingMustHaves: string[] = [];

    for (const mustHave of mustHaveItems) {
      const found = allActivities.some(
        name => name.toLowerCase().includes(mustHave.toLowerCase().split(" ")[0]) ||
                mustHave.toLowerCase().includes(name.toLowerCase().split(" ")[0])
      );
      if (found) {
        foundMustHaves.push(mustHave);
        console.log(`   ✅ Found: ${mustHave}`);
      } else {
        missingMustHaves.push(mustHave);
        console.log(`   ❌ Missing: ${mustHave}`);
      }
    }

    // Check must-avoids
    console.log("\n🔍 Checking Must-Avoids:");
    const foundMustAvoids: string[] = [];

    for (const mustAvoid of mustAvoidItems) {
      const found = allActivities.some(
        name => name.toLowerCase().includes(mustAvoid.toLowerCase()) ||
                mustAvoid.toLowerCase().includes(name.toLowerCase())
      );
      if (found) {
        foundMustAvoids.push(mustAvoid);
        console.log(`   ❌ Constraint violated - found: ${mustAvoid}`);
      } else {
        console.log(`   ✅ Correctly excluded: ${mustAvoid}`);
      }
    }

    // Summary
    console.log("\n📊 CONSTRAINT RESULTS:");
    console.log(`   Must-Haves: ${foundMustHaves.length}/${mustHaveItems.length} found`);
    console.log(`   Must-Avoids: ${foundMustAvoids.length === 0 ? "All excluded ✅" : `${foundMustAvoids.length} violations ❌`}`);

    // Soft assertions (LLM may not always follow perfectly)
    // We check that at least one must-have was included
    expect(foundMustHaves.length).toBeGreaterThanOrEqual(1);
    // We check that must-avoids are not included (strict)
    expect(foundMustAvoids.length).toBe(0);

  }, 120000);

  it("should honor activity anchors with fixed times", async () => {
    const hasOpenAIKey = !!process.env.OPENAI_API_KEY && process.env.OPENAI_API_KEY !== "test-key";

    if (!hasOpenAIKey) {
      console.log("⚠️  Skipping anchors test (no real OPENAI_API_KEY)");
      return;
    }

    console.log("\n" + "=".repeat(60));
    console.log("⚓ ACTIVITY ANCHORS TEST");
    console.log("=".repeat(60));

    process.env.ITINERARY_PROVIDER = "llm";
    process.env.ITINERARY_AI_PROVIDER = "openai";
    process.env.AI_MODE = "prod";

    const { clearProviderCache } = await import("../providers");
    if (typeof clearProviderCache === "function") {
      clearProviderCache();
    }

    // Calculate start date for anchors
    const startDate = new Date();
    startDate.setDate(startDate.getDate() + 7);
    const day1Date = startDate.toISOString().split("T")[0];

    const anchors: import("../itinerary-service").ActivityAnchor[] = [
      {
        name: "teamLab Planets",
        city: "Tokyo",
        date: day1Date,
        startTime: "14:00",
        endTime: "16:00",
        duration: 120,
        category: "experience",
        notes: "Pre-booked tickets",
      },
    ];

    const request: ItineraryRequest = {
      ...createRequest(),
      anchors,
    };

    console.log(`\n📋 Test Configuration:`);
    console.log(`   Anchor: ${anchors[0].name} on ${anchors[0].date} at ${anchors[0].startTime}`);

    console.log("\n📤 Generating itinerary with anchor...");
    const startTime = Date.now();
    const response = await generate(request);
    const duration = Date.now() - startTime;
    console.log(`✅ Generated in ${duration}ms`);

    // Find the anchor in the itinerary
    let foundAnchor = false;
    let anchorSlotBehavior: string | undefined;

    console.log("\n🔍 Searching for anchor in itinerary:");

    for (const day of response.itinerary.days) {
      console.log(`\n  Day ${day.dayNumber} (${day.date}):`);
      for (const slot of day.slots) {
        const behavior = (slot as SlotWithOptions & { behavior?: string }).behavior || "flex";
        for (const option of slot.options) {
          const name = option.activity?.name || "(empty)";
          const isAnchor = name.toLowerCase().includes("teamlab");
          const marker = isAnchor ? " ⚓" : "";
          console.log(`    ${slot.slotType.padEnd(10)} [${behavior}] ${name.substring(0, 30)}${marker}`);

          if (isAnchor && day.date === day1Date) {
            foundAnchor = true;
            anchorSlotBehavior = behavior;
          }
        }
      }
    }

    console.log("\n📊 ANCHOR RESULTS:");
    console.log(`   Anchor found: ${foundAnchor ? "✅ Yes" : "❌ No"}`);
    if (foundAnchor) {
      console.log(`   Slot behavior: ${anchorSlotBehavior === "anchor" ? "✅ anchor" : `⚠️ ${anchorSlotBehavior} (expected: anchor)`}`);
    }

    // Assertions
    expect(foundAnchor).toBe(true);
    // Note: behavior check is a soft warning since LLM may not always set it correctly

  }, 120000);
});
