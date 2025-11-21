// adhd_start/extension/oneQuestionForm.ts
// -------------------------------------------------------
// Game 3: "One-Question-at-a-time Interface"
// Inspired by Goblin.tools: freeze the wall of form fields
// and guide the user through one field at a time.
// This is a non-destructive "lite" version that dims
// everything except the current field.
// -------------------------------------------------------
let steps = [];
let currentIndex = 0;
let overlay = null;
function collectFields(root) {
    const inputs = Array.from(root.querySelectorAll("input, textarea, select"));
    const result = [];
    for (const el of inputs) {
        if (el.type === "hidden" || el.disabled)
            continue;
        const labelEl = el.closest("label") || root.querySelector(`label[for="${el.id}"]`);
        const label = (labelEl && (labelEl.textContent || "").trim()) ||
            ('placeholder' in el ? el.placeholder : '') ||
            "Field";
        result.push({ el, label });
    }
    return result;
}
function ensureOverlay() {
    if (overlay)
        return overlay;
    overlay = document.createElement("div");
    overlay.id = "adhd-one-question-overlay";
    overlay.style.position = "fixed";
    overlay.style.bottom = "10px";
    overlay.style.left = "50%";
    overlay.style.transform = "translateX(-50%)";
    overlay.style.zIndex = "999999";
    overlay.style.background = "#020617cc";
    overlay.style.color = "#e5e7eb";
    overlay.style.padding = "8px 14px";
    overlay.style.borderRadius = "999px";
    overlay.style.fontSize = "12px";
    overlay.style.display = "flex";
    overlay.style.alignItems = "center";
    const text = document.createElement("span");
    text.id = "adhd-one-question-text";
    const nextBtn = document.createElement("button");
    nextBtn.textContent = "Next";
    nextBtn.style.marginLeft = "12px";
    nextBtn.style.borderRadius = "999px";
    nextBtn.style.border = "none";
    nextBtn.style.background = "#2563eb";
    nextBtn.style.color = "#fff";
    nextBtn.style.cursor = "pointer";
    nextBtn.style.fontSize = "12px";
    nextBtn.style.padding = "4px 10px";
    nextBtn.addEventListener("click", () => moveNext());
    overlay.appendChild(text);
    overlay.appendChild(nextBtn);
    document.body.appendChild(overlay);
    return overlay;
}
function applyDim(currentEl) {
    document.body.style.transition = "background-color 0.2s";
    document.body.style.backgroundColor = "rgba(15,23,42,0.25)";
    steps.forEach((s) => {
        s.el.style.outline = "";
    });
    currentEl.style.outline = "2px solid #f97316";
    currentEl.scrollIntoView({ behavior: "smooth", block: "center" });
}
function updateOverlay() {
    if (!overlay || steps.length === 0)
        return;
    const text = document.getElementById("adhd-one-question-text");
    text.textContent = `Step ${currentIndex + 1}/${steps.length}: ${steps[currentIndex].label}`;
}
export function activateOneQuestionMode(root) {
    steps = collectFields(root || document.body);
    if (steps.length === 0)
        return;
    currentIndex = 0;
    ensureOverlay();
    applyDim(steps[currentIndex].el);
    updateOverlay();
}
function moveNext() {
    if (currentIndex < steps.length - 1) {
        currentIndex += 1;
        applyDim(steps[currentIndex].el);
        updateOverlay();
    }
    else {
        // Done – clean up
        document.body.style.backgroundColor = "";
        overlay === null || overlay === void 0 ? void 0 : overlay.remove();
    }
}
// Listen for activation from popup
chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if ((msg === null || msg === void 0 ? void 0 : msg.type) === "ACTIVATE_ONE_QUESTION") {
        activateOneQuestionMode();
        sendResponse({ ok: true });
        return true;
    }
    return false;
});
