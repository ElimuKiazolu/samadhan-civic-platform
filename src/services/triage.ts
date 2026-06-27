import { Type } from "@google/genai";
import { dbService } from "./db";
import { encodeGeohash, resolveWardAndZone } from "../lib/geohash";
import { getGeminiClient, retryWithBackoff, hasGeminiKey, GEMINI_MODEL, isModelUnavailableError } from "./gemini";
import { routeIssue, type IssueCategory } from "./routing";
import { dispatchComplaint } from "./dispatch";

interface TriageResult {
  category: "Roads/Potholes" | "Streetlights" | "Water" | "Garbage/Waste" | "Drainage/Sewage" | "Other";
  severity: "LOW" | "MEDIUM" | "HIGH";
  confidence: number;
  title: string;
}

/**
 * Uses Gemini to classify a citizen's report
 */
export async function classifyMedia(description: string, mediaUrl?: string, reasked = false): Promise<TriageResult> {
  const prompt = `You are Setu, a professional municipal-complaints triage analyst for the Rajkot Municipal Corporation (RMC). Classify the citizen report into EXACTLY ONE category using these definitions. A clear civic problem must be placed in its specific category — do NOT default to "Other".

CATEGORY DEFINITIONS (with examples):
- Roads/Potholes: damaged road/footpath surface — potholes, cracks, craters, sinkholes, broken or uneven roads, collapsed pavement, missing manhole covers on roads.
  Example: "huge crater on the road near the metro pillar swallowing bike tyres" -> Roads/Potholes.
- Streetlights: street-lighting faults — dark/non-working lamps, flickering lights, broken or leaning light poles, exposed wiring on a lighting pole.
  Example: "the street lamps along the canal walkway are completely dead at night" -> Streetlights.
- Water: drinking/supply water — pipeline leak or burst, no water supply, very low pressure, contaminated/dirty tap water.
  Example: "a water pipeline has burst and is flooding the crossroads" -> Water.
- Garbage/Waste: solid waste — overflowing bins, uncollected trash piles, garbage dumped on streets/footpaths, dead animals, debris.
  Example: "garbage dump overflowing onto the footpath behind the temple" -> Garbage/Waste.
- Drainage/Sewage: drainage/sewerage — blocked or overflowing drains, raw sewage backflow, gutter/manhole overflow, waterlogging caused by blocked drains.
  Example: "raw sewage is backing up from the storm drain near the gymkhana" -> Drainage/Sewage.
- Other: ONLY when the report is genuinely ambiguous, or clearly not one of the five municipal categories above (e.g. spam, ads, off-topic). Never use Other as a lazy fallback for a clear civic defect.

REPORT TO CLASSIFY:
Report Text: "${description}"
Report Media Context/URL: "${mediaUrl || 'No image attached'}"

Return strict JSON with exactly:
1. category - one of: Roads/Potholes, Streetlights, Water, Garbage/Waste, Drainage/Sewage, Other.
2. severity - LOW, MED, or HIGH. HIGH = active danger to people/vehicles or a major service outage; MED = clear problem, no immediate danger; LOW = minor/cosmetic.
3. confidence - 0.0 to 1.0 that this is a real, valid municipal complaint (low for spam/ads/off-topic, high for a clear civic defect).
4. title - a SPECIFIC, descriptive 4-10 word title naming the exact problem and any stated landmark (e.g. "Deep pothole cluster near Metro Pillar 142"). NEVER output generic placeholders like "Newly reported civic hazard", "Civic issue", "New complaint", or "Untitled".

Output valid strict JSON matching the requested schema.`;

  try {
    const ai = getGeminiClient();
    if (!hasGeminiKey()) {
      throw new Error("GEMINI_API_KEY missing");
    }

    const response = await ai.models.generateContent({
      model: GEMINI_MODEL,
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            category: {
              type: Type.STRING,
              enum: ["Roads/Potholes", "Streetlights", "Water", "Garbage/Waste", "Drainage/Sewage", "Other"]
            },
            severity: {
              type: Type.STRING,
              enum: ["LOW", "MED", "HIGH"]
            },
            confidence: {
              type: Type.NUMBER
            },
            title: {
              type: Type.STRING
            }
          },
          required: ["category", "severity", "confidence", "title"]
        },
        temperature: 0.1
      }
    });

    const parsed = JSON.parse(response.text || "{}");
    if (!parsed.category || !parsed.severity || parsed.confidence === undefined || !parsed.title) {
      throw new Error("Gemini response missing schema keys");
    }

    return {
      category: parsed.category,
      severity: parsed.severity === "MED" ? "MEDIUM" : parsed.severity,
      confidence: parsed.confidence,
      title: parsed.title
    };

  } catch (error: any) {
    console.error("classifyMedia Error:", error);

    // Re-ask once with stricter framing if malformed JSON and was not reasked yet
    if (!reasked && error instanceof SyntaxError) {
      console.log("Malformed JSON detected. Attempting re-ask once with strict prompt.");
      return classifyMedia(description + " (Please output strictly valid raw JSON)", mediaUrl, true);
    }

    // PROPAGATE the failure instead of swallowing it into a safe default.
    // Swallowing here defeated retryWithBackoff (it never saw a throw to retry)
    // and made a Gemini 503 outage indistinguishable from a genuine low-confidence
    // "Other" result. Callers (classifyForPreview / processTriagePipeline) own the
    // degradation: they catch this, detect outage via isModelUnavailableError, and
    // surface a `classifierUnavailable` state so a human can rescue the report.
    throw error;
  }
}

