"use strict";
// popup.ts – minimal, self-contained popup logic.
// No imports; we talk to backend via fetch, and to content script via chrome.tabs.sendMessage.
const API_BASE = "http://127.0.0.1:8000";
const userId = "demo-user";
// Helper: get active tab id
async function getActiveTabId() {
    return new Promise((resolve) => {
        chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            var _a, _b;
            const tabId = (_b = (_a = tabs[0]) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : null;
            resolve(tabId);
        });
    });
}
// Ask content script for page text
async function getPageText() {
    const tabId = await getActiveTabId();
    if (!tabId)
        return "";
    return new Promise((resolve) => {
        chrome.tabs.sendMessage(tabId, { type: "GET_PAGE_TEXT" }, (resp) => {
            resolve((resp && resp.text) || "");
        });
    });
}
async function doParse() {
    var _a, _b, _c, _d;
    const resultEl = document.getElementById("parse-result");
    if (!resultEl)
        return;
    resultEl.textContent = "Parsing…";
    const text = (await getPageText()).slice(0, 8000);
    if (!text) {
        resultEl.textContent = "Could not read page text.";
        return;
    }
    const resp = await fetch(`${API_BASE}/parse`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, text }),
    });
    const data = (await resp.json());
    const parts = [];
    parts.push(`Deadline: ${(_a = data.deadline) !== null && _a !== void 0 ? _a : "—"}`);
    parts.push(`Refs required: ${(_b = data.refs_required) !== null && _b !== void 0 ? _b : "unknown"}`);
    if ((_c = data.values) === null || _c === void 0 ? void 0 : _c.length) {
        parts.push(`Values: ${data.values.join(", ")}`);
    }
    parts.push(`AI policy: ${data.ai_policy}`);
    if ((_d = data.sources) === null || _d === void 0 ? void 0 : _d.length) {
        parts.push(`Sources:\n` +
            data.sources
                .map((s) => `• ${s.source}: ${s.snippet.slice(0, 80)}…`)
                .join("\n"));
    }
    resultEl.textContent = parts.join("\n");
}
async function doPlan() {
    const resultEl = document.getElementById("plan-result");
    if (!resultEl)
        return;
    resultEl.textContent = "Generating plan…";
    const text = (await getPageText()).slice(0, 8000);
    if (!text) {
        resultEl.textContent = "Could not read page text.";
        return;
    }
    const goal = "Help me start this application without getting stuck.";
    const resp = await fetch(`${API_BASE}/plan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: userId, goal, text }),
    });
    const data = (await resp.json());
    const parts = [];
    parts.push(`Micro-start: ${data.micro_start}`);
    parts.push(`Block: ${data.block_minutes} min`);
    parts.push(`Check-ins: ${data.check_ins.join(", ")}`);
    parts.push(`AI policy: ${data.ai_policy}`);
    if (data.deadline)
        parts.push(`Deadline: ${data.deadline}`);
    resultEl.textContent = parts.join("\n");
}
// Very simple feedback helper – you can expand this later.
async function sendFeedback(payload) {
    try {
        await fetch(`${API_BASE}/feedback`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
    }
    catch (e) {
        console.warn("[popup] feedback failed", e);
    }
}
async function startBlock() {
    const tabId = await getActiveTabId();
    if (!tabId)
        return;
    // Very simple skill list for Key-Word Sniper – later you can get this from resume.
    const skills = ["Python", "Project", "Leadership", "Analysis"];
    chrome.tabs.sendMessage(tabId, { type: "START_FOCUS_MODE", userId, skills }, () => { });
    await sendFeedback({
        user_id: userId,
        reasons: ["block_started"],
    });
}
async function finishBlock() {
    const tabId = await getActiveTabId();
    if (tabId) {
        chrome.tabs.sendMessage(tabId, { type: "END_FOCUS_MODE" }, () => { });
    }
    const feeling = window.prompt("How did this block feel? (too_long / just_right / too_short)");
    const started = window.prompt("Did this plan help you get started? (yes / no)");
    const reasons = [];
    if (feeling)
        reasons.push(`block_${feeling}`);
    if (started === "yes")
        reasons.push("block_helped_start");
    if (started === "no")
        reasons.push("block_still_stuck");
    await sendFeedback({
        user_id: userId,
        reasons,
    });
}
// Wire buttons once popup DOM is ready
document.addEventListener("DOMContentLoaded", () => {
    var _a, _b, _c, _d;
    (_a = document.getElementById("parse-btn")) === null || _a === void 0 ? void 0 : _a.addEventListener("click", () => {
        void doParse();
    });
    (_b = document.getElementById("plan-btn")) === null || _b === void 0 ? void 0 : _b.addEventListener("click", () => {
        void doPlan();
    });
    (_c = document
        .getElementById("start-block-btn")) === null || _c === void 0 ? void 0 : _c.addEventListener("click", () => void startBlock());
    (_d = document
        .getElementById("finish-block-btn")) === null || _d === void 0 ? void 0 : _d.addEventListener("click", () => void finishBlock());
});
