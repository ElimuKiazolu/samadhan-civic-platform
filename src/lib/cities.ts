import type { IssueCategory } from "./validation";

/**
 * City registry — the ONLY place civic data lives. Adding a 4th Gujarat city
 * later is purely a matter of appending an entry here; no routing/resolution code
 * changes. All three cities are Gujarat municipal corporations under the BPMC Act
 * 1949 and share the Gujarat Right of Citizens to Public Services Act, 2013
 * statutory escalation ladder — so only their departments + zones + geography
 * differ, which is exactly what this file holds.
 *
 * ── CIVIC-DATA ACCURACY LEDGER (spot-check before the demo) ──────────────────
 * VERIFIED:
 *  - Corporation names: RMC / AMC / SMC (all real).
 *  - City centres (well-known coordinates).
 *  - AMC has ~7 administrative zones (Central/East/West/North/South/South-West/
 *    North-West). SMC uses directional admin zones (Central/North/East/South/
 *    South-West/South-East) per suratonline.in.
 *  - SMC's water utility is the "Hydraulic Department" (suratmunicipal.gov.in).
 *  - SMC "Drainage Department" (suratmunicipal.gov.in).
 *  - All three run the standard Gujarat functional departments (water, drainage,
 *    roads, solid-waste, street-light, town-planning).
 * APPROXIMATE — verify (marked inline below):
 *  - Exact official street-light / roads department titles per city.
 *  - Ward counts (AMC cited as 48 post-2021 delimitation, older sources say 64;
 *    SMC ~30). Ward number is a cosmetic approximation (see resolveWardAndZone).
 *  - SMC current zone count (6 directional confirmed; SMC may have reorganised to
 *    7–8 — verify).
 *  - SLA windows are OUR chosen defaults (same across cities), not per-city statute.
 * Nothing here is fabricated: where a specific bureau title couldn't be verified,
 * the standard functional name is used and flagged.
 */

export interface CityDepartment {
  departmentId: string;
  name: string;
  slaHours: number; // base response window before escalation (our default)
}

export interface CityDef {
  id: string;               // 'rajkot' | 'ahmedabad' | 'surat'
  cityName: string;         // 'Rajkot'
  corporationName: string;  // 'Rajkot Municipal Corporation'
  corporationShort: string; // 'RMC'
  centre: { lat: number; lng: number };
  bbox: { minLat: number; maxLat: number; minLng: number; maxLng: number };
  zones: string[];
  wardCount: number;
  /** Category → owning department for THIS corporation. */
  departments: Record<IssueCategory, CityDepartment>;
  /** Tier-3 rung title (per-corporation Commissioner/Mayor). Rajkot's is kept
   *  byte-identical to the pre-multi-city string for zero regression. */
  tier3Title: string;
}

// SLA windows reused across cities (per category) — see ledger note above.
const SLA = { water: 24, drainage: 24, roads: 48, swm: 48, lighting: 48, tp: 72 };

