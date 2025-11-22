"use strict";

// =============================================================================
// 1. CONFIG & HELPERS
// =============================================================================
const API_URL = "http://localhost:8000/plan";
const PARSE_URL = "http://localhost:8000/parse";
const BOOKMARK_URL = "http://localhost:8000/bookmark";
const BOOKMARKS_URL = "http://localhost:8000/bookmarks?user_id=demo-user";
const ELIGIBILITY_URL = "http://localhost:8000/eligibility";
const PROFILE_PAGE_URL = chrome.runtime.getURL("profile.html");

const $ = (sel) => document.querySelector(sel);
const show = (el) => el && el.classList.remove("hidden");
const hide = (el) => el && el.classList.add("hidden");

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error("No active tab");
  return tab;
}

// Send message to content script; inject focus_games.js if needed
function sendMessageToPage(msg) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) return;

    chrome.tabs.sendMessage(tab.id, msg, () => {
      if (chrome.runtime.lastError) {
        console.warn("[popup] injecting focus_games.js…");
        chrome.scripting.executeScript(
          { target: { tabId: tab.id }, files: ["focus_games.js"] },
          () => setTimeout(() => chrome.tabs.sendMessage(tab.id, msg), 200)
        );
      }
    });
  });
}

async function captureVisibleText() {
  const tab = await getActiveTab();
  const [exec] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => (document.body ? document.body.innerText.slice(0, 8000) : ""),
  });
  return exec?.result || "";
}

// =============================================================================
// 2. POPUP STATE
// =============================================================================
function savePopupState() {
  const state = {
    goal: $("#goal")?.value || "",
    minutes: $("#focus-minutes")?.value || "20",
    checkins: $("#focus-checkins")?.value || "5, 12",
  };
  chrome.storage.local.set({ popupState: state });
}

function restorePopupState() {
  chrome.storage.local.get(["popupState"], (res) => {
    const s = res.popupState;
    if (!s) return;
    if ($("#goal")) $("#goal").value = s.goal || "";
    if ($("#focus-minutes")) $("#focus-minutes").value = s.minutes || "20";
    if ($("#focus-checkins")) $("#focus-checkins").value = s.checkins || "5, 12";
  });
}

// =============================================================================
// 3. FOCUS BLOCK + SPOTLIGHT
// =============================================================================

// "5" -> every 5min; "5, 12" -> at 5 and 12
function parseCheckInsInput(totalMinutes) {
  const raw = $("#focus-checkins")?.value || "";
  const nums = raw
    .split(/[,，]/)
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !Number.isNaN(n) && n > 0);

  if (!nums.length) return [];
  if (!totalMinutes || totalMinutes <= 0) totalMinutes = 20;

  let result = [];
  if (nums.length === 1) {
    const step = nums[0];
    let t = step;
    while (t < totalMinutes) {
      result.push(`T+${t}`);
      t += step;
    }
  } else {
    result = nums.filter((n) => n < totalMinutes).map((n) => `T+${n}`);
  }
  return result;
}

function startFocusBlock() {
  savePopupState();

  const minutes = parseInt($("#focus-minutes")?.value || "20", 10) || 20;
  const checkIns = parseCheckInsInput(minutes);

  chrome.runtime.sendMessage({
    type: "START_BLOCK",
    minutes,
    checkIns,
  });

  sendMessageToPage({
    type: "START_BLOCK",
    minutes,
    checkIns,
    autoSpotlight: true,
  });

  const status = $("#tool-status");
  if (status) {
    status.textContent = `Focus block started (${minutes} min).`;
    setTimeout(() => (status.textContent = ""), 1500);
  }
}

function stopFocusBlock() {
  chrome.runtime.sendMessage({ type: "END_BLOCK" });
  sendMessageToPage({ type: "END_BLOCK" });

  const status = $("#tool-status");
  if (status) {
    status.textContent = "Focus ended.";
    setTimeout(() => (status.textContent = ""), 1200);
  }
}

function bindSpotlightControls() {
  const wrap = $("#spotlight-controls");
  if (!wrap) return;
  const btns = wrap.querySelectorAll("button");
  btns.forEach((btn) => {
    btn.addEventListener("click", () => {
      btns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      const mode = btn.dataset.mode;
      sendMessageToPage({
        type: "TOGGLE_SPOTLIGHT",
        enable: mode !== "none",
        mode,
      });
    });
  });
}

// =============================================================================
// 4. MICRO-START PLAN (/plan)
// =============================================================================
async function requestPlan(goal, text) {
  const resp = await fetch(API_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: "demo-user", goal, text }),
  });
  if (!resp.ok) throw new Error("Plan endpoint error");
  return await resp.json();
}