/**
 * classifyForPreview — the READ-ONLY half of triage that powers the citizen's
 * "Setu suggests…" preview step. It classifies (with the full retry/re-ask/
 * safe-default ladder), resolves ward/zone, and does a NON-mutating duplicate
 * lookup so the UI can warn the citizen, but it writes NOTHING. The real merge
 * + persistence happen later, only when the citizen taps "Post" (which calls
 * processTriagePipeline with the confirmed values as overrides).
 */
export async function classifyForPreview(report: {
  description: string;
  mediaUrl?: string;
  lat: number;
  lng: number;
}): Promise<{
  category: TriageResult["category"];
  severity: TriageResult["severity"];
  title: string;
  confidence: number;
  ward: number;
  zone: string;
  duplicateCandidate: { id: string; title: string; confirmedCount: number } | null;
  classifierUnavailable: boolean;
}> {
  let classification: TriageResult;
  let classifierUnavailable = false;
  try {
    // retryWithBackoff now actually retries (classifyMedia propagates failures),
    // so a transient 503 gets 3 backed-off attempts before we degrade.
    classification = await retryWithBackoff(() => classifyMedia(report.description, report.mediaUrl));
  } catch (err) {
    // Distinguish a Google-side outage (503/capacity) from any other failure so
    // the UI can frame it as deliberate graceful degradation. Either way the
    // preview still renders a safe default the citizen can edit/confirm.
    classifierUnavailable = isModelUnavailableError(err);
    console.warn(
      `classifyForPreview: classification failed (classifierUnavailable=${classifierUnavailable}) — returning safe default for manual confirmation.`,
      err
    );
    classification = {
      category: "Other",
      severity: "MEDIUM",
      confidence: 0.3,
      title: report.description.substring(0, 50),
    };
  }

  const locationDetails = resolveWardAndZone(report.lat, report.lng);

  let duplicateCandidate: { id: string; title: string; confirmedCount: number } | null = null;
  try {
    const dup = await dbService.findDuplicates(classification.category, report.lat, report.lng);
    if (dup) {
      duplicateCandidate = {
        id: dup.id,
        title: dup.title || "Existing nearby report",
        confirmedCount: dup.confirmedCount || 1,
      };
    }
  } catch (err) {
    // Read-only dedup check is best-effort; never block the preview on it.
    console.warn("classifyForPreview: duplicate lookup failed (non-fatal):", err);
  }

  return {
    category: classification.category,
    severity: classification.severity,
    title: classification.title,
    confidence: classification.confidence,
    ward: locationDetails.ward,
    zone: locationDetails.zone,
    duplicateCandidate,
    classifierUnavailable,
  };
}

