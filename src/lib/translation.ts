/**
 * Translation API Integration
 *
 * Provides real-time translation for travel scenarios including:
 * - Menu translation
 * - Sign/text translation
 * - Emergency phrases
 * - Cultural context interpretation
 *
 * Providers (in priority order):
 * 1. Google Cloud Translation API - Best quality, paid ($20/1M chars)
 * 2. DeepL API - Excellent quality, FREE tier (500K chars/month)
 * 3. Microsoft Translator - Good quality, FREE tier (2M chars/month)
 * 4. MyMemory API - FREE (1000 words/day), no API key needed
 * 5. Lingva Translate - FREE (Google Translate proxy, no key)
 * 6. Offline cache - Pre-translated emergency phrases
 *
 * API Docs:
 * - Google: https://cloud.google.com/translate/docs
 * - DeepL: https://www.deepl.com/docs-api (FREE: https://www.deepl.com/pro#developer)
 * - Microsoft: https://learn.microsoft.com/en-us/azure/cognitive-services/translator/
 * - MyMemory: https://mymemory.translated.net/doc/spec.php
 * - Lingva: https://github.com/thedaviddelta/lingva-translate
 */

import { cacheKey, CACHE_TTL, CACHE_NS, setCache, getCache } from "./cache";

// ============================================
// API CONFIGURATION
// ============================================

// Google Cloud Translation (Primary - paid)
const GOOGLE_TRANSLATE_API_KEY = process.env.GOOGLE_TRANSLATE_API_KEY || "";
const GOOGLE_TRANSLATE_URL = "https://translation.googleapis.com/language/translate/v2";
const GOOGLE_DETECT_URL = "https://translation.googleapis.com/language/translate/v2/detect";
const GOOGLE_LANGUAGES_URL = "https://translation.googleapis.com/language/translate/v2/languages";

// DeepL API (FREE tier: 500,000 chars/month)
// Register at: https://www.deepl.com/pro#developer (select FREE plan)
const DEEPL_API_KEY = process.env.DEEPL_API_KEY || "";
const DEEPL_URL = DEEPL_API_KEY.endsWith(":fx")
  ? "https://api-free.deepl.com/v2" // Free API uses different endpoint
  : "https://api.deepl.com/v2";

// Microsoft Translator (FREE tier: 2M chars/month)
// Register at: https://azure.microsoft.com/en-us/products/cognitive-services/translator
const MICROSOFT_TRANSLATOR_KEY = process.env.MICROSOFT_TRANSLATOR_KEY || "";
const MICROSOFT_TRANSLATOR_REGION = process.env.MICROSOFT_TRANSLATOR_REGION || "global";
const MICROSOFT_TRANSLATOR_URL = "https://api.cognitive.microsofttranslator.com";

// Lingva Translate (FREE - Google Translate proxy, no API key needed)
// Public instances: https://github.com/thedaviddelta/lingva-translate#instances
const LINGVA_URL = process.env.LINGVA_URL || "https://lingva.ml";

// MyMemory API (FREE - no API key required for basic usage)
// Free tier: 1000 words/day without key, 10000 words/day with free key
const MYMEMORY_URL = "https://api.mymemory.translated.net/get";
const MYMEMORY_EMAIL = process.env.MYMEMORY_EMAIL || "";

// Legacy aliases for backward compatibility
const DETECT_URL = GOOGLE_DETECT_URL;
const LANGUAGES_URL = GOOGLE_LANGUAGES_URL;

// ============================================
// TYPES
// ============================================

export interface TranslationResult {
  originalText: string;
  translatedText: string;
  detectedSourceLanguage?: string;
  targetLanguage: string;
  confidence?: number;
}

export interface LanguageDetection {
  language: string;
  confidence: number;
  isReliable: boolean;
}

export interface SupportedLanguage {
  code: string;
  name: string;
  nativeName?: string;
}

export interface MenuTranslation {
  originalItems: string[];
  translatedItems: TranslationResult[];
  cuisine?: string;
  dietaryNotes?: string[];
}

export interface EmergencyPhrase {
  situation: string;
  phrase: string;
  pronunciation?: string;
  notes?: string;
}

// ============================================
// EMERGENCY PHRASES DATABASE
// ============================================

