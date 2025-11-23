"use strict";

// =============================================================================
// 1. CONFIG & HELPERS
// =============================================================================
const API_BASE = "http://localhost:8000";
const API_URL = `${API_BASE}/plan`;
const WORKFLOW_URL = `${API_BASE}/workflow`;
const PARSE_URL = `${API_BASE}/parse`;
const BOOKMARK_URL = `${API_BASE}/bookmark`;
const BOOKMARKS_URL = `${API_BASE}/bookmarks?user_id=demo-user`;
const ELIGIBILITY_URL = `${API_BASE}/eligibility`;
const PROFILE_PAGE_URL = chrome.runtime.getURL("profile.html");

const $ = (sel) => document.querySelector(sel);
const show = (el) => el && el.classList.remove("hidden");
const hide = (el) => el && el.classList.add("hidden");

async function getActiveTab() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab || !tab.id) throw new Error("No active tab");
  return tab;
}

function sendMessageToPage(msg) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) return;

    chrome.tabs.sendMessage(tab.id, msg, () => {
      if (chrome.runtime.lastError) {
        console.warn("[popup] Injecting scripts...");
        chrome.scripting.executeScript(
          { target: { tabId: tab.id }, files: ["focus_games.js", "micro_start_overlay.js"] },
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
    func: () => (document.body ? document.body.innerText.slice(0, 15000) : ""),
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
// 3. FOCUS BLOCK
// =============================================================================
function parseCheckInsInput(totalMinutes) {
  const raw = $("#focus-checkins")?.value || "";
  const nums = raw.split(/[,，]/).map((s) => parseFloat(s.trim())).filter((n) => !Number.isNaN(n) && n > 0);
  let result = [];
  if (nums.length === 1 && nums[0] < totalMinutes) {
    let t = nums[0];
    while (t < totalMinutes) { result.push(`T+${t}`); t += nums[0]; }
  } else {
    result = nums.filter((n) => n < totalMinutes).map((n) => `T+${n}`);
  }
  return result;
}

function startFocusBlock() {
  savePopupState();
  const minutes = parseInt($("#focus-minutes")?.value || "20", 10) || 20;
  const checkIns = parseCheckInsInput(minutes);
  chrome.runtime.sendMessage({ type: "START_BLOCK", minutes, checkIns });
  sendMessageToPage({ type: "START_BLOCK", minutes, checkIns, autoSpotlight: true });
  
  const status = $("#tool-status");
  if (status) { status.textContent = `Focus started (${minutes} min)`; setTimeout(()=>status.textContent="", 1500); }
  setTimeout(() => window.close(), 300);
}

function stopFocusBlock() {
  chrome.runtime.sendMessage({ type: "END_BLOCK" });
  sendMessageToPage({ type: "END_BLOCK" });
  const status = $("#tool-status");
  if(status) status.textContent = "Focus ended.";
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
      sendMessageToPage({ type: "TOGGLE_SPOTLIGHT", enable: mode !== "none", mode });
    });
  });
}

// =============================================================================
// 4. MICRO-START
// =============================================================================
async function requestWorkflow(payload) {
  try {
    const resp = await fetch(WORKFLOW_URL, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload)
    });
    if (!resp.ok) throw new Error("Workflow error");
    return await resp.json();
  } catch (e) { return null; }
}

function buildFallbackWorkflow(goal) {
  return {
    plan_id: "fallback",
    summary: { title: goal || "Quick Start", one_liner: "Manual mode (backend offline).", tags: ["Offline"] },
    micro_tasks: ["Read the first section.", "Take a deep breath."],
    block_minutes: 20
  };
}

async function onPlanClick() {
  const result = $("#ai-result");
  const btn = $("#plan");
  if(btn && btn.disabled) return;
  if(btn) btn.disabled = true;
  if(result) result.textContent = "Analyzing...";

  try {
    const text = await captureVisibleText();
    const rawGoal = $("#goal")?.value || "";
    const tab = await getActiveTab();

    let workflow = await requestWorkflow({ user_id: "demo-user", goal: rawGoal, page_url: tab.url, raw_text: text });
    if (!workflow) workflow = buildFallbackWorkflow(rawGoal);

    sendMessageToPage({ type: "SHOW_PLAN_OVERLAY", workflow, userId: "demo-user" });
    if(result) result.textContent = "Overlay opened!";
    setTimeout(() => window.close(), 500);
  } catch (err) {
    console.error(err);
    if(btn) btn.disabled = false;
  }
}

