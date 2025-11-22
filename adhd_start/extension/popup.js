"use strict";

// Simple helpers
const $ = (sel) => document.querySelector(sel);

const API_URL = "http://localhost:8000/plan";
const PARSE_URL = "http://localhost:8000/parse";
const BOOKMARK_URL = "http://localhost:8000/bookmark";
const BOOKMARKS_URL = "http://localhost:8000/bookmarks?user_id=demo-user";
const GOAL_DEFAULT = "Help me start this application";

function escapeHtml(s) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error("No active tab");
  return tab;
}

/** Capture up to ~8k chars of VISIBLE text from current page */
async function captureVisibleText() {
  const tab = await getActiveTab();
  const [exec] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => (document.body?.innerText || "").slice(0, 8000),
  });
  return exec?.result || "";
}

/* -------- PLAN -------- */

async function requestPlan(goal, text) {
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ goal, text }),
  });
  if (!resp.ok) throw new Error("Server error. Is FastAPI running on :8000?");
  return await resp.json();
}

function renderPlan(el, data) {
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

function startBlock(minutes, checkIns) {
  chrome.runtime.sendMessage({
    type: "START_BLOCK",
    minutes: minutes || 20,
    checkIns: checkIns && checkIns.length ? checkIns : ["T+5", "T+12"],
  });
}

async function onClickPlan() {
  const result = $("#result");
  const goalInput = $("#goal");
  result.textContent = "Capturing page text…";

  try {
    const pageText = await captureVisibleText();
    result.textContent = "Thinking…";

    const goal = (goalInput?.value || "").trim() || GOAL_DEFAULT;
    const data = await requestPlan(goal, pageText);

    renderPlan(result, data);
    startBlock(data.block_minutes, data.check_ins);
  } catch (err) {
    console.error(err);
    result.textContent = err?.message || "Something went wrong.";
  }
}

/* -------- PARSE / REQUIREMENTS -------- */

async function requestParse(text) {
  const resp = await fetch(PARSE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: "demo-user", text }),
  });
  if (!resp.ok) throw new Error("Parse error. Is FastAPI running on :8000?");
  return await resp.json();
}

function renderReqs(container, data) {
  const badge =
    data.ai_policy === "coach_only"
      ? `<div style="margin:6px 0;padding:6px;border-radius:8px;background:#fff3cd;color:#8a6d3b;border:1px solid #ffeeba;">
           This page forbids AI-written text. Coach-only mode suggested.
         </div>`
      : "";

  const refs = data.refs_required ?? "—";
  const valuesList = (data.values || [])
    .map((v) => `<li>${escapeHtml(v)}</li>`)
    .join("");
  const conf =
    data.confidence != null
      ? ` (~${Math.round(data.confidence * 100)}% sure)`
      : "";

  container.innerHTML =
    (data.deadline
      ? `<div><b>Deadline:</b> ${escapeHtml(data.deadline)}</div>`
      : "") +
    `<div><b>References:</b> ${refs}</div>` +
    (valuesList
      ? `<div><b>Values / Criteria:</b><ul style="margin:6px 0 0 16px">${valuesList}</ul></div>`
      : "") +
    badge +
    (conf ? `<div class="muted" style="margin-top:4px">Confidence${conf}</div>` : "");
}

/* -------- BOOKMARK / SAVE -------- */

async function saveCurrentPage() {
  const statusEl = document.getElementById("save-status");
  if (statusEl) statusEl.textContent = "Saving…";

  try {
    const tab = await getActiveTab();
    const url = tab.url || "";
    const title = tab.title || "Saved scholarship";

    let host = "";
    try {
      host = url ? new URL(url).hostname : "";
    } catch (e) {
      host = "";
    }

    const payload = {
      user_id: "demo-user",
      url,
      title,
      source_site: host || null,
      deadline: null,
      tags: [],
    };

    const resp = await fetch(BOOKMARK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!resp.ok) throw new Error("Bookmark error");

    const data = await resp.json();
    console.log("Bookmark saved:", data);
    if (statusEl) statusEl.textContent = "Saved ✔";
  } catch (err) {
    console.error(err);
    if (statusEl) statusEl.textContent =
      err?.message || "Could not save.";
  }
}

/* -------- BOOKMARKS LIST (SHOW SAVED) -------- */

async function fetchBookmarks() {
  const resp = await fetch(BOOKMARKS_URL);
  if (!resp.ok) throw new Error("Could not load bookmarks");
  return await resp.json();
}

function renderBookmarks(container, items) {
  if (!items.length) {
    container.textContent = "No saved scholarships yet.";
    return;
  }

  container.innerHTML = items
    .map(
      (bm) =>
        `<div style="margin-bottom:6px">
           <b>${escapeHtml(bm.title || "(untitled)")}</b><br/>
           <span style="color:#666; font-size:12px">${bm.status || "saved"}</span><br/>
           <span style="color:#888; font-size:11px">${escapeHtml(bm.url || "")}</span>
         </div>`
    )
    .join("");
}

async function onShowSaved() {
  const listEl = document.getElementById("saved-list");
  if (!listEl) return;
  listEl.textContent = "Loading…";
  try {
    const items = await fetchBookmarks();
    renderBookmarks(listEl, items);
  } catch (err) {
    console.error(err);
    listEl.textContent =
      err?.message || "Could not load saved scholarships.";
  }
}

/* -------- MAIN -------- */

function main() {
  console.log("popup loaded");

  const $ = (s) => document.querySelector(s);

  const btn = $("#plan");
  if (btn) {
    btn.addEventListener("click", onClickPlan);
  }

  $("#plan").addEventListener("click", async () => {
    // ... capture page, call backend, show micro-start ...
    chrome.runtime.sendMessage({
      type: "START_BLOCK",
      minutes: data.block_minutes || 20,
      checkIns: data.check_ins || ["T+5","T+12"]
    });
  });

  $("#focus").addEventListener("click", async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    files: ["spotlight.js"]
  });
});

  const scanBtn = document.getElementById("btn-scan");
  if (scanBtn) {
    scanBtn.addEventListener("click", async () => {
      const status = document.getElementById("req-status");
      const out = document.getElementById("req-out");
      if (status) status.textContent = "Capturing & parsing…";
      if (out) out.innerHTML = "";
      try {
        const txt = await captureVisibleText();
        const parsed = await requestParse(txt);
        if (status) status.textContent = "";
        if (out) renderReqs(out, parsed);
      } catch (err) {
        console.error(err);
        if (status) status.textContent =
          err?.message || "Parse failed.";
      }
    });
  }

  const saveBtn = document.getElementById("btn-save");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      saveCurrentPage();
    });
  }

  const showSavedBtn = document.getElementById("btn-show-saved");
  if (showSavedBtn) {
    showSavedBtn.addEventListener("click", () => {
      onShowSaved();
    });
  }
}

document.addEventListener("DOMContentLoaded", main);
