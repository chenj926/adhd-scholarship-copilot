console.log(">>> [focus_games] v12.1 (Debounce Fix) LOADED <<<");

if (window.__adhdFocusGamesLoaded_v12_1) {
  console.log("[focus_games] already loaded, skipping init");
} else {
  window.__adhdFocusGamesLoaded_v12_1 = true;
  (function () {
    
    // ============================================================================
    // 0. GLOBAL STATE & DEBOUNCE (The Fix for Double Layers)
    // ============================================================================
    let lastStartTs = 0; // Prevent double-triggering within 1 second

    // ============================================================================
    // 1. VISUAL SPOTLIGHT (Shielding)
    // ============================================================================
    let spotlightEl = null;
    let spotlightMode = "circle";
    let spotlightSize = 260;
    let spotlightMoveHandler = null;
    let spotlightKeyHandler = null;

    function destroySpotlight() {
      if (spotlightMoveHandler) { window.removeEventListener("mousemove", spotlightMoveHandler); spotlightMoveHandler = null; }
      if (spotlightKeyHandler) { window.removeEventListener("keydown", spotlightKeyHandler); spotlightKeyHandler = null; }
      
      // Force remove by ID
      const existing = document.getElementById("adhd-spotlight-root");
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
      
      if (spotlightEl && spotlightEl.parentNode) spotlightEl.parentNode.removeChild(spotlightEl);
      spotlightEl = null;
    }

    function toggleSpotlight(enable, mode = "circle") {
      if (!enable || mode === "none") { destroySpotlight(); return; }
      
      // Safety check: ensure no existing root
      if (document.getElementById("adhd-spotlight-root")) { destroySpotlight(); }

      spotlightMode = mode;
      if (!spotlightEl) {
        spotlightEl = document.createElement("div");
        spotlightEl.id = "adhd-spotlight-root";
        Object.assign(spotlightEl.style, {
          position: "fixed", top: "0", left: "0", width: "0", height: "0",
          pointerEvents: "none", zIndex: "2147483640",
          boxShadow: "0 0 0 9999px rgba(0,0,0,0.85)",
          transition: "width 0.08s, height 0.08s",
          borderRadius: "50%",
        });
        document.body.appendChild(spotlightEl);

        spotlightMoveHandler = (e) => {
          if (!spotlightEl) return;
          let w = (spotlightMode === "circle") ? spotlightSize : spotlightSize * 2;
          let h = (spotlightMode === "circle") ? spotlightSize : spotlightSize * 0.9;
          spotlightEl.style.width = w + "px";
          spotlightEl.style.height = h + "px";
          spotlightEl.style.left = e.clientX - w / 2 + "px";
          spotlightEl.style.top = e.clientY - h / 2 + "px";
        };

        spotlightKeyHandler = (e) => {
          if (!spotlightEl) return;
          if (e.key === "ArrowUp") spotlightSize = Math.min(spotlightSize + 20, 600);
          else if (e.key === "ArrowDown") spotlightSize = Math.max(120, spotlightSize - 20);
        };

        window.addEventListener("mousemove", spotlightMoveHandler);
        window.addEventListener("keydown", spotlightKeyHandler);
      }
      spotlightEl.style.borderRadius = mode === "circle" ? "50%" : "14px";
    }

    window.addEventListener("keydown", (e) => { if (e.key === "Escape") endBlock(true); });

    // ============================================================================
    // 2. VISUAL SEARCH GAME (Preserved)
    // ============================================================================
    function randomChoice(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
    let timerPaused = false; let pauseStartTs = null; let pauseAccumMs = 0;
    function pauseTimer() { if (timerPaused) return; timerPaused = true; pauseStartTs = Date.now(); }
    function resumeTimer() { if (!timerPaused) return; if (pauseStartTs != null) { pauseAccumMs += Date.now() - pauseStartTs; } pauseStartTs = null; timerPaused = false; }

    function startVisualSearchGame() {
      if (document.getElementById("adhd-game-overlay")) return;
      const overlay = document.createElement("div");
      overlay.id = "adhd-game-overlay";
      Object.assign(overlay.style, {
        position: "fixed", top: "0", left: "0", width: "100vw", height: "100vh",
        background: "rgba(15,23,42,0.96)", zIndex: "2147483647",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
      });

      const gameTypes = ["animals", "numbers", "shapes"];
      const type = randomChoice(gameTypes);
      let titleText = "", target = "", distractors = [];

      if (type === "animals") {
        const all = ["🐶","🐱","🦊","🐻","🐼","🐨","🐯","🦁","🐸"];
        target = randomChoice(all); distractors = all.filter((x) => x !== target);
        titleText = `Find all ${target}`;
      } else if (type === "numbers") {
        const digits = ["0","1","2","3","4","5","6","7","8","9"];
        target = randomChoice(digits); distractors = digits.filter((d) => d !== target);
        titleText = `Tap every "${target}"`;
      } else {
        const shapes = ["⬤","○","▲","△","■","□","◆","◇"];
        target = randomChoice(shapes); distractors = shapes.filter((s) => s !== target);
        titleText = `Find all ${target}`;
      }

      const title = document.createElement("h2");
      title.innerHTML = `🧠 ${titleText}`;
      Object.assign(title.style, { color: "#facc15", marginBottom: "8px", fontFamily: "system-ui", fontSize:"24px" });
      overlay.appendChild(title);

      const targetRow = document.createElement("div");
      targetRow.innerHTML = `Target: <span style="font-size:28px">${target}</span>`;
      Object.assign(targetRow.style, { color: "#e5e7eb", marginBottom: "10px", fontFamily: "system-ui" });
      overlay.appendChild(targetRow);

      const grid = document.createElement("div");
      Object.assign(grid.style, {
        display: "grid", gridTemplateColumns: "repeat(8, 1fr)", gap: "8px",
        background: "#020617", padding: "18px", borderRadius: "16px", boxShadow: "0 10px 30px rgba(0,0,0,0.7)",
      });

      const totalCells = 56; const minTargets = 5; const maxTargets = 9;
      const cells = [];
      for (let i = 0; i < totalCells; i++) cells.push(randomChoice(distractors));
      const targetCount = minTargets + Math.floor(Math.random() * (maxTargets - minTargets + 1));
      const used = new Set();
      while (used.size < targetCount) {
        const idx = Math.floor(Math.random() * totalCells);
        used.add(idx); cells[idx] = target;
      }

      let found = 0;
      cells.forEach((ch) => {
        const box = document.createElement("div");
        box.textContent = ch;
        Object.assign(box.style, {
          width: "42px", height: "42px", display: "flex", alignItems: "center", justifyContent: "center",
          fontSize: "22px", cursor: "pointer", borderRadius: "8px", background: "#f9fafb", color: "#111827",
          border: "1px solid #cbd5f5", transition: "all 0.12s",
        });

        box.addEventListener("click", () => {
          if (ch === target) {
            if (box.dataset.hit === "1") return;
            box.dataset.hit = "1";
            box.style.background = "#22c55e"; box.style.color = "#022c22"; box.style.borderColor = "#bbf7d0"; box.style.transform = "scale(1.05)";
            found++;
            title.innerText = `Found ${found} / ${targetCount}`;
            if (found >= targetCount) {
              title.innerText = "🎉 Keep going!";
              setTimeout(() => { overlay.remove(); resumeTimer(); }, 900);
            }
          } else {
            box.style.background = "#ef4444"; box.style.color = "#fef2f2"; box.style.borderColor = "#fecaca";
            setTimeout(() => { box.style.background = "#f9fafb"; box.style.color = "#111827"; box.style.borderColor = "#cbd5f5"; }, 220);
          }
        });
        grid.appendChild(box);
      });
      overlay.appendChild(grid);

      const skip = document.createElement("button");
      skip.textContent = "Skip game";
      Object.assign(skip.style, { marginTop: "16px", padding: "6px 12px", borderRadius: "999px", border: "1px solid #64748b", background: "transparent", color: "#e5e7eb", cursor: "pointer", fontSize: "13px" });
      skip.addEventListener("click", () => { overlay.remove(); resumeTimer(); });
      overlay.appendChild(skip);

      document.body.appendChild(overlay);
      pauseTimer();
    }

    // ============================================================================
    // 3. CHAIN HUD + TIMER (Preserved)
    // ============================================================================
    let chainCount = 0; let chainHud = null; let chainHandler = null;
    let blockDurationMs = 0; let blockStartTs = null; let checkScheduleMs = [];
    let nextCheckIndex = 0; let timerInterval = null; let blockRemainingMs = 0; let nextBreakRemainingMs = null;

    function formatTime(ms) {
      if (!ms || ms <= 0) return "00:00";
      const total = Math.floor(ms / 1000);
      return `${String(Math.floor(total / 60)).padStart(2,"0")}:${String(total % 60).padStart(2,"0")}`;
    }

    function updateChainHud() {
      if (!chainHud) {
        chainHud = document.createElement("div");
        chainHud.id = "adhd-chain-hud";
        Object.assign(chainHud.style, {
          position: "fixed", top: "18%", right: "20px", background: "#020617",
          color: "#e5e7eb", padding: "10px 14px", borderRadius: "12px", border: "2px solid #334155",
          zIndex: "2147483646", fontFamily: "system-ui, -apple-system, sans-serif", fontSize: "12px", fontWeight: "600",
          boxShadow: "0 6px 18px rgba(0,0,0,0.5)", minWidth: "180px",
        });
        document.body.appendChild(chainHud);
      }
      const onFire = chainCount > 0 && chainCount % 50 === 0;
      chainHud.style.borderColor = onFire ? "#f59e0b" : "#334155";
      chainHud.style.boxShadow = onFire ? "0 0 16px #f59e0b" : "0 6px 18px rgba(0,0,0,0.5)";
      const statusText = onFire ? "🔥 Keep going!" : "50 actions → on fire";

      chainHud.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
            <div style="font-size:13px;">${onFire ? "🔥" : "⚡"} Chain: ${chainCount}</div>
            <button id="hud-stop-btn" style="background:#ef4444; border:none; color:white; border-radius:4px; cursor:pointer; font-size:10px; padding:2px 6px;">Stop</button>
        </div>
        <div style="font-size:11px; color:#94a3b8;">Block left: ${formatTime(blockRemainingMs)}</div>
        <div style="font-size:11px; color:#94a3b8;">Next check-in: ${nextBreakRemainingMs != null ? formatTime(nextBreakRemainingMs) : "--:--"}</div>
        <div style="font-size:10px; color:#f97316; margin-top:2px;">${statusText}</div>
      `;

      const btn = document.getElementById("hud-stop-btn");
      if(btn) btn.onclick = () => endBlock(true);
    }

    function startChain() {
      chainCount = 0; updateChainHud();
      if (chainHandler) { document.removeEventListener("input", chainHandler); document.removeEventListener("click", chainHandler); }
      chainHandler = () => { chainCount++; updateChainHud(); };
      document.addEventListener("input", chainHandler); document.addEventListener("click", chainHandler);
    }

    function startBlockTimer(minutes, checkIns) {
      const mins = minutes && minutes > 0 ? minutes : 20;
      blockDurationMs = mins * 60 * 1000;
      blockStartTs = Date.now();
      pauseAccumMs = 0; timerPaused = false;

      checkScheduleMs = (checkIns || [])
        .map((s) => String(s).replace("T+", "").trim())
        .map((s) => parseFloat(s))
        .filter((n) => !Number.isNaN(n) && n > 0)
        .map((n) => n * 60 * 1000)
        .sort((a, b) => a - b);

      nextCheckIndex = 0; blockRemainingMs = blockDurationMs;
      nextBreakRemainingMs = checkScheduleMs[0] || null;

      if (timerInterval) clearInterval(timerInterval);
      timerInterval = setInterval(timerTick, 1000);
      timerTick();
    }

    function timerTick() {
      if (!blockStartTs) return;
      if (timerPaused) { updateChainHud(); return; }
      const now = Date.now();
      const elapsed = now - blockStartTs - pauseAccumMs;
      blockRemainingMs = Math.max(0, blockDurationMs - elapsed);

      while (nextCheckIndex < checkScheduleMs.length && elapsed >= checkScheduleMs[nextCheckIndex]) {
        startVisualSearchGame();
        nextCheckIndex++;
      }
      if (nextCheckIndex < checkScheduleMs.length) {
        nextBreakRemainingMs = Math.max(0, checkScheduleMs[nextCheckIndex] - elapsed);
      } else {
        nextBreakRemainingMs = null;
      }
      updateChainHud();
      
      if (blockRemainingMs <= 0) { 
          clearInterval(timerInterval); 
          timerInterval = null; 
          endBlock(false); 
      }
    }

    function endBlock(wasCancelled) {
        cleanup();
        window.postMessage({ type: "SHOW_FEEDBACK_TRIGGER", cancelled: wasCancelled }, "*");
    }

    function cleanup() {
      destroySpotlight();
      if (chainHud && chainHud.parentNode) chainHud.parentNode.removeChild(chainHud);
      chainHud = null;
      if (chainHandler) { document.removeEventListener("input", chainHandler); document.removeEventListener("click", chainHandler); chainHandler = null; }
      const ov = document.getElementById("adhd-game-overlay");
      if (ov && ov.parentNode) ov.parentNode.removeChild(ov);
      if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
      chainCount = 0;
    }

    // ============================================================================
    // 4. LISTENERS (With Debounce Logic)
    // ============================================================================
    function safeStartBlock(msg) {
        const now = Date.now();
        // FIX: If triggered < 1s ago, ignore this double call
        if (now - lastStartTs < 1000) {
            console.log("[focus_games] Ignoring double start trigger");
            return;
        }
        lastStartTs = now;

        cleanup(); 
        startChain(); 
        startBlockTimer(msg.minutes, msg.checkIns || []);
        if (msg.autoSpotlight) toggleSpotlight(true, "circle");
    }

    chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
      if (!msg || !msg.type) return;
      if (msg.type === "TOGGLE_SPOTLIGHT") toggleSpotlight(msg.enable, msg.mode || "circle");
      if (msg.type === "START_BLOCK") {
        safeStartBlock(msg);
        sendResponse && sendResponse({ ok: true });
      }
      if (msg.type === "MANUAL_START_GAME") { startVisualSearchGame(); sendResponse && sendResponse({ ok: true }); }
      if (msg.type === "END_BLOCK") { endBlock(true); sendResponse && sendResponse({ ok: true }); }
    });

    window.addEventListener("message", (event) => {
      if (event.data && event.data.type === "START_BLOCK_LOCAL_TRIGGER") {
        safeStartBlock(event.data);
      }
    });
  })();
}