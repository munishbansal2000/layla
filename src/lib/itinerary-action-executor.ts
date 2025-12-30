/**
 * Itinerary Action Executor
 *
 * Executes parsed ItineraryIntent actions against an itinerary,
 * respecting constraints and returning the updated itinerary with undo information.
 */

import type { StructuredItineraryData, SlotWithOptions, ActivityOption } from "@/types/structured-itinerary";
import type {
  ItineraryIntent,
  IntentExecutionResult,
} from "@/types/itinerary-chat";
import {
  ConstraintEngine,
  createConstraintEngine,
  findActivityByName,
  findSlotById,
  getSelectedActivity,
  calculateRigidity,
} from "./constraint-engine";
import { generateId } from "./utils";

// ============================================
// EXECUTOR CLASS
// ============================================

export class ItineraryActionExecutor {
  private constraintEngine: ConstraintEngine;

  constructor(constraintEngine?: ConstraintEngine) {
    this.constraintEngine = constraintEngine || createConstraintEngine();
  }

  /**
   * Execute an intent against the itinerary
   */
  async execute(
    intent: ItineraryIntent,
    itinerary: StructuredItineraryData
  ): Promise<IntentExecutionResult> {
    switch (intent.type) {
      case "MOVE_ACTIVITY":
        return this.executeMoveActivity(intent.params, itinerary);

      case "SWAP_ACTIVITIES":
        return this.executeSwapActivities(intent.params, itinerary);

      case "REMOVE_ACTIVITY":
        return this.executeRemoveActivity(intent.params, itinerary);

      case "PRIORITIZE":
        return this.executePrioritize(intent.params, itinerary, true);

      case "DEPRIORITIZE":
        return this.executePrioritize(intent.params, itinerary, false);

      case "LOCK_SLOT":
        return this.executeLockSlot(intent.params.slotId, itinerary, true);

      case "UNLOCK_SLOT":
        return this.executeLockSlot(intent.params.slotId, itinerary, false);

      case "ADD_ACTIVITY":
        return this.executeAddActivity(intent.params, itinerary);

      case "REMOVE_DAY":
        return this.executeRemoveDay(intent.params.dayNumber, itinerary);

      case "OPTIMIZE_ROUTE":
      case "OPTIMIZE_CLUSTERS":
      case "BALANCE_PACING":
        return this.executeOptimization(intent, itinerary);

      case "ASK_QUESTION":
      case "SUGGEST_ALTERNATIVES":
      case "SUGGEST_FROM_REPLACEMENT_POOL":
      case "CHECK_FEASIBILITY":
      case "EXPLAIN_CONSTRAINT":
        // These are handled by the API route with LLM responses
        return {
          success: true,
          message: "Query processed",
        };

      case "UNDO":
      case "REDO":
        // Undo/redo is handled at a higher level (the hook/component)
        return {
          success: true,
          message: intent.type === "UNDO" ? "Undone" : "Redone",
        };

      default:
        return {
          success: false,
          message: `Action type not yet implemented: ${(intent as ItineraryIntent).type}`,
        };
    }
  }

