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

  const prompt = `You are Setu, an autonomous municipal-works advisor for the Rajkot Municipal Corporation (RMC). An RMC officer has opened this civic case. Recommend two concrete, practical actions grounded ONLY in the details given — do not invent facts, measurements, budgets, or contractors.

CASE:
- Category: ${issue.category}
- Severity: ${issue.severity}
- Title: ${issue.title}
- Citizen description: "${issue.description || issue.title}"
- Location: ${issue.ward || "an RMC ward"}, ${issue.zone || "Central"} Zone
- Corroborating reports: ${issue.confirmedCount || 1}
${hasImage ? "- A site photo is attached below; use it to inform the recommendation." : "- No photo attached; advise from the text alone."}

Provide:
1. temporary — an immediate MITIGATION the field crew can do within hours to reduce danger/severity and buy time (e.g. cordoning, cones/barricades, warning signage, a temporary patch, diverting flow). 1–2 sentences, action-first, civic-appropriate.
2. permanent — the proper long-term REPAIR that resolves the root cause (e.g. full-depth road reinstatement, pipeline replacement, drain de-silting + relining, luminaire + wiring replacement). 1–2 sentences.

Keep both specific to THIS category and severity. No preamble, no markdown, no fabricated specifics.`;

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
