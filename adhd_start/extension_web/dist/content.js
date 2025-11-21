"use strict";
// content.ts – single content script for games & page text.
// No imports; everything is self-contained.
// === Helper: get page text for /parse ===
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    var _a, _b;
    if ((msg === null || msg === void 0 ? void 0 : msg.type) === "GET_PAGE_TEXT") {
        const text = ((_a = document.body) === null || _a === void 0 ? void 0 : _a.innerText) ||
            ((_b = document.body) === null || _b === void 0 ? void 0 : _b.textContent) ||
            document.documentElement.innerText ||
            "";
        sendResponse({ text });
        return true;
    }
    return false;
});
// === Game 1: Key-Word Sniper ===
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
        for (const part of parts) {
            if (!part)
                continue;
            if (part.toLowerCase() === word.toLowerCase()) {
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
function ensureSniperHud() {
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
    const hud = ensureSniperHud();
    const badge = document.createElement("div");
    badge.textContent = `+10 ${skill}`;
    badge.style.fontSize = "12px";
    badge.style.color = "#22c55e";
    hud.appendChild(badge);
    setTimeout(() => badge.remove(), 800);
}
function activateKeywordSniper(skills) {
    const remaining = new Set(skills.map((s) => s.toLowerCase()));
    let hits = 0;
    const hud = ensureSniperHud();
    hud.textContent = `Key skills: 0 / ${skills.length}`;
    skills.forEach((skill) => {
        highlightWord(document.body, skill, () => {
            const key = skill.toLowerCase();
            if (!remaining.has(key))
                return;
            remaining.delete(key);
            hits += 1;
            hud.textContent = `Key skills: ${hits} / ${skills.length}`;
            showHitEffect(skill);
            if (remaining.size === 0) {
                hud.textContent = "Key skills: all found 🎯";
            }
        });
    });
}
let oqSteps = [];
let oqIndex = 0;
let oqOverlay = null;
function collectFields(root) {
    const inputs = Array.from(root.querySelectorAll("input, textarea, select"));
    const result = [];
    for (const el of inputs) {
        if (el.type === "hidden" || el.disabled)
            continue;
        const labelEl = el.closest("label") || root.querySelector(`label[for="${el.id}"]`);
        const label = (labelEl && (labelEl.textContent || "").trim()) ||
            (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement ? el.placeholder : "") ||
            "Field";
        result.push({ el, label });
    }
    return result;
}
function ensureOqOverlay() {
    if (oqOverlay)
        return oqOverlay;
    oqOverlay = document.createElement("div");
    oqOverlay.id = "adhd-one-question-overlay";
    oqOverlay.style.position = "fixed";
    oqOverlay.style.bottom = "10px";
    oqOverlay.style.left = "50%";
    oqOverlay.style.transform = "translateX(-50%)";
    oqOverlay.style.zIndex = "999999";
    oqOverlay.style.background = "#020617cc";
    oqOverlay.style.color = "#e5e7eb";
    oqOverlay.style.padding = "8px 14px";
    oqOverlay.style.borderRadius = "999px";
    oqOverlay.style.fontSize = "12px";
    oqOverlay.style.display = "flex";
    oqOverlay.style.alignItems = "center";
    const text = document.createElement("span");
    text.id = "adhd-one-question-text";
    const nextBtn = document.createElement("button");
    nextBtn.textContent = "Next";
    nextBtn.style.marginLeft = "12px";
    nextBtn.style.borderRadius = "999px";
    nextBtn.style.border = "none";
    nextBtn.style.background = "#2563eb";
    nextBtn.style.color = "#fff";
    nextBtn.style.cursor = "pointer";
    nextBtn.style.fontSize = "12px";
    nextBtn.style.padding = "4px 10px";
    nextBtn.addEventListener("click", () => moveOqNext());
    oqOverlay.appendChild(text);
    oqOverlay.appendChild(nextBtn);
    document.body.appendChild(oqOverlay);
    return oqOverlay;
}
function applyOqDim(currentEl) {
    document.body.style.transition = "background-color 0.2s";
    document.body.style.backgroundColor = "rgba(15,23,42,0.25)";
    oqSteps.forEach((s) => (s.el.style.outline = ""));
    currentEl.style.outline = "2px solid #f97316";
    currentEl.scrollIntoView({ behavior: "smooth", block: "center" });
}
function updateOqOverlay() {
    if (!oqOverlay || oqSteps.length === 0)
        return;
    const text = document.getElementById("adhd-one-question-text");
    text.textContent = `Step ${oqIndex + 1}/${oqSteps.length}: ${oqSteps[oqIndex].label}`;
}
function activateOneQuestionMode() {
    oqSteps = collectFields(document.body);
    if (oqSteps.length === 0)
        return;
    oqIndex = 0;
    ensureOqOverlay();
    applyOqDim(oqSteps[oqIndex].el);
    updateOqOverlay();
}
function moveOqNext() {
    if (oqIndex < oqSteps.length - 1) {
        oqIndex += 1;
        applyOqDim(oqSteps[oqIndex].el);
        updateOqOverlay();
    }
    else {
        document.body.style.backgroundColor = "";
        oqOverlay === null || oqOverlay === void 0 ? void 0 : oqOverlay.remove();
        oqOverlay = null;
    }
}
// === Game 4: Focus Chain ===
let chain = 0;
let chainBroken = false;
function ensureChainBadge() {
    let badge = document.getElementById("adhd-focus-chain");
    if (!badge) {
        badge = document.createElement("div");
        badge.id = "adhd-focus-chain";
        badge.style.position = "fixed";
        badge.style.bottom = "10px";
        badge.style.right = "10px";
        badge.style.zIndex = "999999";
        badge.style.background = "#111827";
        badge.style.color = "#e5e7eb";
        badge.style.padding = "4px 10px";
        badge.style.borderRadius = "999px";
        badge.style.fontSize = "12px";
        document.body.appendChild(badge);
    }
    return badge;
}
function renderChain(broken = false) {
    const badge = ensureChainBadge();
    if (broken) {
        badge.textContent = `Focus Chain: broken at ${chain}`;
        badge.style.background = "#7f1d1d";
    }
    else {
        badge.textContent = `Focus Chain: ${chain}`;
        badge.style.background = "#1e293b";
    }
}
function startFocusChain() {
    chain = 0;
    chainBroken = false;
    renderChain();
}
function breakFocusChain() {
    if (chainBroken)
        return;
    chainBroken = true;
    renderChain(true);
}
function endFocusChain() {
    const badge = document.getElementById("adhd-focus-chain");
    badge === null || badge === void 0 ? void 0 : badge.remove();
    document.body.style.backgroundColor = "";
    const hud = document.getElementById("adhd-sniper-hud");
    hud === null || hud === void 0 ? void 0 : hud.remove();
    const oq = document.getElementById("adhd-one-question-overlay");
    oq === null || oq === void 0 ? void 0 : oq.remove();
    // Remove any keyword highlights
    document
        .querySelectorAll(`.${HIGHLIGHT_CLASS}`)
        .forEach((el) => (el.outerHTML = el.textContent || ""));
}
// Increment chain on field blur:
document.addEventListener("blur", (e) => {
    const t = e.target;
    if (!t)
        return;
    if (t.tagName === "INPUT" || t.tagName === "TEXTAREA") {
        if (!chainBroken) {
            chain += 1;
            renderChain();
        }
    }
}, true);
// Break chain if tab hidden > 10s
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
        const start = Date.now();
        setTimeout(() => {
            if (document.visibilityState === "hidden" &&
                Date.now() - start >= 10000) {
                breakFocusChain();
            }
        }, 10000);
    }
});
// === Message wiring for popup ===
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if ((msg === null || msg === void 0 ? void 0 : msg.type) === "START_FOCUS_MODE") {
        const skills = msg.skills || [];
        if (skills.length) {
            activateKeywordSniper(skills);
        }
        activateOneQuestionMode();
        startFocusChain();
        sendResponse({ ok: true });
        return true;
    }
    if ((msg === null || msg === void 0 ? void 0 : msg.type) === "END_FOCUS_MODE") {
        endFocusChain();
        sendResponse({ ok: true });
        return true;
    }
    return false;
});
