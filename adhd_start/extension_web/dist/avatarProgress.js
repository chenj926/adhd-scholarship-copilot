// adhd_start/extension/avatarProgress.ts
// -------------------------------------------------------
// Game 2: "Applicant Avatar"
// Inspired by Habitica: every completed field/step gives XP,
// and we show "Application Strength" as a progress bar.
// -------------------------------------------------------
import { sendFeedback } from "./api";
const AVATAR_KEY_PREFIX = "adhd_avatar_";
function storageKey(appId) {
    return AVATAR_KEY_PREFIX + appId;
}
export async function loadAvatar(appId) {
    return new Promise((resolve) => {
        chrome.storage.local.get([storageKey(appId)], (data) => {
            resolve(data[storageKey(appId)] || { xp: 0, level: 1 });
        });
    });
}
export async function saveAvatar(appId, state) {
    return new Promise((resolve) => {
        chrome.storage.local.set({ [storageKey(appId)]: state }, () => resolve());
    });
}
/**
 * Award XP for a "micro-quest" (e.g., upload resume).
 * This updates state, re-renders HUD, and posts feedback.
 */
export async function awardXp(userId, appId, amount, label) {
    const state = await loadAvatar(appId);
    state.xp = Math.min(state.xp + amount, 1000);
    state.level = 1 + Math.floor(state.xp / 250); // 4 levels (0–1000)
    await saveAvatar(appId, state);
    await sendFeedback({
        user_id: userId,
        reasons: [`xp_${label}`],
    });
    renderAvatarHud(appId, state);
    return state;
}
/**
 * Draws/updates the XP bar in-page.
 */
export function renderAvatarHud(appId, state) {
    let bar = document.getElementById("adhd-avatar-hud");
    if (!bar) {
        bar = document.createElement("div");
        bar.id = "adhd-avatar-hud";
        bar.style.position = "fixed";
        bar.style.left = "50%";
        bar.style.transform = "translateX(-50%)";
        bar.style.top = "8px";
        bar.style.zIndex = "999999";
        bar.style.background = "#020617cc";
        bar.style.backdropFilter = "blur(8px)";
        bar.style.padding = "6px 14px";
        bar.style.borderRadius = "999px";
        bar.style.color = "#e5e7eb";
        bar.style.fontSize = "12px";
        bar.style.minWidth = "220px";
        const label = document.createElement("div");
        label.id = "adhd-avatar-label";
        label.style.marginBottom = "4px";
        const inner = document.createElement("div");
        inner.id = "adhd-avatar-bar-inner";
        inner.style.height = "6px";
        inner.style.borderRadius = "999px";
        inner.style.background = "#1f2937";
        const fill = document.createElement("div");
        fill.id = "adhd-avatar-bar-fill";
        fill.style.height = "6px";
        fill.style.borderRadius = "999px";
        fill.style.background = "#22c55e";
        fill.style.width = "0%";
        inner.appendChild(fill);
        bar.appendChild(label);
        bar.appendChild(inner);
        document.body.appendChild(bar);
    }
    const pct = Math.round((state.xp / 1000) * 100);
    document.getElementById("adhd-avatar-bar-fill").style.width = `${pct}%`;
    document.getElementById("adhd-avatar-label").textContent = `Application Strength: ${pct}% · Lv.${state.level}`;
}
