/**
 * Emergency Services Locator
 *
 * Provides emergency information including:
 * - Local emergency numbers
 * - Nearby hospitals and pharmacies
 * - Police stations
 * - Lost/stolen document procedures
 *
 * Data Sources:
 * - Google Places API
 * - Static emergency data
 */

import { searchNearbyPlaces } from "./google-places";

// ============================================
// TYPES
// ============================================

export interface EmergencyNumbers {
  country: string;
  countryCode: string;
  general: string;
  police: string;
  ambulance: string;
  fire: string;
  roadside?: string;
  tourist?: string;
  poisonControl?: string;
  notes?: string[];
}

export interface EmergencyFacility {
  id: string;
  name: string;
  type: FacilityType;
  address: string;
  phone?: string;
  distance?: number; // meters
  isOpen?: boolean;
  openingHours?: string;
  location: { lat: number; lng: number };
  rating?: number;
}

export type FacilityType =
  | "hospital"
  | "clinic"
  | "pharmacy"
  | "police"
  | "embassy"
  | "urgent_care"
  | "dentist"
  | "veterinarian";

export interface LostDocumentInfo {
  document: DocumentType;
  immediateSteps: string[];
  reportingLocations: string[];
  replacementProcess: string[];
  estimatedTime: string;
  costs?: string;
  tips: string[];
}

export type DocumentType = "passport" | "wallet" | "credit_card" | "phone" | "luggage";

export interface InsuranceClaim {
  type: string;
  requiredDocuments: string[];
  process: string[];
  deadlines: string;
  tips: string[];
}

// ============================================
// EMERGENCY NUMBERS DATABASE
// ============================================

const EMERGENCY_NUMBERS: Record<string, EmergencyNumbers> = {
  US: {
    country: "United States",
    countryCode: "US",
    general: "911",
    police: "911",
    ambulance: "911",
    fire: "911",
    roadside: "AAA: 1-800-222-4357",
    poisonControl: "1-800-222-1222",
  },
  JP: {
    country: "Japan",
    countryCode: "JP",
    general: "110 (Police) / 119 (Fire/Ambulance)",
    police: "110",
    ambulance: "119",
    fire: "119",
    tourist: "Japan Helpline: 0570-000-911",
    notes: [
      "English support may be limited on emergency lines",
      "Japan Helpline has 24/7 English support",
      "Download Japan Official Travel App for emergencies",
    ],
  },
  FR: {
    country: "France",
    countryCode: "FR",
    general: "112",
    police: "17",
    ambulance: "15",
    fire: "18",
    notes: ["112 works throughout EU", "SAMU (15) for medical emergencies"],
  },
  GB: {
    country: "United Kingdom",
    countryCode: "GB",
    general: "999 or 112",
    police: "999",
    ambulance: "999",
    fire: "999",
    notes: ["111 for non-emergency medical advice"],
  },
  TH: {
    country: "Thailand",
    countryCode: "TH",
    general: "191 (Police) / 1669 (Medical)",
    police: "191",
    ambulance: "1669",
    fire: "199",
    tourist: "Tourist Police: 1155",
    notes: [
      "Tourist Police speak English",
      "1155 for tourist-related issues",
      "1669 connects to emergency medical services",
    ],
  },
  MX: {
    country: "Mexico",
    countryCode: "MX",
    general: "911",
    police: "911",
    ambulance: "911",
    fire: "911",
    tourist: "Tourist Assistance: 078",
    notes: ["078 specifically for tourist assistance", "English speakers available on 911 in tourist areas"],
  },
  AU: {
    country: "Australia",
    countryCode: "AU",
    general: "000",
    police: "000",
    ambulance: "000",
    fire: "000",
    poisonControl: "13 11 26",
    notes: ["112 also works from mobile phones"],
  },
  DE: {
    country: "Germany",
    countryCode: "DE",
    general: "112",
    police: "110",
    ambulance: "112",
    fire: "112",
    notes: ["112 is the EU-wide emergency number"],
  },
  IT: {
    country: "Italy",
    countryCode: "IT",
    general: "112",
    police: "113",
    ambulance: "118",
    fire: "115",
    notes: ["Carabinieri (military police): 112"],
  },
  ES: {
    country: "Spain",
    countryCode: "ES",
    general: "112",
    police: "091",
    ambulance: "061",
    fire: "080",
    notes: ["112 for all emergencies", "Local police: 092"],
  },
  SG: {
    country: "Singapore",
    countryCode: "SG",
    general: "999 (Police) / 995 (Ambulance/Fire)",
    police: "999",
    ambulance: "995",
    fire: "995",
    notes: ["English is widely spoken"],
  },
  KR: {
    country: "South Korea",
    countryCode: "KR",
    general: "112 (Police) / 119 (Fire/Ambulance)",
    police: "112",
    ambulance: "119",
    fire: "119",
    tourist: "Tourist Hotline: 1330",
    notes: ["1330 has English speakers available 24/7"],
  },
};