// =============================================================================
// 5. ALL OTHER TOOLS (Preserved)
// =============================================================================
async function onScanPage() {
  const out = $("#tool-output");
  if(out) { show(out); out.innerHTML = "Scanning..."; }
  try {
    const text = await captureVisibleText();
    const resp = await fetch(PARSE_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: "demo-user", text }) });
    const parsed = await resp.json();
    if(out) out.innerHTML = `<div><b>Deadline:</b> ${parsed.deadline||"-"}</div><div><b>Refs:</b> ${parsed.refs_required||"-"}</div>`;
  } catch(e) { if(out) out.textContent = "Scan failed."; }
}

async function onCheckEligibility() {
  const out = $("#tool-output");
  if(out) { show(out); out.textContent = "Checking..."; }
  try {
    const [text, profile] = await Promise.all([captureVisibleText(), new Promise(r => chrome.storage.sync.get("userProfile", res => r(res.userProfile)))]);
    if(!profile) { if(out) out.textContent = "Profile missing."; return; }
    const resp = await fetch(ELIGIBILITY_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: "demo-user", profile, text }) });
    const data = await resp.json();
    if(out) out.textContent = data.eligible ? "✅ Likely Eligible" : "⚠️ Check Requirements";
  } catch(e) { if(out) out.textContent = "Error."; }
}

async function onSavePage() {
  const status = $("#tool-status");
  if(status) status.textContent = "Saving...";
  try {
    const tab = await getActiveTab();
    await fetch(BOOKMARK_URL, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ user_id: "demo-user", url: tab.url, title: tab.title }) });
    if(status) status.textContent = "Saved 🔖";
  } catch(e) { if(status) status.textContent = "Failed."; }
}

function onAutofill() {
  sendMessageToPage({ type: "AUTOFILL_FORM" });
}

function onRelaxGame() {
  sendMessageToPage({ type: "MANUAL_START_GAME", game: "sniper" });
}

async function onLoadLibrary() {
    const list = $("#saved-list");
    if(list) {
        show(list); list.innerHTML = "Loading...";
        try {
            const resp = await fetch(`${API_BASE}/scholarships`);
            const data = await resp.json();
            list.innerHTML = data.map(d => `<div><b>${d.title}</b><br><span class="muted">${d.source_site}</span></div>`).join("");
        } catch(e) { list.textContent = "Offline."; }
    }
}

async function onShowSavedToggle() {
    const list = $("#saved-list");
    if(list) {
        if(!list.classList.contains("hidden") && list.dataset.mode === "saved") { hide(list); return; }
        show(list); list.dataset.mode = "saved"; list.textContent = "Loading...";
        try {
            const resp = await fetch(BOOKMARKS_URL);
            const data = await resp.json();
            list.innerHTML = data.map(b => `<div style="cursor:pointer" onclick="window.open('${b.url}')"><b>${b.title||"Untitled"}</b></div>`).join("");
        } catch(e) { list.textContent = "Error."; }
    }
}

document.addEventListener("DOMContentLoaded", () => {
  restorePopupState();
  bindSpotlightControls();
  $("#plan")?.addEventListener("click", onPlanClick);
  $("#btn-start")?.addEventListener("click", startFocusBlock);
  $("#btn-end")?.addEventListener("click", stopFocusBlock);
  $("#btn-scan")?.addEventListener("click", onScanPage);
  $("#btn-check-elig")?.addEventListener("click", onCheckEligibility);
  $("#btn-save")?.addEventListener("click", onSavePage);
  $("#btn-autofill")?.addEventListener("click", onAutofill);
  $("#btn-relax-game")?.addEventListener("click", onRelaxGame);
  $("#btn-load-library")?.addEventListener("click", onLoadLibrary);
  $("#btn-show-saved")?.addEventListener("click", onShowSavedToggle);
  $("#open-profile")?.addEventListener("click", () => chrome.tabs.create({ url: PROFILE_PAGE_URL }));
  $("#goal")?.addEventListener("input", savePopupState);
  $("#focus-minutes")?.addEventListener("input", savePopupState);
});