/**
 * Travel Advisory API Integration
 *
 * Provides safety and travel information including:
 * - Safety alerts by country/region
 * - Visa requirements
 * - Health advisories (vaccinations, diseases)
 * - Entry requirements (COVID, documentation)
 * - Embassy/consulate information
 *
 * Data Sources:
 * - US State Department Travel Advisories
 * - UK FCDO
 * - WHO Health Advisories
 * - Local embassy data
 */

// ============================================
// TYPES
// ============================================

export type AdvisoryLevel = 1 | 2 | 3 | 4; // 1 = Exercise Normal Precautions, 4 = Do Not Travel

export interface TravelAdvisory {
  country: string;
  countryCode: string;
  level: AdvisoryLevel;
  levelDescription: string;
  summary: string;
  lastUpdated: string;
  source: string;
  regionalAdvisories?: RegionalAdvisory[];
  risks: TravelRisk[];
}

export interface RegionalAdvisory {
  region: string;
  level: AdvisoryLevel;
  description: string;
  avoidAreas?: string[];
}

export interface TravelRisk {
  type: RiskType;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  recommendations: string[];
}

export type RiskType =
  | "crime"
  | "terrorism"
  | "civil_unrest"
  | "natural_disaster"
  | "health"
  | "kidnapping"
  | "maritime"
  | "infrastructure";

export interface VisaRequirement {
  destinationCountry: string;
  nationality: string;
  visaRequired: boolean;
  visaType?: string;
  maxStay?: number; // days
  requirements?: string[];
  processingTime?: string;
  cost?: string;
  notes?: string[];
  source: string;
  lastUpdated: string;
}

export interface HealthAdvisory {
  country: string;
  requiredVaccinations: Vaccination[];
  recommendedVaccinations: Vaccination[];
  healthRisks: HealthRisk[];
  covidRequirements?: CovidRequirement;
  emergencyNumber: string;
  medicalFacilityQuality: "excellent" | "good" | "adequate" | "limited" | "poor";
  travelInsuranceRecommended: boolean;
}

export interface Vaccination {
  name: string;
  required: boolean;
  notes?: string;
}

export interface HealthRisk {
  disease: string;
  risk: "low" | "moderate" | "high";
  prevention: string[];
  areas?: string[];
}

export interface CovidRequirement {
  vaccinationRequired: boolean;
  testRequired: boolean;
  testType?: string;
  testTiming?: string;
  quarantineRequired: boolean;
  quarantineDays?: number;
  maskRequired: boolean;
  lastUpdated: string;
  notes?: string[];
}

export interface Embassy {
  country: string;
  type: "embassy" | "consulate" | "honorary_consulate";
  city: string;
  address: string;
  phone: string;
  emergencyPhone?: string;
  email?: string;
  website?: string;
  hours?: string;
  services: string[];
  location?: { lat: number; lng: number };
}

export interface EntryRequirement {
  country: string;
  documents: DocumentRequirement[];
  customs: CustomsInfo;
  currencyRestrictions?: string;
  prohibitedItems: string[];
  declarationRequired: boolean;
}

export interface DocumentRequirement {
  document: string;
  required: boolean;
  notes?: string;
}

export interface CustomsInfo {
  dutyFreeAllowances: {
    alcohol?: string;
    tobacco?: string;
    perfume?: string;
    gifts?: string;
    currency?: string;
  };
  restrictions: string[];
}

// ============================================
// TRAVEL ADVISORIES DATABASE
// ============================================

