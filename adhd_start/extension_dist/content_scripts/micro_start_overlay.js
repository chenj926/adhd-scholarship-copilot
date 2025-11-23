// micro_start_overlay.js
// ADHD Copilot – Overlay (Full UI Restoration)
// Features:
// 1. Full expanded CSS (No minification)
// 2. Step 2 Dock logic preserved
// 3. Step 3 Manual Input preserved
// 4. Step 4 Feedback (Chips + Text + Submit) fully functional

(() => {
  // Prevent double-injection in the same tab
  if (window.__adhdMicroStartOverlayLoaded_v14) return;
  window.__adhdMicroStartOverlayLoaded_v14 = true;

  const DEFAULT_USER_ID = "demo-user";
  const FEEDBACK_URL = "http://localhost:8000/feedback";

  let shadowHost = null;
  let shadowRoot = null;

  // In-overlay UI state
  const state = {
    open: false,
    view: null,          // 'step1' | 'step2' | 'step3' | 'step4'
    docked: false,
    workflow: null,
    focusMinutes: 20,
    checkInInterval: 5,
    feedbackRating: null, // 1, 2, 3
    feedbackText: "",
    selectedChips: new Set(), // For Step 4 tags
  };

  // ---------------------------------------------------------------------------
  // Per-block feedback state: ensure feedback pops at most ONCE per focus block
  // ---------------------------------------------------------------------------

  // Whether we have seen a "start focus block" signal on this page
  let hasActiveBlock = false;
  // Whether feedback has already been shown for the current block
  let feedbackShownForBlock = false;

  function markBlockStarted() {
    hasActiveBlock = true;
    feedbackShownForBlock = false;
  }

  function showFeedbackOnce() {
    if (!hasActiveBlock) {
      // Stray END/feedback message with no corresponding START; ignore it.
      console.debug("[Overlay] Ignoring feedback trigger: no active block in this page.");
      return;
    }
    if (feedbackShownForBlock) {
      console.debug("[Overlay] Feedback already shown for this block, skipping duplicate trigger.");
      return;
    }
    feedbackShownForBlock = true;

    // Open Step 4 feedback overlay
    openOverlay(null, "step4");
  }

  // ---------------------------------------------------------------------------
  // Overlay host helpers
  // ---------------------------------------------------------------------------

  function ensureHost() {
    if (shadowHost && shadowRoot) return;
    shadowHost = document.createElement("div");
    shadowHost.id = "adhd-copilot-overlay-root";
    Object.assign(shadowHost.style, {
      position: "fixed",
      top: "0",
      left: "0",
      width: "0",
      height: "0",
      zIndex: "2147483647",
    });
    shadowRoot = shadowHost.attachShadow({ mode: "open" });
    document.documentElement.appendChild(shadowHost);
  }

  function openOverlay(workflow, startView = "step1") {
    state.open = true;
    state.view = startView;
    if (workflow) state.workflow = workflow;

    // Reset Step-4 feedback state inside the overlay itself
    state.feedbackRating = null;
    state.feedbackText = "";
    state.selectedChips.clear();

    // If backend returned a suggested focus length, use it as default
    if (state.workflow?.block_minutes) {
      state.focusMinutes = state.workflow.block_minutes;
    }

    // When switching to any view via openOverlay, start in "modal" mode, not docked
    state.docked = false;

    ensureHost();
    render();
  }

  function closeOverlay() {
    state.open = false;
    if (shadowRoot) shadowRoot.innerHTML = "";
  }

  function setView(v) {
    state.view = v;
    if (v !== "step2") state.docked = false;
    render();
  }

  function startMainFocusMode() {
    const mins = parseInt(state.focusMinutes, 10) || 20;
    const interval = parseInt(state.checkInInterval, 10) || 0;

    const checkIns = [];
    if (interval > 0 && interval < mins) {
      for (let t = interval; t < mins; t += interval) {
        checkIns.push(`T+${t}`);
      }
    }

    // Mark the beginning of a new focus block so feedback only shows once
    markBlockStarted();

    // 1. Notify background (alarms / global timer)
    chrome.runtime.sendMessage({
      type: "START_BLOCK",
      minutes: mins,
      checkIns,
    });

    // 2. Notify local content scripts (visual shield / HUD / mini-games)
    window.postMessage(
      {
        type: "START_BLOCK_LOCAL_TRIGGER",
        minutes: mins,
        checkIns,
        autoSpotlight: true,
      },
      "*",
    );

    closeOverlay();
  }

  async function submitFeedback() {
    const btn = shadowRoot.getElementById("btn-submit-fb");
    if (btn) {
      btn.textContent = "Sending...";
      btn.disabled = true;
    }

    // Use Chrome Message Proxy to avoid Mixed Content Error
    chrome.runtime.sendMessage({
      type: "PROXY_FETCH",
      url: "http://localhost:8000/feedback",
      method: "POST",
      body: {
        user_id: DEFAULT_USER_ID,
        rating: state.feedbackRating || 0,
        comment: state.feedbackText,
        reasons: Array.from(state.selectedChips),
      }
    }, (response) => {
      console.log("[Overlay] Feedback response:", response);
      closeOverlay();
    });
  }

  function esc(str) {
    if (!str) return "";
    return String(str).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  // ---------------------------------------------------------------------------
  // Render overlay (all 4 steps)
  // ---------------------------------------------------------------------------

  function render() {
    if (!state.open) return;

    const wf = state.workflow || {};
    const summary = wf.summary || {};
    const tasks = wf.micro_tasks || ["Read the requirements section."];

    // FULL CSS RESTORATION
    const css = `
      :host { all: initial; font-family: system-ui, -apple-system, sans-serif; color-scheme: dark; }
      *, *::before, *::after { box-sizing: border-box; }

      .backdrop {
        position: fixed; inset: 0; background: rgba(15, 23, 42, 0.85);
        backdrop-filter: blur(4px);
      }

      .card {
        position: fixed; top: 50%; left: 50%;
        transform: translate(-50%, -50%);
        width: 90%; max-width: 420px;
        background: #0f172a;
        border: 1px solid #334155;
        border-radius: 16px;
        box-shadow: 0 25px 50px -12px rgba(0,0,0,0.6);
        padding: 20px;
        color: #f1f5f9;
        font-size: 14px;
        line-height: 1.5;
        display: flex; flex-direction: column; gap: 12px;
      }

      /* Docked View Styles */
      .docked {
        top: 15%; right: 20px; left: auto; transform: none;
        width: 320px; max-width: 85vw;
        animation: slideIn 0.3s cubic-bezier(0.16, 1, 0.3, 1);
        border: 1px solid #475569;
      }

      @keyframes slideIn { 
        from { transform: translateX(40px); opacity: 0; } 
        to { transform: translateX(0); opacity: 1; } 
      }

      /* Header */
      .header { display: flex; justify-content: space-between; align-items: start; margin-bottom: 4px; }
      h2 { margin: 0; font-size: 18px; font-weight: 700; color: #fff; }
      .btn-close { background: none; border: none; color: #64748b; font-size: 20px; cursor: pointer; padding: 0; line-height: 1; }
      .btn-close:hover { color: #fff; }

      p { margin: 0; color: #cbd5e1; }
      
      /* Warning / Info Box */
      .warning-box {
        background: rgba(245, 158, 11, 0.1);
        border: 1px solid rgba(245, 158, 11, 0.2);
        border-radius: 8px;
        padding: 10px;
        font-size: 13px;
        color: #fbbf24;
        display: flex; gap: 8px; align-items: start;
      }

      /* List */
      ul { margin: 0; padding-left: 20px; background: #1e293b; padding: 12px 12px 12px 32px; border-radius: 8px; }
      li { margin-bottom: 4px; color: #e2e8f0; }

      /* Buttons */
      .btn-row { display: flex; gap: 10px; margin-top: 8px; }
      button.btn {
        flex: 1; padding: 10px; border-radius: 8px; border: none;
        font-weight: 600; cursor: pointer; font-size: 13px;
        transition: all 0.1s;
      }
      button.btn:active { transform: scale(0.98); }
      
      .btn-primary { background: #3b82f6; color: white; box-shadow: 0 2px 5px rgba(59,130,246,0.3); }
      .btn-primary:hover { background: #2563eb; }
      
      .btn-secondary { background: #1e293b; border: 1px solid #475569; color: #cbd5e1; }
      .btn-secondary:hover { background: #334155; border-color: #64748b; }

      /* Step 3 Inputs */
      .input-group {
        background: #1e293b; padding: 12px; border-radius: 8px;
        display: grid; grid-template-columns: 1fr 1fr; gap: 12px;
      }
      label { display: block; font-size: 11px; color: #94a3b8; margin-bottom: 6px; font-weight: 700; text-transform: uppercase; }
      input, select {
        width: 100%; background: #020617; border: 1px solid #475569;
        color: white; padding: 8px; border-radius: 6px; font-size: 14px;
      }

      /* Step 4 Feedback */
      .rating-row { display: flex; justify-content: center; gap: 12px; margin: 8px 0; }
      .btn-rating {
        width: 40px; height: 40px; border-radius: 50%; border: 1px solid #475569;
        background: #1e293b; color: #cbd5e1; font-size: 18px; cursor: pointer;
        display: flex; align-items: center; justify-content: center;
        transition: all 0.2s;
      }
      .btn-rating:hover { background: #334155; transform: scale(1.1); }
      .btn-rating.active { background: #3b82f6; color: white; border-color: #60a5fa; transform: scale(1.1); }

      .chips { display: flex; flex-wrap: wrap; gap: 8px; }
      .chip {
        background: #1e293b; border: 1px solid #475569; color: #94a3b8;
        padding: 4px 10px; border-radius: 20px; font-size: 12px; cursor: pointer;
      }
      .chip:hover { border-color: #cbd5e1; color: #e2e8f0; }
      .chip.selected { background: #3b82f6; color: white; border-color: #60a5fa; }

      textarea {
        width: 100%; background: #020617; border: 1px solid #475569;
        color: white; padding: 10px; border-radius: 8px; font-family: inherit;
        resize: vertical; min-height: 60px;
      }
    `;

    let content = "";
    const isDockedClass = state.docked ? "docked" : "";

    // --- STEP 1: PLAN ---
    if (state.view === "step1") {
      content = `
        <div class="header">
            <h2>${esc(summary.title || "Micro-Start")}</h2>
            <button id="close-x" class="btn-close">×</button>
        </div>
        <p>${esc(summary.one_liner)}</p>
        
        <div class="warning-box">
            <span>💡</span>
            <div>AI suggestion: these steps are generated. Tweak them if they don't match perfectly.</div>
        </div>
        
        <ul>
            ${(wf.key_points || []).slice(0, 3).map((k) => `<li>${esc(k)}</li>`).join("")}
        </ul>
        
        <div class="btn-row">
            <button id="btn-cancel" class="btn btn-secondary">Cancel</button>
            <button id="btn-step2" class="btn btn-primary">OK, Next Step</button>
        </div>
      `;
    }
    // --- STEP 2: ACTION ---
    else if (state.view === "step2") {
      const task = tasks[0] || "Read the first paragraph.";

      if (state.docked) {
        // Docked mini-card in the corner
        content = `
          <div class="header" style="align-items:center; margin-bottom:0;">
              <span style="font-size:11px; font-weight:700; color:#94a3b8; letter-spacing:0.5px;">STEP 2: TINY ACTION</span>
              <button id="close-x" class="btn-close" style="font-size:16px;">×</button>
          </div>
          <div style="margin:8px 0; font-size:14px; font-weight:600; line-height:1.4; word-wrap:break-word;">
              ${esc(task)}
          </div>
          <button id="btn-dock-done" class="btn btn-primary" style="width:100%;">I did it!</button>
        `;
      } else {
        // Full modal view
        content = `
          <div class="header">
              <h2>Step 2: One Tiny Action</h2>
              <button id="close-x" class="btn-close">×</button>
          </div>
          <p>Don't do everything. Just do this one thing:</p>
          <div style="background:#1e293b; padding:16px; border-radius:8px; border-left:4px solid #3b82f6; margin:4px 0;">
              <strong style="font-size:15px;">${esc(task)}</strong>
          </div>
          <p style="font-size:12px; color:#94a3b8;">When you click "Do this now", I'll shrink to the corner.</p>
          <div class="btn-row">
              <button id="btn-back" class="btn btn-secondary">Back</button>
              <button id="btn-dock" class="btn btn-primary">Do this now (Dock)</button>
          </div>
        `;
      }
    }
    // --- STEP 3: FOCUS SETUP ---
    else if (state.view === "step3") {
      content = `
        <div class="header">
            <h2>Step 3: Focus Mode</h2>
            <button id="close-x" class="btn-close">×</button>
        </div>
        <p>Great! Now let's block distractions and keep going.</p>
        
        <div class="input-group">
            <div>
                <label>FOCUS TIME (MIN)</label>
                <input type="number" id="inp-mins" value="${state.focusMinutes}" min="1" max="180">
            </div>
            <div>
                <label>CHECK-IN (MIN)</label>
                <input type="number" id="inp-checkin" value="${state.checkInInterval}" min="1" max="60" placeholder="e.g. 5">
            </div>
        </div>

        <div class="btn-row">
            <button id="btn-back-step2" class="btn btn-secondary">Back</button>
            <button id="btn-start-focus" class="btn btn-primary">🚀 Start Focus Shield</button>
        </div>
      `;
    }
    // --- STEP 4: FEEDBACK ---
    else if (state.view === "step4") {
      content = `
        <div class="header">
            <h2>Session Feedback</h2>
            <button id="close-x" class="btn-close">×</button>
        </div>
        <p style="text-align:center; margin-bottom:8px;">Did this help you start?</p>
        
        <div class="rating-row">
            <button id="rate-no"  class="btn-rating ${state.feedbackRating === 1 ? "active" : ""}">❌</button>
            <button id="rate-meh" class="btn-rating ${state.feedbackRating === 2 ? "active" : ""}">😐</button>
            <button id="rate-yes" class="btn-rating ${state.feedbackRating === 3 ? "active" : ""}">✅</button>
        </div>
        
        <p style="font-size:12px; color:#94a3b8; font-weight:700; margin-top:12px;">What felt off? (Optional)</p>
        <div class="chips">
            <span class="chip" data-val="too_long">Too much text</span>
            <span class="chip" data-val="steps_wrong">Steps didn't match</span>
            <span class="chip" data-val="ui_bug">UI buggy</span>
            <span class="chip" data-val="timer_weird">Timer weird</span>
        </div>
        
        <textarea id="fb-text" rows="2" placeholder="Any other thoughts?" style="margin-top:10px;">${esc(
          state.feedbackText,
        )}</textarea>
        
        <div class="btn-row">
            <button id="btn-submit-fb" class="btn btn-primary">Submit Feedback</button>
        </div>
      `;
    }

    shadowRoot.innerHTML = `
      <style>${css}</style>
      ${!state.docked ? '<div class="backdrop"></div>' : ""}
      <div class="card ${isDockedClass}">
        ${content}
      </div>
    `;

    bindEvents();
  }

  function bindEvents() {
    const click = (id, fn) => {
      const el = shadowRoot.getElementById(id);
      if (el) el.addEventListener("click", fn);
    };

    // Global close
    click("close-x", closeOverlay);
    click("btn-cancel", closeOverlay);

    // Step 1 → 2
    click("btn-step2", () => setView("step2"));

    // Step 2 logic
    click("btn-dock", () => {
      state.docked = true;
      render();
    });
    click("btn-back", () => setView("step1"));
    click("btn-dock-done", () => setView("step3"));

    // Step 3 logic
    const inpMins = shadowRoot.getElementById("inp-mins");
    if (inpMins) {
      inpMins.addEventListener("input", (e) => {
        state.focusMinutes = e.target.value;
      });
    }

    const inpCheck = shadowRoot.getElementById("inp-checkin");
    if (inpCheck) {
      inpCheck.addEventListener("input", (e) => {
        state.checkInInterval = e.target.value;
      });
    }

    click("btn-back-step2", () => setView("step2"));
    click("btn-start-focus", startMainFocusMode);

    // Step 4 logic
    click("rate-no", () => {
      state.feedbackRating = 1;
      render();
    });
    click("rate-meh", () => {
      state.feedbackRating = 2;
      render();
    });
    click("rate-yes", () => {
      state.feedbackRating = 3;
      render();
    });

    const txt = shadowRoot.getElementById("fb-text");
    if (txt) {
      txt.addEventListener("input", (e) => {
        state.feedbackText = e.target.value;
      });
    }

    // Chips: toggle "selected" class + update state.selectedChips
    shadowRoot.querySelectorAll(".chip").forEach((c) => {
      const val = c.dataset.val;
      if (state.selectedChips.has(val)) c.classList.add("selected");

      c.addEventListener("click", () => {
        if (state.selectedChips.has(val)) {
          state.selectedChips.delete(val);
        } else {
          state.selectedChips.add(val);
        }
        c.classList.toggle("selected");
      });
    });

    click("btn-submit-fb", submitFeedback);
  }

  // ---------------------------------------------------------------------------
  // Message listeners
  // ---------------------------------------------------------------------------

  chrome.runtime.onMessage.addListener((msg) => {
    if (!msg || typeof msg.type !== "string") return;

    if (msg.type === "SHOW_PLAN_OVERLAY") {
      // Open Step 1 planning overlay from the popup "AI micro-start" button
      openOverlay(msg.workflow);
      return;
    }

    if (msg.type === "START_BLOCK") {
      // Basic Focus & Shield started from the popup or another script
      markBlockStarted();
      return;
    }

    if (msg.type === "END_BLOCK" || msg.type === "SHOW_FEEDBACK_OVERLAY") {
      // Any explicit end-of-block signal; show feedback at most once
      showFeedbackOnce();
      return;
    }
  });

  window.addEventListener("message", (event) => {
    const data = event.data || {};
    if (!data || typeof data.type !== "string") return;

    if (data.type === "START_BLOCK_LOCAL_TRIGGER") {
      // Local focus start triggered by micro-start Step 3
      markBlockStarted();
      return;
    }

    if (data.type === "SHOW_FEEDBACK_TRIGGER") {
      // Legacy path from the HUD / mini-games: funnel through the same
      // one-time feedback helper so we never show 2–3 popups in a row.
      showFeedbackOnce();
      return;
    }
  });
})();
