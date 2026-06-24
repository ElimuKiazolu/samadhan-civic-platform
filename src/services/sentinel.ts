import { dbService } from "./db";
import { escalateCase } from "./dispatch";

// "OPEN/ESCALATED with no progress" (Doc 4 §6.5). IN_PROGRESS = authority working,
// RESOLVED = done, SUBMITTED = offline/NEEDS_INFO fallback (no ladder) → all skipped.
const OPEN_STATES = new Set(["VALIDATED", "ESCALATED", "STALLED"]);
const MAX_TIER = 4; // top of the real statutory ladder (Doc 4 §13)

export interface SentinelResult {
  ranAt: string;
  scanned: number;
  escalated: Array<{ id: string; fromTier: number; toTier: number; target: string }>;
  maxedOut: Array<{ id: string; tier: number }>;
  skipped: number;
}

/**
 * runSentinel — autonomous SLA loop (Doc 4 §6.5, the headline agentic feature).
 * Scans every issue; for any OPEN/ESCALATED case past its slaDueAt with no progress
 * and below the top tier, escalates one rung. Idempotent: escalateCase pushes
 * slaDueAt into the future and bumps escalationTier, so a double-run re-selects
 * nothing. One bad case never aborts the sweep (Doc 6 resilience).
 */
export async function runSentinel(now: Date = new Date()): Promise<SentinelResult> {
  const result: SentinelResult = { ranAt: now.toISOString(), scanned: 0, escalated: [], maxedOut: [], skipped: 0 };

  let issues: any[] = [];
  try {
    issues = await dbService.getAllIssues();
  } catch (err) {
    console.error("[Sentinel] getAllIssues failed, aborting this tick:", err);
    return result;
  }

  for (const issue of issues) {
    result.scanned++;
    try {
      // Guard 1: open/escalated, no human progress.
      if (!OPEN_STATES.has(issue.status)) { result.skipped++; continue; }

      // Guard 2: must be routed (has ladder + SLA). Offline/private fallbacks have neither.
      if (!issue.slaDueAt || !Array.isArray(issue.escalationLadder) || issue.escalationLadder.length === 0) {
        result.skipped++; continue;
      }

      // Guard 3: SLA window must actually be in the past (this also enforces idempotency —
      // a freshly-escalated case has a future slaDueAt and is skipped on the next run).
      const due = new Date(issue.slaDueAt).getTime();
      if (isNaN(due) || due > now.getTime()) { result.skipped++; continue; }

      // Guard 4: never climb past the top of the real ladder.
      const currentTier = issue.escalationTier || 0;
      if (currentTier >= MAX_TIER) {
        if (issue.status !== "STALLED") {
          await dbService.updateIssue(issue.id, {
            status: "STALLED",
            agentStatus: "Setu: Top of statutory ladder reached (State Appellate Authority). No higher tier; awaiting response.",
          });
          await dbService.addStatusHistory(issue.id, { status: "STALLED", note: "SLA breached at top tier — no higher authority on the ladder." });
          await dbService.addCaseLog(issue.id, { glyph: "⚠", kind: "escalation", text: "SLA breached at top tier — no higher authority to escalate to." });
        }
        result.maxedOut.push({ id: issue.id, tier: currentTier });
        continue;
      }

      // Escalate one rung.
      const r = await escalateCase(issue, now);
      result.escalated.push({ id: issue.id, fromTier: currentTier, toTier: r.tier, target: r.targetTitle });
      console.log(`[Sentinel] escalated ${issue.id}: tier ${currentTier} → ${r.tier} (${r.targetTitle})`);
    } catch (err) {
      console.error(`[Sentinel] failed processing issue ${issue?.id} (continuing sweep):`, err);
      result.skipped++;
    }
  }

  console.log(`[Sentinel] ${result.ranAt}: scanned ${result.scanned}, escalated ${result.escalated.length}, maxedOut ${result.maxedOut.length}, skipped ${result.skipped}`);
  return result;
}
