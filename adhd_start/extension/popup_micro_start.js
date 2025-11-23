// popup_micro_start.js
/* global chrome */

// This script sits on top of the existing popup.js:
//
// - popup.js still calls /plan and fills the little "Start: ..." text.
// - THIS file calls /workflow with real page text and triggers the 4-step overlay.

const API_BASE = "http://localhost:8000";
const DEFAULT_USER_ID = "demo-user";

document.addEventListener("DOMContentLoaded", () => {
  const goalInput = document.getElementById("goal"); // matches popup.html
  const microStartBtn = document.getElementById("plan"); // matches popup.html

  if (!microStartBtn) {
    console.warn(
      "[ADHD Copilot] AI Micro-Start button not found (expected id='plan')."
    );
    return;
  }

  microStartBtn.addEventListener("click", onAIMicroStartClick);

  async function onAIMicroStartClick() {
    try {
      // HARD GUARD: if already disabled, some handler already started a run
      if (microStartBtn.disabled) {
        console.log(
          "[ADHD Copilot] popup_micro_start click ignored (button disabled)."
        );
        return;
      }
      microStartBtn.disabled = true;

      const activeTab = await getActiveTab();
      const rawText = await captureVisibleText(activeTab.id);

      const goal =
        (goalInput && goalInput.value.trim()) ||
        "Help me get started with this scholarship / job application.";

      const workflow = await requestWorkflow({
        user_id: DEFAULT_USER_ID,
        goal,
        page_url: activeTab.url || "",
        // Real page text
        raw_text: rawText || null,
      });

      chrome.tabs.sendMessage(activeTab.id, {
        type: "SHOW_PLAN_OVERLAY",
        workflow,
        userId: DEFAULT_USER_ID,
      });

      setTimeout(() => {
        window.close();
      }, 300);
    } catch (err) {
      console.error("[ADHD Copilot] Micro-start overlay error:", err);
      microStartBtn.disabled = false;
    }
  }

  function getActiveTab() {
    return new Promise((resolve, reject) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError) {
          return reject(chrome.runtime.lastError);
        }
        const tab = tabs && tabs[0];
        if (!tab) return reject(new Error("No active tab"));
        resolve(tab);
      });
    });
  }

  async function captureVisibleText(tabId) {
    try {
      const [result] = await chrome.scripting.executeScript({
        target: { tabId },
        func: () =>
          document.body ? document.body.innerText.slice(0, 10000) : "",
      });
      return (result && result.result) || "";
    } catch (err) {
      console.warn("[ADHD Copilot] captureVisibleText failed:", err);
      return "";
    }
  }

  async function requestWorkflow(payload) {
    const res = await fetch(`${API_BASE}/workflow`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw new Error(`Backend error from /workflow: ${res.status} – ${text}`);
    }

    return res.json();
  }
});
