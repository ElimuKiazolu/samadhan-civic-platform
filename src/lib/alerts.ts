import { CivicIssue } from '../types';

/**
 * Real, derived alerts — NO mock/seed data. Built client-side from the live
 * issue feed (the same `/api/issues` data App already holds), so alerts always
 * reflect actual Setu actions and case state. Each alert has a STABLE id keyed
 * off the issue + the event it represents, so read-state (localStorage) survives
 * refreshes and the bell's unread dot clears correctly.
 *
 * Derives from top-level issue fields only (status, escalationTier, slaDueAt,
 * agentStatus, confirmedCount, updatedAt) — these are present on the feed; the
 * caseLog is not loaded into the feed list, so we don't depend on it here.
 */

export type AlertType = 'agent' | 'warning' | 'success' | 'info';

export interface Alert {
  id: string;
  type: AlertType;
  tag: string;
  title: string;
  description: string;
  time: string;
  ts: number;
  issueId: string;
}

const CORROBORATION_MILESTONES = [25, 10, 5];

function relativeTime(iso?: string): string {
  if (!iso) return 'Just now';
  const then = new Date(iso).getTime();
  if (!Number.isFinite(then)) return 'Just now';
  const mins = Math.floor((Date.now() - then) / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

/** Map an issue's current state to its primary alert (one per issue). */
function primaryAlert(issue: CivicIssue): Alert | null {
  const ts = new Date(issue.updatedAt || issue.createdAt || Date.now()).getTime() || Date.now();
  const time = relativeTime(issue.updatedAt || issue.createdAt);
  const dept = (issue as any).departmentName || issue.ward || 'RMC';
  const tier = (issue as any).escalationTier || 0;
  const base = { time, ts, issueId: issue.id };

  switch (issue.status) {
    case 'STALLED':
      return { ...base, id: `${issue.id}:STALLED:${tier}`, type: 'warning', tag: 'SLA Breach',
        title: 'SLA window lapsed', description: issue.agentStatus || `No acknowledgement from ${dept} — Setu re-escalated.` };
    case 'ESCALATED':
      return { ...base, id: `${issue.id}:ESCALATED:${tier}`, type: 'agent', tag: 'Setu Agent',
        title: `Escalated to ${dept} (Tier ${tier})`, description: issue.agentStatus || 'Complaint dispatched; awaiting acknowledgement.' };
    case 'IN_PROGRESS':
      return { ...base, id: `${issue.id}:IN_PROGRESS`, type: 'info', tag: dept,
        title: 'Work in progress', description: issue.agentStatus || `${dept} is working on this case.` };
    case 'RESOLVED':
      return { ...base, id: `${issue.id}:RESOLVED`, type: 'success', tag: dept,
        title: 'Marked resolved', description: issue.agentStatus || 'Resolution recorded for this case.' };
    case 'VALIDATED':
    case 'OPEN' as any:
      return { ...base, id: `${issue.id}:VALIDATED`, type: 'agent', tag: 'Setu Agent',
        title: 'Validated & routed', description: issue.agentStatus || `${issue.category} routed to ${dept}.` };
    default:
      return null; // SUBMITTED / NEEDS_INFO / REJECTED are not feed alerts
  }
}

/**
 * Derive the full alert list from the issues feed, newest first, capped.
 */
export function deriveAlerts(issues: CivicIssue[], cap = 30): Alert[] {
  const alerts: Alert[] = [];
  for (const issue of issues || []) {
    if (!issue || issue.isPublic === false) continue;
    const primary = primaryAlert(issue);
    if (primary) alerts.push(primary);

    // Secondary: corroboration milestone (highest crossed only).
    const count = issue.confirmedCount || 0;
    const milestone = CORROBORATION_MILESTONES.find((m) => count >= m);
    if (milestone) {
      const ts = new Date(issue.updatedAt || issue.createdAt || Date.now()).getTime() || Date.now();
      alerts.push({
        id: `${issue.id}:corrob:${milestone}`,
        type: 'info',
        tag: 'Corroboration',
        title: `${count} neighbours confirmed`,
        description: `"${issue.title}" has crossed ${milestone} confirmations.`,
        time: relativeTime(issue.updatedAt || issue.createdAt),
        ts,
        issueId: issue.id,
      });
    }
  }
  alerts.sort((a, b) => b.ts - a.ts);
  return alerts.slice(0, cap);
}
