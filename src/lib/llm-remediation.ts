/**
 * LLM-Powered Itinerary Remediation
 *
 * Uses LLM (Ollama first, then fallback to other providers) for:
 * 1. Semantic duplicate detection ("Tokyo Tower" vs "Tokyo Tower Observation Deck")
 * 2. Activity categorization and validation
 * 3. Meal venue suitability assessment
 * 4. Duration inference for activities without duration
 * 5. Nearby replacement suggestions for flagged meals
 * 6. Incomplete name normalization
 *
 * Design principle: Batch similar operations to minimize LLM calls
 */

import type {
  StructuredItineraryData,
  SlotWithOptions,
  ActivityOption,
} from "@/types/structured-itinerary";
import type { RemediationChange } from "./itinerary-remediation";

// ============================================
// TYPES
// ============================================

export interface LLMRemediationResult {
  itinerary: StructuredItineraryData;
  changes: RemediationChange[];
  llmCalls: number;
  processingTimeMs: number;
}

export interface LLMRemediationOptions {
  /** Enable semantic duplicate detection */
  detectSemanticDuplicates?: boolean;
  /** Enable meal suitability validation */
  validateMealSuitability?: boolean;
  /** Enable duration inference for missing durations */
  inferMissingDurations?: boolean;
  /** Enable activity name normalization */
  normalizeActivityNames?: boolean;
  /** Enable category validation/correction */
  validateCategories?: boolean;
  /** LLM provider preference order */
  providerOrder?: ("ollama" | "gemini" | "openai")[];
  /** Ollama model to use */
  ollamaModel?: string;
  /** Maximum concurrent LLM calls */
  maxConcurrency?: number;
  /** Timeout for each LLM call in ms */
  timeoutMs?: number;
}

const DEFAULT_OPTIONS: LLMRemediationOptions = {
  detectSemanticDuplicates: true,
  validateMealSuitability: true,
  inferMissingDurations: true,
  normalizeActivityNames: false, // Off by default - can be slow
  validateCategories: true,
  providerOrder: ["ollama", "gemini", "openai"],
  ollamaModel: "llama3.2",
  maxConcurrency: 3,
  timeoutMs: 10000,
};

interface LLMProvider {
  name: string;
  call: (prompt: string, options?: { json?: boolean }) => Promise<string>;
  isAvailable: () => Promise<boolean>;
}

// ============================================
// LLM PROVIDER ABSTRACTION
// ============================================

async function createOllamaProvider(model: string): Promise<LLMProvider> {
  const baseUrl = process.env.OLLAMA_BASE_URL || "http://localhost:11434";

  return {
    name: "ollama",
    isAvailable: async () => {
      try {
        const response = await fetch(`${baseUrl}/api/tags`, {
          method: "GET",
          signal: AbortSignal.timeout(2000),
        });
        return response.ok;
      } catch {
        return false;
      }
    },
    call: async (prompt: string, options?: { json?: boolean }) => {
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          format: options?.json ? "json" : undefined,
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama error: ${response.status}`);
      }

      const data = await response.json();
      return data.response;
    },
  };
}

async function createGeminiProvider(): Promise<LLMProvider> {
  const apiKey = process.env.GOOGLE_GEMINI_API_KEY;

  return {
    name: "gemini",
    isAvailable: async () => !!apiKey,
    call: async (prompt: string, options?: { json?: boolean }) => {
      if (!apiKey) throw new Error("Gemini API key not configured");

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: options?.json
              ? { responseMimeType: "application/json" }
              : undefined,
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Gemini error: ${response.status}`);
      }

      const data = await response.json();
      return data.candidates?.[0]?.content?.parts?.[0]?.text || "";
    },
  };
}

