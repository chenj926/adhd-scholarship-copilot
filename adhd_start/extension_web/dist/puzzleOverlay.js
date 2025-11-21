// adhd_start/extension/puzzleOverlay.ts
// -------------------------------------------------------
// Mini 60-second memory puzzle break.
// This is *not* the main mechanic; it's a "recharge" you
// can trigger after long work sessions.
// -------------------------------------------------------
function createOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "adhd-puzzle-overlay";
    overlay.style.position = "fixed";
    overlay.style.inset = "0";
    overlay.style.background = "rgba(15,23,42,0.85)";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    overlay.style.justifyContent = "center";
    overlay.style.zIndex = "999999";
    overlay.style.fontFamily =
        "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";
    return overlay;
}
function buildPuzzleUI(onFinish) {
    const overlay = createOverlay();
    const box = document.createElement("div");
    box.style.background = "#f9fafb";
    box.style.borderRadius = "16px";
    box.style.padding = "16px 20px";
    box.style.maxWidth = "360px";
    box.style.width = "90%";
    box.style.boxShadow = "0 10px 30px rgba(0,0,0,0.25)";
    box.style.textAlign = "center";
    const title = document.createElement("h2");
    title.textContent = "60-second recharge";
    title.style.margin = "0 0 8px";
    title.style.fontSize = "18px";
    const subtitle = document.createElement("p");
    subtitle.textContent =
        "Memorize the highlighted squares, then click them in order.";
    subtitle.style.fontSize = "14px";
    subtitle.style.margin = "0 0 12px";
    const grid = document.createElement("div");
    grid.style.display = "grid";
    grid.style.gridTemplateColumns = "repeat(3, 60px)";
    grid.style.gridGap = "8px";
    grid.style.justifyContent = "center";
    grid.style.marginBottom = "12px";
    const cells = [];
    for (let i = 0; i < 9; i++) {
        const btn = document.createElement("button");
        btn.style.width = "60px";
        btn.style.height = "60px";
        btn.style.borderRadius = "12px";
        btn.style.border = "1px solid #e5e7eb";
        btn.style.background = "#ffffff";
        btn.style.cursor = "pointer";
        btn.style.fontSize = "18px";
        grid.appendChild(btn);
        cells.push(btn);
    }
    const status = document.createElement("p");
    status.style.fontSize = "13px";
    status.style.margin = "0 0 10px";
    status.style.color = "#4b5563";
    const btnRow = document.createElement("div");
    btnRow.style.display = "flex";
    btnRow.style.justifyContent = "space-between";
    btnRow.style.marginTop = "4px";
    const cancelBtn = document.createElement("button");
    cancelBtn.textContent = "Skip";
    cancelBtn.style.border = "none";
    cancelBtn.style.background = "transparent";
    cancelBtn.style.color = "#6b7280";
    cancelBtn.style.cursor = "pointer";
    cancelBtn.style.fontSize = "13px";
    const doneBtn = document.createElement("button");
    doneBtn.textContent = "Done";
    doneBtn.style.borderRadius = "999px";
    doneBtn.style.border = "none";
    doneBtn.style.background = "#2563eb";
    doneBtn.style.color = "#fff";
    doneBtn.style.fontSize = "14px";
    doneBtn.style.padding = "6px 14px";
    doneBtn.style.cursor = "pointer";
    doneBtn.disabled = true;
    doneBtn.style.opacity = "0.6";
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(doneBtn);
    box.appendChild(title);
    box.appendChild(subtitle);
    box.appendChild(grid);
    box.appendChild(status);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    // Puzzle logic
    const highlightedIndices = new Set();
    while (highlightedIndices.size < 3) {
        highlightedIndices.add(Math.floor(Math.random() * 9));
    }
    const sequence = Array.from(highlightedIndices.values());
    let currentIndex = 0;
    let clickable = false;
    let failed = false;
    // reveal numbers for 2s
    sequence.forEach((idx, i) => {
        cells[idx].textContent = String(i + 1);
        cells[idx].style.background = "#fee2e2";
    });
    status.textContent = "Memorize the red squares…";
    setTimeout(() => {
        cells.forEach((c) => {
            c.textContent = "";
            c.style.background = "#ffffff";
        });
        status.textContent = "Now click the three squares in order.";
        clickable = true;
        doneBtn.disabled = false;
        doneBtn.style.opacity = "1";
    }, 2000);
    cells.forEach((btn, idx) => {
        btn.addEventListener("click", () => {
            if (!clickable || failed)
                return;
            btn.style.background = "#dbeafe";
            if (idx === sequence[currentIndex]) {
                currentIndex += 1;
                if (currentIndex === sequence.length) {
                    status.textContent = "Nice! You got it 🎯";
                }
            }
            else {
                failed = true;
                status.textContent =
                    "Not quite—but that’s okay, it’s just a quick reset.";
                btn.style.background = "#fee2e2";
            }
        });
    });
    cancelBtn.addEventListener("click", () => {
        onFinish("cancel");
        overlay.remove();
    });
    doneBtn.addEventListener("click", () => {
        const result = failed || currentIndex < sequence.length ? "fail" : "success";
        onFinish(result);
        overlay.remove();
    });
    return overlay;
}
function showPuzzle() {
    return new Promise((resolve) => {
        const overlay = buildPuzzleUI((res) => resolve(res));
        document.body.appendChild(overlay);
    });
}
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if ((msg === null || msg === void 0 ? void 0 : msg.type) === "SHOW_PUZZLE_OVERLAY") {
        showPuzzle().then((result) => {
            sendResponse({ result });
        });
        return true;
    }
    return false;
});
export {};
