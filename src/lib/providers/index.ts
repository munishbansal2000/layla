/**
 * Providers Module Index
 *
 * Unified LLM provider interface for OpenAI, Gemini, and Ollama.
 * All providers have consistent caching through the BaseProvider.
 *
 * Usage:
 *   import { getProvider, getConfiguredProvider } from './providers';
 *
 *   // Get provider by name
 *   const provider = getProvider('openai');
 *   const response = await provider.chat(messages);
 *
 *   // Get provider based on environment config
 *   const provider = getConfiguredProvider();
 *   const itinerary = await provider.generateStructuredItinerary(context);
 */

// Types
export * from "./types";

// Base provider and registry
export {
  BaseProvider,
  getProvider,
  hasProvider,
  registerProvider,
  getAIMode,
  clearProviderCache,
} from "./base";

// Import providers to register them
import "./openai";
import "./gemini";
import "./ollama";

// Export provider classes and factories
export { OpenAIProvider, createOpenAIProvider } from "./openai";
export { GeminiProvider, createGeminiProvider } from "./gemini";
export { OllamaProvider, createOllamaProvider } from "./ollama";

// ===========================================
// Convenience Functions
// ===========================================

import { getProvider } from "./base";
import type { AIProvider, LLMProvider } from "./types";

/**
 * Get the configured AI provider from environment
 */
export function getConfiguredAIProvider(): AIProvider {
  const provider = process.env.AI_PROVIDER?.toLowerCase();
  if (provider === "gemini" || provider === "google") return "gemini";
  if (provider === "ollama") return "ollama";
  return "openai";
}

/**
 * Get the LLM provider instance based on environment configuration
 */
export function getConfiguredProvider(): LLMProvider {
  return getProvider(getConfiguredAIProvider());
}

/**
 * Get provider information for the configured provider
 */
export function getProviderInfo(): {
  provider: AIProvider;
  model: string;
  description: string;
} {
  const providerType = getConfiguredAIProvider();
  const provider = getProvider(providerType);

  const descriptions: Record<AIProvider, string> = {
    openai: `OpenAI ${provider.getModel()}`,
    gemini: `Google Gemini ${provider.getModel()}`,
    ollama: `Ollama (local) ${provider.getModel()}`,
  };

  return {
    provider: providerType,
    model: provider.getModel(),
    description: descriptions[providerType],
  };
}

/**
 * Check if the configured provider is available
 */
export async function checkProviderHealth() {
  const provider = getConfiguredProvider();
  return provider.checkHealth();
}