// ============================================
// LOST DOCUMENT PROCEDURES
// ============================================

const LOST_DOCUMENT_INFO: Record<DocumentType, LostDocumentInfo> = {
  passport: {
    document: "passport",
    immediateSteps: [
      "File a police report immediately",
      "Contact your embassy or consulate",
      "Gather passport photos and any ID copies",
    ],
    reportingLocations: [
      "Local police station",
      "Embassy or consulate",
    ],
    replacementProcess: [
      "Obtain police report",
      "Visit embassy with: police report, passport photos, identification",
      "Complete emergency passport application",
      "Pay replacement fee",
    ],
    estimatedTime: "Emergency passport: 1-3 days; Full replacement: 1-2 weeks",
    costs: "Emergency passport fees vary by country ($150-200 typical)",
    tips: [
      "Keep digital copies of your passport in secure cloud storage",
      "Carry a photocopy separately from your actual passport",
      "Know your embassy's location before you need it",
      "Some countries issue emergency travel documents faster than full passports",
    ],
  },
  wallet: {
    document: "wallet",
    immediateSteps: [
      "Cancel all credit/debit cards immediately",
      "File a police report",
      "Contact your bank",
      "Check if travel insurance covers stolen items",
    ],
    reportingLocations: [
      "Local police station",
      "Bank (via phone)",
    ],
    replacementProcess: [
      "Cancel cards via bank apps or phone",
      "Request emergency cash from bank if available",
      "Use Western Union or similar for emergency funds",
      "Replace cards upon return home",
    ],
    estimatedTime: "Card cancellation: Immediate; Replacement cards: Upon return",
    tips: [
      "Use bank apps to instantly freeze cards",
      "Have backup payment method (second card, phone payment)",
      "Keep emergency cash separate from wallet",
      "Note card numbers separately for quick cancellation",
    ],
  },
  credit_card: {
    document: "credit_card",
    immediateSteps: [
      "Call card issuer to report lost/stolen",
      "Freeze card via banking app if available",
      "Check for unauthorized transactions",
    ],
    reportingLocations: ["Card issuer (phone)", "Bank app"],
    replacementProcess: [
      "Report to card company",
      "Request emergency card if available abroad",
      "Set up virtual card for immediate use",
    ],
    estimatedTime: "Card freeze: Immediate; Emergency card: 1-3 days",
    tips: [
      "Most card issuers have 24/7 international numbers",
      "Some can expedite replacement cards internationally",
      "Add cards to phone wallet as backup",
    ],
  },
  phone: {
    document: "phone",
    immediateSteps: [
      "Use Find My Device to locate/lock/wipe",
      "Contact carrier to suspend service",
      "Change passwords for key accounts",
      "File police report",
    ],
    reportingLocations: ["Police station", "Mobile carrier"],
    replacementProcess: [
      "Lock device remotely",
      "Report to police with IMEI number",
      "Suspend SIM card",
      "Purchase temporary replacement if needed",
    ],
    estimatedTime: "Remote lock: Immediate; SIM replacement: Same day",
    tips: [
      "Know your IMEI number (dial *#06#)",
      "Enable Find My Device before travel",
      "Use 2FA app backups",
      "Consider travel insurance that covers electronics",
    ],
  },
  luggage: {
    document: "luggage",
    immediateSteps: [
      "Report to airline immediately at airport",
      "Get PIR (Property Irregularity Report)",
      "Provide detailed description and contact info",
      "Keep all receipts for essential purchases",
    ],
    reportingLocations: ["Airline baggage service desk", "Online claim portal"],
    replacementProcess: [
      "File claim with airline",
      "Track bag via airline app",
      "Submit receipts for essential purchases",
      "File insurance claim if not resolved",
    ],
    estimatedTime: "Tracking: Immediate; Most bags found within 24-48 hours",
    costs: "Airlines typically reimburse essential purchases",
    tips: [
      "Put AirTag or similar tracker in luggage",
      "Keep valuables and essentials in carry-on",
      "Take photo of luggage and contents before travel",
      "Know airline's liability limits",
    ],
  },
};

