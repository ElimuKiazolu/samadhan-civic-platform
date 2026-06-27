import { GoogleGenAI } from "@google/genai";

export const GEMINI_MODEL = "gemini-3.5-flash";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let aiClient: GoogleGenAI | null = null;

export function hasGeminiKey(): boolean {
  return typeof GEMINI_API_KEY === "string" && GEMINI_API_KEY.trim().length > 0;
}

export function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    if (!hasGeminiKey()) {
      console.warn("WARNING: GEMINI_API_KEY environment variable is not defined!");
    }
    aiClient = new GoogleGenAI({
      apiKey: GEMINI_API_KEY || "MOCK_KEY",
    });
  }
  return aiClient;
}

/**
 * Detects whether an error from the Gemini SDK is a model-unavailability /
 * capacity condition (Google-side outage, not our fault) — distinct from an
 * ambiguous-input result. We match defensively across the SDK's error shapes
 * because @google/genai doesn't guarantee a single field:
 *   - HTTP 503 (high demand / Service Unavailable), 500, 429 (rate limit / quota)
 *   - keyword signatures in the message (UNAVAILABLE, overloaded, high demand,
 *     RESOURCE_EXHAUSTED, quota, Service Unavailable)
 * Used so the report flow can surface a deliberate `classifierUnavailable`
 * degradation state instead of silently misclassifying as "Other".
 */
export function isModelUnavailableError(err: any): boolean {
  if (!err) return false;

  const status =
    err.status ?? err.code ?? err.statusCode ?? err.response?.status ?? err.cause?.status;
  if (typeof status === "number" && [429, 500, 502, 503, 504].includes(status)) {
    return true;
  }

  const haystack = `${err.status ?? ""} ${err.code ?? ""} ${err.message ?? ""} ${
    typeof err === "string" ? err : ""
  } ${(() => { try { return JSON.stringify(err); } catch { return ""; } })()}`;

  return /\b(429|500|502|503|504)\b|UNAVAILABLE|overloaded|high demand|RESOURCE_EXHAUSTED|service unavailable|quota|too many requests/i.test(
    haystack
  );
}

/**
 * Executes a function with exponential backoff retries.
 */
export async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 1) throw error;
    console.warn(`External request failed, retrying in ${delay}ms... Remaining retries: ${retries - 1}. Error:`, error);
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
}