const ADVISORY_DATA: Record<string, Partial<TravelAdvisory>> = {
  JP: {
    country: "Japan",
    countryCode: "JP",
    level: 1,
    levelDescription: "Exercise Normal Precautions",
    summary: "Japan is generally very safe for travelers with low crime rates.",
    risks: [
      {
        type: "natural_disaster",
        severity: "medium",
        description: "Earthquakes and typhoons are possible",
        recommendations: [
          "Download disaster alert apps",
          "Know evacuation procedures",
          "Follow local authority guidance",
        ],
      },
    ],
  },
  FR: {
    country: "France",
    countryCode: "FR",
    level: 2,
    levelDescription: "Exercise Increased Caution",
    summary: "Exercise increased caution due to terrorism and civil unrest.",
    risks: [
      {
        type: "terrorism",
        severity: "medium",
        description: "Terrorist attacks can occur with little or no warning",
        recommendations: [
          "Stay aware in public places",
          "Monitor local media",
          "Follow instructions from local authorities",
        ],
      },
      {
        type: "civil_unrest",
        severity: "medium",
        description: "Demonstrations can occur and may turn violent",
        recommendations: ["Avoid demonstrations", "Monitor local news"],
      },
    ],
  },
  TH: {
    country: "Thailand",
    countryCode: "TH",
    level: 1,
    levelDescription: "Exercise Normal Precautions",
    summary: "Exercise normal precautions. Some areas have increased risk.",
    regionalAdvisories: [
      {
        region: "Southern Border Provinces",
        level: 4,
        description: "Do not travel due to ongoing violence",
        avoidAreas: ["Yala", "Pattani", "Narathiwat", "Songkhla (southern parts)"],
      },
    ],
    risks: [
      {
        type: "crime",
        severity: "low",
        description: "Petty crime occurs in tourist areas",
        recommendations: [
          "Watch belongings in crowded areas",
          "Use hotel safes",
          "Be cautious with valuables",
        ],
      },
    ],
  },
  MX: {
    country: "Mexico",
    countryCode: "MX",
    level: 2,
    levelDescription: "Exercise Increased Caution",
    summary: "Exercise increased caution due to crime and kidnapping. Some areas have higher risk.",
    regionalAdvisories: [
      {
        region: "Cancun/Riviera Maya",
        level: 2,
        description: "Exercise increased caution, but generally safe tourist area",
      },
      {
        region: "Mexico City",
        level: 2,
        description: "Exercise increased caution due to crime",
      },
    ],
    risks: [
      {
        type: "crime",
        severity: "high",
        description: "Violent crime is a concern throughout the country",
        recommendations: [
          "Use toll roads when driving",
          "Avoid traveling at night",
          "Stay in well-known tourist areas",
        ],
      },
    ],
  },
};

// ============================================
// VISA REQUIREMENTS DATABASE
// ============================================

const VISA_DATA: Record<string, Record<string, Partial<VisaRequirement>>> = {
  JP: {
    US: {
      visaRequired: false,
      maxStay: 90,
      notes: ["For tourism/business", "Passport must be valid for duration of stay"],
    },
    UK: {
      visaRequired: false,
      maxStay: 90,
      notes: ["For tourism/business"],
    },
    CN: {
      visaRequired: true,
      visaType: "Tourist Visa",
      processingTime: "5-7 business days",
      requirements: [
        "Valid passport",
        "Completed application form",
        "Photo",
        "Flight itinerary",
        "Hotel reservations",
      ],
    },
  },
  FR: {
    US: {
      visaRequired: false,
      maxStay: 90,
      notes: ["Schengen area - 90 days within 180-day period"],
    },
    UK: {
      visaRequired: false,
      maxStay: 90,
      notes: ["Schengen area - 90 days within 180-day period"],
    },
  },
  US: {
    UK: {
      visaRequired: false,
      maxStay: 90,
      notes: ["ESTA required", "Apply at least 72 hours before travel"],
      cost: "$21 ESTA fee",
      requirements: ["Valid e-passport", "ESTA approval", "Return ticket"],
    },
    JP: {
      visaRequired: false,
      maxStay: 90,
      notes: ["ESTA required", "Apply at least 72 hours before travel"],
      cost: "$21 ESTA fee",
    },
  },
};

// ============================================
// HEALTH DATA
// ============================================