// ============================================
// CONFIGURATION CHECK
// ============================================

export function isEmergencyServicesConfigured(): boolean {
  return true; // Always available with offline data
}

// ============================================
// EMERGENCY NUMBER FUNCTIONS
// ============================================

/**
 * Get emergency numbers for a country
 */
export function getEmergencyNumbers(countryCode: string): EmergencyNumbers | null {
  return EMERGENCY_NUMBERS[countryCode.toUpperCase()] || null;
}

/**
 * Get all emergency numbers (for offline access)
 */
export function getAllEmergencyNumbers(): EmergencyNumbers[] {
  return Object.values(EMERGENCY_NUMBERS);
}

/**
 * Get the most important number to call
 */
export function getPrimaryEmergencyNumber(countryCode: string): string {
  const numbers = getEmergencyNumbers(countryCode);
  return numbers?.general || "112"; // 112 works in many countries
}

// ============================================
// FACILITY LOCATOR FUNCTIONS
// ============================================

/**
 * Find nearby emergency facilities
 */
export async function findNearbyFacilities(
  location: { lat: number; lng: number },
  type: FacilityType,
  options?: {
    radius?: number; // meters
    limit?: number;
  }
): Promise<EmergencyFacility[]> {
  const googlePlaceType = mapFacilityTypeToGoogle(type);

  try {
    const places = await searchNearbyPlaces(location.lat, location.lng, {
      types: [googlePlaceType],
      radius: options?.radius || 5000,
      maxResults: options?.limit || 10,
    });

    return places.map((place) => ({
      id: place.id,
      name: place.name,
      type,
      address: place.address || "",
      phone: place.phone,
      isOpen: place.isOpenNow,
      location: place.coordinates || location,
      rating: place.rating,
    }));
  } catch (error) {
    console.error("Error finding facilities:", error);
    return [];
  }
}

/**
 * Find nearest hospital
 */
export async function findNearestHospital(
  location: { lat: number; lng: number }
): Promise<EmergencyFacility | null> {
  const hospitals = await findNearbyFacilities(location, "hospital", { limit: 1 });
  return hospitals[0] || null;
}

/**
 * Find 24-hour pharmacy
 */
export async function findOpenPharmacy(
  location: { lat: number; lng: number }
): Promise<EmergencyFacility[]> {
  const pharmacies = await findNearbyFacilities(location, "pharmacy");
  return pharmacies.filter((p) => p.isOpen);
}

// ============================================
// LOST DOCUMENT FUNCTIONS
// ============================================

/**
 * Get lost document procedure
 */
export function getLostDocumentInfo(documentType: DocumentType): LostDocumentInfo {
  return LOST_DOCUMENT_INFO[documentType];
}

/**
 * Get immediate steps for lost item
 */
export function getImmediateSteps(documentType: DocumentType): string[] {
  return LOST_DOCUMENT_INFO[documentType]?.immediateSteps || [];
}

// ============================================
// INSURANCE FUNCTIONS
// ============================================

/**
 * Get insurance claim guidance
 */