const EMERGENCY_PHRASES: Record<string, EmergencyPhrase[]> = {
  general: [
    { situation: "help", phrase: "Help!", notes: "Use in emergencies" },
    { situation: "police", phrase: "Call the police!", notes: "For crimes or danger" },
    { situation: "hospital", phrase: "I need a hospital", notes: "Medical emergency" },
    { situation: "doctor", phrase: "I need a doctor", notes: "For illness" },
    { situation: "ambulance", phrase: "Call an ambulance!", notes: "Serious injury" },
    { situation: "fire", phrase: "Fire!", notes: "Fire emergency" },
    { situation: "lost", phrase: "I am lost", notes: "Navigation help" },
    { situation: "stolen", phrase: "I've been robbed", notes: "Theft situation" },
    { situation: "allergic", phrase: "I am allergic to...", notes: "Food/medical allergy" },
    { situation: "embassy", phrase: "Where is the embassy?", notes: "Consular help" },
  ],
};

// Pre-translated emergency phrases for offline use
const OFFLINE_EMERGENCY_PHRASES: Record<string, Record<string, string>> = {
  ja: {
    "Help!": "助けて！(Tasukete!)",
    "Call the police!": "警察を呼んで！(Keisatsu wo yonde!)",
    "I need a hospital": "病院が必要です (Byouin ga hitsuyou desu)",
    "I need a doctor": "医者が必要です (Isha ga hitsuyou desu)",
    "Call an ambulance!": "救急車を呼んで！(Kyuukyuusha wo yonde!)",
    "I am lost": "道に迷いました (Michi ni mayoimashita)",
    "I am allergic to...": "...にアレルギーがあります (...ni arerugii ga arimasu)",
  },
  fr: {
    "Help!": "Au secours !",
    "Call the police!": "Appelez la police !",
    "I need a hospital": "J'ai besoin d'un hôpital",
    "I need a doctor": "J'ai besoin d'un médecin",
    "Call an ambulance!": "Appelez une ambulance !",
    "I am lost": "Je suis perdu(e)",
    "I am allergic to...": "Je suis allergique à...",
  },
  es: {
    "Help!": "¡Ayuda!",
    "Call the police!": "¡Llame a la policía!",
    "I need a hospital": "Necesito un hospital",
    "I need a doctor": "Necesito un médico",
    "Call an ambulance!": "¡Llame una ambulancia!",
    "I am lost": "Estoy perdido/a",
    "I am allergic to...": "Soy alérgico/a a...",
  },
  de: {
    "Help!": "Hilfe!",
    "Call the police!": "Rufen Sie die Polizei!",
    "I need a hospital": "Ich brauche ein Krankenhaus",
    "I need a doctor": "Ich brauche einen Arzt",
    "Call an ambulance!": "Rufen Sie einen Krankenwagen!",
    "I am lost": "Ich habe mich verlaufen",
    "I am allergic to...": "Ich bin allergisch gegen...",
  },
  it: {
    "Help!": "Aiuto!",
    "Call the police!": "Chiami la polizia!",
    "I need a hospital": "Ho bisogno di un ospedale",
    "I need a doctor": "Ho bisogno di un medico",
    "Call an ambulance!": "Chiami un'ambulanza!",
    "I am lost": "Mi sono perso/a",
    "I am allergic to...": "Sono allergico/a a...",
  },
  zh: {
    "Help!": "救命！(Jiùmìng!)",
    "Call the police!": "叫警察！(Jiào jǐngchá!)",
    "I need a hospital": "我需要去医院 (Wǒ xūyào qù yīyuàn)",
    "I need a doctor": "我需要医生 (Wǒ xūyào yīshēng)",
    "Call an ambulance!": "叫救护车！(Jiào jiùhùchē!)",
    "I am lost": "我迷路了 (Wǒ mílù le)",
    "I am allergic to...": "我对...过敏 (Wǒ duì...guòmǐn)",
  },
  ko: {
    "Help!": "도와주세요! (Dowajuseyo!)",
    "Call the police!": "경찰 불러주세요! (Gyeongchal bulleojuseyo!)",
    "I need a hospital": "병원이 필요해요 (Byeongwoni piryohaeyo)",
    "I need a doctor": "의사가 필요해요 (Uisaga piryohaeyo)",
    "Call an ambulance!": "구급차 불러주세요! (Gugeupcha bulleojuseyo!)",
    "I am lost": "길을 잃었어요 (Gireul ilheosseoyo)",
    "I am allergic to...": "...에 알레르기가 있어요 (...e allereugi-ga isseoyo)",
  },
  th: {
    "Help!": "ช่วยด้วย! (Chuay duay!)",
    "Call the police!": "เรียกตำรวจ! (Riak tamruat!)",
    "I need a hospital": "ต้องการโรงพยาบาล (Tongkan rong payaban)",
    "I need a doctor": "ต้องการหมอ (Tongkan mor)",
    "Call an ambulance!": "เรียกรถพยาบาล! (Riak rot payaban!)",
    "I am lost": "ฉันหลงทาง (Chan long thang)",
    "I am allergic to...": "ฉันแพ้... (Chan phae...)",
  },
};

