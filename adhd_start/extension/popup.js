"use strict";

// =============================================================================
// 1. CONFIG & HELPERS
// =============================================================================
const API_BASE = "http://localhost:8000";
const WORKFLOW_URL = `${API_BASE}/workflow`;
const PARSE_URL = `${API_BASE}/parse`;
const BOOKMARK_URL = `${API_BASE}/bookmark`;
const BOOKMARKS_URL = `${API_BASE}/bookmarks?user_id=demo-user`;
const BOOKMARK_STATUS_URL = `${API_BASE}/bookmark/status`;
const ELIGIBILITY_URL = `${API_BASE}/eligibility`;
const SCHOLARSHIPS_URL = `${API_BASE}/scholarships`;
const PROFILE_PAGE_URL = chrome.runtime.getURL("profile.html");

const $ = (sel) => document.querySelector(sel);
const show = (el) => el && el.classList.remove("hidden");
const hide = (el) => el && el.classList.add("hidden");

function escapeHtml(s) {
  return (s || "")
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

async function captureVisibleText() {
  const tab = await getActiveTab();
  const [exec] = await chrome.scripting.executeScript({
    target: { tabId: tab.id },
    func: () => (document.body ? document.body.innerText.slice(0, 15000) : ""),
  });
  return exec?.result || "";
}

function sendMessageToPage(msg) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) return;

    // Send only to frame 0 to avoid multiple iframes reacting
    chrome.tabs.sendMessage(tab.id, msg, { frameId: 0 }, () => {
      if (chrome.runtime.lastError) {
        // If no content script yet, inject and retry once
        console.warn("[popup] Injecting content scripts:", chrome.runtime.lastError.message);
        chrome.scripting.executeScript(
          {
            target: { tabId: tab.id },
            files: ["focus_games.js", "micro_start_overlay.js"],
          },
          () => {
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, msg, { frameId: 0 });
            }, 200);
          },
        );
      }
    });
  });
}

function getProfileFromStorage() {
  return new Promise((resolve) => {
    chrome.storage.sync.get("userProfile", (res) => {
      resolve(res.userProfile || null);
    });
  });
}

// Read profile and update the profile button in the popup
async function updateProfileIcon() {
  const btn = document.getElementById("open-profile");
  if (!btn) return;

  try {
    const { userProfile } = await chrome.storage.sync.get("userProfile");
    const p = userProfile || {};

    // Consider "logged in / filled" if we have at least some core fields
    const hasProfile =
      p &&
      (p.firstName || p.lastName || p.email || p.school || p.program);

    // Build initials like "JC"
    let initials = "";
    if (p.firstName && p.firstName.trim()) {
      initials += p.firstName.trim()[0];
    }
    if (p.lastName && p.lastName.trim()) {
      initials += p.lastName.trim()[0];
    }
    initials = initials.toUpperCase();

    // Data attributes for CSS styling
    btn.dataset.status = hasProfile ? "complete" : "empty";
    btn.dataset.initials = initials;

    // Optional: show initials inside the button
    let pill = btn.querySelector(".profile-initials");
    if (!pill) {
      pill = document.createElement("span");
      pill.className = "profile-initials";
      btn.appendChild(pill);
    }

    pill.textContent = hasProfile && initials ? initials : "";
    pill.style.display = hasProfile && initials ? "inline-flex" : "none";

    // Tooltip
    btn.title = hasProfile
      ? `Profile: ${p.firstName || ""} ${p.lastName || ""}`.trim()
      : "Click to set up your profile for autofill and eligibility checks.";
  } catch (err) {
    console.warn("[popup] updateProfileIcon failed:", err);
  }
}

// -----------------------------------------------------------------------------
// Profile icon state helper: reflect whether profile is "complete"
// -----------------------------------------------------------------------------
async function updateProfileIcon() {
  const btn = document.getElementById("open-profile");
  if (!btn) return;

  try {
    const { userProfile } = await chrome.storage.sync.get("userProfile");
    const p = userProfile || {};

    const isComplete =
      p &&
      p.firstName &&
      p.lastName &&
      p.email &&
      p.school &&
      p.program &&
      p.expectedCompletion;

    // Simple status flag for CSS (e.g. green ring if complete)
    btn.dataset.status = isComplete ? "complete" : "empty";
    btn.title = isComplete
      ? "Profile saved – autofill & eligibility checks will use this."
      : "Click to set up your profile for autofill and smarter eligibility.";
  } catch (e) {
    console.warn("[popup] Could not load profile for icon:", e);
  }
}