export function getInsuranceClaimGuidance(type: string): InsuranceClaim {
  const claims: Record<string, InsuranceClaim> = {
    medical: {
      type: "Medical Emergency",
      requiredDocuments: [
        "Medical reports and receipts",
        "Proof of payment",
        "Police report (if applicable)",
        "Travel insurance policy details",
      ],
      process: [
        "Contact insurance company immediately",
        "Get authorization for treatment if possible",
        "Keep all original receipts and documents",
        "Take photos of documents",
        "Submit claim within deadline (usually 30-90 days)",
      ],
      deadlines: "Most policies require notification within 24-48 hours",
      tips: [
        "Save insurance company's 24/7 number in phone",
        "Some insurers require pre-authorization for expensive treatments",
        "Keep copies of all documents",
      ],
    },
    theft: {
      type: "Theft",
      requiredDocuments: [
        "Police report",
        "List of stolen items with values",
        "Proof of ownership (receipts, photos)",
        "Travel insurance policy details",
      ],
      process: [
        "File police report immediately",
        "Document everything stolen with values",
        "Notify insurance company",
        "Submit claim with all documentation",
      ],
      deadlines: "Report theft within 24 hours; submit claim within 30 days",
      tips: [
        "Take photos of valuables before travel",
        "Keep receipts for expensive items",
        "Know your policy's per-item limits",
      ],
    },
    trip_cancellation: {
      type: "Trip Cancellation",
      requiredDocuments: [
        "Proof of reason for cancellation",
        "Booking confirmations and receipts",
        "Cancellation confirmations",
        "Medical certificates if illness-related",
      ],
      process: [
        "Contact travel providers to cancel",
        "Get cancellation confirmations in writing",
        "Contact insurance company",
        "Submit all documentation",
      ],
      deadlines: "Notify insurer as soon as you know you must cancel",
      tips: [
        "Check what reasons are covered by your policy",
        "Get written confirmation of all cancellations",
        "Some policies require cancellation for covered reasons only",
      ],
    },
  };

  return claims[type] || claims.theft;
}

// ============================================
// HELPER FUNCTIONS
// ============================================

/**
 * Map facility type to Google Places type
 */
function mapFacilityTypeToGoogle(type: FacilityType): string {
  const typeMap: Record<FacilityType, string> = {
    hospital: "hospital",
    clinic: "doctor",
    pharmacy: "pharmacy",
    police: "police",
    embassy: "embassy",
    urgent_care: "hospital",
    dentist: "dentist",
    veterinarian: "veterinary_care",
  };

  return typeMap[type] || "hospital";
}

/**
 * Format emergency info for display
 */
export function formatEmergencyCard(countryCode: string): string {
  const numbers = getEmergencyNumbers(countryCode);
  if (!numbers) return "Emergency info not available";

  return `
🚨 EMERGENCY NUMBERS - ${numbers.country}
━━━━━━━━━━━━━━━━━━━━━━
🚔 Police: ${numbers.police}
🚑 Ambulance: ${numbers.ambulance}
🚒 Fire: ${numbers.fire}
${numbers.tourist ? `🎫 Tourist Help: ${numbers.tourist}` : ""}
${numbers.notes ? "\n📝 Notes:\n" + numbers.notes.map((n) => "• " + n).join("\n") : ""}
`.trim();
}

/**
 * Get emergency quick actions
 */
export function getEmergencyQuickActions(countryCode: string): Array<{
  action: string;
  number: string;
  icon: string;
}> {
  const numbers = getEmergencyNumbers(countryCode);
  if (!numbers) {
    return [{ action: "Emergency (EU)", number: "112", icon: "🆘" }];
  }

  const actions = [
    { action: "Police", number: numbers.police, icon: "🚔" },
    { action: "Ambulance", number: numbers.ambulance, icon: "🚑" },
    { action: "Fire", number: numbers.fire, icon: "🚒" },
  ];

  if (numbers.tourist) {
    actions.push({ action: "Tourist Help", number: numbers.tourist, icon: "🎫" });
  }

  return actions;
}

export default {
  getEmergencyNumbers,
  getAllEmergencyNumbers,
  getPrimaryEmergencyNumber,
  findNearbyFacilities,
  findNearestHospital,
  findOpenPharmacy,
  getLostDocumentInfo,
  getImmediateSteps,
  getInsuranceClaimGuidance,
  formatEmergencyCard,
  getEmergencyQuickActions,
  isEmergencyServicesConfigured,
};
