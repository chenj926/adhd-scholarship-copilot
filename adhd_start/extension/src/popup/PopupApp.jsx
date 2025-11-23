// src/popup/PopupApp.jsx
/* global chrome */

import React, { useEffect, useState } from "react";

// ---------------------------------------------------------------------------
// 1. CONFIG & HELPERS (ported from popup.js + popup_micro_start.js)
// ---------------------------------------------------------------------------
const API_BASE = "http://localhost:8000";
const WORKFLOW_URL = `${API_BASE}/workflow`;
const PARSE_URL = `${API_BASE}/parse`;
const BOOKMARK_URL = `${API_BASE}/bookmark`;
const BOOKMARKS_URL = `${API_BASE}/bookmarks?user_id=demo-user`;
const BOOKMARK_STATUS_URL = `${API_BASE}/bookmark/status`;
const LOCAL_BOOKMARKS_KEY = "localBookmarks";
const ELIGIBILITY_URL = `${API_BASE}/eligibility`;
const SCHOLARSHIPS_URL = `${API_BASE}/scholarships`;
const DEFAULT_USER_ID = "demo-user";
const PROFILE_PAGE_URL = chrome.runtime.getURL("profile.html");

const BTN_SMALL =
  "inline-flex items-center rounded-md border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] text-slate-200 hover:bg-slate-700 transition";
const BTN_PRIMARY =
  "inline-flex items-center justify-center rounded-md bg-blue-500 px-3 py-2 text-[12px] font-semibold text-slate-950 hover:bg-blue-400 transition disabled:opacity-60 disabled:cursor-not-allowed";
const BTN_SECONDARY =
  "inline-flex items-center justify-center rounded-md border border-slate-700 bg-slate-900 px-3 py-2 text-[12px] text-slate-200 hover:bg-slate-800 transition";
const BTN_DANGER =
  "inline-flex items-center justify-center rounded-md border border-red-500/60 bg-slate-900 px-3 py-2 text-[12px] text-red-300 hover:bg-red-500/10 transition";
const CARD =
  "rounded-xl border border-slate-800 bg-slate-900/70 p-3 space-y-3";

function escapeHtml(s) {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getActiveTab() {
  return new Promise((resolve, reject) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        return reject(chrome.runtime.lastError);
      }
      const tab = tabs && tabs[0];
      if (!tab || !tab.id) return reject(new Error("No active tab"));
      resolve(tab);
    });
  });
}

function captureVisibleText(tabIdOverride) {
  return new Promise(async (resolve) => {
    try {
      let tabId = tabIdOverride;
      if (!tabId) {
        const tab = await getActiveTab();
        tabId = tab.id;
      }
      chrome.scripting.executeScript(
        {
          target: { tabId },
          func: () =>
            document.body ? document.body.innerText.slice(0, 15000) : "",
        },
        (results) => {
          if (chrome.runtime.lastError) {
            console.warn(
              "[popup] captureVisibleText error:",
              chrome.runtime.lastError
            );
            resolve("");
            return;
          }
          const [exec] = results || [];
          resolve((exec && exec.result) || "");
        }
      );
    } catch (err) {
      console.warn("[popup] captureVisibleText threw:", err);
      resolve("");
    }
  });
}