async function getAvailableProvider(
  options: LLMRemediationOptions
): Promise<LLMProvider | null> {
  const providerOrder = options.providerOrder || DEFAULT_OPTIONS.providerOrder!;

  for (const providerName of providerOrder) {
    let provider: LLMProvider;

    switch (providerName) {
      case "ollama":
        provider = await createOllamaProvider(
          options.ollamaModel || DEFAULT_OPTIONS.ollamaModel!
        );
        break;
      case "gemini":
        provider = await createGeminiProvider();
        break;
      default:
        continue;
    }

    if (await provider.isAvailable()) {
      console.log(`[llm-remediation] Using provider: ${provider.name}`);
      return provider;
    }
  }

  return null;
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

function deepClone<T>(obj: T): T {
  return JSON.parse(JSON.stringify(obj));
}

function getActivity(slot: SlotWithOptions): ActivityOption | null {
  if (!slot.options || slot.options.length === 0) return null;
  // Respect selectedOptionId if set
  const selectedId = slot.selectedOptionId;
  if (selectedId) {
    const found = slot.options.find((o: ActivityOption) => o.id === selectedId);
    if (found) return found;
  }
  return slot.options[0];
}

// ============================================
// SEMANTIC DUPLICATE DETECTION
// ============================================

interface DuplicateCandidate {
  name1: string;
  name2: string;
  day1: number;
  day2: number;
  slotId1: string;
  slotId2: string;
}

function findPotentialDuplicatePairs(
  itinerary: StructuredItineraryData
): DuplicateCandidate[] {
  const candidates: DuplicateCandidate[] = [];
  const activities: Array<{
    name: string;
    day: number;
    slotId: string;
    placeId?: string;
  }> = [];

  // Collect all activities
  for (const day of itinerary.days) {
    for (const slot of day.slots) {
      const activity = getActivity(slot);
      if (activity?.activity?.name) {
        activities.push({
          name: activity.activity.name,
          day: day.dayNumber,
          slotId: slot.slotId,
          placeId: activity.activity.place?.googlePlaceId,
        });
      }
    }
  }

  // Find pairs that might be duplicates (fuzzy matching)
  for (let i = 0; i < activities.length; i++) {
    for (let j = i + 1; j < activities.length; j++) {
      const a = activities[i];
      const b = activities[j];

      // Skip if exact same placeId (already caught by algorithmic check)
      if (a.placeId && b.placeId && a.placeId === b.placeId) continue;

      // Check for potential semantic similarity
      const name1 = a.name.toLowerCase();
      const name2 = b.name.toLowerCase();

      // One contains the other (e.g., "Senso-ji" and "Senso-ji Temple")
      if (name1.includes(name2) || name2.includes(name1)) {
        candidates.push({
          name1: a.name,
          name2: b.name,
          day1: a.day,
          day2: b.day,
          slotId1: a.slotId,
          slotId2: b.slotId,
        });
        continue;
      }

      // Similar word overlap (e.g., "Tokyo Tower" and "Tokyo Tower Observation Deck")
      const words1 = new Set(name1.split(/\s+/));
      const words2 = new Set(name2.split(/\s+/));
      const intersection = [...words1].filter((w) => words2.has(w));

      if (intersection.length >= 2 || (intersection.length === 1 && words1.size <= 2)) {
        candidates.push({
          name1: a.name,
          name2: b.name,
          day1: a.day,
          day2: b.day,
          slotId1: a.slotId,
          slotId2: b.slotId,
        });
      }
    }
  }

  return candidates;
}

async function detectSemanticDuplicates(
  candidates: DuplicateCandidate[],
  provider: LLMProvider
): Promise<Array<{ slotIdToRemove: string; reason: string }>> {
  if (candidates.length === 0) return [];

  const prompt = `You are a travel itinerary validator. Determine if these activity pairs are duplicates (same place/attraction).

Activity pairs to check:
${candidates.map((c, i) => `${i + 1}. "${c.name1}" (Day ${c.day1}) vs "${c.name2}" (Day ${c.day2})`).join("\n")}

For each pair, respond with JSON array of objects:
[
  { "pairIndex": 1, "isDuplicate": true/false, "confidence": 0.0-1.0, "reason": "explanation" }
]

Only mark as duplicate if they refer to the SAME physical location/attraction.
"Tokyo Tower" and "Tokyo Tower Observation Deck" = DUPLICATE (same place)
"Senso-ji Temple" and "Senso-ji" = DUPLICATE (same place)
"Shibuya Crossing" and "Shibuya Shopping" = NOT DUPLICATE (different activities)
"Ramen Ichiran Shibuya" and "Ramen Ichiran Shinjuku" = NOT DUPLICATE (different locations)`;

  try {
    const response = await provider.call(prompt, { json: true });
    const results = JSON.parse(response);

    const duplicatesToRemove: Array<{ slotIdToRemove: string; reason: string }> = [];

    for (const result of results) {
      if (result.isDuplicate && result.confidence >= 0.7) {
        const candidate = candidates[result.pairIndex - 1];
        if (candidate) {
          // Remove the one on the later day
          const slotIdToRemove =
            candidate.day2 > candidate.day1 ? candidate.slotId2 : candidate.slotId1;
          duplicatesToRemove.push({
            slotIdToRemove,
            reason: `Semantic duplicate of "${candidate.day2 > candidate.day1 ? candidate.name1 : candidate.name2}" - ${result.reason}`,
          });
        }
      }
    }

    return duplicatesToRemove;
  } catch (error) {
    console.error("[llm-remediation] Semantic duplicate detection failed:", error);
    return [];
  }
}

// ============================================
// MEAL SUITABILITY VALIDATION
// ============================================

interface MealSlotInfo {
  slotId: string;
  slotType: string;
  activityName: string;
  category?: string;
  tags?: string[];
}

async function validateMealSuitability(
  mealSlots: MealSlotInfo[],
  provider: LLMProvider
): Promise<Array<{ slotId: string; issue: string; suggestion: string }>> {
  if (mealSlots.length === 0) return [];

  const prompt = `You are a travel meal planning expert. Validate if these restaurants/venues are suitable for their assigned meal slots.

Meals to validate:
${mealSlots.map((m, i) => `${i + 1}. ${m.slotType.toUpperCase()}: "${m.activityName}" (category: ${m.category || "unknown"}, tags: ${m.tags?.join(", ") || "none"})`).join("\n")}

For each, respond with JSON array:
[
  { "index": 1, "isSuitable": true/false, "issue": "problem if not suitable", "suggestion": "what to do" }
]

Consider:
- Izakayas/bars are NOT suitable for breakfast
- Breakfast cafes may not be open for dinner
- Fine dining is usually dinner-only
- Ramen shops are typically lunch/late-night, not breakfast
- Cafes are good for breakfast/brunch`;

  try {
    const response = await provider.call(prompt, { json: true });
    const results = JSON.parse(response);

    const issues: Array<{ slotId: string; issue: string; suggestion: string }> = [];

    for (const result of results) {
      if (!result.isSuitable) {
        const slot = mealSlots[result.index - 1];
        if (slot) {
          issues.push({
            slotId: slot.slotId,
            issue: result.issue,
            suggestion: result.suggestion,
          });
        }
      }
    }

    return issues;
  } catch (error) {
    console.error("[llm-remediation] Meal suitability validation failed:", error);
    return [];
  }
}

// ============================================
// DURATION INFERENCE
// ============================================

interface ActivityForDuration {
  slotId: string;
  name: string;
  category?: string;
  slotType?: string;
}

async function inferMissingDurations(
  activities: ActivityForDuration[],
  provider: LLMProvider
): Promise<Map<string, number>> {
  if (activities.length === 0) return new Map();

  const prompt = `You are a travel planning expert. Estimate reasonable durations (in minutes) for these activities.

Activities needing duration estimates:
${activities.map((a, i) => `${i + 1}. "${a.name}" (category: ${a.category || "unknown"}, slot type: ${a.slotType || "activity"})`).join("\n")}

Respond with JSON array:
[
  { "index": 1, "durationMinutes": 90, "reasoning": "brief explanation" }
]

Guidelines:
- Major temples/shrines: 60-90 min
- Small shrines: 20-30 min
- Museums: 90-180 min
- Observation decks: 45-60 min
- Parks/gardens: 60-120 min
- Restaurants/cafes: 45-90 min
- Shopping districts: 60-180 min
- Photo spots: 15-30 min`;

  try {
    const response = await provider.call(prompt, { json: true });
    const results = JSON.parse(response);

    const durations = new Map<string, number>();

    for (const result of results) {
      const activity = activities[result.index - 1];
      if (activity && result.durationMinutes > 0) {
        durations.set(activity.slotId, result.durationMinutes);
      }
    }

    return durations;
  } catch (error) {
    console.error("[llm-remediation] Duration inference failed:", error);
    return new Map();
  }
}

// ============================================
// CATEGORY VALIDATION
// ============================================

interface ActivityForCategory {
  slotId: string;
  name: string;
  currentCategory?: string;
  slotType?: string;
}

async function validateAndFixCategories(
  activities: ActivityForCategory[],
  provider: LLMProvider
): Promise<Map<string, string>> {
  if (activities.length === 0) return new Map();

  const prompt = `You are a travel activity categorization expert. Validate and correct the categories for these activities.

Activities to categorize:
${activities.map((a, i) => `${i + 1}. "${a.name}" - current category: "${a.currentCategory || "none"}" (slot type: ${a.slotType || "unknown"})`).join("\n")}

Valid categories: temple, shrine, museum, park, garden, observation, landmark, shopping, restaurant, cafe, bar, entertainment, transport, accommodation, beach, nature, cultural, nightlife, market

Respond with JSON array:
[
  { "index": 1, "correctCategory": "temple", "needsChange": true/false }
]

Only set needsChange=true if the current category is wrong or missing.`;

  try {
    const response = await provider.call(prompt, { json: true });
    const results = JSON.parse(response);

    const corrections = new Map<string, string>();

    for (const result of results) {
      if (result.needsChange) {
        const activity = activities[result.index - 1];
        if (activity) {
          corrections.set(activity.slotId, result.correctCategory);
        }
      }
    }

    return corrections;
  } catch (error) {
    console.error("[llm-remediation] Category validation failed:", error);
    return new Map();
  }
}

// ============================================
// MAIN LLM REMEDIATION FUNCTION
// ============================================

export async function remediateWithLLM(
  itinerary: StructuredItineraryData,
  options: LLMRemediationOptions = {}
): Promise<LLMRemediationResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const startTime = Date.now();
  let llmCalls = 0;

  const fixed = deepClone(itinerary);
  const changes: RemediationChange[] = [];

  // Get available LLM provider
  const provider = await getAvailableProvider(opts);

  if (!provider) {
    console.warn("[llm-remediation] No LLM provider available, skipping LLM remediation");
    return {
      itinerary: fixed,
      changes: [],
      llmCalls: 0,
      processingTimeMs: Date.now() - startTime,
    };
  }

  console.log(`[llm-remediation] Starting LLM remediation with ${provider.name}...`);

  // 1. Semantic Duplicate Detection
  if (opts.detectSemanticDuplicates) {
    const candidates = findPotentialDuplicatePairs(fixed);

    if (candidates.length > 0) {
      console.log(`[llm-remediation] Checking ${candidates.length} potential duplicate pairs...`);
      llmCalls++;

      const duplicates = await detectSemanticDuplicates(candidates, provider);

      for (const dup of duplicates) {
        // Remove the duplicate slot
        for (const day of fixed.days) {
          const slotIndex = day.slots.findIndex((s) => s.slotId === dup.slotIdToRemove);
          if (slotIndex !== -1) {
            day.slots.splice(slotIndex, 1);
            changes.push({
              type: "REMOVED_SEMANTIC_DUPLICATE",
              day: day.dayNumber,
              slot: dup.slotIdToRemove,
              reason: dup.reason,
            });
            break;
          }
        }
      }
    }
  }

  // 2. Meal Suitability Validation
  if (opts.validateMealSuitability) {
    const mealSlots: MealSlotInfo[] = [];

    for (const day of fixed.days) {
      for (const slot of day.slots) {
        const slotType = slot.slotType?.toLowerCase() || "";
        if (["breakfast", "lunch", "dinner"].includes(slotType)) {
          const activity = getActivity(slot);
          if (activity?.activity?.name) {
            mealSlots.push({
              slotId: slot.slotId,
              slotType,
              activityName: activity.activity.name,
              category: activity.activity.category,
              tags: activity.activity.tags,
            });
          }
        }
      }
    }

    if (mealSlots.length > 0) {
      console.log(`[llm-remediation] Validating ${mealSlots.length} meal slots...`);
      llmCalls++;

      const issues = await validateMealSuitability(mealSlots, provider);

      for (const issue of issues) {
        // Flag the slot for replacement
        for (const day of fixed.days) {
          const slot = day.slots.find((s) => s.slotId === issue.slotId);
          if (slot) {
            (slot as any).metadata = {
              ...((slot as any).metadata || {}),
              mealSuitabilityIssue: issue.issue,
              replacementSuggestion: issue.suggestion,
              needsReplacement: true,
            };
            changes.push({
              type: "FLAGGED_UNSUITABLE_MEAL",
              day: day.dayNumber,
              slot: issue.slotId,
              reason: `${issue.issue} - ${issue.suggestion}`,
            });
            break;
          }
        }
      }
    }
  }

  // 3. Duration Inference
  if (opts.inferMissingDurations) {
    const activitiesNeedingDuration: ActivityForDuration[] = [];

    for (const day of fixed.days) {
      for (const slot of day.slots) {
        const activity = getActivity(slot);
        if (activity?.activity?.name && !activity.activity.duration) {
          activitiesNeedingDuration.push({
            slotId: slot.slotId,
            name: activity.activity.name,
            category: activity.activity.category,
            slotType: slot.slotType,
          });
        }
      }
    }

    if (activitiesNeedingDuration.length > 0) {
      console.log(
        `[llm-remediation] Inferring durations for ${activitiesNeedingDuration.length} activities...`
      );
      llmCalls++;

      const durations = await inferMissingDurations(activitiesNeedingDuration, provider);

      for (const day of fixed.days) {
        for (const slot of day.slots) {
          const duration = durations.get(slot.slotId);
          if (duration) {
            const activity = getActivity(slot);
            if (activity?.activity) {
              activity.activity.duration = duration;
              changes.push({
                type: "INFERRED_DURATION",
                day: day.dayNumber,
                slot: slot.slotId,
                reason: `Set duration to ${duration} minutes`,
              });
            }
          }
        }
      }
    }
  }

  // 4. Category Validation
  if (opts.validateCategories) {
    const activitiesNeedingCategory: ActivityForCategory[] = [];

    for (const day of fixed.days) {
      for (const slot of day.slots) {
        const activity = getActivity(slot);
        if (activity?.activity?.name) {
          activitiesNeedingCategory.push({
            slotId: slot.slotId,
            name: activity.activity.name,
            currentCategory: activity.activity.category,
            slotType: slot.slotType,
          });
        }
      }
    }

    if (activitiesNeedingCategory.length > 0) {
      console.log(
        `[llm-remediation] Validating categories for ${activitiesNeedingCategory.length} activities...`
      );
      llmCalls++;

      const corrections = await validateAndFixCategories(activitiesNeedingCategory, provider);

      for (const day of fixed.days) {
        for (const slot of day.slots) {
          const newCategory = corrections.get(slot.slotId);
          if (newCategory) {
            const activity = getActivity(slot);
            if (activity?.activity) {
              const oldCategory = activity.activity.category;
              activity.activity.category = newCategory;
              changes.push({
                type: "FIXED_CATEGORY",
                day: day.dayNumber,
                slot: slot.slotId,
                reason: `Changed category from "${oldCategory}" to "${newCategory}"`,
              });
            }
          }
        }
      }
    }
  }

  const processingTimeMs = Date.now() - startTime;
  console.log(
    `[llm-remediation] Complete. Made ${changes.length} changes with ${llmCalls} LLM calls in ${processingTimeMs}ms`
  );

  return {
    itinerary: fixed,
    changes,
    llmCalls,
    processingTimeMs,
  };
}

