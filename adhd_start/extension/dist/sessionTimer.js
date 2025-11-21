// adhd_start/extension/sessionTimer.ts
// -------------------------------------------------------
// Timer for long sessions. After N minutes of active work,
// we can offer the user a 60-second "recharge" puzzle.
// -------------------------------------------------------
import { sendFeedback } from "./api";
const STORAGE_KEY = "adhd_session_state";
const PUZZLE_AFTER_MINUTES = 60; // tune as needed
function now() {
    return Date.now();
}
export async function loadSession() {
    return new Promise((resolve) => {
        chrome.storage.local.get([STORAGE_KEY], (data) => {
            resolve(data[STORAGE_KEY] || null);
        });
    });
}
export async function saveSession(state) {
    return new Promise((resolve) => {
        if (state) {
            chrome.storage.local.set({ [STORAGE_KEY]: state }, () => resolve());
        }
        else {
            chrome.storage.local.remove([STORAGE_KEY], () => resolve());
        }
    });
}
export async function startSession(userId) {
    const state = {
        userId,
        startedAt: now(),
        lastPingAt: now(),
        puzzleTriggered: false,
        active: true,
    };
    await saveSession(state);
}
export async function pingSession() {
    const state = await loadSession();
    if (!state || !state.active)
        return;
    state.lastPingAt = now();
    await saveSession(state);
}
export async function endSession() {
    const state = await loadSession();
    if (!state)
        return;
    state.active = false;
    await saveSession(state);
}
/**
 * Background loop – call once from background/popup startup.
 */
export function startTimerLoop() {
    setInterval(async () => {
        const state = await loadSession();
        if (!state || !state.active || state.puzzleTriggered)
            return;
        const elapsedMinutes = (now() - Math.max(state.startedAt, state.lastPingAt)) / 60000;
        if (elapsedMinutes >= PUZZLE_AFTER_MINUTES) {
            state.puzzleTriggered = true;
            await saveSession(state);
            const ok = await askPuzzlePrompt();
            if (!ok) {
                await sendFeedback({
                    user_id: state.userId,
                    reasons: ["puzzle_prompt_declined"],
                });
                return;
            }
            const result = await launchPuzzleInActiveTab();
            let outcome;
            let reason;
            if (result === "success") {
                outcome = "success";
                reason = "puzzle_success";
            }
            else if (result === "fail") {
                outcome = "fail";
                reason = "puzzle_fail";
            }
            else {
                reason = "puzzle_cancel";
            }
            await sendFeedback({
                user_id: state.userId,
                reasons: [reason],
                nudge_result: outcome ? { puzzle_break: outcome } : undefined,
            });
        }
    }, 60000);
}
async function askPuzzlePrompt() {
    return new Promise((resolve) => {
        const ok = window.confirm("Nice work — want a 1-minute recharge puzzle break?");
        resolve(ok);
    });
}
async function launchPuzzleInActiveTab() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            var _a;
            const tabId = (_a = tabs[0]) === null || _a === void 0 ? void 0 : _a.id;
            if (!tabId) {
                resolve("cancel");
                return;
            }
            chrome.tabs.sendMessage(tabId, { type: "SHOW_PUZZLE_OVERLAY" }, (resp) => {
                const result = resp === null || resp === void 0 ? void 0 : resp.result;
                resolve(result || "cancel");
            });
        });
    });
}