function sendMessageToPage(msg) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (!tab?.id) return;

    chrome.tabs.sendMessage(tab.id, msg, { frameId: 0 }, () => {
      if (chrome.runtime.lastError) {
        console.warn(
          "[popup] Injecting content scripts:",
          chrome.runtime.lastError.message
        );
        chrome.scripting.executeScript(
          {
            target: { tabId: tab.id },
            files: ["focus_games.js", "micro_start_overlay.js"],
          },
          () => {
            setTimeout(() => {
              chrome.tabs.sendMessage(tab.id, msg, { frameId: 0 }, () => {});
            }, 200);
          }
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

function parseCheckInsInput(totalMinutes, rawInput) {
  const raw = rawInput || "";
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

// --- eligibility helpers (from popup.js) ---
function analyzeRequirements(pageText, profile) {
  const text = (pageText || "").toLowerCase();
  const degreeType = (profile.degreeType || "").toLowerCase();
  const extraReasons = [];
  const extraMissing = [];
  let hardFail = false;

  if (text.includes("canadian citizen") || text.includes("canada citizen")) {
    if (profile.citizen) {
      extraReasons.push(
        "Scholarship requires a Canadian citizen ✅ and your profile says you are one."
      );
    } else {
      extraMissing.push(
        "Scholarship requires a Canadian citizen, but your profile does not show this as TRUE."
      );
      hardFail = true;
    }
  }

  const mentionsUndergrad =
    text.includes("undergraduate") ||
    text.includes("undergrad") ||
    text.includes("bachelor");
  const isUndergrad =
    degreeType.includes("undergrad") || degreeType.includes("bachelor");

  if (mentionsUndergrad) {
    if (isUndergrad) {
      extraReasons.push(
        "Scholarship mentions undergraduates and your degree type is set to an undergraduate / bachelor program."
      );
    } else if (degreeType) {
      extraMissing.push(
        `Scholarship mentions undergraduates, but your degree type is "${profile.degreeType}". Make sure this matches.`
      );
    } else {
      extraMissing.push(
        "Scholarship mentions undergraduates; your degree type is not set in your profile."
      );
    }
  }

  return { extraReasons, extraMissing, isUndergrad, hardFail };
}

function buildEligibilityHtml(merged) {
  const reasonsHtml = (merged.reasons || [])
    .map((r) => `<li>${escapeHtml(r)}</li>`)
    .join("");
  const missingHtml = (merged.missing_info || [])
    .map((m) => `<li>${escapeHtml(m)}</li>`)
    .join("");

  return `
    <div class="text-[13px] leading-relaxed">
      <div class="mb-1 font-semibold">${
        merged.eligible
          ? "✅ You appear ELIGIBLE for this scholarship."
          : "❌ You likely are NOT eligible for this scholarship."
      }</div>
      ${
        reasonsHtml
          ? `<div class="mt-1"><div class="text-[11px] uppercase text-indigo-300 mb-1">Matched from your profile:</div><ul class="m-0 ml-4 list-disc space-y-0.5">${reasonsHtml}</ul></div>`
          : ""
      }
      ${
        missingHtml
          ? `<div class="mt-2"><div class="text-[11px] uppercase text-amber-300 mb-1">Unclear / not in your profile:</div><ul class="m-0 ml-4 list-disc space-y-0.5">${missingHtml}</ul></div>`
          : ""
      }
     </div>`;
}

// workflow request + fallback combined (popup.js + popup_micro_start.js)
async function requestWorkflowWithFallback(payload, fallbackGoal) {
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
    return {
      plan_id: "fallback",
      summary: {
        title: fallbackGoal || "Focus Session",
        one_liner: "Backend offline. Basic timer started.",
        tags: ["Offline"],
      },
      micro_tasks: [
        "Read the requirements section once.",
        "Highlight key deadlines.",
        "Decide one tiny step to do now.",
      ],
      block_minutes: 20,
      key_points: [],
    };
  }
}

// bookmarks helpers
async function markBookmarkDropped(id) {
  await fetch(BOOKMARK_STATUS_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ user_id: DEFAULT_USER_ID, id, status: "dropped" }),
  });
}

function addLocalBookmark(bm) {
  return new Promise((resolve) => {
    chrome.storage.local.get(LOCAL_BOOKMARKS_KEY, (res) => {
      const arr = Array.isArray(res[LOCAL_BOOKMARKS_KEY])
        ? res[LOCAL_BOOKMARKS_KEY]
        : [];

      const idx = arr.findIndex((x) => x.url === bm.url);
      if (idx >= 0) {
        arr[idx] = { ...arr[idx], ...bm };
      } else {
        arr.push(bm);
      }

      chrome.storage.local.set({ [LOCAL_BOOKMARKS_KEY]: arr }, () => resolve());
    });
  });
}

function getLocalBookmarks() {
  return new Promise((resolve) => {
    chrome.storage.local.get(LOCAL_BOOKMARKS_KEY, (res) => {
      const arr = Array.isArray(res[LOCAL_BOOKMARKS_KEY])
        ? res[LOCAL_BOOKMARKS_KEY]
        : [];
      resolve(arr);
    });
  });
}

function removeLocalBookmark(id) {
  return new Promise((resolve) => {
    chrome.storage.local.get(LOCAL_BOOKMARKS_KEY, (res) => {
      let arr = Array.isArray(res[LOCAL_BOOKMARKS_KEY])
        ? res[LOCAL_BOOKMARKS_KEY]
        : [];
      arr = arr.filter((bm) => bm.id !== id);
      chrome.storage.local.set({ [LOCAL_BOOKMARKS_KEY]: arr }, () => resolve());
    });
  });
}

async function loadMergedBookmarks() {
  let serverItems = [];
  try {
    const resp = await fetch(BOOKMARKS_URL);
    if (resp.ok) {
      const data = await resp.json();
      if (Array.isArray(data)) {
        serverItems = data.filter((bm) => bm.status !== "dropped");
      } else {
        console.warn("[popup] BOOKMARKS_URL returned non-array", data);
      }
    } else {
      console.warn("[popup] BOOKMARKS_URL error:", resp.status);
    }
  } catch (e) {
    console.warn(
      "[popup] Failed to load server bookmarks, will use local only.",
      e
    );
  }

  const localItems = await getLocalBookmarks();

  const byUrl = new Map();
  (localItems || []).forEach((bm) => {
    if (!bm || !bm.url) return;
    byUrl.set(bm.url, { ...bm, _source: "local" });
  });
  (serverItems || []).forEach((bm) => {
    if (!bm || !bm.url) return;
    byUrl.set(bm.url, { ...bm, _source: "server" });
  });

  return Array.from(byUrl.values());
}

// ---------------------------------------------------------------------------
// 2. PopupApp component
// ---------------------------------------------------------------------------
export default function PopupApp() {
  // Focus & shield state
  const [goal, setGoal] = useState("");
  const [focusMinutes, setFocusMinutes] = useState("20");
  const [checkinsInput, setCheckinsInput] = useState("5, 12");
  const [spotlightMode, setSpotlightMode] = useState("circle");

  // AI micro-start
  const [aiStatus, setAiStatus] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // Tools (status + output)
  const [toolStatus, setToolStatus] = useState("");
  const [toolOutputHtml, setToolOutputHtml] = useState("");
  const [toolOutputVisible, setToolOutputVisible] = useState(false);

  // Saved bookmarks
  const [savedOpen, setSavedOpen] = useState(false);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedItems, setSavedItems] = useState([]);

  // Library
  const [libraryOpen, setLibraryOpen] = useState(false);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryStatus, setLibraryStatus] = useState("");
  const [libraryItems, setLibraryItems] = useState([]);
  const [librarySelected, setLibrarySelected] = useState(null);

  // Profile completeness
  const [profileComplete, setProfileComplete] = useState(false);

  // Relax game dropdown
  const [relaxGame, setRelaxGame] = useState("sniper");

  // -------------------------------------------------------------------------
  // Restore + persist popup state (goal, minutes, check-ins)
  // -------------------------------------------------------------------------
  useEffect(() => {
    chrome.storage.local.get(["popupState"], (res) => {
      const s = res.popupState;
      if (!s) return;
      setGoal(s.goal || "");
      setFocusMinutes(s.minutes || "20");
      setCheckinsInput(s.checkins || "5, 12");
    });

    // initial profile completeness (same logic as service-worker + popup.js)
    chrome.storage.sync.get("userProfile", (res) => {
      const p = res.userProfile || {};
      const isComplete =
        p &&
        p.firstName &&
        p.lastName &&
        p.email &&
        p.school &&
        p.program &&
        p.expectedCompletion;
      setProfileComplete(Boolean(isComplete));
    });

    const listener = (msg) => {
      if (!msg || msg.type !== "PROFILE_UPDATED") return;
      const p = msg.profile || {};
      const isComplete =
        p &&
        p.firstName &&
        p.lastName &&
        p.email &&
        p.school &&
        p.program &&
        p.expectedCompletion;
      setProfileComplete(Boolean(isComplete));
    };

    chrome.runtime.onMessage.addListener(listener);
    return () => chrome.runtime.onMessage.removeListener(listener);
  }, []);

  useEffect(() => {
    chrome.storage.local.set({
      popupState: {
        goal,
        minutes: focusMinutes,
        checkins: checkinsInput,
      },
    });
  }, [goal, focusMinutes, checkinsInput]);

  // -------------------------------------------------------------------------
  // Focus block handlers (start / end + spotlight)
  // -------------------------------------------------------------------------
  const handleStartFocus = async () => {
    const minutes = parseInt(focusMinutes || "20", 10) || 20;
    const checkIns = parseCheckInsInput(minutes, checkinsInput);

    chrome.runtime.sendMessage({ type: "START_BLOCK", minutes, checkIns });

    sendMessageToPage({
      type: "START_BLOCK",
      minutes,
      checkIns,
      autoSpotlight: true,
    });

    setToolStatus(`Focus started (${minutes} min).`);
    setTimeout(() => window.close(), 1000);
  };

  const handleEndFocus = () => {
    chrome.runtime.sendMessage({ type: "END_BLOCK", reason: "manual-stop" });
    sendMessageToPage({
      type: "END_BLOCK",
      source: "popup",
      reason: "manual-stop",
    });
    setToolStatus("Focus ended.");
    setTimeout(() => window.close(), 800);
  };

  const handleSpotlightChange = (mode) => {
    setSpotlightMode(mode);
    sendMessageToPage({
      type: "TOGGLE_SPOTLIGHT",
      enable: mode !== "none",
      mode,
    });
  };

  const handleRelaxGame = () => {
    sendMessageToPage({ type: "MANUAL_START_GAME", game: relaxGame });
  };

  // -------------------------------------------------------------------------
  // AI Micro-start (full logic from popup.js + popup_micro_start.js)
