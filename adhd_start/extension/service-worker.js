// service-worker.js

// Schedule Chrome alarms for check-ins + end of focus block
function scheduleCheckIns(minutes, checkIns) {
  const now = Date.now();

  const add = (m) =>
    chrome.alarms.create(`ci_${m}`, { when: now + m * 60 * 1000 });

  (checkIns || []).forEach((ci) => {
    const m = parseInt(ci.split("+")[1], 10) || 5;
    add(m);
  });

  chrome.alarms.create("endBlock", {
    when: now + (minutes || 20) * 60 * 1000,
  });
}

// Notify the active tab that the focus block ended
function broadcastEndBlock(reason) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    const tab = tabs[0];
    if (tab && tab.id != null) {
      chrome.tabs.sendMessage(tab.id, {
        type: "END_BLOCK",
        source: "background",
        reason: reason || "timer",
      });
    }
  });
}

// Handle messages from popup, content scripts, and profile.html
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return;

  // START_BLOCK from popup / overlay
  if (msg.type === "START_BLOCK") {
    // Clear any previous alarms and set new ones
    chrome.alarms.clearAll(() => {
      scheduleCheckIns(msg.minutes, msg.checkIns);
    });

    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon48.png",
      title: "Focus started",
      message: `Block running for ${msg.minutes} min`,
    });
  }

  // END_BLOCK from popup / overlay (manual stop)
  if (msg.type === "END_BLOCK") {
    chrome.alarms.clearAll();

    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon48.png",
      title: "Focus ended",
      message: "You stopped the focus block.",
    });

    // Let the page clean up HUD / shield / feedback
    broadcastEndBlock(msg.reason || "manual-stop");
  }

  // PROFILE_UPDATED from profile.html – reflect profile state on the extension icon
  if (msg.type === "PROFILE_UPDATED") {
    const p = msg.profile || {};
    const isComplete =
      p &&
      p.firstName &&
      p.lastName &&
      p.email &&
      p.school &&
      p.program &&
      p.expectedCompletion;

    chrome.action.setBadgeText({ text: isComplete ? "P" : "" });
    chrome.action.setBadgeBackgroundColor({
      color: isComplete ? "#10B981" : "#00000000",
    });
  }
});

// Alarm callbacks: check-ins + natural end of focus block
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name.startsWith("ci_")) {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon48.png",
      title: "Check-in",
      message: "How's it going? Need a 30-sec tip?",
    });
  }

  if (alarm.name === "endBlock") {
    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon48.png",
      title: "Time!",
      message:
        "2-min debrief: What worked? What to change next time?",
    });

    // Focus session ended via timer, let the page know
    broadcastEndBlock("timer");
  }
});