// =============================================================================
// 2. POPUP STATE & FOCUS
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

function parseCheckInsInput(totalMinutes) {
  const raw = $("#focus-checkins")?.value || "";
  const nums = raw
    .split(/[,，]/)
    .map((s) => parseFloat(s.trim()))
    .filter((n) => !Number.isNaN(n) && n > 0);

  if (!nums.length) return [];
  if (nums.length === 1 && nums[0] < totalMinutes) {
    let t = nums[0];
    const res = [];
    while (t < totalMinutes) {
      res.push(`T+${t}`);
      t += nums[0];
    }
    return res;
  }
  return nums.filter((n) => n < totalMinutes).map((n) => `T+${n}`);
}

function startFocusBlock() {
  savePopupState();
  const minutes = parseInt($("#focus-minutes")?.value || "20", 10) || 20;
  const checkIns = parseCheckInsInput(minutes);

  // 1. Tell background to start a block (timer / alarms)
  chrome.runtime.sendMessage({ type: "START_BLOCK", minutes, checkIns });

  // 2. Notify the active tab (HUD / shield / mini-games)
  sendMessageToPage({
    type: "START_BLOCK",
    minutes,
    checkIns,
    autoSpotlight: true,
  });

  const status = $("#tool-status");
  if (status) {
    status.textContent = `Focus started (${minutes} min).`;
    setTimeout(() => window.close(), 1000);
  }
}