// ============================================
// COMBINED REMEDIATION (Algorithmic + LLM)
// ============================================

import { remediateItinerary, type FlightConstraints, type RemediationOptions } from "./itinerary-remediation";

export interface FullRemediationOptions {
  algorithmic?: RemediationOptions;
  llm?: LLMRemediationOptions;
  skipLLM?: boolean;
}

export interface FullRemediationResult {
  itinerary: StructuredItineraryData;
  algorithmicChanges: RemediationChange[];
  llmChanges: RemediationChange[];
  totalChanges: number;
  llmCalls: number;
  processingTimeMs: number;
}

/**
 * Run full remediation pipeline: Algorithmic first, then LLM for fuzzy issues
 */
export async function fullRemediation(
  itinerary: StructuredItineraryData,
  constraints?: FlightConstraints,
  options: FullRemediationOptions = {}
): Promise<FullRemediationResult> {
  const startTime = Date.now();

  // Phase 1: Algorithmic remediation (fast, deterministic)
  console.log("[remediation] Phase 1: Algorithmic remediation...");
  const algorithmicResult = remediateItinerary(itinerary, constraints, options.algorithmic);

  // Phase 2: LLM remediation (slower, handles fuzzy cases)
  let llmResult: LLMRemediationResult = {
    itinerary: algorithmicResult.itinerary,
    changes: [],
    llmCalls: 0,
    processingTimeMs: 0,
  };

  if (!options.skipLLM) {
    console.log("[remediation] Phase 2: LLM remediation...");
    llmResult = await remediateWithLLM(algorithmicResult.itinerary, options.llm);
  }

  return {
    itinerary: llmResult.itinerary,
    algorithmicChanges: algorithmicResult.changes,
    llmChanges: llmResult.changes,
    totalChanges: algorithmicResult.changes.length + llmResult.changes.length,
    llmCalls: llmResult.llmCalls,
    processingTimeMs: Date.now() - startTime,
  };
}