  /**
   * Move an activity to a different day/slot
   */
  private async executeMoveActivity(
    params: { activityName: string; toDay: number; toSlot?: string; forceOverrideConstraints?: boolean },
    itinerary: StructuredItineraryData
  ): Promise<IntentExecutionResult> {
    const { activityName, toDay, toSlot, forceOverrideConstraints } = params;

    // Find the activity
    const location = findActivityByName(itinerary, activityName);
    if (!location) {
      return {
        success: false,
        message: `Could not find activity "${activityName}" in the itinerary.`,
      };
    }

    const sourceDayIndex = location.dayIndex;
    const sourceSlot = location.slot;
    const targetDayIndex = toDay - 1;

    // Validate target day exists
    if (targetDayIndex < 0 || targetDayIndex >= itinerary.days.length) {
      return {
        success: false,
        message: `Day ${toDay} does not exist. The itinerary has ${itinerary.days.length} days.`,
      };
    }

    // Check constraints
    const constraintAnalysis = this.constraintEngine.canMoveSlot(
      itinerary,
      sourceSlot.slotId,
      targetDayIndex
    );

    if (!constraintAnalysis.feasible && !forceOverrideConstraints) {
      return {
        success: false,
        message: constraintAnalysis.violations[0]?.message || "Cannot move activity due to constraints",
        constraintAnalysis,
        warnings: constraintAnalysis.violations.map((v) => v.message),
      };
    }

    // Create new itinerary with the move applied
    const newItinerary = this.deepClone(itinerary);

    // Remove from source day
    newItinerary.days[sourceDayIndex].slots = newItinerary.days[sourceDayIndex].slots.filter(
      (s) => s.slotId !== sourceSlot.slotId
    );

    // Add to target day
    const movedSlot = this.deepClone(sourceSlot);
    if (toSlot) {
      movedSlot.slotType = toSlot as SlotWithOptions["slotType"];
    }
    newItinerary.days[targetDayIndex].slots.push(movedSlot);

    // Sort slots by time
    newItinerary.days[targetDayIndex].slots.sort((a, b) => {
      const timeOrder = ["morning", "breakfast", "lunch", "afternoon", "dinner", "evening"];
      return timeOrder.indexOf(a.slotType) - timeOrder.indexOf(b.slotType);
    });

    // Create undo action
    const undoAction: ItineraryIntent = {
      type: "MOVE_ACTIVITY",
      params: {
        activityName,
        toDay: sourceDayIndex + 1,
        toSlot: sourceSlot.slotType,
      },
    };

    return {
      success: true,
      newItinerary,
      message: `Moved "${activityName}" to Day ${toDay}${toSlot ? ` (${toSlot})` : ""}.`,
      undoAction,
      constraintAnalysis: constraintAnalysis.violations.length > 0 ? constraintAnalysis : undefined,
      warnings: constraintAnalysis.violations.filter((v) => v.severity === "warning").map((v) => v.message),
    };
  }

  /**
   * Swap two activities
   */
  private async executeSwapActivities(
    params: { activity1Name: string; activity2Name: string },
    itinerary: StructuredItineraryData
  ): Promise<IntentExecutionResult> {
    const { activity1Name, activity2Name } = params;

    const location1 = findActivityByName(itinerary, activity1Name);
    const location2 = findActivityByName(itinerary, activity2Name);

    if (!location1) {
      return {
        success: false,
        message: `Could not find activity "${activity1Name}" in the itinerary.`,
      };
    }

    if (!location2) {
      return {
        success: false,
        message: `Could not find activity "${activity2Name}" in the itinerary.`,
      };
    }

    // Check if either slot is locked
    if (location1.slot.isLocked || calculateRigidity(location1.slot) >= 0.95) {
      return {
        success: false,
        message: `"${activity1Name}" is locked and cannot be swapped.`,
      };
    }

    if (location2.slot.isLocked || calculateRigidity(location2.slot) >= 0.95) {
      return {
        success: false,
        message: `"${activity2Name}" is locked and cannot be swapped.`,
      };
    }

    // Create new itinerary with swap
    const newItinerary = this.deepClone(itinerary);

    // Get references to the slots in the new itinerary
    const slot1 = newItinerary.days[location1.dayIndex].slots[location1.slotIndex];
    const slot2 = newItinerary.days[location2.dayIndex].slots[location2.slotIndex];

    // Swap the slot positions if on the same day
    if (location1.dayIndex === location2.dayIndex) {
      newItinerary.days[location1.dayIndex].slots[location1.slotIndex] = slot2;
      newItinerary.days[location1.dayIndex].slots[location2.slotIndex] = slot1;

      // Swap slotTypes to maintain time order
      const tempSlotType = slot1.slotType;
      slot1.slotType = slot2.slotType;
      slot2.slotType = tempSlotType;
    } else {
      // Cross-day swap: move slots between days
      newItinerary.days[location1.dayIndex].slots[location1.slotIndex] = { ...slot2, slotType: slot1.slotType };
      newItinerary.days[location2.dayIndex].slots[location2.slotIndex] = { ...slot1, slotType: slot2.slotType };
    }

    // Create undo action (just swap again)
    const undoAction: ItineraryIntent = {
      type: "SWAP_ACTIVITIES",
      params: {
        activity1Name: activity2Name,
        activity2Name: activity1Name,
      },
    };

    return {
      success: true,
      newItinerary,
      message: `Swapped "${activity1Name}" with "${activity2Name}".`,
      undoAction,
    };
  }

