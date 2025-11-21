// popup.ts – minimal, self-contained popup logic.
// No imports; we talk to backend via fetch, and to content script via chrome.tabs.sendMessage.

const API_BASE = "http://127.0.0.1:8000";
const userId = "demo-user";

interface ParseOut {
  deadline: string | null;
  refs_required: number | null;
  values: string[];
  ai_policy: "ok" | "coach_only";
  confidence?: number | null;
  sources: { source: string; snippet: string }[];
}

interface PlanOut {
  micro_start: string;
  step_type: string;
  selector: string | null;
  placeholder: string | null;
  block_minutes: number;
  check_ins: string[];
  reentry_script: string;
  purpose: string;
  deadline: string | null;
  ai_policy: "ok" | "coach_only";
}

// Helper: get active tab id
async function getActiveTabId(): Promise<number | null> {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tabId = tabs[0]?.id ?? null;
      resolve(tabId);
    });
  });
}

// Ask content script for page text
async function getPageText(): Promise<string> {
  const tabId = await getActiveTabId();
  if (!tabId) return "";
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, { type: "GET_PAGE_TEXT" }, (resp) => {
      resolve((resp && resp.text) || "");
    });
  });
}

async function doParse() {
  const resultEl = document.getElementById("parse-result");
  if (!resultEl) return;
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
  const data = (await resp.json()) as ParseOut;

  const parts: string[] = [];
  parts.push(`Deadline: ${data.deadline ?? "—"}`);
  parts.push(`Refs required: ${data.refs_required ?? "unknown"}`);
  if (data.values?.length) {
    parts.push(`Values: ${data.values.join(", ")}`);
  }
  parts.push(`AI policy: ${data.ai_policy}`);
  if (data.sources?.length) {
    parts.push(
      `Sources:\n` +
        data.sources
          .map((s) => `• ${s.source}: ${s.snippet.slice(0, 80)}…`)
          .join("\n")
    );
  }
  resultEl.textContent = parts.join("\n");
}

async function doPlan() {
  const resultEl = document.getElementById("plan-result");
  if (!resultEl) return;
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
  const data = (await resp.json()) as PlanOut;

  const parts: string[] = [];
  parts.push(`Micro-start: ${data.micro_start}`);
  parts.push(`Block: ${data.block_minutes} min`);
  parts.push(`Check-ins: ${data.check_ins.join(", ")}`);
  parts.push(`AI policy: ${data.ai_policy}`);
  if (data.deadline) parts.push(`Deadline: ${data.deadline}`);
  resultEl.textContent = parts.join("\n");
}

// Very simple feedback helper – you can expand this later.
async function sendFeedback(payload: {
  user_id: string;
  reasons?: string[];
  nudge_result?: Record<string, "success" | "fail">;
}) {
  try {
    await fetch(`${API_BASE}/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (e) {
    console.warn("[popup] feedback failed", e);
  }
}

async function startBlock() {
  const tabId = await getActiveTabId();
  if (!tabId) return;

  // Very simple skill list for Key-Word Sniper – later you can get this from resume.
  const skills = ["Python", "Project", "Leadership", "Analysis"];

  chrome.tabs.sendMessage(
    tabId,
    { type: "START_FOCUS_MODE", userId, skills },
    () => {}
  );

  await sendFeedback({
    user_id: userId,
    reasons: ["block_started"],
  });
}

async function finishBlock() {
  const tabId = await getActiveTabId();
  if (tabId) {
    chrome.tabs.sendMessage(tabId, { type: "END_FOCUS_MODE" }, () => {});
  }

  const feeling = window.prompt(
    "How did this block feel? (too_long / just_right / too_short)"
  );
  const started = window.prompt(
    "Did this plan help you get started? (yes / no)"
  );
  const reasons: string[] = [];
  if (feeling) reasons.push(`block_${feeling}`);
  if (started === "yes") reasons.push("block_helped_start");
  if (started === "no") reasons.push("block_still_stuck");

  await sendFeedback({
    user_id: userId,
    reasons,
  });
}

// Wire buttons once popup DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  document.getElementById("parse-btn")?.addEventListener("click", () => {
    void doParse();
  });

  document.getElementById("plan-btn")?.addEventListener("click", () => {
    void doPlan();
  });

  document
    .getElementById("start-block-btn")
    ?.addEventListener("click", () => void startBlock());

  document
    .getElementById("finish-block-btn")
    ?.addEventListener("click", () => void finishBlock());
});
