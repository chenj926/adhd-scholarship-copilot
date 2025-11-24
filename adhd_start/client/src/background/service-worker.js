// service-worker.js (MV3 background)

function scheduleCheckIns(minutes, checkIns) {
  const now = Date.now();
  const add = (m) =>
    chrome.alarms.create(`ci_${m}`, { when: now + m * 60 * 1000 });

  (checkIns || []).forEach((ci) => {
    const parts = String(ci).split("+");
    const m = parseInt(parts[1], 10) || 5;
    add(m);
  });

  chrome.alarms.create("endBlock", {
    when: now + (minutes || 20) * 60 * 1000,
  });
}

// Notify active tab that focus block has ended
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

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (!msg || typeof msg.type !== "string") return;

  // 1. PROXY FETCH HANDLER
  if (msg.type === "PROXY_FETCH") {
    fetch(msg.url, {
      method: msg.method || "GET",
      headers: msg.headers || { "Content-Type": "application/json" },
      body: msg.body ? JSON.stringify(msg.body) : null
    })
    .then(async (res) => {
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        sendResponse({ ok: res.ok, status: res.status, data: json });
      } catch {
        sendResponse({ ok: res.ok, status: res.status, data: text });
      }
    })
    .catch((err) => {
      sendResponse({ ok: false, error: err.toString() });
    });
    return true; // Keep channel open for async response
  }

  // Focus START
  if (msg.type === "START_BLOCK") {
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

  // Focus END (manual stop from popup / overlay)
  if (msg.type === "END_BLOCK") {
    chrome.alarms.clearAll();

    chrome.notifications.create({
      type: "basic",
      iconUrl: "icon48.png",
      title: "Focus ended",
      message: "You stopped the focus block.",
    });

    broadcastEndBlock(msg.reason || "manual-stop");
  }

  // Profile updated (from profile.html) – update extension badge
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

// Handle timers: check-ins + natural end of block
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
      message: "2-min debrief: What worked? What to change next time?",
    });

    // Timer-based end – let the content scripts clean up UI and show feedback
    broadcastEndBlock("timer");
  }
});
