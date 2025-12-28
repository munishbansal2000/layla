// Vitest setup file
// This runs before all tests

// Mock environment variables
process.env.OPENAI_API_KEY = "test-key";
process.env.GOOGLE_PLACES_API_KEY = "test-key";
process.env.YELP_API_KEY = "test-key";
process.env.VIATOR_API_KEY = "test-key";

// Extend expect with custom matchers if needed