export const CITIES: Record<string, CityDef> = {
  // ── RAJKOT — the reference city. Departments + zones + wardCount MUST stay
  //    identical to the original routing.ts so Rajkot behaves exactly as before.
  rajkot: {
    id: "rajkot",
    cityName: "Rajkot",
    corporationName: "Rajkot Municipal Corporation",
    corporationShort: "RMC",
    centre: { lat: 22.3, lng: 70.8 },
    bbox: { minLat: 22.0, maxLat: 22.6, minLng: 70.5, maxLng: 71.1 },
    zones: ["East", "West", "Central"],
    wardCount: 18,
    departments: {
      "Roads/Potholes": { departmentId: "bandhkam", name: "Bandhkam (Roads & Buildings / Public Works)", slaHours: SLA.roads },
      "Streetlights": { departmentId: "lighting", name: "Street Light Department", slaHours: SLA.lighting },
      "Water": { departmentId: "water", name: "Water Supply / Water Works", slaHours: SLA.water },
      "Garbage/Waste": { departmentId: "swm", name: "Solid Waste Management (S.W.M.) / Conservancy", slaHours: SLA.swm },
      "Drainage/Sewage": { departmentId: "drainage", name: "Drainage Department", slaHours: SLA.drainage },
      "Other": { departmentId: "tp", name: "Town Planning (T.P.) / General", slaHours: SLA.tp },
    },
    // EXACT original string — do not change (zero-regression).
    tier3Title: "Municipal Commissioner (Second Appellate Officer) / Mayor",
  },

  // ── AHMEDABAD — Ahmedabad Municipal Corporation (AMC).
  ahmedabad: {
    id: "ahmedabad",
    cityName: "Ahmedabad",
    corporationName: "Ahmedabad Municipal Corporation",
    corporationShort: "AMC",
    centre: { lat: 23.03, lng: 72.58 },
    bbox: { minLat: 22.9, maxLat: 23.15, minLng: 72.45, maxLng: 72.75 },
    // 7 administrative zones (verified structure; membership stable).
    zones: ["Central", "East", "West", "North", "South", "South-West", "North-West"],
    wardCount: 48, // APPROXIMATE — verify (48 post-2021 delimitation; older: 64)
    departments: {
      "Roads/Potholes": { departmentId: "roads", name: "Roads & Buildings Department", slaHours: SLA.roads }, // APPROXIMATE title — verify
      "Streetlights": { departmentId: "lighting", name: "Street Light Department", slaHours: SLA.lighting }, // APPROXIMATE title — verify
      "Water": { departmentId: "water", name: "Water Supply Department", slaHours: SLA.water }, // AMC Water Supply (verified functional)
      "Garbage/Waste": { departmentId: "swm", name: "Solid Waste Management Department", slaHours: SLA.swm }, // VERIFIED (AMC SWM Dept)
      "Drainage/Sewage": { departmentId: "drainage", name: "Drainage Department", slaHours: SLA.drainage }, // AMC drainage/sewerage
      "Other": { departmentId: "tp", name: "Town Planning Department", slaHours: SLA.tp }, // VERIFIED (AMC Town Planning)
    },
    tier3Title: "Municipal Commissioner / Mayor — Ahmedabad Municipal Corporation",
  },

  // ── SURAT — Surat Municipal Corporation (SMC).
  surat: {
    id: "surat",
    cityName: "Surat",
    corporationName: "Surat Municipal Corporation",
    corporationShort: "SMC",
    centre: { lat: 21.17, lng: 72.83 },
    bbox: { minLat: 21.05, maxLat: 21.28, minLng: 72.72, maxLng: 72.98 },
    // Directional admin zones (verified via suratonline.in). SMC may have added
    // a West/8th zone — verify before demo.
    zones: ["Central", "North", "East", "South", "South-West", "South-East"],
    wardCount: 30, // APPROXIMATE — verify
    departments: {
      "Roads/Potholes": { departmentId: "roads", name: "Roads & Buildings Department", slaHours: SLA.roads }, // APPROXIMATE title — verify
      "Streetlights": { departmentId: "lighting", name: "Street Light Department", slaHours: SLA.lighting }, // APPROXIMATE title — verify
      "Water": { departmentId: "water", name: "Hydraulic Department", slaHours: SLA.water }, // VERIFIED (SMC water utility = Hydraulic Dept)
      "Garbage/Waste": { departmentId: "swm", name: "Solid Waste Management Department", slaHours: SLA.swm }, // SMC SWM / Sanitation
      "Drainage/Sewage": { departmentId: "drainage", name: "Drainage Department", slaHours: SLA.drainage }, // VERIFIED (SMC Drainage Dept)
      "Other": { departmentId: "tp", name: "Town Planning Department", slaHours: SLA.tp }, // SMC Town Planning
    },
    tier3Title: "Municipal Commissioner / Mayor — Surat Municipal Corporation",
  },
};

export const DEFAULT_CITY_ID = "rajkot";

/** Get a city by id, falling back to the reference city (Rajkot). */
export function getCity(cityId?: string | null): CityDef {
  return (cityId && CITIES[cityId]) || CITIES[DEFAULT_CITY_ID];
}

function inBbox(lat: number, lng: number, b: CityDef["bbox"]): boolean {
  return lat >= b.minLat && lat <= b.maxLat && lng >= b.minLng && lng <= b.maxLng;
}

export interface CityResolution {
  city: CityDef;
  /** True when the point fell outside all covered cities and we picked the
   *  nearest one — the UI can label this honestly. */
  outsideCoverage: boolean;
}

/**
 * Resolve which city a coordinate belongs to. The three cities are geographically
 * far apart, so a bbox hit is unambiguous. A point outside all three snaps to the
 * nearest city centre and is flagged outsideCoverage (honest fallback, never a crash).
 */
export function resolveCity(lat: number, lng: number): CityResolution {
  if (Number.isFinite(lat) && Number.isFinite(lng)) {
    for (const id of Object.keys(CITIES)) {
      if (inBbox(lat, lng, CITIES[id].bbox)) return { city: CITIES[id], outsideCoverage: false };
    }
    // Nearest centre by squared distance.
    let nearest = CITIES[DEFAULT_CITY_ID];
    let best = Infinity;
    for (const id of Object.keys(CITIES)) {
      const c = CITIES[id].centre;
      const d = (lat - c.lat) ** 2 + (lng - c.lng) ** 2;
      if (d < best) { best = d; nearest = CITIES[id]; }
    }
    return { city: nearest, outsideCoverage: true };
  }
  return { city: CITIES[DEFAULT_CITY_ID], outsideCoverage: true };
}

/** Lightweight list for the report-flow demo preset selector (client-safe). */
export const CITY_PRESETS = Object.values(CITIES).map((c) => ({
  id: c.id,
  cityName: c.cityName,
  corporationShort: c.corporationShort,
  lat: c.centre.lat,
  lng: c.centre.lng,
}));