function renderPlan(plan) {
  const el = $("#ai-result");
  if (!el) return;

  const mins = plan.block_minutes ?? 20;
  const cis = (plan.check_ins || [])
    .map((s) => String(s).replace("T+", ""))
    .join(", ");

  if ($("#focus-minutes")) $("#focus-minutes").value = mins;
  if ($("#focus-checkins")) $("#focus-checkins").value = cis;
  savePopupState();

  el.innerHTML = `
    <div style="line-height:1.4;">
      <b>Start:</b> ${plan.micro_start}
    </div>
    <div class="muted">
      ${plan.purpose || "Ready to focus?"}
    </div>
  `;
}

async function onPlanClick() {
  const result = $("#ai-result");
  if (!result) return;
  result.textContent = "Capturing page & thinking…";

  try {
    const text = await captureVisibleText();
    const rawGoal = $("#goal")?.value || "";
    const goal = rawGoal.trim() || "Help me start this application";
    const plan = await requestPlan(goal, text);
    renderPlan(plan);
  } catch (err) {
    console.error(err);
    result.textContent = "Plan failed (check backend).";
  }
}

// =============================================================================
// 5. SCAN / ELIGIBILITY / SAVE / AUTOFILL
// =============================================================================

async function requestParse(text) {
  const resp = await fetch(PARSE_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: "demo-user", text }),
  });
  if (!resp.ok) throw new Error("Parse error");
  return await resp.json();
}

async function onScanPage() {
  const status = $("#tool-status");
  const out = $("#tool-output");
  if (status) status.textContent = "Scanning requirements…";
  if (out) {
    show(out);
    out.innerHTML = "";
  }

  try {
    const text = await captureVisibleText();
    const parsed = await requestParse(text);

    const refs = parsed.refs_required ?? "—";
    const deadline = parsed.deadline ?? "—";
    out.innerHTML = `
      <div><b>Deadline:</b> ${deadline}</div>
      <div><b>References:</b> ${refs}</div>
      ${
        parsed.values && parsed.values.length
          ? `<div style="margin-top:4px;"><b>They care about:</b><ul style="margin:4px 0 0 16px">${parsed.values
              .map((v) => `<li>${v}</li>`)
              .join("")}</ul></div>`
          : ""
      }
    `;
    if (status) status.textContent = "Scan complete.";
  } catch (err) {
    console.error(err);
    if (status) status.textContent = "Scan failed.";
  }
}

function getProfileFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.sync.get("userProfile", (res) => {
      resolve(res.userProfile || null);
    });
  });
}

async function onCheckEligibility() {
  const status = $("#tool-status");
  const out = $("#tool-output");
  if (status) status.textContent = "Checking eligibility…";
  if (out) {
    show(out);
    out.innerHTML = "";
  }

  try {
    const [text, profile] = await Promise.all([
      captureVisibleText(),
      getProfileFromStorage(),
    ]);

    if (!profile) {
      out.textContent = "No profile found. Open Profile and fill it first.";
      if (status) status.textContent = "Profile missing.";
      return;
    }

    const resp = await fetch(ELIGIBILITY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: "demo-user", profile, text }),
    });

    if (!resp.ok) {
      out.textContent =
        "Eligibility endpoint not implemented. You can rely on Scan + your judgement.";
      if (status) status.textContent = "Eligibility not available.";
      return;
    }

    const data = await resp.json();
    out.textContent = data.eligible
      ? "✅ Likely eligible (see console)."
      : "⚠️ Possibly not eligible (see console).";
    console.log("Eligibility:", data);
    if (status) status.textContent = "Eligibility checked.";
  } catch (err) {
    console.error(err);
    out.textContent = "Eligibility check failed.";
    if (status) status.textContent = "Eligibility failed.";
  }
}

async function onSavePage() {
  const status = $("#tool-status");
  if (status) status.textContent = "Saving page…";
  try {
    const tab = await getActiveTab();
    await fetch(BOOKMARK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        user_id: "demo-user",
        url: tab.url,
        title: tab.title,
      }),
    });
    if (status) status.textContent = "Saved to Library 🔖";
  } catch (err) {
    console.error(err);
    if (status) status.textContent = "Save failed.";
  }
}

function onAutofill() {
  const status = $("#tool-status");
  if (status) status.textContent = "Autofilling (demo)…";
  sendMessageToPage({ type: "AUTOFILL_FORM" });
  setTimeout(() => {
    if (status) status.textContent = "Autofill sent.";
  }, 800);
}

// =============================================================================
// 6. LIBRARY & SAVED LIST
// =============================================================================