// -------------------------------------------------------------------------
  const handleAIMicroStart = async () => {
    if (aiLoading) return;

    try {
      setAiLoading(true);
      setAiStatus("Thinking about a tiny starting plan…");

      const activeTab = await getActiveTab();
      const rawText = await captureVisibleText(activeTab.id);

      const finalGoal =
        (goal && goal.trim()) ||
        "Help me get started with this scholarship / job application.";

      const workflow = await requestWorkflowWithFallback(
        {
          user_id: DEFAULT_USER_ID,
          goal: finalGoal,
          page_url: activeTab.url || "",
          raw_text: rawText || null,
        },
        finalGoal
      );

      chrome.tabs.sendMessage(activeTab.id, {
        type: "SHOW_PLAN_OVERLAY",
        workflow,
        userId: DEFAULT_USER_ID,
      });

      setAiStatus("Opening micro-start overlay…");
      setTimeout(() => window.close(), 300);
    } catch (err) {
      console.error("[ADHD Copilot] Micro-start overlay error:", err);
      setAiStatus(`Error: ${err.message}`);
      setAiLoading(false);
    }
  };

  // -------------------------------------------------------------------------
  // Scholarship tools: scan, eligibility, autofill, save
  // -------------------------------------------------------------------------
  const handleScanPage = async () => {
    setToolStatus("Scanning...");
    setToolOutputVisible(true);
    setToolOutputHtml(
      '<div class="text-xs text-slate-300">Scanning page...</div>'
    );

    try {
      const text = await captureVisibleText();
      const resp = await fetch(PARSE_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: DEFAULT_USER_ID, text }),
      });
      const parsed = await resp.json();

      const html = `
        <div class="space-y-1 text-[12px]">
          <div><span class="font-semibold">Deadline:</span> ${escapeHtml(
            parsed.deadline || "Not found"
          )}</div>
          <div><span class="font-semibold">Refs Required:</span> ${
            parsed.refs_required ?? "-"
          }</div>
          ${
            parsed.values?.length
              ? `<div><span class="font-semibold">Values:</span> ${escapeHtml(
                  parsed.values.join(", ")
                )}</div>`
              : ""
          }
        </div>
      `;
      setToolOutputHtml(html);
      setToolStatus("Done.");
    } catch (e) {
      console.error(e);
      setToolStatus("Scan failed.");
      setToolOutputHtml(
        '<div class="text-xs text-red-300">Scan failed.</div>'
      );
    }
  };

  const handleCheckEligibility = async () => {
    setToolStatus("Checking eligibility…");
    setToolOutputVisible(true);
    setToolOutputHtml("");

    try {
      const [pageText, profile] = await Promise.all([
        captureVisibleText(),
        getProfileFromStorage(),
      ]);

      if (!profile) {
        setToolOutputHtml(
          'No profile found. Open <b>Profile</b>, fill it out, then try again.'
        );
        setToolStatus("No profile.");
        return;
      }

      const extra = analyzeRequirements(pageText, profile);
      let backendData = { eligible: true, reasons: [], missing_info: [] };

      try {
        const resp = await fetch(ELIGIBILITY_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: DEFAULT_USER_ID,
            profile,
            text: pageText,
          }),
        });
        if (resp.ok) backendData = await resp.json();
      } catch (e) {
        console.warn("Backend eligibility check failed, using local only.");
      }

      let reasons = [
        ...extra.extraReasons,
        ...(backendData.reasons || []),
      ];
      let missing = [
        ...extra.extraMissing,
        ...(backendData.missing_info || []),
      ];

      reasons = reasons.filter(
        (r) =>
          !r.includes("not fully implemented") &&
          !r.includes("Scan + your own judgment")
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

      setToolStatus("Eligibility checked.");
      setToolOutputHtml(buildEligibilityHtml(merged));
    } catch (err) {
      console.error(err);
      setToolStatus("Check failed.");
      setToolOutputHtml(
        '<div class="text-xs text-red-300">Eligibility check failed.</div>'
      );
    }
  };

  const handleAutofill = async () => {
    setToolStatus("Autofilling...");

    try {
      const profile = await getProfileFromStorage();
      if (!profile) {
        setToolStatus("Profile empty.");
        return;
      }

      const tab = await getActiveTab();

      await chrome.scripting.executeScript({
        target: { tabId: tab.id },
        args: [profile],
        func: (profileArg) => {
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
            return keywords.every((kw) =>
              texts.includes(kw.toLowerCase())
            );
          }

          function fillText(value, ...keywords) {
            if (!value) return;
            const inputs = Array.from(
              document.querySelectorAll(
                "input:not([type='hidden']), textarea, select"
              )
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

          const p = profileArg || {};

          fillText(p.firstName, "first", "name");
          fillText(p.firstName, "given", "name");
          fillText(p.lastName, "last", "name");
          fillText(p.lastName, "surname");
          fillText(p.email, "email");
          fillText(p.school, "school");
          fillText(p.school, "university");
          fillText(p.program, "program", "study");
          fillText(p.program, "program");
          fillText(p.program, "field", "study");

          const fullAddress = [
            p.street1,
            p.street2,
            p.city,
            p.province,
            p.postalCode,
          ]
            .filter(Boolean)
            .join(", ");

          fillText(p.street1, "address", "line", "1");
          fillText(p.street2, "address", "line", "2");
          fillText(fullAddress, "address");
          fillText(p.city, "city");
          fillText(p.province, "province");
          fillText(p.province, "state");
          fillText(p.postalCode, "postal");
          fillText(p.postalCode, "zip");
          fillText(p.country, "country");

          const radios = Array.from(
            document.querySelectorAll("input[type='radio']")
          );
          radios.forEach((r) => {
            const label = labelTextFor(r).toLowerCase();
            const lower = (r.value || "").toLowerCase();
            if (
              (lower.includes("citizen") || lower.includes("canadian")) &&
              (lower === "yes" ||
                label.includes("yes") ||
                label.includes("i am"))
            ) {
              r.click();
            }
          });
        },
      });

      setToolStatus("Autofill sent.");
    } catch (err) {
      console.error(err);
      setToolStatus("Autofill failed.");
    }
  };

  const handleSavePage = async () => {
    setToolStatus("Saving...");
    try {
      const tab = await getActiveTab();
      if (!tab || !tab.url) throw new Error("No active page to save.");

      const url = tab.url;
      const title = tab.title || tab.url;

      const localBookmark = {
        id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        url,
        title,
        createdAt: new Date().toISOString(),
      };
      await addLocalBookmark(localBookmark);

      let serverOk = false;
      try {
        const resp = await fetch(BOOKMARK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            user_id: DEFAULT_USER_ID,
            url,
            title,
          }),
        });

        if (!resp.ok) {
          throw new Error(`Server returned ${resp.status}`);
        }
        serverOk = true;
      } catch (err) {
        console.warn(
          "[popup] Server bookmark save failed, using local only.",
          err
        );
      }

      setToolStatus(
        serverOk ? "Saved!" : "Saved locally (server offline)."
      );

      if (savedOpen) {
        setSavedLoading(true);
        const items = await loadMergedBookmarks();
        setSavedItems(items);
        setSavedLoading(false);
      }
    } catch (e) {
      console.error("[popup] Save failed:", e);
      setToolStatus("Save failed.");
    } finally {
      setTimeout(() => setToolStatus(""), 2000);
    }
  };

  // -------------------------------------------------------------------------
  // Saved bookmarks + library
  // -------------------------------------------------------------------------
  const toggleSaved = async () => {
    if (!savedOpen) {
      setSavedOpen(true);
      setSavedLoading(true);
      const items = await loadMergedBookmarks();
      setSavedItems(items);
      setSavedLoading(false);
    } else {
      setSavedOpen(false);
    }
  };

  const handleDeleteBookmark = async (item) => {
    setSavedItems((items) => items.filter((bm) => bm.url !== item.url));

    try {
      if (item._source === "server" && item.id) {
        await markBookmarkDropped(item.id);
      } else if (item._source === "local" && item.id) {
        await removeLocalBookmark(item.id);
      }
    } catch (err) {
      console.error("[popup] Failed to delete bookmark:", err);
    }
  };

  const toggleLibrary = () => {
    setLibraryOpen((open) => !open);
  };

  const loadLibrary = async () => {
    setLibraryStatus("Loading...");
    setLibraryItems([]);
    setLibrarySelected(null);

    try {
      const params = libraryQuery
        ? `?q=${encodeURIComponent(libraryQuery)}`
        : "";
      const resp = await fetch(`${SCHOLARSHIPS_URL}${params}`);
      if (!resp.ok) throw new Error("Backend offline");

      const data = await resp.json();
      if (!data.length) {
        setLibraryItems([]);
        setLibraryStatus("No results found.");
        return;
      }

      setLibraryItems(data);
      setLibraryStatus(`Found ${data.length} items.`);
    } catch (err) {
      console.error(err);
      setLibraryStatus("Library offline.");
    }
  };

  // -------------------------------------------------------------------------
  // Render
  // -------------------------------------------------------------------------
  return (
    <div className="w-[380px] bg-slate-950 text-slate-100 text-[12px] p-3 space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="font-semibold text-sm flex items-center gap-1">
          <span>⚡</span>
          <span>Copilot</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            title="My Saved Scholarships"
            onClick={toggleSaved}
            className={BTN_SMALL}
          >
            🔖 Saved
          </button>
          <button
            title="Scholarship Library"
            onClick={toggleLibrary}
            className={BTN_SMALL}
          >
            📚 Library
          </button>
          <button
            id="open-profile"
            title={
              profileComplete
                ? "Profile saved – autofill & eligibility checks will use this."
                : "Click to set up your profile for autofill and smarter eligibility."
            }
            onClick={() => {
              chrome.windows.create({
                url: PROFILE_PAGE_URL,
                type: "popup",
                width: 900,
                height: 900,
              });
            }}
            className={`${BTN_SMALL} relative pl-2 pr-2`}
          >
            <span className="mr-1">👤</span>
            <span>Profile</span>
            <span
              className={`ml-1 h-2 w-2 rounded-full ${
                profileComplete ? "bg-emerald-400" : "bg-slate-500"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Saved list */}
      {savedOpen && (
        <div className="max-h-40 overflow-y-auto rounded-lg border border-emerald-500/60 bg-slate-900/80 p-2 text-[11px] space-y-2">
          {savedLoading && (
            <div className="text-slate-400 text-xs">Loading...</div>
          )}
          {!savedLoading && savedItems.length === 0 && (
            <div className="text-slate-400 text-xs">No saved pages.</div>
          )}
          {!savedLoading &&
            savedItems.map((bm) => (
              <div
                key={bm.url}
                className="relative rounded-md bg-slate-900 px-2 py-2 text-[11px] border border-slate-700/80"
              >
                <a
                  href={bm.url}
                  target="_blank"
                  rel="noreferrer"
                  className="block pr-5 text-sky-200 font-semibold truncate"
                >
                  {bm.title || "Untitled"}
                </a>
                <div className="mt-0.5 text-slate-400 text-[10px] truncate pr-5">
                  {bm.url}
                </div>
                <button
                  title="Delete"
                  onClick={() => handleDeleteBookmark(bm)}
                  className="absolute right-1.5 top-1.5 text-[13px] text-red-400 hover:text-red-300"
                >
                  ✕
                </button>
              </div>
            ))}
        </div>
      )}

      {/* Card: Focus & Shield */}
      <div className={CARD}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[11px] uppercase tracking-wide text-slate-400">
            Focus &amp; Shield
          </span>
          <div className="inline-flex items-center gap-1 rounded-md bg-slate-950 p-0.5">
            {["none", "circle", "rect"].map((mode) => (
              <button
                key={mode}
                className={`px-2 py-1 text-[10px] rounded-sm border border-transparent ${
                  spotlightMode === mode
                    ? "bg-slate-800 text-blue-400 border-slate-700 shadow-sm"
                    : "text-slate-500 hover:bg-slate-900"
                }`}
                onClick={() => handleSpotlightChange(mode)}
              >
                {mode === "none" ? "OFF" : mode.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        <textarea
          rows={2}
          placeholder="Goal: e.g. 'Fill out personal info'"
          value={goal}
          onChange={(e) => setGoal(e.target.value)}
          id="goal"
          className="w-full rounded-md border border-slate-800 bg-slate-950 px-2 py-2 text-[12px] text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />

        <div className="flex mt-1">
          <button
            id="plan"
            onClick={handleAIMicroStart}
            disabled={aiLoading}
            className={`${BTN_PRIMARY} w-full justify-center`}
          >
            {aiLoading ? "⏳ Micro-Start…" : "✨ AI Micro-Start"}
          </button>
        </div>
        <div
          id="ai-result"
          className="min-h-[16px] text-[11px] text-slate-400"
        >
          {aiStatus}
        </div>

        <div className="mt-2 flex gap-2 rounded-md bg-slate-950 px-2 py-2">
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-[9px] font-medium text-slate-500">
              BLOCK (MIN)
            </span>
            <input
              id="focus-minutes"
              type="number"
              value={focusMinutes}
              min={5}
              max={120}
              onChange={(e) => setFocusMinutes(e.target.value)}
              className="w-full border-b border-slate-700 bg-transparent text-center text-[12px] text-slate-100 outline-none"
            />
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <span className="text-[9px] font-medium text-slate-500">
              CHECK-IN (MIN)
            </span>
            <input
              id="focus-checkins"
              type="text"
              value={checkinsInput}
              onChange={(e) => setCheckinsInput(e.target.value)}
              className="w-full border-b border-slate-700 bg-transparent text-center text-[12px] text-slate-100 outline-none"
            />
          </div>
        </div>

        <button
          id="btn-start"
          className={`${BTN_PRIMARY} w-full mt-1 justify-center bg-emerald-500 hover:bg-emerald-400 text-slate-950`}
          onClick={handleStartFocus}
        >
          🚀 Start Focus Mode
        </button>
        <button
          id="btn-end"
          className={`${BTN_SECONDARY} w-full mt-1 justify-center`}
          onClick={handleEndFocus}
        >
          ⏹ End focus early
        </button>

        <div className="mt-1 flex items-center gap-2">
          <select
            id="relax-game-select"
            className="flex-1 rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 focus:outline-none focus:ring-1 focus:ring-slate-500"
            value={relaxGame}
            onChange={(e) => setRelaxGame(e.target.value)}
          >
            <option value="sniper">Visual search (dogs / numbers)</option>
            <option value="chain">Focus chain only</option>
          </select>
          <button
            id="btn-relax-game"
            className={BTN_SECONDARY}
            onClick={handleRelaxGame}
          >
            🧩 Relax game
          </button>
        </div>
      </div>

      {/* Card: Scholarship Tools */}
      <div className={CARD}>
        <div className="text-[11px] uppercase tracking-wide text-slate-400 mb-1">
          Scholarship Tools
        </div>

        <div className="grid grid-cols-2 gap-2">
          <button
            id="btn-scan"
            onClick={handleScanPage}
            className={BTN_SECONDARY}
          >
            🗒️ Summary
          </button>
          <button
            id="btn-check-elig"
            onClick={handleCheckEligibility}
            className={BTN_SECONDARY}
          >
            ⚖️ Eligibility
          </button>
          <button
            id="btn-save"
            onClick={handleSavePage}
            className={BTN_SECONDARY}
          >
            💾 Save Page
          </button>
          <button
            id="btn-autofill"
            onClick={handleAutofill}
            className={BTN_SECONDARY}
          >
            ✍️ Autofill (Beta)
          </button>
        </div>

        <div
          id="tool-status"
          className="mt-1 min-h-[14px] text-[11px] text-slate-400"
        >
          {toolStatus}
        </div>
        {toolOutputVisible && (
          <div
            id="tool-output"
            className="mt-1 max-h-40 overflow-y-auto rounded-md border border-slate-700 bg-slate-950/80 p-2 text-[11px]"
            dangerouslySetInnerHTML={{ __html: toolOutputHtml }}
          />
        )}
      </div>

      {/* Library card */}
      {libraryOpen && (
        <div id="library-card" className={CARD}>
          <div className="mb-1 flex items-center justify-between gap-2">
            <div className="text-[11px] uppercase tracking-wide text-slate-400">
              Scholarship Library
            </div>
            <input
              id="library-search"
              type="text"
              placeholder="Search..."
              className="max-w-[180px] rounded-md border border-slate-700 bg-slate-950 px-2 py-1 text-[11px] text-slate-200 placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-slate-500"
              value={libraryQuery}
              onChange={(e) => setLibraryQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") loadLibrary();
              }}
            />
          </div>

          <button
            id="btn-load-library"
            className={`${BTN_SECONDARY} w-full justify-center`}
            onClick={loadLibrary}
          >
            🔎 Load Scholarships
          </button>
          <div
            id="library-status"
            className="mt-1 min-h-[14px] text-[11px] text-slate-400"
          >
            {libraryStatus}
          </div>

          <div
            id="library-list"
            className="mt-1 max-h-32 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/70 p-2 text-[11px] space-y-1"
          >
            {libraryItems.length === 0 && (
              <div className="text-slate-500 text-xs">No items.</div>
            )}
            {libraryItems.map((item) => (
              <div
                key={item.id || item.source_url}
                className="cursor-pointer rounded-md border border-slate-700 bg-slate-900 px-2 py-1 hover:bg-slate-800"
                onClick={() => setLibrarySelected(item)}
              >
                <div className="text-[12px] font-semibold text-slate-50 truncate">
                  {item.title}
                </div>
                <div className="text-[10px] text-slate-400">
                  {item.source_site}
                </div>
              </div>
            ))}
          </div>

          {librarySelected && (
            <div
              id="library-detail"
              className="mt-2 max-h-32 overflow-y-auto rounded-md border border-slate-800 bg-slate-950/80 p-2 text-[11px] space-y-2"
            >
              <div>
                <div className="text-[13px] font-semibold text-slate-50">
                  {librarySelected.title}
                </div>
                <div className="text-[11px] text-slate-400">
                  {librarySelected.source_site}
                </div>
              </div>
              <div className="whitespace-pre-wrap text-[11px] text-slate-200">
                {librarySelected.description_short}
              </div>
              <a
                href={librarySelected.source_url}
                target="_blank"
                rel="noreferrer"
                className="block rounded-md bg-blue-500 px-3 py-1.5 text-center text-[12px] font-semibold text-slate-950 hover:bg-blue-400"
              >
                Open Official Page ↗
              </a>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
