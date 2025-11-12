// popup.ts

// Types for the backend response
type PlanOut = {
  micro_start: string;
  block_minutes: number;
  check_ins: string[];
  reentry_script: string;
  purpose: string;
  deadline: string | null;
  ai_policy: "auto" | "coach_only";
};

// Simple helpers
const $ = <T extends HTMLElement>(sel: string) =>
  document.querySelector(sel) as T | null;

const API_URL = "http://localhost:8000/plan";
const GOAL_DEFAULT = "Help me start this application";

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function getActiveTab(): Promise<chrome.tabs.Tab> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error("No active tab");
  return tab;
}

/** Capture up to ~8k chars of VISIBLE text from current page */
async function captureVisibleText(): Promise<string> {
  const tab = await getActiveTab();
  const [exec] = await chrome.scripting.executeScript({
    target: { tabId: tab.id! },
    func: () => (document.body?.innerText || "").slice(0, 8000),
  });
  return (exec?.result as string) || "";
}

async function requestPlan(goal: string, text: string): Promise<PlanOut> {
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ goal, text }),
  });
  if (!resp.ok) throw new Error("Server error. Is FastAPI running on :8000?");
  return (await resp.json()) as PlanOut;
}

function renderPlan(el: HTMLElement, data: PlanOut) {
  const policyBadge =
    data.ai_policy === "coach_only"
      ? `<span style="padding:2px 6px;border-radius:8px;background:#fff3cd;color:#8a6d3b;border:1px solid #ffeeba;">AI drafting restricted</span>`
      : "";

  el.innerHTML =
    `<div style="line-height:1.55">` +
    `<div><b>Micro-start:</b> ${escapeHtml(data.micro_start)}</div>` +
    `<div><b>Block:</b> ${data.block_minutes} min</div>` +
    `<div><b>Check-ins:</b> ${(data.check_ins || []).join(", ")}</div>` +
    (data.purpose ? `<div><b>Purpose:</b> ${escapeHtml(data.purpose)}</div>` : "") +
    (data.deadline ? `<div><b>Deadline:</b> ${escapeHtml(data.deadline)}</div>` : "") +
    (policyBadge ? `<div style="margin-top:6px">${policyBadge}</div>` : "") +
    `</div>`;
}

function startBlock(minutes: number, checkIns: string[]) {
  chrome.runtime.sendMessage({
    type: "START_BLOCK",
    minutes: minutes || 20,
    checkIns: checkIns?.length ? checkIns : ["T+5", "T+12"],
  });
}

async function onClickPlan() {
  const result = $("#result")!;
  const goalInput = $("#goal") as HTMLTextAreaElement;
  result.textContent = "Capturing page text…";

  try {
    const pageText = await captureVisibleText();
    result.textContent = "Thinking…";

    const goal = (goalInput?.value || "").trim() || GOAL_DEFAULT;
    const data = await requestPlan(goal, pageText);

    renderPlan(result, data);
    startBlock(data.block_minutes, data.check_ins);
  } catch (err: any) {
    result.textContent = err?.message || "Something went wrong.";
    console.error(err);
  }
}

function main() {
  console.log("popup loaded");
  const btn = $("#plan") as HTMLButtonElement | null;
  if (!btn) {
    console.error("No #plan button found in popup.html");
    return;
  }
  btn.addEventListener("click", onClickPlan);
}

document.addEventListener("DOMContentLoaded", main);