async function onLoadLibrary() {
  const q = $("#library-search")?.value || "";
  const list = $("#library-list");
  const detail = $("#library-detail");
  const status = $("#tool-status");
  if (!list || !detail) return;

  list.innerHTML = "Loading...";
  detail.innerHTML = "";
  show(list);
  hide(detail);

  try {
    const params = q ? `?q=${encodeURIComponent(q)}` : "";
    const resp = await fetch(`http://localhost:8000/scholarships${params}`);
    if (!resp.ok) throw new Error("Library backend not reachable");
    const data = await resp.json();
    if (!Array.isArray(data) || !data.length) {
      list.textContent = "No results.";
      if (status) status.textContent = "No library results.";
      return;
    }

    list.innerHTML = "";
    data.forEach((item, idx) => {
      const div = document.createElement("div");
      div.style.cssText =
        "padding:6px; border-bottom:1px solid #1f2933; cursor:pointer;";
      div.innerHTML = `<b>${item.title}</b><br><span class="muted">${item.source_site}</span>`;
      div.addEventListener("click", () => {
        detail.innerHTML = `
          <div><b>${item.title}</b></div>
          <div class="muted" style="margin-bottom:4px;">${item.source_site}</div>
          <div style="font-size:12px; margin-bottom:4px;">${item.description_short || ""}</div>
          <a href="${item.source_url}" target="_blank">Open page</a>
        `;
        show(detail);
      });
      list.appendChild(div);
      if (idx === 0) div.click();
    });

    if (status) status.textContent = "Library loaded.";
  } catch (err) {
    console.error(err);
    list.textContent = "Library offline (ok to ignore).";
    if (status) status.textContent = "Library offline.";
  }
}

let savedVisible = false;
async function onShowSavedToggle() {
  const listEl = $("#saved-list");
  if (!listEl) return;

  if (savedVisible) {
    hide(listEl);
    savedVisible = false;
    return;
  }

  show(listEl);
  listEl.textContent = "Loading…";

  try {
    const resp = await fetch(BOOKMARKS_URL);
    if (!resp.ok) throw new Error("Bookmarks load failed");
    const items = await resp.json();

    if (!items.length) {
      listEl.textContent = "No saved pages.";
      savedVisible = true;
      return;
    }

    listEl.innerHTML = items
      .map(
        (bm) => `
        <div class="saved-item" data-url="${bm.url}" style="padding:4px; border-bottom:1px solid #1f2933; cursor:pointer;">
          <div><b>${bm.title || "Untitled"}</b></div>
          <div class="muted" style="font-size:11px;">${bm.url}</div>
        </div>`
      )
      .join("");

    listEl.querySelectorAll(".saved-item").forEach((el) => {
      el.addEventListener("click", () => {
        const u = el.getAttribute("data-url");
        if (u) chrome.tabs.create({ url: u });
      });
    });

    savedVisible = true;
  } catch (err) {
    console.error(err);
    listEl.textContent = "Load failed.";
    savedVisible = true;
  }
}

// =============================================================================
// 7. RELAX GAME (manual trigger)
// =============================================================================

function onRelaxGame() {
  sendMessageToPage({ type: "MANUAL_START_GAME", game: "sniper" });
}

// =============================================================================
// 8. INIT
// =============================================================================

document.addEventListener("DOMContentLoaded", () => {
  console.log("[popup] loaded");
  restorePopupState();
  bindSpotlightControls();

  $("#plan")?.addEventListener("click", onPlanClick);
  $("#btn-start")?.addEventListener("click", startFocusBlock);

  const stopBtn =
    document.getElementById("btn-end") ||
    document.getElementById("stop-focus") ||
    document.getElementById("btn-stop");
  if (stopBtn) stopBtn.addEventListener("click", stopFocusBlock);

  const relaxBtn = $("#btn-relax-game") || $("#play-sniper");
  if (relaxBtn) relaxBtn.addEventListener("click", onRelaxGame);

  $("#btn-scan")?.addEventListener("click", onScanPage);
  $("#btn-check-elig")?.addEventListener("click", onCheckEligibility);
  $("#btn-save")?.addEventListener("click", onSavePage);
  $("#btn-autofill")?.addEventListener("click", onAutofill);
  $("#btn-load-library")?.addEventListener("click", onLoadLibrary);
  $("#btn-show-saved")?.addEventListener("click", onShowSavedToggle);

  $("#library-search")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onLoadLibrary();
  });

  $("#open-profile")?.addEventListener("click", () =>
    chrome.tabs.create({ url: PROFILE_PAGE_URL })
  );

  $("#goal")?.addEventListener("input", savePopupState);
  $("#focus-minutes")?.addEventListener("input", savePopupState);
  $("#focus-checkins")?.addEventListener("input", savePopupState);
});