const HEALTH_DATA: Record<string, Partial<HealthAdvisory>> = {
  JP: {
    requiredVaccinations: [],
    recommendedVaccinations: [
      { name: "Routine vaccines", required: false },
      { name: "Hepatitis A", required: false, notes: "If eating street food" },
      { name: "Japanese Encephalitis", required: false, notes: "For rural areas" },
    ],
    healthRisks: [],
    emergencyNumber: "119",
    medicalFacilityQuality: "excellent",
    travelInsuranceRecommended: true,
  },
  TH: {
    requiredVaccinations: [],
    recommendedVaccinations: [
      { name: "Hepatitis A", required: false },
      { name: "Hepatitis B", required: false },
      { name: "Typhoid", required: false },
      { name: "Japanese Encephalitis", required: false, notes: "For extended stays" },
    ],
    healthRisks: [
      {
        disease: "Dengue Fever",
        risk: "moderate",
        prevention: ["Use insect repellent", "Wear long sleeves", "Use mosquito nets"],
      },
      {
        disease: "Traveler's Diarrhea",
        risk: "moderate",
        prevention: ["Drink bottled water", "Avoid ice in drinks", "Eat freshly cooked food"],
      },
    ],
    emergencyNumber: "1669",
    medicalFacilityQuality: "good",
    travelInsuranceRecommended: true,
  },
  MX: {
    requiredVaccinations: [],
    recommendedVaccinations: [
      { name: "Hepatitis A", required: false },
      { name: "Typhoid", required: false },
      { name: "Hepatitis B", required: false, notes: "For longer trips" },
    ],
    healthRisks: [
      {
        disease: "Traveler's Diarrhea",
        risk: "high",
        prevention: ["Drink bottled water", "Avoid street food if unsure"],
      },
      {
        disease: "Zika",
        risk: "low",
        prevention: ["Use insect repellent", "Pregnant women should consult doctor"],
        areas: ["Coastal areas"],
      },
    ],
    emergencyNumber: "911",
    medicalFacilityQuality: "good",
    travelInsuranceRecommended: true,
  },
};

// ============================================
// EMBASSY DATA
// ============================================

const EMBASSY_DATA: Record<string, Record<string, Embassy[]>> = {
  JP: {
    US: [
      {
        country: "Japan",
        type: "embassy",
        city: "Tokyo",
        address: "1-10-5 Akasaka, Minato-ku, Tokyo 107-8420",
        phone: "+81-3-3224-5000",
        emergencyPhone: "+81-3-3224-5000",
        website: "https://jp.usembassy.gov",
        hours: "Mon-Fri 8:30-17:30",
        services: ["Passport", "Visa", "Citizen Services", "Notarial"],
        location: { lat: 35.6693, lng: 139.7427 },
      },
      {
        country: "Japan",
        type: "consulate",
        city: "Osaka",
        address: "2-11-5 Nishitenma, Kita-ku, Osaka 530-8543",
        phone: "+81-6-6315-5900",
        website: "https://jp.usembassy.gov/embassy-consulates/osaka/",
        hours: "Mon-Fri 8:30-17:30",
        services: ["Passport", "Citizen Services", "Notarial"],
        location: { lat: 34.6990, lng: 135.5034 },
      },
    ],
  },
};

// ============================================
// CONFIGURATION CHECK
// ============================================

export function isTravelAdvisoryConfigured(): boolean {
  // Works with offline data, no API required
  return true;
}

// ============================================
// ADVISORY FUNCTIONS
// ============================================

/**
 * Get travel advisory for a country
 */
export async function getTravelAdvisory(countryCode: string): Promise<TravelAdvisory | null> {
  const data = ADVISORY_DATA[countryCode.toUpperCase()];
  if (!data) {
    return getGenericAdvisory(countryCode);
  }

  return {
    country: data.country || countryCode,
    countryCode: countryCode.toUpperCase(),
    level: data.level || 1,
    levelDescription: data.levelDescription || "Exercise Normal Precautions",
    summary: data.summary || "No specific advisories at this time.",
    lastUpdated: new Date().toISOString().split("T")[0],
    source: "Travel Advisory Database",
    regionalAdvisories: data.regionalAdvisories,
    risks: data.risks || [],
  };
}

/**
 * Get generic advisory for unknown countries
 */
