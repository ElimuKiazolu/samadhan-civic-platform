import { Type } from "@google/genai";
import { getGeminiClient, retryWithBackoff, hasGeminiKey, GEMINI_MODEL } from "./gemini";
import { loadImagePart } from "../lib/image";

/**
 * Setu's on-demand fix suggestions for the authority dossier (Doc 4 agentic
 * depth). Generates TWO practical recommendations grounded in the real issue —
 * a temporary mitigation (reduce danger NOW / buy time) and a permanent solution
 * (the proper long-term repair).
 *
 * COST DISCIPLINE: this is called ONLY when an authority opens a dossier, and the
 * result is cached on the issue so it never regenerates (one Gemini call per issue
 * for its entire life). Grounded in category/severity/description + the evidence
 * photo (downscaled). Never fabricates facts; on any failure returns null so the
 * caller shows nothing rather than a broken panel.
 */

export interface FixSuggestions {
  temporary: string;
  permanent: string;
}

export async function generateSuggestions(issue: any): Promise<FixSuggestions | null> {
  if (!hasGeminiKey()) return null;

  // Ground with the evidence photo when present (best-effort, never throws).
  const imagePart = issue.mediaType === "video" ? null : await loadImagePart(issue.mediaUrl);
  const hasImage = !!imagePart;

  const prompt = `You are Setu, a field-operations advisor for a municipal corporation in India (public works / city engineering). A city officer has opened this civic case and needs two practical work-order recommendations for PHYSICAL, on-the-ground municipal action.

Decide what to recommend from the CATEGORY, the SEVERITY, the site PHOTO, and the LOCATION — these are authoritative. The citizen's words are only a rough hint and may be vague, misspelled, or meaningless test text; if they do not describe a real physical civic problem, IGNORE them entirely and reason from the category (and photo) alone. Never quote or echo the citizen's wording.

CASE:
- Category: ${issue.category}   (one of: Roads/Potholes, Streetlights, Water, Garbage/Waste, Drainage/Sewage, Other Infrastructure)
- Severity: ${issue.severity}
- Location: ${issue.ward || "a city ward"}, ${issue.zone || "Central"} Zone
- Citizen hint (may be unreliable — treat with suspicion): "${issue.description || issue.title}"
${hasImage ? "- A site photo is attached below — treat it as the PRIMARY evidence of what is physically wrong." : "- No photo attached — reason from the category alone."}

HARD RULES:
- These are PHYSICAL civic works in a real Indian city — crews, materials, vehicles, equipment.
- NEVER propose software, IT, data, code, apps, "systems", "displays", configuration, or "investigating a project". This is NOT a software ticket.
- Do NOT mention the reporting app, "the report", "the system", "the project", "data", or "display", and do NOT restate the citizen's text.
- Be concrete and operational, the way a public-works engineer writes a work order. No hedging, no preamble, no markdown, no invented measurements/budgets/contractors.

Write:
1. temporary — what a field crew can do within 24–48 hours to reduce danger/nuisance and buy time. Physical actions only (barricades, traffic cones, warning signage, a sanitation crew, a cold-mix patch, a portable light, a temporary bin, sandbags, pumping standing water). 1–2 sentences.
2. permanent — the proper municipal repair / programmatic fix that resolves the root cause (e.g. full-depth resurfacing, replacing the fixture and auditing the feeder circuit, adding the spot to the collection route, repairing/replacing the pipeline, desilting and relining the drain), with a nod to the underlying cause. 1–2 sentences.

Examples of the RIGHT register:
- Garbage/Waste → temporary: "Dispatch a sanitation crew to clear the accumulated waste and place a covered community bin at the spot to stop open dumping." permanent: "Add this location to the daily door-to-door collection route and install a fixed skip-bin, with periodic monitoring to prevent recurrence."
- Roads/Potholes → temporary: "Barricade the crater and fill it with a cold-mix asphalt patch, with reflective warning signage for oncoming two-wheelers." permanent: "Schedule full-depth reinstatement of the failed section and inspect the sub-surface drainage undermining the carriageway."
- Streetlights → temporary: "Deploy a portable solar mast light to restore night-time visibility at the junction." permanent: "Replace the failed luminaire and audit the feeder circuit and pole wiring for the recurring fault."
- Water → temporary: "Send a valve crew to isolate the leaking line and arrange a tanker to maintain supply to affected households." permanent: "Excavate and replace the corroded pipeline segment and pressure-test the distribution main."

Output ONLY the JSON with the two fields.`;

  try {
    const ai = getGeminiClient();
    const contents: any = hasImage ? [{ text: prompt }, imagePart] : prompt;
    const suggestions = await retryWithBackoff(async () => {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              temporary: { type: Type.STRING },
              permanent: { type: Type.STRING },
            },
            required: ["temporary", "permanent"],
          },
          temperature: 0.3,
        },
      });
      const parsed = JSON.parse(response.text || "{}");
      if (!parsed.temporary || !parsed.permanent) {
        throw new Error("Suggestions response missing keys");
      }
      return { temporary: String(parsed.temporary), permanent: String(parsed.permanent) } as FixSuggestions;
    });
    return suggestions;
  } catch (error) {
    // Graceful degradation — caller renders nothing rather than a broken panel.
    console.error("generateSuggestions failed (non-fatal, returning null):", error);
    return null;
  }
}
