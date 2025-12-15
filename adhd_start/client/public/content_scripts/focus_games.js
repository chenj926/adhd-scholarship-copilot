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
      // Prevent stacking if a game is already open
      if (document.getElementById("adhd-game-overlay")) return;

      // Full-screen dimmed overlay
      const overlay = document.createElement("div");
      overlay.id = "adhd-game-overlay";
      Object.assign(overlay.style, {
        position: "fixed",
        inset: "0px",
        width: "100vw",
        height: "100vh",
        background: "rgba(15,23,42,0.92)",
        zIndex: "2147483647",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
        boxSizing: "border-box",
      });

      // Center card
      const card = document.createElement("div");
      Object.assign(card.style, {
        minWidth: "320px",
        maxWidth: "520px",
        maxHeight: "90vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "stretch",
        padding: "16px 18px 14px",
        background: "#020617",
        borderRadius: "18px",
        border: "1px solid #1f2937",
        boxShadow: "0 18px 45px rgba(15,23,42,0.95)",
        fontFamily:
          "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
        color: "#e5e7eb",
      });
      overlay.appendChild(card);

      // Header row
      const headerRow = document.createElement("div");
      Object.assign(headerRow.style, {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "4px",
      });
      card.appendChild(headerRow);

      const leftHeader = document.createElement("div");
      leftHeader.textContent = "Brain break";
      Object.assign(leftHeader.style, {
        fontSize: "11px",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
        color: "#9ca3af",
        fontWeight: "600",
      });
      headerRow.appendChild(leftHeader);

      const gameTypeBadge = document.createElement("div");
      Object.assign(gameTypeBadge.style, {
        fontSize: "10px",
        padding: "3px 8px",
        borderRadius: "999px",
        background: "rgba(37,99,235,0.15)",
        border: "1px solid rgba(129,140,248,0.45)",
        color: "#c4b5fd",
      });
      headerRow.appendChild(gameTypeBadge);

      // Title + subtitle
      const title = document.createElement("div");
      Object.assign(title.style, {
        fontSize: "18px",
        fontWeight: "700",
        marginBottom: "4px",
      });
      card.appendChild(title);

      const subtitle = document.createElement("div");
      Object.assign(subtitle.style, {
        fontSize: "12px",
        color: "#9ca3af",
        marginBottom: "10px",
      });
      subtitle.textContent = "Tap everything that matches the target.";
      card.appendChild(subtitle);

      // Status row (target + progress)
      const statusRow = document.createElement("div");
      Object.assign(statusRow.style, {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "8px",
      });
      card.appendChild(statusRow);

      const targetRow = document.createElement("div");
      Object.assign(targetRow.style, {
        display: "flex",
        alignItems: "center",
        gap: "6px",
        fontSize: "13px",
      });
      statusRow.appendChild(targetRow);

      const targetLabel = document.createElement("span");
      targetLabel.textContent = "Target:";
      Object.assign(targetLabel.style, { color: "#9ca3af" });
      targetRow.appendChild(targetLabel);

      const targetSymbol = document.createElement("span");
      Object.assign(targetSymbol.style, {
        fontSize: "24px",
        padding: "2px 10px",
        borderRadius: "999px",
        background:
          "radial-gradient(circle at 0% 0%, rgba(129,140,248,0.25), transparent)",
      });
      targetRow.appendChild(targetSymbol);

      const progressEl = document.createElement("div");
      Object.assign(progressEl.style, {
        fontSize: "12px",
        color: "#a5b4fc",
        fontWeight: "600",
      });
      statusRow.appendChild(progressEl);

      // Grid wrapper
      const gridWrapper = document.createElement("div");
      Object.assign(gridWrapper.style, {
        padding: "10px",
        borderRadius: "14px",
        background:
          "radial-gradient(circle at top, rgba(15,23,42,0.4), rgba(15,23,42,0.95))",
        border: "1px solid rgba(31,41,55,0.9)",
        boxShadow: "inset 0 0 0 1px rgba(15,23,42,0.9)",
      });
      card.appendChild(gridWrapper);

      const grid = document.createElement("div");
      Object.assign(grid.style, {
        display: "grid",
        gridTemplateColumns: "repeat(8, 1fr)",
        gap: "8px",
      });
      gridWrapper.appendChild(grid);

      // Footer (hint + skip)
      const footerRow = document.createElement("div");
      Object.assign(footerRow.style, {
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginTop: "10px",
        gap: "8px",
      });
      card.appendChild(footerRow);

      const hint = document.createElement("div");
      Object.assign(hint.style, {
        fontSize: "11px",
        color: "#6b7280",
      });
      hint.textContent = "Quick 20–40s reset. You can skip any time.";
      footerRow.appendChild(hint);

      const skip = document.createElement("button");
      skip.textContent = "Skip game";
      Object.assign(skip.style, {
        padding: "6px 12px",
        borderRadius: "999px",
        border: "1px solid rgba(148,163,184,0.7)",
        background: "transparent",
        color: "#e5e7eb",
        cursor: "pointer",
        fontSize: "12px",
        fontWeight: "500",
      });
      footerRow.appendChild(skip);

      // -----------------------------
      // Game type + target selection
      // -----------------------------
      const gameTypes = ["animals", "numbers", "shapes"];
      const type = randomChoice(gameTypes);
      gameTypeBadge.textContent =
        type === "animals" ? "Animals"
          : type === "numbers" ? "Numbers"
          : "Shapes";

      let titleText = "";
      let target = "";
      let distractors = [];

      if (type === "animals") {
        const all = ["🐶", "🐱", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐸"];
        target = randomChoice(all);
        distractors = all.filter((x) => x !== target);
        titleText = `Find all ${target}`;
      } else if (type === "numbers") {
        const digits = ["0","1","2","3","4","5","6","7","8","9"];
        target = randomChoice(digits);
        distractors = digits.filter((d) => d !== target);
        titleText = `Tap every "${target}"`;
      } else {
        const shapes = ["⬤","○","▲","△","■","□","◆","◇"];
        target = randomChoice(shapes);
        distractors = shapes.filter((s) => s !== target);
        titleText = `Find all ${target}`;
      }

      title.textContent = titleText;
      targetSymbol.textContent = target;

      // -----------------------------
      // Grid generation
      // -----------------------------
      const totalCells = 56;
      const minTargets = 5;
      const maxTargets = 9;
      const cells = [];

      for (let i = 0; i < totalCells; i++) {
        cells.push(randomChoice(distractors));
      }

      const targetCount =
        minTargets + Math.floor(Math.random() * (maxTargets - minTargets + 1));

      const used = new Set();
      while (used.size < targetCount) {
        const idx = Math.floor(Math.random() * totalCells);
        used.add(idx);
        cells[idx] = target;
      }

      let found = 0;
      progressEl.textContent = `Found ${found} / ${targetCount}`;

      cells.forEach((ch) => {
        const cell = document.createElement("button");
        cell.type = "button";
        cell.textContent = ch;

        Object.assign(cell.style, {
          width: "44px",
          height: "44px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontSize: type === "numbers" ? "18px" : "24px",
          cursor: "pointer",
          borderRadius: "10px",
          background: "#020617",
          color: "#e5e7eb",
          border: "1px solid rgba(31,41,55,0.9)",
          boxShadow: "0 4px 10px rgba(15,23,42,0.9)",
          transition:
            "transform 0.12s ease-out, box-shadow 0.12s ease-out, border-color 0.12s ease-out, background 0.12s ease-out, color 0.12s ease-out",
        });

        cell.addEventListener("mouseenter", () => {
          if (cell.dataset.hit === "1") return;
          cell.style.transform = "translateY(-1px)";
          cell.style.boxShadow = "0 6px 14px rgba(15,23,42,0.95)";
          cell.style.borderColor = "rgba(148,163,184,0.9)";
        });

        cell.addEventListener("mouseleave", () => {
          if (cell.dataset.hit === "1") return;
          cell.style.transform = "translateY(0)";
          cell.style.boxShadow = "0 4px 10px rgba(15,23,42,0.9)";
          cell.style.background = "#020617";
          cell.style.color = "#e5e7eb";
          cell.style.borderColor = "rgba(31,41,55,0.9)";
        });

        cell.addEventListener("click", () => {
          if (ch === target) {
            if (cell.dataset.hit === "1") return;
            cell.dataset.hit = "1";

            cell.style.transform = "translateY(-1px) scale(1.03)";
            cell.style.background =
              "radial-gradient(circle at 0% 0%, #22c55e, #166534)";
            cell.style.color = "#ecfdf5";
            cell.style.borderColor = "#bbf7d0";
            cell.style.boxShadow = "0 8px 20px rgba(22,163,74,0.6)";

            found++;
            progressEl.textContent = `Found ${found} / ${targetCount}`;

            if (found >= targetCount) {
              title.textContent = "Nicely done 🙌";
              subtitle.textContent = "You can jump back into your task now.";
              setTimeout(() => {
                overlay.remove();
                resumeTimer();
              }, 900);
            }
          } else {
            cell.style.background =
              "radial-gradient(circle at 0% 0%, #b91c1c, #7f1d1d)";
            cell.style.color = "#fee2e2";
            cell.style.borderColor = "#fecaca";
            cell.style.boxShadow = "0 8px 20px rgba(185,28,28,0.6)";

            setTimeout(() => {
              if (cell.dataset.hit === "1") return;
              cell.style.background = "#020617";
              cell.style.color = "#e5e7eb";
              cell.style.borderColor = "rgba(31,41,55,0.9)";
              cell.style.boxShadow = "0 4px 10px rgba(15,23,42,0.9)";
            }, 260);
          }
        });

        grid.appendChild(cell);
      });

      // Skip button handler
      skip.addEventListener("click", () => {
        overlay.remove();
        resumeTimer();
      });

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