  /**
   * Remove an activity from the itinerary
   */
  private async executeRemoveActivity(
    params: { activityName?: string; slotId?: string; dayNumber?: number },
    itinerary: StructuredItineraryData
  ): Promise<IntentExecutionResult> {
    let location: {
      dayIndex: number;
      slotIndex: number;
      slot: SlotWithOptions;
      optionIndex?: number;
      option?: ActivityOption;
    } | null = null;
    let requestedActivityName = params.activityName;

    if (params.slotId) {
      const slotLocation = findSlotById(itinerary, params.slotId);
      if (slotLocation) {
        location = slotLocation;
      }
    } else if (params.activityName) {
      const activityLocation = findActivityByName(itinerary, params.activityName);
      if (activityLocation) {
        location = activityLocation;
        // Store the actual activity name for accurate messaging
        requestedActivityName = activityLocation.option?.activity?.name || params.activityName;
      }
    }

    if (!location) {
      return {
        success: false,
        message: `Could not find "${params.activityName}" in the itinerary.`,
      };
    }

    // Check if locked
    if (location.slot.isLocked) {
      return {
        success: false,
        message: `This activity is locked and cannot be removed. Unlock it first.`,
      };
    }

    const newItinerary = this.deepClone(itinerary);
    const targetSlot = newItinerary.days[location.dayIndex].slots[location.slotIndex];

    // If the activity is just one option among many, remove only that option
    // (unless it's the only option, then remove the whole slot)
    if (location.optionIndex !== undefined && targetSlot.options.length > 1) {
      // Remove just this option from the slot
      targetSlot.options = targetSlot.options.filter((_, idx) => idx !== location!.optionIndex);

      // If we removed the selected option, reset selection
      if (targetSlot.selectedOptionId === location.option?.id) {
        targetSlot.selectedOptionId = null;
      }

      return {
        success: true,
        newItinerary,
        message: `Removed "${requestedActivityName}" option from Day ${location.dayIndex + 1}.`,
      };
    }

    // Remove the entire slot
    newItinerary.days[location.dayIndex].slots = newItinerary.days[location.dayIndex].slots.filter(
      (s) => s.slotId !== location!.slot.slotId
    );

    return {
      success: true,
      newItinerary,
      message: `Removed "${requestedActivityName}" from Day ${location.dayIndex + 1}.`,
    };
  }

  /**
   * Prioritize or deprioritize an activity
   */
  private async executePrioritize(
    params: { activityName: string; rigidityScore?: number },
    itinerary: StructuredItineraryData,
    prioritize: boolean
  ): Promise<IntentExecutionResult> {
    const location = findActivityByName(itinerary, params.activityName);

    if (!location) {
      return {
        success: false,
        message: `Could not find activity "${params.activityName}" in the itinerary.`,
      };
    }

    const newItinerary = this.deepClone(itinerary);
    const slot = newItinerary.days[location.dayIndex].slots[location.slotIndex];

    const oldRigidity = slot.rigidityScore;
    slot.rigidityScore = prioritize ? (params.rigidityScore || 0.9) : 0.3;
    slot.behavior = prioritize ? "anchor" : "flex";

    const undoAction: ItineraryIntent = {
      type: prioritize ? "DEPRIORITIZE" : "PRIORITIZE",
      params: {
        activityName: params.activityName,
        rigidityScore: oldRigidity,
      },
    };

    return {
      success: true,
      newItinerary,
      message: prioritize
        ? `"${params.activityName}" is now prioritized and protected from reshuffling.`
        : `"${params.activityName}" is now flexible and can be reshuffled.`,
      undoAction,
    };
  }

