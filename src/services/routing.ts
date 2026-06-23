// Real RMC routing + escalation ladder.
// Maps each triage category to its owning Rajkot Municipal Corporation department
// (Doc 4 §13) and builds the real 4-tier escalation ladder (Doc 4 §13 / Doc 5 §6)
// that the SLA sentinel will climb. Attached to each issue on validation.

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

// Category → RMC department (Doc 4 §13).
const DEPARTMENTS: Record<IssueCategory, DepartmentDef> = {
  "Roads/Potholes": {
    departmentId: "bandhkam",
    name: "Bandhkam (Roads & Buildings / Public Works)",
    categories: ["Roads/Potholes"],
    slaHours: 48,
  },
  "Streetlights": {
    departmentId: "lighting",
    name: "Street Light Department",
    categories: ["Streetlights"],
    slaHours: 48,
  },
  "Water": {
    departmentId: "water",
    name: "Water Supply / Water Works",
    categories: ["Water"],
    slaHours: 24,
  },
  "Garbage/Waste": {
    departmentId: "swm",
    name: "Solid Waste Management (S.W.M.) / Conservancy",
    categories: ["Garbage/Waste"],
    slaHours: 48,
  },
  "Drainage/Sewage": {
    departmentId: "drainage",
    name: "Drainage Department",
    categories: ["Drainage/Sewage"],
    slaHours: 24,
  },
  "Other": {
    departmentId: "tp",
    name: "Town Planning (T.P.) / General",
    categories: ["Other"],
    slaHours: 72,
  },
};

/**
 * Builds the real 4-tier escalation ladder for a department + zone (Doc 4 §13):
 *   1. Department officer / HOD
 *   2. Deputy Municipal Commissioner (zone: East/West/Central)
 *   3. Municipal Commissioner (Second Appellate Officer) / Mayor
 *   4. State Grievance Appellate Authority — UD&UHD, Govt. of Gujarat
 */
export function buildEscalationLadder(departmentId: string, departmentName: string, zone: string): EscalationTier[] {
  const z = zone || "Central";
  return [
    { tier: 1, title: `${departmentName} — Head of Department (HOD)`, inbox: inboxFor(departmentId, 1) },
    { tier: 2, title: `Deputy Municipal Commissioner (${z} Zone)`, inbox: inboxFor(departmentId, 2) },
    { tier: 3, title: `Municipal Commissioner (Second Appellate Officer) / Mayor`, inbox: inboxFor(departmentId, 3) },
    { tier: 4, title: `State Grievance Appellate Authority — UD&UHD, Govt. of Gujarat`, inbox: inboxFor(departmentId, 4) },
  ];
}

/**
 * Routes a validated issue: resolves the owning department, attaches the real
 * 4-tier ladder, and computes the first SLA deadline. HIGH severity tightens the
 * SLA window so urgent hazards escalate sooner.
 */
export function routeIssue(
  category: IssueCategory,
  zone: string,
  severity: Severity,
  from: Date = new Date()
): RoutingResult {
  const dept = DEPARTMENTS[category] || DEPARTMENTS["Other"];
  const ladder = buildEscalationLadder(dept.departmentId, dept.name, zone);
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