// ============================================
// CONFIGURATION CHECK
// ============================================

export function isTranslationConfigured(): boolean {
  return !!GOOGLE_TRANSLATE_API_KEY;
}

// ============================================
// TRANSLATION FUNCTIONS
// ============================================

/**
 * Translate text to target language with caching and provider fallback
 */
export async function translateText(
  text: string | string[],
  targetLanguage: string,
  sourceLanguage?: string
): Promise<TranslationResult[]> {
  const texts = Array.isArray(text) ? text : [text];

  // Check cache first
  const cacheResults: (TranslationResult | null)[] = texts.map((t) => {
    const key = cacheKey(CACHE_NS.TRANSLATION, t, targetLanguage, sourceLanguage || "auto");
    return getCache<TranslationResult>(key);
  });

  // If all cached, return immediately
  if (cacheResults.every((r) => r !== null)) {
    return cacheResults as TranslationResult[];
  }

  // Find texts that need translation
  const textsToTranslate: { text: string; index: number }[] = [];
  texts.forEach((t, i) => {
    if (cacheResults[i] === null) {
      textsToTranslate.push({ text: t, index: i });
    }
  });

  // Try providers in order: Google → DeepL → Microsoft → Lingva → MyMemory
  let newTranslations: TranslationResult[] = [];

  if (GOOGLE_TRANSLATE_API_KEY) {
    newTranslations = await translateWithGoogle(
      textsToTranslate.map((t) => t.text),
      targetLanguage,
      sourceLanguage
    );
  } else if (DEEPL_API_KEY) {
    newTranslations = await translateWithDeepL(
      textsToTranslate.map((t) => t.text),
      targetLanguage,
      sourceLanguage
    );
  } else if (MICROSOFT_TRANSLATOR_KEY) {
    newTranslations = await translateWithMicrosoft(
      textsToTranslate.map((t) => t.text),
      targetLanguage,
      sourceLanguage
    );
  } else if (LINGVA_URL) {
    newTranslations = await translateWithLingva(
      textsToTranslate.map((t) => t.text),
      targetLanguage,
      sourceLanguage
    );
  } else {
    newTranslations = await translateWithMyMemory(
      textsToTranslate.map((t) => t.text),
      targetLanguage,
      sourceLanguage
    );
  }

  // Cache new translations
  newTranslations.forEach((result, _i) => {
    const key = cacheKey(
      CACHE_NS.TRANSLATION,
      result.originalText,
      targetLanguage,
      sourceLanguage || "auto"
    );
    setCache(key, result, { ttlMs: CACHE_TTL.TRANSLATION });
  });

  // Merge cached and new results
  const results: TranslationResult[] = [...texts.map((t) => ({
    originalText: t,
    translatedText: t,
    targetLanguage,
  }))];

  cacheResults.forEach((cached, i) => {
    if (cached) results[i] = cached;
  });

  newTranslations.forEach((translation, i) => {
    results[textsToTranslate[i].index] = translation;
  });

  return results;
}

/**
 * Translate using Google Cloud Translation API
 */
