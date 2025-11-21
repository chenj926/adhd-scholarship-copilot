// adhd_start/extension/api.ts
// -------------------------------------------------------
// Shared helper to talk to your FastAPI backend.
// Currently exposes only sendFeedback(), which posts to /feedback.
// -------------------------------------------------------
const API_BASE = "http://127.0.0.1:8000"; // same host as dev_smoke.sh
/**
 * Fire-and-forget feedback to backend.
 * Do NOT throw in UI; just log and continue.
 */
export async function sendFeedback(payload) {
    try {
        await fetch(`${API_BASE}/feedback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
    }
    catch (err) {
        console.warn("[adhd-copilot] feedback failed", err);
    }
}
