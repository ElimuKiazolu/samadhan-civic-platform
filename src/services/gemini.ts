import { GoogleGenAI } from "@google/genai";

// LOCKED MODEL DECISION (Doc 4 §3, spike-confirmed):
// Use gemini-3.5-flash ONLY. gemini-3.1-pro and gemini-3-flash return 404 on this
// billed key — never reference them anywhere.
export const GEMINI_MODEL = "gemini-3.5-flash";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let aiClient: GoogleGenAI | null = null;

export function hasGeminiKey(): boolean {
  return !!GEMINI_API_KEY;
}

/**
 * Lazily initializes and returns the shared Gemini client.
 * Used by every server-side intelligence call (keys never reach the client).
 */
export function getGeminiClient(): GoogleGenAI {
  if (!aiClient) {
    if (!GEMINI_API_KEY) {
      console.warn("WARNING: GEMINI_API_KEY environment variable is not defined!");
    }
    aiClient = new GoogleGenAI({
      apiKey: GEMINI_API_KEY || "MOCK_KEY",
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        }
      }
    });
  }
  return aiClient;
}

/**
 * Executes a function with exponential backoff retries (Doc 6 resilience ladder).
 */
export async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 1000): Promise<T> {
  try {
    return await fn();
  } catch (error) {
    if (retries <= 0) throw error;
    console.warn(`External request failed, retrying in ${delay}ms... Remaining retries: ${retries}. Error:`, error);
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
}
