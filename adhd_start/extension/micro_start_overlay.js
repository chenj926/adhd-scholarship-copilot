// micro_start_overlay.js
// ADHD Copilot – Scholarship Micro-Start Overlay
// v12: Full UI restoration + Bug Fixes

(() => {
  if (window.__adhdMicroStartOverlayLoaded_v12) return;
  window.__adhdMicroStartOverlayLoaded_v12 = true;

  const DEFAULT_USER_ID = "demo-user";
  const FEEDBACK_URL = "http://localhost:8000/feedback";
  let shadowHost = null;
  let shadowRoot = null;

  const state = {
    open: false,
    view: null,
    docked: false,
    workflow: null,
    focusMinutes: 20,
    checkInInterval: 5,
    feedbackRating: null,
    feedbackText: ""
  };

  function ensureHost() {
    if (shadowHost && shadowRoot) return;
    shadowHost = document.createElement("div");
    shadowHost.id = "adhd-copilot-overlay-root";
    Object.assign(shadowHost.style, {
      position: "fixed", top: "0", left: "0", width: "0", height: "0", zIndex: "2147483647"
    });
    shadowRoot = shadowHost.attachShadow({ mode: "open" });
    document.documentElement.appendChild(shadowHost);
  }

  function openOverlay(workflow, startView = "step1") {
    state.open = true;
    state.view = startView;
    if(workflow) state.workflow = workflow;
    // Set focus minutes from workflow if available
    if(state.workflow?.block_minutes) state.focusMinutes = state.workflow.block_minutes;
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
    const mins = parseInt(state.focusMinutes) || 20;
    const interval = parseInt(state.checkInInterval) || 0;
    
    let checkIns = [];
    if (interval > 0 && interval < mins) {
        for (let t = interval; t < mins; t += interval) checkIns.push(`T+${t}`);
    }

    // 1. Notify Background
    chrome.runtime.sendMessage({ type: "START_BLOCK", minutes: mins, checkIns });

    // 2. Notify Local Window (Focus Games)
    window.postMessage({
        type: "START_BLOCK_LOCAL_TRIGGER", 
        minutes: mins, 
        checkIns: checkIns,
        autoSpotlight: true 
    }, "*");

    closeOverlay();
  }

  async function submitFeedback() {
      const btn = shadowRoot.getElementById("btn-submit-fb");
      if(btn) { btn.textContent = "Sending..."; btn.disabled = true; }

      try {
        await fetch(FEEDBACK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_id: DEFAULT_USER_ID,
                rating: state.feedbackRating || 0,
                comment: state.feedbackText
            })
        });
      } catch(e) {
          console.error("Feedback failed", e);
      }
      closeOverlay();
  }

  function esc(str) {
    if (!str) return "";
    return String(str).replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function render() {
    if (!state.open) return;
    const wf = state.workflow || {};
    const summary = wf.summary || {};
    const tasks = wf.micro_tasks || ["Read the requirements section."];

    // Restored Original CSS
    const css = `
      :host { all: initial; font-family: system-ui, sans-serif; color-scheme: dark; }
      .backdrop { position: fixed; inset: 0; background: rgba(0,0,0,0.85); backdrop-filter: blur(3px); }
      .card {
        position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
        width: 90%; max-width: 420px;
        background: #0f172a; border: 1px solid #334155; border-radius: 12px;
        padding: 16px; color: #f8fafc; box-shadow: 0 20px 50px rgba(0,0,0,0.8);
      }
      /* Docked CSS Fix */
      .docked {
        position: fixed; top: 15%; right: 20px; left: auto; transform: none;
        width: 320px; max-width: 85vw;
        animation: slideIn 0.3s; display: flex; flex-direction: column; gap: 8px; border: 1px solid #475569;
      }
      @keyframes slideIn { from { transform: translateX(50px); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
      
      h2 { margin: 0 0 8px; font-size: 18px; color: #fff; font-weight: 700; }
      p, li { color: #cbd5e1; font-size: 14px; line-height: 1.5; }
      ul { padding-left: 20px; margin: 8px 0; }
      .btn-row { display: flex; gap: 8px; margin-top: 16px; }
      button {
        flex: 1; padding: 10px; border-radius: 6px; border: none; font-weight: 600; cursor: pointer;
        font-size: 13px; transition: opacity 0.2s;
      }
      button:hover { opacity: 0.9; }
      .btn-primary { background: #3b82f6; color: white; }
      .btn-secondary { background: #1e293b; border: 1px solid #475569; color: #cbd5e1; }
      .btn-close { background: none; border: none; font-size: 20px; color: #64748b; padding: 0; flex: 0; cursor: pointer; }
      
      .input-group { background: #1e293b; padding: 12px; border-radius: 8px; margin-bottom: 10px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
      label { font-size: 11px; color: #94a3b8; display: block; margin-bottom: 6px; font-weight: 600; }
      input { width: 100%; background: #020617; border: 1px solid #475569; color: #fff; padding: 8px; border-radius: 4px; box-sizing: border-box; font-family: inherit; }
      
      textarea { width: 100%; background: #020617; border: 1px solid #475569; color: #fff; padding: 8px; border-radius: 4px; box-sizing: border-box; font-family: inherit; margin-top:8px; resize: vertical; }
      .chips { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 10px; }
      .chip { background: #1e293b; border: 1px solid #64748b; color: #e2e8f0; padding: 6px 12px; border-radius: 20px; font-size: 12px; cursor: pointer; }
      .chip.selected { background: #2563eb; border-color: #60a5fa; color: #fff; font-weight: bold; }
      .warning-box { background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3); padding: 10px; border-radius: 6px; margin-bottom: 12px; font-size: 13px; color: #fbbf24; display: flex; gap: 8px; align-items: start; }
      
      .btn-rating { background: #1e293b; border: 1px solid #475569; color: #cbd5e1; }
      .btn-rating.active { background: #3b82f6; color: white; border-color: #60a5fa; }
    `;

    let content = "";
    let isDockedClass = state.docked ? "docked" : "";

    if (state.view === "step1") {
      content = `
        <div style="display:flex; justify-content:space-between; align-items:start;">
            <h2>${esc(summary.title || "Micro-Start")}</h2>
            <button id="close-x" class="btn-close">×</button>
        </div>
        <p style="margin-top:0;">${esc(summary.one_liner)}</p>
        <div class="warning-box"><span>💡</span><div>AI Suggestion: Adapt these steps if they don't match the page exactly.</div></div>
        <ul style="background:#1e293b; padding:10px 10px 10px 30px; border-radius:6px;">
            ${(wf.key_points || []).slice(0,3).map(k => `<li>${esc(k)}</li>`).join("")}
        </ul>
        <div class="btn-row"><button id="btn-cancel" class="btn-secondary">Cancel</button><button id="btn-step2" class="btn-primary">OK, Next Step</button></div>
      `;
    } else if (state.view === "step2") {
        const task = tasks[0] || "Read the first paragraph.";
        if (state.docked) {
            content = `
                <div style="display:flex; justify-content:space-between; align-items:center;">
                    <span style="font-size:11px; font-weight:bold; color:#94a3b8; letter-spacing:0.5px;">STEP 2: TINY ACTION</span>
                    <button id="close-x" class="btn-close" style="font-size:16px;">×</button>
                </div>
                <div style="margin:8px 0; font-size:14px; font-weight:600; line-height:1.4; word-wrap:break-word;">${esc(task)}</div>
                <button id="btn-dock-done" class="btn-primary" style="width:100%;">I did it!</button>
            `;
        } else {
            content = `
                <h2>Step 2: One Tiny Action</h2>
                <p>Don't do everything. Just do this one thing:</p>
                <div style="background:#1e293b; padding:16px; border-radius:8px; border-left:4px solid #3b82f6; margin:12px 0;"><strong style="font-size:15px;">${esc(task)}</strong></div>
                <p style="font-size:12px; color:#94a3b8;">When you click "Do this now", I'll shrink to the corner.</p>
                <div class="btn-row"><button id="btn-back" class="btn-secondary">Back</button><button id="btn-dock" class="btn-primary">Do this now (Dock)</button></div>
            `;
        }
    } else if (state.view === "step3") {
        content = `
            <h2>Step 3: Focus Mode</h2>
            <p>Great! Now let's block distractions.</p>
            <div class="warning-box"><span>🤖</span><div>AI Plan: ${tasks.length > 1 ? "Follow next steps" : "Continue reading"}</div></div>
            <div class="input-group">
                <div><label>FOCUS TIME (MIN)</label><input type="number" id="inp-mins" value="${state.focusMinutes}" min="1" max="180"></div>
                <div><label>CHECK-IN (MIN)</label><input type="number" id="inp-checkin" value="${state.checkInInterval}" min="1" max="60" placeholder="e.g. 5"></div>
            </div>
            <div class="btn-row"><button id="btn-back-step2" class="btn-secondary">Back</button><button id="btn-start-focus" class="btn-primary">🚀 Start Focus Shield</button></div>
        `;
    } else if (state.view === "step4") {
        const r = state.feedbackRating;
        content = `
            <h2>Session Feedback</h2>
            <p>Did this help you start?</p>
            <div class="btn-row">
                <button id="rate-no" class="btn-rating ${r===1?'active':''}">❌ No</button>
                <button id="rate-meh" class="btn-rating ${r===2?'active':''}">😐 Meh</button>
                <button id="rate-yes" class="btn-rating ${r===3?'active':''}">✅ Yes</button>
            </div>
            <p style="margin-top:16px; font-size:12px; color:#cbd5e1; font-weight:600;">What felt off? (Optional)</p>
            <div class="chips">
                <span class="chip">Too much text</span><span class="chip">Steps wrong</span><span class="chip">UI Buggy</span><span class="chip">Timer weird</span>
            </div>
            <textarea id="fb-text" rows="3" placeholder="Any other thoughts?">${esc(state.feedbackText)}</textarea>
            <div class="btn-row" style="margin-top:10px;"><button id="btn-submit-fb" class="btn-primary">Submit Feedback</button></div>
        `;
    }

    shadowRoot.innerHTML = `<style>${css}</style>${!state.docked ? '<div class="backdrop"></div>' : ''}<div class="card ${isDockedClass}">${content}</div>`;
    bindEvents();
  }

  function bindEvents() {
    const click = (id, fn) => { const el = shadowRoot.getElementById(id); if (el) el.addEventListener("click", fn); };
    
    click("close-x", closeOverlay);
    click("btn-cancel", closeOverlay);
    click("btn-step2", () => setView("step2"));
    click("btn-dock", () => { state.docked = true; render(); });
    click("btn-back", () => setView("step1"));
    click("btn-dock-done", () => setView("step3"));
    click("btn-back-step2", () => setView("step2"));
    
    // Inputs
    const inpMins = shadowRoot.getElementById("inp-mins");
    if(inpMins) inpMins.addEventListener("input", (e) => state.focusMinutes = e.target.value);
    const inpCheck = shadowRoot.getElementById("inp-checkin");
    if(inpCheck) inpCheck.addEventListener("input", (e) => state.checkInInterval = e.target.value);
    
    // Focus Trigger
    click("btn-start-focus", startMainFocusMode);

    // Feedback
    click("rate-no", () => { state.feedbackRating = 1; render(); });
    click("rate-meh", () => { state.feedbackRating = 2; render(); });
    click("rate-yes", () => { state.feedbackRating = 3; render(); });
    const txt = shadowRoot.getElementById("fb-text");
    if(txt) txt.addEventListener("input", (e) => state.feedbackText = e.target.value);
    shadowRoot.querySelectorAll(".chip").forEach(c => c.addEventListener("click", () => c.classList.toggle("selected")));
    click("btn-submit-fb", submitFeedback);
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === "SHOW_PLAN_OVERLAY") openOverlay(msg.workflow);
  });

  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "SHOW_FEEDBACK_TRIGGER") {
        openOverlay(null, "step4");
    }
  });
})();