async function translateWithGoogle(
  texts: string[],
  targetLanguage: string,
  sourceLanguage?: string
): Promise<TranslationResult[]> {
  try {
    const response = await fetch(`${GOOGLE_TRANSLATE_URL}?key=${GOOGLE_TRANSLATE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        q: texts,
        target: targetLanguage,
        source: sourceLanguage,
        format: "text",
      }),
    });

    if (!response.ok) {
      throw new Error(`Google Translation API error: ${response.status}`);
    }

    const data = await response.json();
    const translations = data.data?.translations || [];

    return texts.map((originalText, index) => ({
      originalText,
      translatedText: translations[index]?.translatedText || originalText,
      detectedSourceLanguage: translations[index]?.detectedSourceLanguage,
      targetLanguage,
    }));
  } catch (error) {
    console.error("Google translation error:", error);
    // Fall back to DeepL
    return translateWithDeepL(texts, targetLanguage, sourceLanguage);
  }
}

/**
 * Translate using DeepL API (FREE tier: 500K chars/month)
 * Register at: https://www.deepl.com/pro#developer (select FREE plan)
 */
async function translateWithDeepL(
  texts: string[],
  targetLanguage: string,
  sourceLanguage?: string
): Promise<TranslationResult[]> {
  if (!DEEPL_API_KEY) {
    return translateWithMicrosoft(texts, targetLanguage, sourceLanguage);
  }

  try {
    const deeplTargetLang = targetLanguage.toUpperCase();

    const params = new URLSearchParams();
    texts.forEach(text => params.append("text", text));
    params.append("target_lang", deeplTargetLang);
    if (sourceLanguage) {
      params.append("source_lang", sourceLanguage.toUpperCase());
    }

    const response = await fetch(`${DEEPL_URL}/translate`, {
      method: "POST",
      headers: {
        "Authorization": `DeepL-Auth-Key ${DEEPL_API_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });

    if (!response.ok) {
      throw new Error(`DeepL API error: ${response.status}`);
    }

    const data = await response.json();
    const translations = data.translations || [];

    return texts.map((originalText, index) => ({
      originalText,
      translatedText: translations[index]?.text || originalText,
      detectedSourceLanguage: translations[index]?.detected_source_language?.toLowerCase(),
      targetLanguage,
    }));
  } catch (error) {
    console.error("DeepL translation error:", error);
    return translateWithMicrosoft(texts, targetLanguage, sourceLanguage);
  }
}

/**
 * Translate using Microsoft Translator (FREE tier: 2M chars/month)
 * Register at: https://azure.microsoft.com/en-us/products/cognitive-services/translator
 */
async function translateWithMicrosoft(
  texts: string[],
  targetLanguage: string,
  sourceLanguage?: string
): Promise<TranslationResult[]> {
  if (!MICROSOFT_TRANSLATOR_KEY) {
    return translateWithLingva(texts, targetLanguage, sourceLanguage);
  }

  try {
    const params = new URLSearchParams({
      "api-version": "3.0",
      "to": targetLanguage,
    });
    if (sourceLanguage) {
      params.append("from", sourceLanguage);
    }

    const response = await fetch(
      `${MICROSOFT_TRANSLATOR_URL}/translate?${params}`,
      {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": MICROSOFT_TRANSLATOR_KEY,
          "Ocp-Apim-Subscription-Region": MICROSOFT_TRANSLATOR_REGION,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(texts.map(text => ({ Text: text }))),
      }
    );

    if (!response.ok) {
      throw new Error(`Microsoft Translator API error: ${response.status}`);
    }

    const data = await response.json();

    return texts.map((originalText, index) => ({
      originalText,
      translatedText: data[index]?.translations?.[0]?.text || originalText,
      detectedSourceLanguage: data[index]?.detectedLanguage?.language,
      targetLanguage,
    }));
  } catch (error) {
    console.error("Microsoft Translator error:", error);
    return translateWithLingva(texts, targetLanguage, sourceLanguage);
  }
}

/**
 * Translate using Lingva (FREE - Google Translate proxy, no API key)
 * Public instances: https://github.com/thedaviddelta/lingva-translate#instances
 */
async function translateWithLingva(
  texts: string[],
  targetLanguage: string,
  sourceLanguage?: string
): Promise<TranslationResult[]> {
  const results: TranslationResult[] = [];
  const source = sourceLanguage || "auto";

  for (const text of texts) {
    try {
      const encodedText = encodeURIComponent(text);
      const response = await fetch(
        `${LINGVA_URL}/api/v1/${source}/${targetLanguage}/${encodedText}`
      );

      if (!response.ok) {
        throw new Error(`Lingva API error: ${response.status}`);
      }

      const data = await response.json();

      results.push({
        originalText: text,
        translatedText: data.translation || text,
        detectedSourceLanguage: source === "auto" ? undefined : source,
        targetLanguage,
      });
    } catch (error) {
      console.error("Lingva translation error:", error);
      // Fall back to MyMemory for this text
      const myMemoryResult = await translateWithMyMemory([text], targetLanguage, sourceLanguage);
      results.push(myMemoryResult[0]);
    }
  }

  return results;
}

/**
 * Translate using MyMemory API (free, no API key required)
 * Free tier: 1000 words/day without key, 10000 with email registration
 */
