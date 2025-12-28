/**
 * OpenWeather API Integration
 *
 * Provides weather forecasts for trip destinations
 * API Docs: https://openweathermap.org/api
 *
 * Free tier: 1,000 calls/day, 5-day forecast
 * One Call API (paid): 16-day forecast
 */

import { cachedWeatherFetch } from "./weather-logger";

const OPENWEATHER_API_KEY = process.env.OPENWEATHER_API_KEY!;
const BASE_URL = "https://api.openweathermap.org/data/2.5";
const GEO_URL = "https://api.openweathermap.org/geo/1.0";

// ============================================
// TYPES
// ============================================

export interface GeoLocation {
  name: string;
  lat: number;
  lon: number;
  country: string;
  state?: string;
}

export interface WeatherCondition {
  id: number;
  main: string;
  description: string;
  icon: string;
}

export interface CurrentWeather {
  temp: number;
  feels_like: number;
  temp_min: number;
  temp_max: number;
  humidity: number;
  pressure: number;
  visibility: number;
  wind_speed: number;
  wind_deg: number;
  clouds: number;
  weather: WeatherCondition;
  sunrise: Date;
  sunset: Date;
  dt: Date;
}

export interface DailyForecast {
  date: Date;
  temp: {
    day: number;
    min: number;
    max: number;
    night: number;
    eve: number;
    morn: number;
  };
  feels_like: {
    day: number;
    night: number;
    eve: number;
    morn: number;
  };
  humidity: number;
  wind_speed: number;
  wind_deg: number;
  weather: WeatherCondition;
  clouds: number;
  pop: number; // Probability of precipitation
  rain?: number;
  snow?: number;
  uvi?: number;
  sunrise: Date;
  sunset: Date;
}

export interface HourlyForecast {
  dt: Date;
  temp: number;
  feels_like: number;
  humidity: number;
  weather: WeatherCondition;
  wind_speed: number;
  pop: number;
}

export interface WeatherForecast {
  location: {
    name: string;
    country: string;
    lat: number;
    lon: number;
  };
  current?: CurrentWeather;
  daily: DailyForecast[];
  hourly?: HourlyForecast[];
}

// Simplified weather info for itinerary display
export interface SimpleWeatherInfo {
  date: Date;
  temperature: number;
  tempMin: number;
  tempMax: number;
  condition: "sunny" | "cloudy" | "rainy" | "snowy" | "partly-cloudy" | "stormy" | "foggy";
  description: string;
  icon: string;
  humidity: number;
  windSpeed: number;
  precipProbability: number;
}

// ============================================
// API HELPERS
// ============================================

/**
 * Fetch weather API with caching
 */
async function fetchWeatherAPI<T>(
  type: "current" | "forecast" | "geocode",
  endpoint: string,
  params: Record<string, string>,
  cityInfo?: { city?: string; country?: string; lat?: number; lon?: number }
): Promise<T> {
  const allParams = {
    ...params,
    appid: OPENWEATHER_API_KEY,
  };

  return cachedWeatherFetch<T>(type, endpoint, allParams, cityInfo);
}

// ============================================
// GEOCODING
// ============================================

/**
 * Get coordinates for a city name
 */
export async function geocodeCity(city: string, country?: string): Promise<GeoLocation | null> {
  try {
    const query = country ? `${city},${country}` : city;

    const data = await fetchWeatherAPI<Array<{
      name: string;
      lat: number;
      lon: number;
      country: string;
      state?: string;
    }>>(
      "geocode",
      `${GEO_URL}/direct`,
      {
        q: query,
        limit: "1",
      },
      { city, country }
    );

    if (data.length === 0) {
      return null;
    }

    return {
      name: data[0].name,
      lat: data[0].lat,
      lon: data[0].lon,
      country: data[0].country,
      state: data[0].state,
    };
  } catch (error) {
    console.error("Geocoding error:", error);
    return null;
  }
}

// ============================================
// WEATHER API FUNCTIONS
// ============================================

/**
 * Get current weather for a location
 */
