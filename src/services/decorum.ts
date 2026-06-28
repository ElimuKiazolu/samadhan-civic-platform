/**
 * Setu's feed-participation decorum gate (Doc 4 §6.6 + Doc 6 agent-decorum row).
 *
 * RULE-BASED, NO GEMINI CALL — the decision is simple intent-matching, so a model
 * call would only add cost/latency for no gain. Setu replies to a citizen comment
 * ONLY when it adds value, otherwise stays SILENT. Every reply is templated from
 * FACTS already on the issue — it never asserts an authority response, promises a
 * fix, or invents identifiers.
 *
 * Returns the reply text, or null to stay silent.
 */

interface DecorumIssue {
  status?: string;
  category?: string;
  departmentName?: string;
  escalationTier?: number;
  slaDueAt?: string;
  confirmedCount?: number;
  // Most recent comment on the issue (to enforce the no-back-to-back debounce).
  comments?: Array<{ isAgent?: boolean }>;
}

// ── Value-add triggers (case-insensitive) ──────────────────────────────────
const RE_STATUS_UPDATE = /\b(update|updates|status|progress|any news|whats happening|what's happening|kab|kya hua)\b/i;
const RE_DISPATCH = /\b(report(ed)?|dispatch(ed)?|escalat(e|ed|ion)|complaint|raised|filed|forwarded|sent to)\b/i;
const RE_CORROBORATION_ASK = /\b(anyone else|any one else|others|other people|same (issue|problem|thing)|me too|also seeing|confirm)\b/i;
const RE_QUESTION_WORDS = /\b(what|when|why|how|who|where|is this|are you|can you|will (this|it|they)|has (this|it)|did (anyone|they|you)|any\b)/i;
const RE_ADDRESSED_TO_SETU = /\bsetu\b|\byou\b|\byour\b/i;

function looksLikeQuestion(text: string): boolean {
  return text.includes('?') || RE_QUESTION_WORDS.test(text);
}

type Intent = 'status' | 'dispatch' | 'corroboration' | 'direct-question' | null;

function classifyIntent(textRaw: string): Intent {
  const text = textRaw.toLowerCase();
  const q = looksLikeQuestion(text);

  // 4. Corroboration ask (doesn't require a question mark).
  if (RE_CORROBORATION_ASK.test(text)) return 'corroboration';
  // 3. Escalation / dispatch confirmation (asking whether it was reported/sent).
  if (RE_DISPATCH.test(text) && q) return 'dispatch';
  // 2. Status / "any update" request.
  if (RE_STATUS_UPDATE.test(text) && q) return 'status';
  // Also treat a bare "any update?" / "status?" as status even without extra question words.
  if (RE_STATUS_UPDATE.test(text) && text.includes('?')) return 'status';
  // 1. Direct question to Setu.
  if (q && RE_ADDRESSED_TO_SETU.test(text)) return 'direct-question';

  return null; // statements, thanks, "nice pic", venting → SILENT
}

/** Build a fact-only reply from real issue fields. Never fabricates. */
function templatedReply(intent: Exclude<Intent, null>, issue: DecorumIssue): string {
  const dept = issue.departmentName || 'the responsible RMC department';
  const status = (issue.status || 'SUBMITTED').toUpperCase();
  const tier = issue.escalationTier || 0;
  const dispatched = status === 'ESCALATED' || status === 'STALLED' || tier >= 1;
  const count = issue.confirmedCount || 1;

  if (intent === 'corroboration') {
    return `If you're seeing this too, tap "I see this too" — ${count} ${count === 1 ? 'person has' : 'people have'} confirmed it so far. More confirmations help prioritise it.`;
  }

  // status / dispatch / direct-question all answer from the same factual ledger.
  if (status === 'RESOLVED') {
    return `This case is marked RESOLVED in the record. If the problem persists, please report it again so I can re-open it.`;
  }
  if (status === 'IN_PROGRESS') {
    return `Logged status: IN PROGRESS with ${dept}. I'll relay any further updates here as they're recorded.`;
  }
  if (dispatched) {
    return `This was routed to ${dept} and a complaint was filed (Tier ${tier}). Current status: ${status}. Awaiting their acknowledgement — no response has been logged yet.`;
  }
  if (status === 'VALIDATED' || status === 'OPEN') {
    return `Setu validated this and queued it for ${dept}. Current status: ${status}. No acknowledgement has been logged yet.`;
  }
  // Fallback: share only what's logged, assert nothing.
  return `I can share what's on record: current status is ${status}. I'll post updates here as they're logged.`;
}

/**
 * decideSetuReply — the gate. Returns reply text or null (silent).
 * @param commentText the citizen's just-posted comment
 * @param issue       the issue with its current comment list (for debounce)
 */
export function decideSetuReply(commentText: string, issue: DecorumIssue): string | null {
  const text = (commentText || '').trim();
  if (text.length < 2) return null;

  // Debounce: never reply back-to-back. If the most recent comment is already
  // Setu's, stay silent (one reply per logical event, no runaway chains).
  const comments = Array.isArray(issue.comments) ? issue.comments : [];
  const last = comments[comments.length - 1];
  if (last && last.isAgent) return null;

  const intent = classifyIntent(text);
  if (!intent) return null; // no value to add → observe silently

  return templatedReply(intent, issue);
}
