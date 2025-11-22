"use strict";

// Simple helpers
const $ = (sel) => document.querySelector(sel);

const API_URL = "http://localhost:8000/plan";
const PARSE_URL = "http://localhost:8000/parse";
const BOOKMARK_URL = "http://localhost:8000/bookmark";
const BOOKMARKS_URL = "http://localhost:8000/bookmarks?user_id=demo-user";
const GOAL_DEFAULT = "Help me start this application";
const PROFILE_PAGE_URL = chrome.runtime.getURL("profile.html");

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

// -------- FOCUS MODE (circle / rect / none) --------

async function setFocusMode(mode) {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: (mode) => {
      (function (mode) {
        const w = window;

        function cleanup() {
          if (w.__adhdSpotlightEl) {
            w.__adhdSpotlightEl.remove();
            w.__adhdSpotlightEl = null;
          }
          if (w.__adhdSpotlightMoveHandler) {
            window.removeEventListener("mousemove", w.__adhdSpotlightMoveHandler);
            w.__adhdSpotlightMoveHandler = null;
          }
          if (w.__adhdSpotlightKeyHandler) {
            window.removeEventListener("keydown", w.__adhdSpotlightKeyHandler);
            w.__adhdSpotlightKeyHandler = null;
          }
          w.__adhdSpotlightMode = "none";
        }

        // Turn off mode
        if (mode === "none") {
          cleanup();
          return;
        }

        // Ensure spotlight element exists
        if (!w.__adhdSpotlightEl) {
          const sp = document.createElement("div");
          Object.assign(sp.style, {
            position: "fixed",
            top: "0px",
            left: "0px",
            width: "0px",
            height: "0px",
            pointerEvents: "none", // don’t block clicks
            zIndex: "999999999",
            boxShadow: "0 0 0 9999px rgba(0,0,0,0.55)",
            transition:
              "top 0.08s ease-out, left 0.08s ease-out, width 0.08s ease-out, height 0.08s ease-out"
          });
          document.body.appendChild(sp);
          w.__adhdSpotlightEl = sp;

          // Mouse move handler
          w.__adhdSpotlightMoveHandler = function (e) {
            const spEl = w.__adhdSpotlightEl;
            if (!spEl || w.__adhdSpotlightMode === "none") return;

            let width, height, radius;
            if (w.__adhdSpotlightMode === "circle") {
              width = height = 240;
              radius = "50%";
            } else {
              // soft rounded rectangle
              width = 320;
              height = 190;
              radius = "18px";
            }

            const x = e.clientX - width / 2;
            const y = e.clientY - height / 2;

            spEl.style.width = width + "px";
            spEl.style.height = height + "px";
            spEl.style.borderRadius = radius;
            spEl.style.left = x + "px";
            spEl.style.top = y + "px";
          };
          window.addEventListener("mousemove", w.__adhdSpotlightMoveHandler);

          // ESC to exit
          w.__adhdSpotlightKeyHandler = function (e) {
            if (e.key === "Escape") {
              cleanup();
            }
          };
          window.addEventListener("keydown", w.__adhdSpotlightKeyHandler);
        }

        // update mode
        w.__adhdSpotlightMode = mode;
      })(mode);
    },
    args: [mode],
  });
}

/* -------- MAIN -------- */

function main() {
  console.log("popup loaded");



  // Wire Plan button
  const planBtn = $("#plan");
  if (planBtn) {
    planBtn.addEventListener("click", onClickPlan);
  }

  // Open profile page in a new tab when the Profile button is clicked
  const profileBtn = $("#open-profile");
  if (profileBtn) {
    profileBtn.addEventListener("click", () => {
      chrome.tabs.create({ url: PROFILE_PAGE_URL });
    });
  }


  // Wire Scan / Parse button
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

  // Wire Save button (already in your code)
  const saveBtn = document.getElementById("btn-save");
  if (saveBtn) {
    saveBtn.addEventListener("click", () => {
      saveCurrentPage();
    });
  }

  // Wire Show Saved button (already in your code)
  const showSavedBtn = document.getElementById("btn-show-saved");
  if (showSavedBtn) {
    showSavedBtn.addEventListener("click", () => {
      onShowSaved();
    });
  }

  // Focus buttons
  const focusNone = document.getElementById("focusNone");
  if (focusNone) {
    focusNone.addEventListener("click", () => setFocusMode("none"));
  }

  const focusCircle = document.getElementById("focusCircle");
  if (focusCircle) {
    focusCircle.addEventListener("click", () => setFocusMode("circle"));
  }

  const focusRect = document.getElementById("focusRect");
  if (focusRect) {
    focusRect.addEventListener("click", () => setFocusMode("rect"));
  }

}