export async function getCurrentWeather(lat: number, lon: number): Promise<CurrentWeather | null> {
  try {
    const data = await fetchWeatherAPI<{
      main: {
        temp: number;
        feels_like: number;
        temp_min: number;
        temp_max: number;
        humidity: number;
        pressure: number;
      };
      visibility: number;
      wind: { speed: number; deg: number };
      clouds: { all: number };
      weather: Array<{ id: number; main: string; description: string; icon: string }>;
      sys: { sunrise: number; sunset: number };
      dt: number;
    }>(
      "current",
      `${BASE_URL}/weather`,
      {
        lat: lat.toString(),
        lon: lon.toString(),
        units: "metric",
      },
      { lat, lon }
    );

    return {
      temp: data.main.temp,
      feels_like: data.main.feels_like,
      temp_min: data.main.temp_min,
      temp_max: data.main.temp_max,
      humidity: data.main.humidity,
      pressure: data.main.pressure,
      visibility: data.visibility,
      wind_speed: data.wind.speed,
      wind_deg: data.wind.deg,
      clouds: data.clouds.all,
      weather: data.weather[0],
      sunrise: new Date(data.sys.sunrise * 1000),
      sunset: new Date(data.sys.sunset * 1000),
      dt: new Date(data.dt * 1000),
    };
  } catch (error) {
    console.error("Current weather error:", error);
    return null;
  }
}

/**
 * Get 5-day forecast (free tier)
 * Returns forecast in 3-hour intervals
 */
export async function get5DayForecast(lat: number, lon: number): Promise<DailyForecast[]> {
  try {
    const data = await fetchWeatherAPI<{
      list: Array<{
        dt: number;
        main: {
          temp: number;
          feels_like: number;
          temp_min: number;
          temp_max: number;
          humidity: number;
        };
        weather: Array<{ id: number; main: string; description: string; icon: string }>;
        wind: { speed: number; deg: number };
        clouds: { all: number };
        pop: number;
        rain?: { "3h": number };
        snow?: { "3h": number };
      }>;
      city: {
        sunrise: number;
        sunset: number;
      };
    }>(
      "forecast",
      `${BASE_URL}/forecast`,
      {
        lat: lat.toString(),
        lon: lon.toString(),
        units: "metric",
      },
      { lat, lon }
    );

    // Group by day and aggregate
    const dailyMap = new Map<string, {
      temps: number[];
      humidity: number[];
      wind: number[];
      weather: typeof data.list[0]["weather"][0][];
      pop: number[];
      rain: number;
      snow: number;
      date: Date;
    }>();

    for (const item of data.list) {
      const date = new Date(item.dt * 1000);
      const dateKey = date.toISOString().split("T")[0];

      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, {
          temps: [],
          humidity: [],
          wind: [],
          weather: [],
          pop: [],
          rain: 0,
          snow: 0,
          date,
        });
      }

      const day = dailyMap.get(dateKey)!;
      day.temps.push(item.main.temp);
      day.humidity.push(item.main.humidity);
      day.wind.push(item.wind.speed);
      day.weather.push(item.weather[0]);
      day.pop.push(item.pop);
      day.rain += item.rain?.["3h"] || 0;
      day.snow += item.snow?.["3h"] || 0;
    }

    // Convert to DailyForecast array
    const forecasts: DailyForecast[] = [];

    for (const [, day] of dailyMap) {
      const avgTemp = day.temps.reduce((a, b) => a + b, 0) / day.temps.length;
      const minTemp = Math.min(...day.temps);
      const maxTemp = Math.max(...day.temps);
      const avgHumidity = day.humidity.reduce((a, b) => a + b, 0) / day.humidity.length;
      const avgWind = day.wind.reduce((a, b) => a + b, 0) / day.wind.length;
      const maxPop = Math.max(...day.pop);

      // Get most common weather condition
      const weatherCounts = new Map<string, { count: number; weather: typeof day.weather[0] }>();
      for (const w of day.weather) {
        const key = w.main;
        if (!weatherCounts.has(key)) {
          weatherCounts.set(key, { count: 0, weather: w });
        }
        weatherCounts.get(key)!.count++;
      }
      const dominantWeather = Array.from(weatherCounts.values())
        .sort((a, b) => b.count - a.count)[0]?.weather || day.weather[0];

      forecasts.push({
        date: day.date,
        temp: {
          day: avgTemp,
          min: minTemp,
          max: maxTemp,
          night: minTemp,
          eve: avgTemp,
          morn: avgTemp,
        },
        feels_like: {
          day: avgTemp,
          night: minTemp,
          eve: avgTemp,
          morn: avgTemp,
        },
        humidity: avgHumidity,
        wind_speed: avgWind,
        wind_deg: 0,
        weather: dominantWeather,
        clouds: 0,
        pop: maxPop,
        rain: day.rain,
        snow: day.snow,
        sunrise: new Date(data.city.sunrise * 1000),
        sunset: new Date(data.city.sunset * 1000),
      });
    }

    return forecasts;
  } catch (error) {
    console.error("5-day forecast error:", error);
    return [];
  }
}

