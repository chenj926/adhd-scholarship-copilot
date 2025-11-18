"use strict";

// Simple helpers
const $ = (sel) => document.querySelector(sel);

const API_URL = "http://localhost:8000/plan";
const PARSE_URL = "http://localhost:8000/parse";
const BOOKMARK_URL = "http://localhost:8000/bookmark";
const BOOKMARKS_URL = "http://localhost:8000/bookmarks?user_id=demo-user";
const GOAL_DEFAULT = "Help me start this application";

function escapeHtml(s) {
  return String(s)
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
  const micro = data.micro_start || "Open the page and list 3 required items.";
  const mins = data.block_minutes || 20;
  const cis = Array.isArray(data.check_ins) ? data.check_ins : ["T+5", "T+12"];
  const purpose =
    data.purpose || "Build momentum toward this scholarship or application.";
  const deadline = data.deadline;

  const policy = data.ai_policy || "ok";
  const badgeClass = policy === "coach_only" ? "badge badge-coach" : "badge badge-ok";
  const badgeLabel =
    policy === "coach_only"
      ? "Coach-only (no AI drafting)"
      : "AI-ok (co-writing allowed)";

  el.innerHTML = `
    <div class="plan-inner">
      <div class="plan-header-row">
        <span class="label">Your micro-start</span>
        <span class="${badgeClass}">${badgeLabel}</span>
      </div>
      <div class="plan-micro">${escapeHtml(micro)}</div>

      <div class="plan-row">
        <div>
          <div class="label">Block</div>
          <div>${mins} min</div>
        </div>
        <div>
          <div class="label">Check-ins</div>
          <div>${cis.join(" • ")}</div>
        </div>
      </div>

      <div style="margin-top:4px;">
        <div class="label">Purpose</div>
        <div>${escapeHtml(purpose)}</div>
      </div>

      ${
        deadline
          ? `
        <div style="margin-top:4px;">
          <div class="label">Deadline</div>
          <div>${escapeHtml(deadline)}</div>
        </div>
      `
          : ""
      }
    </div>
  `;
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
  const btn = $("#plan");

  if (!result) return;

  btn && (btn.disabled = true);
  result.classList.remove("error");
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
    result.classList.add("error");
    result.textContent = err?.message || "Something went wrong.";
  } finally {
    btn && (btn.disabled = false);
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
  const refs = data.refs_required ?? "—";
  const valuesList = (data.values || [])
    .map((v) => `<li>${escapeHtml(v)}</li>`)
    .join("");

  const policy = data.ai_policy || "ok";
  const badge =
    policy === "coach_only"
      ? `<div style="margin:6px 0;">
           <span class="badge badge-coach">This page forbids AI-written text. Coach-only mode suggested.</span>
         </div>`
      : "";

  const conf =
    data.confidence != null
      ? ` (~${Math.round(data.confidence * 100)}% sure)`
      : "";

  container.innerHTML =
    (data.deadline
      ? `<div>
           <div class="label">Deadline</div>
           <div>${escapeHtml(data.deadline)}</div>
         </div>`
      : "") +
    `<div style="margin-top:4px;">
       <div class="label">References</div>
       <div>${refs}</div>
     </div>` +
    (valuesList
      ? `<div style="margin-top:4px;">
           <div class="label">Values / Criteria</div>
           <ul class="values-list">${valuesList}</ul>
         </div>`
      : "") +
    badge +
    (conf
      ? `<div class="muted" style="margin-top:4px;">Confidence${conf}</div>`
      : "");
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
    if (statusEl) statusEl.textContent = err?.message || "Could not save.";
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
      (bm) => `
        <div class="saved-item">
          <div class="saved-title">${escapeHtml(bm.title || "(untitled)")}</div>
          <div class="saved-meta">${escapeHtml(bm.status || "saved")}</div>
          <div class="saved-url">${escapeHtml(bm.url || "")}</div>
        </div>
      `
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
    listEl.textContent = err?.message || "Could not load saved scholarships.";
  }
}

/* -------- MAIN -------- */

function main() {
  console.log("popup loaded");

  const btn = $("#plan");
  if (btn) {
    btn.addEventListener("click", onClickPlan);
  }

  const scanBtn = document.getElementById("btn-scan");
  if (scanBtn) {
    scanBtn.addEventListener("click", async () => {
      const status = document.getElementById("req-status");
      const out = document.getElementById("req-out");
      if (status) {
        status.classList.remove("error");
        status.textContent = "Capturing & parsing…";
      }
      if (out) out.innerHTML = "";
      try {
        const txt = await captureVisibleText();
        const parsed = await requestParse(txt);
        if (status) status.textContent = "";
        if (out) renderReqs(out, parsed);
      } catch (err) {
        console.error(err);
        if (status) {
          status.classList.add("error");
          status.textContent = err?.message || "Parse failed.";
        }
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