export async function processTriagePipeline(report: {
  description: string;
  mediaUrl?: string;
  lat: number;
  lng: number;
  reporterId?: string;
  /**
   * When present, these are the citizen-confirmed values from the preview step.
   * We trust them in place of a fresh Gemini call (the classification already
   * ran during classifyForPreview), which also honours any edits the citizen
   * made. Steps 2–6 (geo, dedup-merge, decision gate, persist, dispatch) run
   * exactly as in the no-overrides path. Absent overrides => full legacy flow.
   */
  overrides?: {
    category: TriageResult["category"];
    severity: TriageResult["severity"];
    title: string;
    confidence: number;
    /**
     * True when the citizen EXPLICITLY selected the category in the preview
     * (vs passively accepting Setu's auto-guess). A human-confirmed real civic
     * category rescues a failed/low-confidence classification through the gate
     * — so a deliberate report posts publicly even if Gemini was completely down.
     */
    humanConfirmed?: boolean;
  };
  /**
   * Coarse, ward-level coordinates (the one-tap location fallback). When true we
   * SKIP duplicate-merge: a shared ward centroid must not corroborate-merge
   * unrelated reports that merely share an approximate point.
   */
  approxLocation?: boolean;
  /** For the audit trace: Gemini was unavailable during preview classification. */
  classifierUnavailable?: boolean;
}): Promise<{ outcome: "VALIDATED" | "NEEDS_INFO" | "REJECTED" | "DUPLICATE"; issue: any }> {
  const reporterId = report.reporterId || "anonymous-citizen";
  const startTs = new Date().toISOString();
  console.log(`\n--- START TRIAGE PIPELINE FOR REPORT: "${report.description}" ---`);

  // 1. Classification. With confirmed overrides we skip the (already-run) Gemini
  //    call; otherwise classify live with the 3x retry resilience ladder.
  let classification: TriageResult;
  if (report.overrides) {
    classification = {
      category: report.overrides.category,
      severity: report.overrides.severity,
      confidence: report.overrides.confidence,
      title: report.overrides.title,
    };
    console.log(`[Triage Override] Using citizen-confirmed classification -> Category: ${classification.category}, Severity: ${classification.severity}, Confidence: ${classification.confidence}, Title: "${classification.title}"`);
  } else {
  console.log("Step 1: Running classifyMedia via Gemini-3.5-flash...");
  try {
    classification = await retryWithBackoff(() => classifyMedia(report.description, report.mediaUrl));
    console.log(`[Triage Success] Gemini classified -> Category: ${classification.category}, Severity: ${classification.severity}, Confidence: ${classification.confidence}, Title: "${classification.title}"`);
  } catch (err: any) {
    console.warn(`[Triage Fallback] Gemini call completely failed after retries (e.g. rate limit/network). Accepting report as PENDING_REVIEW.`);
    
    const geohash = encodeGeohash(report.lat, report.lng);
    const locInfo = resolveWardAndZone(report.lat, report.lng);
    
    const fallbackIssue = {
      id: `iss-${Date.now()}`,
      dossierId: `Dossier #${Math.floor(1000 + Math.random() * 9000)}-N`,
      reporterId,
      status: "SUBMITTED", // client compatible, maps internally to PENDING_REVIEW
      category: "Other",
      severity: "MEDIUM",
      confidence: 0.5,
      title: report.description.substring(0, 50) + "...",
      description: report.description,
      mediaUrl: report.mediaUrl || 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80',
      mediaType: "photo",
      lat: report.lat,
      lng: report.lng,
      geohash,
      ward: `Ward ${locInfo.ward}`,
      zone: locInfo.zone,
      location: `Ward ${locInfo.ward}, ${locInfo.zone} Zone`,
      isPublic: true,
      confirmedCount: 1,
      agentStatus: "Setu: Offline queue. Awaiting cloud engine review.",
      createdAt: startTs,
      updatedAt: startTs,
      timeline: [
        { status: 'SUBMITTED', timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), date: 'Today', note: 'Emergency submission logged offline' }
      ],
      caseLog: [
        { ts: new Date().toISOString(), glyph: '⟳', kind: 'action', text: 'SLA priority check…………… system offline safety mode fallback' },
        { ts: new Date().toISOString(), glyph: '›', kind: 'reasoning', text: 'queued for human review due to rate constraints' }
      ]
    };
    
    const created = await dbService.createIssue(fallbackIssue);
    return { outcome: "VALIDATED", issue: created };
  }
  }

  // 2. Resolve location to geohash & ward details
  console.log("Step 2: Resolving geographic identifiers...");
  const geohash = encodeGeohash(report.lat, report.lng);
  const locationDetails = resolveWardAndZone(report.lat, report.lng);
  console.log(`Resolved geohash: ${geohash}, Ward: ${locationDetails.ward}, Zone: ${locationDetails.zone}`);

  // 3. Duplicate check within same categories nearby. SKIPPED for approximate
  // (ward-level) coordinates — a coarse shared centroid would wrongly merge
  // unrelated reports. Only precise GPS/EXIF/typed coords dedup.
  const existingDup = report.approxLocation
    ? null
    : await dbService.findDuplicates(classification.category, report.lat, report.lng);
  if (report.approxLocation) {
    console.log("Step 3: Approximate (ward-level) location — skipping duplicate merge.");
  } else {
    console.log("Step 3: Checking for duplicate parallel reports nearby...");
  }

  if (existingDup) {
    console.log(`[Duplicate Found] Strong spatial overlap with existing Dossier ${existingDup.id}. Corroborating instead.`);
    // Increment corroborated count on the existing duplicate
    const newCount = (existingDup.confirmedCount || 0) + 1;
    await dbService.updateIssue(existingDup.id, { confirmedCount: newCount });
    
    // Add Case Log line to indicate peer corroboration
    await dbService.addCaseLog(existingDup.id, {
      glyph: '›',
      kind: 'action',
      text: `corroboration merged………… citizen peer verified location`
    });

    // Add automated support log comment
    await dbService.addComment(existingDup.id, {
      author: 'Setu',
      isAgent: true,
      text: `Additional peer confirmation received at ${new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}. Total verifications: ${newCount}.`
    });

    return { outcome: "DUPLICATE", issue: existingDup };
  }

  // 4. Decision Gate & Status Mapping
  console.log("Step 4: Executing decision gate logic...");
  let outcome: "VALIDATED" | "NEEDS_INFO" | "REJECTED" = "VALIDATED";
  let status: "SUBMITTED" | "VALIDATED" | "ESCALATED" | "IN_PROGRESS" | "STALLED" | "RESOLVED" = "VALIDATED";
  let isPublic = true;
  let agentStatus = "Setu: Triage complete. Complaint queued for RMC dispatch.";

  // Human-confirmed rescue: when the citizen EXPLICITLY picked a REAL civic
  // category (not "Other"), treat that confirmation as high confidence so the
  // gate validates it — even if Gemini returned a low-confidence guess or was
  // completely unavailable. "Other" is never auto-rescued, so the spam/non-civic
  // protection below stays intact for unconfirmed or junk reports.
  const aiConfidence = classification.confidence;
  const humanConfirmed = report.overrides?.humanConfirmed === true;
  const humanRescued = humanConfirmed && classification.category !== "Other";
  const effectiveConfidence = humanRescued ? Math.max(aiConfidence, 0.9) : aiConfidence;
  if (humanRescued) {
    console.log(`[Gate] Human-confirmed ${classification.category}: confidence ${aiConfidence} -> effective ${effectiveConfidence}.`);
  }

  if (effectiveConfidence < 0.5) {
    outcome = "NEEDS_INFO";
    status = "SUBMITTED"; // Map to SUBMITTED to keep compatible with UI schema
    isPublic = false;
    agentStatus = "Setu: Needs additional details. Private message sent.";
  } else if (classification.category === "Other" && effectiveConfidence < 0.6) {
    // Non-civic or spam trigger
    outcome = "REJECTED";
    status = "SUBMITTED";
    isPublic = false;
    agentStatus = "Setu: Rejected. Non-municipal domain topic.";
  }

  // 4b. Routing (Doc 4 §13) — only validated issues are routed to a department,
  // given the real 4-tier escalation ladder, and assigned an SLA deadline.
  let routing: ReturnType<typeof routeIssue> | null = null;
  if (outcome === "VALIDATED") {
    routing = routeIssue(
      classification.category as IssueCategory,
      locationDetails.zone,
      classification.severity,
      new Date(startTs)
    );
    console.log(`Routed -> department ${routing.departmentId} (${routing.departmentName}), SLA ${routing.slaHours}h, due ${routing.slaDueAt}`);
  }

  // Generate unique dossier ID tracking path
  const dossierId = `Dossier #${Math.floor(1000 + Math.random() * 9000)}-${classification.category.substring(0, 1).toUpperCase()}`;

  const classifyLine = report.classifierUnavailable && humanConfirmed
    ? `classified manually · AI classifier unavailable (503)…… ${classification.category} · ${classification.severity}`
    : `classifying media……………… ${classification.category} · ${classification.severity}`;
  const telemetryLines: Array<{ ts: string; glyph: string; kind: string; text: string }> = [
    { ts: new Date(Date.now() - 3000).toISOString(), glyph: report.classifierUnavailable ? '⚠' : '›', kind: 'reasoning', text: classifyLine },
    { ts: new Date(Date.now() - 1500).toISOString(), glyph: '›', kind: 'tool', text: `locating………………………… Ward ${locationDetails.ward}, ${locationDetails.zone} Zone` },
    { ts: new Date().toISOString(), glyph: '✓', kind: 'action', text: `triage decision………………… ${outcome} (confidence: ${effectiveConfidence.toFixed(2)})` }
  ];
  if (routing) {
    telemetryLines.push({ ts: new Date().toISOString(), glyph: '›', kind: 'tool', text: `routing…………………………… ${routing.departmentName}` });
  }

  const newIssue = {
    id: `iss-${Date.now()}`,
    dossierId,
    reporterId,
    status,
    category: classification.category,
    severity: classification.severity,
    confidence: effectiveConfidence,
    aiConfidence,
    humanConfirmed,
    title: classification.title,
    description: report.description,
    mediaUrl: report.mediaUrl || 'https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?auto=format&fit=crop&w=800&q=80',
    mediaType: "photo",
    lat: report.lat,
    lng: report.lng,
    geohash,
    ward: `Ward ${locationDetails.ward}`,
    zone: locationDetails.zone,
    location: `Ward ${locationDetails.ward}, ${locationDetails.zone} Zone`,
    // Routing + escalation ladder (present only for VALIDATED issues)
    ...(routing ? {
      departmentId: routing.departmentId,
      departmentName: routing.departmentName,
      demoInbox: routing.demoInbox,
      escalationLadder: routing.escalationLadder,
      escalationTier: routing.escalationTier, // 0 = validated, awaiting first dispatch
      slaHours: routing.slaHours,
      slaDueAt: routing.slaDueAt,
    } : {}),
    isPublic,
    confirmedCount: 1,
    agentStatus,
    createdAt: startTs,
    updatedAt: startTs,
    timeline: [
      { status: 'SUBMITTED', timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), date: 'Today', note: 'Citizen Submission logged' },
      ...(status === "VALIDATED" ? [{ status: 'VALIDATED', timestamp: new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}), date: 'Today', note: 'Setu Autonomous Triage Passed' }] : [])
    ],
    // Embed subcollections as well for JSON compatibility
    caseLog: telemetryLines,
    comments: []
  };

  console.log(`Step 5: Writing clean structured issue object to persistence (isPublic: ${isPublic})...`);
  const created = await dbService.createIssue(newIssue);

  // If needs more details, mock private notification / request
  if (outcome === "NEEDS_INFO") {
    await dbService.addComment(created.id, {
      author: 'Setu',
      isAgent: true,
      text: "System Note: The reported issue details seem ambiguous or require additional geolocation validation. Please upload a clear photo or provide landmark details to proceed."
    });
  }

  // 6. Complaint draft + dispatch foundation (Doc 4 §6.4) — validated issues only.
  // Drafts the RMC complaint, writes a dispatch record, and transitions to ESCALATED.
  // Non-fatal: a dispatch failure leaves the issue validated and on the feed.
  let finalIssue = created;
  if (outcome === "VALIDATED") {
    try {
      console.log("Step 6: Drafting complaint + writing dispatch record (tier 1 / HOD)...");
      const dispatchResult = await dispatchComplaint(created);
      finalIssue = dispatchResult.issue;
      console.log(`Dispatch recorded [${dispatchResult.dispatch.status}] for ${created.id} -> tier ${dispatchResult.dispatch.tier} (${dispatchResult.dispatch.toInbox})`);
    } catch (dispatchErr) {
      console.error("Dispatch foundation failed (non-fatal, issue stays VALIDATED):", dispatchErr);
    }
  }

  console.log(`--- TRIAGE COMPLETED. Outcome: ${outcome}, ID: ${created.id} ---\n`);
  return { outcome, issue: finalIssue };
}