// End Focus button – unified stop path for normal focus & AI micro-start
function stopFocusBlock() {
  // 1. Tell background that the block was manually stopped (clears alarms)
  chrome.runtime.sendMessage({ type: "END_BLOCK", reason: "manual-stop" });

  // 2. Also tell the current page's content scripts / overlays to clean up
  sendMessageToPage({
    type: "END_BLOCK",
    source: "popup",
    reason: "manual-stop",
  });

  // 3. Quick confirmation then close popup
  const status = $("#tool-status");
  if (status) {
    status.textContent = "Focus ended.";
    setTimeout(() => window.close(), 800);
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
/* 3. AI WORKFLOW (Micro-start overlay is in popup_micro_start.js)
   This fallback /plan logic uses the same /workflow endpoint if needed. */
// =============================================================================
async function requestWorkflow(payload) {
  try {
    const resp = await fetch(WORKFLOW_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (!resp.ok) throw new Error("Workflow endpoint error");
    return await resp.json();
  } catch (err) {
    console.error(err);
    return null;
  }
}

function buildFallbackWorkflow(goal) {
  return {
    plan_id: "fallback",
    summary: {
      title: goal || "Focus Session",
      one_liner: "Backend offline. Basic timer started.",
      tags: ["Offline"],
    },
    micro_tasks: ["Read the requirements", "Break down the first step", "Check progress"],
    block_minutes: 20,
  };
}

async function onPlanClick() {
  const result = $("#ai-result");
  const btn = $("#plan");

  if (btn) btn.disabled = true;
  if (result) result.textContent = "Generating plan.";

  try {
    const text = await captureVisibleText();
    const rawGoal = $("#goal")?.value || "";
    const tab = await getActiveTab();

    let workflow = await requestWorkflow({
      user_id: "demo-user",
      goal: rawGoal,
      page_url: tab.url,
      raw_text: text,
    });

    if (!workflow) workflow = buildFallbackWorkflow(rawGoal);

    sendMessageToPage({
      type: "SHOW_PLAN_OVERLAY",
      workflow,
      userId: "demo-user",
    });

    if (result) result.textContent = "Opening overlay.";
    setTimeout(() => window.close(), 800);
  } catch (err) {
    console.error(err);
    if (result) result.textContent = "Error: " + err.message;
    if (btn) btn.disabled = false;
  }
}

// =============================================================================
// 4. ELIGIBILITY & SCAN
// =============================================================================

function analyzeRequirements(pageText, profile) {
  const text = (pageText || "").toLowerCase();
  const degreeType = (profile.degreeType || "").toLowerCase();
  const extraReasons = [];
  const extraMissing = [];
  let hardFail = false;

  if (text.includes("canadian citizen") || text.includes("canada citizen")) {
    if (profile.citizen) {
      extraReasons.push(
        "Scholarship requires a Canadian citizen ✅ and your profile says you are one.",
      );
    } else {
      extraMissing.push(
        "Scholarship requires a Canadian citizen, but your profile does not show this as TRUE.",
      );
      hardFail = true;
    }
  }

  const mentionsUndergrad =
    text.includes("undergraduate") || text.includes("undergrad") || text.includes("bachelor");
  const isUndergrad =
    degreeType.includes("undergrad") || degreeType.includes("bachelor");

  if (mentionsUndergrad) {
    if (isUndergrad) {
      extraReasons.push(
        "Scholarship mentions undergraduates and your degree type is set to an undergraduate / bachelor program.",
      );
    } else if (degreeType) {
      extraMissing.push(
        `Scholarship mentions undergraduates, but your degree type is "${profile.degreeType}". Make sure this matches.`,
      );
    } else {
      extraMissing.push(
        "Scholarship mentions undergraduates; your degree type is not set in your profile.",
      );
    }
  }

  return { extraReasons, extraMissing, isUndergrad, hardFail };
}

function renderEligibility(out, merged) {
  const reasonsHtml = (merged.reasons || [])
    .map((r) => `<li>${escapeHtml(r)}</li>`)
    .join("");
  const missingHtml = (merged.missing_info || [])
    .map((m) => `<li>${escapeHtml(m)}</li>`)
    .join("");

  out.innerHTML = `
    <div style="font-size:13px; line-height:1.5;">
      <div style="margin-bottom:4px;"><b>${
        merged.eligible
          ? "✅ You appear ELIGIBLE for this scholarship."
          : "❌ You likely are NOT eligible for this scholarship."
      }</b></div>
      ${
        reasonsHtml
          ? `<div style="margin-top:4px;"><div style="font-size:11px;text-transform:uppercase;color:#a5b4fc;margin-bottom:2px;">Matched from your profile:</div><ul style="margin:2px 0 0 16px;padding:0;list-style:none;">${reasonsHtml}</ul></div>`
          : ""
      }
      ${
        missingHtml
          ? `<div style="margin-top:6px;"><div style="font-size:11px;text-transform:uppercase;color:#facc15;margin-bottom:2px;">Unclear / not in your profile:</div><ul style="margin:2px 0 0 16px;padding:0;list-style:none;">${missingHtml}</ul></div>`
          : ""
      }
     </div>`;
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
    const [pageText, profile] = await Promise.all([
      captureVisibleText(),
      getProfileFromStorage(),
    ]);

    if (!profile) {
      if (out)
        out.innerHTML =
          "No profile found. Open <b>Profile</b>, fill it out, then try again.";
      return;
    }

    const extra = analyzeRequirements(pageText, profile);
    let backendData = { eligible: true, reasons: [], missing_info: [] };

    try {
      const resp = await fetch(ELIGIBILITY_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: "demo-user", profile, text: pageText }),
      });
      if (resp.ok) backendData = await resp.json();
    } catch (e) {
      console.warn("Backend eligibility check failed, using local only.");
    }

    let reasons = [...extra.extraReasons, ...(backendData.reasons || [])];
    let missing = [...extra.extraMissing, ...(backendData.missing_info || [])];

    // Filter out backend placeholder text
    reasons = reasons.filter(
      (r) =>
        !r.includes("not fully implemented") &&
        !r.includes("Scan + your own judgment"),
    );

    if (extra.isUndergrad) {
      const dropWords = ["undergraduate", "undergrad", "bachelor"];
      missing = missing.filter((m) => {
        const lm = m.toLowerCase();
        return !dropWords.some((w) => lm.includes(w));
      });
    }

    const merged = {
      eligible: extra.hardFail ? false : backendData.eligible,
      reasons,
      missing_info: missing,
    };

    if (status) status.textContent = "Eligibility checked.";
    if (out) renderEligibility(out, merged);
  } catch (err) {
    console.error(err);
    if (status) status.textContent = "Check failed.";
    if (out) out.innerHTML = "Eligibility check failed.";
  }
}

