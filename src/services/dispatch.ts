import { getGeminiClient, retryWithBackoff, hasGeminiKey, GEMINI_MODEL } from "./gemini";
import { dbService } from "./db";
import { tierTarget } from "./routing";

/**
 * draftComplaint — Gemini-authored formal RMC complaint built from a validated issue.
 * Citizen-anonymized, references evidence + dossier id, cites the civic responsibility,
 * and never fabricates an RMC response (Doc 4 §6.4, §9 agent constraints).
 * Wrapped in the standard retry ladder with a safe templated fallback (Doc 6).
 */
export async function draftComplaint(
  issue: any,
  targetTitle?: string,
  opts?: { firmer?: boolean; previousTier?: number }
): Promise<string> {
  const recipient = targetTitle || issue.departmentName || "the concerned RMC department";
  const firmer = !!opts?.firmer;
  const prevTier = opts?.previousTier ?? (issue.escalationTier || 0);

  const escalationClause = firmer
    ? `\n\nESCALATION CONTEXT: A prior complaint for this dossier was filed at Tier ${prevTier} and the SLA window lapsed WITHOUT acknowledgement or resolution. This is a FORMAL ESCALATION to a higher authority. Tone must be firmer and reference the unanswered prior complaint and the statutory duty to respond under the Gujarat Right of Citizens to Public Services Act, 2013. Still civil, still fact-only — do NOT fabricate any prior RMC response.`
    : "";

  const prompt = `You are Setu, an autonomous civic-grievance officer filing a FORMAL complaint with the Rajkot Municipal Corporation (RMC) on behalf of citizens (who must remain anonymous).

Write a formal complaint addressed to: ${recipient}.${escalationClause}

Case data:
- Dossier ID: ${issue.dossierId || issue.id}
- Category: ${issue.category}
- Severity: ${issue.severity}
- Summary: ${issue.title}
- Citizen description: "${issue.description}"
- Location: ${issue.ward || "Unknown ward"}, ${issue.zone || "Central"} Zone (lat ${issue.lat}, lng ${issue.lng})
- Corroborating citizen reports: ${issue.confirmedCount || 1}
- Evidence: ${issue.mediaUrl || "photo on file"}

Requirements:
- Formal, civil, RMC-appropriate tone; 120–180 words.
- Do NOT reveal or invent any citizen's identity.
- State the civic responsibility and request prompt resolution within the stated SLA window.
- Reference the evidence link and dossier ID.
- Do NOT fabricate any RMC response, acknowledgement, timeline, or promise of a fix.
Output ONLY the complaint body text (no subject line, no markdown).`;

  const fallback =
    `To ${recipient},\n\n` +
    (firmer
      ? `This is a FORMAL ESCALATION (Dossier ${issue.dossierId || issue.id}). A prior complaint at Tier ${prevTier} lapsed past its SLA window without acknowledgement. `
      : `This is a formal civic complaint (Dossier ${issue.dossierId || issue.id}) `) +
    `regarding a ${issue.severity} severity ${issue.category} issue reported in ${issue.ward || "an RMC ward"}, ${issue.zone || "Central"} Zone. ` +
    `Reported concern: "${issue.description}". Evidence on file: ${issue.mediaUrl || "photo attached"}. ` +
    `This matter falls under the department's civic responsibility; we request prompt inspection and resolution within the applicable SLA window. ` +
    `Citizen identity withheld. — Setu, on behalf of Samadhan citizens.`;

  if (!hasGeminiKey()) {
    console.warn("draftComplaint: no GEMINI_API_KEY, using templated fallback complaint.");
    return fallback;
  }

  try {
    return await retryWithBackoff(async () => {
      const ai = getGeminiClient();
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: prompt,
        config: { temperature: 0.2 },
      });
      const text = (response.text || "").trim();
      if (!text) throw new Error("Empty complaint draft from Gemini");
      return text;
    });
  } catch (error) {
    console.error("draftComplaint failed after retries, using templated fallback:", error);
    return fallback;
  }
}

/**
 * dispatchComplaint — FOUNDATION (no real email yet).
 * Drafts the complaint, writes an idempotent `dispatches` record (idempotency
 * key issueId_tier), appends a `✦ dispatched` Case Log line, and transitions the
 * issue to ESCALATED at the dispatched tier. This makes the case lifecycle real;
 * the actual Gmail send is left as a clearly-marked TODO below.
 *
 * @returns the dispatch record plus the mutated issue fields.
 */