async function translateWithMyMemory(
  texts: string[],
  targetLanguage: string,
  sourceLanguage?: string
): Promise<TranslationResult[]> {
  const results: TranslationResult[] = [];
  const source = sourceLanguage || "en";
  const langPair = `${source}|${targetLanguage}`;

  for (const text of texts) {
    try {
      const params = new URLSearchParams({
        q: text,
        langpair: langPair,
      });

      if (MYMEMORY_EMAIL) {
        params.set("de", MYMEMORY_EMAIL);
      }

      const response = await fetch(`${MYMEMORY_URL}?${params}`);

      if (!response.ok) {
        throw new Error(`MyMemory API error: ${response.status}`);
      }

      const data = await response.json();

      results.push({
        originalText: text,
        translatedText: data.responseData?.translatedText || text,
        detectedSourceLanguage: source,
        targetLanguage,
        confidence: data.responseData?.match,
      });
    } catch (error) {
      console.error("MyMemory translation error:", error);
      // Return original text as fallback
      results.push({
        originalText: text,
        translatedText: text,
        targetLanguage,
      });
    }
  }

  return results;
}

/**
 * Detect language of text
 */
export async function detectLanguage(text: string): Promise<LanguageDetection | null> {
  if (!GOOGLE_TRANSLATE_API_KEY) {
    return null;
  }

  try {
    const response = await fetch(`${DETECT_URL}?key=${GOOGLE_TRANSLATE_API_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ q: text }),
    });

    if (!response.ok) {
      throw new Error(`Language detection error: ${response.status}`);
    }

    const data = await response.json();
    const detection = data.data?.detections?.[0]?.[0];

    if (!detection) return null;

    return {
      language: detection.language,
      confidence: detection.confidence,
      isReliable: detection.isReliable ?? detection.confidence > 0.8,
    };
  } catch (error) {
    console.error("Language detection error:", error);
    return null;
  }
}

/**
 * Get list of supported languages
 */
export async function getSupportedLanguages(
  displayLanguage: string = "en"
): Promise<SupportedLanguage[]> {
  if (!GOOGLE_TRANSLATE_API_KEY) {
    return getOfflineLanguages();
  }

  try {
    const response = await fetch(
      `${LANGUAGES_URL}?key=${GOOGLE_TRANSLATE_API_KEY}&target=${displayLanguage}`
    );

    if (!response.ok) {
      throw new Error(`Languages API error: ${response.status}`);
    }

    const data = await response.json();
    return (data.data?.languages || []).map((lang: { language: string; name: string }) => ({
      code: lang.language,
      name: lang.name,
    }));
  } catch (error) {
    console.error("Get languages error:", error);
    return getOfflineLanguages();
  }
}

/**
 * Get offline language list
 */
function getOfflineLanguages(): SupportedLanguage[] {
  return [
    { code: "en", name: "English", nativeName: "English" },
    { code: "ja", name: "Japanese", nativeName: "日本語" },
    { code: "fr", name: "French", nativeName: "Français" },
    { code: "es", name: "Spanish", nativeName: "Español" },
    { code: "de", name: "German", nativeName: "Deutsch" },
    { code: "it", name: "Italian", nativeName: "Italiano" },
    { code: "zh", name: "Chinese", nativeName: "中文" },
    { code: "ko", name: "Korean", nativeName: "한국어" },
    { code: "th", name: "Thai", nativeName: "ไทย" },
    { code: "pt", name: "Portuguese", nativeName: "Português" },
    { code: "ru", name: "Russian", nativeName: "Русский" },
    { code: "ar", name: "Arabic", nativeName: "العربية" },
    { code: "hi", name: "Hindi", nativeName: "हिन्दी" },
    { code: "vi", name: "Vietnamese", nativeName: "Tiếng Việt" },
    { code: "nl", name: "Dutch", nativeName: "Nederlands" },
  ];
}

// ============================================
// MENU TRANSLATION
// ============================================

/**
 * Translate menu items with food-specific context
 */
export async function translateMenu(
  menuItems: string[],
  targetLanguage: string = "en",
  options?: {
    includeDescriptions?: boolean;
    detectAllergens?: boolean;
  }
): Promise<MenuTranslation> {
  const translations = await translateText(menuItems, targetLanguage);

  const dietaryNotes: string[] = [];

  if (options?.detectAllergens) {
    // Common allergen keywords to detect
    const allergenPatterns = [
      { pattern: /nut|peanut|almond|cashew|walnut/i, note: "Contains nuts" },
      { pattern: /milk|cream|cheese|butter|dairy/i, note: "Contains dairy" },
      { pattern: /egg/i, note: "Contains eggs" },
      { pattern: /shellfish|shrimp|crab|lobster/i, note: "Contains shellfish" },
      { pattern: /fish|salmon|tuna/i, note: "Contains fish" },
      { pattern: /wheat|gluten|bread|flour/i, note: "Contains gluten" },
      { pattern: /soy|tofu/i, note: "Contains soy" },
    ];

    for (const translation of translations) {
      for (const { pattern, note } of allergenPatterns) {
        if (pattern.test(translation.translatedText) && !dietaryNotes.includes(note)) {
          dietaryNotes.push(note);
        }
      }
    }
  }

  return {
    originalItems: menuItems,
    translatedItems: translations,
    dietaryNotes: dietaryNotes.length > 0 ? dietaryNotes : undefined,
  };
}

// ============================================
// EMERGENCY PHRASES
// ============================================

/**
 * Get emergency phrases in target language
 */
export async function getEmergencyPhrases(
  targetLanguage: string,
  situations?: string[]
): Promise<EmergencyPhrase[]> {
  const allPhrases = EMERGENCY_PHRASES.general;
  const phrasesToTranslate = situations
    ? allPhrases.filter((p) => situations.includes(p.situation))
    : allPhrases;

  // Check for offline cached translations first
  const offlinePhrases = OFFLINE_EMERGENCY_PHRASES[targetLanguage];
  if (offlinePhrases) {
    return phrasesToTranslate.map((p) => ({
      ...p,
      phrase: offlinePhrases[p.phrase] || p.phrase,
    }));
  }

  // Use API if available
  if (GOOGLE_TRANSLATE_API_KEY) {
    const translations = await translateText(
      phrasesToTranslate.map((p) => p.phrase),
      targetLanguage
    );

    return phrasesToTranslate.map((p, index) => ({
      ...p,
      phrase: translations[index]?.translatedText || p.phrase,
    }));
  }

  // Return English phrases as fallback
  return phrasesToTranslate;
}

/**
 * Get common travel phrases
 */
export async function getTravelPhrases(
  targetLanguage: string,
  category: "greetings" | "dining" | "directions" | "shopping" | "emergency"
): Promise<Array<{ english: string; translated: string; pronunciation?: string }>> {
  const phrases: Record<string, string[]> = {
    greetings: [
      "Hello",
      "Thank you",
      "Please",
      "Excuse me",
      "Sorry",
      "Yes",
      "No",
      "Goodbye",
    ],
    dining: [
      "Table for two, please",
      "The menu, please",
      "Water, please",
      "The bill, please",
      "Delicious!",
      "No spicy, please",
      "Vegetarian",
      "I have allergies",
    ],
    directions: [
      "Where is...?",
      "Turn left",
      "Turn right",
      "Straight ahead",
      "How far?",
      "Train station",
      "Bus stop",
      "Taxi",
    ],
    shopping: [
      "How much?",
      "Too expensive",
      "Discount?",
      "I'll take it",
      "Just looking",
      "Cash",
      "Credit card",
      "Receipt, please",
    ],
    emergency: [
      "Help!",
      "Police",
      "Hospital",
      "I'm lost",
      "I don't understand",
      "Do you speak English?",
      "Call for help",
      "It's urgent",
    ],
  };

  const categoryPhrases = phrases[category] || phrases.greetings;
  const translations = await translateText(categoryPhrases, targetLanguage, "en");

  return translations.map((t) => ({
    english: t.originalText,
    translated: t.translatedText,
  }));
}

// ============================================
// SIGN & TEXT RECOGNITION
// ============================================

/**
 * Translate text from an image (requires Cloud Vision API)
 * This is a placeholder - full implementation would use Vision API
 */
export async function translateFromImage(
  _imageBase64: string,
  _targetLanguage: string = "en"
): Promise<{
  detectedText: string;
  translatedText: string;
  sourceLanguage?: string;
}> {
  // Note: Full implementation would use Google Cloud Vision API
  // for OCR, then translate the extracted text
  console.warn("Image translation requires Google Cloud Vision API setup");

  return {
    detectedText: "",
    translatedText: "",
    sourceLanguage: undefined,
  };
}

// ============================================
// CULTURAL CONTEXT
// ============================================

export interface CulturalContext {
  phrase: string;
  literalMeaning: string;
  culturalMeaning: string;
  usage: string;
  tips?: string[];
}

/**
 * Get cultural context for common phrases/customs
 */
export function getCulturalContext(
  country: string,
  topic: "greetings" | "dining" | "tipping" | "gestures" | "taboos"
): CulturalContext[] {
  const contexts: Record<string, Record<string, CulturalContext[]>> = {
    japan: {
      greetings: [
        {
          phrase: "いただきます (Itadakimasu)",
          literalMeaning: "I humbly receive",
          culturalMeaning: "Said before eating to express gratitude",
          usage: "Say before every meal",
          tips: ["Putting hands together is optional", "Shows respect for the food"],
        },
        {
          phrase: "ごちそうさまでした (Gochisousama deshita)",
          literalMeaning: "It was a feast",
          culturalMeaning: "Thank you for the meal",
          usage: "Say after finishing a meal",
        },
      ],
      dining: [
        {
          phrase: "Don't stick chopsticks upright in rice",
          literalMeaning: "Chopstick etiquette",
          culturalMeaning: "This resembles incense at funerals",
          usage: "Rest chopsticks on the holder or plate edge",
          tips: ["Never pass food chopstick to chopstick", "Don't point with chopsticks"],
        },
      ],
      tipping: [
        {
          phrase: "Tipping is not customary",
          literalMeaning: "No tips expected",
          culturalMeaning: "Good service is considered standard duty",
          usage: "Don't leave tips at restaurants or hotels",
          tips: ["Tipping can be seen as insulting", "Quality service is a point of pride"],
        },
      ],
      gestures: [],
      taboos: [],
    },
    france: {
      greetings: [
        {
          phrase: "La bise",
          literalMeaning: "The kiss",
          culturalMeaning: "Cheek kisses as greeting",
          usage: "Light kiss on each cheek when greeting friends",
          tips: ["Number varies by region (2-4)", "Usually right cheek first"],
        },
      ],
      dining: [
        {
          phrase: "Keep hands on the table",
          literalMeaning: "Table manners",
          culturalMeaning: "Hands visible shows you're engaged",
          usage: "Rest wrists on table edge, not in lap",
        },
      ],
      tipping: [
        {
          phrase: "Service compris",
          literalMeaning: "Service included",
          culturalMeaning: "15% tip is included in the bill",
          usage: "Round up or leave small change for excellent service",
        },
      ],
      gestures: [],
      taboos: [],
    },
  };

  const countryContexts = contexts[country.toLowerCase()];
  if (!countryContexts) return [];

  return countryContexts[topic] || [];
}

// ============================================
// UTILITY FUNCTIONS
// ============================================

/**
 * Get language code for a country
 */
export function getCountryLanguage(countryCode: string): string {
  const countryLanguages: Record<string, string> = {
    JP: "ja",
    FR: "fr",
    ES: "es",
    DE: "de",
    IT: "it",
    CN: "zh",
    KR: "ko",
    TH: "th",
    VN: "vi",
    PT: "pt",
    BR: "pt",
    MX: "es",
    AR: "es",
    RU: "ru",
    SA: "ar",
    AE: "ar",
    EG: "ar",
    IN: "hi",
    NL: "nl",
    BE: "nl",
    GR: "el",
    TR: "tr",
    PL: "pl",
    SE: "sv",
    NO: "no",
    DK: "da",
    FI: "fi",
    CZ: "cs",
    HU: "hu",
    ID: "id",
    MY: "ms",
    PH: "tl",
  };

  return countryLanguages[countryCode.toUpperCase()] || "en";
}

/**
 * Format text for natural reading
 */
export function formatTranslation(
  text: string,
  options?: {
    addPronunciation?: boolean;
    targetLanguage?: string;
  }
): string {
  if (!options?.addPronunciation) return text;

  // For CJK languages, pronunciation guides are helpful
  const cjkLanguages = ["ja", "zh", "ko"];
  if (cjkLanguages.includes(options.targetLanguage || "")) {
    // In a full implementation, this would add romanization
    return text;
  }

  return text;
}

export default {
  translateText,
  detectLanguage,
  getSupportedLanguages,
  translateMenu,
  getEmergencyPhrases,
  getTravelPhrases,
  getCulturalContext,
  getCountryLanguage,
  isTranslationConfigured,
};