async function onScanPage() {
  const status = $("#tool-status");
  const out = $("#tool-output");
  if (status) status.textContent = "Scanning...";
  if (out) {
    show(out);
    out.innerHTML = "Scanning page...";
  }

  try {
    const text = await captureVisibleText();
    const resp = await fetch(PARSE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ user_id: "demo-user", text }),
    });
    const parsed = await resp.json();

    out.innerHTML = `
      <div><b>Deadline:</b> ${parsed.deadline || "Not found"}</div>
      <div><b>Refs Required:</b> ${parsed.refs_required ?? "-"}</div>
      ${
        parsed.values?.length
          ? `<div style="margin-top:4px"><b>Values:</b> ${parsed.values.join(", ")}</div>`
          : ""
      }
    `;
    if (status) status.textContent = "Done.";
  } catch (e) {
    if (status) status.textContent = "Scan failed.";
    if (out) out.textContent = "Scan failed.";
  }
}

// =============================================================================
// 5. AUTOFILL
// =============================================================================
async function autofillFormFromProfile() {
  const statusEl = $("#tool-status");
  if (statusEl) statusEl.textContent = "Autofilling...";

  try {
    const profile = await getProfileFromStorage();
    if (!profile) {
      if (statusEl) statusEl.textContent = "Profile empty.";
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      args: [profile],
      func: (profile) => {
        function labelTextFor(el) {
          if (!el) return "";
          if (el.id) {
            const byFor = document.querySelector(`label[for="${el.id}"]`);
            if (byFor) return byFor.innerText.trim();
          }
          const parentLabel = el.closest("label");
          return parentLabel ? parentLabel.innerText.trim() : "";
        }

        function matches(el, ...keywords) {
          const texts = [
            el.name,
            el.id,
            el.placeholder,
            el.getAttribute("aria-label"),
            labelTextFor(el),
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();
          return keywords.every((kw) => texts.includes(kw.toLowerCase()));
        }

        function fillText(value, ...keywords) {
          if (!value) return;
          const inputs = Array.from(
            document.querySelectorAll(
              "input:not([type='hidden']), textarea, select",
            ),
          );
          for (const el of inputs) {
            if (matches(el, ...keywords)) {
              el.value = value;
              el.dispatchEvent(new Event("input", { bubbles: true }));
              el.dispatchEvent(new Event("change", { bubbles: true }));
              break;
            }
          }
        }

        // Basic text fields
        fillText(profile.firstName, "first", "name");
        fillText(profile.firstName, "given", "name");
        fillText(profile.lastName, "last", "name");
        fillText(profile.lastName, "surname");
        fillText(profile.email, "email");
        fillText(profile.school, "school");
        fillText(profile.school, "university");
        fillText(profile.program, "program", "study");
        fillText(profile.program, "program");
        fillText(profile.program, "field", "study");

        // Address
        const fullAddress = [
          profile.street1,
          profile.street2,
          profile.city,
          profile.province,
          profile.postalCode,
        ]
          .filter(Boolean)
          .join(", ");

        fillText(profile.street1, "address", "line", "1");
        fillText(profile.street2, "address", "line", "2");
        fillText(fullAddress, "address");
        fillText(profile.city, "city");
        fillText(profile.province, "province");
        fillText(profile.province, "state");
        fillText(profile.postalCode, "postal");
        fillText(profile.postalCode, "zip");
        fillText(profile.country, "country");

        // Simple citizenship radios
        const radios = Array.from(
          document.querySelectorAll("input[type='radio']"),
        );
        radios.forEach((r) => {
          const label = labelTextFor(r).toLowerCase();
          const lower = (r.value || "").toLowerCase();
          if (
            (lower.includes("citizen") || lower.includes("canadian")) &&
            (r.value.toLowerCase() === "yes" ||
              label.includes("yes") ||
              label.includes("i am"))
          ) {
            r.click();
          }
        });
      },
    });

    if (statusEl) statusEl.textContent = "Autofill sent.";
  } catch (err) {
    if (statusEl) statusEl.textContent = "Autofill failed.";
  }
}