document.addEventListener("DOMContentLoaded", main);
// -------- Scholarship Library (backend /scholarships) --------
(() => {
  const API_BASE = "http://127.0.0.1:8000"; // backend you showed in your screenshot

  function $(id) {
    return document.getElementById(id);
  }

  const searchInput = $("library-search");
  const loadBtn = $("btn-load-library");
  const statusEl = $("library-status");
  const listEl = $("library-list");
  const detailEl = $("library-detail");

  // If popup.html is older / missing elements, bail quietly
  if (!loadBtn || !listEl || !detailEl || !statusEl) {
    return;
  }

  async function loadScholarships(query) {
    try {
      statusEl.textContent = "Loading scholarships...";
      listEl.innerHTML = "";
      detailEl.innerHTML = "";

      const params = new URLSearchParams();
      if (query && query.trim()) {
        params.set("q", query.trim());
      }

      const url =
        params.toString().length > 0
          ? `${API_BASE}/scholarships?${params.toString()}`
          : `${API_BASE}/scholarships`;

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }

      const data = await res.json();

      if (!Array.isArray(data) || data.length === 0) {
        statusEl.textContent =
          "No scholarships found yet. Try a different search or add more URLs.";
        return;
      }

      statusEl.textContent = `Showing ${data.length} scholarship page(s). Click one to see details.`;
      listEl.innerHTML = "";

      data.forEach((sch) => {
        const item = document.createElement("div");
        item.style.padding = "4px 0";
        item.style.borderBottom = "1px solid #eee";
        item.style.cursor = "pointer";

        const title = document.createElement("div");
        title.textContent = sch.title || "Untitled scholarship page";
        title.style.fontWeight = "600";
        title.style.fontSize = "13px";

        const meta = document.createElement("div");
        meta.textContent = sch.source_site || "";
        meta.className = "muted";

        item.appendChild(title);
        item.appendChild(meta);

        item.addEventListener("click", () => {
          renderDetail(sch);
        });

        listEl.appendChild(item);
      });

      // auto-select first
      renderDetail(data[0]);
    } catch (err) {
      console.error("Error loading scholarships", err);
      statusEl.textContent =
        "Error loading scholarships. Is the backend running on http://127.0.0.1:8000?";
    }
  }

  function renderDetail(sch) {
    if (!sch) {
      detailEl.innerHTML = "";
      return;
    }

    const desc = sch.description_short || "";
    const shortened =
      desc.length > 600 ? desc.slice(0, 600) + "…" : desc;

    detailEl.innerHTML = `
      <div style="border-top:1px solid #eee; padding-top:6px;">
        <div style="font-weight:600; margin-bottom:4px;">
          ${sch.title || "Untitled scholarship page"}
        </div>
        <div class="muted" style="margin-bottom:4px;">
          Source: ${sch.source_site || ""}
        </div>
        <div style="margin-bottom:6px; white-space:pre-wrap;">
          ${shortened}
        </div>
        <a href="${sch.source_url}" target="_blank">
          Open official page
        </a>
      </div>
    `;
  }

  loadBtn.addEventListener("click", () => {
    const q = searchInput ? searchInput.value : "";
    loadScholarships(q);
  });

  if (searchInput) {
    searchInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        loadBtn.click();
      }
    });
  }
})();