/**
 * Get weather forecast for a city by name
 */
export async function getWeatherForCity(
  city: string,
  country?: string
): Promise<WeatherForecast | null> {
  // First geocode the city
  const location = await geocodeCity(city, country);

  if (!location) {
    console.error(`Could not geocode city: ${city}`);
    return null;
  }

  // Get current weather and forecast
  const [current, daily] = await Promise.all([
    getCurrentWeather(location.lat, location.lon),
    get5DayForecast(location.lat, location.lon),
  ]);

  return {
    location: {
      name: location.name,
      country: location.country,
      lat: location.lat,
      lon: location.lon,
    },
    current: current || undefined,
    daily,
  };
}

/**
 * Get simple weather info for a specific date range (for trip itinerary)
 */
export async function getWeatherForTrip(
  city: string,
  country: string | undefined,
  startDate: Date,
  endDate: Date
): Promise<SimpleWeatherInfo[]> {
  const forecast = await getWeatherForCity(city, country);

  if (!forecast) {
    return [];
  }

  // Filter forecasts to match trip dates
  const tripWeather: SimpleWeatherInfo[] = [];
  const start = new Date(startDate);
  start.setHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setHours(23, 59, 59, 999);

  for (const day of forecast.daily) {
    const dayDate = new Date(day.date);
    dayDate.setHours(0, 0, 0, 0);

    if (dayDate >= start && dayDate <= end) {
      tripWeather.push({
        date: day.date,
        temperature: Math.round(day.temp.day),
        tempMin: Math.round(day.temp.min),
        tempMax: Math.round(day.temp.max),
        condition: mapWeatherCondition(day.weather.main),
        description: day.weather.description,
        icon: day.weather.icon,
        humidity: Math.round(day.humidity),
        windSpeed: Math.round(day.wind_speed),
        precipProbability: Math.round(day.pop * 100),
      });
    }
  }

  return tripWeather;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Map OpenWeather condition to simplified condition
 */
function mapWeatherCondition(
  main: string
): "sunny" | "cloudy" | "rainy" | "snowy" | "partly-cloudy" | "stormy" | "foggy" {
  const condition = main.toLowerCase();

  switch (condition) {
    case "clear":
      return "sunny";
    case "clouds":
      return "cloudy";
    case "few clouds":
    case "scattered clouds":
      return "partly-cloudy";
    case "rain":
    case "drizzle":
    case "shower rain":
      return "rainy";
    case "thunderstorm":
      return "stormy";
    case "snow":
      return "snowy";
    case "mist":
    case "fog":
    case "haze":
      return "foggy";
    default:
      return "partly-cloudy";
  }
}

/**
 * Get weather icon URL from OpenWeather icon code
 */
export function getWeatherIconUrl(iconCode: string, size: "small" | "medium" | "large" = "medium"): string {
  const sizeMap = {
    small: "",
    medium: "@2x",
    large: "@4x",
  };
  return `https://openweathermap.org/img/wn/${iconCode}${sizeMap[size]}.png`;
}

/**
 * Get emoji for weather condition
 */
export function getWeatherEmoji(condition: SimpleWeatherInfo["condition"]): string {
  const emojiMap: Record<SimpleWeatherInfo["condition"], string> = {
    sunny: "☀️",
    "partly-cloudy": "⛅",
    cloudy: "☁️",
    rainy: "🌧️",
    stormy: "⛈️",
    snowy: "❄️",
    foggy: "🌫️",
  };
  return emojiMap[condition] || "🌤️";
}

/**
 * Format temperature with unit
 */
export function formatTemperature(temp: number, unit: "C" | "F" = "C"): string {
  if (unit === "F") {
    return `${Math.round(temp * 9/5 + 32)}°F`;
  }
  return `${Math.round(temp)}°C`;
}

/**
 * Get weather recommendation based on conditions
 */
export function getWeatherRecommendation(weather: SimpleWeatherInfo): string {
  if (weather.condition === "rainy" || weather.precipProbability > 50) {
    return "Bring an umbrella! ☔";
  }
  if (weather.condition === "snowy") {
    return "Bundle up and wear warm layers! 🧥";
  }
  if (weather.temperature > 30) {
    return "Stay hydrated and wear sunscreen! 🧴";
  }
  if (weather.temperature < 10) {
    return "Dress warmly, it's chilly! 🧣";
  }
  if (weather.condition === "sunny") {
    return "Perfect weather for outdoor activities! 😎";
  }
  return "Enjoy your day! 🌤️";
}
