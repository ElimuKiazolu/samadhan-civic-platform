import { GoogleGenAI } from "@google/genai";

// Cheapest viable model: gemini-2.5-flash-lite (multimodal — supports the vision
// image part in classifyMedia). Single constant, env-overridable so it can be
// swapped on Cloud Run (e.g. to gemini-2.0-flash-lite) without a rebuild.
export const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.5-flash-lite";

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
 * Detects a credit/quota-exhaustion error (429 / RESOURCE_EXHAUSTED) — as opposed
 * to a genuine transient fault (503/network/5xx). Matched defensively across the
 * SDK's error shapes. We fail FAST on these: retrying a depleted key 3× just
 * burns calls, tokens, and time.
 *
 * Trade-off (intentional): Google also returns 429 for transient per-minute rate
 * limits, so those won't be retried either — acceptable given the goal is to stop
 * wasting calls on an exhausted key.
 */
export function isQuotaError(err: any): boolean {
  if (!err) return false;
  const status = err.status ?? err.code ?? err.statusCode ?? err.response?.status ?? err.cause?.status;
  if (status === 429) return true;
  const haystack = `${err.status ?? ""} ${err.code ?? ""} ${err.message ?? ""} ${
    (() => { try { return JSON.stringify(err); } catch { return ""; } })()
  }`;
  return /\b429\b|RESOURCE_EXHAUSTED|quota|too many requests|billing|insufficient/i.test(haystack);
}

/**
 * Executes a function with exponential backoff retries — EXCEPT on quota/credit
 * errors (429/RESOURCE_EXHAUSTED), which fail fast with no retry.
 */
export async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    // Fail fast on depleted credits/quota — do NOT waste 3× calls on a 429.
    if (isQuotaError(error)) {
      console.warn("retryWithBackoff: quota/credit error (429/RESOURCE_EXHAUSTED) — failing fast, no retry.");
      throw error;
    }
    if (retries <= 1) throw error;
    console.warn(`External request failed, retrying in ${delay}ms... Remaining retries: ${retries - 1}. Error:`, error);
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
}
