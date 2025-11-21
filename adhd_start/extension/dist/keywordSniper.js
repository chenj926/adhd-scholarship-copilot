// adhd_start/extension/keywordSniper.ts
// -------------------------------------------------------
// Game 1: "Key-Word Sniper"
// Inspired by EndeavorRx multitasking: the user scrolls
// the job description and "snipes" their key skills.
// -------------------------------------------------------
import { sendFeedback } from "./api";
const HIGHLIGHT_CLASS = "adhd-keyword-target";
function highlightWord(root, word, onClick) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    const regex = new RegExp(`\\b(${word})\\b`, "gi");
    const nodesToSplit = [];
    while (walker.nextNode()) {
        const node = walker.currentNode;
        if (regex.test(node.textContent || ""))
            nodesToSplit.push(node);
    }
    nodesToSplit.forEach((textNode) => {
        const parent = textNode.parentElement;
        if (!parent)
            return;
        const frag = document.createDocumentFragment();
        const parts = (textNode.textContent || "").split(regex);
        for (let i = 0; i < parts.length; i++) {
            const part = parts[i];
            if (!part)
                continue;
            if (part.toLowerCase() === word.toLowerCase()) {
                // Make this occurrence a clickable "target"
                const span = document.createElement("span");
                span.textContent = part;
                span.className = HIGHLIGHT_CLASS;
                span.style.background = "#fb923c33";
                span.style.borderRadius = "4px";
                span.style.padding = "0 2px";
                span.style.cursor = "pointer";
                span.addEventListener("click", () => onClick());
                frag.appendChild(span);
            }
            else {
                frag.appendChild(document.createTextNode(part));
            }
        }
        parent.replaceChild(frag, textNode);
    });
}
function ensureHud() {
    let hud = document.getElementById("adhd-sniper-hud");
    if (!hud) {
        hud = document.createElement("div");
        hud.id = "adhd-sniper-hud";
        hud.style.position = "fixed";
        hud.style.right = "10px";
        hud.style.top = "10px";
        hud.style.zIndex = "999999";
        hud.style.background = "#0f172a";
        hud.style.color = "#e5e7eb";
        hud.style.padding = "6px 10px";
        hud.style.borderRadius = "999px";
        hud.style.fontSize = "12px";
        hud.style.display = "flex";
        hud.style.gap = "8px";
        document.body.appendChild(hud);
    }
    return hud;
}
function showHitEffect(skill) {
    const hud = ensureHud();
    const badge = document.createElement("div");
    badge.textContent = `+10 ${skill}`;
    badge.style.fontSize = "12px";
    badge.style.color = "#22c55e";
    hud.appendChild(badge);
    setTimeout(() => badge.remove(), 800);
}
/**
 * Main entry: activate the sniper game on the current page.
 */
export function activateKeywordSniper(userId, skills) {
    const state = {
        remaining: new Set(skills.map((s) => s.toLowerCase())),
        hits: 0,
    };
    const hud = ensureHud();
    hud.textContent = `Key skills: 0 / ${skills.length}`;
    skills.forEach((skill) => {
        highlightWord(document.body, skill, () => {
            const key = skill.toLowerCase();
            if (!state.remaining.has(key))
                return;
            state.remaining.delete(key);
            state.hits += 1;
            hud.textContent = `Key skills: ${state.hits} / ${skills.length}`;
            showHitEffect(skill);
            if (state.remaining.size === 0) {
                // All targets hit → send feedback
                sendFeedback({
                    user_id: userId,
                    reasons: ["keyword_sniper_completed"],
                });
                setTimeout(() => {
                    hud.textContent = "Key skills: all found 🎯";
                }, 300);
            }
        });
    });
}
// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if ((msg === null || msg === void 0 ? void 0 : msg.type) === "ACTIVATE_KEYWORD_SNIPER") {
        const { userId, skills } = msg;
        activateKeywordSniper(userId || "demo-user", skills || []);
        sendResponse({ ok: true });
        return true;
    }
    return false;
});
