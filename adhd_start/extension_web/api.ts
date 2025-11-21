// adhd_start/extension/api.ts
// -------------------------------------------------------
// Shared helper to talk to your FastAPI backend.
// Currently exposes only sendFeedback(), which posts to /feedback.
// -------------------------------------------------------

const API_BASE = "http://127.0.0.1:8000"; // same host as dev_smoke.sh

export type NudgeOutcome = "success" | "fail";

export interface FeedbackPayload {
  user_id: string;
  good_sources?: string[];               // e.g. RAG docs that helped
  bad_sources?: string[];                // e.g. confusing docs
  reasons?: string[];                    // ['keyword_sniper_completed', 'focus_chain_break_tab_hidden']
  nudge_result?: Record<string, NudgeOutcome>; // { puzzle_break: 'success' }
}

/**
 * Fire-and-forget feedback to backend.
 * Do NOT throw in UI; just log and continue.
 */
export async function sendFeedback(payload: FeedbackPayload): Promise<void> {
  try {
    await fetch(`${API_BASE}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.warn("[adhd-copilot] feedback failed", err);
  }
}
