// ============================================
// MORNING BRIEFING GENERATOR
// ============================================
// Generate daily morning briefings for trip execution.
// Implements morning briefing from EXECUTION_PHASE_DESIGN.md

import {
  MorningBriefing,
  BriefingWeather,
  BriefingFirstActivity,
  BriefingBooking,
} from "@/types/execution";
import { DayWithOptions } from "@/types/structured-itinerary";
import { WeatherForecast } from "@/types/activity-suggestion";
import { getSelectedActivity, getSlotDuration } from "./execution-helpers";

// ============================================
// BRIEFING GENERATION
// ============================================

/**
 * Generate a complete morning briefing for a day
 */
export function generateMorningBriefing(
  tripId: string,
  dayNumber: number,
  day: DayWithOptions,
  weather?: WeatherForecast
): MorningBriefing {
  const greeting = generateGreeting(dayNumber, day.city);
  const dayTitle = generateDayTitle(day);
  const highlights = extractHighlights(day, 3);
  const firstActivity = getFirstActivityInfo(day);
  const bookingsToday = getBookingsForDay(day);
  const tips = generateTips(day, weather);
  const briefingWeather = weather ? formatWeatherForBriefing(weather) : undefined;

  return {
    tripId,
    dayNumber,
    date: day.date,
    greeting,
    dayTitle,
    weather: briefingWeather,
    highlights,
    totalActivities: day.slots.length,
    firstActivity,
    bookingsToday,
    tips,
  };
}

// ============================================
// GREETING GENERATION
// ============================================

/**
 * Generate a personalized greeting
 */
export function generateGreeting(dayNumber: number, city: string): string {
  const greetings = [
    `Good morning! Day ${dayNumber} in ${city}`,
    `Rise and shine! It's Day ${dayNumber} in ${city}`,
    `Good morning! Ready for Day ${dayNumber} in ${city}?`,
    `Welcome to Day ${dayNumber} of your ${city} adventure!`,
  ];

  // Use day number to pick a consistent greeting
  const index = (dayNumber - 1) % greetings.length;
  return greetings[index];
}

/**
 * Generate a title for the day based on activities
 */
export function generateDayTitle(day: DayWithOptions): string {
  // Analyze activities to generate a theme
  const categories = new Set<string>();
  const hasFood = day.slots.some((slot) => {
    const activity = getSelectedActivity(slot);
    const category = activity?.activity.category?.toLowerCase() || "";
    return category.includes("restaurant") || category.includes("food") || category.includes("cafe");
  });

  for (const slot of day.slots) {
    const activity = getSelectedActivity(slot);
    const category = activity?.activity.category?.toLowerCase() || "";
    if (category.includes("temple") || category.includes("shrine")) {
      categories.add("culture");
    } else if (category.includes("museum") || category.includes("gallery")) {
      categories.add("art");
    } else if (category.includes("park") || category.includes("garden")) {
      categories.add("nature");
    } else if (category.includes("shopping") || category.includes("market")) {
      categories.add("shopping");
    } else if (category.includes("tour")) {
      categories.add("exploration");
    }
  }

  // Generate title based on themes
  const themes: string[] = [];
  if (categories.has("culture")) themes.push("Culture");
  if (categories.has("art")) themes.push("Art");
  if (categories.has("nature")) themes.push("Nature");
  if (categories.has("shopping")) themes.push("Shopping");
  if (categories.has("exploration")) themes.push("Exploration");
  if (hasFood && themes.length < 2) themes.push("Food");

  if (themes.length === 0) {
    return "Day of Discovery";
  } else if (themes.length === 1) {
    return `${themes[0]} Day`;
  } else if (themes.length === 2) {
    return `${themes[0]} & ${themes[1]} Day`;
  } else {
    return `${themes[0]}, ${themes[1]} & More`;
  }
}

// ============================================
// HIGHLIGHTS EXTRACTION
// ============================================

/**
 * Extract top highlights from the day
 */
export function extractHighlights(day: DayWithOptions, count: number): string[] {
  // Sort slots by activity score (highest first)
  const sortedSlots = [...day.slots].sort((a, b) => {
    const activityA = getSelectedActivity(a);
    const activityB = getSelectedActivity(b);
    // ActivityOption has 'score' property
    const scoreA = activityA?.score ?? 50;
    const scoreB = activityB?.score ?? 50;
    return scoreB - scoreA;
  });

  // Take top activities
  return sortedSlots
    .slice(0, count)
    .map((slot) => {
      const activity = getSelectedActivity(slot);
      return activity?.activity.name ?? "Unknown Activity";
    });
}

// ============================================
// FIRST ACTIVITY INFO
// ============================================

/**
 * Get information about the first activity
 */
export function getFirstActivityInfo(day: DayWithOptions): BriefingFirstActivity {
  if (day.slots.length === 0) {
    return {
      name: "No activities planned",
      time: "N/A",
      travelTime: 0,
    };
  }

  const firstSlot = day.slots[0];
  const activity = getSelectedActivity(firstSlot);
  const travelTime = firstSlot.commuteFromPrevious?.duration ?? 0;

  return {
    name: activity?.activity.name ?? "Unknown Activity",
    time: firstSlot.timeRange.start,
    travelTime,
  };
}