function getGenericAdvisory(countryCode: string): TravelAdvisory {
  return {
    country: countryCode,
    countryCode: countryCode.toUpperCase(),
    level: 2,
    levelDescription: "Exercise Increased Caution",
    summary: "Check official government travel advisories for the most current information.",
    lastUpdated: new Date().toISOString().split("T")[0],
    source: "Generic",
    risks: [
      {
        type: "crime",
        severity: "medium",
        description: "Standard travel precautions recommended",
        recommendations: [
          "Research your destination before traveling",
          "Register with your embassy",
          "Keep copies of important documents",
        ],
      },
    ],
  };
}

/**
 * Get advisory level description
 */
export function getAdvisoryLevelInfo(level: AdvisoryLevel): {
  color: string;
  description: string;
  icon: string;
} {
  switch (level) {
    case 1:
      return {
        color: "green",
        description: "Exercise Normal Precautions",
        icon: "✅",
      };
    case 2:
      return {
        color: "yellow",
        description: "Exercise Increased Caution",
        icon: "⚠️",
      };
    case 3:
      return {
        color: "orange",
        description: "Reconsider Travel",
        icon: "🟠",
      };
    case 4:
      return {
        color: "red",
        description: "Do Not Travel",
        icon: "🔴",
      };
  }
}

// ============================================
// VISA FUNCTIONS
// ============================================

/**
 * Get visa requirements
 */
export async function getVisaRequirements(
  destinationCountry: string,
  nationality: string
): Promise<VisaRequirement> {
  const countryData = VISA_DATA[destinationCountry.toUpperCase()];
  const nationalityData = countryData?.[nationality.toUpperCase()];

  if (nationalityData) {
    return {
      destinationCountry,
      nationality,
      visaRequired: nationalityData.visaRequired ?? true,
      visaType: nationalityData.visaType,
      maxStay: nationalityData.maxStay,
      requirements: nationalityData.requirements,
      processingTime: nationalityData.processingTime,
      cost: nationalityData.cost,
      notes: nationalityData.notes,
      source: "Visa Database",
      lastUpdated: new Date().toISOString().split("T")[0],
    };
  }

  // Default: assume visa required
  return {
    destinationCountry,
    nationality,
    visaRequired: true,
    notes: ["Please verify visa requirements with the destination country's embassy"],
    source: "Default",
    lastUpdated: new Date().toISOString().split("T")[0],
  };
}

// ============================================
// HEALTH FUNCTIONS
// ============================================

/**
 * Get health advisory for a country
 */
export async function getHealthAdvisory(countryCode: string): Promise<HealthAdvisory> {
  const data = HEALTH_DATA[countryCode.toUpperCase()];

  if (data) {
    return {
      country: countryCode,
      requiredVaccinations: data.requiredVaccinations || [],
      recommendedVaccinations: data.recommendedVaccinations || [],
      healthRisks: data.healthRisks || [],
      covidRequirements: data.covidRequirements,
      emergencyNumber: data.emergencyNumber || "Local emergency services",
      medicalFacilityQuality: data.medicalFacilityQuality || "adequate",
      travelInsuranceRecommended: data.travelInsuranceRecommended ?? true,
    };
  }

  // Default health advisory
  return {
    country: countryCode,
    requiredVaccinations: [],
    recommendedVaccinations: [{ name: "Routine vaccines", required: false }],
    healthRisks: [],
    emergencyNumber: "Check local emergency numbers",
    medicalFacilityQuality: "adequate",
    travelInsuranceRecommended: true,
  };
}

// ============================================
// EMBASSY FUNCTIONS
// ============================================

/**
 * Find embassies/consulates in a country
 */
export async function findEmbassies(
  inCountry: string,
  forNationality: string,
  city?: string
): Promise<Embassy[]> {
  const countryEmbassies = EMBASSY_DATA[inCountry.toUpperCase()];
  const nationalityEmbassies = countryEmbassies?.[forNationality.toUpperCase()];

  if (!nationalityEmbassies) {
    return [];
  }

  if (city) {
    return nationalityEmbassies.filter(
      (e) => e.city.toLowerCase() === city.toLowerCase()
    );
  }

  return nationalityEmbassies;
}

