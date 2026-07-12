// City-agnostic routing + shared Gujarat escalation ladder.
// Maps each triage category to its owning municipal-corporation department (from
// the per-city registry in cities.ts) and builds the real 4-tier escalation ladder
// (Doc 4 §13 / Doc 5 §6) the SLA sentinel climbs. Attached to each issue on
// validation. Defaults to Rajkot (RMC) when no city is supplied.

import { getCity, DEFAULT_CITY_ID } from "../lib/cities";

export type IssueCategory =
  | "Roads/Potholes"
  | "Streetlights"
  | "Water"
  | "Garbage/Waste"
  | "Drainage/Sewage"
  | "Other";

export type Severity = "LOW" | "MEDIUM" | "HIGH";

export interface EscalationTier {
  tier: number;   // 1–4 (tier 0 on the issue means "validated, not yet dispatched")
  title: string;  // role/authority at this rung of the ladder
  inbox: string;  // allowlisted demo inbox for this rung
}

export interface DepartmentDef {
  departmentId: string;  // bandhkam | lighting | water | swm | drainage | tp
  name: string;
  categories: IssueCategory[];
  slaHours: number;      // base response window before escalation
}

export interface RoutingResult {
  departmentId: string;
  departmentName: string;
  demoInbox: string;             // tier-1 (HOD) intake inbox
  escalationTier: number;        // always 0 here: validated, awaiting first dispatch
  escalationLadder: EscalationTier[];
  slaHours: number;
  slaDueAt: string;              // ISO timestamp of the next escalation deadline
}

// Controlled demo inbox base. All dispatch targets are derived from this via
// plus-addressing so escalation is demonstrable end-to-end while remaining
// structurally impossible to email a real official (Doc 4 §9 allowlist boundary).
const DEMO_INBOX_BASE = process.env.DEMO_INBOX_BASE || "samadhan.rmc.demo@gmail.com";

function inboxFor(departmentId: string, tier: number): string {
  const [user, domain] = DEMO_INBOX_BASE.split("@");
  if (!domain) return DEMO_INBOX_BASE; // malformed base → fail safe to the literal value
  return `${user}+${departmentId}.t${tier}@${domain}`;
}

// Category → department is now DATA (per city) in cities.ts. Routing looks it up
// for the issue's resolved city; with no city it defaults to Rajkot (RMC), so the
// legacy behaviour is byte-identical.

// Rajkot's exact Tier-3 title — the default keeps buildEscalationLadder's output
// unchanged for any caller that doesn't pass a per-corporation title (e.g. seed.ts).
const DEFAULT_TIER3_TITLE = "Municipal Commissioner (Second Appellate Officer) / Mayor";

/**
 * Builds the shared Gujarat 4-tier escalation ladder (Doc 4 §13). Tiers 2 and 4
 * are state-statutory and city-agnostic; Tier 1 is parameterised by department and
 * Tier 3 by the corporation (via `tier3Title`). The `tier3Title` default reproduces
 * Rajkot's original string exactly, so existing 3-arg callers are unaffected.
 *   1. Department officer / HOD
 *   2. Deputy Municipal Commissioner (zone)
 *   3. Municipal Commissioner / Mayor of the corporation
 *   4. State Grievance Appellate Authority — UD&UHD, Govt. of Gujarat
 */
export function buildEscalationLadder(
  departmentId: string,
  departmentName: string,
  zone: string,
  tier3Title: string = DEFAULT_TIER3_TITLE
): EscalationTier[] {
  const z = zone || "Central";
  return [
    { tier: 1, title: `${departmentName} — Head of Department (HOD)`, inbox: inboxFor(departmentId, 1) },
    { tier: 2, title: `Deputy Municipal Commissioner (${z} Zone)`, inbox: inboxFor(departmentId, 2) },
    { tier: 3, title: tier3Title, inbox: inboxFor(departmentId, 3) },
    { tier: 4, title: `State Grievance Appellate Authority — UD&UHD, Govt. of Gujarat`, inbox: inboxFor(departmentId, 4) },
  ];
}

/**
 * Routes a validated issue for its CITY: resolves the owning department from that
 * corporation, attaches the shared 4-tier ladder (Tier 3 named for the corporation),
 * and computes the first SLA deadline. HIGH severity tightens the window.
 *
 * cityId is LAST + optional and defaults to Rajkot, so routeIssue(category, zone,
 * severity, from) behaves exactly as before multi-city (zero regression).
 */
export function routeIssue(
  category: IssueCategory,
  zone: string,
  severity: Severity,
  from: Date = new Date(),
  cityId: string = DEFAULT_CITY_ID
): RoutingResult {
  const city = getCity(cityId);
  const dept = city.departments[category] || city.departments["Other"];
  const ladder = buildEscalationLadder(dept.departmentId, dept.name, zone, city.tier3Title);
  const slaHours = severity === "HIGH" ? Math.max(2, Math.round(dept.slaHours / 4)) : dept.slaHours;
  const slaDueAt = new Date(from.getTime() + slaHours * 3_600_000).toISOString();

  return {
    departmentId: dept.departmentId,
    departmentName: dept.name,
    demoInbox: ladder[0].inbox,
    escalationTier: 0,
    escalationLadder: ladder,
    slaHours,
    slaDueAt,
  };
}

/** Returns the ladder rung for a given tier number (1–4), or null if absent. */
export function tierTarget(ladder: EscalationTier[] | undefined, tier: number): EscalationTier | null {
  if (!ladder) return null;
  return ladder.find((t) => t.tier === tier) || null;
}
