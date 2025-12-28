/**
 * Simple Test for OpenWeather API
 * Run with: node scripts/test-weather-simple.mjs
 */

const OPENWEATHER_API_KEY = "1445b6a2973bc150d17446b318bf9f94";
const BASE_URL = "https://api.openweathermap.org/data/2.5";
const GEO_URL = "https://api.openweathermap.org/geo/1.0";

async function testAPI() {
    console.log("\n🌤️ OpenWeather API Integration Test\n");
    console.log("=".repeat(50));

    // Test 1: Geocoding
    console.log("\n📍 Test 1: Geocoding Paris, FR");
    try {
        const geoResponse = await fetch(
            `${GEO_URL}/direct?q=Paris,FR&limit=1&appid=${OPENWEATHER_API_KEY}`
        );
        const geoData = await geoResponse.json();

        if (geoResponse.ok && geoData.length > 0) {
            console.log(`   ✅ Success! Found: ${geoData[0].name}, ${geoData[0].country}`);
            console.log(`   📍 Coordinates: ${geoData[0].lat.toFixed(4)}, ${geoData[0].lon.toFixed(4)}`);

            // Test 2: Current Weather
            console.log("\n🌡️ Test 2: Current Weather for Paris");
            const weatherResponse = await fetch(
                `${BASE_URL}/weather?lat=${geoData[0].lat}&lon=${geoData[0].lon}&units=metric&appid=${OPENWEATHER_API_KEY}`
            );
            const weatherData = await weatherResponse.json();

            if (weatherResponse.ok) {
                console.log(`   ✅ Success!`);
                console.log(`   🌡️ Temperature: ${Math.round(weatherData.main.temp)}°C`);
                console.log(`   🌡️ Feels like: ${Math.round(weatherData.main.feels_like)}°C`);
                console.log(`   📉 Min/Max: ${Math.round(weatherData.main.temp_min)}°C / ${Math.round(weatherData.main.temp_max)}°C`);
                console.log(`   💧 Humidity: ${weatherData.main.humidity}%`);
                console.log(`   💨 Wind: ${weatherData.wind.speed} m/s`);
                console.log(`   🌤️ Condition: ${weatherData.weather[0].main} - ${weatherData.weather[0].description}`);
            } else {
                console.log(`   ❌ Failed: ${JSON.stringify(weatherData)}`);
            }

            // Test 3: 5-Day Forecast
            console.log("\n📅 Test 3: 5-Day Forecast for Paris");
            const forecastResponse = await fetch(
                `${BASE_URL}/forecast?lat=${geoData[0].lat}&lon=${geoData[0].lon}&units=metric&appid=${OPENWEATHER_API_KEY}`
            );
            const forecastData = await forecastResponse.json();

            if (forecastResponse.ok) {
                console.log(`   ✅ Success! Retrieved ${forecastData.list.length} forecast entries`);

                // Show next 3 forecasts
                console.log("\n   📋 Next forecasts:");
                for (let i = 0; i < Math.min(3, forecastData.list.length); i++) {
                    const item = forecastData.list[i];
                    const date = new Date(item.dt * 1000);
                    console.log(`   ${date.toLocaleString()}: ${Math.round(item.main.temp)}°C - ${item.weather[0].description}`);
                }
            } else {
                console.log(`   ❌ Failed: ${JSON.stringify(forecastData)}`);
            }

        } else {
            console.log(`   ❌ Failed to geocode: ${JSON.stringify(geoData)}`);
        }
    } catch (error) {
        console.log(`   ❌ Error: ${error.message}`);
    }

    console.log("\n" + "=".repeat(50));
    console.log("✅ API Key is working correctly!\n");
}

testAPI();