  /**
   * Lock or unlock a slot
   */
  private async executeLockSlot(
    slotId: string,
    itinerary: StructuredItineraryData,
    lock: boolean
  ): Promise<IntentExecutionResult> {
    const location = findSlotById(itinerary, slotId);

    if (!location) {
      return {
        success: false,
        message: `Could not find slot "${slotId}" in the itinerary.`,
      };
    }

    const newItinerary = this.deepClone(itinerary);
    const slot = newItinerary.days[location.dayIndex].slots[location.slotIndex];
    const activity = getSelectedActivity(slot);

    slot.isLocked = lock;
    if (lock) {
      slot.rigidityScore = 1.0;
      slot.behavior = "anchor";
    }

    const undoAction: ItineraryIntent = {
      type: lock ? "UNLOCK_SLOT" : "LOCK_SLOT",
      params: { slotId },
    };

    return {
      success: true,
      newItinerary,
      message: lock
        ? `Locked "${activity?.activity?.name || "activity"}".`
        : `Unlocked "${activity?.activity?.name || "activity"}".`,
      undoAction,
    };
  }

  /**
   * Add an activity to the itinerary
   * - Replaces existing slot of the same type (for meals like lunch/dinner)
   * - Searches for real restaurants when category is restaurant/food-related
   * - Searches for real attractions (temples, museums, parks, etc.) using local POI data or Google Places
   */
  private async executeAddActivity(
    params: {
      dayNumber?: number;
      slotType?: string;
      activityDescription: string;
      category?: string;
      location?: string;
      duration?: number;
    },
    itinerary: StructuredItineraryData
  ): Promise<IntentExecutionResult> {
    const dayIndex = (params.dayNumber || 1) - 1;

    if (dayIndex < 0 || dayIndex >= itinerary.days.length) {
      return {
        success: false,
        message: `Day ${params.dayNumber} does not exist.`,
      };
    }

    const newItinerary = this.deepClone(itinerary);
    const day = newItinerary.days[dayIndex];
    const slotType = (params.slotType as SlotWithOptions["slotType"]) || "afternoon";
    const description = params.activityDescription.toLowerCase();

    // Categorize the request
    const foodTerms = ["ramen", "sushi", "restaurant", "cafe", "izakaya", "food", "eat", "dining", "meal"];
    const attractionCategories: Record<string, string[]> = {
      temple: ["temple", "shrine", "jinja", "tera", "ji"],
      museum: ["museum", "gallery", "art", "exhibition"],
      park: ["park", "garden", "nature", "outdoor"],
      viewpoint: ["viewpoint", "tower", "observation", "skyline", "view"],
      landmark: ["landmark", "castle", "palace", "monument", "historic"],
      shopping: ["shopping", "mall", "market", "store", "shop"],
      entertainment: ["entertainment", "theme park", "amusement", "arcade", "karaoke"],
    };

    const isRestaurant = params.category === "restaurant" ||
      foodTerms.some(term => description.includes(term));

    // Detect attraction category
    let attractionCategory: string | null = null;
    for (const [category, terms] of Object.entries(attractionCategories)) {
      if (terms.some(term => description.includes(term)) || params.category === category) {
        attractionCategory = category;
        break;
      }
    }

    // For meal slots (lunch, dinner, breakfast), replace existing slot
    const mealSlots = ["breakfast", "lunch", "dinner"];
    const isMealSlot = mealSlots.includes(slotType);

    // Find existing slot of same type to replace
    const existingSlotIndex = day.slots.findIndex(s => s.slotType === slotType);
    const existingSlot = existingSlotIndex !== -1 ? day.slots[existingSlotIndex] : null;

    // Get day's location context for search
    let searchLocation: { lat: number; lng: number } | null = null;
    const cityName = day.city || itinerary.destination || "Tokyo";

    // Try to get coordinates from existing activities on this day
    for (const slot of day.slots) {
      const option = slot.options.find(o => o.id === slot.selectedOptionId) || slot.options[0];
      if (option?.activity?.place?.coordinates?.lat) {
        searchLocation = {
          lat: option.activity.place.coordinates.lat,
          lng: option.activity.place.coordinates.lng,
        };
        break;
      }
    }

    // Build the activity options
    let options: SlotWithOptions["options"] = [];
    let searchSource = "";

    // Try to find real restaurants if this is a restaurant request
    if (isRestaurant && searchLocation) {
      try {
        const { searchRestaurantsNearby, isYelpConfigured } = await import("./yelp");

        if (isYelpConfigured()) {
          console.log(`[AddActivity] Searching for ${params.activityDescription} near ${searchLocation.lat}, ${searchLocation.lng}`);

          const restaurants = await searchRestaurantsNearby(
            searchLocation.lat,
            searchLocation.lng,
            {
              cuisine: params.activityDescription,
              radius: 2000,
              limit: 4,
              sortBy: "rating",
            }
          );

          if (restaurants.length > 0) {
            console.log(`[AddActivity] Found ${restaurants.length} restaurants from Yelp`);
            searchSource = "yelp";

            options = restaurants.map((restaurant, index) => ({
              id: generateId(),
              rank: index + 1,
              score: Math.round(restaurant.rating * 20),
              activity: {
                name: restaurant.name,
                description: `${restaurant.cuisine.slice(0, 2).join(", ")} - ${restaurant.rating}★ (${restaurant.reviewCount} reviews)`,
                category: "restaurant",
                duration: params.duration || (isMealSlot ? 60 : 90),
                place: {
                  name: restaurant.name,
                  address: restaurant.address,
                  neighborhood: restaurant.city,
                  coordinates: restaurant.coordinates,
                },
                isFree: false,
                estimatedCost: {
                  amount: restaurant.priceLevel * 15,
                  currency: "USD",
                },
                tags: restaurant.cuisine.slice(0, 3).map(c => c.toLowerCase()),
                source: "yelp" as const,
              },
              matchReasons: [`Found "${params.activityDescription}" restaurant nearby`, `${restaurant.rating}★ rating`],
              tradeoffs: restaurant.distance ? [`${Math.round(restaurant.distance)}m away`] : [],
            }));
          }
        }
      } catch (error) {
        console.error("[AddActivity] Failed to search restaurants:", error);
      }
    }

    // Try to find real attractions if this is an attraction request
    if (attractionCategory && options.length === 0) {
      try {
        // First try local POI data (Japan-specific, fast, free)
        const { findByCategory, findNearby, hasLocalData } = await import("./local-poi-provider");

        const hasLocal = await hasLocalData(cityName);

        if (hasLocal) {
          console.log(`[AddActivity] Searching local POI data for ${attractionCategory} in ${cityName}`);

          let pois;
          if (searchLocation) {
            // Search nearby if we have coordinates
            pois = await findNearby(cityName, searchLocation.lat, searchLocation.lng, {
              category: attractionCategory,
              maxResults: 4,
              radiusKm: 3,
            });
          } else {
            // Otherwise search by category
            pois = await findByCategory(cityName, attractionCategory, { maxResults: 4 });
          }

          if (pois.length > 0) {
            console.log(`[AddActivity] Found ${pois.length} ${attractionCategory}s from local data`);
            searchSource = "local";

            options = pois.map((poi, index) => ({
              id: generateId(),
              rank: index + 1,
              score: Math.round(poi.rating * 20),
              activity: {
                name: poi.name,
                description: poi.description || `${poi.category} in ${poi.neighborhood || cityName}`,
                category: poi.category,
                duration: params.duration || getCategoryDuration(poi.category),
                place: {
                  name: poi.name,
                  address: poi.address || "",
                  neighborhood: poi.neighborhood || cityName,
                  coordinates: poi.coordinates,
                },
                isFree: ["temple", "shrine", "park"].includes(poi.category),
                tags: [poi.category, ...(poi.subcategory ? [poi.subcategory] : [])],
                source: "local-data" as const,
              },
              matchReasons: [`Found ${poi.category} matching "${params.activityDescription}"`, poi.rating ? `${poi.rating}★ rating` : "Popular spot"],
              tradeoffs: [],
            }));
          }
        }

        // Fallback to Google Places if no local data or no results
        if (options.length === 0) {
          try {
            const googlePlaces = await import("./google-places");

            if (googlePlaces.isGooglePlacesConfigured && googlePlaces.isGooglePlacesConfigured()) {
              console.log(`[AddActivity] Searching Google Places for ${params.activityDescription} in ${cityName}`);

              const googleTypeMap: Record<string, string> = {
                temple: "hindu_temple", // Also covers Buddhist temples
                museum: "museum",
                park: "park",
                viewpoint: "tourist_attraction",
                landmark: "tourist_attraction",
                shopping: "shopping_mall",
                entertainment: "amusement_park",
              };

              const places = await googlePlaces.searchAttractions(cityName, {
                types: googleTypeMap[attractionCategory] ? [googleTypeMap[attractionCategory]] : undefined,
                maxResults: 4,
              });

              if (places.length > 0) {
                console.log(`[AddActivity] Found ${places.length} attractions from Google Places`);
                searchSource = "google";

                options = places.map((place, index) => ({
                  id: generateId(),
                  rank: index + 1,
                  score: place.rating ? Math.round(place.rating * 20) : 75,
                  activity: {
                    name: place.name,
                    description: place.description || `${attractionCategory} in ${cityName}`,
                    category: attractionCategory,
                    duration: params.duration || getCategoryDuration(attractionCategory),
                    place: {
                      name: place.name,
                      address: place.address || "",
                      neighborhood: place.neighborhood || cityName,
                      coordinates: place.coordinates,
                    },
                    isFree: ["park", "temple"].includes(attractionCategory),
                    estimatedCost: place.priceLevel ? { amount: place.priceLevel * 10, currency: "USD" } : undefined,
                    tags: place.types || [attractionCategory],
                    source: "google-places" as const,
                  },
                  matchReasons: [`Found ${attractionCategory} matching "${params.activityDescription}"`],
                  tradeoffs: [],
                }));
              }
            }
          } catch (googleError) {
            console.error("[AddActivity] Google Places search failed:", googleError);
          }
        }
      } catch (error) {
        console.error("[AddActivity] Failed to search attractions:", error);
      }
    }

    // If no results found, create a placeholder
    if (options.length === 0) {
      searchSource = "placeholder";
      options = [
        {
          id: generateId(),
          rank: 1,
          score: 75,
          activity: {
            name: params.activityDescription,
            description: `${params.category || "Activity"} ${params.location ? `near ${params.location}` : ""}`,
            category: params.category || attractionCategory || "activity",
            duration: params.duration || 90,
            place: null,
            isFree: false,
            tags: params.category ? [params.category] : [],
            source: "ai",
          },
          matchReasons: ["User requested"],
          tradeoffs: ["No specific venue found - consider searching manually"],
        },
      ];
    }

    const slotId = existingSlot?.slotId || generateId();

    // Create the new/updated slot
    const newSlot: SlotWithOptions = {
      slotId,
      slotType,
      timeRange: {
        start: getTimeForSlotType(slotType),
        end: getEndTimeForSlotType(slotType),
      },
      options,
      selectedOptionId: options[0]?.id || null,
      behavior: "flex",
      rigidityScore: 0.4,
    };

    // Replace or add the slot
    let action = "Added";
    if (existingSlotIndex !== -1 && isMealSlot) {
      newItinerary.days[dayIndex].slots[existingSlotIndex] = newSlot;
      action = "Replaced";
    } else if (existingSlotIndex !== -1) {
      newItinerary.days[dayIndex].slots.push({ ...newSlot, slotId: generateId() });
    } else {
      newItinerary.days[dayIndex].slots.push(newSlot);
    }

    // Sort slots by time
    newItinerary.days[dayIndex].slots.sort((a, b) => {
      const timeOrder = ["morning", "breakfast", "lunch", "afternoon", "dinner", "evening"];
      return timeOrder.indexOf(a.slotType) - timeOrder.indexOf(b.slotType);
    });

    const undoAction: ItineraryIntent = existingSlot && isMealSlot
      ? {
          type: "REPLACE_ACTIVITY",
          params: {
            targetActivityName: options[0]?.activity.name || params.activityDescription,
            replacementDescription: existingSlot.options[0]?.activity?.name || "previous activity",
          },
        }
      : {
          type: "REMOVE_ACTIVITY",
          params: { slotId },
        };

    // Build response message
    const resultInfo = options.length > 1 && searchSource !== "placeholder"
      ? ` Found ${options.length} options nearby!`
      : searchSource === "placeholder" ? " (placeholder - no venues found)" : "";

    return {
      success: true,
      newItinerary,
      message: `${action} "${options[0]?.activity.name || params.activityDescription}" to Day ${dayIndex + 1} (${slotType}).${resultInfo}`,
      undoAction,
    };
  }