/**
 * Find nearest embassy
 */
export async function findNearestEmbassy(
  inCountry: string,
  forNationality: string,
  location: { lat: number; lng: number }
): Promise<Embassy | null> {
  const embassies = await findEmbassies(inCountry, forNationality);

  if (embassies.length === 0) return null;

  // Find nearest by distance
  let nearest = embassies[0];
  let nearestDistance = Infinity;

  for (const embassy of embassies) {
    if (embassy.location) {
      const distance = calculateDistance(location, embassy.location);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = embassy;
      }
    }
  }

  return nearest;
}

function calculateDistance(
  point1: { lat: number; lng: number },
  point2: { lat: number; lng: number }
): number {
  const R = 6371; // Earth's radius in km
  const dLat = ((point2.lat - point1.lat) * Math.PI) / 180;
  const dLng = ((point2.lng - point1.lng) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((point1.lat * Math.PI) / 180) *
      Math.cos((point2.lat * Math.PI) / 180) *
      Math.sin(dLng / 2) *
      Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ============================================
// ENTRY REQUIREMENTS
// ============================================

/**
 * Get entry requirements for a country
 */
export async function getEntryRequirements(countryCode: string): Promise<EntryRequirement> {
  // Generic entry requirements
  return {
    country: countryCode,
    documents: [
      { document: "Valid passport", required: true, notes: "Valid for at least 6 months" },
      { document: "Return/onward ticket", required: true },
      { document: "Proof of accommodation", required: false, notes: "May be requested" },
      { document: "Proof of funds", required: false, notes: "May be requested" },
    ],
    customs: {
      dutyFreeAllowances: {
        alcohol: "1-2 liters (varies by country)",
        tobacco: "200 cigarettes or equivalent",
        gifts: "Varies by country (often $400-800 value)",
      },
      restrictions: ["Check local regulations for specific items"],
    },
    prohibitedItems: [
      "Illegal drugs",
      "Weapons without permit",
      "Counterfeit goods",
      "Endangered species products",
    ],
    declarationRequired: true,
  };
}

// ============================================
// SUMMARY FUNCTIONS
// ============================================

/**
 * Get comprehensive travel brief for a country
 */
export async function getTravelBrief(
  countryCode: string,
  nationality: string
): Promise<{
  advisory: TravelAdvisory | null;
  visa: VisaRequirement;
  health: HealthAdvisory;
  entry: EntryRequirement;
  embassies: Embassy[];
}> {
  const [advisory, visa, health, entry, embassies] = await Promise.all([
    getTravelAdvisory(countryCode),
    getVisaRequirements(countryCode, nationality),
    getHealthAdvisory(countryCode),
    getEntryRequirements(countryCode),
    findEmbassies(countryCode, nationality),
  ]);

  return { advisory, visa, health, entry, embassies };
}

/**
 * Get safety tips for a country
 */
export function getSafetyTips(countryCode: string): string[] {
  const tips: string[] = [
    "Keep copies of important documents (passport, visa, insurance)",
    "Register with your embassy if staying for extended periods",
    "Share your itinerary with family or friends",
    "Know the local emergency numbers",
    "Keep emergency cash in a separate location",
    "Research local scams common to tourists",
    "Get comprehensive travel insurance",
  ];

  // Add country-specific tips
  const advisory = ADVISORY_DATA[countryCode.toUpperCase()];
  if (advisory?.risks) {
    for (const risk of advisory.risks) {
      tips.push(...risk.recommendations);
    }
  }

  return [...new Set(tips)]; // Remove duplicates
}

export default {
  getTravelAdvisory,
  getAdvisoryLevelInfo,
  getVisaRequirements,
  getHealthAdvisory,
  findEmbassies,
  findNearestEmbassy,
  getEntryRequirements,
  getTravelBrief,
  getSafetyTips,
  isTravelAdvisoryConfigured,
};