// ============================================
// BOOKINGS
// ============================================

/**
 * Get bookings for the day
 */
export function getBookingsForDay(day: DayWithOptions): BriefingBooking[] {
  const bookings: BriefingBooking[] = [];

  for (const slot of day.slots) {
    const activity = getSelectedActivity(slot);
    const tags = activity?.activity.tags || [];
    const hasBooking = tags.some((tag: string) =>
      ["reservation", "booking", "ticket", "tour", "timed-entry"].includes(tag.toLowerCase())
    );

    // Also check fragility metadata
    const hasBookingFlag = slot.fragility?.bookingRequired === true;

    if (hasBooking || hasBookingFlag) {
      bookings.push({
        name: activity?.activity.name ?? "Unknown Activity",
        time: slot.timeRange.start,
        confirmationNeeded: false,
      });
    }
  }

  return bookings;
}

// ============================================
// TIPS GENERATION
// ============================================

/**
 * Generate helpful tips for the day
 */
export function generateTips(
  day: DayWithOptions,
  weather?: WeatherForecast
): string[] {
  const tips: string[] = [];

  // Weather-based tips
  if (weather) {
    const weatherTips = getWeatherTips(weather);
    tips.push(...weatherTips);
  }

  // Activity-based tips
  const activityTips = getActivityTips(day);
  tips.push(...activityTips);

  // Timing tips
  const timingTips = getTimingTips(day);
  tips.push(...timingTips);

  // Limit to 5 tips
  return tips.slice(0, 5);
}

/**
 * Get weather-related tips
 */
function getWeatherTips(weather: WeatherForecast): string[] {
  const tips: string[] = [];
  const condition = weather.condition.toLowerCase();

  // Handle temperature which can be number or {min, max}
  let avgTemp: number;
  if (typeof weather.temperature === 'number') {
    avgTemp = weather.temperature;
  } else {
    avgTemp = (weather.temperature.min + weather.temperature.max) / 2;
  }

  if (condition.includes("rain") || weather.precipitationProbability > 50) {
    tips.push("☔ Bring an umbrella - rain is expected today");
  }

  if (avgTemp > 30) {
    tips.push("🌡️ It's hot today - stay hydrated and take breaks in shade");
  } else if (avgTemp > 25) {
    tips.push("☀️ Sunny and warm - don't forget sunscreen");
  } else if (avgTemp < 10) {
    tips.push("🧥 It's cold today - dress in warm layers");
  } else if (avgTemp < 5) {
    tips.push("❄️ Very cold - bundle up and wear warm clothes");
  }

  if (condition.includes("clear") || condition.includes("sunny")) {
    tips.push("📷 Great weather for outdoor photos!");
  }

  return tips;
}

/**
 * Get tips based on scheduled activities
 */
function getActivityTips(day: DayWithOptions): string[] {
  const tips: string[] = [];

  // Check for temple/shrine visits
  const hasTemple = day.slots.some((slot) => {
    const activity = getSelectedActivity(slot);
    const category = activity?.activity.category?.toLowerCase() || "";
    const name = activity?.activity.name.toLowerCase() || "";
    return category.includes("temple") || category.includes("shrine") ||
           name.includes("temple") || name.includes("shrine");
  });

  if (hasTemple) {
    tips.push("🙏 Visiting temples/shrines - wear modest clothing and remove shoes when required");
  }

  // Check for walking-heavy day (estimate from slot durations and commutes)
  const totalCommute = day.slots.reduce((sum, slot) => {
    return sum + (slot.commuteFromPrevious?.duration ?? 0);
  }, 0);
  if (totalCommute > 60) {
    tips.push("👟 Lots of walking today - wear comfortable shoes");
  }

  // Check for restaurant bookings
  const hasRestaurant = day.slots.some((slot) => {
    const activity = getSelectedActivity(slot);
    const category = activity?.activity.category?.toLowerCase() || "";
    return category.includes("restaurant");
  });

  if (hasRestaurant) {
    tips.push("🍽️ You have dining reservations - check the confirmation details");
  }

  // Check for early start
  if (day.slots.length > 0) {
    const [hours] = day.slots[0].timeRange.start.split(":").map(Number);
    if (hours < 8) {
      tips.push("⏰ Early start today - get a good night's rest");
    }
  }

  // Check for late end
  if (day.slots.length > 0) {
    const lastSlot = day.slots[day.slots.length - 1];
    const [hours] = lastSlot.timeRange.end.split(":").map(Number);
    if (hours >= 21) {
      tips.push("🌙 Late evening activities planned - pace yourself during the day");
    }
  }

  return tips;
}

/**
 * Get timing-related tips
 */