  /**
   * Remove a day from the itinerary
   */
  private async executeRemoveDay(
    dayNumber: number,
    itinerary: StructuredItineraryData
  ): Promise<IntentExecutionResult> {
    const dayIndex = dayNumber - 1;

    if (dayIndex < 0 || dayIndex >= itinerary.days.length) {
      return {
        success: false,
        message: `Day ${dayNumber} does not exist.`,
      };
    }

    if (itinerary.days.length <= 1) {
      return {
        success: false,
        message: "Cannot remove the only day in the itinerary.",
      };
    }

    const newItinerary = this.deepClone(itinerary);
    const removedDay = newItinerary.days[dayIndex];

    newItinerary.days = newItinerary.days.filter((_, i) => i !== dayIndex);

    // Renumber remaining days
    newItinerary.days.forEach((day, i) => {
      day.dayNumber = i + 1;
    });

    return {
      success: true,
      newItinerary,
      message: `Removed Day ${dayNumber}: ${removedDay.title}.`,
    };
  }

  /**
   * Execute optimization actions
   * These are placeholders - real implementation would use more sophisticated algorithms
   */
  private async executeOptimization(
    intent: ItineraryIntent,
    itinerary: StructuredItineraryData
  ): Promise<IntentExecutionResult> {
    // For now, just validate the itinerary and return suggestions
    const analysis = this.constraintEngine.validateItinerary(itinerary);

    if (intent.type === "OPTIMIZE_ROUTE") {
      return {
        success: true,
        message: `Route optimization analyzed. ${analysis.violations.length > 0 ? `Found ${analysis.violations.length} potential improvements.` : "Route looks efficient!"}`,
        constraintAnalysis: analysis,
      };
    }

    if (intent.type === "OPTIMIZE_CLUSTERS") {
      const clusterViolations = analysis.violations.filter((v) => v.layer === "clustering");
      return {
        success: true,
        message: clusterViolations.length > 0
          ? `Found ${clusterViolations.length} cluster optimization opportunities.`
          : "Activities are well-clustered!",
        constraintAnalysis: analysis,
      };
    }

    if (intent.type === "BALANCE_PACING") {
      const pacingViolations = analysis.violations.filter((v) => v.layer === "pacing");
      return {
        success: true,
        message: pacingViolations.length > 0
          ? `Found ${pacingViolations.length} pacing issues to address.`
          : "Day pacing looks balanced!",
        constraintAnalysis: analysis,
      };
    }

    return {
      success: true,
      message: "Optimization complete.",
    };
  }

