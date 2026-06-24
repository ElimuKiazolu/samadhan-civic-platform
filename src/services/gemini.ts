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
