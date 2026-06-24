import { dbService } from "./db";
import { buildEscalationLadder } from "./routing";

export const DEMO_ISSUE_ID = "demo-breached-001";

/**
 * seedDemoBreachedIssue — plants ONE breached demo case into whatever store is
 * active (Firestore OR local JSON), so the SLA sentinel escalation can be shown
 * live on the REAL deployed app, not only in local fallback. Idempotent on a fixed
 * id: if the case already exists, its slaDueAt is reset to the past (and tier reset
 * to 1) so it re-escalates again instead of duplicating.
 */
export async function seedDemoBreachedIssue(now: Date = new Date()): Promise<{ created: boolean; issue: any }> {
  const pastSla = new Date(now.getTime() - 3600000).toISOString(); // 1h ago → breached
  const departmentId = "bandhkam";
  const departmentName = "Bandhkam (Roads & Buildings / Public Works)";
  const zone = "Central";
  const ladder = buildEscalationLadder(departmentId, departmentName, zone);
  const agentStatus = "Setu: Dispatched to RMC Roads HOD. No response → SLA breached, awaiting sweep.";

  const existing = await dbService.getIssueById(DEMO_ISSUE_ID);
  if (existing && existing.id === DEMO_ISSUE_ID) {
    // Reset to a fresh breach so the demo can run again without duplicating.
    await dbService.updateIssue(DEMO_ISSUE_ID, {
      status: "ESCALATED",
      escalationTier: 1,
      slaDueAt: pastSla,
      agentStatus,
    });
    const issue = await dbService.getIssueById(DEMO_ISSUE_ID);
    return { created: false, issue };
  }

  const demoIssue = {
    id: DEMO_ISSUE_ID,
    dossierId: "Dossier #DEMO-001-R",
    reporterId: "demo-seed",
    status: "ESCALATED",
    category: "Roads/Potholes",
    severity: "HIGH",
    confidence: 0.95,
    title: "Severe pothole cluster near demo corridor (SLA breach demo)",
    description: "Seeded breached demo case for the autonomous SLA sentinel.",
    mediaUrl: "https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80",
    mediaType: "photo",
    lat: 22.305,
    lng: 70.806,
    location: "University Rd, Metro Corridor",
    ward: "Ward 12",
    zone,
    departmentId,
    departmentName,
    demoInbox: ladder[0].inbox,
    escalationLadder: ladder,
    escalationTier: 1,
    slaHours: 48,
    slaDueAt: pastSla,
    isPublic: true,
    confirmedCount: 7,
    agentStatus,
    timeline: [
      { status: "SUBMITTED", timestamp: "09:00", date: "Today", note: "Demo case seeded" },
      { status: "VALIDATED", timestamp: "09:01", date: "Today", note: "Setu triage: HIGH hazard" },
      { status: "ESCALATED", timestamp: "09:02", date: "Today", note: "Dispatched to Bandhkam HOD (Tier 1)" },
    ],
    caseLog: [
      { ts: new Date(now.getTime() - 5000).toISOString(), glyph: "›", kind: "reasoning", text: "classifying media……………… pothole · severity HIGH" },
      { ts: new Date(now.getTime() - 4000).toISOString(), glyph: "›", kind: "tool", text: "locating………………………… Ward 12, Central Zone" },
      { ts: new Date(now.getTime() - 3000).toISOString(), glyph: "✦", kind: "dispatch", text: "complaint dispatched → Bandhkam HOD (demo inbox)" },
    ],
    comments: [],
  };

  const issue = await dbService.createIssue(demoIssue);
  return { created: true, issue };
}