  /**
   * Deep clone an object
   */
  private deepClone<T>(obj: T): T {
    return JSON.parse(JSON.stringify(obj));
  }
}

// ============================================
// HELPER FUNCTIONS
// ============================================

function getTimeForSlotType(slotType: string): string {
  const times: Record<string, string> = {
    morning: "09:00",
    breakfast: "08:00",
    lunch: "12:00",
    afternoon: "14:00",
    dinner: "18:00",
    evening: "20:00",
  };
  return times[slotType] || "12:00";
}

/**
 * Get default duration for an attraction category (in minutes)
 */
function getCategoryDuration(category: string): number {
  const durations: Record<string, number> = {
    temple: 60,
    shrine: 45,
    museum: 120,
    gallery: 90,
    park: 60,
    garden: 60,
    viewpoint: 30,
    tower: 45,
    landmark: 45,
    castle: 90,
    palace: 90,
    shopping: 90,
    mall: 120,
    market: 60,
    entertainment: 180,
    "theme park": 300,
    amusement: 180,
    arcade: 60,
    karaoke: 90,
    restaurant: 60,
    cafe: 45,
  };
  return durations[category.toLowerCase()] || 90;
}

function getEndTimeForSlotType(slotType: string): string {
  const times: Record<string, string> = {
    morning: "12:00",
    breakfast: "09:30",
    lunch: "13:30",
    afternoon: "17:00",
    dinner: "20:00",
    evening: "22:00",
  };
  return times[slotType] || "14:00";
}

// ============================================
// SINGLETON
// ============================================

let executorInstance: ItineraryActionExecutor | null = null;

export function getActionExecutor(): ItineraryActionExecutor {
  if (!executorInstance) {
    executorInstance = new ItineraryActionExecutor();
  }
  return executorInstance;
}

export function createActionExecutor(constraintEngine?: ConstraintEngine): ItineraryActionExecutor {
  return new ItineraryActionExecutor(constraintEngine);
}