// =============================================================================
// 6. SCHOLARSHIP LIBRARY
// =============================================================================
async function onLoadLibrary() {
  const q = $("#library-search")?.value || "";
  const list = $("#library-list");
  const detail = $("#library-detail");
  const status = $("#library-status");

  if (!list || !detail) return;
  show(list);
  hide(detail);
  list.innerHTML = "Loading...";

  try {
    const params = q ? `?q=${encodeURIComponent(q)}` : "";
    const resp = await fetch(`${SCHOLARSHIPS_URL}${params}`);
    if (!resp.ok) throw new Error("Backend offline");

    const data = await resp.json();
    if (!data.length) {
      list.textContent = "No results found.";
      return;
    }

    list.innerHTML = "";
    data.forEach((item) => {
      const div = document.createElement("div");
      div.style.cssText = `
        padding: 8px 26px 8px 6px; margin-bottom: 6px; 
        background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.1); 
        border-radius: 6px; cursor: pointer; transition: background 0.1s;
      `;
      div.addEventListener(
        "mouseenter",
        () => (div.style.background = "rgba(255,255,255,0.08)"),
      );
      div.addEventListener(
        "mouseleave",
        () => (div.style.background = "rgba(255,255,255,0.03)"),
      );
      div.innerHTML = `
        <div style="font-weight:600; color:#e2e8f0; margin-bottom:2px;">${escapeHtml(
          item.title,
        )}</div>
        <div class="muted" style="font-size:10px;">${escapeHtml(
          item.source_site,
        )}</div>
      `;
      div.addEventListener("click", () => {
        detail.innerHTML = `
          <div style="margin-bottom:6px;">
             <div style="font-weight:700; font-size:13px; margin-bottom:4px;">${escapeHtml(
               item.title,
             )}</div>
             <div class="muted">${escapeHtml(item.source_site)}</div>
          </div>
          <div style="font-size:12px; line-height:1.4; margin-bottom:10px; white-space:pre-wrap; color:#cbd5e1;">${escapeHtml(
            item.description_short,
          )}</div>
          <a href="${
            item.source_url
          }" target="_blank" style="display:block; text-align:center; background:#3b82f6; color:white; text-decoration:none; padding:6px; border-radius:4px; font-weight:600;">Open Official Page ↗</a>
        `;
        show(detail);
      });
      list.appendChild(div);
    });
    if (status) status.textContent = `Found ${data.length} items.`;
  } catch (err) {
    list.textContent = "Library offline.";
  }
}

function toggleLibraryCard() {
  const card = $("#library-card");
  if (!card) return;
  if (card.classList.contains("hidden")) show(card);
  else hide(card);
}

// =============================================================================
// 7. SAVED BOOKMARKS & SAVE PAGE
// =============================================================================
async function markBookmarkDropped(id) {
  await fetch(BOOKMARK_STATUS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: "demo-user", id, status: "dropped" }),
  });
}

async function onShowSavedToggle() {
  const listEl = $("#saved-list");
  if (!listEl) return;

  if (!listEl.classList.contains("hidden")) {
    hide(listEl);
    return;
  }

  show(listEl);
  listEl.innerHTML = "Loading.";

  try {
    const resp = await fetch(BOOKMARKS_URL);
    let items = await resp.json();
    items = items.filter((bm) => bm.status !== "dropped");

    if (!items.length) {
      listEl.textContent = "No saved pages.";
      return;
    }

    listEl.innerHTML = items
      .map(
        (bm) => `
        <div class="saved-item" data-id="${
          bm.id
        }" style="position:relative; padding:8px 26px 8px 6px; border-bottom:1px solid rgba(255,255,255,0.1);">
           <a href="${
             bm.url
           }" target="_blank" style="color:#bfdbfe; text-decoration:none; font-weight:600; font-size:12px; display:block; margin-bottom:2px;">${escapeHtml(
          bm.title || "Untitled",
        )}</a>
           <div class="muted" style="font-size:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${escapeHtml(
             bm.url,
           )}</div>
           <button class="saved-delete" title="Delete" style="position:absolute; right:4px; top:8px; background:none; border:none; color:#f87171; cursor:pointer; font-size:14px; padding:0 4px;">✕</button>
        </div>
      `,
      )
      .join("");

    listEl.querySelectorAll(".saved-delete").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const item = btn.closest(".saved-item");
        const id = item.getAttribute("data-id");
        item.remove();
        if (!listEl.querySelector(".saved-item")) {
          listEl.textContent = "No saved pages.";
        }
        try {
          await markBookmarkDropped(id);
        } catch (err) {
          console.error(err);
        }
      });
    });
  } catch (e) {
    listEl.innerHTML = "Could not load bookmarks.";
  }
}