export async function dispatchComplaint(
  issue: any,
  opts?: { tier?: number; body?: string }
): Promise<{ dispatch: any; issue: any }> {
  // First dispatch climbs from tier 0 (validated) to tier 1 (HOD).
  const tier = opts?.tier ?? ((issue.escalationTier || 0) + 1);
  const ladder = issue.escalationLadder || [];
  const target = tierTarget(ladder, tier);
  const toInbox = target?.inbox || issue.demoInbox || "unrouted-demo-inbox";
  const idempotencyKey = `${issue.id}_${tier}`;

  const body = opts?.body || (await draftComplaint(issue, target?.title));

  // ──────────────────────────────────────────────────────────────────────────
  // TODO(Gmail integration — next session): send `body` to `toInbox` via the
  // Gmail API here, with the allowlist guard (Doc 4 §9). On success, set
  // status: 'SENT' and store the real gmailMessageId returned by the API; on
  // failure, set status: 'FAILED'/'RETRYING' and enqueue the dispatch retry
  // queue (Doc 4 §6.4 / Doc 6). Until then we record the dispatch as PENDING
  // with a placeholder message id so the lifecycle + Case Log are real.
  // ──────────────────────────────────────────────────────────────────────────
  const gmailMessageId = `pending-${idempotencyKey}`;

  const dispatch = await dbService.createDispatch({
    issueId: issue.id,
    departmentId: issue.departmentId,
    tier,
    toInbox,
    gmailMessageId,
    body,
    status: "PENDING", // flips to SENT once the Gmail TODO above is implemented
    idempotencyKey,
  });

  // Visible agent trace: the dispatch line in the Case Log.
  await dbService.addCaseLog(issue.id, {
    glyph: "✦",
    kind: "dispatch",
    tier,
    text: `complaint dispatched → ${target?.title || issue.departmentName || "RMC department"} (demo inbox)`,
  });

  // State transition → ESCALATED at this tier.
  const agentStatus = `Setu: Complaint dispatched to ${target?.title || issue.departmentName || "RMC department"}. Awaiting acknowledgement.`;
  await dbService.updateIssue(issue.id, { status: "ESCALATED", escalationTier: tier, agentStatus });
  await dbService.addStatusHistory(issue.id, {
    status: "ESCALATED",
    note: `Complaint dispatched to ${target?.title || issue.departmentName || "RMC department"} (Tier ${tier})`,
  });

  return {
    dispatch,
    issue: { ...issue, status: "ESCALATED", escalationTier: tier, agentStatus },
  };
}

/**
 * escalateCase — the SLA sentinel's per-issue action (Doc 4 §6.5).
 * Climbs one rung of the real 4-tier ladder: re-drafts a FIRMER complaint,
 * writes a new dispatch record at tier+1 (reusing dispatchComplaint's idempotent
 * foundation), bumps escalationTier, sets a NEW slaDueAt, appends an "↑ re-escalated"
 * Case Log line, and updates agentStatus. Caller (sentinel) must ensure tier < 4.
 */
export async function escalateCase(
  issue: any,
  now: Date = new Date()
): Promise<{ dispatch: any; issue: any; tier: number; targetTitle: string }> {
  const currentTier = issue.escalationTier || 0;
  const nextTier = currentTier + 1;
  const ladder = issue.escalationLadder || [];
  const target = tierTarget(ladder, nextTier);
  const targetTitle = target?.title || issue.departmentName || "RMC department";

  // 1. Firmer follow-up draft (own retry + templated fallback inside draftComplaint).
  const body = await draftComplaint(issue, target?.title, { firmer: true, previousTier: currentTier });

  // 2. Reuse the dispatch foundation: idempotent dispatch record at nextTier,
  //    "✦ dispatched" log, status→ESCALATED, escalationTier→nextTier, status history.
  const dispatchResult = await dispatchComplaint(issue, { tier: nextTier, body });

  // 3. New SLA deadline from now, using the issue's SLA window.
  const slaHours = issue.slaHours || 48;
  const slaDueAt = new Date(now.getTime() + slaHours * 3_600_000).toISOString();

  // 4. Distinct re-escalation trace + new deadline + agent status (overrides the
  //    "awaiting acknowledgement" line dispatchComplaint just set).
  const agentStatus = `Setu: No response from Tier ${currentTier}. Re-escalated to ${targetTitle} (Tier ${nextTier}). New SLA ${slaHours}h.`;
  await dbService.updateIssue(issue.id, { status: "ESCALATED", escalationTier: nextTier, slaDueAt, agentStatus });
  await dbService.addCaseLog(issue.id, {
    glyph: "↑",
    kind: "escalation",
    tier: nextTier,
    text: `re-escalated → ${targetTitle} (SLA breach, Tier ${currentTier} → ${nextTier})`,
  });

  return { dispatch: dispatchResult.dispatch, issue: { ...dispatchResult.issue, slaDueAt, agentStatus }, tier: nextTier, targetTitle };
}
