import { CivicIssue } from '../types';

/**
 * Public accountability metrics — derived CLIENT-SIDE from the live issue feed
 * (the same /api/issues data App already holds), so no new backend. The feed is
 * PUBLIC issues only (isPublic==true), which is exactly right for a public
 * transparency view.
 *
 * Honesty principle (per Doc 1 accountability intent): we report the REAL
 * numbers. If nothing has been resolved, resolutionRate is genuinely 0% — a
 * civic accountability dashboard that shows official inaction is making the
 * product's point, not hiding it. We never fabricate resolution stats.
 */

export const CATEGORY_ORDER: CivicIssue['category'][] = [
  'Roads/Potholes',
  'Streetlights',
  'Water',
  'Garbage/Waste',
  'Drainage/Sewage',
  'Other',
];

// Lifecycle order for the status breakdown (newest-meaning last).
export const STATUS_ORDER = [
  'SUBMITTED',
  'VALIDATED',
  'ESCALATED',
  'IN_PROGRESS',
  'STALLED',
  'RESOLVED',
] as const;

export interface CountPct {
  key: string;
  label: string;
  count: number;
  pct: number; // 0–100, relative to total (0 when total is 0)
}

export interface DeptStat {
  name: string;
  open: number;
  total: number;
}

export interface ImpactMetrics {
  total: number;
  resolved: number;
  resolutionRate: number; // 0–100; 0 when total is 0 (NOT faked)
  escalated: number; // ESCALATED + STALLED
  inProgress: number;
  totalConfirmations: number; // Σ confirmedCount
  byCategory: CountPct[]; // all 6 always present
  byStatus: CountPct[]; // all lifecycle statuses always present
  byWard: CountPct[]; // wards that have issues, sorted desc, capped
  topWard: { ward: string; count: number } | null;
  byZone: CountPct[]; // East / West / Central
  setuEscalations: number; // escalationTier >= 1 (dispatched by Setu)
  setuReEscalations: number; // escalationTier >= 2 (sentinel climbed a rung)
  byDepartment: DeptStat[]; // sorted by open desc
  avgResolutionHours: number | null; // APPROXIMATE (createdAt→updatedAt); null if none
  generatedAt: string;
}

function pct(count: number, total: number): number {
  return total > 0 ? Math.round((count / total) * 100) : 0;
}

function shortCategory(c: string): string {
  // "Roads/Potholes" → "Potholes", "Garbage/Waste" → "Waste", else as-is.
  const slash = c.indexOf('/');
  return slash >= 0 ? c.slice(slash + 1) : c;
}

export function computeImpactMetrics(rawIssues: CivicIssue[]): ImpactMetrics {
  const issues = (rawIssues || []).filter((i) => i && i.isPublic !== false);
  const total = issues.length;

  let resolved = 0;
  let escalated = 0;
  let inProgress = 0;
  let totalConfirmations = 0;
  let setuEscalations = 0;
  let setuReEscalations = 0;

  const catCounts = new Map<string, number>(CATEGORY_ORDER.map((c) => [c, 0]));
  const statusCounts = new Map<string, number>(STATUS_ORDER.map((s) => [s, 0]));
  const wardCounts = new Map<string, number>();
  const zoneCounts = new Map<string, number>(['East', 'West', 'Central'].map((z) => [z, 0]));
  const deptMap = new Map<string, DeptStat>();

  let resolutionMsSum = 0;
  let resolutionSamples = 0;

  for (const issue of issues) {
    const status = issue.status || 'SUBMITTED';
    const anyIssue = issue as any;

    // Status tallies
    statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
    if (status === 'RESOLVED') resolved++;
    if (status === 'ESCALATED' || status === 'STALLED') escalated++;
    if (status === 'IN_PROGRESS') inProgress++;

    // Category (guard unknowns into "Other")
    const cat = catCounts.has(issue.category) ? issue.category : 'Other';
    catCounts.set(cat, (catCounts.get(cat) || 0) + 1);

    // Confirmations
    totalConfirmations += Number(issue.confirmedCount) || 0;

    // Ward / zone
    const ward = (issue.ward || 'Unassigned').toString();
    wardCounts.set(ward, (wardCounts.get(ward) || 0) + 1);
    const zone = (issue.zone || '').toString();
    if (zoneCounts.has(zone)) zoneCounts.set(zone, (zoneCounts.get(zone) || 0) + 1);

    // Setu escalations (tier 1 = first dispatch by Setu; tier ≥ 2 = sentinel re-escalation)
    const tier = Number(anyIssue.escalationTier) || 0;
    if (tier >= 1) setuEscalations++;
    if (tier >= 2) setuReEscalations++;

    // Department open caseload
    const dept = (anyIssue.departmentName || '').toString().trim();
    if (dept) {
      const d = deptMap.get(dept) || { name: dept, open: 0, total: 0 };
      d.total++;
      if (status !== 'RESOLVED') d.open++;
      deptMap.set(dept, d);
    }

    // Approximate resolution time: createdAt → updatedAt for RESOLVED issues.
    if (status === 'RESOLVED' && issue.createdAt && issue.updatedAt) {
      const start = new Date(issue.createdAt).getTime();
      const end = new Date(issue.updatedAt).getTime();
      if (Number.isFinite(start) && Number.isFinite(end) && end >= start) {
        resolutionMsSum += end - start;
        resolutionSamples++;
      }
    }
  }

  const byCategory: CountPct[] = CATEGORY_ORDER.map((c) => ({
    key: c,
    label: shortCategory(c),
    count: catCounts.get(c) || 0,
    pct: pct(catCounts.get(c) || 0, total),
  }));

  const byStatus: CountPct[] = STATUS_ORDER.map((s) => ({
    key: s,
    label: s.replace('_', ' '),
    count: statusCounts.get(s) || 0,
    pct: pct(statusCounts.get(s) || 0, total),
  }));

  const byWard: CountPct[] = [...wardCounts.entries()]
    .map(([ward, count]) => ({ key: ward, label: ward, count, pct: pct(count, total) }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);

  const topWard = byWard.length > 0 ? { ward: byWard[0].label, count: byWard[0].count } : null;

  const byZone: CountPct[] = ['East', 'West', 'Central'].map((z) => ({
    key: z,
    label: z,
    count: zoneCounts.get(z) || 0,
    pct: pct(zoneCounts.get(z) || 0, total),
  }));

  const byDepartment = [...deptMap.values()].sort((a, b) => b.open - a.open);

  const avgResolutionHours =
    resolutionSamples > 0 ? Math.round((resolutionMsSum / resolutionSamples / 3_600_000) * 10) / 10 : null;

  return {
    total,
    resolved,
    resolutionRate: pct(resolved, total),
    escalated,
    inProgress,
    totalConfirmations,
    byCategory,
    byStatus,
    byWard,
    topWard,
    byZone,
    setuEscalations,
    setuReEscalations,
    byDepartment,
    avgResolutionHours,
    generatedAt: new Date().toISOString(),
  };
}