function getTimingTips(day: DayWithOptions): string[] {
  const tips: string[] = [];

  // Calculate pace based on number of slots and total duration
  const totalSlots = day.slots.length;
  const paceScore = Math.min(100, (totalSlots / 8) * 100); // 8 activities = 100%

  // Check for tight schedule
  if (paceScore > 80) {
    tips.push("📅 Packed schedule today - stick to the timing to see everything");
  } else if (paceScore < 40) {
    tips.push("🌿 Relaxed pace today - take your time and enjoy");
  }

  // Check for long commutes
  const hasLongCommute = day.slots.some(
    (slot) => slot.commuteFromPrevious && slot.commuteFromPrevious.duration > 30
  );

  if (hasLongCommute) {
    tips.push("🚃 Some longer commutes today - grab a transit pass if you haven't");
  }

  return tips;
}

// ============================================
// WEATHER FORMATTING
// ============================================

/**
 * Format weather data for the briefing
 */
function formatWeatherForBriefing(weather: WeatherForecast): BriefingWeather {
  const condition = weather.condition;

  // Handle temperature which can be number or {min, max}
  let tempStr: string;
  let avgTemp: number;
  if (typeof weather.temperature === 'number') {
    tempStr = `${weather.temperature}°C`;
    avgTemp = weather.temperature;
  } else {
    tempStr = `${weather.temperature.min}-${weather.temperature.max}°C`;
    avgTemp = (weather.temperature.min + weather.temperature.max) / 2;
  }

  // Get weather icon
  const icon = getWeatherIcon(condition);

  // Generate summary
  const summary = `${condition}, ${tempStr}`;

  // Generate recommendation
  let recommendation: string | undefined;

  if (weather.precipitationProbability > 70) {
    recommendation = "Bring an umbrella";
  } else if (avgTemp > 30) {
    recommendation = "Stay hydrated and use sun protection";
  } else if (avgTemp < 10) {
    recommendation = "Dress warmly in layers";
  } else if (condition.toLowerCase().includes("clear")) {
    recommendation = "Perfect weather for sightseeing!";
  }

  return {
    summary,
    icon,
    recommendation,
  };
}

/**
 * Get emoji icon for weather condition
 */
function getWeatherIcon(condition: string): string {
  const c = condition.toLowerCase();

  if (c.includes("sunny") || c.includes("clear")) return "☀️";
  if (c.includes("cloud")) return "☁️";
  if (c.includes("rain")) return "🌧️";
  if (c.includes("storm") || c.includes("thunder")) return "⛈️";
  if (c.includes("snow")) return "❄️";
  if (c.includes("fog") || c.includes("mist")) return "🌫️";
  if (c.includes("wind")) return "💨";
  if (c.includes("partly")) return "⛅";

  return "🌤️"; // Default
}

// ============================================
// BRIEFING TEXT GENERATION
// ============================================

/**
 * Generate a readable text summary of the briefing
 */
export function generateBriefingText(briefing: MorningBriefing): string {
  const lines: string[] = [];

  // Header
  lines.push(`# ${briefing.greeting}`);
  lines.push(`**${briefing.dayTitle}**`);
  lines.push("");

  // Weather
  if (briefing.weather) {
    lines.push(`## Weather`);
    lines.push(`${briefing.weather.icon} ${briefing.weather.summary}`);
    if (briefing.weather.recommendation) {
      lines.push(`*${briefing.weather.recommendation}*`);
    }
    lines.push("");
  }

  // First activity
  lines.push(`## First Up`);
  lines.push(`**${briefing.firstActivity.name}** at ${briefing.firstActivity.time}`);
  if (briefing.firstActivity.travelTime > 0) {
    lines.push(`📍 ${briefing.firstActivity.travelTime} min travel from hotel`);
  }
  lines.push("");

  // Highlights
  lines.push(`## Today's Highlights`);
  for (const highlight of briefing.highlights) {
    lines.push(`• ${highlight}`);
  }
  lines.push(`*${briefing.totalActivities} activities planned*`);
  lines.push("");

  // Bookings
  if (briefing.bookingsToday.length > 0) {
    lines.push(`## Bookings`);
    for (const booking of briefing.bookingsToday) {
      lines.push(`📅 ${booking.time} - ${booking.name}`);
    }
    lines.push("");
  }

  // Tips
  if (briefing.tips.length > 0) {
    lines.push(`## Tips for Today`);
    for (const tip of briefing.tips) {
      lines.push(`• ${tip}`);
    }
  }

  return lines.join("\n");
}

/**
 * Generate a short notification-friendly briefing
 */
export function generateBriefingNotification(briefing: MorningBriefing): {
  title: string;
  body: string;
} {
  const title = `${briefing.greeting} ☀️`;

  const bodyParts: string[] = [];
  bodyParts.push(`${briefing.totalActivities} activities today`);

  if (briefing.weather) {
    bodyParts.push(briefing.weather.summary);
  }

  bodyParts.push(`First up: ${briefing.firstActivity.name} at ${briefing.firstActivity.time}`);

  return {
    title,
    body: bodyParts.join(" • "),
  };
}