// --- ROBUST SAVE LOGIC (with fallback + better error surface) ---
async function onSavePage() {
  const status = $("#tool-status");
  if (status) {
    status.textContent = "Saving...";
    status.style.color = "";
  }

  try {
    // More robust tab lookup – active tab in last focused window
    const tabs = await chrome.tabs.query({
      active: true,
      lastFocusedWindow: true,
    });
    const tab = tabs[0];

    if (!tab || !tab.url) {
      throw new Error("No active page to save.");
    }

    const payload = {
      user_id: "demo-user",
      url: tab.url,
      title: tab.title || tab.url,
    };

    // Primary attempt: POST /bookmark
    let resp = await fetch(BOOKMARK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    // Fallback: some backends use /bookmarks for POST as well
    if (!resp.ok) {
      console.warn(
        "[popup] /bookmark returned",
        resp.status,
        "trying /bookmarks fallback...",
      );
      const altResp = await fetch(`${API_BASE}/bookmarks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!altResp.ok) {
        const text = await altResp.text().catch(() => "");
        throw new Error(
          `Server error: ${altResp.status} ${text ? "– " + text : ""}`,
        );
      }
      resp = altResp;
    }

    if (status) {
      status.textContent = "Saved!";
      status.style.color = "#10b981"; // Green
      setTimeout(() => {
        status.textContent = "";
        status.style.color = "";
      }, 2000);
    }

    // If "Saved" panel is open, refresh it
    const listEl = $("#saved-list");
    if (listEl && !listEl.classList.contains("hidden")) {
      onShowSavedToggle(); // hide
      setTimeout(onShowSavedToggle, 50); // show + reload
    }
  } catch (e) {
    console.error("[popup] Save failed:", e);
    if (status) {
      status.textContent = `Save failed${
        e && e.message ? ": " + e.message : "."
      }`;
      status.style.color = "#f87171"; // Red
    }
  }
}

// =============================================================================
// INIT
// =============================================================================
document.addEventListener("DOMContentLoaded", () => {
  restorePopupState();
  bindSpotlightControls();
  updateProfileIcon(); // reflect initial profile state in the button

  // AI micro-start: popup_micro_start.js also attaches to #plan
  $("#plan")?.addEventListener("click", onPlanClick); // keep as fallback if needed

  // Focus start / end
  $("#btn-start")?.addEventListener("click", startFocusBlock);
  $("#btn-end")?.addEventListener("click", stopFocusBlock);

  // Scan + eligibility
  $("#btn-scan")?.addEventListener("click", onScanPage);
  $("#btn-check-elig")?.addEventListener("click", onCheckEligibility);

  // Save & bookmarks
  $("#btn-save")?.addEventListener("click", onSavePage);
  $("#btn-autofill")?.addEventListener("click", autofillFormFromProfile);
  $("#btn-show-saved")?.addEventListener("click", onShowSavedToggle);

  // Library
  $("#btn-open-library")?.addEventListener("click", toggleLibraryCard);
  $("#btn-load-library")?.addEventListener("click", onLoadLibrary);
  $("#library-search")?.addEventListener("keydown", (e) => {
    if (e.key === "Enter") onLoadLibrary();
  });

  // Profile: open as a large popup window (not a normal tab)
  $("#open-profile")?.addEventListener("click", () => {
    chrome.windows.create({
      url: PROFILE_PAGE_URL,
      type: "popup",
      width: 900,
      height: 900,
    });
  });

  // Mini relax game (unchanged)
  $("#btn-relax-game")?.addEventListener("click", () =>
    sendMessageToPage({ type: "MANUAL_START_GAME", game: "sniper" }),
  );

  // Persist small popup state
  $("#goal")?.addEventListener("input", savePopupState);
  $("#focus-minutes")?.addEventListener("input", savePopupState);
});

// When profile.html saves and broadcasts PROFILE_UPDATED, refresh icon state
chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.type === "PROFILE_UPDATED") {
    updateProfileIcon();
  }
});

// Listen for profile updates from profile.html
chrome.runtime.onMessage.addListener((msg) => {
  if (!msg || typeof msg.type !== "string") return;
  if (msg.type === "PROFILE_UPDATED") {
    updateProfileIcon();
  }
});
