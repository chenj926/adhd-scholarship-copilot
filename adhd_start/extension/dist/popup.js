var _a, _b;
// popup.ts (top-level imports)
import { startSession, endSession, startTimerLoop } from "./sessionTimer";
import { sendFeedback } from "./api";
// Ensure timer loop runs when popup loads (for long sessions)
startTimerLoop();
const userId = "demo-user"; // or from your settings
(_a = document
    .getElementById("start-block-btn")) === null || _a === void 0 ? void 0 : _a.addEventListener("click", () => {
    // 1) start back-end session/timer
    startSession(userId);
    // 2) activate Key-Word Sniper in current tab
    const skills = ["Python", "Project Management", "C#"]; // later: from resume/backend
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        var _a;
        if (!((_a = tabs[0]) === null || _a === void 0 ? void 0 : _a.id))
            return;
        chrome.tabs.sendMessage(tabs[0].id, {
            type: "ACTIVATE_KEYWORD_SNIPER",
            userId,
            skills,
        });
        chrome.tabs.sendMessage(tabs[0].id, {
            type: "ACTIVATE_ONE_QUESTION",
        });
        // you can also start focus chain from content script on that page
    });
});
(_b = document
    .getElementById("finish-block-btn")) === null || _b === void 0 ? void 0 : _b.addEventListener("click", async () => {
    await endSession();
    // Optional simple block feedback:
    const feeling = window.prompt("How did this block feel? (too_long / just_right / too_short)");
    const started = window.prompt("Did this plan help you get started? (yes / no)");
    const reasons = [];
    if (feeling)
        reasons.push(`block_${feeling}`);
    if (started === "yes")
        reasons.push("block_helped_start");
    if (started === "no")
        reasons.push("block_still_stuck");
    await sendFeedback({
        user_id: "demo-user",
        reasons,
    });
});
